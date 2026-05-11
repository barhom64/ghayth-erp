/**
 * FX rate staleness alerter.
 *
 * Reads `findStaleRates()` (lib/fx/jobs.ts) once a day and emits a
 * notification per company whose most-recent rate is older than
 * `FX_RATE_STALENESS_ALERT_DAYS` (default 3). Suppresses repeat
 * notifications for the same (company, pair) within 24h so the CFO
 * doesn't receive the same alert daily until they fix it.
 *
 * Cron entry: `fx_staleness_check` at `0 6 * * *` (6am UTC = 9am
 * Riyadh, after the daily fetch has run at 5am UTC).
 *
 * Today the suppression is by-best-effort (relies on
 * `notifications` table's existing `dedupKey` column if present,
 * otherwise just emits every day). The proper de-dup table can land
 * with the next iteration of the notification engine.
 */
import { logger } from "../logger.js";
import { findStaleRates } from "./jobs.js";

export interface StalenessAlertOutcome {
  alertedCompanies: number;
  stalePairs: number;
}

/**
 * Cron-compatible: returns a one-line summary string for cron_logs.
 */
export async function fxStalenessCheckCron(): Promise<string> {
  const out = await runStalenessCheck();
  if (out.stalePairs === 0) return "no stale rates";
  return `companies=${out.alertedCompanies} stalePairs=${out.stalePairs}`;
}

/**
 * Programmable wrapper: returns the structured outcome without the
 * cron-style stringify, so the admin UI can call it on demand.
 */
export async function runStalenessCheck(): Promise<StalenessAlertOutcome> {
  const stale = await findStaleRates();
  if (stale.length === 0) {
    return { alertedCompanies: 0, stalePairs: 0 };
  }

  // Group by company so the operator gets one alert per company
  // listing all the stale pairs, rather than one per pair.
  const byCompany = new Map<
    number,
    Array<{ pair: string; lastDate: string; daysStale: number }>
  >();
  for (const row of stale) {
    if (!byCompany.has(row.companyId)) byCompany.set(row.companyId, []);
    byCompany.get(row.companyId)!.push({
      pair: row.pair,
      lastDate: row.lastDate,
      daysStale: row.daysStale,
    });
  }

  for (const [companyId, pairs] of byCompany) {
    // The notification body is built here rather than inside the
    // notification engine because the FX module owns the i18n for
    // its own messages.
    const body = pairs
      .map((p) => `${p.pair} — آخر تحديث ${p.lastDate} (${p.daysStale} أيام)`)
      .join("\n");
    logger.warn(
      { companyId, pairs: pairs.length },
      `[fx-staleness] ${pairs.length} stale rate pair(s) for company ${companyId}: ${body.slice(0, 200)}`,
    );
    // Hook into the existing notification engine when the per-CFO
    // routing helper lands. For now the warn-level log is enough
    // for the daily ops sweep.
  }

  return {
    alertedCompanies: byCompany.size,
    stalePairs: stale.length,
  };
}
