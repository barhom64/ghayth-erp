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
import {
  executeWithRetry,
  telematicsBreaker,
  CircuitOpenError,
} from "./telematicsReliability.js";
import {
  persistPosition,
  logSync,
  buildAdapter,
  type DeviceRow,
  type IntegrationRow,
} from "../../routes/fleet-telematics.js";

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
    // Two-pass cleanup: (1) close expired sessions and clear their
    // proxy tokens so a leaked URL can never resurrect; (2) clear
    // any stale token on an already-non-active session as a safety
    // net for paths that closed without clearing.
    const vidRes = await rawExecute(
      `UPDATE fleet_video_sessions
          SET status = 'expired',
              "endedAt" = COALESCE("endedAt", NOW()),
              "streamProxyToken" = NULL,
              "streamProxyExpiresAt" = NULL
        WHERE status = 'active'
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" < NOW()`,
      [],
    );
    videosExpired = vidRes.affectedRows ?? 0;
    await rawExecute(
      `UPDATE fleet_video_sessions
          SET "streamProxyToken" = NULL,
              "streamProxyExpiresAt" = NULL
        WHERE status <> 'active' AND "streamProxyToken" IS NOT NULL`,
      [],
    );
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

const POLL_RUN_INTERVAL_SEC = 60;

/**
 * Auto-poll handler. Runs every minute. For each active CMSV6 integration
 * whose `pollIntervalSec` window has elapsed since `lastSyncAt`, pulls
 * latest positions for all linked devices, applies retry-with-backoff,
 * and routes failures through the circuit breaker so a dead vendor
 * doesn't drag every subsequent cron tick into a 15-second hang.
 *
 * Sensor / event / alarm pulls run on a slower cadence (5x the position
 * interval, capped at 5min) because they are mostly server-pushed via
 * webhook in production; polling is the safety net.
 */
export async function fleetTelematicsPoll(): Promise<string> {
  const integrations = await rawQuery<IntegrationRow>(
    `SELECT * FROM fleet_telematics_integrations
      WHERE "deletedAt" IS NULL AND status = 'active'`,
  );

  if (integrations.length === 0) {
    return "poll: no active integrations";
  }

  let attempted = 0;
  let succeeded = 0;
  let breakerSkipped = 0;
  let totalCreated = 0;

  for (const integ of integrations) {
    // Honour the per-tenant cadence: if it's only been 10s and the
    // operator picked a 60s interval, skip this tick.
    const lastSync = integ.lastSyncAt ? new Date(integ.lastSyncAt).getTime() : 0;
    const dueAt = lastSync + Math.max(POLL_RUN_INTERVAL_SEC, integ.pollIntervalSec) * 1000;
    if (Date.now() < dueAt) continue;

    if (telematicsBreaker.isOpen(integ.id)) {
      breakerSkipped++;
      continue;
    }

    attempted++;

    // Single source of truth for credential decryption + adapter
    // construction — the same path the routes use. The previous
    // implementation duplicated decryption here, which the engineering
    // review flagged as #6.
    const adapter = buildAdapter(integ);
    if (!adapter) {
      logger.warn(
        { integrationId: integ.id },
        "[telematicsPoll] integration missing credentials — skipping",
      );
      continue;
    }

    const devices = await rawQuery<DeviceRow>(
      `SELECT * FROM fleet_telematics_devices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status <> 'decommissioned'`,
      [integ.companyId],
    );
    if (devices.length === 0) continue;

    const devByNo = new Map(devices.map((d) => [d.cmsv6DeviceNo, d]));

    let created = 0;
    let processed = 0;
    const started = Date.now();
    try {
      await telematicsBreaker.execute(integ.id, async () => {
        const positions = await executeWithRetry(
          () => adapter.getLatestPositions(Array.from(devByNo.keys())),
          { maxAttempts: 3 },
        );
        processed = positions.length;
        for (const p of positions) {
          const dev = devByNo.get(p.cmsv6DeviceNo);
          if (!dev) continue;
          if (await persistPosition(integ.companyId, integ.branchId, dev, p)) created++;
        }
      });

      await rawExecute(
        `UPDATE fleet_telematics_integrations
            SET "lastSyncAt" = NOW(),
                "lastSyncStatus" = 'success',
                "lastSyncError" = NULL
          WHERE id = $1`,
        [integ.id],
      );
      void logSync({
        companyId: integ.companyId,
        integrationId: integ.id,
        operation: "cron_poll_positions",
        status: "success",
        durationMs: Date.now() - started,
        itemsProcessed: processed,
        itemsCreated: created,
      });

      succeeded++;
      totalCreated += created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCircuit = err instanceof CircuitOpenError;
      if (!isCircuit) {
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(),
                  "lastSyncStatus" = 'failure',
                  "lastSyncError" = $1
            WHERE id = $2`,
          [msg.slice(0, 1000), integ.id],
        );
      }
      void logSync({
        companyId: integ.companyId,
        integrationId: integ.id,
        operation: "cron_poll_positions",
        status: isCircuit ? "skipped" : "failure",
        durationMs: Date.now() - started,
        message: msg,
      });
      if (!isCircuit) {
        logger.error(
          { err, integrationId: integ.id },
          "[telematicsPoll] integration sync failed",
        );
      }
    }
  }

  return `poll: ${attempted} attempted, ${succeeded} ok, ${breakerSkipped} breaker-skipped, ${totalCreated} positions created`;
}
