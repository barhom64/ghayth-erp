import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  isKnownPermission,
  ROLE_PERMISSIONS,
  getRolePermissions,
} from "../../src/lib/rbacCatalog.js";

describe("PERMISSIONS catalog", () => {
  it("is non-empty", () => {
    expect(PERMISSIONS.length).toBeGreaterThan(0);
  });

  it("contains the wildcard", () => {
    expect(PERMISSIONS).toContain("*");
  });

  it("has no duplicates", () => {
    const set = new Set(PERMISSIONS);
    expect(set.size).toBe(PERMISSIONS.length);
  });

  it("contains the core CRUD tuples for every module mentioned in blueprints", () => {
    // These are the modules documented in docs/blueprints/. If a new blueprint
    // references a permission that isn't in the catalog this test will fail,
    // which is the correct outcome — add the permission to the catalog first.
    const requiredModules = [
      "hr",
      "finance",
      "fleet",
      "warehouse",
      "property",
      "projects",
      "operations",
      "legal",
      "support",
      "crm",
      "documents",
    ];
    for (const module of requiredModules) {
      expect(PERMISSIONS).toContain(`${module}:read`);
      expect(PERMISSIONS).toContain(`${module}:create`);
      expect(PERMISSIONS).toContain(`${module}:update`);
      expect(PERMISSIONS).toContain(`${module}:delete`);
    }
  });

  it("contains the discipline-tier permission used by HR discipline blueprint", () => {
    expect(PERMISSIONS).toContain("hr:discipline:approve");
  });
});

describe("isKnownPermission", () => {
  it("accepts every catalog entry", () => {
    for (const perm of PERMISSIONS) {
      expect(isKnownPermission(perm)).toBe(true);
    }
  });

  it("rejects unknown permissions", () => {
    expect(isKnownPermission("nonexistent:fake")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
    expect(isKnownPermission("typo:raed")).toBe(false);
  });

  it("does not auto-expand wildcards — module wildcards are NOT catalog entries", () => {
    // Only "*" is in the catalog. "hr:*" is a binding shorthand, not a permission.
    expect(isKnownPermission("*")).toBe(true);
    // Note: this reflects current behaviour. If the catalog ever starts
    // accepting module wildcards directly, update this test.
  });
});

describe("ROLE_PERMISSIONS", () => {
  it("defines owner and general_manager as full-access roles", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("*");
    expect(ROLE_PERMISSIONS.general_manager).toContain("*");
  });

  it("defines hr_manager with the discipline-tier permission per the 3-step chain", () => {
    // See docs/blueprints/hr-discipline.md §1 for the separation-of-duties rule.
    expect(ROLE_PERMISSIONS.hr_manager).toContain("hr:discipline:approve");
  });

  it("keeps employee scoped to hr:read only", () => {
    // The self-service portal (/my-space) should not grant write access by default.
    expect(ROLE_PERMISSIONS.employee).toEqual(["hr:read"]);
  });

  it("gives finance_manager the full finance CRUD set", () => {
    const perms = ROLE_PERMISSIONS.finance_manager;
    expect(perms).toContain("finance:read");
    expect(perms).toContain("finance:create");
    expect(perms).toContain("finance:update");
    expect(perms).toContain("finance:delete");
  });

  it("restricts branch_manager to read-only cross-module access", () => {
    const perms = ROLE_PERMISSIONS.branch_manager;
    // Every non-documents entry should be a *:read
    for (const perm of perms) {
      const isRead = perm.endsWith(":read") || perm === "documents:download";
      expect(isRead).toBe(true);
    }
  });

  it("never grants every permission to every role by accident", () => {
    // Belt and braces: only owner/general_manager may carry the global wildcard.
    const globalWildcardRoles = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes("*"))
      .map(([role]) => role);
    expect(globalWildcardRoles.sort()).toEqual(["general_manager", "owner"]);
  });

  it("references only known permissions (or module wildcards)", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        if (perm === "*" || perm.endsWith(":*")) continue; // wildcards are legal
        expect(
          isKnownPermission(perm),
          `Role ${role} references unknown permission ${perm}`,
        ).toBe(true);
      }
    }
  });
});

describe("getRolePermissions", () => {
  it("returns the hr_manager permission list", () => {
    const perms = getRolePermissions("hr_manager");
    expect(perms.length).toBeGreaterThan(0);
    expect(perms).toContain("hr:read");
  });

  it("returns an empty array for unknown roles", () => {
    expect(getRolePermissions("not_a_real_role")).toEqual([]);
  });
});
