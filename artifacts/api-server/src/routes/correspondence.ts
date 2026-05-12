import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent, currentYear, generateRef as makeRef } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const correspondenceRouter = Router();
correspondenceRouter.use(authMiddleware);

interface CorrespondenceRow {
  id: number;
  companyId: number;
  branchId: number | null;
  direction: "outgoing" | "incoming";
  ref: string;
  subject: string;
  content: string | null;
  entityType: string | null;
  entityId: number | null;
  senderName: string | null;
  senderOrg: string | null;
  recipientName: string | null;
  recipientOrg: string | null;
  channel: string;
  status: string;
  attachments: unknown;
  notes: string | null;
  responseRef: string | null;
  respondedAt: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
}

interface CorrespondenceListRow extends CorrespondenceRow {
  createdByName: string | null;
}

interface SeqRow {
  seq: string | number;
}

interface CorrespondenceStatsRow {
  totalOutgoing: string | number;
  totalIncoming: string | number;
  totalDraft: string | number;
  totalSent: string | number;
  totalResponded: string | number;
  totalPending: string | number;
}

const respondSchema = z.object({
  subject: z.string().optional(),
  content: z.string().optional(),
  notes: z.string().optional(),
});

const patchCorrespondenceSchema = z.object({
  subject: z.string().optional(),
  content: z.string().optional(),
  senderName: z.string().optional(),
  senderOrg: z.string().optional(),
  recipientName: z.string().optional(),
  recipientOrg: z.string().optional(),
  channel: z.string().optional(),
  notes: z.string().optional(),
  branchId: z.coerce.number().optional(),
});

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
  const [row] = await rawQuery<SeqRow>(`SELECT nextval($1::regclass) AS seq`, [seqName]);
  if (!row) throw new Error(`فشل في توليد التسلسل: ${seqName}`);
  return makeRef(prefix, row.seq);
}

// ── List correspondence ──
correspondenceRouter.get("/", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { direction, entityType, entityId, search, status } = req.query as Record<string, string>;
    const params: unknown[] = [scope.companyId];
    let where = `c."companyId" = $1`;

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

    const rows = await rawQuery<CorrespondenceListRow>(
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
correspondenceRouter.get("/:id", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<CorrespondenceListRow>(
      `SELECT c.*, COALESCE(e.name, u.email) AS "createdByName"
       FROM correspondence c
       LEFT JOIN users u ON u.id = c."createdBy"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE c.id = $1 AND c."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المراسلة غير موجودة");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب المراسلة");
  }
});

// ── Create correspondence ──
correspondenceRouter.post("/", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const data = createSchema.parse(req.body);
    const ref = await generateCorrespondenceRef(data.direction, scope.companyId);

    const [row] = await rawQuery<CorrespondenceRow>(
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
correspondenceRouter.patch("/:id", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<CorrespondenceRow>(
      `SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المراسلة غير موجودة");
    if (existing.status !== "draft") {
      throw new ValidationError("لا يمكن تعديل مراسلة تم إرسالها");
    }

    const validated = zodParse(patchCorrespondenceSchema.safeParse(req.body ?? {}));
    const allowed = [
      "subject", "content", "senderName", "senderOrg",
      "recipientName", "recipientOrg", "channel", "notes", "branchId",
    ] as const;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const key of allowed) {
      if ((validated as any)[key] !== undefined) {
        params.push((validated as any)[key]);
        sets.push(`"${key}" = $${params.length}`);
      }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتعديل");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);

    const [updated] = await rawQuery<CorrespondenceRow>(
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
correspondenceRouter.post("/:id/send", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<CorrespondenceRow>(
      `SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المراسلة غير موجودة");
    if (existing.status !== "draft") {
      throw new ValidationError("المراسلة تم إرسالها مسبقاً");
    }

    const sentField = existing.direction === "outgoing" ? '"sentAt"' : '"receivedAt"';
    const [updated] = await rawQuery<CorrespondenceRow>(
      `UPDATE correspondence SET status = 'sent', ${sentField} = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2 AND status = 'draft' RETURNING *`,
      [id, scope.companyId]
    );
    if (!updated) throw new ConflictError("المراسلة تم إرسالها مسبقاً — أعد التحميل");

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "correspondence_sent", entity: "correspondence", entityId: id, after: { ref: existing.ref } });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "correspondence.sent", entity: "correspondence", entityId: id, details: JSON.stringify({ ref: existing.ref, direction: existing.direction }) }).catch((e) => logger.error(e, "correspondence background task failed"));

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إرسال المراسلة");
  }
});

// ── Record response to correspondence ──
correspondenceRouter.post("/:id/respond", authorize({ feature: "communications", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(respondSchema.safeParse(req.body ?? {}));
    const { subject, content, notes } = b;

    const [original] = await rawQuery<CorrespondenceRow>(
      `SELECT * FROM correspondence WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!original) throw new NotFoundError("المراسلة الأصلية غير موجودة");

    const responseDirection = original.direction === "outgoing" ? "incoming" : "outgoing";
    const responseRef = await generateCorrespondenceRef(responseDirection as "outgoing" | "incoming", scope.companyId);

    const response = await withTransaction(async (client) => {
      const insertRes = await client.query(
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

      await client.query(
        `UPDATE correspondence SET "respondedAt" = NOW(), "responseRef" = $2, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $3`,
        [id, responseRef, scope.companyId]
      );

      return insertRes.rows[0];
    });

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
correspondenceRouter.get("/stats/summary", authorize({ feature: "communications", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [stats] = await rawQuery<CorrespondenceStatsRow>(
      `SELECT
        COUNT(*) FILTER (WHERE direction = 'outgoing') AS "totalOutgoing",
        COUNT(*) FILTER (WHERE direction = 'incoming') AS "totalIncoming",
        COUNT(*) FILTER (WHERE status = 'draft') AS "totalDraft",
        COUNT(*) FILTER (WHERE status = 'sent') AS "totalSent",
        COUNT(*) FILTER (WHERE "respondedAt" IS NOT NULL) AS "totalResponded",
        COUNT(*) FILTER (WHERE "respondedAt" IS NULL AND status = 'sent') AS "totalPending"
       FROM correspondence WHERE "companyId" = $1`,
      [scope.companyId]
    );
    res.json(stats || {});
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب إحصائيات المراسلات");
  }
});

export default correspondenceRouter;
