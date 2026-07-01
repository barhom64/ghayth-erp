// ─── Prepaid Amortization Engine — محرك إطفاء المصروفات المدفوعة مقدماً ──────
// FIN-TIME-SPREADING (#2247).
//
// Turns a prepaid asset balance (insurance / rent / license / subscription
// paid up front) into systematic monthly expense via balanced journal entries:
//
//     DR  <expense account>   monthlyAmount     (P&L)
//     CR  <prepaid account>   monthlyAmount     (asset balance drawn down)
//
// The expense account is resolved from a TEXT `expenseAccountPurpose` through
// the central account-mapping resolver — never a stored final GL code. The
// prepaid (asset) side IS a stored code (the account being credited down).
//
// Idempotency is enforced at TWO layers:
//   1. financialEngine.postJournalEntry keys on sourceKey
//      `prepaid:${scheduleId}:${periodYm}` (journal_entries.sourceKey UNIQUE).
//   2. prepaid_amortization_postings UNIQUE(companyId,scheduleId,periodYm) —
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
export function computeMonthlySchedule(input: ScheduleInput): ComputedSchedule {
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

export interface PrepaidScheduleRow {
  id: number;
  companyId: number;
  branchId: number | null;
  sourceType: string | null;
  sourceId: number | null;
  prepaidAccountCode: string;
  expenseAccountPurpose: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
  months: number;
  monthlyAmount: number;
  recognizedAmount: number;
  status: string;
  vehicleId: number | null;
  propertyId: number | null;
  employeeId: number | null;
  projectId: number | null;
  costCenterId: number | null;
  currency: string | null;
}

/**
 * Build the planned (balanced) JE lines for one amortization month. Pure — the
 * expense accountCode is resolved by the caller and passed in. Dimensions from
 * the schedule are carried onto BOTH lines so reports can attribute the expense.
 */
export function buildAmortizationLines(opts: {
  expenseAccountCode: string;
  prepaidAccountCode: string;
  amount: number;
  dims: Pick<
    PrepaidScheduleRow,
    "vehicleId" | "propertyId" | "employeeId" | "projectId" | "costCenterId"
  >;
  description?: string;
}) {
  const amount = roundTo2(opts.amount);
  const dim = {
    vehicleId: opts.dims.vehicleId ?? undefined,
    propertyId: opts.dims.propertyId ?? undefined,
    employeeId: opts.dims.employeeId ?? undefined,
    projectId: opts.dims.projectId ?? undefined,
    costCenterId: opts.dims.costCenterId ?? undefined,
  };
  return [
    {
      accountCode: opts.expenseAccountCode,
      debit: amount,
      credit: 0,
      description: opts.description ?? "إطفاء مصروف مدفوع مقدماً",
      ...dim,
    },
    {
      accountCode: opts.prepaidAccountCode,
      debit: 0,
      credit: amount,
      description: opts.description ?? "إطفاء مصروف مدفوع مقدماً",
      ...dim,
    },
  ];
}

/** Stable idempotency key for an amortization posting. */
export function amortizationSourceKey(scheduleId: number, ym: string): string {
  return `prepaid:${scheduleId}:${ym}`;
}

/**
 * البند ٤ ج-٧ — مُساعد مشترك لفتح صفّ إطفاء (DRY): يحسب المدّة (computeMonthlySchedule)
 * ويُدرج الصفّ بالشكل الموحّد ذي الأبعاد الكاملة. مالك الجدول هو هذا المحرّك، فيستدعيه
 * تأمينُ الأسطول (fleetEngine) والعقاري/الطبي (insuranceEngine) بدل تكرار الـINSERT.
 * لا فحص وجود هنا — دلالات الـidempotency تخصّ المُستدعي (الأسطول per-policy بفحص+مداواة،
 * التأمين per-entity). ج-٨: توحيد القيد + الجدول في معاملة واحدة يحتاج تمرير client إلى
 * postJournalEntry (تحسين لاحق)؛ المداواة الذاتية في الأسطول تُغطّي النافذة الانتقالية.
 */
export async function openPrepaidSchedule(opts: {
  companyId: number;
  branchId?: number | null;
  sourceType: string;
  sourceId: number;
  prepaidAccountCode: string;
  expenseAccountPurpose: string;
  totalAmount: number;
  startDate: string | Date;
  endDate: string | Date;
  dims?: { vehicleId?: number | null; propertyId?: number | null; employeeId?: number | null; projectId?: number | null; costCenterId?: number | null };
  currency?: string;
}): Promise<{ scheduleId: number; months: number; monthlyAmount: number }> {
  const { months, monthlyAmount } = computeMonthlySchedule({
    totalAmount: opts.totalAmount, startDate: opts.startDate, endDate: opts.endDate,
  });
  const d = opts.dims ?? {};
  const [row] = await rawQuery<{ id: number }>(
    `INSERT INTO prepaid_amortization_schedules
       ("companyId","branchId","sourceType","sourceId","prepaidAccountCode",
        "expenseAccountPurpose","totalAmount","startDate","endDate","months",
        "monthlyAmount","recognizedAmount",status,
        "vehicleId","propertyId","employeeId","projectId","costCenterId","currency")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,'active',$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      opts.companyId, opts.branchId ?? null, opts.sourceType, opts.sourceId, opts.prepaidAccountCode,
      opts.expenseAccountPurpose, opts.totalAmount, opts.startDate, opts.endDate, months, monthlyAmount,
      d.vehicleId ?? null, d.propertyId ?? null, d.employeeId ?? null, d.projectId ?? null, d.costCenterId ?? null,
      opts.currency ?? "SAR",
    ],
  );
  return { scheduleId: row!.id, months, monthlyAmount };
}

// ─── DB-bound runner ──────────────────────────────────────────────────────────

export interface RunResult {
  posted: number;
  skipped: number;
  completed: number;
  schedulesProcessed: number;
}

/**
 * Post every DUE, un-posted amortization month for the company's active
 * schedules. Company-scoped. Each (schedule, period) posts inside its own
 * transaction so a single failure can't leave a half-written ledger:
 *   - post the balanced JE via financialEngine (sourceKey idempotent),
 *   - INSERT the posting row (ON CONFLICT DO NOTHING — second guard),
 *   - bump recognizedAmount; mark 'completed' when recognized >= total.
 */
export async function runDueAmortizations(opts: {
  companyId: number;
  asOf?: string;
  /** Optional: restrict to a single schedule (manual run trigger). */
  scheduleId?: number;
  createdBy?: number;
}): Promise<RunResult> {
  const companyId = opts.companyId;
  const asOf = opts.asOf ?? todayISO();
  const result: RunResult = { posted: 0, skipped: 0, completed: 0, schedulesProcessed: 0 };

  const schedules = await rawQuery<PrepaidScheduleRow>(
    `SELECT id, "companyId", "branchId", "sourceType", "sourceId",
            "prepaidAccountCode", "expenseAccountPurpose",
            "totalAmount"::float8 AS "totalAmount",
            "startDate"::text AS "startDate", "endDate"::text AS "endDate",
            "months", "monthlyAmount"::float8 AS "monthlyAmount",
            "recognizedAmount"::float8 AS "recognizedAmount", status,
            "vehicleId", "propertyId", "employeeId", "projectId", "costCenterId", "currency"
       FROM prepaid_amortization_schedules
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
      `SELECT "periodYm" FROM prepaid_amortization_postings
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

      // Resolve the expense account from its TEXT purpose (never a stored code).
      const expenseAccountCode = await getAccountCodeFromMapping(
        companyId,
        sched.expenseAccountPurpose,
        "debit",
        "",
      );
      if (!expenseAccountCode) {
        logger.warn(
          `[prepaidAmortization] schedule#${sched.id}: could not resolve expenseAccountPurpose "${sched.expenseAccountPurpose}" — skipping ${ym}`,
        );
        result.skipped++;
        continue;
      }

      const lines = buildAmortizationLines({
        expenseAccountCode,
        prepaidAccountCode: sched.prepaidAccountCode,
        amount,
        dims: sched,
        description: `إطفاء ${sched.sourceType ?? "مصروف مدفوع مقدماً"} — ${ym}`,
      });

      try {
        await withTransaction(async (client) => {
          const posted = await financialEngine.postJournalEntry({
            companyId,
            branchId: sched.branchId ?? 0,
            createdBy: opts.createdBy ?? 0,
            ref: `PREPAID-${sched.id}-${ym}`,
            description: `إطفاء مصروف مدفوع مقدماً — جدول #${sched.id} — ${ym}`,
            type: "general",
            sourceType: "prepaid_amortization",
            sourceId: sched.id,
            sourceKey: amortizationSourceKey(sched.id, ym),
            lines,
          });

          // Second idempotency layer — the UNIQUE index makes a duplicate a no-op.
          await client.query(
            `INSERT INTO prepaid_amortization_postings
               ("companyId","scheduleId","periodYm","journalId","amount")
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT ("companyId","scheduleId","periodYm") DO NOTHING`,
            [companyId, sched.id, ym, posted.journalId, amount],
          );

          recognized = roundTo2(recognized + amount);
          const completed = recognized >= roundTo2(Number(sched.totalAmount));
          await client.query(
            `UPDATE prepaid_amortization_schedules
                SET "recognizedAmount"=$1, status=$2, "updatedAt"=NOW()
              WHERE id=$3 AND "companyId"=$4`,
            [recognized, completed ? "completed" : "active", sched.id, companyId],
          );
        });
        result.posted++;
      } catch (err) {
        logger.error(err, `[prepaidAmortization] failed to post schedule#${sched.id} ${ym}`);
      }
    }

    if (recognized >= roundTo2(Number(sched.totalAmount))) result.completed++;
  }

  return result;
}

/**
 * Cron entry-point — runs due amortizations for EVERY company that has an
 * active schedule. Returns a one-line summary string (cron-handler contract).
 * Each company is processed independently; one company's failure doesn't abort
 * the rest.
 */
export async function processDueAmortizations(): Promise<string> {
  const companies = await rawQuery<{ companyId: number }>(
    `SELECT DISTINCT "companyId" FROM prepaid_amortization_schedules
      WHERE status='active' AND "deletedAt" IS NULL`,
  );
  let posted = 0;
  let companiesRun = 0;
  for (const c of companies) {
    try {
      const r = await runDueAmortizations({ companyId: c.companyId });
      posted += r.posted;
      companiesRun++;
    } catch (err) {
      logger.error(err, `[prepaidAmortization] cron failed for company ${c.companyId}`);
    }
  }
  return `Prepaid amortizations: ${posted} posted across ${companiesRun}/${companies.length} companies`;
}

/**
 * Period-close gate helper. Returns the schedules that have a DUE (month start
 * <= period end), un-posted amortization month inside the period window. Used
 * by closeFiscalPeriodCanonical to REFUSE closing while recognition is pending.
 * Company-scoped, pure-DB read.
 */
export async function findUnpostedDueAmortizations(opts: {
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
       FROM prepaid_amortization_schedules
      WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`,
    [companyId],
  );

  const pending: Array<{ scheduleId: number; ym: string }> = [];
  for (const s of schedules) {
    const postedRows = await rawQuery<{ periodYm: string }>(
      `SELECT "periodYm" FROM prepaid_amortization_postings
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
