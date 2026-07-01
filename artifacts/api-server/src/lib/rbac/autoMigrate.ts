/**
 * autoMigrate — translates legacy flat permissions into the new layered
 * RBAC v2 model on first boot, then no-ops thereafter.
 *
 * Mapping rules:
 *   • Each legacy `<module>:<action>` permission becomes a v2 grant on
 *     the corresponding feature with `scope` derived from role level:
 *       - owner / general_manager → scope = "all" / "company"
 *       - branch_manager          → scope = "branch"
 *       - department/team manager → scope = "department"
 *       - employee                → scope = "self"
 *   • `module:*` permissions become wildcard feature grants.
 *   • Default scope is clamped to the catalog's availableScopes for
 *     each feature, so we never emit an invalid grant.
 *   • Self-service features (FEATURE_CATALOG[].selfService) are
 *     guaranteed for every employee role.
 *
 * IMPORTANT — first-run-only semantic:
 *   Both `rbac_roles` and `rbac_role_grants` upserts use
 *   `ON CONFLICT DO NOTHING` (since PR #230). Once a row exists, the
 *   admin owns it: subsequent boots do not overwrite custom labels,
 *   levels, scope changes, action additions, or conditions. New
 *   companies still get the full mapping on their first boot; new
 *   legacy permissions added later still get propagated as new rows
 *   (existing rows untouched).
 *
 *   If you ever need to force-resync legacy → v2 (e.g. after the
 *   default mapping changes), drop the per-role grants and reboot:
 *
 *     DELETE FROM rbac_role_grants WHERE role_id IN
 *       (SELECT id FROM rbac_roles WHERE "companyId" = $1 AND is_system);
 *
 *   Then auto-migrate fills them back in.
 */

import { rawQuery, withTransaction } from "../rawdb.js";
import { FEATURE_CATALOG, type Scope } from "./featureCatalog.js";
import type { PoolClient } from "pg";

const ROLE_DEFAULT_SCOPE: Record<string, Scope> = {
  owner: "all",
  general_manager: "company",
  hr_manager: "company",
  finance_manager: "company",
  fleet_manager: "company",
  warehouse_manager: "company",
  property_manager: "company",
  projects_manager: "company",
  legal_manager: "company",
  support_manager: "company",
  crm_manager: "company",
  bi_manager: "company",
  branch_manager: "branch",
  // PR-10 (#2077) — Closure Gate. Migration 291 closed FU-1 for
  // companies that existed at apply time; the bootstrap catalog must
  // know the two roles so a NEWLY-created company doesn't reproduce
  // the 0-modules symptom. Scopes match 291's per-feature scopes.
  department_manager: "department",
  payroll_officer: "company",
  driver: "self",
  employee: "self",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "المالك",
  general_manager: "المدير العام",
  hr_manager: "مدير الموارد البشرية",
  finance_manager: "المدير المالي",
  fleet_manager: "مدير الأسطول",
  warehouse_manager: "مدير المستودع",
  property_manager: "مدير العقارات",
  projects_manager: "مدير المشاريع",
  legal_manager: "المدير القانوني",
  support_manager: "مدير الدعم",
  crm_manager: "مدير علاقات العملاء",
  bi_manager: "مدير التحليلات",
  branch_manager: "مدير الفرع",
  department_manager: "مدير القسم",
  payroll_officer: "مسؤول الرواتب",
  driver: "سائق",
  employee: "موظف",
};

const ROLE_LEVELS: Record<string, number> = {
  owner: 100, general_manager: 90,
  hr_manager: 70, finance_manager: 70, fleet_manager: 70, warehouse_manager: 70,
  property_manager: 70, projects_manager: 70, legal_manager: 70, support_manager: 70,
  crm_manager: 70, bi_manager: 70,
  branch_manager: 60,
  department_manager: 50, payroll_officer: 50,
  driver: 10, employee: 10,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "#7c3aed",
  general_manager: "#2563eb",
  hr_manager: "#0891b2",
  finance_manager: "#059669",
  fleet_manager: "#dc2626",
  warehouse_manager: "#ea580c",
  property_manager: "#7c3aed",
  projects_manager: "#db2777",
  legal_manager: "#65a30d",
  support_manager: "#0284c7",
  crm_manager: "#9333ea",
  bi_manager: "#0d9488",
  branch_manager: "#475569",
  department_manager: "#0ea5e9",
  payroll_officer: "#10b981",
  driver: "#0d9488",
  employee: "#64748b",
};

/**
 * Translate a legacy permission like "hr:read" into a list of
 * (feature, action) pairs the v2 catalog understands. Wildcards explode
 * into every feature in the module.
 */
function translateLegacy(permission: string): { featureKey: string; action: string }[] {
  if (permission === "*") {
    return FEATURE_CATALOG.map((f) => ({ featureKey: f.key, action: "*" }));
  }
  const [module, ...rest] = permission.split(":");
  const action = rest.join(":");

  // Map legacy actions to catalog actions
  const actionMap: Record<string, string[]> = {
    read: ["view", "list"],
    write: ["create", "update"],
    create: ["create"],
    update: ["update"],
    delete: ["delete"],
    approve: ["approve"],
    self: ["view", "list", "create", "update"],
    download: ["export"],
  };

  // Feature-level key ("crm.clients:read") — the module part carries a dot →
  // grant on exactly that catalog feature, not a whole module. #2134: lets a
  // role default hold a narrow cross-module grant (finance_manager reading
  // the client master for invoicing) without inheriting the rest of CRM.
  if (module.includes(".")) {
    const feature = FEATURE_CATALOG.find((f) => f.key === module);
    if (!feature) return [];
    if (action === "*" || action === "") return [{ featureKey: feature.key, action: "*" }];
    return (actionMap[action] || [action])
      // as-any-reason: justified-pragmatic - same availableActions narrowing as the module loop below
      .filter((a) => feature.availableActions.includes(a as any))
      .map((a) => ({ featureKey: feature.key, action: a }));
  }

  // module:* — every feature in module
  if (action === "*" || action === "") {
    return FEATURE_CATALOG.filter((f) => f.moduleKey === module).map((f) => ({ featureKey: f.key, action: "*" }));
  }

  const catalogActions = actionMap[action] || [action];

  // Find features in this module that support these actions
  const features = FEATURE_CATALOG.filter((f) => f.moduleKey === module);
  const out: { featureKey: string; action: string }[] = [];
  for (const f of features) {
    for (const a of catalogActions) {
      // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
      if (f.availableActions.includes(a as any)) {
        out.push({ featureKey: f.key, action: a });
      }
    }
  }
  return out;
}

interface SyncSummary {
  companies: number;
  rolesCreated: number;
  grantsCreated: number;
  usersBound: number;
}

export interface RoleDef {
  role: string;
  permissions: string[];
}

/**
 * In-memory default role definitions (#1791). Formerly seeded into the legacy
 * `role_permissions` table by companyBootstrap and then translated to v2 by the
 * boot sync. Now they ARE the single source: seeded straight into rbac_roles +
 * rbac_role_grants. Kept in legacy "<module>:<action>" shorthand so the proven
 * translateLegacy() / scope-clamp mapping below still applies unchanged.
 */
export const DEFAULT_ROLE_DEFS: RoleDef[] = [
  { role: "owner", permissions: ["*"] },
  { role: "general_manager", permissions: ["dashboard:read", "employees:*", "finance:*", "hr:*", "fleet:*", "property:*", "warehouse:*", "store:*", "operations:*", "bi:*", "reports:*", "governance:*", "legal:*", "crm:*", "marketing:*", "support:*", "documents:*", "requests:*", "comms:*", "settings:read"] },
  { role: "hr_manager", permissions: ["dashboard:read", "employees:*", "hr:*", "attendance:*", "leaves:*", "payroll:*", "documents:read", "requests:*", "comms:read"] },
  // crm.clients read+create (#2134): the invoice/voucher forms read the client
  // master for their picker and quick-create a client inline — without this a
  // finance manager gets an EMPTY client field on the invoice and the billing
  // path dead-ends. Narrow feature-level grant; the rest of CRM stays closed.
  { role: "finance_manager", permissions: ["dashboard:read", "finance:*", "invoices:*", "expenses:*", "reports:read", "documents:read", "requests:*", "comms:read", "crm.clients:read", "crm.clients:create"] },
  { role: "fleet_manager", permissions: ["dashboard:read", "fleet:*", "documents:read", "requests:*", "comms:read"] },
  { role: "property_manager", permissions: ["dashboard:read", "property:*", "documents:read", "requests:*", "comms:read"] },
  { role: "projects_manager", permissions: ["dashboard:read", "operations:*", "documents:read", "requests:*", "comms:read"] },
  { role: "warehouse_manager", permissions: ["dashboard:read", "warehouse:*", "store:*", "documents:read", "requests:*", "comms:read"] },
  { role: "legal_manager", permissions: ["dashboard:read", "legal:*", "governance:*", "documents:read", "requests:*", "comms:read"] },
  { role: "support_manager", permissions: ["dashboard:read", "support:*", "documents:read", "requests:*", "comms:read"] },
  { role: "crm_manager", permissions: ["dashboard:read", "crm:*", "marketing:*", "documents:read", "requests:*", "comms:read"] },
  { role: "bi_manager", permissions: ["dashboard:read", "bi:*", "reports:*", "documents:read", "requests:*", "comms:read"] },
  { role: "branch_manager", permissions: ["dashboard:read", "employees:read", "attendance:*", "leaves:approve", "reports:read", "documents:read", "requests:*", "comms:read", "support:read"] },
  // PR-10 (#2077) — FU-1 closure for NEW companies. Migration 291
  // covered the live tenant; without these entries every newly
  // bootstrapped company would reproduce the 0-modules symptom for
  // the two roles. Bundles must equal what migration 291 produces so
  // bootstrap output matches the seed (verified by
  // hrStandardRoleGrantsBootstrapParitySmoke).
  //   department_manager (scope=department): hr employee/attendance/
  //     leaves/performance + reports; standard requests/documents/comms.
  //   payroll_officer    (scope=company)   : payroll preparation lane
  //     only — explicitly NO discipline, NO approve on runs («لا يعتمد
  //     بنفسه», migration 278). The exact-feature shorthand
  //     (translateLegacy dotted form) is required to express
  //     hr.payroll.* without leaking hr.discipline.
  { role: "department_manager", permissions: ["dashboard:read", "hr.employees:read", "hr.attendance:read", "hr.attendance:export", "hr.leaves:read", "hr.leaves:approve", "hr.leaves:reject", "hr.performance:read", "hr.performance:create", "hr.performance:update", "reports:read", "reports:export", "requests:*", "documents:read", "comms:read"] },
  { role: "payroll_officer",    permissions: ["dashboard:read", "hr.payroll:read", "hr.payroll:export", "hr.payroll.runs:read", "hr.payroll.runs:export", "hr.payroll.runs:create", "hr.payroll.runs:update", "hr.payroll.wps:read", "hr.payroll.wps:export", "hr.payroll.wps:create", "hr.payroll.wps:update", "hr.payroll.wps:submit", "hr.attendance:read", "hr.attendance:export", "requests:*", "documents:read", "comms:read"] },
  // Self-service driver — fleet.* read for the dispatcher-board feeds their
  // /me/driver consumes; the actual self-service capabilities come through the
  // featureCatalog selfService floor, not this seed.
  { role: "driver", permissions: ["dashboard:read", "profile:self", "attendance:self", "leaves:self", "fleet:read", "documents:read", "comms:read", "notifications:read"] },
  { role: "employee", permissions: ["dashboard:read", "attendance:self", "leaves:self", "profile:self", "requests:self", "documents:read", "comms:read"] },
];

const SCOPE_RANK: Record<Scope, number> = {
  self: 1, team: 2, department: 3, department_tree: 4,
  branch: 5, branches: 6, company: 7, multi_company: 8, all: 9,
};

/**
 * Seed rbac_roles + rbac_role_grants for one company from in-memory role
 * definitions. Idempotent FIRST-RUN-ONLY (ON CONFLICT DO NOTHING) so admin
 * customizations (labels, levels, scope/action tweaks) survive restarts.
 * Returns the resolved role_key → role_id map for caller binding.
 */
export async function seedRolesAndGrantsV2(
  client: PoolClient,
  companyId: number,
  roleDefs: RoleDef[] = DEFAULT_ROLE_DEFS,
): Promise<{ rolesCreated: number; grantsCreated: number; roleIdByKey: Record<string, number> }> {
  let rolesCreated = 0;
  let grantsCreated = 0;
  const roleIdByKey: Record<string, number> = {};

  for (const def of roleDefs) {
    const key = def.role;
    const labelAr = ROLE_LABELS[key] || key;
    const level = ROLE_LEVELS[key] ?? 30;
    const color = ROLE_COLORS[key] || "#3b82f6";
    const isSystem = key in ROLE_LABELS;

    await client.query(
      `INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, color, is_system)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("companyId", role_key) DO NOTHING`,
      [companyId, key, labelAr, level, color, isSystem]
    );
    const idRow = await client.query<{ id: number }>(
      `SELECT id FROM rbac_roles WHERE "companyId" = $1 AND role_key = $2`,
      [companyId, key]
    );
    if (!idRow.rows[0]) continue;
    const roleId = idRow.rows[0].id;
    roleIdByKey[key] = roleId;
    rolesCreated++;

    const defaultScope: Scope = ROLE_DEFAULT_SCOPE[key] || "self";
    const grantsByFeature = new Map<string, Set<string>>();
    for (const perm of def.permissions) {
      for (const t of translateLegacy(perm)) {
        if (!grantsByFeature.has(t.featureKey)) grantsByFeature.set(t.featureKey, new Set());
        grantsByFeature.get(t.featureKey)!.add(t.action);
      }
    }

    for (const [featureKey, actions] of grantsByFeature) {
      const actionsArray = Array.from(actions);
      // Clamp scope to the feature's availableScopes so we never emit a grant
      // for a scope the catalog doesn't allow (e.g. scope="company" on a
      // self-only feature like hr.attendance.checkin).
      const featureDef = FEATURE_CATALOG.find((f) => f.key === featureKey);
      let scope: Scope = defaultScope;
      if (featureDef && !featureDef.availableScopes.includes(scope)) {
        const targetRank = SCOPE_RANK[defaultScope] || 0;
        const fallback = (featureDef.availableScopes as Scope[])
          .filter((s) => (SCOPE_RANK[s] || 0) <= targetRank)
          .sort((a, b) => (SCOPE_RANK[b] || 0) - (SCOPE_RANK[a] || 0))[0];
        scope = fallback || (featureDef.availableScopes[0] as Scope);
      }
      await client.query(
        `INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (role_id, feature_key) DO NOTHING`,
        [roleId, featureKey, actionsArray, scope]
      );
      grantsCreated++;
    }
  }

  return { rolesCreated, grantsCreated, roleIdByKey };
}

/**
 * Bind active employee_assignments to their v2 role (rbac_user_roles). Resolves
 * role ids from the supplied map first, falling back to a per-key lookup for
 * assignment roles not present in the seeded defaults.
 */
export async function bindUsersFromAssignments(
  client: PoolClient,
  companyId: number,
  roleIdByKey: Record<string, number> = {},
): Promise<number> {
  let usersBound = 0;
  const localMap: Record<string, number> = { ...roleIdByKey };

  const assignments = await client.query<{ userId: number; role: string; branchId: number; departmentId: number | null }>(
    `SELECT u.id AS "userId", ea.role, ea."branchId", ea."departmentId"
       FROM employee_assignments ea
       JOIN users u ON u."employeeId" = ea."employeeId"
      WHERE ea."companyId" = $1 AND ea.status = 'active' AND ea.role IS NOT NULL`,
    [companyId]
  );

  for (const a of assignments.rows) {
    let roleId = localMap[a.role];
    if (!roleId) {
      const idRow = await client.query<{ id: number }>(
        `SELECT id FROM rbac_roles WHERE "companyId" = $1 AND role_key = $2`,
        [companyId, a.role]
      );
      if (!idRow.rows[0]) continue;
      roleId = idRow.rows[0].id;
      localMap[a.role] = roleId;
    }
    await client.query(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", "departmentId", is_primary)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
      [a.userId, companyId, roleId, a.branchId, a.departmentId]
    );
    usersBound++;
  }

  return usersBound;
}

/**
 * Safety-net backfill for the gap bindUsersFromAssignments leaves behind.
 *
 * That function only binds a user when their ACTIVE assignment has a
 * non-null `role`. A user created before role-tracking — or one whose
 * assignment.role is NULL while `users.role` is set — therefore ends up
 * with NO rbac_user_roles row. Since checkAccess is pure RBAC v2 with no
 * legacy fallback, such a user is locked out of every non-self-service
 * feature even though their legacy role says they're an hr_manager, etc.
 * ("الخدمات تظهر لكن لا تعمل" for existing/legacy accounts.)
 *
 * Here we bind any company-linked user who STILL has zero rbac_user_roles
 * rows to the v2 role matching their `users.role`, scoped to their primary
 * assignment's branch/department. The JOIN LATERAL also serves as the
 * company-scoping link (we only touch users with an assignment in this
 * company). Idempotent and additive-only: it never overrides an existing
 * assignment — `NOT EXISTS (rbac_user_roles)` + ON CONFLICT DO NOTHING.
 */
export async function bindUsersFromUserRole(
  client: PoolClient,
  companyId: number,
  roleIdByKey: Record<string, number> = {},
): Promise<number> {
  let usersBound = 0;
  const localMap: Record<string, number> = { ...roleIdByKey };

  const rows = await client.query<{ userId: number; role: string; branchId: number | null; departmentId: number | null }>(
    `SELECT u.id AS "userId", u.role, ea."branchId", ea."departmentId"
       FROM users u
       JOIN LATERAL (
         SELECT ea2."branchId", ea2."departmentId"
           FROM employee_assignments ea2
          WHERE ea2."employeeId" = u."employeeId" AND ea2."companyId" = $1
          ORDER BY ea2."isPrimary" DESC NULLS LAST, ea2.id
          LIMIT 1
       ) ea ON true
      WHERE u.role IS NOT NULL
        AND u."employeeId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM rbac_user_roles ur
           WHERE ur."userId" = u.id AND ur."companyId" = $1
        )`,
    [companyId]
  );

  for (const a of rows.rows) {
    let roleId = localMap[a.role];
    if (!roleId) {
      const idRow = await client.query<{ id: number }>(
        `SELECT id FROM rbac_roles WHERE role_key = $1 AND ("companyId" = $2 OR "companyId" IS NULL)
          ORDER BY "companyId" NULLS LAST LIMIT 1`,
        [a.role, companyId]
      );
      if (!idRow.rows[0]) continue;
      roleId = idRow.rows[0].id;
      localMap[a.role] = roleId;
    }
    await client.query(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", "departmentId", is_primary)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
      [a.userId, companyId, roleId, a.branchId, a.departmentId]
    );
    usersBound++;
  }

  return usersBound;
}
export async function syncLegacyToV2(): Promise<SyncSummary> {
  const summary: SyncSummary = { companies: 0, rolesCreated: 0, grantsCreated: 0, usersBound: 0 };

  const companyRows = await rawQuery<{ companyId: number | null }>(
    `SELECT id AS "companyId" FROM companies`
  ).catch(() => [] as { companyId: number | null }[]);

  for (const { companyId } of companyRows) {
    if (companyId == null) continue;
    const result = await withTransaction(async (client) => {
      const seeded = await seedRolesAndGrantsV2(client, companyId, DEFAULT_ROLE_DEFS);
      const usersBound = await bindUsersFromAssignments(client, companyId, seeded.roleIdByKey);
      // Safety net for legacy/existing users whose assignment.role is NULL but
      // who carry a users.role — without this they have zero rbac_user_roles
      // and are denied everything (checkAccess has no legacy fallback).
      const usersBoundByRole = await bindUsersFromUserRole(client, companyId, seeded.roleIdByKey);
      // Bump cache version so the engine picks up new grants.
      await client.query(
        `INSERT INTO rbac_cache_version ("companyId", version, "updatedAt")
         VALUES ($1, 1, NOW())
         ON CONFLICT ("companyId") DO UPDATE SET version = rbac_cache_version.version + 1, "updatedAt" = NOW()`,
        [companyId]
      );
      return { rolesCreated: seeded.rolesCreated, grantsCreated: seeded.grantsCreated, usersBound: usersBound + usersBoundByRole };
    });
    summary.companies++;
    summary.rolesCreated += result.rolesCreated;
    summary.grantsCreated += result.grantsCreated;
    summary.usersBound += result.usersBound;
  }

  return summary;
}

/**
 * Give every owner / general_manager user every ACTIVE, non-template role that
 * exists in each company where they hold an active assignment, so the topbar
 * role-switcher (الصفة) lists all roles and the admin can navigate "as" each
 * role to verify behaviour.
 *
 * Why this exists as boot-time code (not migration 141):
 *   Migration 141_admin_assign_all_rbac_roles.sql was meant to do this, but the
 *   migration runner records every file in `schema_migrations` and SKIPS
 *   already-applied ones — it does NOT replay 141 on each boot (its header
 *   comment is wrong). So 141 ran ONCE, early, when only the first company
 *   existed and before all roles/the admin were fully seeded, was recorded, and
 *   never ran again. Result: companies created later (and any role added after)
 *   never reached the admin → the dropdown only ever showed `owner`, and no
 *   amount of restarting fixed it ("re-cycle on every restart").
 *
 * This function reasserts the grant deterministically on EVERY boot, covering
 * all companies including newly-created ones. It is:
 *   - additive only (ON CONFLICT DO NOTHING),
 *   - is_primary=FALSE so it never displaces the user's primary role,
 *   - authorization-neutral (owner already bypasses checkAccess) — it only
 *     makes the roles selectable in the UI.
 * The cache version is bumped only when new rows were actually granted, so a
 * steady-state restart causes no needless cache churn.
 */
export async function ensureOwnersHaveAllRoles(): Promise<{ rolesGranted: number; companies: number }> {
  return withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", "departmentId", is_primary, "assignedBy", "createdAt")
       SELECT u.id, ea."companyId", r.id, ea."branchId", ea."departmentId", FALSE, u.id, NOW()
       FROM users u
       JOIN employee_assignments ea
         ON ea."employeeId" = u."employeeId"
        AND ea.status = 'active'
        AND ea.role IN ('owner', 'general_manager')
       JOIN rbac_roles r
         ON r."companyId" = ea."companyId"
        AND r.is_active = TRUE
        AND r.is_template = FALSE
       ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`
    );
    const rolesGranted = ins.rowCount ?? 0;
    let companies = 0;
    if (rolesGranted > 0) {
      const bumped = await client.query(
        `INSERT INTO rbac_cache_version ("companyId", version, "updatedAt")
         SELECT DISTINCT ea."companyId", 1, NOW()
         FROM users u
         JOIN employee_assignments ea
           ON ea."employeeId" = u."employeeId"
          AND ea.status = 'active'
          AND ea.role IN ('owner', 'general_manager')
         ON CONFLICT ("companyId") DO UPDATE SET
           version = rbac_cache_version.version + 1,
           "updatedAt" = NOW()`
      );
      companies = bumped.rowCount ?? 0;
    }
    return { rolesGranted, companies };
  });
}
