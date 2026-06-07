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
//   3. The shared helper getActiveRoleKeysForUser unions all three role
//      tables so a v1-granted role still blocks a conflicting v2 grant
//      (and vice versa).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const read = (f: string) => readFileSync(join(apiSrc, f), "utf8");
const POLICY = read("lib/policyEngine.ts");
const ADMIN = read("routes/admin.ts");
const RBACV2 = read("routes/rbacV2.ts");

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
  it("queries all three role-bearing tables", () => {
    expect(POLICY).toContain("export async function getActiveRoleKeysForUser");
    // Must union the legacy user_roles, the v2 rbac_user_roles, and active
    // employee_assignments — missing any one of these opens a SoD bypass.
    expect(POLICY).toMatch(/FROM user_roles/);
    expect(POLICY).toMatch(/FROM rbac_user_roles/);
    expect(POLICY).toMatch(/FROM employee_assignments/);
    // v2 grants can have an expiry; expired ones must not count as "active".
    expect(POLICY).toMatch(/expires_at/);
  });
});

describe("SoD enforcement — wired at both grant endpoints", () => {
  it("admin.ts POST /user-roles uses the shared helper + check", () => {
    expect(ADMIN).toContain("getActiveRoleKeysForUser");
    expect(ADMIN).toContain("findSeparationOfDutiesConflict");
  });

  it("rbacV2.ts POST /users/:userId/roles uses the shared helper + check", () => {
    expect(RBACV2).toContain("getActiveRoleKeysForUser");
    expect(RBACV2).toContain("findSeparationOfDutiesConflict");
    // Must throw ForbiddenError (403) on conflict, matching admin.ts's
    // behaviour and the existing API contract.
    expect(RBACV2).toContain("ForbiddenError");
  });
});
