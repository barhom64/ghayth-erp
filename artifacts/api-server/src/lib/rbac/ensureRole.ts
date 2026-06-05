// Lazy seeding of rbac_roles rows for a role_key. Solves the
// fresh-tenant problem: until autoMigrate.syncLegacyToV2() runs (which
// it does at server boot, but only if it discovers legacy
// role_permissions rows to migrate), a brand-new company has 0 rows in
// rbac_roles. The first employee added by HR would silently skip the
// rbac_user_roles binding (employees.ts logged a warn and continued),
// leaving the new user role-less and locked out of the system.
//
// This helper guarantees the rbac_roles row exists BEFORE we try to
// bind the user. If the lookup misses, we INSERT a sensible default
// (Arabic label + level + color, matching autoMigrate's seeded
// constants) so the binding can proceed atomically.
//
// Pass it the same client/transaction your employee POST is using —
// this way the role seed + the user binding are atomic, and rolling
// back the employee transaction cleanly rolls back the role too.

import type { PoolClient } from "pg";

// Extended from autoMigrate.ROLE_LABELS. The seed migration
// 249_seed_job_title_role_defaults.sql references several keys
// (driver, accountant, sales_rep, cashier) that the autoMigrate
// constants didn't cover. Centralising here so every call site
// gets the same Arabic labels.
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
  // Migration 249 additions — non-managerial roles that show up on
  // job_titles.defaultRoleKey but weren't in the original
  // managers-only template.
  driver: "سائق",
  accountant: "محاسب",
  sales_rep: "مندوب مبيعات",
  cashier: "أمين صندوق",
  warehouse_keeper: "أمين مستودع",
  supervisor: "مشرف",
  employee: "موظف",
};

const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  general_manager: 90,
  hr_manager: 70, finance_manager: 70, fleet_manager: 70, warehouse_manager: 70,
  property_manager: 70, projects_manager: 70, legal_manager: 70, support_manager: 70,
  crm_manager: 70, bi_manager: 70,
  branch_manager: 60,
  // Operational roles.
  supervisor: 40,
  accountant: 30, sales_rep: 30, cashier: 30, warehouse_keeper: 30,
  driver: 20, employee: 10,
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
  supervisor: "#4338ca",
  accountant: "#059669",
  sales_rep: "#0ea5e9",
  cashier: "#f59e0b",
  warehouse_keeper: "#ea580c",
  driver: "#dc2626",
  employee: "#64748b",
};

export function getRoleLabel(roleKey: string): string {
  return ROLE_LABELS[roleKey] || roleKey;
}

// Look up the rbac_roles row whose role_key matches. Prefers the
// company-scoped override (companyId = $2) over the system-wide
// template (companyId IS NULL). Returns null if neither exists.
async function findRbacRole(
  client: PoolClient,
  companyId: number,
  roleKey: string,
): Promise<number | null> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM rbac_roles
      WHERE role_key = $1
        AND ("companyId" IS NULL OR "companyId" = $2)
        AND is_active = true
      ORDER BY "companyId" NULLS LAST
      LIMIT 1`,
    [roleKey, companyId]
  );
  return rows[0]?.id ?? null;
}

// Ensure an rbac_roles row exists for (companyId, roleKey). Returns
// the role id ready to be referenced from rbac_user_roles.role_id.
//
// Order:
//   1. Find a matching row (company-scoped or system-wide).
//   2. If missing, INSERT a system-wide (companyId NULL) row with
//      Arabic label + level + color from the constants above. New
//      tenants get a populated rbac_roles table on first employee
//      creation; no admin intervention needed.
//   3. is_system=true marks it as engine-managed (the admin RBAC
//      editor protects these from accidental deletion).
//
// ON CONFLICT DO NOTHING covers the race where two concurrent
// employee POSTs try to seed the same role at the same time.
export async function ensureRbacRoleByKey(
  client: PoolClient,
  companyId: number,
  roleKey: string,
): Promise<number> {
  const existing = await findRbacRole(client, companyId, roleKey);
  if (existing) return existing;

  const labelAr = ROLE_LABELS[roleKey] || roleKey;
  const level = ROLE_LEVELS[roleKey] ?? 30;
  const color = ROLE_COLORS[roleKey] || "#3b82f6";
  const isSystem = roleKey in ROLE_LABELS;

  await client.query(
    `INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, color, is_system, is_active)
     VALUES (NULL, $1, $2, $3, $4, $5, true)
     ON CONFLICT DO NOTHING`,
    [roleKey, labelAr, level, color, isSystem]
  );

  const seeded = await findRbacRole(client, companyId, roleKey);
  if (!seeded) {
    // Extremely unlikely — the INSERT either created the row or
    // hit ON CONFLICT (meaning another transaction created it
    // concurrently). Re-query.
    throw new Error(`ensureRbacRoleByKey: failed to seed rbac_roles row for "${roleKey}"`);
  }
  return seeded;
}
