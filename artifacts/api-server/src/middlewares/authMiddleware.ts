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
    const scope = await buildScope(payload);
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

async function buildScope(payload: JWTPayload): Promise<RequestScope> {
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

  const allAssignments = await rawQuery<{ id: number; companyId: number; branchId: number | null }>(
    `SELECT id, "companyId", "branchId" FROM employee_assignments
     WHERE "employeeId" = $1 AND status = 'active'`,
    [assignment.employeeId]
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
    const companyBranches = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId" = ANY($1)`,
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

  return {
    userId: payload.userId,
    employeeId: assignment.employeeId,
    companyId: assignment.companyId,
    branchId: effectiveBranchId as number,
    activeAssignmentId,
    allowedCompanies,
    allowedBranches,
    allowedAssignments: allAssignments.map((a) => a.id),
    role: assignment.role,
    isOwner: assignment.role === "owner",
    jobTitle: assignment.jobTitle || null,
    jobTitleId: assignment.jobTitleId || null,
    userName: assignment.userName ?? "مستخدم",
  };
}
