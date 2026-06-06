import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Date-range preset chips wired into the cost-centre P&L comparison
 * page (`/finance/cost-center-pnl`). This page uses `startDate /
 * endDate` rather than the `from / to` shape — the integration maps
 * at the boundary so the shared DateRangePresets component stays
 * the single source of truth for the preset windows.
 *
 * `hideAllTime` is set because an "all-time" P&L comparison would
 * be too coarse to be useful (multi-year aggregates mask trends).
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-pnl.tsx"),
  "utf8",
);

describe("cost-center-pnl — date-range presets", () => {
  it("imports the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
  });

  it("maps the page's startDate/endDate into the component's from/to at the boundary", () => {
    expect(PAGE).toMatch(/value=\{\{ from: startDate, to: endDate \}\}/);
    expect(PAGE).toMatch(/onChange=\{\(r\) => \{ setStartDate\(r\.from\); setEndDate\(r\.to\); \}\}/);
  });

  it("hideAllTime is set — an 'all time' P&L comparison would be too coarse", () => {
    expect(PAGE).toMatch(/<DateRangePresets[\s\S]{0,300}hideAllTime/);
  });

  it("testidPrefix is scoped to this page (no clash with sibling preset rows)", () => {
    expect(PAGE).toMatch(/testidPrefix="cc-pnl-preset"/);
  });

  it("preset row renders BETWEEN the tabs nav and the info card (visual hierarchy)", () => {
    const tabsIdx = PAGE.indexOf("<FinanceTabsNav />");
    const presetIdx = PAGE.indexOf("<DateRangePresets");
    const infoIdx = PAGE.indexOf("border-status-info-surface bg-status-info-surface/30");
    expect(tabsIdx).toBeGreaterThan(0);
    expect(presetIdx).toBeGreaterThan(tabsIdx);
    expect(infoIdx).toBeGreaterThan(presetIdx);
  });

  it("free-form date inputs in the page-shell actions stay (presets are SHORTCUT, not replacement)", () => {
    expect(PAGE).toMatch(/value=\{startDate\} onChange=\{\(e\) => setStartDate\(e\.target\.value\)\}/);
    expect(PAGE).toMatch(/value=\{endDate\} onChange=\{\(e\) => setEndDate\(e\.target\.value\)\}/);
  });
});
