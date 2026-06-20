/**
 * HR menu cleanup + employee_assets bridge smoke (#1799 #12 + #9).
 *
 * Two pieces shipping together:
 *
 *  1. **Menu cleanup**: navigation.registry.ts HR section restructured
 *     from 17 nested top-level items to the 9 canonical entries from
 *     the inventory §D.2. Critically, NO route is removed — bookmarks
 *     and deep links keep working.
 *
 *  2. **employee_assets**: new bridge table for tracking physical/IT
 *     assets handed out to employees (laptop, phone, SIM, …) and
 *     auto-listing un-returned items on exit-clearance.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const NAV_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);
const ASSETS_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/276_employee_assets.sql"),
  "utf8",
);

describe("Menu cleanup — HR section restructure (HR-011)", () => {
  // Locate the HR section block by title.
  const hrSectionStart = NAV_SRC.indexOf('title: "الموارد البشرية"');
  const hrSection = NAV_SRC.slice(hrSectionStart, NAV_SRC.indexOf("// ════", hrSectionStart + 200));

  it("the HR section is locatable", () => {
    expect(hrSectionStart).toBeGreaterThan(0);
    expect(hrSection.length).toBeGreaterThan(500);
  });

  // The 9 canonical top-level labels from inventory §D.2.
  const canonicalLabels = [
    "لوحة الموارد البشرية",
    "شؤون الموظفين",
    "النشاط والحضور",
    "الطلبات",
    "المخالفات والجزاءات",
    "الأداء والتطوير",
    "الرواتب والمستحقات",
    "التقارير",
    "إعدادات الموارد البشرية",
  ];

  for (const label of canonicalLabels) {
    it(`top-level entry "${label}" present`, () => {
      // The label must appear at a top-level position (level 1) — we
      // verify by looking for `{ label: "${label}", path:` which is
      // how every entry is declared.
      expect(hrSection).toMatch(new RegExp(`\\{\\s*label:\\s*"${label.replace(/[()]/g, "\\$&")}"\\s*,\\s*path:`));
    });
  }

  it("dropped the separate top-level 'التوظيف' entry (now under الموظفون)", () => {
    // No top-level «التوظيف» — only as sub under «الموظفون».
    expect(hrSection).not.toMatch(/\{\s*label:\s*"التوظيف"\s*,\s*path:\s*"\/hr\/recruitment",\s*icon:[^,]+,\s*module:\s*"hr"\s*,\s*children:/);
  });

  it("dropped the separate top-level 'الورديات' (now under النشاط والحضور)", () => {
    expect(hrSection).not.toMatch(/\{\s*label:\s*"الورديات"\s*,\s*path:[^,]+,\s*icon:[^,]+,\s*module:\s*"hr"/);
  });

  it("dropped the separate top-level 'التدريب' (now under الأداء والتطوير)", () => {
    expect(hrSection).not.toMatch(/\{\s*label:\s*"التدريب"\s*,\s*path:[^,]+,\s*icon:[^,]+,\s*module:\s*"hr"/);
  });

  it("dropped the separate top-level 'الانضباط والمخالفات' (now الامتثال والجزاءات)", () => {
    expect(hrSection).not.toMatch(/\{\s*label:\s*"الانضباط والمخالفات"/);
  });

  it("every legacy /hr/* sub-route still present somewhere in the menu", () => {
    // Quick coverage check — the routes that lived under removed
    // top-level entries must still be reachable from the new
    // structure. Picks one representative path per removed cluster.
    // HR-REV — the retired «*/management» و «*/advanced» shadow pages now
    // redirect to their canonical page, and their redundant menu entries were
    // dropped (their content lives as tabs there). Each cluster is still
    // represented by its canonical path below (/hr/shifts, /hr/training, …),
    // so we no longer assert the redirect-only legacy paths in the menu.
    const mustSurvive = [
      "/hr/recruitment",
      "/hr/recruitment/applications",
      "/hr/shifts",
      "/hr/training",
      "/hr/violations/auto-detection",
      "/hr/discipline/regulation",
      "/hr/documents",
      "/hr/contracts",
      "/hr/exit",
      "/hr/saudization",
    ];
    for (const path of mustSurvive) {
      expect(hrSection).toContain(`path: "${path}"`);
    }
  });

  it("HR Services Catalog is the «الطلبات» landing entry", () => {
    // Unified to «خدمات الموارد البشرية» by the UX Nav Governance wave.
    expect(hrSection).toMatch(
      /\{\s*label:\s*"خدمات الموارد البشرية"\s*,\s*path:\s*"\/hr\/services"/,
    );
  });
});

describe("Migration 276 — employee_assets bridge (#1799 priority #9)", () => {
  it("creates the employee_assets table", () => {
    expect(ASSETS_SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_assets/);
  });

  it("links by assignmentId (not employeeId) so per-company scope is implicit", () => {
    expect(ASSETS_SRC).toMatch(
      /"assignmentId" INTEGER NOT NULL REFERENCES employee_assignments\(id\) ON DELETE CASCADE/,
    );
  });

  it("stores assetType + assetKey + optional serial + warehouse FK", () => {
    expect(ASSETS_SRC).toMatch(/"assetType" VARCHAR\(40\) NOT NULL/);
    expect(ASSETS_SRC).toMatch(/"assetKey" VARCHAR\(120\) NOT NULL/);
    expect(ASSETS_SRC).toMatch(/"serialNumber" VARCHAR\(120\)/);
    expect(ASSETS_SRC).toMatch(/"warehouseAssetId" INTEGER/);
  });

  it("tracks assignedAt + assignedBy + returnedAt + returnedBy for full lifecycle", () => {
    expect(ASSETS_SRC).toMatch(/"assignedAt" DATE NOT NULL DEFAULT CURRENT_DATE/);
    expect(ASSETS_SRC).toMatch(/"assignedBy" INTEGER/);
    expect(ASSETS_SRC).toMatch(/"returnedAt" DATE/);
    expect(ASSETS_SRC).toMatch(/"returnedBy" INTEGER/);
  });

  it("free-form condition fields at assign + return for damage-claim audit", () => {
    expect(ASSETS_SRC).toMatch(/"conditionOnAssign" TEXT/);
    expect(ASSETS_SRC).toMatch(/"conditionOnReturn" TEXT/);
  });

  it("partial index for active (un-returned) assets only", () => {
    expect(ASSETS_SRC).toMatch(
      /idx_employee_assets_active[\s\S]*?WHERE "returnedAt" IS NULL/,
    );
  });

  it("per-employee history index on (assignmentId, assignedAt DESC)", () => {
    expect(ASSETS_SRC).toMatch(
      /idx_employee_assets_assignment[\s\S]*?"assignmentId", "assignedAt" DESC/,
    );
  });

  it("@rollback annotation present", () => {
    expect(ASSETS_SRC).toMatch(/@rollback:/);
  });
});
