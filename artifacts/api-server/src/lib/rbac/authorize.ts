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
import { forwardDenial } from "./siemForwarder.js";

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

    // Extract caller IP — used by the `ipPrefixIn` ABAC condition.
    // Order: x-forwarded-for first hop (proxy chain) → socket peer.
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const spec: AccessSpec = {
      feature: opts.feature,
      action: opts.action,
      ipAddress,
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
        if (record) {
          // Tenant isolation — a record belonging to another company is
          // treated as not-found here, so authorize({resource}) can never
          // become a cross-tenant IDOR. checkAccess short-circuits to
          // allowed for owners *before* per-record scope evaluation, so
          // this guard must live here and apply to owners too.
          const recCompany = (record as { companyId?: number | null }).companyId;
          if (recCompany != null && recCompany !== scope.companyId) {
            res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" });
            return;
          }
          spec.resource = { record };
        }
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
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
      // Audit denial — local DB log (source of truth).
      void rawExecute(
        `INSERT INTO security_log ("userId","companyId",role,path,method,"requiredPerms",reason,ip,"createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [
          scope.userId, scope.companyId, scope.role,
          req.path, req.method,
          JSON.stringify([`${opts.feature}:${opts.action}`]),
          result.code || "denied",
          ip,
        ]
      ).catch(() => undefined);
      // Mirror to external SIEM (Splunk/Sentinel/Datadog) when configured.
      // Fire-and-forget, never blocks the response.
      forwardDenial({
        userId: scope.userId,
        companyId: scope.companyId,
        role: scope.role,
        path: req.path,
        method: req.method,
        feature: opts.feature,
        action: opts.action,
        reason: result.code || "denied",
        ip,
        meta: { diagnostics: result.diagnostics },
      });

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
 * Sequentially try a list of authorize specs and let the request through
 * if ANY of them grants access. Used for endpoints that legitimately
 * belong to two domains (e.g. /settings/departments is reachable from
 * the SysAdmin "settings" feature AND the HR Director "hr.organization"
 * feature — both should be allowed to maintain the org structure).
 *
 * Semantics:
 *   - The first matching spec populates `req.access` (downstream handler
 *     still has field-policy + scope checks).
 *   - On no match, exactly ONE security_log denial is written (for the
 *     last spec attempted). We deliberately do NOT write per-spec
 *     denials — that would fire false "permission denied" SIEM alerts
 *     every time a user with role B hits an endpoint open to roles A+B.
 *   - On no match, the response is a 403 with the last spec's diagnostic.
 *
 * Implementation note: composes `checkAccess` directly, not `authorize()`.
 * Wrapping middlewares with a fake `res` would write a security_log
 * denial for every miss and double-count amount-limit enforcement.
 */
export function authorizeAny(...specs: AuthorizeOptions[]) {
  if (specs.length === 0) {
    throw new Error("authorizeAny requires at least one spec");
  }
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }

    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    let lastDeniedSpec: AuthorizeOptions | null = null;
    let lastDeniedResult: { code?: string; reasonAr?: string; diagnostics?: unknown } | null = null;

    for (const opts of specs) {
      const accessSpec: AccessSpec = {
        feature: opts.feature,
        action: opts.action,
        ipAddress,
      };

      // Resource lookup — short-circuits to 404 on cross-tenant access
      // (same guard authorize() applies). The 404 is a deliberate leak
      // boundary and is identical across all specs, so apply it ONCE
      // on the FIRST spec with a resource clause. Subsequent specs
      // reuse the same record.
      if (opts.resource?.table && opts.resource.idParam) {
        const recordId = Number(req.params[opts.resource.idParam]);
        if (recordId && !isNaN(recordId)) {
          const cols = opts.resource.columns?.join(", ") || `"companyId", "branchId", "departmentId", "createdBy", "employeeId", "managerId", "assigneeId"`;
          const safeTable = opts.resource.table.replace(/[^a-zA-Z0-9_]/g, "");
          const [record] = await rawQuery<ResourceRecord>(
            `SELECT ${cols} FROM "${safeTable}" WHERE id = $1 LIMIT 1`,
            [recordId]
          ).catch(() => [] as ResourceRecord[]);
          if (record) {
            const recCompany = (record as { companyId?: number | null }).companyId;
            if (recCompany != null && recCompany !== scope.companyId) {
              res.status(404).json({ error: "السجل غير موجود", code: "NOT_FOUND" });
              return;
            }
            accessSpec.resource = { record };
          }
        }
      }

      if (opts.amount) {
        let src: any;
        if (opts.amount.from === "resource") src = accessSpec.resource?.record;
        else if (opts.amount.from === "body") src = req.body;
        else if (opts.amount.from === "params") src = req.params;
        else src = req.query;
        const value = Number(src?.[opts.amount.field]);
        if (!isNaN(value)) accessSpec.amount = { value, currency: opts.amount.currency || "SAR" };
      }

      const result = await checkAccess(scope, accessSpec);
      if (result.allowed) {
        req.access = result;
        next();
        return;
      }
      lastDeniedSpec = opts;
      lastDeniedResult = result;
    }

    // All specs denied — write ONE audit row + return 403 with the last
    // spec's diagnostic. Forwarding to SIEM also happens once.
    const opts = lastDeniedSpec!;
    const result = lastDeniedResult!;
    void rawExecute(
      `INSERT INTO security_log ("userId","companyId",role,path,method,"requiredPerms",reason,ip,"createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        scope.userId, scope.companyId, scope.role,
        req.path, req.method,
        JSON.stringify(specs.map((s) => `${s.feature}:${s.action}`)),
        result.code || "denied",
        ipAddress,
      ]
    ).catch(() => undefined);
    forwardDenial({
      userId: scope.userId,
      companyId: scope.companyId,
      role: scope.role,
      path: req.path,
      method: req.method,
      feature: opts.feature,
      action: opts.action,
      reason: result.code || "denied",
      ip: ipAddress,
      meta: { diagnostics: result.diagnostics, triedSpecs: specs.length },
    });
    res.status(403).json({
      error: result.reasonAr || "لا تملك الصلاحية اللازمة",
      code: result.code || "FORBIDDEN",
      fix: result.diagnostics && (result.diagnostics as { requiredFix?: string }).requiredFix || "اطلب من المسؤول منحك هذه الصلاحية",
      meta: {
        feature: opts.feature,
        action: opts.action,
        triedFeatures: specs.map((s) => s.feature),
        diagnostics: result.diagnostics,
      },
    });
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
