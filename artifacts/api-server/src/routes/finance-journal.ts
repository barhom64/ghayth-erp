import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  reverseAccountBalances,
  checkFinancialPeriodOpen,
  computeVat,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";

export const journalRouter = Router();
journalRouter.use(authMiddleware);

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

journalRouter.get("/expenses", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
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

// Impact preview — shows what will happen when the expense is created
journalRouter.post("/expenses/impact-preview", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { amount, expenseType, paymentMethod, costCenter, supplierId, branchId } = req.body as any;
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
      const [budget] = await rawQuery<any>(
        `SELECT name, "allocatedAmount", "usedAmount"
         FROM cost_centers WHERE name = $1 AND "companyId" = $2 LIMIT 1`,
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
      const [supplier] = await rawQuery<any>(
        `SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2`,
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

journalRouter.post("/expenses", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const {
      accountCode, amount, description, period, sourceAccountCode,
      branchId, companyId: bodyCompanyId, departmentId, costCenter, expenseType, subAccountCode,
      relatedEntityType, relatedEntityId, relatedEntityName,
      paymentMethod, vatRate: rawVatRate, vatAmount: rawVatAmount,
      reference, status: reqStatus, isPaid,
      attachmentUrl, attachmentType, operationType,
      autoDescription, projectId, taxCategory,
      govSyncEnabled, govIntegrationId, govEntityType, govEntityId,
    } = req.body as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!accountCode) { throw new ValidationError("لا يمكن صرف بدون حساب محاسبي واضح", { field: "accountCode", fix: "حدد الحساب المحاسبي للمصروف (مثل 5100 رواتب، 5200 وقود)" }); }
    if (!amount || Number(amount) <= 0) { throw new ValidationError("لا يمكن تسجيل مصروف بقيمة صفر أو سالبة", { field: "amount", fix: "أدخل مبلغ المصروف بقيمة موجبة" }); }
    if (!branchId && !scope.branchId) { throw new ValidationError("الفرع مطلوب لتسجيل المصروف", { field: "branchId", fix: "حدد الفرع الذي ينتمي إليه هذا المصروف" }); }
    if (!costCenter) { throw new ValidationError("مركز التكلفة مطلوب لتسجيل المصروف", { field: "costCenter", fix: "حدد مركز التكلفة (مثل: مشروع-001، فرع-الرياض)" }); }

    let costCenterValidationEnabled = false;
    try {
      const [costCenterSettingRow] = await rawQuery<any>(
        `SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'costCenterEnabled' LIMIT 1`,
        [effectiveCompanyId]
      );
      costCenterValidationEnabled = costCenterSettingRow?.value === "true";
    } catch { /* table may not exist yet */ }
    if (costCenterValidationEnabled) {
      const [ccRow] = await rawQuery<any>(
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

    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const sourceAcct = sourceAccountCode || "1100";

    if (accountCode && amount) {
      const [budget] = await rawQuery<any>(`SELECT amount, used FROM budgets WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`, [effectiveCompanyId, accountCode, targetPeriod]);
      if (budget) {
        const budgetAmount = Number(budget.amount);
        const newUsed = Number(budget.used) + Number(amount);
        const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;
        // Budget guardrails:
        //   >110%  → hard reject (ConflictError 409)
        //   100-110% → GM-only (ForbiddenError 403)
        //   80-99%  → CFO-or-above (ForbiddenError 403)
        if (utilization > 110) {
          throw new ConflictError(
            "تجاوز الميزانية أكثر من 110% – رفض نهائي",
            { field: "amount", fix: "أعد تقييم الميزانية أو قلل المبلغ المطلوب", meta: { utilization: Math.round(utilization), status: "rejected" } }
          );
        }
        if (utilization > 99 && !["owner", "general_manager"].includes(scope.role)) {
          throw new ForbiddenError(
            "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط",
            { fix: "اطلب موافقة المدير العام قبل المتابعة", meta: { utilization: Math.round(utilization), status: "blocked_gm" } }
          );
        }
        if (utilization > 80 && !["finance_manager", "general_manager", "owner"].includes(scope.role)) {
          throw new ForbiddenError(
            "استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي",
            { fix: "اطلب موافقة المدير المالي قبل المتابعة", meta: { utilization: Math.round(utilization), status: "warning_cfo" } }
          );
        }
        await rawExecute(`UPDATE budgets SET used = used + $1 WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4`, [Number(amount), effectiveCompanyId, accountCode, targetPeriod]);
      }
    }

    const baseAmount = Number(amount);
    const vatRateVal = rawVatRate != null ? Number(rawVatRate) : 0;
    const computedVat = rawVatAmount != null ? Number(rawVatAmount) : computeVat(baseAmount, vatRateVal);
    const totalWithVat = baseAmount + computedVat;

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || expenseType || "expense", relatedEntityName, period: targetPeriod, amount: baseAmount, expenseType });
    }

    const ref = `EXP-${Date.now()}`;
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

    const { journalId } = await financialEngine.postJournalEntry({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, type: "expense", sourceType: operationType || "expense", sourceId: 0, sourceKey: `finance:expense:${Date.now()}`, lines: journalLines });

    await rawExecute(
      `UPDATE journal_entries SET "costCenter" = $1, "departmentId" = $2, "relatedEntityType" = $3, "relatedEntityId" = $4, "paymentMethod" = $5, reference = $6, "isPaid" = $7, "attachmentUrl" = $8, "attachmentType" = $9, "expenseType" = $10, "operationType" = $11, "projectId" = $12, "taxCategory" = $13, "govSyncEnabled" = $14, "govIntegrationId" = $15, "govEntityType" = $16, "govEntityId" = $17 WHERE id = $18`,
      [costCenter ?? null, departmentId ?? null, relatedEntityType ?? null, relatedEntityId ?? null, paymentMethod ?? "cash", reference ?? null, isPaid != null ? !!isPaid : true, attachmentUrl ?? null, attachmentType ?? null, expenseType ?? null, operationType ?? "expense", projectId ?? null, taxCategory ?? null, govSyncEnabled ? true : false, govIntegrationId ? Number(govIntegrationId) : null, govEntityType ?? null, govEntityId ? Number(govEntityId) : null, journalId]
    ).catch((err) => console.error("Failed to update expense metadata:", err));

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

    const approvalResult = await initiateApprovalChain({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, chainType: "expenses", refType: "expense", refId: journalId, amount: Number(amount ?? 0) });
    if (approvalResult.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2`, [journalId, effectiveCompanyId]); }

    emitEvent({ companyId: effectiveCompanyId, userId: scope.userId, action: "expense.created", entity: "expenses", entityId: journalId, details: JSON.stringify({ ref, accountCode, amount: baseAmount, vatAmount: computedVat, totalWithVat, sourceAccountCode: sourceAcct, approvalRequired: approvalResult.requiresApproval, operationType, expenseType, relatedEntityType, relatedEntityId }) }).catch(console.error);

    res.status(201).json({ id: journalId, ref, amount: baseAmount, vatAmount: computedVat, totalWithVat, description: finalDescription, accountCode, sourceAccountCode: sourceAcct, operationType, expenseType, relatedEntityType, relatedEntityId, relatedEntityName, paymentMethod, costCenter, departmentId, branchId: branchId ?? scope.branchId, attachmentUrl, attachmentType, reference, isPaid, period: targetPeriod, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Create expense error:");
  }
});

journalRouter.patch("/expenses/:id", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { description } = req.body as any;
    const [existing] = await rawQuery<any>(`SELECT id, "createdAt" FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(req.params.id), scope.companyId]);
    if (!existing) throw new NotFoundError("المصروف غير موجود");
    const expenseDate = new Date(existing.createdAt).toISOString().split("T")[0];
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, expenseDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تعديل مصروف في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}`);
    }
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`, [description, Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.delete("/expenses/:id", requirePermission("finance:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
    await reverseAccountBalances(scope.companyId, row.id);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.patch("/expenses/:id/approve", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;

    const expenseId = Number(req.params.id);
    const { approved, notes } = req.body as any;

    // Fetch ref for the audit trail; state gating handled by the engine.
    const [exp] = await rawQuery<any>(
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
    const updated = await applyTransition<any>({
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
      },
      after: { ref: exp.ref, decision: newStatus, notes: notes ?? null },
    });

    // CRITICAL: Expense journal_entries update GL balances at creation time.
    // If the expense is rejected or returned after that posting, the GL
    // balances must be reversed or the books stay overstated. Runs OUTSIDE
    // the lifecycle transaction because reverseAccountBalances has its own
    // transactional flow; failures are logged but don't block the status
    // change (which has already succeeded).
    if (newStatus === "rejected" || newStatus === "returned") {
      try {
        await reverseAccountBalances(scope.companyId, expenseId);
      } catch (e) {
        console.error("Failed to reverse expense GL on rejection:", e);
      }
    }

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

journalRouter.get("/vouchers", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<any>(
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
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    console.error("Get vouchers error:", err);
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

journalRouter.get("/vouchers/:id", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
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
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get voucher detail error:"); }
});

journalRouter.post("/vouchers", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const {
      type, amount, description, payee, accountCode, method = "cash", sourceAccountCode,
      subAccountCode, relatedEntityType, relatedEntityId, relatedEntityName,
      contractId, invoiceId, reference, attachmentUrl, attachmentType,
      vatRate: rawVatRate, vatAmount: rawVatAmount,
      beneficiaryType, entitlementType, branchId, departmentId,
      autoDescription, operationType,
    } = req.body as any;

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
    const [sourceAcctRow] = await rawQuery<any>(
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
      cashBankSubtypes.includes(sourceAcctRow.subtype ?? "") ||
      cashBankSubtypes.includes(sourceAcctRow.accountSubtype ?? "") ||
      /^11[01]\d/.test(sourceAcctRow.code);
    if (!isCashOrBank) {
      throw new ValidationError(
        `حساب المصدر "${sourceAcctRow.code} - ${sourceAcctRow.name}" ليس حساباً نقدياً أو بنكياً`,
        { field: "sourceAccountCode", fix: "استخدم حساباً نقدياً أو بنكياً (عادةً كود يبدأ بـ 11)" }
      );
    }

    const baseAmount = Number(amount);
    const vatRateVal = rawVatRate != null ? Number(rawVatRate) : 0;
    const computedVat = rawVatAmount != null ? Number(rawVatAmount) : computeVat(baseAmount, vatRateVal);
    const totalWithVat = baseAmount + computedVat;

    const isReceipt = type === "receipt";
    const prefix = isReceipt ? "RV" : "PV";
    const ref = `${prefix}-${Date.now()}`;

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

    const { journalId } = await financialEngine.postJournalEntry({ companyId: scope.companyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, sourceType: "voucher", sourceId: 0, sourceKey: `finance:voucher:${Date.now()}`, lines: journalLines });

    await rawExecute(
      `UPDATE journal_entries SET "paymentMethod" = $1, reference = $2, "attachmentUrl" = $3, "attachmentType" = $4, "relatedEntityType" = $5, "relatedEntityId" = $6, "operationType" = $7, "departmentId" = $8 WHERE id = $9`,
      [method ?? "cash", reference ?? null, attachmentUrl ?? null, attachmentType ?? null, relatedEntityType ?? null, relatedEntityId ?? null, operationType ?? type, departmentId ?? null, journalId]
    ).catch((err) => console.error("Failed to update voucher metadata:", err));

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `voucher.${type}`, entity: "vouchers", entityId: journalId, details: JSON.stringify({ ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat, accountCode, payee, method }) }).catch(console.error);

    res.status(201).json({ id: journalId, ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat, description: finalDescription, accountCode, paymentMethod: method, reference, attachmentUrl, relatedEntityType, relatedEntityId, relatedEntityName, contractId, invoiceId, branchId: branchId ?? scope.branchId });
  } catch (err) {
    handleRouteError(err, res, "Create voucher error:");
  }
});

journalRouter.patch("/vouchers/:id", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { description } = req.body as any;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`, [description, Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("السند غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.delete("/vouchers/:id", requirePermission("finance:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("السند غير موجود");
    await reverseAccountBalances(scope.companyId, row.id);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.get("/salary-advances", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT je.id, je.ref, je.description, COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, 'active' AS status FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%' GROUP BY je.id, je.ref, je.description, je."createdAt" ORDER BY je."createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, summary: { total: rows.length, totalAmount: rows.reduce((s: number, r: any) => s + Number(r.amount), 0) } });
  } catch (err) {
    res.json({ data: [], summary: { total: 0, totalAmount: 0 } });
  }
});

journalRouter.get("/salary-advances/:id", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [item] = await rawQuery<any>(
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
    res.json(item);
  } catch (err) { handleRouteError(err, res, "Get salary advance detail error:"); }
});

journalRouter.post("/salary-advances", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const { employeeName, amount, description, deductMonths = 1, sourceAccountCode, employeeId } = req.body as any;
    if (!amount || !employeeName) { throw new ValidationError("اسم الموظف والمبلغ مطلوبان"); return; }
    const sourceAcct = sourceAccountCode || "1100";
    const ref = `SALARY-ADV-${Date.now()}`;

    const { financialEngine } = await import("../lib/engines/index.js");
    let advanceAccountCode = await financialEngine.resolveAccountCode(scope.companyId, "salary_advance_receivable", "debit", "1410");
    if (employeeId) {
      const [subAcc] = await rawQuery<any>(
        `SELECT ca.code FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
         WHERE sa."companyId" = $1 AND sa."entityType" = 'employee' AND sa."entityId" = $2 AND sa."accountType" = 'advance'`,
        [scope.companyId, Number(employeeId)]
      );
      if (subAcc) advanceAccountCode = subAcc.code;
    }

    const { journalId } = await financialEngine.postJournalEntry({ companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId, ref, description: description ?? `سلفة راتب ${employeeName} – خصم على ${deductMonths} شهر`, type: "salary_advance", sourceType: "salary_advance", sourceId: 0, sourceKey: `finance:salary_advance:${Date.now()}`, lines: [{ accountCode: advanceAccountCode, debit: Number(amount), credit: 0, employeeId: employeeId ? Number(employeeId) : undefined }, { accountCode: sourceAcct, debit: 0, credit: Number(amount) }] });
    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "advances", refType: "salary_advance", refId: journalId, amount: Number(amount) });
    if (approvalResult.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2`, [journalId, scope.companyId]); }
    res.status(201).json({ id: journalId, ref, employeeName, amount, deductMonths, description, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Finance journal error:");
  }
});

journalRouter.patch("/salary-advances/:id/approve", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;

    const advanceId = Number(req.params.id);
    const { approved, notes } = req.body as any;

    const [entry] = await rawQuery<any>(
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
    const updated = await applyTransition<any>({
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

journalRouter.get("/journal", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<any>(
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
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "List journal entries error:"); }
});

journalRouter.post("/journal", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { description, lines, date } = req.body as any;
    if (!description) throw new ValidationError("وصف القيد مطلوب", { field: "description" });
    if (!Array.isArray(lines) || lines.length < 2) throw new ValidationError("القيد يجب أن يحتوي على بندين على الأقل", { field: "lines" });
    const totalDebit = lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) throw new ValidationError(`القيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`, { field: "lines", fix: "تأكد من تساوي المدين والدائن" });

    const [seqRow] = await rawQuery<any>(`SELECT nextval('journal_number_seq') AS seq`).catch(() => [{ seq: Date.now() }]);
    const ref = `JE-${new Date().getFullYear()}-${String(seqRow.seq).padStart(5, "0")}`;
    const { insertId } = await rawExecute(
      `INSERT INTO journal_entries ("companyId","branchId",ref,description,status,"createdAt") VALUES ($1,$2,$3,$4,'posted',$5)`,
      [scope.companyId, scope.branchId, ref, description, date || new Date().toISOString()]
    );
    for (const l of lines) {
      await rawExecute(
        `INSERT INTO journal_lines ("journalId","accountCode",description,debit,credit,"costCenter","departmentId","projectId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [insertId, l.accountCode, l.description || null, Number(l.debit) || 0, Number(l.credit) || 0, l.costCenter || null, l.departmentId || null, l.projectId || null]
      );
    }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "journal_entries", entityId: insertId, after: { ref, description, totalDebit } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "finance.journal.created", entity: "journal_entries", entityId: insertId, details: JSON.stringify({ ref }) }).catch(console.error);
    res.status(201).json({ id: insertId, ref });
  } catch (err) { handleRouteError(err, res, "Create journal entry error:"); }
});

journalRouter.get("/journal/:id", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { throw new ValidationError("معرّف القيد غير صالح"); return; }
    const [je] = await rawQuery<any>(
      `SELECT je.*,
              ro.ref AS "reversalOfRef", ro.description AS "reversalOfDescription",
              rb.ref AS "reversedByRef", rb.description AS "reversedByDescription"
       FROM journal_entries je
       LEFT JOIN journal_entries ro ON ro.id = je."reversalOfId"
       LEFT JOIN journal_entries rb ON rb.id = je."reversedById"
       WHERE je.id = $1 AND je."companyId" = ANY($2) AND je."deletedAt" IS NULL
       LIMIT 1`,
      [id, scope.allowedCompanies]
    );
    if (!je) throw new NotFoundError("القيد غير موجود");
    const lines = await rawQuery<any>(
      `SELECT jl.*, coa.name AS "accountName"
       FROM journal_lines jl
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $2
       WHERE jl."journalId" = $1
       ORDER BY jl.id ASC`,
      [id, je.companyId]
    );
    res.json({
      ...je,
      lines,
      reversalOf: je.reversalOfId
        ? { id: je.reversalOfId, ref: je.reversalOfRef, description: je.reversalOfDescription }
        : null,
      reversedBy: je.reversedById
        ? { id: je.reversedById, ref: je.reversedByRef, description: je.reversedByDescription }
        : null,
    });
  } catch (err) {
    handleRouteError(err, res, "Get journal error:");
  }
});

journalRouter.post("/journal/:id/reverse", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { throw new ValidationError("معرّف القيد غير صالح"); return; }
    const { reason, reverseDate } = req.body as { reason?: string; reverseDate?: string };
    if (!reason || !String(reason).trim()) {
      throw new ValidationError("سبب عكس القيد مطلوب", { field: "reason", fix: "أدخل سبب عكس القيد" });
    }

    const [original] = await rawQuery<any>(
      `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (!original) throw new NotFoundError("القيد الأصلي غير موجود");
    if (original.reversedById) {
      throw new ValidationError(`هذا القيد معكوس مسبقاً بالقيد #${original.reversedById}`);
    }
    if (original.reversalOfId) {
      throw new ValidationError("لا يمكن عكس قيد هو أصلاً قيد عاكس");
    }

    const originalLines = await rawQuery<any>(
      `SELECT "accountCode", debit, credit, description, "costCenter", "departmentId", "projectId", "employeeId"
       FROM journal_lines WHERE "journalId" = $1 ORDER BY id ASC`,
      [id]
    );
    if (originalLines.length === 0) {
      throw new ValidationError("القيد الأصلي لا يحتوي على بنود");
    }

    const reversedLines = originalLines.map((l: any) => ({
      accountCode: l.accountCode,
      debit: Number(l.credit || 0),
      credit: Number(l.debit || 0),
      description: l.description,
      costCenter: l.costCenter,
      departmentId: l.departmentId,
      projectId: l.projectId,
      employeeId: l.employeeId,
    }));

    const newRef = `REV-${original.ref}`;
    const newDescription = `عكس قيد: ${original.description ?? ""} — ${reason}`.trim();

    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId: newJournalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: original.branchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: newRef,
      description: newDescription,
      type: "reversal",
      sourceType: "journal_reversal",
      sourceId: id,
      sourceKey: `finance:reversal:${id}`,
      lines: reversedLines,
    });

    await rawExecute(
      `UPDATE journal_entries
         SET "reversalOfId" = $1,
             "reversalReason" = $2
       WHERE id = $3`,
      [id, reason, newJournalId]
    );
    await rawExecute(
      `UPDATE journal_entries
         SET "reversedById" = $1,
             "reversedAt" = NOW(),
             "reversalReason" = $2
       WHERE id = $3`,
      [newJournalId, reason, id]
    );

    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.reversed",
      entity: "journal_entries",
      entityId: id,
      reason,
      after: { newJournalId, newRef, reverseDate },
    }).catch((err) => console.error("Failed to create reversal audit log:", err));

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.reversed",
      entity: "journal_entries",
      entityId: id,
      details: JSON.stringify({ reason, newJournalId, newRef }),
    }).catch(console.error);

    res.status(201).json({
      id: newJournalId,
      ref: newRef,
      description: newDescription,
      originalId: id,
      originalRef: original.ref,
      reason,
      lines: reversedLines,
    });
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

  const revenues = await rawQuery<any>(
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
  const expenses = await rawQuery<any>(
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

  const totalRevenue = revenues.reduce((s: number, r: any) => s + Number(r.balance), 0);
  const totalExpense = expenses.reduce((s: number, r: any) => s + Number(r.balance), 0);
  const netIncome = totalRevenue - totalExpense;

  const lines: { accountCode: string; debit: number; credit: number; description?: string }[] = [];
  // Zero out each revenue account — debit the revenue account
  for (const r of revenues) {
    const bal = Number(r.balance);
    if (bal > 0) {
      lines.push({ accountCode: r.code, debit: bal, credit: 0, description: `إقفال ${r.name}` });
    } else if (bal < 0) {
      lines.push({ accountCode: r.code, debit: 0, credit: -bal, description: `إقفال ${r.name}` });
    }
  }
  // Zero out each expense account — credit the expense account
  for (const e of expenses) {
    const bal = Number(e.balance);
    if (bal > 0) {
      lines.push({ accountCode: e.code, debit: 0, credit: bal, description: `إقفال ${e.name}` });
    } else if (bal < 0) {
      lines.push({ accountCode: e.code, debit: -bal, credit: 0, description: `إقفال ${e.name}` });
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

journalRouter.post("/fiscal-periods/:period/year-end-close", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const period = String(req.params.period);
    const dryRun = String(req.query.dryRun ?? "").toLowerCase() === "true";
    const { retainedEarningsAccountCode = "3300", force = false } = (req.body ?? {}) as { retainedEarningsAccountCode?: string; force?: boolean };

    if (!/^\d{4}$/.test(period)) {
      throw new ValidationError("صيغة السنة غير صحيحة", { field: "period", fix: "استخدم صيغة السنة YYYY مثل 2025" });
    }
    const year = Number(period);

    // Verify retained earnings account exists
    const [reAcc] = await rawQuery<any>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, retainedEarningsAccountCode]
    );
    if (!reAcc) {
      throw new ValidationError(`حساب الأرباح المحتجزة "${retainedEarningsAccountCode}" غير موجود`, { field: "retainedEarningsAccountCode", fix: "أنشئ الحساب أولاً في شجرة الحسابات" });
    }

    // Verify all 12 periods are closed, unless force=true
    const closedPeriods = await rawQuery<any>(
      `SELECT to_char("startDate", 'YYYY-MM') AS period FROM financial_periods WHERE "companyId" = $1 AND status = 'closed' AND "deletedAt" IS NULL AND EXTRACT(YEAR FROM "startDate") = $2`,
      [scope.companyId, year]
    );
    const closedSet = new Set(closedPeriods.map((p: any) => p.period));
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

    // force-close any missing periods
    if (force && missing.length > 0) {
      for (const p of missing) {
        const startDate = `${p}-01`;
        const endDate = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).toISOString().split("T")[0];
        const [existing] = await rawQuery<any>(
          `SELECT id FROM financial_periods WHERE "companyId"=$1 AND to_char("startDate",'YYYY-MM')=$2 AND "deletedAt" IS NULL LIMIT 1`,
          [scope.companyId, p]
        );
        if (existing) {
          await rawExecute(
            `UPDATE financial_periods SET status='closed', "closedAt"=NOW(), "closedBy"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`,
            [scope.activeAssignmentId, existing.id, scope.companyId]
          );
        } else {
          await rawExecute(
            `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status,"closedAt","closedBy")
             VALUES ($1,$2,$3,$4,'closed',NOW(),$5)`,
            [scope.companyId, `فترة ${p}`, startDate, endDate, scope.activeAssignmentId]
          );
        }
      }
    }

    const ref = `YE-${year}`;
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
    }).catch(console.error);

    res.status(201).json({
      id: journalId,
      ref,
      description,
      year,
      netIncome,
      totalRevenue,
      totalExpense,
      retainedEarningsAccountCode,
      lines,
    });
  } catch (err) {
    handleRouteError(err, res, "Year-end close error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OPENING BALANCES (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

journalRouter.get("/opening-balances", requirePermission("finance:read"), async (req, res) => {
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

    const entries = await rawQuery<any>(
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
       LEFT JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
       WHERE ${where}${extraWhere}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je."branchId", je."companyId"
       ORDER BY je."createdAt" DESC`,
      params
    );
    res.json({ data: entries, total: entries.length });
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
    const [existing] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "companyId" = $1 AND ref = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existing) {
      return { error: `يوجد قيد أرصدة افتتاحية مسبقاً لهذه الفترة (#${existing.id})`, status: 409, details: { existingId: existing.id } };
    }
  }

  // Validate accounts exist
  const codes = Array.from(new Set(lines.map((l) => String(l.accountCode).trim()).filter(Boolean)));
  const accRows = await rawQuery<any>(
    `SELECT code FROM chart_of_accounts WHERE "companyId" = $1 AND code = ANY($2) AND "deletedAt" IS NULL`,
    [scope.companyId, codes]
  );
  const known = new Set(accRows.map((a: any) => a.code));
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

journalRouter.post("/opening-balances", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const { periodStart, lines, force } = req.body as any;
    const result = await createOpeningBalanceEntry({ scope, periodStart, lines, force: !!force });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, ...(result.details ?? {}) });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "Create opening balances error:");
  }
});

journalRouter.post("/opening-balances/import-csv", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const { periodStart, csv, force } = req.body as { periodStart?: string; csv?: string; force?: boolean };
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
