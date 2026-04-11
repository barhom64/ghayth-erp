import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission, invalidatePermissionCache } from "../middlewares/permissionMiddleware.js";
import { auditLog } from "../lib/audit.js";

const router = Router();
router.use(authMiddleware);

router.get("/role-permissions", requirePermission("permissions:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM role_permissions WHERE "companyId" IS NULL OR "companyId" = $1 ORDER BY role, permission`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Get role permissions error:");
  }
});

router.post("/role-permissions", requirePermission("permissions:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { role, permission } = req.body as { role: string; permission: string };
    if (!role || !permission) {
      res.status(400).json({ error: "role و permission مطلوبان" });
      return;
    }

    await rawExecute(
      `INSERT INTO role_permissions (role, permission, "companyId")
       VALUES ($1, $2, $3)
       ON CONFLICT (role, permission, "companyId") WHERE "companyId" IS NOT NULL
       DO NOTHING`,
      [role, permission, scope.companyId]
    );

    invalidatePermissionCache(role, scope.companyId);
    await auditLog(req, "role_permissions", scope.companyId, "create", null, { role, permission, companyId: scope.companyId });
    res.status(201).json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Add role permission error:");
  }
});

router.delete("/role-permissions", requirePermission("permissions:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { role, permission } = req.body as { role: string; permission: string };
    await rawExecute(
      `DELETE FROM role_permissions WHERE role = $1 AND permission = $2 AND "companyId" = $3`,
      [role, permission, scope.companyId]
    );
    invalidatePermissionCache(role, scope.companyId);
    await auditLog(req, "role_permissions", scope.companyId, "delete", { role, permission }, null);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete role permission error:");
  }
});

router.get("/user-permissions", requirePermission("permissions:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { userId } = req.query as { userId?: string };
    const targetId = userId ? Number(userId) : scope.userId;
    const rows = await rawQuery<any>(
      `SELECT p.*, u.name AS "userName" FROM permissions p
       LEFT JOIN users u ON u.id = p."userId"
       WHERE p."userId" = $1 AND (p."companyId" IS NULL OR p."companyId" = $2)
       ORDER BY p.permission`,
      [targetId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Get user permissions error:");
  }
});

router.post("/user-permissions", requirePermission("permissions:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { userId, permission, type = "grant" } = req.body as {
      userId: number;
      permission: string;
      type?: "grant" | "revoke";
    };
    if (!userId || !permission) {
      res.status(400).json({ error: "userId و permission مطلوبان" });
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
    res.status(201).json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Add user permission error:");
  }
});

router.delete("/user-permissions", requirePermission("permissions:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { userId, permission } = req.body as { userId: number; permission: string };
    await rawExecute(
      `DELETE FROM permissions WHERE "userId" = $1 AND permission = $2 AND "companyId" = $3`,
      [userId, permission, scope.companyId]
    );
    await auditLog(req, "permissions", userId, "delete", { userId, permission }, null);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete user permission error:");
  }
});

export default router;
