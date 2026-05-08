import type { Request, Response, NextFunction } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { logSecurityEvent } from "./permissionMiddleware.js";
import { logger } from "../lib/logger.js";

const roleModuleCache = new Map<string, { modules: string[]; roles: string[]; level: number; expiresAt: number }>();
const CACHE_TTL = 30_000;

const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  general_manager: 90,
  hr_manager: 70,
  finance_manager: 70,
  fleet_manager: 70,
  property_manager: 70,
  projects_manager: 70,
  warehouse_manager: 70,
  legal_manager: 70,
  support_manager: 70,
  crm_manager: 70,
  bi_manager: 70,
  branch_manager: 60,
  employee: 10,
};

const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
  owner: ["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","admin","comms","legal","crm","marketing","store","support","settings"],
  general_manager: ["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","comms","legal","crm","marketing","store","support","settings"],
  hr_manager: ["home","hr","requests","documents","comms"],
  finance_manager: ["home","finance","requests","documents","comms"],
  fleet_manager: ["home","fleet","requests","documents","comms"],
  property_manager: ["home","property","requests","documents","comms"],
  projects_manager: ["home","operations","requests","documents","comms"],
  warehouse_manager: ["home","warehouse","store","requests","documents","comms"],
  legal_manager: ["home","legal","governance","requests","documents","comms"],
  support_manager: ["home","support","requests","documents","comms"],
  crm_manager: ["home","crm","marketing","requests","documents","comms"],
  bi_manager: ["home","bi","reports","requests","documents","comms"],
  branch_manager: ["home","hr","finance","requests","documents","comms","support"],
  employee: ["home","requests","documents","comms"],
};

async function getUserModules(userId: number, fallbackRole?: string, companyId?: number): Promise<{ modules: string[]; roles: string[]; level: number }> {
  const cacheKey = `${userId}:${companyId ?? 0}`;
  const cached = roleModuleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const rows = await rawQuery<{ roleKey: string; modules: any; level: number }>(
    `SELECT "roleKey", modules, level FROM user_roles WHERE "userId" = $1 AND ("companyId" IS NULL OR "companyId" = $2)`,
    [userId, companyId ?? 0]
  );

  const allModules = new Set<string>();
  const roles: string[] = [];
  let maxLevel = 0;
  for (const row of rows) {
    roles.push(row.roleKey);
    let mods = typeof row.modules === "string" ? JSON.parse(row.modules) : row.modules;
    if (mods && typeof mods === "object" && !Array.isArray(mods) && (mods as any).all === true) {
      mods = ROLE_DEFAULT_MODULES[row.roleKey] || ROLE_DEFAULT_MODULES.owner;
    }
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

      const hasAccess = requiredModules.some(m => modules.includes(m));
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
