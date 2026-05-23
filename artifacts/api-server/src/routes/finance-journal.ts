import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { FINANCE_ROLES, OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  reverseAccountBalances,
  checkFinancialPeriodOpen,
  computeVat,
  currentPeriod,
  currentDateInTz,
  generateRef,
  toDateISO,
  roundTo2,
  applyJournalEntryBalances,
} from "../lib/businessHelpers.js";
import {
  requestIdempotencyToken,
  markIdempotencyReplay,
  idempotencyResponseMeta,
  isDryRun,
} from "../lib/requestIdempotency.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

export const journalRouter = Router();
journalRouter.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// ZOD SCHEMAS — request body validation
// ─────────────────────────────────────────────────────────────────────────────

const expenseImpactPreviewSchema = z.object({
  amount: z.any().optional(),
  expenseType: z.string().optional(),
  paymentMethod: z.string().optional(),
  costCenter: z.string().optional(),
  supplierId: z.any().optional(),
  branchId: z.any().optional(),
});

const createExpenseSchema = z.object({
  accountCode: z.string().optional(),
  amount: z.any().optional(),
  description: z.string().optional(),
  period: z.string().optional(),
  sourceAccountCode: z.string().optional(),
  branchId: z.any().optional(),
  companyId: z.any().optional(),
  departmentId: z.any().optional(),
  costCenter: z.string().optional(),
  expenseType: z.string().optional(),
  subAccountCode: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.any().optional(),
  relatedEntityName: z.string().optional(),
  paymentMethod: z.string().optional(),
  vatRate: z.any().optional(),
  vatAmount: z.any().optional(),
  reference: z.string().optional(),
  status: z.enum(["draft", "posted", "pending_approval", "approved", "rejected", "returned", "cancelled"]).optional(),
  isPaid: z.any().optional(),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string().optional(),
  operationType: z.string().optional(),
  autoDescription: z.any().optional(),
  projectId: z.any().optional(),
  taxCategory: z.string().optional(),
  govSyncEnabled: z.any().optional(),
  govIntegrationId: z.any().optional(),
  govEntityType: z.string().optional(),
  govEntityId: z.any().optional(),
  date: z.string().optional(),
  isTaxLinked: z.boolean().optional(),
  invoiceTypeCode: z.string().optional(),
  taxCategoryCode: z.string().optional(),
  exemptionReason: z.string().optional(),
});

const updateDescriptionSchema = z.object({
  description: z.string().optional(),
});

const approvalSchema = z.object({
  approved: z.any().optional(),
  notes: z.string().optional(),
});

const voucherAllocationSchema = z.object({
  obligationType: z.enum(["purchase_order", "nusk_invoice", "expense", "manual"]),
  obligationId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().finite(),
  notes: z.string().optional(),
});

const createVoucherSchema = z.object({
  type: z.string().optional(),
  amount: z.any().optional(),
  description: z.string().optional(),
  payee: z.string().optional(),
  accountCode: z.string().optional(),
  method: z.string().optional().default("cash"),
  sourceAccountCode: z.string().optional(),
  subAccountCode: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.any().optional(),
  relatedEntityName: z.string().optional(),
  contractId: z.any().optional(),
  invoiceId: z.any().optional(),
  reference: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string().optional(),
  vatRate: z.any().optional(),
  vatAmount: z.any().optional(),
  beneficiaryType: z.string().optional(),
  entitlementType: z.string().optional(),
  branchId: z.any().optional(),
  departmentId: z.any().optional(),
  autoDescription: z.any().optional(),
  operationType: z.string().optional(),
  date: z.string().optional(),
  costCenter: z.string().optional(),
  allocations: z.array(voucherAllocationSchema).optional(),
});

const createSalaryAdvanceSchema = z.object({
  employeeName: z.string().optional(),
  amount: z.any().optional(),
  description: z.string().optional(),
  deductMonths: z.any().optional().default(1),
  sourceAccountCode: z.string().optional(),
  employeeId: z.any().optional(),
});

const journalLineSchema = z.object({
  accountCode: z.string(),
  description: z.string().optional(),
  debit: z.any().optional(),
  credit: z.any().optional(),
  costCenter: z.string().optional(),
  departmentId: z.any().optional(),
  projectId: z.any().optional(),
  employeeId: z.any().optional(),
});

const createJournalSchema = z.object({
  description: z.string().optional(),
  lines: z.array(journalLineSchema).optional(),
  date: z.string().optional(),
});

const reverseJournalSchema = z.object({
  reason: z.string().optional(),
  reverseDate: z.string().optional(),
});

const yearEndCloseSchema = z.object({
  retainedEarningsAccountCode: z.string().optional().default("3300"),
  force: z.boolean().optional().default(false),
});

const openingBalanceLineSchema = z.object({
  accountCode: z.string(),
  debit: z.coerce.number(),
  credit: z.coerce.number(),
});

const openingBalancesSchema = z.object({
  periodStart: z.string().optional(),
  lines: z.array(openingBalanceLineSchema).optional(),
  force: z.boolean().optional(),
});

const openingBalancesImportCsvSchema = z.object({
  periodStart: z.string().optional(),
  csv: z.string().optional(),
  force: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY STATE MACHINE — Phase C.7 Finance audit
// ─────────────────────────────────────────────────────────────────────────────
const JOURNAL_TRANSITIONS: Record<string, readonly string[]> = {
  draft:            ["pending_approval", "approved", "cancelled", "rejected", "returned"],
  pending_approval: ["approved", "rejected", "returned", "cancelled"],
  approved:         ["posted", "cancelled"],
  returned:         ["draft", "pending_approval", "cancelled"],
  rejected:         ["draft", "cancelled"],
  posted:           ["reversed"],
  reversed:         [],
  cancelled:        [],
};

function generateAutoDescription(params: { operationType: string; relatedEntityName?: string; period?: string; branchName?: string; amount?: number; expenseType?: string }): string {
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

function checkAttachmentRequired(params: { operationType: string; amount?: number; hasAttachment?: boolean }): { required: boolean; reason?: string } {
  const { operationType, amount = 0 } = params;
  const HIGH_VALUE_THRESHOLD = 5000;
  const attachmentRequiredTypes = ["vendor_invoice", "purchase", "custody_settlement", "advance_claim", "legal_fee"];
  if (attachmentRequiredTypes.includes(operationType)) { return { required: true, reason: `المرفقات إلزامية لعمليات من نوع: ${operationType}` }; }
  if (amount >= HIGH_VALUE_THRESHOLD && operationType === "payment") { return { required: true, reason: `المرفقات إلزامية لسندات الصرف الكبيرة (أكثر من ${HIGH_VALUE_THRESHOLD.toLocaleString()} ريال)` }; }
  return { required: false };
}

journalRouter.get("/expenses", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<Record<string, unknown>>(
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
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId" AND coa."deletedAt" IS NULL
       WHERE ${where} AND je.ref LIKE 'EXP%' AND je."deletedAt" IS NULL
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status,
                je."costCenter", je."departmentId", je."relatedEntityType", je."relatedEntityId",
                je."paymentMethod", je.reference, je."isPaid", je."attachmentUrl", je."attachmentType",
                je."expenseType", je."operationType",
                je."govSyncEnabled", je."govIntegrationId", je."govEntityType", je."govEntityId"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    logger.error(err, "Get expenses error:");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

// Impact preview — shows what will happen when the expense is created
journalRouter.post("/expenses/impact-preview", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { amount, expenseType, paymentMethod, costCenter, supplierId, branchId } = zodParse(expenseImpactPreviewSchema.safeParse(req.body ?? {}));
    const amt = Number(amount || 0);

    const items: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [];

    items.push({
      category: "مالي",
      label: "المبلغ",
      value: `${amt.toLocaleString("ar-SA")} ر.س ${expenseType ? `(${expenseType})` : ""}`.trim(),
      severity: "info",
    });

    items.push({
      category: "محاسبي",
      label: "قيد مصروف",
      value: paymentMethod === "cash"
        ? `مدين حساب المصروف ${amt.toLocaleString("ar-SA")} / دائن النقدية`
        : paymentMethod === "bank"
        ? `مدين حساب المصروف ${amt.toLocaleString("ar-SA")} / دائن البنك`
        : `مدين حساب المصروف ${amt.toLocaleString("ar-SA")} / دائن الذمم الدائنة`,
      severity: "info",
    });

    if (costCenter) {
      const [budget] = await rawQuery<Record<string, unknown>>(
        `SELECT cc.name, cc."allocatedAmount",
                COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" WHERE je."companyId" = $2 AND jl."costCenter" = cc.name AND je."deletedAt" IS NULL), 0) AS "usedAmount"
         FROM cost_centers cc WHERE cc.name = $1 AND cc."companyId" = $2 LIMIT 1`,
        [costCenter, scope.companyId]
      );
      if (budget) {
        const allocated = Number(budget.allocatedAmount || 0);
        const used = Number(budget.usedAmount || 0);
        const remaining = allocated - used;
        const afterThis = remaining - amt;
        items.push({
          category: "الميزانية",
          label: `مركز تكلفة ${budget.name}`,
          value: `المتاح ${remaining.toLocaleString("ar-SA")} — بعد هذا المصروف ${afterThis.toLocaleString("ar-SA")} ر.س`,
          severity: afterThis < 0 ? "danger" : afterThis < allocated * 0.1 ? "warning" : "info",
        });
        if (afterThis < 0) {
          items.push({
            category: "الميزانية",
            label: "تجاوز ميزانية",
            value: `سيتم تجاوز ميزانية مركز التكلفة بـ ${Math.abs(afterThis).toLocaleString("ar-SA")} ر.س — يتطلب اعتماد إضافي`,
            severity: "danger",
          });
        }
      }
    }

    if (amt >= 10000) {
      items.push({
        category: "مسار الاعتماد",
        label: "الموافقات",
        value: amt >= 50000 ? "مدير عام + مدير مالي" : "مدير مالي",
        severity: amt >= 50000 ? "warning" : "info",
      });
    }

    if (supplierId) {
      const [supplier] = await rawQuery<Record<string, unknown>>(
        `SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(supplierId), scope.companyId]
      );
      if (supplier) {
        items.push({
          category: "المورد",
          label: "إضافة دفعة",
          value: `ستُسجل كـ "مستحقة" على حساب ${supplier.name} إذا لم تكن نقدية`,
          severity: "info",
        });
      }
    }

    items.push({
      category: "تقارير",
      label: "تقارير الأداء",
      value: "سيظهر المصروف في التقارير المالية وتحليل المصروفات",
      severity: "info",
    });

    const hasDanger = items.some((i) => i.severity === "danger");
    const hasWarning = items.some((i) => i.severity === "warning");
    res.json({
      actionType: "create_expense",
      employeeId: 0,
      employeeName: "",
      items,
      summary: hasDanger
        ? "مصروف يتجاوز الميزانية — مطلوب اعتماد إضافي"
        : hasWarning
        ? `مصروف ${amt.toLocaleString("ar-SA")} ر.س — راجع الاعتمادات`
        : `مصروف ${amt.toLocaleString("ar-SA")} ر.س جاهز للتسجيل`,
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في معاينة أثر المصروف");
  }
});

// RBAC v2: SoD-critical — finance.journal create vs approve are
// guarded by the seeded `finance_journal_create_approve` SoD rule.
journalRouter.post("/expenses", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createExpenseSchema.safeParse(req.body ?? {}));
    const {
      accountCode, amount, description, period, sourceAccountCode,
      branchId, companyId: bodyCompanyId, departmentId, costCenter, expenseType, subAccountCode,
      relatedEntityType, relatedEntityId, relatedEntityName,
      paymentMethod, vatRate: rawVatRate, vatAmount: rawVatAmount,
      reference, status: reqStatus, isPaid,
      attachmentUrl, attachmentType, operationType,
      autoDescription, projectId, taxCategory,
      govSyncEnabled, govIntegrationId, govEntityType, govEntityId,
    } = b;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!accountCode) { throw new ValidationError("لا يمكن صرف بدون حساب محاسبي واضح", { field: "accountCode", fix: "حدد الحساب المحاسبي للمصروف (مثل 5100 رواتب، 5200 وقود)" }); }
    if (!amount || Number(amount) <= 0) { throw new ValidationError("لا يمكن تسجيل مصروف بقيمة صفر أو سالبة", { field: "amount", fix: "أدخل مبلغ المصروف بقيمة موجبة" }); }
    if (!branchId && !scope.branchId) { throw new ValidationError("الفرع مطلوب لتسجيل المصروف", { field: "branchId", fix: "حدد الفرع الذي ينتمي إليه هذا المصروف" }); }
    if (branchId != null &&
        !scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) &&
        scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(Number(branchId))) {
      throw new ForbiddenError("لا تملك صلاحية تسجيل مصروفات في هذا الفرع", { field: "branchId" });
    }
    if (!costCenter) { throw new ValidationError("مركز التكلفة مطلوب لتسجيل المصروف", { field: "costCenter", fix: "حدد مركز التكلفة (مثل: مشروع-001، فرع-الرياض)" }); }

    let costCenterValidationEnabled = false;
    try {
      const [costCenterSettingRow] = await rawQuery<Record<string, unknown>>(
        `SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'costCenterEnabled' LIMIT 1`,
        [effectiveCompanyId]
      );
      costCenterValidationEnabled = costCenterSettingRow?.value === "true";
    } catch (e) { logger.warn(e, "system_settings table may not exist yet"); }
    if (costCenterValidationEnabled) {
      const [ccRow] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM departments WHERE "companyId" = ANY($1) AND name = $2 LIMIT 1`,
        [[effectiveCompanyId], costCenter]
      );
      if (!ccRow) {
        throw new ValidationError(`مركز التكلفة "${costCenter}" غير موجود في بيانات الشركة`, { field: "costCenter", fix: "أدخل مركز تكلفة معرّف في إعدادات الأقسام" });
      }
    }

    const attachCheck = checkAttachmentRequired({ operationType: operationType || expenseType || "expense", amount: Number(amount), hasAttachment: !!attachmentUrl });
    if (attachCheck.required && !attachmentUrl) {
      throw new ValidationError(
        attachCheck.reason ?? "المرفق مطلوب",
        { field: "attachmentUrl", fix: "ارفع المستند الداعم (فاتورة، إشعار تحويل، وصل استلام) قبل الحفظ" }
      );
    }

    const targetPeriod = period ?? currentPeriod();
    const sourceAcct = sourceAccountCode || "1100";

    if (accountCode && amount) {
      await withTransaction(async (client) => {
        // Lock the budget row to prevent concurrent race conditions
        const lockResult = await client.query(
          `SELECT id, amount, used FROM budgets
           WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3 AND "deletedAt" IS NULL
           FOR UPDATE`,
          [effectiveCompanyId, accountCode, targetPeriod]
        );
        if (lockResult.rows.length > 0) {
          const budget = lockResult.rows[0];
          const budgetAmount = Number(budget.amount);
          const currentUsed = Number(budget.used);
          const newUsed = currentUsed + Number(amount);
          const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;

          if (utilization > 110) {
            throw new ConflictError(
              "تجاوز الميزانية أكثر من 110% – رفض نهائي",
              { field: "amount", fix: "أعد تقييم الميزانية أو قلل المبلغ المطلوب", meta: { utilization: Math.round(utilization), status: "rejected" } }
            );
          }
          if (utilization > 99 && !OWNER_GM_ROLES.includes(scope.role)) {
            throw new ForbiddenError(
              "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط",
              { fix: "اطلب موافقة المدير العام قبل المتابعة", meta: { utilization: Math.round(utilization), status: "blocked_gm" } }
            );
          }
          if (utilization > 80 && !FINANCE_ROLES.includes(scope.role)) {
            throw new ForbiddenError(
              "استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
              { fix: "اطلب موافقة المدير المالي قبل المتابعة", meta: { utilization: Math.round(utilization), status: "warning_cfo" } }
            );
          }

          // Only increment if all checks pass
          await client.query(
            `UPDATE budgets SET used = $1
             WHERE id = $2`,
            [newUsed, budget.id]
          );
        }
      });
    }

    const baseAmount = roundTo2(Number(amount) || 0);
    if (!baseAmount || isNaN(baseAmount)) throw new ValidationError("المبلغ غير صالح", { field: "amount" });
    const vatRateVal = rawVatRate != null ? (Number(rawVatRate) || 0) : 0;
    const computedVat = roundTo2(rawVatAmount != null ? (Number(rawVatAmount) || 0) : computeVat(baseAmount, vatRateVal));
    const totalWithVat = roundTo2(baseAmount + computedVat);

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || expenseType || "expense", relatedEntityName, period: targetPeriod, amount: baseAmount, expenseType });
    }

    const idempotencyToken = requestIdempotencyToken(req);
    const ref = `EXP-${idempotencyToken}`;
    const entityLink: Record<string, any> = {};
    if (relatedEntityType === "employee" && relatedEntityId) entityLink.employeeId = Number(relatedEntityId);
    if (relatedEntityType === "vehicle" && relatedEntityId) entityLink.vehicleId = Number(relatedEntityId);
    if (relatedEntityType === "property" && relatedEntityId) entityLink.propertyId = Number(relatedEntityId);
    if (relatedEntityType === "contract" && relatedEntityId) entityLink.contractId = Number(relatedEntityId);
    if (projectId) entityLink.projectId = Number(projectId);
    if (costCenter) entityLink.costCenter = costCenter;

    const { financialEngine } = await import("../lib/engines/index.js");
    const journalLines: any[] = [{ accountCode: accountCode ?? "5000", debit: baseAmount, credit: 0, ...entityLink }];
    if (computedVat > 0) {
      const inputVatCode = await financialEngine.resolveAccountCode(effectiveCompanyId, "vat_input", "debit", "1400");
      journalLines.push({ accountCode: inputVatCode, debit: computedVat, credit: 0 });
    }
    journalLines.push({ accountCode: sourceAcct, debit: 0, credit: totalWithVat });
    if (subAccountCode && subAccountCode !== accountCode) { journalLines[0].accountCode = subAccountCode; }

    // C3 — the journal entry, its header metadata and the approval chain are
    // created in ONE transaction. A failure anywhere (or a crash) rolls the
    // whole thing back, so there is never a posted expense entry without its
    // approval request, nor an approval chain pointing at a missing entry.
    // postJournalEntry's own withTransaction joins this one via savepoint;
    // rawExecute joins via the transaction async-context.
    const { journalId, alreadyExists, approvalResult } = await withTransaction(async () => {
      const posted = await financialEngine.postJournalEntry({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, type: "expense", sourceType: operationType || "expense", sourceId: 0, sourceKey: `finance:expense:${idempotencyToken}`, lines: journalLines });

      await rawExecute(
        `UPDATE journal_entries SET "costCenter" = $1, "departmentId" = $2, "relatedEntityType" = $3, "relatedEntityId" = $4, "paymentMethod" = $5, reference = $6, "isPaid" = $7, "attachmentUrl" = $8, "attachmentType" = $9, "expenseType" = $10, "operationType" = $11, "projectId" = $12, "taxCategory" = $13, "govSyncEnabled" = $14, "govIntegrationId" = $15, "govEntityType" = $16, "govEntityId" = $17 WHERE id = $18 AND "companyId" = $19 AND "deletedAt" IS NULL`,
        [costCenter ?? null, departmentId ?? null, relatedEntityType ?? null, relatedEntityId ?? null, paymentMethod ?? "cash", reference ?? null, isPaid != null ? !!isPaid : true, attachmentUrl ?? null, attachmentType ?? null, expenseType ?? null, operationType ?? "expense", projectId ?? null, taxCategory ?? null, govSyncEnabled ? true : false, govIntegrationId ? Number(govIntegrationId) : null, govEntityType ?? null, govEntityId ? Number(govEntityId) : null, posted.journalId, effectiveCompanyId]
      );

      if (govSyncEnabled && govIntegrationId && govEntityType && govEntityId) {
        const [validIntegration] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM gov_integrations WHERE id = $1 AND "companyId" = $2`,
          [Number(govIntegrationId), effectiveCompanyId]
        );
        if (validIntegration) {
          // Best-effort — isolated in its own savepoint so a failed link
          // insert rolls back alone and never poisons the expense txn.
          await withTransaction(async () => {
            await rawExecute(
              `INSERT INTO gov_integration_links ("companyId", "integrationId", "entityType", "entityId", "externalRef", enabled, "syncStatus")
               VALUES ($1, $2, $3, $4, $5, true, 'pending')
               ON CONFLICT ("companyId", "integrationId", "entityType", "entityId") DO NOTHING`,
              [effectiveCompanyId, Number(govIntegrationId), govEntityType, Number(govEntityId), ref]
            );
          }).catch((e) => logger.error(e, "finance-journal background task failed"));
        }
      }

      const approval = await initiateApprovalChain({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, chainType: "expenses", refType: "expense", refId: posted.journalId, amount: Number(amount ?? 0) });
      if (approval.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`, [posted.journalId, effectiveCompanyId]); }

      return { journalId: posted.journalId, alreadyExists: posted.alreadyExists, approvalResult: approval };
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({ companyId: effectiveCompanyId, userId: scope.userId, action: "expense.created", entity: "expenses", entityId: journalId, details: JSON.stringify({ ref, accountCode, amount: baseAmount, vatAmount: computedVat, totalWithVat, sourceAccountCode: sourceAcct, approvalRequired: approvalResult.requiresApproval, operationType, expenseType, relatedEntityType, relatedEntityId }) }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdExpense] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, effectiveCompanyId]
    );
    res.status(201).json({ ...(createdExpense || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Create expense error:");
  }
});

journalRouter.patch("/expenses/:id", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { description } = zodParse(updateDescriptionSchema.safeParse(req.body ?? {}));
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id, status, "createdAt" FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المصروف غير موجود");
    // PD-4: a posted journal entry is immutable — a posted expense is
    // corrected via a reversing entry, never an in-place description edit.
    if (existing.status === "posted") {
      throw new ConflictError("لا يمكن تعديل مصروف مُرحَّل — صحّحه عبر قيد عاكس", {
        field: "status",
        fix: "أنشئ قيداً عاكساً بدل تعديل المصروف المُرحَّل",
      });
    }
    const expenseDate = toDateISO(existing.createdAt as string);
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, expenseDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تعديل مصروف في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}`);
    }
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *`, [description, id, scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.delete("/expenses/:id", authorize({ feature: "finance.journal", action: "delete", resource: { table: "expenses", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'draft' RETURNING id`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
    await reverseAccountBalances(scope.companyId, row.id as number);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.patch("/expenses/:id/approve", authorize({ feature: "finance.journal", action: "approve", resource: { table: "expenses", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;

    const expenseId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));

    // Fetch ref for the audit trail; state gating handled by the engine.
    const [exp] = await rawQuery<Record<string, unknown>>(
      `SELECT ref FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'EXP%'`,
      [expenseId, scope.companyId]
    );
    if (!exp) throw new NotFoundError("المصروف غير موجود");

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && (!notes || !String(notes).trim())) {
      throw new ValidationError(
        newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع",
        { field: "notes", fix: "أدخل سبب القرار في حقل الملاحظات" }
      );
    }

    // Central lifecycle engine: expense approval uses the shared `status`
    // column on journal_entries. fromStates restricts the decision to
    // pending/draft — an already-approved or already-rejected expense
    // cannot be flipped again without going through a separate re-open
    // flow. The onApply hook writes the approval_actions trail in the
    // same transaction.
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "journal_entries",
      id: expenseId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `expense.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'EXP%'`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
           VALUES ('expense',$1,$2,$3,$4,$5)`,
          [expenseId, newStatus, notes || null, scope.userId, scope.companyId]
        );
        // The expense moved GL balances at creation time; a rejected /
        // returned expense must reverse them or the books stay overstated.
        // This runs in the SAME transaction as the status change — if the
        // reversal fails the whole decision rolls back, so the status can
        // never flip without the matching reversal. reverseAccountBalances'
        // rawQuery/rawExecute join this transaction via the async context.
        if (newStatus === "rejected" || newStatus === "returned") {
          await reverseAccountBalances(scope.companyId, expenseId);
        }
      },
      after: { ref: exp.ref, decision: newStatus, notes: notes ?? null },
    });

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({
      message: labels[newStatus] || newStatus,
      status: updated.status,
      event: `expense.${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve expense error:");
  }
});

journalRouter.get("/vouchers", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description,
              CASE WHEN je.ref LIKE 'RV%' THEN 'receipt' ELSE 'payment' END AS type,
              je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
              je."relatedEntityType", je."relatedEntityId", je."operationType",
              COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, je.status
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL AND (je.ref LIKE 'RV%' OR je.ref LIKE 'PV%')
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status,
                je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
                je."relatedEntityType", je."relatedEntityId", je."operationType"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    logger.error(err, "Get vouchers error:");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

journalRouter.get("/vouchers/:id", authorize({ feature: "finance.journal", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description,
              CASE WHEN je.ref LIKE 'RV%' THEN 'receipt' ELSE 'payment' END AS "voucherType",
              je."paymentMethod", je.reference, je."attachmentUrl", je."attachmentType",
              je."relatedEntityType", je."relatedEntityId", je."operationType",
              COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt", je.status
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
         AND (je.ref LIKE 'RV%' OR je.ref LIKE 'PV%')
       GROUP BY je.id`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("السند غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get voucher detail error:"); }
});

journalRouter.post("/vouchers", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createVoucherSchema.safeParse(req.body ?? {}));
    const {
      type, amount, description, payee, accountCode, method, sourceAccountCode,
      subAccountCode, relatedEntityType, relatedEntityId, relatedEntityName,
      contractId, invoiceId, reference, attachmentUrl, attachmentType,
      vatRate: rawVatRate, vatAmount: rawVatAmount,
      beneficiaryType, entitlementType, branchId, departmentId,
      autoDescription, operationType, allocations,
    } = b;

    // C4 + C5 — allocations tie this voucher to specific AP obligations
    // (purchase_orders, umrah_nusk_invoices, …). Σ allocations must not
    // exceed the voucher amount and only PV (payment) vouchers carry them.
    // Σ-vs-amount is re-checked once baseAmount is resolved below.
    if (allocations && allocations.length > 0 && type !== "payment") {
      throw new ValidationError("التخصيصات مدعومة لسندات الصرف فقط", {
        field: "allocations",
        fix: "احذف التخصيصات أو غيّر نوع السند إلى صرف",
      });
    }

    if (!type) {
      throw new ValidationError("نوع السند مطلوب", { field: "type", fix: "اختر receipt (قبض) أو payment (صرف)" });
    }
    if (!amount) {
      throw new ValidationError("المبلغ مطلوب", { field: "amount", fix: "أدخل مبلغ السند" });
    }
    if (Number(amount) <= 0) {
      throw new ValidationError("لا يمكن إنشاء سند بمبلغ صفر أو سالب", { field: "amount", fix: "أدخل مبلغاً موجباً للسند" });
    }
    if (!branchId && !scope.branchId) {
      throw new ValidationError("الفرع مطلوب لإنشاء السند", { field: "branchId", fix: "حدد الفرع الذي ينتمي إليه هذا السند" });
    }
    if (!accountCode) {
      throw new ValidationError("الحساب المحاسبي مطلوب", { field: "accountCode", fix: "حدد الحساب المحاسبي الرئيسي للسند" });
    }

    const voucherAttachCheck = checkAttachmentRequired({ operationType: type === "payment" ? "payment" : "receipt", amount: Number(amount) });
    if (voucherAttachCheck.required && !attachmentUrl) {
      throw new ValidationError(
        voucherAttachCheck.reason ?? "المرفق مطلوب",
        { field: "attachmentUrl", fix: "ارفع وصل الاستلام أو أمر التحويل للسندات الكبيرة" }
      );
    }

    const resolvedSourceAccount = sourceAccountCode || "1100";
    const [sourceAcctRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id, code, name, type, subtype, "accountSubtype" FROM chart_of_accounts
       WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, resolvedSourceAccount]
    );
    if (!sourceAcctRow) {
      throw new ValidationError(
        `حساب المصدر "${resolvedSourceAccount}" غير موجود في دليل الحسابات`,
        { field: "sourceAccountCode", fix: "استخدم حساباً نقدياً مثل 1100 (الصندوق) أو 1110 (البنك)" }
      );
    }
    const cashBankSubtypes = ["cash", "bank", "cash_and_bank"];
    const isCashOrBank =
      cashBankSubtypes.includes((sourceAcctRow.subtype as string) ?? "") ||
      cashBankSubtypes.includes((sourceAcctRow.accountSubtype as string) ?? "") ||
      /^11[01]\d/.test(sourceAcctRow.code as string);
    if (!isCashOrBank) {
      throw new ValidationError(
        `حساب المصدر "${sourceAcctRow.code} - ${sourceAcctRow.name}" ليس حساباً نقدياً أو بنكياً`,
        { field: "sourceAccountCode", fix: "استخدم حساباً نقدياً أو بنكياً (عادةً كود يبدأ بـ 11)" }
      );
    }

    const baseAmount = roundTo2(Number(amount) || 0);
    if (!baseAmount || isNaN(baseAmount)) throw new ValidationError("المبلغ غير صالح", { field: "amount" });

    if (allocations && allocations.length > 0) {
      const allocTotal = roundTo2(allocations.reduce((s, a) => s + Number(a.amount), 0));
      if (allocTotal > baseAmount + 0.005) {
        throw new ValidationError(
          `مجموع التخصيصات (${allocTotal}) يتجاوز مبلغ السند (${baseAmount})`,
          { field: "allocations", fix: "خفّض مبالغ التخصيصات أو ارفع مبلغ السند" }
        );
      }
    }

    const vatRateVal = rawVatRate != null ? (Number(rawVatRate) || 0) : 0;
    const computedVat = roundTo2(rawVatAmount != null ? (Number(rawVatAmount) || 0) : computeVat(baseAmount, vatRateVal));
    const totalWithVat = roundTo2(baseAmount + computedVat);

    const isReceipt = type === "receipt";
    const prefix = isReceipt ? "RV" : "PV";
    const idempotencyToken = requestIdempotencyToken(req);
    const ref = `${prefix}-${idempotencyToken}`;

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || type, relatedEntityName, amount: baseAmount });
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const cashAcct = sourceAccountCode || "1100";
    const outputVatCode = computedVat > 0 ? await financialEngine.resolveAccountCode(scope.companyId, "vat_output", "credit", "2300") : "2300";
    const inputVatCode2 = computedVat > 0 ? await financialEngine.resolveAccountCode(scope.companyId, "vat_input", "debit", "1400") : "1400";
    const journalLines: { accountCode: string; debit: number; credit: number }[] = isReceipt
      ? [
          { accountCode: cashAcct, debit: totalWithVat, credit: 0 },
          ...(computedVat > 0 ? [{ accountCode: outputVatCode, debit: 0, credit: computedVat }] : []),
          { accountCode: subAccountCode || accountCode, debit: 0, credit: baseAmount },
        ]
      : [
          { accountCode: subAccountCode || accountCode, debit: baseAmount, credit: 0 },
          ...(computedVat > 0 ? [{ accountCode: inputVatCode2, debit: computedVat, credit: 0 }] : []),
          { accountCode: cashAcct, debit: 0, credit: totalWithVat },
        ];

    if (isDryRun(req)) {
      res.json({
        dryRun: true,
        ref,
        type,
        description: finalDescription,
        lines: journalLines,
        totals: {
          totalDebit: roundTo2(journalLines.reduce((s, l) => s + l.debit, 0)),
          totalCredit: roundTo2(journalLines.reduce((s, l) => s + l.credit, 0)),
          baseAmount,
          vatAmount: computedVat,
          totalWithVat,
        },
      });
      return;
    }

    // FIN-007 — the voucher is recorded as a draft entry that does NOT move
    // account balances; balances are applied only when the voucher is
    // approved (PATCH /vouchers/:id/approve). A rejected voucher therefore
    // never touches the ledger.
    const { journalId, alreadyExists } = await financialEngine.postJournalEntry({ companyId: scope.companyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, sourceType: "voucher", sourceId: 0, sourceKey: `finance:voucher:${idempotencyToken}`, lines: journalLines, deferBalances: true });
    markIdempotencyReplay(req, res, alreadyExists);

    await rawExecute(
      `UPDATE journal_entries SET "paymentMethod" = $1, reference = $2, "attachmentUrl" = $3, "attachmentType" = $4, "relatedEntityType" = $5, "relatedEntityId" = $6, "operationType" = $7, "departmentId" = $8 WHERE id = $9 AND "companyId" = $10 AND "deletedAt" IS NULL`,
      [method ?? "cash", reference ?? null, attachmentUrl ?? null, attachmentType ?? null, relatedEntityType ?? null, relatedEntityId ?? null, operationType ?? type, departmentId ?? null, journalId, scope.companyId]
    ).catch((err) => logger.error(err, "Failed to update voucher metadata:"));

    // C4 + C5 — link the voucher to the AP obligation(s) it pays. Skip on
    // idempotent replay (rows already exist from the original insert).
    if (allocations && allocations.length > 0 && !alreadyExists) {
      for (const a of allocations) {
        await rawExecute(
          `INSERT INTO supplier_payment_allocations
             ("companyId", "branchId", "journalEntryId",
              "obligationType", "obligationId", amount, notes, "createdBy")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            scope.companyId,
            branchId ?? scope.branchId ?? null,
            journalId,
            a.obligationType,
            a.obligationId,
            roundTo2(Number(a.amount)),
            a.notes ?? null,
            scope.activeAssignmentId ?? null,
          ]
        );
      }
    }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `voucher.${type}`, entity: "vouchers", entityId: journalId, details: JSON.stringify({ ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat, accountCode, payee, method }) }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdVoucher] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdVoucher || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Create voucher error:");
  }
});

journalRouter.patch("/vouchers/:id", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { description } = zodParse(updateDescriptionSchema.safeParse(req.body ?? {}));
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *`, [description, id, scope.companyId]);
    if (!row) throw new NotFoundError("السند غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.delete("/vouchers/:id", authorize({ feature: "finance.journal", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'draft' RETURNING id`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("السند غير موجود");
    await reverseAccountBalances(scope.companyId, row.id as number);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.get("/salary-advances", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, je.description, COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, je.status FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%' GROUP BY je.id, je.ref, je.description, je.status, je."createdAt" ORDER BY je."createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows, summary: { total: rows.length, totalAmount: rows.reduce((s: number, r) => s + Number(r.amount), 0) } }));
  } catch (err) {
    res.json({ data: [], summary: { total: 0, totalAmount: 0 } });
  }
});

journalRouter.get("/salary-advances/:id", authorize({ feature: "finance.journal", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je.status, je."createdAt", je."updatedAt",
              je."branchId", je."companyId",
              COALESCE(SUM(jl.debit), 0) AS amount,
              CONCAT('SA-', je.id) AS "refDisplay"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%'
       GROUP BY je.id, je.ref, je.description, je.status, je."createdAt", je."updatedAt", je."branchId", je."companyId"`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("السلفة غير موجودة");
    res.json(maskFields(req, item));
  } catch (err) { handleRouteError(err, res, "Get salary advance detail error:"); }
});

journalRouter.post("/salary-advances", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { employeeName, amount, description, deductMonths, sourceAccountCode, employeeId } = zodParse(createSalaryAdvanceSchema.safeParse(req.body ?? {}));
    if (!amount || !employeeName) { throw new ValidationError("اسم الموظف والمبلغ مطلوبان"); return; }
    const sourceAcct = sourceAccountCode || "1100";
    const idempotencyToken = requestIdempotencyToken(req);
    const ref = `SALARY-ADV-${idempotencyToken}`;

    const { financialEngine } = await import("../lib/engines/index.js");
    let advanceAccountCode = await financialEngine.resolveAccountCode(scope.companyId, "salary_advance_receivable", "debit", "1410");
    if (employeeId) {
      const [subAcc] = await rawQuery<Record<string, unknown>>(
        `SELECT ca.code FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
         WHERE sa."companyId" = $1 AND sa."entityType" = 'employee' AND sa."entityId" = $2 AND sa."accountType" = 'advance'`,
        [scope.companyId, Number(employeeId)]
      );
      if (subAcc) advanceAccountCode = subAcc.code as string;
    }

    const advanceLines = [
      { accountCode: advanceAccountCode, debit: Number(amount), credit: 0, employeeId: employeeId ? Number(employeeId) : undefined },
      { accountCode: sourceAcct, debit: 0, credit: Number(amount) },
    ];
    const advanceDescription = description ?? `سلفة راتب ${employeeName} – خصم على ${deductMonths} شهر`;

    if (isDryRun(req)) {
      res.json({
        dryRun: true,
        ref,
        description: advanceDescription,
        lines: advanceLines,
        totals: {
          totalDebit: roundTo2(advanceLines.reduce((s, l) => s + l.debit, 0)),
          totalCredit: roundTo2(advanceLines.reduce((s, l) => s + l.credit, 0)),
          amount: Number(amount),
        },
      });
      return;
    }

    const { journalId, alreadyExists } = await financialEngine.postJournalEntry({ companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId, ref, description: advanceDescription, type: "salary_advance", sourceType: "salary_advance", sourceId: 0, sourceKey: `finance:salary_advance:${idempotencyToken}`, lines: advanceLines });
    markIdempotencyReplay(req, res, alreadyExists);
    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "advances", refType: "salary_advance", refId: journalId, amount: Number(amount) });
    if (approvalResult.requiresApproval) { const { affectedRows } = await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`, [journalId, scope.companyId]); if (!affectedRows) throw new NotFoundError("القيد غير موجود"); }
    const [createdAdvance] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdAdvance || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.patch("/salary-advances/:id/approve", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const advanceId = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));

    const [entry] = await rawQuery<Record<string, unknown>>(
      `SELECT ref FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'SALARY-ADV%'`,
      [advanceId, scope.companyId]
    );
    if (!entry) throw new NotFoundError("السلفة غير موجودة");

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) {
      throw new ValidationError("يجب ذكر سبب الرفض", {
        field: "notes",
        fix: "اكتب سبب رفض السلفة",
      });
    }

    // Central lifecycle engine: salary advances live on journal_entries
    // with the standard `status` column. fromStates allows decisions only
    // when the advance is still pending — approved or rejected advances
    // cannot be re-decided without going through a fresh approval chain.
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "journal_entries",
      id: advanceId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `salary_advance.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'SALARY-ADV%'`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId")
           VALUES ('salary_advance',$1,$2,$3,$4,$5)`,
          [advanceId, newStatus, notes || null, scope.userId, scope.companyId]
        );
        // FIN-005 — the advance posts a GL entry at creation (DR advance
        // receivable / CR cash). Rejecting it must undo that movement, in
        // the SAME transaction as the status change so a rejected advance
        // can never leave the receivable and cash shifted.
        if (newStatus === "rejected") {
          await reverseAccountBalances(scope.companyId, advanceId);
        }
      },
      after: { ref: entry.ref, decision: newStatus, notes: notes ?? null },
    });

    res.json({
      id: advanceId,
      status: updated.status,
      event: `salary_advance.${newStatus}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve salary advance error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY DETAIL + REVERSAL (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

journalRouter.get("/journal", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je.status, je."createdAt",
              je."reversalOfId", je."reversedById", je."operationType",
              COALESCE(SUM(jl.debit), 0) AS "totalDebit",
              COALESCE(SUM(jl.credit), 0) AS "totalCredit",
              COALESCE(json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) FILTER (WHERE jl.id IS NOT NULL), '[]') AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 200`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "List journal entries error:"); }
});

journalRouter.post("/journal", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { description, lines, date } = zodParse(createJournalSchema.safeParse(req.body ?? {}));
    if (!description) throw new ValidationError("وصف القيد مطلوب", { field: "description" });
    if (!Array.isArray(lines) || lines.length < 2) throw new ValidationError("القيد يجب أن يحتوي على بندين على الأقل", { field: "lines" });
    for (const l of lines) { l.debit = roundTo2(Number(l.debit) || 0); l.credit = roundTo2(Number(l.credit) || 0); }
    const totalDebit = roundTo2(lines.reduce((s: number, l) => s + l.debit, 0));
    const totalCredit = roundTo2(lines.reduce((s: number, l) => s + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) throw new ValidationError(`القيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`, { field: "lines", fix: "تأكد من تساوي المدين والدائن" });

    const postingDate = date ? toDateISO(date) : currentDateInTz("Asia/Riyadh");
    const engineLines = lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
      costCenter: l.costCenter,
      departmentId: l.departmentId != null ? Number(l.departmentId) : undefined,
      projectId: l.projectId != null ? Number(l.projectId) : undefined,
      employeeId: l.employeeId != null ? Number(l.employeeId) : undefined,
    }));

    if (isDryRun(req)) {
      res.json({
        dryRun: true,
        description,
        postingDate,
        lines: engineLines,
        totals: { totalDebit, totalCredit },
      });
      return;
    }

    const [seqRow] = await rawQuery<{ seq: string | number }>(`SELECT nextval('journal_number_seq') AS seq`).catch((e) => { logger.error(e, "finance journal query failed"); return [{ seq: Math.floor(Math.random() * 900000 + 100000) }]; });
    const ref = generateRef("JE", seqRow.seq, 5);
    const idempotencyToken = requestIdempotencyToken(req);

    // FIN-013 — manual journals now follow a draft → approved → posted
    // workflow instead of posting directly. `deferBalances: true` keeps
    // the JE off the GL until the `/journal/:id/post` step runs
    // `applyJournalEntryBalances` against it. This matches the voucher
    // and salary-advance lifecycle and gives finance teams an approval
    // gate before money moves.
    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId: insertId, alreadyExists } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description,
      type: "manual",
      sourceType: "manual_journal",
      sourceId: 0,
      sourceKey: `finance:manual_je:${ref}:${idempotencyToken}`,
      lines: engineLines,
      status: "draft",
      deferBalances: true,
      postingDate,
    });
    markIdempotencyReplay(req, res, alreadyExists);

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "journal_entries", entityId: insertId, after: { ref, description, totalDebit } }).catch((e) => logger.error(e, "finance-journal background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "finance.journal.created", entity: "journal_entries", entityId: insertId, details: JSON.stringify({ ref }) }).catch((e) => logger.error(e, "finance-journal background task failed"));
    const [createdJournal] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [insertId, scope.companyId]
    );
    res.status(201).json({ ...(createdJournal || { id: insertId }), idempotentReplay: alreadyExists });
  } catch (err) { handleRouteError(err, res, "Create journal entry error:"); }
});

journalRouter.get("/journal/:id", authorize({ feature: "finance.journal", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!Number.isFinite(id)) { throw new ValidationError("معرّف القيد غير صالح"); return; }
    // Branch isolation (RCA BR-2): a branch-scoped user must not read a
    // journal entry outside their assigned branches — apply the same
    // company + branch scope the /journal list endpoints already enforce.
    const { where: scopeWhere, params: scopeParams } = buildScopedWhere(
      scope, parseScopeFilters(req),
      { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true },
      2,
    );
    const [je] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*,
              ro.ref AS "reversalOfRef", ro.description AS "reversalOfDescription",
              rb.ref AS "reversedByRef", rb.description AS "reversedByDescription"
       FROM journal_entries je
       LEFT JOIN journal_entries ro ON ro.id = je."reversalOfId" AND ro."deletedAt" IS NULL
       LEFT JOIN journal_entries rb ON rb.id = je."reversedById" AND rb."deletedAt" IS NULL
       WHERE je.id = $1 AND ${scopeWhere} AND je."deletedAt" IS NULL
       LIMIT 1`,
      [id, ...scopeParams]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");
    const lines = await rawQuery<Record<string, unknown>>(
      `SELECT jl.*, coa.name AS "accountName"
       FROM journal_lines jl
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $2 AND coa."deletedAt" IS NULL
       WHERE jl."journalId" = $1
       ORDER BY jl.id ASC`,
      [id, je.companyId]
    );
    res.json(maskFields(req, {
      ...je,
      lines,
      reversalOf: je.reversalOfId
        ? { id: je.reversalOfId, ref: je.reversalOfRef, description: je.reversalOfDescription }
        : null,
      reversedBy: je.reversedById
        ? { id: je.reversedById, ref: je.reversedByRef, description: je.reversedByDescription }
        : null,
    }));
  } catch (err) {
    handleRouteError(err, res, "Get journal error:");
  }
});

// FIN-013 — approve a draft manual journal. Pure status transition; no GL
// movement yet. The companion `/post` endpoint runs the balance push.
journalRouter.post("/journal/:id/approve", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    try {
      const updated = await applyTransition<Record<string, unknown>>({
        entity: "journal_entries",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
        action: "manual_journal.approved",
        fromStates: ["draft", "pending_approval", "returned"],
        toState: "approved",
        extraWhere: `"deletedAt" IS NULL AND "sourceType" = 'manual_journal'`,
        setExtras: {
          "approvedBy": scope.userId,
          "approvedAt": new Date(),
        },
      });
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "approve", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "finance.journal.approved", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      res.json(updated);
    } catch (err) {
      const lifecycle = lifecycleErrorResponse(err);
      if (lifecycle) { res.status(lifecycle.status).json(lifecycle.body); return; }
      throw err;
    }
  } catch (err) {
    handleRouteError(err, res, "Approve manual journal error:");
  }
});

// FIN-013 — post (transition approved → posted AND push GL balances). Runs
// inside one transaction so the status change and ledger movement commit
// together; if balancesApply fails (e.g. period reclosed in the interim)
// the status reverts.
journalRouter.post("/journal/:id/post", authorize({ feature: "finance.journal", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    try {
      const updated = await applyTransition<Record<string, unknown>>({
        entity: "journal_entries",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
        action: "manual_journal.posted",
        fromStates: ["approved"],
        toState: "posted",
        extraWhere: `"deletedAt" IS NULL AND "sourceType" = 'manual_journal'`,
        setExtras: {
          "postedBy": scope.userId,
          "postedAt": new Date(),
        },
        onApply: async (_row, client) => {
          // Push the deferred balances. Throws if the journal's period
          // has since closed — the transaction rolls back and the
          // status stays at 'approved'.
          await applyJournalEntryBalances(client, scope.companyId, id);
        },
      });
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "post", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "finance.journal.posted", entity: "journal_entries", entityId: id }).catch((e) => logger.error(e, "finance-journal background task failed"));
      res.json(updated);
    } catch (err) {
      const lifecycle = lifecycleErrorResponse(err);
      if (lifecycle) { res.status(lifecycle.status).json(lifecycle.body); return; }
      throw err;
    }
  } catch (err) {
    handleRouteError(err, res, "Post manual journal error:");
  }
});

journalRouter.post("/journal/:id/reverse", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    if (!Number.isFinite(id)) { throw new ValidationError("معرّف القيد غير صالح"); return; }
    const { reason, reverseDate } = zodParse(reverseJournalSchema.safeParse(req.body ?? {}));
    if (!reason || !String(reason).trim()) {
      throw new ValidationError("سبب عكس القيد مطلوب", { field: "reason", fix: "أدخل سبب عكس القيد" });
    }

    // Branch isolation (RCA BR-2): a branch-scoped user must not reverse a
    // journal entry outside their assigned branches.
    const { where: revScopeWhere, params: revScopeParams } = buildScopedWhere(
      scope, parseScopeFilters(req),
      { enforceBranchScope: true },
      2,
    );
    const [original] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM journal_entries WHERE id = $1 AND ${revScopeWhere} AND "deletedAt" IS NULL LIMIT 1`,
      [id, ...revScopeParams]
    );
    if (!original) throw new NotFoundError("القيد الأصلي غير موجود");
    if (original.reversedById) {
      throw new ValidationError(`هذا القيد معكوس مسبقاً بالقيد #${original.reversedById}`);
    }
    if (original.reversalOfId) {
      throw new ValidationError("لا يمكن عكس قيد هو أصلاً قيد عاكس");
    }

    const originalLines = await rawQuery<Record<string, unknown>>(
      `SELECT "accountCode", debit, credit, description, "costCenter", "departmentId", "projectId", "employeeId"
       FROM journal_lines WHERE "journalId" = $1 AND "deletedAt" IS NULL ORDER BY id ASC`,
      [id]
    );
    if (originalLines.length === 0) {
      throw new ValidationError("القيد الأصلي لا يحتوي على بنود");
    }

    const reversedLines = originalLines.map((l) => ({
      accountCode: l.accountCode as string,
      debit: Number(l.credit || 0),
      credit: Number(l.debit || 0),
      description: l.description as string | undefined,
      costCenter: l.costCenter as string | undefined,
      departmentId: l.departmentId as number | undefined,
      projectId: l.projectId as number | undefined,
      employeeId: l.employeeId as number | undefined,
    }));

    const newRef = `REV-${original.ref}`;
    const newDescription = `عكس قيد: ${original.description ?? ""} — ${reason}`.trim();

    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId: newJournalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: (original.branchId as number | null) ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: newRef,
      description: newDescription,
      type: "reversal",
      sourceType: "journal_reversal",
      sourceId: id,
      sourceKey: `finance:reversal:${id}`,
      // Stamp the reversal on its requested date so the period-close check
      // validates the entry's true ledger date, not today. Defaults to today
      // when the caller gives no reverseDate.
      postingDate: reverseDate ? toDateISO(reverseDate) : currentDateInTz("Asia/Riyadh"),
      lines: reversedLines,
    });

    await withTransaction(async (client: any) => {
      await client.query(
        `UPDATE journal_entries
           SET "reversalOfId" = $1,
               "reversalReason" = $2
         WHERE id = $3 AND "companyId" = $4`,
        [id, reason, newJournalId, scope.companyId]
      );
      await client.query(
        `UPDATE journal_entries
           SET "reversedById" = $1,
               "reversedAt" = NOW(),
               "reversalReason" = $2,
               status = 'reversed'
         WHERE id = $3 AND "companyId" = $4`,
        [newJournalId, reason, id, scope.companyId]
      );

      // C4 + C5 follow-up (#901) — a payment voucher reversed via
      // /journal/:id/reverse must also retire its supplier_payment_allocations
      // rows. Without this soft-delete, the vendor statement keeps counting
      // the reversed voucher as a payment against the obligation, so the
      // PO/Nusk-invoice outstanding stays artificially low and aging
      // double-counts the next legitimate payment. Soft-delete keeps the
      // row for audit while the partial index in migration 198 already
      // excludes `deletedAt IS NOT NULL` from the obligation lookup.
      await client.query(
        `UPDATE supplier_payment_allocations
            SET "deletedAt" = NOW()
          WHERE "journalEntryId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );
    });

    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.reversed",
      entity: "journal_entries",
      entityId: id,
      reason,
      after: { newJournalId, newRef, reverseDate },
    }).catch((err) => logger.error(err, "Failed to create reversal audit log:"));

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.reversed",
      entity: "journal_entries",
      entityId: id,
      details: JSON.stringify({ reason, newJournalId, newRef }),
    }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdReversal] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [newJournalId, scope.companyId]
    );
    res.status(201).json({ ...(createdReversal || { id: newJournalId }), originalId: id, originalRef: original.ref, reason });
  } catch (err) {
    handleRouteError(err, res, "Reverse journal error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// YEAR-END CLOSE WIZARD (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

async function buildYearEndClosingLines(companyId: number, year: number, retainedEarningsCode: string) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const revenues = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."createdAt" >= $2 AND je."createdAt" <= ($3::date + INTERVAL '1 day')
     WHERE coa."companyId" = $1 AND coa.type = 'revenue' AND coa."deletedAt" IS NULL
     GROUP BY coa.code, coa.name
     HAVING COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) <> 0
     ORDER BY coa.code`,
    [companyId, startDate, endDate]
  );
  const expenses = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name,
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."createdAt" >= $2 AND je."createdAt" <= ($3::date + INTERVAL '1 day')
     WHERE coa."companyId" = $1 AND coa.type = 'expense' AND coa."deletedAt" IS NULL
     GROUP BY coa.code, coa.name
     HAVING COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) <> 0
     ORDER BY coa.code`,
    [companyId, startDate, endDate]
  );

  const totalRevenue = revenues.reduce((s: number, r) => s + Number(r.balance), 0);
  const totalExpense = expenses.reduce((s: number, r) => s + Number(r.balance), 0);
  const netIncome = totalRevenue - totalExpense;

  const lines: { accountCode: string; debit: number; credit: number; description?: string }[] = [];
  // Zero out each revenue account — debit the revenue account
  for (const r of revenues) {
    const bal = Number(r.balance);
    const code = r.code as string;
    const name = r.name as string;
    if (bal > 0) {
      lines.push({ accountCode: code, debit: bal, credit: 0, description: `إقفال ${name}` });
    } else if (bal < 0) {
      lines.push({ accountCode: code, debit: 0, credit: -bal, description: `إقفال ${name}` });
    }
  }
  // Zero out each expense account — credit the expense account
  for (const e of expenses) {
    const bal = Number(e.balance);
    const code = e.code as string;
    const name = e.name as string;
    if (bal > 0) {
      lines.push({ accountCode: code, debit: 0, credit: bal, description: `إقفال ${name}` });
    } else if (bal < 0) {
      lines.push({ accountCode: code, debit: -bal, credit: 0, description: `إقفال ${name}` });
    }
  }
  // Balancing line — retained earnings
  if (netIncome > 0) {
    lines.push({ accountCode: retainedEarningsCode, debit: 0, credit: netIncome, description: "صافي الربح إلى الأرباح المحتجزة" });
  } else if (netIncome < 0) {
    lines.push({ accountCode: retainedEarningsCode, debit: -netIncome, credit: 0, description: "صافي الخسارة من الأرباح المحتجزة" });
  }

  return { revenues, expenses, totalRevenue, totalExpense, netIncome, lines };
}

journalRouter.post("/fiscal-periods/:period/year-end-close", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const period = String(req.params.period);
    const dryRun = String(req.query.dryRun ?? "").toLowerCase() === "true";
    const { retainedEarningsAccountCode, force } = zodParse(yearEndCloseSchema.safeParse(req.body ?? {}));

    if (!/^\d{4}$/.test(period)) {
      throw new ValidationError("صيغة السنة غير صحيحة", { field: "period", fix: "استخدم صيغة السنة YYYY مثل 2025" });
    }
    const year = Number(period);

    // Verify retained earnings account exists
    const [reAcc] = await rawQuery<Record<string, unknown>>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, retainedEarningsAccountCode]
    );
    if (!reAcc) {
      throw new ValidationError(`حساب الأرباح المحتجزة "${retainedEarningsAccountCode}" غير موجود`, { field: "retainedEarningsAccountCode", fix: "أنشئ الحساب أولاً في شجرة الحسابات" });
    }

    // Verify all 12 periods are closed, unless force=true
    const closedPeriods = await rawQuery<Record<string, unknown>>(
      `SELECT to_char("startDate", 'YYYY-MM') AS period FROM financial_periods WHERE "companyId" = $1 AND status = 'closed' AND "deletedAt" IS NULL AND EXTRACT(YEAR FROM "startDate") = $2`,
      [scope.companyId, year]
    );
    const closedSet = new Set(closedPeriods.map((p) => p.period));
    const missing: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const p = `${year}-${String(m).padStart(2, "0")}`;
      if (!closedSet.has(p)) missing.push(p);
    }
    if (missing.length > 0 && !force && !dryRun) {
      throw new ConflictError(
        `لا يمكن إقفال السنة ${year}: توجد ${missing.length} فترة غير مُقفلة`,
        { field: "period", fix: "أقفل الفترات الشهرية أولاً أو استخدم force=true", meta: { missingPeriods: missing } }
      );
    }

    const { revenues, expenses, totalRevenue, totalExpense, netIncome, lines } =
      await buildYearEndClosingLines(scope.companyId, year, retainedEarningsAccountCode);

    if (lines.length === 0) {
      throw new ValidationError("لا توجد حسابات إيرادات أو مصروفات بأرصدة للسنة المحددة");
    }

    if (dryRun) {
      res.json({
        dryRun: true,
        year,
        retainedEarningsAccountCode,
        totalRevenue,
        totalExpense,
        netIncome,
        revenues,
        expenses,
        lines,
        missingPeriods: missing,
      });
      return;
    }

    if (force && missing.length > 0) {
      await withTransaction(async (client: any) => {
        for (const p of missing) {
          const startDate = `${p}-01`;
          const endDate = toDateISO(new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0));
          const { rows: [existing] } = await client.query(
            `SELECT id FROM financial_periods WHERE "companyId"=$1 AND to_char("startDate",'YYYY-MM')=$2 AND "deletedAt" IS NULL LIMIT 1`,
            [scope.companyId, p]
          );
          if (existing) {
            await client.query(
              `UPDATE financial_periods SET status='closed', "closedAt"=NOW(), "closedBy"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND status = 'open' AND "deletedAt" IS NULL`,
              [scope.activeAssignmentId, existing.id, scope.companyId]
            );
          } else {
            await client.query(
              `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status,"closedAt","closedBy")
               VALUES ($1,$2,$3,$4,'closed',NOW(),$5)`,
              [scope.companyId, `فترة ${p}`, startDate, endDate, scope.activeAssignmentId]
            );
          }
        }
      });
    }

    const ref = `YE-${year}`;
    const [existingYE] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existingYE) throw new ConflictError(`قيد إقفال السنة ${year} موجود مسبقاً`);
    const description = `قيد إقفال السنة المالية ${year} — صافي الدخل ${netIncome.toFixed(2)}`;
    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description,
      type: "closing",
      sourceType: "year_end_close",
      sourceId: 0,
      sourceKey: `finance:year_end:${scope.companyId}:${year}`,
      lines,
    });

    // Mark all fiscal periods for the year as yearEndClosed = true
    await rawExecute(
      `UPDATE financial_periods
         SET "yearEndClosed" = TRUE,
             "yearEndClosedAt" = NOW(),
             "yearEndClosingJournalId" = $1
       WHERE "companyId" = $2 AND EXTRACT(YEAR FROM "startDate") = $3
         AND "deletedAt" IS NULL`,
      [journalId, scope.companyId, year]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fiscal.year_end_closed",
      entity: "financial_periods",
      entityId: journalId,
      details: JSON.stringify({ year, netIncome, totalRevenue, totalExpense, journalId, ref }),
    }).catch((e) => logger.error(e, "finance-journal background task failed"));

    const [createdYearEnd] = await rawQuery<Record<string, unknown>>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdYearEnd || { id: journalId }), year, netIncome, totalRevenue, totalExpense, retainedEarningsAccountCode });
  } catch (err) {
    handleRouteError(err, res, "Year-end close error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OPENING BALANCES (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

journalRouter.get("/opening-balances", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { periodStart } = req.query as { periodStart?: string };
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, {
      companyColumn: 'je."companyId"',
      branchColumn: 'je."branchId"',
      enforceBranchScope: true,
    });

    let extraWhere = " AND je.ref LIKE 'OB-%' AND je.\"deletedAt\" IS NULL";
    if (periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      params.push(`OB-${periodStart}`);
      extraWhere += ` AND je.ref = $${params.length}`;
    }

    const entries = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je."createdAt", je.status,
              je."branchId", je."companyId",
              COALESCE(SUM(jl.debit), 0) AS "totalDebit",
              COALESCE(SUM(jl.credit), 0) AS "totalCredit",
              json_agg(json_build_object(
                'accountCode', jl."accountCode",
                'accountName', coa.name,
                'debit', jl.debit,
                'credit', jl.credit
              ) ORDER BY jl.id) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId" AND coa."deletedAt" IS NULL
       WHERE ${where}${extraWhere}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je."branchId", je."companyId"
       ORDER BY je."createdAt" DESC`,
      params
    );
    res.json(maskFields(req, { data: entries, total: entries.length }));
  } catch (err) {
    handleRouteError(err, res, "Get opening balances error:");
  }
});

async function createOpeningBalanceEntry(params: {
  scope: any;
  periodStart: string;
  lines: { accountCode: string; debit: number; credit: number }[];
  force?: boolean;
}): Promise<{ id: number; ref: string; description: string } | { error: string; status: number; details?: any }> {
  const { scope, periodStart, lines, force } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    return { error: "تاريخ بداية الفترة غير صحيح، استخدم صيغة YYYY-MM-DD", status: 400 };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "يجب إدخال بنود الأرصدة الافتتاحية", status: 400 };
  }
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return { error: `الأرصدة الافتتاحية غير متوازنة: مدين=${totalDebit.toFixed(2)} ≠ دائن=${totalCredit.toFixed(2)}`, status: 400 };
  }

  const ref = `OB-${periodStart}`;
  if (!force) {
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existing) {
      return { error: `يوجد قيد أرصدة افتتاحية مسبقاً لهذه الفترة (#${existing.id})`, status: 409, details: { existingId: existing.id } };
    }
  }

  // Validate accounts exist
  const codes = Array.from(new Set(lines.map((l) => String(l.accountCode).trim()).filter(Boolean)));
  const accRows = await rawQuery<Record<string, unknown>>(
    `SELECT code FROM chart_of_accounts WHERE "companyId" = $1 AND code = ANY($2) AND "deletedAt" IS NULL`,
    [scope.companyId, codes]
  );
  const known = new Set(accRows.map((a) => a.code));
  const missing = codes.filter((c) => !known.has(c));
  if (missing.length > 0) {
    return { error: `الحسابات التالية غير موجودة: ${missing.join(", ")}`, status: 400 };
  }

  // Soft-delete prior OB if force
  if (force) {
    await rawExecute(
      `UPDATE journal_entries SET "deletedAt" = NOW() WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, ref]
    );
  }

  const description = `أرصدة افتتاحية ${periodStart}`;
  const { financialEngine } = await import("../lib/engines/index.js");
  const { journalId } = await financialEngine.postJournalEntry({
    companyId: scope.companyId,
    branchId: scope.branchId,
    createdBy: scope.activeAssignmentId,
    ref,
    description,
    type: "opening_balance",
    sourceType: "opening_balance",
    sourceId: 0,
    sourceKey: `finance:opening_balance:${scope.companyId}:${periodStart}`,
    lines: lines.map((l) => ({
      accountCode: String(l.accountCode),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
    })),
  });

  return { id: journalId, ref, description };
}

journalRouter.post("/opening-balances", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { periodStart, lines, force } = zodParse(openingBalancesSchema.safeParse(req.body ?? {}));
    const result = await createOpeningBalanceEntry({ scope, periodStart: periodStart ?? "", lines: (lines ?? []) as { accountCode: string; debit: number; credit: number }[], force: !!force });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, ...(result.details ?? {}) });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "Create opening balances error:");
  }
});

journalRouter.post("/opening-balances/import-csv", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { periodStart, csv, force } = zodParse(openingBalancesImportCsvSchema.safeParse(req.body ?? {}));
    if (!csv || typeof csv !== "string") {
      throw new ValidationError("محتوى CSV مطلوب");
    }
    const rawLines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (rawLines.length === 0) {
      throw new ValidationError("ملف CSV فارغ");
    }
    // Detect header
    const startIdx = /account/i.test(rawLines[0]) ? 1 : 0;
    const parsed: { accountCode: string; debit: number; credit: number }[] = [];
    for (let i = startIdx; i < rawLines.length; i++) {
      const parts = rawLines[i].split(",").map((p) => p.trim());
      if (parts.length < 3) {
        throw new ValidationError(`سطر CSV غير صالح (${i + 1}): يتطلب 3 أعمدة accountCode,debit,credit`);
      }
      const [code, d, c] = parts;
      const debit = Number(d || 0);
      const credit = Number(c || 0);
      if (!code || (Number.isNaN(debit) && Number.isNaN(credit))) {
        throw new ValidationError(`سطر CSV غير صالح (${i + 1})`);
      }
      parsed.push({ accountCode: code, debit: Number.isNaN(debit) ? 0 : debit, credit: Number.isNaN(credit) ? 0 : credit });
    }
    const result = await createOpeningBalanceEntry({ scope, periodStart: periodStart ?? "", lines: parsed, force: !!force });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, ...(result.details ?? {}) });
      return;
    }
    res.status(201).json({ ...result, linesCount: parsed.length });
  } catch (err) {
    handleRouteError(err, res, "Import opening balances CSV error:");
  }
});
