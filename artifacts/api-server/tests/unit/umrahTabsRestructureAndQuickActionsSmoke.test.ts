import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah-system audit follow-ups (PR2 + PR3):
 *
 * (1) Tabs nav restructure — 19 horizontally-scrolling tabs were
 *     cut to 16 primary + a "الرقابة" dropdown (4 items) + a
 *     dedicated ⚙ settings gear. The 4 monitoring/compliance pages
 *     were folded under one dropdown so they stop competing with
 *     the operational tabs for screen real-estate.
 *
 * (2) Dashboard Quick Actions — 4 always-visible action cards
 *     above the KPI grid. Each card deep-links to the action
 *     the operator used to have to hunt for (create pilgrim,
 *     import file, invoice wizard, compliance dashboard).
 */
const TABS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/umrah-tabs-nav.tsx"),
  "utf8",
);
const DASHBOARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/dashboard.tsx"),
  "utf8",
);

describe("umrah tabs nav — restructure", () => {
  it("splits TABS into PRIMARY_TABS + MONITORING_TABS arrays", () => {
    // Pinning the array names ensures any refactor that flattens
    // them back to a single list will trip the smoke + force the
    // author to reconsider the dropdown structure.
    expect(TABS).toMatch(/const PRIMARY_TABS: Tab\[\]/);
    expect(TABS).toMatch(/const MONITORING_TABS: Tab\[\]/);
  });

  it("monitoring dropdown groups compliance + runsheet + exempt + reconciliation", () => {
    // These 4 must be in MONITORING_TABS — not in PRIMARY_TABS.
    const monitoringBlock = TABS.match(/const MONITORING_TABS[\s\S]*?\];/);
    expect(monitoringBlock).not.toBeNull();
    expect(monitoringBlock![0]).toContain("/umrah/compliance");
    expect(monitoringBlock![0]).toContain("/umrah/daily-runsheet");
    expect(monitoringBlock![0]).toContain("/umrah/exempt-pilgrims");
    expect(monitoringBlock![0]).toContain("/umrah/reconciliation");
  });

  it("monitoring dropdown puts compliance first (it's the summary)", () => {
    // The compliance dashboard is the rollup view of the other 3.
    // It should anchor the dropdown so the operator's first click
    // lands on the overview, not a sub-report.
    const monitoringBlock = TABS.match(/const MONITORING_TABS[\s\S]*?\];/)![0];
    const idxCompliance = monitoringBlock.indexOf("/umrah/compliance");
    const idxRunsheet  = monitoringBlock.indexOf("/umrah/daily-runsheet");
    expect(idxCompliance).toBeGreaterThan(0);
    expect(idxRunsheet).toBeGreaterThan(idxCompliance);
  });

  it("primary tabs no longer include the 4 monitoring entries", () => {
    const primaryBlock = TABS.match(/const PRIMARY_TABS[\s\S]*?\];/)![0];
    expect(primaryBlock).not.toContain("/umrah/compliance");
    expect(primaryBlock).not.toContain("/umrah/daily-runsheet");
    expect(primaryBlock).not.toContain("/umrah/exempt-pilgrims");
    expect(primaryBlock).not.toContain("/umrah/reconciliation");
  });

  it("renders the dropdown trigger with stable testids (forwarded to the DOM by TabDropdown)", () => {
    // The monitoring dropdown is rendered via the reusable <TabDropdown>;
    // the trigger + menu testids are passed as props and forwarded onto the
    // real DOM nodes, so e2e selectors stay stable.
    expect(TABS).toContain('testid="umrah-tab-monitoring-dropdown"');
    expect(TABS).toContain('menuTestid="umrah-monitoring-menu"');
    expect(TABS).toMatch(/data-testid=\{testid\}/);
    expect(TABS).toMatch(/data-testid=\{menuTestid\}/);
  });

  it("dropdown opens on hover AND click (operator can use either)", () => {
    expect(TABS).toMatch(/onMouseEnter=\{\(\) => setOpen\(true\)\}/);
    expect(TABS).toMatch(/onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/);
  });

  it("dropdown closes on mouse-leave from the container (no permanent hover state)", () => {
    expect(TABS).toMatch(/onMouseLeave=\{\(\) => setOpen\(false\)\}/);
  });

  it("dropdown trigger highlights when any of its pages is active", () => {
    // `active` is the boolean that drives the trigger styling inside
    // TabDropdown — pin its derivation so a future refactor that forgets
    // to highlight the trigger fails this test.
    expect(TABS).toMatch(/const active = tabs\.some\(\(t\) => isActive\(t, location\)\)/);
  });

  it("settings gear is a separate icon link to /umrah/settings (was hidden before)", () => {
    expect(TABS).toContain('data-testid="umrah-tab-settings-gear"');
    expect(TABS).toMatch(/<Link href="\/umrah\/settings"[^>]*>/);
  });

  it("isActive helper is a pure function — used by every renderable", () => {
    // Single source of truth for active-tab logic. If a future
    // refactor inlines the comparison in two places, the pin still
    // passes (function exists) but the duplicated logic invites
    // drift — keeping the helper visible discourages that.
    expect(TABS).toMatch(/function isActive\(tab: Tab, location: string\): boolean/);
  });

  it("nav exposes a data-testid for e2e selectors", () => {
    expect(TABS).toContain('data-testid="umrah-tabs-nav"');
  });
});

describe("umrah dashboard — Quick Actions panel", () => {
  it("renders the panel container above the KPI grid", () => {
    // Container testid is what the e2e suite asserts on. The 4
    // tiles inside have their own testids.
    expect(DASHBOARD).toContain('data-testid="umrah-quick-actions"');
  });

  it("4 quick action tiles, each a deep-link to the matching flow", () => {
    expect(DASHBOARD).toContain('data-testid="quick-action-pilgrim-create"');
    expect(DASHBOARD).toContain('data-testid="quick-action-import"');
    expect(DASHBOARD).toContain('data-testid="quick-action-invoice"');
    expect(DASHBOARD).toContain('data-testid="quick-action-compliance"');
  });

  it("each tile links to the right route (matches the dropdown / wizard / list)", () => {
    expect(DASHBOARD).toMatch(/href="\/umrah\/pilgrims\/create"/);
    expect(DASHBOARD).toMatch(/href="\/umrah\/import"/);
    expect(DASHBOARD).toMatch(/href="\/umrah\/sales-wizard"/);
    expect(DASHBOARD).toMatch(/href="\/umrah\/compliance"/);
  });

  it("imports Link from wouter (was missing)", () => {
    expect(DASHBOARD).toMatch(/import \{ Link \} from "wouter"/);
  });

  it("imports the 3 new icons for the new tiles", () => {
    // Upload + Sparkles + FileText are added on top of the existing
    // icon set. UserPlus was already imported for the agents tile.
    expect(DASHBOARD).toMatch(/Upload, Sparkles, FileText/);
  });
});
