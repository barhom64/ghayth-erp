import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { assertRole } from "../lib/roleGuards.js";

export const budgetRouter = Router();
budgetRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance", "director", "owner"];

budgetRouter.get("/budget", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'b."companyId"', branchColumn: 'b."branchId"', enforceBranchScope: true });
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
    assertRole(scope, ["director", "owner"]);
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
    assertRole(scope, ["director", "owner"]);
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
    assertRole(scope, ["director", "owner"]);
    const rows = await rawQuery<any>(`DELETE FROM budgets WHERE id = $1 AND "companyId" = $2 RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (rows.length === 0) { res.status(404).json({ error: "الميزانية غير موجودة" }); return; }
    res.json({ message: "تم حذف الميزانية" });
  } catch (err) { handleRouteError(err, res, "Delete budget error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET APPROVAL WORKFLOW — سير عمل اعتماد تجاوز الميزانية
// ─────────────────────────────────────────────────────────────────────────────
// When utilization exceeds 80%, /budget/validate says "requiresApproval".
// Callers (PO/invoice creation) should create a budget_approval_request,
// which is then routed to CFO or GM by approval_level.

async function ensureBudgetApprovalTable() {
  await rawExecute(`
    CREATE TABLE IF NOT EXISTS budget_approval_requests (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "branchId" INTEGER,
      "accountCode" VARCHAR(20) NOT NULL,
      period VARCHAR(7) NOT NULL,
      "requestedAmount" NUMERIC(18,2) NOT NULL,
      "budgetAmount" NUMERIC(18,2) NOT NULL,
      "utilizationBefore" NUMERIC(6,2) NOT NULL,
      "utilizationAfter" NUMERIC(6,2) NOT NULL,
      "approvalLevel" VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      "sourceType" VARCHAR(32),
      "sourceId" INTEGER,
      reason TEXT,
      "requestedBy" INTEGER NOT NULL,
      "requestedAt" TIMESTAMP DEFAULT NOW(),
      "decidedBy" INTEGER,
      "decidedAt" TIMESTAMP,
      "decisionNotes" TEXT
    )
  `);
}

budgetRouter.post("/budget/approval-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode, period, requestedAmount, sourceType, sourceId, reason } = req.body as any;
    if (!accountCode || !period || !requestedAmount || Number(requestedAmount) <= 0) {
      throw new ValidationError("الحساب والفترة والمبلغ مطلوبة", {
        field: "requestedAmount",
        fix: "أدخل قيمة موجبة والفترة بصيغة YYYY-MM",
      });
    }
    await ensureBudgetApprovalTable();

    const [budget] = await rawQuery<any>(
      `SELECT amount, used FROM budgets WHERE "companyId"=$1 AND "accountCode"=$2 AND period=$3`,
      [scope.companyId, accountCode, period]
    );
    if (!budget) {
      res.status(404).json({ error: "لا توجد ميزانية محددة لهذا الحساب" });
      return;
    }

    const budgetAmount = Number(budget.amount);
    const used = Number(budget.used);
    const utilBefore = budgetAmount > 0 ? (used / budgetAmount) * 100 : 0;
    const utilAfter = budgetAmount > 0 ? ((used + Number(requestedAmount)) / budgetAmount) * 100 : 0;

    let level: string;
    if (utilAfter <= 80) level = "auto";
    else if (utilAfter <= 99) level = "cfo";
    else if (utilAfter <= 110) level = "gm";
    else { res.status(400).json({ error: "تجاوز 110% — مرفوض نهائياً ولا يمكن اعتماده" }); return; }

    if (level === "auto") {
      res.json({ status: "auto_approved", message: "الميزانية متاحة، لا حاجة لاعتماد" });
      return;
    }

    const [row] = await rawQuery<any>(
      `INSERT INTO budget_approval_requests
       ("companyId","branchId","accountCode",period,"requestedAmount","budgetAmount",
        "utilizationBefore","utilizationAfter","approvalLevel","sourceType","sourceId",reason,"requestedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [scope.companyId, scope.branchId ?? null, accountCode, period, Number(requestedAmount),
       budgetAmount, Math.round(utilBefore * 100) / 100, Math.round(utilAfter * 100) / 100,
       level, sourceType ?? null, sourceId ?? null, reason ?? null, scope.activeAssignmentId]
    );
    res.status(201).json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "Create budget approval request error:");
  }
});

budgetRouter.get("/budget/approval-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureBudgetApprovalTable();
    const status = (req.query.status as string) ?? "pending";
    const rows = await rawQuery<any>(
      `SELECT ar.*, coa.name AS "accountName"
       FROM budget_approval_requests ar
       LEFT JOIN chart_of_accounts coa ON coa.code = ar."accountCode" AND coa."companyId" = ar."companyId"
       WHERE ar."companyId"=$1 AND ar.status=$2
       ORDER BY ar."requestedAt" DESC LIMIT 200`,
      [scope.companyId, status]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List budget approvals error:");
  }
});

budgetRouter.post("/budget/approval-requests/:id/decide", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { decision, notes } = req.body as any; // decision: 'approved' | 'rejected'
    if (!["approved", "rejected"].includes(decision)) {
      throw new ValidationError("القرار يجب أن يكون approved أو rejected", {
        field: "decision",
        fix: "استخدم approved أو rejected",
      });
    }
    await ensureBudgetApprovalTable();

    const [request] = await rawQuery<any>(
      `SELECT * FROM budget_approval_requests WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!request) { res.status(404).json({ error: "طلب الاعتماد غير موجود" }); return; }
    if (request.status !== "pending") {
      res.status(400).json({ error: `الطلب تم البت فيه مسبقاً (${request.status})` });
      return;
    }

    // Approval level authorization
    const needed = request.approvalLevel === "cfo"
      ? ["finance", "director", "owner"]
      : ["director", "owner"];
    if (!needed.includes(scope.role)) {
      res.status(403).json({
        error: `هذا الطلب يتطلب اعتماد ${request.approvalLevel === "cfo" ? "المدير المالي" : "المدير العام"}`,
        requiredRoles: needed,
      });
      return;
    }

    const [updated] = await rawQuery<any>(
      `UPDATE budget_approval_requests
         SET status=$1, "decisionNotes"=$2, "decidedBy"=$3, "decidedAt"=NOW()
       WHERE id=$4 RETURNING *`,
      [decision, notes ?? null, scope.activeAssignmentId, id]
    );
    res.json({ data: updated, message: decision === "approved" ? "تم اعتماد الطلب" : "تم رفض الطلب" });
  } catch (err) {
    handleRouteError(err, res, "Decide budget approval error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET VARIANCE REPORT — تقرير الفروقات بين الميزانية والفعلي
// ─────────────────────────────────────────────────────────────────────────────

budgetRouter.get("/budget/variance", async (req, res) => {
  try {
    const scope = req.scope!;
    const period = (req.query.period as string) ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("period يجب أن يكون بصيغة YYYY-MM", {
        field: "period",
        fix: "مثال: 2026-04",
      });
    }
    const [y, m] = period.split("-").map(Number);
    const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const periodEnd = new Date(y, m, 0).toISOString().slice(0, 10);

    const rows = await rawQuery<any>(
      `SELECT b."accountCode", coa.name AS "accountName", coa.type AS "accountType",
              b.amount AS "budgetAmount",
              COALESCE((
                SELECT SUM(jl.debit - jl.credit)
                FROM journal_lines jl
                JOIN journal_entries je ON je.id = jl."journalId"
                WHERE je."companyId" = b."companyId"
                  AND je."deletedAt" IS NULL
                  AND jl."accountCode" = b."accountCode"
                  AND je."createdAt"::date BETWEEN $2::date AND $3::date
              ), 0) AS "actualAmount"
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
       WHERE b."companyId" = $1 AND b.period = $4
       ORDER BY b."accountCode"`,
      [scope.companyId, periodStart, periodEnd, period]
    );

    let totalBudget = 0;
    let totalActual = 0;
    const lines = rows.map((r: any) => {
      const budgetAmount = Number(r.budgetAmount);
      // For expense accounts actual = DR - CR (positive = spent). For revenue, invert sign.
      let actualAmount = Number(r.actualAmount);
      if (r.accountType === "revenue" || r.accountType === "liability" || r.accountType === "equity") {
        actualAmount = -actualAmount;
      }
      const variance = Math.round((budgetAmount - actualAmount) * 100) / 100;
      const variancePct = budgetAmount > 0 ? Math.round((variance / budgetAmount) * 10000) / 100 : 0;
      totalBudget += budgetAmount;
      totalActual += actualAmount;
      let status: string;
      if (budgetAmount === 0) status = "no_budget";
      else if (actualAmount > budgetAmount) status = "over_budget";
      else if (actualAmount > budgetAmount * 0.9) status = "near_limit";
      else status = "within_budget";
      return {
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        budgetAmount,
        actualAmount: Math.round(actualAmount * 100) / 100,
        variance,
        variancePct,
        utilizationPct: budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 10000) / 100 : 0,
        status,
      };
    });

    res.json({
      period,
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance: Math.round((totalBudget - totalActual) * 100) / 100,
      lines,
    });
  } catch (err) {
    handleRouteError(err, res, "Budget variance report error:");
  }
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
    assertRole(scope, FINANCE_ROLES);
    const { period } = req.params;

    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("صيغة الفترة غير صحيحة", {
        field: "period",
        fix: "استخدم الصيغة YYYY-MM مثل 2025-01",
      });
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
      throw new ValidationError(
        `لا يمكن إقفال الفترة ${period}: يوجد ${pendingJournals.length} قيد معلق بحالة مسودة`,
        {
          field: "journalEntries",
          fix: "راجع القيود المعلقة واعتمدها أو احذفها قبل إقفال الفترة المالية",
        },
      );
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
      throw new ValidationError(
        `لا يمكن إقفال الفترة: القيود غير متوازنة (مدين: ${totalDebit.toFixed(2)}، دائن: ${totalCredit.toFixed(2)})`,
        {
          field: "balance",
          fix: "تأكد من توازن جميع القيود المحاسبية قبل الإقفال",
        },
      );
    }

    res.json({ message: `تم إقفال الفترة المالية ${period} بنجاح`, period, totalDebit, totalCredit });
  } catch (err) {
    handleRouteError(err, res, "Close fiscal period error:");
  }
});
