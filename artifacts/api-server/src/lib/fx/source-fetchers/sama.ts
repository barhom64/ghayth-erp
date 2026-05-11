/**
 * Saudi Central Bank (SAMA) daily exchange rates.
 *
 * **STATUS: STUB.** SAMA publishes daily rates on its public website
 * (https://www.sama.gov.sa/ar-sa/EconomicReports) and via the SAMA
 * Open Data portal, but neither has a documented stable JSON / XML
 * feed at the time of writing. Three production options:
 *
 *   A) **Open Data portal scraping** — SAMA publishes a "Reference
 *      Exchange Rates" CSV on a daily schedule. Scraping is
 *      brittle (URL/format change risk) but free.
 *   B) **Commercial provider** — Refinitiv / Bloomberg / OANDA. Has
 *      an API + SLA, costs money, requires account onboarding.
 *   C) **Operator manual entry** — for SAR-base ERPs that touch
 *      only ~5 foreign pairs, daily manual entry by the CFO is
 *      tenable and is the current state.
 *
 * The recommendation in the design doc is (A) for Saudi-headquartered
 * deployments + (C) as an audit-log fallback. (B) goes in only if the
 * customer asks for it.
 *
 * Until path (A) is wired, calling `samaSource.fetchLatest()` throws
 * a typed "not implemented" error so the orchestrator knows to fall
 * back to ECB + manual rather than silently returning zero rates.
 */
import type { FetchedRate, RateSource } from "./types.js";

export class SamaNotConfiguredError extends Error {
  constructor() {
    super(
      "SAMA fetcher is not yet wired to a live source. " +
        "Options: SAMA Open Data CSV scrape, commercial provider, or operator manual entry. " +
        "See artifacts/api-server/src/lib/fx/source-fetchers/sama.ts for the plan.",
    );
    this.name = "SamaNotConfiguredError";
  }
}

export const samaSource: RateSource = {
  name: "sama",

  // eslint-disable-next-line @typescript-eslint/require-await
  async fetchLatest(): Promise<FetchedRate[]> {
    throw new SamaNotConfiguredError();
  },
};
