import { MemoryStore, type Store } from "express-rate-limit";
import { logger } from "./logger.js";
import { config } from "./config.js";

// Shared Redis-backed store factory for express-rate-limit.
//
// Why this exists:
//   express-rate-limit defaults to an in-process MemoryStore. That has two
//   real-world problems for us:
//     1. Counts are wiped on every API restart, so a deploy or crash
//        silently lifts every cap (a runaway client can just wait for the
//        next deploy to "reset" their budget).
//     2. If we ever scale api-server horizontally, each replica gets its
//        own counter and the effective limit becomes N × max.
//
// How it works:
//   - On first call, lazy-connect to REDIS_URL (if set).
//   - All limiters share the SAME ioredis client; each limiter gets its
//     own RedisStore wrapper with a unique key prefix so counts don't
//     collide across limiters that happen to use the same key (e.g. an
//     IP-keyed loginLimiter and an IP-keyed refreshLimiter).
//   - If REDIS_URL is unset → return undefined (express-rate-limit falls
//     back to its built-in MemoryStore — fine for local dev where there's
//     a single process and restarts are constant anyway).
//   - If REDIS_URL is set but Redis becomes unreachable at runtime → we
//     swallow the error inside sendCommand, log a throttled warning, and
//     transparently delegate to a per-limiter MemoryStore so caps STILL
//     apply (in-process only, but better than allow-all). The previous
//     "let the request through" outage path was rejected by code review
//     as a security regression.

let attemptedInit = false;
// Use unknown so we don't pull ioredis types into modules that don't import
// from this file. The actual type is `import("ioredis").Redis`.
let redisClient: unknown = null;
let redisHealthy = false;
let lastErrorLogAt = 0;
// Cached normalised URL so call-sites don't have to re-normalise on every
// gating check. `null` = REDIS_URL not configured, treat as memory-only.
let cachedRedisUrl: string | null | undefined = undefined;
function getRedisUrl(): string | null {
  if (cachedRedisUrl !== undefined) return cachedRedisUrl;
  const v = normaliseRedisUrl(config.redis.url);
  cachedRedisUrl = v && v.length > 0 ? v : null;
  return cachedRedisUrl;
}

function maybeLogError(err: unknown, ctx: string): void {
  // Throttle: at most one warning per 30s to avoid log floods during an
  // outage where every request triggers a failed Redis call.
  const now = Date.now();
  if (now - lastErrorLogAt < 30_000) return;
  lastErrorLogAt = now;
  logger.warn(
    { err: err instanceof Error ? err.message : String(err), ctx },
    "Redis rate-limit store error — falling back to in-process MemoryStore (cap still enforced per-replica)",
  );
}

// Defensively normalise the REDIS_URL secret. Operators copy-pasting from
// provider dashboards (Upstash etc.) routinely include surrounding artefacts
// that break URL parsing:
//   - leading/trailing whitespace or a stray newline
//   - the env-var prefix itself, e.g. `REDIS_URL="redis://..."`
//   - surrounding single/double quotes
//   - a leading `export ` from a shell snippet
//   - a leading `--tls -u ` from a `redis-cli` command
// We strip these so the saved value just needs to *contain* a valid redis
// URL somewhere; the connection still fails loudly if the URL itself is wrong.
function normaliseRedisUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let v = raw.trim();
  // Strip optional `export ` then `KEY=` prefix.
  v = v.replace(/^export\s+/i, "");
  v = v.replace(/^REDIS_URL\s*=\s*/i, "");
  // Strip a leading `--tls -u ` (or just `-u `) from a redis-cli paste.
  v = v.replace(/^(?:--tls\s+)?-u\s+/i, "");
  // Strip matching surrounding single or double quotes.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  // Strip a trailing `;` from a JS-style snippet.
  v = v.replace(/;\s*$/, "");
  return v.trim();
}

async function ensureClient(): Promise<unknown> {
  if (attemptedInit) return redisClient;
  attemptedInit = true;
  const url = getRedisUrl();
  if (!url) {
    logger.info(
      "REDIS_URL not set — rate-limit stores will use in-process memory (counts reset on restart, not shared across replicas)",
    );
    return null;
  }
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      // Don't queue commands forever when Redis is down — fail fast so the
      // sendCommand wrapper can fall back to the per-limiter MemoryStore.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      // Keep retrying connections in the background.
      retryStrategy: (times: number) => Math.min(times * 200, 5_000),
      lazyConnect: false,
    });
    client.on("ready", () => {
      redisHealthy = true;
      logger.info("Redis rate-limit store connected");
    });
    client.on("error", (err: Error) => {
      redisHealthy = false;
      maybeLogError(err, "ioredis error event");
    });
    client.on("end", () => {
      redisHealthy = false;
    });
    redisClient = client;
    // Optimistic: ioredis emits 'ready' asynchronously. Mark unhealthy
    // until then so the very first requests fall through to memory if
    // Redis is unreachable.
    return client;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to initialise Redis rate-limit client — falling back to in-process memory store",
    );
    return null;
  }
}

// Kick off the connection at module load so the very first request after
// boot doesn't pay the connect-and-handshake latency.
void ensureClient();

/**
 * Build a Store for a single rate-limit instance.
 *
 * @param prefix Unique short tag identifying the limiter (e.g. "auth:login",
 *   "api:global", "umrah"). Used as the Redis key namespace so two
 *   limiters that key off the same value (e.g. IP) don't share counts.
 * @returns A `Store` if Redis is configured, or `undefined` to let
 *   express-rate-limit use its built-in MemoryStore.
 */
export function makeRateLimitStore(prefix: string): Store | undefined {
  if (!getRedisUrl()) return undefined;
  // Build a thin store that defers Redis access. We can't await ensureClient()
  // here because rate-limit-redis is constructed synchronously when the
  // limiter is created at module load. Instead, sendCommand awaits the
  // client at call time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // We use a dynamic import that resolves once and caches the module.
  return new LazyRedisStore(prefix);
}

// LazyRedisStore wraps rate-limit-redis but defers its construction until
// the first increment call (after the ioredis client has actually connected).
// When Redis is unhealthy, it transparently delegates to a per-limiter
// in-process MemoryStore so caps are still enforced — just within the
// scope of this single process. The cap is never silently lifted.
class LazyRedisStore implements Store {
  private readonly keyPrefix: string;
  private redisStore: Store | null = null;
  // Per-limiter MemoryStore used as the fallback. Constructed eagerly in
  // init() so it's ready the instant Redis fails — including for the very
  // first request before the ioredis client emits 'ready'.
  private readonly memoryFallback: MemoryStore = new MemoryStore();
  private initOpts: { windowMs: number } | null = null;
  private redisInitInFlight: Promise<Store | null> | null = null;

  constructor(prefix: string) {
    this.keyPrefix = prefix;
  }

  init(options: { windowMs: number }): void {
    this.initOpts = options;
    this.memoryFallback.init(options as never);
  }

  // Resolve the active backend for a single call. Prefer Redis when it's
  // healthy AND its store has been constructed; otherwise fall back to the
  // in-process MemoryStore so the cap is still enforced.
  private async resolveStore(): Promise<Store> {
    // Kick off Redis construction lazily. Once built we keep it; subsequent
    // calls choose between it and memoryFallback purely based on the live
    // redisHealthy flag (so a transient outage routes to memory and recovery
    // routes back to Redis automatically).
    if (!this.redisStore && getRedisUrl() && !this.redisInitInFlight) {
      this.redisInitInFlight = this.buildRedisStore();
    }
    if (this.redisInitInFlight) {
      try {
        await this.redisInitInFlight;
      } catch {
        // buildRedisStore already logged; just fall through to memory.
      }
      this.redisInitInFlight = null;
    }
    if (this.redisStore && redisHealthy) return this.redisStore;
    return this.memoryFallback;
  }

  private async buildRedisStore(): Promise<Store | null> {
    const client = await ensureClient();
    if (!client) return null;
    try {
      const { RedisStore } = await import("rate-limit-redis");
      const c = client as { call: (...args: unknown[]) => Promise<unknown> };
      const store = new RedisStore({
        sendCommand: (...args: string[]) => c.call(...args) as Promise<never>,
        prefix: `rl:${this.keyPrefix}:`,
      });
      if (this.initOpts) store.init(this.initOpts as never);
      this.redisStore = store;
      return store;
    } catch (err) {
      maybeLogError(err, "RedisStore construction");
      return null;
    }
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const store = await this.resolveStore();
    try {
      return (await store.increment(key)) as { totalHits: number; resetTime: Date | undefined };
    } catch (err) {
      // Redis call failed mid-flight (e.g. outage that opened between
      // resolveStore() and increment()). Mark unhealthy and re-issue
      // against the memory fallback so the cap stays enforced.
      maybeLogError(err, "store.increment");
      redisHealthy = false;
      return (await this.memoryFallback.increment(key)) as {
        totalHits: number;
        resetTime: Date | undefined;
      };
    }
  }

  async decrement(key: string): Promise<void> {
    const store = await this.resolveStore();
    try {
      await store.decrement(key);
    } catch (err) {
      maybeLogError(err, "store.decrement");
      redisHealthy = false;
      await this.memoryFallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const store = await this.resolveStore();
    try {
      await store.resetKey(key);
    } catch (err) {
      maybeLogError(err, "store.resetKey");
      redisHealthy = false;
      await this.memoryFallback.resetKey(key);
    }
  }

  async resetAll(): Promise<void> {
    const store = await this.resolveStore();
    try {
      await (store.resetAll?.() ?? Promise.resolve());
    } catch (err) {
      maybeLogError(err, "store.resetAll");
      redisHealthy = false;
      await this.memoryFallback.resetAll?.();
    }
  }
}

/**
 * Snapshot of the rate-limit store backend for operator visibility.
 *
 * Surfaced on `/api/admin/system-health` (and the system status page) so a
 * non-engineer can tell at a glance whether the cap is Redis-backed or
 * silently degraded back to per-replica memory.
 *
 *   - `connected`       : REDIS_URL is set and the live ioredis client is
 *                         healthy → caps are shared across restarts/replicas.
 *   - `fallback-memory` : REDIS_URL is set but Redis is unreachable right
 *                         now → LazyRedisStore is delegating to its in-process
 *                         MemoryStore. Cap still enforced, but per-replica
 *                         and wiped on restart. This is the case operators
 *                         must NOTICE — that's the whole point of this field.
 *   - `disabled`        : REDIS_URL is unset → built-in MemoryStore. Fine
 *                         for local dev; a warning sign in production.
 */
export type RedisRateLimitStatus = "connected" | "fallback-memory" | "disabled";

export function getRedisRateLimitStatus(): RedisRateLimitStatus {
  if (!getRedisUrl()) return "disabled";
  return redisHealthy ? "connected" : "fallback-memory";
}

// Test-only helpers. Exported so the cross-replica / cross-restart
// integration test can (a) wait until the module-level ioredis client is
// actually connected (otherwise the very first request transparently
// routes to the per-LazyRedisStore MemoryStore and the test would falsely
// "pass"), and (b) cleanly disconnect that client between vi.resetModules()
// boundaries so vitest's process can exit. NOT used by production code.
export async function __waitForReadyForTest(timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  // Touch ensureClient() so the lazy connect kicks off if it hasn't yet.
  await ensureClient();
  while (Date.now() - start < timeoutMs) {
    if (redisHealthy) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return redisHealthy;
}

export async function __shutdownForTest(): Promise<void> {
  const c = redisClient as { quit?: () => Promise<unknown>; disconnect?: () => void } | null;
  redisClient = null;
  redisHealthy = false;
  attemptedInit = false;
  if (!c) return;
  try {
    if (typeof c.quit === "function") await c.quit();
    else if (typeof c.disconnect === "function") c.disconnect();
  } catch {
    // best-effort — we're tearing down a test fixture, never fail the suite here.
  }
}
