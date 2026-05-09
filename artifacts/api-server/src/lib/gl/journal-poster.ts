/**
 * Pure helper for building balanced journal-entry payloads.
 *
 * Every poster (FX revaluation, realised FX, cycle-count variance,
 * inventory write-off) constructs the same shape: a header + a list
 * of lines whose debits MUST equal credits to 2dp. The math + the
 * balance check live here so each poster is just 5 lines of
 * "look up the accounts, build the lines, hand them to me".
 *
 * No DB writes — returns a structured `JournalEntryPayload` the
 * route handler hands to the existing journal-entry insert helper.
 * Pure, unit-testable, no time.
 */

export interface JournalLine {
  accountId: number;
  /** Debit amount in functional currency, 2dp. Either debit OR
   *  credit on a line is non-zero — never both. */
  debit: number;
  credit: number;
  description: string;
  /** Optional foreign-key to the originating row for drilldowns. */
  referenceType?: string;
  referenceId?: number;
}

export interface JournalEntryPayload {
  description: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  /** Always true once the payload comes back from `buildEntry`. The
   *  builder throws on imbalance instead of returning false. */
  balanced: true;
}

export interface BuildEntryInput {
  description: string;
  lines: Array<Omit<JournalLine, "debit" | "credit"> & {
    /** Positive for debit, negative for credit. The builder splits
     *  them into the proper columns. */
    amount: number;
  }>;
}

/**
 * Build a balanced journal-entry payload from "amount" lines (where
 * positive = debit, negative = credit). Throws if the resulting
 * debits and credits don't match to 2dp — there's no graceful
 * degradation for an unbalanced posting.
 */
export function buildEntry(input: BuildEntryInput): JournalEntryPayload {
  const lines: JournalLine[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const raw of input.lines) {
    if (!Number.isFinite(raw.amount)) {
      throw new Error(`Journal line amount must be a finite number, got ${raw.amount}`);
    }
    if (raw.amount === 0) {
      // Zero-amount lines aren't postable; skip silently rather
      // than carry placeholder rows through to the insert.
      continue;
    }

    const debit = raw.amount > 0 ? round2dp(raw.amount) : 0;
    const credit = raw.amount < 0 ? round2dp(-raw.amount) : 0;

    lines.push({
      accountId: raw.accountId,
      debit,
      credit,
      description: raw.description,
      referenceType: raw.referenceType,
      referenceId: raw.referenceId,
    });

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = round2dp(totalDebit);
  totalCredit = round2dp(totalCredit);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry not balanced: debit=${totalDebit} credit=${totalCredit} ` +
        `(diff=${(totalDebit - totalCredit).toFixed(2)})`,
    );
  }

  if (lines.length === 0) {
    throw new Error("Journal entry has no postable lines (all amounts were zero)");
  }

  return {
    description: input.description,
    lines,
    totalDebit,
    totalCredit,
    balanced: true,
  };
}

/**
 * Convenience for the most common 2-line shape: "this much from
 * here, that much to there". Matches the FX revaluation case exactly.
 */
export function buildSimpleEntry(input: {
  description: string;
  amount: number;
  debitAccountId: number;
  creditAccountId: number;
  referenceType?: string;
  referenceId?: number;
  debitDescription?: string;
  creditDescription?: string;
}): JournalEntryPayload {
  return buildEntry({
    description: input.description,
    lines: [
      {
        accountId: input.debitAccountId,
        amount: Math.abs(input.amount), // positive = debit
        description: input.debitDescription ?? input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
      {
        accountId: input.creditAccountId,
        amount: -Math.abs(input.amount), // negative = credit
        description: input.creditDescription ?? input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    ],
  });
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
