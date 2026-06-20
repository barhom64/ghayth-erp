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
const REGISTRY = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("umrah tabs nav — derived mirror of the sidebar", () => {
  // The 19-vs-sidebar drift this suite used to police is now structurally
  // impossible: UmrahTabsNav derives both levels (groups + their pages) from
  // the sidebar registry section «العمرة» via the shared ModuleTabsNav — there
  // is no hand-built PRIMARY_TABS/MONITORING_TABS list that can diverge.
  it("UmrahTabsNav delegates to the shared ModuleTabsNav (no hand list to drift)", () => {
    expect(TABS).toMatch(/<ModuleTabsNav\s+section="العمرة"/);
    expect(TABS).not.toMatch(/\bPRIMARY_TABS\b/);
    expect(TABS).not.toMatch(/\blabel:\s*"/);
  });

  it("the monitoring/compliance pages are reachable from the registry the bar mirrors", () => {
    for (const p of [
      "/umrah/compliance", "/umrah/daily-runsheet",
      "/umrah/exempt-pilgrims", "/umrah/reconciliation",
    ]) {
      expect(REGISTRY).toMatch(new RegExp(`path:\\s*"${p.replace(/\//g, "\\/")}"`));
    }
  });

  it("settings + the umrah section are present in the registry the bar derives from", () => {
    expect(REGISTRY).toMatch(/path:\s*"\/umrah\/settings"/);
    expect(REGISTRY).toMatch(/title:\s*"العمرة"/);
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
