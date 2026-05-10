/**
 * Pure currency conversion math.
 *
 * No I/O — the caller has already looked up the rate (via
 * `lib/fx/rate-lookup.ts`) and passes it in. Keeping this layer pure
 * means the unit tests don't need a DB, and the same function is
 * usable from a script, a route, or a worker.
 */
import type { ConversionResult, CurrencyCode } from "./types.js";
import { assertCurrency } from "./currencies.js";

/**
 * Convert an amount given an explicit rate. The standard formula:
 *   amountInTo = amountInFrom * rate
 * is applied as-is — callers that need cross-rates (USD → SAR via
 * EUR) should compose two `convert()` calls themselves rather than
 * inverting / multiplying inside this function, so the audit log can
 * see each leg.
 *
 * Rounding: half-up to 2 decimal places by default, configurable per
 * call for currencies whose minor-unit count differs (KWD, BHD, JPY).
 */
export function convertWithRate(opts: {
  amount: number;
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  rateDate: string;
  decimals?: number;
  /** Marks the result as stale so the audit/UI can flag it. */
  rateIsStale?: boolean;
}): ConversionResult {
  assertCurrency(opts.from, "from");
  assertCurrency(opts.to, "to");

  if (opts.from === opts.to) {
    // No conversion needed — but we still return a structured result
    // so call sites don't have to special-case.
    return {
      amount: roundHalfUp(opts.amount, opts.decimals ?? 2),
      rateUsed: 1,
      rateDate: opts.rateDate,
      fromCurrency: opts.from,
      toCurrency: opts.to,
      trivial: true,
      rateIsStale: false,
    };
  }

  if (!Number.isFinite(opts.rate) || opts.rate <= 0) {
    throw new Error(`FX conversion: rate must be a positive finite number, got ${opts.rate}`);
  }

  const raw = opts.amount * opts.rate;
  const amount = roundHalfUp(raw, opts.decimals ?? 2);

  return {
    amount,
    rateUsed: opts.rate,
    rateDate: opts.rateDate,
    fromCurrency: opts.from,
    toCurrency: opts.to,
    trivial: false,
    rateIsStale: opts.rateIsStale ?? false,
  };
}

/**
 * Invert a rate: given USD→SAR = 3.75, returns SAR→USD = 1/3.75.
 * Pure helper so the rate-lookup layer can use a single direction's
 * row to answer queries in either direction.
 */
export function invertRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Cannot invert non-positive rate: ${rate}`);
  }
  return 1 / rate;
}

/**
 * Half-up rounding to N decimals.
 *
 * Known limitation: JavaScript stores some "x.005" values as the
 * slightly-smaller "x.00499999…" in IEEE-754, so 1.005 rounds DOWN
 * to 1.00 here. The Number.EPSILON nudge fixes most cases (1.015 →
 * 1.02, 2.345 → 2.35 etc) but not the worst float pathologies. For
 * amounts that need true decimal arithmetic (e.g. ZATCA-cleared
 * invoices), do the math at the SQL `numeric(18,8)` layer where
 * Postgres applies banker's-or-half-up exactly.
 */
function roundHalfUp(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, decimals);
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * factor + Number.EPSILON) / factor;
}
