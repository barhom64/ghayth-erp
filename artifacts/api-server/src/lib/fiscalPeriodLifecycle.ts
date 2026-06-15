// Audit F3 — Canonical fiscal-period close.
// One implementation, two call-sites: the public POST
// /finance/fiscal-periods-v2/:id/close route AND the year-end-close
// force-close path. Before this helper existed, year-end-close did its
// own raw UPDATE that bypassed the lifecycle engine, the pending-JE
// guard, the audit trail, the event bus, and the structured error
// envelope — silently closing periods that had unposted journals and
// leaving the year-end JE looking complete when it wasn't.

import type * as pg from "pg";
import { rawQuery, withTransaction } from "./rawdb.js";
import { applyTransition } from "./lifecycleEngine.js";
import { ConflictError, NotFoundError } from "./errorHandler.js";

type Scope = {
  companyId: number;
  branchId?: number | null;
  userId: number;
  activeAssignmentId?: number | null;
};

export type CloseFiscalPeriodOptions = {
  periodId: number;
  scope: Scope;
  reason?: string;
  /**
   * When provided, runs inside the caller's transaction (the lifecycle
   * engine joins reentrantly). When omitted, the helper opens its own.
   */
  client?: pg.PoolClient;
};

export type CloseFiscalPeriodResult = {
  periodId: number;
  name: string;
  status: string;
};

/**
 * Close a fiscal period through the canonical lifecycle. Guards: period
 * must exist, must be `open`, must have zero unposted manual journals
 * inside its date range. Side-effects: row update, audit log, event_logs
 * row, eventBus emission — all atomic.
 */
export async function closeFiscalPeriodCanonical(
  opts: CloseFiscalPeriodOptions
): Promise<CloseFiscalPeriodResult> {
  const { periodId, scope, reason, client } = opts;

  const fetchPeriod = async () => {
    const rows = await rawQuery<{
      id: number;
      name: string;
      startDate: string;
      endDate: string;
    }>(
      `SELECT id, name, "startDate", "endDate" FROM financial_periods
       WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [periodId, scope.companyId]
    );
    return rows[0];
  };

  const period = await fetchPeriod();
  if (!period) throw new NotFoundError("الفترة غير موجودة");

  const pendingRows = await rawQuery<{ pendingCount: string }>(
    `SELECT COUNT(*)::text AS "pendingCount" FROM journal_entries
     WHERE "companyId"=$1 AND "deletedAt" IS NULL
       AND "createdAt"::date BETWEEN $2 AND $3
       AND ("approvalStatus" IS NULL OR "approvalStatus" IN ('draft','pending_review'))
       AND "isManual" = TRUE`,
    [scope.companyId, period.startDate, period.endDate]
  );
  const pendingCount = Number(pendingRows[0]?.pendingCount ?? 0);
  if (pendingCount > 0) {
    throw new ConflictError(
      `لا يمكن إقفال الفترة "${period.name}": يوجد ${pendingCount} قيد يدوي لم يُرحّل بعد`,
      {
        field: "journalEntries",
        fix: "ارحّل أو احذف القيود اليدوية المعلّقة قبل إقفال الفترة",
        meta: { pendingCount, periodId, periodName: period.name },
      }
    );
  }

  // FIN-TIME-SPREADING (#2247) — a period MUST NOT close while a prepaid
  // amortization month that is due (<= period end) within the period window is
  // still un-posted. Closing first would strand the systematic expense, leaving
  // the prepaid asset overstated and the P&L understated for the period.
  // Mirror of the pending-manual-JE gate above; same company scope.
  const { findUnpostedDueAmortizations } = await import("./engines/prepaidAmortizationEngine.js");
  const pendingAmort = await findUnpostedDueAmortizations({
    companyId: scope.companyId,
    periodStart: period.startDate,
    periodEnd: period.endDate,
  });
  if (pendingAmort.length > 0) {
    throw new ConflictError(
      `لا يمكن إقفال الفترة "${period.name}": يوجد ${pendingAmort.length} إطفاء مستحق لمصروفات مدفوعة مقدماً لم يُرحّل بعد`,
      {
        field: "prepaidAmortization",
        fix: "نفّذ إطفاء المصروفات المدفوعة مقدماً المستحقة (POST /finance/amortization/run) قبل إقفال الفترة",
        meta: { pendingAmortizationCount: pendingAmort.length, periodId, periodName: period.name },
      }
    );
  }

  // FIN-DEFERRED-REVENUE (#2248) — the SYMMETRIC counterpart of the gate above.
  // A period MUST NOT close while a deferred-revenue recognition month that is
  // due (<= period end) within the period window is still un-posted. Closing
  // first would strand the systematic revenue, leaving the deferred-revenue
  // liability overstated and the P&L understated for the period. Same company
  // scope as the amortization / pending-manual-JE gates.
  const { findUnpostedDueRecognitions } = await import("./engines/deferredRevenueEngine.js");
  const pendingDefRev = await findUnpostedDueRecognitions({
    companyId: scope.companyId,
    periodStart: period.startDate,
    periodEnd: period.endDate,
  });
  if (pendingDefRev.length > 0) {
    throw new ConflictError(
      `لا يمكن إقفال الفترة "${period.name}": يوجد ${pendingDefRev.length} تحقّق مستحق لإيرادات مؤجلة لم يُرحّل بعد`,
      {
        field: "deferredRevenue",
        fix: "نفّذ تحقّق الإيرادات المؤجلة المستحقة (POST /finance/deferred-revenue/run) قبل إقفال الفترة",
        meta: { pendingDeferredRevenueCount: pendingDefRev.length, periodId, periodName: period.name },
      }
    );
  }

  const runTransition = async (c?: pg.PoolClient) =>
    applyTransition<Record<string, unknown>>({
      entity: "financial_periods",
      id: periodId,
      scope: {
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        userId: scope.userId,
      },
      action: "fiscal_period.closed",
      fromStates: ["open"],
      toState: "closed",
      reason: reason ?? undefined,
      extraWhere: `"deletedAt" IS NULL`,
      setExtras: {
        closedAt: { raw: "NOW()" },
        closedBy: scope.activeAssignmentId ?? null,
        ...(reason ? { notes: reason } : {}),
      },
      after: { name: period.name, notes: reason ?? null },
      ...(c ? { client: c } : {}),
    });

  const updated = client
    ? await runTransition(client)
    : await withTransaction(async (c) => runTransition(c));

  return {
    periodId,
    name: period.name,
    status: String(updated.status ?? "closed"),
  };
}
