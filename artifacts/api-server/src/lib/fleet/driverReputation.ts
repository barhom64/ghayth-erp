/**
 * Driver Reputation Scoring — TA-T18-DR (audit file 20 §10).
 *
 * Computes and persists a reputation score per driver from their
 * recent dispatch-order history. The formula was set by the owner:
 *
 *   reputationScore = 0.4·onTimeRate + 0.4·completionRate + 0.2·startRate
 *
 * Where (within a configurable lookback window, default 90 days):
 *
 *   • onTimeRate     — among COMPLETED orders, fraction whose
 *                       `startedAt` was within the on-time tolerance
 *                       of `scheduledStartAt`. Lateness is mostly the
 *                       driver's responsibility once the order is
 *                       accepted — operator delay before `acceptedAt`
 *                       is filtered out by anchoring on `startedAt`.
 *
 *   • completionRate — completed / (completed + driver-cancelled +
 *                       declined). Pure operator cancellations are
 *                       excluded so a driver isn't punished for the
 *                       customer changing their mind.
 *
 *   • startRate      — started / (started + declined + driver-cancelled).
 *                       Catches drivers who repeatedly accept then no-show.
 *
 * All three components are returned on a 0..100 scale (NULL when the
 * driver has zero qualifying orders in the window — fresh hires).
 *
 * Phase 1 (this PR): storage + compute service + read API.
 * Phase 2 (next PR): engine integration as a scoring axis with
 * rebalanced weights.
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";

const DEFAULT_WINDOW_DAYS = 90;
/** On-time tolerance: a start within this many minutes of scheduled
 *  is considered "on time". 15 minutes matches the dispatch dashboard
 *  late-threshold (routes/transport-planning.ts:259). */
const ON_TIME_TOLERANCE_MINUTES = 15;

/** Weighted blend per the audit doc — must sum to 1.0. */
export const REPUTATION_WEIGHTS = {
  onTime: 0.4,
  completion: 0.4,
  startRate: 0.2,
} as const;

export interface DriverReputation {
  driverId: number;
  reputationScore: number | null;
  onTimeRate: number | null;
  completionRate: number | null;
  startRate: number | null;
  tripsConsidered: number;
  computedAt: string;
}

/**
 * Recompute one driver's reputation from their dispatch-order history.
 * Persists the result on `fleet_drivers` and returns the breakdown
 * for the caller to display.
 */
export async function computeDriverReputation(args: {
  companyId: number;
  driverId: number;
  windowDays?: number;
}): Promise<DriverReputation> {
  const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;

  // Single aggregate pass — read every order in the window, classify
  // by status + start-vs-schedule, return the three counters the
  // formula consumes.
  const [counts] = await rawQuery<{
    completed_total: number;
    completed_on_time: number;
    started_total: number;
    cancelled_or_declined: number;
    qualifying_total: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('completed', 'closed'))::int
         AS completed_total,
       COUNT(*) FILTER (
         WHERE status IN ('completed', 'closed')
           AND "startedAt" IS NOT NULL
           AND EXTRACT(EPOCH FROM ("startedAt" - "scheduledStartAt")) / 60
               <= $3
       )::int AS completed_on_time,
       COUNT(*) FILTER (
         WHERE "startedAt" IS NOT NULL
           AND status NOT IN ('declined', 'cancelled')
       )::int AS started_total,
       COUNT(*) FILTER (WHERE status IN ('declined', 'cancelled'))::int
         AS cancelled_or_declined,
       COUNT(*) FILTER (
         WHERE status IN ('completed', 'closed', 'declined', 'cancelled')
       )::int AS qualifying_total
       FROM transport_dispatch_orders
      WHERE "companyId" = $1
        AND "driverId"  = $2
        AND "scheduledStartAt" >= NOW() - ($4 || ' days')::interval`,
    [args.companyId, args.driverId, ON_TIME_TOLERANCE_MINUTES, String(windowDays)],
  );

  const completedTotal      = counts?.completed_total ?? 0;
  const completedOnTime     = counts?.completed_on_time ?? 0;
  const startedTotal        = counts?.started_total ?? 0;
  const cancelledOrDeclined = counts?.cancelled_or_declined ?? 0;
  const qualifyingTotal     = counts?.qualifying_total ?? 0;

  // Guards against divide-by-zero — fresh hires (zero qualifying
  // orders) return NULL across the board so the engine treats them
  // as neutral.
  let onTimeRate: number | null = null;
  let completionRate: number | null = null;
  let startRate: number | null = null;
  let reputationScore: number | null = null;

  if (completedTotal > 0) {
    onTimeRate = round2((completedOnTime / completedTotal) * 100);
  }
  // `completion = completed / (completed + cancelled + declined)`.
  // Driver lost completion credit for accepting then bailing.
  if (qualifyingTotal > 0) {
    completionRate = round2((completedTotal / qualifyingTotal) * 100);
  }
  // `start = started / (started + cancelled + declined)`. A driver
  // who declined twice for every job they actually started has a
  // 33% start rate.
  const startDenominator = startedTotal + cancelledOrDeclined;
  if (startDenominator > 0) {
    startRate = round2((startedTotal / startDenominator) * 100);
  }
  if (onTimeRate !== null && completionRate !== null && startRate !== null) {
    reputationScore = round2(
      REPUTATION_WEIGHTS.onTime      * onTimeRate +
      REPUTATION_WEIGHTS.completion  * completionRate +
      REPUTATION_WEIGHTS.startRate   * startRate,
    );
  }

  // Persist. Even when all three components are NULL we update
  // `reputationComputedAt` + `reputationTripsConsidered` so the SPA
  // can show "computed 5 min ago — no trips in window" instead of a
  // misleading "never computed".
  await rawExecute(
    `UPDATE fleet_drivers
        SET "reputationScore"           = $3,
            "reputationOnTimeRate"      = $4,
            "reputationCompletionRate"  = $5,
            "reputationStartRate"       = $6,
            "reputationTripsConsidered" = $7,
            "reputationComputedAt"      = NOW(),
            "updatedAt"                 = NOW()
      WHERE id = $2 AND "companyId" = $1`,
    [
      args.companyId, args.driverId,
      reputationScore, onTimeRate, completionRate, startRate,
      qualifyingTotal,
    ],
  );

  return {
    driverId: args.driverId,
    reputationScore,
    onTimeRate,
    completionRate,
    startRate,
    tripsConsidered: qualifyingTotal,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Bulk-recompute every active driver in the company. Safe to invoke
 * from a cron or an admin action — runs sequentially to avoid
 * starving the DB connection pool, and swallows per-driver errors
 * so one bad row doesn't kill the whole batch.
 */
export async function recomputeAllDrivers(args: {
  companyId: number;
  windowDays?: number;
}): Promise<{ total: number; succeeded: number; failed: number }> {
  const drivers = await rawQuery<{ id: number }>(
    `SELECT id FROM fleet_drivers
      WHERE "companyId" = $1 AND "deletedAt" IS NULL
      ORDER BY id`,
    [args.companyId],
  );

  let succeeded = 0;
  let failed = 0;
  for (const driver of drivers) {
    try {
      await computeDriverReputation({
        companyId: args.companyId,
        driverId: driver.id,
        windowDays: args.windowDays,
      });
      succeeded++;
    } catch (err) {
      failed++;
      logger.warn(
        { err, driverId: driver.id, companyId: args.companyId },
        "[driverReputation] per-driver recompute failed",
      );
    }
  }
  return { total: drivers.length, succeeded, failed };
}

/**
 * Read the current persisted reputation for a driver. Doesn't
 * recompute — the caller decides when to refresh. Returns null if
 * the driver doesn't exist or is soft-deleted.
 */
export async function loadDriverReputation(
  companyId: number, driverId: number,
): Promise<DriverReputation | null> {
  const [row] = await rawQuery<{
    reputationScore: string | null;
    reputationOnTimeRate: string | null;
    reputationCompletionRate: string | null;
    reputationStartRate: string | null;
    reputationTripsConsidered: number | null;
    reputationComputedAt: string | null;
  }>(
    `SELECT "reputationScore", "reputationOnTimeRate",
            "reputationCompletionRate", "reputationStartRate",
            "reputationTripsConsidered", "reputationComputedAt"
       FROM fleet_drivers
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [driverId, companyId],
  );
  if (!row) return null;
  return {
    driverId,
    reputationScore:  row.reputationScore  != null ? Number(row.reputationScore)  : null,
    onTimeRate:       row.reputationOnTimeRate     != null ? Number(row.reputationOnTimeRate)     : null,
    completionRate:   row.reputationCompletionRate != null ? Number(row.reputationCompletionRate) : null,
    startRate:        row.reputationStartRate      != null ? Number(row.reputationStartRate)      : null,
    tripsConsidered:  row.reputationTripsConsidered ?? 0,
    computedAt:       row.reputationComputedAt ?? "",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
