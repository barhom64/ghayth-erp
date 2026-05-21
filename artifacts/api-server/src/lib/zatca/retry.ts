/**
 * Re-submission queue helpers for the ZATCA Fatoora client.
 *
 * Storage: the `zatca_retry_queue` table introduced in migration 139.
 * The worker (week 4 of the rollout) wakes on a cron tick, calls
 * `readDueRetries(now, limit)`, attempts each, and calls either
 * `recordSuccess(rowId)` or `recordFailure(rowId, err)`.
 *
 * Backoff schedule: exponential with jitter, capped at 24 hours.
 *   attempt 0 → 1m,  attempt 1 → 2m,  attempt 2 → 4m,
 *   attempt 3 → 8m,  attempt 4 → 16m, attempt 5 → 32m,
 *   …capped at 1440m (24h).
 *
 * After 5 failed attempts the row is left in place but the worker
 * stops picking it (`attempts < 5` in the partial index). An operator
 * has to investigate, fix the root cause, then bump the row back into
 * the queue with `requeue(rowId)`.
 */
import { rawQuery, rawExecute } from "../rawdb.js";
import { config } from "../config.js";

const MAX_ATTEMPTS = config.zatca.retryMaxAttempts;
const BASE_DELAY_MS = config.zatca.retryBaseDelayMs;
const MAX_DELAY_MS = 24 * 60 * 60 * 1000; // 24h

export interface RetryRow {
  id: number;
  submissionLogId: number | null;
  companyId: number;
  attempts: number;
  lastError: string | null;
}

/**
 * Add a row to the queue scheduled for `nextDelayMs` from now.
 * Called from the route handler when the first submission attempt
 * raises a transient error (5xx, network timeout).
 */
export async function enqueueRetry(opts: {
  submissionLogId: number | null;
  companyId: number;
  initialError: string;
  delayMs?: number;
}): Promise<number> {
  const delay = opts.delayMs ?? BASE_DELAY_MS;
  const rows = await rawQuery<{ id: number }>(
    `INSERT INTO zatca_retry_queue
      ("submissionLogId", "companyId", "nextAttemptAt", "attempts", "lastError")
     VALUES ($1, $2, NOW() + ($3 || ' milliseconds')::interval, 0, $4)
     RETURNING id`,
    [opts.submissionLogId, opts.companyId, String(delay), opts.initialError],
  );
  return rows[0].id;
}

/**
 * Fetch up to `limit` queue rows whose `nextAttemptAt` has passed and
 * whose attempts are still under the cap. Locked `FOR UPDATE SKIP
 * LOCKED` so multiple worker instances can run in parallel without
 * picking the same row twice.
 */
export async function readDueRetries(limit: number): Promise<RetryRow[]> {
  const rows = await rawQuery<RetryRow>(
    `SELECT id, "submissionLogId", "companyId", attempts, "lastError"
     FROM zatca_retry_queue
     WHERE "nextAttemptAt" <= NOW() AND attempts < $1
     ORDER BY "nextAttemptAt" ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [MAX_ATTEMPTS, limit],
  );
  return rows;
}

/** Mark a row as successful — deletes it from the queue. */
export async function recordSuccess(rowId: number): Promise<void> {
  await rawExecute(`DELETE FROM zatca_retry_queue WHERE id = $1`, [rowId]);
}

/**
 * Bump attempts + lastError, schedule the next attempt with
 * exponential backoff. Returns the new delay so the caller can log
 * it.
 */
export async function recordFailure(rowId: number, error: string): Promise<number> {
  const rows = await rawQuery<{ attempts: number }>(
    `SELECT attempts FROM zatca_retry_queue WHERE id = $1`,
    [rowId],
  );
  if (rows.length === 0) return 0;

  const nextAttempts = rows[0].attempts + 1;
  const delay = Math.min(BASE_DELAY_MS * 2 ** nextAttempts, MAX_DELAY_MS);
  // Add ±25% jitter so a wave of retries doesn't synchronise after a
  // ZATCA outage clears.
  const jitter = Math.floor(delay * (Math.random() * 0.5 - 0.25));
  const finalDelay = Math.max(BASE_DELAY_MS, delay + jitter);

  await rawExecute(
    `UPDATE zatca_retry_queue
       SET attempts = $1,
           "lastError" = $2,
           "nextAttemptAt" = NOW() + ($3 || ' milliseconds')::interval
     WHERE id = $4`,
    [nextAttempts, error.slice(0, 4000), String(finalDelay), rowId],
  );
  return finalDelay;
}

/**
 * Operator-driven re-queue: reset attempts to 0 and schedule
 * immediately. Used after fixing a configuration issue (e.g. wrong
 * VAT registration number) that caused all retries to fail.
 */
export async function requeue(rowId: number): Promise<void> {
  await rawExecute(
    `UPDATE zatca_retry_queue
       SET attempts = 0, "lastError" = NULL, "nextAttemptAt" = NOW()
     WHERE id = $1`,
    [rowId],
  );
}

/** Diagnostic: depth + oldest pending. Used by Prometheus exporter. */
export async function queueStats(): Promise<{
  pending: number;
  oldestPendingMs: number | null;
  exhausted: number;
}> {
  const [row] = await rawQuery<{
    pending: string;
    oldestSeconds: string | null;
    exhausted: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE attempts < $1)                  AS "pending",
       EXTRACT(EPOCH FROM (NOW() - MIN("nextAttemptAt")))     AS "oldestSeconds",
       COUNT(*) FILTER (WHERE attempts >= $1)                 AS "exhausted"
     FROM zatca_retry_queue`,
    [MAX_ATTEMPTS],
  );
  return {
    pending: Number(row?.pending ?? 0),
    oldestPendingMs: row?.oldestSeconds == null ? null : Number(row.oldestSeconds) * 1000,
    exhausted: Number(row?.exhausted ?? 0),
  };
}
