import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent, currentYear, generateRef as makeRef } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const correspondenceRouter = Router();
correspondenceRouter.use(authMiddleware);

const createSchema = z.object({
  direction: z.enum(["outgoing", "incoming"]),
  subject: z.string().min(1, "الموضوع مطلوب"),
  content: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.coerce.number().optional(),
  senderName: z.string().optional(),
  senderOrg: z.string().optional(),
  recipientName: z.string().optional(),
  recipientOrg: z.string().optional(),
  channel: z.string().optional(),
  branchId: z.coerce.number().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

// ── Generate outgoing/incoming reference ──
async function generateCorrespondenceRef(direction: "outgoing" | "incoming", companyId: number): Promise<string> {
  const prefix = direction === "outgoing" ? "OUT" : "IN";
  const seqName = direction === "outgoing" ? "correspondence_outgoing_seq" : "correspondence_incoming_seq";
  const [row] = await rawQuery<any>(`SELECT nextval($1::regclass) AS seq`, [seqName]);
  return makeRef(prefix, row.seq);
}

// ── List correspondence ──
correspondenceRouter.get("/", requirePermission("communications:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { direction, entityType, entityId, search, status } = req.query as Record<string, string>;
    const params: any[] = [scope.companyId];
    let where = `c."companyId" = $1 AND c."deletedAt" IS NULL`;

    if (direction) {
      params.push(direction);
      where += ` AND c.direction = $${params.length}`;
    }
    if (entityType) {
      params.push(entityType);
      where += ` AND c."entityType" = $${params.length}`;
    }
    if (entityId) {
      params.push(Number(entityId));
      where += ` AND c."entityId" = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (c.subject ILIKE $${params.length} OR c.ref ILIKE $${params.length} OR c."senderName" ILIKE $${params.length} OR c."recipientName" ILIKE $${params.length})`;
    }

    const rows = await rawQuery<any>(
      `SELECT c.*, COALESCE(e.name, u.email) AS "createdByName"
       FROM correspondence c
       LEFT JOIN users u ON u.id = c."createdBy"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${where}
       ORDER BY c."createdAt" DESC
       LIMIT 200`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب المراسلات");
  }
});

// ── Get single correspondence ──
correspondenceRouter.get("/:id", requirePermission("communications:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT c.*, COALESCE(e.name, u.email) AS "createdByName"
       FROM correspondence c
       LEFT JOIN users u ON u.id = c."createdBy"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE c.id = $1 AND c."companyId" = $2 AND c."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المراسلة غير موجودة");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب المراسلة");
  }
});

// ── Create correspondence ──
correspondenceRouter.post("/", requirePermission("communications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const data = createSchema.parse(req.body);
    const ref = await generateCorrespondenceRef(data.direction, scope.companyId);

    const [row] = await rawQuery<any>(
      `INSERT INTO correspondence (
        "companyId", "branchId", direction, ref, subject, content,
        "entityType", "entityId",
        "senderName", "senderOrg", "recipientName", "recipientOrg",
        channel, status, attachments, notes, "createdBy"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16)
      RETURNING *`,
      [
        scope.companyId, data.branchId || null, data.direction, ref,
        data.subject, data.content || null,
        data.entityType || null, data.entityId || null,
        data.senderName || null, data.senderOrg || null,
        data.recipientName || null, data.recipientOrg || null,
        data.channel || "internal",
        JSON.stringify(data.attachments || []),
        data.notes || null, scope.userId,
      ]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "correspondence_created", entity: "correspondence", entityId: row.id, after: { ref, direction: data.direction } });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "correspondence.created", entity: "correspondence", entityId: row.id, details: JSON.stringify({ ref, direction: data.direction, subject: data.subject }) }).catch((e) => logger.error(e, "correspondence background task failed"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء المراسلة");
  }
});

// ── Update correspondence (draft only) ──
correspondenceRouter.patch("/:id", requirePermission("communications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المراسلة غير موجودة");
    if (existing.status !== "draft") {
      throw new ValidationError("لا يمكن تعديل مراسلة تم إرسالها");
    }

    const allowed = [
      "subject", "content", "senderName", "senderOrg",
      "recipientName", "recipientOrg", "channel", "notes", "branchId",
    ];
    const sets: string[] = [];
    const params: any[] = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        sets.push(`"${key}" = $${params.length}`);
      }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتعديل");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);

    const [updated] = await rawQuery<any>(
      `UPDATE correspondence SET ${sets.join(", ")}
       WHERE id = $${params.length - 1} AND "companyId" = $${params.length}
       RETURNING *`,
      params
    );
    if (!updated) throw new NotFoundError("المراسلة غير موجودة");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "correspondence.updated", entity: "correspondence", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "correspondence background task failed"));
    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في تعديل المراسلة");
  }
});

// ── Send correspondence ──
correspondenceRouter.post("/:id/send", requirePermission("communications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المراسلة غير موجودة");
    if (existing.status !== "draft") {
      throw new ValidationError("المراسلة تم إرسالها مسبقاً");
    }

    const sentField = existing.direction === "outgoing" ? '"sentAt"' : '"receivedAt"';
    const [updated] = await rawQuery<any>(
      `UPDATE correspondence SET status = 'sent', ${sentField} = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, scope.companyId]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "correspondence_sent", entity: "correspondence", entityId: id, after: { ref: existing.ref } });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "correspondence.sent", entity: "correspondence", entityId: id, details: JSON.stringify({ ref: existing.ref, direction: existing.direction }) }).catch((e) => logger.error(e, "correspondence background task failed"));

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إرسال المراسلة");
  }
});

// ── Record response to correspondence ──
correspondenceRouter.post("/:id/respond", requirePermission("communications:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { subject, content, notes } = req.body as { subject?: string; content?: string; notes?: string };

    const [original] = await rawQuery<any>(
      `SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!original) throw new NotFoundError("المراسلة الأصلية غير موجودة");

    const responseDirection = original.direction === "outgoing" ? "incoming" : "outgoing";
    const responseRef = await generateCorrespondenceRef(responseDirection as "outgoing" | "incoming", scope.companyId);

    const [response] = await rawQuery<any>(
      `INSERT INTO correspondence (
        "companyId", "branchId", direction, ref, subject, content,
        "entityType", "entityId",
        "senderName", "senderOrg", "recipientName", "recipientOrg",
        channel, status, "responseRef", notes, "createdBy"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16)
      RETURNING *`,
      [
        scope.companyId, original.branchId, responseDirection, responseRef,
        subject || `رد: ${original.subject}`, content || null,
        original.entityType, original.entityId,
        original.recipientName, original.recipientOrg,
        original.senderName, original.senderOrg,
        original.channel, original.ref,
        notes || null, scope.userId,
      ]
    );

    await rawExecute(
      `UPDATE correspondence SET "respondedAt" = NOW(), "responseRef" = $2, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $3`,
      [id, responseRef, scope.companyId]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "correspondence_response", entity: "correspondence", entityId: response.id, after: {
      responseRef, originalRef: original.ref,
    } });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "correspondence.responded", entity: "correspondence", entityId: response.id, details: JSON.stringify({ responseRef, originalRef: original.ref }) }).catch((e) => logger.error(e, "correspondence background task failed"));

    res.status(201).json(response);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء الرد");
  }
});

// ── Dashboard stats ──
correspondenceRouter.get("/stats/summary", requirePermission("communications:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [stats] = await rawQuery<any>(
      `SELECT
        COUNT(*) FILTER (WHERE direction = 'outgoing') AS "totalOutgoing",
        COUNT(*) FILTER (WHERE direction = 'incoming') AS "totalIncoming",
        COUNT(*) FILTER (WHERE status = 'draft') AS "totalDraft",
        COUNT(*) FILTER (WHERE status = 'sent') AS "totalSent",
        COUNT(*) FILTER (WHERE "respondedAt" IS NOT NULL) AS "totalResponded",
        COUNT(*) FILTER (WHERE "respondedAt" IS NULL AND status = 'sent') AS "totalPending"
       FROM correspondence WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    res.json(stats || {});
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب إحصائيات المراسلات");
  }
});

export default correspondenceRouter;
