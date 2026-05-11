import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { pushToDLQ } from "../lib/eventBus.js";
import { applyTransition } from "../lib/lifecycleEngine.js";


export const collectionRouter = Router();
collectionRouter.use(authMiddleware);

const collectionActionSchema = z.object({
  stage: z.coerce.number(),
  notes: z.string().optional(),
});

const COLLECTION_STAGES = [
  { stage: 1, name: "sms_email_reminder", label: "تذكير SMS + إيميل", daysOverdue: 1 },
  { stage: 2, name: "accountant_notification", label: "إشعار محاسب + إيميل ثاني", daysOverdue: 7 },
  { stage: 3, name: "field_collection", label: "مهمة تحصيل ميداني", daysOverdue: 14 },
  { stage: 4, name: "cfo_escalation", label: "تصعيد للمدير المالي", daysOverdue: 21 },
  { stage: 5, name: "gm_penalty", label: "إشعار GM + غرامة 2%", daysOverdue: 30 },
  { stage: 6, name: "legal_churned", label: "إشعار القانونية + تصنيف churned", daysOverdue: 60 },
];

collectionRouter.get("/collection", authorize({ feature: "finance.collection", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'i."companyId"', branchColumn: 'i."branchId"', enforceBranchScope: true });
    const overdueInvoices = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", i."dueDate",
              i.status, c.name AS "clientName", c.phone AS "clientPhone",
              CURRENT_DATE - i."dueDate" AS "daysOverdue",
              ics.stage AS "currentStage", ics."stageName" AS "currentStageName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       LEFT JOIN LATERAL (
         SELECT stage, "stageName"
         FROM invoice_collection_stages
         WHERE "invoiceId" = i.id AND "companyId" = i."companyId"
         ORDER BY id DESC LIMIT 1
       ) ics ON true
       WHERE ${where} AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" < CURRENT_DATE
       ORDER BY i."dueDate" ASC
       LIMIT 500`,
      params
    );

    const enriched = overdueInvoices.map((inv: any) => {
      const daysOverdue = Number(inv.daysOverdue ?? 0);
      const recommendedStage = COLLECTION_STAGES.reduce(
        (acc, s) => (daysOverdue >= s.daysOverdue ? s : acc),
        COLLECTION_STAGES[0]
      );
      return {
        ...inv,
        daysOverdue,
        currentStage: inv.currentStage ?? 0,
        recommendedStage: recommendedStage.stage,
        recommendedAction: recommendedStage.label,
      };
    });

    res.json(maskFields(req, enriched));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

collectionRouter.post("/collection/:invoiceId/action", authorize({ feature: "finance.collection", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const invoiceId = parseId(req.params.invoiceId, "invoiceId");
    const { stage, notes } = zodParse(collectionActionSchema.safeParse(req.body ?? {}));

    const [invoice] = await rawQuery<any>(
      `SELECT id, ref, status, "dueDate",
              EXTRACT(DAY FROM NOW() - "dueDate"::timestamptz)::int AS "daysOverdue"
       FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [invoiceId, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    const requestedStage = Number(stage);
    const stageInfo = COLLECTION_STAGES.find((s) => s.stage === requestedStage);
    if (!stageInfo) {
      throw new ValidationError("مرحلة التحصيل غير معرّفة", {
        field: "stage",
        fix: `استخدم إحدى المراحل: ${COLLECTION_STAGES.map((s) => s.stage).join(", ")}`,
        meta: { validStages: COLLECTION_STAGES.map((s) => s.stage) },
      });
    }

    const daysOverdue = Number(invoice.daysOverdue ?? 0);
    if (daysOverdue < stageInfo.daysOverdue) {
      throw new ValidationError(
        `هذه المرحلة تتطلب تأخراً ${stageInfo.daysOverdue} يوم على الأقل. التأخر الحالي: ${daysOverdue} يوم`,
        {
          field: "stage",
          fix: `انتظر حتى يبلغ التأخر ${stageInfo.daysOverdue} يوماً قبل تطبيق هذه المرحلة`,
          meta: {
            requiredDaysOverdue: stageInfo.daysOverdue,
            currentDaysOverdue: daysOverdue,
          },
        },
      );
    }

    const [lastStageRecord] = await rawQuery<any>(
      `SELECT stage FROM invoice_collection_stages WHERE "invoiceId" = $1 AND "companyId" = $2 ORDER BY id DESC LIMIT 1`,
      [invoiceId, scope.companyId]
    );
    const lastStage = lastStageRecord ? Number(lastStageRecord.stage) : 0;
    if (requestedStage <= lastStage || requestedStage > lastStage + 1) {
      throw new ValidationError(
        `يجب اتباع المراحل بالتسلسل. المرحلة المتوقعة: ${lastStage + 1}، المطلوب: ${requestedStage}`,
        {
          field: "stage",
          fix: `طبّق المرحلة ${lastStage + 1} أولاً`,
          meta: {
            expectedStage: lastStage + 1,
            requestedStage,
          },
        },
      );
    }

    if (invoice.status !== "overdue") {
      await applyTransition({
        entity: "invoices",
        id: invoiceId,
        scope,
        action: "invoice.overdue",
        fromStates: ["sent", "posted", "partial"],
        toState: "overdue",
      });
    }

    await rawExecute(
      `INSERT INTO invoice_collection_stages ("companyId","invoiceId",stage,"stageName",notes,"performedBy")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, invoiceId, stageInfo.stage, stageInfo.name, notes ?? null, scope.activeAssignmentId]
    );

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: `collection.${stageInfo.name}`, entity: "invoices", entityId: invoiceId,
      details: JSON.stringify({ stage: stageInfo.stage, label: stageInfo.label, notes }),
    }).catch((err) => pushToDLQ("event", { action: `collection.${stageInfo.name}`, entityId: invoiceId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: `collection.stage_${stage}`, entity: "invoices", entityId: invoiceId,
      after: { stage: stageInfo.stage, action: stageInfo.name, notes },
    }).catch((err) => pushToDLQ("audit", { entity: "invoices", entityId: invoiceId }, err, scope.companyId));

    res.json({ message: `تم تسجيل إجراء التحصيل: ${stageInfo.label}`, stage: stageInfo });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

collectionRouter.get("/collection/:invoiceId/history", authorize({ feature: "finance.collection", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const invoiceId = parseId(req.params.invoiceId, "invoiceId");

    const [invoice] = await rawQuery<any>(
      `SELECT id FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [invoiceId, scope.companyId]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");

    const history = await rawQuery<any>(
      `SELECT ics.*, e.name AS "performedByName"
       FROM invoice_collection_stages ics
       LEFT JOIN employee_assignments ea ON ea.id = ics."performedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE ics."invoiceId" = $1 AND ics."companyId" = $2
       ORDER BY ics.id ASC`,
      [invoiceId, scope.companyId]
    );

    res.json(maskFields(req, history));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});
