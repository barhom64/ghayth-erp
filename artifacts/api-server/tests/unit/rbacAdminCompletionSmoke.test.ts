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
  it("pulls in withTransaction + issueNumber (for atomic onboard)", () => {
    expect(ADMIN).toMatch(/import \{[^}]*withTransaction[^}]*\} from "\.\.\/lib\/rawdb\.js"/);
    expect(ADMIN).toMatch(/import \{ issueNumber \} from "\.\.\/lib\/numberingService\.js"/);
  });
});

describe("RBAC-002 — POST /admin/onboard (quick create employee + user + roles)", () => {
  it("mounts the route gated by the admin feature", () => {
    expect(ADMIN).toMatch(/router\.post\("\/onboard", authorize\(\{ feature: "admin", action: "update" \}\)/);
  });

  it("enforces admin level inside the handler (assertAdmin)", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 200);
    expect(section).toMatch(/await assertAdmin\(req\)/);
  });

  it("accepts one user with MULTIPLE roles, each with its own scope", () => {
    const idx = ADMIN.indexOf("const onboardSchema");
    const schema = ADMIN.slice(idx, idx + 1700);
    expect(schema).toContain("roles:");
    expect(schema).toMatch(/roleKey:\s*z\.string\(\)/);
    expect(schema).toMatch(/branchId:/);
    expect(schema).toMatch(/departmentId:/);
    // Roles are optional in the schema because a picked job title can supply
    // the default role (migration 249). The "at least one" invariant is now
    // enforced at runtime — see the atomic test below.
    expect(schema).toMatch(/jobTitleId:/);
  });

  it("is atomic — employee + assignment + user + roles inside withTransaction", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 9600);
    expect(section).toContain("withTransaction");
    expect(section).toMatch(/INSERT INTO employees/);
    expect(section).toMatch(/INSERT INTO employee_assignments/);
    expect(section).toMatch(/INSERT INTO users/);
    // Roles are bound through the central rbacService.grantUserRole (which
    // enforces SoD and runs inside THIS withTransaction via rawdb's ALS) —
    // no more raw `INSERT INTO rbac_user_roles` with no SoD check.
    expect(section).toMatch(/grantUserRole\(/);
  });

  // A picked job title auto-provisions its default RBAC role + custody policy
  // (job_titles.defaultRoleKey / opensCustody, migration 249) so activating a
  // new employee is one choice — not a manual role hunt. Explicit roles still
  // win, and at least one role (manual or job-title-derived) is enforced.
  it("auto-provisions the job title's default role + custody, and still requires a role at runtime", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 9600);
    expect(section).toMatch(/FROM job_titles/);
    expect(section).toMatch(/"defaultRoleKey"/);
    expect(section).toMatch(/"opensCustody"/);
    expect(section).toMatch(/اختر دوراً واحداً على الأقل/); // runtime "at least one role" guard
    expect(section).toMatch(/subsidiary_accounts/); // custody account when opensCustody
  });

  it("resolves every role key up front and rejects an unknown role (no half-onboard)", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 9600);
    expect(section).toMatch(/SELECT id FROM rbac_roles WHERE role_key/);
    expect(section).toMatch(/الدور غير موجود/);
  });

  // Folded in from Ghaith Bot's "partial-onboard guard": role resolution must
  // run BEFORE withTransaction opens, so an invalid role never creates an
  // orphan employee/user (the whole onboard is atomic).
  it("rolls the whole onboard back when any role key is invalid (atomic ordering)", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 9600);
    const roleCheckIdx = section.indexOf("SELECT id FROM rbac_roles WHERE role_key");
    const txIdx = section.indexOf("withTransaction");
    expect(roleCheckIdx).toBeGreaterThan(-1);
    expect(txIdx).toBeGreaterThan(-1);
    expect(roleCheckIdx).toBeLessThan(txIdx);
  });

  it("records the active role in the audit log (RBAC-001) + emits an event", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 9600);
    expect(section).toMatch(/activeRoleKey:/);
    expect(section).toMatch(/emitEvent\(/);
  });

  it("uniqueness guard on email (login key) before the transaction", () => {
    const idx = ADMIN.indexOf('router.post("/onboard"');
    const section = ADMIN.slice(idx, idx + 9600);
    expect(section).toMatch(/SELECT id FROM users WHERE email = \$1/);
    expect(section).toMatch(/مستخدم مسبقا/);
  });
});

describe("runtime role mutation — central grant + permission-cache invalidation", () => {
  it("POST /user-roles grants via the central rbacService (SoD + cache) not a raw INSERT", () => {
    const idx = ADMIN.indexOf('router.post("/user-roles"');
    const section = ADMIN.slice(idx, idx + 3000);
    // Routed through grantUserRole (which enforces SoD AND invalidates caches);
    // an SoD conflict is a HARD 403 here (explicit single-role admin action).
    expect(section).toMatch(/grantUserRole\(/);
    expect(section).toMatch(/sod_conflict/);
    expect(section).toMatch(/ForbiddenError/);
    // Seed-on-demand (#1791) preserved.
    expect(section).toMatch(/PREDEFINED_ROLES\.find/);
    // No more inline rbac_user_roles INSERT in this handler.
    expect(section).not.toMatch(/INSERT INTO rbac_user_roles/);
  });

  it("PATCH /users/:id invalidates both permission caches after a role change", () => {
    // The replace-role branch lives in the PATCH /users/:id handler; the
    // invalidation runs right after its withTransaction commits.
    expect(ADMIN).toMatch(/bumpCacheVersion\(scope\.companyId\)/);
    expect(ADMIN).toMatch(/invalidateRoleCache\(id\)/);
    expect(ADMIN).toMatch(/import \{ bumpCacheVersion \} from "\.\.\/lib\/rbac\/authzEngine\.js"/);
    expect(ADMIN).toMatch(/import \{ invalidateRoleCache \} from "\.\.\/middlewares\/roleGuard\.js"/);
  });
});

describe("RBAC-004 — GET /admin/users/:id/effective-permissions", () => {
  it("mounts gated + enforces admin level", () => {
    expect(ADMIN).toMatch(/router\.get\("\/users\/:id\/effective-permissions", authorize\(\{ feature: "admin", action: "view" \}\)/);
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 3400);
    expect(section).toMatch(/await assertAdmin\(req\)/);
  });

  it("isolates by the actor's company via employee_assignments", () => {
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 3400);
    expect(section).toMatch(/employee_assignments ea ON ea\."employeeId" = u\."employeeId"/);
    expect(section).toMatch(/ea\."companyId" = \$2/);
  });

  it("returns each grant WITH its source role (joins user-roles → roles → grants)", () => {
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 3400);
    expect(section).toMatch(/FROM rbac_user_roles ur/);
    expect(section).toMatch(/JOIN rbac_roles r ON r\.id = ur\.role_id/);
    expect(section).toMatch(/JOIN rbac_role_grants g ON g\.role_id = r\.id/);
    expect(section).toContain("source");
    expect(section).toMatch(/roleKey:/);
  });

  it("includes per-user overrides (grant/deny) and respects expiry", () => {
    const idx = ADMIN.indexOf('"/users/:id/effective-permissions"');
    const section = ADMIN.slice(idx, idx + 3400);
    expect(section).toMatch(/FROM rbac_user_grants/);
    expect(section).toMatch(/expires_at IS NULL OR expires_at > NOW\(\)/);
  });
});

describe("RBAC-004 — POST /admin/permissions/explain", () => {
  it("mounts gated + enforces admin level", () => {
    expect(ADMIN).toMatch(/router\.post\("\/permissions\/explain", authorize\(\{ feature: "admin", action: "view" \}\)/);
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 3600);
    expect(section).toMatch(/await assertAdmin\(req\)/);
  });

  it("resolves the decision from the user's real grants (same tables the engine reads)", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 3600);
    expect(section).toMatch(/FROM rbac_user_roles ur/);
    expect(section).toMatch(/JOIN rbac_role_grants g ON g\.role_id = r\.id/);
    expect(section).toMatch(/g\.feature_key = \$3/);
    expect(section).toMatch(/\.actions\b/);
    expect(section).toMatch(/\.includes\(action\)/);
  });

  it("explicit per-user deny overrides any allow (#1413 §8)", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 3600);
    expect(section).toMatch(/type = 'revoke'/);
    expect(section).toMatch(/const denied =/);
    expect(section).toMatch(/allowed = !!granting && !denied/);
  });

  it("returns the human Arabic answer + source role + scope", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 3600);
    expect(section).toMatch(/allowed,/);
    expect(section).toMatch(/reason,/);
    expect(section).toMatch(/sourceRole:/);
    expect(section).toMatch(/scope:/);
    expect(section).toMatch(/deniedByRule:/);
  });

  it("scopes the target user lookup by company (tenant isolation)", () => {
    const idx = ADMIN.indexOf('"/permissions/explain"');
    const section = ADMIN.slice(idx, idx + 3600);
    expect(section).toMatch(/ea\."companyId" = \$2/);
  });
});
