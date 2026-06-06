import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the posting-activity report.
 * The page already has a `fromDate / toDate` pair; the chips just
 * skip the typing for the common windows (YTD, last quarter, etc).
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/posting-activity.tsx"),
  "utf8",
);

describe("posting-activity — date-range presets", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps fromDate/toDate into from/to at the boundary", () => {
    expect(PAGE).toMatch(/value=\{\{ from: fromDate, to: toDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setFromDate\(r\.from\); setToDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — posting-activity is a journal-volume slice, not a lifetime audit", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to 'posting-activity-preset'", () => {
    expect(PAGE).toMatch(/testidPrefix="posting-activity-preset"/);
  });

  it("presets render ABOVE the free-form date inputs (visual hierarchy)", () => {
    const presetIdx = PAGE.indexOf("<DateRangePresets");
    const fromInputIdx = PAGE.indexOf('value={fromDate} onChange={(e) => setFromDate(e.target.value)}');
    expect(presetIdx).toBeGreaterThan(0);
    expect(fromInputIdx).toBeGreaterThan(presetIdx);
  });

  it("free-form date inputs survive (chips are SHORTCUT)", () => {
    expect(PAGE).toMatch(/value=\{fromDate\} onChange=\{\(e\) => setFromDate\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{toDate\} onChange=\{\(e\) => setToDate\(e\.target\.value\)\}/);
  });
});
