import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Unified authorization bridge smoke — Ghaith Operating Foundation (#1413)
//
// GET /permissions/my must project the caller's RBAC v2 grants (the system
// the backend actually ENFORCES) into the flat module:action vocabulary the
// frontend reads, so the RBAC v2 role editor becomes the single source of
// truth for UI visibility too. Static source scan (matching the other
// admin/rbac smokes) so it runs without a DB.
//
// See docs/rbac/UNIFIED_AUTHORIZATION_RADICAL_PLAN.md (المرحلة 1 — الجسر).
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const PERMS = readFileSync(join(root, "src/routes/permissions.ts"), "utf8");

describe("RBAC v2 → flat bridge in GET /permissions/my", () => {
  it("reads the caller's RBAC v2 grants from the enforced tables", () => {
    const idx = PERMS.indexOf('router.get("/my"');
    const section = PERMS.slice(idx, idx + 7000);
    expect(section).toMatch(/FROM rbac_user_roles ur/);
    expect(section).toMatch(/JOIN rbac_roles r ON r\.id = ur\.role_id/);
    expect(section).toMatch(/JOIN rbac_role_grants g ON g\.role_id = r\.id/);
  });

  it("scopes the projection to the (possibly role-picker-narrowed) roles", () => {
    const idx = PERMS.indexOf('router.get("/my"');
    const section = PERMS.slice(idx, idx + 7000);
    expect(section).toMatch(/r\.role_key = ANY\(\$3::text\[\]\)/);
    expect(section).toMatch(/expires_at IS NULL OR ur\.expires_at > NOW\(\)/);
  });

  it("projects grants via the shared pure helper (parity gate)", () => {
    const idx = PERMS.indexOf('router.get("/my"');
    const section = PERMS.slice(idx, idx + 7000);
    expect(section).toMatch(/rbacProjected = projectGrantsToFlat\(grantRows\)/);
    expect(PERMS).toMatch(/import \{ projectGrantsToFlat \} from "\.\.\/lib\/rbac\/flatProjection\.js"/);
  });

  it("is strictly additive (UNION with legacy) and degrades on failure", () => {
    const idx = PERMS.indexOf('router.get("/my"');
    const section = PERMS.slice(idx, idx + 7000);
    // projection wrapped in try/catch so /permissions/my never throws here
    expect(section).toMatch(/rbacProjected: string\[\] = \[\]/);
    expect(section).toMatch(/projection skipped — using legacy set only/);
    // unioned into the granted set alongside legacy rolePerms + user grants
    expect(section).toMatch(/new Set\(\[\.\.\.rolePerms, \.\.\.grants, \.\.\.rbacProjected\]\)/);
    // per-user revokes still win over the projected set
    expect(section).toMatch(/\.filter\(\(p\) => !revokes\.has\(p\)\)/);
  });
});
