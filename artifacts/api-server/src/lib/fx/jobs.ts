/**
 * Daily FX rate fetch orchestrator.
 *
 * Cron handler that runs once a day, walks every active company,
 * pulls the latest rates from the configured source(s), and
 * upserts them into `fx_rates`. Used by the cronScheduler entry
 * `daily_fx_rate_fetch`.
 *
 * Source-fallback chain (in order):
 *   1. SAMA — primary for SAR-base operations (currently throws
 *             SamaNotConfiguredError until path (A) is wired)
 *   2. ECB  — free, EUR-base, ~30 currencies including USD/JPY/AED
 *   3. manual — staging table fallback (soft no-op today)
 *
 * If ALL configured sources fail, log a structured error and
 * record a stale-rate row in `fx_rate_alerts` (added in a later
 * week) so the daily check job can email the CFO.
 *
 * Idempotency: the upsert uses `(companyId, fromCurrency,
 * toCurrency, effectiveDate)` as the conflict key (matches the
 * unique index added in migration 140). Re-running the job on the
 * same day either updates the rate to the current value (if the
 * source republished) or no-ops.
 */
import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import type { FetchedRate, RateSource } from "./source-fetchers/types.js";
import { ecbSource } from "./source-fetchers/ecb.js";
import { manualSource } from "./source-fetchers/manual.js";
import { samaSource, SamaNotConfiguredError } from "./source-fetchers/sama.js";

const STALENESS_ALERT_DAYS = Number(process.env.FX_RATE_STALENESS_ALERT_DAYS ?? 3);

export interface DailyFetchOutcome {
  companies: number;
  ratesPersisted: number;
  sourcesUsed: string[];
  errors: string[];
}

/**
 * Default source ordering. Tests can pass an alternative list.
 */
export const DEFAULT_SOURCE_CHAIN: RateSource[] = [samaSource, ecbSource, manualSource];

/**
 * Walk every active company and refresh today's rates from the
 * source chain. The same fetched batch is shared across companies
 * (rates are universal — only the persisted `companyId` differs)
 * which keeps the network calls cheap.
 */
export async function dailyFxRateFetch(
  sources: RateSource[] = DEFAULT_SOURCE_CHAIN,
): Promise<DailyFetchOutcome> {
  const out: DailyFetchOutcome = {
    companies: 0,
    ratesPersisted: 0,
    sourcesUsed: [],
    errors: [],
  };

  // Pull the rate batch once.
  const batch: FetchedRate[] = [];
  for (const src of sources) {
    try {
      const rates = await src.fetchLatest();
      if (rates.length > 0) {
        batch.push(...rates);
        out.sourcesUsed.push(src.name);
        // SAMA + ECB shouldn't double-publish. Take the first
        // source that returns a non-empty batch as the canonical
        // set for the day; manual is layered on top so operators
        // can override.
        if (src.name !== "manual") break;
      }
    } catch (err) {
      if (err instanceof SamaNotConfiguredError) {
        // Expected until SAMA is wired — log at debug so it
        // doesn't spam ops with the same warning every day.
        logger.debug({ source: src.name }, "[fx] source not yet configured, falling back");
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`${src.name}: ${msg}`);
      logger.warn({ source: src.name, err: msg }, "[fx] source fetch failed, falling back");
    }
  }

  if (batch.length === 0) {
    out.errors.push("no source returned any rates");
    return out;
  }

  // Active companies. The same batch is upserted per-company; rate
  // values are identical, only the FK differs.
  const companies = await rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE status = 'active' AND "deletedAt" IS NULL`,
  );
  out.companies = companies.length;

  for (const company of companies) {
    for (const rate of batch) {
      try {
        await upsertRate(company.id, rate);
        out.ratesPersisted += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        out.errors.push(`company=${company.id} ${rate.fromCurrency}→${rate.toCurrency}: ${msg}`);
      }
    }
  }

  return out;
}

/**
 * Cron-compatible signature: returns a one-line summary string.
 */
export async function dailyFxRateFetchCron(): Promise<string> {
  const out = await dailyFxRateFetch();
  if (out.ratesPersisted === 0 && out.errors.length === 0) return "no companies / no rates";
  return (
    `companies=${out.companies} rates=${out.ratesPersisted} ` +
    `sources=${out.sourcesUsed.join(",") || "none"} errors=${out.errors.length}`
  );
}

/**
 * Detect companies whose most recent rate is older than the
 * configured staleness threshold. The cron task `fx_staleness_check`
 * (added in week 3) calls this to decide whether to email the CFO.
 */
export async function findStaleRates(): Promise<
  Array<{ companyId: number; pair: string; lastDate: string; daysStale: number }>
> {
  const rows = await rawQuery<{
    companyId: number;
    pair: string;
    lastDate: string;
    daysStale: string;
  }>(
    `SELECT
       "companyId",
       "fromCurrency" || '/' || "toCurrency" AS pair,
       MAX("effectiveDate")::text          AS "lastDate",
       (CURRENT_DATE - MAX("effectiveDate"))::text AS "daysStale"
     FROM fx_rates
     GROUP BY "companyId", "fromCurrency", "toCurrency"
     HAVING (CURRENT_DATE - MAX("effectiveDate")) > $1
     ORDER BY (CURRENT_DATE - MAX("effectiveDate")) DESC`,
    [STALENESS_ALERT_DAYS],
  );
  return rows.map((r) => ({
    companyId: r.companyId,
    pair: r.pair,
    lastDate: r.lastDate,
    daysStale: Number(r.daysStale),
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Internal: idempotent upsert into fx_rates.
// ─────────────────────────────────────────────────────────────────────

async function upsertRate(companyId: number, rate: FetchedRate): Promise<void> {
  await rawExecute(
    `INSERT INTO fx_rates ("companyId", "fromCurrency", "toCurrency", rate, "effectiveDate", source)
     VALUES ($1, $2, $3, $4, $5::date, $6)
     ON CONFLICT ("companyId", "fromCurrency", "toCurrency", "effectiveDate")
       DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source`,
    [companyId, rate.fromCurrency, rate.toCurrency, rate.rate, rate.effectiveDate, rate.source],
  );
}
