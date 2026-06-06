// ─────────────────────────────────────────────────────────────────────────────
// Outbox Relay — P2.1 + P2.6 of the workflow plan.
//
// Drains event_outbox by atomically CLAIMING a batch of pending rows,
// replaying each through the in-process listeners via
// eventBus.dispatchFromOutbox(), and marking each row 'processed' or
// 'failed_retry'. After OUTBOX_RELAY_MAX_ATTEMPTS the row is promoted to
// 'dead' and stops being retried (the existing DLQ machinery handles the
// alert side).
//
// ── Why "claim" and not "fetch" (P2.6) ──────────────────────────────────────
// The original implementation ran `SELECT ... FOR UPDATE SKIP LOCKED` on
// the pool in AUTO-COMMIT mode, then marked rows in a SEPARATE statement.
// Because there was no surrounding transaction, the row-level lock taken
// by the SELECT released the moment the SELECT returned — long before the
// mark UPDATE ran. Two relay replicas could therefore both grab the same
// pending row and dispatch it twice. The fix is the canonical
// transactional-outbox claim: a single `UPDATE ... WHERE id IN (SELECT ...
// FOR UPDATE SKIP LOCKED) RETURNING ...` atomically flips pending →
// 'processing' in ONE statement, so the lock genuinely spans the claim and
// concurrent replicas claim disjoint sets. Dispatch then happens OUTSIDE
// any held lock. A reaper resets rows stranded in 'processing' (a worker
// that crashed mid-dispatch) back to 'pending' once `claimedAt` ages out.
//
// ⚠ Default OFF (config.outboxRelayActive). Until callers opt into
// idempotencyKey dedupe (P2.2), running the relay in parallel with the
// in-process emit chain can still double-dispatch for events that don't
// carry a key. Use OUTBOX_RELAY_ACTIVE=true only in dev / staging.
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

// A claimed row left in 'processing' longer than this is assumed to belong
// to a crashed worker and is reaped back to 'pending'. Generous relative
// to the dispatch time (in-process, sub-second) so a healthy slow batch is
// never reaped out from under itself.
const STALE_CLAIM_MS = 5 * 60 * 1000;

/**
 * Atomically CLAIM up to `batchSize` pending rows: transition them
 * pending → 'processing' and stamp claimedAt, all in a SINGLE statement so
 * the FOR UPDATE SKIP LOCKED lock genuinely spans the state change. Returns
 * the claimed rows (oldest-first) for dispatch. Two relay replicas running
 * this concurrently claim disjoint sets — no double-dispatch.
 */
async function claimBatch(batchSize: number, maxAttempts: number): Promise<OutboxRow[]> {
  return rawQuery<OutboxRow>(
    `UPDATE event_outbox
        SET status = 'processing',
            "claimedAt" = now()
      WHERE id IN (
        SELECT id
          FROM event_outbox
         WHERE status = 'pending'
           AND attempts < $1
         ORDER BY "createdAt" ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id::text AS id, "eventName", payload, attempts`,
    [maxAttempts, batchSize],
  );
}

/**
 * Reap rows stranded in 'processing' by a worker that crashed mid-dispatch.
 * Resets them to 'pending' so a healthy worker re-claims them on the next
 * tick. Returns the number of rows reclaimed. Idempotent + concurrency-safe
 * (a row already re-claimed by another replica won't match the WHERE).
 */
async function reapStaleClaims(staleMs: number = STALE_CLAIM_MS): Promise<number> {
  const result = await rawExecute(
    `UPDATE event_outbox
        SET status = 'pending',
            "claimedAt" = NULL
      WHERE status = 'processing'
        AND "claimedAt" IS NOT NULL
        AND "claimedAt" < now() - make_interval(secs => $1)`,
    [Math.round(staleMs / 1000)],
  );
  if (result.affectedRows > 0) {
    logger.warn({ reclaimed: result.affectedRows }, "[outbox-relay] reaped stale 'processing' claims back to pending");
  }
  return result.affectedRows;
}

/**
 * Mark a row processed. Sets processedAt so a future query can compute
 * relay-to-processing latency, and clears claimedAt now the row is final.
 */
async function markProcessed(id: string): Promise<void> {
  await rawExecute(
    `UPDATE event_outbox
        SET status = 'processed',
            "processedAt" = now(),
            "claimedAt" = NULL
      WHERE id = $1::bigint`,
    [id],
  );
}

/**
 * Bump attempts + stash the error. After `maxAttempts` failures the row
 * gets promoted to 'dead'; otherwise it returns to 'failed_retry' (NOT
 * 'pending' — a failed row needs operator attention or an explicit retry
 * from the admin monitor before the relay touches it again). claimedAt is
 * cleared either way.
 */
async function markFailure(id: string, attemptsSoFar: number, err: unknown, maxAttempts: number): Promise<void> {
  const attemptsNew = attemptsSoFar + 1;
  const nextStatus = attemptsNew >= maxAttempts ? "dead" : "failed_retry";
  const errMsg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  await rawExecute(
    `UPDATE event_outbox
        SET status = $1,
            attempts = $2,
            "lastError" = $3,
            "claimedAt" = NULL
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
async function processBatch(): Promise<{ processed: number; failed: number; reclaimed: number }> {
  let processed = 0;
  let failed = 0;
  const batchSize = config.outboxRelayBatchSize;
  const maxAttempts = config.outboxRelayMaxAttempts;

  // Recover anything a crashed worker stranded in 'processing' before we
  // claim fresh work, so those rows re-enter the pending pool this tick.
  const reclaimed = await reapStaleClaims();

  const rows = await claimBatch(batchSize, maxAttempts);
  for (const row of rows) {
    try {
      // dispatchFromOutbox bypasses the captureToOutbox path so we don't
      // re-insert. The payload is already stamped (was stamped when the
      // emit() that produced this row ran). Note: a listener that THROWS
      // is caught by EventBus's per-listener wrap and dead-lettered to
      // event_dlq — it does NOT propagate here, so the row is still marked
      // 'processed' (dispatch happened). markFailure below only fires when
      // dispatch itself could not be attempted (an infra-level failure).
      eventBus.dispatchFromOutbox(row.eventName as EventName, row.payload ?? undefined);
      await markProcessed(row.id);
      processed++;
    } catch (err) {
      await markFailure(row.id, row.attempts, err, maxAttempts).catch((dbErr) => {
        // If even the failure-marking UPDATE fails, just log — the
        // stale-claim reaper will return the row to 'pending' once its
        // claimedAt ages past STALE_CLAIM_MS.
        logger.error(dbErr, "[outbox-relay] could not mark row as failed");
      });
      failed++;
    }
  }
  return { processed, failed, reclaimed };
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
      const { processed, failed, reclaimed } = await processBatch();
      if (processed > 0 || failed > 0 || reclaimed > 0) {
        logger.debug({ processed, failed, reclaimed }, "[outbox-relay] tick");
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
 * Drain exactly ONE batch and return the outcome. Unlike startOutboxRelay,
 * this is an explicit imperative call with NO interval and NO
 * config.outboxRelayActive / config.isTest gating — the caller has decided
 * to drain. Two uses:
 *
 *   - ops: a manual "drain now" trigger (e.g. an admin endpoint or a
 *     one-shot CLI) without waiting for the polling interval.
 *   - tests: the P2.6 live-DB integration suite drives the relay
 *     deterministically, one batch at a time, instead of racing a timer.
 *
 * Respects the same inFlight guard as the timer loop so a manual drain
 * can't overlap an in-flight tick.
 */
export async function runOutboxRelayOnce(): Promise<{ processed: number; failed: number; reclaimed: number }> {
  if (inFlight) {
    return { processed: 0, failed: 0, reclaimed: 0 };
  }
  inFlight = true;
  try {
    return await processBatch();
  } finally {
    inFlight = false;
  }
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

/**
 * Internal state-transition helpers, exported ONLY for the P2.6 live-DB
 * integration suite so it can assert each step's real SQL against a real
 * Postgres (claim atomicity, dead-promotion threshold, stale-claim reaping)
 * without racing the timer loop. Not part of the public relay API — do not
 * import from application code.
 */
export const __outboxRelayInternals = {
  claimBatch,
  reapStaleClaims,
  markProcessed,
  markFailure,
  STALE_CLAIM_MS,
};
