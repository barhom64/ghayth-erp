/**
 * TA-GAP-09 Phase 1 — Maps Quota Monitoring (counter service).
 *
 * Records every outbound call MapsService makes to a real provider
 * (google_maps, mapbox, …) into a per-day, per-(provider, apiSurface),
 * per-company counter — without ever blocking the underlying request
 * on a counter-write failure.
 *
 * Counted on OUR side, never via the upstream Billing API: caps and
 * alerts fire regardless of whether the Google Cloud Console is
 * shared / consolidated / accessible.
 *
 * Phase 1 (this file) records the counter. The dashboard route + the
 * alert cron land in Phase 2 (a follow-up PR) so the surface stays
 * small and reviewable.
 */

import { rawExecute, rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";

export interface MapsCallRecord {
  companyId: number;
  /** The map provider that actually handled the call ("google_maps", "mapbox", …). */
  provider: string;
  /** Which MapsService method consumed the call ("estimateRoute", "geocode", …). */
  apiSurface: string;
  /** True if the call errored out — counts toward errorCount on top of callCount. */
  errored?: boolean;
}

/**
 * Best-effort increment of the daily counter for a single call.
 *
 * Hard contract: this function NEVER throws. A counter outage cannot
 * be allowed to break a route estimate or block a dispatch flow — the
 * counter is observability, not the system of record.
 *
 * Implementation: UPSERT on the unique (companyId, callDate, provider,
 * apiSurface) key. The `ON CONFLICT … DO UPDATE` atomically increments
 * the count so concurrent calls don't lose updates.
 */
export async function recordMapsCall(rec: MapsCallRecord): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO maps_usage_daily_counters
         ("companyId", "callDate", provider, "apiSurface",
          "callCount", "errorCount", "createdAt", "updatedAt")
       VALUES ($1, CURRENT_DATE, $2, $3, 1, $4, NOW(), NOW())
       ON CONFLICT ("companyId", "callDate", provider, "apiSurface")
       DO UPDATE SET
         "callCount"  = maps_usage_daily_counters."callCount"  + 1,
         "errorCount" = maps_usage_daily_counters."errorCount" + EXCLUDED."errorCount",
         "updatedAt"  = NOW()`,
      [rec.companyId, rec.provider, rec.apiSurface, rec.errored ? 1 : 0],
    );
  } catch (err) {
    // Best-effort write — log and swallow so the route estimate keeps
    // going. A counter outage is observability noise, not a user-facing
    // failure.
    logger.warn(
      { err, companyId: rec.companyId, provider: rec.provider, apiSurface: rec.apiSurface },
      "[mapsUsageCounter] counter write failed",
    );
  }
}

export interface MapsUsageRow {
  callDate: string;
  provider: string;
  apiSurface: string;
  callCount: number;
  errorCount: number;
}

/**
 * Read the last N days of usage for a company. Used by the dashboard
 * route (Phase 2) to chart consumption against the configured cap.
 */
export async function loadMapsUsage(args: {
  companyId: number;
  /** How many days back to scan, capped at 366. Defaults to 30. */
  days?: number;
}): Promise<MapsUsageRow[]> {
  const days = Math.min(Math.max(args.days ?? 30, 1), 366);
  return await rawQuery<MapsUsageRow>(
    `SELECT "callDate"::text AS "callDate",
            provider,
            "apiSurface",
            "callCount",
            "errorCount"
       FROM maps_usage_daily_counters
      WHERE "companyId" = $1
        AND "callDate" >= CURRENT_DATE - ($2 || ' days')::interval
      ORDER BY "callDate" DESC, provider, "apiSurface"`,
    [args.companyId, String(days)],
  );
}
