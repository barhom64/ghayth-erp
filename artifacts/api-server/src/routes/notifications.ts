import { handleRouteError, NotFoundError, parseId, zodParse } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/* ── Zod Schemas ────────────────────────────────────────────── */

const preferencesSchema = z.object({
  channel: z.string().optional(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
});

// Row shape for the per-user notifications list. Schema source-of-truth
// is db/schema.sql; @workspace/db Drizzle definitions don't cover this
// table yet.
interface NotificationListRow {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  priority?: string | null;
  isRead: boolean;
  createdAt: string;
  refType?: string | null;
  refId?: number | null;
  actionUrl?: string | null;
}

// Cursor mode shares the (createdAt, id) keyset pattern documented in
// docs/CURSOR_PAGINATION.md and first rolled out on /admin/audit-logs.
interface NotificationCursor { t: string; i: number }

function encodeCursor(c: NotificationCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(s: string): NotificationCursor | null {
  try {
    const raw = Buffer.from(s, "base64url").toString("utf8");
    const obj = JSON.parse(raw) as Partial<NotificationCursor>;
    if (typeof obj.t !== "string" || typeof obj.i !== "number") return null;
    if (Number.isNaN(Date.parse(obj.t))) return null;
    return { t: obj.t, i: obj.i };
  } catch {
    return null;
  }
}

const router = Router();

router.get("/", authorize({ feature: "notifications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    // ── Cursor mode (opt-in, non-breaking) ────────────────────────
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        res.status(400).json({ error: "cursor غير صالح" });
        return;
      }
      const rows = await rawQuery<NotificationListRow>(
        `SELECT id, type, title, body, priority, "isRead", "createdAt", "refType", "refId", "actionUrl"
         FROM notifications
         WHERE "assignmentId" = $1 AND "companyId" = $2
           AND ("createdAt", id) < ($3::timestamptz, $4)
         ORDER BY "createdAt" DESC, id DESC
         LIMIT $5`,
        [scope.activeAssignmentId, scope.companyId, decoded.t, decoded.i, pageSize + 1],
      );
      const hasMore = rows.length > pageSize;
      const data = hasMore ? rows.slice(0, pageSize) : rows;
      const last = data[data.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor({ t: String(last.createdAt), i: last.id })
        : null;
      res.json({ data, pageSize, cursor: nextCursor, hasMore });
      return;
    }

    // ── Legacy page/limit mode ────────────────────────────────────
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * pageSize;

    const [[countRow], notifications] = await Promise.all([
      rawQuery<{ count: string }>(`SELECT COUNT(*) AS count FROM notifications WHERE "assignmentId" = $1 AND "companyId" = $2`, [scope.activeAssignmentId, scope.companyId]),
      rawQuery<NotificationListRow>(
        `SELECT id, type, title, body, priority, "isRead", "createdAt", "refType", "refId", "actionUrl"
         FROM notifications
         WHERE "assignmentId" = $1 AND "companyId" = $2
         ORDER BY "createdAt" DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [scope.activeAssignmentId, scope.companyId, pageSize, offset],
      ),
    ]);

    res.json({ data: notifications, total: Number(countRow?.count ?? 0), page, pageSize });
  } catch (err) {
    handleRouteError(err, res, "List notifications error:");
  }
});

router.patch("/:id/read", authorize({ feature: "notifications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const { affectedRows } = await rawExecute(
      `UPDATE notifications SET "isRead" = true, "readAt" = NOW()
       WHERE id = $1 AND "assignmentId" = $2 AND "companyId" = $3 RETURNING id`,
      [id, scope.activeAssignmentId, scope.companyId]
    );

    if (!affectedRows) {
      throw new NotFoundError("الإشعار غير موجود");
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "mark_notification_read",
      entity: "notifications", entityId: id,
      after: { isRead: true },
    }).catch((e) => logger.error(e, "notifications background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "notification.read", entity: "notifications", entityId: id, details: JSON.stringify({ isRead: true }) }).catch((e) => logger.error(e, "notifications background task failed"));

    res.json({ message: "تم تعليم الإشعار كمقروء" });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.get("/unread-count", authorize({ feature: "notifications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE "assignmentId" = $1 AND "companyId" = $2 AND "isRead" = false`,
      [scope.activeAssignmentId, scope.companyId]
    );
    res.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب عدد الإشعارات غير المقروءة");
  }
});

router.get("/preferences", authorize({ feature: "notifications", action: "list" }), async (req, res) => {
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

router.post("/preferences", authorize({ feature: "notifications", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(preferencesSchema.safeParse(req.body));
    const scope = req.scope!;
    const { channel, category, enabled } = body;
    const { insertId } = await rawExecute(
      `INSERT INTO notification_preferences ("userId","companyId",channel,category,enabled)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("userId", "companyId", channel, category) DO UPDATE SET enabled = $5, "updatedAt" = NOW()
       RETURNING id`,
      [scope.userId, scope.companyId, channel || 'in_app', category || 'general', enabled !== false]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM notification_preferences WHERE id = $1 AND "companyId" = $2`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "upsert_notification_preference",
      entity: "notification_preferences", entityId: insertId,
      after: { channel, category, enabled },
    }).catch((e) => logger.error(e, "notifications background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "notification.preference.updated", entity: "notification_preferences", entityId: insertId, details: JSON.stringify({ channel, category, enabled }) }).catch((e) => logger.error(e, "notifications background task failed"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Save notification preference error:");
  }
});

router.patch("/mark-all-read", authorize({ feature: "notifications", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { affectedRows } = await rawExecute(
      `UPDATE notifications SET "isRead" = true, "readAt" = NOW()
       WHERE "assignmentId" = $1 AND "companyId" = $2 AND "isRead" = false`,
      [scope.activeAssignmentId, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "mark_all_notifications_read",
      entity: "notifications", entityId: 0,
      after: { updated: affectedRows },
    }).catch((e) => logger.error(e, "notifications background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "notification.all_read", entity: "notifications", entityId: 0, details: JSON.stringify({ updated: affectedRows }) }).catch((e) => logger.error(e, "notifications background task failed"));

    res.json({ message: "تم تعليم جميع الإشعارات كمقروءة", updated: affectedRows });
  } catch (err) {
    handleRouteError(err, res, "خطأ في تعليم الإشعارات كمقروءة");
  }
});

export default router;
