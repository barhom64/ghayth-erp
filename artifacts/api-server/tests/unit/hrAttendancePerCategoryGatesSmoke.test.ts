/**
 * PR-3 (#2077) — per-category attendance policies gate smoke.
 *
 * Pins the gate change so a future PR doesn't accidentally re-tighten
 * the authorize() back to `admin:*` (which is what blocked HR Managers
 * from the per-category page until now).
 *
 * The doctrine from PR-3 is: «تفعيل وإظهار وتوحيد الموجود». The page
 * existed at /admin/attendance-categories with a complete CRUD UI;
 * what was missing was operational reach for the HR Manager whose role
 * grants `hr.attendance:*` but not `admin:*`. Three changes need pins:
 *
 *   1. /org/employee-categories         → hr.employees:list
 *   2. /org/attendance-policies-per-category GET → hr.attendance:list
 *   3. /org/attendance-policies-per-category POST/DELETE → hr.attendance:update
 *   4. The per-category page is mounted at BOTH /hr/attendance-categories
 *      (new canonical) AND /admin/attendance-categories (back-compat).
 *   5. The /hr/attendance-policy page links to the per-category page so
 *      the flow is discoverable.
 *
 * Source-only test (no DB), matching the project convention for
 * structural pins.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ORG_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/org.ts"),
  "utf8",
);
const HR_ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/hrRoutes.tsx"),
  "utf8",
);
const ATTENDANCE_POLICY_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/attendance-policy.tsx"),
  "utf8",
);
const ATTENDANCE_CATEGORIES_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/attendance-categories.tsx"),
  "utf8",
);
const NAV_REGISTRY = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("PR-3 (#2077) — backend gates open the per-category surface to HR", () => {
  it("declares the HR-domain guard constants", () => {
    expect(ORG_ROUTE).toMatch(/const HR_EMPLOYEES_READ = \{ feature: "hr\.employees", action: "list" \}/);
    expect(ORG_ROUTE).toMatch(/const HR_ATTENDANCE_READ = \{ feature: "hr\.attendance", action: "list" \}/);
    expect(ORG_ROUTE).toMatch(/const HR_ATTENDANCE_WRITE = \{ feature: "hr\.attendance", action: "update" \}/);
  });

  it("GET /employee-categories uses hr.employees:list (catalog readable by anyone managing employees)", () => {
    expect(ORG_ROUTE).toMatch(/router\.get\("\/employee-categories", authorize\(HR_EMPLOYEES_READ\)/);
  });

  it("GET /attendance-policies-per-category uses hr.attendance:list (same lane as company-wide policy editor)", () => {
    expect(ORG_ROUTE).toMatch(/router\.get\("\/attendance-policies-per-category", authorize\(HR_ATTENDANCE_READ\)/);
  });

  it("POST /attendance-policies-per-category uses hr.attendance:update", () => {
    expect(ORG_ROUTE).toMatch(/router\.post\("\/attendance-policies-per-category", authorize\(HR_ATTENDANCE_WRITE\)/);
  });

  it("DELETE /attendance-policies-per-category/:id uses hr.attendance:update", () => {
    expect(ORG_ROUTE).toMatch(/router\.delete\("\/attendance-policies-per-category\/:id", authorize\(HR_ATTENDANCE_WRITE\)/);
  });

  it("the old ADMIN/ADMIN_WRITE guards are NOT used on these four endpoints (regression pin)", () => {
    // Pull the relevant section to compare against a single readable snippet.
    const sliceMatch = ORG_ROUTE.match(/router\.get\("\/employee-categories"[\s\S]*?router\.delete\("\/attendance-policies-per-category\/:id"[^)]+\)/);
    expect(sliceMatch, "expected slice of org.ts covering the four routes").not.toBeNull();
    const slice = sliceMatch![0];
    // No ADMIN / ADMIN_WRITE constant appears on these four route signatures.
    expect(slice).not.toMatch(/authorize\(ADMIN\)/);
    expect(slice).not.toMatch(/authorize\(ADMIN_WRITE\)/);
  });
});

describe("PR-3 (#2077) — frontend route is reachable under /hr", () => {
  it("hrRoutes.tsx lazy-imports the per-category page module from the existing admin path", () => {
    expect(HR_ROUTES).toMatch(/const AttendanceCategoriesHr = lazy\(\(\) => import\("@\/pages\/admin\/attendance-categories"\)\)/);
  });

  it("hrRoutes.tsx exposes /hr/attendance-categories", () => {
    expect(HR_ROUTES).toMatch(/\{\s*path:\s*"\/hr\/attendance-categories",\s*component:\s*AttendanceCategoriesHr/);
  });
});

describe("PR-3 (#2077) — discoverability link from the company-wide page", () => {
  it("hr/attendance-policy renders a link to /hr/attendance-categories", () => {
    expect(ATTENDANCE_POLICY_PAGE).toMatch(/href="\/hr\/attendance-categories"/);
  });
  it("the link copy invites the operator to manage per-category overrides", () => {
    expect(ATTENDANCE_POLICY_PAGE).toMatch(/سياسة مختلفة لفئة معيّنة/);
  });
});

describe("PR-3 (#2077) — page-level changes align with the new gate", () => {
  it("PERM_WRITE moved from admin:update to hr.attendance:update", () => {
    expect(ATTENDANCE_CATEGORIES_PAGE).toMatch(/const PERM_WRITE = "hr\.attendance:update"/);
  });

  it("breadcrumb is path-aware (HR lane vs Admin lane)", () => {
    expect(ATTENDANCE_CATEGORIES_PAGE).toMatch(/onHrRoute = location\.startsWith\("\/hr\/"\)/);
    expect(ATTENDANCE_CATEGORIES_PAGE).toMatch(/breadcrumbs=\{onHrRoute \? \[/);
    expect(ATTENDANCE_CATEGORIES_PAGE).toMatch(/href:\s*"\/hr\/attendance-policy"[\s\S]{0,50}label:\s*"سياسة الحضور"/);
  });
});

describe("PR-3 (#2077) — navigation registry points to the HR route", () => {
  it("the «فئات الموظفين وسياسات الحضور» link uses /hr/attendance-categories", () => {
    expect(NAV_REGISTRY).toMatch(/label:\s*"فئات الموظفين وسياسات الحضور",\s*path:\s*"\/hr\/attendance-categories"/);
  });
  it("the subKey on that link is «attendance» (so it lights up under the attendance submenu)", () => {
    expect(NAV_REGISTRY).toMatch(/path:\s*"\/hr\/attendance-categories"[\s\S]{0,200}subKey:\s*"attendance"/);
  });
});
