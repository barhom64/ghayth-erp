/**
 * rbacService — central, reusable RBAC role-granting service.
 *
 * مسار الإدارة/RBAC هو المالك الوحيد لإسناد الأدوار الفعلي وفرض فصل المهام
 * (SoD). كانت ثلاث جهات تكرّر نفس منطق «أوجد الدور → افحص SoD → INSERT في
 * rbac_user_roles → أبطل الكاش» بـSQL مباشر (employees.ts Step 8a-bis،
 * admin.ts onboard، rbacV2 POST /users/:id/roles). هذه الخدمة توحّد ذلك
 * المنطق في دالة واحدة قابلة لإعادة الاستخدام دون نقل القرار خارج مسار RBAC:
 * أي مسار قائد (مثل الموارد البشرية) «يختار» الأدوار فقط، والإسناد الفعلي
 * وفحص SoD يبقيان هنا.
 *
 * Boundary note: this lives under lib/ (the shared RBAC primitive layer),
 * NOT under the HR route. HR calls it to grant a role the user picked; it
 * never lets HR define roles, define SoD rules, or bypass the SoD gate.
 *
 * Transaction-safe: rawQuery / rawExecute join the ambient transaction via
 * the AsyncLocalStorage executor binding in rawdb.ts, so when this is called
 * inside a route's withTransaction block the INSERT participates in the SAME
 * transaction (commit/rollback together). When called outside one, it runs
 * autocommitted — same as a direct rbacV2 grant.
 */

import { rawQuery, rawExecute } from "./rawdb.js";
import {
  findSeparationOfDutiesConflict,
  getActiveRoleKeysForUser,
} from "./policyEngine.js";
import { bumpCacheVersion } from "./rbac/authzEngine.js";
import { invalidateRoleCache } from "../middlewares/roleGuard.js";
import { logger } from "./logger.js";

export interface GrantUserRoleInput {
  userId: number;
  /** The role_key the operator selected (e.g. "hr_manager"). */
  roleKey: string;
  companyId: number;
  branchId?: number | null;
  departmentId?: number | null;
  /** Acting user id (rbac_user_roles.assignedBy / audit actor). */
  assignedBy: number;
  /** Mark this binding as the user's primary role. Defaults to false. */
  isPrimary?: boolean;
}

export type GrantUserRoleError =
  | "role_not_found"
  | "sod_conflict";

export interface GrantUserRoleResult {
  ok: boolean;
  roleId?: number;
  /** Machine-readable failure reason when ok=false. */
  error?: GrantUserRoleError;
  /** Arabic, user-facing reason when ok=false. */
  reasonAr?: string;
}

/**
 * Grants a single RBAC v2 role to a user, enforcing Separation of Duties
 * before the write.
 *
 *  1. Resolve role_key → rbac_roles row (per-company preferred, NULL-template
 *     fallback) within the user's company.
 *  2. Enforce SoD by reusing findSeparationOfDutiesConflict against the user's
 *     CURRENT effective roles (union of rbac_user_roles + active
 *     employee_assignments via getActiveRoleKeysForUser). A conflict ⇒ refuse
 *     (ok:false, error:"sod_conflict") — never insert.
 *  3. Idempotent INSERT into rbac_user_roles (ON CONFLICT DO NOTHING).
 *  4. Invalidate both permission caches (engine grant cache + roleGuard module
 *     cache) so the grant is effective immediately.
 *
 * Soft-fail by design: callers granting several roles in a loop treat a
 * non-ok result as "skip this one, warn, continue" rather than throwing, so
 * one rejected role never aborts the whole employee creation.
 */
export async function grantUserRole(
  input: GrantUserRoleInput,
): Promise<GrantUserRoleResult> {
  const {
    userId,
    roleKey,
    companyId,
    branchId = null,
    departmentId = null,
    assignedBy,
    isPrimary = false,
  } = input;

  // 1) Resolve the role within the company (per-company wins over NULL template).
  const roleRows = await rawQuery<{ id: number }>(
    `SELECT id FROM rbac_roles
      WHERE role_key = $1 AND ("companyId" = $2 OR "companyId" IS NULL)
      ORDER BY "companyId" NULLS LAST
      LIMIT 1`,
    [roleKey, companyId],
  );
  if (roleRows.length === 0) {
    return {
      ok: false,
      error: "role_not_found",
      reasonAr: `لا يوجد دور باسم "${roleKey}" في الشركة — لم يُسنَد، أسنِده يدويًا من الإدارة`,
    };
  }
  const roleId = roleRows[0]!.id;

  // 2) Separation of Duties — reuse the canonical request-time SoD gate so a
  //    role granted via ANY path (legacy assignment, v2 grant) still blocks a
  //    conflicting grant here, and vice versa. We do NOT redefine the rules.
  const existingRoles = await getActiveRoleKeysForUser(userId, companyId);
  const sodConflict = findSeparationOfDutiesConflict(existingRoles, roleKey);
  if (sodConflict) {
    return {
      ok: false,
      error: "sod_conflict",
      roleId,
      reasonAr: `فصل المهام (SoD): لا يمكن الجمع بين الدورين "${sodConflict.roleA}" و"${sodConflict.roleB}" لنفس المستخدم — ${sodConflict.reason}`,
    };
  }

  // 3) Idempotent bind. ON CONFLICT keeps re-granting an already-held role a
  //    no-op (no error), matching the existing Step 8a-bis / onboard behaviour.
  await rawExecute(
    `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId","departmentId",is_primary,"assignedBy","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT ("userId","companyId",role_id) DO NOTHING`,
    [userId, companyId, roleId, branchId, departmentId, isPrimary, assignedBy],
  );

  // 4) Drop stale caches so the grant is live on the user's very first request
  //    rather than after the TTL. Best-effort; a redundant bump is harmless.
  bumpCacheVersion(companyId).catch((e) =>
    logger.warn(e, "[rbacService] bumpCacheVersion after role bind failed"),
  );
  invalidateRoleCache(userId);

  return { ok: true, roleId };
}
