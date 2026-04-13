/**
 * rbacCatalog — single source of truth for every permission string the API
 * understands and for the default bindings to built-in roles.
 *
 * Before this file, permissions were discovered by grepping routes for
 * `requirePermission("...")` calls, and the role-permission seeds were
 * scattered across three migrations (026, 027, 066). That made it easy to
 * drift: an endpoint could require `documents:read` that no role was ever
 * granted, and a seed could grant a permission that no route ever checked.
 *
 * This module fixes both sides:
 *   - `PERMISSIONS` is the flat set of all valid permission strings. Use it
 *     for run-time validation and for the linter (`scripts/lintPermissions.mjs`).
 *   - `ROLE_PERMISSIONS` is the default role → permission map, consumed by
 *     migration `068_rbac_catalog_seed.sql` so role_permissions stays in sync.
 *   - `isKnownPermission(p)` is the tiny helper the middleware and linter use.
 *
 * Wildcards:
 *   - `"*"` — every permission (owner / GM)
 *   - `"<module>:*"` — every permission inside `<module>` (e.g. `hr:*`)
 *
 * Any new permission MUST be added here first; the linter will fail CI for
 * routes that reference an unknown permission.
 */

export const PERMISSIONS = [
  // Cross-cutting
  "*",
  "audit:read",
  "settings:read",
  "settings:write",
  "permissions:read",
  "permissions:write",

  // HR
  "hr:read",
  "hr:create",
  "hr:update",
  "hr:delete",
  "hr:approve",
  "hr:discipline:approve",
  // `hr:self` gates self-service endpoints (check-in/out, submit own leave).
  // Routes pair it with `hr:create` via requireAnyPermission so managers
  // retain access through their existing create grant, while employees are
  // unblocked through this narrower self-scoped permission. Role bindings
  // live in migration 070_rbac_self_service_and_gaps.sql (employee,
  // branch_manager, hr_manager) rather than ROLE_PERMISSIONS here, because
  // the catalog's role map encodes the conservative 068 seed intent.
  "hr:self",

  // Finance
  "finance:read",
  "finance:create",
  "finance:update",
  "finance:delete",

  // Fleet
  "fleet:read",
  "fleet:create",
  "fleet:update",
  "fleet:delete",

  // Warehouse
  "warehouse:read",
  "warehouse:create",
  "warehouse:update",
  "warehouse:delete",

  // Property / Ejar
  "property:read",
  "property:create",
  "property:update",
  "property:delete",

  // Projects + Operations
  "projects:read",
  "projects:create",
  "projects:update",
  "projects:delete",
  "operations:read",
  "operations:create",
  "operations:update",
  "operations:delete",

  // Legal
  "legal:read",
  "legal:create",
  "legal:update",
  "legal:delete",

  // Support / Tickets
  "support:read",
  "support:create",
  "support:update",
  "support:delete",

  // CRM / Clients
  "crm:read",
  "crm:create",
  "crm:update",
  "crm:delete",

  // Documents vault
  "documents:read",
  "documents:create",
  "documents:update",
  "documents:delete",
  "documents:download",

  // BI / reports
  "bi:read",
  "reports:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: Set<string> = new Set(PERMISSIONS);

/** Returns true when `perm` is a known permission string (wildcards included). */
export function isKnownPermission(perm: string): boolean {
  return PERMISSION_SET.has(perm);
}

/**
 * Default role → permission map. Migration 068 reseeds `role_permissions` from
 * this map; at run time the middleware still reads `role_permissions` so a
 * company can customise bindings at the row level.
 *
 * `"*"` grants every permission. `"<module>:*"` grants every permission inside
 * that module (the middleware resolves the wildcard, so this map can also
 * shorten the seed).
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ["*"],
  general_manager: ["*"],

  hr_manager: [
    "hr:read",
    "hr:create",
    "hr:update",
    "hr:delete",
    "hr:approve",
    "hr:discipline:approve",
    "documents:read",
    "documents:create",
    "documents:download",
  ],

  finance_manager: [
    "finance:read",
    "finance:create",
    "finance:update",
    "finance:delete",
    "documents:read",
    "documents:download",
  ],

  fleet_manager: [
    "fleet:read",
    "fleet:create",
    "fleet:update",
    "fleet:delete",
    "documents:read",
    "documents:download",
  ],

  warehouse_manager: [
    "warehouse:read",
    "warehouse:create",
    "warehouse:update",
    "warehouse:delete",
  ],

  property_manager: [
    "property:read",
    "property:create",
    "property:update",
    "property:delete",
    "documents:read",
    "documents:download",
  ],

  projects_manager: [
    "projects:read",
    "projects:create",
    "projects:update",
    "projects:delete",
    "operations:read",
    "operations:create",
    "operations:update",
    "operations:delete",
  ],

  legal_manager: [
    "legal:read",
    "legal:create",
    "legal:update",
    "legal:delete",
    "documents:read",
    "documents:create",
    "documents:update",
    "documents:delete",
    "documents:download",
  ],

  support_manager: [
    "support:read",
    "support:create",
    "support:update",
    "support:delete",
  ],

  crm_manager: [
    "crm:read",
    "crm:create",
    "crm:update",
    "crm:delete",
  ],

  bi_manager: [
    "bi:read",
    "reports:read",
    "audit:read",
  ],

  branch_manager: [
    "hr:read",
    "finance:read",
    "fleet:read",
    "warehouse:read",
    "property:read",
    "projects:read",
    "operations:read",
    "legal:read",
    "support:read",
    "crm:read",
    "documents:read",
    "documents:download",
    "reports:read",
  ],

  employee: ["hr:read"],
};

/** Returns the default permissions for a role, or an empty array if unknown. */
export function getRolePermissions(role: string): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
