/**
 * ZATCA retry-queue worker.
 *
 * Reads due rows from `zatca_retry_queue`, looks up the original
 * submission, attempts a re-send through the Fatoora client, and
 * either deletes the row (success) or bumps attempts + reschedules
 * (failure).
 *
 * Wired into `cronScheduler.ts` as `zatca_retry_drain`, scheduled
 * every minute. Uses `FOR UPDATE SKIP LOCKED` inside `readDueRetries`
 * so multiple api-server replicas can run the worker without
 * double-processing the same row.
 *
 * **What this worker DOES NOT do today**:
 *
 *   - It cannot reconstruct the FULL signed XML from the submission
 *     log (the existing `zatca_submission_log.requestPayload` column
 *     is truncated to 5000 chars). When the route handler is
 *     refactored in the next pass to actually call the Fatoora
 *     client, we'll start storing the full signed XML in a separate
 *     column (proposed: `zatca_submission_log.fullSignedXmlBase64`)
 *     so the worker has the bytes it needs to re-submit byte-for-
 *     byte. Until then, the worker logs the queue row, marks it as
 *     "needs manual re-submit", and bumps attempts.
 *
 *   - It cannot ask Fatoora to re-clear an already-cleared invoice
 *     (ZATCA returns 400 with `EBR-KSA-DUPLICATE`). The route handler
 *     should check `invoices.zatcaClearanceStatus = 'cleared'` before
 *     enqueuing a retry; the worker double-checks defensively.
 *
 * Both gaps are documented in docs/ZATCA_PHASE_2_DESIGN.md.
 */
import { rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";
import {
  readDueRetries,
  recordSuccess,
  recordFailure,
  type RetryRow,
} from "./retry.js";
import { config } from "../config.js";

const DEFAULT_BATCH_SIZE = config.zatca.retryBatchSize;

export interface WorkerOutcome {
  scanned: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Drain up to `limit` due retry rows. Returns a summary suitable for
 * cron-log persistence + Prometheus exporter consumption.
 *
 * Idempotent: if no rows are due, returns zeros. Safe to call on a
 * tight loop (the SKIP LOCKED ensures no contention with another
 * replica).
 */
export async function drainOnce(limit: number = DEFAULT_BATCH_SIZE): Promise<WorkerOutcome> {
  const out: WorkerOutcome = {
    scanned: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const due = await readDueRetries(limit);
  out.scanned = due.length;
  if (due.length === 0) return out;

  for (const row of due) {
    try {
      const result = await processRow(row);
      if (result.outcome === "success") {
        await recordSuccess(row.id);
        out.succeeded += 1;
      } else if (result.outcome === "skip") {
        // Row is still in the queue but the worker can't act on it
        // yet (e.g. invoice already cleared, or original payload
        // missing). Bump attempts so it doesn't loop forever.
        await recordFailure(row.id, result.reason);
        out.skipped += 1;
      } else {
        await recordFailure(row.id, result.reason);
        out.failed += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`row#${row.id}: ${msg}`);
      await recordFailure(row.id, msg).catch((bumpErr) => {
        logger.error(bumpErr, `[zatca-retry] failed to record failure for row ${row.id}`);
      });
      out.failed += 1;
    }
  }

  return out;
}

/**
 * Cron-compatible signature: returns a one-line summary string for
 * the cron-log table.
 */
export async function zatcaRetryDrain(): Promise<string> {
  const out = await drainOnce();
  if (out.scanned === 0) return "no due rows";
  return `scanned=${out.scanned} succeeded=${out.succeeded} failed=${out.failed} skipped=${out.skipped}`;
}

// ─────────────────────────────────────────────────────────────────────
// Internal: per-row work. Today this is a placeholder; once the route
// handler stores the full signed XML, this fans out to the right
// Fatoora client method based on the submission log's invoice type.
// ─────────────────────────────────────────────────────────────────────

interface ProcessResult {
  outcome: "success" | "transient" | "skip";
  reason: string;
}

async function processRow(row: RetryRow): Promise<ProcessResult> {
  if (row.submissionLogId == null) {
    return {
      outcome: "skip",
      reason: "queue row has no submission log reference; cannot reconstruct payload",
    };
  }

  const logRows = await rawQuery<{
    entityType: string;
    entityId: number;
    status: string;
    environment: string;
  }>(
    `SELECT "entityType", "entityId", status, environment
     FROM zatca_submission_log
     WHERE id = $1 AND "companyId" = $2`,
    [row.submissionLogId, row.companyId],
  );
  if (logRows.length === 0) {
    return {
      outcome: "skip",
      reason: `submission log row ${row.submissionLogId} not found (deleted?)`,
    };
  }

  const log = logRows[0];

  // Defensive: if the underlying invoice is already cleared, drop the
  // queued row instead of submitting again (ZATCA returns
  // EBR-KSA-DUPLICATE which would fail the retry permanently).
  if (log.entityType === "invoice") {
    const invoiceRows = await rawQuery<{ zatcaClearanceStatus: string | null }>(
      `SELECT "zatcaClearanceStatus" FROM invoices WHERE id = $1 AND "companyId" = $2`,
      [log.entityId, row.companyId],
    );
    const status = invoiceRows[0]?.zatcaClearanceStatus;
    if (status === "cleared" || status === "reported") {
      return {
        outcome: "success",
        reason: `invoice already ${status}; treating row as resolved`,
      };
    }
  }

  // Until the route handler stores the full signed XML, the worker
  // can't issue the re-clearance call. Bump + skip; the operator will
  // see the queue row in the admin UI and re-submit manually.
  return {
    outcome: "skip",
    reason:
      "worker cannot reconstruct the signed XML yet; pending storage of fullSignedXmlBase64 in zatca_submission_log",
  };
}
