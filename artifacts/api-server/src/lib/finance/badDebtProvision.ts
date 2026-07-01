// ─── Bad-debt provision — delta-to-target posting (FIN-RECURRING bad_debt) ──────
// An allowance for doubtful accounts (1135) is a TARGET balance, not an
// incremental accrual. Each period we compute the aging-based target and post
// only the DELTA that brings 1135 to that target:
//   delta > 0 ⇒ DR bad_debt_expense (5820) / CR allowance (1135)   (raise provision)
//   delta < 0 ⇒ DR allowance (1135)         / CR bad_debt_expense (5820)  (release)
//   delta ≈ 0 ⇒ no entry (already at target)
// This is the standard allowance accounting — it avoids the cumulative
// over-provision a "post the full total every period" automation would cause.
//
// Idempotent per period via ref `BAD-DEBT-{period}` + sourceKey
// `finance:bad_debt:{companyId}:{period}` — shared by the manual endpoint and the
// monthly cron, so whichever runs first books the period and the other is a
// no-op. No tracking table / migration: the journal ref IS the idempotency guard.
import { rawQuery } from "../rawdb.js";
import { checkFinancialPeriodOpen } from "../businessHelpers.js";
import { resolveBadDebtPolicy, type BadDebtRates } from "../badDebtPolicy.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ديون معدومة (مصروف) — postable leaf. */
export const BAD_DEBT_EXPENSE_FALLBACK = "5820";
/** مخصص الديون المشكوك في تحصيلها (مخصّص/contra-asset) — postable leaf. */
export const BAD_DEBT_ALLOWANCE_FALLBACK = "1135";

export interface AgingInvoice {
  createdAt: string | Date;
  dueDate: string | Date | null;
  outstanding: number | string;
}

export interface BadDebtBuckets {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
}

/**
 * Pure: aging buckets × policy rates → the TARGET allowance balance. Mirrors the
 * manual endpoint's aging logic exactly so preview / post / cron all agree.
 * `asOfMs` is the as-of timestamp; an invoice with no dueDate falls due 30d after
 * creation (same convention as the original endpoint).
 */
export function computeBadDebtTarget(
  invoices: AgingInvoice[],
  asOfMs: number,
  rates: BadDebtRates,
): { buckets: BadDebtBuckets; target: number } {
  const buckets: BadDebtBuckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  for (const inv of invoices) {
    const due = inv.dueDate
      ? new Date(inv.dueDate as string | Date).getTime()
      : new Date(inv.createdAt as string | Date).getTime() + 30 * 86400000;
    const d = Math.floor((asOfMs - due) / 86400000);
    const ra = round2(Number(inv.outstanding));
    if (d <= 0) buckets.current = round2(buckets.current + ra);
    else if (d <= 30) buckets.d30 = round2(buckets.d30 + ra);
    else if (d <= 60) buckets.d60 = round2(buckets.d60 + ra);
    else if (d <= 90) buckets.d90 = round2(buckets.d90 + ra);
    else buckets.d90plus = round2(buckets.d90plus + ra);
  }
  const target = round2(
    buckets.current * rates.current +
      buckets.d30 * rates.d30 +
      buckets.d60 * rates.d60 +
      buckets.d90 * rates.d90 +
      buckets.d90plus * rates.d90plus,
  );
  return { buckets, target };
}

export interface BadDebtDeltaLine {
  accountCode: string;
  debit: number;
  credit: number;
}

/**
 * Pure: target vs current allowance balance → the SIGNED delta journal lines, or
 * null when already at target (|delta| < 0.01 ⇒ no entry). Positive delta raises
 * the provision (DR expense / CR allowance); negative releases it (DR allowance /
 * CR expense). Always balanced by construction.
 */
export function badDebtDeltaLines(
  target: number,
  currentAllowance: number,
  expenseCode: string,
  allowanceCode: string,
): { delta: number; lines: BadDebtDeltaLine[] } | null {
  const delta = round2(target - currentAllowance);
  if (Math.abs(delta) < 0.01) return null;
  const amt = round2(Math.abs(delta));
  const lines: BadDebtDeltaLine[] =
    delta > 0
      ? [
          { accountCode: expenseCode, debit: amt, credit: 0 },
          { accountCode: allowanceCode, debit: 0, credit: amt },
        ]
      : [
          { accountCode: allowanceCode, debit: amt, credit: 0 },
          { accountCode: expenseCode, debit: 0, credit: amt },
        ];
  return { delta, lines };
}

/**
 * Current allowance (1135) credit balance from the ledger, EXCLUDING the current
 * period's own entry (so re-runs compute a stable delta). The allowance is a
 * credit-normal contra-asset, so balance = Σcredit − Σdebit. Mirrors the
 * canonical account-ledger read (deletedAt filter; no status filter).
 */
export async function readAllowanceBalance(
  companyId: number,
  allowanceCode: string,
  excludeRef: string,
): Promise<number> {
  const [row] = await rawQuery<{ balance: string }>(
    `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
      WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND jl."deletedAt" IS NULL
        AND jl."accountCode" = $2 AND je.ref <> $3`,
    [companyId, allowanceCode, excludeRef],
  );
  return round2(Number(row?.balance ?? 0));
}

// Outstanding receivables that carry a posted AR balance. Drafts/cancelled/paid/
// rejected/returned never accrue an allowance (same exclusion as the endpoint).
const OUTSTANDING_INVOICES_SQL = `SELECT "createdAt", "dueDate", (total - COALESCE("paidAmount",0)) AS outstanding
     FROM invoices
    WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" <= $2
      AND status NOT IN ('draft','cancelled','paid','rejected','returned','written_off')
      AND (total - COALESCE("paidAmount",0)) > 0.01`;

export interface PostBadDebtResult {
  posted: boolean;
  reason?: "period_closed" | "at_target" | "already_posted";
  journalId?: number | null;
  target: number;
  currentAllowance: number;
  delta: number;
  buckets?: BadDebtBuckets;
  rates?: BadDebtRates;
}

/**
 * Compute the aging target, read the current allowance, and post the DELTA JE
 * (idempotent via ref + sourceKey). Shared by the manual endpoint and the monthly
 * cron. Returns posted=false with a reason for the no-op cases (period closed,
 * already at target, already posted this period).
 */
export async function postBadDebtProvision(opts: {
  companyId: number;
  branchId: number;
  period: string; // YYYY-MM
  asOf?: string | null; // defaults to {period}-28
  rates?: Partial<BadDebtRates> | null;
  createdBy: number;
  notes?: string | null;
}): Promise<PostBadDebtResult> {
  const { companyId, period } = opts;
  const targetDate = opts.asOf || `${period}-28`;
  const ref = `BAD-DEBT-${period}`;

  const periodCheck = await checkFinancialPeriodOpen(companyId, targetDate);
  if (!periodCheck.open) {
    return { posted: false, reason: "period_closed", target: 0, currentAllowance: 0, delta: 0 };
  }

  const rates = await resolveBadDebtPolicy(companyId, opts.rates ?? undefined);
  const invoices = await rawQuery<AgingInvoice>(OUTSTANDING_INVOICES_SQL, [companyId, targetDate]);
  const { buckets, target } = computeBadDebtTarget(invoices, new Date(targetDate).getTime(), rates);

  const { financialEngine } = await import("../engines/index.js");
  const [expenseCode, allowanceCode] = await Promise.all([
    financialEngine.resolveAccountCode(companyId, "bad_debt_expense", "debit", BAD_DEBT_EXPENSE_FALLBACK),
    financialEngine.resolveAccountCode(companyId, "bad_debt_allowance", "credit", BAD_DEBT_ALLOWANCE_FALLBACK),
  ]);

  const currentAllowance = await readAllowanceBalance(companyId, allowanceCode, ref);
  const d = badDebtDeltaLines(target, currentAllowance, expenseCode, allowanceCode);
  if (!d) {
    return { posted: false, reason: "at_target", target, currentAllowance, delta: 0, buckets, rates };
  }

  const result = await financialEngine.postJournalEntry({
    companyId,
    branchId: opts.branchId,
    createdBy: opts.createdBy,
    ref,
    description: `مخصص ديون مشكوك فيها ${period} — تعديل للهدف${opts.notes ? ` — ${opts.notes}` : ""}`,
    sourceType: "bad_debt_allowance",
    sourceId: 0,
    sourceKey: `finance:bad_debt:${companyId}:${period}`,
    lines: d.lines,
  });

  return {
    posted: !result.alreadyExists,
    reason: result.alreadyExists ? "already_posted" : undefined,
    journalId: result.journalId,
    target,
    currentAllowance,
    delta: d.delta,
    buckets,
    rates,
  };
}
