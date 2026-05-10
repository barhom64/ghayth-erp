/**
 * ISO 4217 currency code helpers.
 *
 * The full ISO 4217 list has ~180 codes; we keep a curated subset of
 * the ones a Saudi-headquartered ERP actually transacts in. Rejecting
 * unknown codes is a soft signal — if a tenant needs a currency we
 * haven't catalogued, they can still store rows (the DB regex
 * accepts any ^[A-Z]{3}$) but the UI will show a warning so the
 * operator can confirm the spelling.
 */

const SUPPORTED_CURRENCIES = new Set<string>([
  // GCC (frequent)
  "SAR", "AED", "KWD", "BHD", "OMR", "QAR",
  // Major
  "USD", "EUR", "GBP", "JPY", "CHF", "CNY",
  // Frequent for KSA trade partners
  "EGP", "JOD", "TRY", "INR", "PKR", "BDT", "PHP", "IDR",
  // Asian
  "MYR", "SGD", "HKD", "KRW", "THB",
  // Other
  "CAD", "AUD", "ZAR", "BRL", "RUB",
]);

/** True if the code is a 3-letter uppercase string AND on the curated list. */
export function isKnownCurrency(code: string | null | undefined): boolean {
  if (!code) return false;
  if (!/^[A-Z]{3}$/.test(code)) return false;
  return SUPPORTED_CURRENCIES.has(code);
}

/** Throw a typed error for unknown / malformed currency codes. */
export function assertCurrency(code: string, context: string = "currency"): asserts code is string {
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`${context}: expected an ISO 4217 3-letter code, got "${code}"`);
  }
}

/** The full sorted list — used by the UI dropdown. */
export function listSupportedCurrencies(): string[] {
  return Array.from(SUPPORTED_CURRENCIES).sort();
}

/**
 * Number of decimal places to display for a currency. Most ISO 4217
 * codes are 2dp; a handful are 0 (JPY, KRW) or 3 (KWD, BHD, OMR, JOD).
 * Used for rendering invoice totals; SAR-side storage is always 2dp.
 */
const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0, KRW: 0,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, IQD: 3, LYD: 3, TND: 3,
};

export function decimalsFor(code: string): number {
  return CURRENCY_DECIMALS[code] ?? 2;
}
