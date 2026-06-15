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
import {
  collectPeriodCloseBlockers,
  buildPeriodCloseReport,
  type PeriodCloseBlocker,
  type PeriodCloseReport,
} from "./periodCloseCoordinator.js";

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
  /** Close report (counts + closedBy/closedAt) recorded on the close. */
  report?: PeriodCloseReport;
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

  // FIN-PERIOD-CLOSE (#2250) — AGGREGATE every integrity blocker in one pass
  // (no longer fail-fast on the first). The coordinator runs ALL checks —
  // pending manual JEs (#1715), due un-posted prepaid amortizations (#2247),
  // due un-posted deferred-revenue recognitions (#2248), operational JEs missing
  // required dimensions, mapping-fallback postings, manual operationally-linked
  // JEs without a reason, and open financial posting failures — all company-
  // scoped and windowed to the period's date range. If ANY blocker stands, the
  // close is REFUSED with the FULL list in meta.blockers (one round-trip, not N).
  const blockers: PeriodCloseBlocker[] = await collectPeriodCloseBlockers({
    companyId: scope.companyId,
    period: { startDate: period.startDate, endDate: period.endDate, name: period.name },
  });

  if (blockers.length > 0) {
    throw new ConflictError(
      `لا يمكن إقفال الفترة "${period.name}": يوجد ${blockers.length} مانع نزاهة يجب معالجته أولاً`,
      {
        field: "fiscalPeriod",
        fix: "عالج جميع موانع النزاهة المدرجة ثم أعد محاولة الإقفال",
        meta: { blockers, blockerCount: blockers.length, periodId, periodName: period.name },
      }
    );
  }

  // Clean — build the close report (no blockers) to persist into the audit/close
  // record. closedBy/closedAt are stamped here for the record.
  const closeReport = await buildPeriodCloseReport({
    companyId: scope.companyId,
    periodId,
    period: { startDate: period.startDate, endDate: period.endDate, name: period.name },
    blockers,
    closedBy: scope.activeAssignmentId ?? null,
    closedAt: new Date().toISOString(),
  });

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
      // The close report rides into the audit `after` payload so the audit
      // trail captures the integrity snapshot at the moment of close.
      after: { name: period.name, notes: reason ?? null, closeReport },
      ...(c ? { client: c } : {}),
    });

  const updated = client
    ? await runTransition(client)
    : await withTransaction(async (c) => runTransition(c));

  return {
    periodId,
    name: period.name,
    status: String(updated.status ?? "closed"),
    report: closeReport,
  };
}
