import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isKnownPermission,
  getRolePermissions,
} from "../../src/lib/rbacCatalog.js";
import { DOMAIN_REGISTRY } from "../../src/lib/domainRegistry.js";

describe("RBAC catalog internal consistency", () => {
  it("has no duplicate permissions", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of PERMISSIONS) {
      if (seen.has(p)) dupes.push(p);
      seen.add(p);
    }
    expect(dupes).toEqual([]);
  });

  it("every role permission is a known permission", () => {
    const unknown: string[] = [];
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        if (!isKnownPermission(p)) {
          unknown.push(`${role} → ${p}`);
        }
      }
    }
    expect(unknown, `Unknown permissions: ${unknown.join(", ")}`).toEqual([]);
  });

  it("no role has duplicate permissions", () => {
    const dupes: string[] = [];
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      const seen = new Set<string>();
      for (const p of perms) {
        if (seen.has(p)) dupes.push(`${role}: ${p}`);
        seen.add(p);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("owner and general_manager have wildcard", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("*");
    expect(ROLE_PERMISSIONS.general_manager).toContain("*");
  });

  it("employee role has hr:self", () => {
    expect(ROLE_PERMISSIONS.employee).toContain("hr:self");
  });

  it("getRolePermissions returns empty array for unknown role", () => {
    expect(getRolePermissions("nonexistent_role")).toEqual([]);
  });

  it("isKnownPermission returns true for valid permissions", () => {
    expect(isKnownPermission("*")).toBe(true);
    expect(isKnownPermission("hr:read")).toBe(true);
    expect(isKnownPermission("finance:approve")).toBe(true);
  });

  it("isKnownPermission returns false for invalid permissions", () => {
    expect(isKnownPermission("fake:permission")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
  });
});

describe("RBAC ↔ Domain registry alignment", () => {
  it("every domain with permissions has them listed in RBAC catalog", () => {
    const missing: string[] = [];
    for (const domain of DOMAIN_REGISTRY) {
      for (const perm of domain.permissions) {
        if (!isKnownPermission(perm)) {
          missing.push(`${domain.id}: ${perm}`);
        }
      }
    }
    expect(
      missing,
      `Domain permissions not in RBAC catalog: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("manager roles cover their domain read permission", () => {
    const roleModuleMap: Record<string, string> = {
      hr_manager: "hr:read",
      finance_manager: "finance:read",
      fleet_manager: "fleet:read",
      warehouse_manager: "warehouse:read",
      property_manager: "property:read",
      projects_manager: "projects:read",
      legal_manager: "legal:read",
      support_manager: "support:read",
      crm_manager: "crm:read",
    };

    const gaps: string[] = [];
    for (const [role, expectedPerm] of Object.entries(roleModuleMap)) {
      const perms = ROLE_PERMISSIONS[role];
      if (!perms) {
        gaps.push(`${role}: role not defined`);
        continue;
      }
      if (!perms.includes(expectedPerm as any)) {
        gaps.push(`${role}: missing ${expectedPerm}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("branch_manager has read access to all major domains", () => {
    const branchPerms = ROLE_PERMISSIONS.branch_manager;
    expect(branchPerms).toBeDefined();
    const majorReads = [
      "hr:read",
      "finance:read",
      "fleet:read",
      "warehouse:read",
      "property:read",
      "projects:read",
      "legal:read",
      "support:read",
      "crm:read",
    ];
    const missing = majorReads.filter((p) => !branchPerms.includes(p as any));
    expect(missing, `branch_manager missing: ${missing.join(", ")}`).toEqual(
      []
    );
  });
});

describe("Permission naming conventions", () => {
  const nonWildcardPerms = PERMISSIONS.filter((p) => p !== "*");

  it("all permissions use lowercase with colon separator", () => {
    const invalid = nonWildcardPerms.filter(
      (p) => !/^[a-z_]+(:[a-z_]+){1,2}$/.test(p)
    );
    expect(invalid).toEqual([]);
  });

  it("CRUD permissions follow standard verbs", () => {
    const validVerbs = new Set([
      "read",
      "create",
      "update",
      "write",
      "delete",
      "approve",
      "self",
      "download",
    ]);
    const invalid: string[] = [];
    for (const p of nonWildcardPerms) {
      const parts = p.split(":");
      const verb = parts[parts.length - 1];
      if (!validVerbs.has(verb)) {
        invalid.push(p);
      }
    }
    expect(invalid, `Non-standard permission verbs: ${invalid.join(", ")}`).toEqual([]);
  });
});
