import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the reconciliation-hub page
 * (`/finance/reconciliation-hub`). The page's date inputs live in
 * the PageShell `actions` slot — this PR adds a separate card
 * below the FinanceTabsNav with the preset chip row, so operators
 * still get the one-click windows without rebuilding the actions
 * slot layout.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/reconciliation-hub.tsx"),
  "utf8",
);

describe("reconciliation-hub — date-range presets", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps startDate/endDate into from/to at the boundary", () => {
    expect(PAGE).toMatch(/value=\{\{ from: startDate, to: endDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setStartDate\(r\.from\); setEndDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — reconciliation runs against a period, not lifetime", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to 'reconciliation-hub-preset'", () => {
    expect(PAGE).toMatch(/testidPrefix="reconciliation-hub-preset"/);
  });

  it("presets render in a separate card BETWEEN the tabs nav and the info card (no actions-slot rework)", () => {
    const tabsIdx = PAGE.indexOf("<FinanceTabsNav />");
    const presetIdx = PAGE.indexOf("<DateRangePresets");
    const infoIdx = PAGE.indexOf("border-status-info-surface bg-status-info-surface/30");
    expect(tabsIdx).toBeGreaterThan(0);
    expect(presetIdx).toBeGreaterThan(tabsIdx);
    expect(infoIdx).toBeGreaterThan(presetIdx);
  });

  it("free-form date inputs in the PageShell actions slot survive (chips are SHORTCUT)", () => {
    expect(PAGE).toMatch(/value=\{startDate\} onChange=\{\(e\) => setStartDate\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{endDate\} onChange=\{\(e\) => setEndDate\(e\.target\.value\)\}/);
  });
});
