import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips on the trial-balance-comparison page.
 * This page has TWO independent ranges — «الفترة الحالية» (current)
 * and «الفترة المقارَنة» (comparison). The presets drive ONLY the
 * current range; the comparison range stays manual because the
 * operator deliberately picks the baseline to compare against
 * (e.g. same period last year, or a frozen prior close).
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/trial-balance-comparison.tsx"),
  "utf8",
);

describe("trial-balance-comparison — presets on the current period only", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps curStart/curEnd into from/to at the boundary", () => {
    expect(PAGE).toMatch(/value=\{\{ from: curStart, to: curEnd \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setCurStart\(r\.from\); setCurEnd\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — a trial balance is taken as-of a period, never all-time", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to the CURRENT period ('tb-comparison-cur-preset')", () => {
    expect(PAGE).toMatch(/testidPrefix="tb-comparison-cur-preset"/);
  });

  it("does NOT add a preset row to the comparison period (operator picks the baseline manually)", () => {
    // Exactly ONE DateRangePresets on the page, and it drives curStart/curEnd.
    const occurrences = PAGE.match(/<DateRangePresets/g);
    expect(occurrences).not.toBeNull();
    expect(occurrences!.length).toBe(1);
    // The comparison setters must NOT be wired to a preset onChange.
    expect(PAGE).not.toMatch(/setPriorStart\(r\.from\)/);
  });

  it("free-form date inputs survive for BOTH periods (presets are a current-period SHORTCUT)", () => {
    expect(PAGE).toMatch(/value=\{curStart\} onChange=\{\(e\) => setCurStart\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{curEnd\} onChange=\{\(e\) => setCurEnd\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{priorStart\} onChange=\{\(e\) => setPriorStart\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{priorEnd\} onChange=\{\(e\) => setPriorEnd\(e\.target\.value\)\}/);
  });
});
