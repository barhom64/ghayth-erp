import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Legacy enforcement now consults RBAC v2 (Ghaith Operating Foundation #1413)
//
// requirePermission / requireAnyPermission / userHasPermission historically
// resolved ONLY against role_permissions. They now ALSO fold in the user's
// RBAC v2 grants (projected to the flat vocabulary), additively — so RBAC is a
// co-equal authority for the ~34 legacy-enforced routes and role_permissions is
// no longer the sole source of truth (الخطة الجذرية §3 م5). Static source scan.
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const MW = readFileSync(join(root, "src/middlewares/permissionMiddleware.ts"), "utf8");

describe("permissionMiddleware — RBAC v2 unification", () => {
  it("imports the shared flat projection helper", () => {
    expect(MW).toMatch(/import \{ projectGrantsToFlat \} from "\.\.\/lib\/rbac\/flatProjection\.js"/);
  });

  it("loads the user's RBAC grants from the enforced tables, projected to flat", () => {
    const idx = MW.indexOf("async function loadRbacFlatPermissions");
    expect(idx).toBeGreaterThan(-1);
    const section = MW.slice(idx, idx + 1400);
    expect(section).toMatch(/FROM rbac_user_roles ur/);
    expect(section).toMatch(/JOIN rbac_role_grants g ON g\.role_id = r\.id/);
    expect(section).toMatch(/projectGrantsToFlat\(rows\)/);
    expect(section).toMatch(/expires_at IS NULL OR ur\.expires_at > NOW\(\)/);
  });

  it("folds the RBAC set into the effective permissions of every enforcement path", () => {
    // requirePermission, requireAnyPermission, userHasPermission all union it
    const unions = MW.match(/new Set\(\[\.\.\.role[Pp]erms, \.\.\.rbacPerms\]\)/g) ?? [];
    expect(unions.length).toBeGreaterThanOrEqual(3);
  });

  it("degrades safely when RBAC projection fails (legacy set only)", () => {
    const idx = MW.indexOf("async function loadRbacFlatPermissions");
    const section = MW.slice(idx, idx + 1400);
    expect(section).toMatch(/legacy set only/);
  });

  it("invalidates the RBAC projection cache on grant changes", () => {
    const idx = MW.indexOf("export function invalidatePermissionCache");
    const section = MW.slice(idx, idx + 600);
    expect(section).toMatch(/rbacFlatCache/);
  });
});
