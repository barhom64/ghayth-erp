import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermission("notifications:read"), async (req, res) => {
  try {
    const scope = req.scope!;

    const notifications = await rawQuery<any>(
      `SELECT id, type, title, body, priority, "isRead", "createdAt", "refType", "refId", "actionUrl"
       FROM notifications
       WHERE "assignmentId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      [scope.activeAssignmentId]
    );

    res.json({ data: notifications, total: notifications.length, page: 1, pageSize: notifications.length });
  } catch (err) {
    handleRouteError(err, res, "List notifications error:");
  }
});

router.patch("/:id/read", requirePermission("notifications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    const { affectedRows } = await rawExecute(
      `UPDATE notifications SET "isRead" = true, "readAt" = NOW()
       WHERE id = $1 AND "assignmentId" = $2 RETURNING id`,
      [Number(id), scope.activeAssignmentId]
    );

    if (!affectedRows) {
      res.status(404).json({ error: "الإشعار غير موجود" });
      return;
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "mark_notification_read",
      entity: "notifications", entityId: Number(id),
      after: { isRead: true },
    }).catch(console.error);

    res.json({ message: "تم تعليم الإشعار كمقروء" });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.get("/unread-count", requirePermission("notifications:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE "assignmentId" = $1 AND "isRead" = false`,
      [scope.activeAssignmentId]
    );
    res.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب عدد الإشعارات غير المقروءة");
  }
});

router.get("/preferences", requirePermission("notifications:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM notification_preferences WHERE "userId" = $1 AND "companyId" = $2 ORDER BY category`,
      [scope.userId, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Get notification preferences error:");
  }
});

router.post("/preferences", requirePermission("notifications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { channel, category, enabled } = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO notification_preferences ("userId","companyId",channel,category,enabled)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("userId", channel, category) DO UPDATE SET enabled = $5, "updatedAt" = NOW()
       RETURNING id`,
      [scope.userId, scope.companyId, channel || 'in_app', category || 'general', enabled !== false]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM notification_preferences WHERE id = $1`, [insertId]);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "upsert_notification_preference",
      entity: "notification_preferences", entityId: insertId,
      after: { channel, category, enabled },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Save notification preference error:");
  }
});

router.patch("/mark-all-read", requirePermission("notifications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { affectedRows } = await rawExecute(
      `UPDATE notifications SET "isRead" = true, "readAt" = NOW()
       WHERE "assignmentId" = $1 AND "isRead" = false`,
      [scope.activeAssignmentId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "mark_all_notifications_read",
      entity: "notifications", entityId: 0,
      after: { updated: affectedRows },
    }).catch(console.error);

    res.json({ message: "تم تعليم جميع الإشعارات كمقروءة", updated: affectedRows });
  } catch (err) {
    handleRouteError(err, res, "خطأ في تعليم الإشعارات كمقروءة");
  }
});

export default router;
