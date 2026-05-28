/**
 * Telematics cron handlers — issue #1354 hardening commit 2/3.
 * ─────────────────────────────────────────────────────────────────────────
 * Three jobs, registered in cronScheduler.ts:
 *
 *   1. `fleet_telematics_retention` (daily 03:00)
 *      Deletes fleet_device_positions older than
 *      `integration.positionRetentionDays` (default 90), and
 *      fleet_device_sync_logs older than `syncLogRetentionDays` (30).
 *      Also marks fleet_video_sessions with expiresAt < now() as
 *      'expired' so the active session count doesn't drift.
 *
 *   2. `fleet_telematics_heartbeat` (every 2 minutes)
 *      Passive offline detection. Any device whose `lastPositionAt` is
 *      older than `offlineThresholdSec` (default 600s = 10 min) and is
 *      currently 'online' gets flipped to 'offline' and emits a
 *      fleet.telematics.device.offline event. The complement — a device
 *      that just sent a position — was already handled by persistPosition
 *      (it sets status='online' on each insert).
 *
 *   3. `fleet_telematics_poll` (commit 3/3 — added in same module so
 *      operators have one place to look)
 *
 * Each handler is exported as `async (): Promise<string>` to match the
 * CronJobDef.handler contract used by cronScheduler.
 */
import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import { emitEvent } from "../businessHelpers.js";

interface RetentionRow {
  id: number;
  companyId: number;
  positionRetentionDays: number;
  syncLogRetentionDays: number;
}

interface HeartbeatRow {
  id: number;
  companyId: number;
  branchId: number | null;
  vehicleId: number | null;
  lastPositionAt: Date | null;
  offlineThresholdSec: number;
}

/**
 * Retention sweep. Runs per integration so per-tenant retention windows
 * are respected — a customer that wants 1-year history just bumps their
 * own integration row.
 */
export async function fleetTelematicsRetention(): Promise<string> {
  const integrations = await rawQuery<RetentionRow>(
    `SELECT i.id, i."companyId",
            i."positionRetentionDays", i."syncLogRetentionDays"
       FROM fleet_telematics_integrations i
       WHERE i."deletedAt" IS NULL`,
  );

  let positionsDeleted = 0;
  let logsDeleted = 0;
  let videosExpired = 0;

  for (const integ of integrations) {
    try {
      const posRes = await rawExecute(
        `DELETE FROM fleet_device_positions
           WHERE "companyId" = $1
             AND "occurredAt" < NOW() - make_interval(days => $2)`,
        [integ.companyId, integ.positionRetentionDays],
      );
      positionsDeleted += posRes.affectedRows ?? 0;

      const logRes = await rawExecute(
        `DELETE FROM fleet_device_sync_logs
           WHERE "companyId" = $1
             AND "startedAt" < NOW() - make_interval(days => $2)`,
        [integ.companyId, integ.syncLogRetentionDays],
      );
      logsDeleted += logRes.affectedRows ?? 0;
    } catch (err) {
      logger.error(
        { err, integrationId: integ.id, companyId: integ.companyId },
        "[telematicsCron] retention sweep failed for integration",
      );
    }
  }

  // Video session cleanup is global — expiry is intrinsic to the session
  // row, not the integration, so we don't iterate by tenant.
  try {
    const vidRes = await rawExecute(
      `UPDATE fleet_video_sessions
          SET status = 'expired', "endedAt" = COALESCE("endedAt", NOW())
        WHERE status = 'active'
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" < NOW()`,
      [],
    );
    videosExpired = vidRes.affectedRows ?? 0;
  } catch (err) {
    logger.error({ err }, "[telematicsCron] video expiry sweep failed");
  }

  return `retention: ${positionsDeleted} positions + ${logsDeleted} sync_logs deleted, ${videosExpired} video sessions expired`;
}

/**
 * Passive offline detection. Any device whose last position is older than
 * its configured `offlineThresholdSec` AND currently shows 'online' gets
 * marked offline and emits the canonical device.offline event so any
 * downstream listener (alerts, exec dashboard) sees the transition.
 */
export async function fleetTelematicsHeartbeat(): Promise<string> {
  const stale = await rawQuery<HeartbeatRow>(
    `SELECT d.id, d."companyId", d."branchId", d."vehicleId",
            d."lastPositionAt",
            COALESCE(i."offlineThresholdSec", 600) AS "offlineThresholdSec"
       FROM fleet_telematics_devices d
       LEFT JOIN fleet_telematics_integrations i ON i.id = d."integrationId"
       WHERE d."deletedAt" IS NULL
         AND d.status = 'online'
         AND d."lastPositionAt" IS NOT NULL
         AND d."lastPositionAt" < NOW() - make_interval(secs => COALESCE(i."offlineThresholdSec", 600))`,
  );

  let flipped = 0;
  for (const row of stale) {
    try {
      await rawExecute(
        `UPDATE fleet_telematics_devices
            SET status = 'offline', "lastOfflineAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND status = 'online'`,
        [row.id],
      );
      flipped++;
      await emitEvent({
        companyId: row.companyId,
        branchId: row.branchId ?? undefined,
        userId: null,
        action: "fleet.telematics.device.offline",
        entity: "fleet_telematics_devices",
        entityId: row.id,
        details: `جهاز #${row.id} لم يرسل موقعًا منذ أكثر من ${row.offlineThresholdSec} ث`,
        after: {
          deviceId: row.id,
          vehicleId: row.vehicleId,
          lastSeenAt: row.lastPositionAt?.toISOString() ?? null,
        },
      });
    } catch (err) {
      logger.error(
        { err, deviceId: row.id },
        "[telematicsCron] heartbeat flip failed",
      );
    }
  }

  return `heartbeat: ${flipped} device(s) flipped to offline`;
}
