import { rawQuery, rawExecute } from "./rawdb.js";
import { eventBus } from "./eventBus.js";
import { ValidationError } from "./errorHandler.js";

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    await rawExecute(
      `INSERT INTO notifications ("companyId","assignmentId",type,title,body,priority,"refType","refId","actionUrl","isRead","requiresAck")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10)`,
      [
        params.companyId,
        params.assignmentId,
        params.type,
        params.title,
        params.body,
        params.priority ?? "normal",
        params.refType ?? null,
        params.refId ?? null,
        params.actionUrl ?? null,
        params.requiresAck ?? false,
      ]
    );
  } catch (err) {
    console.error("createNotification error:", err);
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
  try {
    // NOTE: The previous implementation wrote to event_logs here. That
    // write is now done by `logEvent` inside the listener in
    // eventListeners.ts (one row per event, end of story). See the
    // function doc above for the rationale.
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
    console.error("emitEvent error:", err);
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
    console.error("createAuditLog error:", err);
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
  operationType?: string;
  lines: JournalEntryLine[];
}) {
  const totalDebit = params.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = params.lines.reduce((s, l) => s + Number(l.credit), 0);
  const imbalance = Math.round((totalDebit - totalCredit) * 10000) / 10000;
  if (Math.abs(imbalance) > 0.001 && Math.abs(imbalance) <= 0.05) {
    let [roundingAcc] = await rawQuery<any>(
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
      [roundingAcc] = await rawQuery<any>(
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
      ).catch(console.error);
    }
  } else if (Math.abs(imbalance) > 0.05) {
    throw new ValidationError(
      `قيد غير متوازن: مدين=${totalDebit.toFixed(2)} ≠ دائن=${totalCredit.toFixed(2)} (${params.ref})`
    );
  }

  const { insertId: journalId } = await rawExecute(
    `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"sourceType","sourceId")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      params.companyId, params.branchId, params.createdBy, params.ref, params.description,
      params.type ?? "manual", params.sourceType ?? null, params.sourceId ?? null,
    ]
  );

  // Validate all account codes exist and allow posting
  const uniqueCodes = [...new Set(params.lines.map(l => l.accountCode).filter(Boolean))];
  if (uniqueCodes.length > 0) {
    const placeholders = uniqueCodes.map((_, i) => `$${i + 2}`).join(",");
    const accountRows = await rawQuery<any>(
      `SELECT code, "allowPosting" FROM chart_of_accounts WHERE "companyId" = $1 AND code IN (${placeholders}) AND "deletedAt" IS NULL`,
      [params.companyId, ...uniqueCodes]
    );
    const accountMap = new Map(accountRows.map((a: any) => [a.code, a]));
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

  const accountCodesToUpdate: string[] = [];
  for (const line of params.lines) {
    let accountId = line.accountId ?? null;
    if (!accountId && line.accountCode) {
      const [acc] = await rawQuery<any>(
        `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 LIMIT 1`,
        [params.companyId, line.accountCode]
      );
      accountId = acc?.id ?? null;
    }

    await rawExecute(
      `INSERT INTO journal_lines (
        "journalId","accountCode","accountId",debit,credit,description,"costCenter",
        "departmentId","projectId","employeeId","vehicleId","propertyId","contractId",
        "productId","clientId","vendorId","driverId","activityType","templateId"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        journalId, line.accountCode, accountId, line.debit, line.credit,
        line.description ?? null, line.costCenter ?? null,
        line.departmentId ?? null, line.projectId ?? null, line.employeeId ?? null,
        line.vehicleId ?? null, line.propertyId ?? null, line.contractId ?? null,
        line.productId ?? null, line.clientId ?? null, line.vendorId ?? null, line.driverId ?? null,
        line.activityType ?? null, line.templateId ?? null,
      ]
    );
    if (line.accountCode) accountCodesToUpdate.push(line.accountCode);
  }

  await updateAccountBalances(params.companyId, params.lines);

  // Bus emission — closes the dead listener in eventListeners.ts:276 so every
  // journal entry (from fleet trips, payroll, invoices, manual postings …)
  // produces one audit_logs row + one event_logs row via the subscriber.
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
  const lines = await rawQuery<any>(
    `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId" = $1`,
    [journalId]
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

export type ApprovalChainType = "leaves" | "purchases" | "expenses" | "advances" | "letters" | "procurement" | "loans" | "overtime" | "exit";

export interface ApprovalChainResult {
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

  const chains = await rawQuery<any>(
    `SELECT * FROM approval_chains
     WHERE "companyId" = $1 AND "chainType" = $2 AND "isActive" = true
     ${amountFilter}
     ORDER BY "minAmount" DESC LIMIT 1`,
    queryParams
  );

  if (chains.length === 0) {
    return { requiresApproval: false, chainId: null, approvalRequestId: null, currentStep: 0, totalSteps: 0 };
  }

  const chain = chains[0];
  const steps = await rawQuery<any>(
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
    const [row] = await rawQuery<any>(
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
    console.warn(
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

  const [request] = await rawQuery<any>(
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
       WHERE id = $2`,
      [params.decidedBy, request.id]
    );
    return { status: "rejected", message: "تم الرفض" };
  }

  await rawExecute(
    `UPDATE approval_requests SET status = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
     WHERE id = $2`,
    [params.decidedBy, request.id]
  );

  const chainId = request.chainId;
  const currentStepOrder = request.currentStepOrder ?? 1;

  if (!chainId) return { status: "approved", message: "تمت الموافقة" };

  const steps = await rawQuery<any>(
    `SELECT * FROM approval_chain_steps WHERE "chainId" = $1 ORDER BY "stepOrder" ASC`,
    [chainId]
  );

  const nextStep = steps.find((s: any) => s.stepOrder > currentStepOrder);
  if (!nextStep) {
    return { status: "approved", message: "تمت الموافقة النهائية" };
  }

  const [nextApprover] = await rawQuery<any>(
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
  const targetPeriod = params.period ?? new Date().toISOString().slice(0, 7);
  const [budget] = await rawQuery<any>(
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
      status: "warning_cfo", canProceed: ["finance_manager", "general_manager", "owner"].includes(params.role),
      utilization: Math.round(utilization),
      message: "تحذير: استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
      requiresApproval: true, approvalLevel: "cfo",
    };
  }
  if (utilization <= 110) {
    return {
      status: "blocked_gm", canProceed: ["general_manager", "owner"].includes(params.role),
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
  const targetPeriod = params.period ?? new Date().toISOString().slice(0, 7);
  await rawExecute(
    `UPDATE budgets SET used = used + $1
     WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4`,
    [Number(params.amount), params.companyId, params.accountCode, targetPeriod]
  ).catch(() => {});
}

export async function getAssignmentIdByRole(companyId: number, branchId: number, role: string): Promise<number | null> {
  const [row] = await rawQuery<any>(
    `SELECT ea.id FROM employee_assignments ea
     WHERE ea."companyId" = $1 AND ea."branchId" = $2
       AND ea.role = $3 AND ea.status = 'active'
     LIMIT 1`,
    [companyId, branchId, role]
  );
  return row?.id ?? null;
}

export async function getDirectorAssignmentId(companyId: number, branchId: number): Promise<number | null> {
  const [row] = await rawQuery<any>(
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
  const [row] = await rawQuery<any>(
    `SELECT ea.id FROM employee_assignments ea
     JOIN user_roles ur ON ur."userId" = (SELECT "employeeId" FROM employee_assignments WHERE id = ea.id)
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
  const [row] = await rawQuery<any>(
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
  const [manager] = await rawQuery<any>(
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
  const rows = await rawQuery<any>(
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

async function resolveByIntent(companyId: number, operationType: string, fallbackCode: string): Promise<string> {
  const cacheKey = `${companyId}:${operationType}`;
  const cached = _resolvedAccountCache.get(cacheKey);
  if (cached) return cached;

  // 1. If the hardcoded fallback EXISTS and accepts posting, use it.
  const [fb] = await rawQuery<any>(
    `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "allowPosting"=true AND "deletedAt" IS NULL LIMIT 1`,
    [companyId, fallbackCode]
  );
  if (fb) { _resolvedAccountCache.set(cacheKey, fb.code); return fb.code; }

  // 2. Otherwise search by intent (type + Arabic name keywords).
  const intent = MAPPING_INTENT[operationType];
  if (intent) {
    const likeClauses = intent.keywords.map((_, i) => `LOWER(name) LIKE $${i + 3}`).join(" OR ");
    const params = [companyId, intent.type, ...intent.keywords.map(k => `%${k.toLowerCase()}%`)];
    const rows = await rawQuery<any>(
      `SELECT code FROM chart_of_accounts
       WHERE "companyId"=$1 AND type=$2 AND "allowPosting"=true AND "deletedAt" IS NULL AND (${likeClauses})
       ORDER BY length(code) ASC LIMIT 1`,
      params
    );
    if (rows.length) {
      console.warn(`[accounting_mappings] Resolved "${operationType}" → "${rows[0].code}" by intent search (fallback "${fallbackCode}" missing).`);
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
  const [mapping] = await rawQuery<any>(
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
    console.warn(`[accounting_mappings] No mapping for "${operationType}", company=${companyId}. Fallback: "${fallbackCode}".`);
    rawExecute(
      `INSERT INTO audit_logs ("companyId","userId",action,entity,"entityId","after")
       VALUES ($1,0,'mapping_fallback','accounting_mappings',0,$2)`,
      [companyId, JSON.stringify({ operationType, side, fallbackCode })]
    ).catch(console.error);
    return fallbackCode;
  }
  const explicitCode = side === "debit"
    ? (mapping.debitCode || mapping.debitAccountCode)
    : (mapping.creditCode || mapping.creditAccountCode);
  if (explicitCode) return explicitCode;
  return await resolveByIntent(companyId, operationType, fallbackCode);
}
