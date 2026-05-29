/**
 * Distributed CircuitBreaker coordination — #1354 multi-replica hardening.
 * ─────────────────────────────────────────────────────────────────────────
 * Closes Known Limitation #1 from the Phase 2 commit: "CircuitBreaker
 * per-process — multi-replica deployments hold independent breaker state".
 *
 * Design (pub/sub, eventually consistent):
 *   • Each replica still runs its own in-memory CircuitBreaker. The
 *     hot path (isOpen / recordFailure / recordSuccess) stays
 *     synchronous and allocation-free — no Redis round-trip per cron tick.
 *   • When a replica's local breaker transitions closed → open, it
 *     publishes `{integrationId, openedAt, cooldownMs}` on the channel
 *     `fleet:telematics:breaker-open`.
 *   • Sibling replicas receive the broadcast and call
 *     `breaker.markOpen(...)` locally — propagating the open state
 *     without re-publishing (markOpen does NOT invoke the callback).
 *   • TTL on the cooldown is enforced by the local breaker's
 *     `isOpen()` half-open check; no Redis TTL needed because the
 *     state is only used to PROPAGATE the open transition, not to
 *     hold authoritative state.
 *
 * Fallback: when REDIS_URL is unset or Redis is unhealthy, the
 * coordinator no-ops cleanly. The breaker continues to work as the
 * single-replica deployment — no behaviour change, no errors.
 *
 * Why pub/sub instead of a Redis-backed counter:
 *   • Sync API preserved — call sites don't need to await.
 *   • No "stuck open" failure mode if Redis goes away mid-cooldown
 *     (the local TTL math runs without Redis).
 *   • Joining-a-cluster scenario is acceptable: a fresh replica that
 *     missed an open broadcast will simply attempt the call; if it
 *     fails (vendor still down), the replica will accumulate its own
 *     failures and open locally within `failureThreshold` cycles.
 */
import { logger } from "../logger.js";
import { config } from "../config.js";
import type { CircuitBreaker } from "./telematicsReliability.js";

const CHANNEL = "fleet:telematics:breaker-open";

interface BreakerOpenEvent {
  integrationId: number;
  openedAt: number;
  cooldownMs: number;
  /** Stamp from the publishing replica so loopback messages can be
   *  ignored — without this, every replica that hears its own open
   *  broadcast would treat it as a sibling event. */
  origin: string;
}

let publisherClient: unknown = null;
let subscriberClient: unknown = null;
let initAttempted = false;
let healthy = false;
let originId = "";

function getRedisUrl(): string | null {
  // Read through the typed `config` object — the FND-003 lint forbids
  // direct env reads outside lib/config.ts. config.ts already runs the
  // normalise/validate pipeline shared with rateLimitStore + RBAC.
  const raw = config.redis.url?.trim();
  if (!raw) return null;
  if (!/^rediss?:\/\//i.test(raw)) return null;
  return raw;
}

/**
 * Idempotent setup. Call once at boot, ideally from cronScheduler since
 * that's where the breaker is actually USED. Safe to call before the
 * breaker has been touched — no-ops cleanly when Redis is absent.
 *
 * @returns A cleanup function. Tests should call it to release the
 *   pub/sub clients between runs; production never calls it.
 */
export async function setupBreakerCoordination(
  breaker: CircuitBreaker,
): Promise<() => Promise<void>> {
  if (initAttempted) {
    return async () => {};
  }
  initAttempted = true;

  const url = getRedisUrl();
  if (!url) {
    logger.info(
      "[telematicsBreakerCoordinator] REDIS_URL not set — multi-replica coordination disabled; each replica's breaker is independent",
    );
    return async () => {};
  }

  try {
    const { default: Redis } = await import("ioredis");
    publisherClient = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => Math.min(times * 200, 5_000),
      lazyConnect: false,
    });
    subscriberClient = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => Math.min(times * 200, 5_000),
      lazyConnect: false,
    });

    originId = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    interface RedisLike {
      subscribe: (channel: string) => Promise<unknown>;
      on: (event: string, cb: (...a: unknown[]) => void) => void;
      publish: (channel: string, payload: string) => Promise<unknown>;
      quit: () => Promise<unknown>;
    }
    const sub = subscriberClient as RedisLike;
    const pub = publisherClient as RedisLike;

    sub.on("ready", () => {
      healthy = true;
      logger.info("[telematicsBreakerCoordinator] Redis pub/sub ready");
    });
    sub.on("error", (err: unknown) => {
      healthy = false;
      logger.warn({ err }, "[telematicsBreakerCoordinator] subscriber error");
    });
    sub.on("end", () => {
      healthy = false;
    });

    await sub.subscribe(CHANNEL);

    sub.on("message", (channel: unknown, payload: unknown) => {
      if (channel !== CHANNEL || typeof payload !== "string") return;
      let evt: BreakerOpenEvent;
      try {
        evt = JSON.parse(payload) as BreakerOpenEvent;
      } catch (err) {
        logger.warn({ err, payload }, "[telematicsBreakerCoordinator] malformed payload");
        return;
      }
      // Loopback guard: ignore broadcasts I just sent myself.
      if (evt.origin === originId) return;
      if (typeof evt.integrationId !== "number" || typeof evt.openedAt !== "number") {
        return;
      }
      breaker.markOpen(evt.integrationId, evt.openedAt);
    });

    // Wire the breaker's onOpen → publish to the channel.
    breaker.setOnOpenCallback((integrationId, openedAt, cooldownMs) => {
      const evt: BreakerOpenEvent = {
        integrationId,
        openedAt,
        cooldownMs,
        origin: originId,
      };
      // Fire-and-forget. If Redis is briefly unhealthy, the local
      // breaker is still open so this replica protects itself; sibling
      // replicas will discover the failure on their next attempt and
      // open independently.
      pub.publish(CHANNEL, JSON.stringify(evt)).catch((err) => {
        logger.warn(
          { err, integrationId },
          "[telematicsBreakerCoordinator] publish failed",
        );
      });
    });

    return async () => {
      try {
        await sub.quit();
      } catch (err) {
        logger.debug({ err }, "[telematicsBreakerCoordinator] subscriber quit error");
      }
      try {
        await pub.quit();
      } catch (err) {
        logger.debug({ err }, "[telematicsBreakerCoordinator] publisher quit error");
      }
      breaker.setOnOpenCallback(null);
      publisherClient = null;
      subscriberClient = null;
      initAttempted = false;
      healthy = false;
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[telematicsBreakerCoordinator] init failed — breaker remains per-replica",
    );
    return async () => {};
  }
}

/** Diagnostic — used by the admin breaker-state endpoint to show whether
 *  cross-replica coordination is actually live. */
export function isCoordinationHealthy(): boolean {
  return healthy;
}

/** Test seam — reset all module state. Production never calls this. */
export function __resetForTest(): void {
  publisherClient = null;
  subscriberClient = null;
  initAttempted = false;
  healthy = false;
  originId = "";
}
