import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JWTPayload } from "../lib/auth.js";
import { rawQuery } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { loadFineGrantKeys } from "../lib/rbac/authzEngine.js";

export interface RequestScope {
  userId: number;
  employeeId: number | null;
  companyId: number;
  branchId: number;
  activeAssignmentId: number;
  allowedCompanies: number[];
  allowedBranches: number[];
  allowedDepartments: number[];
  allowedAssignments: number[];
  role: string;
  isOwner: boolean;
  jobTitle: string | null;
  jobTitleId: number | null;
  userName: string;
  /**
   * The role key the user explicitly picked in the header dropdown
   * (تغيير الصفة), validated against their `user_roles` set. When set
   * and non-owner, it downgrades `role`/`isOwner` for this request so
   * the authzEngine narrows grants to just this role. `null` means the
   * picker is unset → full union of all assigned roles applies.
   */
  selectedRoleKey: string | null;
  /**
   * IGOC-001 (migration 284): the department the user's ACTIVE assignment
   * belongs to. The user may have assignments across multiple departments;
   * this is the one for the currently-selected (activeAssignmentId). NULL
   * when the active assignment isn't department-scoped (owner/GM).
   * Populated into audit_logs.active_department_id on every audited write.
   */
  activeDepartmentId: number | null;
  /**
   * IGOC-001 (migration 284): when a Super Admin (level ≥ 100) uses the
   * role-switcher to PREVIEW as another role, this is the REAL userId
   * behind the impersonated session. NULL when not impersonating (the
   * actor is operating as themselves). Populated into
   * audit_logs.impersonation_source_user.
   */
  impersonationSourceUser: number | null;
  /**
   * IGOC-001 (migration 284): the scope value the authzEngine resolved for
   * this specific call (self|team|department|department_tree|branch|
   * branches|company|multi_company|all). Set by authzEngine after grant
   * resolution; consumed by audit emit so audit_logs.resolved_scope tells
   * an auditor «which scope window this action ran under».
   * Mutable — set late in the request lifecycle by authorize().
   */
  resolvedScope?: string | null;
  /**
   * HR-REV-1 #1: the caller's effective RBAC v2 grants flattened to both
   * fine `feature:action` and coarse `module:action` keys, loaded once in
   * buildScope (reusing the authzEngine grant cache). Lets in-handler
   * authorization use scopeCan(scope, feature, action) instead of parallel
   * hardcoded role lists, so grants are the single source of truth.
   */
  fineGrants?: ReadonlySet<string>;
}

declare global {
  namespace Express {
    interface Request {
      scope?: RequestScope;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken: string | undefined = req.cookies?.erp_access;
  const authHeader = req.headers.authorization;
  const token = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);

  if (!token) {
    res.status(401).json({
      error: "غير مصرح: لا يوجد توكن",
      code: "AUTH_MISSING",
      fix: "يرجى تسجيل الدخول",
    });
    return;
  }

  try {
    const payload = verifyToken(token);
    // Header "تغيير الصفة" picker — when the user picks a role in the
    // header dropdown the client sends the chosen key as `x-selected-role`.
    // We validate it against the user's actually-assigned roles inside
    // buildScope and, when valid + non-owner, downgrade `scope.role` /
    // `scope.isOwner` for this request so the authzEngine narrows grants
    // to just this role. An unknown / unassigned key is ignored (no
    // privilege escalation, no lockout).
    const rawHeader = req.headers["x-selected-role"];
    const headerRole = typeof rawHeader === "string"
      ? rawHeader.trim()
      : Array.isArray(rawHeader)
      ? String(rawHeader[0] ?? "").trim()
      : "";
    const scope = await buildScope(payload, headerRole || null);
    req.scope = scope;
    next();
  } catch (err: any) {
    logger.error(err, "[AUTH] Token verification failed");
    const isExpired = /expired/i.test(String(err?.message ?? ""));
    res.status(401).json({
      error: isExpired ? "انتهت صلاحية الجلسة" : "توكن غير صالح",
      code: isExpired ? "AUTH_EXPIRED" : "AUTH_INVALID",
      fix: "يرجى تسجيل الدخول مجدداً",
    });
  }
}

async function buildScope(payload: JWTPayload, requestedRoleKey: string | null = null): Promise<RequestScope> {
  const activeAssignmentId = payload.assignmentId;

  const [assignment] = await rawQuery<{
    id: number; employeeId: number; companyId: number; branchId: number | null;
    departmentId: number | null;
    role: string; jobTitleId: number | null; jobTitle: string | null; userName: string;
  }>(
    `SELECT ea.id, ea."employeeId", ea."companyId", ea."branchId", ea."departmentId",
            ea.role, ea."jobTitleId", COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
            COALESCE(e.name, 'مستخدم') AS "userName"
     FROM employee_assignments ea
     JOIN users u ON u."employeeId" = ea."employeeId"
     LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
     LEFT JOIN employees e ON e.id = ea."employeeId"
     WHERE ea.id = $1 AND ea.status = 'active' AND u.id = $2 AND u."isActive" = true`,
    [activeAssignmentId, payload.userId]
  );

  if (!assignment) throw new Error("التعيين غير موجود أو غير نشط");

  // Pull assignments + join `branches` so we drop any whose branch has
  // been soft-disabled (status='inactive'). Without the join, a user
  // keeps "allowed" access to a branch the operator already turned off
  // via PR #513's soft-disable flow — buildScopedWhere would happily
  // emit `branchId = ANY(...)` with the disabled id, leaking reads and
  // letting writes land on it. employee_assignments.branchId is
  // nullable for owners/general_managers, so the OR clause keeps those
  // rows in.
  const allAssignments = await rawQuery<{ id: number; companyId: number; branchId: number | null; departmentId: number | null }>(
    `SELECT ea.id, ea."companyId", ea."branchId", ea."departmentId"
       FROM employee_assignments ea
       LEFT JOIN branches b ON b.id = ea."branchId"
      WHERE ea."employeeId" = $1
        AND ea.status = 'active'
        AND ea."companyId" = $2
        AND (ea."branchId" IS NULL OR COALESCE(b.status, 'active') = 'active')`,
    [assignment.employeeId, assignment.companyId]
  );

  const allowedCompanies = [...new Set(allAssignments.map((a) => a.companyId))];
  const allowedBranches = [
    ...new Set(
      allAssignments
        .map((a) => a.branchId)
        .filter((b): b is number => typeof b === "number"),
    ),
  ];
  // Department-level scoping (org-as-security-boundary, additive). Derived from
  // the same active assignments as branches; consumed only by routes that
  // opt in via buildScopedWhere({ enforceDepartmentScope: true }). Owners/GMs
  // are department-unbounded (empty set ⇒ no department predicate is emitted).
  const allowedDepartments = [
    ...new Set(
      allAssignments
        .map((a) => a.departmentId)
        .filter((d): d is number => typeof d === "number"),
    ),
  ];

  if (assignment.role === "owner" || assignment.role === "general_manager") {
    // Owner / general_manager are global within the companies they
    // actually have an owner/GM assignment in. Expand `allowedCompanies`
    // to every such company so the header branch picker works across
    // them (was the user-reported "فلتر الفروع لا يعمل"). Do NOT expand
    // to every company in the DB — that would break tenant isolation
    // for an owner of company A who has no entitlement on company B.
    const ownerAssignments = await rawQuery<{ companyId: number }>(
      `SELECT DISTINCT "companyId"
         FROM employee_assignments
        WHERE "employeeId" = $1
          AND status = 'active'
          AND role IN ('owner','general_manager')`,
      [assignment.employeeId]
    );
    for (const a of ownerAssignments) {
      if (!allowedCompanies.includes(a.companyId)) allowedCompanies.push(a.companyId);
    }
    // Same status filter for the company-wide expansion — owners must
    // not silently regain access to a disabled branch.
    const companyBranches = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId" = ANY($1) AND COALESCE(status, 'active') = 'active'`,
      [allowedCompanies]
    );
    for (const b of companyBranches) {
      if (!allowedBranches.includes(b.id)) allowedBranches.push(b.id);
    }
  }

  // CRITICAL: `employee_assignments.branchId` is nullable in the DB, and
  // owner / general_manager rows almost always have `branchId = NULL`
  // because they span all branches. The RequestScope type used to lie
  // that `branchId: number` which caused dozens of routes to pass `null`
  // into NOT NULL columns (journal_entries, fleet_vehicles, budgets, ...)
  // and crash with "null value in column branchId" at runtime.
  //
  // Fall back to the first allowed branch so every downstream route has
  // a valid branch id to attribute the action to. The frontend can still
  // override it per-request for company-wide operations.
  let effectiveBranchId: number | null = assignment.branchId ?? null;
  if (effectiveBranchId == null && allowedBranches.length > 0) {
    effectiveBranchId = allowedBranches[0];
  }
  if (effectiveBranchId == null) {
    const [anyBranch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId" = $1 AND status = 'active' ORDER BY id ASC LIMIT 1`,
      [assignment.companyId]
    );
    if (anyBranch?.id) {
      effectiveBranchId = anyBranch.id;
      if (!allowedBranches.includes(anyBranch.id)) {
        allowedBranches.push(anyBranch.id);
      }
    } else {
      effectiveBranchId = 0;
    }
  }

  // Validate the picked role against the user's actually-assigned RBAC v2 roles
  // (rbac_user_roles → rbac_roles) — the single roles system. Owner is always
  // included because `employee_assignments.role='owner'` is the implicit
  // top-level role even with no rbac_user_roles row. Unknown keys are dropped
  // silently so a tampered header can never grant a role the user doesn't have.
  let selectedRoleKey: string | null = null;
  let effectiveRole = assignment.role;
  let effectiveIsOwner = assignment.role === "owner";
  // IGOC-001 (migration 284): track impersonation. The actor's REAL
  // userId is `payload.userId` always; we only flag impersonation when
  // a Super Admin (level 100 / role=owner) downgrades into a different
  // role via the picker. That downgrade is the canonical "preview as"
  // mode the spec calls out. Persisting the source user gives the audit
  // trail an answer to "was this a real action or a preview?"
  let impersonationSourceUser: number | null = null;
  if (requestedRoleKey) {
    const ownedRoleRows = await rawQuery<{ roleKey: string }>(
      `SELECT r.role_key AS "roleKey"
         FROM rbac_user_roles ur JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [payload.userId, assignment.companyId]
    ).catch(() => [] as { roleKey: string }[]);
    const ownedKeys = new Set<string>(ownedRoleRows.map((r) => r.roleKey));
    if (assignment.role) ownedKeys.add(assignment.role);
    if (ownedKeys.has(requestedRoleKey)) {
      selectedRoleKey = requestedRoleKey;
      // Downgrade only — picking a non-owner role drops owner bypass for
      // this request. Picking "owner" leaves things as-is.
      if (requestedRoleKey !== "owner") {
        // If the actor WAS owner before the downgrade, this is a Super
        // Admin previewing as a lesser role. Audit it.
        if (assignment.role === "owner") {
          impersonationSourceUser = payload.userId;
        }
        effectiveRole = requestedRoleKey;
        effectiveIsOwner = false;
      }
    }
  }

  const scope: RequestScope = {
    userId: payload.userId,
    employeeId: assignment.employeeId,
    companyId: assignment.companyId,
    branchId: effectiveBranchId as number,
    activeAssignmentId,
    activeDepartmentId: assignment.departmentId ?? null,
    impersonationSourceUser,
    allowedCompanies,
    allowedBranches,
    allowedDepartments,
    allowedAssignments: allAssignments.map((a) => a.id),
    role: effectiveRole,
    isOwner: effectiveIsOwner,
    jobTitle: assignment.jobTitle || null,
    jobTitleId: assignment.jobTitleId || null,
    userName: assignment.userName ?? "مستخدم",
    selectedRoleKey,
  };
  // HR-REV-1 #1 — flatten the caller's grants onto the scope so handlers
  // authorize from grants (single source of truth) rather than hardcoded
  // role lists. loadFineGrantKeys never throws (degrades to empty set).
  scope.fineGrants = await loadFineGrantKeys(scope);
  return scope;
}
