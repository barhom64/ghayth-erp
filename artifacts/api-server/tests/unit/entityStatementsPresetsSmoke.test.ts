import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the multi-tab entity-statements
 * page (`/finance/entity-statements`). The page has a single
 * startDate/endDate pair that drives ALL tabs (customer / vendor /
 * subsidiary / cost-centre statements), so one preset row updates
 * everything below the tabs.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-statements.tsx"),
  "utf8",
);

describe("entity-statements — date-range presets", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps startDate/endDate into from/to at the boundary", () => {
    expect(PAGE).toMatch(/value=\{\{ from: startDate, to: endDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setStartDate\(r\.from\); setEndDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — these statements are operational drills, not historical archives", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to 'entity-statements-preset'", () => {
    expect(PAGE).toMatch(/testidPrefix="entity-statements-preset"/);
  });

  it("presets render INSIDE the 'الفترة' card, above the free-form date inputs", () => {
    const periodCardIdx = PAGE.indexOf("الفترة");
    const presetIdx = PAGE.indexOf("<DateRangePresets");
    const fromInputIdx = PAGE.indexOf("onChange={(e) => setStartDate(e.target.value)}");
    expect(periodCardIdx).toBeGreaterThan(0);
    expect(presetIdx).toBeGreaterThan(periodCardIdx);
    expect(fromInputIdx).toBeGreaterThan(presetIdx);
  });

  it("free-form date inputs survive (chips are SHORTCUT)", () => {
    expect(PAGE).toMatch(/value=\{startDate\}[\s\S]{0,200}onChange=\{\(e\) => setStartDate\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{endDate\}[\s\S]{0,200}onChange=\{\(e\) => setEndDate\(e\.target\.value\)\}/);
  });
});
