/**
 * Smoke tests for the retry + circuit-breaker primitives used by the
 * telematics auto-poller. These are pure-in-process helpers; the cron
 * integration is exercised separately.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  executeWithRetry,
  CircuitBreaker,
  CircuitOpenError,
  telematicsBreaker,
} from "../../src/lib/fleet/telematicsReliability.js";

describe("executeWithRetry", () => {
  it("returns immediately on success", async () => {
    let attempts = 0;
    const out = await executeWithRetry(async () => {
      attempts++;
      return 42;
    });
    expect(out).toBe(42);
    expect(attempts).toBe(1);
  });

  it("retries transient failures up to maxAttempts", async () => {
    let attempts = 0;
    const out = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("network blip");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
    );
    expect(out).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("rethrows after exhausting attempts", async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error("network blip");
        },
        { maxAttempts: 2, baseDelayMs: 1, jitter: false },
      ),
    ).rejects.toThrow("network blip");
    expect(attempts).toBe(2);
  });

  it("does NOT retry 4xx errors (permanent)", async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error("CMSV6 /foo → HTTP 401: bad creds");
        },
        { maxAttempts: 5, baseDelayMs: 1, jitter: false },
      ),
    ).rejects.toThrow("HTTP 401");
    expect(attempts).toBe(1);
  });

  it("retries 5xx errors (transient)", async () => {
    let attempts = 0;
    const out = await executeWithRetry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error("CMSV6 /foo → HTTP 503: try again");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1, jitter: false },
    );
    expect(out).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("respects a custom retryable predicate", async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        async () => {
          attempts++;
          throw new Error("custom");
        },
        {
          maxAttempts: 5,
          baseDelayMs: 1,
          jitter: false,
          retryable: () => false,
        },
      ),
    ).rejects.toThrow("custom");
    expect(attempts).toBe(1);
  });
});

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;
  beforeEach(() => {
    breaker = new CircuitBreaker(3, 100);
  });

  it("starts closed", () => {
    expect(breaker.isOpen(1)).toBe(false);
  });

  it("opens after N consecutive failures", () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(breaker.isOpen(1)).toBe(false);
    breaker.recordFailure(1);
    expect(breaker.isOpen(1)).toBe(true);
  });

  it("isolates failures per integration", () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(breaker.isOpen(1)).toBe(true);
    expect(breaker.isOpen(2)).toBe(false);
  });

  it("success clears the failure count", () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordSuccess(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(breaker.isOpen(1)).toBe(false);
  });

  it("reopens after cooldown elapses (half-open)", async () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(breaker.isOpen(1)).toBe(true);
    await new Promise((r) => setTimeout(r, 110));
    expect(breaker.isOpen(1)).toBe(false);
  });

  it("execute() short-circuits when open", async () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    await expect(breaker.execute(1, async () => "should not run")).rejects.toThrow(
      CircuitOpenError,
    );
  });

  it("execute() records success on a happy path", async () => {
    const out = await breaker.execute(1, async () => "ok");
    expect(out).toBe("ok");
    expect(breaker.isOpen(1)).toBe(false);
  });

  it("snapshot() exposes diagnostic state", () => {
    breaker.recordFailure(7);
    breaker.recordFailure(7);
    const snap = breaker.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].integrationId).toBe(7);
    expect(snap[0].failures).toBe(2);
    expect(snap[0].openedAt).toBeNull();
  });
});

describe("telematicsBreaker singleton", () => {
  beforeEach(() => telematicsBreaker.__reset());
  it("is shared by every caller", () => {
    telematicsBreaker.recordFailure(99);
    const snap = telematicsBreaker.snapshot();
    expect(snap.some((s) => s.integrationId === 99)).toBe(true);
  });
});
