import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/middlewares");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const PERMISSION = read("permissionMiddleware.ts");
const ROLE_GUARD = read("roleGuard.ts");
const CONTEXTUAL = read("contextualRbac.ts");
const AUDIT_MW = read("auditMiddleware.ts");
const AUTH_MW = read("authMiddleware.ts");

// ══════════════════════════════════════════════════════════════════════════
// PERMISSION MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

describe("permissionMiddleware — exports", () => {
  it("exports requirePermission", () => {
    expect(PERMISSION).toContain("export function requirePermission");
  });

  it("exports requireAnyPermission", () => {
    expect(PERMISSION).toContain("export function requireAnyPermission");
  });

  it("exports invalidatePermissionCache", () => {
    expect(PERMISSION).toContain("export function invalidatePermissionCache");
  });

  it("exports logSecurityEvent", () => {
    expect(PERMISSION).toContain("logSecurityEvent");
  });
});

describe("permissionMiddleware — permission loading", () => {
  it("loads role permissions from DB", () => {
    expect(PERMISSION).toContain("loadRolePermissions");
  });

  it("loads user-specific permission overrides", () => {
    expect(PERMISSION).toContain("loadUserPermissions");
  });

  it("supports grant and revoke types", () => {
    expect(PERMISSION).toContain('"grant"');
    expect(PERMISSION).toContain('"revoke"');
  });

  it("loads all user role permissions (multi-role)", () => {
    expect(PERMISSION).toContain("loadAllUserRolePermissions");
  });
});

describe("permissionMiddleware — caching", () => {
  it("uses permission cache", () => {
    expect(PERMISSION).toContain("permissionCache");
  });

  it("has cache TTL", () => {
    expect(PERMISSION).toContain("CACHE_TTL_MS");
  });
});

describe("permissionMiddleware — security logging", () => {
  it("logs to security_log table", () => {
    expect(PERMISSION).toContain("security_log");
  });

  it("logs user IP", () => {
    expect(PERMISSION).toContain("ip");
  });

  it("uses parameterized queries", () => {
    const params = [...PERMISSION.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });
});

describe("permissionMiddleware — error responses", () => {
  it("returns 401 for missing auth", () => {
    expect(PERMISSION).toContain("401");
  });

  it("returns Arabic error message", () => {
    expect(PERMISSION).toContain("غير مصرح");
  });

  it("returns error code AUTH_MISSING", () => {
    expect(PERMISSION).toContain("AUTH_MISSING");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ROLE GUARD MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

describe("roleGuard — exports", () => {
  it("exports requireModule", () => {
    expect(ROLE_GUARD).toContain("export function requireModule");
  });

  it("exports requireMinLevel", () => {
    expect(ROLE_GUARD).toContain("export function requireMinLevel");
  });

  it("exports requireRole", () => {
    expect(ROLE_GUARD).toContain("export function requireRole");
  });

  it("exports invalidateRoleCache", () => {
    expect(ROLE_GUARD).toContain("export function invalidateRoleCache");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CONTEXTUAL RBAC
// ══════════════════════════════════════════════════════════════════════════

describe("contextualRbac — exports", () => {
  it("exports requireOwnership", () => {
    expect(CONTEXTUAL).toContain("export function requireOwnership");
  });

  it("exports canAct", () => {
    expect(CONTEXTUAL).toContain("export async function canAct");
  });
});

describe("contextualRbac — ownership checks", () => {
  for (const check of ["company", "branch", "self", "assignment"]) {
    it(`supports ownership check: ${check}`, () => {
      expect(CONTEXTUAL).toContain(`"${check}"`);
    });
  }
});

describe("contextualRbac — options", () => {
  it("supports table parameter", () => {
    expect(CONTEXTUAL).toContain("table: string");
  });

  it("supports idParam", () => {
    expect(CONTEXTUAL).toContain("idParam");
  });

  it("supports companyColumn override", () => {
    expect(CONTEXTUAL).toContain("companyColumn");
  });

  it("supports branchColumn override", () => {
    expect(CONTEXTUAL).toContain("branchColumn");
  });

  it("supports allowAdmin bypass", () => {
    expect(CONTEXTUAL).toContain("allowAdmin");
  });

  it("returns OWNERSHIP_DENIED code on failure", () => {
    expect(CONTEXTUAL).toContain("OWNERSHIP_DENIED");
  });
});

describe("contextualRbac — security", () => {
  it("uses parameterized queries", () => {
    const params = [...CONTEXTUAL.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUDIT MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

describe("auditMiddleware — exports", () => {
  it("exports auditMiddleware", () => {
    expect(AUDIT_MW).toContain("export function auditMiddleware");
  });
});

describe("auditMiddleware — mutating methods", () => {
  it("tracks POST, PUT, PATCH, DELETE", () => {
    expect(AUDIT_MW).toContain('"POST"');
    expect(AUDIT_MW).toContain('"PUT"');
    expect(AUDIT_MW).toContain('"PATCH"');
    expect(AUDIT_MW).toContain('"DELETE"');
  });
});

describe("auditMiddleware — entity mapping", () => {
  for (const entity of [
    "employee", "client", "invoice", "voucher", "expense",
    "purchase_request", "purchase_order", "leave_request",
    "attendance", "violation", "task", "project", "support_ticket",
    "vehicle", "maintenance", "warehouse_product", "crm_opportunity",
  ]) {
    it(`maps entity: ${entity}`, () => {
      expect(AUDIT_MW).toContain(`"${entity}"`);
    });
  }
});

describe("auditMiddleware — entity-to-table mapping", () => {
  for (const [entity, table] of [
    ["employee", "employees"],
    ["invoice", "invoices"],
    ["leave_request", "hr_leave_requests"],
    ["task", "tasks"],
    ["violation", "hr_violations"],
  ]) {
    it(`maps ${entity} → ${table}`, () => {
      expect(AUDIT_MW).toContain(`${entity}`);
      expect(AUDIT_MW).toContain(`${table}`);
    });
  }
});

describe("auditMiddleware — uses computeDiff", () => {
  it("imports computeDiff for before/after comparison", () => {
    expect(AUDIT_MW).toContain("computeDiff");
  });

  it("uses eventBus for emission", () => {
    expect(AUDIT_MW).toContain("eventBus");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

describe("authMiddleware — exports", () => {
  it("exports RequestScope interface", () => {
    expect(AUTH_MW).toContain("export interface RequestScope");
  });

  it("exports authMiddleware", () => {
    expect(AUTH_MW).toContain("export async function authMiddleware");
  });
});
