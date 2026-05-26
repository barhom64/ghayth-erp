// numberingService — central numbering authority for Ghayth ERP.
//
// Issue #1141: every official document number (طلبات / عقود / مراسلات
// / فواتير / سندات / قيود / مجموعات عمرة / …) must be issued by this
// module. Routes are forbidden from running their own `nextval(...)`
// or building time/random refs for executive documents — `scripts/src/
// lint-patterns.mjs` enforces that rule in CI.
//
// Architectural contract
// ----------------------
//   * The service does **not** decide whether a document should exist —
//     that is the calling route's domain. It only issues the number
//     according to the policy (`numbering_schemes` row) and records the
//     fact (`numbering_assignments` row).
//   * Counters live in `numbering_counters` with a unique scope tuple
//     `(schemeId, branchId, fiscalYear, period, seasonId)`. The atomic
//     increment runs through `SELECT … FOR UPDATE` inside a transaction
//     so two concurrent callers serialise on the row.
//   * If the policy fails (no scheme, locked counter, bad pattern) we
//     throw. Routes must let the error bubble up and refuse to create
//     the document — silent fallback to a random number was one of the
//     defects listed in the issue.

import { withTransaction, rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from "./errorHandler.js";
import { currentYear, currentPeriod, currentDateInTz } from "./businessHelpers.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ResetPolicy = "never" | "yearly" | "monthly" | "seasonal" | "fiscal_year";
export type ScopePolicy = "company" | "branch" | "module" | "entity" | "season" | "fiscal_year";
export type IssueTiming = "on_draft" | "on_submit" | "on_approval" | "on_posting";
export type ManualEditPolicy = "disabled" | "draft_only" | "privileged" | "legacy_import_only";
export type AssignmentStatus = "reserved" | "assigned" | "cancelled" | "voided" | "released";

export interface NumberingScheme {
  id: number;
  companyId: number;
  moduleKey: string;
  entityKey: string;
  displayNameAr: string;
  displayNameEn: string | null;
  prefix: string;
  pattern: string;
  padLength: number;
  resetPolicy: ResetPolicy;
  scopePolicy: ScopePolicy;
  issueTiming: IssueTiming;
  manualEditPolicy: ManualEditPolicy;
  requiresReasonOnManualEdit: boolean;
  lockAfterStatuses: string[];
  branchPrefixOverrides: Record<string, string>;
  isActive: boolean;
}

export interface IssueParams {
  companyId: number;
  branchId: number | null;
  moduleKey: string;
  entityKey: string;
  entityTable: string;
  entityId?: number | null;
  actorId: number | null;
  /** Override the year used by the scope/format ({YYYY}). Defaults to currentYear(). */
  fiscalYear?: number;
  /** Override the period bucket used when `resetPolicy = monthly`. Defaults to currentPeriod() (YYYY-MM). */
  period?: string;
  /** Required when the policy is scoped by season (e.g. Umrah). */
  seasonId?: number | null;
  /** Optional metadata persisted with the assignment row. */
  metadata?: Record<string, unknown>;
  /** Issue as `reserved` (for draft policies) instead of `assigned`. */
  reserveOnly?: boolean;
}

export interface IssueResult {
  number: string;
  sequenceValue: number;
  schemeId: number;
  counterId: number;
  assignmentId: number;
  status: AssignmentStatus;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Pad a numeric sequence value with leading zeros. */
function pad(value: number, padLength: number): string {
  return String(value).padStart(padLength, "0");
}

/** Branches table is fairly small per company; cache the code lookup per
 *  process to avoid the round-trip on every issueNumber call. The TTL is
 *  intentionally short — branch codes don't change often, but we don't
 *  want a stale cache to outlive a rename either. */
const _branchCodeCache = new Map<number, { code: string; expiresAt: number }>();
const BRANCH_CODE_TTL_MS = 60_000;

async function resolveBranchCode(branchId: number | null): Promise<string> {
  if (branchId == null) return "";
  const cached = _branchCodeCache.get(branchId);
  if (cached && cached.expiresAt > Date.now()) return cached.code;

  // Branch table now carries an explicit `numberingCode` column (added
  // in migration 213); when it's empty we fall back to a 3-letter slug
  // derived from the (English) name. NEVER fall back to the numeric id —
  // that produces noisy refs like `REQ-7-2026-0001`.
  const rows = await rawQuery<{ numberingCode: string | null; name: string | null; nameEn: string | null }>(
    `SELECT "numberingCode", name, "nameEn" FROM branches WHERE id = $1 LIMIT 1`,
    [branchId],
  ).catch(() => [] as { numberingCode: string | null; name: string | null; nameEn: string | null }[]);

  const row = rows[0];
  let code = (row?.numberingCode || "").trim().toUpperCase();
  if (!code) {
    const source = (row?.nameEn || row?.name || "").trim();
    code = source ? source.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, "") : "BR";
    if (!code) code = "BR";
  }
  _branchCodeCache.set(branchId, { code, expiresAt: Date.now() + BRANCH_CODE_TTL_MS });
  return code;
}

/** Drop the cached code for a branch — call on rename so subsequent
 *  issues pick up the new code. */
export function invalidateBranchCodeCache(branchId?: number): void {
  if (branchId === undefined) _branchCodeCache.clear();
  else _branchCodeCache.delete(branchId);
}

/** Convert a scheme row from snake-like / json columns to a typed shape. */
function mapSchemeRow(row: Record<string, unknown>): NumberingScheme {
  const lockAfter = row.lockAfterStatuses;
  const branchOverrides = row.branchPrefixOverrides;
  return {
    id: Number(row.id),
    companyId: Number(row.companyId),
    moduleKey: String(row.moduleKey),
    entityKey: String(row.entityKey),
    displayNameAr: String(row.displayNameAr),
    displayNameEn: (row.displayNameEn as string | null) ?? null,
    prefix: String(row.prefix),
    pattern: String(row.pattern),
    padLength: Number(row.padLength),
    resetPolicy: row.resetPolicy as ResetPolicy,
    scopePolicy: row.scopePolicy as ScopePolicy,
    issueTiming: row.issueTiming as IssueTiming,
    manualEditPolicy: row.manualEditPolicy as ManualEditPolicy,
    requiresReasonOnManualEdit: row.requiresReasonOnManualEdit === true,
    lockAfterStatuses: Array.isArray(lockAfter)
      ? (lockAfter as string[])
      : typeof lockAfter === "string"
        ? safeJsonArray(lockAfter)
        : [],
    branchPrefixOverrides: typeof branchOverrides === "object" && branchOverrides !== null && !Array.isArray(branchOverrides)
      ? (branchOverrides as Record<string, string>)
      : typeof branchOverrides === "string"
        ? safeJsonObject(branchOverrides)
        : {},
    isActive: row.isActive !== false,
  };
}

function safeJsonArray(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function safeJsonObject(value: string): Record<string, string> {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

/** Format the final number from `pattern`, substituting the supported
 *  tokens. Unrecognised tokens are left in place — that surfaces a typo
 *  loudly instead of silently producing the wrong shape. */
function formatNumber(
  pattern: string,
  ctx: {
    prefix: string;
    branchCode: string;
    seq: number;
    padLength: number;
    year: number;
    yearShort: number;
    month: string;
    seasonCode: string;
  },
): string {
  return pattern
    .replace(/\{PREFIX\}/g, ctx.prefix)
    .replace(/\{BRANCH\}/g, ctx.branchCode)
    .replace(/\{YYYY\}/g, String(ctx.year))
    .replace(/\{YY\}/g, String(ctx.yearShort).padStart(2, "0"))
    .replace(/\{MM\}/g, ctx.month)
    .replace(/\{SEASON\}/g, ctx.seasonCode)
    .replace(/\{SEQ\}/g, pad(ctx.seq, ctx.padLength));
}

/** Derive the (companyId, branchId, fiscalYear, period, seasonId)
 *  scope tuple that addresses the counter, taking the scheme's
 *  scopePolicy + resetPolicy into account. NULL components mean "this
 *  dimension is shared across counters". */
function deriveCounterScope(
  scheme: NumberingScheme,
  params: IssueParams,
): { branchId: number | null; fiscalYear: number | null; period: string | null; seasonId: number | null } {
  const year = params.fiscalYear ?? currentYear();
  const period = params.period ?? currentPeriod();
  // scopePolicy controls whether branch/season are part of the addressing.
  const branchId = scheme.scopePolicy === "branch" ? (params.branchId ?? null) : null;
  const seasonId = scheme.scopePolicy === "season" ? (params.seasonId ?? null) : null;

  // resetPolicy controls when the counter rolls back to 1.
  let fiscalYear: number | null = null;
  let periodBucket: string | null = null;
  switch (scheme.resetPolicy) {
    case "yearly":
    case "fiscal_year":
      fiscalYear = year;
      break;
    case "monthly":
      fiscalYear = year;
      periodBucket = period;
      break;
    case "seasonal":
      // Counter resets per season; year is irrelevant in this branch.
      // The scope tuple already carries seasonId when scopePolicy=season,
      // so no additional discriminator is needed.
      break;
    case "never":
      break;
  }
  return { branchId, fiscalYear, period: periodBucket, seasonId };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Load a scheme; the canonical lookup is by (companyId, moduleKey, entityKey). */
export async function getScheme(
  companyId: number,
  moduleKey: string,
  entityKey: string,
): Promise<NumberingScheme | null> {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT id, "companyId", "moduleKey", "entityKey", "displayNameAr", "displayNameEn",
            prefix, pattern, "padLength", "resetPolicy", "scopePolicy", "issueTiming",
            "manualEditPolicy", "requiresReasonOnManualEdit", "lockAfterStatuses",
            "branchPrefixOverrides", "isActive"
       FROM numbering_schemes
      WHERE "companyId" = $1 AND "moduleKey" = $2 AND "entityKey" = $3`,
    [companyId, moduleKey, entityKey],
  );
  return row ? mapSchemeRow(row) : null;
}

/** Resolve the prefix for a scheme + branch combination: the scheme's
 *  default prefix unless the scheme carries a per-branch override under
 *  `branchPrefixOverrides[branchId]`. */
function resolvePrefix(scheme: NumberingScheme, branchId: number | null): string {
  if (branchId != null) {
    const override = scheme.branchPrefixOverrides[String(branchId)];
    if (typeof override === "string" && override.trim().length > 0) return override.trim();
  }
  return scheme.prefix;
}

/**
 * Issue a new official number for `(moduleKey, entityKey)`.
 *
 * The entire allocation runs inside a transaction:
 *   1. Resolve (or create) the counter row for the addressed scope.
 *   2. Lock the row with `FOR UPDATE` so concurrent callers serialise.
 *   3. Bump the sequence, format the number, insert the assignment.
 *   4. Write a `numbering_audit_logs` row with action='issue'.
 *
 * On any failure the route receives a thrown error and must abort the
 * document creation — there is no silent fallback. The CI rule in
 * `scripts/src/lint-patterns.mjs` (`direct-numbering-in-route`) blocks
 * routes from re-implementing this allocation.
 */
export async function issueNumber(params: IssueParams): Promise<IssueResult> {
  const scheme = await getScheme(params.companyId, params.moduleKey, params.entityKey);
  if (!scheme) {
    throw new NotFoundError(
      `لا توجد سياسة ترقيم لـ ${params.moduleKey}.${params.entityKey} في الشركة #${params.companyId}. أنشئ السياسة من إعدادات الترقيم قبل المتابعة.`,
    );
  }
  if (!scheme.isActive) {
    throw new ValidationError(
      `سياسة ترقيم ${scheme.displayNameAr} متوقفة — لا يمكن إصدار رقم جديد حتى يتم تفعيلها`,
    );
  }
  if (scheme.scopePolicy === "season" && (params.seasonId == null)) {
    throw new ValidationError(
      `سياسة ${scheme.displayNameAr} مخصصة لمواسم — يجب تمرير seasonId قبل إصدار الرقم`,
    );
  }

  const scope = deriveCounterScope(scheme, params);
  const year = params.fiscalYear ?? currentYear();
  const month = (params.period ?? currentPeriod()).slice(5, 7); // "YYYY-MM" → "MM"
  const branchCode = await resolveBranchCode(scope.branchId);
  const seasonCode = scope.seasonId != null ? String(scope.seasonId) : "";

  return withTransaction(async (client) => {
    // Step 1 — find or create the counter row, then lock it.
    // The `ON CONFLICT … DO UPDATE SET "updatedAt" = "updatedAt"` no-op
    // is the postgres idiom for "give me the row whether it existed
    // before or not"; we then `SELECT … FOR UPDATE` to serialise. A
    // simple `SELECT … FOR UPDATE` first would return zero rows on the
    // very first issue and a separate INSERT would race against itself.
    await client.query(
      `INSERT INTO numbering_counters (
         "schemeId","companyId","branchId","moduleKey","entityKey",
         "fiscalYear",period,"seasonId","lastNumber","nextNumber"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,1)
       ON CONFLICT (
         "schemeId",
         COALESCE("branchId", 0),
         COALESCE("fiscalYear", 0),
         COALESCE(period, ''),
         COALESCE("seasonId", 0)
       ) DO UPDATE SET "updatedAt" = numbering_counters."updatedAt"`,
      [
        scheme.id, params.companyId, scope.branchId,
        scheme.moduleKey, scheme.entityKey,
        scope.fiscalYear, scope.period, scope.seasonId,
      ],
    );

    const { rows: counterRows } = await client.query(
      `SELECT id, "lastNumber", "nextNumber", "lockedAt"
         FROM numbering_counters
        WHERE "schemeId" = $1
          AND COALESCE("branchId", 0) = COALESCE($2::int, 0)
          AND COALESCE("fiscalYear", 0) = COALESCE($3::int, 0)
          AND COALESCE(period, '')      = COALESCE($4::text, '')
          AND COALESCE("seasonId", 0)   = COALESCE($5::int, 0)
        FOR UPDATE`,
      [scheme.id, scope.branchId, scope.fiscalYear, scope.period, scope.seasonId],
    );
    const counter = counterRows[0] as { id: number; lastNumber: string | number; nextNumber: string | number; lockedAt: string | null } | undefined;
    if (!counter) {
      // Should be unreachable — the upsert above guarantees the row.
      throw new Error("numberingService: counter row vanished between upsert and lock");
    }
    if (counter.lockedAt) {
      throw new ForbiddenError(
        `عداد الترقيم لـ ${scheme.displayNameAr} مقفول منذ ${counter.lockedAt} — لا يمكن إصدار أرقام جديدة حتى يفك المسؤول القفل`,
      );
    }

    // Step 2 — allocate the next sequence value and update the counter.
    const seq = Number(counter.nextNumber);
    await client.query(
      `UPDATE numbering_counters
          SET "lastNumber" = $1, "nextNumber" = $2, "updatedAt" = NOW()
        WHERE id = $3`,
      [seq, seq + 1, counter.id],
    );

    // Step 3 — format and persist the assignment row.
    const prefix = resolvePrefix(scheme, scope.branchId);
    const number = formatNumber(scheme.pattern, {
      prefix,
      branchCode,
      seq,
      padLength: scheme.padLength,
      year,
      yearShort: year % 100,
      month,
      seasonCode,
    });

    const assignmentStatus: AssignmentStatus = params.reserveOnly ? "reserved" : "assigned";
    const assignedAt = params.reserveOnly ? null : new Date().toISOString();

    let assignmentRow: { id: number };
    try {
      const { rows } = await client.query(
        `INSERT INTO numbering_assignments (
           "schemeId","counterId","companyId","branchId",
           "moduleKey","entityKey","entityTable","entityId",
           number,"sequenceValue",status,"issuedBy","issuedAt","assignedAt",metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,$14)
         RETURNING id`,
        [
          scheme.id, counter.id, params.companyId, params.branchId,
          scheme.moduleKey, scheme.entityKey,
          params.entityTable, params.entityId ?? null,
          number, seq, assignmentStatus,
          params.actorId, assignedAt,
          JSON.stringify(params.metadata ?? {}),
        ],
      );
      assignmentRow = rows[0];
    } catch (err) {
      // A duplicate (companyId, moduleKey, entityKey, number) means the
      // counter and the assignments table drifted apart — usually a
      // historical row that ate the same `seq`. The route MUST not
      // proceed silently; bubble a clear conflict so the caller
      // re-issues (the transaction will roll back and the counter
      // re-increments on retry).
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr?.code === "23505") {
        throw new ConflictError(
          `الرقم ${number} موجود مسبقًا في numbering_assignments — أعد المحاولة لإصدار رقم جديد`,
        );
      }
      throw err;
    }

    // Step 4 — audit log (issue).
    await client.query(
      `INSERT INTO numbering_audit_logs (
         "companyId","branchId","actorId",action,"schemeId","assignmentId",
         "entityTable","entityId","after"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        params.companyId, params.branchId, params.actorId,
        params.reserveOnly ? "reserve" : "issue",
        scheme.id, assignmentRow.id,
        params.entityTable, params.entityId ?? null,
        JSON.stringify({ number, sequenceValue: seq, status: assignmentStatus, prefix, branchCode }),
      ],
    );

    return {
      number,
      sequenceValue: seq,
      schemeId: scheme.id,
      counterId: counter.id,
      assignmentId: assignmentRow.id,
      status: assignmentStatus,
    };
  });
}

/**
 * Reserve a number for a draft document. Returns the same shape as
 * `issueNumber` but with `status = 'reserved'`. Call
 * `assignReservedNumber` once the entity row exists to flip it to
 * `assigned`.
 */
export function reserveNumber(params: Omit<IssueParams, "reserveOnly">): Promise<IssueResult> {
  return issueNumber({ ...params, reserveOnly: true });
}

/**
 * Flip a reserved assignment to `assigned` and link it to the entity row.
 * Idempotent — calling twice with the same `entityId` is a no-op.
 */
export async function assignReservedNumber(params: {
  companyId: number;
  assignmentId: number;
  entityId: number;
  actorId: number | null;
}): Promise<void> {
  const [existing] = await rawQuery<{ status: AssignmentStatus; entityId: number | null }>(
    `SELECT status, "entityId" FROM numbering_assignments
      WHERE id = $1 AND "companyId" = $2`,
    [params.assignmentId, params.companyId],
  );
  if (!existing) {
    throw new NotFoundError(`لا يوجد تخصيص رقم بمعرف ${params.assignmentId}`);
  }
  if (existing.status === "assigned" && existing.entityId === params.entityId) {
    return; // idempotent.
  }
  if (existing.status !== "reserved") {
    throw new ConflictError(
      `لا يمكن تثبيت تخصيص الرقم — حالته الحالية "${existing.status}". مسموح فقط من حالة "reserved".`,
    );
  }
  await rawExecute(
    `UPDATE numbering_assignments
        SET status = 'assigned', "entityId" = $1, "assignedAt" = NOW()
      WHERE id = $2 AND "companyId" = $3 AND status = 'reserved'`,
    [params.entityId, params.assignmentId, params.companyId],
  );
  await rawExecute(
    `INSERT INTO numbering_audit_logs (
       "companyId","actorId",action,"assignmentId","after"
     ) VALUES ($1,$2,'assign',$3,$4)`,
    [params.companyId, params.actorId, params.assignmentId, JSON.stringify({ entityId: params.entityId })],
  );
}

/**
 * Preview the next number a scheme would emit without consuming the
 * counter. Useful for UI hints ("سيكون الرقم: …"). Calling this and
 * then issuing concurrently can produce a different result — preview
 * is best-effort, not a reservation.
 */
export async function previewNextNumber(params: {
  companyId: number;
  branchId: number | null;
  moduleKey: string;
  entityKey: string;
  fiscalYear?: number;
  period?: string;
  seasonId?: number | null;
}): Promise<{ number: string; sequenceValue: number; schemeId: number } | null> {
  const scheme = await getScheme(params.companyId, params.moduleKey, params.entityKey);
  if (!scheme || !scheme.isActive) return null;

  const scope = deriveCounterScope(scheme, {
    ...params,
    entityTable: "(preview)",
    actorId: null,
  });
  const [counter] = await rawQuery<{ nextNumber: string | number }>(
    `SELECT "nextNumber" FROM numbering_counters
      WHERE "schemeId" = $1
        AND COALESCE("branchId", 0) = COALESCE($2::int, 0)
        AND COALESCE("fiscalYear", 0) = COALESCE($3::int, 0)
        AND COALESCE(period, '')      = COALESCE($4::text, '')
        AND COALESCE("seasonId", 0)   = COALESCE($5::int, 0)`,
    [scheme.id, scope.branchId, scope.fiscalYear, scope.period, scope.seasonId],
  );

  const seq = counter ? Number(counter.nextNumber) : 1;
  const year = params.fiscalYear ?? currentYear();
  const month = (params.period ?? currentPeriod()).slice(5, 7);
  const branchCode = await resolveBranchCode(scope.branchId);
  const seasonCode = scope.seasonId != null ? String(scope.seasonId) : "";
  const number = formatNumber(scheme.pattern, {
    prefix: resolvePrefix(scheme, scope.branchId),
    branchCode,
    seq,
    padLength: scheme.padLength,
    year,
    yearShort: year % 100,
    month,
    seasonCode,
  });
  return { number, sequenceValue: seq, schemeId: scheme.id };
}

/**
 * Look up the entity's current `status` from its native table and
 * decide whether the scheme's `lockAfterStatuses` policy blocks the
 * caller from mutating the assigned number. Returns the status string
 * so the caller can surface it in the error message.
 *
 * This is the missing link between the numbering center and the
 * lifecycle engine — `lockAfterStatuses` was declared on the scheme
 * but nobody enforced it. Now overrideNumber + voidNumber both gate
 * on this check, and the result is appended to the audit row.
 */
/**
 * Status-column candidates. Different executive tables encode their
 * lifecycle on different column names:
 *   - most use `status` (text)
 *   - employee_contracts uses `approvalStatus` (the `status` column
 *     is generic 'draft'/'active'/'terminated' but the approval gate
 *     lives in approvalStatus)
 *   - some entities have both — we check the most specific first
 *     so a "pending_approval" approval state wins over a generic
 *     "draft" status when both exist.
 *
 * Order matters. Add new column names at the front if they're more
 * specific to a lifecycle gate, at the back if they're a fallback.
 */
const STATUS_COLUMN_CANDIDATES = [
  "approvalStatus",
  "status",
  "state",
  "currentStatus",
  "documentStatus",
] as const;

export async function readEntityStatus(params: {
  entityTable: string;
  entityId: number | null;
}): Promise<string | null> {
  if (params.entityId == null) return null;
  // Identifier sanitisation — entityTable is whitelisted in
  // numbering_schemes.defaultEntityTable, but we still validate the
  // shape because the assignment row's entityTable column is free-form.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(params.entityTable)) return null;

  // information_schema.columns is the cheapest way to discover which
  // status-like column this table actually owns — without it we'd
  // either silently fall back to "no status" (lawyer's point #7:
  // approvalStatus tables aren't covered) or burn 5 round-trips per
  // gate check trying every candidate. One small query, one round-
  // trip, exhaustive coverage.
  const cols = await rawQuery<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
        AND column_name = ANY($2::text[])`,
    [params.entityTable, STATUS_COLUMN_CANDIDATES as unknown as string[]],
  ).catch(() => [] as { column_name: string }[]);

  if (cols.length === 0) return null;

  // Pick the most-specific column the table actually has, in the
  // order declared above (approvalStatus beats status beats state…).
  const present = new Set(cols.map((c) => c.column_name));
  const pick = STATUS_COLUMN_CANDIDATES.find((c) => present.has(c));
  if (!pick) return null;

  try {
    const rows = await rawQuery<{ value: string | null }>(
      `SELECT "${pick}"::text AS value FROM "${params.entityTable}" WHERE id = $1 LIMIT 1`,
      [params.entityId],
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

function lockAfterApplies(
  scheme: NumberingScheme,
  entityStatus: string | null,
): boolean {
  if (!entityStatus) return false;
  return scheme.lockAfterStatuses.includes(entityStatus);
}

/**
 * Validate that a user-supplied number can be accepted for `(scheme,
 * entity)`. Enforces the scheme's `manualEditPolicy`, the
 * `lockAfterStatuses` lifecycle gate, and uniqueness. Throws on
 * rejection so callers can let the error bubble.
 */
export async function validateManualNumber(params: {
  companyId: number;
  moduleKey: string;
  entityKey: string;
  number: string;
  entityTable: string;
  entityId?: number | null;
  /** Caller has the privileged numbering.override permission (used when policy = privileged). */
  isPrivileged: boolean;
  /** Document is still a draft (used when policy = draft_only). */
  isDraft: boolean;
  /** True when this is a one-time legacy import. */
  isLegacyImport?: boolean;
}): Promise<void> {
  const scheme = await getScheme(params.companyId, params.moduleKey, params.entityKey);
  if (!scheme) {
    throw new NotFoundError(
      `لا توجد سياسة ترقيم لـ ${params.moduleKey}.${params.entityKey} في الشركة #${params.companyId}`,
    );
  }
  const policy = scheme.manualEditPolicy;
  if (policy === "disabled") {
    throw new ForbiddenError(`لا يسمح بتعديل رقم ${scheme.displayNameAr} يدويًا`);
  }
  if (policy === "draft_only" && !params.isDraft) {
    throw new ForbiddenError(
      `يسمح فقط بتعديل رقم ${scheme.displayNameAr} قبل تقديم/اعتماد المستند`,
    );
  }
  if (policy === "privileged" && !params.isPrivileged) {
    throw new ForbiddenError(
      `تعديل رقم ${scheme.displayNameAr} يحتاج صلاحية numbering.override`,
    );
  }
  if (policy === "legacy_import_only" && !params.isLegacyImport) {
    throw new ForbiddenError(
      `لا يسمح بتعديل رقم ${scheme.displayNameAr} يدويًا إلا أثناء استيراد بيانات قديمة`,
    );
  }
  // Lifecycle gate — if the entity has reached a "locked" status (e.g.
  // approved / sent / posted / closed), block the override regardless
  // of manualEditPolicy. This is the missing link the lawyer flagged:
  // the scheme declares the locked-after states, but until this check
  // landed nobody enforced them.
  const status = await readEntityStatus({
    entityTable: params.entityTable,
    entityId: params.entityId ?? null,
  });
  if (lockAfterApplies(scheme, status)) {
    throw new ForbiddenError(
      `لا يمكن تعديل رقم ${scheme.displayNameAr} بعد دخوله حالة "${status}" — هذه الحالة مقفلة بموجب سياسة الترقيم`,
    );
  }
  if (!params.number.trim()) {
    throw new ValidationError("الرقم اليدوي فارغ");
  }
  // Uniqueness: same (company, module, entity, number) cannot exist.
  const [conflict] = await rawQuery<{ id: number; entityId: number | null }>(
    `SELECT id, "entityId" FROM numbering_assignments
      WHERE "companyId" = $1 AND "moduleKey" = $2 AND "entityKey" = $3
        AND number = $4 AND status IN ('assigned','reserved')
        AND ("entityId" IS DISTINCT FROM $5 OR "entityTable" IS DISTINCT FROM $6)`,
    [params.companyId, params.moduleKey, params.entityKey, params.number.trim(), params.entityId ?? null, params.entityTable],
  );
  if (conflict) {
    throw new ConflictError(`الرقم ${params.number} مستخدم مسبقًا — لا يمكن تكراره`);
  }
}

/**
 * Override an existing assignment with a manually-entered number. Used
 * for corrections of typos / legacy data imports. Writes a full
 * before/after audit row.
 */
export async function overrideNumber(params: {
  companyId: number;
  branchId: number | null;
  assignmentId: number;
  newNumber: string;
  actorId: number | null;
  reason: string;
  isPrivileged: boolean;
  isDraft: boolean;
  isLegacyImport?: boolean;
}): Promise<void> {
  if (!params.reason || params.reason.trim().length < 3) {
    throw new ValidationError("سبب التعديل اليدوي إلزامي ولا يقل عن 3 أحرف");
  }
  const [existing] = await rawQuery<{
    moduleKey: string; entityKey: string; entityTable: string;
    entityId: number | null; number: string; status: AssignmentStatus;
  }>(
    `SELECT "moduleKey","entityKey","entityTable","entityId",number,status
       FROM numbering_assignments
      WHERE id = $1 AND "companyId" = $2`,
    [params.assignmentId, params.companyId],
  );
  if (!existing) {
    throw new NotFoundError(`لا يوجد تخصيص رقم بمعرف ${params.assignmentId}`);
  }
  if (existing.status !== "assigned" && existing.status !== "reserved") {
    throw new ConflictError(
      `لا يمكن تعديل تخصيص حالته "${existing.status}" — فقط المخصصة أو المحجوزة`,
    );
  }

  await validateManualNumber({
    companyId: params.companyId,
    moduleKey: existing.moduleKey,
    entityKey: existing.entityKey,
    number: params.newNumber,
    entityTable: existing.entityTable,
    entityId: existing.entityId,
    isPrivileged: params.isPrivileged,
    isDraft: params.isDraft,
    isLegacyImport: params.isLegacyImport,
  });

  await withTransaction(async (client) => {
    const newNumber = params.newNumber.trim();
    await client.query(
      `UPDATE numbering_assignments
          SET number = $1, metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb
        WHERE id = $3 AND "companyId" = $4`,
      [
        newNumber,
        JSON.stringify({
          overrides: [
            { previousNumber: existing.number, newNumber, reason: params.reason, by: params.actorId, at: new Date().toISOString() },
          ],
        }),
        params.assignmentId, params.companyId,
      ],
    );
    await client.query(
      `INSERT INTO numbering_audit_logs (
         "companyId","branchId","actorId",action,"assignmentId",
         "entityTable","entityId","before","after",reason
       ) VALUES ($1,$2,$3,'override',$4,$5,$6,$7,$8,$9)`,
      [
        params.companyId, params.branchId, params.actorId, params.assignmentId,
        existing.entityTable, existing.entityId,
        JSON.stringify({ number: existing.number }),
        JSON.stringify({ number: newNumber }),
        params.reason,
      ],
    );
  });

  logger.info({
    assignmentId: params.assignmentId,
    actorId: params.actorId,
    previous: existing.number,
    next: params.newNumber,
  }, "[numbering] override applied");
}

/**
 * Void a previously-issued number. The counter is NOT decremented —
 * voiding preserves the original sequence value so audits stay
 * consistent. The number is marked `voided` and the entity link cleared.
 */
export async function voidNumber(params: {
  companyId: number;
  branchId: number | null;
  assignmentId: number;
  actorId: number | null;
  reason: string;
}): Promise<void> {
  if (!params.reason || params.reason.trim().length < 3) {
    throw new ValidationError("سبب الإلغاء إلزامي ولا يقل عن 3 أحرف");
  }
  const [existing] = await rawQuery<{ status: AssignmentStatus; number: string; entityTable: string; entityId: number | null; moduleKey: string; entityKey: string }>(
    `SELECT status, number, "entityTable", "entityId", "moduleKey", "entityKey"
       FROM numbering_assignments
      WHERE id = $1 AND "companyId" = $2`,
    [params.assignmentId, params.companyId],
  );
  if (!existing) {
    throw new NotFoundError(`لا يوجد تخصيص رقم بمعرف ${params.assignmentId}`);
  }
  if (existing.status === "voided" || existing.status === "cancelled") {
    return; // already void.
  }
  // Lifecycle gate — voiding a number after the entity is in a
  // locked state (posted invoice, sent letter, etc) destroys audit
  // trail. Refuse unless the lockAfterStatuses policy permits it.
  const scheme = await getScheme(params.companyId, existing.moduleKey, existing.entityKey);
  if (scheme) {
    const status = await readEntityStatus({
      entityTable: existing.entityTable,
      entityId: existing.entityId,
    });
    if (lockAfterApplies(scheme, status)) {
      throw new ForbiddenError(
        `لا يمكن إلغاء رقم ${scheme.displayNameAr} بعد دخوله حالة "${status}" — استخدم إشعار دائن/مدين لعكس الأثر`,
      );
    }
  }
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE numbering_assignments
          SET status = 'voided', "voidReason" = $1
        WHERE id = $2 AND "companyId" = $3`,
      [params.reason, params.assignmentId, params.companyId],
    );
    await client.query(
      `INSERT INTO numbering_audit_logs (
         "companyId","branchId","actorId",action,"assignmentId",
         "entityTable","entityId","before","after",reason
       ) VALUES ($1,$2,$3,'void',$4,$5,$6,$7,$8,$9)`,
      [
        params.companyId, params.branchId, params.actorId, params.assignmentId,
        existing.entityTable, existing.entityId,
        JSON.stringify({ status: existing.status, number: existing.number }),
        JSON.stringify({ status: "voided" }),
        params.reason,
      ],
    );
  });
}

/**
 * Confirm that an entity row carries an actual numbering_assignments row.
 * Routes can call this just before COMMIT to guarantee that no document
 * landed in the executive tables without an audited number.
 *
 * The lookup is best-effort: when the entity table is one we haven't
 * mapped yet (e.g. an old import), we log a warning and return — we
 * don't want to break legitimate inserts during the migration window.
 */
export async function assertNumberingAssignment(params: {
  companyId: number;
  entityTable: string;
  entityId: number;
  expectedNumber: string;
}): Promise<void> {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT id FROM numbering_assignments
      WHERE "companyId" = $1 AND "entityTable" = $2 AND "entityId" = $3
        AND number = $4 AND status IN ('assigned','reserved')`,
    [params.companyId, params.entityTable, params.entityId, params.expectedNumber],
  );
  if (!row) {
    throw new ConflictError(
      `الرقم ${params.expectedNumber} ليس له تخصيص مسجل في numbering_assignments — لا يجوز إدخال المستند`,
    );
  }
}

/** Reset a counter to a chosen value (typically 0/1 at fiscal year end).
 *  Only allowed when no assigned rows exist for the counter's period or
 *  the caller carries the explicit `numbering.reset_counter` permission
 *  (enforced by the route layer; here we just verify pre-conditions). */
export async function resetCounter(params: {
  companyId: number;
  counterId: number;
  newValue: number;
  reason: string;
  actorId: number | null;
  force?: boolean;
}): Promise<void> {
  if (params.newValue < 0 || !Number.isInteger(params.newValue)) {
    throw new ValidationError("القيمة الجديدة للعداد يجب أن تكون عددًا صحيحًا غير سالب");
  }
  if (!params.reason || params.reason.trim().length < 3) {
    throw new ValidationError("سبب تصفير العداد إلزامي");
  }
  const [counter] = await rawQuery<{
    id: number; companyId: number; schemeId: number;
    fiscalYear: number | null; period: string | null; seasonId: number | null;
    branchId: number | null; lastNumber: number; nextNumber: number;
  }>(
    `SELECT id, "companyId", "schemeId", "fiscalYear", period, "seasonId",
            "branchId", "lastNumber"::int AS "lastNumber", "nextNumber"::int AS "nextNumber"
       FROM numbering_counters
      WHERE id = $1 AND "companyId" = $2`,
    [params.counterId, params.companyId],
  );
  if (!counter) throw new NotFoundError(`لا يوجد عداد بمعرف ${params.counterId}`);

  if (!params.force) {
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM numbering_assignments
        WHERE "counterId" = $1 AND status IN ('assigned','reserved')`,
      [counter.id],
    );
    if (Number(count) > 0) {
      throw new ConflictError(
        `العداد رقم ${counter.id} أصدر أرقامًا فعليّة — لا يمكن تصفيره إلا بعلامة force وقرار خاص`,
      );
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE numbering_counters
          SET "lastNumber" = GREATEST($1 - 1, 0), "nextNumber" = $1, "updatedAt" = NOW()
        WHERE id = $2`,
      [params.newValue, counter.id],
    );
    await client.query(
      `INSERT INTO numbering_audit_logs (
         "companyId","branchId","actorId",action,"schemeId","before","after",reason
       ) VALUES ($1,$2,$3,'reset_counter',$4,$5,$6,$7)`,
      [
        params.companyId, counter.branchId, params.actorId, counter.schemeId,
        JSON.stringify({ counterId: counter.id, lastNumber: counter.lastNumber, nextNumber: counter.nextNumber }),
        JSON.stringify({ counterId: counter.id, newValue: params.newValue, force: !!params.force }),
        params.reason,
      ],
    );
  });
}

/**
 * Lock a counter — bars further allocations until unlocked. Use for
 * fiscal-year close / branch wind-down. `lockedAt` is set; clear it
 * with `unlockCounter`.
 */
export async function lockCounter(params: {
  companyId: number;
  counterId: number;
  actorId: number | null;
  reason: string;
}): Promise<void> {
  if (!params.reason || params.reason.trim().length < 3) {
    throw new ValidationError("سبب القفل إلزامي");
  }
  const result = await rawExecute(
    `UPDATE numbering_counters SET "lockedAt" = NOW()
      WHERE id = $1 AND "companyId" = $2 AND "lockedAt" IS NULL`,
    [params.counterId, params.companyId],
  );
  if (result.affectedRows === 0) {
    throw new NotFoundError(`العداد ${params.counterId} غير موجود أو مقفول مسبقًا`);
  }
  await rawExecute(
    `INSERT INTO numbering_audit_logs (
       "companyId","actorId",action,"after",reason
     ) VALUES ($1,$2,'lock_counter',$3,$4)`,
    [params.companyId, params.actorId, JSON.stringify({ counterId: params.counterId }), params.reason],
  );
}

export async function unlockCounter(params: {
  companyId: number;
  counterId: number;
  actorId: number | null;
  reason: string;
}): Promise<void> {
  const result = await rawExecute(
    `UPDATE numbering_counters SET "lockedAt" = NULL
      WHERE id = $1 AND "companyId" = $2 AND "lockedAt" IS NOT NULL`,
    [params.counterId, params.companyId],
  );
  if (result.affectedRows === 0) {
    throw new NotFoundError(`العداد ${params.counterId} غير موجود أو غير مقفول`);
  }
  await rawExecute(
    `INSERT INTO numbering_audit_logs (
       "companyId","actorId",action,"after",reason
     ) VALUES ($1,$2,'unlock_counter',$3,$4)`,
    [params.companyId, params.actorId, JSON.stringify({ counterId: params.counterId }), params.reason],
  );
}

// Re-export the date helpers for callers that need to align with the
// service's notion of "current period".
export { currentYear, currentPeriod, currentDateInTz };
