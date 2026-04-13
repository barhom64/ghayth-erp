import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  emitEvent,
  createAuditLog,
  createJournalEntry,
  initiateApprovalChain,
  reverseAccountBalances,
  checkFinancialPeriodOpen,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

export const journalRouter = Router();
journalRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];
const PAYROLL_ROLES = ["hr_manager", "finance_manager", "general_manager", "owner"];

function requireRole(scope: any, allowedRoles: string[], res: any): boolean {
  if (!allowedRoles.includes(scope.role)) {
    res.status(403).json({ error: "ليس لديك الصلاحية للقيام بهذا الإجراء", requiredRoles: allowedRoles, yourRole: scope.role });
    return false;
  }
  return true;
}

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

journalRouter.get("/journal", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<any>(
      `SELECT je.*, json_agg(jl.*) AS lines FROM journal_entries je LEFT JOIN journal_lines jl ON jl."journalId" = je.id WHERE ${where} AND je."deletedAt" IS NULL GROUP BY je.id ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

journalRouter.post("/journal", async (req, res) => {
  try {
    const scope = req.scope!;
    const { ref, description, lines } = req.body as any;
    if (!lines || !Array.isArray(lines)) { res.status(400).json({ error: "بنود القيد مطلوبة" }); return; }
    const journalId = await createJournalEntry({ companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId, ref: ref ?? `JE-${Date.now()}`, description: description ?? "", lines });
    res.status(201).json({ id: journalId, ref, description, lines });
  } catch (err) {
    handleRouteError(err, res, "Create journal error:");
  }
});

journalRouter.get("/expenses", async (req, res) => {
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

journalRouter.post("/expenses", async (req, res) => {
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
      govSyncEnabled, govIntegrationId, govEntityType, govEntityId,
    } = req.body as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    if (!accountCode) { validationError(res, "لا يمكن صرف بدون حساب محاسبي واضح", "accountCode", "حدد الحساب المحاسبي للمصروف (مثل 5100 رواتب، 5200 وقود)"); return; }
    if (!amount || Number(amount) <= 0) { validationError(res, "لا يمكن تسجيل مصروف بقيمة صفر أو سالبة", "amount", "أدخل مبلغ المصروف بقيمة موجبة"); return; }
    if (!branchId && !scope.branchId) { validationError(res, "الفرع مطلوب لتسجيل المصروف", "branchId", "حدد الفرع الذي ينتمي إليه هذا المصروف"); return; }
    if (!costCenter) { validationError(res, "مركز التكلفة مطلوب لتسجيل المصروف", "costCenter", "حدد مركز التكلفة (مثل: مشروع-001، فرع-الرياض)"); return; }

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

    const attachCheck = checkAttachmentRequired({ operationType: operationType || expenseType || "expense", amount: Number(amount), hasAttachment: !!attachmentUrl });
    if (attachCheck.required && !attachmentUrl) { res.status(400).json({ error: attachCheck.reason, field: "attachmentUrl", hint: "ارفع المستند الداعم (فاتورة، إشعار تحويل، وصل استلام) قبل الحفظ" }); return; }

    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);
    const sourceAcct = sourceAccountCode || "1100";

    if (accountCode && amount) {
      const [budget] = await rawQuery<any>(`SELECT amount, used FROM budgets WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`, [effectiveCompanyId, accountCode, targetPeriod]);
      if (budget) {
        const budgetAmount = Number(budget.amount);
        const newUsed = Number(budget.used) + Number(amount);
        const utilization = budgetAmount > 0 ? (newUsed / budgetAmount) * 100 : 0;
        if (utilization > 110) { res.status(400).json({ error: "تجاوز الميزانية أكثر من 110% – رفض نهائي", utilization: Math.round(utilization), status: "rejected" }); return; }
        if (utilization > 99 && !["owner", "general_manager"].includes(scope.role)) { res.status(403).json({ error: "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط", utilization: Math.round(utilization), status: "blocked_gm" }); return; }
        if (utilization > 80 && !["finance_manager", "general_manager", "owner"].includes(scope.role)) { res.status(403).json({ error: "استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي", utilization: Math.round(utilization), status: "warning_cfo" }); return; }
        await rawExecute(`UPDATE budgets SET used = used + $1 WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4`, [Number(amount), effectiveCompanyId, accountCode, targetPeriod]);
      }
    }

    const baseAmount = Number(amount);
    const vatRateVal = rawVatRate != null ? Number(rawVatRate) : 0;
    const computedVat = rawVatAmount != null ? Number(rawVatAmount) : Math.round(baseAmount * (vatRateVal / 100) * 100) / 100;
    const totalWithVat = baseAmount + computedVat;

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || expenseType || "expense", relatedEntityName, period: targetPeriod, amount: baseAmount, expenseType });
    }

    const ref = `EXP-${Date.now()}`;
    const journalLines: { accountCode: string; debit: number; credit: number }[] = [{ accountCode: accountCode ?? "5000", debit: baseAmount, credit: 0 }];
    if (computedVat > 0) { journalLines.push({ accountCode: "1400", debit: computedVat, credit: 0 }); }
    journalLines.push({ accountCode: sourceAcct, debit: 0, credit: totalWithVat });
    if (subAccountCode && subAccountCode !== accountCode) { journalLines[0].accountCode = subAccountCode; }

    const journalId = await createJournalEntry({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, lines: journalLines });

    await rawExecute(
      `UPDATE journal_entries SET "costCenter" = $1, "departmentId" = $2, "relatedEntityType" = $3, "relatedEntityId" = $4, "paymentMethod" = $5, reference = $6, "isPaid" = $7, "attachmentUrl" = $8, "attachmentType" = $9, "expenseType" = $10, "operationType" = $11, "projectId" = $12, "taxCategory" = $13, "govSyncEnabled" = $14, "govIntegrationId" = $15, "govEntityType" = $16, "govEntityId" = $17 WHERE id = $18`,
      [costCenter ?? null, departmentId ?? null, relatedEntityType ?? null, relatedEntityId ?? null, paymentMethod ?? "cash", reference ?? null, isPaid != null ? !!isPaid : true, attachmentUrl ?? null, attachmentType ?? null, expenseType ?? null, operationType ?? "expense", projectId ?? null, taxCategory ?? null, govSyncEnabled ? true : false, govIntegrationId ? Number(govIntegrationId) : null, govEntityType ?? null, govEntityId ? Number(govEntityId) : null, journalId]
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

    const approvalResult = await initiateApprovalChain({ companyId: effectiveCompanyId, branchId: branchId ?? scope.branchId, chainType: "expenses", refType: "expense", refId: journalId, amount: Number(amount ?? 0) });
    if (approvalResult.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1`, [journalId]); }

    emitEvent({ companyId: effectiveCompanyId, userId: scope.userId, action: "expense.created", entity: "expenses", entityId: journalId, details: JSON.stringify({ ref, accountCode, amount: baseAmount, vatAmount: computedVat, totalWithVat, sourceAccountCode: sourceAcct, approvalRequired: approvalResult.requiresApproval, operationType, expenseType, relatedEntityType, relatedEntityId }) }).catch(console.error);

    res.status(201).json({ id: journalId, ref, amount: baseAmount, vatAmount: computedVat, totalWithVat, description: finalDescription, accountCode, sourceAccountCode: sourceAcct, operationType, expenseType, relatedEntityType, relatedEntityId, relatedEntityName, paymentMethod, costCenter, departmentId, branchId: branchId ?? scope.branchId, attachmentUrl, attachmentType, reference, isPaid, period: targetPeriod, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Create expense error:");
  }
});

journalRouter.patch("/expenses/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { description } = req.body as any;
    const [existing] = await rawQuery<any>(`SELECT id, "createdAt" FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(req.params.id), scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    const expenseDate = new Date(existing.createdAt).toISOString().split("T")[0];
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, expenseDate);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن تعديل مصروف في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`, [description, Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.delete("/expenses/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    await reverseAccountBalances(scope.companyId, row.id);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.patch("/expenses/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;
    const [exp] = await rawQuery<any>(`SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!exp) { res.status(404).json({ error: "المصروف غير موجود" }); return; }
    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) { res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return; }
    await rawExecute(`UPDATE journal_entries SET status = $1 WHERE id = $2`, [newStatus, Number(id)]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('expense',$1,$2,$3,$4,$5)`, [Number(id), newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { console.error(e); }
    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.get("/vouchers", async (req, res) => {
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

journalRouter.post("/vouchers", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const {
      type, amount, description, payee, accountCode, method = "cash", sourceAccountCode,
      subAccountCode, relatedEntityType, relatedEntityId, relatedEntityName,
      contractId, invoiceId, reference, attachmentUrl, attachmentType,
      vatRate: rawVatRate, vatAmount: rawVatAmount,
      beneficiaryType, entitlementType, branchId, departmentId,
      autoDescription, operationType,
    } = req.body as any;

    if (!amount || !type) { res.status(400).json({ error: "النوع والمبلغ مطلوبان" }); return; }
    if (Number(amount) <= 0) { validationError(res, "لا يمكن إنشاء سند بمبلغ صفر أو سالب", "amount", "أدخل مبلغاً موجباً للسند"); return; }
    if (!branchId && !scope.branchId) { validationError(res, "الفرع مطلوب لإنشاء السند", "branchId", "حدد الفرع الذي ينتمي إليه هذا السند"); return; }
    if (!accountCode) { validationError(res, "الحساب المحاسبي مطلوب", "accountCode", "حدد الحساب المحاسبي الرئيسي للسند"); return; }

    const voucherAttachCheck = checkAttachmentRequired({ operationType: type === "payment" ? "payment" : "receipt", amount: Number(amount) });
    if (voucherAttachCheck.required && !attachmentUrl) {
      res.status(400).json({ error: voucherAttachCheck.reason, field: "attachmentUrl", hint: "ارفع وصل الاستلام أو أمر التحويل للسندات الكبيرة" }); return;
    }

    const resolvedSourceAccount = sourceAccountCode || "1100";
    const [sourceAcctRow] = await rawQuery<any>(
      `SELECT id, code, name, type, subtype, "accountSubtype" FROM chart_of_accounts
       WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, resolvedSourceAccount]
    );
    if (!sourceAcctRow) {
      res.status(400).json({
        error: `حساب المصدر "${resolvedSourceAccount}" غير موجود في دليل الحسابات`,
        field: "sourceAccountCode",
        hint: "استخدم حساباً نقدياً مثل 1100 (الصندوق) أو 1110 (البنك)",
      });
      return;
    }
    const cashBankSubtypes = ["cash", "bank", "cash_and_bank"];
    const isCashOrBank =
      cashBankSubtypes.includes(sourceAcctRow.subtype ?? "") ||
      cashBankSubtypes.includes(sourceAcctRow.accountSubtype ?? "") ||
      /^11[01]\d/.test(sourceAcctRow.code);
    if (!isCashOrBank) {
      res.status(400).json({
        error: `حساب المصدر "${sourceAcctRow.code} - ${sourceAcctRow.name}" ليس حساباً نقدياً أو بنكياً. يجب استخدام حساب نقدي أو بنكي.`,
        field: "sourceAccountCode",
        hint: "استخدم حساباً نقدياً مثل 1100 (الصندوق) أو 1110 (البنك)",
      });
      return;
    }

    const baseAmount = Number(amount);
    const vatRateVal = rawVatRate != null ? Number(rawVatRate) : 0;
    const computedVat = rawVatAmount != null ? Number(rawVatAmount) : Math.round(baseAmount * (vatRateVal / 100) * 100) / 100;
    const totalWithVat = baseAmount + computedVat;

    const isReceipt = type === "receipt";
    const prefix = isReceipt ? "RV" : "PV";
    const ref = `${prefix}-${Date.now()}`;

    let finalDescription = description;
    if (!finalDescription || autoDescription) {
      finalDescription = generateAutoDescription({ operationType: operationType || type, relatedEntityName, amount: baseAmount });
    }

    const cashAcct = sourceAccountCode || "1100";
    const journalLines: { accountCode: string; debit: number; credit: number }[] = isReceipt
      ? [
          { accountCode: cashAcct, debit: totalWithVat, credit: 0 },
          ...(computedVat > 0 ? [{ accountCode: "2300", debit: 0, credit: computedVat }] : []),
          { accountCode: subAccountCode || accountCode, debit: 0, credit: baseAmount },
        ]
      : [
          { accountCode: subAccountCode || accountCode, debit: baseAmount, credit: 0 },
          ...(computedVat > 0 ? [{ accountCode: "1400", debit: computedVat, credit: 0 }] : []),
          { accountCode: cashAcct, debit: 0, credit: totalWithVat },
        ];

    const journalId = await createJournalEntry({ companyId: scope.companyId, branchId: branchId ?? scope.branchId, createdBy: scope.activeAssignmentId, ref, description: finalDescription, lines: journalLines });

    await rawExecute(
      `UPDATE journal_entries SET "paymentMethod" = $1, reference = $2, "attachmentUrl" = $3, "attachmentType" = $4, "relatedEntityType" = $5, "relatedEntityId" = $6, "operationType" = $7, "departmentId" = $8 WHERE id = $9`,
      [method ?? "cash", reference ?? null, attachmentUrl ?? null, attachmentType ?? null, relatedEntityType ?? null, relatedEntityId ?? null, operationType ?? type, departmentId ?? null, journalId]
    ).catch(() => {});

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `voucher.${type}`, entity: "vouchers", entityId: journalId, details: JSON.stringify({ ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat, accountCode, payee, method }) }).catch(console.error);

    res.status(201).json({ id: journalId, ref, type, amount: baseAmount, vatAmount: computedVat, totalWithVat, description: finalDescription, accountCode, paymentMethod: method, reference, attachmentUrl, relatedEntityType, relatedEntityId, relatedEntityName, contractId, invoiceId, branchId: branchId ?? scope.branchId });
  } catch (err) {
    handleRouteError(err, res, "Create voucher error:");
  }
});

journalRouter.patch("/vouchers/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { description } = req.body as any;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`, [description, Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "السند غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.delete("/vouchers/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "السند غير موجود" }); return; }
    await reverseAccountBalances(scope.companyId, row.id);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.get("/chart-of-accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const accounts = await rawQuery<any>(`SELECT id, code, name, type, "parentCode", status FROM chart_of_accounts WHERE ${where} AND "deletedAt" IS NULL ORDER BY code ASC`, params);
    res.json(accounts);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.get("/accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const { search, type: accountType } = req.query as { search?: string; type?: string };
    let extraWhere = " AND \"deletedAt\" IS NULL";
    if (search && search.trim()) { params.push(`%${search.trim()}%`); extraWhere += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`; }
    if (accountType && accountType.trim()) { params.push(accountType.trim()); extraWhere += ` AND type = $${params.length}`; }
    const rows = await rawQuery(`SELECT * FROM chart_of_accounts WHERE ${where}${extraWhere} ORDER BY code`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

journalRouter.post("/accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const b = req.body;
    const r = await rawExecute(`INSERT INTO chart_of_accounts ("companyId", code, name, type, "parentCode") VALUES ($1,$2,$3,$4,$5)`, [scope.companyId, b.code, b.name, b.type || "asset", b.parentCode]);
    res.status(201).json({ id: r.insertId, ...b });
  } catch (err) {
    handleRouteError(err, res, "Create account error:");
  }
});

journalRouter.patch("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name); addField("type", b.type); addField("parentCode", b.parentCode);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE chart_of_accounts SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "الحساب غير موجود" }); return; }
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Update account error:");
  }
});

journalRouter.delete("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const id = Number(req.params.id);
    const [account] = await rawQuery<any>(`SELECT id, code, name FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!account) { res.status(404).json({ error: "الحساب غير موجود" }); return; }
    const [hasLines] = await rawQuery<any>(`SELECT COUNT(*)::int AS cnt FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL WHERE jl."accountCode" = $1 AND je."companyId" = $2`, [account.code, scope.companyId]);
    if (hasLines && hasLines.cnt > 0) { res.status(400).json({ error: `لا يمكن حذف الحساب "${account.name}" لأنه مرتبط بـ ${hasLines.cnt} قيد محاسبي`, linkedEntries: hasLines.cnt }); return; }
    const [hasChildren] = await rawQuery<any>(`SELECT COUNT(*)::int AS cnt FROM chart_of_accounts WHERE "parentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (hasChildren && hasChildren.cnt > 0) { res.status(400).json({ error: `لا يمكن حذف الحساب "${account.name}" لأنه يحتوي على ${hasChildren.cnt} حساب فرعي`, childAccounts: hasChildren.cnt }); return; }
    await rawQuery<any>(`UPDATE chart_of_accounts SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 RETURNING id`, [id, scope.companyId]);
    res.json({ message: "تم حذف الحساب" });
  } catch (err) {
    handleRouteError(err, res, "Delete account error:");
  }
});

journalRouter.get("/fiscal-periods", async (req, res) => {
  try {
    const scope = req.scope!;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const periods = [];
    for (let m = 1; m <= 12; m++) {
      const period = `${currentYear}-${String(m).padStart(2, "0")}`;
      const [stats] = await rawQuery<any>(`SELECT COUNT(*) AS entries, COALESCE(SUM(jl.debit), 0) AS "totalDebit" FROM journal_entries je LEFT JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2`, [scope.companyId, period]);
      periods.push({ period, name: new Date(currentYear, m - 1).toLocaleDateString("ar-SA", { month: "long", year: "numeric" }), entries: Number(stats?.entries ?? 0), totalAmount: Number(stats?.totalDebit ?? 0), status: m < currentMonth ? "closed" : m === currentMonth ? "active" : "future" });
    }
    res.json({ data: periods });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.post("/fiscal-periods/:period/close", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { period } = req.params;
    if (!/^\d{4}-\d{2}$/.test(period)) { validationError(res, "صيغة الفترة غير صحيحة", "period", "استخدم الصيغة YYYY-MM مثل 2025-01"); return; }
    const pendingJournals = await rawQuery<any>(`SELECT je.id, je.ref, je.description FROM journal_entries je WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2 AND je.status = 'draft' LIMIT 10`, [scope.companyId, period]);
    if (pendingJournals.length > 0) { validationError(res, `لا يمكن إقفال الفترة ${period}: يوجد ${pendingJournals.length} قيد معلق بحالة مسودة`, "journalEntries", "راجع القيود المعلقة واعتمدها أو احذفها قبل إقفال الفترة المالية"); return; }
    const [debitSum] = await rawQuery<any>(`SELECT COALESCE(SUM(jl.debit), 0) AS "totalDebit", COALESCE(SUM(jl.credit), 0) AS "totalCredit" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND to_char(je."createdAt", 'YYYY-MM') = $2`, [scope.companyId, period]);
    const totalDebit = Number(debitSum?.totalDebit ?? 0);
    const totalCredit = Number(debitSum?.totalCredit ?? 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) { validationError(res, `لا يمكن إقفال الفترة: القيود غير متوازنة (مدين: ${totalDebit.toFixed(2)}، دائن: ${totalCredit.toFixed(2)})`, "balance", "تأكد من توازن جميع القيود المحاسبية قبل الإقفال"); return; }
    res.json({ message: `تم إقفال الفترة المالية ${period} بنجاح`, period, totalDebit, totalCredit });
  } catch (err) {
    handleRouteError(err, res, "Close fiscal period error:");
  }
});

journalRouter.get("/salary-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT je.id, je.ref, je.description, COALESCE(SUM(jl.debit), 0) AS amount, je."createdAt" AS date, 'active' AS status FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%' GROUP BY je.id, je.ref, je.description, je."createdAt" ORDER BY je."createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, summary: { total: rows.length, totalAmount: rows.reduce((s: number, r: any) => s + Number(r.amount), 0) } });
  } catch (err) {
    res.json({ data: [], summary: { total: 0, totalAmount: 0 } });
  }
});

journalRouter.post("/salary-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PAYROLL_ROLES, res)) return;
    const { employeeName, amount, description, deductMonths = 1, sourceAccountCode } = req.body as any;
    if (!amount || !employeeName) { res.status(400).json({ error: "اسم الموظف والمبلغ مطلوبان" }); return; }
    const sourceAcct = sourceAccountCode || "1100";
    const ref = `SALARY-ADV-${Date.now()}`;
    const journalId = await createJournalEntry({ companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId, ref, description: description ?? `سلفة راتب ${employeeName} – خصم على ${deductMonths} شهر`, lines: [{ accountCode: "1410", debit: Number(amount), credit: 0 }, { accountCode: sourceAcct, debit: 0, credit: Number(amount) }] });
    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "advances", refType: "salary_advance", refId: journalId, amount: Number(amount) });
    if (approvalResult.requiresApproval) { await rawExecute(`UPDATE journal_entries SET status = 'pending_approval' WHERE id = $1`, [journalId]); }
    res.status(201).json({ id: journalId, ref, employeeName, amount, deductMonths, description, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.patch("/salary-advances/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PAYROLL_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;
    const [entry] = await rawQuery<any>(`SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND ref LIKE 'SALARY-ADV%'`, [Number(id), scope.companyId]);
    if (!entry) { res.status(404).json({ error: "السلفة غير موجودة" }); return; }
    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) { res.status(400).json({ error: "يجب ذكر سبب الرفض" }); return; }
    await rawExecute(`UPDATE journal_entries SET status = $1 WHERE id = $2`, [newStatus, Number(id)]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('salary_advance',$1,$2,$3,$4,$5)`, [Number(id), newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { console.error(e); }
    res.json({ id: Number(id), status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد السلفة");
  }
});

journalRouter.get("/ledger/:accountCode", async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query as any;
    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    const [account] = await rawQuery<any>(`SELECT * FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`, [scope.companyId, accountCode]);
    const entries = await rawQuery<any>(`SELECT jl.id, jl.debit, jl.credit, je.ref, je.description, je."createdAt" AS date FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL WHERE je."companyId" = $1 AND jl."accountCode" = $2 ${dateFilter} ORDER BY je."createdAt" ASC`, params);
    let runningBalance = 0;
    const withBalance = entries.map((e: any) => { runningBalance += Number(e.debit) - Number(e.credit); return { ...e, runningBalance }; });
    const totalDebit = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
    const totalCredit = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);
    res.json({ account: account || { code: accountCode }, entries: withBalance, summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit } });
  } catch (err) {
    handleRouteError(err, res, "Ledger error:");
  }
});

journalRouter.get("/payments", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT je.id, je.ref, je.description, je."createdAt" AS date, COALESCE(SUM(jl.credit), 0) AS amount FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" IN ('1100','1110') WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND jl.credit > 0 GROUP BY je.id, je.ref, je.description, je."createdAt" ORDER BY je."createdAt" DESC LIMIT 100`, [scope.companyId]);
    const totalPayments = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { totalPayments, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.get("/financial-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT pr.id, pr.ref, pr."totalAmount" AS amount, pr.status, pr."createdAt", pr.notes, s.name AS "supplierName", e.name AS "requestedByName" FROM purchase_requests pr LEFT JOIN suppliers s ON s.id = pr."supplierId" LEFT JOIN employee_assignments ea ON ea.id = pr."requestedBy" LEFT JOIN employees e ON e.id = ea."employeeId" WHERE pr."companyId" = $1 ORDER BY pr."createdAt" DESC`, [scope.companyId]);
    const pending = rows.filter((r: any) => r.status === "draft" || r.status === "pending");
    const approved = rows.filter((r: any) => r.status === "approved");
    res.json({ data: rows, summary: { total: rows.length, pending: pending.length, approved: approved.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});
