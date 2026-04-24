import type { Request, Response, NextFunction } from "express";
import { rawQuery } from "../lib/rawdb.js";

type OwnershipCheck = "company" | "branch" | "self" | "assignment";

interface OwnershipOptions {
  table: string;
  idParam?: string;
  checks: OwnershipCheck[];
  companyColumn?: string;
  branchColumn?: string;
  userColumn?: string;
  assignmentColumn?: string;
  allowAdmin?: boolean;
}

/**
 * Middleware that verifies the authenticated user has contextual access to the
 * specific record identified by `req.params[idParam]`.
 *
 * Unlike `requirePermission` which checks static role+permission combos, this
 * middleware enforces ownership-style rules:
 *
 *   - **company** — record must belong to the user's active company.
 *   - **branch**  — record must belong to the user's active branch.
 *   - **self**    — record must have been created by the requesting user.
 *   - **assignment** — record must be linked to the user's active assignment.
 *
 * Checks run in the order specified; the first failing check short-circuits
 * with a 403 carrying an Arabic description and a `code: "OWNERSHIP_DENIED"`
 * so the frontend can distinguish ownership failures from permission failures.
 *
 * Usage example (protect a PATCH route):
 *
 * ```ts
 * router.patch(
 *   "/leave-requests/:id",
 *   requirePermission("hr:update"),
 *   requireOwnership({
 *     table: "hr_leave_requests",
 *     checks: ["company", "branch"],
 *   }),
 *   handler,
 * );
 * ```
 */
export function requireOwnership(options: OwnershipOptions) {
  const {
    table,
    idParam = "id",
    checks,
    companyColumn = '"companyId"',
    branchColumn = '"branchId"',
    userColumn = '"createdBy"',
    assignmentColumn = '"assignmentId"',
    allowAdmin = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING" });
      return;
    }

    // Owners and admins bypass ownership checks by default.
    if (allowAdmin && (scope.isOwner || scope.role === "owner" || scope.role === "admin")) {
      next();
      return;
    }

    const recordId = Number(req.params[idParam]);
    if (!recordId || isNaN(recordId)) {
      // No numeric id in the route — nothing to check, let downstream
      // handlers deal with the missing/invalid id.
      next();
      return;
    }

    try {
      // Build a minimal SELECT that only fetches the columns we actually need,
      // so the query works even when some columns don't exist on the target
      // table (e.g. not every table has an "assignmentId").
      const columns: string[] = [];
      if (checks.includes("company")) columns.push(`${companyColumn} AS "cid"`);
      if (checks.includes("branch")) columns.push(`${branchColumn} AS "bid"`);
      if (checks.includes("self")) columns.push(`${userColumn} AS "uid"`);
      if (checks.includes("assignment")) columns.push(`${assignmentColumn} AS "aid"`);

      if (columns.length === 0) {
        next();
        return;
      }

      const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
      const [record] = await rawQuery<any>(
        `SELECT ${columns.join(", ")}
         FROM "${safeTable}" WHERE id = $1 LIMIT 1`,
        [recordId]
      );

      if (!record) {
        // Record doesn't exist — let the downstream handler return 404.
        next();
        return;
      }

      for (const check of checks) {
        switch (check) {
          case "company":
            if (record.cid !== scope.companyId) {
              res.status(403).json({
                error: "لا يمكنك الوصول لسجلات شركة أخرى",
                code: "OWNERSHIP_DENIED",
                fix: "هذا السجل يتبع لشركة مختلفة",
              });
              return;
            }
            break;
          case "branch":
            if (record.bid && scope.branchId && record.bid !== scope.branchId) {
              res.status(403).json({
                error: "لا يمكنك الوصول لسجلات فرع آخر",
                code: "OWNERSHIP_DENIED",
                fix: "هذا السجل يتبع لفرع مختلف",
              });
              return;
            }
            break;
          case "self":
            if (record.uid && record.uid !== scope.userId) {
              res.status(403).json({
                error: "لا يمكنك تعديل سجلات مستخدم آخر",
                code: "OWNERSHIP_DENIED",
                fix: "يمكنك فقط تعديل سجلاتك الخاصة",
              });
              return;
            }
            break;
          case "assignment":
            if (record.aid && record.aid !== scope.activeAssignmentId) {
              res.status(403).json({
                error: "لا يمكنك الوصول لهذا السجل",
                code: "OWNERSHIP_DENIED",
                fix: "هذا السجل مرتبط بتعيين آخر",
              });
              return;
            }
            break;
        }
      }

      next();
    } catch (err) {
      console.error("[ContextualRBAC] Ownership check error:", err);
      // Fail open — if the ownership lookup itself errors (e.g. column
      // doesn't exist) we let downstream handlers proceed so we don't
      // accidentally lock users out of an endpoint. The error is logged
      // above for investigation.
      next();
    }
  };
}

/**
 * Programmatic (non-middleware) helper that checks whether a given `scope` is
 * allowed to perform `action` on a specific record.
 *
 * Useful inside route handlers where you need fine-grained branching rather
 * than a blanket 403:
 *
 * ```ts
 * const result = await canAct(scope, "delete", { table: "hr_leave_requests", id: requestId });
 * if (!result.allowed) {
 *   return res.status(403).json({ error: result.reason, code: "OWNERSHIP_DENIED" });
 * }
 * ```
 */
export async function canAct(
  scope: {
    companyId: number;
    branchId?: number | null;
    userId: number;
    activeAssignmentId?: number;
    isOwner?: boolean;
    role?: string;
  },
  action: string,
  resource: { table: string; id: number },
): Promise<{ allowed: boolean; reason?: string }> {
  if (scope.isOwner || scope.role === "owner" || scope.role === "admin") {
    return { allowed: true };
  }

  const safeTable = resource.table.replace(/[^a-zA-Z0-9_]/g, "");
  const [record] = await rawQuery<any>(
    `SELECT "companyId", "branchId", "createdBy" FROM "${safeTable}" WHERE id = $1 LIMIT 1`,
    [resource.id],
  );

  if (!record) return { allowed: false, reason: "السجل غير موجود" };
  if (record.companyId !== scope.companyId) return { allowed: false, reason: "شركة مختلفة" };

  // Destructive / approval actions additionally require branch match.
  const branchActions = ["delete", "approve", "reject"];
  if (
    branchActions.some((a) => action.includes(a)) &&
    record.branchId &&
    scope.branchId &&
    record.branchId !== scope.branchId
  ) {
    return { allowed: false, reason: "فرع مختلف" };
  }

  // "Own" actions require the record to have been created by the requesting user.
  const selfOnlyActions = ["edit_own", "delete_own", "cancel_own"];
  if (selfOnlyActions.some((a) => action.includes(a)) && record.createdBy !== scope.userId) {
    return { allowed: false, reason: "ليس سجلك" };
  }

  return { allowed: true };
}
