import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findSeparationOfDutiesConflict,
  SEPARATION_OF_DUTIES,
} from "../../src/lib/policyEngine.js";

// #1605 covered POST /admin/user-roles. This locks in:
//   1. The pure check still detects the canonical conflicts.
//   2. POST /rbac/v2/users/:userId/roles also gates (closes the bypass).
//   3. The shared helper getActiveRoleKeysForUser unions the RBAC-v2 grant
//      table and active employee_assignments so a role granted via either
//      surface still blocks a conflicting grant on the other.
//      (#1791: the legacy user_roles table was dropped and removed here.)

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const read = (f: string) => readFileSync(join(apiSrc, f), "utf8");
const POLICY = read("lib/policyEngine.ts");
const ADMIN = read("routes/admin.ts");
const RBACV2 = read("routes/rbacV2.ts");
const RBACSVC = read("lib/rbacService.ts");

describe("policyEngine.findSeparationOfDutiesConflict — pure check", () => {
  it("returns null when the new role is compatible with the existing set", () => {
    expect(findSeparationOfDutiesConflict(["employee"], "fleet_manager")).toBeNull();
  });

  it("blocks finance_manager when the user already holds warehouse_manager", () => {
    const conflict = findSeparationOfDutiesConflict(["warehouse_manager"], "finance_manager");
    expect(conflict).not.toBeNull();
    expect([conflict!.roleA, conflict!.roleB].sort()).toEqual(
      ["finance_manager", "warehouse_manager"].sort(),
    );
  });

  it("blocks the reverse direction too (warehouse on top of finance)", () => {
    const conflict = findSeparationOfDutiesConflict(["finance_manager"], "warehouse_manager");
    expect(conflict).not.toBeNull();
  });

  it("blocks hr_manager on top of finance_manager", () => {
    expect(findSeparationOfDutiesConflict(["finance_manager"], "hr_manager")).not.toBeNull();
  });

  it("blocks bi_manager on top of owner", () => {
    expect(findSeparationOfDutiesConflict(["owner"], "bi_manager")).not.toBeNull();
  });

  it("ignores blank/null role keys in the existing set", () => {
    expect(findSeparationOfDutiesConflict(["", "employee"], "finance_manager")).toBeNull();
  });

  it("does not false-fire when the new role itself appears in the existing set", () => {
    // Re-granting the same role is not a SoD violation — the rule is about
    // pairs, not the role with itself.
    expect(findSeparationOfDutiesConflict(["finance_manager"], "finance_manager")).toBeNull();
  });
});

describe("policyEngine.SEPARATION_OF_DUTIES catalogue", () => {
  it("contains the three canonical incompatibilities", () => {
    const pairs = SEPARATION_OF_DUTIES.map((r) => [r.roleA, r.roleB].sort().join("+"));
    expect(pairs).toContain(["finance_manager", "warehouse_manager"].sort().join("+"));
    expect(pairs).toContain(["hr_manager", "finance_manager"].sort().join("+"));
    expect(pairs).toContain(["owner", "bi_manager"].sort().join("+"));
  });
});

describe("policyEngine.getActiveRoleKeysForUser — SQL coverage", () => {
  it("queries both role-bearing tables (rbac_user_roles + employee_assignments)", () => {
    expect(POLICY).toContain("export async function getActiveRoleKeysForUser");
    // Must union the v2 rbac_user_roles and active employee_assignments —
    // missing either one opens a SoD bypass. (#1791: legacy user_roles dropped.)
    expect(POLICY).toMatch(/FROM rbac_user_roles/);
    expect(POLICY).toMatch(/FROM employee_assignments/);
    // The dropped legacy table must no longer be referenced.
    expect(POLICY).not.toMatch(/FROM user_roles\b/);
    // v2 grants can have an expiry; expired ones must not count as "active".
    expect(POLICY).toMatch(/expires_at/);
  });
});

describe("SoD enforcement — wired at both grant endpoints", () => {
  it("the central rbacService.grantUserRole holds the SoD check (shared helper)", () => {
    // SoD enforcement for the creation/grant paths lives in ONE place now —
    // the rbacService — so employees.ts, admin onboard, and admin /user-roles
    // all enforce it without re-implementing the rule.
    expect(RBACSVC).toContain("getActiveRoleKeysForUser");
    expect(RBACSVC).toContain("findSeparationOfDutiesConflict");
    expect(RBACSVC).toContain("sod_conflict");
  });

  it("admin.ts POST /user-roles enforces SoD via grantUserRole (hard 403 on conflict)", () => {
    // Refactored off the inline getActiveRoleKeysForUser/findSeparationOfDutiesConflict
    // onto the central service; an SoD conflict is still a HARD failure here.
    const idx = ADMIN.indexOf('router.post("/user-roles"');
    const section = ADMIN.slice(idx, idx + 3000);
    expect(section).toContain("grantUserRole");
    expect(section).toContain("sod_conflict");
    expect(section).toContain("ForbiddenError");
  });

  it("rbacV2.ts POST /users/:userId/roles uses the shared helper + check", () => {
    expect(RBACV2).toContain("getActiveRoleKeysForUser");
    expect(RBACV2).toContain("findSeparationOfDutiesConflict");
    // Must throw ForbiddenError (403) on conflict, matching admin.ts's
    // behaviour and the existing API contract.
    expect(RBACV2).toContain("ForbiddenError");
  });
});
