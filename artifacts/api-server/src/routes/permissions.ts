import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { invalidatePermissionCache } from "../middlewares/permissionMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { projectGrantsToFlat } from "../lib/rbac/flatProjection.js";
import { auditLog } from "../lib/audit.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

interface RoleSummaryRow {
  roleKey: string;
  label: string;
  modules: unknown;
  level: number;
}

interface PermissionNameRow {
  permission: string;
}

interface UserPermissionRow {
  permission: string;
  type: "grant" | "revoke";
}

interface RolePermissionRow {
  id: number;
  role: string;
  permission: string;
  companyId: number | null;
  createdAt: string;
  updatedAt: string | null;
}

interface UserPermissionFullRow {
  id: number;
  userId: number;
  permission: string;
  type: "grant" | "revoke";
  companyId: number | null;
  grantedBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  userName: string | null;
}

interface UserIdRow {
  id: number;
}

const PERMISSION_PATTERN = /^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$/;

const rolePermissionSchema = z.object({
  role: z.string().min(1, "الدور مطلوب"),
  permission: z.string().min(1, "الصلاحية مطلوبة").regex(PERMISSION_PATTERN, "صيغة الصلاحية غير صالحة — يجب أن تكون module:action"),
});

const userPermissionCreateSchema = z.object({
  userId: z.coerce.number().int().positive("معرف المستخدم مطلوب"),
  permission: z.string().min(1, "الصلاحية مطلوبة").regex(PERMISSION_PATTERN, "صيغة الصلاحية غير صالحة — يجب أن تكون module:action"),
  type: z.enum(["grant", "revoke"]).optional(),
});

const userPermissionDeleteSchema = z.object({
  userId: z.coerce.number().int().positive("معرف المستخدم مطلوب"),
  permission: z.string().min(1, "الصلاحية مطلوبة"),
});

const PREDEFINED_ROLE_DEFAULTS: Record<string, { modules: string[]; level: number }> = {
  owner:            { modules: ["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","admin","comms","legal","crm","marketing","store","support","settings"], level: 100 },
  general_manager:  { modules: ["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","comms","legal","crm","marketing","store","support","settings"], level: 90 },
  hr_manager:       { modules: ["home","hr","requests","documents","comms"], level: 70 },
  finance_manager:  { modules: ["home","finance","requests","documents","comms"], level: 70 },
  fleet_manager:    { modules: ["home","fleet","requests","documents","comms"], level: 70 },
  property_manager: { modules: ["home","property","requests","documents","comms"], level: 70 },
  projects_manager: { modules: ["home","operations","requests","documents","comms"], level: 70 },
  warehouse_manager:{ modules: ["home","warehouse","store","requests","documents","comms"], level: 70 },
  legal_manager:    { modules: ["home","legal","governance","requests","documents","comms"], level: 70 },
  support_manager:  { modules: ["home","support","requests","documents","comms"], level: 70 },
  crm_manager:      { modules: ["home","crm","marketing","requests","documents","comms"], level: 70 },
  bi_manager:       { modules: ["home","bi","reports","requests","documents","comms"], level: 70 },
  branch_manager:   { modules: ["home","hr","finance","requests","documents","comms","support"], level: 60 },
  employee:         { modules: ["home","requests","documents","comms"], level: 10 },
};

function parseModules(raw: unknown, roleKey?: string): string[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as any).all === true) {
    const predefined = PREDEFINED_ROLE_DEFAULTS[roleKey || "owner"];
    return predefined ? predefined.modules : PREDEFINED_ROLE_DEFAULTS.owner.modules;
  }
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.all === true) {
        const predefined = PREDEFINED_ROLE_DEFAULTS[roleKey || "owner"];
        return predefined ? predefined.modules : PREDEFINED_ROLE_DEFAULTS.owner.modules;
      }
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) { logger.warn(e, "failed to parse permission modules JSON"); return []; }
  }
  return [];
}

// `/my` returns the caller's own effective permission set — this is a
// self-introspection endpoint that every authenticated user must be
// able to call regardless of role. Gating it on `admin:list` broke the
// header role picker: switching to a non-admin role made this endpoint
// 403, the frontend `apiData` never refreshed, and the UI got stuck.
// authMiddleware already guarantees the caller is authenticated, and
// the response is scoped to `scope.userId` / `scope.companyId`.
router.get("/my", async (req, res) => {
  try {
    const scope = req.scope!;
    const roleRows = await rawQuery<RoleSummaryRow>(
      `SELECT "roleKey", label, modules, level FROM user_roles WHERE "userId" = $1 AND ("companyId" = $2 OR "companyId" IS NULL) ORDER BY level DESC`,
      [scope.userId, scope.companyId]
    );

    // Header "تغيير الصفة" picker — when the user picks a single role from
    // their assigned set, scope this endpoint to that role's modules and
    // permissions only. Without this, the union of every assigned role was
    // returned and the sidebar never reflected the picker ("فلتر الدور لا
    // يعمل"). The picker may only narrow to a role the user actually owns;
    // an unknown / unassigned key falls back to the full union so we don't
    // accidentally lock the user out.
    // Prefer the scope's already-validated selectedRoleKey (set from the
    // `x-selected-role` header by authMiddleware) — that's gone through
    // the canonical validation against user_roles. Fall back to the
    // query param for older callers.
    const requestedRole = scope.selectedRoleKey
      ?? (typeof req.query.role === "string" && req.query.role.trim()
        ? req.query.role.trim()
        : null);

    let roles: RoleSummaryRow[];
    if (roleRows.length > 0) {
      roles = roleRows;
      if (requestedRole) {
        const picked = roleRows.filter((r) => r.roleKey === requestedRole);
        if (picked.length > 0) roles = picked;
      }
    } else {
      const roleKey = scope.role || "employee";
      const customRow = await rawQuery<RoleSummaryRow>(
        `SELECT "roleKey", label, modules, level FROM custom_roles WHERE "roleKey"=$1 AND "companyId"=$2 LIMIT 1`,
        [roleKey, scope.companyId]
      ).catch((e) => { logger.error(e, "permissions query failed"); return [] as RoleSummaryRow[]; });
      if (customRow.length > 0) {
        roles = customRow;
      } else {
        const predefined = PREDEFINED_ROLE_DEFAULTS[roleKey];
        roles = [{
          roleKey,
          label: roleKey,
          modules: predefined ? predefined.modules : ["home"],
          level: predefined ? predefined.level : 10,
        }];
      }
    }

    const highestLevel = Math.max(...roles.map((r) => Number(r.level) || 0));
    const allModules = Array.from(new Set(roles.flatMap((r) => parseModules(r.modules, r.roleKey))));

    const permRows = await rawQuery<PermissionNameRow>(
      `SELECT permission FROM role_permissions
       WHERE role = ANY($1::text[]) AND ("companyId" IS NULL OR "companyId" = $2)`,
      [roles.map((r) => r.roleKey), scope.companyId]
    );
    const rolePerms = permRows.map((p) => p.permission);

    const userPermRows = await rawQuery<UserPermissionRow>(
      `SELECT permission, type FROM permissions WHERE "userId" = $1 AND ("companyId" IS NULL OR "companyId" = $2)`,
      [scope.userId, scope.companyId]
    ).catch((e) => { logger.error(e, "permissions query failed"); return [] as UserPermissionRow[]; });
    const grants = userPermRows.filter((p) => p.type === "grant").map((p) => p.permission);
    const revokes = new Set(userPermRows.filter((p) => p.type === "revoke").map((p) => p.permission));

    // ── Unified authorization bridge (Ghaith Operating Foundation, #1413) ──
    // The backend ENFORCES with RBAC v2 (rbac_role_grants, feature.action) but
    // the frontend `can()` historically reads only the legacy flat set
    // (role_permissions, module:action) — two parallel sources of truth, the
    // root of "weak / inflexible roles". Here we project the caller's RBAC v2
    // grants into the flat vocabulary and UNION them in, so editing a role in
    // the RBAC v2 editor now also drives which buttons appear. Strictly
    // additive: it can only widen UI visibility to match what the backend
    // already allows (never hides a currently-shown action), and any failure
    // degrades silently to the legacy set — /permissions/my is load-bearing
    // for the whole UI, so it must never throw here.
    let rbacProjected: string[] = [];
    try {
      const grantRows = await rawQuery<{ feature_key: string; actions: string[] }>(
        `SELECT g.feature_key, g.actions
           FROM rbac_user_roles ur
           JOIN rbac_roles r ON r.id = ur.role_id
           JOIN rbac_role_grants g ON g.role_id = r.id
          WHERE ur."userId" = $1 AND ur."companyId" = $2
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            AND r.role_key = ANY($3::text[])`,
        [scope.userId, scope.companyId, roles.map((r) => r.roleKey)]
      );
      rbacProjected = projectGrantsToFlat(grantRows);
    } catch (e) {
      logger.warn(e, "[permissions/my] RBAC v2 projection skipped — using legacy set only");
    }

    const grantedPerms = Array.from(new Set([...rolePerms, ...grants, ...rbacProjected])).filter((p) => !revokes.has(p));

    // VIS-002 (Ghaith Operating Foundation): partial activation. Return the
    // company's explicitly DISABLED feature keys so the frontend can hide
    // unsubscribed tracks/services. Default-ON: any failure or empty table
    // yields [] ⇒ everything stays enabled (no behaviour change).
    const disabledRows = await rawQuery<{ feature_key: string }>(
      `SELECT feature_key FROM company_feature_flags WHERE "companyId" = $1 AND enabled = false`,
      [scope.companyId]
    ).catch(() => [] as { feature_key: string }[]);
    const disabledFeatures = disabledRows.map((r) => r.feature_key);

    res.json(maskFields(req, {
      userId: scope.userId,
      roles,
      highestLevel,
      modules: allModules,
      permissions: grantedPerms,
      disabledFeatures,
    }));
  } catch (err) {
    handleRouteError(err, res, "Get my permissions error:");
  }
});

router.get("/role-permissions", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<RolePermissionRow>(
      `SELECT * FROM role_permissions WHERE "companyId" IS NULL OR "companyId" = $1 ORDER BY role, permission`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "Get role permissions error:");
  }
});

router.post("/role-permissions", authorize({ feature: "admin", action: "update" }), authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { role, permission } = zodParse(rolePermissionSchema.safeParse(req.body));

    await rawExecute(
      `INSERT INTO role_permissions (role, permission, "companyId")
       VALUES ($1, $2, $3)
       ON CONFLICT (role, permission, "companyId") WHERE "companyId" IS NOT NULL
       DO NOTHING`,
      [role, permission, scope.companyId]
    );

    invalidatePermissionCache(role, scope.companyId);
    await auditLog(req, "role_permissions", scope.companyId, "create", null, { role, permission, companyId: scope.companyId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "role_permissions", entityId: scope.companyId, after: { role, permission } }).catch((e) => logger.error(e, "permissions background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "permissions.role_permission.created", entity: "role_permissions", entityId: scope.companyId, details: JSON.stringify({ role, permission }) }).catch((e) => logger.error(e, "permissions background task failed"));
    res.status(201).json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Add role permission error:");
  }
});

router.delete("/role-permissions", authorize({ feature: "admin", action: "update" }), authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { role, permission } = zodParse(rolePermissionSchema.safeParse(req.body));
    const [before] = await rawQuery<RolePermissionRow>(
      `SELECT * FROM role_permissions WHERE role = $1 AND permission = $2 AND "companyId" = $3`,
      [role, permission, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM role_permissions WHERE role = $1 AND permission = $2 AND "companyId" = $3`,
      [role, permission, scope.companyId]
    );
    invalidatePermissionCache(role, scope.companyId);
    await auditLog(req, "role_permissions", scope.companyId, "delete", { role, permission }, null);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "role_permissions", entityId: scope.companyId, before: before ?? { role, permission } }).catch((e) => logger.error(e, "permissions background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "permissions.role_permission.deleted", entity: "role_permissions", entityId: scope.companyId, details: JSON.stringify({ role, permission }) }).catch((e) => logger.error(e, "permissions background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete role permission error:");
  }
});

router.get("/user-permissions", authorize({ feature: "admin.roles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { userId } = req.query as { userId?: string };
    const targetId = userId ? Number(userId) : scope.userId;
    const rows = await rawQuery<UserPermissionFullRow>(
      `SELECT p.*, COALESCE(e.name, u.email) AS "userName" FROM permissions p
       LEFT JOIN users u ON u.id = p."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE p."userId" = $1 AND (p."companyId" IS NULL OR p."companyId" = $2)
       ORDER BY p.permission`,
      [targetId, scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "Get user permissions error:");
  }
});

router.post("/user-permissions", authorize({ feature: "admin", action: "update" }), authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { userId, permission, type = "grant" } = zodParse(userPermissionCreateSchema.safeParse(req.body));

    const [targetUser] = await rawQuery<UserIdRow>(
      `SELECT u.id FROM users u
       JOIN employees e ON e.id = u."employeeId"
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
       WHERE u.id = $1 LIMIT 1`,
      [userId, scope.companyId]
    );
    if (!targetUser) {
      res.status(403).json({ error: "المستخدم لا ينتمي لهذه الشركة", code: "CROSS_TENANT" });
      return;
    }

    await rawExecute(
      `INSERT INTO permissions ("userId", permission, type, "companyId", "grantedBy")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("userId", permission, "companyId") WHERE "companyId" IS NOT NULL
       DO UPDATE SET type = EXCLUDED.type, "grantedBy" = EXCLUDED."grantedBy", "updatedAt" = NOW()`,
      [userId, permission, type, scope.companyId, scope.userId]
    );

    await auditLog(req, "permissions", userId, "create", null, { userId, permission, type, companyId: scope.companyId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "permissions", entityId: userId, after: { userId, permission, type } }).catch((e) => logger.error(e, "permissions background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "permissions.user_permission.created", entity: "permissions", entityId: userId, details: JSON.stringify({ userId, permission, type }) }).catch((e) => logger.error(e, "permissions background task failed"));
    res.status(201).json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Add user permission error:");
  }
});

router.delete("/user-permissions", authorize({ feature: "admin", action: "update" }), authorize({ feature: "admin.roles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { userId, permission } = zodParse(userPermissionDeleteSchema.safeParse(req.body));
    const [before] = await rawQuery<UserPermissionFullRow>(
      `SELECT * FROM permissions WHERE "userId" = $1 AND permission = $2 AND "companyId" = $3`,
      [userId, permission, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM permissions WHERE "userId" = $1 AND permission = $2 AND "companyId" = $3`,
      [userId, permission, scope.companyId]
    );
    await auditLog(req, "permissions", userId, "delete", { userId, permission }, null);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "permissions", entityId: userId, before: before ?? { userId, permission } }).catch((e) => logger.error(e, "permissions background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "permissions.user_permission.deleted", entity: "permissions", entityId: userId, details: JSON.stringify({ userId, permission }) }).catch((e) => logger.error(e, "permissions background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete user permission error:");
  }
});

export default router;
