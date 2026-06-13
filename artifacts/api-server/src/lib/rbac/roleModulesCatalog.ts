/**
 * lib/rbac/roleModulesCatalog — single source of truth for the
 * «role → modules» fallback map AND the canonical module-name
 * vocabulary.
 *
 * WHY THIS FILE EXISTS — the PR-0 audit (#2166 §8) surfaced TWO
 * problems with a shared root:
 *
 *   1. The static fallback map was duplicated:
 *        • middlewares/roleGuard.ts → `ROLE_DEFAULT_MODULES`
 *          (consumed by requireModule() mount-gate)
 *        • routes/permissions.ts    → `PREDEFINED_ROLE_DEFAULTS`
 *          (consumed by /permissions/my when a user has no rbac
 *           grants)
 *      Both held the same data, by hand-copy. PR-9a added
 *      `department_manager` and `payroll_officer` to the first but
 *      not the second — the exact drift the audit predicted.
 *
 *   2. The vocabulary itself was forked. Static map / nav registry /
 *      requireModule() use one set (`home`, `property`, `operations`,
 *      `comms`). The dynamic projection at /auth/me + /permissions/my
 *      derives the module name from the first segment of the granted
 *      `feature_key`, which (in featureCatalog) is `dashboard`,
 *      `properties`, `projects`, `communications`. A user with rbac
 *      grants got the wrong module names in `apiData.modules`, so
 *      every nav item with `module: "home"` (and the four other
 *      forked names) was silently hidden — including
 *      «لوحة التحكم» on the home section.
 *
 * THE FIX:
 *   • One file holds the role→modules map; both old consumers
 *     re-export from here.
 *   • `canonicalize(rawModuleKey)` collapses the feature-key
 *     vocabulary onto the requireModule vocabulary. The dynamic
 *     projection canonicalises its output, and requireModule()
 *     canonicalises both its needle and the user's hay so a future
 *     stray name on either side still resolves.
 *
 * WHAT THIS FILE DOES NOT DO:
 *   • does not change RBAC engine semantics
 *   • does not touch authMiddleware
 *   • does not touch the sidebar render code
 *   • does not change any grant data
 */

// ── Canonical module names ──────────────────────────────────────────
// The full set of module names that the sidebar nav, the requireModule
// gate, and the projected `apiData.modules` array all agree on. Sorted
// alphabetically except for `home` first (the dashboard hub everyone
// shares). All standard-role fallback lists below use only these names.
export const CANONICAL_MODULES = [
  "home",
  "admin", "bi", "calendar", "comms", "crm", "documents",
  "finance", "fleet", "governance", "hr", "intelligence",
  "legal", "marketing", "my_space", "notifications", "operations",
  "property", "reports", "requests", "settings", "store", "support",
  "tasks", "umrah", "warehouse", "workspace",
] as const;

export type CanonicalModule = (typeof CANONICAL_MODULES)[number];

// ── Aliases: feature-key first-segment → canonical ─────────────────
// featureCatalog uses a different vocabulary for ~5 features. The
// dynamic projection at /auth/me derives module name from
// `split_part(feature_key, '.', 1)`, so it emits the feature-key form
// (left column below). The nav registry + requireModule still use the
// canonical form (right column). We collapse them here so the consumer
// can stay unaware.
const ALIASES: Record<string, CanonicalModule> = {
  dashboard:      "home",
  properties:     "property",
  projects:       "operations",
  communications: "comms",
  "my-space":     "my_space",
};

export function canonicalize(rawModuleKey: string): string {
  return ALIASES[rawModuleKey] ?? rawModuleKey;
}

export function canonicalizeModules(rawModules: readonly string[]): string[] {
  return Array.from(new Set(rawModules.map(canonicalize)));
}

// ── Static fallback per standard role ──────────────────────────────
// Used by:
//   • requireModule() when a user has NO rbac_user_roles entries
//     yet matches a known fallback role (mount-gate fallback)
//   • /permissions/my when the same condition holds (sidebar fallback)
//
// The runtime path is: derive modules from the user's actual rbac
// grants → fall back to this map only when there are none. Standard
// roles should always have rbac seed grants (autoMigrate.ts produces
// them), so in production this map is a safety net, not the primary
// source. The smoke pin in
// `platformWave2Pr2RoleModulesUnificationSmoke` asserts every role
// here has a `DEFAULT_ROLE_DEFS` entry — preventing the «role seeded
// with no grants» symptom #2163 §2 ruled out explicitly.
export interface RoleDefault {
  modules: string[];
  level: number;
}

const ALL_LESS_ADMIN = CANONICAL_MODULES.filter((m) => m !== "admin");
const BASE = ["home", "requests", "documents", "comms"];

export const ROLE_MODULE_DEFAULTS: Record<string, RoleDefault> = {
  owner:             { modules: [...CANONICAL_MODULES],     level: 100 },
  general_manager:   { modules: [...ALL_LESS_ADMIN],        level: 90 },
  hr_manager:        { modules: [...BASE, "hr"],            level: 70 },
  finance_manager:   { modules: [...BASE, "finance"],       level: 70 },
  fleet_manager:     { modules: [...BASE, "fleet"],         level: 70 },
  property_manager:  { modules: [...BASE, "property"],      level: 70 },
  projects_manager:  { modules: [...BASE, "operations"],    level: 70 },
  warehouse_manager: { modules: [...BASE, "warehouse", "store"], level: 70 },
  legal_manager:     { modules: [...BASE, "legal", "governance"], level: 70 },
  support_manager:   { modules: [...BASE, "support"],       level: 70 },
  crm_manager:       { modules: [...BASE, "crm", "marketing"], level: 70 },
  bi_manager:        { modules: [...BASE, "bi", "reports"], level: 70 },
  branch_manager:    { modules: [...BASE, "hr", "finance", "support"], level: 60 },
  // PR-9a (#2077) — both added to the map after the FU-1 closure.
  // requireModule consults this; without these entries the standard
  // roles' sidebar would light up but every module-gated mount 403s.
  department_manager:{ modules: [...BASE, "hr", "reports"], level: 50 },
  payroll_officer:   { modules: [...BASE, "hr"],            level: 50 },
  employee:          { modules: [...BASE],                  level: 10 },
};

// ── Convenience accessors (read-only) ─────────────────────────────
export function getRoleModules(roleKey: string): string[] {
  return ROLE_MODULE_DEFAULTS[roleKey]?.modules ?? [];
}

export function getRoleLevel(roleKey: string): number {
  return ROLE_MODULE_DEFAULTS[roleKey]?.level ?? 0;
}

export function isKnownStandardRole(roleKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_MODULE_DEFAULTS, roleKey);
}
