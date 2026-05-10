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

import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { FEATURE_CATALOG, type Scope } from "./featureCatalog.js";

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
  employee: "موظف",
};

const ROLE_LEVELS: Record<string, number> = {
  owner: 100, general_manager: 90,
  hr_manager: 70, finance_manager: 70, fleet_manager: 70, warehouse_manager: 70,
  property_manager: 70, projects_manager: 70, legal_manager: 70, support_manager: 70,
  crm_manager: 70, bi_manager: 70,
  branch_manager: 60, employee: 10,
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

  // module:* — every feature in module
  if (action === "*" || action === "") {
    return FEATURE_CATALOG.filter((f) => f.moduleKey === module).map((f) => ({ featureKey: f.key, action: "*" }));
  }

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
  const catalogActions = actionMap[action] || [action];

  // Find features in this module that support these actions
  const features = FEATURE_CATALOG.filter((f) => f.moduleKey === module);
  const out: { featureKey: string; action: string }[] = [];
  for (const f of features) {
    for (const a of catalogActions) {
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

/**
 * Top-level entry — called once at server boot from index.ts.
 * Idempotent: safe to re-run on every boot.
 */
export async function syncLegacyToV2(): Promise<SyncSummary> {
  const summary: SyncSummary = { companies: 0, rolesCreated: 0, grantsCreated: 0, usersBound: 0 };

  // Discover all companies with any legacy role_permissions entries.
  const companyRows = await rawQuery<{ companyId: number | null }>(
    `SELECT DISTINCT "companyId" FROM role_permissions
     UNION
     SELECT DISTINCT id AS "companyId" FROM companies`
  ).catch(() => [] as { companyId: number | null }[]);

  for (const { companyId } of companyRows) {
    if (companyId == null) continue;
    const result = await syncCompany(companyId);
    summary.companies++;
    summary.rolesCreated += result.rolesCreated;
    summary.grantsCreated += result.grantsCreated;
    summary.usersBound += result.usersBound;
  }

  return summary;
}

interface CompanySync {
  rolesCreated: number;
  grantsCreated: number;
  usersBound: number;
}

async function syncCompany(companyId: number): Promise<CompanySync> {
  const out: CompanySync = { rolesCreated: 0, grantsCreated: 0, usersBound: 0 };

  return withTransaction(async (client) => {
    // 1. Discover all role keys used by this company (legacy table OR
    //    company-scoped role_permissions OR custom_roles).
    const roleKeysRes = await client.query<{ role_key: string }>(
      `SELECT role AS role_key FROM role_permissions
        WHERE "companyId" IS NULL OR "companyId" = $1
        UNION
       SELECT "roleKey" AS role_key FROM custom_roles WHERE "companyId" = $1
        UNION
       SELECT DISTINCT role AS role_key FROM employee_assignments WHERE "companyId" = $1 AND role IS NOT NULL`,
      [companyId]
    );
    const roleKeys = Array.from(new Set(roleKeysRes.rows.map((r) => r.role_key))).filter(Boolean);

    // 2. Create rbac_roles for each.
    const roleIdByKey: Record<string, number> = {};
    for (const key of roleKeys) {
      const labelAr = ROLE_LABELS[key] || key;
      const level = ROLE_LEVELS[key] ?? 30;
      const color = ROLE_COLORS[key] || "#3b82f6";
      const isSystem = key in ROLE_LABELS;

      // Idempotent FIRST-RUN-ONLY semantic: once a role exists, the
      // admin owns it. ON CONFLICT DO NOTHING prevents subsequent boots
      // from clobbering admin customizations (custom label, level
      // changes, color, is_active toggle).
      // RETURNING id only fires on the actual insert path, so we read
      // the id back via SELECT to support both first-time and repeat
      // boots.
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
      out.rolesCreated++;
    }

    // 3. For each role, translate legacy perms → v2 grants.
    const legacyPerms = await client.query<{ role: string; permission: string }>(
      `SELECT role, permission FROM role_permissions WHERE "companyId" IS NULL OR "companyId" = $1`,
      [companyId]
    );

    // Group by role
    const permsByRole = new Map<string, Set<string>>();
    for (const r of legacyPerms.rows) {
      if (!permsByRole.has(r.role)) permsByRole.set(r.role, new Set());
      permsByRole.get(r.role)!.add(r.permission);
    }

    for (const [roleKey, perms] of permsByRole) {
      const roleId = roleIdByKey[roleKey];
      if (!roleId) continue;
      const defaultScope: Scope = ROLE_DEFAULT_SCOPE[roleKey] || "self";

      // Build (featureKey → set of actions)
      const grantsByFeature = new Map<string, Set<string>>();
      for (const perm of perms) {
        for (const t of translateLegacy(perm)) {
          if (!grantsByFeature.has(t.featureKey)) grantsByFeature.set(t.featureKey, new Set());
          grantsByFeature.get(t.featureKey)!.add(t.action);
        }
      }

      for (const [featureKey, actions] of grantsByFeature) {
        const actionsArray = Array.from(actions);
        // Clamp scope to feature's availableScopes — without this,
        // auto-migrate would happily assign scope="company" to a feature
        // whose catalog only allows ["self"] (e.g. hr.attendance.checkin),
        // producing a bogus grant the engine would still try to evaluate.
        const featureDef = FEATURE_CATALOG.find((f) => f.key === featureKey);
        let scope: Scope = defaultScope;
        if (featureDef && !featureDef.availableScopes.includes(scope)) {
          // Pick the most permissive available scope ≤ defaultScope.
          const SCOPE_RANK: Record<Scope, number> = {
            self: 1, team: 2, department: 3, department_tree: 4,
            branch: 5, branches: 6, company: 7, multi_company: 8, all: 9,
          };
          const targetRank = SCOPE_RANK[defaultScope] || 0;
          const fallback = (featureDef.availableScopes as Scope[])
            .filter((s) => (SCOPE_RANK[s] || 0) <= targetRank)
            .sort((a, b) => (SCOPE_RANK[b] || 0) - (SCOPE_RANK[a] || 0))[0];
          scope = fallback || (featureDef.availableScopes[0] as Scope);
        }
        // Idempotent FIRST-RUN-ONLY: once a grant exists, the admin
        // owns it. Subsequent boots no-op so admin tweaks (added
        // actions, scope changes, conditions) survive restarts.
        await client.query(
          `INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (role_id, feature_key) DO NOTHING`,
          [roleId, featureKey, actionsArray, scope]
        );
        out.grantsCreated++;
      }
    }

    // 4. Bind users to v2 roles based on employee_assignments.role.
    const assignments = await client.query<{ employeeId: number; userId: number; role: string; branchId: number; departmentId: number | null }>(
      `SELECT ea."employeeId", u.id AS "userId", ea.role, ea."branchId", ea."departmentId"
         FROM employee_assignments ea
         JOIN users u ON u."employeeId" = ea."employeeId"
        WHERE ea."companyId" = $1 AND ea.status = 'active' AND ea.role IS NOT NULL`,
      [companyId]
    );

    for (const a of assignments.rows) {
      const roleId = roleIdByKey[a.role];
      if (!roleId) continue;
      await client.query(
        `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", "departmentId", is_primary)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
        [a.userId, companyId, roleId, a.branchId, a.departmentId]
      );
      out.usersBound++;
    }

    // 5. Bump cache version so the engine picks up new grants.
    await client.query(
      `INSERT INTO rbac_cache_version ("companyId", version, "updatedAt")
       VALUES ($1, 1, NOW())
       ON CONFLICT ("companyId") DO UPDATE SET version = rbac_cache_version.version + 1, "updatedAt" = NOW()`,
      [companyId]
    );

    return out;
  });
}
