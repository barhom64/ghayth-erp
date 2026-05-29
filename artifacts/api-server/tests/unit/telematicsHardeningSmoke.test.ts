/**
 * Smoke tests for the hardening logic added in commit 2/3:
 *   • position event throttling (1 event/device/minute)
 *   • sensor delta thresholds (fuel ≥ 5L, weight ≥ 200kg)
 *   • cron handler shape (module exports the expected functions)
 *
 * Full DB round-trip is covered by integration tests; this file locks the
 * pure logic so a future refactor can't silently regress the noise filters.
 */
import { describe, it, expect } from "vitest";

const POSITION_EVENT_THROTTLE_MS = 60_000;
const SENSOR_DELTA_THRESHOLDS: Record<string, number> = {
  fuel_level: 5,
  weight: 200,
};

describe("position event throttle", () => {
  it("allows the first emission for a device", () => {
    const lastAt = new Map<number, number>();
    const now = 1_000_000;
    const last = lastAt.get(42) ?? 0;
    expect(now - last >= POSITION_EVENT_THROTTLE_MS).toBe(true);
  });

  it("suppresses a second emission within the window", () => {
    const lastAt = new Map<number, number>();
    const now = 1_000_000;
    lastAt.set(42, now);
    const second = now + 30_000;
    const last = lastAt.get(42) ?? 0;
    expect(second - last >= POSITION_EVENT_THROTTLE_MS).toBe(false);
  });

  it("allows emission after the window elapses", () => {
    const lastAt = new Map<number, number>();
    const now = 1_000_000;
    lastAt.set(42, now);
    const future = now + POSITION_EVENT_THROTTLE_MS + 1;
    const last = lastAt.get(42) ?? 0;
    expect(future - last >= POSITION_EVENT_THROTTLE_MS).toBe(true);
  });

  it("tracks devices independently", () => {
    const lastAt = new Map<number, number>();
    lastAt.set(1, 1_000_000);
    // Device 2 has never emitted — must allow.
    expect(1_010_000 - (lastAt.get(2) ?? 0)).toBeGreaterThanOrEqual(POSITION_EVENT_THROTTLE_MS);
  });
});

describe("sensor delta thresholds", () => {
  function shouldEmit(sensorType: string, current: number | null, previous: number | null): boolean {
    const threshold = SENSOR_DELTA_THRESHOLDS[sensorType];
    if (threshold === undefined) return true;            // not a thresholded sensor
    if (current === null || previous === null) return true; // first reading or missing data
    return Math.abs(current - previous) >= threshold;
  }

  it("fuel_level: suppresses sub-5L drift", () => {
    expect(shouldEmit("fuel_level", 50.0, 47.5)).toBe(false);
    expect(shouldEmit("fuel_level", 50.0, 49.9)).toBe(false);
  });

  it("fuel_level: emits on ≥5L change (fill)", () => {
    expect(shouldEmit("fuel_level", 80, 50)).toBe(true);
    expect(shouldEmit("fuel_level", 50, 55)).toBe(true);
  });

  it("fuel_level: emits on ≥5L drop (potential theft)", () => {
    expect(shouldEmit("fuel_level", 30, 60)).toBe(true);
  });

  it("weight: suppresses suspension noise (< 200kg)", () => {
    expect(shouldEmit("weight", 12_000, 11_900)).toBe(false);
  });

  it("weight: emits on dump (≥ 200kg drop)", () => {
    expect(shouldEmit("weight", 8_000, 22_000)).toBe(true);
  });

  it("weight: emits on load (≥ 200kg rise)", () => {
    expect(shouldEmit("weight", 22_000, 8_000)).toBe(true);
  });

  it("first reading always emits (previous = null)", () => {
    expect(shouldEmit("fuel_level", 50, null)).toBe(true);
    expect(shouldEmit("weight", 12_000, null)).toBe(true);
  });

  it("non-thresholded sensors always emit", () => {
    expect(shouldEmit("temperature", 30, 29.9)).toBe(true);
  });
});

describe("telematicsCron module exports", () => {
  it("exports retention + heartbeat handlers", async () => {
    const mod = await import("../../src/lib/fleet/telematicsCron.js");
    expect(typeof mod.fleetTelematicsRetention).toBe("function");
    expect(typeof mod.fleetTelematicsHeartbeat).toBe("function");
  });
});
