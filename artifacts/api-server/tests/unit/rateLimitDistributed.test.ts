import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Cross-replica + cross-restart rate-limit integration test (Task #159).
//
// What this proves — on a REAL api-server endpoint (`POST /api/auth/login`,
// the loginLimiter at 10/min) booted via the actual `src/app.ts` module:
//
//   1. Two api-server processes pointed at the same REDIS_URL share their
//      rate-limit counters via Redis. Hammering replica 1 to the loginLimiter
//      cap causes replica 2's very first login attempt to return 429.
//      (The MemoryStore failure mode this guards against would let each
//      replica enforce its own independent 10/min, so 2 replicas = 20/min
//      effective.)
//
//   2. A user who burns through their per-actor budget is still blocked
//      after the api-server process restarts. We boot the app, hit the
//      loginLimiter to 11 calls (last one 429), then re-isolate the module
//      graph (== a real api-server restart with a brand-new ioredis client)
//      and verify the very first login attempt is STILL 429. The only way
//      that can be true is if the counter persisted in Redis across the
//      restart.
//
// Why we use isolated module graphs (vi.isolateModulesAsync):
//   - rateLimitStore.ts holds a module-level ioredis singleton. To get two
//     genuinely independent "replica" connections (or a fresh "post-restart"
//     connection) inside one vitest process, each must be loaded in its own
//     module registry. vi.isolateModulesAsync is the supported way to do
//     this without polluting the global module cache.
//   - Each isolated boot calls __shutdownForTest() in a finally block so
//     the per-replica ioredis client is quit and vitest can exit cleanly.
//
// Why the suite skips when REDIS_URL is unset:
//   - rateLimitStore.ts contract when REDIS_URL is unset is "return
//     undefined → MemoryStore". MemoryStore by definition does NOT survive
//     restart and is NOT shared across replicas — there is nothing
//     meaningful to assert in that mode, so we skip cleanly instead of
//     failing local dev runs.
//
// Why the loginLimiter, specifically:
//   - It's the lowest-cap (10/min) public endpoint in the API and runs the
//     limiter middleware BEFORE the route handler, so the limiter increments
//     every request regardless of whether the handler can reach the DB.
//     That means we can run this integration test without a real Postgres
//     reachable — the first 10 requests will return 4xx/5xx (no DB), and
//     the 11th will return 429 from the limiter itself.
//
// Why we set a unique X-Forwarded-For per test:
//   - The loginLimiter keys off req.ip. With `app.set("trust proxy", 1)` in
//     app.ts, X-Forwarded-For is honoured, so a unique IP per test gives
//     each test a fresh bucket and avoids cross-test pollution from prior
//     suite runs that may have left counters in Redis.

const REDIS_URL = process.env.REDIS_URL;
const d = REDIS_URL ? describe : describe.skip;

let ipCounter = 0;
function nextTestIp(): string {
  ipCounter++;
  // 10.159.x.x — RFC1918 space, unique-per-test, namespaced to Task #159
  // for easy grep/cleanup of leftover keys in a real shared Redis.
  return `10.159.${(ipCounter >> 8) & 0xff}.${ipCounter & 0xff}`;
}

async function flushLoginKeys(ip: string): Promise<void> {
  const { default: Redis } = await import("ioredis");
  const c = new Redis(REDIS_URL!, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  try {
    // rate-limit-redis stores keys as `<prefix><key>`, where rateLimitStore.ts
    // sets prefix to `rl:auth:login:` for the loginLimiter and the key is
    // the actor IP returned by express-rate-limit's default keyGenerator.
    const keys = await c.keys(`rl:auth:login:*${ip}*`);
    if (keys.length) await c.del(...keys);
  } finally {
    await c.quit().catch(() => {});
  }
}

async function inFreshAppProcess<T>(
  fn: (app: Express) => Promise<T>,
): Promise<T> {
  let result!: T;
  await vi.isolateModulesAsync(async () => {
    const appMod = await import("../../src/app.js");
    const storeMod = await import("../../src/lib/rateLimitStore.js");
    // If REDIS_URL is set but Redis isn't actually reachable, the store
    // transparently delegates to a per-LazyRedisStore MemoryStore — at
    // which point the cross-replica / cross-restart properties this suite
    // is asserting do not hold. Surface that as a clear failure rather
    // than a silently-passing test.
    const ready = await storeMod.__waitForReadyForTest();
    try {
      expect(
        ready,
        "Redis client did not become ready within 3s — REDIS_URL is set but unreachable",
      ).toBe(true);
      result = await fn(appMod.default);
    } finally {
      await storeMod.__shutdownForTest();
    }
  });
  return result;
}

async function postLogin(app: Express, ip: string) {
  return request(app)
    .post("/api/auth/login")
    .set("X-Forwarded-For", ip)
    .send({ email: "rate-limit-probe@example.com", password: "wrong" });
}

beforeAll(() => {
  // rawdb.ts lazy-constructs the pg pool on first query and throws
  // "DATABASE_URL must be set" if the env var is missing. The login route
  // hits the DB inside the handler — but the loginLimiter middleware runs
  // BEFORE the handler, so the counter increments regardless of whether
  // the handler succeeds. Setting an unreachable DSN keeps the pool
  // constructible without us depending on a real Postgres for this test.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://probe:probe@127.0.0.1:1/none";
  }
});

d("rate-limit on real /api/auth/login: distributed correctness (Task #159)", () => {
  it("two api-server replicas pointed at the same Redis share the loginLimiter counter", async () => {
    const ip = nextTestIp();
    await flushLoginKeys(ip);

    // Replica 1: burn the loginLimiter (10/min) to exactly its cap.
    await inFreshAppProcess(async (app) => {
      for (let i = 0; i < 10; i++) {
        const r = await postLogin(app, ip);
        expect(
          r.status,
          `login attempt ${i + 1}/10 on replica 1 should NOT be rate-limited yet`,
        ).not.toBe(429);
      }
    });

    // Replica 2: independent module graph + independent ioredis client,
    // same Redis. The very first login attempt from the same actor IP
    // must already hit the SHARED cap. If this 429 doesn't materialise,
    // it means the limiter is back to per-process MemoryStore semantics
    // (== Task #150 silently regressed).
    await inFreshAppProcess(async (app) => {
      const r = await postLogin(app, ip);
      expect(r.status).toBe(429);
    });
  }, 30_000);

  it("loginLimiter cap survives a process restart (counts persist in Redis)", async () => {
    const ip = nextTestIp();
    await flushLoginKeys(ip);

    // "Process 1": connect, hammer to cap, observe the 11th request 429.
    await inFreshAppProcess(async (app) => {
      for (let i = 0; i < 10; i++) {
        const r = await postLogin(app, ip);
        expect(
          r.status,
          `login attempt ${i + 1}/10 should NOT yet be rate-limited`,
        ).not.toBe(429);
      }
      const over = await postLogin(app, ip);
      expect(over.status).toBe(429);
    });

    // "Process 2": fresh module graph == a real restart. Same REDIS_URL,
    // brand-new ioredis client. The very first login attempt must still
    // return 429 — the counter survived the restart purely via Redis.
    await inFreshAppProcess(async (app) => {
      const r = await postLogin(app, ip);
      expect(r.status).toBe(429);
    });
  }, 30_000);
});
