/**
 * Public surface of the multi-currency / FX module.
 *
 * Today this is types + pure conversion + DB-backed rate lookup.
 * Daily fetchers, period-end revaluation, and realised-FX recording
 * land in weeks 2-3 (see docs/MULTI_CURRENCY_DESIGN.md).
 */

export * from "./types.js";
export {
  isKnownCurrency,
  assertCurrency,
  listSupportedCurrencies,
  decimalsFor,
} from "./currencies.js";
export { convertWithRate, invertRate } from "./convert.js";
export type { ResolvedRate } from "./rate-lookup.js";
export { fetchRateForDate, fetchRateOrThrow } from "./rate-lookup.js";
