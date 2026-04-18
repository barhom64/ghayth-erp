import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
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

const router = Router();
router.use(authMiddleware);

router.post("/submit", async (req, res) => {
  try {
    const scope = req.scope!;
    const { requestType, refTable, refId, title, data } = req.body;
    if (!requestType || !title) {
      res.status(400).json({ error: "نوع الطلب والعنوان مطلوبان" });
      return;
    }
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
    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    const result = await approveWorkflow({
      instanceId: Number(req.params.id),
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: req.body.notes,
      attachments: req.body.attachments,
      overrideReason: req.body.overrideReason,
    });
    res.json(result);
  } catch (e: any) {
    const code = e.message.includes("غير موجودة") ? 404 :
                 e.message.includes("شروط غير مستوفاة") ? 422 :
                 e.message.includes("انتقال غير مصرح") ? 409 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!req.body.notes) {
      res.status(400).json({ error: "يجب ذكر سبب الرفض" });
      return;
    }
    const result = await rejectWorkflow({
      instanceId: Number(req.params.id),
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: req.body.notes,
      overrideReason: req.body.overrideReason,
    });
    res.json(result);
  } catch (e: any) {
    const code = e.message.includes("غير موجودة") ? 404 :
                 e.message.includes("انتقال غير مصرح") ? 409 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.post("/:id/refer", async (req, res) => {
  try {
    const scope = req.scope!;
    const { referredTo, referredToName, notes, overrideReason } = req.body;
    if (!referredTo) {
      res.status(400).json({ error: "يجب تحديد الشخص المحال إليه" });
      return;
    }
    const result = await referWorkflow({
      instanceId: Number(req.params.id),
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes,
      referredTo,
      referredToName,
      overrideReason,
    });
    res.json(result);
  } catch (e: any) {
    const code = e.message.includes("غير موجودة") ? 404 :
                 e.message.includes("انتقال غير مصرح") ? 409 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.post("/:id/escalate", async (req, res) => {
  try {
    const scope = req.scope!;
    const result = await escalateWorkflow({
      instanceId: Number(req.params.id),
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: req.body.notes,
      overrideReason: req.body.overrideReason,
    });
    res.json(result);
  } catch (e: any) {
    const code = e.message.includes("غير موجودة") ? 404 :
                 e.message.includes("انتقال غير مصرح") ? 409 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.post("/:id/return", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!req.body.notes) {
      res.status(400).json({ error: "يجب ذكر سبب الإرجاع" });
      return;
    }
    const result = await returnWorkflow({
      instanceId: Number(req.params.id),
      companyId: scope.companyId,
      branchId: scope.branchId,
      actionBy: scope.activeAssignmentId,
      actionByName: scope.userName,
      notes: req.body.notes,
      overrideReason: req.body.overrideReason,
    });
    res.json(result);
  } catch (e: any) {
    const code = e.message.includes("غير موجودة") ? 404 :
                 e.message.includes("انتقال غير مصرح") ? 409 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.get("/:id/timeline", async (req, res) => {
  try {
    const scope = req.scope!;
    const result = await getTimeline(Number(req.params.id), scope.companyId);
    res.json(result);
  } catch (e: any) {
    res.status(e.message.includes("غير موجودة") ? 404 : 500).json({ error: e.message });
  }
});

router.get("/timeline/:refTable/:refId", async (req, res) => {
  try {
    const scope = req.scope!;
    const result = await getTimelineByRef(req.params.refTable, Number(req.params.refId), scope.companyId);
    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, requestType } = req.query as any;
    let where = `wi."companyId" = $1`;
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

router.get("/pending", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT wi.*
       FROM workflow_instances wi
       WHERE wi."companyId" = $1
         AND wi.status IN ('pending', 'in_review')
         AND wi."currentAssignee" = $2
       ORDER BY
         CASE wi."slaStatus"
           WHEN 'escalated' THEN 0
           WHEN 'exceeded' THEN 1
           WHEN 'warning' THEN 2
           ELSE 3
         END,
         wi."createdAt" ASC`,
      [scope.companyId, scope.activeAssignmentId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/definitions", async (req, res) => {
  try {
    const scope = req.scope!;
    const defs = await rawQuery<any>(
      `SELECT wd.*, (SELECT COUNT(*) FROM workflow_steps ws WHERE ws."definitionId" = wd.id) AS "stepCount"
       FROM workflow_definitions wd
       WHERE wd."companyId" = $1
       ORDER BY wd."requestTypeLabel"`,
      [scope.companyId]
    );
    res.json({ data: defs, total: defs.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/definitions/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [def] = await rawQuery<any>(
      `SELECT * FROM workflow_definitions WHERE id = $1 AND "companyId" = $2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!def) { res.status(404).json({ error: "التعريف غير موجود" }); return; }
    const steps = await rawQuery<any>(
      `SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder"`,
      [def.id]
    );
    res.json({ ...def, steps });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.post("/definitions", async (req, res) => {
  try {
    const scope = req.scope!;
    const { requestType, requestTypeLabel, description, isReturnable, enableEscalation, defaultSlaHours, steps } = req.body;
    if (!requestType || !requestTypeLabel) {
      res.status(400).json({ error: "نوع الطلب والعنوان مطلوبان" });
      return;
    }
    const { insertId } = await rawExecute(
      `INSERT INTO workflow_definitions ("companyId", "requestType", "requestTypeLabel", description, "isReturnable", "enableEscalation", "defaultSlaHours")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, requestType, requestTypeLabel, description ?? null, isReturnable ?? true, enableEscalation ?? true, defaultSlaHours ?? 48]
    );
    if (Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await rawExecute(
          `INSERT INTO workflow_steps ("definitionId", "stepOrder", "stepName", "requiredRole", "slaHours", "autoApproveOnTimeout", "canReject", "canRefer")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [insertId, i + 1, s.stepName, s.requiredRole, s.slaHours ?? 48, s.autoApproveOnTimeout ?? false, s.canReject ?? true, s.canRefer ?? true]
        );
      }
    }
    res.status(201).json({ id: insertId });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.put("/definitions/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { requestTypeLabel, description, isReturnable, enableEscalation, defaultSlaHours, isActive, steps } = req.body;

    await rawExecute(
      `UPDATE workflow_definitions SET "requestTypeLabel" = COALESCE($1, "requestTypeLabel"),
       description = COALESCE($2, description), "isReturnable" = COALESCE($3, "isReturnable"),
       "enableEscalation" = COALESCE($4, "enableEscalation"), "defaultSlaHours" = COALESCE($5, "defaultSlaHours"),
       "isActive" = COALESCE($6, "isActive"), "updatedAt" = NOW()
       WHERE id = $7 AND "companyId" = $8`,
      [requestTypeLabel ?? null, description ?? null, isReturnable ?? null, enableEscalation ?? null, defaultSlaHours ?? null, isActive ?? null, id, scope.companyId]
    );

    if (Array.isArray(steps)) {
      await rawExecute(`DELETE FROM workflow_steps WHERE "definitionId" = $1`, [id]);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await rawExecute(
          `INSERT INTO workflow_steps ("definitionId", "stepOrder", "stepName", "requiredRole", "slaHours", "autoApproveOnTimeout", "canReject", "canRefer")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, i + 1, s.stepName, s.requiredRole, s.slaHours ?? 48, s.autoApproveOnTimeout ?? false, s.canReject ?? true, s.canRefer ?? true]
        );
      }
    }

    const [def] = await rawQuery<any>(`SELECT * FROM workflow_definitions WHERE id = $1`, [id]);
    const updatedSteps = await rawQuery<any>(`SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder"`, [id]);
    res.json({ ...def, steps: updatedSteps });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.delete("/definitions/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(`DELETE FROM workflow_definitions WHERE id = $1 AND "companyId" = $2`, [Number(req.params.id), scope.companyId]);
    res.json({ message: "تم الحذف" });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/sla-definitions", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM sla_definitions WHERE "companyId" = $1 ORDER BY "requestType"`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.post("/sla-definitions", async (req, res) => {
  try {
    const scope = req.scope!;
    const { requestType, warningHours, deadlineHours, escalationHours, autoApproveOnTimeout, escalateTo } = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO sla_definitions ("companyId", "requestType", "warningHours", "deadlineHours", "escalationHours", "autoApproveOnTimeout", "escalateTo")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("companyId", "requestType") DO UPDATE SET
       "warningHours" = EXCLUDED."warningHours", "deadlineHours" = EXCLUDED."deadlineHours",
       "escalationHours" = EXCLUDED."escalationHours", "autoApproveOnTimeout" = EXCLUDED."autoApproveOnTimeout",
       "escalateTo" = EXCLUDED."escalateTo"`,
      [scope.companyId, requestType, warningHours ?? 24, deadlineHours ?? 48, escalationHours ?? 72, autoApproveOnTimeout ?? false, escalateTo ?? "hr_manager"]
    );
    res.status(201).json({ id: insertId });
  } catch (err) {
    handleRouteError(err, res, "workflows");
  }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const [total] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1`, [scope.companyId]);
    const [pending] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND status IN ('pending','in_review')`, [scope.companyId]);
    const [slaWarning] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "slaStatus" IN ('warning','exceeded') AND status IN ('pending','in_review')`, [scope.companyId]);
    const [escalated] = await rawQuery<any>(`SELECT COUNT(*) as count FROM workflow_instances WHERE "companyId" = $1 AND "slaStatus" = 'escalated' AND status IN ('pending','in_review')`, [scope.companyId]);
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
