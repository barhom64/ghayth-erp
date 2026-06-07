import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Legacy flat gates now enforce ENTIRELY via RBAC v2 (Ghaith #1413).
//
// requirePermission / requireAnyPermission / userHasPermission no longer read
// role_permissions / user_roles / permissions — they translate each legacy
// `module:action` to a feature.action and resolve through authzEngine.checkAccess.
// RBAC v2 is the single security authority. Static source scan.
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const MW = readFileSync(join(root, "src/middlewares/permissionMiddleware.ts"), "utf8");

describe("permissionMiddleware — RBAC v2 is the single enforcement authority", () => {
  it("resolves via authzEngine.checkAccess, not the legacy tables", () => {
    expect(MW).toMatch(/import \{ checkAccess \} from "\.\.\/lib\/rbac\/authzEngine\.js"/);
    expect(MW).toMatch(/checkAccess\(scope, \{ feature: spec\.feature, action: spec\.action \}\)/);
  });

  it("no longer reads role_permissions / user_roles / permissions for enforcement", () => {
    expect(MW).not.toMatch(/FROM role_permissions/);
    expect(MW).not.toMatch(/FROM user_roles/);
    expect(MW).not.toMatch(/SELECT permission, type FROM permissions/);
  });

  it("maps every legacy flat perm to an RBAC feature.action", () => {
    expect(MW).toMatch(/FLAT_TO_RBAC/);
    expect(MW).toMatch(/"audit:read":\s*\{ feature: "admin\.audit", action: "view" \}/);
    expect(MW).toMatch(/"settings:read":\s*\{ feature: "settings",\s*action: "view" \}/);
    expect(MW).toMatch(/"print:reprint:approve":\s*\{ feature: "documents",\s*action: "approve" \}/);
    expect(MW).toMatch(/"templates:write":\s*\{ feature: "admin",\s*action: "update" \}/);
  });

  it("keeps the owner bypass on all three gates", () => {
    const matches = MW.match(/scope\.isOwner \|\| scope\.role === "owner"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("invalidatePermissionCache is retained (no-op) for call-site compatibility", () => {
    expect(MW).toMatch(/export function invalidatePermissionCache/);
  });

  it("unmapped perms degrade to a best-effort feature.action translation", () => {
    expect(MW).toMatch(/best-effort RBAC translation/);
    expect(MW).toMatch(/read: "view"/);
  });
});
