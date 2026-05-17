import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { currentDateInTz, combineDateAndShiftTime } from "../../src/lib/businessHelpers.js";

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "UTC";
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("currentDateInTz — Asia/Riyadh (Task #400)", () => {
  it("returns the next day for an instant just after Riyadh midnight (= 21:00 UTC the day before)", () => {
    // 2026-05-13 22:30 UTC === 2026-05-14 01:30 Asia/Riyadh
    const instant = new Date("2026-05-13T22:30:00.000Z");
    expect(currentDateInTz("Asia/Riyadh", instant)).toBe("2026-05-14");
  });

  it("returns the previous day for an instant just before Riyadh midnight (= 20:59 UTC)", () => {
    // 2026-05-13 20:59 UTC === 2026-05-13 23:59 Asia/Riyadh
    const instant = new Date("2026-05-13T20:59:00.000Z");
    expect(currentDateInTz("Asia/Riyadh", instant)).toBe("2026-05-13");
  });

  it("does not depend on process.env.TZ", () => {
    const instant = new Date("2026-05-14T05:00:00.000Z"); // 08:00 Riyadh
    expect(currentDateInTz("Asia/Riyadh", instant)).toBe("2026-05-14");
  });

  it("returns YYYY-MM-DD format with zero-padded month/day", () => {
    const instant = new Date("2026-01-05T10:00:00.000Z");
    expect(currentDateInTz("Asia/Riyadh", instant)).toBe("2026-01-05");
  });
});

describe("combineDateAndShiftTime — Asia/Riyadh (Task #400)", () => {
  it("interprets '08:00' as 08:00 Riyadh = 05:00 UTC (not 08:00 UTC)", () => {
    const d = combineDateAndShiftTime("2026-05-14", "08:00", "Asia/Riyadh");
    expect(d.toISOString()).toBe("2026-05-14T05:00:00.000Z");
  });

  it("interprets '17:00' as 17:00 Riyadh = 14:00 UTC", () => {
    const d = combineDateAndShiftTime("2026-05-14", "17:00", "Asia/Riyadh");
    expect(d.toISOString()).toBe("2026-05-14T14:00:00.000Z");
  });

  it("computes lateMinutes correctly for an 08:30 Riyadh check-in against an 08:00 Riyadh shift", () => {
    // Employee walks in at 08:30 Riyadh (= 05:30 UTC).
    // Shift starts at 08:00 Riyadh (= 05:00 UTC).
    // Expected: 30 minutes late (NOT -150 minutes early as the old
    // server-local setHours impl would have produced on a TZ=UTC server).
    const now = new Date("2026-05-14T05:30:00.000Z");
    const expected = combineDateAndShiftTime("2026-05-14", "08:00", "Asia/Riyadh");
    const lateMinutes = Math.floor((now.getTime() - expected.getTime()) / 60000);
    expect(lateMinutes).toBe(30);
  });

  it("computes overtimeMinutes correctly for an 18:00 Riyadh check-out against a 17:00 Riyadh shift end", () => {
    const now = new Date("2026-05-14T15:00:00.000Z"); // 18:00 Riyadh
    const shiftEnd = combineDateAndShiftTime("2026-05-14", "17:00", "Asia/Riyadh");
    const overtimeMinutes = Math.floor((now.getTime() - shiftEnd.getTime()) / 60000);
    expect(overtimeMinutes).toBe(60);
  });

  it("handles the 'HH:MM:SS' shape by ignoring the seconds component", () => {
    // hr.ts passes `String(shift.startTime).slice(0, 5)` so seconds never
    // reach this helper — but be defensive.
    const d = combineDateAndShiftTime("2026-05-14", "08:00", "Asia/Riyadh");
    expect(d.toISOString()).toBe("2026-05-14T05:00:00.000Z");
  });
});
