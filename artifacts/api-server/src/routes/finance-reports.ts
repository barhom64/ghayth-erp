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
import type { RequestScope } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { currentPeriod, currentYear, toDateISO, todayISO, roundTo2, auditFromRequest } from "../lib/businessHelpers.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);
// GAP_MATRIX P1 — every finance report GET must leave an audit trail (PDPL / forensics).
// Runs on res.finish so the audit happens after the response is sent, never blocking the caller.
reportsRouter.use((req, res, next) => {
  if (req.method === "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) {
        auditFromRequest(req, "finance.reports.read", "finance_reports", 0, {
          after: { path: req.path, query: req.query },
        });
      }
    });
  }
  next();
});

/**
 * Builds a branch restriction SQL condition for queries joining `journal_entries`
 * (or another table aliased via `alias`).
 * - If the caller supplies a `branchId` query param, validates it is within the
 *   caller's `allowedBranches` for non-privileged users and returns an equality condition.
 * - If no `branchId` is given and the caller is branch-scoped (not owner/GM),
 *   restricts the query to `scope.allowedBranches` automatically.
 * - Owner/GM pass through without any branch restriction.
 * Mutates `params` by appending the branch value when a condition is needed.
 */
function getBranchCondition(
  scope: RequestScope,
  requestedBranchId: string | undefined,
  params: unknown[],
  alias = "je"
): string {
  const col = `${alias}."branchId"`;
  const isPrivileged = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);

  if (requestedBranchId != null) {
    const bid = Number(requestedBranchId);
    if (isNaN(bid)) throw new ValidationError("معرف الفرع غير صالح");
    if (!isPrivileged && scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(bid)) {
      throw new ForbiddenError("لا تملك صلاحية الاطلاع على بيانات هذا الفرع");
    }
    params.push(bid);
    return ` AND ${col} = $${params.length}`;
  }

  if (!isPrivileged && scope.allowedBranches.length > 0) {
    params.push(scope.allowedBranches);
    return ` AND ${col} = ANY($${params.length}::int[])`;
  }

  return "";
}

reportsRouter.get("/reports/entities/:entityType", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const isPrivEL = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    const elBranchIds = !isPrivEL && scope.allowedBranches.length > 0 ? scope.allowedBranches : null;
    let rows: any[] = [];
    if (entityType === "client") {
      // clients are company-level master data with no branchId column — always company-scoped
      rows = await rawQuery<Record<string, unknown>>(`SELECT id, name, phone, email FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    } else if (entityType === "supplier") {
      // suppliers are company-level master data with no branchId column — always company-scoped
      rows = await rawQuery<Record<string, unknown>>(`SELECT id, name, phone, email FROM suppliers WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    } else if (entityType === "employee") {
      const elParams: unknown[] = [scope.companyId];
      const elBranchCond = elBranchIds ? (() => { elParams.push(elBranchIds); return ` AND ea."branchId" = ANY($${elParams.length}::int[])`; })() : "";
      rows = await rawQuery<Record<string, unknown>>(`SELECT e.id, e.name, e.phone, e.email FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHERE e."deletedAt" IS NULL${elBranchCond} ORDER BY e.name LIMIT 500`, elParams);
    }
    res.json(maskFields(req, { data: rows }));
  } catch (err) {
    handleRouteError(err, res, "Entity list error:");
  }
});

reportsRouter.get("/reports/trial-balance", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    const branchFilter = getBranchCondition(scope, undefined, params);
    const rows = await rawQuery<Record<string, unknown>>(
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
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}${branchFilter}
       ) fl ON fl."accountCode" = coa.code
       WHERE coa."companyId" = $1 AND coa."deletedAt" IS NULL
       GROUP BY coa.id, coa.code, coa.name, coa.type, coa."parentId", coa.level, coa."allowPosting"
       ORDER BY coa.code`,
      params
    );
    const totalDebit = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.totalDebit), 0);
    const totalCredit = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.totalCredit), 0);
    const byType: Record<string, { totalDebit: number; totalCredit: number; balance: number }> = {};
    for (const r of rows) {
      const t = r.type as string;
      if (!byType[t]) byType[t] = { totalDebit: 0, totalCredit: 0, balance: 0 };
      byType[t].totalDebit += Number(r.totalDebit);
      byType[t].totalCredit += Number(r.totalCredit);
      byType[t].balance += Number(r.balance);
    }
    res.json(maskFields(req, { data: rows, summary: { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 }, byType }));
  } catch (err) {
    handleRouteError(err, res, "Trial balance error:");
  }
});

reportsRouter.get("/reports/income-statement", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    const branchFilter = getBranchCondition(scope, undefined, params);
    const revenues = await rawQuery<Record<string, unknown>>(`SELECT coa.code, coa.name, COALESCE(SUM(fl.credit) - SUM(fl.debit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}${branchFilter}) fl ON fl."accountCode" = coa.code WHERE coa."companyId" = $1 AND coa.type = 'revenue' AND coa."deletedAt" IS NULL GROUP BY coa.code, coa.name ORDER BY coa.code LIMIT 500`, params);
    const expenses = await rawQuery<Record<string, unknown>>(`SELECT coa.code, coa.name, COALESCE(SUM(fl.debit) - SUM(fl.credit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}${branchFilter}) fl ON fl."accountCode" = coa.code WHERE coa."companyId" = $1 AND coa.type = 'expense' AND coa."deletedAt" IS NULL GROUP BY coa.code, coa.name ORDER BY coa.code LIMIT 500`, params);
    const totalRevenue = revenues.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
    res.json(maskFields(req, { revenues, expenses, summary: { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses } }));
  } catch (err) {
    handleRouteError(err, res, "Income statement error:");
  }
});

reportsRouter.get("/reports/balance-sheet", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { asOfDate } = req.query as Record<string, string | undefined>;
    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (asOfDate) { params.push(asOfDate); dateFilter = ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    const branchFilter = getBranchCondition(scope, undefined, params);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT coa.code, coa.name, coa.type,
              CASE WHEN coa.type = 'asset' THEN COALESCE(SUM(fl.debit) - SUM(fl.credit), 0)
                   ELSE COALESCE(SUM(fl.credit) - SUM(fl.debit), 0) END AS balance
       FROM chart_of_accounts coa
       LEFT JOIN (
         SELECT jl."accountCode", jl.debit, jl.credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}${branchFilter}
       ) fl ON fl."accountCode" = coa.code
       WHERE coa."companyId" = $1 AND coa.type IN ('asset','liability','equity') AND coa."deletedAt" IS NULL
       GROUP BY coa.code, coa.name, coa.type ORDER BY coa.type, coa.code`,
      params
    );

    // YTD net income (current-year earnings) must roll into equity for any
    // balance sheet whose asOf date sits inside an open fiscal year. The
    // year-end close handler posts retained earnings via JE
    // (finance-journal.ts buildYearEndClosingLines), so after closing this
    // aggregate is already inside an equity account and we'd double-count.
    // To avoid that, the YTD window starts after the most recently closed
    // fiscal year (i.e. only counts movement that hasn't been closed to
    // retained earnings yet). If no year has been closed, anchor on Jan 1
    // of the asOf year — the system uses a calendar fiscal year.
    const asOfStr = asOfDate ?? todayISO();
    const [lastClosed] = await rawQuery<{ endDate: string | null }>(
      `SELECT MAX("endDate")::text AS "endDate"
         FROM financial_periods
        WHERE "companyId" = $1
          AND "deletedAt" IS NULL
          AND "yearEndClosed" = true
          AND "endDate" < $2`,
      [scope.companyId, asOfStr]
    );
    const ytdStart = lastClosed?.endDate
      ? new Date(new Date(lastClosed.endDate).getTime() + 86400000).toISOString().slice(0, 10)
      : `${asOfStr.slice(0, 4)}-01-01`;
    const ytdParams: unknown[] = [scope.companyId, ytdStart, asOfStr];
    const ytdBranchFilter = getBranchCondition(scope, undefined, ytdParams);
    const [ytd] = await rawQuery<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL
          AND je."createdAt" >= $2
          AND je."createdAt" < ($3::date + 1)
          ${ytdBranchFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type IN ('revenue','expense') AND coa."companyId" = $1
        WHERE jl."deletedAt" IS NULL`,
      ytdParams
    );
    const currentYearEarnings = roundTo2(Number(ytd?.revenue ?? 0) - Number(ytd?.expense ?? 0));

    const assets = rows.filter((r: Record<string, unknown>) => r.type === "asset");
    const liabilities = rows.filter((r: Record<string, unknown>) => r.type === "liability");
    const equity = rows.filter((r: Record<string, unknown>) => r.type === "equity");
    if (Math.abs(currentYearEarnings) > 0.005) {
      equity.push({
        code: "_current_year_earnings",
        name: "أرباح/خسائر السنة الحالية",
        type: "equity",
        balance: currentYearEarnings,
        synthetic: true,
      });
    }
    const totalAssets = assets.reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance), 0);
    const totalLiabilities = liabilities.reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance), 0);
    const totalEquity = equity.reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance), 0);
    res.json(maskFields(req, { assets, liabilities, equity, summary: { totalAssets, totalLiabilities, totalEquity, currentYearEarnings, isBalanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 } }));
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

reportsRouter.get("/reports/cash-flow", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const from = startDate || toDateISO(new Date(currentYear(), 0, 1));
    const to = endDate || todayISO();

    // Discover cash/bank accounts by code prefix. النقد تحت 111x (الصندوق:
    // 1110/1111/1112/1113) والبنوك تحت 112x (1120/1124…) في الشجرة المعتمدة.
    // كان الشرط `LIKE '11%'` يجرف كامل شجرة الأصول المتداولة — الذمم المدينة
    // 113x (عملاء/شيكات/مخصص ديون) والمخزون/المصروفات المدفوعة مقدمًا/ضريبة
    // المدخلات — فيُبالَغ في «النقد» ويُصنَّف أي قيد يمسّ الذمم كحركة نقدية.
    // القصر على 111x/112x يطابق تعريف النقد وما يعادله. (اعتماد إبراهيم 2026-07-01.)
    const cashAccountsRows = await rawQuery<Record<string, unknown>>(
      `SELECT code FROM chart_of_accounts
        WHERE "companyId" = $1 AND type = 'asset'
          AND (code LIKE '111%' OR code LIKE '112%')
          AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const cashCodes = cashAccountsRows.length > 0
      ? cashAccountsRows.map((r: Record<string, unknown>) => r.code)
      : ["1110", "1120"];

    const isCashPrivileged = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    const cashBranchIds = !isCashPrivileged && scope.allowedBranches.length > 0
      ? scope.allowedBranches : null;

    // Opening cash balance = sum of all cash JL before startDate
    const openingParams: unknown[] = [scope.companyId, from, cashCodes];
    if (cashBranchIds) openingParams.push(cashBranchIds);
    const openingBranchCond = cashBranchIds
      ? ` AND je."branchId" = ANY($${openingParams.length}::int[])` : "";
    const [openingRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL
          AND je."createdAt" < $2
          AND jl."accountCode" = ANY($3)${openingBranchCond}`,
      openingParams
    );
    const openingCash = Number(openingRow?.balance ?? 0);

    // Pull all JEs touching cash during the period and join to their
    // counter-account (any line in the same JE not pointing to cash) to infer
    // the classification. Simple heuristic: take the largest non-cash line as
    // the dominant counter-account.
    const jesParams: unknown[] = [scope.companyId, from, to, cashCodes];
    if (cashBranchIds) jesParams.push(cashBranchIds);
    const jesBranchCond = cashBranchIds
      ? ` AND je."branchId" = ANY($${jesParams.length}::int[])` : "";
    const jes = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description, je."createdAt",
              jl_cash.debit AS "cashDebit", jl_cash.credit AS "cashCredit"
         FROM journal_entries je
         JOIN journal_lines jl_cash ON jl_cash."journalId" = je.id
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL
          AND je."createdAt" >= $2 AND je."createdAt" < ($3::date + 1)
          AND jl_cash."accountCode" = ANY($4)
          AND (jl_cash.debit > 0 OR jl_cash.credit > 0)${jesBranchCond}
        ORDER BY je."createdAt"`,
      jesParams
    );

    const jeIds = jes.map((j: any) => j.id);
    let counterLines: any[] = [];
    if (jeIds.length > 0) {
      counterLines = await rawQuery<Record<string, unknown>>(
        `SELECT jl."journalId", jl."accountCode", jl.debit, jl.credit,
                coa.type, coa.code, coa.name
           FROM journal_lines jl
           LEFT JOIN chart_of_accounts coa
                  ON coa.code = jl."accountCode" AND coa."companyId" = $1
          WHERE jl."journalId" = ANY($2)
            AND NOT (jl."accountCode" = ANY($3))
            AND jl."deletedAt" IS NULL`,
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
      const lines = counterByJe.get(je.id as number) ?? [];
      // Pick largest non-cash line as counter account
      const dominant = lines.reduce((max: any, l: any) => {
        const amt = Math.max(Number(l.debit), Number(l.credit));
        const maxAmt = max ? Math.max(Number(max.debit), Number(max.credit)) : 0;
        return amt > maxAmt ? l : max;
      // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
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

    // Flat inflow/outflow rows for the cash-flow report tables, derived from
    // the section items already computed above (no extra query).
    const cfItems = [
      ...sections.operating.items,
      ...sections.investing.items,
      ...sections.financing.items,
    ];
    const inflows = cfItems
      .filter((i) => Number(i.inflow) > 0)
      .map((i) => ({ description: i.description, amount: roundTo2(Number(i.inflow)), date: i.date }));
    const outflows = cfItems
      .filter((i) => Number(i.outflow) > 0)
      .map((i) => ({ description: i.description, amount: roundTo2(Number(i.outflow)), date: i.date }));

    res.json(maskFields(req, {
      period: { from, to },
      openingCash: roundTo2(openingCash),
      closingCash: roundTo2(closingCash),
      inflows,
      outflows,
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
    }));
  } catch (err) {
    handleRouteError(err, res, "Cash flow error:");
  }
});

reportsRouter.get("/subsidiary-ledger/:entityType/:entityId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const id = parseId(req.params.entityId, "entityId");

    const isPrivSubLedger = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    const subLedgerBranchIds = !isPrivSubLedger && scope.allowedBranches.length > 0
      ? scope.allowedBranches : null;

    function buildDateFilter(fixedCount: number, sd: string | undefined, ed: string | undefined) {
      const extraParams: any[] = [];
      let filter = "";
      let idx = fixedCount + 1;
      if (sd) { extraParams.push(sd); filter += ` AND "createdAt" >= $${idx++}`; }
      if (ed) { extraParams.push(ed); filter += ` AND "createdAt" < ($${idx++}::date + 1)`; }
      return { filter, extraParams };
    }

    let movements: any[] = [];
    let sections: Record<string, any> = {};

    if (entityType === "employee") {
      const [emp] = await rawQuery<Record<string, unknown>>(`SELECT e.id, e.name, ea.id AS "assignmentId" FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 WHERE e.id = $2 AND e."deletedAt" IS NULL LIMIT 1`, [scope.companyId, id]);
      if (!emp) { res.json({ movements: [], summary: {}, sections: {} }); return; }
      const assignmentId = emp.assignmentId;

      const { filter: prFilter, extraParams: prDates } = buildDateFilter(2, startDate, endDate);
      const { filter: advFilter, extraParams: advDates } = buildDateFilter(2, startDate, endDate);
      const { filter: cstFilter, extraParams: cstDates } = buildDateFilter(2, startDate, endDate);
      const { filter: vioFilter, extraParams: vioDates } = buildDateFilter(2, startDate, endDate);

      const [payrollRows, advanceRows, custodyRows, violationRows] = await Promise.all([
        rawQuery<Record<string, unknown>>(`SELECT pr.id, pr.period AS ref, CONCAT('راتب ', pr.period) AS description, pr."grossSalary" AS debit, 0 AS credit, pr."createdAt" AS date, 'payroll' AS "movementType" FROM payroll_records pr WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${prFilter.replace(/"createdAt"/g, 'pr."createdAt"')} ORDER BY pr."createdAt" DESC LIMIT 500`, [assignmentId, scope.companyId, ...prDates]),
        rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, CONCAT('سلفة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'advance' AS "movementType" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410' WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 ${advFilter.replace(/"createdAt"/g, 'je."createdAt"')} GROUP BY je.id, je.ref, je.description, je."createdAt" LIMIT 500`, [scope.companyId, assignmentId, ...advDates]),
        rawQuery<Record<string, unknown>>(`SELECT je.id, je.ref, CONCAT('عهدة: ', je.description) AS description, COALESCE(SUM(jl.debit), 0) AS debit, 0 AS credit, je."createdAt" AS date, 'custody' AS "movementType" FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400' WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."createdBy" = $2 AND je.ref LIKE 'CUSTODY%' ${cstFilter.replace(/"createdAt"/g, 'je."createdAt"')} GROUP BY je.id, je.ref, je.description, je."createdAt" LIMIT 500`, [scope.companyId, assignmentId, ...cstDates]),
        rawQuery<Record<string, unknown>>(`SELECT v.id, CONCAT('VIO-', v.id::text) AS ref, CONCAT('خصم مخالفة: ', v.description) AS description, 0 AS debit, COALESCE(v.deduction, 0) AS credit, v."createdAt" AS date, 'violation' AS "movementType" FROM employee_violations v WHERE v."assignmentId" = $1 AND v."companyId" = $2 AND v.deduction > 0 ${vioFilter.replace(/"createdAt"/g, 'v."createdAt"')} ORDER BY v."createdAt" DESC LIMIT 500`, [assignmentId, scope.companyId, ...vioDates]),
      ]);

      const all = [...payrollRows, ...advanceRows, ...custodyRows, ...violationRows].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let runningBalance = 0;
      movements = all.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });

      const totalPayroll = payrollRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.debit), 0);
      const totalAdvances = advanceRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.debit), 0);
      const totalCustodies = custodyRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.debit), 0);
      const totalDeductions = violationRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.credit), 0);

      sections = {
        payroll: { label: "الرواتب", amount: totalPayroll, count: payrollRows.length },
        advances: { label: "السلف", amount: totalAdvances, count: advanceRows.length },
        custodies: { label: "العهد", amount: totalCustodies, count: custodyRows.length },
        violations: { label: "الخصومات", amount: totalDeductions, count: violationRows.length },
      };

    } else if (entityType === "client") {
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const invParams: unknown[] = [scope.companyId, id, ...dateDates];
      const invBranchCond = subLedgerBranchIds ? (() => { invParams.push(subLedgerBranchIds); return ` AND i."branchId" = ANY($${invParams.length}::int[])`; })() : "";
      const invoiceRows = await rawQuery<Record<string, unknown>>(`SELECT i.id, i.ref, i.total AS debit, i."paidAmount" AS credit, i."createdAt" AS date, CONCAT('فاتورة ', i.ref) AS description, 'invoice' AS "movementType", i.status FROM invoices i WHERE i."companyId" = $1 AND i."clientId" = $2 AND i."deletedAt" IS NULL ${dateFilter.replace(/"createdAt"/g, 'i."createdAt"')}${invBranchCond} ORDER BY i."createdAt" ASC LIMIT 500`, invParams);
      let runningBalance = 0;
      movements = invoiceRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const totalInvoiced = invoiceRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.debit), 0);
      const totalPaid = invoiceRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.credit), 0);
      sections = { invoices: { label: "الفواتير", amount: totalInvoiced, count: invoiceRows.length }, payments: { label: "المدفوعات", amount: totalPaid, count: invoiceRows.filter((r: Record<string, unknown>) => Number(r.credit) > 0).length } };

    } else if (entityType === "supplier") {
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const poParams: unknown[] = [scope.companyId, id, ...dateDates];
      const poBranchCondSub = subLedgerBranchIds ? (() => { poParams.push(subLedgerBranchIds); return ` AND po."branchId" = ANY($${poParams.length}::int[])`; })() : "";
      const poRows = await rawQuery<Record<string, unknown>>(`SELECT po.id, po.ref, po."totalAmount" AS debit, 0 AS credit, po."createdAt" AS date, CONCAT('أمر شراء ', po.ref) AS description, 'purchase_order' AS "movementType", po.status FROM purchase_orders po WHERE po."companyId" = $1 AND po."supplierId" = $2 AND po."deletedAt" IS NULL ${dateFilter.replace(/"createdAt"/g, 'po."createdAt"')}${poBranchCondSub} ORDER BY po."createdAt" ASC LIMIT 500`, poParams);
      let runningBalance = 0;
      movements = poRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const totalOrdered = poRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.debit), 0);
      sections = { orders: { label: "أوامر الشراء", amount: totalOrdered, count: poRows.length } };

    } else if (entityType === "vehicle" || entityType === "property" || entityType === "project") {
      const colFilterMap: Record<string, string> = {
        vehicle: 'jl."vehicleId"',
        property: 'jl."propertyId"',
        project: 'jl."projectId"',
      };
      const colFilter = colFilterMap[entityType];
      if (!colFilter) throw new ValidationError("نوع الكيان غير مدعوم");
      const { filter: dateFilter, extraParams: dateDates } = buildDateFilter(2, startDate, endDate);
      const jeSubParams: unknown[] = [scope.companyId, id, ...dateDates];
      const jeSubBranchCond = subLedgerBranchIds ? (() => { jeSubParams.push(subLedgerBranchIds); return ` AND je."branchId" = ANY($${jeSubParams.length}::int[])`; })() : "";
      const journalRows = await rawQuery<Record<string, unknown>>(
        `SELECT je.id, je.ref, je.description, je."createdAt" AS date, je.type AS "movementType",
                COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND ${colFilter} = $2
         ${dateFilter.replace(/"createdAt"/g, 'je."createdAt"')}${jeSubBranchCond}
         GROUP BY je.id, je.ref, je.description, je."createdAt", je.type
         ORDER BY je."createdAt" ASC`,
        jeSubParams
      );
      let runningBalance = 0;
      movements = journalRows.map((m: any) => { runningBalance += Number(m.debit) - Number(m.credit); return { ...m, runningBalance }; });
      const typeGroups: Record<string, { label: string; amount: number; count: number }> = {};
      for (const m of journalRows) {
        const t = (m.movementType as string | null) || "other";
        if (!typeGroups[t]) typeGroups[t] = { label: t, amount: 0, count: 0 };
        typeGroups[t].amount += Number(m.debit) - Number(m.credit);
        typeGroups[t].count++;
      }
      sections = typeGroups;
    }

    const totalDebit = movements.reduce((s: number, m: any) => s + Number(m.debit), 0);
    const totalCredit = movements.reduce((s: number, m: any) => s + Number(m.credit), 0);

    res.json(maskFields(req, {
      entityType, entityId: id,
      movements,
      summary: { totalDebit, totalCredit, netBalance: totalDebit - totalCredit, transactionCount: movements.length },
      sections,
    }));
  } catch (err) {
    handleRouteError(err, res, "Subsidiary ledger error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Customer Statement (كشف حساب عميل)
// Returns: opening balance, invoice + payment movements in period, running
// balance, aging buckets (0-30, 31-60, 61-90, 90+), and ending balance.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get("/reports/customer-statement/:clientId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const clientId = parseId(req.params.clientId, "clientId");
    const { startDate, endDate, seasonId: seasonIdRaw } = req.query as Record<string, string | undefined>;
    const asOf = endDate || todayISO();
    const from = startDate || "1900-01-01";
    // Optional umrah-season filter — same shape as the vendor-statement
    // endpoint. Narrows the umrah_sales_invoices + umrah_payments rows
    // (payments are scoped via the parent invoice's season indirectly
    // by joining the sub-agent — kept simple here: payments aren't
    // season-scoped per row).
    const seasonIdNum = seasonIdRaw && /^\d+$/.test(seasonIdRaw) ? Number(seasonIdRaw) : null;

    const [client] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, phone, email, "taxNumber", "taxNumber" AS "vatNumber" FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!client) { throw new NotFoundError("العميل غير موجود"); return; }

    const isPrivCS = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    const csBranchIds = !isPrivCS && scope.allowedBranches.length > 0 ? scope.allowedBranches : null;

    // Opening balance = invoices before startDate - payments before startDate (branch-scoped)
    const obInvParams: unknown[] = [clientId, scope.companyId, from];
    const obInvBranchCond = csBranchIds ? (() => { obInvParams.push(csBranchIds); return ` AND "branchId" = ANY($${obInvParams.length}::int[])`; })() : "";
    const [obInvRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND "createdAt" < $3${obInvBranchCond}`,
      obInvParams
    );
    // invoice_payments has no branchId column — derive the payment's branch
    // from the linked invoice so a per-branch statement only deducts the
    // payments that hit invoices on the user's branch(es). Without this
    // join, a payment that settled a Branch B invoice would show up as a
    // deduction on Branch A's opening balance for the same customer.
    const obPayParams: unknown[] = [clientId, scope.companyId, from];
    const obPayBranchCond = csBranchIds
      ? (() => { obPayParams.push(csBranchIds); return ` AND i."branchId" = ANY($${obPayParams.length}::int[])`; })()
      : "";
    const [obPayRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(ip.amount), 0) AS total
         FROM invoice_payments ip
         JOIN invoices i ON i.id = ip."invoiceId" AND i."deletedAt" IS NULL
        WHERE ip."clientId" = $1 AND ip."companyId" = $2 AND ip."paidAt" < $3${obPayBranchCond}`,
      obPayParams
    );
    // ── Umrah AR integration ───────────────────────────────────────
    // The customer statement was historically blind to umrah_sales_invoices
    // — operators opening it for a sub-agent's linked client saw zero
    // umrah activity even though the GL had it. The umrah module posts
    // every sales invoice + payment to journal_entries (see
    // umrahInvoicingEngine.createGuardedJournalEntry), so the GL was
    // correct; only the customer-statement endpoint was broken.
    //
    // Match rule: an umrah_sales_invoice belongs to this customer if
    //   - its clientId column directly references this customer, OR
    //   - its subAgentId resolves to a sub-agent whose clientId is this
    //     customer (the common path — most umrah sales invoices are
    //     keyed by sub-agent because the sub-agent is who actually pays)
    //
    // Same `csBranchIds` scoping as the existing invoices query so a
    // per-branch user can't see another branch's umrah rows here.
    const umrahMatchSql = `(u."clientId" = $1
        OR EXISTS (
          SELECT 1 FROM umrah_sub_agents sa
           WHERE sa.id = u."subAgentId"
             AND sa."clientId" = $1
             AND sa."companyId" = $2
             AND sa."deletedAt" IS NULL
        ))`;

    // Opening balance contribution from umrah — same BEFORE-start-date
    // window as the existing obInvRow / obPayRow above.
    const obUmrahInvParams: unknown[] = [clientId, scope.companyId, from];
    const obUmrahInvBranchCond = csBranchIds
      ? (() => { obUmrahInvParams.push(csBranchIds); return ` AND u."branchId" = ANY($${obUmrahInvParams.length}::int[])`; })()
      : "";
    const obUmrahInvSeasonCond = seasonIdNum != null
      ? (() => { obUmrahInvParams.push(seasonIdNum); return ` AND u."seasonId" = $${obUmrahInvParams.length}`; })()
      : "";
    const [obUmrahInvRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(u.total), 0) AS total
         FROM umrah_sales_invoices u
        WHERE ${umrahMatchSql}
          AND u."companyId" = $2
          AND u."deletedAt" IS NULL
          AND u."createdAt" < $3${obUmrahInvBranchCond}${obUmrahInvSeasonCond}`,
      obUmrahInvParams
    );
    const obUmrahPayParams: unknown[] = [clientId, scope.companyId, from];
    const obUmrahPayBranchCond = csBranchIds
      ? (() => { obUmrahPayParams.push(csBranchIds); return ` AND up."branchId" = ANY($${obUmrahPayParams.length}::int[])`; })()
      : "";
    const [obUmrahPayRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(up."sarAmount"), 0) AS total
         FROM umrah_payments up
         JOIN umrah_sub_agents sa
           ON sa.id = up."subAgentId"
          AND sa."companyId" = up."companyId"
          AND sa."deletedAt" IS NULL
        WHERE sa."clientId" = $1
          AND up."companyId" = $2
          AND up."deletedAt" IS NULL
          AND up."paymentDate" < $3${obUmrahPayBranchCond}`,
      obUmrahPayParams
    );
    const openingBalanceWithUmrah =
      Number(obInvRow?.total ?? 0)
      + Number(obUmrahInvRow?.total ?? 0)
      - Number(obPayRow?.total ?? 0)
      - Number(obUmrahPayRow?.total ?? 0);
    const openingBalance = openingBalanceWithUmrah;

    const csBranchCond = csBranchIds ? ` AND "branchId" = ANY($5::int[])` : "";
    const csBaseParams = (extra?: unknown[]): unknown[] => [clientId, scope.companyId, from, asOf, ...(extra || [])];

    // In-period invoices
    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "createdAt" AS date, total AS debit, 0 AS credit,
              "dueDate", status, 'invoice' AS "movementType",
              CONCAT('فاتورة ', ref) AS description
         FROM invoices
        WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL
          AND "createdAt" >= $3 AND "createdAt" < ($4::date + 1)${csBranchCond}
        ORDER BY "createdAt"`,
      csBaseParams(csBranchIds || undefined)
    );
    // In-period payments — JOINed on invoices to derive the payment's
    // branch (invoice_payments has no branchId of its own). Same scoping
    // logic as the opening balance above keeps the statement consistent.
    const payParams: unknown[] = [clientId, scope.companyId, from, asOf];
    const payBranchCond = csBranchIds
      ? (() => { payParams.push(csBranchIds); return ` AND i."branchId" = ANY($${payParams.length}::int[])`; })()
      : "";
    const payments = await rawQuery<Record<string, unknown>>(
      `SELECT ip.id, COALESCE(ip."transactionRef", CONCAT('PAY-', ip.id)) AS ref,
              ip."paidAt" AS date, 0 AS debit, ip.amount AS credit,
              NULL AS "dueDate", 'paid' AS status, 'payment' AS "movementType",
              CONCAT('دفعة (', COALESCE(ip.method,'manual'), ')') AS description
         FROM invoice_payments ip
         JOIN invoices i ON i.id = ip."invoiceId" AND i."deletedAt" IS NULL
        WHERE ip."clientId" = $1 AND ip."companyId" = $2
          AND ip."paidAt" >= $3 AND ip."paidAt" <= $4${payBranchCond}
        ORDER BY ip."paidAt"`,
      payParams
    );

    // In-period umrah sales invoices for this customer (direct clientId
    // or via the sub-agent's clientId — see umrahMatchSql above). Shape
    // matches the existing invoice movement row so they merge into the
    // sorted timeline alongside core-finance invoices without special
    // handling.
    const umrahInvParams: unknown[] = [clientId, scope.companyId, from, asOf];
    const umrahInvBranchCond = csBranchIds
      ? (() => { umrahInvParams.push(csBranchIds); return ` AND u."branchId" = ANY($${umrahInvParams.length}::int[])`; })()
      : "";
    const umrahInvSeasonCond = seasonIdNum != null
      ? (() => { umrahInvParams.push(seasonIdNum); return ` AND u."seasonId" = $${umrahInvParams.length}`; })()
      : "";
    const umrahInvoices = await rawQuery<Record<string, unknown>>(
      `SELECT u.id, u.ref, u."createdAt" AS date, u.total AS debit, 0 AS credit,
              u."dueDate", u.status, 'umrah_sales_invoice' AS "movementType",
              CONCAT('فاتورة عمرة ', COALESCE(u.ref, CONCAT('#', u.id))) AS description,
              u."seasonId" AS "seasonId"
         FROM umrah_sales_invoices u
        WHERE ${umrahMatchSql}
          AND u."companyId"=$2
          AND u."deletedAt" IS NULL
          AND u."createdAt" >= $3 AND u."createdAt" < ($4::date + 1)${umrahInvBranchCond}${umrahInvSeasonCond}
        ORDER BY u."createdAt"`,
      umrahInvParams
    );

    // In-period umrah payments — JOINed to umrah_sub_agents to resolve
    // the customer. paymentDate (not createdAt) is the cash-effective
    // date the customer cares about.
    const umrahPayParams: unknown[] = [clientId, scope.companyId, from, asOf];
    const umrahPayBranchCond = csBranchIds
      ? (() => { umrahPayParams.push(csBranchIds); return ` AND up."branchId" = ANY($${umrahPayParams.length}::int[])`; })()
      : "";
    const umrahPayments = await rawQuery<Record<string, unknown>>(
      `SELECT up.id, COALESCE(up.ref, CONCAT('UPAY-', up.id)) AS ref,
              up."paymentDate" AS date, 0 AS debit, up."sarAmount" AS credit,
              NULL AS "dueDate", 'paid' AS status, 'umrah_payment' AS "movementType",
              CONCAT('دفعة عمرة (', COALESCE(up.method,'manual'), ')') AS description
         FROM umrah_payments up
         JOIN umrah_sub_agents sa
           ON sa.id = up."subAgentId"
          AND sa."companyId" = up."companyId"
          AND sa."deletedAt" IS NULL
        WHERE sa."clientId" = $1
          AND up."companyId" = $2
          AND up."deletedAt" IS NULL
          AND up."paymentDate" >= $3 AND up."paymentDate" <= $4${umrahPayBranchCond}
        ORDER BY up."paymentDate"`,
      umrahPayParams
    );

    const all = [...invoices, ...payments, ...umrahInvoices, ...umrahPayments].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let running = openingBalance;
    const movements = all.map((m: any) => {
      running += Number(m.debit) - Number(m.credit);
      return { ...m, runningBalance: roundTo2(running) };
    });

    // Aging of OPEN invoices as of asOf (based on dueDate or invoice date +30)
    const agingParams: unknown[] = [clientId, scope.companyId, asOf];
    const agingBranchCond = csBranchIds ? (() => { agingParams.push(csBranchIds); return ` AND "branchId" = ANY($${agingParams.length}::int[])`; })() : "";
    const openInvoices = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "createdAt", "dueDate", total, "paidAmount",
              (total - COALESCE("paidAmount",0)) AS outstanding
         FROM invoices
        WHERE "clientId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL
          AND "createdAt" < ($3::date + 1)
          AND (total - COALESCE("paidAmount",0)) > 0.01${agingBranchCond}`,
      agingParams
    );

    // Aging extension — open umrah sales invoices contribute to the
    // same buckets. Without this the aging total understates AR for
    // any customer whose umrah activity is non-trivial.
    const umrahAgingParams: unknown[] = [clientId, scope.companyId, asOf];
    const umrahAgingBranchCond = csBranchIds
      ? (() => { umrahAgingParams.push(csBranchIds); return ` AND u."branchId" = ANY($${umrahAgingParams.length}::int[])`; })()
      : "";
    const umrahAgingSeasonCond = seasonIdNum != null
      ? (() => { umrahAgingParams.push(seasonIdNum); return ` AND u."seasonId" = $${umrahAgingParams.length}`; })()
      : "";
    const openUmrahInvoices = await rawQuery<Record<string, unknown>>(
      `SELECT u.id, u.ref, u."createdAt", u."dueDate", u.total, u."paidAmount",
              (u.total - COALESCE(u."paidAmount",0)) AS outstanding
         FROM umrah_sales_invoices u
        WHERE ${umrahMatchSql}
          AND u."companyId"=$2
          AND u."deletedAt" IS NULL
          AND u."createdAt" < ($3::date + 1)
          AND (u.total - COALESCE(u."paidAmount",0)) > 0.01${umrahAgingBranchCond}${umrahAgingSeasonCond}`,
      umrahAgingParams
    );
    // Merge into the same aging loop below.
    openInvoices.push(...openUmrahInvoices);
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const asOfMs = new Date(asOf).getTime();
    for (const inv of openInvoices) {
      const due = inv.dueDate ? new Date(inv.dueDate as string | Date).getTime()
        : new Date(inv.createdAt as string | Date).getTime() + 30 * 86400000;
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

    // ── Security deposits held for this customer ─────────────────────
    // Property security deposits post to the GL as a LIABILITY
    // (security_deposit_liability / 2300 — see propertiesEngine.
    // postSecurityDepositGL), so they must NOT enter the AR running
    // balance above: a held deposit is money we owe the tenant, the
    // opposite direction of the receivable. Pre-fix the statement was
    // blind to them entirely — an operator settling a departing
    // tenant had to hunt the deposit in the property module while the
    // statement implied a clean slate. Surface them as a separate
    // block: per-deposit rows + the total still held as of `asOf`.
    // Join chain: deposit → rental_contract → tenants.clientId.
    const depositParams: unknown[] = [clientId, scope.companyId, asOf];
    const heldDeposits = await rawQuery<Record<string, unknown>>(
      `SELECT psd.id, psd.amount, psd."receivedDate", psd.status,
              rc.id AS "contractId", rc."contractNumber",
              COALESCE(psd."refundAmount", 0) AS "refundedAmount",
              (psd.amount - COALESCE(psd."refundAmount", 0)) AS "heldAmount"
         FROM property_security_deposits psd
         JOIN rental_contracts rc ON rc.id = psd."contractId" AND rc."deletedAt" IS NULL
         JOIN tenants t ON t.id = rc."tenantId" AND t."deletedAt" IS NULL
        WHERE t."clientId" = $1
          AND psd."companyId" = $2
          AND psd."receivedDate" <= $3
          AND (psd.amount - COALESCE(psd."refundAmount", 0)) > 0.01
        ORDER BY psd."receivedDate"`,
      depositParams
    );
    const totalHeldDeposits = roundTo2(
      heldDeposits.reduce((s, d) => s + Number(d.heldAmount), 0)
    );

    res.json(maskFields(req, {
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
      securityDeposits: {
        totalHeld: totalHeldDeposits,
        rows: heldDeposits,
      },
    }));
  } catch (err) {
    handleRouteError(err, res, "Customer statement error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Vendor Statement (كشف حساب مورد)
// Returns: opening balance, PO/invoice + scheduled-payment movements, running
// balance, aging buckets on unpaid POs, and ending balance.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get("/reports/vendor-statement/:supplierId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const supplierId = parseId(req.params.supplierId, "supplierId");
    const { startDate, endDate, seasonId: seasonIdRaw } = req.query as Record<string, string | undefined>;
    const asOf = endDate || todayISO();
    const from = startDate || "1900-01-01";
    // Optional umrah-season filter — when set, narrows the umrah rows
    // to a single season (e.g. "show me only هـ 1446 ramadan"). Doesn't
    // touch the core PO rows, which aren't season-scoped.
    const seasonIdNum = seasonIdRaw && /^\d+$/.test(seasonIdRaw) ? Number(seasonIdRaw) : null;

    const [supplier] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, phone, email, "taxNumber" FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [supplierId, scope.companyId]
    );
    if (!supplier) { throw new NotFoundError("المورد غير موجود"); return; }

    // NUSK linkage — load the company's configured NUSK supplier id.
    // When the supplier we're rendering MATCHES that id, this statement
    // also surfaces umrah_nusk_invoices. Without the per-company config,
    // there'd be no way to distinguish "NUSK supplier" from "any random
    // supplier" since umrah_nusk_invoices has no supplierId of its own.
    const [companyCfg] = await rawQuery<{ nuskSupplierId: number | null }>(
      `SELECT "nuskSupplierId" FROM companies WHERE id = $1`,
      [scope.companyId]
    );
    const isNuskSupplier = companyCfg?.nuskSupplierId === supplierId;

    const isPrivVS = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    const vsBranchIds = !isPrivVS && scope.allowedBranches.length > 0 ? scope.allowedBranches : null;

    // Opening balance = POs matched/received before startDate (branch-scoped)
    // net of any payment-voucher allocations posted before startDate.
    const obPOParams: unknown[] = [supplierId, scope.companyId, from];
    const obPOBranchCond = vsBranchIds ? (() => { obPOParams.push(vsBranchIds); return ` AND "branchId" = ANY($${obPOParams.length}::int[])`; })() : "";
    const [obPORow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM("totalAmount"), 0) AS total FROM purchase_orders WHERE "supplierId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status IN ('received','partially_received','invoice_matched','payment_scheduled','paid','completed') AND "createdAt" < $3${obPOBranchCond}`,
      obPOParams
    );
    const [obPayRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(spa.amount), 0) AS total
         FROM supplier_payment_allocations spa
         JOIN journal_entries je ON je.id = spa."journalEntryId"
         JOIN purchase_orders po ON po.id = spa."obligationId"
        WHERE spa."companyId" = $2
          AND spa."deletedAt" IS NULL
          AND spa."obligationType" = 'purchase_order'
          AND po."supplierId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL
          AND je."createdAt" < $3`,
      [supplierId, scope.companyId, from]
    );
    // NUSK opening balance contribution — sum of totalAmount on
    // umrah_nusk_invoices issued BEFORE startDate, less any rows
    // already flagged paid/refunded. Only runs when this supplier IS
    // the configured NUSK supplier; otherwise the result is forced 0
    // so the math stays the same for non-NUSK suppliers.
    let obNuskAmount = 0;
    if (isNuskSupplier) {
      const obNuskParams: unknown[] = [scope.companyId, from];
      let obNuskBranchCond = "";
      if (vsBranchIds) {
        obNuskParams.push(vsBranchIds);
        obNuskBranchCond = ` AND "branchId" = ANY($${obNuskParams.length}::int[])`;
      }
      let obNuskSeasonCond = "";
      if (seasonIdNum != null) {
        obNuskParams.push(seasonIdNum);
        obNuskSeasonCond = ` AND "seasonId" = $${obNuskParams.length}`;
      }
      const [obNuskRow] = await rawQuery<{ total: string }>(
        `SELECT COALESCE(SUM("totalAmount" - COALESCE("refundAmount",0)), 0) AS total
           FROM umrah_nusk_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "nuskStatus" NOT IN ('cancelled')
            AND COALESCE("issueDate", "createdAt") < $2${obNuskBranchCond}${obNuskSeasonCond}`,
        obNuskParams,
      );
      obNuskAmount = Number(obNuskRow?.total ?? 0);
    }
    const openingBalance = Number(obPORow?.total ?? 0) + obNuskAmount - Number(obPayRow?.total ?? 0);

    const vsBranchCond = vsBranchIds ? ` AND "branchId" = ANY($5::int[])` : "";
    const vsBaseParams = (extra?: unknown[]): unknown[] => [supplierId, scope.companyId, from, asOf, ...(extra || [])];

    const pos = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "createdAt" AS date, 0 AS debit, "totalAmount" AS credit,
              "expectedDelivery" AS "dueDate", status, 'purchase_order' AS "movementType",
              CONCAT('أمر شراء ', ref) AS description
         FROM purchase_orders
        WHERE "supplierId"=$1 AND "companyId"=$2
          AND "deletedAt" IS NULL
          AND "createdAt" >= $3 AND "createdAt" < ($4::date + 1)${vsBranchCond}
        ORDER BY "createdAt"`,
      vsBaseParams(vsBranchIds || undefined)
    );

    // C4 — payment vouchers allocated to this supplier's POs show up as
    // debit movements (reducing what we owe). Pulled from
    // supplier_payment_allocations joined to the source PO so we only
    // include vouchers that actually pay one of this supplier's orders.
    const payRows = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je."createdAt" AS date,
              SUM(spa.amount) AS debit, 0 AS credit,
              NULL AS "dueDate", je.status,
              'voucher_payment' AS "movementType",
              CONCAT('سند صرف ', je.ref) AS description
         FROM supplier_payment_allocations spa
         JOIN journal_entries je ON je.id = spa."journalEntryId"
         JOIN purchase_orders po ON po.id = spa."obligationId"
        WHERE spa."companyId" = $2
          AND spa."deletedAt" IS NULL
          AND spa."obligationType" = 'purchase_order'
          AND po."supplierId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL
          AND je."createdAt" >= $3 AND je."createdAt" <= $4
        GROUP BY je.id, je.ref, je."createdAt", je.status
        ORDER BY je."createdAt"`,
      [supplierId, scope.companyId, from, asOf]
    );

    // In-period NUSK invoices — same credit-side shape as PO movements
    // (they're our AP obligation). Description distinguishes them in
    // the timeline so an operator can spot which rows are NUSK vs
    // regular PO. Only runs when supplier IS NUSK.
    let nuskMovements: Array<Record<string, unknown>> = [];
    if (isNuskSupplier) {
      const nuskInvParams: unknown[] = [scope.companyId, from, asOf];
      let nuskInvBranchCond = "";
      if (vsBranchIds) {
        nuskInvParams.push(vsBranchIds);
        nuskInvBranchCond = ` AND "branchId" = ANY($${nuskInvParams.length}::int[])`;
      }
      let nuskInvSeasonCond = "";
      if (seasonIdNum != null) {
        nuskInvParams.push(seasonIdNum);
        nuskInvSeasonCond = ` AND "seasonId" = $${nuskInvParams.length}`;
      }
      nuskMovements = await rawQuery<Record<string, unknown>>(
        `SELECT id, "nuskInvoiceNumber" AS ref,
                COALESCE("issueDate", "createdAt") AS date,
                0 AS debit,
                ("totalAmount" - COALESCE("refundAmount",0)) AS credit,
                NULL AS "dueDate",
                "nuskStatus" AS status,
                'umrah_nusk_invoice' AS "movementType",
                CONCAT('فاتورة نسك ', "nuskInvoiceNumber") AS description,
                "seasonId" AS "seasonId"
           FROM umrah_nusk_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "nuskStatus" NOT IN ('cancelled')
            AND COALESCE("issueDate", "createdAt") >= $2
            AND COALESCE("issueDate", "createdAt") <= $3${nuskInvBranchCond}${nuskInvSeasonCond}
          ORDER BY COALESCE("issueDate", "createdAt")`,
        nuskInvParams,
      );
    }

    const combined = [...pos, ...payRows, ...nuskMovements].sort((a: any, b: any) => {
      const ad = new Date(a.date as string | Date).getTime();
      const bd = new Date(b.date as string | Date).getTime();
      return ad - bd;
    });

    let running = openingBalance;
    const movements = combined.map((m: any) => {
      running += Number(m.debit) - Number(m.credit);
      return { ...m, runningBalance: roundTo2(running) };
    });

    // Aging of open POs, net of allocations against each PO.
    // Pre-aggregate supplier_payment_allocations once via CTE
    // instead of running a scalar subquery per PO. Original was N+1:
    // every PO row triggered a fresh SUM over the allocations table.
    // The CTE scans the table once filtered to this supplier's
    // company + active journal entries, then LEFT JOINs the
    // per-PO totals back.
    const agingPOParams: unknown[] = [supplierId, scope.companyId, asOf];
    const agingPOBranchCond = vsBranchIds ? (() => { agingPOParams.push(vsBranchIds); return ` AND "branchId" = ANY($${agingPOParams.length}::int[])`; })() : "";
    const openPos = await rawQuery<Record<string, unknown>>(
      `WITH po_paid AS (
         SELECT spa."obligationId" AS "poId", SUM(spa.amount) AS "paidAmount"
         FROM supplier_payment_allocations spa
         JOIN journal_entries je ON je.id = spa."journalEntryId"
         WHERE spa."companyId" = $2
           AND spa."obligationType" = 'purchase_order'
           AND spa."deletedAt" IS NULL
           AND je."deletedAt" IS NULL
           AND je."balancesApplied" = true
           AND je."reversedById" IS NULL
         GROUP BY spa."obligationId"
       )
       SELECT po.id, po.ref, po."createdAt", po."expectedDelivery", po."totalAmount",
              COALESCE(pp."paidAmount", 0) AS "paidAmount"
         FROM purchase_orders po
         LEFT JOIN po_paid pp ON pp."poId" = po.id
        WHERE po."supplierId"=$1 AND po."companyId"=$2
          AND po."deletedAt" IS NULL
          AND po.status NOT IN ('paid','completed','cancelled','rejected')
          AND po."createdAt" < ($3::date + 1)${agingPOBranchCond}`,
      agingPOParams
    );

    // Aging extension — open NUSK invoices added to the same bucket
    // pass. Open = nuskStatus IS NOT IN paid/cancelled/refunded.
    // Aging uses issueDate + 30 days as the default due (umrah_nusk_
    // invoices has no explicit dueDate column).
    let openNuskInvoices: Array<Record<string, unknown>> = [];
    if (isNuskSupplier) {
      const agingNuskParams: unknown[] = [scope.companyId, asOf];
      let agingNuskBranchCond = "";
      if (vsBranchIds) {
        agingNuskParams.push(vsBranchIds);
        agingNuskBranchCond = ` AND "branchId" = ANY($${agingNuskParams.length}::int[])`;
      }
      let agingNuskSeasonCond = "";
      if (seasonIdNum != null) {
        agingNuskParams.push(seasonIdNum);
        agingNuskSeasonCond = ` AND "seasonId" = $${agingNuskParams.length}`;
      }
      openNuskInvoices = await rawQuery<Record<string, unknown>>(
        `SELECT id, "nuskInvoiceNumber" AS ref,
                COALESCE("issueDate", "createdAt") AS "createdAt",
                "totalAmount",
                COALESCE("refundAmount", 0) AS "paidAmount"
           FROM umrah_nusk_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "nuskStatus" NOT IN ('paid','cancelled','refunded')
            AND COALESCE("issueDate", "createdAt") < ($2::date + 1)${agingNuskBranchCond}${agingNuskSeasonCond}`,
        agingNuskParams,
      );
    }

    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const asOfMs = new Date(asOf).getTime();
    for (const po of openPos) {
      const due = po.expectedDelivery ? new Date(po.expectedDelivery as string | Date).getTime()
        : new Date(po.createdAt as string | Date).getTime() + 30 * 86400000;
      const daysOverdue = Math.floor((asOfMs - due) / 86400000);
      const amt = Math.max(0, Number(po.totalAmount) - Number(po.paidAmount ?? 0));
      if (amt === 0) continue;
      if (daysOverdue <= 0) buckets.current += amt;
      else if (daysOverdue <= 30) buckets.d30 += amt;
      else if (daysOverdue <= 60) buckets.d60 += amt;
      else if (daysOverdue <= 90) buckets.d90 += amt;
      else buckets.d90plus += amt;
    }
    // Same bucketing loop for NUSK rows — keeps the aging math
    // single-sourced. NUSK rows use createdAt + 30 days as the implicit
    // due date.
    for (const inv of openNuskInvoices) {
      const due = new Date(inv.createdAt as string | Date).getTime() + 30 * 86400000;
      const daysOverdue = Math.floor((asOfMs - due) / 86400000);
      const amt = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount ?? 0));
      if (amt === 0) continue;
      if (daysOverdue <= 0) buckets.current += amt;
      else if (daysOverdue <= 30) buckets.d30 += amt;
      else if (daysOverdue <= 60) buckets.d60 += amt;
      else if (daysOverdue <= 90) buckets.d90 += amt;
      else buckets.d90plus += amt;
    }

    const totalDebit = movements.reduce((s, m) => s + Number(m.debit), 0);
    const totalCredit = movements.reduce((s, m) => s + Number(m.credit), 0);
    const endingBalance = roundTo2(openingBalance + totalDebit - totalCredit);

    res.json(maskFields(req, {
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
    }));
  } catch (err) {
    handleRouteError(err, res, "Vendor statement error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.1 — migrated from finance.ts (canonical ownership consolidation)
// ─────────────────────────────────────────────────────────────────────────────

reportsRouter.get("/reports/entity-statement", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, startDate, endDate } = req.query as Record<string, string | undefined>;

    let rows: any[] = [];
    let entityName = "";

    const isPrivES = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    const esBranchIds = !isPrivES && scope.allowedBranches.length > 0 ? scope.allowedBranches : null;

    if (entityType === "employee" && entityId) {
      const [emp] = await rawQuery<Record<string, unknown>>(
        `SELECT e.name, ea.id AS aid FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
         WHERE e.id = $2 AND e."deletedAt" IS NULL LIMIT 1`,
        [scope.companyId, (Number(entityId) || 0)]
      );
      entityName = (emp?.name as string | undefined) || "";
      const aid = emp?.aid as number | undefined;
      if (aid) {
        const qParams: any[] = [aid, scope.companyId];
        let dateFilter = "";
        if (startDate) { qParams.push(startDate); dateFilter += ` AND pr."createdAt" >= $${qParams.length}`; }
        if (endDate) { qParams.push(endDate); dateFilter += ` AND pr."createdAt" < ($${qParams.length}::date + 1)`; }
        rows = await rawQuery<Record<string, unknown>>(
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
      const [cl] = await rawQuery<Record<string, unknown>>(`SELECT name FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [(Number(entityId) || 0), scope.companyId]);
      entityName = (cl?.name as string | undefined) || "";
      const qParams: any[] = [(Number(entityId) || 0), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND i."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND i."createdAt" < ($${qParams.length}::date + 1)`; }
      if (esBranchIds) { qParams.push(esBranchIds); dateFilter += ` AND i."branchId" = ANY($${qParams.length}::int[])`; }
      rows = await rawQuery<Record<string, unknown>>(
        `SELECT i.ref, COALESCE(i.description, i.ref) AS description,
                i.total AS debit, i."paidAmount" AS credit,
                (i.total - i."paidAmount") AS net,
                i."createdAt" AS date, i.status AS type
         FROM invoices i WHERE i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL ${dateFilter}
         ORDER BY i."createdAt" DESC LIMIT 100`,
        qParams
      );
    } else if (entityType === "supplier" && entityId) {
      const [sup] = await rawQuery<Record<string, unknown>>(`SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [(Number(entityId) || 0), scope.companyId]);
      entityName = (sup?.name as string | undefined) || "";
      const qParams: any[] = [(Number(entityId) || 0), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND po."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND po."createdAt" < ($${qParams.length}::date + 1)`; }
      if (esBranchIds) { qParams.push(esBranchIds); dateFilter += ` AND po."branchId" = ANY($${qParams.length}::int[])`; }
      rows = await rawQuery<Record<string, unknown>>(
        `SELECT po.ref, CONCAT('أمر شراء: ', po.ref) AS description,
                po."totalAmount" AS debit, 0 AS credit,
                po."totalAmount" AS net,
                po."createdAt" AS date, po.status AS type
         FROM purchase_orders po WHERE po."supplierId" = $1 AND po."companyId" = $2 AND po."deletedAt" IS NULL ${dateFilter}
         ORDER BY po."createdAt" DESC LIMIT 100`,
        qParams
      );
    }

    const totalDebit = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.debit || 0), 0);
    const totalCredit = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.credit || 0), 0);

    res.json(maskFields(req, { entityName, entityType, rows, summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit, count: rows.length } }));
  } catch (err) {
    handleRouteError(err, res, "Entity statement error:");
  }
});

reportsRouter.get("/reports/custody-advances", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as Record<string, string | undefined>;

    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    dateFilter += getBranchCondition(scope, branchId, params);

    // #2098 FIN-SUB-03 posting-axes — gate on `balancesApplied` (the
    // true source of "is the balance actually moved", per the owner's
    // three-axes decision), and surface `postingStatus` alongside the
    // legacy `status` so the SPA can render the truthful axis. A
    // directly-posted custody carries status='draft' but
    // balancesApplied=true → postingStatus='posted'; this report
    // must include it. An UNPOSTED draft (balancesApplied=false) must
    // NOT enter the totals — drafts haven't actually moved cash.
    const custodies = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status, je."postingStatus", je."documentStatus", je."paymentStatus",
              e.name AS "employeeName", 'custody' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."companyId" = ea."companyId" AND e."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
         AND je.ref LIKE 'CUSTODY%'
         AND je."balancesApplied" = true ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je."postingStatus", je."documentStatus", je."paymentStatus", e.name
       ORDER BY je."createdAt" DESC
       LIMIT 500`,
      params
    );

    const advances = await rawQuery<Record<string, unknown>>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status, je."postingStatus", je."documentStatus", je."paymentStatus",
              e.name AS "employeeName", 'advance' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."companyId" = ea."companyId" AND e."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
         AND je.ref LIKE 'ADV%'
         AND je."balancesApplied" = true ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, je."postingStatus", je."documentStatus", je."paymentStatus", e.name
       ORDER BY je."createdAt" DESC
       LIMIT 500`,
      params
    );

    const totalCustodies = custodies.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
    const totalAdvances = advances.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);

    res.json(maskFields(req, {
      custodies, advances,
      summary: {
        totalCustodies, custodyCount: custodies.length,
        totalAdvances, advanceCount: advances.length,
        total: totalCustodies + totalAdvances,
      }
    }));
  } catch (err) {
    handleRouteError(err, res, "Custody advances report error:");
  }
});

reportsRouter.get("/reports/expenses-analysis", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId, departmentId, projectId, costCenterId, groupBy = "account" } = req.query as Record<string, string | undefined>;

    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    dateFilter += getBranchCondition(scope, branchId, params);
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

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT ${selectCol},
              COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'expense'
       LEFT JOIN branches b ON b.id = je."branchId"
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."companyId" = ea."companyId" AND e."deletedAt" IS NULL
       WHERE jl.debit > jl.credit AND jl."deletedAt" IS NULL
       GROUP BY ${groupCol}
       ORDER BY amount DESC
       LIMIT 500`,
      params
    );

    const total = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
    res.json(maskFields(req, { data: rows, summary: { total, count: rows.length, groupBy } }));
  } catch (err) {
    handleRouteError(err, res, "Expenses analysis error:");
  }
});

reportsRouter.get("/reports/revenue-analysis", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as Record<string, string | undefined>;

    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    dateFilter += getBranchCondition(scope, branchId, params);

    const byAccount = await rawQuery<Record<string, unknown>>(
      `SELECT coa.code, coa.name,
              COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'revenue'
       WHERE jl."deletedAt" IS NULL
       GROUP BY coa.code, coa.name
       ORDER BY amount DESC
       LIMIT 500`,
      params
    );

    const byMonth = await rawQuery<Record<string, unknown>>(
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

    const totalRevenue = byAccount.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount), 0);
    res.json(maskFields(req, { byAccount, byMonth, summary: { totalRevenue, accountCount: byAccount.length } }));
  } catch (err) {
    handleRouteError(err, res, "Revenue analysis error:");
  }
});

reportsRouter.get("/reports/budget-variance", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period, branchId } = req.query as Record<string, string | undefined>;

    const targetPeriod = period || currentPeriod();
    const params: unknown[] = [scope.companyId, targetPeriod];
    const isPrivilegedBV = scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
    if (branchId != null) {
      const bid = Number(branchId);
      if (!isPrivilegedBV && scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(bid)) {
        throw new ForbiddenError("لا تملك صلاحية الاطلاع على بيانات هذا الفرع");
      }
    }
    let branchFilter = "";
    if (branchId) { params.push(Number(branchId)); branchFilter = ` AND b."branchId" = $${params.length}`; }
    else if (!isPrivilegedBV && scope.allowedBranches.length > 0) {
      params.push(scope.allowedBranches); branchFilter = ` AND b."branchId" = ANY($${params.length}::int[])`;
    }

    const rows = await rawQuery<Record<string, unknown>>(
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

    const totalBudget = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.budget || 0), 0);
    const totalActual = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.actual || 0), 0);
    const totalVariance = totalBudget - totalActual;

    res.json(maskFields(req, { data: rows, summary: { totalBudget, totalActual, totalVariance, period: targetPeriod } }));
  } catch (err) {
    handleRouteError(err, res, "Budget variance error:");
  }
});

reportsRouter.get("/reports/cash-bank-statement", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, accountCode = "1100", branchId } = req.query as Record<string, string | undefined>;

    let dateFilter = "";
    const params: unknown[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }
    dateFilter += getBranchCondition(scope, branchId, params);

    const [accountInfo] = await rawQuery<Record<string, unknown>>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, accountCode]
    );

    const entries = await rawQuery<Record<string, unknown>>(
      `SELECT jl.id, je.ref, je.description,
              jl.debit, jl.credit, je."createdAt" AS date,
              b.name AS "branchName"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}
       LEFT JOIN branches b ON b.id = je."branchId"
       WHERE jl."accountCode" = $2 AND jl."deletedAt" IS NULL
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

    res.json(maskFields(req, {
      account: accountInfo,
      entries: enriched,
      summary: { totalDebit, totalCredit, closingBalance: runningBalance, count: entries.length }
    }));
  } catch (err) {
    handleRouteError(err, res, "Cash bank statement error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSIONAL PROFITABILITY REPORTS — Finance Line-Level Allocation Phase 7.
//
// All seven reports read DIRECTLY from journal_lines using the
// dimensional columns landed in migration 201
// (vehicleId, propertyId, projectId, contractId, employeeId,
// umrahSeasonId, umrahAgentId, costCenterId, …). The point of the
// whole Line-Level Allocation campaign is that analytical reports
// stop having to join back to source documents to recompute the
// dimension — the GL is the source of truth.
//
// Each report applies the standard filters that the trial-balance,
// income-statement and balance-sheet reports already use:
//
//   je."deletedAt" IS NULL
//   je."balancesApplied" = true
//   je."reversedById" IS NULL
//
// so drafts and reversed entries don't pollute the totals.
// ─────────────────────────────────────────────────────────────────────────────

// 1. ربحية المركبة — GET /reports/profitability/vehicle/:vehicleId
reportsRouter.get("/reports/profitability/vehicle/:vehicleId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = parseId(req.params.vehicleId, "vehicleId");
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId, vehicleId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL${dateFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $1
        WHERE jl."vehicleId" = $2 AND jl."deletedAt" IS NULL
        GROUP BY coa.code, coa.name, coa.type
        ORDER BY coa.type, coa.code`,
      params
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalExpense = rows.reduce((s, r) => s + Number(r.expense), 0);
    res.json(maskFields(req, {
      vehicleId, accounts: rows,
      summary: { totalRevenue, totalExpense, netProfit: roundTo2(totalRevenue - totalExpense) },
    }));
  } catch (err) { handleRouteError(err, res, "Vehicle profitability error:"); }
});

// 2. ربحية العقار — GET /reports/profitability/property/:propertyId
reportsRouter.get("/reports/profitability/property/:propertyId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const propertyId = parseId(req.params.propertyId, "propertyId");
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId, propertyId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL${dateFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $1
        WHERE jl."propertyId" = $2 AND jl."deletedAt" IS NULL
        GROUP BY coa.code, coa.name, coa.type
        ORDER BY coa.type, coa.code`,
      params
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalExpense = rows.reduce((s, r) => s + Number(r.expense), 0);
    res.json(maskFields(req, {
      propertyId, accounts: rows,
      summary: { totalRevenue, totalExpense, netProfit: roundTo2(totalRevenue - totalExpense) },
    }));
  } catch (err) { handleRouteError(err, res, "Property profitability error:"); }
});

// 3. ربحية المشروع — GET /reports/profitability/project/:projectId
reportsRouter.get("/reports/profitability/project/:projectId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.projectId, "projectId");
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId, projectId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL${dateFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $1
        WHERE jl."projectId" = $2 AND jl."deletedAt" IS NULL
        GROUP BY coa.code, coa.name, coa.type
        ORDER BY coa.type, coa.code`,
      params
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalExpense = rows.reduce((s, r) => s + Number(r.expense), 0);
    res.json(maskFields(req, {
      projectId, accounts: rows,
      summary: { totalRevenue, totalExpense, netProfit: roundTo2(totalRevenue - totalExpense) },
    }));
  } catch (err) { handleRouteError(err, res, "Project profitability error:"); }
});

// 4. ربحية وكيل العمرة — GET /reports/profitability/umrah-agent/:umrahAgentId
reportsRouter.get("/reports/profitability/umrah-agent/:umrahAgentId", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const umrahAgentId = parseId(req.params.umrahAgentId, "umrahAgentId");
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId, umrahAgentId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL${dateFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $1
        WHERE jl."umrahAgentId" = $2 AND jl."deletedAt" IS NULL
        GROUP BY coa.code, coa.name, coa.type
        ORDER BY coa.type, coa.code`,
      params
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
    const totalExpense = rows.reduce((s, r) => s + Number(r.expense), 0);
    res.json(maskFields(req, {
      umrahAgentId, accounts: rows,
      summary: { totalRevenue, totalExpense, netProfit: roundTo2(totalRevenue - totalExpense) },
    }));
  } catch (err) { handleRouteError(err, res, "Umrah agent profitability error:"); }
});

// 5. الإيرادات حسب نوع النشاط — GET /reports/revenue-by-activity-type
reportsRouter.get("/reports/revenue-by-activity-type", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(jl."activityType", '— غير محدد —') AS "activityType",
              COALESCE(SUM(jl.credit - jl.debit), 0) AS revenue,
              COUNT(DISTINCT je.id) AS "entryCount"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL${dateFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'revenue' AND coa."companyId" = $1
        WHERE jl."deletedAt" IS NULL
        GROUP BY jl."activityType"
        ORDER BY revenue DESC`,
      params
    );

    res.json(maskFields(req, { rows, summary: { totalRevenue: rows.reduce((s, r) => s + Number(r.revenue), 0) } }));
  } catch (err) { handleRouteError(err, res, "Revenue by activity type error:"); }
});

// 6. المصروفات حسب مركز التكلفة — GET /reports/expenses-by-cost-center
reportsRouter.get("/reports/expenses-by-cost-center", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT jl."costCenterId",
              cc.name AS "costCenterName",
              cc.code AS "costCenterCode",
              cc.type AS "costCenterType",
              COALESCE(SUM(jl.debit - jl.credit), 0) AS expense,
              COUNT(DISTINCT je.id) AS "entryCount"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
          AND je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL${dateFilter}
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'expense' AND coa."companyId" = $1
         LEFT JOIN cost_centers cc ON cc.id = jl."costCenterId" AND cc."companyId" = $1
        WHERE jl."deletedAt" IS NULL
        GROUP BY jl."costCenterId", cc.name, cc.code, cc.type
        ORDER BY expense DESC`,
      params
    );

    res.json(maskFields(req, { rows, summary: { totalExpense: rows.reduce((s, r) => s + Number(r.expense), 0) } }));
  } catch (err) { handleRouteError(err, res, "Expenses by cost center error:"); }
});

// 7. البنود غير الموجَّهة — GET /reports/unmapped-lines
// Cross-table view of every allocation-eligible line that has not been
// mapped to a specific account. The single most important governance
// report for the operator: drives the «what do I still need to
// allocate before month-end?» workflow.
reportsRouter.get("/reports/unmapped-lines", authorize({ feature: "finance.reports", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, sourceTable } = req.query as Record<string, string | undefined>;

    const params: unknown[] = [scope.companyId];
    let dateFilter = "";
    if (startDate) { params.push(startDate); dateFilter += ` AND s."createdAt" >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   dateFilter += ` AND s."createdAt" < ($${params.length}::date + 1)`; }

    const tableFilter = (table: string) => !sourceTable || sourceTable === table;

    const sections: Array<{ source: string; rows: Record<string, unknown>[] }> = [];

    if (tableFilter("invoice_lines")) {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT il.id, il."invoiceId", il.description, il."lineTotal", i.ref AS "invoiceRef", i.status,
                il."allocationStatus", i."createdAt"
           FROM invoice_lines il
           JOIN invoices i ON i.id = il."invoiceId"
          WHERE i."companyId" = $1
            AND i."deletedAt" IS NULL
            AND il."allocationStatus" = 'unmapped'${dateFilter.replace(/s\./g, "i.")}
          ORDER BY i."createdAt" DESC
          LIMIT 500`,
        params
      );
      sections.push({ source: "invoice_lines", rows });
    }

    if (tableFilter("purchase_order_items")) {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT poi.id, poi."orderId", poi."itemName", poi."lineTotal", po.ref AS "orderRef", po.status,
                poi."allocationStatus", po."createdAt"
           FROM purchase_order_items poi
           JOIN purchase_orders po ON po.id = poi."orderId"
          WHERE po."companyId" = $1
            AND po."deletedAt" IS NULL
            AND poi."allocationStatus" = 'unmapped'${dateFilter.replace(/s\./g, "po.")}
          ORDER BY po."createdAt" DESC
          LIMIT 500`,
        params
      );
      sections.push({ source: "purchase_order_items", rows });
    }

    if (tableFilter("goods_receipt_items")) {
      // goods_receipts has no workflow `status` column (no migration ever
      // added one) — selecting grn.status 500'd this whole report. The
      // frontend treats source status as optional, so NULL is honest.
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT gri.id, gri."grnId", gri."itemName", gri."lineTotal", grn.ref AS "grnRef",
                NULL::text AS status,
                gri."allocationStatus", grn."createdAt"
           FROM goods_receipt_items gri
           JOIN goods_receipts grn ON grn.id = gri."grnId"
          WHERE grn."companyId" = $1
            AND grn."deletedAt" IS NULL
            AND gri."allocationStatus" = 'unmapped'${dateFilter.replace(/s\./g, "grn.")}
          ORDER BY grn."createdAt" DESC
          LIMIT 500`,
        params
      );
      sections.push({ source: "goods_receipt_items", rows });
    }

    const totalCount = sections.reduce((s, x) => s + x.rows.length, 0);
    res.json(maskFields(req, { sections, summary: { totalCount } }));
  } catch (err) { handleRouteError(err, res, "Unmapped lines error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ZATCA WHT summary — Audit follow-up to #999/#1006/#1010.
//
// The WHT campaign now snapshots every withheld tax on
// supplier_payment_allocations (whtAmount/whtRate/whtCategory). Without
// a queryable report, that data is invisible — operators can't reconcile
// the WHT-payable balance before the monthly ZATCA filing.
//
// This endpoint joins SPA + suppliers + journal_entries and returns:
//   * grand total: Σ whtAmount across all WHT-bearing allocations
//   * by-category breakdown (the ZATCA filing demands this split)
//   * by-supplier breakdown (residency + tax number + total withheld)
//   * source rows so an auditor can drill down to each payment
//
// Read-only, no transaction. Date range defaults to the current
// Gregorian month (ZATCA WHT is monthly).
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/wht-summary",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate, supplierId, category } =
        req.query as Record<string, string | undefined>;

      const params: unknown[] = [scope.companyId];
      let whereExtra = "";
      if (startDate) { params.push(startDate); whereExtra += ` AND je."date" >= $${params.length}`; }
      if (endDate)   { params.push(endDate);   whereExtra += ` AND je."date" < ($${params.length}::date + 1)`; }
      if (supplierId) {
        const sid = Number(supplierId);
        if (Number.isFinite(sid) && sid > 0) {
          params.push(sid);
          // SPA points at obligations (PO / nusk-invoice), not the supplier
          // directly. Filter via the joined supplier.
          whereExtra += ` AND sup.id = $${params.length}`;
        }
      }
      if (category) { params.push(category); whereExtra += ` AND spa."whtCategory" = $${params.length}`; }
      const { branchId: requestedBranchId } = req.query as Record<string, string | undefined>;
      const branchFilter = getBranchCondition(scope, requestedBranchId, params);

      // The SPA row holds the obligation id; suppliers come from the
      // obligation table (purchase_orders for now — nusk_invoice has
      // its own agent linkage, not a supplier FK). Only POs carry
      // residency, so the LEFT JOIN keeps nusk-invoice rows in the
      // report with NULL supplier fields rather than dropping them.
      const baseSql = `
        FROM supplier_payment_allocations spa
        JOIN journal_entries je
          ON je.id = spa."journalEntryId"
         AND je."deletedAt" IS NULL
         AND je."balancesApplied" = true
         AND je."reversedById" IS NULL
        LEFT JOIN purchase_orders po
          ON po.id = spa."obligationId"
         AND spa."obligationType" = 'purchase_order'
         AND po."deletedAt" IS NULL
        LEFT JOIN suppliers sup
          ON sup.id = po."supplierId"
         AND sup."deletedAt" IS NULL
        LEFT JOIN wht_categories cat
          ON cat."companyId" = spa."companyId"
         AND cat.code = spa."whtCategory"
         AND cat."deletedAt" IS NULL
        WHERE spa."companyId" = $1
          AND spa."deletedAt" IS NULL
          AND COALESCE(spa."whtAmount", 0) > 0
          ${whereExtra}${branchFilter}
      `;

      interface DetailRow {
        allocationId: number;
        journalEntryId: number;
        journalRef: string | null;
        postingDate: string | null;
        obligationType: string;
        obligationId: number;
        amount: string | number;
        whtAmount: string | number;
        whtRate: string | number | null;
        whtCategory: string | null;
        whtCategoryName: string | null;
        whtCategoryAppliesTo: string | null;
        supplierId: number | null;
        supplierName: string | null;
        supplierTaxNumber: string | null;
        supplierResidencyStatus: string | null;
        supplierTaxResidenceCountry: string | null;
      }

      const rows = await rawQuery<DetailRow>(
        `SELECT spa.id           AS "allocationId",
                spa."journalEntryId",
                je.ref            AS "journalRef",
                je."date"::text AS "postingDate",
                spa."obligationType",
                spa."obligationId",
                spa.amount::float8        AS amount,
                spa."whtAmount"::float8   AS "whtAmount",
                spa."whtRate"::float8     AS "whtRate",
                spa."whtCategory",
                cat.name                  AS "whtCategoryName",
                cat."appliesTo"           AS "whtCategoryAppliesTo",
                sup.id                    AS "supplierId",
                sup.name                  AS "supplierName",
                sup."taxNumber"           AS "supplierTaxNumber",
                sup."residencyStatus"     AS "supplierResidencyStatus",
                sup."taxResidenceCountry" AS "supplierTaxResidenceCountry"
         ${baseSql}
         ORDER BY je."date" DESC NULLS LAST, spa.id DESC
         LIMIT 5000`,
        params,
      );

      // Roll-ups (computed in JS to keep the SQL one round-trip).
      const byCategory = new Map<string, {
        category: string;
        categoryName: string | null;
        appliesTo: string | null;
        wht: number;
        gross: number;     // amount + whtAmount
        net: number;       // amount (cash to supplier)
        rows: number;
      }>();
      const bySupplier = new Map<number, {
        supplierId: number;
        supplierName: string | null;
        taxNumber: string | null;
        residencyStatus: string | null;
        taxResidenceCountry: string | null;
        wht: number;
        gross: number;
        net: number;
        rows: number;
      }>();
      let totalWht = 0;
      let totalNet = 0;
      let totalGross = 0;

      for (const r of rows) {
        const wht = Number(r.whtAmount ?? 0);
        const net = Number(r.amount ?? 0);
        const gross = net + wht;
        totalWht += wht;
        totalNet += net;
        totalGross += gross;

        const catKey = r.whtCategory ?? "_uncat";
        const cat = byCategory.get(catKey) ?? {
          category: catKey, categoryName: r.whtCategoryName,
          appliesTo: r.whtCategoryAppliesTo,
          wht: 0, gross: 0, net: 0, rows: 0,
        };
        cat.wht += wht; cat.gross += gross; cat.net += net; cat.rows += 1;
        byCategory.set(catKey, cat);

        if (r.supplierId != null) {
          const sup = bySupplier.get(r.supplierId) ?? {
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            taxNumber: r.supplierTaxNumber,
            residencyStatus: r.supplierResidencyStatus,
            taxResidenceCountry: r.supplierTaxResidenceCountry,
            wht: 0, gross: 0, net: 0, rows: 0,
          };
          sup.wht += wht; sup.gross += gross; sup.net += net; sup.rows += 1;
          bySupplier.set(r.supplierId, sup);
        }
      }

      res.json(maskFields(req, {
        filters: { startDate, endDate, supplierId, category },
        summary: {
          totalWht: roundTo2(totalWht),
          totalNet: roundTo2(totalNet),
          totalGross: roundTo2(totalGross),
          rowCount: rows.length,
        },
        byCategory: Array.from(byCategory.values())
          .map((c) => ({ ...c, wht: roundTo2(c.wht), gross: roundTo2(c.gross), net: roundTo2(c.net) }))
          .sort((a, b) => b.wht - a.wht),
        bySupplier: Array.from(bySupplier.values())
          .map((s) => ({ ...s, wht: roundTo2(s.wht), gross: roundTo2(s.gross), net: roundTo2(s.net) }))
          .sort((a, b) => b.wht - a.wht),
        data: rows,
      }));
    } catch (err) {
      handleRouteError(err, res, "WHT summary error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Lot expiry alerts — FIFO + waste management.
//
// Lists active qc-approved lots whose expiryDate falls inside the
// requested look-ahead window (default 90 days). Each row carries
// the days-until-expiry, on-hand quantity, exposure value
// (quantity × unitCost), and the per-warehouse alert thresholds
// from warehouses.expiryAlertDays so the operator can see whether
// a row should fire the 30-day / 60-day / 90-day alert.
//
// Why operators need this:
//   * FIFO compliance — sell oldest first or write off.
//   * Cash exposure — every day past expiry is potential write-off.
//   * Procurement planning — over-stocked perishables get reorder
//     paused; under-stocked SKUs surface as well via daysUntil < 0.
//
// Already-expired lots (lot.status='expired') are EXCLUDED — those
// belong on the negative-stock / write-off reports, not the
// pre-expiry alert. Pass ?includeExpired=true to override.
//
// Read-only, no transaction.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/lot-expiry-alerts",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { warehouseId, productId, daysAhead, includeExpired } =
        req.query as Record<string, string | undefined>;

      // Default look-ahead = 90 days; cap at 365 so a typo doesn't
      // scan the entire inventory + emit megabytes.
      const aheadParsed = Number(daysAhead ?? "90");
      const aheadDays = Number.isFinite(aheadParsed) && aheadParsed > 0
        ? Math.min(Math.floor(aheadParsed), 365)
        : 90;

      const params: unknown[] = [scope.companyId, aheadDays];
      let whereExtra = "";
      if (warehouseId) {
        const wid = Number(warehouseId);
        if (Number.isFinite(wid) && wid > 0) {
          params.push(wid);
          whereExtra += ` AND l."warehouseId" = $${params.length}`;
        }
      }
      if (productId) {
        const pid = Number(productId);
        if (Number.isFinite(pid) && pid > 0) {
          params.push(pid);
          whereExtra += ` AND l."productId" = $${params.length}`;
        }
      }
      // Default: hide already-expired lots — they need a different
      // workflow (write-off, not pre-expiry alert).
      const expiredFilter = includeExpired === "true"
        ? ""
        : ` AND l.status != 'expired'`;
      // Branch scope via the warehouse.
      const branchFilter = getBranchCondition(scope, undefined, params, "w");

      interface ExpiryRow {
        lotId: number;
        productId: number;
        sku: string | null;
        productName: string;
        warehouseId: number;
        warehouseName: string | null;
        warehouseCode: string | null;
        expiryAlertDays: number[] | null;
        lotNumber: string;
        quantity: string | number;
        unitCost: string | number;
        exposureValue: string | number;
        expiryDate: string;
        daysUntil: string | number;
        status: string;
      }

      const rows = await rawQuery<ExpiryRow>(
        `SELECT l.id                            AS "lotId",
                l."productId",
                p.sku,
                p.name                          AS "productName",
                l."warehouseId",
                w.name                          AS "warehouseName",
                w.code                          AS "warehouseCode",
                w."expiryAlertDays"             AS "expiryAlertDays",
                l."lotNumber",
                l.quantity::float8              AS quantity,
                l."unitCost"::float8            AS "unitCost",
                (l.quantity * l."unitCost")::float8 AS "exposureValue",
                l."expiryDate"::text            AS "expiryDate",
                (l."expiryDate" - CURRENT_DATE)::int AS "daysUntil",
                l.status
           FROM warehouse_stock_lots l
           LEFT JOIN warehouses w
             ON w.id = l."warehouseId" AND w."deletedAt" IS NULL
           LEFT JOIN warehouse_products p
             ON p.id = l."productId" AND p."deletedAt" IS NULL
          WHERE l."companyId" = $1
            AND l."deletedAt" IS NULL
            AND l.quantity > 0
            AND l."qualityControlStatus" = 'approved'
            AND l."expiryDate" IS NOT NULL
            AND l."expiryDate" <= (CURRENT_DATE + ($2 || ' days')::interval)
            ${expiredFilter}${whereExtra}${branchFilter}
          ORDER BY l."expiryDate" ASC, l.id ASC
          LIMIT 2000`,
        params,
      );

      // Bucket each row into the WORST alert threshold it crosses,
      // using the warehouse's own expiryAlertDays array (default
      // seeded with [30, 60, 90] in migration; falls back to that
      // when the column is null). The "bucket" is the lowest
      // threshold that the row's daysUntil meets or exceeds — i.e.
      // a row 25 days out lands in the "30" bucket, a row 55 days
      // out lands in the "60" bucket, …
      const DEFAULT_BUCKETS = [30, 60, 90];
      const bucketCounts = new Map<string, { threshold: number | "overdue"; lotCount: number; exposureValue: number }>();

      let totalExposure = 0;
      const out = rows.map((r) => {
        const daysUntil = Number(r.daysUntil ?? 0);
        const exposure = Number(r.exposureValue ?? 0);
        totalExposure += exposure;
        const wbuckets = Array.isArray(r.expiryAlertDays) && r.expiryAlertDays.length > 0
          ? [...r.expiryAlertDays].sort((a, b) => a - b)
          : DEFAULT_BUCKETS;

        let bucketLabel: number | "overdue";
        if (daysUntil < 0) {
          bucketLabel = "overdue";
        } else {
          // Pick the smallest threshold ≥ daysUntil; fall back to the
          // largest configured threshold if none fits (row still
          // surfaces but in the "loosest" bucket).
          const fit = wbuckets.find((t) => daysUntil <= t);
          bucketLabel = fit ?? wbuckets[wbuckets.length - 1];
        }
        const key = String(bucketLabel);
        const b = bucketCounts.get(key) ?? {
          threshold: bucketLabel, lotCount: 0, exposureValue: 0,
        };
        b.lotCount += 1;
        b.exposureValue += exposure;
        bucketCounts.set(key, b);
        return {
          ...r,
          quantity: roundTo2(Number(r.quantity ?? 0)),
          unitCost: roundTo2(Number(r.unitCost ?? 0)),
          exposureValue: roundTo2(exposure),
          daysUntil,
          alertBucket: bucketLabel,
        };
      });

      res.json(maskFields(req, {
        filters: { warehouseId, productId, daysAhead: aheadDays, includeExpired: includeExpired === "true" },
        summary: {
          lotCount: rows.length,
          totalExposureValue: roundTo2(totalExposure),
          windowDays: aheadDays,
        },
        byBucket: Array.from(bucketCounts.values())
          .map((b) => ({ ...b, exposureValue: roundTo2(b.exposureValue) }))
          .sort((a, b) => {
            // "overdue" first, then ascending threshold (most-urgent first)
            if (a.threshold === "overdue") return -1;
            if (b.threshold === "overdue") return 1;
            return (a.threshold as number) - (b.threshold as number);
          }),
        data: out,
      }));
    } catch (err) {
      handleRouteError(err, res, "Lot expiry alerts error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Inventory turnover ratio — companion to #1033 (inventory valuation)
// and the COGS summary endpoint.
//
//     turnover     = period COGS / inventory value at end of period
//     daysOnHand   = period days / turnover         (DSI proxy)
//
// Period COGS comes from invoice_lines.cogsAmount − cogsReversedAmount
// (net of returns) filtered on cogsPostedAt; inventory value comes
// from Σ (lot.quantity × lot.unitCost) on the same active-lot set the
// valuation report uses. Pure read-only.
//
// Per-product roll-up so operators can spot dead-stock SKUs
// (turnover < 1) and over-stocked best-sellers (high turnover →
// frequent reorders). The header summary is the company-wide ratio.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/inventory-turnover",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate, productId, warehouseId } =
        req.query as Record<string, string | undefined>;

      const start = startDate ?? null;
      const end = endDate ?? null;

      // ── 1. Period COGS by product ────────────────────────────────────
      const cogsParams: unknown[] = [scope.companyId];
      let cogsExtra = "";
      if (start) { cogsParams.push(start); cogsExtra += ` AND il."cogsPostedAt" >= $${cogsParams.length}`; }
      if (end)   { cogsParams.push(end);   cogsExtra += ` AND il."cogsPostedAt" < ($${cogsParams.length}::date + 1)`; }
      if (productId) {
        const pid = Number(productId);
        if (Number.isFinite(pid) && pid > 0) {
          cogsParams.push(pid);
          cogsExtra += ` AND il."productId" = $${cogsParams.length}`;
        }
      }
      const cogsBranchFilter = getBranchCondition(scope, undefined, cogsParams, "i");

      const cogsRows = await rawQuery<{
        productId: number;
        cogsNet: string | number;
      }>(
        `SELECT il."productId",
                SUM(COALESCE(il."cogsAmount", 0) - COALESCE(il."cogsReversedAmount", 0))::float8 AS "cogsNet"
           FROM invoice_lines il
           JOIN invoices i ON i.id = il."invoiceId" AND i."deletedAt" IS NULL
          WHERE i."companyId" = $1
            AND il."productId" IS NOT NULL
            AND il."cogsPostedAt" IS NOT NULL
            AND COALESCE(il."cogsAmount", 0) > 0
            ${cogsExtra}${cogsBranchFilter}
          GROUP BY il."productId"`,
        cogsParams,
      );
      const cogsByProduct = new Map<number, number>();
      for (const r of cogsRows) {
        cogsByProduct.set(r.productId, Number(r.cogsNet ?? 0));
      }

      // ── 2. Current inventory value by product ─────────────────────────
      const invParams: unknown[] = [scope.companyId];
      let invExtra = "";
      if (warehouseId) {
        const wid = Number(warehouseId);
        if (Number.isFinite(wid) && wid > 0) {
          invParams.push(wid);
          invExtra += ` AND l."warehouseId" = $${invParams.length}`;
        }
      }
      if (productId) {
        const pid = Number(productId);
        if (Number.isFinite(pid) && pid > 0) {
          invParams.push(pid);
          invExtra += ` AND p.id = $${invParams.length}`;
        }
      }
      const invBranchFilter = getBranchCondition(scope, undefined, invParams, "w");

      const invRows = await rawQuery<{
        productId: number;
        sku: string | null;
        name: string;
        warehouseId: number | null;
        warehouseName: string | null;
        onHandQty: string | number;
        value: string | number;
      }>(
        `SELECT p.id                            AS "productId",
                p.sku,
                p.name,
                MAX(l."warehouseId")            AS "warehouseId",
                MAX(w.name)                     AS "warehouseName",
                SUM(COALESCE(l.quantity, 0))::float8 AS "onHandQty",
                SUM(COALESCE(l.quantity, 0) * COALESCE(l."unitCost", 0))::float8 AS value
           FROM warehouse_products p
           LEFT JOIN warehouse_stock_lots l
             ON l."productId" = p.id
            AND l."companyId" = p."companyId"
            AND l.status = 'active'
            AND l."qualityControlStatus" = 'approved'
            AND l."deletedAt" IS NULL
           LEFT JOIN warehouses w
             ON w.id = l."warehouseId"
            AND w."deletedAt" IS NULL
          WHERE p."companyId" = $1
            AND p."deletedAt" IS NULL
            AND COALESCE(p.status, 'active') = 'active'
            ${invExtra}${invBranchFilter}
          GROUP BY p.id, p.sku, p.name`,
        invParams,
      );

      // ── 3. Period-day count for daysOnHand ───────────────────────────
      let periodDays: number | null = null;
      if (start && end) {
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (Number.isFinite(ms) && ms >= 0) {
          // +1 because both endpoints are inclusive in our SQL.
          periodDays = Math.floor(ms / 86400_000) + 1;
        }
      }

      // ── 4. Join into per-product turnover rows ────────────────────────
      interface TurnoverRow {
        productId: number;
        sku: string | null;
        name: string;
        warehouseId: number | null;
        warehouseName: string | null;
        onHandQty: number;
        currentValue: number;
        periodCogs: number;
        turnover: number | null;   // null when value=0 (avoid /0)
        daysOnHand: number | null; // null when turnover=0 or period unknown
      }

      const rows: TurnoverRow[] = invRows.map((p) => {
        const value = Number(p.value ?? 0);
        const periodCogs = cogsByProduct.get(p.productId) ?? 0;
        const turnover = value > 0 ? periodCogs / value : null;
        const daysOnHand = (turnover != null && turnover > 0 && periodDays != null)
          ? Math.round((periodDays / turnover) * 100) / 100
          : null;
        return {
          productId: p.productId,
          sku: p.sku,
          name: p.name,
          warehouseId: p.warehouseId,
          warehouseName: p.warehouseName,
          onHandQty: roundTo2(Number(p.onHandQty ?? 0)),
          currentValue: roundTo2(value),
          periodCogs: roundTo2(periodCogs),
          turnover: turnover != null ? Math.round(turnover * 100) / 100 : null,
          daysOnHand,
        };
      });

      // ── 5. Header summary (company-wide ratio) ───────────────────────
      const totalValue = rows.reduce((s, r) => s + r.currentValue, 0);
      const totalCogs  = rows.reduce((s, r) => s + r.periodCogs, 0);
      const overallTurnover = totalValue > 0
        ? Math.round((totalCogs / totalValue) * 100) / 100
        : null;
      const overallDaysOnHand = (overallTurnover != null && overallTurnover > 0 && periodDays != null)
        ? Math.round((periodDays / overallTurnover) * 100) / 100
        : null;

      res.json(maskFields(req, {
        filters: { startDate, endDate, productId, warehouseId },
        period: { days: periodDays },
        summary: {
          totalCurrentValue: roundTo2(totalValue),
          totalPeriodCogs:   roundTo2(totalCogs),
          overallTurnover,
          overallDaysOnHand,
          productCount: rows.length,
        },
        data: rows.sort((a, b) => (b.turnover ?? -1) - (a.turnover ?? -1)),
      }));
    } catch (err) {
      handleRouteError(err, res, "Inventory turnover report error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Inventory valuation report — audit follow-up to the COGS campaign.
//
// Σ (lot.quantity × lot.unitCost) over every ACTIVE, qc-APPROVED lot
// owned by the company — i.e. the on-hand stock-asset book value. This
// is the number the period-end balance sheet's Inventory line should
// match, and the figure ZATCA expects in the annual return.
//
// Why not read warehouse_products.lastWaCost × currentStock?
//   * lastWaCost is denormalised — a partial recall / write-off that
//     bypassed the WA recompute leaves it stale.
//   * currentStock is INT (legacy column) while lots carry NUMERIC(14,3).
//   * Lots carry the originalQuantity history so a future "as-of" cut
//     (?asOf=2026-04-30) becomes a one-line WHERE addition.
//
// Read-only, no transaction.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/inventory-valuation",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const {
        warehouseId, categoryId, productId,
        includeZeroStock,
      } = req.query as Record<string, string | undefined>;

      const params: unknown[] = [scope.companyId];
      let whereExtra = "";
      if (warehouseId) {
        const wid = Number(warehouseId);
        if (Number.isFinite(wid) && wid > 0) {
          params.push(wid);
          whereExtra += ` AND l."warehouseId" = $${params.length}`;
        }
      }
      if (categoryId) {
        const cid = Number(categoryId);
        if (Number.isFinite(cid) && cid > 0) {
          params.push(cid);
          whereExtra += ` AND p."categoryId" = $${params.length}`;
        }
      }
      if (productId) {
        const pid = Number(productId);
        if (Number.isFinite(pid) && pid > 0) {
          params.push(pid);
          whereExtra += ` AND p.id = $${params.length}`;
        }
      }
      // Branch scope honoured via the warehouse it belongs to.
      const branchFilter = getBranchCondition(scope, undefined, params, "w");

      // Per-product roll-up. Zero-stock products are excluded by default
      // (their book value is 0 and the list would balloon to thousands
      // of dormant SKUs); pass ?includeZeroStock=true to surface them
      // for reorder-alert dashboards.
      const havingClause = includeZeroStock === "true" ? "" : `HAVING SUM(COALESCE(l.quantity, 0)) > 0`;

      interface ProductRow {
        productId: number;
        sku: string | null;
        name: string;
        categoryId: number | null;
        categoryName: string | null;
        warehouseId: number | null;
        warehouseName: string | null;
        warehouseCode: string | null;
        costingMethod: string | null;
        lastWaCost: string | number | null;
        onHandQty: string | number;
        lotCount: string | number;
        valuation: string | number;
        weightedAvgCost: string | number;
      }

      const rows = await rawQuery<ProductRow>(
        `SELECT p.id              AS "productId",
                p.sku,
                p.name,
                p."categoryId",
                cat.name          AS "categoryName",
                l."warehouseId",
                w.name            AS "warehouseName",
                w.code            AS "warehouseCode",
                p."costingMethod",
                p."lastWaCost"::float8           AS "lastWaCost",
                SUM(COALESCE(l.quantity, 0))::float8   AS "onHandQty",
                COUNT(l.id) FILTER (WHERE l.quantity > 0)::int  AS "lotCount",
                SUM(COALESCE(l.quantity, 0) * COALESCE(l."unitCost", 0))::float8 AS valuation,
                CASE WHEN SUM(COALESCE(l.quantity, 0)) > 0
                     THEN SUM(COALESCE(l.quantity, 0) * COALESCE(l."unitCost", 0))
                          / SUM(COALESCE(l.quantity, 0))
                     ELSE 0
                END::float8       AS "weightedAvgCost"
           FROM warehouse_products p
           LEFT JOIN warehouse_stock_lots l
             ON l."productId" = p.id
            AND l."companyId" = p."companyId"
            AND l.status = 'active'
            AND l."qualityControlStatus" = 'approved'
            AND l."deletedAt" IS NULL
           LEFT JOIN warehouses w
             ON w.id = l."warehouseId"
            AND w."deletedAt" IS NULL
           LEFT JOIN warehouse_categories cat
             ON cat.id = p."categoryId"
            AND cat."deletedAt" IS NULL
          WHERE p."companyId" = $1
            AND p."deletedAt" IS NULL
            AND COALESCE(p.status, 'active') = 'active'
            ${whereExtra}${branchFilter}
          GROUP BY p.id, p.sku, p.name, p."categoryId", cat.name,
                   l."warehouseId", w.name, w.code,
                   p."costingMethod", p."lastWaCost"
          ${havingClause}
          ORDER BY valuation DESC, p.name ASC
          LIMIT 10000`,
        params,
      );

      // Per-warehouse + per-category rollups (JS keeps the SQL single
      // round-trip; product-level rows in the response already carry
      // both keys for client-side regrouping if they want a different cut).
      const byWarehouse = new Map<number, {
        warehouseId: number;
        warehouseName: string | null;
        warehouseCode: string | null;
        valuation: number;
        onHandQty: number;
        productCount: number;
        lotCount: number;
      }>();
      const byCategory = new Map<number | "_uncat", {
        categoryId: number | null;
        categoryName: string | null;
        valuation: number;
        onHandQty: number;
        productCount: number;
      }>();
      let totalValuation = 0;
      let totalOnHandQty = 0;
      let totalLots = 0;

      for (const r of rows) {
        const val = Number(r.valuation ?? 0);
        const qty = Number(r.onHandQty ?? 0);
        const lots = Number(r.lotCount ?? 0);
        totalValuation += val;
        totalOnHandQty += qty;
        totalLots += lots;

        if (r.warehouseId != null) {
          const w = byWarehouse.get(r.warehouseId) ?? {
            warehouseId: r.warehouseId,
            warehouseName: r.warehouseName,
            warehouseCode: r.warehouseCode,
            valuation: 0, onHandQty: 0, productCount: 0, lotCount: 0,
          };
          w.valuation += val;
          w.onHandQty += qty;
          w.productCount += 1;
          w.lotCount += lots;
          byWarehouse.set(r.warehouseId, w);
        }

        const catKey = r.categoryId ?? "_uncat";
        const cat = byCategory.get(catKey) ?? {
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          valuation: 0, onHandQty: 0, productCount: 0,
        };
        cat.valuation += val;
        cat.onHandQty += qty;
        cat.productCount += 1;
        byCategory.set(catKey, cat);
      }

      res.json(maskFields(req, {
        filters: { warehouseId, categoryId, productId, includeZeroStock: includeZeroStock === "true" },
        summary: {
          totalValuation: roundTo2(totalValuation),
          totalOnHandQty: roundTo2(totalOnHandQty),
          totalLots,
          productRows: rows.length,
        },
        byWarehouse: Array.from(byWarehouse.values())
          .map((w) => ({ ...w, valuation: roundTo2(w.valuation), onHandQty: roundTo2(w.onHandQty) }))
          .sort((a, b) => b.valuation - a.valuation),
        byCategory: Array.from(byCategory.values())
          .map((c) => ({ ...c, valuation: roundTo2(c.valuation), onHandQty: roundTo2(c.onHandQty) }))
          .sort((a, b) => b.valuation - a.valuation),
        data: rows.map((r) => ({
          ...r,
          onHandQty: roundTo2(Number(r.onHandQty ?? 0)),
          valuation: roundTo2(Number(r.valuation ?? 0)),
          weightedAvgCost: roundTo2(Number(r.weightedAvgCost ?? 0)),
          lastWaCost: r.lastWaCost == null ? null : roundTo2(Number(r.lastWaCost)),
        })),
      }));
    } catch (err) {
      handleRouteError(err, res, "Inventory valuation report error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// COGS / margin summary — audit follow-up to the COGS campaign
// (#1002/#1013/#1017). The COGS engine now writes per-line cogsAmount
// + cogsReversedAmount snapshots; this endpoint surfaces them as the
// gross-margin view operators have been missing.
//
// Per-line:
//   revenue   = invoice_lines.lineTotal                       (billed)
//   cogs      = cogsAmount − cogsReversedAmount                (net of returns)
//   profit    = revenue − cogs
//   marginPct = profit / revenue × 100
//
// Rollups: per-product, per-client, per-month.
//
// Filters honour startDate / endDate (against invoice approval date),
// product / client narrowing, and branch scope. Excludes lines from
// invoices that were reversed or never approved (cogsPostedAt IS NOT NULL).
//
// Read-only, no transaction.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/cogs-summary",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate, productId, clientId } =
        req.query as Record<string, string | undefined>;

      const params: unknown[] = [scope.companyId];
      let whereExtra = "";
      if (startDate) { params.push(startDate); whereExtra += ` AND il."cogsPostedAt" >= $${params.length}`; }
      if (endDate)   { params.push(endDate);   whereExtra += ` AND il."cogsPostedAt" < ($${params.length}::date + 1)`; }
      if (productId) {
        const pid = Number(productId);
        if (Number.isFinite(pid) && pid > 0) {
          params.push(pid);
          whereExtra += ` AND il."productId" = $${params.length}`;
        }
      }
      if (clientId) {
        const cid = Number(clientId);
        if (Number.isFinite(cid) && cid > 0) {
          params.push(cid);
          whereExtra += ` AND i."clientId" = $${params.length}`;
        }
      }
      const branchFilter = getBranchCondition(scope, undefined, params, "i");

      interface CogsRow {
        invoiceLineId: number;
        invoiceId: number;
        invoiceRef: string;
        clientId: number | null;
        clientName: string | null;
        productId: number | null;
        productSku: string | null;
        productName: string | null;
        cogsPostedAt: string | null;
        period: string | null;     // YYYY-MM
        quantity: string | number;
        revenue: string | number;
        cogsGross: string | number;
        cogsReversed: string | number;
        cogsNet: string | number;
        profit: string | number;
      }

      // Only invoice lines that actually had COGS posted by the engine
      // make it into the report — cogsPostedAt IS NOT NULL guards out
      // un-approved drafts AND service lines.
      const rows = await rawQuery<CogsRow>(
        `SELECT il.id                    AS "invoiceLineId",
                i.id                     AS "invoiceId",
                i.ref                    AS "invoiceRef",
                i."clientId",
                c.name                   AS "clientName",
                il."productId",
                p.sku                    AS "productSku",
                p.name                   AS "productName",
                il."cogsPostedAt"::text  AS "cogsPostedAt",
                to_char(il."cogsPostedAt", 'YYYY-MM') AS period,
                il.quantity::float8      AS quantity,
                il."lineTotal"::float8   AS revenue,
                COALESCE(il."cogsAmount", 0)::float8         AS "cogsGross",
                COALESCE(il."cogsReversedAmount", 0)::float8 AS "cogsReversed",
                (COALESCE(il."cogsAmount", 0) - COALESCE(il."cogsReversedAmount", 0))::float8 AS "cogsNet",
                (il."lineTotal" -
                   (COALESCE(il."cogsAmount", 0) - COALESCE(il."cogsReversedAmount", 0)))::float8 AS profit
           FROM invoice_lines il
           JOIN invoices i ON i.id = il."invoiceId" AND i."deletedAt" IS NULL
           LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
           LEFT JOIN warehouse_products p ON p.id = il."productId" AND p."deletedAt" IS NULL
          WHERE i."companyId" = $1
            AND COALESCE(il."cogsAmount", 0) > 0
            AND il."cogsPostedAt" IS NOT NULL
            ${whereExtra}${branchFilter}
          ORDER BY il."cogsPostedAt" DESC NULLS LAST, il.id DESC
          LIMIT 10000`,
        params,
      );

      const byProduct = new Map<number, {
        productId: number;
        sku: string | null;
        name: string | null;
        quantity: number;
        revenue: number;
        cogsNet: number;
        profit: number;
        marginPct: number;
        rows: number;
      }>();
      const byClient = new Map<number, {
        clientId: number;
        clientName: string | null;
        revenue: number;
        cogsNet: number;
        profit: number;
        marginPct: number;
        rows: number;
      }>();
      const byPeriod = new Map<string, {
        period: string;
        revenue: number;
        cogsNet: number;
        profit: number;
        marginPct: number;
        rows: number;
      }>();
      let totalRevenue = 0;
      let totalCogsGross = 0;
      let totalCogsReversed = 0;
      let totalProfit = 0;

      for (const r of rows) {
        const revenue = Number(r.revenue ?? 0);
        const cogsGross = Number(r.cogsGross ?? 0);
        const cogsReversed = Number(r.cogsReversed ?? 0);
        const cogsNet = cogsGross - cogsReversed;
        const profit = revenue - cogsNet;
        const quantity = Number(r.quantity ?? 0);

        totalRevenue += revenue;
        totalCogsGross += cogsGross;
        totalCogsReversed += cogsReversed;
        totalProfit += profit;

        if (r.productId != null) {
          const p = byProduct.get(r.productId) ?? {
            productId: r.productId, sku: r.productSku, name: r.productName,
            quantity: 0, revenue: 0, cogsNet: 0, profit: 0, marginPct: 0, rows: 0,
          };
          p.quantity += quantity;
          p.revenue += revenue;
          p.cogsNet += cogsNet;
          p.profit += profit;
          p.rows += 1;
          byProduct.set(r.productId, p);
        }

        if (r.clientId != null) {
          const cl = byClient.get(r.clientId) ?? {
            clientId: r.clientId, clientName: r.clientName,
            revenue: 0, cogsNet: 0, profit: 0, marginPct: 0, rows: 0,
          };
          cl.revenue += revenue;
          cl.cogsNet += cogsNet;
          cl.profit += profit;
          cl.rows += 1;
          byClient.set(r.clientId, cl);
        }

        if (r.period) {
          const per = byPeriod.get(r.period) ?? {
            period: r.period,
            revenue: 0, cogsNet: 0, profit: 0, marginPct: 0, rows: 0,
          };
          per.revenue += revenue;
          per.cogsNet += cogsNet;
          per.profit += profit;
          per.rows += 1;
          byPeriod.set(r.period, per);
        }
      }

      const pct = (profit: number, revenue: number) =>
        revenue > 0 ? roundTo2((profit / revenue) * 100) : 0;

      res.json(maskFields(req, {
        filters: { startDate, endDate, productId, clientId },
        summary: {
          totalRevenue:      roundTo2(totalRevenue),
          totalCogsGross:    roundTo2(totalCogsGross),
          totalCogsReversed: roundTo2(totalCogsReversed),
          totalCogsNet:      roundTo2(totalCogsGross - totalCogsReversed),
          totalProfit:       roundTo2(totalProfit),
          marginPct:         pct(totalProfit, totalRevenue),
          rowCount:          rows.length,
        },
        byProduct: Array.from(byProduct.values())
          .map((p) => ({
            ...p,
            quantity: roundTo2(p.quantity),
            revenue: roundTo2(p.revenue),
            cogsNet: roundTo2(p.cogsNet),
            profit: roundTo2(p.profit),
            marginPct: pct(p.profit, p.revenue),
          }))
          .sort((a, b) => b.profit - a.profit),
        byClient: Array.from(byClient.values())
          .map((cl) => ({
            ...cl,
            revenue: roundTo2(cl.revenue),
            cogsNet: roundTo2(cl.cogsNet),
            profit: roundTo2(cl.profit),
            marginPct: pct(cl.profit, cl.revenue),
          }))
          .sort((a, b) => b.profit - a.profit),
        byPeriod: Array.from(byPeriod.values())
          .map((per) => ({
            ...per,
            revenue: roundTo2(per.revenue),
            cogsNet: roundTo2(per.cogsNet),
            profit: roundTo2(per.profit),
            marginPct: pct(per.profit, per.revenue),
          }))
          .sort((a, b) => (a.period < b.period ? -1 : 1)),
        data: rows,
      }));
    } catch (err) {
      handleRouteError(err, res, "COGS summary error:");
    }
  },
);
// ─────────────────────────────────────────────────────────────────────────────
// Negative-stock outliers — companion to the inventory valuation report.
//
// A lot row should NEVER go negative. When it does, one of three bugs
// is at play:
//
//   1. A sale was approved without the lot decrement guard catching
//      insufficient stock (pre-#1013 invoices, or a manual SQL fix).
//   2. A stocktake adjustment that subtracted more than the on-hand
//      quantity bypassed the floor.
//   3. A double-applied stock movement (idempotency replay before #885's
//      reentrant-tx engine landed).
//
// Surfacing these as a queryable list lets ops investigate + correct
// before the period-end valuation report claims a negative inventory
// asset. Pairs with the inventory-valuation report (#1033).
//
// Read-only, no transaction.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/negative-stock",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { warehouseId, productId } =
        req.query as Record<string, string | undefined>;

      const params: unknown[] = [scope.companyId];
      let whereExtra = "";
      if (warehouseId) {
        const wid = Number(warehouseId);
        if (Number.isFinite(wid) && wid > 0) {
          params.push(wid);
          whereExtra += ` AND l."warehouseId" = $${params.length}`;
        }
      }
      if (productId) {
        const pid = Number(productId);
        if (Number.isFinite(pid) && pid > 0) {
          params.push(pid);
          whereExtra += ` AND l."productId" = $${params.length}`;
        }
      }
      // Branch scope via the warehouse the lot belongs to.
      const branchFilter = getBranchCondition(scope, undefined, params, "w");

      interface NegLotRow {
        lotId: number;
        productId: number;
        sku: string | null;
        productName: string | null;
        warehouseId: number;
        warehouseName: string | null;
        warehouseCode: string | null;
        lotNumber: string;
        quantity: string | number;
        originalQuantity: string | number;
        unitCost: string | number;
        receivedDate: string;
        status: string;
        deficitValue: string | number;
        latestMovementAt: string | null;
        latestMovementType: string | null;
        latestJournalEntryId: number | null;
      }

      const rows = await rawQuery<NegLotRow>(
        `SELECT l.id                          AS "lotId",
                l."productId",
                p.sku,
                p.name                        AS "productName",
                l."warehouseId",
                w.name                        AS "warehouseName",
                w.code                        AS "warehouseCode",
                l."lotNumber",
                l.quantity::float8            AS quantity,
                l."originalQuantity"::float8  AS "originalQuantity",
                l."unitCost"::float8          AS "unitCost",
                l."receivedDate"::text        AS "receivedDate",
                l.status,
                -- deficit value = how many SAR the books over-credited
                -- inventory for. Negative quantity × unit cost magnitude.
                (ABS(l.quantity) * l."unitCost")::float8 AS "deficitValue",
                latest."latestMovementAt"::text AS "latestMovementAt",
                latest."latestMovementType"     AS "latestMovementType",
                latest."latestJournalEntryId"   AS "latestJournalEntryId"
           FROM warehouse_stock_lots l
           LEFT JOIN warehouses w
             ON w.id = l."warehouseId" AND w."deletedAt" IS NULL
           LEFT JOIN warehouse_products p
             ON p.id = l."productId" AND p."deletedAt" IS NULL
           LEFT JOIN LATERAL (
             SELECT m."createdAt"     AS "latestMovementAt",
                    m.type            AS "latestMovementType",
                    m."journalEntryId" AS "latestJournalEntryId"
               FROM warehouse_movements m
              WHERE m."companyId" = l."companyId"
                AND m."lotId" = l.id
              ORDER BY m."createdAt" DESC
              LIMIT 1
           ) latest ON true
          WHERE l."companyId" = $1
            AND l.quantity < 0
            AND l."deletedAt" IS NULL
            ${whereExtra}${branchFilter}
          ORDER BY l.quantity ASC, l.id DESC
          LIMIT 1000`,
        params,
      );

      const totalDeficitValue = rows.reduce(
        (s, r) => s + Number(r.deficitValue ?? 0), 0
      );
      const byWarehouse = new Map<number, {
        warehouseId: number;
        warehouseName: string | null;
        warehouseCode: string | null;
        lotCount: number;
        deficitValue: number;
      }>();
      for (const r of rows) {
        const w = byWarehouse.get(r.warehouseId) ?? {
          warehouseId: r.warehouseId,
          warehouseName: r.warehouseName,
          warehouseCode: r.warehouseCode,
          lotCount: 0,
          deficitValue: 0,
        };
        w.lotCount += 1;
        w.deficitValue += Number(r.deficitValue ?? 0);
        byWarehouse.set(r.warehouseId, w);
      }

      res.json(maskFields(req, {
        filters: { warehouseId, productId },
        summary: {
          lotCount: rows.length,
          totalDeficitValue: roundTo2(totalDeficitValue),
        },
        byWarehouse: Array.from(byWarehouse.values())
          .map((w) => ({ ...w, deficitValue: roundTo2(w.deficitValue) }))
          .sort((a, b) => b.deficitValue - a.deficitValue),
        data: rows,
      }));
    } catch (err) {
      handleRouteError(err, res, "Negative stock report error:");
    }
  },
);
// ─────────────────────────────────────────────────────────────────────────────
// VAT reconciliation report — companion to the WHT summary endpoint.
//
// Pre-filing sanity check for the monthly ZATCA VAT return. The
// canonical numbers come from journal_lines:
//
//     outputVAT = Σ credit on vat_output account − Σ debit       (sales)
//     inputVAT  = Σ debit  on vat_input  account − Σ credit       (purchases)
//     netVATDue = outputVAT − inputVAT
//
// We THEN compare netVATDue against the LIVE balance on the vat_output
// (typically 2300) and vat_input accounts since opening, to flag drift
// the books vs. our period calculation. If the two disagree, a JE was
// posted to a wrong account or a reversal escaped the period filter.
//
// Per-source breakdown (invoice / credit_memo / debit_memo / voucher)
// so operators can see "X SAR came from sales invoices, Y from refunds".
//
// Read-only, no transaction.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/vat-reconciliation",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate } =
        req.query as Record<string, string | undefined>;

      // Resolve canonical VAT accounts (operator may have overridden the
      // 2300 / 1400 defaults via accounting_mappings).
      const { financialEngine } = await import("../lib/engines/index.js");
      const [outputVatCode, inputVatCode] = await Promise.all([
        financialEngine.resolveAccountCode(scope.companyId, "vat_output", "credit", "2131"),
        financialEngine.resolveAccountCode(scope.companyId, "vat_input",  "debit",  "1180"),
      ]);

      const params: unknown[] = [scope.companyId, outputVatCode, inputVatCode];
      let dateFilter = "";
      if (startDate) { params.push(startDate); dateFilter += ` AND je."date" >= $${params.length}`; }
      if (endDate)   { params.push(endDate);   dateFilter += ` AND je."date" < ($${params.length}::date + 1)`; }
      const branchFilter = getBranchCondition(scope, undefined, params, "je");

      // ── 1. Period movement on the two VAT accounts ──────────────────
      interface SrcRow {
        sourceType: string | null;
        accountCode: string;
        debit: string | number;
        credit: string | number;
      }
      const rows = await rawQuery<SrcRow>(
        `SELECT COALESCE(je."sourceType", 'other')::text AS "sourceType",
                jl."accountCode",
                SUM(COALESCE(jl.debit, 0))::float8  AS debit,
                SUM(COALESCE(jl.credit, 0))::float8 AS credit
           FROM journal_lines jl
           JOIN journal_entries je
             ON je.id = jl."journalId"
            AND je."deletedAt" IS NULL
            AND je."balancesApplied" = true
            AND je."reversedById" IS NULL
          WHERE je."companyId" = $1
            AND jl."accountCode" IN ($2, $3)
            AND jl."deletedAt" IS NULL
            ${dateFilter}${branchFilter}
          GROUP BY je."sourceType", jl."accountCode"`,
        params,
      );

      // ── 2. Live ledger balance on each VAT account (since-opening) ──
      // Same JE guards, NO date filter — the balance carry forward is
      // what the trial balance shows today.
      interface BalRow { accountCode: string; balance: string | number }
      const balParams: unknown[] = [scope.companyId, outputVatCode, inputVatCode];
      const balBranchFilter = getBranchCondition(scope, undefined, balParams, "je");
      const balRows = await rawQuery<BalRow>(
        `SELECT jl."accountCode",
                SUM(COALESCE(jl.credit, 0) - COALESCE(jl.debit, 0))::float8 AS balance
           FROM journal_lines jl
           JOIN journal_entries je
             ON je.id = jl."journalId"
            AND je."deletedAt" IS NULL
            AND je."balancesApplied" = true
            AND je."reversedById" IS NULL
          WHERE je."companyId" = $1
            AND jl."accountCode" IN ($2, $3)
            AND jl."deletedAt" IS NULL
            ${balBranchFilter}
          GROUP BY jl."accountCode"`,
        balParams,
      );

      // ── 3. Aggregate ────────────────────────────────────────────────
      let outputVatPeriod = 0;   // credit − debit on output account
      let inputVatPeriod  = 0;   // debit  − credit on input  account
      const bySource = new Map<string, {
        sourceType: string;
        outputVat: number;
        inputVat: number;
        netVat: number;
      }>();
      for (const r of rows) {
        const debit  = Number(r.debit  ?? 0);
        const credit = Number(r.credit ?? 0);
        const src = r.sourceType ?? "other";
        const bucket = bySource.get(src) ?? {
          sourceType: src, outputVat: 0, inputVat: 0, netVat: 0,
        };
        if (r.accountCode === outputVatCode) {
          const out = credit - debit;
          outputVatPeriod += out;
          bucket.outputVat += out;
        } else if (r.accountCode === inputVatCode) {
          const inp = debit - credit;
          inputVatPeriod += inp;
          bucket.inputVat += inp;
        }
        bucket.netVat = bucket.outputVat - bucket.inputVat;
        bySource.set(src, bucket);
      }
      const netVatDue = outputVatPeriod - inputVatPeriod;

      let outputVatLiveBalance = 0;
      let inputVatLiveBalance  = 0;   // expressed as credit − debit so it's
                                      // typically negative for an asset acct
      for (const r of balRows) {
        const b = Number(r.balance ?? 0);
        if (r.accountCode === outputVatCode) outputVatLiveBalance = b;
        else if (r.accountCode === inputVatCode) inputVatLiveBalance = b;
      }

      // Drift = (live VAT-payable balance) − (period netVAT due).
      // A non-zero drift means a JE landed on the VAT account from a
      // source other than the standard pipeline OR a period boundary
      // was misposted.
      const liveNetPayable = outputVatLiveBalance + inputVatLiveBalance;
      const drift = roundTo2(liveNetPayable - netVatDue);

      res.json(maskFields(req, {
        filters: { startDate, endDate },
        accounts: { outputVatCode, inputVatCode },
        summary: {
          outputVatPeriod: roundTo2(outputVatPeriod),
          inputVatPeriod:  roundTo2(inputVatPeriod),
          netVatDue:       roundTo2(netVatDue),
          outputVatLiveBalance: roundTo2(outputVatLiveBalance),
          inputVatLiveBalance:  roundTo2(inputVatLiveBalance),
          liveNetPayable:       roundTo2(liveNetPayable),
          drift,
          driftIsClean: Math.abs(drift) < 0.005,
        },
        bySource: Array.from(bySource.values())
          .map((s) => ({
            ...s,
            outputVat: roundTo2(s.outputVat),
            inputVat:  roundTo2(s.inputVat),
            netVat:    roundTo2(s.netVat),
          }))
          .sort((a, b) => Math.abs(b.netVat) - Math.abs(a.netVat)),
      }));
    } catch (err) {
      handleRouteError(err, res, "VAT reconciliation error:");
    }
  },
);
// ─────────────────────────────────────────────────────────────────────────────
// GL integrity gaps — period-close pre-flight check.
//
// Surfaces business entities whose canonical journal-entry linkage
// is broken. The kinds of bugs we catch:
//
//   1. invoices.status = 'approved' but journalEntryId IS NULL
//      → the FIN-007 invariant from the COGS campaign — every
//        approved invoice MUST point at its JE for VAT-return
//        and tax-summary queries to find the revenue.
//   2. credit_memos / debit_memos with journalId IS NULL after
//      atomic-post wiring (#1015) — should be impossible going
//      forward, but legacy rows from before #1015 are flagged
//      here for one-time backfill.
//   3. payment_runs with journalId IS NULL after #1006 / #1010
//      payment-run wiring.
//   4. supplier_payment_allocations pointing at a journal_entry
//      that's been hard-deleted (FK is soft).
//
// Operators run this before period close + before any month-end
// VAT/WHT filing — anything in the report is a "must reconcile"
// before close. Read-only.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/gl-integrity-gaps",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate } =
        req.query as Record<string, string | undefined>;

      // Each section filters on its own date column so the operator
      // can scope to a closing window. Defaults: no date filter →
      // since-opening (necessary for the one-time legacy backfill).
      interface GapRow {
        section: string;
        entityId: number;
        ref: string | null;
        gap: string;
        amount: string | number | null;
        createdAt: string | null;
      }
      const sections: { source: string; rows: GapRow[] }[] = [];

      // ── 1. invoices approved without JE ──────────────────────────────
      {
        const params: unknown[] = [scope.companyId];
        let extra = "";
        if (startDate) { params.push(startDate); extra += ` AND i."createdAt" >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   extra += ` AND i."createdAt" < ($${params.length}::date + 1)`; }
        const rows = await rawQuery<GapRow>(
          `SELECT 'invoice'::text AS section,
                  i.id            AS "entityId",
                  i.ref,
                  'invoice approved without journalEntryId'::text AS gap,
                  i.total::float8  AS amount,
                  i."createdAt"::text AS "createdAt"
             FROM invoices i
            WHERE i."companyId" = $1
              AND i."deletedAt" IS NULL
              AND i.status IN ('approved','sent','partial','partially_paid','paid','overdue')
              AND i."journalEntryId" IS NULL
              ${extra}
            ORDER BY i."createdAt" DESC NULLS LAST, i.id DESC
            LIMIT 500`,
          params,
        );
        sections.push({ source: "invoices_missing_je", rows });
      }

      // ── 2. credit_memos with NULL journalId ──────────────────────────
      {
        const params: unknown[] = [scope.companyId];
        let extra = "";
        if (startDate) { params.push(startDate); extra += ` AND cm."createdAt" >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   extra += ` AND cm."createdAt" < ($${params.length}::date + 1)`; }
        const rows = await rawQuery<GapRow>(
          `SELECT 'credit_memo'::text AS section,
                  cm.id               AS "entityId",
                  NULL::text          AS ref,
                  'credit memo without journalId'::text AS gap,
                  cm.amount::float8   AS amount,
                  cm."createdAt"::text AS "createdAt"
             FROM credit_memos cm
            WHERE cm."companyId" = $1
              AND cm."journalId" IS NULL
              ${extra}
            ORDER BY cm."createdAt" DESC NULLS LAST, cm.id DESC
            LIMIT 500`,
          params,
        );
        sections.push({ source: "credit_memos_missing_je", rows });
      }

      // ── 3. debit_memos with NULL journalId ───────────────────────────
      {
        const params: unknown[] = [scope.companyId];
        let extra = "";
        if (startDate) { params.push(startDate); extra += ` AND dm."createdAt" >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   extra += ` AND dm."createdAt" < ($${params.length}::date + 1)`; }
        const rows = await rawQuery<GapRow>(
          `SELECT 'debit_memo'::text  AS section,
                  dm.id               AS "entityId",
                  NULL::text          AS ref,
                  'debit memo without journalId'::text AS gap,
                  dm.amount::float8   AS amount,
                  dm."createdAt"::text AS "createdAt"
             FROM debit_memos dm
            WHERE dm."companyId" = $1
              AND dm."journalId" IS NULL
              ${extra}
            ORDER BY dm."createdAt" DESC NULLS LAST, dm.id DESC
            LIMIT 500`,
          params,
        );
        sections.push({ source: "debit_memos_missing_je", rows });
      }

      // ── 4. payment_runs with NULL journalId (executed but unposted) ──
      // Table is created lazily by the payment-run handler so we
      // tolerate it being absent on tenants that never ran one.
      try {
        const params: unknown[] = [scope.companyId];
        let extra = "";
        if (startDate) { params.push(startDate); extra += ` AND pr."createdAt" >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   extra += ` AND pr."createdAt" < ($${params.length}::date + 1)`; }
        const rows = await rawQuery<GapRow>(
          `SELECT 'payment_run'::text AS section,
                  pr.id               AS "entityId",
                  pr.ref,
                  'payment run executed without journalId'::text AS gap,
                  pr."totalAmount"::float8 AS amount,
                  pr."createdAt"::text AS "createdAt"
             FROM payment_runs pr
            WHERE pr."companyId" = $1
              AND pr.status = 'executed'
              AND pr."journalId" IS NULL
              ${extra}
            ORDER BY pr."createdAt" DESC NULLS LAST, pr.id DESC
            LIMIT 500`,
          params,
        );
        sections.push({ source: "payment_runs_missing_je", rows });
      } catch (e: any) {
        // 42P01 — table doesn't exist on this tenant. Emit an empty
        // section so the response shape stays consistent.
        if (e?.code !== "42P01") throw e;
        sections.push({ source: "payment_runs_missing_je", rows: [] });
      }

      // ── 5. supplier_payment_allocations pointing at deleted JE ───────
      {
        const rows = await rawQuery<GapRow>(
          `SELECT 'spa_orphan'::text  AS section,
                  spa.id              AS "entityId",
                  NULL::text          AS ref,
                  ('allocation points at JE #' || spa."journalEntryId" || ' that no longer exists')::text AS gap,
                  spa.amount::float8  AS amount,
                  spa."createdAt"::text AS "createdAt"
             FROM supplier_payment_allocations spa
             LEFT JOIN journal_entries je
               ON je.id = spa."journalEntryId"
              AND je."deletedAt" IS NULL
            WHERE spa."companyId" = $1
              AND spa."deletedAt" IS NULL
              AND spa."journalEntryId" IS NOT NULL
              AND je.id IS NULL
            ORDER BY spa."createdAt" DESC NULLS LAST, spa.id DESC
            LIMIT 500`,
          [scope.companyId],
        );
        sections.push({ source: "spa_orphans", rows });
      }

      const totalGaps = sections.reduce((s, x) => s + x.rows.length, 0);
      const summary = {
        totalGaps,
        bySection: sections.map((s) => ({ source: s.source, count: s.rows.length })),
        isClean: totalGaps === 0,
      };

      res.json(maskFields(req, {
        filters: { startDate, endDate },
        summary,
        sections,
      }));
    } catch (err) {
      handleRouteError(err, res, "GL integrity gaps error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Ledger-truth measurement — FIN-INTEGRITY-CONTRACT (#2246) المرحلة أ (قياس فقط).
//
// **read-only، صفر إنفاذ، صفر تعديل قيود.** يقيس «صدق دفتر الأستاذ» على السطور
// المرحَّلة (balancesApplied=true، غير معكوسة، غير محذوفة):
//   1. اكتمال الأبعاد: سطور أصناف مُبعّدة (مركبة/عقار/مشروع/مورد/عميل) بلا بُعدها.
//   2. توزيع التسريب حسب باب الترحيل (je.type) — تشغيلي مقابل typed.
//   3. ترحيلات الحساب الافتراضي (audit_logs action='mapping_fallback').
//   4. القيد اليدوي الأعمى (isManual + بلا أي بُعد و/أو بلا سبب).
// تصنيف البُعد المطلوب مبدئي ويُحاكي src/lib/gl/ledgerTruth.ts
// (expectedDimensionForAccount) — يُرسَّم رسميًا كعقد إنفاذ في #2233.
// **مكمّل لا مكرّر:** /reports/gl-integrity-gaps يقيس فجوات الربط (كيان↔قيد)،
// و/reports/unmapped-lines يقيس سطور ما قبل الترحيل؛ هذا يقيس صدق السطور المرحَّلة.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/ledger-truth",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate, branchId } =
        req.query as Record<string, string | undefined>;

      // كل استعلام يبني params الخاصة به (getBranchCondition يضيف للـparams).
      const buildScope = (alias: string) => {
        const params: unknown[] = [scope.companyId];
        let dateFilter = "";
        if (startDate) { params.push(startDate); dateFilter += ` AND ${alias}."createdAt" >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   dateFilter += ` AND ${alias}."createdAt" < ($${params.length}::date + 1)`; }
        return { params, dateFilter };
      };

      // ── 1 + 2. اكتمال الأبعاد + التوزيع حسب الباب ──────────────────────────
      const { params: dimParams, dateFilter: dimDate } = buildScope("je");
      const dimBranch = getBranchCondition(scope, branchId, dimParams, "je");
      // CASE يحاكي expectedDimensionForAccount (ledgerTruth.ts) — أبقهما متزامنين.
      const dimClass = `CASE
              WHEN (coa.code ~ '^55[0-9]{2}$' OR coa.code = '5710') THEN 'vehicle'
              WHEN coa.code ~ '^56[0-9]{2}$' THEN 'property'
              WHEN coa.code IN ('5130','4140') THEN 'project'
              WHEN coa.code ~ '^211[1-3]$' THEN 'vendor'
              WHEN coa.code ~ '^113[1-3]$' THEN 'client'
              ELSE NULL END`;
      const dimMissing = `CASE
              WHEN (coa.code ~ '^55[0-9]{2}$' OR coa.code = '5710') AND jl."vehicleId" IS NULL THEN true
              WHEN coa.code ~ '^56[0-9]{2}$' AND jl."propertyId" IS NULL THEN true
              WHEN coa.code IN ('5130','4140') AND jl."projectId" IS NULL THEN true
              WHEN coa.code ~ '^211[1-3]$' AND jl."vendorId" IS NULL THEN true
              WHEN coa.code ~ '^113[1-3]$' AND jl."clientId" IS NULL THEN true
              ELSE false END`;
      const dimensionRows = await rawQuery<{
        expectedDim: string; totalLines: number; missingLines: number; missingValue: number;
      }>(
        `SELECT cls.expected_dim AS "expectedDim",
                COUNT(*)::int AS "totalLines",
                SUM(CASE WHEN cls.dim_missing THEN 1 ELSE 0 END)::int AS "missingLines",
                COALESCE(SUM(CASE WHEN cls.dim_missing THEN ABS(cls.debit - cls.credit) ELSE 0 END), 0)::float8 AS "missingValue"
           FROM (
             SELECT jl.debit, jl.credit,
                    ${dimClass} AS expected_dim,
                    ${dimMissing} AS dim_missing
               FROM journal_lines jl
               JOIN journal_entries je ON je.id = jl."journalId"
               JOIN chart_of_accounts coa ON coa.id = jl."accountId" AND coa."companyId" = $1
              WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
                AND je."balancesApplied" = true AND je."reversedById" IS NULL
                AND jl."deletedAt" IS NULL${dimDate}${dimBranch}
           ) cls
          WHERE cls.expected_dim IS NOT NULL
          GROUP BY cls.expected_dim
          ORDER BY "missingValue" DESC`,
        dimParams,
      );

      const { params: doorParams, dateFilter: doorDate } = buildScope("je");
      const doorBranch = getBranchCondition(scope, branchId, doorParams, "je");
      const doorRows = await rawQuery<{ door: string; missingLines: number; missingValue: number }>(
        `SELECT COALESCE(je.type, '—') AS door,
                COUNT(*)::int AS "missingLines",
                COALESCE(SUM(ABS(jl.debit - jl.credit)), 0)::float8 AS "missingValue"
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId"
           JOIN chart_of_accounts coa ON coa.id = jl."accountId" AND coa."companyId" = $1
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
            AND je."balancesApplied" = true AND je."reversedById" IS NULL AND jl."deletedAt" IS NULL
            AND ${dimMissing} = true${doorDate}${doorBranch}
          GROUP BY je.type
          ORDER BY "missingValue" DESC`,
        doorParams,
      );

      // ── 3. ترحيلات الحساب الافتراضي ──────────────────────────────────────
      const { params: fbParams, dateFilter: fbDate } = buildScope("al");
      const fallbackRows = await rawQuery<{ operationType: string; count: number }>(
        `SELECT COALESCE(al."after"->>'operationType', '—') AS "operationType",
                COUNT(*)::int AS count
           FROM audit_logs al
          WHERE al."companyId" = $1
            AND al.action = 'mapping_fallback'
            AND al.entity = 'accounting_mappings'${fbDate}
          GROUP BY al."after"->>'operationType'
          ORDER BY count DESC`,
        fbParams,
      );

      // ── 4. القيد اليدوي الأعمى ────────────────────────────────────────────
      const { params: mjParams, dateFilter: mjDate } = buildScope("je");
      const [manualRow] = await rawQuery<{
        total: number; noReason: number; noDimension: number; blind: number;
      }>(
        `SELECT
            COUNT(*)::int AS total,
            SUM(CASE WHEN (je.description IS NULL OR je.description = 'قيد يدوي') THEN 1 ELSE 0 END)::int AS "noReason",
            SUM(CASE WHEN NOT EXISTS (
                  SELECT 1 FROM journal_lines jl
                   WHERE jl."journalId" = je.id AND jl."deletedAt" IS NULL
                     AND (jl."vehicleId" IS NOT NULL OR jl."propertyId" IS NOT NULL OR jl."projectId" IS NOT NULL
                       OR jl."vendorId" IS NOT NULL OR jl."clientId" IS NOT NULL OR jl."employeeId" IS NOT NULL
                       OR jl."umrahSeasonId" IS NOT NULL OR jl."umrahAgentId" IS NOT NULL OR jl."contractId" IS NOT NULL
                       OR jl."unitId" IS NOT NULL OR jl."assetId" IS NOT NULL OR jl."driverId" IS NOT NULL)
                ) THEN 1 ELSE 0 END)::int AS "noDimension",
            SUM(CASE WHEN (je.description IS NULL OR je.description = 'قيد يدوي') AND NOT EXISTS (
                  SELECT 1 FROM journal_lines jl
                   WHERE jl."journalId" = je.id AND jl."deletedAt" IS NULL
                     AND (jl."vehicleId" IS NOT NULL OR jl."propertyId" IS NOT NULL OR jl."projectId" IS NOT NULL
                       OR jl."vendorId" IS NOT NULL OR jl."clientId" IS NOT NULL OR jl."employeeId" IS NOT NULL
                       OR jl."umrahSeasonId" IS NOT NULL OR jl."umrahAgentId" IS NOT NULL OR jl."contractId" IS NOT NULL
                       OR jl."unitId" IS NOT NULL OR jl."assetId" IS NOT NULL OR jl."driverId" IS NOT NULL)
                ) THEN 1 ELSE 0 END)::int AS blind
           FROM journal_entries je
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
            AND je."isManual" = true${mjDate}`,
        mjParams,
      );
      const manual = manualRow ?? { total: 0, noReason: 0, noDimension: 0, blind: 0 };

      // ── 5. صنفان محسوبان للمخالفات (SLICE 1, #2246) — company-scoped, بلا جدول جديد ──
      //  (i) قيود على حساب غير قابل للترحيل (allowPosting=false أو غير نشط أو محذوف).
      //  (ii) قيود يدوية مرتبطة تشغيليًا بلا سبب.
      const { params: npParams, dateFilter: npDate } = buildScope("je");
      const npBranch = getBranchCondition(scope, branchId, npParams, "je");
      const nonPostableRows = await rawQuery<{
        journalId: number; ref: string | null; createdAt: string; accountCode: string; accountName: string; reason: string;
      }>(
        `SELECT je.id AS "journalId", je.ref, je."createdAt"::text AS "createdAt",
                coa.code AS "accountCode", coa.name AS "accountName",
                CASE WHEN coa."deletedAt" IS NOT NULL THEN 'محذوف'
                     WHEN coa."isActive" = false THEN 'غير نشط'
                     WHEN coa."allowPosting" = false THEN 'لا يسمح بالترحيل'
                     ELSE '—' END AS reason
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId"
           JOIN chart_of_accounts coa ON coa.id = jl."accountId" AND coa."companyId" = $1
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND jl."deletedAt" IS NULL
            AND (coa."allowPosting" = false OR coa."isActive" = false OR coa."deletedAt" IS NOT NULL)${npDate}${npBranch}
          ORDER BY je."createdAt" DESC
          LIMIT 200`,
        npParams,
      );

      const { params: molParams, dateFilter: molDate } = buildScope("je");
      const molBranch = getBranchCondition(scope, branchId, molParams, "je");
      const manualNoReasonRows = await rawQuery<{
        journalId: number; ref: string | null; createdAt: string; description: string | null;
      }>(
        `SELECT je.id AS "journalId", je.ref, je."createdAt"::text AS "createdAt", je.description
           FROM journal_entries je
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
            AND je."isManual" = true
            AND (je.description IS NULL OR je.description = '' OR je.description = 'قيد يدوي')
            AND EXISTS (
              SELECT 1 FROM journal_lines jl
               WHERE jl."journalId" = je.id AND jl."deletedAt" IS NULL
                 AND (jl."vehicleId" IS NOT NULL OR jl."propertyId" IS NOT NULL OR jl."assetId" IS NOT NULL
                   OR jl."employeeId" IS NOT NULL OR jl."driverId" IS NOT NULL OR jl."unitId" IS NOT NULL
                   OR jl."contractId" IS NOT NULL)
            )${molDate}${molBranch}
          ORDER BY je."createdAt" DESC
          LIMIT 200`,
        molParams,
      );

      // ── 6. القيود اليتيمة بالمصدر (#2246 SLICE — قياس فقط، read-only) ────────
      //  قيد آلي مُرحَّل بلا مصدر: sourceType/sourceId NULL، غير يدوي، مُطبَّق،
      //  غير معكوس، غير محذوف. تُستثنى صراحةً أبواب الإقفال/التسوية/المطابقة
      //  المعروفة (لها مصدرها النظامي ولا تُعدّ يتيمة):
      //   closing / monthly_closing / opening_balance (إقفال وفتح)
      //   fx_revaluation / fx_realised / asset_revaluation (إعادة التقييم)
      //   bank_adjustment (مطابقة بنكية).
      //  مفلتر بالشركة/الفترة/الفرع بنفس buildScope القائم. company-scoped.
      const ORPHAN_EXCLUDED_TYPES = [
        "closing",
        "monthly_closing",
        "opening_balance",
        "fx_revaluation",
        "fx_realised",
        "asset_revaluation",
        "bank_adjustment",
      ];
      const { params: orphParams, dateFilter: orphDate } = buildScope("je");
      const orphBranch = getBranchCondition(scope, branchId, orphParams, "je");
      orphParams.push(ORPHAN_EXCLUDED_TYPES);
      const orphExcludeIdx = orphParams.length;
      const orphanSourceRows = await rawQuery<{
        journalId: number; ref: string | null; date: string; type: string | null; amount: number;
      }>(
        `SELECT je.id AS "journalId", je.ref, COALESCE(je."date"::text, je."createdAt"::text) AS date,
                je.type AS type,
                COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl
                           WHERE jl."journalId" = je.id AND jl."deletedAt" IS NULL), 0)::float8 AS amount
           FROM journal_entries je
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
            AND je."isManual" = false
            AND je."balancesApplied" = true
            AND je."reversedById" IS NULL
            AND (je."sourceType" IS NULL OR je."sourceId" IS NULL)
            AND COALESCE(je.type, '') <> ALL($${orphExcludeIdx}::text[])${orphDate}${orphBranch}
          ORDER BY je."createdAt" DESC
          LIMIT 200`,
        orphParams,
      );
      const { params: orphCntParams, dateFilter: orphCntDate } = buildScope("je");
      const orphCntBranch = getBranchCondition(scope, branchId, orphCntParams, "je");
      orphCntParams.push(ORPHAN_EXCLUDED_TYPES);
      const orphCntExcludeIdx = orphCntParams.length;
      const [orphanCountRow] = await rawQuery<{ total: number }>(
        `SELECT COUNT(*)::int AS total
           FROM journal_entries je
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
            AND je."isManual" = false
            AND je."balancesApplied" = true
            AND je."reversedById" IS NULL
            AND (je."sourceType" IS NULL OR je."sourceId" IS NULL)
            AND COALESCE(je.type, '') <> ALL($${orphCntExcludeIdx}::text[])${orphCntDate}${orphCntBranch}`,
        orphCntParams,
      );
      const orphanSourceTotal = Number(orphanCountRow?.total ?? 0);

      // ── الملخص + ترتيب جاهزية الـratchet (الأصغر تسريبًا أولًا) ───────────
      const dimTotalLines = dimensionRows.reduce((s, r) => s + Number(r.totalLines), 0);
      const dimMissingLines = dimensionRows.reduce((s, r) => s + Number(r.missingLines), 0);
      const dimMissingValue = dimensionRows.reduce((s, r) => s + Number(r.missingValue), 0);
      const fallbackTotal = fallbackRows.reduce((s, r) => s + Number(r.count), 0);
      const completenessPct = dimTotalLines > 0
        ? Number((((dimTotalLines - dimMissingLines) / dimTotalLines) * 100).toFixed(2))
        : 100;

      const ratchetReadiness = dimensionRows
        .map((r) => ({
          expectedDim: r.expectedDim,
          missingLines: Number(r.missingLines),
          missingValue: Number(r.missingValue),
          completenessPct: Number(r.totalLines) > 0
            ? Number((((Number(r.totalLines) - Number(r.missingLines)) / Number(r.totalLines)) * 100).toFixed(2))
            : 100,
        }))
        .sort((a, b) => a.missingValue - b.missingValue);

      res.json(maskFields(req, {
        filters: { startDate: startDate ?? null, endDate: endDate ?? null, branchId: branchId ?? null },
        summary: {
          dimTotalLines,
          dimMissingLines,
          dimMissingValue,
          completenessPct,
          fallbackTotal,
          manualTotal: Number(manual.total),
          manualBlind: Number(manual.blind),
          orphanSourceTotal,
          enforcement: "none",
          phase: "measurement",
        },
        dimensionCompleteness: dimensionRows.map((r) => ({
          expectedDim: r.expectedDim,
          totalLines: Number(r.totalLines),
          missingLines: Number(r.missingLines),
          missingValue: Number(r.missingValue),
          completenessPct: Number(r.totalLines) > 0
            ? Number((((Number(r.totalLines) - Number(r.missingLines)) / Number(r.totalLines)) * 100).toFixed(2))
            : 100,
        })),
        byDoor: doorRows.map((r) => ({
          door: r.door,
          missingLines: Number(r.missingLines),
          missingValue: Number(r.missingValue),
        })),
        fallbackByOperation: fallbackRows.map((r) => ({
          operationType: r.operationType,
          count: Number(r.count),
        })),
        manual: {
          total: Number(manual.total),
          noReason: Number(manual.noReason),
          noDimension: Number(manual.noDimension),
          blind: Number(manual.blind),
        },
        nonPostableAccountEntries: nonPostableRows.map((r) => ({
          journalId: Number(r.journalId),
          ref: r.ref,
          createdAt: r.createdAt,
          accountCode: r.accountCode,
          accountName: r.accountName,
          reason: r.reason,
        })),
        manualOperationalNoReason: manualNoReasonRows.map((r) => ({
          journalId: Number(r.journalId),
          ref: r.ref,
          createdAt: r.createdAt,
          description: r.description,
        })),
        orphanSourceEntries: orphanSourceRows.map((r) => ({
          journalId: Number(r.journalId),
          ref: r.ref,
          date: r.date,
          type: r.type,
          amount: Number(r.amount),
        })),
        ratchetReadiness,
      }));
    } catch (err) {
      handleRouteError(err, res, "Ledger truth report error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /finance/reports/operation-gaps — operation-level finance gap report
// (#1715 §10). Scans posted journal entries + their legs/accounts and surfaces
// the governance gaps the issue lists: payment-method↔account conflicts,
// operations with no recognised money source, party/target accounts missing
// their dimension, conflicting party fields, un-allocated costs, allocation
// overrides, and postable accounts still missing accountUsage. Read-only.
// Mirrors PAYMENT_METHOD_ALLOWED_USAGES in financeAccountClassifier.ts.
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get(
  "/reports/operation-gaps",
  authorize({ feature: "finance.reports", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { startDate, endDate } =
        req.query as Record<string, string | undefined>;
      // payment methods that bind to a money-source account usage
      const PM_KNOWN = ["cash", "bank", "bank_transfer", "custody", "credit_card", "card", "check", "cheque"];

      interface GapRow {
        section: string;
        entityId: number;
        ref: string | null;
        gap: string;
        amount: number | null;
        createdAt: string | null;
      }

      // Single pass over each entry's legs, aggregating the booleans every
      // category below needs. LEFT JOIN coa so unclassified legs surface as
      // has_unclassified rather than silently dropping the entry.
      const params: unknown[] = [scope.companyId];
      let dext = "";
      if (startDate) { params.push(startDate); dext += ` AND je."date" >= $${params.length}`; }
      if (endDate)   { params.push(endDate);   dext += ` AND je."date" < ($${params.length}::date + 1)`; }
      const jes = await rawQuery<{
        entityId: number; ref: string | null; pm: string | null; createdAt: string | null;
        ret: string | null; rei: number | null; cc: string | null; amount: number;
        has_source: boolean | null; has_unclassified: boolean | null; has_party_acct: boolean | null;
        has_cost_acct: boolean | null; has_costcenter: boolean | null; has_asset: boolean | null;
        has_allowed_source: boolean | null;
      }>(
        `SELECT je.id AS "entityId", je.ref, je."paymentMethod" AS pm, je."date"::text AS "createdAt",
                je."relatedEntityType" AS ret, je."relatedEntityId" AS rei, je."costCenter" AS cc,
                COALESCE(SUM(jl.debit), 0)::float8 AS amount,
                bool_or(coa."accountUsage" IN ('cash_box','bank','custody','card','cheque')) AS has_source,
                bool_or(coa."accountUsage" IS NULL) AS has_unclassified,
                bool_or(coa."accountUsage" IN ('receivable','payable')) AS has_party_acct,
                bool_or(coa."accountUsage" IN ('operating_expense','cogs','payroll_expense')) AS has_cost_acct,
                bool_or(jl."costCenterId" IS NOT NULL) AS has_costcenter,
                bool_or(jl."assetId" IS NOT NULL) AS has_asset,
                bool_or(CASE je."paymentMethod"
                  WHEN 'cash' THEN coa."accountUsage" = 'cash_box'
                  WHEN 'bank' THEN coa."accountUsage" = 'bank'
                  WHEN 'bank_transfer' THEN coa."accountUsage" = 'bank'
                  WHEN 'custody' THEN coa."accountUsage" = 'custody'
                  WHEN 'credit_card' THEN coa."accountUsage" = 'card'
                  WHEN 'card' THEN coa."accountUsage" = 'card'
                  WHEN 'check' THEN coa."accountUsage" IN ('bank','cheque')
                  WHEN 'cheque' THEN coa."accountUsage" IN ('bank','cheque')
                  ELSE NULL END) AS has_allowed_source
           FROM journal_entries je
           JOIN journal_lines jl ON jl."journalId" = je.id
           LEFT JOIN chart_of_accounts coa ON coa.id = jl."accountId"
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL ${dext}
          GROUP BY je.id
          ORDER BY je."date" DESC NULLS LAST, je.id DESC
          LIMIT 5000`,
        params,
      );

      const mk = (gap: string, r: typeof jes[number]): GapRow => ({
        section: "journal_entry", entityId: r.entityId, ref: r.ref, gap, amount: r.amount, createdAt: r.createdAt,
      });
      const pmConflict: GapRow[] = [], noSource: GapRow[] = [], noParty: GapRow[] = [],
        conflicting: GapRow[] = [], noTarget: GapRow[] = [];
      for (const r of jes) {
        const pmKnown = !!r.pm && PM_KNOWN.includes(r.pm);
        // a classified money-source leg exists, but none matches the method
        if (pmKnown && r.has_source && r.has_allowed_source !== true)
          pmConflict.push(mk(`طريقة الدفع (${r.pm}) لا تطابق تصنيف حساب المصدر`, r));
        // money moved by a method, but no cash/bank/custody/… leg at all
        if (pmKnown && !r.has_source && !r.has_unclassified)
          noSource.push(mk(`طريقة دفع (${r.pm}) بلا حساب مصدر نقدي/بنكي/عهدة`, r));
        // touches a receivable/payable account but no party linked
        if (r.has_party_acct && !r.ret)
          noParty.push(mk("قيد على ذمم مدينة/دائنة بلا طرف مرتبط", r));
        // relatedEntityType ⊕ relatedEntityId
        if ((r.ret && !r.rei) || (!r.ret && r.rei))
          conflicting.push(mk("حقول الطرف متعارضة (نوع بلا معرّف أو العكس)", r));
        // a cost leg with no allocation target whatsoever
        if (r.has_cost_acct && !r.has_costcenter && !r.has_asset && !r.cc && !r.rei)
          noTarget.push(mk("مصروف/تكلفة بلا مركز تكلفة أو ربط بكيان", r));
      }

      // allocation overrides (audit trail) within the window
      const oparams: unknown[] = [scope.companyId];
      let oext = "";
      if (startDate) { oparams.push(startDate); oext += ` AND "createdAt" >= $${oparams.length}`; }
      if (endDate)   { oparams.push(endDate);   oext += ` AND "createdAt" < ($${oparams.length}::date + 1)`; }
      const overrides = await rawQuery<GapRow>(
        `SELECT id AS "entityId", "documentType" AS ref,
                COALESCE("overrideReason", 'تجاوز بلا سبب مسجّل')::text AS gap,
                NULL::float8 AS amount, "createdAt"::text AS "createdAt"
           FROM allocation_override_log
          WHERE "companyId" = $1 ${oext}
          ORDER BY "createdAt" DESC LIMIT 500`,
        oparams,
      );

      // postable accounts still missing accountUsage (highest-risk usage gap)
      const accGaps = await rawQuery<GapRow>(
        `SELECT id AS "entityId", code AS ref, name AS gap, NULL::float8 AS amount, "createdAt"::text AS "createdAt"
           FROM chart_of_accounts
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
            AND "accountUsage" IS NULL AND "allowPosting" = true
          ORDER BY code LIMIT 500`,
        [scope.companyId],
      );

      const sections = [
        { source: "payment_method_account_conflict", rows: pmConflict.slice(0, 500) },
        { source: "missing_money_source", rows: noSource.slice(0, 500) },
        { source: "party_account_without_party", rows: noParty.slice(0, 500) },
        { source: "conflicting_party_fields", rows: conflicting.slice(0, 500) },
        { source: "cost_without_target", rows: noTarget.slice(0, 500) },
        { source: "allocation_overrides", rows: overrides },
        { source: "postable_accounts_missing_usage", rows: accGaps },
      ];
      const totalGaps = sections.reduce((s, x) => s + x.rows.length, 0);
      res.json(maskFields(req, {
        filters: { startDate, endDate },
        summary: {
          totalGaps,
          bySection: sections.map((s) => ({ source: s.source, count: s.rows.length })),
          isClean: totalGaps === 0,
        },
        sections,
      }));
    } catch (err) {
      handleRouteError(err, res, "Operation gaps report error:");
    }
  },
);
