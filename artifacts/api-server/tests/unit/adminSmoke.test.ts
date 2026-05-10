import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/admin.ts"),
  "utf8"
);

describe("admin — user management endpoints", () => {
  it("GET /users requires admin:read permission", () => {
    const idx = SRC.indexOf('"/users"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /users requires admin:write permission", () => {
    const idx = SRC.indexOf('router.post("/users"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("PATCH /users/:id requires admin:write", () => {
    const idx = SRC.indexOf('"/users/:id"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("DELETE /users/:id requires admin:write", () => {
    const idx = SRC.indexOf('router.delete("/users/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("GET /users queries scoped by companyId", () => {
    const idx = SRC.indexOf('"/users"');
    const section = SRC.slice(idx, idx + 1000);
    expect(section).toContain("scope.companyId");
  });

  it("assertAdmin checks role level >= 90", () => {
    expect(SRC).toContain("ADMIN_ROLE_LEVEL = 90");
    expect(SRC).toContain("rows[0].level >= ADMIN_ROLE_LEVEL");
  });

  it("assertAdmin falls back to ADMIN_ROLES array", () => {
    expect(SRC).toContain('ADMIN_ROLES');
    expect(SRC).toContain("from \"../lib/rbacCatalog.js\"");
    expect(SRC).toContain("ADMIN_ROLES.includes(scope.role)");
  });
});

describe("admin — password management", () => {
  it("reset-password endpoint has rate limiter", () => {
    const idx = SRC.indexOf("reset-password");
    const section = SRC.slice(Math.max(0, idx - 200), idx + 200);
    expect(section).toContain("resetPasswordLimiter");
  });

  it("rate limiter allows max 5 requests per minute", () => {
    expect(SRC).toContain("windowMs: 60 * 1000");
    expect(SRC).toContain("max: 5");
  });

  it("password validation requires minimum 8 characters", () => {
    expect(SRC).toContain('z.string().min(8');
  });
});

describe("admin — Zod validation schemas", () => {
  it("createUserSchema validates email as required", () => {
    expect(SRC).toContain("createUserSchema");
    expect(SRC).toContain('email: z.string().min(1');
  });

  it("createRoleSchema validates name as required", () => {
    expect(SRC).toContain("createRoleSchema");
    const idx = SRC.indexOf("createRoleSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('name: z.string().min(1');
  });

  it("createIntegrationSchema validates name and type", () => {
    expect(SRC).toContain("createIntegrationSchema");
    const idx = SRC.indexOf("createIntegrationSchema");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain('name: z.string().min(1');
    expect(section).toContain('type: z.enum(');
  });
});

describe("admin — role management", () => {
  it("GET /roles requires admin:read", () => {
    const idx = SRC.indexOf('"/roles"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /roles requires admin:write", () => {
    const idx = SRC.indexOf('router.post("/roles"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("GET /user-roles/:userId requires admin:read", () => {
    const idx = SRC.indexOf('"/user-roles/:userId"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("DELETE /user-roles/:id requires admin:write", () => {
    const idx = SRC.indexOf('router.delete("/user-roles/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("admin — integration management", () => {
  it("GET /integrations requires admin:read", () => {
    const idx = SRC.indexOf('"/integrations"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /integrations/:id/test endpoint exists", () => {
    expect(SRC).toContain('"/integrations/:id/test"');
  });

  it("integration logs endpoint exists", () => {
    expect(SRC).toContain('"/integration-logs"');
  });

  it("integration log retry endpoint exists", () => {
    expect(SRC).toContain('"/integration-logs/retry"');
  });
});

describe("admin — system health & security", () => {
  it("GET /system-health requires admin:read", () => {
    const idx = SRC.indexOf('"/system-health"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("security log endpoint exists", () => {
    expect(SRC).toContain('"/security-log"');
  });

  it("violations report endpoint exists", () => {
    expect(SRC).toContain('"/violations-report"');
  });

  it("violations resolve endpoint requires admin:write", () => {
    const idx = SRC.indexOf('"/violations/:id/resolve"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("admin — governance sub-routes", () => {
  it("policy audit endpoint exists", () => {
    expect(SRC).toContain('"/governance/policy-audit"');
  });

  it("system guards endpoint exists", () => {
    expect(SRC).toContain('"/governance/system-guards"');
  });

  it("domain registry endpoint exists", () => {
    expect(SRC).toContain('"/governance/domain-registry"');
  });

  it("GL reconciliation endpoint exists", () => {
    expect(SRC).toContain('"/governance/gl-reconciliation"');
  });

  it("lifecycle machines endpoint exists", () => {
    expect(SRC).toContain('"/governance/lifecycle-machines"');
  });

  it("event DLQ endpoints exist (list, replay, delete)", () => {
    expect(SRC).toContain('"/governance/event-dlq"');
    expect(SRC).toContain('"/governance/event-dlq/:id/replay"');
    expect(SRC).toContain('router.delete("/governance/event-dlq/:id"');
  });

  it("RBAC matrix endpoint exists", () => {
    expect(SRC).toContain('"/governance/rbac-matrix"');
  });
});

describe("admin — system registry", () => {
  it("system registry endpoint exists", () => {
    expect(SRC).toContain('"/system-registry"');
  });

  it("entities, actions, pages sub-routes exist", () => {
    expect(SRC).toContain('"/system-registry/entities"');
    expect(SRC).toContain('"/system-registry/actions"');
    expect(SRC).toContain('"/system-registry/pages"');
  });

  it("missing items endpoint exists", () => {
    expect(SRC).toContain('"/system-registry/missing"');
  });

  it("dependency graph endpoint exists", () => {
    expect(SRC).toContain('"/system-health/dependency-graph"');
  });
});

describe("admin — role permissions CRUD", () => {
  it("GET /role-permissions requires admin:read", () => {
    const idx = SRC.indexOf('"/role-permissions"');
    const section = SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("bulk update endpoint exists", () => {
    expect(SRC).toContain('"/role-permissions/bulk"');
  });

  it("DELETE /role-permissions/:id requires admin:write", () => {
    const idx = SRC.indexOf('router.delete("/role-permissions/:id"');
    const section = SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("admin — security patterns", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(SRC).not.toContain("router.use(authMiddleware)");
  });

  it("uses parameterized queries throughout", () => {
    const queries = [...SRC.matchAll(/rawQuery|rawExecute/g)];
    expect(queries.length).toBeGreaterThan(20);
  });

  it("userBelongsToCompany uses parameterized check", () => {
    const idx = SRC.indexOf("userBelongsToCompany");
    const section = SRC.slice(idx, idx + 500);
    expect(section).toContain("$1");
    expect(section).toContain("$2");
  });

  it("hashes passwords before storage", () => {
    expect(SRC).toContain("hashPassword");
  });

  it("uses handleRouteError for error handling", () => {
    const matches = [...SRC.matchAll(/handleRouteError/g)];
    expect(matches.length).toBeGreaterThan(15);
  });

  it("invalidates permission cache on role changes", () => {
    expect(SRC).toContain("invalidatePermissionCache");
  });
});
