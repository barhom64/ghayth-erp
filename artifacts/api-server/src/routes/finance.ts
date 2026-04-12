import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  createJournalEntry,
  initiateApprovalChain,
  processApprovalStep,
  haversineDistance,
  validateBudget,
  updateBudgetUsed,
  getManagerAssignmentId,
  getDirectorAssignmentId,
  checkFinancialPeriodOpen,
  getAccountCodeFromMapping,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { submitWorkflow } from "../lib/workflowEngine.js";

const router = Router();
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// Role-based access helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Finance-capable roles: finance_manager, general_manager, owner */
const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];
/** Procurement roles: procurement, finance_manager, general_manager, owner */
const PROCUREMENT_ROLES = ["procurement", "finance_manager", "general_manager", "owner"];
/** Approval roles for purchase requests: branch_manager, general_manager, owner */
const PR_APPROVAL_ROLES = ["branch_manager", "general_manager", "owner"];
/** Payroll roles: hr_manager, finance_manager, general_manager, owner */
const PAYROLL_ROLES = ["hr_manager", "finance_manager", "general_manager", "owner"];

function requireRole(scope: any, allowedRoles: string[], res: any): boolean {
  if (!allowedRoles.includes(scope.role)) {
    res.status(403).json({
      error: "ليس لديك الصلاحية للقيام بهذا الإجراء",
      requiredRoles: allowedRoles,
      yourRole: scope.role,
    });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTION PIPELINE – 6 stages for overdue invoices
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTION_STAGES = [
  { stage: 1, name: "sms_email_reminder", label: "تذكير SMS + إيميل", daysOverdue: 1 },
  { stage: 2, name: "accountant_notification", label: "إشعار محاسب + إيميل ثاني", daysOverdue: 7 },
  { stage: 3, name: "field_collection", label: "مهمة تحصيل ميداني", daysOverdue: 14 },
  { stage: 4, name: "cfo_escalation", label: "تصعيد للمدير المالي", daysOverdue: 21 },
  { stage: 5, name: "gm_penalty", label: "إشعار GM + غرامة 2%", daysOverdue: 30 },
  { stage: 6, name: "legal_churned", label: "إشعار القانونية + تصنيف churned", daysOverdue: 60 },
];

router.get("/collection", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'i."companyId"', branchColumn: 'i."branchId"' });
    const overdueInvoices = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", i."dueDate",
              i.status, c.name AS "clientName", c.phone AS "clientPhone",
              CURRENT_DATE - i."dueDate" AS "daysOverdue",
              ics.stage AS "currentStage", ics."stageName" AS "currentStageName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       LEFT JOIN LATERAL (
         SELECT stage, "stageName"
         FROM invoice_collection_stages
         WHERE "invoiceId" = i.id
         ORDER BY id DESC LIMIT 1
       ) ics ON true
       WHERE ${where} AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
         AND i."dueDate" < CURRENT_DATE
       ORDER BY i."dueDate" ASC`,
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

    res.json(enriched);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.post("/collection/:invoiceId/action", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { invoiceId } = req.params;
    const { stage, notes } = req.body as any;

    const [invoice] = await rawQuery<any>(
      `SELECT id, ref, status, "dueDate",
              EXTRACT(DAY FROM NOW() - "dueDate"::timestamptz)::int AS "daysOverdue"
       FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(invoiceId), scope.companyId]
    );
    if (!invoice) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }

    const requestedStage = Number(stage);
    const stageInfo = COLLECTION_STAGES.find((s) => s.stage === requestedStage);
    if (!stageInfo) {
      res.status(400).json({ error: "مرحلة التحصيل غير معرّفة", validStages: COLLECTION_STAGES.map((s) => s.stage) });
      return;
    }

    const daysOverdue = Number(invoice.daysOverdue ?? 0);

    // Enforce minimum overdue days required for this stage
    if (daysOverdue < stageInfo.daysOverdue) {
      res.status(400).json({
        error: `هذه المرحلة تتطلب تأخراً ${stageInfo.daysOverdue} يوم على الأقل. التأخر الحالي: ${daysOverdue} يوم`,
        requiredDaysOverdue: stageInfo.daysOverdue,
        currentDaysOverdue: daysOverdue,
      });
      return;
    }

    // Enforce sequential stage progression (no backward jumps or large skips)
    const [lastStageRecord] = await rawQuery<any>(
      `SELECT stage FROM invoice_collection_stages
       WHERE "invoiceId" = $1 ORDER BY id DESC LIMIT 1`,
      [Number(invoiceId)]
    );
    const lastStage = lastStageRecord ? Number(lastStageRecord.stage) : 0;
    if (requestedStage <= lastStage || requestedStage > lastStage + 1) {
      res.status(400).json({
        error: `يجب اتباع المراحل بالتسلسل. المرحلة المتوقعة: ${lastStage + 1}، المطلوب: ${requestedStage}`,
        expectedStage: lastStage + 1,
        requestedStage,
      });
      return;
    }

    if (invoice.status !== "overdue") {
      await rawExecute(
        `UPDATE invoices SET status = 'overdue' WHERE id = $1`,
        [Number(invoiceId)]
      );
    }

    await rawExecute(
      `INSERT INTO invoice_collection_stages ("companyId","invoiceId",stage,"stageName",notes,"performedBy")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, Number(invoiceId), stageInfo.stage, stageInfo.name, notes ?? null, scope.activeAssignmentId]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: `collection.${stageInfo.name}`,
      entity: "invoices",
      entityId: Number(invoiceId),
      details: JSON.stringify({ stage: stageInfo.stage, label: stageInfo.label, notes }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: `collection.stage_${stage}`,
      entity: "invoices",
      entityId: Number(invoiceId),
      after: { stage: stageInfo.stage, action: stageInfo.name, notes },
    }).catch(console.error);

    res.json({ message: `تم تسجيل إجراء التحصيل: ${stageInfo.label}`, stage: stageInfo });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Get collection history for a specific invoice
router.get("/collection/:invoiceId/history", async (req, res) => {
  try {
    const scope = req.scope!;
    const { invoiceId } = req.params;

    const [invoice] = await rawQuery<any>(
      `SELECT id FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(invoiceId), scope.companyId]
    );
    if (!invoice) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }

    const history = await rawQuery<any>(
      `SELECT ics.*, e.name AS "performedByName"
       FROM invoice_collection_stages ics
       LEFT JOIN employee_assignments ea ON ea.id = ics."performedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE ics."invoiceId" = $1
       ORDER BY ics.id ASC`,
      [Number(invoiceId)]
    );

    res.json(history);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET – 4-level validation
// ─────────────────────────────────────────────────────────────────────────────

router.get("/budget", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'b."companyId"', branchColumn: 'b."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT b.*, coa.name AS "accountName"
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
       WHERE ${where}
       ORDER BY b.period DESC, b."accountCode"`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

router.post("/budget", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const { accountCode, period, amount, branchId } = req.body as any;
    if (!accountCode || !period || !amount) {
      res.status(400).json({ error: "الحساب والفترة والمبلغ مطلوبة" });
      return;
    }
    const { insertId } = await rawExecute(
      `INSERT INTO budgets ("companyId","branchId","accountCode",period,amount,used)
       VALUES ($1,$2,$3,$4,$5,0)
       ON CONFLICT DO NOTHING`,
      [scope.companyId, branchId ?? scope.branchId, accountCode, period, Number(amount)]
    );
    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) {
    handleRouteError(err, res, "Create budget error:");
  }
});

// Budget validation endpoint: check if expense can be approved
router.post("/budget/validate", async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode, amount, period } = req.body as any;
    if (!accountCode || !amount) {
      res.status(400).json({ error: "الحساب والمبلغ مطلوبان" });
      return;
    }

    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const [budget] = await rawQuery<any>(
      `SELECT amount, used FROM budgets
       WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`,
      [scope.companyId, accountCode, targetPeriod]
    );

    if (!budget) {
      res.json({ status: "no_budget", message: "لا توجد ميزانية محددة لهذا الحساب", canProceed: true });
      return;
    }

    const budgetAmount = Number(budget.amount);
    const usedAmount = Number(budget.used);
    const newUsed = usedAmount + Number(amount);
    const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;

    if (utilization <= 80) {
      res.json({
        status: "auto_approved",
        message: "الميزانية متاحة – موافقة تلقائية",
        utilization: Math.round(utilization),
        canProceed: true,
        requiresApproval: false,
      });
    } else if (utilization <= 99) {
      res.json({
        status: "warning_cfo",
        message: "تحذير: استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
        utilization: Math.round(utilization),
        canProceed: true,
        requiresApproval: true,
        approvalLevel: "cfo",
      });
    } else if (utilization <= 110) {
      res.json({
        status: "blocked_gm",
        message: "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط",
        utilization: Math.round(utilization),
        canProceed: true,
        requiresApproval: true,
        approvalLevel: "general_manager",
        note: "حظر – يتطلب موافقة المدير العام حصراً",
      });
    } else {
      res.json({
        status: "rejected",
        message: "تجاوز الميزانية أكثر من 110% – رفض نهائي",
        utilization: Math.round(utilization),
        canProceed: false,
        requiresApproval: false,
        blocked: true,
      });
    }
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/expenses", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt", je.status,
              je."costCenter", je."departmentId", je."relatedEntityType", je."relatedEntityId",
              je."paymentMethod", je.reference, je."isPaid", je."attachmentUrl", je."attachmentType",
              je."expenseType", je."operationType",
              je."govSyncEnabled", je."govIntegrationId", je."govEntityType", je."govEntityId",
              json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines,
              MAX(coa.name) FILTER (WHERE jl.debit > 0) AS "accountName",
              COALESCE(SUM(jl.debit), 0) AS amount
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
       WHERE ${where} AND je.ref LIKE 'EXP%' AND je."deletedAt" IS NULL
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status,
                je."costCenter", je."departmentId", je."relatedEntityType", je."relatedEntityId",
                je."paymentMethod", je.reference, je."isPaid", je."attachmentUrl", je."attachmentType",
                je."expenseType", je."operationType",
                je."govSyncEnabled", je."govIntegrationId", je."govEntityType", je."govEntityId"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    console.error("Get expenses error:", err);
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DESCRIPTION GENERATOR – smart description based on operation type
// ─────────────────────────────────────────────────────────────────────────────
function generateAutoDescription(params: {
  operationType: string;
  relatedEntityName?: string;
  period?: string;
  branchName?: string;
  amount?: number;
  expenseType?: string;
}): string {
  const { operationType, relatedEntityName, period, branchName, amount, expenseType } = params;
  const periodLabel = period ? ` / شهر ${period}` : "";
  const branchLabel = branchName ? ` / فرع ${branchName}` : "";
  const entityLabel = relatedEntityName ? ` / ${relatedEntityName}` : "";
  const amountLabel = amount ? ` / ${amount.toLocaleString("ar-SA")} ريال` : "";

  const typeMap: Record<string, string> = {
    salary: `صرف راتب${entityLabel}${periodLabel}${branchLabel}`,
    advance: `صرف سلفة للموظف${entityLabel}${periodLabel}${branchLabel}`,
    fuel: `مصروف وقود${entityLabel}${branchLabel}${amountLabel}`,
    maintenance: `مصروف صيانة مركبة${entityLabel}${branchLabel}${amountLabel}`,
    rent: `تحصيل إيجار${entityLabel}${branchLabel}${periodLabel}`,
    vendor_invoice: `فاتورة مورد${entityLabel}${amountLabel}`,
    legal_fee: `أتعاب قانونية${entityLabel}${amountLabel}`,
    purchase: `مشتريات${entityLabel}${amountLabel}`,
    custody: `عهدة${entityLabel}${periodLabel}`,
    insurance: `تأمين${entityLabel}${amountLabel}`,
    receipt: `قبض إيراد${entityLabel}${amountLabel}`,
    payment: `صرف مبلغ${entityLabel}${amountLabel}`,
    expense: `مصروف ${expenseType || "عام"}${entityLabel}${branchLabel}${amountLabel}`,
  };

  return typeMap[operationType] || `عملية مالية${entityLabel}${branchLabel}${amountLabel}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENT REQUIREMENT CHECKER
// ─────────────────────────────────────────────────────────────────────────────
function checkAttachmentRequired(params: {
  operationType: string;
  amount?: number;
  hasAttachment?: boolean;
}): { required: boolean; reason?: string } {
  const { operationType, amount = 0, hasAttachment } = params;
  const HIGH_VALUE_THRESHOLD = 5000;
  const attachmentRequiredTypes = ["vendor_invoice", "purchase", "custody_settlement", "advance_claim", "legal_fee"];

  if (attachmentRequiredTypes.includes(operationType)) {
    return { required: true, reason: `المرفقات إلزامية لعمليات من نوع: ${operationType}` };
  }
  if (amount >= HIGH_VALUE_THRESHOLD && operationType === "payment") {
    return { required: true, reason: `المرفقات إلزامية لسندات الصرف الكبيرة (أكثر من ${HIGH_VALUE_THRESHOLD.toLocaleString()} ريال)` };
  }
  return { required: false };
}

router.post("/expenses", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const {
      accountCode, amount, description, period, sourceAccountCode,
      branchId, companyId: bodyCompanyId, departmentId, costCenter, expenseType, subAccountCode,
      relatedEntityType, relatedEntityId, relatedEntityName,
      paymentMethod, vatRate: rawVatRate, vatAmount: rawVatAmount,
      reference, status: reqStatus, isPaid,
      attachmentUrl, attachmentType, operationType,
      autoDescription, projectId, taxCategory,
      isTaxLinked, invoiceTypeCode, taxCategoryCode, exemptionReason,
      govSyncEnabled, govIntegrationId, govEntityType, govEntityId,
    } = req.body as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (isTaxLinked) {
      const validInvoiceTypes = ["388", "381", "383"];
      const validTaxCategories = ["S", "Z", "E", "O"];
      if (invoiceTypeCode && !validInvoiceTypes.includes(invoiceTypeCode)) { res.status(400).json({ error: `نوع الفاتورة غير صالح. القيم المسموحة: ${validInvoiceTypes.join(", ")}` }); return; }
      if (taxCategoryCode && !validTaxCategories.includes(taxCategoryCode)) { res.status(400).json({ error: `فئة الضريبة غير صالحة. القيم المسموحة: ${validTaxCategories.join(", ")}` }); return; }
    }
    if (!accountCode) {
      validationError(res, "لا يمكن صرف بدون حساب محاسبي واضح", "accountCode", "حدد الحساب المحاسبي للمصروف (مثل 5100 رواتب، 5200 وقود)");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      validationError(res, "لا يمكن تسجيل مصروف بقيمة صفر أو سالبة", "amount", "أدخل مبلغ المصروف بقيمة موجبة");
      return;
    }
    if (!branchId && !scope.branchId) {
      validationError(res, "الفرع مطلوب لتسجيل المصروف", "branchId", "حدد الفرع الذي ينتمي إليه هذا المصروف");
      return;
    }
    if (!costCenter) {
      validationError(res, "مركز التكلفة مطلوب لتسجيل المصروف", "costCenter", "حدد مركز التكلفة (مثل: مشروع-001، فرع-الرياض)");
      return;
    }

    const [costCenterSettingRow] = await rawQuery<any>(
      `SELECT value FROM company_settings WHERE "companyId" = $1 AND key = 'costCenterEnabled' LIMIT 1`,
      [effectiveCompanyId]
    );
    const costCenterValidationEnabled = costCenterSettingRow?.value === "true";
    if (costCenterValidationEnabled) {
      const [ccRow] = await rawQuery<any>(
        `SELECT id FROM departments WHERE "companyId" = ANY($1) AND (name = $2 OR "nameEn" = $2) LIMIT 1`,
        [[effectiveCompanyId], costCenter]
      );
      if (!ccRow) {
        validationError(
          res,
          `مركز التكلفة "${costCenter}" غير موجود في بيانات الشركة`,
          "costCenter",
          "أدخل مركز تكلفة معرّف في إعدادات الأقسام"
        );
        return;
      }
    }

    // Check mandatory attachment
    const attachCheck = checkAttachmentRequired({
      operationType: operationType || expenseType || "expense",
      amount: Number(amount),
      hasAttachment: !!attachmentUrl,
    });
    if (attachCheck.required && !attachmentUrl) {
      res.status(400).json({
        error: attachCheck.reason,
        field: "attachmentUrl",
        hint: "ارفع المستند الداعم (فاتورة، إشعار تحويل، وصل استلام) قبل الحفظ",
      });
      return;
    }

    const expenseDate = (period ? `${period}-01` : null) || new Date().toISOString().split("T")[0];
    const expPeriodCheck = await checkFinancialPeriodOpen(effectiveCompanyId, expenseDate);
    if (!expPeriodCheck.open) {
      res.status(422).json({ error: `لا يمكن تسجيل مصروف في فترة مالية مُقفلة: ${expPeriodCheck.periodName ?? ""}` });
      return;
    }

    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const sourceAcct = sourceAccountCode || "1100";

    // Budget validation – 4-level enforcement
    if (accountCode && amount) {
      const [budget] = await rawQuery<any>(
        `SELECT amount, used FROM budgets
         WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`,
        [effectiveCompanyId, accountCode, targetPeriod]
      );

      if (budget) {
        const budgetAmount = Number(budget.amount);
        const newUsed = Number(budget.used) + Number(amount);
        const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;

        if (utilization > 110) {
          res.status(400).json({
            error: "تجاوز الميزانية أكثر من 110% – رفض نهائي",
            utilization: Math.round(utilization),
            status: "rejected",
          });
          return;
        }

        if (utilization > 99 && !["owner", "general_manager"].includes(scope.role)) {
          res.status(403).json({
            error: "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط",
            utilization: Math.round(utilization),
            status: "blocked_gm",
          });
          return;
        }

        if (utilization > 80 && !["finance_manager", "general_manager", "owner"].includes(scope.role)) {
          res.status(403).json({
            error: "استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
            utilization: Math.round(utilization),
            status: "warning_cfo",
          });
          return;
        }

        if (utilization > 80) {
          createNotification({
            companyId: effectiveCompanyId,
            assignmentId: scope.activeAssignmentId,
            type: "budget_warning",
            title: "تحذير: الاقتراب من حد الميزانية",
            body: `استخدام الميزانية وصل ${Math.round(utilization)}% للحساب ${accountCode}`,
            priority: "high",
          }).catch(console.error);
        }

        await rawExecute(
          `UPDATE budgets SET used = used + $1
           WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4`,
          [Number(amount), effectiveCompanyId, accountCode, targetPeriod]
        );
      }
    }

    // Calculate VAT
    const baseAmount = Number(amount);
    const vatRateVal = rawVatRate != null ? Number(rawVatRate) : 0;
    const computedVat = rawVatAmount != null ? Number(rawVatAmount) : Math.round(baseAmount * (vatRateVal / 100) * 100) / 100;
    const totalWithVat = baseAmount + computedVat;

    // Auto-generate description if requested or none provided
    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({
        operationType: operationType || expenseType || "expense",
        relatedEntityName,
        period: targetPeriod,
        amount: baseAmount,
        expenseType,
      });
    }

    const ref = `EXP-${Date.now()}`;
    const expenseAcctFallback = "5000";
    const expVatInputAcctFallback = "1400";
    const resolvedExpenseAcct = accountCode
      ?? await getAccountCodeFromMapping(effectiveCompanyId, operationType ?? expenseType ?? "expense_general", "debit", expenseAcctFallback);
    const resolvedVatInputAcct = await getAccountCodeFromMapping(effectiveCompanyId, "expense_vat_input", "debit", expVatInputAcctFallback);
    const journalLines: { accountCode: string; debit: number; credit: number }[] = [
      { accountCode: resolvedExpenseAcct, debit: baseAmount, credit: 0 },
    ];
    if (computedVat > 0) {
      journalLines.push({ accountCode: resolvedVatInputAcct, debit: computedVat, credit: 0 });
    }
    journalLines.push({ accountCode: sourceAcct, debit: 0, credit: totalWithVat });
    if (subAccountCode && subAccountCode !== accountCode) {
      journalLines[0].accountCode = subAccountCode;
    }

    const journalId = await createJournalEntry({
      companyId: effectiveCompanyId,
      branchId: branchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description: finalDescription,
      type: "expense",
      lines: journalLines,
    });

    // Save extended metadata as journal entry notes
    await rawExecute(
      `UPDATE journal_entries SET
        "costCenter" = $1,
        "departmentId" = $2,
        "relatedEntityType" = $3,
        "relatedEntityId" = $4,
        "paymentMethod" = $5,
        reference = $6,
        "isPaid" = $7,
        "attachmentUrl" = $8,
        "attachmentType" = $9,
        "expenseType" = $10,
        "operationType" = $11,
        "projectId" = $12,
        "taxCategory" = $13,
        "isTaxLinked" = $14,
        "invoiceTypeCode" = $15,
        "taxCategoryCode" = $16,
        "exemptionReason" = $17,
        "govSyncEnabled" = $18,
        "govIntegrationId" = $19,
        "govEntityType" = $20,
        "govEntityId" = $21
       WHERE id = $22`,
      [
        costCenter ?? null,
        departmentId ?? null,
        relatedEntityType ?? null,
        relatedEntityId ?? null,
        paymentMethod ?? "cash",
        reference ?? null,
        isPaid != null ? !!isPaid : true,
        attachmentUrl ?? null,
        attachmentType ?? null,
        expenseType ?? null,
        operationType ?? "expense",
        projectId ?? null,
        taxCategory ?? null,
        isTaxLinked ? true : false,
        invoiceTypeCode ?? "388",
        taxCategoryCode ?? "S",
        exemptionReason ?? null,
        govSyncEnabled ?? false,
        govIntegrationId ? Number(govIntegrationId) : null,
        govEntityType ?? null,
        govEntityId ? Number(govEntityId) : null,
        journalId,
      ]
    ).catch(() => {});

    if (govSyncEnabled && govIntegrationId && govEntityType && govEntityId) {
      const [validIntegration] = await rawQuery<any>(
        `SELECT id FROM gov_integrations WHERE id = $1 AND "companyId" = $2`,
        [Number(govIntegrationId), effectiveCompanyId]
      );
      if (validIntegration) {
        await rawExecute(
          `INSERT INTO gov_integration_links ("companyId", "integrationId", "entityType", "entityId", "externalRef", enabled, "syncStatus")
           VALUES ($1, $2, $3, $4, $5, true, 'pending')
           ON CONFLICT ("companyId", "integrationId", "entityType", "entityId") DO NOTHING`,
          [effectiveCompanyId, Number(govIntegrationId), govEntityType, Number(govEntityId), ref]
        ).catch(console.error);
      }
    }

    const approvalResult = await initiateApprovalChain({
      companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId,
      chainType: "expenses", refType: "expense", refId: journalId,
      amount: Number(amount ?? 0),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1`,
        [journalId]
      );
    }

    emitEvent({
      companyId: effectiveCompanyId,
      userId: scope.userId,
      action: "expense.created",
      entity: "expenses",
      entityId: journalId,
      details: JSON.stringify({
        ref, accountCode, amount: baseAmount, vatAmount: computedVat, totalWithVat,
        sourceAccountCode: sourceAcct, approvalRequired: approvalResult.requiresApproval,
        operationType, expenseType, relatedEntityType, relatedEntityId,
      }),
    }).catch(console.error);

    res.status(201).json({
      id: journalId, ref, amount: baseAmount, vatAmount: computedVat, totalWithVat,
      description: finalDescription, accountCode, sourceAccountCode: sourceAcct,
      operationType, expenseType, relatedEntityType, relatedEntityId, relatedEntityName,
      paymentMethod, costCenter, departmentId, branchId: branchId ?? scope.branchId,
      attachmentUrl, attachmentType, reference, isPaid, period: targetPeriod,
      approval: approvalResult,
    });
  } catch (err) {
    handleRouteError(err, res, "Create expense error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROCUREMENT P2P – 8-step pipeline
// ─────────────────────────────────────────────────────────────────────────────

router.get("/purchase-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'pr."companyId"', branchColumn: 'pr."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT pr.*, s.name AS "supplierName",
              e.name AS "requestedByName"
       FROM purchase_requests pr
       LEFT JOIN suppliers s ON s.id = pr."supplierId"
       LEFT JOIN employee_assignments ea ON ea.id = pr."requestedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE ${where}
       ORDER BY pr."createdAt" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

router.post("/purchase-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { supplierId, items, notes, totalAmount, branchId, companyId: bodyCompanyId, costCenter, expectedDelivery } = req.body as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!supplierId) {
      validationError(res, "المورد مطلوب لإنشاء طلب الشراء", "supplierId", "حدد المورد الذي سيتم الشراء منه");
      return;
    }
    if (!branchId && !scope.branchId) {
      validationError(res, "الفرع مطلوب لإنشاء طلب الشراء", "branchId", "حدد الفرع الذي ينتمي إليه طلب الشراء");
      return;
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "البنود مطلوبة" });
      return;
    }

    // Auto-generate PR reference using DB sequence (race-safe)
    const [prSeqRow] = await rawQuery<any>(`SELECT nextval('pr_number_seq') AS seq`);
    const ref = `PR-${new Date().getFullYear()}-${String(Number(prSeqRow.seq)).padStart(4, "0")}`;

    // Calculate total from items
    const calculatedTotal = Array.isArray(items)
      ? items.reduce((sum: number, i: any) => sum + Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0), 0)
      : Number(totalAmount ?? 0);

    // Create purchase request
    const { insertId: prId } = await rawExecute(
      `INSERT INTO purchase_requests ("companyId",ref,"requestedBy","supplierId",status,"totalAmount",notes,"branchId","costCenter","expectedDelivery")
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9)`,
      [effectiveCompanyId, ref, scope.activeAssignmentId, supplierId ?? null, calculatedTotal, notes ?? null, branchId ?? scope.branchId, costCenter ?? null, expectedDelivery ?? null]
    );

    // Insert request items in a single bulk INSERT.
    if (items.length > 0) {
      const valuesSql: string[] = [];
      const params: any[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        params.push(
          prId,
          item.productId ?? null,
          Number(item.quantity ?? 1),
          Number(item.unitPrice ?? 0),
          Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0)
        );
      }
      await rawExecute(
        `INSERT INTO purchase_request_items ("requestId","productId",quantity,"unitPrice","totalPrice")
         VALUES ${valuesSql.join(",")}`,
        params
      );
    }

    // Notify manager for approval and emit event
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_request.created",
      entity: "purchase_requests",
      entityId: prId,
      details: JSON.stringify({ ref, total: calculatedTotal, itemCount: items.length }),
    }).catch(console.error);

    const [pr] = await rawQuery<any>(
      `SELECT pr.*, s.name AS "supplierName"
       FROM purchase_requests pr
       LEFT JOIN suppliers s ON s.id = pr."supplierId"
       WHERE pr.id = $1`,
      [prId]
    );

    res.status(201).json(pr);
  } catch (err) {
    handleRouteError(err, res, "Create PR error:");
  }
});

router.patch("/purchase-requests/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PR_APPROVAL_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [pr] = await rawQuery<any>(
      `SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!pr) {
      res.status(404).json({ error: "طلب الشراء غير موجود" });
      return;
    }

    const prTotal = Number(pr.totalAmount ?? 0);
    if (approved && approved !== "returned") {
      if (prTotal >= 5000 && !["general_manager", "owner"].includes(scope.role)) {
        res.status(403).json({
          error: `طلبات الشراء بمبلغ ${prTotal.toLocaleString()} ﷼ (أكثر من 5,000) تتطلب موافقة المدير العام`,
          requiredRole: "general_manager",
          yourRole: scope.role,
          totalAmount: prTotal,
        });
        return;
      }
    }

    const budgetCheck = await validateBudget({
      companyId: scope.companyId,
      accountCode: "1300",
      amount: prTotal,
      role: scope.role,
    });
    if (approved && approved !== "returned" && !budgetCheck.canProceed) {
      res.status(403).json({
        error: budgetCheck.message,
        budgetStatus: budgetCheck.status,
        utilization: budgetCheck.utilization,
      });
      return;
    }

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    await rawExecute(
      `UPDATE purchase_requests
       SET status = $1, "approvedBy" = $2, "approvedAt" = NOW(), notes = COALESCE($3, notes)
       WHERE id = $4`,
      [newStatus, scope.activeAssignmentId, notes ?? null, Number(id)]
    );

    if (newStatus === "approved") {
      await updateBudgetUsed({
        companyId: scope.companyId,
        accountCode: "1300",
        amount: prTotal,
      });
    }

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('purchase_request',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: `purchase_request.${newStatus}`,
      entity: "purchase_requests",
      entityId: Number(id),
      details: JSON.stringify({ totalAmount: prTotal, approvalLevel: prTotal >= 5000 ? "general_manager" : "branch_manager" }),
    }).catch(console.error);

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus, budgetCheck });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Convert approved PR to Purchase Order
router.post("/purchase-requests/:id/convert-to-po", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { id } = req.params;
    const { expectedDelivery, notes } = req.body as any;

    const [pr] = await rawQuery<any>(
      `SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!pr) {
      res.status(404).json({ error: "طلب الشراء غير موجود" });
      return;
    }
    if (pr.status !== "approved") {
      res.status(400).json({ error: "يجب الموافقة على طلب الشراء أولاً" });
      return;
    }

    // Auto-generate PO ref using DB sequence (race-safe)
    const [poSeqRow] = await rawQuery<any>(`SELECT nextval('po_number_seq') AS seq`);
    const poRef = `PO-${new Date().getFullYear()}-${String(Number(poSeqRow.seq)).padStart(4, "0")}`;

    const { insertId: poId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId",ref,"supplierId","requestId",status,"totalAmount","expectedDelivery","createdBy",notes,"branchId")
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)`,
      [
        scope.companyId,
        poRef,
        pr.supplierId,
        Number(id),
        Number(pr.totalAmount),
        expectedDelivery ?? null,
        scope.activeAssignmentId,
        notes ?? null,
        scope.branchId || null,
      ]
    );

    await rawExecute(
      `UPDATE purchase_requests SET status = 'converted' WHERE id = $1`,
      [Number(id)]
    );

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "purchases", refType: "purchase_order", refId: poId,
      amount: Number(pr.totalAmount),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE purchase_orders SET status = 'pending_approval' WHERE id = $1`,
        [poId]
      );
    }

    if (pr.supplierId) {
      const [supplier] = await rawQuery<any>(
        `SELECT name, email, phone FROM suppliers WHERE id = $1`,
        [pr.supplierId]
      );
      if (supplier?.email) {
        console.log(`[P2P] Supplier email → ${supplier.email} for PO ${poRef}`);
      }
      if (supplier?.phone) {
        console.log(`[P2P] Supplier SMS → ${supplier.phone} for PO ${poRef}`);
      }
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.created",
      entity: "purchase_orders",
      entityId: poId,
      details: JSON.stringify({ poRef, prId: id, approvalRequired: approvalResult.requiresApproval, supplierNotified: !!pr.supplierId }),
    }).catch(console.error);

    const [po] = await rawQuery<any>(
      `SELECT po.*, s.name AS "supplierName", s.email AS "supplierEmail"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE po.id = $1`,
      [poId]
    );

    res.status(201).json({ ...po, approval: approvalResult, supplierNotified: !!pr.supplierId });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.get("/purchase-orders", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'po."companyId"', branchColumn: 'po."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT po.*, s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE ${where} ORDER BY po.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

router.get("/purchase-orders/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [po] = await rawQuery<any>(
      `SELECT po.*, s.name AS "supplierName", s.phone AS "supplierPhone", s.email AS "supplierEmail",
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       LEFT JOIN branches b ON b.id = po."branchId"
       WHERE po.id = $1 AND po."companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) { res.status(404).json({ error: "أمر الشراء غير موجود" }); return; }

    let lines: any[] = [];
    try {
      lines = await rawQuery<any>(
        `SELECT * FROM purchase_order_lines WHERE "purchaseOrderId" = $1 ORDER BY id`,
        [Number(id)]
      );
    } catch { }

    res.json({ ...po, lines });
  } catch (err) {
    handleRouteError(err, res, "PO detail error:");
  }
});

// Vendor confirmation – vendor acknowledges the PO
router.patch("/purchase-orders/:id/vendor-confirm", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { id } = req.params;
    const { confirmedDelivery, notes } = req.body as any;

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      res.status(404).json({ error: "أمر الشراء غير موجود" });
      return;
    }
    if (!["pending", "sent"].includes(po.status)) {
      res.status(400).json({ error: "لا يمكن تأكيد أمر الشراء في هذه الحالة" });
      return;
    }

    await rawExecute(
      `UPDATE purchase_orders
       SET status = 'confirmed', "expectedDelivery" = COALESCE($1, "expectedDelivery"), notes = COALESCE($2, notes)
       WHERE id = $3`,
      [confirmedDelivery ?? null, notes ?? null, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.vendor_confirmed",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ confirmedDelivery }),
    }).catch(console.error);

    res.json({ message: "تم تأكيد أمر الشراء من المورد", status: "confirmed" });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.patch("/purchase-orders/:id/receive", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { id } = req.params;
    const { qualityPassed = true, notes, receivedItems } = req.body as any;

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      res.status(404).json({ error: "أمر الشراء غير موجود" });
      return;
    }

    let prItems: any[] = [];
    if (po.requestId) {
      prItems = await rawQuery<any>(
        `SELECT pri."productId", pri.quantity AS "orderedQuantity", pri."unitPrice"
         FROM purchase_request_items pri WHERE pri."requestId" = $1`,
        [po.requestId]
      );
    }

    const shortages: { productId: number; ordered: number; received: number }[] = [];
    if (Array.isArray(receivedItems) && prItems.length > 0) {
      for (const prItem of prItems) {
        const received = receivedItems.find((ri: any) => ri.productId === prItem.productId);
        const receivedQty = received ? Number(received.quantity) : Number(prItem.orderedQuantity);
        if (receivedQty < Number(prItem.orderedQuantity)) {
          shortages.push({
            productId: prItem.productId,
            ordered: Number(prItem.orderedQuantity),
            received: receivedQty,
          });
        }
      }
    }

    const hasShortage = shortages.length > 0;
    const newStatus = !qualityPassed ? "quality_failed" : hasShortage ? "partial_received" : "received";

    await rawExecute(
      `UPDATE purchase_orders
       SET status = $1, "deliveredAt" = NOW(), notes = COALESCE($2, notes)
       WHERE id = $3`,
      [newStatus, notes ?? null, Number(id)]
    );

    if (qualityPassed) {
      const itemsToUpdate = Array.isArray(receivedItems) ? receivedItems : prItems;
      for (const item of itemsToUpdate) {
        const qty = Number(item.quantity ?? item.orderedQuantity ?? 0);
        const productId = item.productId;
        if (productId && qty > 0) {
          await rawExecute(
            `UPDATE warehouse_products SET "currentStock" = "currentStock" + $1, "updatedAt" = NOW()
             WHERE id = $2 AND "companyId" = $3`,
            [qty, productId, scope.companyId]
          ).catch(() => {});

          await rawExecute(
            `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy")
             VALUES ($1,$2,'in',$3,$4,$5,$6,$7)`,
            [scope.companyId, productId, qty, Number(item.unitPrice ?? 0),
              `GR-${po.ref}`, `استلام من أمر شراء ${po.ref}`, scope.userId]
          ).catch(() => {});
        }
      }

      createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `GR-${po.ref}`,
        description: `استلام بضاعة – ${po.ref}`,
        lines: [
          { accountCode: "1300", debit: Number(po.totalAmount), credit: 0 },
          { accountCode: "2100", debit: 0, credit: Number(po.totalAmount) },
        ],
      }).catch(console.error);
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: qualityPassed ? "purchase_order.received" : "purchase_order.quality_failed",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ qualityPassed, hasShortage, shortages, notes }),
    }).catch(console.error);

    if (hasShortage) {
      createNotification({
        companyId: scope.companyId,
        assignmentId: scope.activeAssignmentId,
        type: "po_shortage",
        title: `نقص في استلام أمر الشراء ${po.ref}`,
        body: `تم اكتشاف نقص في ${shortages.length} صنف`,
        priority: "high",
        refType: "purchase_orders",
        refId: Number(id),
      }).catch(console.error);
    }

    res.json({
      message: !qualityPassed ? "فشل فحص الجودة" : hasShortage ? "تم الاستلام مع نقص في بعض الأصناف" : "تم الاستلام بنجاح",
      status: newStatus,
      shortages,
    });
  } catch (err) {
    handleRouteError(err, res, "PO receive error:");
  }
});

router.post("/purchase-orders/:id/match-invoice", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { supplierInvoiceRef, invoicedAmount, invoicedDate } = req.body as any;

    if (!supplierInvoiceRef || !invoicedAmount) {
      res.status(400).json({ error: "رقم فاتورة المورد والمبلغ مطلوبان" });
      return;
    }

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      res.status(404).json({ error: "أمر الشراء غير موجود" });
      return;
    }
    if (!["received", "partial_received"].includes(po.status)) {
      res.status(400).json({ error: "يجب استلام البضاعة قبل مطابقة الفاتورة" });
      return;
    }

    const poTotal = Number(po.totalAmount);
    const invAmount = Number(invoicedAmount);

    let prTotal = poTotal;
    if (po.requestId) {
      const [prRow] = await rawQuery<any>(
        `SELECT "totalAmount" FROM purchase_requests WHERE id = $1`,
        [po.requestId]
      );
      if (prRow) prTotal = Number(prRow.totalAmount);
    }

    let receivedTotal = poTotal;
    const grMovements = await rawQuery<any>(
      `SELECT COALESCE(SUM(quantity * "unitCost"), 0) AS total
       FROM warehouse_movements
       WHERE "companyId" = $1 AND reference = $2 AND type = 'in'`,
      [scope.companyId, `GR-${po.ref}`]
    );
    if (grMovements[0]?.total) receivedTotal = Number(grMovements[0].total);

    const poVariance = Math.abs(poTotal - invAmount);
    const poVariancePct = poTotal > 0 ? (poVariance / poTotal) * 100 : 0;
    const prVariance = Math.abs(prTotal - invAmount);
    const prVariancePct = prTotal > 0 ? (prVariance / prTotal) * 100 : 0;
    const grVariance = Math.abs(receivedTotal - invAmount);
    const grVariancePct = receivedTotal > 0 ? (grVariance / receivedTotal) * 100 : 0;

    const isMatched = poVariancePct <= 5 && prVariancePct <= 5 && grVariancePct <= 5;

    await rawExecute(
      `UPDATE purchase_orders SET status = $1, notes = CONCAT(COALESCE(notes,''), $2) WHERE id = $3`,
      [
        isMatched ? "invoice_matched" : "invoice_mismatch",
        ` | مطابقة ثلاثية: فاتورة=${invAmount} طلب=${prTotal} أمر=${poTotal} استلام=${receivedTotal}`,
        Number(id),
      ]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: isMatched ? "purchase_order.three_way_matched" : "purchase_order.three_way_mismatch",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ supplierInvoiceRef, invoicedAmount: invAmount, poTotal, prTotal, receivedTotal }),
    }).catch(console.error);

    if (!isMatched) {
      createNotification({
        companyId: scope.companyId,
        assignmentId: scope.activeAssignmentId,
        type: "three_way_mismatch",
        title: `عدم تطابق ثلاثي – ${po.ref}`,
        body: `فاتورة=${invAmount} | طلب=${prTotal} | أمر=${poTotal} | استلام=${receivedTotal}`,
        priority: "high",
        refType: "purchase_orders",
        refId: Number(id),
      }).catch(console.error);
    }

    res.json({
      message: isMatched ? "تمت المطابقة الثلاثية بنجاح" : "عدم تطابق في المطابقة الثلاثية",
      isMatched,
      threeWayMatch: {
        purchaseRequest: prTotal,
        purchaseOrder: poTotal,
        goodsReceipt: receivedTotal,
        supplierInvoice: invAmount,
      },
      variances: {
        poVsInvoice: { amount: poVariance, pct: Math.round(poVariancePct) },
        prVsInvoice: { amount: prVariance, pct: Math.round(prVariancePct) },
        grVsInvoice: { amount: grVariance, pct: Math.round(grVariancePct) },
      },
      status: isMatched ? "invoice_matched" : "invoice_mismatch",
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Payment scheduling – schedule payment to supplier after invoice match
router.post("/purchase-orders/:id/schedule-payment", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { paymentDate, amount, method = "bank_transfer", notes } = req.body as any;

    if (!paymentDate || !amount) {
      res.status(400).json({ error: "تاريخ الدفع والمبلغ مطلوبان" });
      return;
    }

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      res.status(404).json({ error: "أمر الشراء غير موجود" });
      return;
    }

    await rawExecute(
      `UPDATE purchase_orders
       SET status = 'payment_scheduled',
           notes = CONCAT(COALESCE(notes,''), $1)
       WHERE id = $2`,
      [` | دفعة مجدولة ${paymentDate}: ${amount} (${method})`, Number(id)]
    );

    // Create a scheduled journal entry for the payment
    createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: `SCHED-PAY-${po.ref}`,
      description: `دفعة مجدولة لأمر الشراء ${po.ref} بتاريخ ${paymentDate}`,
      lines: [
        { accountCode: "2100", debit: Number(amount), credit: 0 },
        { accountCode: "1100", debit: 0, credit: Number(amount) },
      ],
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.payment_scheduled",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ paymentDate, amount, method }),
    }).catch(console.error);

    res.json({
      message: "تم جدولة الدفعة بنجاح",
      paymentDate,
      amount,
      method,
      status: "payment_scheduled",
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHART OF ACCOUNTS & JOURNAL
// ─────────────────────────────────────────────────────────────────────────────

router.get("/chart-of-accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const accounts = await rawQuery<any>(
      `SELECT id, code, name, type, "parentCode", status
       FROM chart_of_accounts
       WHERE ${where}
       ORDER BY code ASC`,
      params
    );
    res.json(accounts);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.get("/accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const { search, type: accountType } = req.query as { search?: string; type?: string };

    let extraWhere = "";
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      extraWhere += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
    }
    if (accountType && accountType.trim()) {
      params.push(accountType.trim());
      extraWhere += ` AND type = $${params.length}`;
    }

    const rows = await rawQuery(
      `SELECT * FROM chart_of_accounts WHERE ${where}${extraWhere} ORDER BY code`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

router.post("/accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, type, "parentCode") VALUES ($1,$2,$3,$4,$5)`,
      [scope.companyId, b.code, b.name, b.type || "asset", b.parentCode]
    );
    res.status(201).json({ id: r.insertId, ...b });
  } catch (err) {
    handleRouteError(err, res, "Create account error:");
  }
});

router.patch("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("type", b.type);
    addField("parentCode", b.parentCode);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE chart_of_accounts SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "الحساب غير موجود" }); return; }
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update account error:"); }
});

router.delete("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const rows = await rawQuery<any>(`DELETE FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (rows.length === 0) { res.status(404).json({ error: "الحساب غير موجود" }); return; }
    res.json({ message: "تم حذف الحساب" });
  } catch (err) { handleRouteError(err, res, "Delete account error:"); }
});

router.patch("/budget/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("accountCode", b.accountCode);
    addField("period", b.period);
    addField("amount", b.amount);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE budgets SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "الميزانية غير موجودة" }); return; }
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update budget error:"); }
});

router.delete("/budget/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const rows = await rawQuery<any>(`DELETE FROM budgets WHERE id = $1 AND "companyId" = $2 RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (rows.length === 0) { res.status(404).json({ error: "الميزانية غير موجودة" }); return; }
    res.json({ message: "تم حذف الميزانية" });
  } catch (err) { handleRouteError(err, res, "Delete budget error:"); }
});

router.get("/journal", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT je.*, json_agg(jl.*) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

router.post("/journal", async (req, res) => {
  try {
    const scope = req.scope!;
    const { ref, description, lines, date: journalBodyDate } = req.body as any;
    if (!lines || !Array.isArray(lines)) {
      res.status(400).json({ error: "بنود القيد مطلوبة" });
      return;
    }
    const journalDate = journalBodyDate
      ? new Date(journalBodyDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    const journalPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, journalDate);
    if (!journalPeriodCheck.open) {
      res.status(422).json({ error: `لا يمكن إنشاء قيد في فترة مالية مُقفلة: ${journalPeriodCheck.periodName ?? ""}` });
      return;
    }
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: ref ?? `JE-${Date.now()}`,
      description: description ?? "",
      lines,
    });
    res.status(201).json({ id: journalId, ref, description, lines });
  } catch (err) {
    handleRouteError(err, res, "Create journal error:");
  }
});

router.get("/vouchers", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              CASE WHEN je.ref LIKE 'RV%' THEN 'receipt' ELSE 'payment' END AS type,
              je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
              je."relatedEntityType", je."relatedEntityId", je."operationType",
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.status
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL AND (je.ref LIKE 'RV%' OR je.ref LIKE 'PV%')
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status,
                je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
                je."relatedEntityType", je."relatedEntityId", je."operationType"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    console.error("Get vouchers error:", err);
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});
router.post("/vouchers", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const {
      type, amount, description, payee, accountCode, method = "cash", sourceAccountCode,
      subAccountCode, relatedEntityType, relatedEntityId, relatedEntityName,
      contractId, invoiceId, reference, attachmentUrl, attachmentType,
      vatRate: rawVatRate, vatAmount: rawVatAmount,
      beneficiaryType, entitlementType, branchId, departmentId,
      autoDescription, operationType, date: voucherBodyDate,
    } = req.body as any;

    if (!amount || !type) {
      res.status(400).json({ error: "النوع والمبلغ مطلوبان" });
      return;
    }

    if (Number(amount) <= 0) {
      validationError(res, "لا يمكن إنشاء سند بمبلغ صفر أو سالب", "amount", "أدخل مبلغاً موجباً للسند");
      return;
    }

    if (!branchId && !scope.branchId) {
      validationError(res, "الفرع مطلوب لإنشاء السند", "branchId", "حدد الفرع الذي ينتمي إليه هذا السند");
      return;
    }

    if (!accountCode) {
      validationError(res, "الحساب المحاسبي مطلوب", "accountCode", "حدد الحساب المحاسبي الرئيسي للسند");
      return;
    }

    // Mandatory attachment check for large payment vouchers
    const voucherAttachCheck = checkAttachmentRequired({
      operationType: type === "payment" ? "payment" : "receipt",
      amount: Number(amount),
    });
    if (voucherAttachCheck.required && !attachmentUrl) {
      res.status(400).json({
        error: voucherAttachCheck.reason,
        field: "attachmentUrl",
        hint: "ارفع إشعار التحويل أو الوصل أو المستند الداعم",
      });
      return;
    }

    const voucherDate = voucherBodyDate
      ? new Date(voucherBodyDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    const voucherPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, voucherDate);
    if (!voucherPeriodCheck.open) {
      res.status(422).json({ error: `لا يمكن إنشاء سند في فترة مالية مُقفلة: ${voucherPeriodCheck.periodName ?? ""}` });
      return;
    }

    const baseAmount = Number(amount);
    const vatRateVal = rawVatRate != null ? Number(rawVatRate) : 0;
    const computedVat = rawVatAmount != null ? Number(rawVatAmount) : Math.round(baseAmount * (vatRateVal / 100) * 100) / 100;
    const totalWithVat = baseAmount + computedVat;

    const sourceAcct = sourceAccountCode || "1100";
    const isReceipt = type === "receipt";
    const ref = `${isReceipt ? "RV" : "PV"}-${Date.now()}`;

    // Auto-generate description
    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({
        operationType: operationType || (isReceipt ? "receipt" : "payment"),
        relatedEntityName: relatedEntityName ?? payee,
        amount: baseAmount,
      });
    } else {
      finalDescription = description ?? (isReceipt ? `سند قبض – ${payee ?? ""}` : `سند صرف – ${payee ?? ""}`);
    }

    const targetAccountCode = subAccountCode || accountCode;
    const [voucherRevenueCode, voucherVatPayableCode, voucherExpenseCode, voucherVatInputCode] = await Promise.all([
      targetAccountCode ? Promise.resolve(targetAccountCode) : getAccountCodeFromMapping(scope.companyId, "voucher_receipt_revenue", "credit", "4000"),
      getAccountCodeFromMapping(scope.companyId, "voucher_vat_payable", "credit", "2300"),
      targetAccountCode ? Promise.resolve(targetAccountCode) : getAccountCodeFromMapping(scope.companyId, "voucher_payment_expense", "debit", "5000"),
      getAccountCodeFromMapping(scope.companyId, "voucher_vat_input", "debit", "1400"),
    ]);
    const lines = isReceipt
      ? [
          { accountCode: sourceAcct, debit: totalWithVat, credit: 0 },
          { accountCode: voucherRevenueCode, debit: 0, credit: baseAmount },
          ...(computedVat > 0 ? [{ accountCode: voucherVatPayableCode, debit: 0, credit: computedVat }] : []),
        ]
      : [
          { accountCode: voucherExpenseCode, debit: baseAmount, credit: 0 },
          ...(computedVat > 0 ? [{ accountCode: voucherVatInputCode, debit: computedVat, credit: 0 }] : []),
          { accountCode: sourceAcct, debit: 0, credit: totalWithVat },
        ];

    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: branchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description: finalDescription,
      lines,
    });

    // Save extended metadata
    await rawExecute(
      `UPDATE journal_entries SET
        "relatedEntityType" = $1,
        "relatedEntityId" = $2,
        "paymentMethod" = $3,
        reference = $4,
        "attachmentUrl" = $5,
        "attachmentType" = $6,
        "operationType" = $7,
        "departmentId" = $8
       WHERE id = $9`,
      [
        relatedEntityType ?? null,
        relatedEntityId ?? null,
        method,
        reference ?? contractId ?? invoiceId ?? null,
        attachmentUrl ?? null,
        attachmentType ?? null,
        type,
        departmentId ?? null,
        journalId,
      ]
    ).catch(() => {});

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: isReceipt ? "voucher.receipt_created" : "voucher.payment_created",
      entity: "vouchers",
      entityId: journalId,
      details: JSON.stringify({ ref, type, amount: baseAmount, vatAmount: computedVat, payee, method, relatedEntityType, relatedEntityId }),
    }).catch(console.error);

    res.status(201).json({
      id: journalId, ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat,
      payee, method, description: finalDescription, status: "posted",
      accountCode: targetAccountCode, sourceAccountCode: sourceAcct,
      relatedEntityType, relatedEntityId, relatedEntityName,
      contractId, invoiceId, reference, attachmentUrl,
    });
  } catch (err) {
    handleRouteError(err, res, "Create voucher error:");
  }
});

router.get("/vendors", async (req, res) => {
  try {
    const scope = (req as any).scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const rows = await rawQuery<any>(
      `SELECT * FROM suppliers WHERE ${where} AND "deletedAt" IS NULL ORDER BY name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

router.get("/vendors/:id", async (req, res) => {
  try {
    const scope = (req as any).scope!;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: "معرف غير صالح" }); return; }
    const [vendor] = await rawQuery<any>(
      `SELECT s.*,
              COALESCE((SELECT SUM(total) FROM purchase_orders po WHERE po."supplierId" = s.id), 0)::numeric AS "totalPurchases",
              COALESCE((SELECT COUNT(*) FROM purchase_orders po WHERE po."supplierId" = s.id AND po.status IN ('pending','approved','sent')), 0)::int AS "activeOrders",
              (SELECT MAX(po."createdAt") FROM purchase_orders po WHERE po."supplierId" = s.id) AS "lastOrderAt"
       FROM suppliers s
       WHERE s.id = $1 AND s."companyId" = ANY($2) AND s."deletedAt" IS NULL`,
      [id, scope.allowedCompanies]
    );
    if (!vendor) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json(vendor);
  } catch (err) {
    handleRouteError(err, res, "Get vendor error:");
  }
});

router.post("/vendors", async (req, res) => {
  try {
    const scope = (req as any).scope!;
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms } = req.body as any;
    if (!name) {
      res.status(400).json({ error: "اسم المورد مطلوب" });
      return;
    }
    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null]
    );
    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters);
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    params.push(monthStart);

    const [stats] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM("paidAmount"), 0) AS "totalRevenue",
         COALESCE(SUM(total - "paidAmount") FILTER (WHERE status IN ('sent','partial')), 0) AS "pendingAmount",
         COALESCE(SUM(total - "paidAmount") FILTER (WHERE status = 'overdue'), 0) AS "overdueAmount",
         COALESCE(SUM("paidAmount") FILTER (WHERE DATE("createdAt") >= $${nextParamIndex}), 0) AS "paidThisMonth"
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL`,
      params
    );

    res.json({
      totalRevenue: Number(stats?.totalRevenue ?? 0),
      pendingAmount: Number(stats?.pendingAmount ?? 0),
      overdueAmount: Number(stats?.overdueAmount ?? 0),
      paidThisMonth: Number(stats?.paidThisMonth ?? 0),
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL REPORTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/reports/trial-balance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND je."createdAt" >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND je."createdAt" <= $${params.length}`;
    }

    const rows = await rawQuery<any>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(jl.debit), 0) AS "totalDebit",
              COALESCE(SUM(jl.credit), 0) AS "totalCredit",
              COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
       LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       WHERE coa."companyId" = $1
       GROUP BY coa.code, coa.name, coa.type
       ORDER BY coa.code`,
      params
    );

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.totalDebit), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.totalCredit), 0);

    res.json({ data: rows, summary: { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 } });
  } catch (err) {
    handleRouteError(err, res, "Trial balance error:");
  }
});

router.get("/reports/income-statement", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const revenues = await rawQuery<any>(
      `SELECT coa.code, coa.name, COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
       LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       WHERE coa."companyId" = $1 AND coa.type = 'revenue'
       GROUP BY coa.code, coa.name ORDER BY coa.code`, params
    );

    const expenses = await rawQuery<any>(
      `SELECT coa.code, coa.name, COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
       LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       WHERE coa."companyId" = $1 AND coa.type = 'expense'
       GROUP BY coa.code, coa.name ORDER BY coa.code`, params
    );

    const totalRevenue = revenues.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({ revenues, expenses, summary: { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses } });
  } catch (err) {
    handleRouteError(err, res, "Income statement error:");
  }
});

router.get("/reports/balance-sheet", async (req, res) => {
  try {
    const scope = req.scope!;
    const { asOfDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (asOfDate) { params.push(asOfDate); dateFilter = ` AND je."createdAt" <= $${params.length}`; }

    const rows = await rawQuery<any>(
      `SELECT coa.code, coa.name, coa.type,
              CASE WHEN coa.type IN ('asset','expense') THEN COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
                   ELSE COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) END AS balance
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
       LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       WHERE coa."companyId" = $1 AND coa.type IN ('asset','liability','equity')
       GROUP BY coa.code, coa.name, coa.type
       ORDER BY coa.type, coa.code`, params
    );

    const assets = rows.filter((r: any) => r.type === "asset");
    const liabilities = rows.filter((r: any) => r.type === "liability");
    const equity = rows.filter((r: any) => r.type === "equity");

    const totalAssets = assets.reduce((s: number, r: any) => s + Number(r.balance), 0);
    const totalLiabilities = liabilities.reduce((s: number, r: any) => s + Number(r.balance), 0);
    const totalEquity = equity.reduce((s: number, r: any) => s + Number(r.balance), 0);

    res.json({ assets, liabilities, equity, summary: { totalAssets, totalLiabilities, totalEquity, isBalanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 } });
  } catch (err) {
    handleRouteError(err, res, "Balance sheet error:");
  }
});

router.get("/reports/cash-flow", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const cashAccounts = ["1100", "1110"];
    const cashInflows = await rawQuery<any>(
      `SELECT je.description, jl.debit AS amount, je."createdAt" AS date
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       WHERE jl."accountCode" = ANY($${params.length + 1}) AND jl.debit > 0
       ORDER BY je."createdAt" DESC LIMIT 50`,
      [...params, cashAccounts]
    );

    const cashOutflows = await rawQuery<any>(
      `SELECT je.description, jl.credit AS amount, je."createdAt" AS date
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       WHERE jl."accountCode" = ANY($${params.length + 1}) AND jl.credit > 0
       ORDER BY je."createdAt" DESC LIMIT 50`,
      [...params, cashAccounts]
    );

    const totalInflow = cashInflows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalOutflow = cashOutflows.reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({ inflows: cashInflows, outflows: cashOutflows, summary: { totalInflow, totalOutflow, netCashFlow: totalInflow - totalOutflow } });
  } catch (err) {
    handleRouteError(err, res, "Cash flow error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAX SYSTEM (VAT)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/tax/summary", async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as any;
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

    const [outputVat] = await rawQuery<any>(
      `SELECT COALESCE(SUM("vatAmount"), 0) AS total
       FROM invoices WHERE "companyId" = $1 AND to_char("createdAt", 'YYYY-MM') = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, targetPeriod]
    );

    const [inputVat] = await rawQuery<any>(
      `SELECT COALESCE(SUM(jl.debit), 0) AS total
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND jl."accountCode" = '2310'
       AND to_char(je."createdAt", 'YYYY-MM') = $2 AND je."deletedAt" IS NULL`,
      [scope.companyId, targetPeriod]
    );

    const outputTotal = Number(outputVat?.total ?? 0);
    const inputTotal = Number(inputVat?.total ?? 0);

    res.json({
      period: targetPeriod,
      outputVat: outputTotal,
      inputVat: inputTotal,
      netVat: outputTotal - inputTotal,
      vatRate: 15,
      status: outputTotal - inputTotal > 0 ? "payable" : "refundable",
    });
  } catch (err) {
    handleRouteError(err, res, "Tax summary error:");
  }
});

router.get("/tax/declarations", async (req, res) => {
  try {
    const scope = req.scope!;
    const currentYear = new Date().getFullYear();
    const declarations = [];
    for (let m = 1; m <= 12; m++) {
      const period = `${currentYear}-${String(m).padStart(2, "0")}`;
      const [stats] = await rawQuery<any>(
        `SELECT COALESCE(SUM("vatAmount"), 0) AS "outputVat",
                COUNT(*) AS "invoiceCount"
         FROM invoices WHERE "companyId" = $1 AND to_char("createdAt", 'YYYY-MM') = $2 AND "deletedAt" IS NULL`,
        [scope.companyId, period]
      );
      if (Number(stats?.invoiceCount ?? 0) > 0) {
        declarations.push({
          period,
          outputVat: Number(stats.outputVat),
          inputVat: 0,
          netVat: Number(stats.outputVat),
          invoiceCount: Number(stats.invoiceCount),
          status: m < new Date().getMonth() + 1 ? "submitted" : "pending",
        });
      }
    }
    res.json({ data: declarations });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVABLES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/receivables", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount",
              (i.total - i."paidAmount") AS "remainingAmount",
              i."dueDate", i.status, i."createdAt",
              c.name AS "clientName", c.phone AS "clientPhone"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL AND i.status IN ('draft','sent','pending','partial','overdue')
       AND i.total > i."paidAmount"
       ORDER BY i."dueDate" ASC NULLS LAST`,
      [scope.companyId]
    );

    const totalReceivable = rows.reduce((s: number, r: any) => s + Number(r.remainingAmount), 0);
    const overdueAmount = rows.filter((r: any) => r.status === "overdue").reduce((s: number, r: any) => s + Number(r.remainingAmount), 0);

    res.json({ data: rows, summary: { totalReceivable, overdueAmount, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS (outgoing)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/payments", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt" AS date,
              COALESCE(SUM(jl.credit), 0) AS amount
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" IN ('1100','1110')
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND jl.credit > 0
       GROUP BY je.id, je.ref, je.description, je."createdAt"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );

    const totalPayments = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { totalPayments, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL COMMITMENTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/commitments", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT po.id, po.ref, po."totalAmount" AS amount,
              po.status, po."expectedDelivery" AS "dueDate",
              po."createdAt", s.name AS "vendorName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE po."companyId" = $1 AND po.status NOT IN ('cancelled','paid','completed')
       ORDER BY po."expectedDelivery" ASC NULLS LAST`,
      [scope.companyId]
    );

    const totalCommitments = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { totalCommitments, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL REQUESTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/financial-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT pr.id, pr.ref, pr."totalAmount" AS amount,
              pr.status, pr."createdAt", pr.notes,
              s.name AS "supplierName",
              e.name AS "requestedByName"
       FROM purchase_requests pr
       LEFT JOIN suppliers s ON s.id = pr."supplierId"
       LEFT JOIN employee_assignments ea ON ea.id = pr."requestedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE pr."companyId" = $1
       ORDER BY pr."createdAt" DESC`,
      [scope.companyId]
    );

    const pending = rows.filter((r: any) => r.status === "draft" || r.status === "pending");
    const approved = rows.filter((r: any) => r.status === "approved");

    res.json({ data: rows, summary: { total: rows.length, pending: pending.length, approved: approved.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTODIES (العهد)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/custodies", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status: filterStatus, employeeId, page = "1", limit: lim = "50", dateFrom, dateTo } = req.query as any;

    const queryParams: any[] = [scope.companyId];
    let dateFilter = "";
    if (dateFrom) {
      queryParams.push(dateFrom);
      dateFilter += ` AND je."createdAt" >= $${queryParams.length}::date`;
    }
    if (dateTo) {
      queryParams.push(dateTo);
      dateFilter += ` AND je."createdAt" < ($${queryParams.length}::date + interval '1 day')`;
    }

    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je.status AS "approvalStatus",
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.notes AS purpose,
              je."dueDate" AS "expectedReturnDate",
              e.name AS "employeeName",
              ea.id AS "assignmentId"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je.notes, je."dueDate", e.name, ea.id
       ORDER BY je."createdAt" DESC`,
      queryParams
    );

    const settledAmounts = await rawQuery<any>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2."accountCode" = '1400'
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) {
      settledMap.set(s.originalRef, Number(s.settledAmount));
    }

    const now = new Date();
    let enriched = rows.map((r: any) => {
      const totalAmount = Number(r.amount);
      const settled = settledMap.get(r.ref) ?? 0;
      const remaining = Math.max(0, totalAmount - settled);
      const isPending = r.approvalStatus === "pending_approval" || r.approvalStatus === "draft";
      const isRejected = r.approvalStatus === "rejected";
      const isReturned = r.approvalStatus === "returned";
      let status: string;
      if (isPending) status = "pending";
      else if (isRejected) status = "rejected";
      else if (isReturned) status = "returned";
      else if (remaining <= 0) status = "settled";
      else if (r.expectedReturnDate && new Date(r.expectedReturnDate) < now && remaining > 0) status = "overdue";
      else if (settled > 0) status = "partial";
      else status = "active";
      const daysOverdue = r.expectedReturnDate && remaining > 0
        ? Math.max(0, Math.floor((now.getTime() - new Date(r.expectedReturnDate).getTime()) / 86400000))
        : 0;
      return { ...r, amount: totalAmount, settledAmount: settled, remainingAmount: remaining, status, daysOverdue };
    });

    if (filterStatus) {
      enriched = enriched.filter((r: any) => r.status === filterStatus);
    }
    if (employeeId) {
      enriched = enriched.filter((r: any) => String(r.assignmentId) === String(employeeId));
    }

    const totalAmount = enriched.reduce((s: number, r: any) => s + r.amount, 0);
    const totalRemaining = enriched.reduce((s: number, r: any) => s + r.remainingAmount, 0);
    const overdueCount = enriched.filter((r: any) => r.status === "overdue").length;
    res.json({
      data: enriched,
      summary: {
        total: enriched.length, totalAmount, totalRemaining,
        activeCount: enriched.filter((r: any) => r.status === "active" || r.status === "partial" || r.status === "overdue").length,
        overdueCount, pendingCount: enriched.filter((r: any) => r.status === "pending").length,
      },
    });
  } catch (err) {
    console.error("Get custodies error:", err);
    res.json({ data: [], summary: { total: 0, totalAmount: 0, totalRemaining: 0, activeCount: 0, overdueCount: 0, pendingCount: 0 } });
  }
});

router.get("/custodies/report", async (req, res) => {
  try {
    const scope = req.scope!;

    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.notes AS purpose,
              je."dueDate" AS "expectedReturnDate",
              je.status AS "approvalStatus",
              e.name AS "employeeName",
              ea.id AS "assignmentId",
              e.id AS "employeeId"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je.notes, je."dueDate", e.name, ea.id, e.id
       ORDER BY e.name, je."createdAt" DESC`,
      [scope.companyId]
    );

    const settledAmounts = await rawQuery<any>(
      `SELECT je2.description AS "originalRef",
              COALESCE(SUM(jl2.credit), 0) AS "settledAmount"
       FROM journal_entries je2
       JOIN journal_lines jl2 ON jl2."journalId" = je2.id
       WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.ref LIKE 'CUSTODY-SETTLE%' AND jl2."accountCode" = '1400'
       GROUP BY je2.description`,
      [scope.companyId]
    );
    const settledMap = new Map<string, number>();
    for (const s of settledAmounts) {
      settledMap.set(s.originalRef, Number(s.settledAmount));
    }

    const now = new Date();
    const employeeMap = new Map<string, any>();

    for (const r of rows) {
      const totalAmount = Number(r.amount);
      const settled = settledMap.get(r.ref) ?? 0;
      const remaining = Math.max(0, totalAmount - settled);
      if (remaining <= 0) continue;

      const daysOverdue = r.expectedReturnDate
        ? Math.max(0, Math.floor((now.getTime() - new Date(r.expectedReturnDate).getTime()) / 86400000))
        : 0;
      const isOverdue = daysOverdue > 0;

      const empKey = r.employeeName || "غير محدد";
      if (!employeeMap.has(empKey)) {
        employeeMap.set(empKey, {
          employeeName: empKey,
          employeeId: r.employeeId,
          assignmentId: r.assignmentId,
          totalOutstanding: 0,
          overdueAmount: 0,
          custodyCount: 0,
          overdueCount: 0,
          custodies: [],
        });
      }
      const emp = employeeMap.get(empKey);
      emp.totalOutstanding += remaining;
      emp.custodyCount++;
      if (isOverdue) {
        emp.overdueAmount += remaining;
        emp.overdueCount++;
      }
      emp.custodies.push({
        id: r.id, ref: r.ref, description: r.description, purpose: r.purpose,
        amount: totalAmount, settledAmount: settled, remainingAmount: remaining,
        date: r.date, expectedReturnDate: r.expectedReturnDate,
        daysOverdue, isOverdue,
      });
    }

    const employees = Array.from(employeeMap.values()).sort((a, b) => b.overdueAmount - a.overdueAmount);
    const totalOutstanding = employees.reduce((s, e) => s + e.totalOutstanding, 0);
    const totalOverdue = employees.reduce((s, e) => s + e.overdueAmount, 0);

    res.json({
      data: employees,
      summary: {
        totalOutstanding, totalOverdue,
        employeeCount: employees.length,
        totalCustodies: employees.reduce((s, e) => s + e.custodyCount, 0),
        overdueCustodies: employees.reduce((s, e) => s + e.overdueCount, 0),
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Custody aging report error:");
  }
});

router.get("/custodies/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    const [custody] = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je.status AS "approvalStatus",
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              je.notes AS purpose,
              je."dueDate" AS "expectedReturnDate",
              e.name AS "employeeName",
              ea.id AS "assignmentId"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je.notes, je."dueDate", e.name, ea.id`,
      [Number(id), scope.companyId]
    );

    if (!custody) {
      res.status(404).json({ error: "العهدة غير موجودة" });
      return;
    }

    const settlements = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.credit), 0) AS amount,
              je."createdAt" AS date,
              e2.name AS "settledByName"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea2 ON ea2.id = je."createdBy"
       LEFT JOIN employees e2 ON e2.id = ea2."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE%' AND je.description = $2
       GROUP BY je.id, je.ref, je.description, je."createdAt", e2.name
       ORDER BY je."createdAt" ASC`,
      [scope.companyId, custody.ref]
    );

    const settledAmount = settlements.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const remainingAmount = Math.max(0, Number(custody.amount) - settledAmount);
    const now = new Date();
    const daysOverdue = custody.expectedReturnDate && remainingAmount > 0
      ? Math.max(0, Math.floor((now.getTime() - new Date(custody.expectedReturnDate).getTime()) / 86400000))
      : 0;

    let approvalActions: any[] = [];
    try {
      approvalActions = await rawQuery<any>(
        `SELECT aa.*, u.name AS "actionByName"
         FROM approval_actions aa
         LEFT JOIN users u ON u.id = aa."actionBy"
         WHERE aa."entityType" = 'custody' AND aa."entityId" = $1
         ORDER BY aa."createdAt" ASC`,
        [Number(id)]
      );
    } catch { }

    const isPending = custody.approvalStatus === "pending_approval" || custody.approvalStatus === "draft";
    const isRejected = custody.approvalStatus === "rejected";
    const isReturned = custody.approvalStatus === "returned";
    let status: string;
    if (isPending) status = "pending";
    else if (isRejected) status = "rejected";
    else if (isReturned) status = "returned";
    else if (remainingAmount <= 0) status = "settled";
    else if (daysOverdue > 0) status = "overdue";
    else if (settledAmount > 0) status = "partial";
    else status = "active";

    const timeline = [
      { action: "created", date: custody.date, label: "إنشاء العهدة", amount: Number(custody.amount) },
      ...approvalActions.map((a: any) => ({
        action: a.action, date: a.createdAt,
        label: a.action === "approved" ? "تمت الموافقة" : a.action === "rejected" ? "تم الرفض" : a.action === "returned" ? "تم الإرجاع" : a.action,
        notes: a.notes, actionBy: a.actionByName,
      })),
      ...settlements.map((s: any) => ({
        action: "settlement", date: s.date, label: "تسوية", amount: Number(s.amount),
        ref: s.ref, settledBy: s.settledByName,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      ...custody,
      amount: Number(custody.amount),
      settledAmount,
      remainingAmount,
      status,
      daysOverdue,
      settlements,
      timeline,
    });
  } catch (err) {
    handleRouteError(err, res, "Get custody detail error:");
  }
});

router.post("/custodies", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { assignmentId, employeeName, amount, description, sourceAccountCode, purpose, expectedReturnDate } = req.body as any;

    if (!amount) {
      res.status(400).json({ error: "المبلغ مطلوب" });
      return;
    }

    let resolvedAssignmentId = assignmentId ? Number(assignmentId) : null;
    let resolvedEmployeeName = employeeName || "";

    if (resolvedAssignmentId) {
      const [emp] = await rawQuery<any>(
        `SELECT e.name FROM employee_assignments ea JOIN employees e ON e.id = ea."employeeId" WHERE ea.id = $1 AND ea."companyId" = $2`,
        [resolvedAssignmentId, scope.companyId]
      );
      if (!emp) {
        res.status(400).json({ error: "الموظف غير موجود" });
        return;
      }
      resolvedEmployeeName = emp.name;
    } else if (!resolvedEmployeeName) {
      res.status(400).json({ error: "يرجى اختيار الموظف" });
      return;
    }

    const sourceAcct = sourceAccountCode || "1100";
    const ref = `CUSTODY-${Date.now()}`;
    const custodyAssignmentId = resolvedAssignmentId || scope.activeAssignmentId;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: custodyAssignmentId,
      ref,
      description: description ?? `عهدة ${resolvedEmployeeName}`,
      lines: [
        { accountCode: "1400", debit: Number(amount), credit: 0 },
        { accountCode: sourceAcct, debit: 0, credit: Number(amount) },
      ],
    });

    if (purpose || expectedReturnDate) {
      await rawExecute(
        `UPDATE journal_entries SET notes = $1, "dueDate" = $2 WHERE id = $3`,
        [purpose || null, expectedReturnDate || null, journalId]
      );
    }

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "advances", refType: "custody", refId: journalId,
      amount: Number(amount),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1`,
        [journalId]
      );
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.created",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ ref, assignmentId: custodyAssignmentId, employeeName: resolvedEmployeeName, amount, purpose, expectedReturnDate, approvalRequired: approvalResult.requiresApproval }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "custodies",
      entityId: journalId,
      after: { ref, employeeName: resolvedEmployeeName, amount, purpose, expectedReturnDate },
    }).catch(console.error);

    const entityStatus = approvalResult.requiresApproval ? "pending_approval" : "active";
    res.status(201).json({ id: journalId, ref, employeeName: resolvedEmployeeName, assignmentId: custodyAssignmentId, amount, description, purpose, expectedReturnDate, status: entityStatus, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Create custody error:");
  }
});

router.post("/custodies/settle", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { custodyRef, amount, description, sourceAccountCode } = req.body as any;

    if (!amount || !custodyRef) {
      res.status(400).json({ error: "مرجع العهدة ومبلغ التسوية مطلوبان" });
      return;
    }

    const settleAmount = Number(amount);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      res.status(400).json({ error: "مبلغ التسوية يجب أن يكون رقم موجب" });
      return;
    }

    const [custodyHeader] = await rawQuery<any>(
      `SELECT je.id, je.status AS "approvalStatus"
       FROM journal_entries je
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`,
      [scope.companyId, custodyRef]
    );

    if (!custodyHeader) {
      res.status(404).json({ error: "العهدة غير موجودة" });
      return;
    }

    const blockedStatuses = ["pending_approval", "draft", "rejected", "returned"];
    if (blockedStatuses.includes(custodyHeader.approvalStatus)) {
      res.status(400).json({ error: "لا يمكن تسوية عهدة في حالة انتظار الموافقة أو مرفوضة أو مُرجعة" });
      return;
    }

    const custodyEntries = await rawQuery<any>(
      `SELECT je.id, jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl."accountCode" = '1400'`,
      [scope.companyId, custodyRef]
    );

    const originalAmount = custodyEntries.reduce(
      (sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0
    );

    const settlements = await rawQuery<any>(
      `SELECT jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE-%'
         AND je.description = $2 AND jl."accountCode" = '1400'`,
      [scope.companyId, custodyRef]
    );
    const settledSoFar = settlements.reduce(
      (sum: number, e: any) => sum + Number(e.credit || 0), 0
    );

    const remaining = originalAmount - settledSoFar;
    if (settleAmount > remaining + 0.01) {
      res.status(400).json({
        error: `مبلغ التسوية (${settleAmount}) يتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`,
      });
      return;
    }

    const sourceAcct = sourceAccountCode || "1100";
    const settleRef = `CUSTODY-SETTLE-${Date.now()}`;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: settleRef,
      description: custodyRef,
      lines: [
        { accountCode: sourceAcct, debit: Number(amount), credit: 0 },
        { accountCode: "1400", debit: 0, credit: Number(amount) },
      ],
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.settled",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ custodyRef, amount }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "settle",
      entity: "custodies",
      entityId: journalId,
      after: { custodyRef, settleRef, amount: settleAmount, remaining: remaining - settleAmount },
    }).catch(console.error);

    res.status(201).json({ id: journalId, ref: settleRef, custodyRef, amount, description });
  } catch (err) {
    handleRouteError(err, res, "Settle custody error:");
  }
});

router.post("/custodies/:id/settle", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const custodyId = Number(req.params.id);
    const { amount, description, sourceAccountCode } = req.body as any;

    const [custody] = await rawQuery<any>(
      `SELECT je.ref, je.status AS "approvalStatus" FROM journal_entries je
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`,
      [custodyId, scope.companyId]
    );
    if (!custody) {
      res.status(404).json({ error: "العهدة غير موجودة" });
      return;
    }

    const blockedStatuses = ["pending_approval", "draft", "rejected", "returned"];
    if (blockedStatuses.includes(custody.approvalStatus)) {
      res.status(400).json({ error: "لا يمكن تسوية عهدة في حالة انتظار الموافقة أو مرفوضة أو مُرجعة" });
      return;
    }

    if (!amount) {
      res.status(400).json({ error: "مبلغ التسوية مطلوب" });
      return;
    }

    const settleAmount = Number(amount);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      res.status(400).json({ error: "مبلغ التسوية يجب أن يكون رقم موجب" });
      return;
    }

    const custodyLines = await rawQuery<any>(
      `SELECT jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref = $2 AND jl."accountCode" = '1400'`,
      [scope.companyId, custody.ref]
    );
    const originalAmount = custodyLines.reduce(
      (sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0
    );

    const priorSettlements = await rawQuery<any>(
      `SELECT jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY-SETTLE-%'
         AND je.description = $2 AND jl."accountCode" = '1400'`,
      [scope.companyId, custody.ref]
    );
    const settledSoFar = priorSettlements.reduce(
      (sum: number, e: any) => sum + Number(e.credit || 0), 0
    );

    const remaining = originalAmount - settledSoFar;
    if (settleAmount > remaining + 0.01) {
      res.status(400).json({
        error: `مبلغ التسوية (${settleAmount}) يتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`,
      });
      return;
    }

    const sourceAcct = sourceAccountCode || "1100";
    const settleRef = `CUSTODY-SETTLE-${Date.now()}`;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: settleRef,
      description: custody.ref,
      lines: [
        { accountCode: sourceAcct, debit: Number(amount), credit: 0 },
        { accountCode: "1400", debit: 0, credit: Number(amount) },
      ],
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "custody.settled",
      entity: "custodies",
      entityId: journalId,
      details: JSON.stringify({ custodyRef: custody.ref, amount }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "settle",
      entity: "custodies",
      entityId: journalId,
      after: { custodyRef: custody.ref, settleRef, amount: settleAmount, remaining: remaining - settleAmount },
    }).catch(console.error);

    res.status(201).json({ id: journalId, ref: settleRef, custodyRef: custody.ref, amount, description });
  } catch (err) {
    handleRouteError(err, res, "Settle custody by ID error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FISCAL PERIODS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/fiscal-periods", async (req, res) => {
  try {
    const scope = req.scope!;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const closedPeriods = await rawQuery<any>(
      `SELECT to_char("startDate", 'YYYY-MM') AS period, status, "closedAt", "closedBy", id
       FROM financial_periods
       WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const closedMap = new Map(closedPeriods.map((r: any) => [r.period, r]));

    const periods = [];
    for (let m = 1; m <= 12; m++) {
      const period = `${currentYear}-${String(m).padStart(2, "0")}`;
      const [stats] = await rawQuery<any>(
        `SELECT COUNT(*) AS entries,
                COALESCE(SUM(jl.debit), 0) AS "totalDebit"
         FROM journal_entries je
         LEFT JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2`,
        [scope.companyId, period]
      );

      const dbRecord = closedMap.get(period) as any;
      const defaultStatus = m < currentMonth ? "closed" : m === currentMonth ? "active" : "future";
      const status = dbRecord?.status === "closed" ? "closed" : dbRecord?.status === "open" ? "open" : defaultStatus;

      periods.push({
        period,
        id: dbRecord?.id ?? null,
        name: new Date(currentYear, m - 1).toLocaleDateString("ar-SA", { month: "long", year: "numeric" }),
        entries: Number(stats?.entries ?? 0),
        totalAmount: Number(stats?.totalDebit ?? 0),
        status,
        closedAt: dbRecord?.closedAt ?? null,
      });
    }

    res.json({ data: periods });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.post("/fiscal-periods/:period/close", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { period } = req.params;

    if (!/^\d{4}-\d{2}$/.test(period)) {
      validationError(res, "صيغة الفترة غير صحيحة", "period", "استخدم الصيغة YYYY-MM مثل 2025-01");
      return;
    }

    const pendingJournals = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description
       FROM journal_entries je
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2
         AND je.status = 'draft'
       LIMIT 10`,
      [scope.companyId, period]
    );

    if (pendingJournals.length > 0) {
      validationError(
        res,
        `لا يمكن إقفال الفترة ${period}: يوجد ${pendingJournals.length} قيد معلق بحالة مسودة`,
        "journalEntries",
        "راجع القيود المعلقة واعتمدها أو احذفها قبل إقفال الفترة المالية"
      );
      return;
    }

    const [debitSum] = await rawQuery<any>(
      `SELECT COALESCE(SUM(jl.debit), 0) AS "totalDebit", COALESCE(SUM(jl.credit), 0) AS "totalCredit"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2`,
      [scope.companyId, period]
    );
    const totalDebit = Number(debitSum?.totalDebit ?? 0);
    const totalCredit = Number(debitSum?.totalCredit ?? 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      validationError(
        res,
        `لا يمكن إقفال الفترة: القيود غير متوازنة (مدين: ${totalDebit.toFixed(2)}، دائن: ${totalCredit.toFixed(2)})`,
        "balance",
        "تأكد من توازن جميع القيود المحاسبية قبل الإقفال"
      );
      return;
    }

    // Save the closed status to DB (upsert)
    const startDate = `${period}-01`;
    const endDate = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).toISOString().split("T")[0];
    const [existing] = await rawQuery<any>(
      `SELECT id FROM financial_periods WHERE "companyId"=$1 AND to_char("startDate",'YYYY-MM')=$2 LIMIT 1`,
      [scope.companyId, period]
    );
    if (existing) {
      await rawExecute(
        `UPDATE financial_periods SET status='closed', "closedAt"=NOW(), "closedBy"=$1, "updatedAt"=NOW() WHERE id=$2`,
        [scope.activeAssignmentId, existing.id]
      );
    } else {
      await rawExecute(
        `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status,"closedAt","closedBy")
         VALUES ($1,$2,$3,$4,'closed',NOW(),$5)`,
        [scope.companyId, `فترة ${period}`, startDate, endDate, scope.activeAssignmentId]
      );
    }

    res.json({ message: `تم إقفال الفترة المالية ${period} بنجاح`, period, totalDebit, totalCredit });
  } catch (err) {
    handleRouteError(err, res, "Close fiscal period error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SALARY ADVANCES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/salary-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date,
              'active' AS status
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%'
       GROUP BY je.id, je.ref, je.description, je."createdAt"
       ORDER BY je."createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, summary: { total: rows.length, totalAmount: rows.reduce((s: number, r: any) => s + Number(r.amount), 0) } });
  } catch (err) {
    res.json({ data: [], summary: { total: 0, totalAmount: 0 } });
  }
});

router.post("/salary-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PAYROLL_ROLES, res)) return;
    const { employeeName, amount, description, deductMonths = 1, sourceAccountCode } = req.body as any;

    if (!amount || !employeeName) {
      res.status(400).json({ error: "اسم الموظف والمبلغ مطلوبان" });
      return;
    }

    const sourceAcct = sourceAccountCode || "1100";
    const ref = `SALARY-ADV-${Date.now()}`;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description: description ?? `سلفة راتب ${employeeName} – خصم على ${deductMonths} شهر`,
      lines: [
        { accountCode: "1410", debit: Number(amount), credit: 0 },
        { accountCode: sourceAcct, debit: 0, credit: Number(amount) },
      ],
    });

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "advances", refType: "salary_advance", refId: journalId,
      amount: Number(amount),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1`,
        [journalId]
      );
    }

    submitWorkflow({
      companyId: scope.companyId,
      branchId: scope.branchId,
      requestType: "salary_advance",
      refTable: "journal_entries",
      refId: journalId,
      title: `طلب سلفة راتب — ${employeeName} — ${Number(amount).toLocaleString("ar-SA")} ر.س`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { employeeName, amount, deductMonths, description },
    }).catch(console.error);

    res.status(201).json({ id: journalId, ref, employeeName, amount, deductMonths, description, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.patch("/salary-advances/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PAYROLL_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [entry] = await rawQuery<any>(
      `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'SALARY-ADV%'`,
      [Number(id), scope.companyId]
    );
    if (!entry) { res.status(404).json({ error: "السلفة غير موجودة" }); return; }

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) {
      res.status(400).json({ error: "يجب ذكر سبب الرفض" }); return;
    }

    await rawExecute(
      `UPDATE journal_entries SET status = $1 WHERE id = $2`,
      [newStatus, Number(id)]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('salary_advance',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    res.json({ id: Number(id), status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد السلفة");
  }
});

router.patch("/custodies/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [entry] = await rawQuery<any>(
      `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'CUSTODY%'`,
      [Number(id), scope.companyId]
    );
    if (!entry) { res.status(404).json({ error: "العهدة غير موجودة" }); return; }

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) {
      res.status(400).json({ error: "يجب ذكر سبب الرفض" }); return;
    }

    await rawExecute(
      `UPDATE journal_entries SET status = $1 WHERE id = $2`,
      [newStatus, Number(id)]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('custody',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    res.json({ id: Number(id), status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد العهدة");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADED VENDORS
// ─────────────────────────────────────────────────────────────────────────────

router.post("/vendors/create", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms } = req.body as any;

    if (!name) {
      res.status(400).json({ error: "اسم المورد مطلوب" });
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "vendor.created",
      entity: "suppliers",
      entityId: insertId,
      details: JSON.stringify({ name }),
    }).catch(console.error);

    res.status(201).json({ id: insertId, name, contactPerson, phone, email, taxNumber });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE PATCH / DELETE
// ─────────────────────────────────────────────────────────────────────────────

router.patch("/expenses/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { description } = req.body as any;
    const [existing] = await rawQuery<any>(
      `SELECT id, status FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(req.params.id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    if (existing.status === "posted") {
      res.status(422).json({ error: "لا يمكن تعديل قيد محاسبي مُقفل (posted)" });
      return;
    }
    const [row] = await rawQuery<any>(
      `UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [description, Number(req.params.id), scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.delete("/expenses/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOUCHER PATCH / DELETE
// ─────────────────────────────────────────────────────────────────────────────

router.patch("/vouchers/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { description } = req.body as any;
    const [existing] = await rawQuery<any>(
      `SELECT id, status FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(req.params.id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "السند غير موجود" }); return; }
    if (existing.status === "posted") {
      res.status(422).json({ error: "لا يمكن تعديل قيد محاسبي مُقفل (posted)" });
      return;
    }
    const [row] = await rawQuery<any>(
      `UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [description, Number(req.params.id), scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "السند غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.delete("/vouchers/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "السند غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR PATCH / DELETE
// ─────────────────────────────────────────────────────────────────────────────

router.patch("/vendors/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, contactPerson, phone, email, taxNumber, category } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (name) { sets.push(`name = $${idx++}`); params.push(name); }
    if (contactPerson !== undefined) { sets.push(`"contactPerson" = $${idx++}`); params.push(contactPerson); }
    if (phone !== undefined) { sets.push(`phone = $${idx++}`); params.push(phone); }
    if (email !== undefined) { sets.push(`email = $${idx++}`); params.push(email); }
    if (taxNumber !== undefined) { sets.push(`"taxNumber" = $${idx++}`); params.push(taxNumber); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); params.push(category); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.delete("/vendors/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const vendorId = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2`,
      [vendorId, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "المورد غير موجود" }); return; }

    const [openOrders] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "supplierId" = $1 AND "companyId" = $2 AND status NOT IN ('cancelled','received','closed')`,
      [vendorId, scope.companyId]
    );
    const [openRequests] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM purchase_requests WHERE "supplierId" = $1 AND "companyId" = $2 AND status NOT IN ('cancelled','rejected','completed')`,
      [vendorId, scope.companyId]
    );

    const blockers: string[] = [];
    if (Number(openOrders?.cnt ?? 0) > 0) {
      blockers.push(`يوجد ${openOrders.cnt} أمر شراء مفتوح مرتبط بهذا المورد`);
    }
    if (Number(openRequests?.cnt ?? 0) > 0) {
      blockers.push(`يوجد ${openRequests.cnt} طلب شراء مفتوح مرتبط بهذا المورد`);
    }
    if (blockers.length > 0) {
      res.status(422).json({
        error: "لا يمكن حذف المورد — يوجد طلبات/أوامر مفتوحة مرتبطة به",
        blockers,
      });
      return;
    }

    const [row] = await rawQuery<any>(
      `UPDATE suppliers SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [vendorId, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

router.get("/summary", async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<any>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total,
              COALESCE(SUM("paidAmount"),0) AS paid,
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial','overdue')),0) AS outstanding
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [exp] = await rawQuery<any>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(jl.debit),0) AS total
       FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL`,
      [scope.companyId]
    );
    res.json({
      invoicesCount: Number(inv?.count ?? 0),
      totalRevenue: Number(inv?.total ?? 0),
      totalPaid: Number(inv?.paid ?? 0),
      outstanding: Number(inv?.outstanding ?? 0),
      expensesCount: Number(exp?.count ?? 0),
      totalExpenses: Number(exp?.total ?? 0),
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL LEDGER
// ─────────────────────────────────────────────────────────────────────────────

router.get("/ledger/:accountCode", async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const [account] = await rawQuery<any>(
      `SELECT * FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`,
      [scope.companyId, accountCode]
    );

    const entries = await rawQuery<any>(
      `SELECT jl.id, jl.debit, jl.credit, je.ref, je.description, je."createdAt" AS date
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND jl."accountCode" = $2 ${dateFilter}
       ORDER BY je."createdAt" ASC`,
      params
    );

    let runningBalance = 0;
    const enrichedEntries = entries.map((e: any) => {
      runningBalance += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance };
    });

    res.json({ account, entries: enrichedEntries, balance: runningBalance });
  } catch (err) {
    handleRouteError(err, res, "Ledger error:");
  }
});

router.patch("/purchase-orders/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) { res.status(404).json({ error: "أمر الشراء غير موجود" }); return; }

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) {
      res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return;
    }

    await rawExecute(
      `UPDATE purchase_orders SET status = $1, notes = COALESCE($2, notes) WHERE id = $3`,
      [newStatus, notes ?? null, Number(id)]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('purchase_order',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.patch("/expenses/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [exp] = await rawQuery<any>(
      `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!exp) { res.status(404).json({ error: "المصروف غير موجود" }); return; }

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) {
      res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return;
    }

    await rawExecute(
      `UPDATE journal_entries SET status = $1 WHERE id = $2`,
      [newStatus, Number(id)]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('expense',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.patch("/custodies/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [cust] = await rawQuery<any>(
      `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'CUSTODY%'`,
      [Number(id), scope.companyId]
    );
    if (!cust) { res.status(404).json({ error: "العهدة غير موجودة" }); return; }

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) {
      res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return;
    }

    await rawExecute(
      `UPDATE journal_entries SET status = $1 WHERE id = $2`,
      [newStatus, Number(id)]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('custody',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: newStatus,
      entity: "custodies",
      entityId: Number(id),
      after: { ref: cust.ref, status: newStatus, notes },
    }).catch(console.error);

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSIDIARY LEDGER — دفتر الأستاذ المساعد
// GET /finance/subsidiary-ledger/:entityType/:entityId
// ─────────────────────────────────────────────────────────────────────────────

router.get("/subsidiary-ledger/:entityType/:entityId", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const { startDate, endDate } = req.query as any;
    const id = Number(entityId);

    // Helper: build a per-query date filter appended after fixed params
    function buildDateFilter(fixedCount: number, sd: string | undefined, ed: string | undefined) {
      const extraParams: any[] = [];
      let filter = "";
      let idx = fixedCount + 1;
      if (sd) { extraParams.push(sd); filter += ` AND "createdAt" >= $${idx++}`; }
      if (ed) { extraParams.push(ed); filter += ` AND "createdAt" <= $${idx++}`; }
      return { filter, extraParams };
    }

    let movements: any[] = [];
    let sections: Record<string, any> = {};

    if (entityType === "employee") {
      const [emp] = await rawQuery<any>(
        `SELECT e.id, e.name, ea.id AS "assignmentId"
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
         WHERE e.id = $2 LIMIT 1`,
        [scope.companyId, id]
      );
      if (!emp) { res.json({ movements: [], summary: {}, sections: {} }); return; }
      const assignmentId = emp.assignmentId;

      // Payroll: params = [assignmentId, companyId, ...dates]
      const { filter: prFilter, extraParams: prDates } = buildDateFilter(2, startDate, endDate);
      const payrollRows = await rawQuery<any>(
        `SELECT pr.id, pr.period AS ref,
                CONCAT('راتب ', pr.period) AS description,
                pr."grossSalary" AS debit, 0 AS credit,
                pr."createdAt" AS date, 'payroll' AS "movementType"
         FROM payroll_records pr
         WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${prFilter.replace(/"createdAt"/g, 'pr."createdAt"')}
         ORDER BY pr."createdAt" DESC`,
        [assignmentId, scope.companyId, ...prDates]
      );

      // Advances: params = [companyId, assignmentId, ...dates]
      const { filter: advFilter, extraParams: advDates } = buildDateFilter(2, startDate, endDate);
      const advanceRows = await rawQuery<any>(
        `SELECT je.id, je.ref,
                CONCAT('سلفة: ', je.description) AS description,
                COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit,
                je."createdAt" AS date, 'advance' AS "movementType"
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410'
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 ${advFilter.replace(/"createdAt"/g, 'je."createdAt"')}
         GROUP BY je.id, je.ref, je.description, je."createdAt"`,
        [scope.companyId, assignmentId, ...advDates]
      );

      const { filter: cstFilter, extraParams: cstDates } = buildDateFilter(2, startDate, endDate);
      const custodyRows = await rawQuery<any>(
        `SELECT je.id, je.ref,
                CONCAT('عهدة: ', je.description) AS description,
                COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit,
                je."createdAt" AS date, 'custody' AS "movementType"
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 AND je.ref LIKE 'CUSTODY%' ${cstFilter.replace(/"createdAt"/g, 'je."createdAt"')}
         GROUP BY je.id, je.ref, je.description, je."createdAt"`,
        [scope.companyId, assignmentId, ...cstDates]
      );

      const { filter: vioFilter, extraParams: vioDates } = buildDateFilter(1, startDate, endDate);
      const violationRows = await rawQuery<any>(
        `SELECT v.id, CONCAT('VIO-', v.id::text) AS ref,
                CONCAT('خصم مخالفة: ', v.description) AS description,
                0 AS debit, COALESCE(v.deduction, 0) AS credit,
                v."createdAt" AS date, 'violation' AS "movementType"
         FROM employee_violations v
         WHERE v."assignmentId" = $1 AND v.deduction > 0 ${vioFilter.replace(/"createdAt"/g, 'v."createdAt"')}
         ORDER BY v."createdAt" DESC`,
        [assignmentId, ...vioDates]
      );

      const all = [...payrollRows, ...advanceRows, ...custodyRows, ...violationRows]
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBalance = 0;
      movements = all.map((m: any) => {
        runningBalance += Number(m.debit) - Number(m.credit);
        return { ...m, runningBalance };
      });

      const totalPayroll = payrollRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalAdvances = advanceRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalCustodies = custodyRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalDeductions = violationRows.reduce((s: number, r: any) => s + Number(r.credit), 0);

      sections = {
        payroll: { label: "الرواتب", amount: totalPayroll, count: payrollRows.length },
        advances: { label: "السلف", amount: totalAdvances, count: advanceRows.length },
        custodies: { label: "العهد", amount: totalCustodies, count: custodyRows.length },
        deductions: { label: "الخصومات", amount: totalDeductions, count: violationRows.length },
      };

    } else if (entityType === "vehicle") {
      // Vehicle: params = [vehicleId, companyId, ...dates]
      const { filter: fuelFilter, extraParams: fuelDates } = buildDateFilter(2, startDate, endDate);
      const fuelRows = await rawQuery<any>(
        `SELECT fl.id, CONCAT('FUEL-', fl.id) AS ref,
                CONCAT('وقود: ', COALESCE(fl."stationName", ''), ' - ', fl.liters::text, ' لتر') AS description,
                fl."totalCost" AS debit, 0 AS credit,
                fl."fuelDate" AS date, 'fuel' AS "movementType"
         FROM vehicle_fuel_logs fl
         WHERE fl."vehicleId" = $1 AND fl."companyId" = $2 ${fuelFilter.replace(/"createdAt"/g, 'fl."fuelDate"')}
         ORDER BY fl."fuelDate" DESC`,
        [id, scope.companyId, ...fuelDates]
      );

      const { filter: maintFilter, extraParams: maintDates } = buildDateFilter(2, startDate, endDate);
      const maintRows = await rawQuery<any>(
        `SELECT vm.id, CONCAT('MAINT-', vm.id) AS ref,
                CONCAT('صيانة: ', COALESCE(vm.description, vm.type, '')) AS description,
                vm.cost AS debit, 0 AS credit,
                vm."serviceDate" AS date, 'maintenance' AS "movementType"
         FROM vehicle_maintenance vm
         WHERE vm."vehicleId" = $1 AND vm."companyId" = $2 AND vm.cost > 0 ${maintFilter.replace(/"createdAt"/g, 'vm."serviceDate"')}
         ORDER BY vm."serviceDate" DESC`,
        [id, scope.companyId, ...maintDates]
      );

      const { filter: insFilter, extraParams: insDates } = buildDateFilter(2, startDate, endDate);
      const insRows = await rawQuery<any>(
        `SELECT vi.id, CONCAT('INS-', vi.id) AS ref,
                CONCAT('تأمين: ', COALESCE(vi.provider, '')) AS description,
                vi.premium AS debit, 0 AS credit,
                vi."startDate" AS date, 'insurance' AS "movementType"
         FROM vehicle_insurance vi
         WHERE vi."vehicleId" = $1 AND vi."companyId" = $2 ${insFilter.replace(/"createdAt"/g, 'vi."startDate"')}
         ORDER BY vi."startDate" DESC`,
        [id, scope.companyId, ...insDates]
      );

      const all = [...fuelRows, ...maintRows, ...insRows]
        .sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

      let runningBalance = 0;
      movements = all.map((m: any) => {
        runningBalance += Number(m.debit || 0) - Number(m.credit || 0);
        return { ...m, runningBalance };
      });

      const totalFuel = fuelRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
      const totalMaint = maintRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
      const totalIns = insRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);

      sections = {
        fuel: { label: "الوقود", amount: totalFuel, count: fuelRows.length },
        maintenance: { label: "الصيانة", amount: totalMaint, count: maintRows.length },
        insurance: { label: "التأمين", amount: totalIns, count: insRows.length },
      };

    } else if (entityType === "client") {
      // Client: params = [clientId, companyId, ...dates]
      const { filter: invFilter, extraParams: invDates } = buildDateFilter(2, startDate, endDate);
      const invRows = await rawQuery<any>(
        `SELECT i.id, i.ref,
                CONCAT('فاتورة: ', COALESCE(i.description, i.ref)) AS description,
                i.total AS debit, i."paidAmount" AS credit,
                i."createdAt" AS date, 'invoice' AS "movementType"
         FROM invoices i
         WHERE i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL ${invFilter.replace(/"createdAt"/g, 'i."createdAt"')}
         ORDER BY i."createdAt" ASC`,
        [id, scope.companyId, ...invDates]
      );

      let runningBalance = 0;
      movements = invRows.map((m: any) => {
        runningBalance += Number(m.debit || 0) - Number(m.credit || 0);
        return { ...m, runningBalance };
      });

      const totalInvoiced = invRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
      const totalCollected = invRows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
      const outstanding = totalInvoiced - totalCollected;

      sections = {
        invoiced: { label: "إجمالي الفواتير", amount: totalInvoiced, count: invRows.length },
        collected: { label: "المحصّل", amount: totalCollected, count: invRows.filter((r: any) => Number(r.credit) > 0).length },
        outstanding: { label: "المستحق", amount: outstanding },
      };

    } else if (entityType === "supplier") {
      // Supplier: params = [supplierId, companyId, ...dates]
      const { filter: poFilter, extraParams: poDates } = buildDateFilter(2, startDate, endDate);
      const poRows = await rawQuery<any>(
        `SELECT po.id, po.ref,
                CONCAT('أمر شراء: ', po.ref) AS description,
                po."totalAmount" AS debit, 0 AS credit,
                po."createdAt" AS date, 'purchase_order' AS "movementType"
         FROM purchase_orders po
         WHERE po."supplierId" = $1 AND po."companyId" = $2 ${poFilter.replace(/"createdAt"/g, 'po."createdAt"')}
         ORDER BY po."createdAt" DESC`,
        [id, scope.companyId, ...poDates]
      );

      // Payment entries linked via purchase_orders — join by PO ref matching
      const { filter: payFilter, extraParams: payDates } = buildDateFilter(2, startDate, endDate);
      const payRows = await rawQuery<any>(
        `SELECT je.id, je.ref,
                CONCAT('سداد للمورد: ', je.description) AS description,
                0 AS debit, COALESCE(SUM(jl.credit), 0) AS credit,
                je."createdAt" AS date, 'payment' AS "movementType"
         FROM purchase_orders po
         JOIN journal_entries je ON je.ref = CONCAT('PAY-', po.ref) AND je."companyId" = $1 AND je."deletedAt" IS NULL
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" IN ('1100','1110') AND jl.credit > 0
         WHERE po."supplierId" = $2 AND po."companyId" = $1 ${payFilter.replace(/"createdAt"/g, 'je."createdAt"')}
         GROUP BY je.id, je.ref, je.description, je."createdAt"`,
        [scope.companyId, id, ...payDates]
      );

      const all = [...poRows, ...payRows]
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBalance = 0;
      movements = all.map((m: any) => {
        runningBalance += Number(m.debit || 0) - Number(m.credit || 0);
        return { ...m, runningBalance };
      });

      const totalPO = poRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
      const totalPaid = payRows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);

      sections = {
        orders: { label: "أوامر الشراء", amount: totalPO, count: poRows.length },
        paid: { label: "المدفوع", amount: totalPaid, count: payRows.length },
        balance: { label: "الرصيد المستحق", amount: totalPO - totalPaid, count: 0 },
      };

    } else if (entityType === "project") {
      // Project: params = [companyId, projectId, ...dates]
      const { filter: jeFilter, extraParams: jeDates } = buildDateFilter(2, startDate, endDate);
      const jeRows = await rawQuery<any>(
        `SELECT je.id, je.ref, je.description,
                COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit,
                je."createdAt" AS date, 'journal' AS "movementType"
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."projectId" = $2 ${jeFilter.replace(/"createdAt"/g, 'je."createdAt"')}
         GROUP BY je.id, je.ref, je.description, je."createdAt"
         ORDER BY je."createdAt" ASC`,
        [scope.companyId, id, ...jeDates]
      );

      const [projectData] = await rawQuery<any>(
        `SELECT p.budget, p."spentAmount" FROM projects p WHERE p.id = $1 AND p."companyId" = $2`,
        [id, scope.companyId]
      );

      let runningBalance = 0;
      movements = jeRows.map((m: any) => {
        runningBalance += Number(m.debit) - Number(m.credit);
        return { ...m, runningBalance };
      });

      const totalExpenses = jeRows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
      const totalRevenue = jeRows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
      const budget = Number(projectData?.budget || 0);
      const variance = budget - totalExpenses;

      sections = {
        budget: { label: "الميزانية", amount: budget },
        expenses: { label: "المصروفات الفعلية", amount: totalExpenses, count: jeRows.length },
        revenue: { label: "الإيرادات", amount: totalRevenue },
        variance: { label: "الانحراف", amount: variance },
      };
    }

    const totalDebit = movements.reduce((s: number, m: any) => s + Number(m.debit || 0), 0);
    const totalCredit = movements.reduce((s: number, m: any) => s + Number(m.credit || 0), 0);
    const netBalance = totalDebit - totalCredit;

    res.json({ movements, summary: { totalDebit, totalCredit, netBalance, count: movements.length }, sections });
  } catch (err) {
    handleRouteError(err, res, "Subsidiary ledger error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED FINANCIAL REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// Entity Statement (Employee / Client / Supplier)
router.get("/reports/entity-statement", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, startDate, endDate } = req.query as any;

    let rows: any[] = [];
    let entityName = "";

    if (entityType === "employee" && entityId) {
      const [emp] = await rawQuery<any>(
        `SELECT e.name, ea.id AS aid FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
         WHERE e.id = $2 LIMIT 1`,
        [scope.companyId, Number(entityId)]
      );
      entityName = emp?.name || "";
      const aid = emp?.aid;
      if (aid) {
        const qParams: any[] = [aid, scope.companyId];
        let dateFilter = "";
        if (startDate) { qParams.push(startDate); dateFilter += ` AND pr."createdAt" >= $${qParams.length}`; }
        if (endDate) { qParams.push(endDate); dateFilter += ` AND pr."createdAt" <= $${qParams.length}`; }
        rows = await rawQuery<any>(
          `SELECT pr.period AS ref, CONCAT('راتب ', pr.period) AS description,
                  pr."grossSalary" AS debit, pr."totalDeductions" AS credit,
                  pr."netSalary" AS net, pr."createdAt" AS date, 'payroll' AS type
           FROM payroll_records pr
           WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${dateFilter}
           ORDER BY pr."createdAt" DESC LIMIT 100`,
          qParams
        );
      }
    } else if (entityType === "client" && entityId) {
      const [cl] = await rawQuery<any>(`SELECT name FROM clients WHERE id = $1 AND "companyId" = $2`, [Number(entityId), scope.companyId]);
      entityName = cl?.name || "";
      const qParams: any[] = [Number(entityId), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND i."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND i."createdAt" <= $${qParams.length}`; }
      rows = await rawQuery<any>(
        `SELECT i.ref, COALESCE(i.description, i.ref) AS description,
                i.total AS debit, i."paidAmount" AS credit,
                (i.total - i."paidAmount") AS net,
                i."createdAt" AS date, i.status AS type
         FROM invoices i WHERE i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL ${dateFilter}
         ORDER BY i."createdAt" DESC LIMIT 100`,
        qParams
      );
    } else if (entityType === "supplier" && entityId) {
      const [sup] = await rawQuery<any>(`SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2`, [Number(entityId), scope.companyId]);
      entityName = sup?.name || "";
      const qParams: any[] = [Number(entityId), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND po."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND po."createdAt" <= $${qParams.length}`; }
      rows = await rawQuery<any>(
        `SELECT po.ref, CONCAT('أمر شراء: ', po.ref) AS description,
                po."totalAmount" AS debit, 0 AS credit,
                po."totalAmount" AS net,
                po."createdAt" AS date, po.status AS type
         FROM purchase_orders po WHERE po."supplierId" = $1 AND po."companyId" = $2 ${dateFilter}
         ORDER BY po."createdAt" DESC LIMIT 100`,
        qParams
      );
    }

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);

    res.json({ entityName, entityType, rows, summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "Entity statement error:");
  }
});

// Custody & Advances Report
router.get("/reports/custody-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const custodies = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status,
              e.name AS "employeeName", 'custody' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, e.name
       ORDER BY je."createdAt" DESC`,
      params
    );

    const advances = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status,
              e.name AS "employeeName", 'advance' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'ADV%' ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, e.name
       ORDER BY je."createdAt" DESC`,
      params
    );

    const totalCustodies = custodies.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalAdvances = advances.reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({
      custodies, advances,
      summary: {
        totalCustodies, custodyCount: custodies.length,
        totalAdvances, advanceCount: advances.length,
        total: totalCustodies + totalAdvances,
      }
    });
  } catch (err) {
    handleRouteError(err, res, "Custody advances report error:");
  }
});

// Expenses by account / branch / employee
router.get("/reports/expenses-analysis", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId, departmentId, projectId, costCenterId, groupBy = "account" } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }
    if (projectId) { params.push(projectId); dateFilter += ` AND je."projectId" = $${params.length}`; }

    let selectCol = "coa.code AS key, coa.name AS label";
    let groupCol = "coa.code, coa.name";
    if (groupBy === "branch") {
      selectCol = "b.id AS key, COALESCE(b.name, 'غير محدد') AS label";
      groupCol = "b.id, b.name";
    } else if (groupBy === "employee") {
      selectCol = "e.id AS key, COALESCE(e.name, 'غير محدد') AS label";
      groupCol = "e.id, e.name";
    }

    const rows = await rawQuery<any>(
      `SELECT ${selectCol},
              COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'expense'
       LEFT JOIN branches b ON b.id = je."branchId"
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE jl.debit > jl.credit
       GROUP BY ${groupCol}
       ORDER BY amount DESC`,
      params
    );

    const total = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { total, count: rows.length, groupBy } });
  } catch (err) {
    handleRouteError(err, res, "Expenses analysis error:");
  }
});

// Revenue by activity
router.get("/reports/revenue-analysis", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const byAccount = await rawQuery<any>(
      `SELECT coa.code, coa.name,
              COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'revenue'
       GROUP BY coa.code, coa.name
       ORDER BY amount DESC`,
      params
    );

    const byMonth = await rawQuery<any>(
      `SELECT to_char(i."createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM(i."paidAmount"), 0) AS collected,
              COALESCE(SUM(i.total), 0) AS invoiced,
              COUNT(*) AS "invoiceCount"
       FROM invoices i
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${dateFilter.replace(/je\./g, 'i.')}
       GROUP BY to_char(i."createdAt", 'YYYY-MM')
       ORDER BY period ASC`,
      params
    );

    const totalRevenue = byAccount.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ byAccount, byMonth, summary: { totalRevenue, accountCount: byAccount.length } });
  } catch (err) {
    handleRouteError(err, res, "Revenue analysis error:");
  }
});

// Budget vs Actual Variance Report
router.get("/reports/budget-variance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { period, branchId } = req.query as any;

    const targetPeriod = period || new Date().toISOString().slice(0, 7);
    const params: any[] = [scope.companyId, targetPeriod];
    const branchFilter = branchId ? ` AND b."branchId" = $${params.length + 1}` : "";
    if (branchId) params.push(branchId);

    const rows = await rawQuery<any>(
      `SELECT b."accountCode", b.amount AS budget,
              coa.name AS "accountName", coa.type,
              COALESCE(b.used, 0) AS actual,
              b.amount - COALESCE(b.used, 0) AS variance,
              CASE WHEN b.amount > 0 THEN ROUND(COALESCE(b.used, 0)::numeric / b.amount * 100, 1) ELSE 0 END AS "usagePct"
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = $1
       WHERE b."companyId" = $1 AND b.period = $2 ${branchFilter}
       ORDER BY b."accountCode"`,
      params
    );

    const totalBudget = rows.reduce((s: number, r: any) => s + Number(r.budget || 0), 0);
    const totalActual = rows.reduce((s: number, r: any) => s + Number(r.actual || 0), 0);
    const totalVariance = totalBudget - totalActual;

    res.json({ data: rows, summary: { totalBudget, totalActual, totalVariance, period: targetPeriod } });
  } catch (err) {
    handleRouteError(err, res, "Budget variance error:");
  }
});

// Cash/Bank Movement Statement
router.get("/reports/cash-bank-statement", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, accountCode = "1100", branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const [accountInfo] = await rawQuery<any>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`,
      [scope.companyId, accountCode]
    );

    const entries = await rawQuery<any>(
      `SELECT jl.id, je.ref, je.description,
              jl.debit, jl.credit, je."createdAt" AS date,
              b.name AS "branchName"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       LEFT JOIN branches b ON b.id = je."branchId"
       WHERE jl."accountCode" = $2
       ORDER BY je."createdAt" ASC`,
      params
    );

    let runningBalance = 0;
    const enriched = entries.map((e: any) => {
      runningBalance += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance };
    });

    const totalDebit = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
    const totalCredit = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);

    res.json({
      account: accountInfo,
      entries: enriched,
      summary: { totalDebit, totalCredit, closingBalance: runningBalance, count: entries.length }
    });
  } catch (err) {
    handleRouteError(err, res, "Cash bank statement error:");
  }
});

export default router;
