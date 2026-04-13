import {
  handleRouteError,
  validationError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../lib/errorHandler.js";
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
    if (!existing) throw new NotFoundError("المصروف غير موجود");
    const expenseDate = new Date(existing.createdAt).toISOString().split("T")[0];
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, expenseDate);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن تعديل مصروف في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET description = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`, [description, Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.delete("/expenses/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("المصروف غير موجود");
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
    if (!exp) throw new NotFoundError("المصروف غير موجود");
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
    if (!row) throw new NotFoundError("السند غير موجود");
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

journalRouter.delete("/vouchers/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE journal_entries SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("السند غير موجود");
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
    if (rows.length === 0) throw new NotFoundError("الحساب غير موجود");
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
    if (!account) throw new NotFoundError("الحساب غير موجود");
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
    if (!entry) throw new NotFoundError("السلفة غير موجودة");
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

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY DETAIL + REVERSAL (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

journalRouter.get("/journal/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "معرّف القيد غير صالح" }); return; }
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

journalRouter.post("/journal/:id/reverse", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "معرّف القيد غير صالح" }); return; }
    const { reason, reverseDate } = req.body as { reason?: string; reverseDate?: string };
    if (!reason || !String(reason).trim()) {
      validationError(res, "سبب عكس القيد مطلوب", "reason", "أدخل سبب عكس القيد");
      return;
    }

    const [original] = await rawQuery<any>(
      `SELECT * FROM journal_entries WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (!original) throw new NotFoundError("القيد الأصلي غير موجود");
    if (original.reversedById) {
      res.status(400).json({ error: `هذا القيد معكوس مسبقاً بالقيد #${original.reversedById}` });
      return;
    }
    if (original.reversalOfId) {
      res.status(400).json({ error: "لا يمكن عكس قيد هو أصلاً قيد عاكس" });
      return;
    }

    const effectiveDate = reverseDate && /^\d{4}-\d{2}-\d{2}$/.test(reverseDate)
      ? reverseDate
      : new Date().toISOString().slice(0, 10);

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, effectiveDate);
    if (!periodCheck.open) {
      res.status(422).json({ error: `لا يمكن عكس القيد في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}` });
      return;
    }

    const originalLines = await rawQuery<any>(
      `SELECT "accountCode", debit, credit, description, "costCenter", "departmentId", "projectId", "employeeId"
       FROM journal_lines WHERE "journalId" = $1 ORDER BY id ASC`,
      [id]
    );
    if (originalLines.length === 0) {
      res.status(400).json({ error: "القيد الأصلي لا يحتوي على بنود" });
      return;
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

    const newJournalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: original.branchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: newRef,
      description: newDescription,
      type: "reversal",
      sourceType: "journal_reversal",
      sourceId: id,
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
      after: { newJournalId, newRef, reverseDate: effectiveDate },
    }).catch(() => {});

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

journalRouter.post("/fiscal-periods/:period/year-end-close", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { period } = req.params;
    const dryRun = String(req.query.dryRun ?? "").toLowerCase() === "true";
    const { retainedEarningsAccountCode = "3300", force = false } = (req.body ?? {}) as { retainedEarningsAccountCode?: string; force?: boolean };

    if (!/^\d{4}$/.test(period)) {
      validationError(res, "صيغة السنة غير صحيحة", "period", "استخدم صيغة السنة YYYY مثل 2025");
      return;
    }
    const year = Number(period);

    // Verify retained earnings account exists
    const [reAcc] = await rawQuery<any>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, retainedEarningsAccountCode]
    );
    if (!reAcc) {
      validationError(res, `حساب الأرباح المحتجزة "${retainedEarningsAccountCode}" غير موجود`, "retainedEarningsAccountCode", "أنشئ الحساب أولاً في شجرة الحسابات");
      return;
    }

    // Verify all 12 periods are closed, unless force=true
    const closedPeriods = await rawQuery<any>(
      `SELECT to_char("startDate", 'YYYY-MM') AS period FROM financial_periods WHERE "companyId" = $1 AND status = 'closed' AND EXTRACT(YEAR FROM "startDate") = $2`,
      [scope.companyId, year]
    );
    const closedSet = new Set(closedPeriods.map((p: any) => p.period));
    const missing: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const p = `${year}-${String(m).padStart(2, "0")}`;
      if (!closedSet.has(p)) missing.push(p);
    }
    if (missing.length > 0 && !force && !dryRun) {
      res.status(400).json({
        error: `لا يمكن إقفال السنة ${year}: توجد ${missing.length} فترة غير مُقفلة`,
        missingPeriods: missing,
        hint: "أقفل الفترات الشهرية أولاً أو استخدم force=true",
      });
      return;
    }

    const { revenues, expenses, totalRevenue, totalExpense, netIncome, lines } =
      await buildYearEndClosingLines(scope.companyId, year, retainedEarningsAccountCode);

    if (lines.length === 0) {
      res.status(400).json({ error: "لا توجد حسابات إيرادات أو مصروفات بأرصدة للسنة المحددة" });
      return;
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
          `SELECT id FROM financial_periods WHERE "companyId"=$1 AND to_char("startDate",'YYYY-MM')=$2 LIMIT 1`,
          [scope.companyId, p]
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
            [scope.companyId, `فترة ${p}`, startDate, endDate, scope.activeAssignmentId]
          );
        }
      }
    }

    const ref = `YE-${year}`;
    const description = `قيد إقفال السنة المالية ${year} — صافي الدخل ${netIncome.toFixed(2)}`;
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref,
      description,
      type: "closing",
      sourceType: "year_end_close",
      lines,
    });

    // Mark all fiscal periods for the year as yearEndClosed = true
    await rawExecute(
      `UPDATE financial_periods
         SET "yearEndClosed" = TRUE,
             "yearEndClosedAt" = NOW(),
             "yearEndClosingJournalId" = $1
       WHERE "companyId" = $2 AND EXTRACT(YEAR FROM "startDate") = $3`,
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

journalRouter.get("/opening-balances", async (req, res) => {
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
  const journalId = await createJournalEntry({
    companyId: scope.companyId,
    branchId: scope.branchId,
    createdBy: scope.activeAssignmentId,
    ref,
    description,
    type: "opening_balance",
    sourceType: "opening_balance",
    lines: lines.map((l) => ({
      accountCode: String(l.accountCode),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
    })),
  });

  return { id: journalId, ref, description };
}

journalRouter.post("/opening-balances", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
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

journalRouter.post("/opening-balances/import-csv", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { periodStart, csv, force } = req.body as { periodStart?: string; csv?: string; force?: boolean };
    if (!csv || typeof csv !== "string") {
      res.status(400).json({ error: "محتوى CSV مطلوب" });
      return;
    }
    const rawLines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (rawLines.length === 0) {
      res.status(400).json({ error: "ملف CSV فارغ" });
      return;
    }
    // Detect header
    const startIdx = /account/i.test(rawLines[0]) ? 1 : 0;
    const parsed: { accountCode: string; debit: number; credit: number }[] = [];
    for (let i = startIdx; i < rawLines.length; i++) {
      const parts = rawLines[i].split(",").map((p) => p.trim());
      if (parts.length < 3) {
        res.status(400).json({ error: `سطر CSV غير صالح (${i + 1}): يتطلب 3 أعمدة accountCode,debit,credit` });
        return;
      }
      const [code, d, c] = parts;
      const debit = Number(d || 0);
      const credit = Number(c || 0);
      if (!code || (Number.isNaN(debit) && Number.isNaN(credit))) {
        res.status(400).json({ error: `سطر CSV غير صالح (${i + 1})` });
        return;
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
