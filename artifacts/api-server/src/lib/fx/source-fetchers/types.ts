/**
 * Common shape every FX rate source returns. Keeping the contract
 * narrow lets the daily-fetch job swap providers (SAMA → ECB →
 * manual fallback) without changing the storage layer.
 */
export interface FetchedRate {
  fromCurrency: string;
  toCurrency: string;
  /** Multiplier so that amountInTo = amountInFrom × rate. */
  rate: number;
  /** YYYY-MM-DD — the reference date the source published this rate for. */
  effectiveDate: string;
  /** Free-text source identifier for the audit log: "sama", "ecb", "manual". */
  source: string;
}

export interface RateSource {
  /** Stable name written into fx_rates.source. */
  name: string;
  /**
   * Pull the latest published rates. Should return an empty array
   * (NOT throw) when the feed is reachable but currently empty
   * (e.g. ECB during a Saudi/EU bank holiday); throw only on
   * transport / parse errors so the orchestrator can fall back.
   */
  fetchLatest(opts?: {
    /** Filter to a specific currency pair if the source supports it. */
    pair?: { from: string; to: string };
    /** AbortSignal so the operator can cancel a long-running fetch. */
    signal?: AbortSignal;
  }): Promise<FetchedRate[]>;
}
