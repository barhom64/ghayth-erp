import type { Request, Response, NextFunction } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { logSecurityEvent } from "./permissionMiddleware.js";
import { logger } from "../lib/logger.js";
import {
  ROLE_MODULE_DEFAULTS,
  canonicalize,
  canonicalizeModules,
} from "../lib/rbac/roleModulesCatalog.js";

const roleModuleCache = new Map<string, { modules: string[]; roles: string[]; level: number; expiresAt: number }>();
const CACHE_TTL = 30_000;

// PR-2 / #2163 — both lookup tables now live in lib/rbac/roleModulesCatalog.
// `ROLE_LEVELS` and `ROLE_DEFAULT_MODULES` used to be inlined here and
// hand-copied to `PREDEFINED_ROLE_DEFAULTS` in routes/permissions.ts; PR-0
// caught the inevitable drift (department_manager/payroll_officer made it
// here but not there). One source now feeds both consumers.
const ROLE_LEVELS: Record<string, number> = Object.fromEntries(
  Object.entries(ROLE_MODULE_DEFAULTS).map(([k, v]) => [k, v.level]),
);
const ROLE_DEFAULT_MODULES: Record<string, string[]> = Object.fromEntries(
  Object.entries(ROLE_MODULE_DEFAULTS).map(([k, v]) => [k, v.modules]),
);

// (ROLE_LEVELS + ROLE_DEFAULT_MODULES derived above from
// roleModulesCatalog — single source of truth per PR-2.)

async function getUserModules(userId: number, fallbackRole?: string, companyId?: number): Promise<{ modules: string[]; roles: string[]; level: number }> {
  const cacheKey = `${userId}:${companyId ?? 0}`;
  const cached = roleModuleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  // #1791 — legacy user_roles (with its per-user `modules` JSON) is removed.
  // Roles + levels now come from RBAC v2 (rbac_user_roles → rbac_roles); the
  // module set is derived from each role's default module map below.
  const rows = await rawQuery<{ roleKey: string; level: number }>(
    `SELECT r.role_key AS "roleKey", r.level AS level
       FROM rbac_user_roles ur
       JOIN rbac_roles r ON r.id = ur.role_id
      WHERE ur."userId" = $1 AND ur."companyId" = $2`,
    [userId, companyId ?? 0]
  );

  const allModules = new Set<string>();
  const roles: string[] = [];
  let maxLevel = 0;
  for (const row of rows) {
    roles.push(row.roleKey);
    const mods = ROLE_DEFAULT_MODULES[row.roleKey] || (row.roleKey === "owner" ? ROLE_DEFAULT_MODULES.owner : undefined);
    if (Array.isArray(mods)) mods.forEach((m: string) => allModules.add(m));
    if (row.level > maxLevel) maxLevel = row.level;
  }

  if (allModules.size === 0 && fallbackRole && ROLE_DEFAULT_MODULES[fallbackRole]) {
    ROLE_DEFAULT_MODULES[fallbackRole].forEach(m => allModules.add(m));
    if (!roles.includes(fallbackRole)) roles.push(fallbackRole);
    maxLevel = Math.max(maxLevel, ROLE_LEVELS[fallbackRole] ?? 0);
  }

  const result = { modules: [...allModules], roles, level: maxLevel, expiresAt: Date.now() + CACHE_TTL };
  roleModuleCache.set(cacheKey, result);
  return result;
}

export function requireModule(...requiredModules: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) { res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" }); return; }

    if (scope.isOwner || scope.role === "owner") { next(); return; }

    try {
      const { modules } = await getUserModules(scope.userId, scope.role, scope.companyId);

      if (modules.length === 0) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId,
          companyId: scope.companyId,
          role: scope.role,
          path: req.path,
          method: req.method,
          requiredPerms: requiredModules,
          reason: "module_access_denied_no_modules",
          ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        res.status(403).json({
          error: "لا تملك صلاحية الوصول لهذا القسم",
          code: "FORBIDDEN",
          fix: "اطلب من المسؤول منحك الوصول لهذا القسم",
          meta: { requiredModule: requiredModules, role: scope.role },
        });
        return;
      }

      // PR-2 / #2163 — canonicalize both sides so a dynamic projection
      // emitting feature-key vocab (e.g. "dashboard") matches a
      // requireModule call that uses the canonical vocab (e.g. "home").
      // Drops the silent 403 on roles whose modules come from grants.
      const canonModules = canonicalizeModules(modules);
      const hasAccess = requiredModules.some((m) => canonModules.includes(canonicalize(m)));
      if (!hasAccess) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId,
          companyId: scope.companyId,
          role: scope.role,
          path: req.path,
          method: req.method,
          requiredPerms: requiredModules,
          reason: "module_access_denied",
          ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        res.status(403).json({
          error: "لا تملك صلاحية الوصول لهذا القسم",
          code: "FORBIDDEN",
          fix: "اطلب من المسؤول منحك الوصول لهذا القسم",
          meta: { requiredModule: requiredModules, role: scope.role },
        });
        return;
      }
      next();
    } catch (err) {
      logger.error(err, "Role guard error:");
      res.status(500).json({ error: "خطأ في التحقق من الصلاحيات", code: "SERVER_ERROR" });
    }
  };
}

export function requireMinLevel(minLevel: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) { res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" }); return; }

    if (scope.isOwner || scope.role === "owner") { next(); return; }

    const assignmentLevel = ROLE_LEVELS[scope.role] ?? 0;
    if (assignmentLevel >= minLevel) { next(); return; }

    try {
      const { level } = await getUserModules(scope.userId, scope.role, scope.companyId);
      const effectiveLevel = Math.max(assignmentLevel, level);

      if (effectiveLevel < minLevel) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId,
          companyId: scope.companyId,
          role: scope.role,
          path: req.path,
          method: req.method,
          requiredPerms: [`min_level:${minLevel}`],
          reason: "insufficient_level",
          ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        res.status(403).json({
          error: "مستوى الصلاحيات غير كافٍ للوصول لهذا المورد",
          code: "FORBIDDEN",
          fix: "هذا الإجراء يتطلب دوراً بمستوى أعلى",
          meta: { requiredLevel: minLevel, currentLevel: effectiveLevel, role: scope.role },
        });
        return;
      }
      next();
    } catch (err) {
      logger.error(err, "Role guard error:");
      res.status(500).json({ error: "خطأ في التحقق من الصلاحيات", code: "SERVER_ERROR" });
    }
  };
}

export function requireRole(...requiredRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) { res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" }); return; }

    if (scope.isOwner || scope.role === "owner") { next(); return; }

    try {
      const { roles } = await getUserModules(scope.userId, scope.role, scope.companyId);

      const hasRole = requiredRoles.some(r =>
        roles.includes(r) || scope.role === r
      );

      if (!hasRole) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId,
          companyId: scope.companyId,
          role: scope.role,
          path: req.path,
          method: req.method,
          requiredPerms: requiredRoles,
          reason: "role_required",
          ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        res.status(403).json({
          error: "لا تملك الدور المطلوب لهذا الإجراء",
          code: "FORBIDDEN",
          fix: "هذا الإجراء مخصص لأدوار محددة",
          meta: { requiredRoles, role: scope.role },
        });
        return;
      }
      next();
    } catch (err) {
      logger.error(err, "Role guard error:");
      res.status(500).json({ error: "خطأ في التحقق من الصلاحيات", code: "SERVER_ERROR" });
    }
  };
}

export function invalidateRoleCache(userId?: number): void {
  if (userId) {
    for (const key of roleModuleCache.keys()) {
      if (key.startsWith(`${userId}:`)) roleModuleCache.delete(key);
    }
  } else {
    roleModuleCache.clear();
  }
}
