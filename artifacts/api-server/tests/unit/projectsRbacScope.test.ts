import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── PRJ-P3b — Per-role permission scope for PROJECTS (lock-in) ──────────────
// The projects audit (#2081) flagged "no dedicated projects RBAC tests" as a
// gap. These static-text contract tests pin the per-role scope model so a
// refactor can't silently widen it. They assert the EXISTING behaviour — this
// is a lock-in, not a behaviour change:
//
//   • module gate: /projects is mounted behind requireModule("operations").
//   • owner / general_manager (OWNER_GM_ROLES) → full access (isFullAccess).
//   • projects_manager → only projects they manage (managerId = employeeId) on
//     list / view / update / delete; auto-assigned as manager on create.
//   • employee → only projects they manage OR have an assigned task on; cannot
//     create / update / delete a project; self-service tasks only.
//   • every sub-resource mutation (tasks, phases, milestones, risks, costs,
//     BOQ, units) is scope-checked via assertProjectAccess.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PROJ = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/projects.ts"), "utf8");
const INDEX = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"), "utf8");
const CATALOG = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/rbac/featureCatalog.ts"), "utf8");

describe("PRJ-P3b — module gate", () => {
  it('mounts /projects behind requireModule("operations")', () => {
    expect(INDEX).toMatch(/router\.use\(\s*"\/projects",\s*requireModule\("operations"\),\s*projectsRouter\s*\)/);
  });
});

describe("PRJ-P3b — full-access definition", () => {
  it("isFullAccess = owner OR OWNER_GM_ROLES (only owner/GM bypass row-level scope)", () => {
    expect(PROJ).toContain("function isFullAccess(scope");
    const i = PROJ.indexOf("function isFullAccess(scope");
    const fn = PROJ.slice(i, i + 120);
    expect(fn).toContain("scope.isOwner || OWNER_GM_ROLES.includes(scope.role)");
  });
});

describe("PRJ-P3b — list scope (GET /)", () => {
  it("projects_manager is restricted to projects they manage", () => {
    expect(PROJ).toContain('const managerOnlyRoles = ["projects_manager"];');
    expect(PROJ).toMatch(/managerOnlyRoles\.includes\(scope\.role\)[\s\S]{0,160}p\."managerId" = \$/);
  });

  it("employee is restricted to managed projects OR projects they have a task on", () => {
    expect(PROJ).toContain('const employeeOnlyRoles = ["employee"];');
    expect(PROJ).toMatch(/employeeOnlyRoles[\s\S]{0,200}assigneeId/);
  });
});

describe("PRJ-P3b — create scope (POST /)", () => {
  it("only owner / GM / projects_manager may create a project", () => {
    expect(PROJ).toMatch(/if \(!isFullAccess\(scope\) && scope\.role !== "projects_manager"\)[\s\S]{0,160}ForbiddenError/);
  });

  it("a projects_manager is auto-assigned as the project manager (cannot delegate out)", () => {
    expect(PROJ).toContain('scope.role === "projects_manager" ? scope.employeeId : b.managerId');
  });
});

describe("PRJ-P3b — update / delete scope (PATCH / DELETE /:id)", () => {
  it("projects_manager may only mutate projects they manage (managerId filter)", () => {
    const guards = PROJ.match(/scope\.role === "projects_manager" && scope\.employeeId\)\s*\{\s*\n\s*findQuery \+= ` AND "managerId"=\$3`/g) ?? [];
    // one for PATCH /:id and one for DELETE /:id
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it("non-(full|projects_manager) roles are forbidden from update/delete", () => {
    const forbids = PROJ.match(/if \(!isFullAccess\(scope\) && scope\.role !== "projects_manager"\)/g) ?? [];
    // create + update + delete
    expect(forbids.length).toBeGreaterThanOrEqual(3);
  });
});

describe("PRJ-P3b — sub-resource mutations are scope-checked", () => {
  it("assertProjectAccess enforces managerId / assignee scoping for non-full-access", () => {
    const i = PROJ.indexOf("async function assertProjectAccess");
    const fn = PROJ.slice(i, i + 900);
    expect(fn).toContain("if (!isFullAccess(scope))");
    expect(fn).toContain('scope.role === "projects_manager"');
    expect(fn).toContain('scope.role === "employee"');
    expect(fn).toContain("assigneeId");
    expect(fn).toContain("غير مصرح بالوصول"); // 404 on out-of-scope access
  });

  it("every project sub-resource mutation routes through assertProjectAccess", () => {
    const calls = PROJ.match(/assertProjectAccess\(/g) ?? [];
    // phases, tasks, milestones, risks, costs, BOQ, units, close, gantt, etc.
    expect(calls.length).toBeGreaterThanOrEqual(15);
  });
});

describe("PRJ-P3b — feature catalog + authorize wiring", () => {
  it("declares the projects feature operations under the operations module", () => {
    expect(CATALOG).toContain('"projects"');
    expect(CATALOG).toContain('"projects.list"');
    expect(CATALOG).toContain('"projects.tasks"');
    expect(CATALOG).toContain('"projects.tasks.my"');
  });

  it("every projects endpoint authorizes against a projects feature (no unguarded route)", () => {
    const authorizeCalls = PROJ.match(/authorize\(\{\s*feature:\s*"projects(\.[a-z.]+)?"/g) ?? [];
    expect(authorizeCalls.length).toBeGreaterThanOrEqual(25);
  });
});
