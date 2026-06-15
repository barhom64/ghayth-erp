// ─── Deferred Revenue Engine — محرك تحقّق الإيرادات المؤجلة ───────────────────
// FIN-DEFERRED-REVENUE (#2248).
//
// The SYMMETRIC counterpart of the prepaid-amortization engine (#2247). Turns a
// deferred-revenue LIABILITY balance (cash received up front for rent / umrah /
// service not yet earned) into systematic REVENUE via balanced journal entries:
//
//     DR  <deferred-revenue liability>   monthlyAmount   (liability drawn down)
//     CR  <revenue account>              monthlyAmount   (P&L — revenue earned)
//
// This is the OPPOSITE direction of amortization (DR expense / CR prepaid). The
// revenue account is resolved from a TEXT `revenueAccountPurpose` through the
// central account-mapping resolver — never a stored final GL code. The deferred
// (liability) side IS a stored code (the account being debited down).
//
// Idempotency is enforced at TWO layers:
//   1. financialEngine.postJournalEntry keys on sourceKey
//      `deferred_revenue:${scheduleId}:${periodYm}` (journal_entries.sourceKey UNIQUE).
//   2. deferred_revenue_postings UNIQUE(companyId,scheduleId,periodYm) —
//      INSERT ... ON CONFLICT DO NOTHING.
// The same month cannot recognize twice.
//
// Every query is company-scoped (tenant isolation).

import { rawQuery, withTransaction } from "../rawdb.js";
import { getAccountCodeFromMapping, roundTo2, todayISO } from "../businessHelpers.js";
import { logger } from "../logger.js";

// ─── Pure schedule math ──────────────────────────────────────────────────────

export interface ScheduleInput {
  totalAmount: number;
  startDate: string | Date;
  endDate: string | Date;
}

export interface ComputedSchedule {
  months: number;
  /** Even per-month amount (rounded to 2dp); the LAST month absorbs rounding. */
  monthlyAmount: number;
}

/** Inclusive whole-month count between two dates (startDate's month .. endDate's month). */
export function monthsBetween(start: string | Date, end: string | Date): number {
  const s = new Date(start);
  const e = new Date(end);
  const months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  return Math.max(1, months);
}

/**
 * Pure, unit-testable. Returns the whole-month span and the even monthly
 * amount. The caller spreads `monthlyAmount` for every month EXCEPT the last,
 * where the remainder (`totalAmount - monthlyAmount * (months - 1)`) is posted
 * so the sum of all postings === totalAmount exactly (no rounding drift).
 */
export function computeRecognitionSchedule(input: ScheduleInput): ComputedSchedule {
  const total = roundTo2(Number(input.totalAmount));
  const months = monthsBetween(input.startDate, input.endDate);
  const monthlyAmount = roundTo2(total / months);
  return { months, monthlyAmount };
}

/**
 * Amount to recognize for a given 1-based month index (1..months). All months
 * post `monthlyAmount` except the last, which absorbs the rounding remainder so
 * the running total lands exactly on `totalAmount`.
 */
export function amountForMonth(
  monthIndex: number,
  total: number,
  months: number,
  monthlyAmount: number,
): number {
  if (monthIndex >= months) {
    return roundTo2(roundTo2(total) - roundTo2(monthlyAmount) * (months - 1));
  }
  return roundTo2(monthlyAmount);
}

/** 'YYYY-MM' for a date. */
export function periodYm(d: string | Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The list of period keys (YYYY-MM, 1-based index) due on/before `asOf` for a
 * schedule, given its startDate and month span. Pure — used by both the runner
 * and the period-close gate.
 */
export function duePeriodsUpTo(
  startDate: string | Date,
  months: number,
  asOf: string | Date,
): Array<{ index: number; ym: string }> {
  const start = new Date(startDate);
  const asOfDate = new Date(asOf);
  const out: Array<{ index: number; ym: string }> = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    if (d <= new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0)) {
      out.push({ index: i + 1, ym: periodYm(d) });
    }
  }
  return out;
}

// ─── Schedule row type ────────────────────────────────────────────────────────

export interface DeferredRevenueScheduleRow {
  id: number;
  companyId: number;
  branchId: number | null;
  sourceType: string | null;
  sourceId: number | null;
  deferredRevenueAccountCode: string;
  revenueAccountPurpose: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
  recognitionMethod: string;
  months: number;
  monthlyAmount: number;
  recognizedAmount: number;
  status: string;
  propertyId: number | null;
  unitId: number | null;
  contractId: number | null;
  umrahSeasonId: number | null;
  umrahAgentId: number | null;
  clientId: number | null;
  costCenterId: number | null;
  currency: string | null;
}

/**
 * Build the planned (balanced) JE lines for one recognition month. Pure — the
 * revenue accountCode is resolved by the caller and passed in. Dimensions from
 * the schedule are carried onto BOTH lines so reports can attribute the revenue.
 *
 *   DR  deferred-revenue liability   amount
 *   CR  revenue account              amount
 */
export function buildRecognitionLines(opts: {
  deferredRevenueAccountCode: string;
  revenueAccountCode: string;
  amount: number;
  dims: Pick<
    DeferredRevenueScheduleRow,
    "propertyId" | "unitId" | "contractId" | "umrahSeasonId" | "umrahAgentId" | "clientId" | "costCenterId"
  >;
  description?: string;
}) {
  const amount = roundTo2(opts.amount);
  const dim = {
    propertyId: opts.dims.propertyId ?? undefined,
    unitId: opts.dims.unitId ?? undefined,
    contractId: opts.dims.contractId ?? undefined,
    umrahSeasonId: opts.dims.umrahSeasonId ?? undefined,
    umrahAgentId: opts.dims.umrahAgentId ?? undefined,
    clientId: opts.dims.clientId ?? undefined,
    costCenterId: opts.dims.costCenterId ?? undefined,
  };
  return [
    {
      accountCode: opts.deferredRevenueAccountCode,
      debit: amount,
      credit: 0,
      description: opts.description ?? "تحقّق إيراد مؤجل",
      ...dim,
    },
    {
      accountCode: opts.revenueAccountCode,
      debit: 0,
      credit: amount,
      description: opts.description ?? "تحقّق إيراد مؤجل",
      ...dim,
    },
  ];
}

/** Stable idempotency key for a deferred-revenue recognition posting. */
export function recognitionSourceKey(scheduleId: number, ym: string): string {
  return `deferred_revenue:${scheduleId}:${ym}`;
}

// ─── DB-bound runner ──────────────────────────────────────────────────────────

export interface RunResult {
  posted: number;
  skipped: number;
  completed: number;
  schedulesProcessed: number;
}

/**
 * Post every DUE, un-posted recognition month for the company's active
 * schedules. Company-scoped. Each (schedule, period) posts inside its own
 * transaction so a single failure can't leave a half-written ledger:
 *   - post the balanced JE via financialEngine (sourceKey idempotent),
 *   - INSERT the posting row (ON CONFLICT DO NOTHING — second guard),
 *   - bump recognizedAmount + recompute remainingAmount;
 *     mark 'completed' when recognized >= total.
 */
export async function runDueRecognitions(opts: {
  companyId: number;
  asOf?: string;
  /** Optional: restrict to a single schedule (manual run trigger). */
  scheduleId?: number;
  createdBy?: number;
}): Promise<RunResult> {
  const companyId = opts.companyId;
  const asOf = opts.asOf ?? todayISO();
  const result: RunResult = { posted: 0, skipped: 0, completed: 0, schedulesProcessed: 0 };

  const schedules = await rawQuery<DeferredRevenueScheduleRow>(
    `SELECT id, "companyId", "branchId", "sourceType", "sourceId",
            "deferredRevenueAccountCode", "revenueAccountPurpose",
            "totalAmount"::float8 AS "totalAmount",
            "startDate"::text AS "startDate", "endDate"::text AS "endDate",
            "recognitionMethod",
            "months", "monthlyAmount"::float8 AS "monthlyAmount",
            "recognizedAmount"::float8 AS "recognizedAmount", status,
            "propertyId", "unitId", "contractId",
            "umrahSeasonId", "umrahAgentId", "clientId", "costCenterId", "currency"
       FROM deferred_revenue_schedules
      WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL
        ${opts.scheduleId ? `AND id=$2` : ``}`,
    opts.scheduleId ? [companyId, opts.scheduleId] : [companyId],
  );

  const { financialEngine } = await import("./index.js");

  for (const sched of schedules) {
    result.schedulesProcessed++;
    const due = duePeriodsUpTo(sched.startDate, sched.months, asOf);

    // already-posted periods for this schedule (company-scoped).
    const postedRows = await rawQuery<{ periodYm: string }>(
      `SELECT "periodYm" FROM deferred_revenue_postings
        WHERE "companyId"=$1 AND "scheduleId"=$2`,
      [companyId, sched.id],
    );
    const alreadyPosted = new Set(postedRows.map((r) => r.periodYm));

    let recognized = roundTo2(Number(sched.recognizedAmount));

    for (const { index, ym } of due) {
      if (alreadyPosted.has(ym)) {
        result.skipped++;
        continue;
      }
      const amount = amountForMonth(
        index,
        Number(sched.totalAmount),
        sched.months,
        Number(sched.monthlyAmount),
      );
      if (amount <= 0) {
        result.skipped++;
        continue;
      }

      // Resolve the revenue account from its TEXT purpose (never a stored code).
      const revenueAccountCode = await getAccountCodeFromMapping(
        companyId,
        sched.revenueAccountPurpose,
        "credit",
        "",
      );
      if (!revenueAccountCode) {
        logger.warn(
          `[deferredRevenue] schedule#${sched.id}: could not resolve revenueAccountPurpose "${sched.revenueAccountPurpose}" — skipping ${ym}`,
        );
        result.skipped++;
        continue;
      }

      const lines = buildRecognitionLines({
        deferredRevenueAccountCode: sched.deferredRevenueAccountCode,
        revenueAccountCode,
        amount,
        dims: sched,
        description: `تحقّق ${sched.sourceType ?? "إيراد مؤجل"} — ${ym}`,
      });

      try {
        await withTransaction(async (client) => {
          const posted = await financialEngine.postJournalEntry({
            companyId,
            branchId: sched.branchId ?? 0,
            createdBy: opts.createdBy ?? 0,
            ref: `DEFREV-${sched.id}-${ym}`,
            description: `تحقّق إيراد مؤجل — جدول #${sched.id} — ${ym}`,
            type: "general",
            sourceType: "deferred_revenue",
            sourceId: sched.id,
            sourceKey: recognitionSourceKey(sched.id, ym),
            lines,
          });

          // Second idempotency layer — the UNIQUE index makes a duplicate a no-op.
          await client.query(
            `INSERT INTO deferred_revenue_postings
               ("companyId","scheduleId","periodYm","journalId","amount")
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT ("companyId","scheduleId","periodYm") DO NOTHING`,
            [companyId, sched.id, ym, posted.journalId, amount],
          );

          recognized = roundTo2(recognized + amount);
          const total = roundTo2(Number(sched.totalAmount));
          const remaining = roundTo2(total - recognized);
          const completed = recognized >= total;
          await client.query(
            `UPDATE deferred_revenue_schedules
                SET "recognizedAmount"=$1, "remainingAmount"=$2, status=$3, "updatedAt"=NOW()
              WHERE id=$4 AND "companyId"=$5`,
            [recognized, remaining, completed ? "completed" : "active", sched.id, companyId],
          );
        });
        result.posted++;
      } catch (err) {
        logger.error(err, `[deferredRevenue] failed to post schedule#${sched.id} ${ym}`);
      }
    }

    if (recognized >= roundTo2(Number(sched.totalAmount))) result.completed++;
  }

  return result;
}

/**
 * Cron entry-point — runs due recognitions for EVERY company that has an active
 * schedule. Returns a one-line summary string (cron-handler contract). Each
 * company is processed independently; one company's failure doesn't abort the
 * rest.
 */
export async function processDueRecognitions(): Promise<string> {
  const companies = await rawQuery<{ companyId: number }>(
    `SELECT DISTINCT "companyId" FROM deferred_revenue_schedules
      WHERE status='active' AND "deletedAt" IS NULL`,
  );
  let posted = 0;
  let companiesRun = 0;
  for (const c of companies) {
    try {
      const r = await runDueRecognitions({ companyId: c.companyId });
      posted += r.posted;
      companiesRun++;
    } catch (err) {
      logger.error(err, `[deferredRevenue] cron failed for company ${c.companyId}`);
    }
  }
  return `Deferred revenue recognitions: ${posted} posted across ${companiesRun}/${companies.length} companies`;
}

/**
 * Period-close gate helper. Returns the schedules that have a DUE (month start
 * <= period end), un-posted recognition month inside the period window. Used by
 * closeFiscalPeriodCanonical to REFUSE closing while recognition is pending.
 * Company-scoped, pure-DB read.
 */
export async function findUnpostedDueRecognitions(opts: {
  companyId: number;
  periodStart: string;
  periodEnd: string;
}): Promise<Array<{ scheduleId: number; ym: string }>> {
  const { companyId, periodStart, periodEnd } = opts;
  const schedules = await rawQuery<{
    id: number;
    startDate: string;
    months: number;
  }>(
    `SELECT id, "startDate"::text AS "startDate", "months"
       FROM deferred_revenue_schedules
      WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`,
    [companyId],
  );

  const pending: Array<{ scheduleId: number; ym: string }> = [];
  for (const s of schedules) {
    const postedRows = await rawQuery<{ periodYm: string }>(
      `SELECT "periodYm" FROM deferred_revenue_postings
        WHERE "companyId"=$1 AND "scheduleId"=$2`,
      [companyId, s.id],
    );
    const posted = new Set(postedRows.map((r) => r.periodYm));
    // months whose 1st-of-month falls within [periodStart, periodEnd].
    const due = duePeriodsUpTo(s.startDate, s.months, periodEnd);
    const start = new Date(periodStart);
    for (const { ym } of due) {
      const mDate = new Date(`${ym}-01T00:00:00`);
      if (mDate >= new Date(start.getFullYear(), start.getMonth(), 1) && !posted.has(ym)) {
        pending.push({ scheduleId: s.id, ym });
      }
    }
  }
  return pending;
}
