/**
 * Manual rate entry — operator-driven fallback used when no
 * automated source is configured for a given currency pair.
 *
 * Unlike the SAMA / ECB fetchers this one doesn't go to the
 * network. Its `fetchLatest` returns whatever rows the operator
 * pre-staged in the `manual_fx_rates` staging table (added in a
 * later week) OR an empty array, so the orchestrator can move on
 * to the next source.
 *
 * Today the staging table doesn't exist yet (week-3 deliverable).
 * The fetcher returns an empty array so the daily-fetch orchestrator
 * doesn't error out when manual entry is configured-as-source but
 * nobody has typed any rates in for today.
 */
import type { FetchedRate, RateSource } from "./types.js";

export const manualSource: RateSource = {
  name: "manual",

  // eslint-disable-next-line @typescript-eslint/require-await
  async fetchLatest(): Promise<FetchedRate[]> {
    // Until the manual_fx_rates staging table lands, this is a
    // soft no-op. Operators who set rates today do it via the
    // existing /finance/algorithms/fx-rates endpoint, which writes
    // straight to fx_rates with source='manual'.
    return [];
  },
};
