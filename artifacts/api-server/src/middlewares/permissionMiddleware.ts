import type { Request, Response, NextFunction } from "express";
import type { RequestScope } from "./authMiddleware.js";
import { rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { checkAccess } from "../lib/rbac/authzEngine.js";
import type { Action } from "../lib/rbac/featureCatalog.js";

// ─────────────────────────────────────────────────────────────────────────────
// permissionMiddleware — legacy flat gates (`requirePermission`/`requireAnyPermission`/
// `userHasPermission`) now resolve EXCLUSIVELY through RBAC v2 (authzEngine.checkAccess).
//
// The legacy `role_permissions` / `user_roles` / `permissions` tables are no
// longer an enforcement source — RBAC v2 is the single security authority for
// the whole system (#1413). These thin adapters keep the ~34 call sites working
// by translating each legacy `module:action` string to its RBAC feature.action
// via FLAT_TO_RBAC, so no per-route change was needed.
// ─────────────────────────────────────────────────────────────────────────────

// Every legacy flat permission still used by requirePermission/requireAnyPermission,
// mapped to its RBAC v2 feature + action. (Print/templates have no dedicated
// feature, so they gate on the documents/admin features they logically belong to.)
const FLAT_TO_RBAC: Record<string, { feature: string; action: Action }> = {
  "audit:read":             { feature: "admin.audit", action: "view" },
  "settings:read":          { feature: "settings",    action: "view" },
  "templates:read":         { feature: "admin",       action: "view" },
  "templates:write":        { feature: "admin",       action: "update" },
  "print:create":           { feature: "documents",   action: "create" },
  "print:download":         { feature: "documents",   action: "export" },
  "print:preview:create":   { feature: "documents",   action: "view" },
  "print:reprint:create":   { feature: "documents",   action: "create" },
  "print:reprint:approve":  { feature: "documents",   action: "approve" },
  "print:archive:delete":   { feature: "documents",   action: "delete" },
  "print:verify:read":      { feature: "documents",   action: "view" },
  "print:diagnostics:read": { feature: "admin",       action: "view" },
  "print_jobs:read":        { feature: "documents",   action: "list" },
};

// Resolve a legacy flat perm → RBAC spec. Falls back to a best-effort
// module→feature / action translation for any unmapped string.
function toRbacSpec(perm: string): { feature: string; action: Action } {
  const mapped = FLAT_TO_RBAC[perm];
  if (mapped) return mapped;
  logger.warn({ perm }, "[permissionMiddleware] unmapped legacy perm — best-effort RBAC translation");
  const parts = perm.split(":");
  const module = parts[0];
  const legacyAction = parts[parts.length - 1];
  const ACTION_MAP: Record<string, Action> = {
    read: "view", list: "list", write: "update", update: "update", create: "create",
    delete: "delete", approve: "approve", reject: "reject", export: "export", print: "print", download: "export",
  };
  return { feature: module, action: ACTION_MAP[legacyAction] ?? "view" };
}

async function allows(scope: RequestScope, perm: string): Promise<boolean> {
  const spec = toRbacSpec(perm);
  try {
    const res = await checkAccess(scope, { feature: spec.feature, action: spec.action });
    return res.allowed;
  } catch (e) {
    logger.error(e, "[permissionMiddleware] checkAccess failed");
    return false;
  }
}

async function logSecurityEvent(opts: {
  userId: number; companyId: number; role: string; path: string; method: string;
  requiredPerms: string[]; reason: string; ip?: string;
}): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO security_log ("userId","companyId",role,path,method,"requiredPerms",reason,ip,"createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [opts.userId, opts.companyId, opts.role, opts.path, opts.method,
       JSON.stringify(opts.requiredPerms), opts.reason, opts.ip || null]
    );
  } catch {
    // never block the request on logging failure
  }
}

/** ALL-of: the caller must satisfy every listed permission (via RBAC v2). */
export function requirePermission(...requiredPerms: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }
    if (scope.isOwner || scope.role === "owner") { next(); return; }

    try {
      const results = await Promise.all(requiredPerms.map((p) => allows(scope, p)));
      const missingPerms = requiredPerms.filter((_, i) => !results[i]);

      if (missingPerms.length > 0) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId, companyId: scope.companyId, role: scope.role,
          path: req.path, method: req.method, requiredPerms: missingPerms, reason: "permission_denied", ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        res.status(403).json({
          error: "لا تملك الصلاحية اللازمة",
          code: "FORBIDDEN",
          fix: "اطلب من المسؤول منحك هذه الصلاحية",
          meta: { requiredPermissions: missingPerms, role: scope.role },
        });
        return;
      }
      next();
    } catch (err) {
      logger.error(err, "Permission check error:");
      res.status(500).json({ error: "خطأ في التحقق من الصلاحيات", code: "SERVER_ERROR" });
    }
  };
}

/** ANY-of: the caller must satisfy at least one listed permission (via RBAC v2). */
export function requireAnyPermission(...candidatePerms: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }
    if (scope.isOwner || scope.role === "owner") { next(); return; }

    try {
      const results = await Promise.all(candidatePerms.map((p) => allows(scope, p)));
      if (!results.some(Boolean)) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId, companyId: scope.companyId, role: scope.role,
          path: req.path, method: req.method, requiredPerms: candidatePerms, reason: "permission_denied_any", ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        res.status(403).json({
          error: "لا تملك الصلاحية اللازمة",
          code: "FORBIDDEN",
          fix: "اطلب من المسؤول منحك إحدى هذه الصلاحيات",
          meta: { requiredAnyPermissions: candidatePerms, role: scope.role },
        });
        return;
      }
      next();
    } catch (err) {
      logger.error(err, "Permission check error:");
      res.status(500).json({ error: "خطأ في التحقق من الصلاحيات", code: "SERVER_ERROR" });
    }
  };
}

/**
 * Inline permission check (RBAC v2) for routes that combine permission state
 * with runtime conditions (e.g. "allow if user can hr.employees OR is the data
 * subject"). Callers pass req.scope.
 */
export async function userHasPermission(
  scope: { userId: number; companyId: number; role: string; isOwner?: boolean; branchId?: number | null; employeeId?: number | null; selectedRoleKey?: string | null },
  permission: string,
): Promise<boolean> {
  if (scope.isOwner || scope.role === "owner") return true;
  // Plain feature.action checks don't read the record-scope fields, so a
  // reduced scope (e.g. PrintScope) is sufficient for checkAccess.
  return allows(scope as unknown as RequestScope, permission);
}

/**
 * Retained for call-site compatibility. RBAC v2 manages its own cache
 * (rbac_cache_version, bumped on role mutations), so this is now a no-op —
 * the legacy role_permissions cache it used to clear no longer exists.
 */
export function invalidatePermissionCache(_role?: string, _companyId?: number, _branchId?: number | null): void {
  // intentionally empty — see doc comment.
}

export { logSecurityEvent };
