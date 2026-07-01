import { describe, it, expect } from "vitest";
import { overstayPenaltyAmount } from "../../src/lib/umrahPenaltyMath.js";

/**
 * Assertion tests for the SHARED overstay-penalty math — the single source of
 * truth now used by BOTH the daily auto-detection cron (umrahDailyOverstayScan)
 * and the mutamers import (umrahImportEngine.detectViolation). Before this fix
 * the import hard-coded a flat `days × 200`, so the same overstay was billed
 * differently depending on which path detected it first; these pin the unified
 * amount the invoice charges (umrah_violations.penaltyAmount).
 *
 * Operator's stated rule: base program length, then every started block of
 * `tierDays` days costs `tierAmount` — ceil(overDays / tierDays) × tierAmount.
 */

const TIER = { perDay: 0, tierDays: 10, tierAmount: 50 }; // "every 10 days +50"
const PERDAY = { perDay: 200, tierDays: 0, tierAmount: 0 }; // flat per-day, no tiers

describe("overstayPenaltyAmount — tiered model (operator's billing rule)", () => {
  it("charges per STARTED block: ceil(overDays / tierDays) × tierAmount", () => {
    expect(overstayPenaltyAmount(5, TIER)).toBe(50); // ceil(5/10)=1 → 50
    expect(overstayPenaltyAmount(15, TIER)).toBe(100); // ceil(15/10)=2 → 100
    expect(overstayPenaltyAmount(25, TIER)).toBe(150); // ceil(25/10)=3 → 150
  });

  it("treats an exact block boundary as that block, not the next", () => {
    expect(overstayPenaltyAmount(10, TIER)).toBe(50); // ceil(10/10)=1 → 50
    expect(overstayPenaltyAmount(20, TIER)).toBe(100); // ceil(20/10)=2 → 100 (NOT 150)
  });

  it("the first overstayed day already costs a full block", () => {
    expect(overstayPenaltyAmount(1, TIER)).toBe(50);
  });
});

describe("overstayPenaltyAmount — per-day fallback", () => {
  it("uses overDays × perDay when the tier keys aren't set", () => {
    expect(overstayPenaltyAmount(5, PERDAY)).toBe(1000); // 5 × 200
    expect(overstayPenaltyAmount(1, PERDAY)).toBe(200);
  });

  it("falls back to per-day when only ONE tier key is set (partial config is not tiered)", () => {
    expect(overstayPenaltyAmount(5, { perDay: 200, tierDays: 10, tierAmount: 0 })).toBe(1000);
    expect(overstayPenaltyAmount(5, { perDay: 200, tierDays: 0, tierAmount: 50 })).toBe(1000);
  });

  it("yields 0 when nothing is configured (no silent default)", () => {
    expect(overstayPenaltyAmount(5, { perDay: 0, tierDays: 0, tierAmount: 0 })).toBe(0);
  });
});

describe("overstayPenaltyAmount — input hardening", () => {
  it("clamps a non-positive / missing overDays to 0", () => {
    expect(overstayPenaltyAmount(0, TIER)).toBe(0);
    expect(overstayPenaltyAmount(-3, PERDAY)).toBe(0);
    expect(overstayPenaltyAmount(null, TIER)).toBe(0);
    expect(overstayPenaltyAmount(undefined, PERDAY)).toBe(0);
    expect(overstayPenaltyAmount(Number.NaN, TIER)).toBe(0);
  });

  it("coerces a numeric string (CSV/import values arrive as text)", () => {
    expect(overstayPenaltyAmount("5", TIER)).toBe(50);
    expect(overstayPenaltyAmount("7", PERDAY)).toBe(1400); // 7 × 200
  });
});
