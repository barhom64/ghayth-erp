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
  "admin:read",
  "admin:write",
  "notifications:read",
  "notifications:write",
  "communications:read",
  "communications:write",
  "requests:read",
  "requests:write",
  "governance:read",
  "governance:write",

  // HR
  "hr:read",
  "hr:create",
  "hr:update",
  "hr:write",
  "hr:delete",
  "hr:approve",
  "hr:self",
  "hr:discipline:read",
  "hr:discipline:create",
  "hr:discipline:update",
  "hr:discipline:approve",

  // Finance
  "finance:read",
  "finance:create",
  "finance:update",
  "finance:write",
  "finance:delete",
  "finance:approve",

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
  "tasks:read",
  "tasks:write",

  // Legal
  "legal:read",
  "legal:create",
  "legal:update",
  "legal:write",
  "legal:delete",

  // Support / Tickets
  "support:read",
  "support:create",
  "support:update",
  "support:write",
  "support:delete",

  // CRM / Clients
  "crm:read",
  "crm:create",
  "crm:update",
  "crm:write",
  "crm:delete",

  // Marketing
  "marketing:read",
  "marketing:create",
  "marketing:update",
  "marketing:delete",

  // Documents vault
  "documents:read",
  "documents:create",
  "documents:update",
  "documents:write",
  "documents:delete",
  "documents:download",

  // Store
  "store:read",
  "store:write",

  // Umrah
  "umrah:read",
  "umrah:write",

  // BI / reports
  "bi:read",
  "bi:write",
  "reports:read",
  "reports:write",
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
    "hr:read", "hr:create", "hr:update", "hr:delete", "hr:approve", "hr:self",
    "hr:discipline:read", "hr:discipline:create", "hr:discipline:update", "hr:discipline:approve",
    "documents:read", "documents:create", "documents:download",
    "operations:read",
    "tasks:read", "tasks:write",
  ],

  finance_manager: [
    "finance:read", "finance:create", "finance:update", "finance:delete", "finance:approve",
    "hr:read", "fleet:read", "projects:read", "property:read", "warehouse:read", "crm:read",
    "documents:read", "documents:download",
    "reports:read", "audit:read",
  ],

  fleet_manager: [
    "fleet:read", "fleet:create", "fleet:update", "fleet:delete",
    "documents:read", "documents:download",
  ],

  warehouse_manager: [
    "warehouse:read", "warehouse:create", "warehouse:update", "warehouse:delete",
  ],

  property_manager: [
    "property:read", "property:create", "property:update", "property:delete",
    "documents:read", "documents:download",
  ],

  projects_manager: [
    "projects:read", "projects:create", "projects:update", "projects:delete",
    "operations:read", "operations:create", "operations:update", "operations:delete",
  ],

  legal_manager: [
    "legal:read", "legal:create", "legal:update", "legal:write", "legal:delete",
    "documents:read", "documents:create", "documents:update", "documents:delete", "documents:download",
  ],

  support_manager: [
    "support:read", "support:create", "support:update", "support:delete",
    "hr:read", "operations:read",
  ],

  crm_manager: [
    "crm:read", "crm:create", "crm:update", "crm:delete",
    "operations:read",
    "tasks:write",
  ],

  bi_manager: [
    "bi:read", "bi:write",
    "reports:read", "reports:write", "audit:read",
  ],

  branch_manager: [
    "hr:read", "hr:create", "hr:update", "hr:approve", "hr:self",
    "finance:read", "finance:create", "finance:update", "finance:approve",
    "fleet:read", "fleet:create", "fleet:update", "fleet:delete",
    "warehouse:read", "warehouse:create", "warehouse:update",
    "property:read", "property:create", "property:update",
    "projects:read", "projects:create", "projects:update",
    "operations:read", "operations:create", "operations:update",
    "legal:read",
    "support:read", "support:create", "support:update",
    "crm:read", "crm:create", "crm:update",
    "documents:read", "documents:download",
    "tasks:read", "tasks:write",
    "reports:read", "audit:read",
  ],

  employee: [
    "hr:read", "hr:self",
    "operations:read", "operations:create", "operations:update",
    "documents:read", "documents:download",
    "notifications:read", "notifications:write",
    "support:read", "support:create",
    "tasks:read", "tasks:write",
  ],
};

/** Returns the default permissions for a role, or an empty array if unknown. */
export function getRolePermissions(role: string): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// ─── Role group constants ──────────────────────────────────────────────
// Centralised role groups used across route-level authorisation checks.
// Every route that gates on a role set MUST import from here instead of
// declaring its own inline constant.

export const ADMIN_ROLES: readonly string[] = ["owner", "admin", "general_manager"];
export const FINANCE_ROLES: readonly string[] = ["finance_manager", "general_manager", "owner"];
export const HR_ROLES: readonly string[] = ["hr_manager", "owner", "general_manager"];
export const MGR_ROLES: readonly string[] = ["branch_manager", "hr_manager", "owner", "general_manager"];
export const MANAGER_ROLES = MGR_ROLES;
export const EXEC_ROLES: readonly string[] = ["owner", "general_manager", "finance_manager", "director"];
export const APPROVE_ROLES = ADMIN_ROLES;
export const LEAVE_APPROVAL_ROLES: readonly string[] = ["branch_manager", "hr_manager", "owner"];
export const PAYROLL_ROLES: readonly string[] = ["hr_manager", "finance_manager", "general_manager", "owner"];
export const PR_APPROVAL_ROLES: readonly string[] = ["branch_manager", "general_manager", "owner"];
export const LETTER_APPROVAL_ROLES = MGR_ROLES;
export const HR_APPROVAL_ROLES = MGR_ROLES;
export const LOAN_APPROVAL_ROLES: readonly string[] = ["owner", "hr_manager", "general_manager", "branch_manager", "finance_manager"];
export const OWNER_GM_ROLES: readonly string[] = ["owner", "general_manager"];
export const BRANCH_GM_ROLES: readonly string[] = ["branch_manager", "general_manager"];
export const OPS_CLOSE_ROLES = LOAN_APPROVAL_ROLES;
export const APPROVAL_AUDIT_ROLES: readonly string[] = ["owner", "general_manager", "hr_manager", "finance_manager", "compliance", "audit"];
export const ACTION_CENTER_ROLES: readonly string[] = ["owner", "general_manager", "branch_manager", "hr_manager", "finance_manager", "supervisor"];
export const GOV_ADMIN_ROLES: readonly string[] = ["owner", "admin", "general_manager", "hr_manager", "operations"];
export const GOV_READ_ROLES: readonly string[] = [...GOV_ADMIN_ROLES, "finance_manager", "branch_manager", "supervisor"];
