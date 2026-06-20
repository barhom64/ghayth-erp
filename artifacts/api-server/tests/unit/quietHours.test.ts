/**
 * Tests for isWithinQuietHours — the pure reducer that decides whether
 * `now` is inside a user's quiet-hours window. The engine consults
 * this in dispatchNotification: non-urgent events inside the window
 * drop external channels (email/sms/whatsapp/push) and keep only
 * in_app + webhook.
 */
import { describe, it, expect } from "vitest";
import { isWithinQuietHours } from "../../src/lib/notificationDispatch.js";

function at(hhmm: string): Date {
  // Build a Date at the given HH:MM on a fixed local day. Year/month
  // don't affect getHours/getMinutes, which is what the reducer reads.
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2026, 0, 1, 0, 0, 0, 0);
  d.setHours(h, m, 0, 0);
  return d;
}

describe("isWithinQuietHours", () => {
  it("returns false when either bound is missing (unconfigured)", () => {
    expect(isWithinQuietHours(null, "07:00", at("03:00"))).toBe(false);
    expect(isWithinQuietHours("22:00", null, at("03:00"))).toBe(false);
    expect(isWithinQuietHours(null, null, at("03:00"))).toBe(false);
  });

  it("returns false when start equals end (zero-length window)", () => {
    expect(isWithinQuietHours("12:00", "12:00", at("12:00"))).toBe(false);
  });

  it("returns false on a malformed bound", () => {
    expect(isWithinQuietHours("not-a-time", "07:00", at("03:00"))).toBe(false);
  });

  describe("same-day window (e.g. 12:00 → 14:00)", () => {
    it("is inside at the start (inclusive)", () => {
      expect(isWithinQuietHours("12:00", "14:00", at("12:00"))).toBe(true);
    });
    it("is inside mid-window", () => {
      expect(isWithinQuietHours("12:00", "14:00", at("13:30"))).toBe(true);
    });
    it("is outside at the end (exclusive)", () => {
      expect(isWithinQuietHours("12:00", "14:00", at("14:00"))).toBe(false);
    });
    it("is outside before the start", () => {
      expect(isWithinQuietHours("12:00", "14:00", at("11:59"))).toBe(false);
    });
  });

  describe("wrap-around window (e.g. 22:00 → 07:00, common 'don't ping me at night')", () => {
    it("is inside late-evening", () => {
      expect(isWithinQuietHours("22:00", "07:00", at("23:30"))).toBe(true);
    });
    it("is inside at midnight", () => {
      expect(isWithinQuietHours("22:00", "07:00", at("00:00"))).toBe(true);
    });
    it("is inside in the early morning", () => {
      expect(isWithinQuietHours("22:00", "07:00", at("06:30"))).toBe(true);
    });
    it("is outside at the end of the wrap window (exclusive)", () => {
      expect(isWithinQuietHours("22:00", "07:00", at("07:00"))).toBe(false);
    });
    it("is outside during the day", () => {
      expect(isWithinQuietHours("22:00", "07:00", at("14:00"))).toBe(false);
    });
  });
});
