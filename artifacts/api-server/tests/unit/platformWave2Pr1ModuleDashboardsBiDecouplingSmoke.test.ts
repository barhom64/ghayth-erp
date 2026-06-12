/**
 * PR-1 / #2163 — `/module-dashboards/*` is decoupled from
 * `requireModule("bi")`.
 *
 * The mount used to be:
 *   router.use("/module-dashboards", requireModule("bi"), moduleDashboardsRouter)
 *
 * Result: every manager who owned their own module but not BI got 403
 * on their own dashboard tab. PR-1 removes the mount-level gate; the
 * per-route `authorize({ feature: "<module>", action: "list" })` on
 * each of the 11 tab endpoints (hr/finance/fleet/legal/properties/
 * projects/crm/store/support/tasks/warehouse) becomes the canonical
 * gate. This pin keeps the regression trapped:
 *
 *   1. The `/module-dashboards` mount carries NO requireModule("bi")
 *      (or any other module gate).
 *   2. Every tab endpoint still carries its per-route authorize().
 *   3. The 6 nav items pointing at `?tab=X` carry module="X", NOT
 *      module="bi" (so the sidebar filter agrees with the backend
 *      after PR-1).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INDEX  = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"), "utf8");
const ROUTER = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/moduleDashboards.ts"), "utf8");
const NAV    = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");

describe("PR-1 (#2163) — /module-dashboards mount carries NO module gate", () => {
  it("mount is exactly `router.use(\"/module-dashboards\", moduleDashboardsRouter)`", () => {
    // Strip line comments so the explanation block above the mount
    // doesn't trip the regex (it discusses the old requireModule shape).
    const codeOnly = INDEX.replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).toMatch(/router\.use\("\/module-dashboards",\s*moduleDashboardsRouter\)/);
  });

  it("the bi gate is GONE from the mount (regression trap)", () => {
    // Code-only — comments here discuss the old shape on purpose.
    const codeOnly = INDEX.replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/router\.use\("\/module-dashboards",\s*requireModule\("bi"\)/);
    // Defensively: no requireModule of any name on the mount.
    expect(codeOnly).not.toMatch(/router\.use\("\/module-dashboards",\s*requireModule\(/);
  });
});

describe("PR-1 (#2163) — every tab endpoint keeps its per-route authorize()", () => {
  const TABS: Array<[string, string]> = [
    ["hr",         "hr"],
    ["finance",    "finance.reports"],
    ["fleet",      "fleet"],
    ["legal",      "legal"],
    ["properties", "properties"],
    ["projects",   "projects"],
    ["crm",        "crm"],
    ["store",      "store"],
    ["support",    "support"],
    ["tasks",      "tasks"],
    ["warehouse",  "warehouse"],
  ];
  for (const [tab, feature] of TABS) {
    it(`tab /${tab} carries authorize({ feature: "${feature}", action: "list" })`, () => {
      const re = new RegExp(
        `router\\.get\\("/${tab}",\\s*authorize\\(\\{\\s*feature:\\s*"${feature}",\\s*action:\\s*"list"\\s*\\}\\)`,
      );
      expect(ROUTER).toMatch(re);
    });
  }
});

describe("PR-1 (#2163) — nav items now agree with the backend", () => {
  const NAV_TABS: Array<[string, string]> = [
    ["hr",        "hr"],
    ["fleet",     "fleet"],
    ["warehouse", "warehouse"],
    ["store",     "store"],
    ["crm",       "crm"],
    ["support",   "support"],
  ];
  for (const [tab, module] of NAV_TABS) {
    it(`?tab=${tab} carries module="${module}" (was "bi")`, () => {
      // Match the exact nav line for this tab. Allow the comment line
      // we added above each one not to break the match — assert on the
      // declaration line alone.
      const re = new RegExp(
        `path:\\s*"/module-dashboards\\?tab=${tab}"[^}]*module:\\s*"${module}"`,
      );
      expect(NAV).toMatch(re);
    });
  }

  it("no /module-dashboards?tab=X nav item still claims module=\"bi\" (regression trap)", () => {
    const re = /path:\s*"\/module-dashboards\?tab=[a-z]+"[^}]*module:\s*"bi"/g;
    const leftovers = NAV.match(re) ?? [];
    expect(leftovers).toEqual([]);
  });
});
