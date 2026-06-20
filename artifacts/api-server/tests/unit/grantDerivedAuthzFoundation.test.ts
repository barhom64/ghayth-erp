/**
 * HR-REV-1 #1 — grant-derived in-handler authorization foundation.
 *
 * The codebase gates many in-handler decisions on hardcoded role lists
 * (`HR_ROLES.includes(scope.role)`) that duplicate — and drift from — the
 * RBAC v2 grants which are the real source of truth. This foundation
 * attaches the caller's flattened grants to `scope.fineGrants` (loaded once
 * in buildScope) and exposes `scopeCan(scope, feature, action)` so those
 * sites can migrate to grants module-by-module.
 *
 * These tests pin the PURE contract (scopeCan) plus the wiring that makes
 * the set available on every request. The DB-backed loadFineGrantKeys is
 * covered by the integration suite; here we assert the projection shape it
 * must produce and that buildScope populates the field.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scopeCan } from "../../src/lib/rbac/authzEngine.js";
import type { RequestScope } from "../../src/middlewares/authMiddleware.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

function mkScope(over: Partial<RequestScope>): RequestScope {
  return {
    userId: 1, employeeId: 1, companyId: 1, branchId: 1, activeAssignmentId: 1,
    activeDepartmentId: null, impersonationSourceUser: null,
    allowedCompanies: [1], allowedBranches: [1], allowedDepartments: [], allowedAssignments: [1],
    role: "hr_specialist", isOwner: false, jobTitle: null, jobTitleId: null,
    userName: "t", selectedRoleKey: null,
    ...over,
  } as RequestScope;
}

describe("scopeCan — grant-derived in-handler authorization", () => {
  it("owner always passes (holds the * wildcard) regardless of fineGrants", () => {
    expect(scopeCan(mkScope({ isOwner: true, fineGrants: new Set() }), "hr.payroll", "view")).toBe(true);
  });

  it("matches a fine feature:action key", () => {
    const s = mkScope({ fineGrants: new Set(["hr.payroll:view", "hr.leaves:approve"]) });
    expect(scopeCan(s, "hr.payroll", "view")).toBe(true);
    expect(scopeCan(s, "hr.leaves", "approve")).toBe(true);
  });

  it("matches a coarse module:action key", () => {
    const s = mkScope({ fineGrants: new Set(["hr:update", "finance:approve"]) });
    expect(scopeCan(s, "hr", "update")).toBe(true);
    expect(scopeCan(s, "finance", "approve")).toBe(true);
  });

  it("denies when the grant is absent", () => {
    const s = mkScope({ fineGrants: new Set(["hr.attendance:view"]) });
    expect(scopeCan(s, "hr.payroll", "view")).toBe(false);
    expect(scopeCan(s, "hr.attendance", "update")).toBe(false);
  });

  // ── wildcard parity with checkAccess() — the regression these guard ──
  it("a module-wildcard grant (hr.*) matches FINE feature checks (hr_manager / migration 258)", () => {
    const s = mkScope({ fineGrants: new Set(["hr.*:approve"]) });
    expect(scopeCan(s, "hr.loans", "approve")).toBe(true);
    expect(scopeCan(s, "hr.discipline", "approve")).toBe(true);
    expect(scopeCan(s, "hr", "approve")).toBe(true); // coarse too
    expect(scopeCan(s, "finance.invoices", "approve")).toBe(false); // other module
  });

  it("an action-wildcard grant (feature:*) matches any action (autoMigrate hr:* bundles)", () => {
    const s = mkScope({ fineGrants: new Set(["hr.payroll:*"]) });
    expect(scopeCan(s, "hr.payroll", "view")).toBe(true);
    expect(scopeCan(s, "hr.payroll", "delete")).toBe(true);
    expect(scopeCan(s, "hr.leaves", "view")).toBe(false);
  });

  it("a global super-grant (*) matches everything (branch_manager '*' grant, migration 258)", () => {
    const s = mkScope({ fineGrants: new Set(["*:approve"]) });
    expect(scopeCan(s, "hr.loans", "approve")).toBe(true);
    expect(scopeCan(s, "finance.invoices", "approve")).toBe(true);
  });

  it("a CONCRETE per-feature grant does NOT widen to the coarse module (no over-grant)", () => {
    // department_manager-style: holds hr.leaves:approve only — must NOT pass
    // a coarse scopeCan(hr, approve) the way a real HR manager (hr.*) does.
    const s = mkScope({ fineGrants: new Set(["hr.leaves:approve"]) });
    expect(scopeCan(s, "hr.leaves", "approve")).toBe(true);
    expect(scopeCan(s, "hr", "approve")).toBe(false);
    expect(scopeCan(s, "hr.loans", "approve")).toBe(false);
  });

  it("denies (non-owner) when grants were never loaded onto the scope", () => {
    expect(scopeCan(mkScope({ fineGrants: undefined }), "hr.payroll", "view")).toBe(false);
  });
});

describe("foundation wiring — grants are loaded onto every scope", () => {
  const AUTH = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/middlewares/authMiddleware.ts"), "utf8");
  const ENGINE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/rbac/authzEngine.ts"), "utf8");

  it("RequestScope carries a fineGrants set", () => {
    expect(AUTH).toMatch(/fineGrants\?: ReadonlySet<string>;/);
  });

  it("buildScope populates scope.fineGrants via loadFineGrantKeys", () => {
    expect(AUTH).toMatch(/scope\.fineGrants = await loadFineGrantKeys\(scope\)/);
    expect(AUTH).toMatch(/import \{ loadFineGrantKeys \} from "\.\.\/lib\/rbac\/authzEngine\.js"/);
  });

  it("authzEngine exports the foundation helpers", () => {
    expect(ENGINE).toMatch(/export async function loadFineGrantKeys/);
    expect(ENGINE).toMatch(/export function scopeCan/);
  });

  it("loadFineGrantKeys reuses the cached loadEffectiveGrants (warm-hit, no extra hot-path query)", () => {
    const block = ENGINE.slice(ENGINE.indexOf("export async function loadFineGrantKeys"), ENGINE.indexOf("export function scopeCan"));
    expect(block).toMatch(/loadEffectiveGrants\(scope\.userId, scope\.companyId, scope\.selectedRoleKey/);
  });
});
