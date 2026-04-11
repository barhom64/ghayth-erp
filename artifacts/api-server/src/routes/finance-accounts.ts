import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createJournalEntry, checkFinancialPeriodOpen } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

export const accountsRouter = Router();
accountsRouter.use(authMiddleware);

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

accountsRouter.get("/chart-of-accounts", async (req, res) => {
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

accountsRouter.get("/accounts", async (req, res) => {
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

accountsRouter.post("/accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["director", "owner"], res)) return;
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

accountsRouter.patch("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["director", "owner"], res)) return;
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

accountsRouter.delete("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["director", "owner"], res)) return;
    const rows = await rawQuery<any>(`DELETE FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (rows.length === 0) { res.status(404).json({ error: "الحساب غير موجود" }); return; }
    res.json({ message: "تم حذف الحساب" });
  } catch (err) { handleRouteError(err, res, "Delete account error:"); }
});

accountsRouter.get("/journal", async (req, res) => {
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

accountsRouter.post("/journal", async (req, res) => {
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

accountsRouter.get("/ledger/:accountCode", async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt",
              jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = $2
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       ORDER BY je."createdAt" ASC`,
      params
    );

    let runningBalance = 0;
    const movements = rows.map((r: any) => {
      runningBalance += Number(r.debit) - Number(r.credit);
      return { ...r, runningBalance };
    });

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.debit), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.credit), 0);

    res.json({ movements, summary: { totalDebit, totalCredit, netBalance: totalDebit - totalCredit, count: movements.length } });
  } catch (err) {
    handleRouteError(err, res, "Ledger error:");
  }
});

accountsRouter.get("/summary", async (req, res) => {
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
