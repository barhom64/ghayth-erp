/**
 * Wire an acknowledged Mudad salary settlement into a balanced
 * salary-booking journal entry, via the GL helpers from #224 + #252.
 *
 * Fifth (and final) of the deferred GL-integration helpers — same
 * pattern as #253 (FX revaluation), #256 (realised FX), #258 (cycle-
 * count variance), and #261 (lot write-off). Pure builder + DB
 * driver, no behaviour change to `submitSalary` (the Mudad client
 * stays a transport-only concern).
 *
 * A salary that has been acknowledged by Mudad means payroll for
 * that employee in that period actually moved through the ministry
 * pipeline. The corresponding GL booking is:
 *
 *   DR  salary_expense            (gross = basic + housing + other)
 *   CR  salary_payable            (net amount paid to employee)
 *   CR  salary_deductions_payable (deductions — GOSI / loans / tax)
 *
 * The deductions leg is omitted when the deduction total rounds to
 * zero so the entry stays 2 lines rather than 3.
 *
 * Invariant guarded by the builder:
 *   gross = net + deductions (rounded to 2dp)
 * Mismatch throws — that's a payroll calc bug upstream, not a
 * silent GL-posting drift.
 */
import { rawQuery, rawExecute, withTransaction } from "../../rawdb.js";
import { logger } from "../../logger.js";
import {
  buildEntry,
  postJournalEntry,
  getAccountForPurpose,
  type AccountResolution,
  type BuildEntryInput,
  type EntryContext,
} from "../../gl/index.js";

export interface SalaryComponents {
  /** Net amount actually paid to the employee (after deductions). */
  amount: number;
  basicSalary: number;
  housingAllowance: number;
  otherAllowances: number;
  /** Total deductions (GOSI + loans + advances + tax …). */
  deductions: number;
}

export interface SalaryJournalAccounts {
  expense: AccountResolution;
  payable: AccountResolution;
  deductionsPayable: AccountResolution;
}

/**
 * Pure: compute gross = basic + housing + other (no deductions
 * applied yet). Surface area pulled out so the unit tests can poke
 * at it directly.
 */
export function computeGross(components: SalaryComponents): number {
  return round2dp(
    components.basicSalary + components.housingAllowance + components.otherAllowances,
  );
}

/**
 * Pure: build the BuildEntryInput payload for a single salary
 * settlement. Throws when net + deductions ≠ gross (a payroll-calc
 * bug — better to fail loudly than post a drifted entry).
 *
 * Returns empty `lines` when gross rounds to zero so the caller can
 * short-circuit to `noop`.
 */
export function buildSalaryEntryInput(opts: {
  description: string;
  components: SalaryComponents;
  accounts: SalaryJournalAccounts;
  settlementId: number;
  employeeId: number;
  period: string;
}): BuildEntryInput {
  const net = round2dp(opts.components.amount);
  const deductions = round2dp(opts.components.deductions);
  // The salary-expense debit (gross) is DERIVED as the exact sum of the
  // credit legs so the entry balances to the cent — computing gross
  // independently from components and rounding it separately drifted it
  // from net + deductions by a halala.
  const gross = round2dp(net + deductions);

  if (gross === 0 && net === 0 && deductions === 0) {
    return { description: opts.description, lines: [] };
  }

  // Defence-in-depth: the independently-computed component gross must still
  // agree with net + deductions. A mismatch is a real upstream payroll-calc
  // bug — surface it loudly rather than booking a silently-adjusted gross.
  const componentGross = computeGross(opts.components);
  const drift = Math.abs(componentGross - gross);
  if (drift > 0.01) {
    throw new Error(
      `buildSalaryEntryInput: payroll component mismatch — ` +
        `gross(components)=${componentGross}, net+deductions=${gross}, ` +
        `net=${net}, deductions=${deductions}, drift=${drift}. ` +
        `Fix the upstream payroll calc before booking.`,
    );
  }

  const lines: BuildEntryInput["lines"] = [];

  // DR salary expense (gross).
  lines.push({
    accountId: opts.accounts.expense.accountId,
    amount: gross,
    description: `Salary expense — employee #${opts.employeeId} (${opts.accounts.expense.accountCode})`,
    referenceType: "mudad_settlements",
    referenceId: opts.settlementId,
  });

  // CR salary payable (net).
  if (net > 0) {
    lines.push({
      accountId: opts.accounts.payable.accountId,
      amount: -net,
      description: `Salary payable — employee #${opts.employeeId} ${opts.period} (${opts.accounts.payable.accountCode})`,
      referenceType: "mudad_settlements",
      referenceId: opts.settlementId,
    });
  }

  // CR deductions payable (deductions) — only when > 0 so the entry
  // stays 2-line for the common no-deductions case.
  if (deductions > 0) {
    lines.push({
      accountId: opts.accounts.deductionsPayable.accountId,
      amount: -deductions,
      description: `Salary deductions — employee #${opts.employeeId} ${opts.period} (${opts.accounts.deductionsPayable.accountCode})`,
      referenceType: "mudad_settlements",
      referenceId: opts.settlementId,
    });
  }

  return { description: opts.description, lines };
}

// ─────────────────────────────────────────────────────────────────────
// DB driver
// ─────────────────────────────────────────────────────────────────────

export interface PostMudadSalaryOpts {
  settlementId: number;
  companyId: number;
  postedBy?: number;
  description?: string;
  asDraft?: boolean;
}

export interface PostMudadSalaryOutcome {
  status: "posted" | "draft" | "skipped" | "noop";
  journalEntryId: number | null;
  gross: number;
  net: number;
  deductions: number;
  reason?: string;
}

/**
 * Read the Mudad settlement row, post the salary-booking journal
 * entry, stamp `journalEntryId` back. Refuses to post unless the
 * settlement type is `salary` AND status is `acknowledged` — the
 * ministry needs to have ack'd before we move the GL.
 *
 * Idempotency: if the row already carries a `journalEntryId`, return
 * `skipped` so cron / operator retries don't double-post.
 */
export async function postMudadSalaryJournal(
  opts: PostMudadSalaryOpts,
): Promise<PostMudadSalaryOutcome> {
  return withTransaction(async () => {
    const [row] = await rawQuery<{
      type: string;
      status: string;
      period: string | null;
      employeeId: number;
      payload: unknown;
      submittedAt: string;
      acknowledgedAt: string | null;
      journalEntryId: number | null;
    }>(
      `SELECT type, status, period, "employeeId",
              payload,
              "submittedAt"::text   AS "submittedAt",
              "acknowledgedAt"::text AS "acknowledgedAt",
              "journalEntryId"
       FROM mudad_settlements
       WHERE id = $1 AND "companyId" = $2
       FOR UPDATE`,
      [opts.settlementId, opts.companyId],
    );
    if (!row) {
      throw new Error(`postMudadSalaryJournal: settlement ${opts.settlementId} not found`);
    }

    if (row.type !== "salary") {
      throw new Error(
        `postMudadSalaryJournal: settlement ${opts.settlementId} is type='${row.type}', ` +
          `only 'salary' is bookable today`,
      );
    }
    if (row.status !== "acknowledged") {
      throw new Error(
        `postMudadSalaryJournal: settlement ${opts.settlementId} is status='${row.status}', ` +
          `posting requires 'acknowledged'`,
      );
    }

    if (row.journalEntryId !== null) {
      return {
        status: "skipped",
        journalEntryId: row.journalEntryId,
        gross: 0,
        net: 0,
        deductions: 0,
        reason: "settlement already carries journalEntryId; reverse before reposting",
      };
    }

    const components = extractComponents(row.payload);
    const gross = computeGross(components);
    const net = round2dp(components.amount);
    const deductions = round2dp(components.deductions);

    if (gross === 0) {
      return {
        status: "noop",
        journalEntryId: null,
        gross: 0,
        net: 0,
        deductions: 0,
        reason: "zero gross salary in payload",
      };
    }

    const [expense, payable, deductionsPayable] = await Promise.all([
      getAccountForPurpose(opts.companyId, "salary_expense", "debit"),
      getAccountForPurpose(opts.companyId, "salary_payable", "credit"),
      getAccountForPurpose(opts.companyId, "salary_deductions_payable", "credit"),
    ]);
    if (!expense || !payable || !deductionsPayable) {
      throw new Error(
        "postMudadSalaryJournal: salary_expense / salary_payable / salary_deductions_payable " +
          "could not be resolved (check accounting_mappings + chart_of_accounts seed)",
      );
    }

    const period = row.period ?? "—";
    const description =
      opts.description ?? `Salary booking — employee #${row.employeeId} ${period}`;

    const buildInput = buildSalaryEntryInput({
      description,
      components,
      accounts: { expense, payable, deductionsPayable },
      settlementId: opts.settlementId,
      employeeId: row.employeeId,
      period,
    });
    if (buildInput.lines.length === 0) {
      return {
        status: "noop",
        journalEntryId: null,
        gross,
        net,
        deductions,
        reason: "build produced no lines",
      };
    }

    const payload = buildEntry(buildInput);
    const entryDate = (row.acknowledgedAt ?? row.submittedAt).slice(0, 10);

    // PD-6 — stable economic-event key. A retried Mudad salary post (scheduler
    // re-fire, network blip, manual retry) for the same settlement returns the
    // existing entry instead of double-posting. (settlementId, period) is the
    // unique pair: one salary booking per settlement per period.
    const ref = `MUDAD-SAL-${opts.settlementId}-${period}`;
    const ctx: EntryContext = {
      companyId: opts.companyId,
      createdBy: opts.postedBy,
      ref,
      sourceKey: ref,
      type: "mudad_salary_booking",
      sourceType: "mudad_settlements",
      sourceId: opts.settlementId,
      date: entryDate,
      status: opts.asDraft ? "draft" : "posted",
    };
    const posted = await postJournalEntry(payload, ctx);

    await rawExecute(
      `UPDATE mudad_settlements
         SET "journalEntryId" = $1
       WHERE id = $2 AND "companyId" = $3`,
      [posted.journalEntryId, opts.settlementId, opts.companyId],
    );

    logger.info(
      {
        settlementId: opts.settlementId,
        employeeId: row.employeeId,
        journalEntryId: posted.journalEntryId,
        status: posted.status,
        gross,
        net,
        deductions,
      },
      "[mudad-salary] booking journal entry posted",
    );

    return {
      status: posted.status,
      journalEntryId: posted.journalEntryId,
      gross,
      net,
      deductions,
    };
  });
}

/**
 * Pull the typed `SalaryComponents` out of the JSONB payload column.
 * Missing fields default to 0 so partial payloads (e.g. older rows
 * that pre-date the breakdown) don't crash the booking — they just
 * land entirely as basic salary.
 */
function extractComponents(payload: unknown): SalaryComponents {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    amount:             num(p.amount),
    basicSalary:        num(p.basicSalary),
    housingAllowance:   num(p.housingAllowance),
    otherAllowances:    num(p.otherAllowances),
    deductions:         num(p.deductions),
  };
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
