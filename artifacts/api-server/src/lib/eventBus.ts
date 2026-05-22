import { EventEmitter } from "events";
import { rawExecute, rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";
import { isKnownEvent } from "./eventCatalog.js";
import { setGauge } from "./metrics.js";
import { getRequestId, runWithCorrelationId } from "./requestContext.js";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export interface EventPayload {
  /** Envelope version — stamped by EventBus.emit (see EVENT_ENVELOPE_VERSION). */
  v?: number;
  /** ISO-8601 emit timestamp — stamped by EventBus.emit. */
  occurredAt?: string;
  companyId?: number;
  branchId?: number;
  userId?: number;
  [key: string]: unknown;
}

export type EventName =
  | "employee.created"
  | "employee.updated"
  | "employee.deleted"
  | "invoice.created"
  | "invoice.updated"
  | "invoice.paid"
  | "leave.requested"
  | "leave.approved"
  | "leave.rejected"
  | "attendance.checkin"
  | "attendance.checkout"
  | "purchase_request.created"
  | "purchase_request.approved"
  | "crm.opportunity.created"
  | "crm.opportunity.won"
  | "crm.opportunity.lost"
  | "task.created"
  | "task.completed"
  | "support.ticket.created"
  | "support.ticket.resolved"
  | "fleet.trip.started"
  | "fleet.trip.completed"
  | "warehouse.movement.created"
  | "payroll.processed"
  | "payroll.completed"
  | "journal.entry.created"
  | "settings.updated"
  | "company.created"
  | "expense.created"
  | "vendor.created"
  | "voucher.receipt_created"
  | "voucher.payment_created"
  | "custody.created"
  | "custody.settled"
  | "purchase_order.created"
  | "purchase_request.rejected"
  | "leave.stage1_approved"
  | "leave.escalated"
  | "workflow.submitted"
  | "workflow.approved"
  | "workflow.rejected"
  | "workflow.escalated"
  | "workflow.sla_warning"
  | string;

/**
 * Event envelope version. Every event emitted through `eventBus.emit` is
 * stamped with this. Bump it when the envelope shape changes so persisted
 * events (`event_logs`, `event_dlq`) and subscribers can branch on `v`.
 */
export const EVENT_ENVELOPE_VERSION = 1;

/**
 * Return a copy of `payload` with the envelope fields (`v`, `occurredAt`)
 * guaranteed present. The caller's object is never mutated; a payload that
 * already carries either field keeps its value, so re-stamping a forwarded
 * event is idempotent.
 */
export function stampEnvelope(
  payload?: EventPayload,
): EventPayload | undefined {
  if (payload == null) return payload;
  return {
    ...payload,
    v: payload.v ?? EVENT_ENVELOPE_VERSION,
    occurredAt: payload.occurredAt ?? new Date().toISOString(),
  };
}

// Transactional-outbox capture (Decision Brief #2, phase 1). Every emitted
// event is recorded durably in event_outbox. Phase 1 captures only — the
// in-process dispatch via super.emit is unchanged and remains the active
// dispatcher; the relay that drains the outbox and the dispatch-source
// switch land in follow-up PRs. Skipped under the test runner (no DB),
// mirroring startDlqMaintenance.
const OUTBOX_CAPTURE_ENABLED = !config.isTest;

function captureToOutbox(eventName: string, payload?: EventPayload): void {
  if (!OUTBOX_CAPTURE_ENABLED) return;
  // Fire-and-forget — emit() stays synchronous and is never blocked on the DB.
  void rawExecute(
    `INSERT INTO event_outbox ("eventName", payload, "companyId")
     VALUES ($1, $2, $3)`,
    [
      eventName,
      payload != null ? JSON.stringify(payload) : null,
      payload?.companyId ?? null,
    ],
  ).catch((err) => logger.warn(err, "[outbox] failed to capture event"));
}

class EventBus extends EventEmitter {
  // Maps a caller's listener to the safety-wrapped function actually
  // registered, so off() can still remove it by the original reference.
  private wrappedListeners = new WeakMap<object, (payload: EventPayload) => void>();

  emit(event: EventName, payload?: EventPayload): boolean {
    // Single chokepoint — every emit path (emitEvent, safeEmitEvent, the
    // domain engines, eventCatalog) routes through here, so stamping the
    // envelope once guarantees every event is versioned + timestamped.
    const stamped = stampEnvelope(payload);
    captureToOutbox(event, stamped);
    return super.emit(event, stamped);
  }

  // EventEmitter never awaits async listeners, so a rejecting handler
  // registered via .on() escaped as an unhandledRejection and its
  // side-effect (audit row, notification, cross-domain GL hook) was lost
  // with no trace. Wrapping every listener catches sync throws and async
  // rejections and dead-letters them, so the failure is visible and
  // retryable. A resolved promise / sync return is untouched.
  private wrap(
    event: EventName,
    listener: (payload: EventPayload) => void,
  ): (payload: EventPayload) => void {
    const safe = (payload: EventPayload): void => {
      const companyId = (payload as { companyId?: number })?.companyId;
      try {
        const result = listener(payload) as unknown;
        if (result instanceof Promise) {
          result.catch((err) => pushToDLQ("event", payload, err, companyId, event));
        }
      } catch (err) {
        pushToDLQ("event", payload, err, companyId, event);
      }
    };
    this.wrappedListeners.set(listener, safe);
    return safe;
  }

  on(event: EventName, listener: (payload: EventPayload) => void): this {
    return super.on(event, this.wrap(event, listener));
  }

  once(event: EventName, listener: (payload: EventPayload) => void): this {
    return super.once(event, this.wrap(event, listener));
  }

  off(event: EventName, listener: (payload: EventPayload) => void): this {
    return super.off(event, this.wrappedListeners.get(listener) ?? listener);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(200);

export type DLQType = "event" | "notification" | "audit" | "workflow";

/**
 * Route a failed event/handler to the dead-letter queue.
 *
 * Durable on write — the entry is persisted straight to `event_dlq`.
 * (It was previously held in an in-memory buffer flushed every 5s, which
 * lost unflushed entries on process death — routine under autoscale
 * recycling — and silently dropped the oldest entry on buffer overflow:
 * RT-FAIL-001 / RT-FAIL-002.)
 *
 * Fire-and-forget: the caller is not blocked on the INSERT; a DB failure
 * is logged. `ON CONFLICT DO NOTHING` keeps the write idempotent.
 */
export function pushToDLQ(
  type: DLQType,
  payload: unknown,
  error: unknown,
  companyId?: number,
  eventName?: string,
  retryCount = 0,
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  void rawExecute(
    `INSERT INTO event_dlq (type, "eventName", payload, error, "companyId", "retryCount", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT DO NOTHING`,
    [type, eventName ?? null, JSON.stringify(payload), errMsg, companyId ?? null, retryCount],
  ).catch((dbErr) => logger.error(dbErr, "[DLQ] Failed to persist DLQ entry:"));
}

/** Max attempts for a cross-domain handler before its event is dead-lettered. */
export const HANDLER_MAX_ATTEMPTS = 3;
/** Base delay for the exponential backoff between handler retries (ms). */
const HANDLER_RETRY_BASE_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a cross-domain handler with bounded exponential-backoff retries. A
 * transient failure (a deadlock, a brief connectivity blip) is retried
 * instead of being dead-lettered immediately. Only after HANDLER_MAX_ATTEMPTS
 * failures is the event pushed to the DLQ — with the real attempt count
 * recorded on the entry.
 *
 * Handlers registered through `registerCrossDomainHandler` already assume
 * reprocess-safety — the DLQ exists precisely to re-run them — so an
 * in-process retry is consistent with that contract.
 */
async function runHandlerWithRetry(
  eventName: string,
  handler: (payload: EventPayload) => Promise<void>,
  payload: EventPayload,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= HANDLER_MAX_ATTEMPTS; attempt++) {
    try {
      await handler(payload);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < HANDLER_MAX_ATTEMPTS) {
        const delayMs = HANDLER_RETRY_BASE_MS * 2 ** (attempt - 1);
        logger.warn(
          { err, eventName, attempt, delayMs },
          `[CrossDomain] handler for ${eventName} failed (attempt ${attempt}/${HANDLER_MAX_ATTEMPTS}) — retrying`,
        );
        await sleep(delayMs);
      }
    }
  }
  logger.error(
    lastErr,
    `[CrossDomain] handler for ${eventName} failed after ${HANDLER_MAX_ATTEMPTS} attempts — dead-lettering:`,
  );
  pushToDLQ(
    "event",
    payload,
    lastErr,
    payload?.companyId,
    eventName,
    HANDLER_MAX_ATTEMPTS,
  );
}

/**
 * Register a cross-domain event handler that retries transient failures with
 * exponential backoff and routes a terminal failure to the DLQ instead of
 * silently logging. Used for events where the originating action has already
 * committed and we must preserve the cross-domain effect (e.g. fixed-asset
 * registration after vehicle creation).
 */
export function registerCrossDomainHandler(
  eventName: string,
  handler: (payload: EventPayload) => Promise<void>
): void {
  eventBus.on(eventName, (payload: EventPayload) => {
    // Keep the correlation id of the emitting unit (an HTTP request, a cron
    // run) so the handler's logs trace back to what triggered the event;
    // mint one only when the event was emitted with no ambient context.
    const reqId = getRequestId() ?? `event-${eventName}-${randomUUID()}`;
    void runWithCorrelationId(reqId, () =>
      runHandlerWithRetry(eventName, handler, payload),
    );
  });
}

export function safeEmitEvent(payload: unknown & { companyId?: number }): void {
  // as-any-reason: justified-external - external/dynamic shape (event payload, SDK proxy, JSON.parse)
  const action = (payload as any)?.action;
  if (!action) return;
  if (!isKnownEvent(action)) {
    logger.warn({ action }, "Event not in catalog — skipped");
    // as-any-reason: justified-external - external/dynamic shape (event payload, SDK proxy, JSON.parse)
    pushToDLQ("event", payload, `Uncatalogued event: ${action}`, (payload as any)?.companyId, action);
    return;
  }
  try {
    eventBus.emit(action as EventName, payload as EventPayload);
  } catch (err) {
    // as-any-reason: justified-external - external/dynamic shape (event payload, SDK proxy, JSON.parse)
    pushToDLQ("event", payload, err, (payload as any)?.companyId, action);
  }
}

// ──────────────────────── DLQ & outbox maintenance ────────────────────────
// `event_dlq` and `event_outbox` are otherwise write-only, unbounded tables
// with no visibility. This pass adds the two things they lacked:
// observability (`dlq.pending` / `outbox.pending` gauges) and bounded growth
// (aged entries are purged).
//
// It deliberately does NOT auto-redeliver. A naive re-emit re-runs *every*
// listener of the event — double-firing the ones that already succeeded.
// Safe, targeted redelivery needs per-handler addressing (a recorded
// handler id so only the failed handler re-runs) — a separate increment.

/** DLQ entries older than this many days are purged by the maintenance pass. */
const DLQ_RETENTION_DAYS = 30;
const DLQ_MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

let maintenanceTimer: NodeJS.Timeout | null = null;

export interface DlqStats {
  /** Rows currently in event_dlq. */
  pending: number;
  /** Age of the oldest row in seconds, or null when the table is empty. */
  oldestAgeSec: number | null;
}

/** Count pending DLQ rows and the age of the oldest. */
export async function getDlqStats(): Promise<DlqStats> {
  const rows = await rawQuery<{ pending: string; oldest: string | null }>(
    `SELECT count(*)::text AS pending,
            extract(epoch FROM (now() - min("createdAt")))::text AS oldest
       FROM event_dlq`,
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    oldestAgeSec:
      row?.oldest != null ? Math.round(Number(row.oldest)) : null,
  };
}

/**
 * Delete DLQ rows older than `retentionDays`. Idempotent and safe to run
 * concurrently from multiple instances. Returns the number of rows removed.
 */
export async function purgeAgedDlqEntries(
  retentionDays: number = DLQ_RETENTION_DAYS,
): Promise<number> {
  const result = await rawExecute(
    `DELETE FROM event_dlq WHERE "createdAt" < now() - make_interval(days => $1)`,
    [retentionDays],
  );
  return result.affectedRows;
}

/** event_outbox rows older than this many days are purged. */
const OUTBOX_RETENTION_DAYS = 7;

export interface OutboxStats {
  /** event_outbox rows with status 'pending'. */
  pending: number;
  /** Age of the oldest row in seconds, or null when the table is empty. */
  oldestAgeSec: number | null;
}

/** Count pending event_outbox rows and the age of the oldest. */
export async function getOutboxStats(): Promise<OutboxStats> {
  const rows = await rawQuery<{ pending: string; oldest: string | null }>(
    `SELECT (count(*) FILTER (WHERE status = 'pending'))::text AS pending,
            extract(epoch FROM (now() - min("createdAt")))::text AS oldest
       FROM event_outbox`,
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    oldestAgeSec: row?.oldest != null ? Math.round(Number(row.oldest)) : null,
  };
}

/**
 * Delete aged event_outbox rows. Phase 2 — the outbox is a durable capture
 * log and the in-process emitter is still the dispatcher, so aged rows are
 * purged wholesale to bound table growth. When the relay becomes the
 * dispatcher (phase 3) this MUST become status-aware so an unprocessed
 * 'pending' row is never purged. Idempotent; safe to run concurrently.
 */
export async function purgeAgedOutboxEntries(
  retentionDays: number = OUTBOX_RETENTION_DAYS,
): Promise<number> {
  const result = await rawExecute(
    `DELETE FROM event_outbox WHERE "createdAt" < now() - make_interval(days => $1)`,
    [retentionDays],
  );
  return result.affectedRows;
}

async function runDlqMaintenance(): Promise<void> {
  try {
    const purged = await purgeAgedDlqEntries();
    const stats = await getDlqStats();
    setGauge("dlq.pending", stats.pending);
    if (purged > 0) {
      logger.info(
        { purged, pending: stats.pending },
        "[DLQ] maintenance pass — purged aged entries",
      );
    }
  } catch (err) {
    logger.error(err, "[DLQ] maintenance pass failed");
  }
  try {
    const purged = await purgeAgedOutboxEntries();
    const stats = await getOutboxStats();
    setGauge("outbox.pending", stats.pending);
    if (purged > 0) {
      logger.info(
        { purged, pending: stats.pending },
        "[outbox] maintenance pass — purged aged entries",
      );
    }
  } catch (err) {
    logger.error(err, "[outbox] maintenance pass failed");
  }
}

/**
 * Start the periodic DLQ maintenance pass (idempotent). The interval is
 * `unref()`'d so it never holds a shutting-down process open.
 */
export function startDlqMaintenance(): void {
  if (maintenanceTimer) return;
  maintenanceTimer = setInterval(() => {
    void runDlqMaintenance();
  }, DLQ_MAINTENANCE_INTERVAL_MS);
  maintenanceTimer.unref();
}

/** Stop the maintenance pass. Test-only. */
export function __stopDlqMaintenance(): void {
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  maintenanceTimer = null;
}

// Auto-start on a real server boot. Skipped under the test runner so unit
// tests never open a DB-querying interval.
if (!config.isTest) {
  startDlqMaintenance();
}
