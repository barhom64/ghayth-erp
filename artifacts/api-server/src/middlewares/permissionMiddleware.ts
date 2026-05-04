import type { Request, Response, NextFunction } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";

interface UserPermissionOverrides {
  granted: Set<string>;
  revoked: Set<string>;
}

const permissionCache = new Map<string, { perms: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const PERMISSION_CACHE_MAX_SIZE = 10_000;

function evictPermissionCacheIfNeeded(): void {
  if (permissionCache.size <= PERMISSION_CACHE_MAX_SIZE) return;
  // Delete the oldest half (Map iterates in insertion order)
  const toDelete = Math.floor(permissionCache.size / 2);
  let deleted = 0;
  for (const key of permissionCache.keys()) {
    if (deleted >= toDelete) break;
    permissionCache.delete(key);
    deleted++;
  }
}

async function loadRolePermissions(role: string, companyId: number): Promise<Set<string>> {
  const cacheKey = `${role}:${companyId}`;
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.perms;

  const rows = await rawQuery<{ permission: string }>(
    `SELECT rp.permission FROM role_permissions rp
     WHERE rp.role = $1 AND (rp."companyId" IS NULL OR rp."companyId" = $2)`,
    [role, companyId]
  );

  const perms = new Set(rows.map((r) => r.permission));
  evictPermissionCacheIfNeeded();
  permissionCache.set(cacheKey, { perms, expiresAt: Date.now() + CACHE_TTL_MS });
  return perms;
}

async function loadUserPermissions(userId: number, companyId: number): Promise<UserPermissionOverrides> {
  const rows = await rawQuery<{ permission: string; type: string }>(
    `SELECT permission, type FROM permissions
     WHERE "userId" = $1 AND ("companyId" IS NULL OR "companyId" = $2)`,
    [userId, companyId]
  );

  const granted = new Set<string>();
  const revoked = new Set<string>();
  for (const r of rows) {
    if (r.type === "grant") granted.add(r.permission);
    else if (r.type === "revoke") revoked.add(r.permission);
  }
  return { granted, revoked };
}

async function logSecurityEvent(opts: {
  userId: number;
  companyId: number;
  role: string;
  path: string;
  method: string;
  requiredPerms: string[];
  reason: string;
  ip?: string;
}): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO security_log ("userId","companyId",role,path,method,"requiredPerms",reason,ip,"createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        opts.userId,
        opts.companyId,
        opts.role,
        opts.path,
        opts.method,
        JSON.stringify(opts.requiredPerms),
        opts.reason,
        opts.ip || null,
      ]
    );
  } catch {
    // do not block the request if logging fails
  }
}

async function loadAllUserRolePermissions(userId: number, primaryRole: string, companyId: number): Promise<Set<string>> {
  const userRoleRows = await rawQuery<{ roleKey: string }>(
    `SELECT "roleKey" FROM user_roles WHERE "userId" = $1 AND "companyId" = $2`,
    [userId, companyId]
  ).catch(() => [] as { roleKey: string }[]);

  const roleKeys = new Set<string>(userRoleRows.map((r) => r.roleKey));
  roleKeys.add(primaryRole);

  const allPerms = new Set<string>();
  await Promise.all(
    Array.from(roleKeys).map(async (role) => {
      const perms = await loadRolePermissions(role, companyId);
      for (const p of perms) allPerms.add(p);
    })
  );
  return allPerms;
}

export function requirePermission(...requiredPerms: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }

    if (scope.isOwner || scope.role === "owner") {
      next();
      return;
    }

    try {
      const rolePerms = await loadAllUserRolePermissions(scope.userId, scope.role, scope.companyId);
      const userOverrides = await loadUserPermissions(scope.userId, scope.companyId);

      const effectivePerms = new Set(rolePerms);
      for (const p of userOverrides.granted) effectivePerms.add(p);
      for (const p of userOverrides.revoked) effectivePerms.delete(p);

      const hasWildcard = effectivePerms.has("*");
      const missingPerms = requiredPerms.filter((perm) => {
        if (hasWildcard) return false;
        if (effectivePerms.has(perm)) return false;
        const [module] = perm.split(":");
        if (effectivePerms.has(`${module}:*`)) return false;
        return true;
      });

      if (missingPerms.length > 0) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId,
          companyId: scope.companyId,
          role: scope.role,
          path: req.path,
          method: req.method,
          requiredPerms: missingPerms,
          reason: "permission_denied",
          ip,
        }).catch((e) => logger.error(e, "[middleware] background task failed"));

        // Typed-error shape (P0.3) so the frontend's PageErrorBoundary and
        // useApiMutation toast pipeline can read the code + meta without
        // re-parsing the message. `meta.requiredPermissions` shows the user
        // exactly what they're missing so admins can grant it quickly.
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
      res.status(500).json({
        error: "خطأ في التحقق من الصلاحيات",
        code: "SERVER_ERROR",
      });
    }
  };
}

/**
 * Variant of `requirePermission` that passes when the user holds ANY of the
 * supplied permissions (OR semantics), versus `requirePermission` which
 * requires ALL of them (AND semantics). Useful for cross-role dashboards
 * where several roles should reach the same endpoint for different reasons.
 */
export function requireAnyPermission(...candidatePerms: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = req.scope;
    if (!scope) {
      res.status(401).json({ error: "غير مصرح", code: "AUTH_MISSING", fix: "يرجى تسجيل الدخول" });
      return;
    }

    if (scope.isOwner || scope.role === "owner") {
      next();
      return;
    }

    try {
      const rolePerms = await loadAllUserRolePermissions(scope.userId, scope.role, scope.companyId);
      const userOverrides = await loadUserPermissions(scope.userId, scope.companyId);

      const effectivePerms = new Set(rolePerms);
      for (const p of userOverrides.granted) effectivePerms.add(p);
      for (const p of userOverrides.revoked) effectivePerms.delete(p);

      const hasWildcard = effectivePerms.has("*");
      const hasAny = candidatePerms.some((perm) => {
        if (hasWildcard) return true;
        if (effectivePerms.has(perm)) return true;
        const [module] = perm.split(":");
        return effectivePerms.has(`${module}:*`);
      });

      if (!hasAny) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress;
        logSecurityEvent({
          userId: scope.userId,
          companyId: scope.companyId,
          role: scope.role,
          path: req.path,
          method: req.method,
          requiredPerms: candidatePerms,
          reason: "permission_denied_any",
          ip,
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
      res.status(500).json({
        error: "خطأ في التحقق من الصلاحيات",
        code: "SERVER_ERROR",
      });
    }
  };
}

export function invalidatePermissionCache(role?: string, companyId?: number): void {
  if (role && companyId) {
    permissionCache.delete(`${role}:${companyId}`);
  } else {
    permissionCache.clear();
  }
}

export { logSecurityEvent };
