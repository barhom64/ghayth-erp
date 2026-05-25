/**
 * Print Queue — Phase 10 of the Print Platform.
 *
 * Background-job interface for heavy print workloads:
 *   • Batch nightly reports (e.g. all 200 invoices for a fiscal period)
 *   • Scheduled deliveries (monthly statement to every client)
 *   • Retry-with-backoff on transient render or delivery failures
 *
 * This file is the CONTRACT. A real BullMQ implementation needs Redis
 * available; we ship a minimal in-process queue (setImmediate-driven)
 * that satisfies the contract for dev and small deployments, and
 * register the BullMQ implementation when Redis is configured.
 *
 *   getQueue().enqueue({ kind: "print_render", payload: { ... }, runAt: tomorrow });
 *
 * Callers shouldn't care which backing implementation is in use.
 */

import { logger } from "../logger.js";

export type PrintJobKind =
  | "print_render"          // run renderPrint, write print_jobs
  | "print_render_and_send" // renderPrint + sendDocument in one shot
  | "report_batch"          // many entityIds, single delivery zip
  | "scheduled_report";     // a CRON-targeted batch

export interface PrintJobPayload {
  kind: PrintJobKind;
  /** Free-form payload — each kind defines its own shape. */
  data: Record<string, unknown>;
  /** Defer execution until at least this timestamp (ISO). Use for
   *  scheduled reports. */
  runAt?: string;
  /** Maximum retry attempts. Default 3. */
  maxAttempts?: number;
  /** Initial backoff in ms; subsequent retries double it (1s, 2s, 4s, …).
   *  Default 1000. */
  backoffMs?: number;
  /** Per-job unique key for idempotency — if a job with this key is
   *  already queued or running, enqueue() is a no-op. */
  idempotencyKey?: string;
}

export interface EnqueuedJob {
  id: string;
  kind: PrintJobKind;
  status: "queued" | "running" | "completed" | "failed";
  attempts: number;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: unknown;
}

export interface PrintQueueBackend {
  /** Implementation name — "bullmq", "in-process", etc. */
  name: string;
  enqueue(payload: PrintJobPayload): Promise<EnqueuedJob>;
  getJob(id: string): Promise<EnqueuedJob | null>;
  /** Optional — implementations that support cancellation. */
  cancel?(id: string): Promise<boolean>;
}

// ─── In-process backend (default) ────────────────────────────────────────
// Minimal queue that lives entirely in this Node process. Satisfies the
// contract for dev / small single-tenant deployments. Loses jobs on
// restart and doesn't survive across workers — production should switch
// to the BullMQ backend once Redis is in place.

class InProcessQueue implements PrintQueueBackend {
  name = "in-process";
  private jobs = new Map<string, EnqueuedJob>();
  private handlers = new Map<PrintJobKind, (data: Record<string, unknown>) => Promise<unknown>>();
  private idempotencyMap = new Map<string, string>();

  registerHandler(kind: PrintJobKind, fn: (data: Record<string, unknown>) => Promise<unknown>): void {
    this.handlers.set(kind, fn);
  }

  async enqueue(payload: PrintJobPayload): Promise<EnqueuedJob> {
    if (payload.idempotencyKey) {
      const existingId = this.idempotencyMap.get(payload.idempotencyKey);
      if (existingId) {
        const existing = this.jobs.get(existingId);
        if (existing && (existing.status === "queued" || existing.status === "running")) {
          return existing;
        }
      }
    }
    const id = `inproc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: EnqueuedJob = {
      id,
      kind: payload.kind,
      status: "queued",
      attempts: 0,
      scheduledAt: payload.runAt ?? new Date().toISOString(),
    };
    this.jobs.set(id, job);
    if (payload.idempotencyKey) this.idempotencyMap.set(payload.idempotencyKey, id);

    const delay = payload.runAt
      ? Math.max(0, new Date(payload.runAt).getTime() - Date.now())
      : 0;
    setTimeout(() => this.runWithRetries(id, payload), delay);
    return job;
  }

  async getJob(id: string): Promise<EnqueuedJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async cancel(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || job.status !== "queued") return false;
    job.status = "failed";
    job.error = "cancelled";
    return true;
  }

  private async runWithRetries(id: string, payload: PrintJobPayload) {
    const job = this.jobs.get(id);
    if (!job || job.status === "failed") return;
    const handler = this.handlers.get(payload.kind);
    if (!handler) {
      job.status = "failed";
      job.error = `no handler registered for kind=${payload.kind}`;
      return;
    }
    const max = payload.maxAttempts ?? 3;
    let backoff = payload.backoffMs ?? 1000;
    for (let attempt = 1; attempt <= max; attempt++) {
      job.attempts = attempt;
      job.status = "running";
      job.startedAt = job.startedAt ?? new Date().toISOString();
      try {
        const result = await handler(payload.data);
        job.status = "completed";
        job.completedAt = new Date().toISOString();
        job.result = result;
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`[print/queue] job ${id} attempt ${attempt}/${max} failed: ${msg}`);
        if (attempt < max) {
          await new Promise((r) => setTimeout(r, backoff));
          backoff *= 2;
        } else {
          job.status = "failed";
          job.completedAt = new Date().toISOString();
          job.error = msg;
        }
      }
    }
  }
}

const inProcess = new InProcessQueue();
let activeBackend: PrintQueueBackend = inProcess;

/**
 * Production deployments wire BullMQ in here:
 *
 *   import { BullQueue } from "./queue.bullmq.js";
 *   if (config.redis.configured) setBackend(new BullQueue(config.redis.url));
 *
 * The actual BullMQ adapter file is deferred — adding the bullmq package
 * triggers a 20MB install and a Redis dep that single-instance deployments
 * don't have. The contract above is stable enough that the swap is
 * file-level.
 */
export function setBackend(backend: PrintQueueBackend): void {
  activeBackend = backend;
  logger.info(`[print/queue] backend set to ${backend.name}`);
}

export function getBackend(): PrintQueueBackend {
  return activeBackend;
}

export function registerHandler(
  kind: PrintJobKind,
  fn: (data: Record<string, unknown>) => Promise<unknown>,
): void {
  if (activeBackend instanceof InProcessQueue) {
    activeBackend.registerHandler(kind, fn);
  }
  // BullMQ backend (when wired) will register the handler with a worker
  // process — same fn signature, different mechanism.
}

/** Convenience wrapper. */
export async function enqueue(payload: PrintJobPayload): Promise<EnqueuedJob> {
  return activeBackend.enqueue(payload);
}
