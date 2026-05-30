import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// RBAC v2 admin completion smoke — Ghaith Operating Foundation (#1413)
//
// Static source scan (matching umrahReportsSmoke / finalRoutesSmoke) for the
// three additive endpoints that close the documented RBAC gaps:
//   - RBAC-002: POST /admin/onboard (atomic employee + user + roles)
//   - RBAC-004: GET /admin/users/:id/effective-permissions
//   - RBAC-004: POST /admin/permissions/explain
//
// See docs/rbac/USER_QUICK_CREATE_FLOW.md, EFFECTIVE_PERMISSIONS_SPEC.md,
// PERMISSION_EXPLAINER_SPEC.md.
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const ADMIN = readFileSync(join(root, "src/routes/admin.ts"), "utf8");

describe("admin RBAC completion — imports", () => {
  it("pulls in withTransaction + checkAccess", () => {
    expect(ADMIN).toMatch(/import \{[^}]*withTransaction[^}]*\} from "\.\.\/lib\/rawdb\.js"/);
    expect(ADMIN).toMatch(/import \{ checkAccess \} from "\.\.\/lib\/rbac\/authzEngine\.js"/);
  });
});

describe("RBAC-002 — POST /admin/onboard (quick create employee + user + roles)", () => {
  it("mounts the route gated at user-management level", () => {
    expect(ADMIN).toMatch(/router\.post\("\/onboard", requireMinLevel\(80\)/);
  });

  it("accepts one user with MULTIPLE roles, each with its own scope", () => {
    const idx = ADMIN.indexOf("const onboardSchema");
    const schema = ADMIN.slice(idx, idx + 900);
    expect(schema).toContain("roles:");
    expect(schema).toMatch(/roleKey:\s*z\.string\(\)/);
    // per-role branch + department scope
    expect(schema).toMatch(/branchId:/);
    expect(schema).toMatch(/departmentId:/);
    expect(schema).toMatch(/\.min\(1\)/); // at least one role required
  });

  it("is atomic — employee + assignment + user + roles inside withTransaction", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 4500);
    expect(section).toContain("withTransaction");
    expect(section).toMatch(/INSERT INTO employees/);
    expect(section).toMatch(/INSERT INTO employee_assignments/);
    expect(section).toMatch(/INSERT INTO users/);
    expect(section).toMatch(/INSERT INTO rbac_user_roles/);
  });

  it("resolves every role key up front and 400s on an unknown role (no half-onboard)", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 4500);
    expect(section).toMatch(/SELECT id FROM rbac_roles WHERE role_key/);
    expect(section).toMatch(/الدور غير موجود/);
  });

  it("records the active role in the audit log (RBAC-001)", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 4500);
    expect(section).toMatch(/activeRoleKey:/);
    expect(section).toMatch(/emitEvent\(/);
  });

  it("uniqueness guard on username/email before the transaction", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 4500);
    expect(section).toMatch(/SELECT id FROM users WHERE username = \$1 OR email = \$2/);
    expect(section).toMatch(/مستخدم مسبقا/);
  });
});

describe("RBAC-004 — GET /admin/users/:id/effective-permissions", () => {
  it("mounts gated, scoped to the actor's company (tenant isolation)", () => {
    expect(ADMIN).toMatch(/router\.get\("\/users\/:id\/effective-permissions", requireMinLevel\(80\)/);
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 2200);
    expect(section).toMatch(/FROM users WHERE id = \$1 AND "companyId" = \$2/);
  });

  it("returns each grant WITH its source role (joins user-roles → roles → grants)", () => {
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 2200);
    expect(section).toMatch(/FROM rbac_user_roles ur/);
    expect(section).toMatch(/JOIN rbac_roles r ON r\.id = ur\.role_id/);
    expect(section).toMatch(/JOIN rbac_role_grants g ON g\.role_id = r\.id/);
    expect(section).toContain("source");
    expect(section).toMatch(/roleKey:/);
  });

  it("includes per-user overrides (grant/deny) and respects expiry", () => {
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 2200);
    expect(section).toMatch(/FROM rbac_user_grants/);
    expect(section).toMatch(/expires_at IS NULL OR expires_at > NOW\(\)/);
  });
});

describe("RBAC-004 — POST /admin/permissions/explain", () => {
  it("mounts gated", () => {
    expect(ADMIN).toMatch(/router\.post\("\/permissions\/explain", requireMinLevel\(80\)/);
  });

  it("delegates the decision to checkAccess (no parallel auth logic)", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 1600);
    expect(section).toMatch(/await checkAccess\(/);
    expect(section).toMatch(/feature, action/);
  });

  it("returns the human answer + source role + scope + approval limit", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 1600);
    expect(section).toMatch(/allowed:/);
    expect(section).toMatch(/reason:/);
    expect(section).toMatch(/sourceRole:/);
    expect(section).toMatch(/matchedRoleKey/);
    expect(section).toMatch(/appliedScope/);
    expect(section).toMatch(/approvalLimit/);
  });

  it("scopes the target user lookup by company (tenant isolation)", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 1600);
    expect(section).toMatch(/FROM users WHERE id = \$1 AND "companyId" = \$2/);
  });
});
