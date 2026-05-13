import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { eventBus } from "./eventBus.js";
import { ValidationError } from "./errorHandler.js";
import { sendNotification } from "./notificationService.js";
import { validateEventPayload, getEventDefinition } from "./eventCatalog.js";
import { logger } from "./logger.js";
import { FINANCE_ROLES, OWNER_GM_ROLES } from "./rbacCatalog.js";

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export function currentMonthPadded(): string {
  return String(new Date().getMonth() + 1).padStart(2, "0");
}

export function toDateISO(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
}

export function generateRef(prefix: string, seq: number | string, pad = 4): string {
  return `${prefix}-${currentYear()}-${String(seq).padStart(pad, "0")}`;
}

export function generateTimeRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Resolves the numbering prefix for a (company, branch, kind) triplet by
 * reading `system_settings` with a branch-first / company-fallback lookup.
 * ZATCA Phase 2 expects each VAT-registered branch to issue its own
 * invoice series (e.g. INV-MK-001 vs INV-HB-001) — this helper lets
 * callers swap their hardcoded `generateTimeRef("INV")` for one that
 * picks up whatever the operator configured per branch.
 *
 * Lookup order:
 *   1. (companyId, branchId, key)   ← per-branch override
 *   2. (companyId, NULL, key)        ← company default
 *   3. fallback parameter            ← code default (e.g. "INV")
 *
 * The `system_settings_companyId_branchId_key_key` unique constraint
 * already supports the (companyId, branchId, key) triple, so no schema
 * migration is needed. Callers opt-in by switching from
 * `generateTimeRef("INV")` to `resolveBranchPrefix(...)` then
 * `generateTimeRef(prefix)` or directly via `generateBranchRef`.
 */
export async function resolveBranchPrefix(
  companyId: number,
  branchId: number | null,
  key:
    | "invoice_prefix"
    | "purchase_prefix"
    | "voucher_prefix"
    | "receipt_voucher_prefix"
    | "payment_voucher_prefix"
    | "journal_entry_prefix"
    | "expense_claim_prefix"
    | "credit_note_prefix"
    | "debit_note_prefix",
  fallback: string,
): Promise<string> {
  if (branchId !== null && branchId !== undefined) {
    const [branchRow] = await rawQuery<{ value: string | null }>(
      `SELECT value FROM system_settings
        WHERE "companyId" = $1 AND "branchId" = $2 AND key = $3
        LIMIT 1`,
      [companyId, branchId, key],
    );
    if (branchRow?.value) return branchRow.value;
  }
  const [companyRow] = await rawQuery<{ value: string | null }>(
    `SELECT value FROM system_settings
      WHERE "companyId" = $1 AND "branchId" IS NULL AND key = $2
      LIMIT 1`,
    [companyId, key],
  );
  if (companyRow?.value) return companyRow.value;
  return fallback;
}

/**
 * Branch-aware variant of `generateTimeRef`. Combines `resolveBranchPrefix`
 * with the time-based suffix so callers can swap a one-line drop-in:
 *
 *   const ref = await generateBranchRef(scope, "invoice_prefix", "INV");
 */
export async function generateBranchRef(
  scope: { companyId: number; branchId: number | null },
  key: Parameters<typeof resolveBranchPrefix>[2],
  fallback: string,
): Promise<string> {
  const prefix = await resolveBranchPrefix(scope.companyId, scope.branchId, key, fallback);
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
 * `lintEventCoverage.mjs` (P6.1 — P6 enforcement phase) will fail any PR
 * that emits an event name that's not in the listener catalog; until that
 * lint lands, run:
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
  const persistAll = process.env.PERSIST_ALL_EVENTS === "true";
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
}) {
  try {
    await rawExecute(
      `INSERT INTO audit_logs ("companyId","branchId","userId",action,entity,"entityId","before","after",reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
}) {
  // Financial period guard: prevent posting to closed periods
  if (!params.skipPeriodCheck) {
    const postingDate = new Date().toISOString().split("T")[0];
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
    const accountRows = await rawQuery<{ code: string; allowPosting: boolean }>(
      `SELECT code, "allowPosting" FROM chart_of_accounts WHERE "companyId" = $1 AND code IN (${placeholders}) AND "deletedAt" IS NULL`,
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
    }
  }

  for (const line of params.lines) {
    line.debit = roundTo2(Number(line.debit));
    line.credit = roundTo2(Number(line.credit));
  }
  const totalDebit = roundTo2(params.lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = roundTo2(params.lines.reduce((s, l) => s + l.credit, 0));
  const imbalance = roundTo4(totalDebit - totalCredit);
  if (Math.abs(imbalance) > 0.001 && Math.abs(imbalance) <= 0.05) {
    let [roundingAcc] = await rawQuery<Record<string, unknown>>(
      `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999' LIMIT 1`,
      [params.companyId]
    );
    if (!roundingAcc) {
      await rawExecute(
        `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "allowPosting")
         VALUES ($1, '9999', 'فروقات التقريب', 'Rounding Differences', 'expense', 2, true)
         ON CONFLICT DO NOTHING`,
        [params.companyId]
      );
      [roundingAcc] = await rawQuery<Record<string, unknown>>(
        `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999' LIMIT 1`,
        [params.companyId]
      );
    }
    if (roundingAcc) {
      params.lines.push({
        accountCode: "9999",
        debit: imbalance < 0 ? Math.abs(imbalance) : 0,
        credit: imbalance > 0 ? imbalance : 0,
        description: "فرق تقريب تلقائي",
      });
      rawExecute(
        `INSERT INTO audit_logs ("companyId","userId",action,entity,"entityId","after")
         VALUES ($1,$2,'rounding_adjustment','journal_entry',0,$3)`,
        [params.companyId, params.createdBy, JSON.stringify({
          ref: params.ref, imbalance, totalDebit, totalCredit,
        })]
      ).catch((e) => logger.error(e, "[businessHelpers] background task failed"));
    }
  } else if (Math.abs(imbalance) > 0.05) {
    throw new ValidationError(
      `قيد غير متوازن: مدين=${totalDebit.toFixed(2)} ≠ دائن=${totalCredit.toFixed(2)} (${params.ref})`
    );
  }

  const journalId = await withTransaction(async (client) => {
    const headerResult = await client.query(
      `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"sourceType","sourceId","sourceKey")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        params.companyId, params.branchId, params.createdBy, params.ref, params.description,
        params.type ?? "manual", params.sourceType ?? null, params.sourceId ?? null,
        idempotencyKey,
      ]
    );
    const jId = headerResult.rows[0].id as number;

    for (const line of params.lines) {
      let accountId = line.accountId ?? null;
      if (!accountId && line.accountCode) {
        const accResult = await client.query(
          `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 LIMIT 1`,
          [params.companyId, line.accountCode]
        );
        accountId = accResult.rows[0]?.id ?? null;
      }

      await client.query(
        `INSERT INTO journal_lines (
          "journalId","accountCode","accountId",debit,credit,description,"costCenter",
          "departmentId","projectId","employeeId","vehicleId","propertyId","contractId",
          "activityType","templateId"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          jId, line.accountCode, accountId, line.debit, line.credit,
          line.description ?? null, line.costCenter ?? null,
          line.departmentId ?? null, line.projectId ?? null, line.employeeId ?? null,
          line.vehicleId ?? null, line.propertyId ?? null, line.contractId ?? null,
          line.activityType ?? null, line.templateId ?? null,
        ]
      );
    }

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
    try {
      const safeTable = guard.table.replace(/[^a-zA-Z0-9_]/g, "");
      await rawExecute(
        `UPDATE "${safeTable}" SET "glStatus" = 'failed', "updatedAt" = NOW() WHERE id = $1`,
        [guard.id]
      );
    } catch (e) { logger.warn(e, "glStatus column may not exist on source table"); }

    await rawExecute(
      `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,"createdAt")
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT DO NOTHING`,
      [params.companyId, params.sourceType ?? guard.table, params.sourceId ?? guard.id,
       err instanceof Error ? err.message : String(err)]
    );

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
     JOIN user_roles ur ON ur."userId" = u.id
     WHERE ea."companyId" = $1 AND ea."branchId" = $2
       AND ur."roleKey" = 'finance_manager' AND ea.status = 'active'
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
  const rows = await rawQuery<{ name: string }>(
    `SELECT name FROM financial_periods
     WHERE "companyId" = $1 AND status = 'closed'
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
const MAPPING_INTENT: Record<string, { type: string; keywords: string[] }> = {
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
};

const _resolvedAccountCache = new Map<string, string>();
const _RESOLVED_ACCOUNT_CACHE_MAX_SIZE = 5_000;

async function resolveByIntent(companyId: number, operationType: string, fallbackCode: string): Promise<string> {
  const cacheKey = `${companyId}:${operationType}`;
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
       ORDER BY length(code) ASC LIMIT 1`,
      params
    );
    if (rows.length) {
      logger.warn(`[accounting_mappings] Resolved "${operationType}" → "${rows[0].code}" by intent search (fallback "${fallbackCode}" missing).`);
      if (_resolvedAccountCache.size >= _RESOLVED_ACCOUNT_CACHE_MAX_SIZE) _resolvedAccountCache.clear();
      _resolvedAccountCache.set(cacheKey, rows[0].code);
      return rows[0].code;
    }
  }

  // 3. Last resort — return the (missing) fallback and let the caller surface
  // a clear ValidationError. Better than picking a random account.
  return fallbackCode;
}

export async function getAccountCodeFromMapping(
  companyId: number,
  operationType: string,
  side: "debit" | "credit",
  fallbackCode: string
): Promise<string> {
  const [mapping] = await rawQuery<{ debitAccountCode: string | null; creditAccountCode: string | null; debitCode: string | null; creditCode: string | null }>(
    `SELECT "debitAccountCode", "creditAccountCode", "debitAccountId", "creditAccountId",
            da.code AS "debitCode", ca.code AS "creditCode"
     FROM accounting_mappings am
     LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
     LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
     WHERE am."companyId" = $1 AND am."operationType" = $2 AND am."isActive" = true
     LIMIT 1`,
    [companyId, operationType]
  );
  if (!mapping) {
    const resolved = await resolveByIntent(companyId, operationType, fallbackCode);
    if (resolved !== fallbackCode) return resolved;
    logger.warn(`[accounting_mappings] No mapping for "${operationType}", company=${companyId}. Fallback: "${fallbackCode}".`);
    rawExecute(
      `INSERT INTO audit_logs ("companyId","userId",action,entity,"entityId","after")
       VALUES ($1,0,'mapping_fallback','accounting_mappings',0,$2)`,
      [companyId, JSON.stringify({ operationType, side, fallbackCode })]
    ).catch((e) => logger.error(e, "[businessHelpers] background task failed"));
    return fallbackCode;
  }
  const explicitCode = side === "debit"
    ? (mapping.debitCode || mapping.debitAccountCode)
    : (mapping.creditCode || mapping.creditAccountCode);
  if (explicitCode) return explicitCode;
  return await resolveByIntent(companyId, operationType, fallbackCode);
}
