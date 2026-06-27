/**
 * date-utils — pure-function tests. Batch 9 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * The Arabic-first date/number foundation that `formatters` builds on:
 *   • toArabicDigits — Western → Arabic-Indic digit conversion (everything else
 *     untouched).
 *   • isValidDate    — the Date-vs-NaN/non-Date guard reused everywhere.
 *   • toISODate      — local YYYY-MM-DD (no timezone shift).
 *   • formatTime     — local HH:mm (24h), padded.
 * Assertions use locally-constructed dates so they are timezone-stable.
 */
import { describe, it, expect } from "vitest";
import {
  toArabicDigits,
  isValidDate,
  toISODate,
  formatTime,
  gregorianToHijri,
  hijriToGregorian,
} from "./date-utils";

describe("toArabicDigits", () => {
  it("converts every Western digit to its Arabic-Indic counterpart", () => {
    expect(toArabicDigits("0123456789")).toBe("٠١٢٣٤٥٦٧٨٩");
    expect(toArabicDigits(2026)).toBe("٢٠٢٦");
  });

  it("leaves non-digit characters untouched", () => {
    expect(toArabicDigits("1,234.5")).toBe("١,٢٣٤.٥"); // ASCII comma + dot unchanged
    expect(toArabicDigits("INV-2026")).toBe("INV-٢٠٢٦");
    expect(toArabicDigits("abc")).toBe("abc");
    expect(toArabicDigits("")).toBe("");
  });
});

describe("isValidDate", () => {
  it("accepts a real Date", () => {
    expect(isValidDate(new Date("2026-01-01"))).toBe(true);
  });

  it("rejects invalid Dates, non-Date values and NaN dates", () => {
    expect(isValidDate(new Date("not-a-date"))).toBe(false);
    expect(isValidDate(new Date(NaN))).toBe(false);
    expect(isValidDate("2026-01-01")).toBe(false);
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
    expect(isValidDate(1700000000000)).toBe(false);
  });
});

describe("toISODate", () => {
  it("formats a Date as local YYYY-MM-DD, zero-padded", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("returns an empty string for an invalid date", () => {
    expect(toISODate(new Date("invalid"))).toBe("");
  });
});

describe("formatTime — 24-hour", () => {
  it("formats local HH:mm zero-padded", () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
    expect(formatTime(new Date(2026, 0, 1, 23, 59))).toBe("23:59");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatTime(new Date("invalid"))).toBe("");
  });
});

// Umm al-Qura Hijri ↔ Gregorian. gregorianToHijri delegates to Intl
// (islamic-umalqura); hijriToGregorian inverts it by approximating then
// searching ±30 days for the exact match. These pin the round-trip exactness
// (verified across 1300-1500 AH, max search offset 4/30) so a future refactor
// of the approximation or the window can't silently shift a pilgrim's date.
describe("Hijri ↔ Gregorian (Umm al-Qura)", () => {
  it("round-trips gregorian↔hijri exactly across the supported range", () => {
    const samples: [number, number, number][] = [
      [1300, 1, 1],
      [1420, 6, 15],
      [1445, 12, 29],
      [1447, 6, 1],
      [1500, 12, 29],
    ];
    for (const [y, m, d] of samples) {
      const g = hijriToGregorian(y, m, d);
      const h = gregorianToHijri(g);
      expect([h.year, h.month, h.day]).toEqual([y, m, d]);
    }
  });

  it("gregorianToHijri returns a plausible Umm al-Qura date (2000-01-01 → ~1420 AH)", () => {
    const h = gregorianToHijri(new Date(2000, 0, 1));
    expect(h.year).toBeGreaterThanOrEqual(1420);
    expect(h.year).toBeLessThanOrEqual(1421);
    expect(h.month).toBeGreaterThanOrEqual(1);
    expect(h.month).toBeLessThanOrEqual(12);
    expect(h.day).toBeGreaterThanOrEqual(1);
    expect(h.day).toBeLessThanOrEqual(30);
  });
});
