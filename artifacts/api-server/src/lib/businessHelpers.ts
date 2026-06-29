import type pg from "pg";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { eventBus } from "./eventBus.js";
import { ValidationError } from "./errorHandler.js";
import { sendNotification } from "./notificationService.js";
import { validateEventPayload, getEventDefinition } from "./eventCatalog.js";
import { logger } from "./logger.js";
import { assertLedgerTruth } from "./financePostingPolicy.js";
import { FINANCE_ROLES, OWNER_GM_ROLES } from "./rbacCatalog.js";
import { config } from "./config.js";
import {
  enrichJournalLines,
  inferHeaderDimensionsFromSource,
  applyHeaderDimensionsToLines,
  substituteSubsidiaryAccountCodes,
} from "./journalLineDimensionalEnricher.js";

// Task #428 — these "what's the current date/period/year?" helpers are now
// timezone-aware (Asia/Riyadh by default). Pre-Task #428 they all delegated
// to `new Date().toISOString().*`, which silently returned the *UTC* calendar
// boundary — exactly the same class of bug Task #400 fixed in attendance.
// On a `TZ=UTC` server, `todayISO()` shifted to tomorrow at 21:00 Riyadh
// (i.e. an HR action filed at 23:30 Riyadh local landed under tomorrow's
// `period`/`year` row). Routing every "now" helper through `currentDateInTz`
// fixes ~50 call sites at once instead of patching each individually.
export function todayISO(): string {
  return currentDateInTz();
}

export function currentYear(): number {
  return Number(currentDateInTz().slice(0, 4));
}

export function currentPeriod(): string {
  return currentDateInTz().slice(0, 7);
}

export function currentMonthPadded(): string {
  return currentDateInTz().slice(5, 7);
}

export function toDateISO(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
}

/**
 * Returns the calendar date (YYYY-MM-DD) currently observed in `tz`.
 *
 * Task #400 — using `toDateISO(new Date())` returns the UTC date, which
 * silently shifts attendance / cron rows by one day for any user whose
 * local clock crosses midnight before/after UTC midnight. For Asia/Riyadh
 * (UTC+3, no DST), an employee that checks in at 01:30 AM local time was
 * being filed under the *previous* day's attendance row.
 *
 * Defaults to Asia/Riyadh because that's the system-wide tenant timezone
 * (see `companyBootstrap` and `cronScheduler`). Pass an explicit `tz` to
 * override per call.
 */
export function currentDateInTz(tz: string = "Asia/Riyadh", date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Combine a calendar date (YYYY-MM-DD) with a wall-clock time ("HH:MM")
 * **as observed in `tz`** and return the corresponding UTC `Date`.
 *
 * Task #400 — the previous pattern `new Date(today + "T00:00:00")` then
 * `setHours(h, m)` interpreted the shift start in the *server's* local
 * timezone. On a `TZ=UTC` server the 08:00 shift was treated as 08:00 UTC
 * (= 11:00 Riyadh), so a Riyadh employee who walked in at 08:30 local
 * (05:30 UTC) was reported as having arrived ~5h30m *early* (lateMinutes
 * = 0) instead of on-time, and an employee who walked in at 11:30 local
 * (08:30 UTC) was reported as 30m late instead of 3h30m late.
 *
 * Implementation derives the tz offset at the candidate instant via
 * `Intl.DateTimeFormat` so it stays correct under DST-observing timezones
 * (Riyadh has no DST today, but other tenants might).
 */
export function combineDateAndShiftTime(
  dateISO: string,
  time: string,
  tz: string = "Asia/Riyadh",
): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hPart, mPart] = time.split(":");
  const h = Number(hPart);
  const mi = Number(mPart ?? "0");
  // First guess: pretend the wall-clock time is UTC.
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi, 0));
  // Read what `guess` actually looks like in `tz` and compute the offset
  // between the tz-local components and UTC.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(guess).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const tzHour = parts.hour === "24" ? 0 : Number(parts.hour);
  const tzAsUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    tzHour,
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = tzAsUTC - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

export function generateRef(prefix: string, seq: number | string, pad = 4): string {
  return `${prefix}-${currentYear()}-${String(seq).padStart(pad, "0")}`;
}

export function generateTimeRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

// Per-branch reference generator (PR #529): looks up an optional
// per-branch prefix override in `system_settings` (key = `<settingKey>`,
// scope = branch → company → system) and falls back to `defaultPrefix`
// when no override is configured. Always emits a time-based suffix to
// avoid colliding with existing sequence-based refs in the same table.
export async function generateBranchRef(
  scope: { companyId: number; branchId: number | null },
  settingKey: string,
  defaultPrefix: string,
): Promise<string> {
  let prefix = defaultPrefix;
  try {
    const { rawQuery } = await import("./rawdb.js");
    // system_settings is keyed by ("companyId","branchId",key). A NULL
    // branchId row is the company-wide default; a NULL companyId row
    // (rare) is the system-wide default. Branch row wins, then company,
    // then system.
    const rows = await rawQuery<{ value: string | null }>(
      `SELECT value FROM system_settings
        WHERE key = $1
          AND ( ("companyId" = $2 AND "branchId" = $3)
             OR ("companyId" = $2 AND "branchId" IS NULL)
             OR ("companyId" IS NULL AND "branchId" IS NULL) )
        ORDER BY ("branchId" IS NULL) ASC, ("companyId" IS NULL) ASC
        LIMIT 1`,
      [settingKey, scope.companyId, scope.branchId ?? null],
    );
    const override = rows[0]?.value?.trim();
    if (override) prefix = override;
  } catch {
    // system_settings table may not exist yet in dev; fall through to default
  }
  return generateTimeRef(prefix);
}

export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeVat(baseAmount: number, vatRatePercent: number): number {
  return roundTo2(baseAmount * (vatRatePercent / 100));
}

export function extractBaseFromGross(grossAmount: number, vatRatePercent: number): number {
  return roundTo2(grossAmount / (1 + vatRatePercent / 100));
}

// FIN-AUD-03 — single source for the active VAT rate. Reads system_settings
// key `vat_rate` (company row, then system-wide row, then SA's 15% default).
// Cached per-company for the process lifetime since rate changes ~yearly.
const _vatRateCache = new Map<number, number>();
export const FALLBACK_VAT_RATE = 15;
export async function getCompanyVatRate(companyId: number): Promise<number> {
  const cached = _vatRateCache.get(companyId);
  if (cached !== undefined) return cached;
  try {
    const { rawQuery } = await import("./rawdb.js");
    const rows = await rawQuery<{ value: string | null }>(
      `SELECT value FROM system_settings
        WHERE key = 'vat_rate'
          AND ( "companyId" = $1 OR "companyId" IS NULL )
        ORDER BY ("companyId" IS NULL) ASC
        LIMIT 1`,
      [companyId],
    );
    const raw = rows[0]?.value;
    const parsed = raw == null ? NaN : Number(raw);
    const rate = Number.isFinite(parsed) && parsed >= 0 ? parsed : FALLBACK_VAT_RATE;
    _vatRateCache.set(companyId, rate);
    return rate;
  } catch {
    return FALLBACK_VAT_RATE;
  }
}
export function clearVatRateCache(companyId?: number): void {
  if (companyId === undefined) _vatRateCache.clear();
  else _vatRateCache.delete(companyId);
}

export async function createNotification(params: {
  companyId: number;
  assignmentId: number;
  type: string;
  title: string;
  body: string;
  priority?: string;
  refType?: string;
  refId?: number;
  actionUrl?: string;
  requiresAck?: boolean;
}) {
  try {
    await sendNotification({
      companyId: params.companyId,
      assignmentId: params.assignmentId,
      type: params.type,
      title: params.title,
      body: params.body,
      priority: (params.priority as "low" | "normal" | "high" | "urgent") ?? "normal",
      refType: params.refType,
      refId: params.refId,
      actionUrl: params.actionUrl,
    });
  } catch (err) {
    logger.error(err, "createNotification error:");
  }
}

/**
 * Publish an event on the in-process event bus.
 *
 * **IMPORTANT**: this function is a publisher only — it does NOT write to
 * `event_logs` directly. Persistence is owned by the listener catalog in
 * `eventListeners.ts` so every event has exactly one row in `event_logs`
 * (via `logEvent` inside the listener) and exactly one row in `audit_logs`
 * (via `logAudit`).
 *
 * Before the fix in commit <this>, emitEvent ALSO inserted into event_logs
 * itself. Combined with the listener's `logEvent`, every event produced
 * **two** rows in event_logs — which is exactly the duplication the
 * programmer reported on Step 3 transfer testing ("3 events → 6 rows").
 *
 * If a new event name is added without a matching `eventBus.on(...)`
 * listener, event_logs will silently lose the row. The CI lint rule
 * `scripts/src/lintEventCoverage.mjs` (wired into `pnpm run guard` as
 * step `lint:event-coverage`, see Task #224) fails any PR that emits an
 * event name that's not declared in `eventCatalog.ts`. To debug a
 * pre-existing missing-listener case manually, run:
 *
 *   grep -rhoE 'action:\s*"([a-z][a-z_]*\.)+[a-z_]+"' \
 *     artifacts/api-server/src/routes artifacts/api-server/src/lib \
 *     | sort -u > /tmp/emitted.txt
 *   grep -hoE 'eventBus\.on\("[a-z._]+"' \
 *     artifacts/api-server/src/lib/eventListeners.ts \
 *     | sort -u > /tmp/listened.txt
 *   comm -23 /tmp/emitted.txt /tmp/listened.txt
 *
 * Any output from that command is an orphan event that needs a listener.
 */
export async function emitEvent(params: {
  companyId: number;
  branchId?: number;
  userId: number | null;
  action: string;
  entity: string;
  entityId: number;
  details?: string;
  before?: any;
  after?: any;
  [key: string]: any;
}) {
  const validation = validateEventPayload(params.action, params);
  const eventDef = getEventDefinition(params.action);
  const isCritical = eventDef?.critical === true;

  if (!validation.cataloged) {
    if (isCritical) {
      throw new ValidationError(`حدث حرج غير مسجل في الكتالوج: ${params.action}`);
    }
    logger.warn(`[emitEvent] uncataloged event: ${params.action}`);
  } else if (!validation.valid && isCritical) {
    throw new ValidationError(
      `حدث حرج بدون بيانات مطلوبة: ${params.action} — ${validation.warnings.join("; ")}`
    );
  } else if (!validation.valid) {
    logger.warn(`[emitEvent] payload warnings for ${params.action}: ${validation.warnings.join("; ")}`);
  }

  // Critical events: persist to event_logs BEFORE emitting to listeners.
  // Non-critical events: persist iff the operator has opted in via
  // PERSIST_ALL_EVENTS — defaults off because every emitEvent() call
  // would otherwise write a row, and that bloats event_logs fast on
  // a busy tenant. The original audit flagged "event_logs is empty";
  // turning the env flag on is the supported way to fix that without
  // surprising existing deployments with a behaviour change.
  const persistAll = config.persistAllEvents;
  if (isCritical || persistAll) {
    await rawExecute(
      `INSERT INTO event_logs ("companyId","userId",action,entity,"entityId",details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [params.companyId, params.userId, params.action, params.entity,
       String(params.entityId), params.details ?? null]
    );
  }

  try {
    eventBus.emit(params.action, {
      companyId: params.companyId,
      branchId: params.branchId,
      userId: params.userId ?? undefined,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      details: params.details,
      before: params.before,
      after: params.after,
    });
  } catch (err) {
    if (!isCritical) {
      // Non-critical: fallback persist so no event is lost
      try {
        await rawExecute(
          `INSERT INTO event_logs ("companyId","userId",action,entity,"entityId",details)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [params.companyId, params.userId, params.action, params.entity,
           String(params.entityId), params.details ?? null]
        );
      } catch (e) { logger.error(e, "event_logs fallback insert also failed"); }
    }
    logger.error(err, "[emitEvent] listener failed, event persisted to event_logs:");
  }
}

/**
 * Compact wrapper around `createAuditLog` for route handlers.
 *
 * Pulls `companyId`/`branchId`/`userId` from `req.scope!` and accepts
 * the entity-specific fields inline. Returns a fire-and-forget promise
 * that swallows failures into `logger.error` so callers never have to
 * remember `.catch(...)` boilerplate.
 *
 * Use this for the **second-pass** payload work — the auto-injection
 * script (`scripts/_fix_audit_hooks.mjs`) only writes the bare 5
 * fields; richer handlers should record `before`/`after`/`reason` so
 * an internal auditor can reconstruct what changed.
 */
export function auditMutation(
  req: { scope?: { companyId: number; branchId?: number | null; userId: number } | null },
  opts: {
    entity: string;
    action: string;
    entityId: number;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
): Promise<void> {
  const scope = req.scope;
  if (!scope) {
    logger.error(
      { entity: opts.entity, action: opts.action, entityId: opts.entityId },
      "auditMutation called without req.scope — audit entry DROPPED. " +
        "This means the route is not behind authMiddleware/scope-enrichment. " +
        "Treat as a high-priority bug: callers MUST run after scope is set.",
    );
    return Promise.resolve();
  }
  return createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    before: opts.before,
    after: opts.after,
    reason: opts.reason,
  }).catch((err) =>
    logger.error(err, `auditMutation failed for ${opts.entity}.${opts.action}`),
  );
}

/**
 * auditFromRequest — canonical audit writer that automatically extracts
 * the full IGOC operating context from `req.scope`:
 *
 *   - companyId  (always)
 *   - branchId   (when present on scope)
 *   - userId     (always)
 *   - activeRoleKey            (RBAC-001 — capacity the actor performed under)
 *   - activeDepartmentId       (IGOC-001 — actor's primary assignment department)
 *   - resolvedScope            (IGOC-001 — authz resolution at action time)
 *   - impersonationSourceUser  (IGOC-001 — super-admin acting as another user)
 *
 * Use this in every route handler instead of calling `createAuditLog`
 * directly. The previous pattern — passing only `activeRoleKey` and
 * dropping the other three IGOC fields — leaves audit rows with
 * NULL context, making cross-tenant / impersonation forensics
 * impossible to reconstruct. The HR-019 «جسور المؤسسة» write was
 * the live find that surfaced this gap.
 *
 * Errors are swallowed (audit must never break the business write).
 */
export function auditFromRequest(
  req: { scope?: any },
  action: string,
  entity: string,
  entityId: number,
  changes: { before?: any; after?: any; reason?: string } = {},
): Promise<void> {
  const scope = req.scope;
  if (!scope) {
    logger.warn({ entity, entityId, action }, "[audit] no scope on request — audit skipped");
    return Promise.resolve();
  }
  return createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action,
    entity,
    entityId,
    before: changes.before,
    after: changes.after,
    reason: changes.reason,
    activeRoleKey: scope.selectedRoleKey ?? null,
    activeDepartmentId: scope.activeDepartmentId ?? null,
    resolvedScope: scope.resolvedScope ?? null,
    impersonationSourceUser: scope.impersonationSourceUser ?? null,
  }).catch((err) =>
    logger.warn({ err, entity, entityId, action }, "[audit] auditFromRequest failed"),
  );
}

export async function createAuditLog(params: {
  companyId: number;
  branchId?: number;
  userId: number;
  action: string;
  entity: string;
  entityId: number;
  before?: any;
  after?: any;
  reason?: string;
  // RBAC-001 (#1413 §9): the role (capacity) the actor performed under.
  // Optional/back-compatible — callers that pass scope.selectedRoleKey get it
  // persisted; older callers omit it and the column stays NULL.
  activeRoleKey?: string | null;
  // IGOC-001 (migration 284): three additional context fields. All
  // nullable, all back-compatible.
  activeDepartmentId?: number | null;
  resolvedScope?: string | null;
  impersonationSourceUser?: number | null;
}) {
  try {
    await rawExecute(
      `INSERT INTO audit_logs (
         "companyId","branchId","userId",action,entity,"entityId",
         "before","after",reason,
         "active_role_key","active_department_id","resolved_scope","impersonation_source_user"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        params.companyId,
        params.branchId ?? null,
        params.userId,
        params.action,
        params.entity,
        params.entityId,
        params.before ? JSON.stringify(params.before) : null,
        params.after ? JSON.stringify(params.after) : null,
        params.reason ?? null,
        params.activeRoleKey ?? null,
        params.activeDepartmentId ?? null,
        params.resolvedScope ?? null,
        params.impersonationSourceUser ?? null,
      ]
    );
  } catch (err) {
    logger.error(err, "createAuditLog error:");
  }
}

export interface JournalEntryLine {
  accountCode: string;
  accountId?: number;
  debit: number;
  credit: number;
  description?: string;
  departmentId?: number;
  projectId?: number;
  employeeId?: number;
  vehicleId?: number;
  propertyId?: number;
  contractId?: number;
  productId?: number;
  clientId?: number;
  vendorId?: number;
  driverId?: number;
  activityType?: string;
  costCenter?: string;
  templateId?: number;
  // Phase 2 P0 — additional dimensional fields backed by migration 201.
  // All optional; the INSERT path appends them only when present so
  // existing callers stay backwards-compatible.
  costCenterId?: number;
  unitId?: number;
  assetId?: number;
  umrahSeasonId?: number;
  umrahAgentId?: number;
  /** sourceLineTable + sourceLineId together back-link a journal_line
   *  to the originating source row (e.g. 'invoice_lines' + 42). Lets
   *  reports drill from a GL line back to the bill of sale. */
  sourceLineTable?: string;
  sourceLineId?: number;
  /** Free-form dimension bag for future allocation rules that don't
   *  warrant a dedicated column yet. */
  dimensionJson?: Record<string, unknown>;
  /** Optional FK to analytic_accounts (Issue #2197).
   *  Carries operational context (party/season/branch/employee/…) for
   *  reporting drill-down. NOT a posting target — the debit/credit always
   *  goes to a chart_of_accounts row (allowPosting=true). */
  analyticAccountId?: number | null;
}

/**
 * تطبيع إشارة سطور القيد — دفاع المحرّك المركزي (معتمد من إبراهيم 2026-06-21:
 * «التطبيع لا الرفض»). يحوّل أي مبلغ سالب إلى الجهة المقابلة بدل تخزينه سالبًا:
 *   debit:-100, credit:0   ⇒  debit:0, credit:100
 *   debit:0, credit:-50    ⇒  debit:50, credit:0
 *
 * الأثر المحاسبي مطابق تمامًا — صافي السطر (debit − credit) ثابت — لكن التخزين
 * يصبح قياسيًا: تختفي الأعمدة السالبة التي كانت تُشوّه إجماليات/تقارير المدين والدائن.
 * تدفقات داخلية (إقفال الفترة، التخلص من أصل، استقطاع راتب) ترحّل سالبًا عمدًا لعكس
 * حركة حساب؛ التطبيع يبقيها على نفس الأرصدة لكن على العمود الصحيح، فلا يكسرها.
 *
 * مهم: لا يكسر بوابة عدم التوازن في createJournalEntry — (Σdebit − Σcredit) ثابت
 * تحت التطبيع، لأن صافي كل سطر لا يتغيّر. يعدّل السطور في مكانها (نفس نمط التقريب).
 */
export function normalizeJournalLineSigns<T extends { debit: number; credit: number }>(lines: T[]): T[] {
  for (const line of lines) {
    let debit = Number(line.debit) || 0;
    let credit = Number(line.credit) || 0;
    if (debit < 0) { credit += -debit; debit = 0; }
    if (credit < 0) { debit += -credit; credit = 0; }
    line.debit = debit;
    line.credit = credit;
  }
  return lines;
}

export async function createJournalEntry(params: {
  companyId: number;
  branchId: number;
  createdBy: number;
  ref: string;
  description: string;
  type?: string;
  sourceType?: string;
  sourceId?: number;
  sourceKey?: string;
  operationType?: string;
  lines: JournalEntryLine[];
  skipPeriodCheck?: boolean;
  // FIN-007 — record the entry without moving chart_of_accounts.currentBalance.
  // applyJournalEntryBalances applies them later (on voucher approval).
  deferBalances?: boolean;
}) {
  // Financial period guard: prevent posting to closed periods
  if (!params.skipPeriodCheck) {
    const postingDate = todayISO();
    const periodCheck = await checkFinancialPeriodOpen(params.companyId, postingDate);
    if (!periodCheck.open) {
      throw new ValidationError(
        `الفترة المالية "${periodCheck.periodName}" مغلقة — لا يمكن ترحيل قيود في هذا التاريخ`,
        { field: "financialPeriod", fix: "افتح الفترة المالية أو اختر تاريخاً في فترة مفتوحة" }
      );
    }
  }

  // Idempotency: composite key check (sourceKey takes priority over sourceType+sourceId)
  const idempotencyKey = params.sourceKey ?? null;
  if (idempotencyKey) {
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [params.companyId, idempotencyKey]
    );
    if (existing) return existing.id;
  } else if (params.sourceType && params.sourceId) {
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceType"=$2 AND "sourceId"=$3 AND "deletedAt" IS NULL LIMIT 1`,
      [params.companyId, params.sourceType, params.sourceId]
    );
    if (existing) return existing.id;
  }

  // Validate all account codes BEFORE creating the journal header
  const uniqueCodes = [...new Set(params.lines.map(l => l.accountCode).filter(Boolean))];
  if (uniqueCodes.length > 0) {
    const placeholders = uniqueCodes.map((_, i) => `$${i + 2}`).join(",");
    const accountRows = await rawQuery<{ code: string; allowPosting: boolean; isActive: boolean }>(
      `SELECT code, "allowPosting", "isActive" FROM chart_of_accounts WHERE "companyId" = $1 AND code IN (${placeholders}) AND "deletedAt" IS NULL`,
      [params.companyId, ...uniqueCodes]
    );
    const accountMap = new Map(accountRows.map((a) => [a.code, a]));
    for (const code of uniqueCodes) {
      const acc = accountMap.get(code);
      if (!acc) {
        throw new ValidationError(`الحساب "${code}" غير موجود في شجرة الحسابات`, { field: "accountCode", fix: "اختر حساباً موجوداً من شجرة الحسابات" });
      }
      if (acc.allowPosting === false) {
        throw new ValidationError(`لا يمكن الترحيل على الحساب "${code}" — هذا حساب تجميعي (رئيسي). استخدم حساباً فرعياً يقبل الحركة`, { field: "accountCode", fix: "اختر حساباً فرعياً (تفصيلياً) يقبل الحركة" });
      }
      if (acc.isActive === false) {
        throw new ValidationError(`لا يمكن الترحيل على الحساب "${code}" — الحساب معطّل (غير نشط)`, { field: "accountCode", fix: "فعّل الحساب أو اختر حساباً نشطاً" });
      }
    }
  }

  // دفاع المحرّك المركزي: طبّع إشارة كل سطر قبل التقريب والتوازن والكتابة، فلا
  // تُخزَّن مبالغ سالبة (تدفقات الإقفال/التخلص/الاستقطاع ترحّل سالبًا عمدًا).
  // التطبيع يحافظ على صافي كل سطر، فبوابة عدم التوازن أدناه تبقى صحيحة.
  normalizeJournalLineSigns(params.lines);
  for (const line of params.lines) {
    line.debit = roundTo2(Number(line.debit));
    line.credit = roundTo2(Number(line.credit));
  }
  const totalDebit = roundTo2(params.lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = roundTo2(params.lines.reduce((s, l) => s + l.credit, 0));
  const imbalance = roundTo4(totalDebit - totalCredit);
  // A correctly-built journal entry MUST balance to the cent. debit/credit
  // amounts are 2-decimal, so any non-zero gap here is a real arithmetic
  // bug in the caller that built the lines — it must derive the balancing
  // line as `total − Σ(other lines)`, never compute both sides by
  // independent rounding. Reject it loudly. The previous behaviour silently
  // plugged a 0.001–0.05 gap into a "9999 rounding differences" expense,
  // which hid the calculation bug and let that account drift without bound.
  if (Math.abs(imbalance) >= 0.005) {
    throw new ValidationError(
      `قيد غير متوازن: مدين=${totalDebit.toFixed(2)} ≠ دائن=${totalCredit.toFixed(2)} (${params.ref})`
    );
  }

  const journalId = await withTransaction(async (client) => {
    const headerResult = await client.query(
      `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"sourceType","sourceId","sourceKey","balancesApplied")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        params.companyId, params.branchId, params.createdBy, params.ref, params.description,
        params.type ?? "manual", params.sourceType ?? null, params.sourceId ?? null,
        idempotencyKey, !params.deferBalances,
      ]
    );
    const jId = headerResult.rows[0].id as number;

    // Step 1 — source-context inference. ONE round-trip per JE that
    // pulls common entity ids (clientId, vendorId, umrahAgentId, ...)
    // from the source row and propagates them to every line that
    // doesn't already carry them. Skipped when sourceType is unknown
    // — the result is `{}` and propagation is a no-op.
    //
    // Why this matters: an invoice JE doesn't need to remember to set
    // clientId on every line — the enricher reads invoices.clientId
    // once and propagates. Same for vendor bills, umrah invoices,
    // expenses, custodies, fleet maintenance, etc.
    const headerDims = await inferHeaderDimensionsFromSource(
      client, params.companyId, params.sourceType ?? null, params.sourceId ?? null,
    );
    applyHeaderDimensionsToLines(params.lines, headerDims);

    // Step 2 — per-line cost-centre resolution. After the source-side
    // propagation, each line has whatever entity dims it can carry;
    // now we map those dims → costCenterId via the priority chain
    // (project > contract > vehicle > department > branch). Shared
    // cache so an N-line invoice only does K unique CC lookups.
    //
    // This is what makes per-CC P&L work end-to-end: every invoice,
    // payment, expense, and JE that touches a project/contract/etc
    // automatically lands in that entity's cost-centre bucket, so
    // SELECT SUM(...) WHERE costCenterId = X just works.
    await enrichJournalLines(client, params.lines, params.companyId, params.branchId);

    // Step 3 — subsidiary code substitution. ON BY DEFAULT (البند ٤ — إذن إبراهيم
    // «نعم حساب خاص»): a line posting to a control account like 1121 (سلفة
    // الموظفين) with employeeId=42 gets its accountCode swapped to '1121-0042' —
    // the employee's own subsidiary code (مبدأ «حساب خاص لكل أصل/كيان، تلقائيًّا»).
    // Reports that aggregate by chart_of_accounts.parentId still work because the
    // parent currentBalance is unchanged by the swap (the rollup is via the CoA
    // tree, not the literal accountCode). A company opts OUT explicitly via
    // `system_settings.gl_subsidiary_substitution='false'` (the dim-routing page
    // surfaces the toggle) — for tenants whose reports read literal leaf codes.
    await substituteSubsidiaryAccountCodes(client, params.lines, params.companyId);

    // FIN-INTEGRITY-CONTRACT (#2246 SLICE 1) — عقد صدق دفتر الأستاذ المركزي بعد
    // اكتمال إثراء الأبعاد، قبل إدراج السطور (داخل المعاملة: الرفض يُرجِع كل شيء).
    // مُنسِّق يُركّب عقد البُعد (enforce وقود 5510 + warn البقية، دون تغيير) +
    // سيناريو فاتورة المورد (enforce vendorId) + حوكمة القيد اليدوي التشغيلي.
    const dimContract = assertLedgerTruth({
      lines: params.lines as any,
      header: {
        type: params.type ?? "manual",
        sourceType: params.sourceType ?? null,
        isManual: params.sourceType === "manual_journal" || (params.type ?? "manual") === "manual",
        description: params.description ?? null,
        reason: params.description ?? null,
      },
      context: { companyId: params.companyId },
    });
    if (dimContract.warnings.length > 0) {
      logger.warn(
        { companyId: params.companyId, ref: params.ref, warnings: dimContract.warnings },
        "[dimension-contract] سطور بلا بُعد مطلوب (warn)",
      );
    }

    for (const line of params.lines) {
      let accountId = line.accountId ?? null;
      if (!accountId && line.accountCode) {
        const accResult = await client.query(
          `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 LIMIT 1`,
          [params.companyId, line.accountCode]
        );
        accountId = accResult.rows[0]?.id ?? null;
      }

      // Phase 2 P0 — full dimensional INSERT. Existing callers that don't
      // set the optional fields land them as NULL, matching the
      // backwards-compatible default for migration 201. The dimensional
      // payload is what makes per-vehicle / per-property / per-project /
      // per-season profitability reports computable straight from
      // journal_lines without joining back to the source document.
      // branchId per line. Defaults to the entry header's branchId
      // (params.branchId), but the caller can override per line to land a
      // single logical operation across multiple branches in the same
      // company (the multi-branch split the user asked for: "auto-post
      // across multiple branches in the same company" or "manually
      // allocate by lines / percentages"). Backfill on existing rows
      // happened in migration 236.
      const lineBranchId = (line as any).branchId ?? params.branchId ?? null;
      await client.query(
        `INSERT INTO journal_lines (
          "journalId","accountCode","accountId",debit,credit,description,"costCenter",
          "departmentId","projectId","employeeId","vehicleId","propertyId","contractId",
          "activityType","templateId",
          "productId","clientId","vendorId","driverId",
          "costCenterId","unitId","assetId","umrahSeasonId","umrahAgentId",
          "sourceLineTable","sourceLineId","dimensionJson","branchId",
          "analyticAccountId"
         ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,$13,
          $14,$15,
          $16,$17,$18,$19,
          $20,$21,$22,$23,$24,
          $25,$26,$27,$28,
          $29
         )`,
        [
          jId, line.accountCode, accountId, line.debit, line.credit,
          line.description ?? null, line.costCenter ?? null,
          line.departmentId ?? null, line.projectId ?? null, line.employeeId ?? null,
          line.vehicleId ?? null, line.propertyId ?? null, line.contractId ?? null,
          line.activityType ?? null, line.templateId ?? null,
          line.productId ?? null, line.clientId ?? null, line.vendorId ?? null, line.driverId ?? null,
          line.costCenterId ?? null, line.unitId ?? null, line.assetId ?? null,
          line.umrahSeasonId ?? null, line.umrahAgentId ?? null,
          line.sourceLineTable ?? null, line.sourceLineId ?? null,
          line.dimensionJson ? JSON.stringify(line.dimensionJson) : null,
          lineBranchId,
          line.analyticAccountId ?? null,
        ]
      );
    }

    // FIN-007 — a deferred entry (e.g. an unapproved voucher) records its
    // lines but does not touch account balances; applyJournalEntryBalances
    // applies them when the document is approved.
    if (!params.deferBalances) {
      const balanceChanges = new Map<string, number>();
      for (const line of params.lines) {
        if (!line.accountCode) continue;
        const delta = Number(line.debit) - Number(line.credit);
        balanceChanges.set(line.accountCode, (balanceChanges.get(line.accountCode) || 0) + delta);
      }
      for (const [accountCode, delta] of balanceChanges) {
        if (Math.abs(delta) < 0.001) continue;
        await client.query(
          `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1 WHERE "companyId" = $2 AND code = $3`,
          [delta, params.companyId, accountCode]
        );
      }
    }

    return jId;
  });

  eventBus.emit("journal.entry.created", {
    companyId: params.companyId,
    branchId: params.branchId,
    userId: params.createdBy,
    entity: "journal_entries",
    entityId: journalId,
    action: "create",
    after: {
      ref: params.ref,
      description: params.description,
      type: params.type ?? "manual",
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
      totalDebit,
      totalCredit,
      lineCount: params.lines.length,
    },
  });

  return journalId;
}

/**
 * Financial Posting Guard: wraps createJournalEntry to ensure financial operations
 * never succeed silently when GL fails. On failure, flags the source record
 * as "pending_financial_posting" for reconciliation.
 */
export async function createGuardedJournalEntry(
  params: Parameters<typeof createJournalEntry>[0],
  guard: { table: string; id: number }
): Promise<number> {
  try {
    return await createJournalEntry(params);
  } catch (err) {
    // CRITICAL: this failure handler runs INSIDE the caller's transaction
    // (rawExecute joins the ambient tx via AsyncLocalStorage). A statement
    // that errors here — e.g. a source table that has no `glStatus` column
    // (only `warehouse_movements` does) — would put Postgres into the
    // "current transaction is aborted" (25P02) state. A JS try/catch CANNOT
    // undo that abort: every subsequent statement on the connection fails,
    // so a single guarded JE failure would silently roll back an entire
    // batch import (the Umrah voucher import "success but 0 saved" bug).
    // Each side-effect therefore runs in its own SAVEPOINT (reentrant
    // withTransaction) so a failure rolls back at the DB level and leaves
    // the outer transaction usable.
    try {
      await withTransaction(async () => {
        const safeTable = guard.table.replace(/[^a-zA-Z0-9_]/g, "");
        await rawExecute(
          `UPDATE "${safeTable}" SET "glStatus" = 'failed', "updatedAt" = NOW() WHERE id = $1`,
          [guard.id]
        );
      });
    } catch (e) { logger.warn(e, "glStatus column may not exist on source table"); }

    try {
      await withTransaction(async () => {
        await rawExecute(
          `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,"createdAt")
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT DO NOTHING`,
          [params.companyId, params.sourceType ?? guard.table, params.sourceId ?? guard.id,
           err instanceof Error ? err.message : String(err)]
        );
      });
    } catch (e) { logger.warn(e, "[FinancialPostingGuard] failed to record posting failure"); }

    logger.error(err, `[FinancialPostingGuard] GL failed for ${guard.table}#${guard.id}:`);
    throw err;
  }
}

export async function updateAccountBalances(
  companyId: number,
  lines: { accountCode: string; debit: number; credit: number }[]
) {
  const balanceChanges = new Map<string, number>();
  for (const line of lines) {
    const delta = Number(line.debit) - Number(line.credit);
    balanceChanges.set(line.accountCode, (balanceChanges.get(line.accountCode) || 0) + delta);
  }
  for (const [accountCode, delta] of balanceChanges) {
    if (Math.abs(delta) < 0.001) continue;
    await rawExecute(
      `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1 WHERE "companyId" = $2 AND code = $3`,
      [delta, companyId, accountCode]
    );
  }
}

export async function reverseAccountBalances(
  companyId: number,
  journalId: number
) {
  // FIN-007 follow-up — only an entry whose balances were actually applied
  // can be reversed. A deferred entry (e.g. an unapproved voucher) never
  // moved chart_of_accounts.currentBalance, so reversing it would corrupt
  // the ledger by the negative of an entry that never posted. The flag also
  // makes a double reversal a no-op.
  // FOR UPDATE mirrors applyJournalEntryBalances' self-lock (its H2 comment):
  // when this runs inside the caller's transaction (rawQuery is ALS-bound),
  // it serialises concurrent reversals of the SAME entry so the balance can't
  // be rewound twice — the double-application race the forward guards against.
  // The posted-entry callers (expense/salary-advance/custody reject) already
  // hold the row lock via applyTransition; this makes the helper self-defending
  // for any future caller. Harmless on the draft-delete bare callers
  // (balancesApplied=false → the early return below).
  const [je] = await rawQuery<{ balancesApplied: boolean; entryDate: string }>(
    `SELECT "balancesApplied", date::text AS "entryDate"
       FROM journal_entries WHERE id = $1 AND "companyId" = $2
       FOR UPDATE`,
    [journalId, companyId]
  );
  if (!je || je.balancesApplied === false) return;

  // H4 (mirror of H2 on applyJournalEntryBalances) — reversing a posted
  // entry rewinds chart_of_accounts.currentBalance by the negative of the
  // entry's deltas. If the entry's period has since closed or locked
  // (e.g. an invoice approved in May, rejected in July after May closed)
  // the reversal silently rewrites historical balances with no audit
  // signal. Refuse — the sanctioned path is to reopen the period via the
  // audited fiscal-period reopen flow, or to post a compensating entry
  // dated in an open period. Deferred entries are exempt above (they
  // never moved the ledger), so a draft rejection still works.
  const periodCheck = await checkFinancialPeriodOpen(companyId, je.entryDate);
  if (!periodCheck.open) {
    throw new ValidationError(
      `الفترة المالية "${periodCheck.periodName ?? je.entryDate}" مُقفلة — لا يمكن عكس قيد بتاريخها`,
      { field: "financialPeriod", fix: "افتح الفترة المالية أو سجِّل قيداً عاكساً بتاريخ مفتوح" }
    );
  }

  const lines = await rawQuery<{ accountCode: string; debit: number; credit: number }>(
    `SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" WHERE jl."journalId" = $1 AND je."companyId" = $2`,
    [journalId, companyId]
  );
  const balanceChanges = new Map<string, number>();
  for (const line of lines) {
    const delta = -(Number(line.debit) - Number(line.credit));
    balanceChanges.set(line.accountCode, (balanceChanges.get(line.accountCode) || 0) + delta);
  }
  for (const [accountCode, delta] of balanceChanges) {
    if (Math.abs(delta) < 0.001) continue;
    await rawExecute(
      `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1 WHERE "companyId" = $2 AND code = $3`,
      [delta, companyId, accountCode]
    );
  }
  await rawExecute(
    `UPDATE journal_entries SET "balancesApplied" = false WHERE id = $1 AND "companyId" = $2`,
    [journalId, companyId]
  );
}

/**
 * FIN-007 — applies the account-balance movement for a journal entry that was
 * created with `deferBalances: true` (e.g. an unapproved voucher). Runs inside
 * the caller's transaction (pass the lifecycle `onApply` client) so the
 * balance movement and the approval status change commit atomically.
 */
export async function applyJournalEntryBalances(
  client: pg.PoolClient,
  companyId: number,
  journalId: number
): Promise<void> {
  // Idempotency + rolling-deploy safety: only a deferred entry that has not
  // yet had its balances applied is processed. Entries that predate FIN-007
  // were created with balancesApplied = true and are skipped here.
  //
  // Select the entry's accounting `date` (not `createdAt`): the period gate
  // must evaluate against the ledger date, not the row's insertion time. A
  // voucher created on 2025-05-31 for the May period but persisted at
  // 2025-06-01 00:00:05 has date='2025-05-31' and createdAt='2025-06-01' —
  // the May period is the right gate, not June. The /post endpoint
  // (finance-hardening.ts:732) already uses `date` for the same reason.
  //
  // `FOR UPDATE` serialises two concurrent apply calls on the same journal
  // entry. Without the lock, the second caller could read `balancesApplied =
  // false` while the first is mid-apply, then both proceed and bump
  // `chart_of_accounts.currentBalance` twice. The flag UPDATE at the bottom
  // happens inside the caller's transaction, so the row stays locked until
  // the apply commits — the second waiter then sees `balancesApplied = true`
  // and exits cleanly.
  const { rows: jeRows } = await client.query(
    `SELECT "balancesApplied", date::text AS "entryDate"
       FROM journal_entries
      WHERE id = $1 AND "companyId" = $2
      FOR UPDATE`,
    [journalId, companyId]
  );
  if (!jeRows[0] || jeRows[0].balancesApplied) return;

  // H2 — applying a deferred entry's balances posts it to the ledger as of
  // the entry's own date. If that financial period has since closed or
  // locked (e.g. a voucher created in an open month, approved after the
  // month closed) the apply is refused — approval must not silently post
  // into a closed period. The caller's transaction rolls back, leaving the
  // document unapproved until the period is reopened or the entry redated.
  const periodCheck = await checkFinancialPeriodOpen(
    companyId,
    jeRows[0].entryDate as string
  );
  if (!periodCheck.open) {
    throw new ValidationError(
      `الفترة المالية "${periodCheck.periodName}" مُقفلة — لا يمكن ترحيل قيد بتاريخها`,
      { field: "financialPeriod", fix: "افتح الفترة المالية أو أعد تأريخ القيد" }
    );
  }

  const { rows: lines } = await client.query(
    `SELECT jl."accountCode", jl.debit, jl.credit
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId"
      WHERE jl."journalId" = $1 AND je."companyId" = $2`,
    [journalId, companyId]
  );
  const balanceChanges = new Map<string, number>();
  for (const line of lines) {
    if (!line.accountCode) continue;
    const delta = Number(line.debit) - Number(line.credit);
    balanceChanges.set(line.accountCode, (balanceChanges.get(line.accountCode) || 0) + delta);
  }
  for (const [accountCode, delta] of balanceChanges) {
    if (Math.abs(delta) < 0.001) continue;
    await client.query(
      `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1 WHERE "companyId" = $2 AND code = $3`,
      [delta, companyId, accountCode]
    );
  }
  await client.query(
    `UPDATE journal_entries SET "balancesApplied" = true WHERE id = $1 AND "companyId" = $2`,
    [journalId, companyId]
  );
}

export async function softDeleteJournalEntry(
  companyId: number,
  journalId: number
): Promise<void> {
  await reverseAccountBalances(companyId, journalId);
  await rawExecute(
    `UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2`,
    [journalId, companyId]
  );
}

type ApprovalChainType = "leaves" | "purchases" | "expenses" | "advances" | "letters" | "procurement" | "loans" | "overtime" | "exit" | "umrah_commission_plan";

interface ApprovalChainResult {
  requiresApproval: boolean;
  chainId: number | null;
  approvalRequestId: number | null;
  currentStep: number;
  totalSteps: number;
}

export async function initiateApprovalChain(params: {
  companyId: number;
  branchId: number;
  chainType: ApprovalChainType;
  refType: string;
  refId: number;
  amount?: number;
}): Promise<ApprovalChainResult> {
  const queryParams: any[] = [params.companyId, params.chainType];
  const amountFilter = params.amount != null
    ? `AND "minAmount" <= $3 AND "maxAmount" >= $3`
    : "";
  if (params.amount != null) queryParams.push(params.amount);

  const chains = await rawQuery<{ id: number }>(
    `SELECT * FROM approval_chains
     WHERE "companyId" = $1 AND "chainType" = $2 AND "isActive" = true
     AND "deletedAt" IS NULL
     ${amountFilter}
     ORDER BY "minAmount" DESC LIMIT 1`,
    queryParams
  );

  if (chains.length === 0) {
    return { requiresApproval: false, chainId: null, approvalRequestId: null, currentStep: 0, totalSteps: 0 };
  }

  const chain = chains[0];
  const steps = await rawQuery<{ requiredRole: string; stepOrder: number; timeoutHours: number | null }>(
    `SELECT * FROM approval_chain_steps WHERE "chainId" = $1 ORDER BY "stepOrder" ASC`,
    [chain.id]
  );

  if (steps.length === 0) {
    return { requiresApproval: false, chainId: chain.id, approvalRequestId: null, currentStep: 0, totalSteps: 0 };
  }

  const firstStep = steps[0];
  // Try the requested role first, then fall back through the management
  // chain so a request is NEVER created with assignedTo = null (otherwise
  // it sits in pending forever and the hourly escalation cron can only
  // ping HR generically without actually assigning an owner).
  const ROLE_FALLBACK_CHAIN = [
    firstStep.requiredRole,
    "branch_manager",
    "hr_manager",
    "general_manager",
    "owner",
  ].filter((v, i, a) => a.indexOf(v) === i);

  let approver: { id: number } | undefined;
  let resolvedRole: string = firstStep.requiredRole;
  for (const role of ROLE_FALLBACK_CHAIN) {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM employee_assignments
       WHERE "companyId" = $1 AND role = $2 AND status = 'active'
       ORDER BY CASE WHEN "branchId" = $3 THEN 0 ELSE 1 END LIMIT 1`,
      [params.companyId, role, params.branchId]
    );
    if (row) { approver = row; resolvedRole = role; break; }
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (firstStep.timeoutHours ?? 48));

  const { insertId: requestId } = await rawExecute(
    `INSERT INTO approval_requests ("companyId","branchId","refType","refId","requiredRole","assignedTo",status,"expiresAt","escalationLevel","chainId","currentStepOrder")
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,0,$8,$9)`,
    [params.companyId, params.branchId, params.refType, params.refId, firstStep.requiredRole, approver?.id ?? null, expiresAt.toISOString(), chain.id, firstStep.stepOrder]
  );

  if (approver) {
    await createNotification({
      companyId: params.companyId, assignmentId: approver.id,
      type: "approval_required", title: "طلب موافقة جديد",
      body: `يوجد طلب ${chainTypeLabel(params.chainType)} جديد يتطلب موافقتك${
        resolvedRole !== firstStep.requiredRole ? " (تم التوجيه بالنيابة)" : ""
      }`,
      priority: "high", refType: params.refType, refId: params.refId,
    });
  } else {
    logger.warn(
      `[initiateApprovalChain] No approver found for company=${params.companyId} chainType=${params.chainType} ref=${params.refType}#${params.refId}. Request ${requestId} created with assignedTo=null.`
    );
  }

  return { requiresApproval: true, chainId: chain.id, approvalRequestId: requestId, currentStep: 1, totalSteps: steps.length };
}

export async function processApprovalStep(params: {
  companyId: number;
  branchId: number;
  refType: string;
  refId: number;
  approved: boolean;
  decidedBy: number;
  reason?: string;
  requesterId?: number;
}): Promise<{ status: "approved" | "rejected" | "pending_next_step"; nextRole?: string; message: string }> {
  if (params.requesterId !== undefined && params.requesterId === params.decidedBy) {
    throw Object.assign(new Error("لا يمكن للمنشئ الموافقة على طلبه الخاص"), { statusCode: 403 });
  }

  const [request] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM approval_requests
     WHERE "refType" = $1 AND "refId" = $2 AND "companyId" = $3 AND status = 'pending'
     ORDER BY "createdAt" DESC LIMIT 1`,
    [params.refType, params.refId, params.companyId]
  );

  if (!request) {
    return { status: "approved", message: "لا يوجد طلب موافقة معلق" };
  }

  if (!params.approved) {
    await rawExecute(
      `UPDATE approval_requests SET status = 'rejected', "decidedBy" = $1, "decidedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [params.decidedBy, request.id, params.companyId]
    );
    return { status: "rejected", message: "تم الرفض" };
  }

  await rawExecute(
    `UPDATE approval_requests SET status = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
     WHERE id = $2 AND "companyId" = $3`,
    [params.decidedBy, request.id, params.companyId]
  );

  const chainId = request.chainId;
  const currentStepOrder = request.currentStepOrder ?? 1;

  if (!chainId) return { status: "approved", message: "تمت الموافقة" };

  const steps = await rawQuery<{ stepOrder: number; requiredRole: string; timeoutHours: number | null }>(
    `SELECT * FROM approval_chain_steps WHERE "chainId" = $1 ORDER BY "stepOrder" ASC`,
    [chainId]
  );

  const nextStep = steps.find((s) => s.stepOrder > Number(currentStepOrder));
  if (!nextStep) {
    return { status: "approved", message: "تمت الموافقة النهائية" };
  }

  const [nextApprover] = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_assignments
     WHERE "companyId" = $1 AND role = $2 AND status = 'active'
     ORDER BY CASE WHEN "branchId" = $3 THEN 0 ELSE 1 END LIMIT 1`,
    [params.companyId, nextStep.requiredRole, params.branchId]
  );

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (nextStep.timeoutHours ?? 48));

  await rawExecute(
    `INSERT INTO approval_requests ("companyId","branchId","refType","refId","requiredRole","assignedTo",status,"expiresAt","escalationLevel","chainId","currentStepOrder")
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,0,$8,$9)`,
    [params.companyId, params.branchId, params.refType, params.refId, nextStep.requiredRole, nextApprover?.id ?? null, expiresAt.toISOString(), chainId, nextStep.stepOrder]
  );

  const chainType = refTypeToChainType(params.refType);
  if (nextApprover) {
    await createNotification({
      companyId: params.companyId, assignmentId: nextApprover.id,
      type: "approval_required", title: "طلب موافقة - مرحلة تالية",
      body: `يتطلب طلب ${chainTypeLabel(chainType ?? "advances")} موافقتك (المرحلة ${nextStep.stepOrder})`,
      priority: "high", refType: params.refType, refId: params.refId,
    });
  }

  return { status: "pending_next_step", nextRole: nextStep.requiredRole, message: `تمت الموافقة على المرحلة. ينتظر موافقة ${nextStep.requiredRole}` };
}

function chainTypeLabel(t: ApprovalChainType): string {
  const map: Record<string, string> = {
    leaves: "إجازات", purchases: "مشتريات", expenses: "مصروفات",
    advances: "سلفة/عهدة", letters: "خطاب رسمي", procurement: "مشتريات",
    loans: "سلفة موظف", overtime: "وقت إضافي", exit: "نهاية خدمة",
    umrah_commission_plan: "خطة عمولة عمرة",
  };
  return map[t] ?? t;
}

export function refTypeToChainType(refType: string): ApprovalChainType | null {
  const map: Record<string, ApprovalChainType> = {
    leave_request: "leaves", purchase_order: "purchases",
    expense: "expenses", salary_advance: "advances",
    custody: "advances", official_letter: "letters",
    purchase_request: "procurement",
    hr_employee_loan: "loans", hr_overtime_request: "overtime",
    hr_exit_request: "exit",
    // Umrah commission plans pass through an approval chain when the
    // base salary or tier bonuses exceed company thresholds — invoked
    // by umrah-entities.ts: POST /umrah/commission-plans.
    employee_commission_plan: "umrah_commission_plan",
  };
  return map[refType] ?? null;
}

export async function validateBudget(params: {
  companyId: number;
  accountCode: string;
  amount: number;
  period?: string;
  role: string;
}): Promise<{
  status: "auto_approved" | "warning_cfo" | "blocked_gm" | "rejected" | "no_budget";
  canProceed: boolean;
  utilization: number;
  message: string;
  requiresApproval: boolean;
  approvalLevel?: string;
}> {
  const targetPeriod = params.period ?? currentPeriod();
  const [budget] = await rawQuery<Record<string, unknown>>(
    `SELECT amount, used FROM budgets
     WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`,
    [params.companyId, params.accountCode, targetPeriod]
  );

  if (!budget) {
    return { status: "no_budget", canProceed: true, utilization: 0, message: "لا توجد ميزانية محددة", requiresApproval: false };
  }

  const budgetAmount = Number(budget.amount);
  const newUsed = Number(budget.used) + Number(params.amount);
  const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;

  if (utilization <= 80) {
    return { status: "auto_approved", canProceed: true, utilization: Math.round(utilization), message: "الميزانية متاحة – موافقة تلقائية", requiresApproval: false };
  }
  if (utilization <= 99) {
    return {
      status: "warning_cfo", canProceed: FINANCE_ROLES.includes(params.role),
      utilization: Math.round(utilization),
      message: "تحذير: استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
      requiresApproval: true, approvalLevel: "cfo",
    };
  }
  if (utilization <= 110) {
    return {
      status: "blocked_gm", canProceed: OWNER_GM_ROLES.includes(params.role),
      utilization: Math.round(utilization),
      message: "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط",
      requiresApproval: true, approvalLevel: "general_manager",
    };
  }
  return {
    status: "rejected", canProceed: false, utilization: Math.round(utilization),
    message: "تجاوز الميزانية أكثر من 110% – رفض نهائي",
    requiresApproval: false,
  };
}

export async function updateBudgetUsed(params: {
  companyId: number;
  accountCode: string;
  amount: number;
  period?: string;
}): Promise<void> {
  const targetPeriod = params.period ?? currentPeriod();
  await rawExecute(
    `UPDATE budgets SET used = used + $1
     WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4`,
    [Number(params.amount), params.companyId, params.accountCode, targetPeriod]
  ).catch((e) => logger.error(e, "budget usage update failed"));
}

export async function getAssignmentIdByRole(companyId: number, branchId: number, role: string): Promise<number | null> {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT ea.id FROM employee_assignments ea
     WHERE ea."companyId" = $1 AND ea."branchId" = $2
       AND ea.role = $3 AND ea.status = 'active'
     LIMIT 1`,
    [companyId, branchId, role]
  );
  return row?.id ?? null;
}

export async function getDirectorAssignmentId(companyId: number, branchId: number): Promise<number | null> {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT ea.id FROM employee_assignments ea
     WHERE ea."companyId" = $1 AND ea."branchId" = $2
       AND ea.role IN ('general_manager','owner') AND ea.status = 'active'
     ORDER BY CASE ea.role WHEN 'general_manager' THEN 1 ELSE 2 END
     LIMIT 1`,
    [companyId, branchId]
  );
  return row?.id ?? null;
}

export async function getCfoAssignmentId(companyId: number, branchId: number): Promise<number | null> {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT ea.id FROM employee_assignments ea
     JOIN users u ON u."employeeId" = ea."employeeId"
     JOIN rbac_user_roles ur ON ur."userId" = u.id AND ur."companyId" = ea."companyId"
     JOIN rbac_roles r ON r.id = ur.role_id
     WHERE ea."companyId" = $1 AND ea."branchId" = $2
       AND r.role_key = 'finance_manager' AND ea.status = 'active'
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
     LIMIT 1`,
    [companyId, branchId]
  );
  if (row?.id) return row.id;
  return getDirectorAssignmentId(companyId, branchId);
}

/**
 * Resolve the person responsible for legal matters in this company, falling
 * back from legal_manager → general_manager → owner. Returns both the
 * assignmentId (for notifications/inbox) and the employee name (for
 * legal_cases.lawyerName which is a free-text column with no FK).
 *
 * Branch is intentionally ignored: legal cases are company-scoped, and a
 * rental or fleet branch may not have a legal officer on staff.
 */
export async function getLegalResponsible(
  companyId: number
): Promise<{ assignmentId: number; employeeName: string } | null> {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT ea.id, e.name
       FROM employee_assignments ea
       JOIN employees e ON e.id = ea."employeeId"
      WHERE ea."companyId" = $1
        AND ea.status = 'active'
        AND ea.role IN ('legal_manager','general_manager','owner')
      ORDER BY CASE ea.role
                 WHEN 'legal_manager' THEN 1
                 WHEN 'general_manager' THEN 2
                 WHEN 'owner' THEN 3
                 ELSE 4
               END
      LIMIT 1`,
    [companyId]
  );
  if (!row?.id) return null;
  return { assignmentId: Number(row.id), employeeName: String(row.name || "غير محدد") };
}

export async function getManagerAssignmentId(companyId: number, branchId: number): Promise<number | null> {
  const [manager] = await rawQuery<{ id: number }>(
    `SELECT ea.id FROM employee_assignments ea
     WHERE ea."companyId" = $1 AND ea."branchId" = $2
       AND ea.role IN ('branch_manager','hr_manager','general_manager','owner') AND ea.status = 'active'
     ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'hr_manager' THEN 2 WHEN 'general_manager' THEN 3 ELSE 4 END
     LIMIT 1`,
    [companyId, branchId]
  );
  return manager?.id ?? null;
}

export async function checkFinancialPeriodOpen(
  companyId: number,
  date: string
): Promise<{ open: boolean; periodName?: string }> {
  // Both `closed` and `locked` periods bar GL posting — `locked` is the
  // stricter state. Treating only `closed` as blocking would let a posted
  // entry slip into a locked period.
  const rows = await rawQuery<{ name: string }>(
    `SELECT name FROM financial_periods
     WHERE "companyId" = $1 AND status IN ('closed', 'locked')
       AND "deletedAt" IS NULL
       AND "startDate" <= $2 AND "endDate" >= $2
     LIMIT 1`,
    [companyId, date]
  );
  if (rows.length > 0) {
    return { open: false, periodName: rows[0].name };
  }
  return { open: true };
}

/**
 * Intent map — for each known operationType we know what kind of account it
 * SHOULD point at, expressed as (a) the chart_of_accounts.type filter and
 * (b) Arabic keywords to look for in the name. When the configured mapping
 * is missing AND the hardcoded fallback code doesn't exist in the company's
 * chart, we search by intent and pick the first matching posting account.
 *
 * This stops "الحساب 1400 غير موجود في شجرة الحسابات" from blocking saves
 * when the company's chart uses different codes than the legacy defaults.
 */
export const MAPPING_INTENT: Record<string, { type: string; keywords: string[] }> = {
  vat_input: { type: "asset", keywords: ["ضريبة قيمة مضافة مدفوعة", "ضريبة المدخلات", "vat input", "input vat"] },
  vat_output: { type: "liability", keywords: ["ضريبة القيمة المضافة المستحقة", "ضريبة المخرجات", "vat output", "output vat"] },
  withholding_tax: { type: "liability", keywords: ["ضريبة الاستقطاع", "withholding"] },
  store_revenue: { type: "revenue", keywords: ["إيرادات المتجر", "مبيعات", "إيرادات"] },
  store_cash: { type: "asset", keywords: ["النقدية", "صندوق", "cash"] },
  store_cogs: { type: "expense", keywords: ["تكلفة البضاعة", "تكلفة المبيعات", "cogs"] },
  store_inventory: { type: "asset", keywords: ["المخزون", "inventory"] },
  custody_account: { type: "asset", keywords: ["عهدة", "custody"] },
  umrah_revenue: { type: "revenue", keywords: ["عمرة", "إيرادات"] },
  umrah_agent_receivable: { type: "asset", keywords: ["مدينون", "عملاء", "agent"] },
  umrah_commission: { type: "expense", keywords: ["عمولة"] },
  fx_revaluation_ar: { type: "asset", keywords: ["مدينون", "ذمم"] },
  fx_revaluation_ap: { type: "liability", keywords: ["دائنون", "موردون"] },
  fx_revaluation_gain: { type: "revenue", keywords: ["أرباح فروق", "ربح صرف"] },
  fx_revaluation_loss: { type: "expense", keywords: ["خسائر فروق", "خسارة صرف"] },
  // #1715 correctness review — customer-money flows (payments + advances). On a
  // SOCPA tree the literal fallbacks (1100/1110 cash, 2400 advance-liability)
  // are non-postable HEADERS or absent, so without these the cash/liability leg
  // resolved to a header and the post FAILED. Intent search then finds the
  // postable leaf (e.g. 1111 الصندوق الرئيسي, 2160 إيرادات مقبوضة مقدماً).
  invoice_payment_cash: { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  customer_advance_liability: { type: "liability", keywords: ["دفعات مقدمة", "مقبوضة مقدم", "عملاء", "advance", "unearned"] },
  // #1945 FIN-03 — the AR-clearing leg of customer receipts/payments. On a
  // SOCPA tree the literal fallback "1200" is الأصول غير المتداولة (a
  // non-postable header), so the credit leg of every customer payment
  // resolved to a header and the post FAILED. Intent search finds the
  // postable receivables leaf (e.g. 1131 عملاء محليون).
  invoice_payment_ar: { type: "asset", keywords: ["ذمم", "مدينون", "عملاء", "receivable"] },
  // …and the AR DEBIT side of issuing the invoice itself — fallback "1200"
  // is الأصول غير المتداولة (non-postable header) on a SOCPA tree, so
  // approving ANY invoice failed there before this entry.
  invoice_ar: { type: "asset", keywords: ["ذمم", "مدينون", "عملاء", "receivable"] },
  // #1945 FIN-18 — bank reconciliation adjustments (fees out / interest in).
  bank_fee_expense: { type: "expense", keywords: ["عمولات بنكية", "رسوم بنكية", "مصروفات بنكية", "bank fee", "bank charge"] },
  bank_interest_income: { type: "revenue", keywords: ["فوائد", "مرابحات", "عوائد بنكية", "interest"] },
  // #1945 item 6 — generic sales-invoice revenue. The literal fallback
  // "4000" is the REVENUE ROOT (non-postable header) on a SOCPA tree, so an
  // invoice with any unmapped line could never approve there. Intent search
  // finds the postable sales leaf (e.g. 4111 مبيعات نقدية).
  invoice_revenue: { type: "revenue", keywords: ["إيرادات المبيعات", "مبيعات", "إيرادات", "sales"] },
  // …and the invoice's output-VAT payable leg — fallback "2300" is absent on
  // a SOCPA tree (the leaf is e.g. 2131 ضريبة القيمة المضافة المستحقة).
  invoice_vat_payable: { type: "liability", keywords: ["ضريبة القيمة المضافة المستحقة", "ضريبة المخرجات", "vat output", "output vat"] },
  // #1945 FIN-SUB-01 (#2097) — GRN per-line treatment routing. The literal
  // fallbacks in finance-purchase.ts were wrong/absent on the SOCPA chart
  // (inventory→1250 leasehold, custody→1130 AR, plus missing expense leaves);
  // these intents resolve the right postable leaf on any tenant chart, and the
  // GRN nature-enforcement guarantees the posted account matches the treatment.
  inventory_receipt:           { type: "asset",   keywords: ["مخزون البضائع", "المخزون", "مخزون"] },
  employee_custody:            { type: "asset",   keywords: ["عهد مالية للموظف", "عهد"] },
  supplier_prepayment:         { type: "asset",   keywords: ["مصروفات مدفوعة مقدم", "مدفوعة مقدم", "دفعات مقدمة"] },
  fixed_asset_purchase:        { type: "asset",   keywords: ["أعمال تحت التنفيذ", "الأصول غير الملموسة", "أصول"] },
  general_expense:             { type: "expense", keywords: ["مصروفات عمومية", "مصروفات إدارية", "قرطاسية", "مصروف"] },
  service_expense:             { type: "expense", keywords: ["تكلفة الخدمات", "أتعاب مهنية", "خدمات"] },
  vehicle_expense:             { type: "expense", keywords: ["صيانة وإصلاح المركبات", "الوقود", "مركبات"] },
  property_maintenance_expense:{ type: "expense", keywords: ["صيانة المباني والوحدات", "صيانة المباني", "صيانة"] },
  project_cost:                { type: "expense", keywords: ["تكلفة المشاريع والمقاولات", "تكلفة المشاريع", "مشاريع"] },
  // Root-cause sweep — intent coverage for EVERY operationType whose static
  // fallback used to point at a non-postable header/missing code (now fixed at
  // the call sites to the canonical postable leaf). These entries guarantee the
  // SAME correct leaf is auto-resolved on ANY tenant chart whose codes differ
  // from DEFAULT_CHART_OF_ACCOUNTS. Each opType maps to a SINGLE account type;
  // dual-leg/cross-type opTypes (e.g. project_cost_transfer: debit→expense
  // 5130, credit→asset 1270) are deliberately OMITTED — a one-type intent would
  // mis-route one of their legs, so they rely on their now-postable fallbacks.
  // --- Cash (→ الصندوق الرئيسي 1111) ---
  cash:                          { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  fleet_cash_source:             { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  vendor_advance_cash:           { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  cip_funding_cash:              { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  property_cash:                 { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  property_building_purchase_cash:{ type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  fleet_vehicle_purchase_cash:   { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  asset_disposal_cash:           { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  employee_loan_disbursement:    { type: "asset", keywords: ["النقدية", "صندوق", "نقد", "cash"] },
  // --- Bank (→ بنوك 1124/112x) ---
  payroll_bank_payout:           { type: "asset", keywords: ["البنك", "بنوك", "مصرف", "bank"] },
  // --- Receivables (→ عملاء محليون 1131) ---
  accounts_receivable:           { type: "asset", keywords: ["عملاء", "ذمم", "مدينون", "receivable"] },
  legal_receivable:              { type: "asset", keywords: ["عملاء", "ذمم", "مدينون", "receivable"] },
  support_ar:                    { type: "asset", keywords: ["عملاء", "ذمم", "مدينون", "receivable"] },
  cargo_receivable:              { type: "asset", keywords: ["عملاء", "ذمم", "مدينون", "receivable"] },
  rent_receivable:               { type: "asset", keywords: ["عملاء العقارات", "إيجارات", "ذمم", "عملاء"] },
  bad_debt_allowance:            { type: "asset", keywords: ["مخصص الديون", "الديون المشكوك", "مخصص"] },
  salary_advance_receivable:     { type: "asset", keywords: ["سلف الموظفين", "سلف", "عهد"] },
  employee_loan_receivable:      { type: "asset", keywords: ["قروض موظفين", "قروض"] },
  vendor_return_revenue:         { type: "asset", keywords: ["مخزون البضائع", "المخزون", "مخزون"] },
  fleet_prepaid_insurance:       { type: "asset", keywords: ["تأمينات مدفوعة مقدم", "مدفوعة مقدم", "مصروفات مدفوعة مقدم"] },
  // --- Fixed assets & accumulated depreciation ---
  fleet_vehicle_asset:           { type: "asset", keywords: ["المركبات", "أسطول النقل", "مركبات"] },
  fleet_acc_depreciation:        { type: "asset", keywords: ["مجمع إهلاك المركبات", "مجمع إهلاك"] },
  asset_accumulated_impairment:  { type: "asset", keywords: ["مجمع إهلاك", "إهلاك متراكم"] },
  property_building_asset:        { type: "asset", keywords: ["المباني والعقارات", "المباني", "عقارات"] },
  property_sale_receivable:     { type: "asset", keywords: ["عملاء", "ذمم مدينة", "مدينون"] },
  property_sale_loss:            { type: "expense", keywords: ["خسائر بيع أصول", "بيع أصول", "خسائر"] },
  property_acc_depreciation:     { type: "asset", keywords: ["مجمع إهلاك المباني", "مجمع إهلاك"] },
  project_wip:                   { type: "asset", keywords: ["أعمال تحت التنفيذ", "تحت التنفيذ"] },
  // --- Payables (→ موردون محليون 2111) ---
  purchase_vendor_ap:            { type: "liability", keywords: ["موردون", "دائنون", "ذمم دائنة"] },
  vendor_credit_clearing:        { type: "liability", keywords: ["موردون", "دائنون", "ذمم دائنة"] },
  vendor_advance_receivable:     { type: "liability", keywords: ["موردون", "دائنون", "ذمم دائنة"] },
  // --- Payroll & statutory payables ---
  payroll_deductions_payable:    { type: "liability", keywords: ["مستحقات الرواتب", "الرواتب", "استقطاعات"] },
  employee_deductions:           { type: "liability", keywords: ["مستحقات الرواتب", "الرواتب", "استقطاعات"] },
  payroll_gosi_payable:          { type: "liability", keywords: ["التأمينات الاجتماعية", "تأمينات اجتماعية", "gosi"] },
  // --- Accrued expenses (→ مصروفات مستحقة الدفع 2150) ---
  legal_payable:                 { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  legal_fee_payable:             { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  property_maintenance_payable:  { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  cargo_freight_payable:         { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  fleet_trip_payable:            { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  fleet_fines_payable:           { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  purchase_grni:                 { type: "liability", keywords: ["مصروفات مستحقة", "مستحقة الدفع", "مستحقات"] },
  // --- Other liabilities ---
  wht_payable:                   { type: "liability", keywords: ["ضريبة الاستقطاع", "استقطاع", "withholding"] },
  security_deposit_liability:    { type: "liability", keywords: ["تأمينات وضمانات", "تأمينات من العملاء", "ضمانات"] },
  hr_eos_accrual_liability:      { type: "liability", keywords: ["مكافأة نهاية الخدمة", "نهاية الخدمة"] },
  eos_accrual_liability:         { type: "liability", keywords: ["مكافأة نهاية الخدمة", "نهاية الخدمة"] },
  // --- Revenue ---
  sales_revenue:                 { type: "revenue", keywords: ["مبيعات", "إيرادات المبيعات", "إيرادات", "sales"] },
  invoice_sales_returns:         { type: "revenue", keywords: ["مردودات", "مسموحات المبيعات", "مردودات المبيعات"] },
  rent_revenue:                  { type: "revenue", keywords: ["إيجارات", "إيرادات الإيجارات", "إيرادات"] },
  rental_revenue:                { type: "revenue", keywords: ["إيجارات", "إيرادات الإيجارات", "إيرادات"] },
  support_service_revenue:       { type: "revenue", keywords: ["إيرادات الخدمات", "خدمات", "إيرادات"] },
  fleet_rental_revenue:          { type: "revenue", keywords: ["إيرادات النقل", "النقل", "الأسطول", "إيرادات"] },
  cargo_freight_revenue:         { type: "revenue", keywords: ["إيرادات النقل", "شحن", "النقل", "إيرادات"] },
  asset_disposal_gain:           { type: "revenue", keywords: ["أرباح بيع أصول", "بيع أصول", "أرباح"] },
  legal_settlement_revenue:      { type: "revenue", keywords: ["إيرادات متنوعة", "متنوعة", "إيرادات"] },
  // --- Expenses ---
  salary_expense:                { type: "expense", keywords: ["الرواتب الأساسية", "رواتب", "أجور"] },
  payroll_salary_expense:        { type: "expense", keywords: ["الرواتب الأساسية", "رواتب", "أجور"] },
  payroll_overtime_expense:      { type: "expense", keywords: ["العمل الإضافي", "إضافي", "أوفر تايم"] },
  payroll_gosi_expense:          { type: "expense", keywords: ["حصة المنشأة في التأمينات", "التأمينات", "gosi"] },
  eos_expense:                   { type: "expense", keywords: ["مكافأة نهاية الخدمة", "نهاية الخدمة"] },
  eos_accrual_expense:           { type: "expense", keywords: ["مكافأة نهاية الخدمة", "نهاية الخدمة"] },
  hr_eos_accrual_expense:        { type: "expense", keywords: ["مكافأة نهاية الخدمة", "نهاية الخدمة"] },
  leave_settlement_expense:      { type: "expense", keywords: ["الإجازات", "تذاكر السفر", "إجازات"] },
  leave_accrual_expense:         { type: "expense", keywords: ["الإجازات", "إجازات"] },
  hr_leave_accrual_expense:      { type: "expense", keywords: ["الإجازات", "إجازات"] },
  fleet_trip_expense:            { type: "expense", keywords: ["تكاليف نقل وشحن", "نقل وشحن", "نقل", "شحن"] },
  cargo_freight_cost:            { type: "expense", keywords: ["تكاليف نقل وشحن", "نقل وشحن", "شحن", "نقل"] },
  fleet_maintenance_expense:     { type: "expense", keywords: ["صيانة وإصلاح المركبات", "صيانة المركبات", "صيانة"] },
  fleet_fuel_expense:            { type: "expense", keywords: ["الوقود", "وقود", "fuel"] },
  // مصروف تأمين المركبات (طرف الإطفاء الشهري لقسط التأمين المدفوع مقدمًا → 5530).
  // كلمات محدّدة فقط («تأمين المركبات/السيارات») تجنّبًا لمطابقة تأمينات GOSI (5250)
  // أو التأمين العام (5930) أو المدفوع مقدمًا (1172) عند البحث بالنيّة.
  fleet_insurance_expense:       { type: "expense", keywords: ["تأمين المركبات", "تأمين السيارات"] },
  fleet_fines_expense:           { type: "expense", keywords: ["مخالفات مرورية", "مخالفات"] },
  fleet_depreciation:            { type: "expense", keywords: ["إهلاك المركبات", "إهلاك"] },
  property_depreciation:         { type: "expense", keywords: ["إهلاك المباني", "إهلاك"] },
  vendor_invoice_expense:        { type: "expense", keywords: ["أتعاب مهنية واستشارية", "أتعاب مهنية", "استشارية"] },
  legal_fee:                     { type: "expense", keywords: ["أتعاب محاماة", "محاماة", "أتعاب قانونية"] },
  legal_expense:                 { type: "expense", keywords: ["أتعاب محاماة", "محاماة", "أتعاب قانونية"] },
  legal_settlement_expense:      { type: "expense", keywords: ["رسوم محاكم وتقاضي", "رسوم محاكم", "تقاضي"] },
  bad_debt_expense:              { type: "expense", keywords: ["ديون معدومة", "معدومة"] },
  allowance_expense:             { type: "expense", keywords: ["ديون معدومة", "مخصص", "معدومة"] },
  asset_revaluation_loss:        { type: "expense", keywords: ["خسائر بيع أصول", "خسائر", "اضمحلال"] },
  asset_impairment_loss:         { type: "expense", keywords: ["خسائر بيع أصول", "خسائر", "اضمحلال"] },
  asset_disposal_loss:           { type: "expense", keywords: ["خسائر بيع أصول", "بيع أصول", "خسائر"] },
};

const _resolvedAccountCache = new Map<string, string>();
const _RESOLVED_ACCOUNT_CACHE_MAX_SIZE = 5_000;

async function resolveByIntent(companyId: number, operationType: string, fallbackCode: string): Promise<string> {
  // The fallback differs per side for operations that post both legs under the
  // SAME operationType (e.g. inventory_issue_cogs: debit→5110 COGS,
  // credit→1151 inventory). Keying the cache by operationType alone collapsed
  // both legs onto whichever resolved first — producing a degenerate JE that
  // debited AND credited COGS with no inventory relief (COGS never truly
  // posted). Include the fallbackCode so each side resolves independently.
  const cacheKey = `${companyId}:${operationType}:${fallbackCode}`;
  const cached = _resolvedAccountCache.get(cacheKey);
  if (cached) return cached;

  // 1. If the hardcoded fallback EXISTS and accepts posting, use it.
  const [fb] = await rawQuery<{ code: string }>(
    `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "allowPosting"=true AND "deletedAt" IS NULL LIMIT 1`,
    [companyId, fallbackCode]
  );
  if (fb) {
    if (_resolvedAccountCache.size >= _RESOLVED_ACCOUNT_CACHE_MAX_SIZE) _resolvedAccountCache.clear();
    _resolvedAccountCache.set(cacheKey, fb.code);
    return fb.code;
  }

  // 2. Otherwise search by intent (type + Arabic name keywords).
  const intent = MAPPING_INTENT[operationType];
  if (intent) {
    const likeClauses = intent.keywords.map((_, i) => `LOWER(name) LIKE $${i + 3}`).join(" OR ");
    const params = [companyId, intent.type, ...intent.keywords.map(k => `%${k.toLowerCase()}%`)];
    const rows = await rawQuery<{ code: string }>(
      `SELECT code FROM chart_of_accounts
       WHERE "companyId"=$1 AND type=$2 AND "allowPosting"=true AND "deletedAt" IS NULL AND (${likeClauses})
       ORDER BY length(code) ASC, code ASC LIMIT 1`,
      params
    );
    if (rows.length) {
      logger.warn(`[accounting_mappings] Resolved "${operationType}" → "${rows[0].code}" by intent search (fallback "${fallbackCode}" missing).`);
      if (_resolvedAccountCache.size >= _RESOLVED_ACCOUNT_CACHE_MAX_SIZE) _resolvedAccountCache.clear();
      _resolvedAccountCache.set(cacheKey, rows[0].code);
      return rows[0].code;
    }
  }

  // 3. Neither the fallback nor intent search found a postable account.
  // Throw immediately with a clear config error rather than returning an
  // unverified code that would travel silently through the system and
  // produce a cryptic failure at the DB level much later.
  throw new ValidationError(
    `لا يمكن تحديد حساب قابل للترحيل للعملية "${operationType}"` +
    (fallbackCode ? ` (الكود الافتراضي "${fallbackCode}" غير موجود أو غير قابل للترحيل)` : "") +
    `. أضف ربطاً في إعدادات المحاسبة → ربط الحسابات.`,
    {
      field: "accountCode",
      fix: `افتح إعدادات المحاسبة → ربط الحسابات وأضف إعداداً للعملية "${operationType}" يشير إلى حساب فرعي (تفصيلي) يقبل الحركة`,
    }
  );
}

/**
 * Verify that a resolved account code is postable in the given company.
 * Throws a descriptive ValidationError when:
 *   - the code is empty / blank (missing mapping / fallback)
 *   - the account does not exist in the company's chart
 *   - the account is a grouping / summary account (allowPosting=false)
 *   - the account is inactive
 *
 * Call this immediately after resolveAccountCode / getAccountCodeFromMapping
 * before building journal lines — it is the single centralised choke-point
 * that prevents ANY non-postable account from ever reaching the GL engine,
 * regardless of the path (UI, API, mapping, fallback, import, seed).
 */
export async function assertPostableAccount(
  companyId: number,
  code: string,
  context: { operationType?: string; side?: string; field?: string } = {}
): Promise<void> {
  if (!code || !code.trim()) {
    const hint = context.operationType
      ? `لم يُعثر على حساب مرتبط بالعملية "${context.operationType}" (${context.side ?? ""}). أضف ربطاً في إعدادات المحاسبة.`
      : "لم يُحدَّد رقم الحساب.";
    throw new ValidationError(hint, {
      field: context.field ?? "accountCode",
      fix: "افتح إعدادات المحاسبة → ربط الحسابات وأضف الإعداد الناقص",
    });
  }
  const [acc] = await rawQuery<{ allowPosting: boolean; isActive: boolean; name: string }>(
    `SELECT "allowPosting", "isActive", name FROM chart_of_accounts
     WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL LIMIT 1`,
    [companyId, code]
  );
  if (!acc) {
    throw new ValidationError(
      `الحساب "${code}" غير موجود في شجرة الحسابات` +
      (context.operationType ? ` (العملية: ${context.operationType})` : ""),
      { field: context.field ?? "accountCode", fix: "تأكد من وجود الحساب في شجرة الحسابات أو أضف إعداد ربط صحيح" }
    );
  }
  if (!acc.allowPosting) {
    throw new ValidationError(
      `الحساب "${code}" (${acc.name}) حساب تجميعي/رئيسي لا يقبل الترحيل المباشر` +
      (context.operationType ? ` — العملية: ${context.operationType}` : "") +
      ". استخدم حساباً فرعياً تفصيلياً أو أضف ربطاً صحيحاً في إعدادات المحاسبة.",
      { field: context.field ?? "accountCode", fix: "اختر حساباً فرعياً (تفصيلياً) يقبل الحركة أو أصلح ربط الحسابات" }
    );
  }
  if (!acc.isActive) {
    throw new ValidationError(
      `الحساب "${code}" (${acc.name}) معطّل — لا يمكن الترحيل عليه`,
      { field: context.field ?? "accountCode", fix: "فعّل الحساب أو اختر حساباً نشطاً" }
    );
  }
}

export async function getAccountCodeFromMapping(
  companyId: number,
  operationType: string,
  side: "debit" | "credit",
  fallbackCode: string = ""
): Promise<string> {
  // Fetch both the mapping row AND the joined account info in one query.
  // Two separate joins: one that checks allowPosting=true (valid), one that
  // doesn't — so we can distinguish "no mapping at all" from "mapping exists
  // but the account is a non-postable parent" and raise a CLEAR config error
  // in the latter case rather than silently falling back to intent search.
  const [mapping] = await rawQuery<{
    debitAccountId:   number | null;
    creditAccountId:  number | null;
    debitCode:        string | null;  // null if account deleted/non-postable
    creditCode:       string | null;
    debitAllows:      boolean | null; // the actual allowPosting of the linked account
    creditAllows:     boolean | null;
    debitAccountCode: string | null;  // legacy text column (fallback)
    creditAccountCode:string | null;
  }>(
    `SELECT am."debitAccountId", am."creditAccountId",
            am."debitAccountCode", am."creditAccountCode",
            valid_da.code    AS "debitCode",
            valid_ca.code    AS "creditCode",
            raw_da."allowPosting" AS "debitAllows",
            raw_ca."allowPosting" AS "creditAllows"
     FROM accounting_mappings am
     -- join to get postable account code (null when non-postable / deleted)
     LEFT JOIN chart_of_accounts valid_da
       ON valid_da.id = am."debitAccountId"
       AND valid_da."allowPosting" = true AND valid_da."deletedAt" IS NULL
     LEFT JOIN chart_of_accounts valid_ca
       ON valid_ca.id = am."creditAccountId"
       AND valid_ca."allowPosting" = true AND valid_ca."deletedAt" IS NULL
     -- join WITHOUT allowPosting filter to detect misconfigured parent accounts
     LEFT JOIN chart_of_accounts raw_da
       ON raw_da.id = am."debitAccountId" AND raw_da."deletedAt" IS NULL
     LEFT JOIN chart_of_accounts raw_ca
       ON raw_ca.id = am."creditAccountId" AND raw_ca."deletedAt" IS NULL
     WHERE am."companyId" = $1 AND am."operationType" = $2 AND am."isActive" = true
     LIMIT 1`,
    [companyId, operationType]
  );

  if (!mapping) {
    // No mapping configured at all — fall through to intent search.
    const resolved = await resolveByIntent(companyId, operationType, fallbackCode);
    if (resolved !== fallbackCode) return resolved;
    logger.warn(`[accounting_mappings] No mapping for "${operationType}", company=${companyId}. Fallback: "${fallbackCode}".`);
    rawExecute(
      `INSERT INTO audit_logs ("companyId","userId",action,entity,"entityId","after")
       VALUES ($1,0,'mapping_fallback','accounting_mappings',0,$2)`,
      [companyId, JSON.stringify({ operationType, side, fallbackCode })]
    ).catch((e) => logger.error(e, "[businessHelpers] background task failed"));
    // resolveByIntent already throws if it cannot find a postable account,
    // so reaching here means it returned the fallback — which means it DID
    // find it postable (step 1 in resolveByIntent). Return it.
    // NOTE: the only way we reach this line is if resolveByIntent returned
    // the same fallbackCode it was given — i.e. it found it postable in step 1
    // but there was no explicit mapping. That is a valid "configured fallback" path.
    return fallbackCode;
  }

  // If a mapping row EXISTS but its linked account is a non-postable parent,
  // raise an explicit config error — do NOT silently fall back to intent search.
  // Silent fallback would hide the misconfiguration from the operator.
  if (side === "debit" && mapping.debitAccountId !== null && !mapping.debitAllows) {
    throw new ValidationError(
      `إعداد المحاسبة غير صحيح: العملية "${operationType}" مرتبطة بحساب مدين غير قابل للترحيل ` +
      `(حساب تجميعي/رئيسي أو محذوف). أصلح الإعداد في قائمة ربط الحسابات.`,
      {
        field: "debitAccountId",
        fix: `افتح إعدادات المحاسبة → ربط الحسابات → اختر حساباً فرعياً (تفصيلياً) يقبل الحركة للعملية "${operationType}"`,
      }
    );
  }
  if (side === "credit" && mapping.creditAccountId !== null && !mapping.creditAllows) {
    throw new ValidationError(
      `إعداد المحاسبة غير صحيح: العملية "${operationType}" مرتبطة بحساب دائن غير قابل للترحيل ` +
      `(حساب تجميعي/رئيسي أو محذوف). أصلح الإعداد في قائمة ربط الحسابات.`,
      {
        field: "creditAccountId",
        fix: `افتح إعدادات المحاسبة → ربط الحسابات → اختر حساباً فرعياً (تفصيلياً) يقبل الحركة للعملية "${operationType}"`,
      }
    );
  }

  const explicitCode = side === "debit"
    ? (mapping.debitCode || mapping.debitAccountCode)
    : (mapping.creditCode || mapping.creditAccountCode);
  if (explicitCode) return explicitCode;
  return await resolveByIntent(companyId, operationType, fallbackCode);
}

/**
 * Validate a set of resolved account codes BEFORE a batch of postings runs.
 * Fails the whole run with a single clear error instead of producing one
 * posting-failure row per item when a mapping points at a missing/disabled/
 * non-postable account. Mirrors the per-line validation in createJournalEntry.
 */
export async function preflightAccountCodes(
  companyId: number,
  codes: string[],
): Promise<void> {
  const uniqueCodes = [...new Set(codes.filter(Boolean))];
  if (uniqueCodes.length === 0) return;
  const placeholders = uniqueCodes.map((_, i) => `$${i + 2}`).join(",");
  const accountRows = await rawQuery<{ code: string; allowPosting: boolean; isActive: boolean }>(
    `SELECT code, "allowPosting", "isActive" FROM chart_of_accounts WHERE "companyId" = $1 AND code IN (${placeholders}) AND "deletedAt" IS NULL`,
    [companyId, ...uniqueCodes]
  );
  const accountMap = new Map(accountRows.map((a) => [a.code, a]));
  for (const code of uniqueCodes) {
    const acc = accountMap.get(code);
    if (!acc) {
      throw new ValidationError(`الحساب "${code}" غير موجود في شجرة الحسابات`, { field: "accountCode", fix: "اختر حساباً موجوداً من شجرة الحسابات" });
    }
    if (acc.allowPosting === false) {
      throw new ValidationError(`لا يمكن الترحيل على الحساب "${code}" — هذا حساب تجميعي (رئيسي). استخدم حساباً فرعياً يقبل الحركة`, { field: "accountCode", fix: "اختر حساباً فرعياً (تفصيلياً) يقبل الحركة" });
    }
    if (acc.isActive === false) {
      throw new ValidationError(`لا يمكن الترحيل على الحساب "${code}" — الحساب معطّل (غير نشط)`, { field: "accountCode", fix: "فعّل الحساب أو اختر حساباً نشطاً" });
    }
  }
}
