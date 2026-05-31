/**
 * GAP_MATRIX item #3 — RBAC catalog integration ratchet.
 *
 * The sweep audit flagged `rbacCatalog.ts` and `rbac/featureCatalog.ts`
 * as "two sources of truth that must be unified". Re-inspection
 * confirms the two files are INTENTIONALLY complementary, not
 * duplicates:
 *
 *   - rbacCatalog.ts owns:
 *       * the legacy curated `PERMISSIONS` list
 *       * the role-group constants (HR_ROLES, FINANCE_ROLES, ...)
 *         used by `assertRole`-style checks across 30+ routes
 *       * `ROLE_PERMISSIONS` — default seed consumed by migration
 *         068_rbac_catalog_seed.sql
 *
 *   - featureCatalog.ts owns:
 *       * the tree of authorisable features (modules → features →
 *         sub-features) with actions + scopes
 *       * `FEATURE_PERMISSIONS` — derived `<key>:<action>` strings
 *       * what `authzEngine` reads at request time
 *
 * The integration that prevents "two sources of truth" pathologies:
 * `isKnownPermission()` in rbacCatalog imports
 * `FEATURE_PERMISSION_SET` from featureCatalog so that ANY perm
 * string declared in either catalog passes validation. Adding a new
 * feature to featureCatalog therefore extends the permission surface
 * automatically — no duplicate entry in PERMISSIONS needed.
 *
 * This test pins the integration so a future refactor can't break
 * the bridge without the diff loudly failing CI.
 */
import { describe, it, expect } from "vitest";
import {
  isKnownPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  HR_ROLES,
  FINANCE_ROLES,
  OWNER_GM_ROLES,
} from "../../src/lib/rbacCatalog.js";
import {
  FEATURE_PERMISSIONS,
  FEATURE_PERMISSION_SET,
  FEATURE_CATALOG,
} from "../../src/lib/rbac/featureCatalog.js";

describe("RBAC catalog integration — GAP_MATRIX #3", () => {
  it("isKnownPermission accepts legacy PERMISSIONS strings", () => {
    // Sample of legacy permission shapes that must continue to validate.
    expect(isKnownPermission("hr:read")).toBe(true);
    expect(isKnownPermission("finance:write")).toBe(true);
    expect(isKnownPermission("admin:read")).toBe(true);
    expect(isKnownPermission("audit:read")).toBe(true);
    // Wildcards
    expect(isKnownPermission("*")).toBe(true);
  });

  it("isKnownPermission accepts featureCatalog-derived strings", () => {
    // If featureCatalog has ANY entries, at least one derived string
    // must validate through the same function.
    expect(FEATURE_PERMISSIONS.length).toBeGreaterThan(0);
    const sample = FEATURE_PERMISSIONS[0];
    expect(isKnownPermission(sample)).toBe(true);
  });

  it("isKnownPermission rejects unknown strings", () => {
    expect(isKnownPermission("nonsense:fakeaction")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
  });

  it("rbacCatalog imports featureCatalog set (bridge stays wired)", () => {
    // Read the source itself to assert the import statement is present.
    // If a future refactor drops the import, isKnownPermission will
    // silently regress to legacy-only — this test catches that.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const src = readFileSync(
      join(import.meta.dirname!, "..", "..", "src", "lib", "rbacCatalog.ts"),
      "utf8",
    );
    expect(src).toMatch(/from\s+["']\.\/rbac\/featureCatalog/);
    expect(src).toContain("FEATURE_PERMISSION_SET");
  });

  it("featureCatalog exposes the shapes the engine relies on", () => {
    expect(FEATURE_CATALOG).toBeDefined();
    expect(FEATURE_PERMISSIONS).toBeDefined();
    expect(FEATURE_PERMISSION_SET).toBeDefined();
    expect(FEATURE_PERMISSION_SET.size).toBe(FEATURE_PERMISSIONS.length);
  });

  it("role-group constants stay exported from rbacCatalog", () => {
    // 30+ routes assertRole against these. Renaming them is a breaking
    // change that has to update every consumer — this test forces a
    // matching update in the consumer's CI before the constant ships.
    expect(Array.isArray(HR_ROLES)).toBe(true);
    expect(Array.isArray(FINANCE_ROLES)).toBe(true);
    expect(Array.isArray(OWNER_GM_ROLES)).toBe(true);
    expect(HR_ROLES.length).toBeGreaterThan(0);
    expect(FINANCE_ROLES.length).toBeGreaterThan(0);
    expect(OWNER_GM_ROLES.length).toBeGreaterThan(0);
  });

  it("ROLE_PERMISSIONS seed map stays a non-empty record", () => {
    // Migration 068 reseeds role_permissions from this.
    expect(Object.keys(ROLE_PERMISSIONS).length).toBeGreaterThan(0);
  });

  it("legacy PERMISSIONS list stays non-empty (route consumers still depend on it)", () => {
    expect(PERMISSIONS.length).toBeGreaterThan(0);
  });
});
