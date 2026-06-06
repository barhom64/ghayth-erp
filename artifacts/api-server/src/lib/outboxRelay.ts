// ─────────────────────────────────────────────────────────────────────────────
// Outbox Relay — P2.1 of the workflow plan.
//
// Polls event_outbox for `status='pending'` rows, replays them through the
// in-process listeners via eventBus.dispatchFromOutbox(), and marks each row
// as 'processed' or 'failed_retry'. After OUTBOX_RELAY_MAX_ATTEMPTS the row
// gets promoted to 'dead' and stops being retried (the existing DLQ
// machinery handles the alert side).
//
// ⚠ Default OFF (config.outboxRelayActive). Until P2.2 (dedupe) lands, having
// the relay ON in parallel with the in-process emit chain causes double-
// dispatch. Use OUTBOX_RELAY_ACTIVE=true only in dev / staging until P2.2.
//
// Lives in lib/ (not routes/) because it's a worker subsystem, not an HTTP
// surface. worker.ts starts it; the API process never does.
// ─────────────────────────────────────────────────────────────────────────────

import { rawQuery, rawExecute } from "./rawdb.js";
import { eventBus, type EventName, type EventPayload } from "./eventBus.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { setGauge } from "./metrics.js";

interface OutboxRow {
  id: string; // bigint → JS string-of-int
  eventName: string;
  payload: EventPayload | null;
  attempts: number;
}

let relayTimer: NodeJS.Timeout | null = null;
let inFlight = false; // simple guard so we don't overlap ticks

/**
 * Pull `batchSize` pending rows ordered oldest-first. SKIP LOCKED so two
 * relay instances (one per worker replica) don't pick the same rows.
 */
async function fetchBatch(batchSize: number, maxAttempts: number): Promise<OutboxRow[]> {
  return rawQuery<OutboxRow>(
    `SELECT id::text AS id, "eventName", payload, attempts
       FROM event_outbox
      WHERE status = 'pending'
        AND attempts < $1
      ORDER BY "createdAt" ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [maxAttempts, batchSize],
  );
}

/**
 * Mark a row processed. Sets processedAt so a future query can compute
 * relay-to-processing latency.
 */
async function markProcessed(id: string): Promise<void> {
  await rawExecute(
    `UPDATE event_outbox
        SET status = 'processed',
            "processedAt" = now()
      WHERE id = $1::bigint`,
    [id],
  );
}

/**
 * Bump attempts + stash the error. After `maxAttempts` failures the row
 * gets promoted to 'dead'.
 */
async function markFailure(id: string, attemptsSoFar: number, err: unknown, maxAttempts: number): Promise<void> {
  const attemptsNew = attemptsSoFar + 1;
  const nextStatus = attemptsNew >= maxAttempts ? "dead" : "failed_retry";
  const errMsg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  await rawExecute(
    `UPDATE event_outbox
        SET status = $1,
            attempts = $2,
            "lastError" = $3
      WHERE id = $4::bigint`,
    [nextStatus, attemptsNew, errMsg.slice(0, 4000), id],
  );
  if (nextStatus === "dead") {
    logger.error({ outboxId: id, attempts: attemptsNew }, "[outbox-relay] row promoted to dead after max attempts");
  }
}

/**
 * Process one batch. Each row is dispatched on its own try/catch so a
 * single bad payload doesn't poison the tick.
 */
async function processBatch(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const batchSize = config.outboxRelayBatchSize;
  const maxAttempts = config.outboxRelayMaxAttempts;

  const rows = await fetchBatch(batchSize, maxAttempts);
  for (const row of rows) {
    try {
      // dispatchFromOutbox bypasses the captureToOutbox path so we don't
      // re-insert. The payload is already stamped (was stamped when the
      // emit() that produced this row ran).
      eventBus.dispatchFromOutbox(row.eventName as EventName, row.payload ?? undefined);
      await markProcessed(row.id);
      processed++;
    } catch (err) {
      await markFailure(row.id, row.attempts, err, maxAttempts).catch((dbErr) => {
        // If even the failure-marking UPDATE fails, just log — the
        // FOR UPDATE SKIP LOCKED above means another tick will pick
        // the row again once our row-level lock releases.
        logger.error(dbErr, "[outbox-relay] could not mark row as failed");
      });
      failed++;
    }
  }
  return { processed, failed };
}

/**
 * Public entry. Starts the polling loop. Idempotent — calling twice with
 * the timer already running is a no-op.
 */
export function startOutboxRelay(): void {
  if (relayTimer) {
    logger.warn("[outbox-relay] startOutboxRelay called but timer already running");
    return;
  }
  if (!config.outboxRelayActive) {
    logger.info("[outbox-relay] OUTBOX_RELAY_ACTIVE=false — relay NOT starting (default behaviour)");
    return;
  }
  if (config.isTest) {
    logger.info("[outbox-relay] skipped under test runner");
    return;
  }

  const intervalMs = config.outboxRelayIntervalMs;
  logger.warn(
    { intervalMs, batchSize: config.outboxRelayBatchSize, maxAttempts: config.outboxRelayMaxAttempts },
    "[outbox-relay] STARTING — until P2.2 dedupe lands this WILL double-dispatch events. Dev/staging only.",
  );

  const tick = async (): Promise<void> => {
    if (inFlight) return; // a slow query overlapped with the next interval
    inFlight = true;
    try {
      const { processed, failed } = await processBatch();
      if (processed > 0 || failed > 0) {
        logger.debug({ processed, failed }, "[outbox-relay] tick");
      }
      setGauge("outbox.relay.processed_per_tick", processed);
      setGauge("outbox.relay.failed_per_tick", failed);
    } catch (err) {
      logger.error(err, "[outbox-relay] tick errored");
    } finally {
      inFlight = false;
    }
  };

  relayTimer = setInterval(tick, intervalMs);
  // Kick once immediately so the first batch doesn't wait `intervalMs`
  // after boot.
  void tick();
}

export function stopOutboxRelay(): void {
  if (!relayTimer) return;
  clearInterval(relayTimer);
  relayTimer = null;
  logger.info("[outbox-relay] stopped");
}

/**
 * Test/admin observability — counts by status. Cheap query, safe to
 * call from a /metrics endpoint or a smoke test.
 */
export async function getOutboxRelayStats(): Promise<{
  pending: number;
  failedRetry: number;
  processed: number;
  dead: number;
  oldestPendingSec: number | null;
}> {
  const rows = await rawQuery<{
    pending: string;
    failed_retry: string;
    processed: string;
    dead: string;
    oldest: string | null;
  }>(
    `SELECT
       (count(*) FILTER (WHERE status = 'pending'))::text       AS pending,
       (count(*) FILTER (WHERE status = 'failed_retry'))::text  AS failed_retry,
       (count(*) FILTER (WHERE status = 'processed'))::text     AS processed,
       (count(*) FILTER (WHERE status = 'dead'))::text          AS dead,
       extract(epoch FROM (now() - min("createdAt") FILTER (WHERE status = 'pending')))::text AS oldest
     FROM event_outbox`,
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    failedRetry: Number(row?.failed_retry ?? 0),
    processed: Number(row?.processed ?? 0),
    dead: Number(row?.dead ?? 0),
    oldestPendingSec: row?.oldest != null ? Math.round(Number(row.oldest)) : null,
  };
}
