/**
 * PR-2 / #2163 — role-modules unification smoke.
 *
 * Wave-2 PR-2: turns the two hand-copied module-fallback maps
 * (roleGuard.ts `ROLE_DEFAULT_MODULES` and permissions.ts
 * `PREDEFINED_ROLE_DEFAULTS`) into thin re-exports from a single
 * source (`lib/rbac/roleModulesCatalog.ts`), and adds a canonicalize
 * layer so the dynamic projection at /auth/me + /permissions/my emits
 * the same vocabulary the nav registry and requireModule() consume.
 *
 * This pin guards the four invariants the audit (#2166 §8) demanded:
 *   1. one file holds the catalog — both consumers re-export from it
 *   2. every standard role in the catalog has a seed bundle in
 *      `DEFAULT_ROLE_DEFS` (autoMigrate.ts) — «منع إنشاء دور قياسي
 *      بلا grants» #2163 §2
 *   3. canonicalize() collapses the feature-key vocab onto the
 *      requireModule vocab — fixes the silent-hide bug PR-0 caught
 *   4. requireModule() canonicalises both sides before comparing —
 *      no more 403 on a module whose grant projects as a synonym
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROLE_MODULE_DEFAULTS,
  CANONICAL_MODULES,
  canonicalize,
  canonicalizeModules,
  getRoleModules,
  getRoleLevel,
  isKnownStandardRole,
} from "../../src/lib/rbac/roleModulesCatalog.js";
import { DEFAULT_ROLE_DEFS } from "../../src/lib/rbac/autoMigrate.js";

const REPO_ROOT  = join(import.meta.dirname!, "../../../..");
const ROLE_GUARD = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/middlewares/roleGuard.ts"), "utf8");
const PERMS      = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/permissions.ts"), "utf8");
const AUTH_SESS  = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/authSession.ts"), "utf8");

describe("PR-2 (#2163) — one catalog, both consumers re-export from it", () => {
  it("roleGuard.ts imports from roleModulesCatalog and derives its maps from it", () => {
    expect(ROLE_GUARD).toMatch(/from "\.\.\/lib\/rbac\/roleModulesCatalog\.js"/);
    expect(ROLE_GUARD).toMatch(/ROLE_LEVELS[\s\S]{0,200}Object\.fromEntries[\s\S]{0,200}ROLE_MODULE_DEFAULTS/);
    expect(ROLE_GUARD).toMatch(/ROLE_DEFAULT_MODULES[\s\S]{0,200}Object\.fromEntries[\s\S]{0,200}ROLE_MODULE_DEFAULTS/);
  });

  it("roleGuard.ts no longer hand-inlines the role tables (regression trap)", () => {
    // Strip comments so the explanatory block doesn't trip the trap.
    const code = ROLE_GUARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // No inline `hr_manager: 70` literal (the hand-copied form).
    expect(code).not.toMatch(/hr_manager:\s*70/);
    // No inline `general_manager:\s*\[\s*"home"` literal.
    expect(code).not.toMatch(/general_manager:\s*\["home"/);
  });

  it("permissions.ts re-exports PREDEFINED_ROLE_DEFAULTS from the catalog", () => {
    expect(PERMS).toMatch(/from "\.\.\/lib\/rbac\/roleModulesCatalog\.js"/);
    expect(PERMS).toMatch(/const PREDEFINED_ROLE_DEFAULTS\s*=\s*ROLE_MODULE_DEFAULTS/);
  });

  it("permissions.ts no longer hand-inlines the same map (regression trap)", () => {
    const code = PERMS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // The inline-object literal pattern is gone.
    expect(code).not.toMatch(/hr_manager:\s*\{\s*modules:/);
  });
});

describe("PR-2 (#2163) — every standard role in the catalog has a seed bundle", () => {
  // «منع إنشاء دور قياسي بلا grants» — #2163 §2 mandate. The catalog
  // and DEFAULT_ROLE_DEFS must agree on which roles exist; if a role
  // is in the catalog (so the static fallback names it) but missing
  // from autoMigrate's seed, a brand-new tenant would bootstrap that
  // role with zero grants (the FU-1 class of bug PR-9a closed).
  const seedRoleKeys = new Set(DEFAULT_ROLE_DEFS.map((d) => d.role));
  for (const roleKey of Object.keys(ROLE_MODULE_DEFAULTS)) {
    it(`role "${roleKey}" has a DEFAULT_ROLE_DEFS seed bundle`, () => {
      expect(seedRoleKeys.has(roleKey), `${roleKey} is in the static map but autoMigrate would seed it with NO grants`).toBe(true);
    });
  }
});

describe("PR-2 (#2163) — canonicalize() collapses the dual-vocabulary", () => {
  // Featurekey-first-segment names (what split_part in the SQL emits)
  // must map to the requireModule / nav vocabulary.
  const ALIASES: Array<[string, string]> = [
    ["dashboard",      "home"],
    ["properties",     "property"],
    ["projects",       "operations"],
    ["communications", "comms"],
    ["my-space",       "my_space"],
  ];
  for (const [from, to] of ALIASES) {
    it(`"${from}" → "${to}"`, () => {
      expect(canonicalize(from)).toBe(to);
    });
  }
  it("canonical names are pass-through (idempotent)", () => {
    for (const mod of CANONICAL_MODULES) {
      expect(canonicalize(mod)).toBe(mod);
    }
  });
  it("unknown names are pass-through (no silent rewrite)", () => {
    expect(canonicalize("totally-new-module")).toBe("totally-new-module");
  });
  it("canonicalizeModules dedups + canonicalises in one call", () => {
    const out = canonicalizeModules(["dashboard", "home", "properties", "property"]);
    expect(out.sort()).toEqual(["home", "property"]);
  });
});

describe("PR-2 (#2163) — requireModule canonicalises both sides before comparing", () => {
  it("the canonicalize() + canonicalizeModules() pair runs INSIDE requireModule's hasAccess check", () => {
    // Code-level pin: the check must canonicalize the user's modules
    // before .includes — otherwise a grant-emitted "dashboard" would
    // miss a requireModule("home") call.
    expect(ROLE_GUARD).toMatch(/canonicalizeModules\(modules\)/);
    expect(ROLE_GUARD).toMatch(/canonModules\.includes\(canonicalize\(m\)\)/);
  });
});

describe("PR-2 (#2163) — /auth/me + /permissions/my emit canonical names", () => {
  it("authSession.ts canonicalises userRoles[].modules", () => {
    expect(AUTH_SESS).toMatch(/canonicalizeModules\(/);
  });
  it("permissions.ts canonicalises the merged allModules", () => {
    expect(PERMS).toMatch(/canonicalizeModules\(\[\s*\.\.\.roles\.flatMap/);
  });
});

describe("PR-2 (#2163) — accessors agree with the underlying map", () => {
  it("getRoleModules('hr_manager') returns the same list as the map", () => {
    expect(getRoleModules("hr_manager")).toEqual(ROLE_MODULE_DEFAULTS.hr_manager.modules);
  });
  it("getRoleLevel('payroll_officer') === 50", () => {
    expect(getRoleLevel("payroll_officer")).toBe(50);
  });
  it("isKnownStandardRole gates on actual keys", () => {
    expect(isKnownStandardRole("hr_manager")).toBe(true);
    expect(isKnownStandardRole("totally-unknown")).toBe(false);
  });
});

describe("PR-2 (#2163) — CANONICAL_MODULES is a stable superset", () => {
  it("owner.modules ⊆ CANONICAL_MODULES (no role declares an alien module)", () => {
    const canon = new Set<string>(CANONICAL_MODULES);
    for (const [role, def] of Object.entries(ROLE_MODULE_DEFAULTS)) {
      for (const m of def.modules) {
        expect(canon.has(m), `role ${role} declares module "${m}" missing from CANONICAL_MODULES`).toBe(true);
      }
    }
  });
});
