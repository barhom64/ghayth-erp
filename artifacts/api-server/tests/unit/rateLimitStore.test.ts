import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// rateLimitStore.ts is exercised in two production-relevant configurations:
//
//   1. REDIS_URL unset  → makeRateLimitStore() must return undefined so each
//      express-rate-limit instance falls back to its built-in MemoryStore.
//
//   2. REDIS_URL set    → makeRateLimitStore() must return a Store-shaped
//      object (init/increment/decrement/resetKey/resetAll). When Redis is
//      reachable it forwards to RedisStore; when Redis is unreachable it
//      forwards to a per-limiter MemoryStore so caps still apply
//      (NOT allow-all — code review explicitly rejected the previous
//      "return {totalHits: 0}" outage path as a security regression).
//
// We unit-test the contract surface here. The monotonic-counting behaviour
// of the unreachable-Redis fallback is verified by the standalone repro
// committed alongside this change (see PR description) and confirmed at
// boot time by the api-server logging
// "REDIS_URL not set — rate-limit stores will use in-process memory"
// when REDIS_URL is unset. Exercising it in-process under vitest is
// unreliable because the module-level ioredis singleton's connect attempt
// races with vitest's hooks, producing nondeterministic redisHealthy state.

const originalRedisUrl = process.env.REDIS_URL;
beforeEach(() => {
  // rateLimitStore.ts caches the normalised URL (`cachedRedisUrl`) at
  // module load. Reset module registry so each test gets a fresh
  // module that re-reads process.env.REDIS_URL.
  vi.resetModules();
});
afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

describe("makeRateLimitStore", () => {
  it("returns undefined when REDIS_URL is unset (express-rate-limit uses its built-in MemoryStore)", async () => {
    delete process.env.REDIS_URL;
    const { makeRateLimitStore } = await import("../../src/lib/rateLimitStore.js");
    expect(makeRateLimitStore("test:no-redis")).toBeUndefined();
  });

  it("returns a Store-shaped object when REDIS_URL is set", async () => {
    // Use an unreachable host so we don't accidentally connect to a real
    // Redis on the dev machine. We're only checking the surface here.
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    const { makeRateLimitStore } = await import("../../src/lib/rateLimitStore.js");
    const store = makeRateLimitStore("test:shape");
    expect(store).toBeDefined();
    // express-rate-limit Store contract: these four methods must exist.
    expect(typeof store!.increment).toBe("function");
    expect(typeof store!.decrement).toBe("function");
    expect(typeof store!.resetKey).toBe("function");
    // init is optional in the type but our wrapper provides it so the
    // memory fallback can pre-allocate its window.
    expect(typeof store!.init).toBe("function");
  });
});
