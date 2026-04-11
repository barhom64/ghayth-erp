import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

export const budgetRouter = Router();
budgetRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance", "director", "owner"];

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

budgetRouter.get("/budget", async (req, res) => {
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

budgetRouter.post("/budget", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["director", "owner"], res)) return;
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

budgetRouter.post("/budget/validate", async (req, res) => {
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
      res.json({ status: "auto_approved", message: "الميزانية متاحة – موافقة تلقائية", utilization: Math.round(utilization), canProceed: true, requiresApproval: false });
    } else if (utilization <= 99) {
      res.json({ status: "warning_cfo", message: "تحذير: استخدام الميزانية 80-99%. يتطلب موافقة المدير المالي", utilization: Math.round(utilization), canProceed: true, requiresApproval: true, approvalLevel: "cfo" });
    } else if (utilization <= 110) {
      res.json({ status: "blocked_gm", message: "تجاوز الميزانية 100-110%. يتطلب موافقة المدير العام فقط", utilization: Math.round(utilization), canProceed: true, requiresApproval: true, approvalLevel: "gm", note: "حظر – يتطلب موافقة المدير العام حصراً" });
    } else {
      res.json({ status: "rejected", message: "تجاوز الميزانية أكثر من 110% – رفض نهائي", utilization: Math.round(utilization), canProceed: false, requiresApproval: false, blocked: true });
    }
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

budgetRouter.patch("/budget/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["director", "owner"], res)) return;
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

budgetRouter.delete("/budget/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["director", "owner"], res)) return;
    const rows = await rawQuery<any>(`DELETE FROM budgets WHERE id = $1 AND "companyId" = $2 RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (rows.length === 0) { res.status(404).json({ error: "الميزانية غير موجودة" }); return; }
    res.json({ message: "تم حذف الميزانية" });
  } catch (err) { handleRouteError(err, res, "Delete budget error:"); }
});

budgetRouter.get("/fiscal-periods", async (req, res) => {
  try {
    const scope = req.scope!;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

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

      periods.push({
        period,
        name: new Date(currentYear, m - 1).toLocaleDateString("ar-SA", { month: "long", year: "numeric" }),
        entries: Number(stats?.entries ?? 0),
        totalAmount: Number(stats?.totalDebit ?? 0),
        status: m < currentMonth ? "closed" : m === currentMonth ? "active" : "future",
      });
    }

    res.json({ data: periods });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

budgetRouter.post("/fiscal-periods/:period/close", async (req, res) => {
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
      validationError(res, `لا يمكن إقفال الفترة ${period}: يوجد ${pendingJournals.length} قيد معلق بحالة مسودة`, "journalEntries", "راجع القيود المعلقة واعتمدها أو احذفها قبل إقفال الفترة المالية");
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
      validationError(res, `لا يمكن إقفال الفترة: القيود غير متوازنة (مدين: ${totalDebit.toFixed(2)}، دائن: ${totalCredit.toFixed(2)})`, "balance", "تأكد من توازن جميع القيود المحاسبية قبل الإقفال");
      return;
    }

    res.json({ message: `تم إقفال الفترة المالية ${period} بنجاح`, period, totalDebit, totalCredit });
  } catch (err) {
    handleRouteError(err, res, "Close fiscal period error:");
  }
});
