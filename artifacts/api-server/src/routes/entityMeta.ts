import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError, ForbiddenError , zodParse } from "../lib/errorHandler.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

const createCommentSchema = z.object({
  body: z.string().min(1, "نص التعليق مطلوب"),
});

const createTagSchema = z.object({
  tag: z.string().min(1, "اسم الوسم مطلوب"),
  color: z.string().optional(),
});

const bulkActionSchema = z.object({
  entityType: z.string().min(1),
  entityIds: z.array(z.coerce.number().int().positive()).min(1),
  action: z.string().min(1),
});

const router = Router();

router.get("/comments/:entityType/:entityId", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const rows = await rawQuery(
      `SELECT id, "entityType", "entityId", "userId", "userName", body, "createdAt"
       FROM entity_comments
       WHERE "entityType" = $1 AND "entityId" = $2 AND "companyId" = $3
       ORDER BY "createdAt" DESC LIMIT 500`,
      [entityType, Number(entityId), scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List comments error");
  }
});

router.post("/comments/:entityType/:entityId", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const validatedBody = zodParse(createCommentSchema.safeParse(req.body));
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const { body } = validatedBody;
    if (!body || !body.trim()) {
      throw new ValidationError("نص التعليق مطلوب");
    }
    const rows = await rawQuery(
      `INSERT INTO entity_comments ("entityType", "entityId", "companyId", "userId", "userName", body)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entityType, Number(entityId), scope.companyId, scope.userId, scope.userName || "مستخدم", body.trim()]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_comment",
      entity: String(entityType), entityId: Number(entityId),
      after: { body: body.trim() },
    }).catch((e) => logger.error(e, "entityMeta background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "entity.comment.created", entity: "entity_comments", entityId: Number(entityId), details: JSON.stringify({ entityType, body: body.trim() }) }).catch((e) => logger.error(e, "entityMeta background task failed"));

    if (!rows[0]) throw new NotFoundError("فشل في إنشاء التعليق");
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Create comment error");
  }
});

router.delete("/comments/:id", requirePermission("admin:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [before] = await rawQuery(
      `SELECT * FROM entity_comments WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    await rawExecute(
      `DELETE FROM entity_comments WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_comment",
      entity: "entity_comments", entityId: Number(id),
      before,
    }).catch((e) => logger.error(e, "entityMeta background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "entity.comment.deleted", entity: "entity_comments", entityId: Number(id), details: JSON.stringify({ id: Number(id) }) }).catch((e) => logger.error(e, "entityMeta background task failed"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete comment error");
  }
});

router.get("/tags/:entityType/:entityId", requirePermission("operations:read"), async (req, res) => {
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

router.post("/tags/:entityType/:entityId", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const validatedBody = zodParse(createTagSchema.safeParse(req.body));
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const { tag, color } = validatedBody;
    if (!tag || !tag.trim()) {
      throw new ValidationError("اسم الوسم مطلوب");
    }
    const rows = await rawQuery(
      `INSERT INTO entity_tags ("entityType", "entityId", "companyId", tag, color, "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("entityType", "entityId", tag, "companyId") DO NOTHING
       RETURNING *`,
      [entityType, Number(entityId), scope.companyId, tag.trim(), color || "blue", scope.userId]
    );
    if (rows.length === 0) {
      throw new ConflictError("الوسم موجود بالفعل");
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_tag",
      entity: String(entityType), entityId: Number(entityId),
      after: { tag: tag.trim(), color: color || "blue" },
    }).catch((e) => logger.error(e, "entityMeta background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "entity.tag.created", entity: "entity_tags", entityId: Number(entityId), details: JSON.stringify({ entityType, tag: tag.trim(), color: color || "blue" }) }).catch((e) => logger.error(e, "entityMeta background task failed"));

    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Create tag error");
  }
});

router.delete("/tags/:id", requirePermission("admin:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [before] = await rawQuery(
      `SELECT * FROM entity_tags WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    await rawExecute(
      `DELETE FROM entity_tags WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_tag",
      entity: "entity_tags", entityId: Number(id),
      before,
    }).catch((e) => logger.error(e, "entityMeta background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "entity.tag.deleted", entity: "entity_tags", entityId: Number(id), details: JSON.stringify({ id: Number(id) }) }).catch((e) => logger.error(e, "entityMeta background task failed"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete tag error");
  }
});

router.get("/tags-filter/:entityType", requirePermission("operations:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const { tag } = req.query as any;
    if (!tag) {
      throw new ValidationError("الوسم مطلوب للفلترة");
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

router.get("/tags-list/:entityType", requirePermission("operations:read"), async (req, res) => {
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

router.post("/bulk-action", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const validatedBody = zodParse(bulkActionSchema.safeParse(req.body));
    const scope = req.scope!;
    const { entityType, entityIds, action } = validatedBody;
    if (!entityType || !Array.isArray(entityIds) || entityIds.length === 0 || !action) {
      throw new ValidationError("بيانات غير مكتملة");
    }

    if (!scope.isOwner && !OWNER_GM_ROLES.includes(scope.role)) {
      throw new ForbiddenError("لا تملك صلاحية تنفيذ الإجراءات الجماعية");
    }

    const validIds = entityIds.filter((id: any) => typeof id === "number" && Number.isInteger(id) && id > 0);
    if (validIds.length === 0) {
      throw new ValidationError("معرفات غير صالحة");
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
      throw new ValidationError("نوع الكيان غير مدعوم");
    }

    const { table, extraWhere = "" } = mapping;

    const validActions = ["approve", "reject", "delete", "close"];
    if (!validActions.includes(action)) {
      throw new ValidationError("إجراء غير مدعوم");
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
        `UPDATE ${table} SET status = 'approved' WHERE id = ANY($1::int[]) AND "companyId" = $2 AND status IN ('pending','draft','pending_approval') ${extraWhere} RETURNING id`,
        [validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    } else if (action === "reject") {
      const result = await rawQuery<{ id: number }>(
        `UPDATE ${table} SET status = 'rejected' WHERE id = ANY($1::int[]) AND "companyId" = $2 AND status IN ('pending','draft','pending_approval') ${extraWhere} RETURNING id`,
        [validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    } else if (action === "delete") {
      const result = await rawQuery<{ id: number }>(
        `UPDATE ${table} SET "deletedAt" = NOW() WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL ${extraWhere} RETURNING id`,
        [validIds, scope.companyId]
      );
      affectedIds = result.map((r) => r.id);
      updated = affectedIds.length;
    } else if (action === "close") {
      const closeStatus = entityType === "ticket" ? "closed" : "completed";
      const result = await rawQuery<{ id: number }>(
        `UPDATE ${table} SET status = $1 WHERE id = ANY($2::int[]) AND "companyId" = $3 AND status NOT IN ('closed','completed','cancelled') ${extraWhere} RETURNING id`,
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

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: `bulk_${action}`,
      entity: entityType, entityId: 0,
      after: { action, entityType, affectedIds, updated },
    }).catch((e) => logger.error(e, "entityMeta background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: `entity.bulk.${action}`, entity: entityType, entityId: 0, details: JSON.stringify({ action, entityType, affectedIds, updated }) }).catch((e) => logger.error(e, "entityMeta background task failed"));

    res.json({ success: true, updated, message: `تم تنفيذ الإجراء على ${updated} سجل` });
  } catch (err) {
    handleRouteError(err, res, "Bulk action error");
  }
});

export default router;
