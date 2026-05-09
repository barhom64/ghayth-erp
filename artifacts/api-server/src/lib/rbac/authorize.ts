/**
 * authorize() — the new standard middleware that every route should use.
 *
 * Replaces the flat `requirePermission("hr:read")` pattern with a
 * declarative spec covering all 5 layers in one call:
 *
 *     router.get("/payroll/payslips/:id",
 *       authMiddleware,
 *       authorize({
 *         feature: "hr.payroll.runs",
 *         action: "view",
 *         resource: { table: "payroll_runs", idParam: "id" },
 *       }),
 *       handler
 *     );
 *
 * On success, attaches the computed access context to the request:
 *   req.access = { fieldPolicy, scopeFilter, approvalLimit }
 *
 * Handlers can then:
 *   • use req.access.scopeFilter inside list queries
 *   • call applyFieldPolicy(response, req.access.fieldPolicy) before
 *     sending JSON to mask/hide sensitive fields automatically
 */

import type { Request, Response, NextFunction } from "express";
import { rawQuery, rawExecute } from "../rawdb.js";
import { checkAccess, applyFieldPolicy, type AccessResult, type AccessSpec, type ResourceRecord } from "./authzEngine.js";
import type { Action } from "./featureCatalog.js";

declare global {
  namespace Express {
    interface Request {
      access?: AccessResult;
    }
  }
}

export interface AuthorizeOptions {
  feature: string;
  action: Action;
  /**
   * Optional record lookup. When `table` and `idParam` are set, the
   * engine fetches the record and runs scope checks against its
   * companyId/branchId/departmentId/createdBy/employeeId/managerId.
   */
  resource?: {
    table?: string;
    idParam?: string;
    columns?: string[];
  };
  /**
   * For approve actions, where the amount lives. Used to enforce
   * `rbac_approval_limits.max_amount`.
   *
   * `from: "resource"` reads the amount from the loaded resource record
   * (the column named `field` must be in `resource.columns`). Use this
   * for amounts that live in the DB record (invoice.total) rather than
   * the request body.
   */
  amount?: { from: "body" | "params" | "query" | "resource"; field: string; currency?: string };
}

export function authorize(opts: AuthorizeOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }

    const spec: AccessSpec = {
      feature: opts.feature,
      action: opts.action,
    };

    // Resolve resource record (for scope checks).
    if (opts.resource?.table && opts.resource.idParam) {
      const recordId = Number(req.params[opts.resource.idParam]);
      if (recordId && !isNaN(recordId)) {
        const cols = opts.resource.columns?.join(", ") || `"companyId", "branchId", "departmentId", "createdBy", "employeeId", "managerId", "assigneeId"`;
        const safeTable = opts.resource.table.replace(/[^a-zA-Z0-9_]/g, "");
        const [record] = await rawQuery<ResourceRecord>(
          `SELECT ${cols} FROM "${safeTable}" WHERE id = $1 LIMIT 1`,
          [recordId]
        ).catch(() => [] as ResourceRecord[]);
        if (record) spec.resource = { record };
      }
    }

    // Resolve amount (for approve actions).
    if (opts.amount) {
      let src: any;
      if (opts.amount.from === "resource") {
        src = spec.resource?.record;
      } else if (opts.amount.from === "body") {
        src = req.body;
      } else if (opts.amount.from === "params") {
        src = req.params;
      } else {
        src = req.query;
      }
      const value = Number(src?.[opts.amount.field]);
      if (!isNaN(value)) {
        spec.amount = { value, currency: opts.amount.currency || "SAR" };
      }
    }

    const result = await checkAccess(scope, spec);

    if (!result.allowed) {
      // Audit denial (best-effort).
      void rawExecute(
        `INSERT INTO security_log ("userId","companyId",role,path,method,"requiredPerms",reason,ip,"createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [
          scope.userId, scope.companyId, scope.role,
          req.path, req.method,
          JSON.stringify([`${opts.feature}:${opts.action}`]),
          result.code || "denied",
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
        ]
      ).catch(() => undefined);

      res.status(403).json({
        error: result.reasonAr || "لا تملك الصلاحية اللازمة",
        code: result.code || "FORBIDDEN",
        fix: result.diagnostics?.requiredFix || "اطلب من المسؤول منحك هذه الصلاحية",
        meta: {
          feature: opts.feature,
          action: opts.action,
          diagnostics: result.diagnostics,
        },
      });
      return;
    }

    req.access = result;
    next();
  };
}

/**
 * Helper for handlers that build their response and want to apply the
 * field policy in one line:
 *
 *     return res.json(maskFields(req, payload));
 */
export function maskFields<T>(req: Request, payload: T): T {
  return applyFieldPolicy(payload, req.access?.fieldPolicy);
}
