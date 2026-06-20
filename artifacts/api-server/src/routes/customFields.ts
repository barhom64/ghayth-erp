// customFields.ts — الحقول المخصّصة لكل شركة (#2719).
//
// معماري، غير دفتري. تعريفات الحقول + قيمها (EAV) عبر هجرة 394. RBAC: settings
// (إدارة المخطط = مديرو الإعدادات؛ المالك يتجاوز). كل كتابة تحمل Audit/Event.
// حدود المسار: لا يكتب على جداول الكيانات الأخرى — يخزّن القيم في جدوله فقط.
import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, parseId, zodParse, ValidationError, NotFoundError, ConflictError } from "../lib/errorHandler.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";

export const customFieldsRouter = Router();
customFieldsRouter.use(authMiddleware);

const FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;

const defSchema = z.object({
  entityType: z.string().min(1, "نوع الكيان مطلوب").max(60),
  fieldKey: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, "مفتاح الحقل: يبدأ بحرف ثم حروف/أرقام/شرطة سفلية"),
  label: z.string().min(1, "التسمية مطلوبة").max(200),
  fieldType: z.enum(FIELD_TYPES).default("text"),
  options: z.array(z.string().max(200)).max(100).optional(),
  required: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const valuesSchema = z.object({
  entityType: z.string().min(1).max(60),
  entityId: z.coerce.number().int().positive(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

// ── تعريفات الحقول ──────────────────────────────────────────────────────────

// GET /custom-fields/definitions?entityType= — تعريفات الشركة (لنوع كيان اختياري).
customFieldsRouter.get("/definitions", authorize({ feature: "settings", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const entityType = String((req.query as Record<string, string | undefined>).entityType || "");
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (entityType) { params.push(entityType); where += ` AND "entityType" = $${params.length}`; }
    const rows = await rawQuery(`SELECT * FROM custom_field_definitions WHERE ${where} ORDER BY "entityType", "sortOrder", id`, params);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List custom field definitions error:"); }
});

// POST /custom-fields/definitions — تعريف حقل جديد (إدارة المخطط = تحديث الإعدادات).
customFieldsRouter.post("/definitions", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(defSchema.safeParse(req.body ?? {}));
    if (b.fieldType === "select" && (!b.options || b.options.length === 0)) {
      throw new ValidationError("حقل القائمة (select) يتطلب خيارات", { field: "options", fix: "أضف خيارًا واحدًا على الأقل" });
    }
    const [dup] = await rawQuery<{ id: number }>(
      `SELECT id FROM custom_field_definitions WHERE "companyId"=$1 AND "entityType"=$2 AND "fieldKey"=$3 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, b.entityType, b.fieldKey],
    );
    if (dup) throw new ConflictError("مفتاح الحقل مستخدم لهذا الكيان مسبقًا", { field: "fieldKey", fix: "اختر مفتاحًا فريدًا" });
    const [row] = await rawQuery(
      `INSERT INTO custom_field_definitions ("companyId","entityType","fieldKey",label,"fieldType",options,required,"sortOrder","isActive","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
      [scope.companyId, b.entityType, b.fieldKey, b.label, b.fieldType, JSON.stringify(b.options ?? []), b.required ?? false, b.sortOrder ?? 0, b.isActive ?? true, scope.userId],
    );
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "custom_field.created", entity: "custom_field_definitions", entityId: row.id, details: JSON.stringify({ entityType: b.entityType, fieldKey: b.fieldKey }) }).catch((e) => logger.error(e, "custom field event failed"));
    auditFromRequest(req, "create", "custom_field_definitions", row.id, { after: { entityType: b.entityType, fieldKey: b.fieldKey, label: b.label } }).catch((e) => logger.error(e, "custom field audit failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create custom field definition error:"); }
});

// PATCH /custom-fields/definitions/:id — تعديل تعريف.
customFieldsRouter.patch("/definitions/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(defSchema.partial().omit({ entityType: true, fieldKey: true }).safeParse(req.body ?? {}));
    // كمرآة لتحقّق POST: حقل القائمة (select) يتطلب خيارات. عند تعديل النوع و/أو
    // الخيارات نحسب القيمة الفعّالة (الواردة أو المخزَّنة) ونمنع select بلا خيارات.
    if (b.fieldType !== undefined || b.options !== undefined) {
      const [cur] = await rawQuery<{ fieldType: string; options: string[] | null }>(
        `SELECT "fieldType", options FROM custom_field_definitions WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!cur) throw new NotFoundError("تعريف الحقل غير موجود");
      const effType = b.fieldType ?? cur.fieldType;
      const effOptions = b.options ?? (Array.isArray(cur.options) ? cur.options : []);
      if (effType === "select" && effOptions.length === 0) {
        throw new ValidationError("حقل القائمة (select) يتطلب خيارات", { field: "options", fix: "أضف خيارًا واحدًا على الأقل" });
      }
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (b.label !== undefined) set("label", b.label);
    if (b.fieldType !== undefined) set("fieldType", b.fieldType);
    if (b.options !== undefined) { params.push(JSON.stringify(b.options ?? [])); sets.push(`options = $${params.length}::jsonb`); }
    if (b.required !== undefined) set("required", b.required);
    if (b.sortOrder !== undefined) set("sortOrder", b.sortOrder);
    if (b.isActive !== undefined) set("isActive", b.isActive);
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث", { field: "body" });
    sets.push(`"updatedAt" = NOW()`);
    params.push(id); params.push(scope.companyId);
    const [row] = await rawQuery(
      `UPDATE custom_field_definitions SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("تعريف الحقل غير موجود");
    auditFromRequest(req, "update", "custom_field_definitions", id).catch((e) => logger.error(e, "custom field audit failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update custom field definition error:"); }
});

// DELETE /custom-fields/definitions/:id — حذف ناعم (إدارة المخطط = تحديث الإعدادات).
customFieldsRouter.delete("/definitions/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE custom_field_definitions SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("تعريف الحقل غير موجود");
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "custom_field.deleted", entity: "custom_field_definitions", entityId: id }).catch((e) => logger.error(e, "custom field event failed"));
    auditFromRequest(req, "delete", "custom_field_definitions", id).catch((e) => logger.error(e, "custom field audit failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete custom field definition error:"); }
});

// ── قيم الحقول لكيان ────────────────────────────────────────────────────────

// GET /custom-fields/values?entityType=&entityId= — التعريفات النشطة + قيمها لصفّ كيان.
customFieldsRouter.get("/values", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const q = req.query as Record<string, string | undefined>;
    const entityType = String(q.entityType || "");
    const entityId = Number(q.entityId || 0);
    if (!entityType || !entityId) throw new ValidationError("entityType و entityId مطلوبان", { field: "entityType" });
    const rows = await rawQuery(
      `SELECT d.id AS "fieldId", d."fieldKey", d.label, d."fieldType", d.options, d.required, d."sortOrder", v.value
         FROM custom_field_definitions d
         LEFT JOIN custom_field_values v
           ON v."fieldId" = d.id AND v."entityType" = d."entityType" AND v."entityId" = $3 AND v."companyId" = d."companyId"
        WHERE d."companyId" = $1 AND d."entityType" = $2 AND d."deletedAt" IS NULL AND d."isActive" = TRUE
        ORDER BY d."sortOrder", d.id`,
      [scope.companyId, entityType, entityId],
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Get custom field values error:"); }
});

// PUT /custom-fields/values — حفظ قيم حقول كيان (upsert على المفتاح الفريد).
customFieldsRouter.put("/values", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(valuesSchema.safeParse(req.body ?? {}));
    // التعريفات الصالحة فقط لهذه الشركة+الكيان — أي مفتاح غريب يُتجاهَل (لا حقن).
    const defs = await rawQuery<{ id: number; required: boolean; label: string }>(
      `SELECT id, required, label FROM custom_field_definitions WHERE "companyId"=$1 AND "entityType"=$2 AND "deletedAt" IS NULL AND "isActive"=TRUE`,
      [scope.companyId, b.entityType],
    );
    const validIds = new Map(defs.map((d) => [d.id, d]));
    let written = 0;
    for (const [fieldIdStr, raw] of Object.entries(b.values)) {
      const fieldId = Number(fieldIdStr);
      if (!validIds.has(fieldId)) continue; // تجاهل المفاتيح غير المعرّفة
      const v = raw === null || raw === undefined ? null : String(raw);
      await rawExecute(
        `INSERT INTO custom_field_values ("companyId","fieldId","entityType","entityId",value,"updatedAt")
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT ("fieldId","entityType","entityId") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        [scope.companyId, fieldId, b.entityType, b.entityId, v],
      );
      written++;
    }
    auditFromRequest(req, "update", "custom_field_values", b.entityId, { after: { entityType: b.entityType, fields: written } }).catch((e) => logger.error(e, "custom field audit failed"));
    res.json({ success: true, written });
  } catch (err) { handleRouteError(err, res, "Save custom field values error:"); }
});
