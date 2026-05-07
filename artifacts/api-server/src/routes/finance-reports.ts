import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  parseId,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { currentPeriod, currentYear, toDateISO, todayISO, roundTo2 } from "../lib/businessHelpers.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);

reportsRouter.get("/reports/entities/:entityType", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    let rows: any[] = [];
    if (entityType === "client") {
      rows = await rawQuery<any>(`SELECT id, name, phone, email FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    } else if (entityType === "supplier") {
      rows = await rawQuery<any>(`SELECT id, name, phone, email FROM suppliers WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    } else if (entityType === "employee") {
      rows = await rawQuery<any>(`SELECT e.id, e.name, e.phone, e.email FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHERE e."deletedAt" IS NULL ORDER BY e.name LIMIT 500`, [scope.companyId]);
    }
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Entity list error:");
  }
});

reportsRouter.get("/reports/trial-balance", requirePermission("finance:read"), async (req, res) => {
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
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
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

reportsRouter.get("/reports/income-statement", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;
    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    const revenues = await rawQuery<any>(`SELECT coa.code, coa.name, COALESCE(SUM(fl.credit) - SUM(fl.debit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}) fl ON fl."accountCode" = coa.code WHERE coa."companyId" = $1 AND coa.type = 'revenue' AND coa."deletedAt" IS NULL GROUP BY coa.code, coa.name ORDER BY coa.code LIMIT 500`, params);
    const expenses = await rawQuery<any>(`SELECT coa.code, coa.name, COALESCE(SUM(fl.debit) - SUM(fl.credit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}) fl ON fl."accountCode" = coa.code WHERE coa."companyId" = $1 AND coa.type = 'expense' AND coa."deletedAt" IS NULL GROUP BY coa.code, coa.name ORDER BY coa.code LIMIT 500`, params);
    const totalRevenue = revenues.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ revenues, expenses, summary: { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses } });
  } catch (err) {
    handleRouteError(err, res, "Income statement error:");
  }
});

reportsRouter.get("/reports/balance-sheet", requirePermission("finance:read"), async (req, res) => {
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
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
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

reportsRouter.get("/reports/cash-flow", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as any;
    const from = startDate || toDateISO(new Date(currentYear(), 0, 1));
    const to = endDate || todayISO();

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
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted'
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
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted'
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
      openingCash: roundTo2(openingCash),
      closingCash: roundTo2(closingCash),
      sections: {
        operating: {
          inflows: roundTo2(sections.operating.inflows),
          outflows: roundTo2(sections.operating.outflows),
          net: roundTo2(operating),
          items: sections.operating.items,
        },
        investing: {
          inflows: roundTo2(sections.investing.inflows),
          outflows: roundTo2(sections.investing.outflows),
          net: roundTo2(investing),
          items: sections.investing.items,
        },
        financing: {
          inflows: roundTo2(sections.financing.inflows),
          outflows: roundTo2(sections.financing.outflows),
          net: roundTo2(financing),
          items: sections.financing.items,
        },
      },
      netChange: roundTo2(netChange),
      summary: {
        totalInflow: roundTo2(sections.operating.inflows + sections.investing.inflows + sections.financing.inflows),
        totalOutflow: roundTo2(sections.operating.outflows + sections.investing.outflows + sections.financing.outflows),
        netCashFlow: roundTo2(netChange),
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Cash flow error:");
  }
});

reportsRouter.get("/subsidiary-ledger/:entityType/:entityId", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const { startDate, endDate } = req.query as any;
    const id = parseId(req.params.entityId, "entityId");

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
      const payrollRows = await rawQuery<any>(`SELECT pr.id, pr.period AS ref, CONCAT('راتب ', pr.period) AS description, pr."grossSalary" AS debit, 0 AS credit, pr."createdAt" AS date, 'payroll' AS "movementType" FROM payroll_records pr WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${prFilter.replace(/"createdAt"/g, 'pr."createdAt"')} ORDER BY pr."createdAt" DESC LIMIT 500`, [assignmentId, scope.companyId, ...prDates]);
      const { filter: advFilter, extraParams: advDates } = buildDateFilter(2, startDate, endDate);
      const advanceRows = await rawQuery<any>(`SELECT je.id, je.ref, CONCAT('سلفة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'advance' AS "movementType" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410' WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 ${advFilter.replace(/"createdAt"/g, 'je."createdAt"')} GROUP BY je.id, je.ref, je.description, je."createdAt" LIMIT 500`, [scope.companyId, assignmentId, ...advDates]);
      const { filter: cstFilter, extraParams: cstDates } = buildDateFilter(2, startDate, endDate);
      const custodyRows = await rawQuery<any>(`SELECT je.id, je.ref, CONCAT('عهدة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'custody' AS "movementType" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400' WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 AND je.ref LIKE 'CUSTODY%' ${cstFilter.replace(/"createdAt"/g, 'je."createdAt"')} GROUP BY je.id, je.ref, je.description, je."createdAt" LIMIT 500`, [scope.companyId, assignmentId, ...cstDates]);
      const { filter: vioFilter, extraParams: vioDates } = buildDateFilter(1, startDate, endDate);
      const violationRows = await rawQuery<any>(`SELECT v.id, CONCAT('VIO-', v.id::text) AS ref, CONCAT('خصم مخالفة: ', v.description) AS description, 0 AS debit, COALESCE(v.deduction, 0) AS credit, v."createdAt" AS date, 'violation' AS "movementType" FROM employee_violations v WHERE v."assignmentId" = $1 AND v.deduction > 0 ${vioFilter.replace(/"createdAt"/g, 'v."createdAt"')} ORDER BY v."createdAt" DESC LIMIT 500`, [assignmentId, ...vioDates]);

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
      const invoiceRows = await rawQuery<any>(`SELECT i.id, i.ref, i.total AS debit, i."paidAmount" AS credit, i."createdAt" AS date, CONCAT('فاتورة ', i.ref) AS description, 'invoice' AS "movementType", i.status FROM invoices i WHERE i."companyId" = $1 AND i."clientId" = $2 AND i."deletedAt" IS NULL ${dateFilter.replace(/"createdAt"/g, 'i."createdAt"')} ORDER BY i."createdAt" ASC LIMIT 500`, [scope.companyId, id, ...dateDates]);
      let runningBalance = 0;
      movements = invoiceRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const totalInvoiced = invoiceRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      const totalPaid = invoiceRows.reduce((s: number, r: any) => s + Number(r.credit), 0);
      sections = { invoices: { label: "الفواتير", amount: totalInvoiced, count: invoiceRows.length }, payments: { label: "المدفوعات", amount: totalPaid, count: invoiceRows.filter((r: any) => Number(r.credit) > 0).length } };

    } else if (entityType === "supplier") {
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const poRows = await rawQuery<any>(`SELECT po.id, po.ref, po."totalAmount" AS debit, 0 AS credit, po."createdAt" AS date, CONCAT('أمر شراء ', po.ref) AS description, 'purchase_order' AS "movementType", po.status FROM purchase_orders po WHERE po."companyId" = $1 AND po."supplierId" = $2 AND po."deletedAt" IS NULL ${dateFilter.replace(/"createdAt"/g, 'po."createdAt"')} ORDER BY po."createdAt" ASC LIMIT 500`, [scope.companyId, id, ...dateDates]);
      let runningBalance = 0;
      movements = poRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const totalOrdered = poRows.reduce((s: number, r: any) => s + Number(r.debit), 0);
      sections = { orders: { label: "أوامر الشراء", amount: totalOrdered, count: poRows.length } };

    } else if (entityType === "vehicle" || entityType === "property" || entityType === "project" || entityType === "product") {
      const colFilterMap: Record<string, string> = {
        vehicle: 'jl."vehicleId"',
        property: 'jl."propertyId"',
        project: 'jl."projectId"',
        product: 'jl."productId"',
      };
      const colFilter = colFilterMap[entityType];
      if (!colFilter) throw new ValidationError("نوع الكيان غير مدعوم");
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const journalRows = await rawQuery<any>(
        `SELECT je.id, je.ref, je.description, je."createdAt" AS date, je.type AS "movementType",
                COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND ${colFilter} = $2
         ${dateFilter.replace(/"createdAt"/g, 'je."createdAt"')}
         GROUP BY je.id, je.ref, je.description, je."createdAt", je.type
         ORDER BY je."createdAt" ASC`,
        [scope.companyId, id, ...dateDates]
      );
      let runningBalance = 0;
      movements = journalRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const typeGroups: Record<string, { label: string; amount: number; count: number }> = {};
      for (const m of journalRows) {
        const t = m.movementType || "other";
        if (!typeGroups[t]) typeGroups[t] = { label: t, amount: 0, count: 0 };
        typeGroups[t].amount += Number(m.debit) - Number(m.credit);
        typeGroups[t].count++;
      }
      sections = typeGroups;
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
reportsRouter.get("/reports/customer-statement/:clientId", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const clientId = parseId(req.params.clientId, "clientId");
    const { startDate, endDate } = req.query as any;
    const asOf = endDate || todayISO();
    const from = startDate || "1900-01-01";

    const [client] = await rawQuery<any>(
      `SELECT id, name, phone, email, "vatNumber" FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
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
      return { ...m, runningBalance: roundTo2(running) };
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
    const endingBalance = roundTo2(openingBalance + totalDebit - totalCredit);

    res.json({
      client,
      period: { from, to: asOf },
      openingBalance: roundTo2(openingBalance),
      movements,
      endingBalance,
      totals: {
        totalDebit: roundTo2(totalDebit),
        totalCredit: roundTo2(totalCredit),
        movementCount: movements.length,
      },
      aging: {
        current: roundTo2(buckets.current),
        "1-30": roundTo2(buckets.d30),
        "31-60": roundTo2(buckets.d60),
        "61-90": roundTo2(buckets.d90),
        "90+": roundTo2(buckets.d90plus),
        total: roundTo2(
          (buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus)),
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
reportsRouter.get("/reports/vendor-statement/:supplierId", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const supplierId = parseId(req.params.supplierId, "supplierId");
    const { startDate, endDate } = req.query as any;
    const asOf = endDate || todayISO();
    const from = startDate || "1900-01-01";

    const [supplier] = await rawQuery<any>(
      `SELECT id, name, phone, email, "taxNumber" FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
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
             AND "deletedAt" IS NULL
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
          AND "deletedAt" IS NULL
          AND "createdAt" >= $3 AND "createdAt" <= $4
        ORDER BY "createdAt"`,
      [supplierId, scope.companyId, from, asOf]
    );

    let running = openingBalance;
    const movements = pos.map((m: any) => {
      running += Number(m.debit) - Number(m.credit);
      return { ...m, runningBalance: roundTo2(running) };
    });

    // Aging of open POs
    const openPos = await rawQuery<any>(
      `SELECT id, ref, "createdAt", "expectedDelivery", "totalAmount"
         FROM purchase_orders
        WHERE "supplierId"=$1 AND "companyId"=$2
          AND "deletedAt" IS NULL
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
    const endingBalance = roundTo2(openingBalance + totalDebit - totalCredit);

    res.json({
      supplier,
      period: { from, to: asOf },
      openingBalance: roundTo2(openingBalance),
      movements,
      endingBalance,
      totals: {
        totalDebit: roundTo2(totalDebit),
        totalCredit: roundTo2(totalCredit),
        movementCount: movements.length,
      },
      aging: {
        current: roundTo2(buckets.current),
        "1-30": roundTo2(buckets.d30),
        "31-60": roundTo2(buckets.d60),
        "61-90": roundTo2(buckets.d90),
        "90+": roundTo2(buckets.d90plus),
        total: roundTo2(
          (buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus)),
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Vendor statement error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.1 — migrated from finance.ts (canonical ownership consolidation)
// ─────────────────────────────────────────────────────────────────────────────

reportsRouter.get("/reports/entity-statement", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, startDate, endDate } = req.query as any;

    let rows: any[] = [];
    let entityName = "";

    if (entityType === "employee" && entityId) {
      const [emp] = await rawQuery<any>(
        `SELECT e.name, ea.id AS aid FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
         WHERE e.id = $2 LIMIT 1`,
        [scope.companyId, (Number(entityId) || 0)]
      );
      entityName = emp?.name || "";
      const aid = emp?.aid;
      if (aid) {
        const qParams: any[] = [aid, scope.companyId];
        let dateFilter = "";
        if (startDate) { qParams.push(startDate); dateFilter += ` AND pr."createdAt" >= $${qParams.length}`; }
        if (endDate) { qParams.push(endDate); dateFilter += ` AND pr."createdAt" <= $${qParams.length}`; }
        rows = await rawQuery<any>(
          `SELECT pr.period AS ref, CONCAT('راتب ', pr.period) AS description,
                  pr."grossSalary" AS debit, pr.deductions AS credit,
                  pr."netSalary" AS net, pr."createdAt" AS date, 'payroll' AS type
           FROM payroll_records pr
           WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${dateFilter}
           ORDER BY pr."createdAt" DESC LIMIT 100`,
          qParams
        );
      }
    } else if (entityType === "client" && entityId) {
      const [cl] = await rawQuery<any>(`SELECT name FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [(Number(entityId) || 0), scope.companyId]);
      entityName = cl?.name || "";
      const qParams: any[] = [(Number(entityId) || 0), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND i."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND i."createdAt" <= $${qParams.length}`; }
      rows = await rawQuery<any>(
        `SELECT i.ref, COALESCE(i.description, i.ref) AS description,
                i.total AS debit, i."paidAmount" AS credit,
                (i.total - i."paidAmount") AS net,
                i."createdAt" AS date, i.status AS type
         FROM invoices i WHERE i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL ${dateFilter}
         ORDER BY i."createdAt" DESC LIMIT 100`,
        qParams
      );
    } else if (entityType === "supplier" && entityId) {
      const [sup] = await rawQuery<any>(`SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [(Number(entityId) || 0), scope.companyId]);
      entityName = sup?.name || "";
      const qParams: any[] = [(Number(entityId) || 0), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND po."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND po."createdAt" <= $${qParams.length}`; }
      rows = await rawQuery<any>(
        `SELECT po.ref, CONCAT('أمر شراء: ', po.ref) AS description,
                po."totalAmount" AS debit, 0 AS credit,
                po."totalAmount" AS net,
                po."createdAt" AS date, po.status AS type
         FROM purchase_orders po WHERE po."supplierId" = $1 AND po."companyId" = $2 AND po."deletedAt" IS NULL ${dateFilter}
         ORDER BY po."createdAt" DESC LIMIT 100`,
        qParams
      );
    }

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);

    res.json({ entityName, entityType, rows, summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "Entity statement error:");
  }
});

reportsRouter.get("/reports/custody-advances", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const custodies = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status,
              e.name AS "employeeName", 'custody' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, e.name
       ORDER BY je."createdAt" DESC
       LIMIT 500`,
      params
    );

    const advances = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status,
              e.name AS "employeeName", 'advance' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'ADV%' ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, e.name
       ORDER BY je."createdAt" DESC
       LIMIT 500`,
      params
    );

    const totalCustodies = custodies.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalAdvances = advances.reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({
      custodies, advances,
      summary: {
        totalCustodies, custodyCount: custodies.length,
        totalAdvances, advanceCount: advances.length,
        total: totalCustodies + totalAdvances,
      }
    });
  } catch (err) {
    handleRouteError(err, res, "Custody advances report error:");
  }
});

reportsRouter.get("/reports/expenses-analysis", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId, departmentId, projectId, costCenterId, groupBy = "account" } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }
    if (projectId) { params.push(projectId); dateFilter += ` AND je."projectId" = $${params.length}`; }

    let selectCol = "coa.code AS key, coa.name AS label";
    let groupCol = "coa.code, coa.name";
    if (groupBy === "branch") {
      selectCol = "b.id AS key, COALESCE(b.name, 'غير محدد') AS label";
      groupCol = "b.id, b.name";
    } else if (groupBy === "employee") {
      selectCol = "e.id AS key, COALESCE(e.name, 'غير محدد') AS label";
      groupCol = "e.id, e.name";
    }

    const rows = await rawQuery<any>(
      `SELECT ${selectCol},
              COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'expense'
       LEFT JOIN branches b ON b.id = je."branchId"
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE jl.debit > jl.credit
       GROUP BY ${groupCol}
       ORDER BY amount DESC
       LIMIT 500`,
      params
    );

    const total = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { total, count: rows.length, groupBy } });
  } catch (err) {
    handleRouteError(err, res, "Expenses analysis error:");
  }
});

reportsRouter.get("/reports/revenue-analysis", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const byAccount = await rawQuery<any>(
      `SELECT coa.code, coa.name,
              COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'revenue'
       GROUP BY coa.code, coa.name
       ORDER BY amount DESC
       LIMIT 500`,
      params
    );

    const byMonth = await rawQuery<any>(
      `SELECT to_char(i."createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM(i."paidAmount"), 0) AS collected,
              COALESCE(SUM(i.total), 0) AS invoiced,
              COUNT(*) AS "invoiceCount"
       FROM invoices i
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${dateFilter.replace(/je\./g, 'i.')}
       GROUP BY to_char(i."createdAt", 'YYYY-MM')
       ORDER BY period ASC
       LIMIT 500`,
      params
    );

    const totalRevenue = byAccount.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ byAccount, byMonth, summary: { totalRevenue, accountCount: byAccount.length } });
  } catch (err) {
    handleRouteError(err, res, "Revenue analysis error:");
  }
});

reportsRouter.get("/reports/budget-variance", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period, branchId } = req.query as any;

    const targetPeriod = period || currentPeriod();
    const params: any[] = [scope.companyId, targetPeriod];
    const branchFilter = branchId ? ` AND b."branchId" = $${params.length + 1}` : "";
    if (branchId) params.push(branchId);

    const rows = await rawQuery<any>(
      `SELECT b."accountCode", b.amount AS budget,
              coa.name AS "accountName", coa.type,
              COALESCE(b.used, 0) AS actual,
              b.amount - COALESCE(b.used, 0) AS variance,
              CASE WHEN b.amount > 0 THEN ROUND(COALESCE(b.used, 0)::numeric / b.amount * 100, 1) ELSE 0 END AS "usagePct"
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = $1
       WHERE b."companyId" = $1 AND b."deletedAt" IS NULL AND b.period = $2 ${branchFilter}
       ORDER BY b."accountCode"
       LIMIT 500`,
      params
    );

    const totalBudget = rows.reduce((s: number, r: any) => s + Number(r.budget || 0), 0);
    const totalActual = rows.reduce((s: number, r: any) => s + Number(r.actual || 0), 0);
    const totalVariance = totalBudget - totalActual;

    res.json({ data: rows, summary: { totalBudget, totalActual, totalVariance, period: targetPeriod } });
  } catch (err) {
    handleRouteError(err, res, "Budget variance error:");
  }
});

reportsRouter.get("/reports/cash-bank-statement", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, accountCode = "1100", branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const [accountInfo] = await rawQuery<any>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`,
      [scope.companyId, accountCode]
    );

    const entries = await rawQuery<any>(
      `SELECT jl.id, je.ref, je.description,
              jl.debit, jl.credit, je."createdAt" AS date,
              b.name AS "branchName"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
       LEFT JOIN branches b ON b.id = je."branchId"
       WHERE jl."accountCode" = $2
       ORDER BY je."createdAt" ASC
       LIMIT 500`,
      params
    );

    let runningBalance = 0;
    const enriched = entries.map((e: any) => {
      runningBalance += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance };
    });

    const totalDebit = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
    const totalCredit = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);

    res.json({
      account: accountInfo,
      entries: enriched,
      summary: { totalDebit, totalCredit, closingBalance: runningBalance, count: entries.length }
    });
  } catch (err) {
    handleRouteError(err, res, "Cash bank statement error:");
  }
});

