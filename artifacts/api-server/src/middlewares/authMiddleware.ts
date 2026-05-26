import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JWTPayload } from "../lib/auth.js";
import { rawQuery } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";

export interface RequestScope {
  userId: number;
  employeeId: number | null;
  companyId: number;
  branchId: number;
  activeAssignmentId: number;
  allowedCompanies: number[];
  allowedBranches: number[];
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
    role: string; jobTitleId: number | null; jobTitle: string | null; userName: string;
  }>(
    `SELECT ea.id, ea."employeeId", ea."companyId", ea."branchId", ea.role,
            ea."jobTitleId", COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
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
  const allAssignments = await rawQuery<{ id: number; companyId: number; branchId: number | null }>(
    `SELECT ea.id, ea."companyId", ea."branchId"
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

  if (assignment.role === "owner" || assignment.role === "general_manager") {
    // Owner / general_manager are global-scope by definition — they must
    // see (and be able to filter to) every company and branch, not just
    // the ones their single assignment row happens to point at. Without
    // this expansion, picking any non-default branch in the header
    // dropdown silently fell through `parseScopeFilters` (the requested
    // id wasn't in `allowedBranches`, so it was dropped), and the server
    // returned the user's default scope regardless of what they picked —
    // the user-reported "فلتر الفروع لا يعمل".
    const allCompanies = await rawQuery<{ id: number }>(
      `SELECT id FROM companies WHERE COALESCE(status, 'active') = 'active'`
    );
    for (const c of allCompanies) {
      if (!allowedCompanies.includes(c.id)) allowedCompanies.push(c.id);
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

  // Validate the picked role against the user's actually-assigned roles
  // in `user_roles` (the legacy table the header dropdown lists from).
  // Owner is always included because `employee_assignments.role='owner'`
  // is the implicit top-level role even when no `user_roles` row exists.
  // Unknown keys are dropped silently so a tampered header can never
  // grant a role the user doesn't have.
  let selectedRoleKey: string | null = null;
  let effectiveRole = assignment.role;
  let effectiveIsOwner = assignment.role === "owner";
  if (requestedRoleKey) {
    const ownedRoleRows = await rawQuery<{ roleKey: string }>(
      `SELECT "roleKey" FROM user_roles WHERE "userId" = $1 AND ("companyId" = $2 OR "companyId" IS NULL)`,
      [payload.userId, assignment.companyId]
    ).catch(() => [] as { roleKey: string }[]);
    const ownedKeys = new Set<string>(ownedRoleRows.map((r) => r.roleKey));
    if (assignment.role) ownedKeys.add(assignment.role);
    if (ownedKeys.has(requestedRoleKey)) {
      selectedRoleKey = requestedRoleKey;
      // Downgrade only — picking a non-owner role drops owner bypass for
      // this request. Picking "owner" leaves things as-is.
      if (requestedRoleKey !== "owner") {
        effectiveRole = requestedRoleKey;
        effectiveIsOwner = false;
      }
    }
  }

  return {
    userId: payload.userId,
    employeeId: assignment.employeeId,
    companyId: assignment.companyId,
    branchId: effectiveBranchId as number,
    activeAssignmentId,
    allowedCompanies,
    allowedBranches,
    allowedAssignments: allAssignments.map((a) => a.id),
    role: effectiveRole,
    isOwner: effectiveIsOwner,
    jobTitle: assignment.jobTitle || null,
    jobTitleId: assignment.jobTitleId || null,
    userName: assignment.userName ?? "مستخدم",
    selectedRoleKey,
  };
}
