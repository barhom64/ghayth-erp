/**
 * DB-backed FX rate lookup.
 *
 * Lookup strategy (in order):
 *   1. Exact (companyId, from, to, asOfDate) — picks today's rate
 *      if one was inserted today.
 *   2. Most-recent prior (companyId, from, to, effectiveDate <= asOfDate)
 *      — falls back to yesterday's rate if today wasn't fetched yet.
 *   3. Inverse direction (companyId, to, from, …) — if the table
 *      only stores the reverse direction, return 1 / rate.
 *   4. Cross-currency via functional currency — if (from, to) isn't
 *      stored at all but (from, FUNC) and (FUNC, to) are, compose
 *      them. ONLY done when the operator opts in (`allowCross: true`)
 *      because cross-rates accumulate floating-point error.
 *
 * Returns `null` when no rate can be resolved by any path. Callers
 * decide whether to throw (production posting) or surface a soft
 * warning (UI preview).
 */
import { rawQuery } from "../rawdb.js";
import type { CurrencyCode } from "./types.js";
import { invertRate } from "./convert.js";

export interface ResolvedRate {
  rate: number;
  effectiveDate: string;
  source: string;
  /** True when the rate found is older than asOfDate. */
  isStale: boolean;
}

/**
 * Look up the rate to convert `from` → `to` for a given company on
 * a given asOf date.
 */
export async function fetchRateForDate(opts: {
  companyId: number;
  from: CurrencyCode;
  to: CurrencyCode;
  asOfDate: string; // YYYY-MM-DD
  /** When true, a missing pair is filled by composing through the
   *  company's functional currency. Off by default — see file header. */
  allowCross?: boolean;
}): Promise<ResolvedRate | null> {
  if (opts.from === opts.to) {
    return { rate: 1, effectiveDate: opts.asOfDate, source: "identity", isStale: false };
  }

  // Strategy 1+2: most-recent rate in the same direction not later
  // than asOfDate. The unique index makes this lookup an index scan.
  const direct = await rawQuery<{
    rate: string;
    effectiveDate: string;
    source: string;
  }>(
    `SELECT rate::text AS rate, "effectiveDate"::text AS "effectiveDate", source
     FROM fx_rates
     WHERE "companyId" = $1
       AND "fromCurrency" = $2
       AND "toCurrency"   = $3
       AND "effectiveDate" <= $4::date
     ORDER BY "effectiveDate" DESC
     LIMIT 1`,
    [opts.companyId, opts.from, opts.to, opts.asOfDate],
  );
  if (direct.length > 0) {
    return shapeResolved(direct[0], opts.asOfDate);
  }

  // Strategy 3: inverse direction.
  const inverse = await rawQuery<{
    rate: string;
    effectiveDate: string;
    source: string;
  }>(
    `SELECT rate::text AS rate, "effectiveDate"::text AS "effectiveDate", source
     FROM fx_rates
     WHERE "companyId" = $1
       AND "fromCurrency" = $2
       AND "toCurrency"   = $3
       AND "effectiveDate" <= $4::date
     ORDER BY "effectiveDate" DESC
     LIMIT 1`,
    [opts.companyId, opts.to, opts.from, opts.asOfDate],
  );
  if (inverse.length > 0) {
    const r = inverse[0];
    return {
      rate: invertRate(Number(r.rate)),
      effectiveDate: r.effectiveDate,
      source: `${r.source} (inverted)`,
      isStale: r.effectiveDate < opts.asOfDate,
    };
  }

  // Strategy 4: cross via functional currency.
  if (opts.allowCross) {
    const company = await rawQuery<{ functionalCurrency: string | null }>(
      `SELECT "functionalCurrency" FROM companies WHERE id = $1`,
      [opts.companyId],
    );
    const func = company[0]?.functionalCurrency;
    if (func && func !== opts.from && func !== opts.to) {
      const leg1 = await fetchRateForDate({
        companyId: opts.companyId,
        from: opts.from,
        to: func,
        asOfDate: opts.asOfDate,
      });
      const leg2 = await fetchRateForDate({
        companyId: opts.companyId,
        from: func,
        to: opts.to,
        asOfDate: opts.asOfDate,
      });
      if (leg1 && leg2) {
        return {
          rate: leg1.rate * leg2.rate,
          effectiveDate: leg1.effectiveDate < leg2.effectiveDate ? leg1.effectiveDate : leg2.effectiveDate,
          source: `cross via ${func}`,
          isStale: leg1.isStale || leg2.isStale,
        };
      }
    }
  }

  return null;
}

/**
 * Convenience wrapper: fetch the rate AND throw on miss. Use this in
 * production posting code paths where a missing rate is a hard
 * failure, not a UI preview.
 */
export async function fetchRateOrThrow(opts: Parameters<typeof fetchRateForDate>[0]): Promise<ResolvedRate> {
  const r = await fetchRateForDate(opts);
  if (r === null) {
    throw new Error(
      `No FX rate available for ${opts.from} → ${opts.to} on ${opts.asOfDate} (companyId=${opts.companyId})`,
    );
  }
  return r;
}

function shapeResolved(
  row: { rate: string; effectiveDate: string; source: string },
  asOfDate: string,
): ResolvedRate {
  return {
    rate: Number(row.rate),
    effectiveDate: row.effectiveDate,
    source: row.source,
    isStale: row.effectiveDate < asOfDate,
  };
}
