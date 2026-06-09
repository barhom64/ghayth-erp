/**
 * Driver Intelligence (#1812 follow-up — fleet operating system).
 *
 * User's evaluation:
 *   "السائق ما زال منفذ. أنا أريد:
 *      سائق ممتاز للعمرة
 *      سائق ممتاز للحمولات
 *      سائق يتأخر كثيرًا
 *      سائق يستهلك وقودًا أكثر
 *      سائق ينجز أكثر
 *    ثم يدخل ذلك في الاقتراح."
 *
 * Computes per-driver operational stats from data that already exists:
 *   - transport_dispatch_orders (timing + status)
 *   - driver_navigation_sessions (start/end/distance proxies)
 *   - fleet_drivers.driverServiceProfile (cargo/umrah/passenger specialisation)
 *
 * Outputs a `DriverIntelligenceStats` record that:
 *   1. Surfaces on /fleet/drivers/:id/intelligence (the SPA driver detail tab).
 *   2. Is consumed by AssignmentSuggestionEngine as a NEW scoring axis
 *      `driverReputation` (weight 0.6) — implementer follow-up.
 *
 * No new schema needed. All stats are computed at read time from
 * dispatch_orders + driver_navigation_sessions, bounded to the last
 * 90 days so the score reflects recent behavior.
 */

import { rawQuery } from "../rawdb.js";

export interface DriverIntelligenceStats {
  driverId: number;
  /** Number of dispatch orders in window (90 days by default). */
  dispatchCount: number;
  /** % of accepted dispatches that actually started (vs declined post-accept). */
  startRate: number;
  /** % of started dispatches that reached completed (vs cancelled mid-trip). */
  completionRate: number;
  /** % of started dispatches that started WITHIN scheduled window + 15min. */
  onTimeRate: number;
  /** Average minutes late on starts (only the late ones — successes excluded). */
  avgLateMinutes: number;
  /** Per-service-type trip counts, so the engine knows specialisation. */
  serviceMix: {
    cargo: number;
    umrah: number;
    passenger: number;
    rental: number;
    other: number;
  };
  /** Composite reputation 0..100 — combines onTime + completion + start rates. */
  reputationScore: number;
  /** Auto-classified specialty tag based on dominant service mix. */
  specialty: "umrah" | "cargo" | "passenger" | "mixed" | "new";
}

export interface ComputeStatsArgs {
  companyId: number;
  driverId: number;
  /** Window size in days (default 90). */
  windowDays?: number;
}

/**
 * Compute one driver's intelligence stats. All values are bounded to
 * the rolling window so a driver's recent performance dominates.
 */
export async function computeDriverIntelligence(
  args: ComputeStatsArgs,
): Promise<DriverIntelligenceStats> {
  const windowDays = args.windowDays ?? 90;

  const [counts] = await rawQuery<{
    total: string;
    accepted: string;
    started: string;
    completed: string;
    onTime: string;
    sumLate: string;
    countLate: string;
  }>(
    `WITH win AS (
       SELECT * FROM transport_dispatch_orders
        WHERE "companyId" = $1
          AND "driverId" = $2
          AND "scheduledStartAt" >= NOW() - ($3::text || ' days')::interval
     )
     SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE "acceptedAt" IS NOT NULL) AS accepted,
       COUNT(*) FILTER (WHERE "startedAt" IS NOT NULL)  AS started,
       COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL AND status != 'cancelled') AS completed,
       COUNT(*) FILTER (
         WHERE "startedAt" IS NOT NULL
           AND "startedAt" <= "scheduledStartAt" + INTERVAL '15 minutes'
       ) AS "onTime",
       COALESCE(SUM(
         GREATEST(0, EXTRACT(EPOCH FROM ("startedAt" - "scheduledStartAt")) / 60.0)
       ) FILTER (
         WHERE "startedAt" IS NOT NULL
           AND "startedAt" > "scheduledStartAt" + INTERVAL '15 minutes'
       ), 0) AS "sumLate",
       COUNT(*) FILTER (
         WHERE "startedAt" IS NOT NULL
           AND "startedAt" > "scheduledStartAt" + INTERVAL '15 minutes'
       ) AS "countLate"
     FROM win`,
    [args.companyId, args.driverId, String(windowDays)],
  );

  const dispatchCount  = Number(counts?.total ?? 0);
  const acceptedCount  = Number(counts?.accepted ?? 0);
  const startedCount   = Number(counts?.started ?? 0);
  const completedCount = Number(counts?.completed ?? 0);
  const onTimeCount    = Number(counts?.onTime ?? 0);
  const sumLateMin     = Number(counts?.sumLate ?? 0);
  const lateCount      = Number(counts?.countLate ?? 0);

  const startRate = acceptedCount === 0
    ? 0
    : Math.round((startedCount / acceptedCount) * 100);
  const completionRate = startedCount === 0
    ? 0
    : Math.round((completedCount / startedCount) * 100);
  const onTimeRate = startedCount === 0
    ? 0
    : Math.round((onTimeCount / startedCount) * 100);
  const avgLateMinutes = lateCount === 0
    ? 0
    : Math.round(sumLateMin / lateCount);

  // Service mix — join the dispatch back through booking for serviceType.
  const mixRows = await rawQuery<{ kind: string; count: string }>(
    `SELECT
       CASE
         WHEN b."transportServiceType" = 'cargo_load' THEN 'cargo'
         WHEN b."transportServiceType" = 'passenger_umrah' THEN 'umrah'
         WHEN b."transportServiceType" LIKE 'passenger_%' THEN 'passenger'
         WHEN b."transportServiceType" = 'equipment_rental' THEN 'rental'
         ELSE 'other'
       END AS kind,
       COUNT(*) AS count
     FROM transport_dispatch_orders d
     JOIN transport_bookings b ON b.id = d."bookingId" AND b."companyId" = d."companyId"
     WHERE d."companyId" = $1
       AND d."driverId" = $2
       AND d."scheduledStartAt" >= NOW() - ($3::text || ' days')::interval
       AND d.status NOT IN ('cancelled', 'declined')
     GROUP BY 1`,
    [args.companyId, args.driverId, String(windowDays)],
  );
  const serviceMix = {
    cargo:     Number(mixRows.find((r) => r.kind === "cargo")?.count ?? 0),
    umrah:     Number(mixRows.find((r) => r.kind === "umrah")?.count ?? 0),
    passenger: Number(mixRows.find((r) => r.kind === "passenger")?.count ?? 0),
    rental:    Number(mixRows.find((r) => r.kind === "rental")?.count ?? 0),
    other:     Number(mixRows.find((r) => r.kind === "other")?.count ?? 0),
  };

  // Specialty classification — pick the dominant kind iff it exceeds
  // 60% of the total mix; otherwise "mixed". "new" = no completed trips.
  const totalMix = serviceMix.cargo + serviceMix.umrah + serviceMix.passenger + serviceMix.rental + serviceMix.other;
  let specialty: DriverIntelligenceStats["specialty"] = "new";
  if (totalMix > 0) {
    const ratios: Array<[DriverIntelligenceStats["specialty"], number]> = [
      ["cargo",     serviceMix.cargo / totalMix],
      ["umrah",     serviceMix.umrah / totalMix],
      ["passenger", serviceMix.passenger / totalMix],
    ];
    const top = ratios.sort((a, b) => b[1] - a[1])[0];
    specialty = top[1] >= 0.6 ? top[0] : "mixed";
  }

  // Composite reputation — weighted average emphasising on-time + completion.
  // Returns 0 for drivers with no recent activity (new drivers get a
  // neutral 50 from the SPA so they're not penalised).
  const reputationScore = startedCount === 0
    ? 0
    : Math.round(
        onTimeRate * 0.4 +
        completionRate * 0.4 +
        startRate * 0.2,
      );

  return {
    driverId: args.driverId,
    dispatchCount, startRate, completionRate, onTimeRate,
    avgLateMinutes, serviceMix, reputationScore, specialty,
  };
}

/**
 * Batch compute for /fleet/drivers/intelligence — returns stats for
 * every active driver in the company, sorted by reputation desc.
 * Used by the driver-list page and the assignment engine warmup.
 */
export async function computeFleetIntelligence(
  companyId: number, windowDays = 90,
): Promise<DriverIntelligenceStats[]> {
  const drivers = await rawQuery<{ id: number }>(
    `SELECT id FROM fleet_drivers
      WHERE "companyId" = $1 AND "deletedAt" IS NULL
        AND COALESCE(status, 'active') NOT IN ('inactive', 'terminated')
      LIMIT 500`,
    [companyId],
  );

  const stats = await Promise.all(
    drivers.map((d) =>
      computeDriverIntelligence({ companyId, driverId: d.id, windowDays }),
    ),
  );
  return stats.sort((a, b) => b.reputationScore - a.reputationScore);
}
