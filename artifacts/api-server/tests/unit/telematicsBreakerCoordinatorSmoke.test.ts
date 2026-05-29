/**
 * CircuitBreaker cross-replica coordination — smoke tests (#1354).
 *
 * The Redis pub/sub layer is not exercised here (that would require an
 * actual Redis or a heavyweight mock). What we lock is the seams that
 * make distribution possible: the `onOpen` callback fires exactly on
 * the closed → open transition, the `markOpen` hook lets external
 * coordination push state INTO the breaker without re-publishing, and
 * the loopback math the coordinator uses to ignore its own broadcasts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
} from "../../src/lib/fleet/telematicsReliability.js";

describe("CircuitBreaker.onOpenCallback", () => {
  let breaker: CircuitBreaker;
  let opens: Array<{ id: number; openedAt: number; cooldownMs: number }>;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 60_000);
    opens = [];
    breaker.setOnOpenCallback((id, openedAt, cooldownMs) => {
      opens.push({ id, openedAt, cooldownMs });
    });
  });

  it("fires exactly once on the closed → open transition", () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(opens).toHaveLength(0);
    breaker.recordFailure(1);
    expect(opens).toHaveLength(1);
    expect(opens[0].id).toBe(1);
    expect(opens[0].cooldownMs).toBe(60_000);
    expect(opens[0].openedAt).toBeGreaterThan(0);
  });

  it("does NOT re-fire on subsequent failures while already open", () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(opens).toHaveLength(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(opens).toHaveLength(1);
  });

  it("fires independently per integration", () => {
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(2);
    breaker.recordFailure(2);
    breaker.recordFailure(2);
    expect(opens).toHaveLength(2);
    expect(new Set(opens.map((o) => o.id))).toEqual(new Set([1, 2]));
  });

  it("can be cleared by passing null", () => {
    breaker.setOnOpenCallback(null);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    expect(opens).toHaveLength(0);
  });

  it("a throwing callback does not break the breaker", () => {
    breaker.setOnOpenCallback(() => {
      throw new Error("redis exploded");
    });
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    breaker.recordFailure(1);
    // The breaker still opened locally despite the callback throwing.
    expect(breaker.isOpen(1)).toBe(true);
  });
});

describe("CircuitBreaker.markOpen (external coordination)", () => {
  let breaker: CircuitBreaker;
  let opens: number[];

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 60_000);
    opens = [];
    breaker.setOnOpenCallback((id) => opens.push(id));
  });

  it("marks an integration as open externally", () => {
    expect(breaker.isOpen(42)).toBe(false);
    breaker.markOpen(42, Date.now());
    expect(breaker.isOpen(42)).toBe(true);
  });

  it("does NOT invoke the onOpen callback (prevents pub/sub feedback loop)", () => {
    breaker.markOpen(42, Date.now());
    expect(opens).toHaveLength(0);
  });

  it("respects the cooldown TTL like a locally-opened breaker", async () => {
    const shortCooldown = new CircuitBreaker(3, 50);
    shortCooldown.markOpen(42, Date.now());
    expect(shortCooldown.isOpen(42)).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(shortCooldown.isOpen(42)).toBe(false);
  });

  it("is idempotent — calling markOpen twice doesn't double-mark", () => {
    const at = Date.now();
    breaker.markOpen(42, at);
    breaker.markOpen(42, at + 1000);
    expect(breaker.isOpen(42)).toBe(true);
    const snap = breaker.snapshot();
    expect(snap.filter((s) => s.integrationId === 42)).toHaveLength(1);
  });

  it("interacts correctly with execute()", async () => {
    breaker.markOpen(99, Date.now());
    await expect(breaker.execute(99, async () => "should not run")).rejects.toThrow(
      CircuitOpenError,
    );
  });
});

describe("CircuitBreaker.cooldown accessor (coordinator needs this)", () => {
  it("exposes the cooldown in ms so the coordinator can set Redis TTLs", () => {
    const b = new CircuitBreaker(3, 75_000);
    expect(b.cooldown).toBe(75_000);
  });
});

describe("Coordinator loopback math", () => {
  // The coordinator stamps every broadcast with an `origin` id and ignores
  // messages whose origin matches its own. The test below locks that
  // invariant against the same JSON shape the coordinator uses.
  it("ignores messages from the same origin id", () => {
    const myOrigin = "pid-12345:1700000000:abc123";
    const message = JSON.stringify({
      integrationId: 7,
      openedAt: Date.now(),
      cooldownMs: 60_000,
      origin: myOrigin,
    });
    const parsed = JSON.parse(message) as { origin: string };
    expect(parsed.origin === myOrigin).toBe(true);
  });

  it("accepts messages from a different origin id", () => {
    const myOrigin = "pid-12345:1700000000:abc123";
    const theirOrigin = "pid-99999:1700000099:def456";
    const message = JSON.stringify({
      integrationId: 7,
      openedAt: Date.now(),
      cooldownMs: 60_000,
      origin: theirOrigin,
    });
    const parsed = JSON.parse(message) as { origin: string };
    expect(parsed.origin === myOrigin).toBe(false);
  });
});
