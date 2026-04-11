import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";

const router = Router();
router.use(authMiddleware);

router.get("/comments/:entityType/:entityId", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const rows = await rawQuery(
      `SELECT id, "entityType", "entityId", "userId", "userName", body, "createdAt"
       FROM entity_comments
       WHERE "entityType" = $1 AND "entityId" = $2 AND "companyId" = $3
       ORDER BY "createdAt" DESC`,
      [entityType, Number(entityId), scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List comments error");
  }
});

router.post("/comments/:entityType/:entityId", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const { body } = req.body;
    if (!body || !body.trim()) {
      res.status(400).json({ error: "نص التعليق مطلوب" }); return;
    }
    const rows = await rawQuery(
      `INSERT INTO entity_comments ("entityType", "entityId", "companyId", "userId", "userName", body)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entityType, Number(entityId), scope.companyId, scope.userId, scope.userName || "مستخدم", body.trim()]
    );
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Create comment error");
  }
});

router.delete("/comments/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    await rawExecute(
      `DELETE FROM entity_comments WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete comment error");
  }
});

router.get("/tags/:entityType/:entityId", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const rows = await rawQuery(
      `SELECT id, "entityType", "entityId", tag, color, "createdAt"
       FROM entity_tags
       WHERE "entityType" = $1 AND "entityId" = $2 AND "companyId" = $3
       ORDER BY "createdAt" ASC`,
      [entityType, Number(entityId), scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List tags error");
  }
});

router.post("/tags/:entityType/:entityId", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const { tag, color } = req.body;
    if (!tag || !tag.trim()) {
      res.status(400).json({ error: "اسم الوسم مطلوب" }); return;
    }
    const rows = await rawQuery(
      `INSERT INTO entity_tags ("entityType", "entityId", "companyId", tag, color, "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("entityType", "entityId", tag, "companyId") DO NOTHING
       RETURNING *`,
      [entityType, Number(entityId), scope.companyId, tag.trim(), color || "blue", scope.userId]
    );
    if (rows.length === 0) {
      res.status(409).json({ error: "الوسم موجود بالفعل" }); return;
    }
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Create tag error");
  }
});

router.delete("/tags/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    await rawExecute(
      `DELETE FROM entity_tags WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete tag error");
  }
});

router.get("/tags-filter/:entityType", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const { tag } = req.query as any;
    if (!tag) {
      res.status(400).json({ error: "الوسم مطلوب للفلترة" }); return;
    }
    const rows = await rawQuery(
      `SELECT "entityId" FROM entity_tags
       WHERE "entityType" = $1 AND tag = $2 AND "companyId" = $3`,
      [entityType, tag, scope.companyId]
    );
    res.json({ data: rows.map((r: any) => r.entityId) });
  } catch (err) {
    handleRouteError(err, res, "Filter by tag error");
  }
});

router.get("/tags-list/:entityType", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const rows = await rawQuery(
      `SELECT tag, color, COUNT(*)::int as count
       FROM entity_tags
       WHERE "entityType" = $1 AND "companyId" = $2
       GROUP BY tag, color
       ORDER BY count DESC`,
      [entityType, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List all tags error");
  }
});

router.post("/bulk-action", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { entityType, entityIds, action } = req.body;
    if (!entityType || !Array.isArray(entityIds) || entityIds.length === 0 || !action) {
      res.status(400).json({ error: "بيانات غير مكتملة" }); return;
    }

    if (!scope.isOwner && scope.role !== "owner" && scope.role !== "general_manager") {
      res.status(403).json({ error: "لا تملك صلاحية تنفيذ الإجراءات الجماعية" }); return;
    }

    const validIds = entityIds.filter((id: any) => typeof id === "number" && Number.isInteger(id) && id > 0);
    if (validIds.length === 0) {
      res.status(400).json({ error: "معرفات غير صالحة" }); return;
    }

    const tableMap: Record<string, { table: string; extraWhere?: string }> = {
      request: { table: "requests" },
      invoice: { table: "invoices" },
      expense: { table: "journal_entries", extraWhere: `AND ref LIKE 'EXP%'` },
      ticket: { table: "support_tickets" },
      task: { table: "tasks" },
    };

    const mapping = tableMap[entityType];
    if (!mapping) {
      res.status(400).json({ error: "نوع الكيان غير مدعوم" }); return;
    }

    const { table, extraWhere = "" } = mapping;

    const validActions = ["approve", "reject", "delete", "close"];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: "إجراء غير مدعوم" }); return;
    }

    const actionLabelMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      close: entityType === "ticket" ? "closed" : "completed",
    };

    let updated = 0;
    let affectedIds: number[] = [];

    if (action === "approve") {
      const result = await rawQuery<{ id: number }>(
        `UPDATE ${table} SET status = 'approved' WHERE id = ANY($1::int[]) AND "companyId" = $2 ${extraWhere} RETURNING id`,
        [validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    } else if (action === "reject") {
      const result = await rawQuery<{ id: number }>(
        `UPDATE ${table} SET status = 'rejected' WHERE id = ANY($1::int[]) AND "companyId" = $2 ${extraWhere} RETURNING id`,
        [validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    } else if (action === "delete") {
      const result = await rawQuery<{ id: number }>(
        `DELETE FROM ${table} WHERE id = ANY($1::int[]) AND "companyId" = $2 ${extraWhere} RETURNING id`,
        [validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    } else if (action === "close") {
      const closeStatus = entityType === "ticket" ? "closed" : "completed";
      const result = await rawQuery<{ id: number }>(
        `UPDATE ${table} SET status = $1 WHERE id = ANY($2::int[]) AND "companyId" = $3 ${extraWhere} RETURNING id`,
        [closeStatus, validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    }

    if (affectedIds.length > 0 && action !== "delete") {
      const auditAction = actionLabelMap[action] || action;
      const values = affectedIds.map(
        (_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
      ).join(", ");
      const params = affectedIds.flatMap((id) => [
        entityType, id, auditAction, `إجراء جماعي: ${auditAction}`, scope.userId, scope.companyId,
      ]);
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
         VALUES ${values}`,
        params
      );
    }

    res.json({ success: true, updated, message: `تم تنفيذ الإجراء على ${updated} سجل` });
  } catch (err) {
    handleRouteError(err, res, "Bulk action error");
  }
});

export default router;
