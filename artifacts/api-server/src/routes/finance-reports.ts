import {
  handleRouteError,
  NotFoundError,
  ForbiddenError,
  IntegrationError,
} from "../lib/errorHandler.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// CASH FLOW STATEMENT (قائمة التدفقات النقدية)
// Classifies every JE line that hits a cash/bank account into one of three
// sections using the counter-account type:
//   - Operating : counter-account type = revenue|expense OR AR/AP/inventory/
//                 accrued liabilities (working capital)
//   - Investing : counter-account type = asset AND code starts with 15xx
//                 (fixed assets) or 16xx (investments)
//   - Financing : counter-account type = equity or loans/bonds (code 2500+)
// Returns per-section line items + totals, plus opening/closing cash balance.
// ─────────────────────────────────────────────────────────────────────────────

reportsRouter.get("/reports/cash-flow", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;
    const from = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to = endDate || new Date().toISOString().slice(0, 10);

    // Dynamically discover cash/bank accounts by type+code prefix (11xx or
    // explicit mappings). Fall back to defaults if none found.
    const cashAccountsRows = await rawQuery<any>(
      `SELECT code FROM chart_of_accounts
        WHERE "companyId" = $1 AND type = 'asset'
          AND (code LIKE '11%' OR code IN ('1100','1110','1120','1130'))
          AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const cashCodes = cashAccountsRows.length > 0
      ? cashAccountsRows.map((r: any) => r.code)
      : ["1100", "1110"];

    // Opening cash balance = sum of all cash JL before startDate
    const [openingRow] = await rawQuery<any>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."createdAt" < $2
          AND jl."accountCode" = ANY($3)`,
      [scope.companyId, from, cashCodes]
    );
    const openingCash = Number(openingRow?.balance ?? 0);

    // Pull all JEs touching cash during the period and join to their
    // counter-account (any line in the same JE not pointing to cash) to infer
    // the classification. Simple heuristic: take the largest non-cash line as
    // the dominant counter-account.
    const jes = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt",
              jl_cash.debit AS "cashDebit", jl_cash.credit AS "cashCredit"
         FROM journal_entries je
         JOIN journal_lines jl_cash ON jl_cash."journalId" = je.id
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
          AND je."createdAt" >= $2 AND je."createdAt" <= $3
          AND jl_cash."accountCode" = ANY($4)
          AND (jl_cash.debit > 0 OR jl_cash.credit > 0)
        ORDER BY je."createdAt"`,
      [scope.companyId, from, to, cashCodes]
    );

    const jeIds = jes.map((j: any) => j.id);
    let counterLines: any[] = [];
    if (jeIds.length > 0) {
      counterLines = await rawQuery<any>(
        `SELECT jl."journalId", jl."accountCode", jl.debit, jl.credit,
                coa.type, coa.code, coa.name
           FROM journal_lines jl
           LEFT JOIN chart_of_accounts coa
                  ON coa.code = jl."accountCode" AND coa."companyId" = $1
          WHERE jl."journalId" = ANY($2)
            AND NOT (jl."accountCode" = ANY($3))`,
        [scope.companyId, jeIds, cashCodes]
      );
    }

    const counterByJe = new Map<number, any[]>();
    for (const l of counterLines) {
      if (!counterByJe.has(l.journalId)) counterByJe.set(l.journalId, []);
      counterByJe.get(l.journalId)!.push(l);
    }

    function classify(counterLine: any): "operating" | "investing" | "financing" {
      if (!counterLine) return "operating";
      const code = String(counterLine.code ?? counterLine.accountCode ?? "");
      const type = counterLine.type;
      // Financing: equity, long-term debt
      if (type === "equity") return "financing";
      if (/^25/.test(code) || /^27/.test(code)) return "financing"; // long-term loans / bonds
      // Investing: fixed assets, investments
      if (type === "asset" && (/^15/.test(code) || /^16/.test(code) || /^17/.test(code))) return "investing";
      // Everything else (revenue, expense, AR, AP, inventory, short-term liab,
      // VAT, prepayments) → operating
      return "operating";
    }

    type Section = { inflows: number; outflows: number; items: any[] };
    const sections: Record<"operating" | "investing" | "financing", Section> = {
      operating: { inflows: 0, outflows: 0, items: [] },
      investing: { inflows: 0, outflows: 0, items: [] },
      financing: { inflows: 0, outflows: 0, items: [] },
    };

    for (const je of jes) {
      const lines = counterByJe.get(je.id) ?? [];
      // Pick largest non-cash line as counter account
      const dominant = lines.reduce((max: any, l: any) => {
        const amt = Math.max(Number(l.debit), Number(l.credit));
        const maxAmt = max ? Math.max(Number(max.debit), Number(max.credit)) : 0;
        return amt > maxAmt ? l : max;
      }, null as any);
      const section = classify(dominant);
      const inflow = Number(je.cashDebit) || 0;
      const outflow = Number(je.cashCredit) || 0;
      sections[section].inflows += inflow;
      sections[section].outflows += outflow;
      sections[section].items.push({
        id: je.id,
        ref: je.ref,
        description: je.description,
        date: je.createdAt,
        inflow,
        outflow,
        counterAccount: dominant ? `${dominant.code} — ${dominant.name ?? ""}` : null,
        counterType: dominant?.type ?? null,
      });
    }

    const operating = sections.operating.inflows - sections.operating.outflows;
    const investing = sections.investing.inflows - sections.investing.outflows;
    const financing = sections.financing.inflows - sections.financing.outflows;
    const netChange = operating + investing + financing;
    const closingCash = openingCash + netChange;

    res.json({
      period: { from, to },
      openingCash: Math.round(openingCash * 100) / 100,
      closingCash: Math.round(closingCash * 100) / 100,
      sections: {
        operating: {
          inflows: Math.round(sections.operating.inflows * 100) / 100,
          outflows: Math.round(sections.operating.outflows * 100) / 100,
          net: Math.round(operating * 100) / 100,
          items: sections.operating.items,
        },
        investing: {
          inflows: Math.round(sections.investing.inflows * 100) / 100,
          outflows: Math.round(sections.investing.outflows * 100) / 100,
          net: Math.round(investing * 100) / 100,
          items: sections.investing.items,
        },
        financing: {
          inflows: Math.round(sections.financing.inflows * 100) / 100,
          outflows: Math.round(sections.financing.outflows * 100) / 100,
          net: Math.round(financing * 100) / 100,
          items: sections.financing.items,
        },
      },
      netChange: Math.round(netChange * 100) / 100,
      summary: {
        totalInflow: Math.round((sections.operating.inflows + sections.investing.inflows + sections.financing.inflows) * 100) / 100,
        totalOutflow: Math.round((sections.operating.outflows + sections.investing.outflows + sections.financing.outflows) * 100) / 100,
        netCashFlow: Math.round(netChange * 100) / 100,
      },
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// Customer Statement (كشف حساب عميل)
// Returns: opening balance, invoice + payment movements in period, running
// balance, aging buckets (0-30, 31-60, 61-90, 90+), and ending balance.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get("/reports/customer-statement/:clientId", async (req, res) => {
  try {
    const scope = req.scope!;
    const clientId = Number(req.params.clientId);
    const { startDate, endDate } = req.query as any;
    const asOf = endDate || new Date().toISOString().slice(0, 10);
    const from = startDate || "1900-01-01";

    const [client] = await rawQuery<any>(
      `SELECT id, name, phone, email, "vatNumber" FROM clients WHERE id = $1 AND "companyId" = $2`,
      [clientId, scope.companyId]
    );
    if (!client) { throw new NotFoundError("العميل غير موجود"); return; }

    // Opening balance = invoices before startDate - payments before startDate
    const [openingRow] = await rawQuery<any>(
      `SELECT COALESCE(
         (SELECT SUM(total) FROM invoices
           WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND "createdAt" < $3), 0
       ) - COALESCE(
         (SELECT SUM(amount) FROM invoice_payments
           WHERE "clientId"=$1 AND "companyId"=$2 AND "paidAt" < $3), 0
       ) AS opening`,
      [clientId, scope.companyId, from]
    );
    const openingBalance = Number(openingRow?.opening ?? 0);

    // In-period invoices
    const invoices = await rawQuery<any>(
      `SELECT id, ref, "createdAt" AS date, total AS debit, 0 AS credit,
              "dueDate", status, 'invoice' AS "movementType",
              CONCAT('فاتورة ', ref) AS description
         FROM invoices
        WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL
          AND "createdAt" >= $3 AND "createdAt" <= $4
        ORDER BY "createdAt"`,
      [clientId, scope.companyId, from, asOf]
    );
    // In-period payments
    const payments = await rawQuery<any>(
      `SELECT ip.id, COALESCE(ip."transactionRef", CONCAT('PAY-', ip.id)) AS ref,
              ip."paidAt" AS date, 0 AS debit, ip.amount AS credit,
              NULL AS "dueDate", 'paid' AS status, 'payment' AS "movementType",
              CONCAT('دفعة (', COALESCE(ip.method,'manual'), ')') AS description
         FROM invoice_payments ip
        WHERE ip."clientId"=$1 AND ip."companyId"=$2
          AND ip."paidAt" >= $3 AND ip."paidAt" <= $4
        ORDER BY ip."paidAt"`,
      [clientId, scope.companyId, from, asOf]
    );

    const all = [...invoices, ...payments].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let running = openingBalance;
    const movements = all.map((m: any) => {
      running += Number(m.debit) - Number(m.credit);
      return { ...m, runningBalance: Math.round(running * 100) / 100 };
    });

    // Aging of OPEN invoices as of asOf (based on dueDate or invoice date +30)
    const openInvoices = await rawQuery<any>(
      `SELECT id, ref, "createdAt", "dueDate", total, "paidAmount",
              (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL
          AND "createdAt" <= $3
          AND (total - COALESCE("paidAmount",0)) > 0.01`,
      [clientId, scope.companyId, asOf]
    );
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const asOfMs = new Date(asOf).getTime();
    for (const inv of openInvoices) {
      const due = inv.dueDate ? new Date(inv.dueDate).getTime()
        : new Date(inv.createdAt).getTime() + 30 * 86400000;
      const daysOverdue = Math.floor((asOfMs - due) / 86400000);
      const amt = Number(inv.outstanding);
      if (daysOverdue <= 0) buckets.current += amt;
      else if (daysOverdue <= 30) buckets.d30 += amt;
      else if (daysOverdue <= 60) buckets.d60 += amt;
      else if (daysOverdue <= 90) buckets.d90 += amt;
      else buckets.d90plus += amt;
    }

    const totalDebit = movements.reduce((s, m) => s + Number(m.debit), 0);
    const totalCredit = movements.reduce((s, m) => s + Number(m.credit), 0);
    const endingBalance = Math.round((openingBalance + totalDebit - totalCredit) * 100) / 100;

    res.json({
      client,
      period: { from, to: asOf },
      openingBalance: Math.round(openingBalance * 100) / 100,
      movements,
      endingBalance,
      totals: {
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100,
        movementCount: movements.length,
      },
      aging: {
        current: Math.round(buckets.current * 100) / 100,
        "1-30": Math.round(buckets.d30 * 100) / 100,
        "31-60": Math.round(buckets.d60 * 100) / 100,
        "61-90": Math.round(buckets.d90 * 100) / 100,
        "90+": Math.round(buckets.d90plus * 100) / 100,
        total: Math.round(
          (buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus) * 100
        ) / 100,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Customer statement error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Vendor Statement (كشف حساب مورد)
// Returns: opening balance, PO/invoice + scheduled-payment movements, running
// balance, aging buckets on unpaid POs, and ending balance.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get("/reports/vendor-statement/:supplierId", async (req, res) => {
  try {
    const scope = req.scope!;
    const supplierId = Number(req.params.supplierId);
    const { startDate, endDate } = req.query as any;
    const asOf = endDate || new Date().toISOString().slice(0, 10);
    const from = startDate || "1900-01-01";

    const [supplier] = await rawQuery<any>(
      `SELECT id, name, phone, email, "taxNumber" FROM suppliers WHERE id = $1 AND "companyId" = $2`,
      [supplierId, scope.companyId]
    );
    if (!supplier) { throw new NotFoundError("المورد غير موجود"); return; }

    // Opening balance = POs matched/received before startDate - payments posted
    // before startDate. Uses purchase_orders as the AP proxy since we lack a
    // dedicated vendor_bills table today.
    const [openingRow] = await rawQuery<any>(
      `SELECT COALESCE(
         (SELECT SUM("totalAmount") FROM purchase_orders
           WHERE "supplierId"=$1 AND "companyId"=$2
             AND status IN ('received','partially_received','invoice_matched','payment_scheduled','paid','completed')
             AND "createdAt" < $3), 0
       ) AS opening`,
      [supplierId, scope.companyId, from]
    );
    const openingBalance = Number(openingRow?.opening ?? 0);

    const pos = await rawQuery<any>(
      `SELECT id, ref, "createdAt" AS date, 0 AS debit, "totalAmount" AS credit,
              "expectedDelivery" AS "dueDate", status, 'purchase_order' AS "movementType",
              CONCAT('أمر شراء ', ref) AS description
         FROM purchase_orders
        WHERE "supplierId"=$1 AND "companyId"=$2
          AND "createdAt" >= $3 AND "createdAt" <= $4
        ORDER BY "createdAt"`,
      [supplierId, scope.companyId, from, asOf]
    );

    let running = openingBalance;
    const movements = pos.map((m: any) => {
      running += Number(m.debit) - Number(m.credit);
      return { ...m, runningBalance: Math.round(running * 100) / 100 };
    });

    // Aging of open POs
    const openPos = await rawQuery<any>(
      `SELECT id, ref, "createdAt", "expectedDelivery", "totalAmount"
         FROM purchase_orders
        WHERE "supplierId"=$1 AND "companyId"=$2
          AND status NOT IN ('paid','completed','cancelled','rejected')
          AND "createdAt" <= $3`,
      [supplierId, scope.companyId, asOf]
    );
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const asOfMs = new Date(asOf).getTime();
    for (const po of openPos) {
      const due = po.expectedDelivery ? new Date(po.expectedDelivery).getTime()
        : new Date(po.createdAt).getTime() + 30 * 86400000;
      const daysOverdue = Math.floor((asOfMs - due) / 86400000);
      const amt = Number(po.totalAmount);
      if (daysOverdue <= 0) buckets.current += amt;
      else if (daysOverdue <= 30) buckets.d30 += amt;
      else if (daysOverdue <= 60) buckets.d60 += amt;
      else if (daysOverdue <= 90) buckets.d90 += amt;
      else buckets.d90plus += amt;
    }

    const totalDebit = movements.reduce((s, m) => s + Number(m.debit), 0);
    const totalCredit = movements.reduce((s, m) => s + Number(m.credit), 0);
    const endingBalance = Math.round((openingBalance + totalDebit - totalCredit) * 100) / 100;

    res.json({
      supplier,
      period: { from, to: asOf },
      openingBalance: Math.round(openingBalance * 100) / 100,
      movements,
      endingBalance,
      totals: {
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100,
        movementCount: movements.length,
      },
      aging: {
        current: Math.round(buckets.current * 100) / 100,
        "1-30": Math.round(buckets.d30 * 100) / 100,
        "31-60": Math.round(buckets.d60 * 100) / 100,
        "61-90": Math.round(buckets.d90 * 100) / 100,
        "90+": Math.round(buckets.d90plus * 100) / 100,
        total: Math.round(
          (buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus) * 100
        ) / 100,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Vendor statement error:");
  }
});
