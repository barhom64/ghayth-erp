/**
 * vcm-completeness — computeVcmCompleteness / vcmTone tests. Batch 16 of the
 * FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * Drives the Red/Amber/Green badge on the vehicle VCM tab that tells the
 * operator at-a-glance whether a vehicle clears Gate-PE-1's 70% eligibility
 * threshold. Safety-relevant, so the bug-prone rules each get a test:
 *
 *  - "populated" means `v !== null && v !== undefined && v !== ""` — so a
 *    real 0 (payloadKg: 0) or false (validForCargo: false) COUNTS as
 *    profiled, while ""/null/undefined/absent count as missing. Getting the
 *    falsy predicate wrong would silently mis-score every vehicle.
 *  - only the 11 SAFETY fields count; cosmetic fields the form also edits
 *    (upholstery, screens) must not move the number.
 *  - the percentage is Math.round-ed to mirror the server exactly.
 *  - the tone boundaries are inclusive at the bottom: 70 → amber (NOT red),
 *    90 → green (NOT amber) — the classic off-by-one sites.
 *
 * (A separate static parity test pins VCM_SAFETY_FIELDS against the server's
 * SAFETY_FIELDS; here we only exercise the scoring + tone behaviour.)
 *
 * All values were confirmed against the live functions. Test-only — zero
 * production code.
 */
import { describe, it, expect } from "vitest";
import {
  computeVcmCompleteness,
  vcmTone,
  VCM_MIN_COMPLETENESS,
  VCM_SAFETY_FIELDS,
} from "./vcm-completeness";

// a row with the first `n` safety fields populated (with a truthy 1)
const firstN = (n: number): Record<string, unknown> =>
  Object.fromEntries(VCM_SAFETY_FIELDS.slice(0, n).map((f) => [f, 1]));

describe("computeVcmCompleteness", () => {
  it("scores a fully-profiled vehicle at 100 and an empty row at 0", () => {
    expect(computeVcmCompleteness(firstN(VCM_SAFETY_FIELDS.length))).toBe(100);
    expect(computeVcmCompleteness({})).toBe(0);
  });

  it("counts a real 0 / false as populated but treats ''/null/undefined as missing", () => {
    // payloadKg 0 and validForCargo false ARE profiled → 4 of 11 populated → 36%
    expect(
      computeVcmCompleteness({ vehicleType: "x", fuelType: "y", payloadKg: 0, validForCargo: false }),
    ).toBe(36);
    // same shape but the two values blanked → only 2 populated → 18%
    expect(
      computeVcmCompleteness({ vehicleType: "x", fuelType: "y", payloadKg: "", validForCargo: null }),
    ).toBe(18);
  });

  it("only the 11 safety fields move the number — cosmetic fields are ignored", () => {
    expect(computeVcmCompleteness({ upholsteryType: "leather", screenCount: 5 })).toBe(0);
  });

  it("rounds the percentage to mirror the server (7→64, 8→73, 10→91)", () => {
    expect(computeVcmCompleteness(firstN(7))).toBe(64); // 63.6 → 64
    expect(computeVcmCompleteness(firstN(8))).toBe(73); // 72.7 → 73
    expect(computeVcmCompleteness(firstN(10))).toBe(91); // 90.9 → 91
  });
});

describe("vcmTone", () => {
  it("is red below the 70% gate", () => {
    expect(vcmTone(0)).toBe("red");
    expect(vcmTone(VCM_MIN_COMPLETENESS - 1)).toBe("red"); // 69
  });

  it("is amber from the gate up to (but not including) 90", () => {
    expect(vcmTone(VCM_MIN_COMPLETENESS)).toBe("amber"); // 70 → amber, not red
    expect(vcmTone(89)).toBe("amber");
  });

  it("is green at 90 and above", () => {
    expect(vcmTone(90)).toBe("green"); // 90 → green, not amber
    expect(vcmTone(100)).toBe("green");
  });

  it("uses 70 as the documented gate threshold", () => {
    expect(VCM_MIN_COMPLETENESS).toBe(70);
  });
});
