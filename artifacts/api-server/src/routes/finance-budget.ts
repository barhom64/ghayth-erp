import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { emitEvent, createAuditLog, currentPeriod, currentYear, toDateISO, roundTo2 } from "../lib/businessHelpers.js";
import { pushToDLQ } from "../lib/eventBus.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";

const createBudgetSchema = z.object({
  accountCode: z.string().min(1, "رمز الحساب مطلوب"),
  period: z.string().min(1, "الفترة مطلوبة"),
  amount: z.coerce.number({ required_error: "المبلغ مطلوب" }).min(0, "المبلغ يجب أن يكون صفر أو أكثر"),
  branchId: z.coerce.number().optional().nullable(),
});

export const budgetRouter = Router();
budgetRouter.use(authMiddleware);

budgetRouter.get("/budget", requirePermission("finance:read"), async (req, res) => {
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

budgetRouter.get("/budget-vs-actual", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as { period?: string };
    const now = new Date();
    let startDate: string, endDate: string;
    if (period === "year") {
      startDate = `${now.getFullYear()}-01-01`;
      endDate = `${now.getFullYear()}-12-31`;
    } else if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      startDate = `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, "0")}-01`;
      const em = q * 3 + 3;
      endDate = `${now.getFullYear()}-${String(em).padStart(2, "0")}-${em === 2 ? 28 : [4, 6, 9, 11].includes(em) ? 30 : 31}`;
    } else {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;
    }
    const rows = await rawQuery<any>(
      `SELECT b."accountCode", coa.name AS "accountName",
              SUM(b.amount) AS budget,
              COALESCE(SUM(b.used), 0) AS actual
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
       WHERE b."companyId" = $1 AND b.period >= $2 AND b.period <= $3
       GROUP BY b."accountCode", coa.name
       ORDER BY b."accountCode"`,
      [scope.companyId, startDate.slice(0, 7), endDate.slice(0, 7)]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0 });
  }
});

budgetRouter.post("/budget", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const parsed = createBudgetSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { accountCode, period, amount, branchId } = parsed.data;
    const { insertId } = await rawExecute(
      `INSERT INTO budgets ("companyId","branchId","accountCode",period,amount,used)
       VALUES ($1,$2,$3,$4,$5,0)
       ON CONFLICT DO NOTHING`,
      [scope.companyId, branchId ?? scope.branchId, accountCode, period, Number(amount)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "budget.created",
      entity: "budgets",
      entityId: insertId,
      details: JSON.stringify({ accountCode, period, amount: Number(amount) }),
    }).catch((err) => pushToDLQ("event", { action: "budget.created", entityId: insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "budgets",
      entityId: insertId,
      after: { accountCode, period, amount: Number(amount) },
    }).catch((err) => console.error("[audit] budget.created:", err));

    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) {
    handleRouteError(err, res, "Create budget error:");
  }
});

budgetRouter.post("/budget/validate", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode, amount, period } = req.body as any;
    if (!accountCode || !amount) {
      throw new ValidationError("الحساب والمبلغ مطلوبان", {
        field: !accountCode ? "accountCode" : "amount",
        fix: "أدخل رمز الحساب والمبلغ المراد التحقق منه",
      });
    }

    const targetPeriod = period ?? currentPeriod();
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

budgetRouter.patch("/budget/:id", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("accountCode", b.accountCode);
    addField("period", b.period);
    addField("amount", b.amount);
    if (fields.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE budgets SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) throw new NotFoundError("الميزانية غير موجودة");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "budget.updated",
      entity: "budgets",
      entityId: id,
      details: JSON.stringify({ fields: Object.keys(b) }),
    }).catch((err) => pushToDLQ("event", { action: "budget.updated", entityId: id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "budgets",
      entityId: id,
      after: { fields: Object.keys(b) },
    }).catch((err) => console.error("[audit] budget.updated:", err));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update budget error:"); }
});

budgetRouter.delete("/budget/:id", requirePermission("finance:delete"), async (req, res) => {
  try {
    const scope = req.scope!;

    const budgetId = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT id, "accountCode", period, amount, used FROM budgets WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [budgetId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الميزانية غير موجودة");

    // Refuse delete when the budget has consumed funds — would leave dangling references.
    if (Number(existing.used ?? 0) > 0) {
      throw new ConflictError(
        `لا يمكن حذف ميزانية تم استهلاك جزء منها (المستهلك: ${Number(existing.used).toFixed(2)})`,
        {
          field: "budgetId",
          fix: "قم بأرشفة الميزانية أو صفّر المبلغ بدل حذفها",
          meta: {
            accountCode: existing.accountCode,
            period: existing.period,
            used: Number(existing.used),
          },
        },
      );
    }

    const rows = await rawQuery<any>(
      `UPDATE budgets SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [budgetId, scope.companyId]
    );
    if (rows.length === 0) throw new NotFoundError("الميزانية غير موجودة");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "budget.deleted",
      entity: "budgets",
      entityId: budgetId,
      details: JSON.stringify({ accountCode: existing.accountCode, period: existing.period }),
    }).catch((err) => pushToDLQ("event", { action: "budget.deleted", entityId: budgetId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "delete",
      entity: "budgets",
      entityId: budgetId,
      after: {
        accountCode: existing.accountCode,
        period: existing.period,
        amount: Number(existing.amount),
      },
    }).catch((err) => console.error("[audit] budget.deleted:", err));

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
  // Use rawQuery for DDL: rawExecute would append `RETURNING id` to the
  // CREATE TABLE statement and produce a SQL syntax error. rawQuery
  // passes the statement through verbatim.
  //
  // Phase 9 added updatedAt + deletedAt columns. The CREATE TABLE below
  // includes them so fresh sandboxes created via this helper match the
  // schema produced by migration 074. Existing installs that already
  // have the table get the columns via that migration.
  await rawQuery(`
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
      "updatedAt" TIMESTAMP DEFAULT NOW(),
      "deletedAt" TIMESTAMP,
      "decidedBy" INTEGER,
      "decidedAt" TIMESTAMP,
      "decisionNotes" TEXT
    )
  `);
}

budgetRouter.post("/budget/approval-requests", requirePermission("finance:create"), async (req, res) => {
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
    if (!budget) throw new NotFoundError("لا توجد ميزانية محددة لهذا الحساب");

    const budgetAmount = Number(budget.amount);
    const used = Number(budget.used);
    const utilBefore = budgetAmount > 0 ? (used / budgetAmount) * 100 : 0;
    const utilAfter = budgetAmount > 0 ? ((used + Number(requestedAmount)) / budgetAmount) * 100 : 0;

    let level: string;
    if (utilAfter <= 80) level = "auto";
    else if (utilAfter <= 99) level = "cfo";
    else if (utilAfter <= 110) level = "gm";
    else {
      throw new ConflictError("تجاوز 110% — مرفوض نهائياً ولا يمكن اعتماده", {
        field: "requestedAmount",
        fix: "قلّل المبلغ المطلوب أو زِد سقف الميزانية أولاً",
        meta: { utilizationAfter: roundTo2(utilAfter), capPct: 110 },
      });
    }

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
       budgetAmount, roundTo2(utilBefore), roundTo2(utilAfter),
       level, sourceType ?? null, sourceId ?? null, reason ?? null, scope.activeAssignmentId]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "budget.approval_requested",
      entity: "budget_approval_requests",
      entityId: row.id,
      details: JSON.stringify({ accountCode, period, requestedAmount: Number(requestedAmount), level }),
    }).catch((err) => pushToDLQ("event", { action: "budget.approval_requested", entityId: row.id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "budget_approval_requests",
      entityId: row.id,
      after: { accountCode, period, requestedAmount: Number(requestedAmount), level },
    }).catch((err) => console.error("[audit] budget.approval_requested:", err));

    res.status(201).json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "Create budget approval request error:");
  }
});

budgetRouter.get("/budget/approval-requests", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureBudgetApprovalTable();
    const status = (req.query.status as string) ?? "pending";
    const rows = await rawQuery<any>(
      `SELECT ar.*, coa.name AS "accountName"
       FROM budget_approval_requests ar
       LEFT JOIN chart_of_accounts coa ON coa.code = ar."accountCode" AND coa."companyId" = ar."companyId"
       WHERE ar."companyId"=$1 AND ar.status=$2 AND ar."deletedAt" IS NULL
       ORDER BY ar."requestedAt" DESC LIMIT 200`,
      [scope.companyId, status]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "List budget approvals error:");
  }
});

budgetRouter.post("/budget/approval-requests/:id/decide", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const requestId = Number(req.params.id);
    const { decision, notes } = req.body as any; // decision: 'approved' | 'rejected'
    if (!["approved", "rejected"].includes(decision)) {
      throw new ValidationError("القرار يجب أن يكون approved أو rejected", {
        field: "decision",
        fix: "استخدم approved أو rejected",
      });
    }
    await ensureBudgetApprovalTable();

    // Fetch approval level + context to drive business rules that sit
    // outside the lifecycle engine (approval-level role check + reporting).
    const [request] = await rawQuery<any>(
      `SELECT id, "approvalLevel", "accountCode", period FROM budget_approval_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [requestId, scope.companyId]
    );
    if (!request) throw new NotFoundError("طلب الاعتماد غير موجود");

    // Approval level authorization — cfo-tier requests can be signed by
    // finance/director/owner, gm-tier only by director/owner.
    const needed = request.approvalLevel === "cfo"
      ? ["finance", "director", "owner"]
      : ["director", "owner"];
    if (!needed.includes(scope.role)) {
      throw new ForbiddenError(
        `هذا الطلب يتطلب اعتماد ${request.approvalLevel === "cfo" ? "المدير المالي" : "المدير العام"}`,
        {
          fix: `الأدوار المسموح لها بالبت: ${needed.join(", ")}`,
          meta: { requiredRoles: needed, yourRole: scope.role, approvalLevel: request.approvalLevel },
        },
      );
    }

    // Central lifecycle engine: rejects "already decided" via fromStates and
    // writes the decision atomically along with decidedBy/decidedAt/notes.
    // Phase 9 added the `updatedAt` and `deletedAt` columns to this table,
    // so the engine can now manage the updatedAt clock and we can filter
    // out soft-deleted rows from state transitions.
    const updated = await applyTransition<any>({
      entity: "budget_approval_requests",
      id: requestId,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `budget.approval_${decision}`,
      fromStates: ["pending"],
      toState: decision,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL`,
      setExtras: {
        decisionNotes: notes ?? null,
        decidedBy: scope.activeAssignmentId,
        decidedAt: { raw: "NOW()" },
      },
      after: {
        accountCode: request.accountCode,
        period: request.period,
        level: request.approvalLevel,
      },
    });

    res.json({
      data: updated,
      message: decision === "approved" ? "تم اعتماد الطلب" : "تم رفض الطلب",
      event: `budget.approval_${decision}`,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Decide budget approval error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET VARIANCE REPORT — تقرير الفروقات بين الميزانية والفعلي
// ─────────────────────────────────────────────────────────────────────────────

budgetRouter.get("/budget/variance", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const period = (req.query.period as string) ?? currentPeriod();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("period يجب أن يكون بصيغة YYYY-MM", {
        field: "period",
        fix: "مثال: 2026-04",
      });
    }
    const [y, m] = period.split("-").map(Number);
    const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const periodEnd = toDateISO(new Date(y, m, 0));

    const rows = await rawQuery<any>(
      `SELECT b."accountCode", coa.name AS "accountName", coa.type AS "accountType",
              b.amount AS "budgetAmount",
              COALESCE((
                SELECT SUM(jl.debit - jl.credit)
                FROM journal_lines jl
                JOIN journal_entries je ON je.id = jl."journalId"
                WHERE je."companyId" = b."companyId"
                  AND je."deletedAt" IS NULL
                  AND je.status = 'posted'
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
      const variance = roundTo2(budgetAmount - actualAmount);
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
        actualAmount: roundTo2(actualAmount),
        variance,
        variancePct,
        utilizationPct: budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 10000) / 100 : 0,
        status,
      };
    });

    res.json({
      period,
      totalBudget: roundTo2(totalBudget),
      totalActual: roundTo2(totalActual),
      totalVariance: roundTo2(totalBudget - totalActual),
      lines,
    });
  } catch (err) {
    handleRouteError(err, res, "Budget variance report error:");
  }
});

budgetRouter.get("/budget/:id", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [item] = await rawQuery<any>(
      `SELECT b.*, coa.name AS "accountName"
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
       WHERE b.id = $1 AND b."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الميزانية غير موجودة");
    res.json(item);
  } catch (err) { handleRouteError(err, res, "Get budget detail error:"); }
});

budgetRouter.get("/fiscal-periods", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const thisYear = currentYear();
    const currentMonth = new Date().getMonth() + 1;

    const periods = [];
    for (let m = 1; m <= 12; m++) {
      const period = `${thisYear}-${String(m).padStart(2, "0")}`;
      const [stats] = await rawQuery<any>(
        `SELECT COUNT(*) AS entries,
                COALESCE(SUM(jl.debit), 0) AS "totalDebit"
         FROM journal_entries je
         LEFT JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND to_char(je."createdAt", 'YYYY-MM') = $2`,
        [scope.companyId, period]
      );

      periods.push({
        period,
        name: new Date(thisYear, m - 1).toLocaleDateString("ar-SA", { month: "long", year: "numeric" }),
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

budgetRouter.post("/fiscal-periods/:period/close", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const period = String(req.params.period);

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
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' AND to_char(je."createdAt", 'YYYY-MM') = $2`,
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
