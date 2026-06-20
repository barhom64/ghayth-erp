import { rawQuery } from "./rawdb.js";

// policyEngine — سياسة RBAC وفصل المهام (SoD) وقواعد أعلى صلاحية. **ليست «سياسة عامة»**:
// لا علاقة لها بـrulesEngine (أتمتة بالأحداث) ولا attendancePolicyEngine (حضور HR).
// مفهوم حوكمة صلاحيات مستقل (قاموس المفاهيم §3: أسماء متشابهة ≠ تكرار).

// ─── Separation of Duties ─────────────────────────────────────────────────
// Defines role pairs that must NOT coexist on the same user.

export const SEPARATION_OF_DUTIES: Array<{ roleA: string; roleB: string; reason: string }> = [
  { roleA: "finance_manager", roleB: "warehouse_manager", reason: "الفصل بين المالية والمخزون — منع تعارض المصالح" },
  { roleA: "hr_manager", roleB: "finance_manager", reason: "الفصل بين الموارد البشرية والمالية — منع تلاعب الرواتب" },
  { roleA: "owner", roleB: "bi_manager", reason: "المالك لا يحتاج دور BI منفصل — wildcard كافي" },
];

/**
 * Request-time SoD enforcement (#1605). Given the roles a user ALREADY holds and
 * a role about to be granted, return the conflicting pair (or null). Pure +
 * synchronous so it can gate role-assignment routes before the write. This turns
 * the previously audit-only SoD definitions into an actual block at the source
 * (preventing a conflicting combination from ever being created), rather than
 * detecting it after the fact.
 */
export function findSeparationOfDutiesConflict(
  existingRoles: string[],
  newRole: string,
): { roleA: string; roleB: string; reason: string } | null {
  const have = new Set(existingRoles.filter(Boolean));
  for (const rule of SEPARATION_OF_DUTIES) {
    if (newRole === rule.roleA && have.has(rule.roleB)) return rule;
    if (newRole === rule.roleB && have.has(rule.roleA)) return rule;
  }
  return null;
}

/**
 * Returns every role key the user currently effectively holds in the given
 * company, across all three assignment tables (legacy `user_roles`, RBAC-v2
 * `rbac_user_roles`, and active `employee_assignments`). Used by SoD gates at
 * the two role-grant endpoints (`admin POST /user-roles` and
 * `rbac/v2 POST /users/:userId/roles`) so a v1-granted role can still block a
 * conflicting v2 grant — and vice versa.
 */
export async function getActiveRoleKeysForUser(
  userId: number,
  companyId: number,
): Promise<string[]> {
  const rows = await rawQuery<{ role: string | null }>(
    `SELECT r.role_key AS role FROM rbac_user_roles ur
       JOIN rbac_roles r ON r.id = ur.role_id
       WHERE ur."userId" = $1 AND ur."companyId" = $2
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
     UNION
     SELECT ea.role FROM employee_assignments ea
       JOIN users u ON u."employeeId" = ea."employeeId"
       WHERE u.id = $1 AND ea."companyId" = $2
         AND ea.status = 'active' AND ea.role IS NOT NULL`,
    [userId, companyId],
  );
  return rows.map((r) => r.role).filter((x): x is string => !!x);
}


// ─── Maximum Privilege Rules ──────────────────────────────────────────────
// Prevents over-privileged accounts.

export const MAX_PRIVILEGE_RULES: Array<{ role: string; maxPermissions: number; description: string }> = [
  { role: "employee", maxPermissions: 15, description: "الموظف العادي لا يحتاج أكثر من 15 صلاحية" },
  { role: "branch_manager", maxPermissions: 45, description: "مدير الفرع لا يحتاج أكثر من 45 صلاحية" },
];

// ─── Sensitive Operations ─────────────────────────────────────────────────
// Operations that require dual approval or elevated context.

export const SENSITIVE_OPERATIONS: Array<{
  permission: string;
  requiresDualApproval: boolean;
  auditLevel: "standard" | "enhanced" | "forensic";
  description: string;
}> = [
  { permission: "finance:delete", requiresDualApproval: true, auditLevel: "forensic", description: "حذف سجلات مالية" },
  { permission: "finance:approve", requiresDualApproval: false, auditLevel: "enhanced", description: "اعتماد فواتير وقيود" },
  { permission: "hr:delete", requiresDualApproval: true, auditLevel: "forensic", description: "حذف سجلات موظفين" },
  { permission: "admin:write", requiresDualApproval: false, auditLevel: "enhanced", description: "تعديل إعدادات النظام" },
  { permission: "permissions:write", requiresDualApproval: true, auditLevel: "forensic", description: "تعديل الصلاحيات" },
  { permission: "legal:delete", requiresDualApproval: true, auditLevel: "forensic", description: "حذف سجلات قانونية" },
];

// ─── Role Strategy ────────────────────────────────────────────────────────

export interface RoleStrategy {
  role: string;
  label: string;
  tier: "system" | "executive" | "manager" | "operational" | "self-service";
  canDelegate: boolean;
  maxBranches: number | null;
  description: string;
}

export const ROLE_STRATEGIES: RoleStrategy[] = [
  { role: "owner", label: "مالك النظام", tier: "system", canDelegate: true, maxBranches: null, description: "وصول كامل بدون قيود" },
  { role: "general_manager", label: "المدير العام", tier: "executive", canDelegate: true, maxBranches: null, description: "صلاحية كاملة مع مسؤولية التدقيق" },
  { role: "branch_manager", label: "مدير الفرع", tier: "manager", canDelegate: false, maxBranches: 3, description: "إدارة فرع محدد بصلاحيات متوسطة" },
  { role: "hr_manager", label: "مدير الموارد البشرية", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة شؤون الموظفين" },
  { role: "finance_manager", label: "المدير المالي", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة العمليات المالية والمحاسبية" },
  { role: "fleet_manager", label: "مدير الأسطول", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة المركبات والرحلات" },
  { role: "warehouse_manager", label: "مدير المستودعات", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة المخزون والحركات" },
  { role: "property_manager", label: "مدير العقارات", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة العقارات والإيجارات" },
  { role: "projects_manager", label: "مدير المشاريع", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة المشاريع والعمليات" },
  { role: "legal_manager", label: "المستشار القانوني", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة القضايا والعقود" },
  { role: "support_manager", label: "مدير الدعم", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة تذاكر الدعم الفني" },
  { role: "crm_manager", label: "مدير العلاقات", tier: "manager", canDelegate: false, maxBranches: null, description: "إدارة العملاء والفرص" },
  { role: "bi_manager", label: "محلل الأعمال", tier: "operational", canDelegate: false, maxBranches: null, description: "قراءة التقارير والتحليلات" },
  { role: "driver", label: "سائق", tier: "self-service", canDelegate: false, maxBranches: 1, description: "السائق: يرى رحلاته وبضائعه فقط، يحدّث حالته، يبدأ/يكمل/يسلّم من نفس واجهة الـERP بصلاحيات self-service" },
  { role: "employee", label: "موظف", tier: "self-service", canDelegate: false, maxBranches: 1, description: "خدمة ذاتية محدودة" },
];

// ─── Policy Violation Checks ──────────────────────────────────────────────

export interface PolicyViolation {
  type: "separation_of_duties" | "max_privilege" | "sensitive_unaudited" | "orphan_permission";
  severity: "critical" | "high" | "medium" | "low";
  userId?: number;
  role?: string;
  details: string;
}

export async function auditSeparationOfDuties(companyId: number): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  for (const rule of SEPARATION_OF_DUTIES) {
    const rows = await rawQuery<{ userId: number; email: string }>(
      `SELECT DISTINCT u.id AS "userId", u.email
       FROM users u
       JOIN employee_assignments ea ON ea."employeeId" = u."employeeId"
       WHERE u."employeeId" IS NOT NULL AND ea."companyId" = $1 AND ea.status = 'active'
         AND ea.role IN ($2, $3)
       GROUP BY u.id, u.email
       HAVING COUNT(DISTINCT ea.role) = 2`,
      [companyId, rule.roleA, rule.roleB]
    );
    for (const r of rows) {
      violations.push({
        type: "separation_of_duties",
        severity: "critical",
        userId: r.userId,
        details: `المستخدم ${r.email} يحمل الدورين ${rule.roleA} + ${rule.roleB} — ${rule.reason}`,
      });
    }
  }
  return violations;
}

export async function auditMaxPrivilege(companyId: number): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  // Was N+1: scalar COUNT subquery per active assignment over
  // role_permissions, keyed by ea.role. For 200 active assignments
  // that's 200 lookups against role_permissions per audit run. Single
  // CTE pre-aggregates the company's permission counts by role, so
  // the outer join is one scan per assignment regardless of size.
  const rows = await rawQuery<{ userId: number; email: string; role: string; permCount: number }>(
    `WITH role_perm_counts AS (
       SELECT r.role_key AS role, COUNT(*)::int AS c
         FROM rbac_roles r
         JOIN rbac_role_grants g ON g.role_id = r.id
        WHERE r."companyId" = $1
        GROUP BY r.role_key
     )
     SELECT u.id AS "userId", u.email, ea.role,
            COALESCE(rpc.c, 0) AS "permCount"
       FROM users u
       JOIN employee_assignments ea ON ea."employeeId" = u."employeeId"
       LEFT JOIN role_perm_counts rpc ON rpc.role = ea.role
      WHERE u."employeeId" IS NOT NULL AND ea."companyId" = $1 AND ea.status = 'active'`,
    [companyId]
  );
  for (const r of rows) {
    const rule = MAX_PRIVILEGE_RULES.find((mp) => mp.role === r.role);
    if (rule && r.permCount > rule.maxPermissions) {
      violations.push({
        type: "max_privilege",
        severity: "high",
        userId: r.userId,
        role: r.role,
        details: `${r.email} (${r.role}) لديه ${r.permCount} صلاحية — الحد الأقصى ${rule.maxPermissions}. ${rule.description}`,
      });
    }
  }
  return violations;
}

export async function runFullPolicyAudit(companyId: number): Promise<PolicyViolation[]> {
  const [sod, maxPriv] = await Promise.all([
    auditSeparationOfDuties(companyId),
    auditMaxPrivilege(companyId),
  ]);
  return [...sod, ...maxPriv];
}

export function getSensitiveOperation(permission: string) {
  return SENSITIVE_OPERATIONS.find((s) => s.permission === permission);
}

export function getRoleStrategy(role: string): RoleStrategy | undefined {
  return ROLE_STRATEGIES.find((s) => s.role === role);
}
