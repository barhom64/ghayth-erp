import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);

reportsRouter.get("/reports/entities/:entityType", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    let rows: any[] = [];
    if (entityType === "client") {
      rows = await rawQuery<any>(`SELECT id, name, phone, email FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name`, [scope.companyId]);
    } else if (entityType === "supplier") {
      rows = await rawQuery<any>(`SELECT id, name, phone, email FROM suppliers WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name`, [scope.companyId]);
    } else if (entityType === "employee") {
      rows = await rawQuery<any>(`SELECT e.id, e.name, e.phone, e.email FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHERE e."deletedAt" IS NULL ORDER BY e.name`, [scope.companyId]);
    }
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Entity list error:");
  }
});

reportsRouter.get("/reports/trial-balance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;
    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    const rows = await rawQuery<any>(
      `SELECT coa.id, coa.code, coa.name, coa.type, coa."parentId", coa.level, coa."allowPosting",
              COALESCE(SUM(fl.debit), 0) AS "totalDebit",
              COALESCE(SUM(fl.credit), 0) AS "totalCredit",
              CASE
                WHEN coa.type IN ('liability','equity','revenue')
                  THEN COALESCE(SUM(fl.credit), 0) - COALESCE(SUM(fl.debit), 0)
                ELSE COALESCE(SUM(fl.debit), 0) - COALESCE(SUM(fl.credit), 0)
              END AS balance
       FROM chart_of_accounts coa
       LEFT JOIN (
         SELECT jl."accountCode", jl.debit, jl.credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       ) fl ON fl."accountCode" = coa.code
       WHERE coa."companyId" = $1 AND coa."deletedAt" IS NULL
       GROUP BY coa.id, coa.code, coa.name, coa.type, coa."parentId", coa.level, coa."allowPosting"
       ORDER BY coa.code`,
      params
    );
    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.totalDebit), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.totalCredit), 0);
    const byType: Record<string, { totalDebit: number; totalCredit: number; balance: number }> = {};
    for (const r of rows) {
      if (!byType[r.type]) byType[r.type] = { totalDebit: 0, totalCredit: 0, balance: 0 };
      byType[r.type].totalDebit += Number(r.totalDebit);
      byType[r.type].totalCredit += Number(r.totalCredit);
      byType[r.type].balance += Number(r.balance);
    }
    res.json({ data: rows, summary: { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 }, byType });
  } catch (err) {
    handleRouteError(err, res, "Trial balance error:");
  }
});

reportsRouter.get("/reports/income-statement", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;
    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    const revenues = await rawQuery<any>(`SELECT coa.code, coa.name, COALESCE(SUM(fl.credit) - SUM(fl.debit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}) fl ON fl."accountCode" = coa.code WHERE coa."companyId" = $1 AND coa.type = 'revenue' AND coa."deletedAt" IS NULL GROUP BY coa.code, coa.name ORDER BY coa.code`, params);
    const expenses = await rawQuery<any>(`SELECT coa.code, coa.name, COALESCE(SUM(fl.debit) - SUM(fl.credit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}) fl ON fl."accountCode" = coa.code WHERE coa."companyId" = $1 AND coa.type = 'expense' AND coa."deletedAt" IS NULL GROUP BY coa.code, coa.name ORDER BY coa.code`, params);
    const totalRevenue = revenues.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ revenues, expenses, summary: { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses } });
  } catch (err) {
    handleRouteError(err, res, "Income statement error:");
  }
});

reportsRouter.get("/reports/balance-sheet", async (req, res) => {
  try {
    const scope = req.scope!;
    const { asOfDate } = req.query as any;
    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (asOfDate) { params.push(asOfDate); dateFilter = ` AND je."createdAt" <= $${params.length}`; }
    const rows = await rawQuery<any>(
      `SELECT coa.code, coa.name, coa.type,
              CASE WHEN coa.type IN ('asset','expense') THEN COALESCE(SUM(fl.debit) - SUM(fl.credit), 0)
                   ELSE COALESCE(SUM(fl.credit) - SUM(fl.debit), 0) END AS balance
       FROM chart_of_accounts coa
       LEFT JOIN (
         SELECT jl."accountCode", jl.debit, jl.credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       ) fl ON fl."accountCode" = coa.code
       WHERE coa."companyId" = $1 AND coa.type IN ('asset','liability','equity') AND coa."deletedAt" IS NULL
       GROUP BY coa.code, coa.name, coa.type ORDER BY coa.type, coa.code`,
      params
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

reportsRouter.get("/reports/cash-flow", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;
    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    const cashAccounts = ["1100", "1110"];
    const cashInflows = await rawQuery<any>(`SELECT je.description, jl.debit AS amount, je."createdAt" AS date FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter} WHERE jl."accountCode" = ANY($${params.length + 1}) AND jl.debit > 0 ORDER BY je."createdAt" DESC LIMIT 50`, [...params, cashAccounts]);
    const cashOutflows = await rawQuery<any>(`SELECT je.description, jl.credit AS amount, je."createdAt" AS date FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter} WHERE jl."accountCode" = ANY($${params.length + 1}) AND jl.credit > 0 ORDER BY je."createdAt" DESC LIMIT 50`, [...params, cashAccounts]);
    const totalInflow = cashInflows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalOutflow = cashOutflows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ inflows: cashInflows, outflows: cashOutflows, summary: { totalInflow, totalOutflow, netCashFlow: totalInflow - totalOutflow } });
  } catch (err) {
    handleRouteError(err, res, "Cash flow error:");
  }
});

reportsRouter.get("/subsidiary-ledger/:entityType/:entityId", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const { startDate, endDate } = req.query as any;
    const id = Number(entityId);

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
      const [emp] = await rawQuery<any>(`SELECT e.id, e.name, ea.id AS "assignmentId" FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHERE e.id = $2 LIMIT 1`, [scope.companyId, id]);
      if (!emp) { res.json({ movements: [], summary: {}, sections: {} }); return; }
      const assignmentId = emp.assignmentId;

      const { filter: prFilter, extraParams: prDates } = buildDateFilter(2, startDate, endDate);
      const payrollRows = await rawQuery<any>(`SELECT pr.id, pr.period AS ref, CONCAT('راتب ', pr.period) AS description, pr."grossSalary" AS debit, 0 AS credit, pr."createdAt" AS date, 'payroll' AS "movementType" FROM payroll_records pr WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${prFilter.replace(/"createdAt"/g, 'pr."createdAt"')} ORDER BY pr."createdAt" DESC`, [assignmentId, scope.companyId, ...prDates]);
      const { filter: advFilter, extraParams: advDates } = buildDateFilter(2, startDate, endDate);
      const advanceRows = await rawQuery<any>(`SELECT je.id, je.ref, CONCAT('سلفة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'advance' AS "movementType" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410' WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 ${advFilter.replace(/"createdAt"/g, 'je."createdAt"')} GROUP BY je.id, je.ref, je.description, je."createdAt"`, [scope.companyId, assignmentId, ...advDates]);
      const { filter: cstFilter, extraParams: cstDates } = buildDateFilter(2, startDate, endDate);
      const custodyRows = await rawQuery<any>(`SELECT je.id, je.ref, CONCAT('عهدة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'custody' AS "movementType" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400' WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 AND je.ref LIKE 'CUSTODY%' ${cstFilter.replace(/"createdAt"/g, 'je."createdAt"')} GROUP BY je.id, je.ref, je.description, je."createdAt"`, [scope.companyId, assignmentId, ...cstDates]);
      const { filter: vioFilter, extraParams: vioDates } = buildDateFilter(1, startDate, endDate);
      const violationRows = await rawQuery<any>(`SELECT v.id, CONCAT('VIO-', v.id::text) AS ref, CONCAT('خصم مخالفة: ', v.description) AS description, 0 AS debit, COALESCE(v.deduction, 0) AS credit, v."createdAt" AS date, 'violation' AS "movementType" FROM employee_violations v WHERE v."assignmentId" = $1 AND v.deduction > 0 ${vioFilter.replace(/"createdAt"/g, 'v."createdAt"')} ORDER BY v."createdAt" DESC`, [assignmentId, ...vioDates]);

      const all = [...payrollRows, ...advanceRows, ...custodyRows, ...violationRows].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let runningBalance = 0;
      movements = all.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });

      const totalPayroll = payrollRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalAdvances = advanceRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalCustodies = custodyRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalDeductions = violationRows.reduce((s: number, r: any) => s + Number(r.credit), 0);

      sections = {
        payroll: { label: "الرواتب", amount: totalPayroll, count: payrollRows.length },
        advances: { label: "السلف", amount: totalAdvances, count: advanceRows.length },
        custodies: { label: "العهد", amount: totalCustodies, count: custodyRows.length },
        violations: { label: "الخصومات", amount: totalDeductions, count: violationRows.length },
      };

    } else if (entityType === "client") {
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const invoiceRows = await rawQuery<any>(`SELECT i.id, i.ref, i.total AS debit, i."paidAmount" AS credit, i."createdAt" AS date, CONCAT('فاتورة ', i.ref) AS description, 'invoice' AS "movementType", i.status FROM invoices i WHERE i."companyId" = $1 AND i."clientId" = $2 AND i."deletedAt" IS NULL ${dateFilter.replace(/"createdAt"/g, 'i."createdAt"')} ORDER BY i."createdAt" ASC`, [scope.companyId, id, ...dateDates]);
      let runningBalance = 0;
      movements = invoiceRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const totalInvoiced = invoiceRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalPaid = invoiceRows.reduce((s: number, r: any) => s + Number(r.credit), 0);
      sections = { invoices: { label: "الفواتير", amount: totalInvoiced, count: invoiceRows.length }, payments: { label: "المدفوعات", amount: totalPaid, count: invoiceRows.filter((r: any) => Number(r.credit) > 0).length } };

    } else if (entityType === "supplier") {
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const poRows = await rawQuery<any>(`SELECT po.id, po.ref, po."totalAmount" AS debit, 0 AS credit, po."createdAt" AS date, CONCAT('أمر شراء ', po.ref) AS description, 'purchase_order' AS "movementType", po.status FROM purchase_orders po WHERE po."companyId" = $1 AND po."supplierId" = $2 ${dateFilter.replace(/"createdAt"/g, 'po."createdAt"')} ORDER BY po."createdAt" ASC`, [scope.companyId, id, ...dateDates]);
      let runningBalance = 0;
      movements = poRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const totalOrdered = poRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      sections = { orders: { label: "أوامر الشراء", amount: totalOrdered, count: poRows.length } };
    }

    const totalDebit = movements.reduce((s: number, m: any) => s + Number(m.debit), 0);
    const totalCredit = movements.reduce((s: number, m: any) => s + Number(m.credit), 0);

    res.json({
      entityType, entityId: id,
      movements,
      summary: { totalDebit, totalCredit, netBalance: totalDebit - totalCredit, transactionCount: movements.length },
      sections,
    });
  } catch (err) {
    handleRouteError(err, res, "Subsidiary ledger error:");
  }
});
