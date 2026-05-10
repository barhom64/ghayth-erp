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
export type { FetchedRate, RateSource } from "./source-fetchers/types.js";
export { ecbSource, parseEcbXml } from "./source-fetchers/ecb.js";
export { samaSource, SamaNotConfiguredError } from "./source-fetchers/sama.js";
export { manualSource } from "./source-fetchers/manual.js";
export type { DailyFetchOutcome } from "./jobs.js";
export {
  dailyFxRateFetch,
  dailyFxRateFetchCron,
  findStaleRates,
  DEFAULT_SOURCE_CHAIN,
} from "./jobs.js";
export type {
  MonetaryItem,
  RevaluationLine,
  ComputedRevaluation,
  RunPeriodEndOpts,
} from "./revaluation.js";
export { computeRevaluationLines, runPeriodEndRevaluation } from "./revaluation.js";
export type {
  RealizedFxInput,
  RealizedFxResult,
  RecordRealizedFxOpts,
} from "./realized.js";
export { computeRealizedFx, recordRealizedFx } from "./realized.js";
export type { StalenessAlertOutcome } from "./staleness-alert.js";
export { fxStalenessCheckCron, runStalenessCheck } from "./staleness-alert.js";
