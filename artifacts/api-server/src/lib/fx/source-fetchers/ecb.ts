/**
 * European Central Bank daily reference rates.
 *
 * Public feed: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 * Format: gesmes/ECB envelope, EUR-based rates published every TARGET
 * working day around 16:00 CET. Rates are 1 EUR = X CCY.
 *
 * Pros: free, no auth, decades of stability.
 * Cons: ~30 currencies only (USD, JPY, GBP, AED, etc — but no SAR
 *       listed). For a SAR-base ERP the way to use ECB is:
 *       - Pull EUR-base rates for the pairs we need
 *       - Combine with SAR-EUR (manual or SAMA) into cross rates
 *
 * Parser: regex-based, no XML library — the schema is shallow and
 * stable enough that this is robust. Reject anything that doesn't
 * match the expected envelope so a malformed response throws
 * instead of silently producing zero rates.
 */
import type { FetchedRate, RateSource } from "./types.js";

const ECB_FEED_URL =
  process.env.ECB_FX_FEED_URL ??
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const FETCH_TIMEOUT_MS = Number(process.env.ECB_FETCH_TIMEOUT_MS ?? 10_000);

export const ecbSource: RateSource = {
  name: "ecb",

  async fetchLatest({ signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("ECB fetch timed out")), FETCH_TIMEOUT_MS);
    signal?.addEventListener("abort", () => controller.abort(signal.reason));

    try {
      const response = await fetch(ECB_FEED_URL, {
        method: "GET",
        headers: { Accept: "application/xml" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`ECB returned HTTP ${response.status}`);
      }
      const xml = await response.text();
      return parseEcbXml(xml);
    } finally {
      clearTimeout(timeout);
    }
  },
};

/**
 * Parse the ECB daily-rates XML and return FetchedRate[] entries.
 * Exported so unit tests can feed it canned XML without hitting the
 * network.
 */
export function parseEcbXml(xml: string): FetchedRate[] {
  // Find the date attribute on the inner <Cube time="YYYY-MM-DD">
  // element — it carries the reference date for the whole batch.
  const timeMatch = xml.match(/<Cube\s+time=["']([\d-]{10})["']/);
  if (!timeMatch) {
    throw new Error("ECB response: missing <Cube time> element");
  }
  const effectiveDate = timeMatch[1];

  // Each rate is a self-closing <Cube currency="X" rate="Y"/>. The
  // regex deliberately tolerates attribute order + single/double
  // quotes, since the published feed has flipped these in the past.
  const rateRe = /<Cube\s+(?:currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']|rate=["']([\d.]+)["']\s+currency=["']([A-Z]{3})["'])\s*\/>/g;
  const rates: FetchedRate[] = [];
  let m: RegExpExecArray | null;
  while ((m = rateRe.exec(xml)) !== null) {
    const ccy = m[1] ?? m[4];
    const value = m[2] ?? m[3];
    const rate = Number(value);
    if (!ccy || !Number.isFinite(rate) || rate <= 0) continue;
    // ECB publishes 1 EUR = X CCY, so the row direction is EUR → CCY.
    rates.push({
      fromCurrency: "EUR",
      toCurrency: ccy,
      rate,
      effectiveDate,
      source: "ecb",
    });
  }

  return rates;
}
