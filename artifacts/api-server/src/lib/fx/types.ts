/**
 * Shared types for the multi-currency / FX module.
 * See docs/MULTI_CURRENCY_DESIGN.md for the full plan.
 */

/**
 * ISO 4217 currency code — three uppercase letters. We don't enforce
 * the full ISO list at the type level (TypeScript can't), but the DB
 * has a regex check and the validator in `currencies.ts` rejects
 * unknown codes for end-user input.
 */
export type CurrencyCode = string;

/**
 * One row from the `fx_rates` table — `rate` is the multiplier so that:
 *   amountInTo = amountInFrom * rate
 * No matter which direction is queried.
 */
export interface FxRate {
  companyId: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  effectiveDate: string; // YYYY-MM-DD
  source: string;
}

/**
 * Result of converting one amount between two currencies. Carries
 * enough context for the audit log + UI to explain WHICH rate was
 * used (and from which date), in case the latest rate isn't from
 * today.
 */
export interface ConversionResult {
  amount: number;             // converted amount, rounded to 2dp
  rateUsed: number;           // raw multiplier, full precision
  rateDate: string;           // YYYY-MM-DD — the rate the lookup picked
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  /** True when conversion was a no-op (from === to). */
  trivial: boolean;
  /**
   * True when the rate found is older than the requested asOfDate
   * (lookup fell back to the most recent prior rate). Operators
   * should be alerted if this is true on a production posting.
   */
  rateIsStale: boolean;
}

/**
 * Period-end revaluation summary returned by the runner. Uses a
 * structured shape rather than just the journal id so the operator
 * UI can render the headline numbers without an extra round-trip.
 */
export interface RevaluationResult {
  revaluationLogId: number;
  journalEntryId: number | null;
  totalGain: number;
  totalLoss: number;
  /** Number of monetary items walked. */
  scanned: number;
  /** Number of items that produced a non-zero gain/loss. */
  reported: number;
  /** Items skipped because no closing rate was available. */
  skipped: Array<{ entityType: string; entityId: number; reason: string }>;
}
