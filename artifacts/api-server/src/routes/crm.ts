import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog, createNotification, emitEvent } from "../lib/businessHelpers.js";
import { registerObligation, cancelObligation, markObligationMet } from "../lib/obligationsEngine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

const router = Router();
router.use(authMiddleware);

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

// Compute the due date for the CRM follow-up obligation.
// Preference order:
// 1. expectedCloseDate if set and in the future
// 2. now + stage followUpDays (min 1 day)
function computeCrmFollowUpDue(stage: string, expectedCloseDate: string | null | undefined): Date {
  const now = Date.now();
  if (expectedCloseDate) {
    const ecd = new Date(expectedCloseDate);
    if (!Number.isNaN(ecd.getTime()) && ecd.getTime() > now) return ecd;
  }
  const cfg = STAGE_AUTO_ACTIONS[stage];
  const days = Math.max(cfg?.followUpDays ?? 3, 1);
  return new Date(now + days * 86400000);
}

const STAGE_AUTO_ACTIONS: Record<string, { followUpDays: number; description: string }> = {
  lead: { followUpDays: 0, description: 'فرصة جديدة — بدء التأهيل' },
  qualified: { followUpDays: 3, description: 'متابعة خلال 3 أيام لتقديم عرض' },
  proposal: { followUpDays: 5, description: 'تذكير بالعرض + تصعيد إن لم يُرد' },
  negotiation: { followUpDays: 1, description: 'متابعة يومية حتى الإغلاق' },
  closed_won: { followUpDays: 0, description: 'إنشاء عقد + فاتورة + تحديث KPI' },
  closed_lost: { followUpDays: 0, description: 'تسجيل سبب الخسارة + تحليل' },
};

router.get("/opportunities", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { stage, status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'o."companyId"', branchColumn: 'o."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (stage) { where += ` AND o.stage = $${paramIdx}`; params.push(stage); paramIdx++; }
    if (status) { where += ` AND o.status = $${paramIdx}`; params.push(status); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT o.*, cl.name AS "clientName", e.name AS "assigneeName" FROM crm_opportunities o LEFT JOIN clients cl ON cl.id=o."clientId" LEFT JOIN employees e ON e.id=o."assignedTo" WHERE ${where} AND o."deletedAt" IS NULL ORDER BY o.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "CRM opportunities error:"); }
});

router.post("/opportunities", requirePermission("crm:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const stage = b.stage || 'lead';
    const { insertId } = await rawExecute(
      `INSERT INTO crm_opportunities ("companyId",title,"clientId","contactName","contactPhone","contactEmail",source,stage,value,probability,"expectedCloseDate","assignedTo",notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [scope.companyId, b.title, b.clientId, b.contactName, b.contactPhone, b.contactEmail, b.source, stage, b.value || 0, b.probability || 50, b.expectedCloseDate, b.assignedTo, b.notes]
    );

    const stageConfig = STAGE_AUTO_ACTIONS[stage];
    if (stageConfig && stageConfig.followUpDays > 0) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + stageConfig.followUpDays);
      try {
        await rawExecute(
          `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,'follow_up',$2,$3,$4)`,
          [insertId, stageConfig.description, followUpDate.toISOString(), scope.userId]
        );
      } catch (actErr) { console.error("Failed to create auto activity:", actErr); }
    }

    if (b.assignedTo) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
          [b.assignedTo]
        );
        if (asgn) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: asgn.id,
            type: "crm_opportunity",
            title: "فرصة CRM جديدة مسندة إليك",
            body: `${b.title} — القيمة: ${b.value || 0} ريال — المرحلة: ${stage}`,
            priority: "normal",
            refType: "crm_opportunities",
            refId: insertId,
          }).catch(console.error);
        }
      } catch (e) { console.error("CRM notification error:", e); }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM crm_opportunities WHERE id=$1`, [insertId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "crm_opportunities",
      entityId: insertId,
      after: { title: b.title, clientId: b.clientId, value: b.value, stage },
    }).catch(console.error);

    // Register CRM follow-up obligation (skipped for terminal stages)
    if (stage !== 'closed_won' && stage !== 'closed_lost') {
      try {
        const dueAt = computeCrmFollowUpDue(stage, b.expectedCloseDate);
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "crm_opportunity",
          entityId: insertId,
          obligationType: "follow_up",
          title: `متابعة فرصة CRM — ${b.title} (${stage})`,
          dueAt: dueAt.toISOString(),
          metadata: { stage, value: b.value || 0, clientId: b.clientId ?? null, contactName: b.contactName ?? null, assignedEmployeeId: b.assignedTo ?? null },
          dedupeKey: `crm-opp-${insertId}-followup`,
          escalationSteps: [
            { hoursAfterDue: 24, notifyRole: "sales_manager" },
            { hoursAfterDue: 72, notifyRole: "general_manager" },
          ],
        });
      } catch (obErr) { console.error("CRM opportunity obligation failed:", obErr); }
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "crm.opportunity.created",
      entity: "crm_opportunities",
      entityId: insertId,
      details: `فرصة جديدة: ${b.title} — ${b.value || 0} ريال — ${stage}`,
    }).catch(console.error);

    res.status(201).json({ ...row, autoAction: stageConfig?.description });
  } catch (err) { handleRouteError(err, res, "Create opportunity error:"); }
});

router.patch("/opportunities/:id", requirePermission("crm:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const oppId = Number(req.params.id);
    const b = req.body;

    const [existing] = await rawQuery<any>(`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2`, [oppId, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الفرصة غير موجودة" }); return; }

    if ((b.stage === 'closed_won' || b.stage === 'closed_lost') && existing.stage !== b.stage) {
      const hasClientInfo = existing.clientId || existing.contactName || b.clientId || b.contactName;
      if (!hasClientInfo) {
        res.status(422).json({ error: "لا يمكن إغلاق الصفقة بدون بيانات العميل (clientId أو contactName مطلوب)", field: "clientId" });
        return;
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.stage !== undefined) { params.push(b.stage); sets.push(`stage=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.lostReason !== undefined) { params.push(b.lostReason); sets.push(`"lostReason"=$${params.length}`); }
    if (b.value !== undefined) { params.push(b.value); sets.push(`value=$${params.length}`); }
    if (b.probability !== undefined) { params.push(b.probability); sets.push(`probability=$${params.length}`); }
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.assignedTo !== undefined) { params.push(b.assignedTo); sets.push(`"assignedTo"=$${params.length}`); }
    if (b.clientId !== undefined) { params.push(b.clientId || null); sets.push(`"clientId"=$${params.length}`); }
    if (b.contactName !== undefined) { params.push(b.contactName); sets.push(`"contactName"=$${params.length}`); }
    if (b.contactPhone !== undefined) { params.push(b.contactPhone); sets.push(`"contactPhone"=$${params.length}`); }
    if (b.contactEmail !== undefined) { params.push(b.contactEmail); sets.push(`"contactEmail"=$${params.length}`); }
    if (b.expectedCloseDate !== undefined) { params.push(b.expectedCloseDate || null); sets.push(`"expectedCloseDate"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.source !== undefined) { params.push(b.source); sets.push(`source=$${params.length}`); }
    params.push(oppId);
    await rawExecute(`UPDATE crm_opportunities SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    let autoActions: string[] = [];

    if (b.stage && b.stage !== existing.stage) {
      const stageConfig = STAGE_AUTO_ACTIONS[b.stage];

      if (stageConfig && stageConfig.followUpDays > 0) {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + stageConfig.followUpDays);
        try {
          await rawExecute(
            `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,'follow_up',$2,$3,$4)`,
            [oppId, `[تلقائي] ${stageConfig.description}`, followUpDate.toISOString(), scope.userId]
          );
          autoActions.push(`متابعة تلقائية بعد ${stageConfig.followUpDays} أيام`);
        } catch (actErr) { console.error("Auto activity creation failed:", actErr); }
      }

      if (b.stage === 'proposal') {
        const escalationDate = new Date();
        escalationDate.setDate(escalationDate.getDate() + 7);
        try {
          await rawExecute(
            `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,'escalation',$2,$3,$4)`,
            [oppId, '[تلقائي] تصعيد — لم يرد العميل على العرض خلال أسبوع', escalationDate.toISOString(), scope.userId]
          );
          autoActions.push('تصعيد تلقائي بعد 7 أيام إن لم يُرد');
        } catch (e) { console.error("Escalation activity error:", e); }
      }

      if (existing.assignedTo) {
        try {
          const [asgn] = await rawQuery<any>(
            `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
            [existing.assignedTo]
          );
          if (asgn) {
            createNotification({
              companyId: scope.companyId,
              assignmentId: asgn.id,
              type: "crm_stage_change",
              title: `تحديث مرحلة: ${existing.title}`,
              body: `انتقلت الفرصة من "${existing.stage}" إلى "${b.stage}" — ${stageConfig?.description || ''}`,
              priority: "normal",
              refType: "crm_opportunities",
              refId: oppId,
            }).catch(console.error);
          }
        } catch (e) { console.error("Stage change notification error:", e); }
      }
    }

    if (b.stage === 'closed_won' && existing.stage !== 'closed_won') {
      await handleDealWon(scope, existing, b.value ?? existing.value);
      autoActions.push('إنشاء عقد + فاتورة + تحديث إيرادات العميل');
      // Mark follow-up obligation as met and emit deal-won event
      await markObligationMet(scope.companyId, "crm_opportunity", oppId, "follow_up").catch(console.error);
      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "crm.deal.won",
        entity: "crm_opportunities",
        entityId: oppId,
        details: `صفقة ناجحة: ${existing.title} — ${b.value ?? existing.value} ريال`,
      }).catch(console.error);
    }

    if (b.stage === 'closed_lost' && existing.stage !== 'closed_lost') {
      autoActions.push('تسجيل سبب الخسارة');
      try {
        await rawExecute(
          `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","completedAt","createdBy") VALUES ($1,'analysis',$2,NOW(),NOW(),$3)`,
          [oppId, `تحليل خسارة: ${b.lostReason || 'غير محدد'} — القيمة المفقودة: ${existing.value} ريال`, scope.userId]
        );
      } catch (e) { console.error("Lost analysis error:", e); }
      // Cancel follow-up obligation and emit deal-lost event
      await cancelObligation(scope.companyId, "crm_opportunity", oppId).catch(console.error);
      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "crm.deal.lost",
        entity: "crm_opportunities",
        entityId: oppId,
        details: `صفقة خاسرة: ${existing.title} — السبب: ${b.lostReason || 'غير محدد'}`,
      }).catch(console.error);
    }

    // Stage change (non-terminal) → refresh follow-up obligation window
    if (
      b.stage && b.stage !== existing.stage &&
      b.stage !== 'closed_won' && b.stage !== 'closed_lost'
    ) {
      try {
        await cancelObligation(scope.companyId, "crm_opportunity", oppId);
        const effectiveEcd = b.expectedCloseDate !== undefined ? b.expectedCloseDate : existing.expectedCloseDate;
        const dueAt = computeCrmFollowUpDue(b.stage, effectiveEcd);
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "crm_opportunity",
          entityId: oppId,
          obligationType: "follow_up",
          title: `متابعة فرصة CRM — ${existing.title} (${b.stage})`,
          dueAt: dueAt.toISOString(),
          metadata: { stage: b.stage, value: b.value ?? existing.value, clientId: existing.clientId, assignedEmployeeId: b.assignedTo ?? existing.assignedTo ?? null },
          dedupeKey: `crm-opp-${oppId}-followup-${b.stage}`,
          escalationSteps: [
            { hoursAfterDue: 24, notifyRole: "sales_manager" },
            { hoursAfterDue: 72, notifyRole: "general_manager" },
          ],
        });
      } catch (obErr) { console.error("CRM stage-change obligation refresh failed:", obErr); }

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "crm.opportunity.stage_changed",
        entity: "crm_opportunities",
        entityId: oppId,
        details: `تغيير مرحلة: ${existing.title} — من ${existing.stage} إلى ${b.stage}`,
      }).catch(console.error);
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "crm_opportunities", entityId: oppId,
      before: { stage: existing.stage, status: existing.status },
      after: { stage: b.stage || existing.stage, status: b.status || existing.status },
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM crm_opportunities WHERE id=$1`, [oppId]);
    res.json({ ...row, autoActions });
  } catch (err) { handleRouteError(err, res, "Update opportunity error:"); }
});

async function handleDealWon(scope: any, opp: any, dealValue: number) {
  try {
    let clientId = opp.clientId;

    if (!clientId && opp.contactName) {
      const existing = await rawQuery<any>(
        `SELECT id FROM clients WHERE "companyId"=$1 AND (name=$2 OR phone=$3 OR email=$4) LIMIT 1`,
        [scope.companyId, opp.contactName || '', opp.contactPhone || '', opp.contactEmail || '']
      );
      if (existing.length > 0) {
        clientId = existing[0].id;
      } else {
        const { insertId: newClientId } = await rawExecute(
          `INSERT INTO clients ("companyId",name,phone,email,source,classification) VALUES ($1,$2,$3,$4,'crm','regular')`,
          [scope.companyId, opp.contactName, opp.contactPhone || null, opp.contactEmail || null]
        );
        clientId = newClientId;
      }
      await rawExecute(`UPDATE crm_opportunities SET "clientId"=$1 WHERE id=$2`, [clientId, opp.id]);
    }

    const contractRef = `CTR-CRM-${Date.now().toString(36).toUpperCase()}`;
    const contractStart = new Date().toISOString().split('T')[0];
    const contractEnd = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    try {
      await rawExecute(
        `INSERT INTO legal_contracts ("companyId",ref,title,"contractType","partyName","startDate","endDate",value,status,"createdBy") VALUES ($1,$2,$3,'service',$4,$5,$6,$7,'active',$8)`,
        [scope.companyId, contractRef, `عقد خدمات - ${opp.title}`, opp.contactName || 'عميل', contractStart, contractEnd, dealValue, scope.userId]
      );
    } catch (contractErr) {
      console.error("Failed to create legal contract for deal-won:", contractErr);
    }

    const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
    const yearShort = String(new Date().getFullYear()).slice(2);
    const invoiceRef = `INV-CRM-${yearShort}${monthNum}-${opp.id}`;
    const vatAmount = dealValue * 0.15;
    const totalAmount = dealValue + vatAmount;
    try {
      await rawExecute(
        `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,15,0,'draft',$8,$9)`,
        [scope.companyId, clientId, invoiceRef, `فاتورة أولى - ${opp.title}`, dealValue, totalAmount, vatAmount, new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], scope.userId]
      );
    } catch (invoiceErr) {
      console.error("Failed to create invoice for deal-won:", invoiceErr);
    }

    if (clientId) {
      try {
        await rawExecute(`UPDATE clients SET "totalRevenue"=COALESCE("totalRevenue",0)+$1 WHERE id=$2`, [dealValue, clientId]);
      } catch (revenueErr) {
        console.error("Failed to update client totalRevenue:", revenueErr);
      }
    }

    if (opp.assignedTo) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
          [opp.assignedTo]
        );
        if (asgn) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: asgn.id,
            type: "deal_won",
            title: `صفقة ناجحة: ${opp.title}`,
            body: `تم إغلاق الصفقة بقيمة ${dealValue} ريال — تم إنشاء عقد وفاتورة تلقائياً`,
            priority: "normal",
            refType: "crm_opportunities",
            refId: opp.id,
          }).catch(console.error);
        }
      } catch (e) { console.error("Deal won notification error:", e); }
    }
  } catch (err) {
    console.error("Handle deal won error:", err);
  }
}

router.get("/opportunities/:id", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT o.*, cl.name AS "clientName", e.name AS "assigneeName" FROM crm_opportunities o LEFT JOIN clients cl ON cl.id=o."clientId" LEFT JOIN employees e ON e.id=o."assignedTo" WHERE o.id=$1 AND o."companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "الفرصة غير موجودة" }); return; }

    const activities = await rawQuery<any>(
      `SELECT * FROM crm_activities WHERE "opportunityId"=$1 ORDER BY "scheduledAt" DESC`,
      [row.id]
    );
    const overdueActivities = activities.filter((a: any) => !a.completedAt && new Date(a.scheduledAt) < new Date());

    res.json({
      ...row, activities, overdueActivities,
      stageConfig: STAGE_AUTO_ACTIONS[row.stage],
      nextStages: row.stage === 'closed_won' || row.stage === 'closed_lost' ? [] : STAGE_ORDER.slice(STAGE_ORDER.indexOf(row.stage) + 1),
    });
  } catch (err) { handleRouteError(err, res, "Get opportunity error:"); }
});

router.delete("/opportunities/:id", requirePermission("crm:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الفرصة غير موجودة" }); return; }
    await rawExecute(`UPDATE crm_opportunities SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    await cancelObligation(scope.companyId, "crm_opportunity", id).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "crm.opportunity.deleted",
      entity: "crm_opportunities",
      entityId: id,
      details: `حذف فرصة CRM`,
    }).catch(console.error);
    res.json({ message: "تم حذف الفرصة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete opportunity error:"); }
});

router.get("/opportunities/:id/activities", requirePermission("crm:read"), async (req, res) => {
  try {
    const rows = await rawQuery<any>(`SELECT * FROM crm_activities WHERE "opportunityId"=$1 ORDER BY "createdAt" DESC`, [Number(req.params.id)]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "CRM activities error:"); }
});

router.post("/opportunities/:id/activities", requirePermission("crm:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,$2,$3,$4,$5)`,
      [Number(req.params.id), b.type, b.description, b.scheduledAt, scope.userId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM crm_activities WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create activity error:"); }
});

router.get("/pipeline", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const result: any[] = [];
    for (const stage of STAGE_ORDER) {
      const [row] = await rawQuery<any>(`SELECT COUNT(*) as count, COALESCE(SUM(value),0) as value FROM crm_opportunities WHERE "companyId"=$1 AND stage=$2`, [scope.companyId, stage]);
      result.push({ stage, count: Number(row.count), value: Number(row.value), autoAction: STAGE_AUTO_ACTIONS[stage]?.description });
    }
    res.json({ data: result, total: result.length, page: 1, pageSize: result.length });
  } catch (err) { handleRouteError(err, res, "CRM pipeline error:"); }
});

router.post("/followup-check", requirePermission("crm:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const overdueActivities = await rawQuery<any>(
      `SELECT ca.*, co.title AS "oppTitle", co.stage, co."assignedTo", e.name AS "assigneeName"
       FROM crm_activities ca
       JOIN crm_opportunities co ON co.id=ca."opportunityId"
       LEFT JOIN employees e ON e.id=co."assignedTo"
       WHERE co."companyId"=$1 AND ca."completedAt" IS NULL AND ca."scheduledAt" < NOW()
       ORDER BY ca."scheduledAt" ASC`,
      [scope.companyId]
    );

    const escalated: any[] = [];
    for (const activity of overdueActivities) {
      const overdueDays = Math.floor((Date.now() - new Date(activity.scheduledAt).getTime()) / (1000 * 60 * 60 * 24));
      if (overdueDays >= 3 && activity.assignedTo) {
        try {
          const [asgn] = await rawQuery<any>(
            `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
            [activity.assignedTo]
          );
          if (asgn) {
            createNotification({
              companyId: scope.companyId,
              assignmentId: asgn.id,
              type: "crm_overdue",
              title: `متابعة متأخرة: ${activity.oppTitle}`,
              body: `نشاط متأخر ${overdueDays} أيام: ${activity.description?.substring(0, 100)}`,
              priority: "high",
              refType: "crm_opportunities",
              refId: activity.opportunityId,
            }).catch(console.error);
          }
        } catch (e) { console.error("Follow-up escalation error:", e); }
        escalated.push({ activityId: activity.id, oppTitle: activity.oppTitle, overdueDays });
      }
    }

    res.json({ totalOverdue: overdueActivities.length, escalated: escalated.length, details: escalated });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/analytics", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const conversionRates: any[] = [];
    let prevCount: number | null = null;
    for (const stage of STAGE_ORDER) {
      const [row] = await rawQuery<any>(`SELECT COUNT(*) as count FROM crm_opportunities WHERE "companyId"=$1 AND stage=$2`, [cid, stage]);
      const count = Number(row.count);
      const rate = prevCount !== null && prevCount > 0 ? ((count / prevCount) * 100).toFixed(1) : null;
      conversionRates.push({ stage, count, conversionFromPrev: rate });
      if (!['closed_won', 'closed_lost'].includes(stage)) prevCount = count;
    }

    const [avgDeal] = await rawQuery<any>(
      `SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt"::timestamp - "createdAt"::timestamp))/86400) AS "avgDays" FROM crm_opportunities WHERE "companyId"=$1 AND stage='closed_won'`,
      [cid]
    );
    const [revenue] = await rawQuery<any>(
      `SELECT COALESCE(SUM(value) FILTER (WHERE stage='closed_won'),0) AS "wonRevenue", COALESCE(SUM(value) FILTER (WHERE status='open'),0) AS "forecast" FROM crm_opportunities WHERE "companyId"=$1`,
      [cid]
    );
    const [lostAnalysis] = await rawQuery<any>(
      `SELECT COUNT(*) as "lostCount", COALESCE(SUM(value),0) as "lostValue" FROM crm_opportunities WHERE "companyId"=$1 AND stage='closed_lost'`,
      [cid]
    );

    res.json({
      conversionRates,
      avgDealDays: Number(avgDeal?.avgDays || 0).toFixed(1),
      wonRevenue: Number(revenue.wonRevenue),
      forecastRevenue: Number(revenue.forecast),
      lostCount: Number(lostAnalysis.lostCount),
      lostValue: Number(lostAnalysis.lostValue),
    });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/stats", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [opp] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COALESCE(SUM(value) FILTER (WHERE stage='closed_won'),0) as "wonValue", COALESCE(SUM(value) FILTER (WHERE status='open'),0) as "pipelineValue" FROM crm_opportunities WHERE "companyId"=$1`, [cid]);
    const [overdue] = await rawQuery<any>(
      `SELECT COUNT(*) as count FROM crm_activities ca JOIN crm_opportunities co ON co.id=ca."opportunityId" WHERE co."companyId"=$1 AND ca."completedAt" IS NULL AND ca."scheduledAt" < NOW()`,
      [cid]
    );
    res.json({
      totalOpportunities: Number(opp.total), openOpportunities: Number(opp.open),
      wonValue: Number(opp.wonValue), pipelineValue: Number(opp.pipelineValue),
      overdueFollowUps: Number(overdue.count),
    });
  } catch (err) { handleRouteError(err, res, "CRM stats error:"); }
});

export default router;
