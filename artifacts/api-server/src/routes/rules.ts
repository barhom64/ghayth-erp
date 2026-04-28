import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { z } from "zod";

const createRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  triggerEvent: z.string().min(1),
  conditionField: z.string().optional().nullable(),
  conditionOperator: z.string().optional(),
  conditionValue: z.string().optional().nullable(),
  actionType: z.string().min(1),
  actionTarget: z.string().optional().nullable(),
  actionConfig: z.record(z.unknown()).optional(),
  module: z.string().optional().nullable(),
  priority: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
});

const patchRuleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  triggerEvent: z.string().min(1).optional(),
  conditionField: z.string().optional().nullable(),
  conditionOperator: z.string().optional().nullable(),
  conditionValue: z.string().optional().nullable(),
  actionType: z.string().min(1).optional(),
  actionTarget: z.string().optional().nullable(),
  actionConfig: z.record(z.unknown()).optional(),
  module: z.string().optional().nullable(),
  priority: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
});

const toggleRuleSchema = z.object({}).optional();

const router = Router();

router.get("/", requirePermission("admin:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rules = await rawQuery<any>(
      `SELECT * FROM business_rules
       WHERE ("companyId" IS NULL OR "companyId" = $1) AND "deletedAt" IS NULL
       ORDER BY priority DESC, "createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rules, total: rules.length });
  } catch (err) {
    handleRouteError(err, res, "قواعد الأعمال");
  }
});

router.get("/logs", requirePermission("admin:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { ruleId, limit: lim = "50", page = "1" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);
    const conditions = [`("companyId" IS NULL OR "companyId" = $1)`];
    const params: any[] = [scope.companyId];

    if (ruleId) {
      params.push(Number(ruleId));
      conditions.push(`"ruleId" = $${params.length}`);
    }

    params.push(Number(lim));
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const logs = await rawQuery<any>(
      `SELECT * FROM business_rule_logs 
       WHERE ${conditions.join(" AND ")}
       ORDER BY "executedAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM business_rule_logs WHERE ${conditions.join(" AND ")}`,
      countParams
    );

    res.json({ data: logs, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "سجل القواعد");
  }
});

router.post("/", requirePermission("admin:write"), async (req, res) => {
  try {
    const parsed_createRule = createRuleSchema.safeParse(req.body);
    if (!parsed_createRule.success) throw new ValidationError(parsed_createRule.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed_createRule.data;
    const scope = req.scope!;

    if (!b.name || !b.triggerEvent || !b.actionType) {
      throw new ValidationError("الاسم ونوع الحدث ونوع الإجراء مطلوبة");
    }

    const { insertId } = await rawExecute(
      `INSERT INTO business_rules ("companyId",name,description,"triggerEvent","conditionField","conditionOperator","conditionValue","actionType","actionTarget","actionConfig",module,priority,"isActive","createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        scope.companyId, b.name, b.description || null, b.triggerEvent,
        b.conditionField || null, b.conditionOperator || ">=", b.conditionValue || null,
        b.actionType, b.actionTarget || null, JSON.stringify(b.actionConfig || {}),
        b.module || null, b.priority || 0, b.isActive !== false, scope.userId,
      ]
    );

    const [rule] = await rawQuery<any>(`SELECT * FROM business_rules WHERE id = $1`, [insertId]);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_business_rule",
      entity: "business_rules", entityId: insertId,
      after: { name: b.name, triggerEvent: b.triggerEvent, actionType: b.actionType },
    }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "rules.created", entity: "business_rules", entityId: insertId, details: JSON.stringify({ name: b.name, triggerEvent: b.triggerEvent }) }).catch(console.error);

    res.status(201).json(rule);
  } catch (err) {
    handleRouteError(err, res, "إنشاء قاعدة");
  }
});

router.patch("/:id", requirePermission("admin:write"), async (req, res) => {
  try {
    const parsed_patchRule = patchRuleSchema.safeParse(req.body);
    if (!parsed_patchRule.success) throw new ValidationError(parsed_patchRule.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed_patchRule.data;
    const scope = req.scope!;
    const id = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT * FROM business_rules WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) {
      throw new NotFoundError("القاعدة غير موجودة أو لا يمكن تعديل القواعد الافتراضية");
    }

    const sets: string[] = [`"updatedAt" = NOW()`];
    const params: any[] = [];

    if (b.name !== undefined) { params.push(b.name); sets.push(`name = $${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description = $${params.length}`); }
    if (b.triggerEvent !== undefined) { params.push(b.triggerEvent); sets.push(`"triggerEvent" = $${params.length}`); }
    if (b.conditionField !== undefined) { params.push(b.conditionField); sets.push(`"conditionField" = $${params.length}`); }
    if (b.conditionOperator !== undefined) { params.push(b.conditionOperator); sets.push(`"conditionOperator" = $${params.length}`); }
    if (b.conditionValue !== undefined) { params.push(b.conditionValue); sets.push(`"conditionValue" = $${params.length}`); }
    if (b.actionType !== undefined) { params.push(b.actionType); sets.push(`"actionType" = $${params.length}`); }
    if (b.actionTarget !== undefined) { params.push(b.actionTarget); sets.push(`"actionTarget" = $${params.length}`); }
    if (b.actionConfig !== undefined) { params.push(JSON.stringify(b.actionConfig)); sets.push(`"actionConfig" = $${params.length}`); }
    if (b.module !== undefined) { params.push(b.module); sets.push(`module = $${params.length}`); }
    if (b.priority !== undefined) { params.push(b.priority); sets.push(`priority = $${params.length}`); }
    if (b.isActive !== undefined) { params.push(b.isActive); sets.push(`"isActive" = $${params.length}`); }

    params.push(id);
    await rawExecute(`UPDATE business_rules SET ${sets.join(",")} WHERE id = $${params.length}`, params);

    const [rule] = await rawQuery<any>(`SELECT * FROM business_rules WHERE id = $1`, [id]);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_business_rule",
      entity: "business_rules", entityId: id,
      before: existing, after: b,
    }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "rules.updated", entity: "business_rules", entityId: id, details: JSON.stringify({ name: b.name }) }).catch(console.error);

    res.json(rule);
  } catch (err) {
    handleRouteError(err, res, "تعديل قاعدة");
  }
});

router.delete("/:id", requirePermission("admin:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM business_rules WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) {
      throw new NotFoundError("القاعدة غير موجودة أو لا يمكن حذف القواعد الافتراضية");
    }
    await rawExecute(`UPDATE business_rules SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_business_rule",
      entity: "business_rules", entityId: id,
      before: existing,
    }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "rules.deleted", entity: "business_rules", entityId: id }).catch(console.error);

    res.json({ message: "تم حذف القاعدة بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "حذف قاعدة");
  }
});

router.patch("/:id/toggle", requirePermission("admin:write"), async (req, res) => {
  try {
    { const _guard = toggleRuleSchema.safeParse(req.body); if (!_guard.success) throw new ValidationError(_guard.error.errors[0]?.message ?? "بيانات غير صالحة"); }
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, "isActive" FROM business_rules WHERE id = $1 AND ("companyId" IS NULL OR "companyId" = $2)`,
      [id, scope.companyId]
    );
    if (!existing) {
      throw new NotFoundError("القاعدة غير موجودة");
    }
    const newActive = !existing.isActive;
    await rawExecute(`UPDATE business_rules SET "isActive" = $1, "updatedAt" = NOW() WHERE id = $2 AND ("companyId" IS NULL OR "companyId" = $3)`, [newActive, id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "toggle_business_rule",
      entity: "business_rules", entityId: id,
      before: { isActive: existing.isActive }, after: { isActive: newActive },
    }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "rules.toggled", entity: "business_rules", entityId: id, details: JSON.stringify({ isActive: newActive }) }).catch(console.error);

    res.json({ id, isActive: newActive, message: newActive ? "تم تفعيل القاعدة" : "تم تعطيل القاعدة" });
  } catch (err) {
    handleRouteError(err, res, "تبديل حالة القاعدة");
  }
});

export default router;
