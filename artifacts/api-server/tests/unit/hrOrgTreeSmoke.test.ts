/**
 * PR-7 (#2077) — Unified org tree smoke.
 *
 * The product owner ratified the tree shape:
 *
 *   Company → Branch → Administration → Department → Team
 *
 * Committee + Project + Cost Center are EXPLICITLY excluded from the
 * tree — they live as operational bridges (employee_committee_memberships,
 * employee_project_assignments, project_assignments.costCenterId) and
 * the UI surfaces them on the employee 360, NOT inside the tree.
 *
 * The deep audit (docs/hr/HR_FIVE_AREAS_DEEP_AUDIT.md §٣) flagged that
 * the «إدارة» level was completely dark — no table, no UI. PR-7 adds:
 *
 *   • Migration 287 — administrations table + departments.administrationId.
 *   • CRUD on /settings/administrations + the unified GET /settings/org-tree
 *     aggregator that returns the full nested structure in one call.
 *   • Admin page at /hr/org-tree with summary tiles + collapsible tree
 *     + inline create dialogs for administrations and departments.
 *   • Employee 360 surfaces «الإدارة» row in the basic-info section
 *     (the LEFT JOIN on administrations resolves the name).
 *
 * Doctrine compliance: NO new tables for committee/project/cost
 * center — the tree endpoint does NOT join those, and the page
 * explicitly shows them as «الارتباطات التشغيلية فوق الشجرة».
 *
 * Source-only test — the live verify (verify-hr-org-tree-journey.sh)
 * covers the database forensics.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/287_administrations_layer.sql"),
  "utf8",
);
const SETTINGS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/settings.ts"),
  "utf8",
);
const EMPLOYEES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const TREE_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/org-tree.tsx"),
  "utf8",
);
const EMPLOYEE_DETAIL = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);
const HR_ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/hrRoutes.tsx"),
  "utf8",
);
const NAV = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("PR-7 (#2077) — migration adds the administrations table + column", () => {
  it("creates the administrations table with the company + branch FK", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS administrations/);
    expect(MIGRATION).toMatch(/"companyId" INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIGRATION).toMatch(/"branchId" INTEGER REFERENCES branches\(id\)/);
  });
  it("adds administrationId to departments with FK", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE departments ADD COLUMN "administrationId" BIGINT REFERENCES administrations\(id\)/);
  });
  it("is additive (no DROP) and leaves departments.parentId in place", () => {
    expect(MIGRATION).not.toMatch(/DROP TABLE departments/i);
    expect(MIGRATION).not.toMatch(/DROP COLUMN.*parentId/);
  });
});

describe("PR-7 (#2077) — administrations CRUD endpoints on settings.ts", () => {
  it("declares HR-domain authorize constants (not admin:*)", () => {
    expect(SETTINGS_ROUTE).toMatch(/const HR_ORG_READ\s*=\s*\{ feature: "hr\.organization", action: "list" \}/);
    expect(SETTINGS_ROUTE).toMatch(/const HR_ORG_WRITE\s*=\s*\{ feature: "hr\.organization", action: "update" \}/);
  });
  it("GET /administrations is gated on hr.organization:list", () => {
    expect(SETTINGS_ROUTE).toMatch(/router\.get\("\/administrations", authorize\(HR_ORG_READ\)/);
  });
  it("POST /administrations is gated on hr.organization:update", () => {
    expect(SETTINGS_ROUTE).toMatch(/router\.post\("\/administrations", authorize\(HR_ORG_WRITE\)/);
  });
  it("PATCH + DELETE are gated on hr.organization:update", () => {
    expect(SETTINGS_ROUTE).toMatch(/router\.patch\("\/administrations\/:id", authorize\(HR_ORG_WRITE\)/);
    expect(SETTINGS_ROUTE).toMatch(/router\.delete\("\/administrations\/:id", authorize\(HR_ORG_WRITE\)/);
  });
  it("DELETE is soft-delete (UPDATE isActive=FALSE), not hard DELETE", () => {
    expect(SETTINGS_ROUTE).toMatch(/router\.delete\("\/administrations\/:id"[\s\S]{0,800}UPDATE administrations SET "isActive" = FALSE/);
  });
});

describe("PR-7 (#2077) — every administration mutation is auditable", () => {
  it("POST emits an audit log with the IGOC quartet (activeRoleKey + resolvedScope + …)", () => {
    // The audit log on administration mutations must carry the IGOC
    // quartet PR-1 introduced. The activate (POST) operation is the
    // most-watched — pin it explicitly.
    const postBlock = SETTINGS_ROUTE.match(/router\.post\("\/administrations"[\s\S]*?router\.patch\("\/administrations/)?.[0] || "";
    expect(postBlock).toMatch(/createAuditLog\([\s\S]{0,600}entity:\s*"administrations"[\s\S]{0,400}activeRoleKey:\s*scope\.selectedRoleKey/);
  });
  it("POST emits an org.administration.created event", () => {
    expect(SETTINGS_ROUTE).toMatch(/emitEvent\([\s\S]{0,400}action:\s*"org\.administration\.created"/);
  });
});

describe("PR-7 (#2077) — departments POST/PATCH accept administrationId + branchId", () => {
  it("createDepartmentSchema includes the new optional fields", () => {
    expect(SETTINGS_ROUTE).toMatch(/createDepartmentSchema[\s\S]{0,800}administrationId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
    expect(SETTINGS_ROUTE).toMatch(/createDepartmentSchema[\s\S]{0,800}branchId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("POST persists administrationId on insert", () => {
    expect(SETTINGS_ROUTE).toMatch(/INSERT INTO departments[\s\S]{0,300}"administrationId",\s*"branchId"/);
  });
  it("POST validates administrationId belongs to the company before insert", () => {
    expect(SETTINGS_ROUTE).toMatch(/SELECT id FROM administrations WHERE id=\$1 AND "companyId"=\$2[\s\S]{0,200}الإدارة غير موجودة/);
  });
});

describe("PR-7 (#2077) — /org-tree aggregator returns the full nested structure in one call", () => {
  it("GET /org-tree exists, gated on hr.organization:list", () => {
    expect(SETTINGS_ROUTE).toMatch(/router\.get\("\/org-tree", authorize\(HR_ORG_READ\)/);
  });
  it("the aggregator joins administrations + departments + teams", () => {
    // The aggregator must hit all 5 layer tables (company / branches /
    // administrations / departments / teams). The departments query
    // selects administrationId as a column (the JOIN is implicit via
    // the FK), so we pin presence of both keywords in the route.
    expect(SETTINGS_ROUTE).toMatch(/FROM administrations\b/);
    expect(SETTINGS_ROUTE).toMatch(/"administrationId"[\s\S]{0,200}FROM departments\b/);
    expect(SETTINGS_ROUTE).toMatch(/"departmentId"[\s\S]{0,200}FROM teams\b/);
  });
  it("the response surfaces orphan + cross-branch nodes (the audit's «dark areas»)", () => {
    expect(SETTINGS_ROUTE).toMatch(/crossBranchAdministrations/);
    expect(SETTINGS_ROUTE).toMatch(/orphanDepartments/);
  });
  it("employee counts are aggregated per node (administration / department / team)", () => {
    expect(SETTINGS_ROUTE).toMatch(/empByAdm/);
    expect(SETTINGS_ROUTE).toMatch(/empByDept/);
    expect(SETTINGS_ROUTE).toMatch(/empByTeam/);
  });
  it("the aggregator does NOT join committees / projects / cost_centers — they're operational bridges", () => {
    // Pin the doctrine: the tree builder MUST NOT pull from committees
    // or projects or cost_centers. The user's decision was final:
    // «اللجنة + المشروع + مركز التكلفة ارتباطات تشغيلية فوق الشجرة وليست داخلها».
    // Anyone who adds those joins here is breaking the doctrine.
    const treeBlock = SETTINGS_ROUTE.match(/router\.get\("\/org-tree"[\s\S]*?export default router/)?.[0] || "";
    expect(treeBlock, "tree block extracted").not.toBe("");
    expect(treeBlock).not.toMatch(/FROM committees/i);
    expect(treeBlock).not.toMatch(/FROM employee_committee_memberships/i);
    expect(treeBlock).not.toMatch(/FROM employee_project_assignments/i);
    expect(treeBlock).not.toMatch(/FROM cost_centers/i);
  });
});

describe("PR-7 (#2077) — employee detail shows the full org chain (company→branch→administration→department)", () => {
  it("the /employees/:id route LEFT JOINs administrations to surface administrationName", () => {
    expect(EMPLOYEES_ROUTE).toMatch(/LEFT JOIN administrations adm ON adm\.id = d\."administrationId"/);
    expect(EMPLOYEES_ROUTE).toMatch(/adm\.name AS "administrationName"/);
  });
  it("the 360 page renders «الإدارة» as a basic-info row", () => {
    expect(EMPLOYEE_DETAIL).toMatch(/InfoRow label="الإدارة" value=\{employee\.administrationName \|\| "—"\}/);
  });
});

describe("PR-7 (#2077) — the admin tree page exists + is in the HR nav", () => {
  it("the page module exists and exports OrgTreePage", () => {
    expect(TREE_PAGE).toMatch(/export default function OrgTreePage\(/);
  });
  it("the page reads /settings/org-tree (no separate per-layer queries)", () => {
    expect(TREE_PAGE).toMatch(/useApiQuery<TreeResp>\(\s*\["settings-org-tree"\],\s*"\/settings\/org-tree"/);
  });
  it("the page explicitly callouts that committee/project/cost-center are NOT in the tree", () => {
    // The «الارتباطات التشغيلية» callout is the visible doctrine
    // — pin its text so a refactor can't silently drop it.
    expect(TREE_PAGE).toContain("الارتباطات التشغيلية فوق الشجرة");
    expect(TREE_PAGE).toContain("اللجنة + المشروع + مركز التكلفة");
  });
  it("hrRoutes registers /hr/org-tree", () => {
    expect(HR_ROUTES).toMatch(/const OrgTree = lazy\(\(\) => import\("@\/pages\/hr\/org-tree"\)\)/);
    expect(HR_ROUTES).toMatch(/\{ path: "\/hr\/org-tree", component: OrgTree/);
  });
  it("navigation surfaces «الشجرة التنظيمية» pointing at /hr/org-tree", () => {
    expect(NAV).toMatch(/label: "الشجرة التنظيمية", path: "\/hr\/org-tree"/);
  });
});

describe("PR-7 (#2077) — preserves PR-1/PR-2/PR-6 (no regression)", () => {
  it("the PR-1 employee creation schema still accepts the institutional fields", () => {
    // PR-1's createEmployeeSchema must still be intact after PR-7
    // adds administrationId to settings.ts. Spot-check positionId
    // (a PR-1 add) is still in employees.ts.
    expect(EMPLOYEES_ROUTE).toMatch(/positionId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
  });
  it("the 360 tabs spine grows correctly (17 after PR-7, 18 after PR-8 adds دورة الحياة)", () => {
    // PR-7 did not add a tab; PR-8 added لifecycle. The count is now 18.
    // hrLifecycleEngineSmoke + employee360FinalTabsAndSeedsSmoke pin
    // 18 too — keep this in sync if a future PR moves the count.
    const tabsMatch = EMPLOYEE_DETAIL.match(/const TABS = \[[\s\S]*?\] as const;/)?.[0] || "";
    const tabCount = (tabsMatch.match(/key:\s*"/g) ?? []).length;
    expect(tabCount).toBe(18);
  });
});
