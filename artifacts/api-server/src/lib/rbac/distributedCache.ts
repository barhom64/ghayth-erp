/**
 * distributedCache — cross-process invalidation for the RBAC engine.
 *
 * The engine's in-process Maps (grantCache, sodCache, FEATURE_INDEX-derived)
 * are fast but isolated to one Node process. In a multi-replica deployment
 * (Replit Reserved VM, Kubernetes, etc.) an admin who edits a role on
 * replica A will not invalidate replica B's cache for up to 30 seconds.
 *
 * This module bridges that gap with a Redis pub/sub channel:
 *
 *   bumpCacheVersion(companyId)       on replica A
 *   PUBLISH rbac:invalidate {companyId}
 *   replica B receives → drops its grantCache entries for that company
 *
 * Graceful fallback: if REDIS_URL is unset OR Redis is unhealthy, the
 * publisher is a no-op and the system falls back to the existing 30s
 * TTL — so behaviour for single-replica deployments is unchanged.
 *
 * The subscriber side hooks into authzEngine and sodEnforcement caches
 * via callback registration so this module has no upstream imports
 * (avoids a cycle).
 */

import { logger } from "../logger.js";
import { config } from "../config.js";

const CHANNEL = "rbac:invalidate";

interface InvalidationEvent {
  companyId: number;
  kind?: "grants" | "sod" | "all";
}

type Listener = (e: InvalidationEvent) => void;
const listeners = new Set<Listener>();

let publisherClient: any = null;
let subscriberClient: any = null;
let initAttempted = false;
let healthy = false;

// Defensively normalise the REDIS_URL secret (matches rateLimitStore.ts).
// Operators copy-pasting from provider dashboards routinely include
// surrounding artefacts that break URL parsing: leading/trailing whitespace,
// the env-var prefix (`REDIS_URL=...`), surrounding quotes, a leading
// `export `, or a leading `--tls -u ` from a `redis-cli` snippet. We strip
// these so the saved value just needs to *contain* a valid redis URL.
function normaliseRedisUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let v = raw.trim();
  v = v.replace(/^export\s+/i, "");
  v = v.replace(/^REDIS_URL\s*=\s*/i, "");
  v = v.replace(/^(?:--tls\s+)?-u\s+/i, "");
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  // Some dashboards URL-encode the surrounding quotes (%22). Strip those too.
  v = v.replace(/^%22/, "").replace(/%22$/, "");
  v = v.replace(/^%27/, "").replace(/%27$/, "");
  v = v.replace(/;\s*$/, "");
  return v.trim();
}

function getRedisUrl(): string | null {
  // Prefer the same env vars the rate-limit store uses so ops only set Redis
  // once. Order: REDIS_URL → REDIS_HOST/PORT.
  const url = normaliseRedisUrl(config.redis.url);
  if (url) return url;
  const host = config.redis.host;
  if (host) return `redis://${host}:${config.redis.port}`;
  return null;
}

async function ensureClients(): Promise<boolean> {
  if (initAttempted) return healthy;
  initAttempted = true;
  const url = getRedisUrl();
  if (!url) {
    logger.info("REDIS_URL not set — RBAC distributed cache disabled (single-replica fallback)");
    return false;
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
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 200, 5_000),
      lazyConnect: false,
    });
    publisherClient.on("ready", () => {
      healthy = true;
      logger.info("RBAC distributed cache: publisher connected");
    });
    publisherClient.on("error", (err: Error) => {
      if (healthy) {
        healthy = false;
        logger.warn({ err: err.message }, "RBAC distributed cache: publisher error");
      }
    });
    subscriberClient.on("ready", () => {
      logger.info("RBAC distributed cache: subscriber connected");
    });
    subscriberClient.subscribe(CHANNEL, (err: Error | null) => {
      if (err) {
        logger.warn({ err: err.message }, "RBAC distributed cache: subscribe failed");
      }
    });
    subscriberClient.on("message", (channel: string, raw: string) => {
      if (channel !== CHANNEL) return;
      try {
        const event = JSON.parse(raw) as InvalidationEvent;
        for (const l of listeners) {
          try {
            l(event);
          } catch (err) {
            logger.warn({ err }, "RBAC cache listener threw");
          }
        }
      } catch (err) {
        logger.warn({ raw }, "RBAC cache invalid message");
      }
    });
    return true;
  } catch (err) {
    logger.warn({ err }, "RBAC distributed cache: failed to init Redis — falling back to in-process TTL");
    return false;
  }
}

/**
 * Publish an invalidation event so other replicas drop their caches
 * for the given company. No-op when Redis is not configured.
 */
export async function publishInvalidation(companyId: number, kind: "grants" | "sod" | "all" = "all"): Promise<void> {
  await ensureClients();
  if (!healthy || !publisherClient) return;
  try {
    await publisherClient.publish(CHANNEL, JSON.stringify({ companyId, kind }));
  } catch (err) {
    // Non-fatal: the local TTL still bounds staleness.
    logger.warn({ err, companyId }, "RBAC distributed cache: publish failed");
  }
}

/**
 * Register a callback that fires on every invalidation event received
 * from another replica. Used by authzEngine and sodEnforcement to drop
 * their per-company cache entries.
 */
export function onInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  // Make sure subscriber is up so the callback actually receives events.
  void ensureClients();
  return () => {
    listeners.delete(listener);
  };
}

/** Test/inspection helper. */
export function isCacheClusterHealthy(): boolean {
  return healthy;
}
