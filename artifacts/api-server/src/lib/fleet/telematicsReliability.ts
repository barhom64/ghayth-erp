/**
 * Telematics reliability primitives — issue #1354 hardening commit 3/3.
 * ─────────────────────────────────────────────────────────────────────────
 * Two helpers used by the auto-poller cron + by any future call site that
 * needs to talk to CMSV6 with at-least-once delivery semantics:
 *
 *   • executeWithRetry  — exponential-backoff retry with a max-attempts
 *     cap and jitter. Wraps a single CMSV6 operation. Transient failures
 *     (network blip, vendor 5xx) are absorbed; permanent failures (4xx
 *     auth, validation) propagate immediately because retrying them just
 *     burns rate-limit budget.
 *
 *   • CircuitBreaker    — per-integration tripwire. After N consecutive
 *     failures the breaker opens, all further calls short-circuit with
 *     CircuitOpenError until a cooldown period expires. Stops the system
 *     from spending 5 minutes hammering a dead CMSV6 every poll cycle.
 *
 * Neither helper touches the DB on its own; the cron poller composes them
 * with the existing persistPosition/Event/Alert/Sensor helpers.
 */
import { logger } from "../logger.js";

export class CircuitOpenError extends Error {
  constructor(integrationId: number) {
    super(`circuit open for integration #${integrationId}`);
    this.name = "CircuitOpenError";
  }
}

export interface RetryOptions {
  /** Total attempts including the first call. Default 3. */
  maxAttempts?: number;
  /** Base delay before first retry, doubles per attempt. Default 500ms. */
  baseDelayMs?: number;
  /** Hard cap on a single backoff step. Default 8000ms. */
  maxDelayMs?: number;
  /** Random ±25% jitter applied to each delay. Default true. */
  jitter?: boolean;
  /** Predicate: should we retry this error? Default = true for non-4xx. */
  retryable?: (err: unknown) => boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultRetryable(err: unknown): boolean {
  // Permanent failures (auth / validation / not found) shouldn't be
  // retried — they'll just fail again and burn the rate-limit budget.
  // CMSV6 doesn't expose status codes in a uniform way, so we sniff the
  // error message for "HTTP 4xx" leaving 5xx / network errors as retryable.
  const msg = err instanceof Error ? err.message : String(err);
  if (/HTTP 4\d{2}/.test(msg)) return false;
  return true;
}

/** Run `fn` with exponential backoff. Returns the resolved value or rethrows. */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelay = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const useJitter = opts.jitter ?? true;
  const isRetryable = opts.retryable ?? defaultRetryable;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const more = attempt < maxAttempts && isRetryable(err);
      if (!more) throw err;
      let backoff = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1));
      if (useJitter) {
        const jitterPct = 0.25;
        const swing = backoff * jitterPct;
        backoff = backoff + (Math.random() * 2 - 1) * swing;
      }
      logger.warn(
        { attempt, maxAttempts, backoffMs: Math.round(backoff), err: lastErr },
        "[telematicsReliability] retry scheduled",
      );
      await delay(Math.round(Math.max(0, backoff)));
    }
  }
  // Unreachable — the loop either returns or throws. Belt-and-braces.
  throw lastErr;
}

interface BreakerState {
  failures: number;
  openedAt: number | null;
}

/**
 * Callback invoked when a breaker transitions to open. The coordinator
 * (lib/fleet/telematicsBreakerCoordinator.ts) uses this to publish the
 * open-state to Redis so sibling replicas in a multi-replica deployment
 * honour the same open circuit. Synchronous in-memory deployments leave
 * the callback unset; the breaker behaves as before.
 */
export type BreakerOpenCallback = (
  integrationId: number,
  openedAt: number,
  cooldownMs: number,
) => void;

/**
 * Per-integration breaker. The in-process Map remains the hot path so
 * isOpen/recordFailure stay synchronous and zero-allocation in the cron
 * loop. Cross-replica coordination is opt-in via the `onOpen` callback +
 * the public `markOpen()` method: the coordinator publishes opens via
 * Redis pub/sub and forwards remote opens back into local state. This
 * keeps the singleton's contract synchronous + lock-free while still
 * giving multi-replica deployments a shared view of which integrations
 * are currently shorted-out.
 */
export class CircuitBreaker {
  private state = new Map<number, BreakerState>();
  private onOpenCallback: BreakerOpenCallback | null = null;

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 60_000,
  ) {}

  /** Returns the cooldown in ms — needed by the coordinator for TTL. */
  get cooldown(): number {
    return this.cooldownMs;
  }

  /**
   * Register a callback invoked when this breaker transitions to open.
   * Replaces any prior callback. Passing null disables coordination.
   */
  setOnOpenCallback(cb: BreakerOpenCallback | null): void {
    this.onOpenCallback = cb;
  }

  /** Returns true iff the integration is currently shorted-out. */
  isOpen(integrationId: number): boolean {
    const s = this.state.get(integrationId);
    if (!s || s.openedAt === null) return false;
    if (Date.now() - s.openedAt >= this.cooldownMs) {
      // Half-open: clear the gate so the next call can probe the vendor.
      // We DON'T reset `failures` — the breaker stays sensitive for a
      // while so a vendor that's flapping doesn't keep tricking us.
      s.openedAt = null;
      return false;
    }
    return true;
  }

  recordSuccess(integrationId: number): void {
    this.state.delete(integrationId);
  }

  /**
   * Mark an integration as open externally (e.g. from a Redis pub/sub
   * broadcast). Idempotent: marking an already-open integration is a
   * no-op. We do NOT invoke the onOpenCallback here — that would create
   * a feedback loop where every replica's mark-open broadcast triggers
   * every other replica's broadcast forever.
   */
  markOpen(integrationId: number, openedAt: number): void {
    const s = this.state.get(integrationId) ?? { failures: 0, openedAt: null };
    s.openedAt = openedAt;
    s.failures = Math.max(s.failures, this.failureThreshold);
    this.state.set(integrationId, s);
  }

  recordFailure(integrationId: number): boolean {
    const s = this.state.get(integrationId) ?? { failures: 0, openedAt: null };
    s.failures += 1;
    const justOpened =
      s.failures >= this.failureThreshold && s.openedAt === null;
    if (justOpened) {
      s.openedAt = Date.now();
      logger.warn(
        { integrationId, failures: s.failures, cooldownMs: this.cooldownMs },
        "[telematicsReliability] circuit OPEN",
      );
    }
    this.state.set(integrationId, s);
    // Fire the callback OUTSIDE the state update so a slow coordinator
    // doesn't extend critical-section latency. We only fire on the
    // transition edge (closed → open) to avoid republishing on every
    // subsequent failure.
    if (justOpened && this.onOpenCallback) {
      try {
        this.onOpenCallback(integrationId, s.openedAt!, this.cooldownMs);
      } catch (err) {
        logger.error(
          { err, integrationId },
          "[telematicsReliability] onOpenCallback threw — ignoring",
        );
      }
    }
    return s.openedAt !== null;
  }

  /** Wraps a call: short-circuits when open, records result when not. */
  async execute<T>(integrationId: number, fn: () => Promise<T>): Promise<T> {
    if (this.isOpen(integrationId)) throw new CircuitOpenError(integrationId);
    try {
      const out = await fn();
      this.recordSuccess(integrationId);
      return out;
    } catch (err) {
      this.recordFailure(integrationId);
      throw err;
    }
  }

  /** Test seam — reset all breakers. */
  __reset(): void {
    this.state.clear();
  }

  /** Diagnostic — exposed for the admin observability surface. */
  snapshot(): Array<{ integrationId: number; failures: number; openedAt: number | null }> {
    return Array.from(this.state.entries()).map(([id, s]) => ({
      integrationId: id,
      failures: s.failures,
      openedAt: s.openedAt,
    }));
  }
}

/** Singleton breaker shared by the cron poller and any other caller. */
export const telematicsBreaker = new CircuitBreaker();
