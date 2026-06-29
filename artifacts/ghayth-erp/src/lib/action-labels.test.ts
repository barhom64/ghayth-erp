/**
 * action-labels — actionLabel tests. Batch 19 (tail sweep) of the FE
 * behavioral-coverage effort (ghayth-review documented gap).
 *
 * This module exists to KILL drift: two of three former call sites translated
 * `approve` as "قبول" while the canonical word is "اعتماد", so the same audit
 * row read differently on different pages. The test pins the canonical wording
 * and the fallback-to-slug rule (a typo surfaces as the raw key, never blank).
 * Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { actionLabel } from "./action-labels";

describe("actionLabel", () => {
  it("returns the canonical Arabic verb (approve is 'اعتماد', not 'قبول')", () => {
    expect(actionLabel("approve")).toBe("اعتماد");
    expect(actionLabel("reject")).toBe("رفض");
    expect(actionLabel("create")).toBe("إنشاء");
    expect(actionLabel("refer")).toBe("إحالة");
  });

  it("returns '' for nullish input", () => {
    expect(actionLabel(null)).toBe("");
    expect(actionLabel(undefined)).toBe("");
    expect(actionLabel("")).toBe("");
  });

  it("falls back to the raw key for an unknown verb (typo surfaces, not blank)", () => {
    expect(actionLabel("frobnicate")).toBe("frobnicate");
  });
});
