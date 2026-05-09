import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import {
  submitWorkflow,
  approveWorkflow,
  rejectWorkflow,
  referWorkflow,
  escalateWorkflow,
  returnWorkflow,
  getTimeline,
  getTimelineByRef,
} from "../lib/workflowEngine.js";
import { logger } from "../lib/logger.js";

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const submitSchema = z.object({
  requestType: z.string().min(1),
  refTable: z.string().optional(),
  refId: z.coerce.number().optional(),
  title: z.string().min(1),
  data: z.any().optional(),
});

const approveSchema = z.object({
  notes: z.string().optional(),
  attachments: z.any().optional(),
  overrideReason: z.string().optional(),
});

const rejectSchema = z.object({
  notes: z.string().min(1),
  overrideReason: z.string().optional(),
});

const referSchema = z.object({
  referredTo: z.coerce.number(),
  referredToName: z.string().optional(),
  notes: z.string().optional(),
  overrideReason: z.string().optional(),
});

const escalateSchema = z.object({
  notes: z.string().optional(),
  overrideReason: z.string().optional(),
});

const returnSchema = z.object({
  notes: z.string().min(1),
  overrideReason: z.string().optional(),
});

const workflowStepSchema = z.object({
  stepName: z.string().min(1),
  requiredRole: z.string().min(1),
  slaHours: z.coerce.number().optional(),
  autoApproveOnTimeout: z.boolean().optional(),
  canReject: z.boolean().optional(),
  canRefer: z.boolean().optional(),
});

const createDefinitionSchema = z.object({
  requestType: z.string().min(1),
  requestTypeLabel: z.string().min(1),
  description: z.string().optional(),
  isReturnable: z.boolean().optional(),
  enableEscalation: z.boolean().optional(),
  defaultSlaHours: z.coerce.number().optional(),
  steps: z.array(workflowStepSchema).optional(),
});

const updateDefinitionSchema = z.object({
  requestType: z.string().min(1).optional(),
  requestTypeLabel: z.string().min(1).optional(),
  description: z.string().optional(),
  isReturnable: z.boolean().optional(),
  enableEscalation: z.boolean().optional(),
  defaultSlaHours: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(workflowStepSchema).optional(),
});

const slaDefinitionSchema = z.object({
  requestType: z.string().min(1),
  warningHours: z.coerce.number().optional(),
  deadlineHours: z.coerce.number().optional(),
  escalationHours: z.coerce.number().optional(),
  autoApproveOnTimeout: z.boolean().optional(),
  escalateTo: z.string().optional(),
});

const router = Router();

router.post("/submit", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(submitSchema.safeParse(req.body));
    const scope = req.scope!;
    const { requestType, refTable, refId, title, data } = body;
    const result = await submitWorkflow({
      companyId: scope.companyId,
      branchId: scope.branchId,
      requestType,
      refTable,
      refId,
      title,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data,
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "workflow_instances", entityId: result.instanceId, after: { requestType, title } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.instance.created", entity: "workflow_instances", entityId: result.instanceId, details: JSON.stringify({ requestType, title }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.post("/:id/approve", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(approveSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await approveWorkflow({
      instanceId: id,
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: body.notes,
      attachments: body.attachments,
      overrideReason: body.overrideReason,
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "workflow_instances", entityId: id, after: { action: "approve" } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.instance.approved", entity: "workflow_instances", entityId: id, details: JSON.stringify({ notes: body.notes }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Workflow approve error:"); }
});

router.post("/:id/reject", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(rejectSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await rejectWorkflow({
      instanceId: id,
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: body.notes,
      overrideReason: body.overrideReason,
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "workflow_instances", entityId: id, after: { action: "reject" } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.instance.rejected", entity: "workflow_instances", entityId: id, details: JSON.stringify({ notes: body.notes }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Workflow reject error:"); }
});

router.post("/:id/refer", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(referSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { referredTo, referredToName, notes, overrideReason } = body;
    const result = await referWorkflow({
      instanceId: id,
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes,
      referredTo,
      referredToName,
      overrideReason,
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "workflow_instances", entityId: id, after: { action: "refer", referredTo } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.instance.updated", entity: "workflow_instances", entityId: id, details: JSON.stringify({ action: "refer", referredTo }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Workflow refer error:"); }
});

router.post("/:id/escalate", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(escalateSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await escalateWorkflow({
      instanceId: id,
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: body.notes,
      overrideReason: body.overrideReason,
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "workflow_instances", entityId: id, after: { action: "escalate" } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.instance.updated", entity: "workflow_instances", entityId: id, details: JSON.stringify({ action: "escalate" }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Workflow escalate error:"); }
});

router.post("/:id/return", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(returnSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await returnWorkflow({
      instanceId: id,
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: body.notes,
      overrideReason: body.overrideReason,
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "workflow_instances", entityId: id, after: { action: "return" } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.instance.updated", entity: "workflow_instances", entityId: id, details: JSON.stringify({ action: "return" }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Workflow return error:"); }
});

router.get("/:id/timeline", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await getTimeline(id, scope.companyId);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Workflow timeline error:"); }
});

router.get("/timeline/:refTable/:refId", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const refId = parseId(req.params.refId, "refId");
    const result = await getTimelineByRef(String(req.params.refTable), refId, scope.companyId);
    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, requestType } = req.query as any;
    let where = `wi."companyId" = $1 AND wi."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];

    if (status) {
      params.push(status);
      where += ` AND wi.status = $${params.length}`;
    }
    if (requestType) {
      params.push(requestType);
      where += ` AND wi."requestType" = $${params.length}`;
    }

    const rows = await rawQuery<any>(
      `SELECT wi.*, wd."requestTypeLabel" AS "defLabel"
       FROM workflow_instances wi
       LEFT JOIN workflow_definitions wd ON wd.id = wi."definitionId"
       WHERE ${where}
       ORDER BY wi."createdAt" DESC
       LIMIT 200`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/pending", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT wi.*
       FROM workflow_instances wi
       WHERE wi."companyId" = $1
         AND wi."deletedAt" IS NULL
         AND wi.status IN ('pending', 'in_review')
         AND wi."currentAssignee" = $2
       ORDER BY
         CASE wi."slaStatus"
           WHEN 'escalated' THEN 0
           WHEN 'exceeded' THEN 1
           WHEN 'warning' THEN 2
           ELSE 3
         END,
         wi."createdAt" ASC
       LIMIT 200`,
      [scope.companyId, scope.activeAssignmentId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/definitions", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const defs = await rawQuery<any>(
      `SELECT wd.*, (SELECT COUNT(*) FROM workflow_steps ws WHERE ws."definitionId" = wd.id) AS "stepCount"
       FROM workflow_definitions wd
       WHERE wd."companyId" = $1
       ORDER BY wd."requestTypeLabel" LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: defs, total: defs.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/definitions/:id", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [def] = await rawQuery<any>(
      `SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!def) throw new NotFoundError("التعريف غير موجود");
    const steps = await rawQuery<any>(
      `SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder" LIMIT 500`,
      [def.id]
    );
    res.json({ ...def, steps });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.post("/definitions", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(createDefinitionSchema.safeParse(req.body));
    const scope = req.scope!;
    const { requestType, requestTypeLabel, description, isReturnable, enableEscalation, defaultSlaHours, steps } = body;
    const insertId = await withTransaction(async (client) => {
      const defRes = await client.query(
        `INSERT INTO workflow_definitions ("companyId", "requestType", "requestTypeLabel", description, "isReturnable", "enableEscalation", "defaultSlaHours")
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [scope.companyId, requestType, requestTypeLabel, description ?? null, isReturnable ?? true, enableEscalation ?? true, defaultSlaHours ?? 48]
      );
      const defId = defRes.rows[0].id;
      if (Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          await client.query(
            `INSERT INTO workflow_steps ("definitionId", "stepOrder", "stepName", "requiredRole", "slaHours", "autoApproveOnTimeout", "canReject", "canRefer")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [defId, i + 1, s.stepName, s.requiredRole, s.slaHours ?? 48, s.autoApproveOnTimeout ?? false, s.canReject ?? true, s.canRefer ?? true]
          );
        }
      }
      return defId;
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "workflow_definitions", entityId: insertId, after: { requestType, requestTypeLabel } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.definition.created", entity: "workflow_definitions", entityId: insertId, details: JSON.stringify({ requestType, requestTypeLabel }) }).catch((e) => logger.error(e, "workflows background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM workflow_definitions WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    const defSteps = await rawQuery<any>(`SELECT * FROM workflow_steps WHERE "definitionId"=$1 ORDER BY "stepOrder" LIMIT 500`, [insertId]);
    res.status(201).json(row ? { ...row, steps: defSteps } : { id: insertId });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.put("/definitions/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(updateDefinitionSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { requestTypeLabel, description, isReturnable, enableEscalation, defaultSlaHours, isActive, steps } = body;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE workflow_definitions SET "requestTypeLabel" = COALESCE($1, "requestTypeLabel"),
         description = COALESCE($2, description), "isReturnable" = COALESCE($3, "isReturnable"),
         "enableEscalation" = COALESCE($4, "enableEscalation"), "defaultSlaHours" = COALESCE($5, "defaultSlaHours"),
         "isActive" = COALESCE($6, "isActive"), "updatedAt" = NOW()
         WHERE id = $7 AND "companyId" = $8`,
        [requestTypeLabel ?? null, description ?? null, isReturnable ?? null, enableEscalation ?? null, defaultSlaHours ?? null, isActive ?? null, id, scope.companyId]
      );

      if (Array.isArray(steps)) {
        await client.query(`DELETE FROM workflow_steps WHERE "definitionId" = $1`, [id]);
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          await client.query(
            `INSERT INTO workflow_steps ("definitionId", "stepOrder", "stepName", "requiredRole", "slaHours", "autoApproveOnTimeout", "canReject", "canRefer")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, i + 1, s.stepName, s.requiredRole, s.slaHours ?? 48, s.autoApproveOnTimeout ?? false, s.canReject ?? true, s.canRefer ?? true]
          );
        }
      }
    });

    const [def] = await rawQuery<any>(`SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    const updatedSteps = await rawQuery<any>(`SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder" LIMIT 500`, [id]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "workflow_definitions", entityId: id, after: { requestTypeLabel } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.definition.updated", entity: "workflow_definitions", entityId: id, details: JSON.stringify({ requestTypeLabel }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json({ ...def, steps: updatedSteps });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.delete("/definitions/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    const { affectedRows } = await rawExecute(`DELETE FROM workflow_definitions WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("التعريف غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "workflow_definitions", entityId: id, before }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.definition.deleted", entity: "workflow_definitions", entityId: id, details: JSON.stringify({ requestType: before?.requestType }) }).catch((e) => logger.error(e, "workflows background task failed"));
    res.json({ message: "تم الحذف" });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/sla-definitions", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM sla_definitions WHERE "companyId" = $1 ORDER BY "requestType" LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.post("/sla-definitions", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(slaDefinitionSchema.safeParse(req.body));
    const scope = req.scope!;
    const { requestType, warningHours, deadlineHours, escalationHours, autoApproveOnTimeout, escalateTo } = body;
    const { insertId } = await rawExecute(
      `INSERT INTO sla_definitions ("companyId", "requestType", "warningHours", "deadlineHours", "escalationHours", "autoApproveOnTimeout", "escalateTo")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("companyId", "requestType") DO UPDATE SET
       "warningHours" = EXCLUDED."warningHours", "deadlineHours" = EXCLUDED."deadlineHours",
       "escalationHours" = EXCLUDED."escalationHours", "autoApproveOnTimeout" = EXCLUDED."autoApproveOnTimeout",
       "escalateTo" = EXCLUDED."escalateTo"`,
      [scope.companyId, requestType, warningHours ?? 24, deadlineHours ?? 48, escalationHours ?? 72, autoApproveOnTimeout ?? false, escalateTo ?? "hr_manager"]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "sla_definitions", entityId: insertId, after: { requestType } }).catch((e) => logger.error(e, "workflows background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "workflow.definition.created", entity: "sla_definitions", entityId: insertId, details: JSON.stringify({ requestType }) }).catch((e) => logger.error(e, "workflows background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM sla_definitions WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/stats", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [total] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [scope.companyId]);
    const [pending] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('pending','in_review')`, [scope.companyId]);
    const [slaWarning] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "slaStatus" IN ('warning','exceeded') AND status IN ('pending','in_review')`, [scope.companyId]);
    const [escalated] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "slaStatus" = 'escalated' AND status IN ('pending','in_review')`, [scope.companyId]);
    res.json({
      total: Number(total.count),
      pending: Number(pending.count),
      slaWarning: Number(slaWarning.count),
      escalated: Number(escalated.count),
    });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

export default router;
