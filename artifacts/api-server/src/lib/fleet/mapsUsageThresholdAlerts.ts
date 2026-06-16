/**
 * TA-GAP-09 Phase 3 — maps quota threshold checker + dedupe.
 *
 * Phase 1 (#2439) recorded counts. Phase 2 (#2449) exposed them.
 * Phase 3 closes the loop: when the operator sets a per-company cap
 * (daily or monthly), this lib's `runThresholdAlertCheck` (invoked
 * by the cron scheduler) compares the current window's call count
 * to the cap and, if 80% (warning) or 100% (critical) is crossed,
 * emits a `fleet.maps_usage.threshold_breached` event ONCE per
 * (threshold, level, window) — the alerts table is the dedupe key.
 *
 * Design contract:
 *   - The checker is OBSERVABILITY. It reads counters + writes
 *     alert rows. It NEVER blocks an outbound Google call.
 *   - Idempotent: re-running the cron over the same window is a
 *     no-op after the first alert fires for each level.
 *   - Owner brief: alerts must be "loud once, quiet after" — the
 *     unique constraint on (thresholdId, level, windowKey) enforces
 *     this without an in-process state machine.
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import { emitEvent } from "../businessHelpers.js";

export interface ThresholdRow {
  id: number;
  companyId: number;
  period: "daily" | "monthly";
  callCountThreshold: number;
  warningPct: number;
  isActive: boolean;
  notes: string | null;
}

export interface AlertOutcome {
  thresholdId: number;
  level: "warning" | "critical";
  windowKey: string;
  callCount: number;
  threshold: number;
  emitted: boolean;
}

/**
 * Compute the YYYY-MM-DD key + the SQL date range that defines a
 * threshold's measurement window. Daily = today; monthly = the
 * trailing 30 calendar days (so a partial month at month-start
 * still triggers the cap if the previous month's tail was hot).
 */
export function windowKeyFor(
  period: "daily" | "monthly",
  today: Date,
): { key: string; fromIso: string; toIso: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const today0 = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (period === "daily") {
    return { key: today0, fromIso: today0, toIso: today0 };
  }
  // monthly = trailing 30 days inclusive of today
  const from = new Date(today.getTime());
  from.setDate(from.getDate() - 29);
  const fromIso = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  return { key: fromIso, fromIso, toIso: today0 };
}

/**
 * Read the call-count sum across all providers/apiSurfaces for a
 * company within the threshold's window. Phase 3 measures total
 * outbound spend (not per-provider) since the cap is the operator's
 * money cap, not a per-provider metric.
 */
async function loadWindowCallCount(args: {
  companyId: number;
  fromIso: string;
  toIso: string;
}): Promise<number> {
  const [row] = await rawQuery<{ total: string | null }>(
    `SELECT COALESCE(SUM("callCount"), 0)::text AS total
       FROM maps_usage_daily_counters
      WHERE "companyId" = $1
        AND "callDate" >= $2::date
        AND "callDate" <= $3::date`,
    [args.companyId, args.fromIso, args.toIso],
  );
  return Number(row?.total ?? "0");
}

/**
 * Check ONE threshold against the current window and, if it crossed
 * a level (80% or 100%) that hasn't been alerted for this window
 * yet, INSERT the dedupe row + emit the event.
 *
 * Returns the outcome for observability. `emitted=false` means we
 * crossed a level but had already alerted on it (dedupe kicked in).
 */
export async function checkOneThreshold(threshold: ThresholdRow, now: Date): Promise<AlertOutcome[]> {
  const { key, fromIso, toIso } = windowKeyFor(threshold.period, now);
  const callCount = await loadWindowCallCount({
    companyId: threshold.companyId,
    fromIso,
    toIso,
  });
  const outcomes: AlertOutcome[] = [];
  const warningCount = Math.ceil((threshold.callCountThreshold * threshold.warningPct) / 100);
  // Two levels: warning at warningPct, critical at 100%.
  const levels: Array<{ level: "warning" | "critical"; crossedAt: number }> = [
    { level: "warning",  crossedAt: warningCount },
    { level: "critical", crossedAt: threshold.callCountThreshold },
  ];
  for (const { level, crossedAt } of levels) {
    if (callCount < crossedAt) continue;
    // ON CONFLICT DO NOTHING — only the FIRST insert for a window
    // emits the event; later re-runs see the row + skip.
    const { affectedRows } = await rawExecute(
      `INSERT INTO maps_usage_threshold_alerts
         ("companyId", "thresholdId", level, "windowKey",
          "triggeredCallCount", "thresholdValueAtTrigger", "alertedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("thresholdId", level, "windowKey") DO NOTHING`,
      [
        threshold.companyId,
        threshold.id,
        level,
        key,
        callCount,
        threshold.callCountThreshold,
      ],
    );
    const emitted = (affectedRows ?? 0) > 0;
    if (emitted) {
      emitEvent({
        companyId: threshold.companyId,
        userId: null,
        action: "fleet.maps_usage.threshold_breached",
        entity: "maps_usage_thresholds",
        entityId: threshold.id,
        details: JSON.stringify({
          level,
          period: threshold.period,
          windowKey: key,
          callCount,
          threshold: threshold.callCountThreshold,
          warningPct: threshold.warningPct,
        }),
      }).catch((e) =>
        logger.warn({ err: e, thresholdId: threshold.id }, "[mapsUsageThresholdAlerts] emit failed"),
      );
    }
    outcomes.push({
      thresholdId: threshold.id,
      level,
      windowKey: key,
      callCount,
      threshold: threshold.callCountThreshold,
      emitted,
    });
  }
  return outcomes;
}

/**
 * Public cron entry point — sweeps every active threshold for every
 * company and runs the check. Errors per threshold are isolated:
 * one bad row never breaks the sweep.
 */
export async function runThresholdAlertCheck(now: Date = new Date()): Promise<{
  thresholdsChecked: number;
  alertsEmitted: number;
}> {
  const thresholds = await rawQuery<ThresholdRow>(
    `SELECT id, "companyId", period, "callCountThreshold",
            "warningPct", "isActive", notes
       FROM maps_usage_thresholds
      WHERE "isActive" = TRUE`,
    [],
  );
  let alertsEmitted = 0;
  for (const t of thresholds) {
    try {
      const outcomes = await checkOneThreshold(t, now);
      alertsEmitted += outcomes.filter((o) => o.emitted).length;
    } catch (err) {
      // Defence in depth — a single bad row doesn't break the sweep.
      logger.warn({ err, thresholdId: t.id }, "[mapsUsageThresholdAlerts] one threshold failed");
    }
  }
  return { thresholdsChecked: thresholds.length, alertsEmitted };
}

// ── Storage helpers used by the SPA route handlers ──────────────────

export async function loadActiveThresholds(companyId: number): Promise<ThresholdRow[]> {
  return await rawQuery<ThresholdRow>(
    `SELECT id, "companyId", period, "callCountThreshold",
            "warningPct", "isActive", notes
       FROM maps_usage_thresholds
      WHERE "companyId" = $1 AND "isActive" = TRUE
      ORDER BY period`,
    [companyId],
  );
}

export async function upsertThreshold(args: {
  companyId: number;
  period: "daily" | "monthly";
  callCountThreshold: number;
  warningPct?: number;
  notes?: string | null;
  createdBy: number;
}): Promise<{ id: number }> {
  // Soft-deactivate prior active row in the same (companyId, period)
  // slot, then INSERT the new one. Keeps history of prior caps.
  await rawExecute(
    `UPDATE maps_usage_thresholds
        SET "isActive" = FALSE, "updatedAt" = NOW()
      WHERE "companyId" = $1 AND period = $2 AND "isActive" = TRUE`,
    [args.companyId, args.period],
  );
  const { insertId } = await rawExecute(
    `INSERT INTO maps_usage_thresholds
       ("companyId", period, "callCountThreshold", "warningPct",
        "isActive", notes, "createdBy", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, TRUE, $5, $6, NOW(), NOW())`,
    [
      args.companyId,
      args.period,
      args.callCountThreshold,
      args.warningPct ?? 80,
      args.notes ?? null,
      args.createdBy,
    ],
  );
  if (!insertId) {
    throw new Error("failed to insert maps_usage_thresholds row");
  }
  return { id: insertId };
}
