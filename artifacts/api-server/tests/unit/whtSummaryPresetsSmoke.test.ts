import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the WHT summary report.
 * Operators reconciling withholding tax to a ZATCA filing usually
 * pick the period (month/quarter/year) — the chips skip the typing.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/wht-summary.tsx"),
  "utf8",
);

describe("wht-summary — date-range presets", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps startDate/endDate into from/to at the boundary", () => {
    expect(PAGE).toMatch(/value=\{\{ from: startDate, to: endDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setStartDate\(r\.from\); setEndDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — WHT filings are period-bound (quarterly to ZATCA)", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to 'wht-summary-preset'", () => {
    expect(PAGE).toMatch(/testidPrefix="wht-summary-preset"/);
  });

  it("presets render ABOVE the free-form date inputs (visual hierarchy)", () => {
    const presetIdx = PAGE.indexOf("<DateRangePresets");
    const fromInputIdx = PAGE.indexOf("onChange={(e) => setStartDate(e.target.value)}");
    expect(presetIdx).toBeGreaterThan(0);
    expect(fromInputIdx).toBeGreaterThan(presetIdx);
  });

  it("free-form date inputs survive (chips are SHORTCUT)", () => {
    expect(PAGE).toMatch(/value=\{startDate\} onChange=\{\(e\) => setStartDate\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{endDate\} onChange=\{\(e\) => setEndDate\(e\.target\.value\)\}/);
  });
});
