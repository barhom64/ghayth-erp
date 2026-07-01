/**
 * useRateLimitCooldown — hook tests. Batch 18 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * This hook is MOCKED in every component test (as `{ isCoolingDown: false }`),
 * so its real behaviour is an actual blind spot. It turns the absolute
 * "may-retry-at" timestamp broadcast after a 429 into a live, ticking button
 * state. The bug-prone parts each get a test:
 *
 *  - remainingSeconds = ceil(max(0, until - now) / 1000) — a partial second
 *    rounds UP (4.2s left still shows "5"), and exactly at `until` it is 0.
 *  - isCoolingDown is strictly remainingSeconds > 0, and the Arabic label is
 *    "حاول بعد N ثانية…" while cooling, "" otherwise.
 *  - it ticks down on its own 250ms interval and SHUTS the interval off when
 *    the countdown hits zero (no leak, button auto-restores).
 *  - it subscribes to the broadcast, so a fresh 429 mid-mount starts the
 *    countdown live.
 *
 * Fake timers drive both setInterval and Date.now from a fixed base so the
 * arithmetic is deterministic. The rate-limit broadcast module is mocked and
 * replays current state on subscribe, exactly like the real one. Test-only —
 * zero production code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const h = vi.hoisted(() => ({
  until: 0,
  subscriber: null as null | ((n: number) => void),
}));

vi.mock("@/lib/rate-limit-toast", () => ({
  getRateLimitCooldownUntil: () => h.until,
  subscribeRateLimitCooldown: (cb: (n: number) => void) => {
    h.subscriber = cb;
    cb(h.until); // replay current state on subscribe, like the real impl
    return () => {
      h.subscriber = null;
    };
  },
}));

import { useRateLimitCooldown } from "./use-rate-limit-cooldown";

const BASE = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  h.until = 0;
  h.subscriber = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRateLimitCooldown", () => {
  it("is idle when there is no active cooldown", () => {
    h.until = BASE - 5000; // already elapsed
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.isCoolingDown).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.label).toBe("");
  });

  it("derives whole seconds remaining and the Arabic label while cooling", () => {
    h.until = BASE + 5000;
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.isCoolingDown).toBe(true);
    expect(result.current.remainingSeconds).toBe(5);
    expect(result.current.label).toBe("حاول بعد 5 ثانية…");
  });

  it("rounds a partial second UP (ceil)", () => {
    h.until = BASE + 4200; // 4.2s left
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.remainingSeconds).toBe(5);
    expect(result.current.label).toBe("حاول بعد 5 ثانية…");
  });

  it("ticks the remaining seconds down as time advances", () => {
    h.until = BASE + 5000;
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.remainingSeconds).toBe(5);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remainingSeconds).toBe(3);
    expect(result.current.label).toBe("حاول بعد 3 ثانية…");
  });

  it("returns to idle and stops ticking once the countdown reaches zero", () => {
    h.until = BASE + 1000;
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.isCoolingDown).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.isCoolingDown).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.label).toBe("");

    // interval is off now — advancing further changes nothing
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isCoolingDown).toBe(false);
  });

  it("starts the countdown live when a fresh 429 is broadcast", () => {
    h.until = 0;
    const { result } = renderHook(() => useRateLimitCooldown());
    expect(result.current.isCoolingDown).toBe(false);

    act(() => {
      h.subscriber?.(BASE + 3000); // a 429 lands while mounted
    });
    expect(result.current.isCoolingDown).toBe(true);
    expect(result.current.remainingSeconds).toBe(3);
    expect(result.current.label).toBe("حاول بعد 3 ثانية…");
  });
});
