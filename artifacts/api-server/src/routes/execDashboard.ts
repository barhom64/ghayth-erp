// ─────────────────────────────────────────────────────────────────────────────
// EXEC DASHBOARD — لوحة قيادة تنفيذية موحّدة
// ─────────────────────────────────────────────────────────────────────────────
// Unlike actionCenter (which is per-user pending items), this endpoint gives
// a company-wide risk picture: cash, AR/AP exposure, breached SLAs, open
// obligations, budget variances, stuck workflows.
//
// Access: general_manager, owner, finance_manager only.

import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { currentPeriod, currentYear, currentMonthPadded, toDateISO, todayISO, roundTo2 } from "../lib/businessHelpers.js";
import { handleRouteError, ForbiddenError } from "../lib/errorHandler.js";
import { obligationSummary } from "../lib/obligationsEngine.js";
import { EXEC_ROLES } from "../lib/rbacCatalog.js";
import { logger } from "../lib/logger.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";

export const execDashboardRouter = Router();
execDashboardRouter.use(authMiddleware);

function requireExec(scope: any): void {
  if (!EXEC_ROLES.includes(scope.role)) {
    throw new ForbiddenError("لوحة القيادة التنفيذية مخصصة للإدارة العليا فقط");
  }
}

// Safe query helper — swallows errors (missing tables) and returns default
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (e) { logger.error(e, "exec dashboard query failed"); return fallback; }
}

execDashboardRouter.get("/overview", authorize({ feature: "dashboard.executive", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    const companyId = scope.companyId;

    // All 12 dashboard sections are independent — run in parallel.
    const [cashPosition, ar, ap, obligations, slaBreaches, stuckWorkflows, budgetOverages, dunning, expiringContracts, fleetMaintenance, hrDocExpiries, mtd, umrahSummary, legalSummary] = await Promise.all([
    // ─── 1. CASH POSITION ─────────────────────────────────────────────────
    safe(async () => {
      const rows = await rawQuery<Record<string, unknown>>(
        // «مركز النقد»: النقد 111x والبنوك 112x فقط — لا كامل شجرة الأصول
        // المتداولة (كان LIKE '11%' يضمّ الذمم 113x والمخزون فيُبالِغ). مطابق
        // لتصحيح تقرير التدفق النقدي. (اعتماد إبراهيم 2026-07-01.)
        `SELECT code, name, "currentBalance"
         FROM chart_of_accounts
         WHERE "companyId"=$1 AND (code LIKE '111%' OR code LIKE '112%') AND type='asset' AND "deletedAt" IS NULL
         ORDER BY code`,
        [companyId]
      );
      const total = rows.reduce((s: number, r) => s + Number(r.currentBalance ?? 0), 0);
      return { total: roundTo2(total), accounts: rows };
    }, { total: 0, accounts: [] }),

    // ─── 2. AR AGING ───────────────────────────────────────────────────────
    safe(async () => {
      const [sums] = await rawQuery<Record<string, unknown>>(
        `SELECT
          COALESCE(SUM(total - COALESCE("paidAmount",0)), 0) AS total,
          COALESCE(SUM(CASE WHEN "dueDate"::date >= CURRENT_DATE
                            THEN total - COALESCE("paidAmount",0) ELSE 0 END), 0) AS current,
          COALESCE(SUM(CASE WHEN CURRENT_DATE - "dueDate"::date BETWEEN 1 AND 30
                            THEN total - COALESCE("paidAmount",0) ELSE 0 END), 0) AS "b1_30",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - "dueDate"::date BETWEEN 31 AND 60
                            THEN total - COALESCE("paidAmount",0) ELSE 0 END), 0) AS "b31_60",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - "dueDate"::date BETWEEN 61 AND 90
                            THEN total - COALESCE("paidAmount",0) ELSE 0 END), 0) AS "b61_90",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - "dueDate"::date > 90
                            THEN total - COALESCE("paidAmount",0) ELSE 0 END), 0) AS "b90_plus"
         FROM invoices
         WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled') AND "deletedAt" IS NULL`,
        [companyId]
      );
      return {
        total: Number(sums?.total ?? 0),
        current: Number(sums?.current ?? 0),
        d1_30: Number(sums?.b1_30 ?? 0),
        d31_60: Number(sums?.b31_60 ?? 0),
        d61_90: Number(sums?.b61_90 ?? 0),
        d90_plus: Number(sums?.b90_plus ?? 0),
      };
    }, { total: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }),

    // ─── 3. AP EXPOSURE (open POs) ────────────────────────────────────────
    safe(async () => {
      const [sums] = await rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(SUM("totalAmount"), 0) AS total, COUNT(*)::int AS count
         FROM purchase_orders
         WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled','draft') AND "deletedAt" IS NULL`,
        [companyId]
      );
      return { total: Number(sums?.total ?? 0), count: Number(sums?.count ?? 0) };
    }, { total: 0, count: 0 }),

    // ─── 4. OBLIGATIONS SUMMARY ───────────────────────────────────────────
    safe(
      () => obligationSummary(companyId),
      { pending: 0, breached: 0, escalatedL1: 0, escalatedL2: 0, dueIn24h: 0, dueIn7d: 0, byType: {} }
    ),

    // ─── 5. SLA BREACHES (support + workflow) ─────────────────────────────
    safe(async () => {
      const [support] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM support_tickets
         WHERE "companyId"=$1 AND status='open' AND "deletedAt" IS NULL AND "slaDeadline" < NOW()`,
        [companyId]
      );
      const [workflow] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM workflow_instances
         WHERE "companyId"=$1 AND status IN ('pending','in_review','escalated')
           AND "slaStatus" IN ('breached','at_risk') AND "deletedAt" IS NULL`,
        [companyId]
      ).catch((e) => { logger.error(e, "exec dashboard query failed"); return [{ n: 0 }]; });
      return {
        support: Number(support?.n ?? 0),
        workflow: Number(workflow?.n ?? 0),
      };
    }, { support: 0, workflow: 0 }),

    // ─── 6. STUCK WORKFLOWS (pending >3 days) ─────────────────────────────
    safe(async () => {
      const [r] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM workflow_instances
         WHERE "companyId"=$1 AND status IN ('pending','in_review')
           AND "createdAt" < NOW() - INTERVAL '3 days' AND "deletedAt" IS NULL`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0),

    // ─── 7. BUDGET OVERAGES (current month) ───────────────────────────────
    safe(async () => {
      const period = currentPeriod();
      const [y, m] = period.split("-").map(Number);
      const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const periodEnd = toDateISO(new Date(y, m, 0));
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT b."accountCode", coa.name AS "accountName", b.amount AS "budget",
                COALESCE((
                  SELECT SUM(jl.debit - jl.credit)
                  FROM journal_lines jl
                  JOIN journal_entries je ON je.id = jl."journalId"
                  WHERE je."companyId" = b."companyId" AND je."deletedAt" IS NULL
                    AND je."balancesApplied" = true
                    AND jl."accountCode" = b."accountCode"
                    AND je."createdAt"::date BETWEEN $2::date AND $3::date
                ), 0) AS "actual"
         FROM budgets b
         LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
         WHERE b."companyId"=$1 AND b.period=$4 AND b.amount > 0`,
        [companyId, periodStart, periodEnd, period]
      );
      const withPct = rows
        .map((r) => {
          const actual = Number(r.actual);
          const budget = Number(r.budget);
          return {
            accountCode: r.accountCode,
            accountName: r.accountName,
            budget,
            actual: roundTo2(actual),
            pct: budget > 0 ? Math.round((actual / budget) * 10000) / 100 : 0,
          };
        })
        .filter((r) => r.pct >= 80)
        .sort((a: any, b: any) => b.pct - a.pct);
      return {
        count: withPct.length,
        over100: withPct.filter((r) => r.pct > 100).length,
        top5: withPct.slice(0, 5),
      };
    }, { count: 0, over100: 0, top5: [] }),

    // ─── 8. DUNNING PIPELINE ──────────────────────────────────────────────
    safe(async () => {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT dl.stage AS stage, COUNT(DISTINCT i.id)::int AS count,
                COALESCE(SUM(i.total - COALESCE(i."paidAmount",0)), 0) AS amount
         FROM dunning_letters dl
         JOIN invoices i ON i.id = dl."invoiceId" AND i."deletedAt" IS NULL
         WHERE dl."companyId"=$1 AND i.status NOT IN ('paid','cancelled')
           AND dl.stage > 0
         GROUP BY dl.stage ORDER BY dl.stage`,
        [companyId]
      );
      return rows;
    }, []),

    // ─── 9. PROPERTY CONTRACTS EXPIRING (60 days) ─────────────────────────
    safe(async () => {
      const [r] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM property_contracts
         WHERE "companyId"=$1 AND status='active'
           AND "endDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0),

    // ─── 10. FLEET MAINTENANCE DUE (30 days) ──────────────────────────────
    safe(async () => {
      const [r] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM fleet_vehicles
         WHERE "companyId"=$1 AND "deletedAt" IS NULL
           AND ("nextServiceDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                OR "registrationExpiry"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0),

    // ─── 11. HR DOCUMENT EXPIRIES (30 days) ───────────────────────────────
    safe(async () => {
      const [r] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM employees
         WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL
           AND ("iqamaExpiry"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                OR "passportExpiry"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0),

    // ─── 12. MONTH-TO-DATE FINANCIALS ─────────────────────────────────────
    safe(async () => {
      const period = currentPeriod();
      const [y, m] = period.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = toDateISO(new Date(y, m, 0));
      const [revenue] = await rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS v
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId"=$1 AND je."deletedAt" IS NULL
           AND je."balancesApplied" = true
           AND coa.type='revenue' AND je."createdAt"::date BETWEEN $2::date AND $3::date`,
        [companyId, start, end]
      );
      const [expense] = await rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS v
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId"=$1 AND je."deletedAt" IS NULL
           AND je."balancesApplied" = true
           AND coa.type='expense' AND je."createdAt"::date BETWEEN $2::date AND $3::date`,
        [companyId, start, end]
      );
      return {
        revenue: Number(revenue?.v ?? 0),
        expense: Number(expense?.v ?? 0),
        net: Number(revenue?.v ?? 0) - Number(expense?.v ?? 0),
      };
    }, { revenue: 0, expense: 0, net: 0 }),

    // ─── 13. UMRAH SUMMARY (cross-domain — was missing from CEO view) ──────
    safe(async () => {
      const [r] = await rawQuery<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*)::int FROM umrah_pilgrims WHERE "companyId"=$1 AND "deletedAt" IS NULL) AS "totalPilgrims",
           (SELECT COUNT(*)::int FROM umrah_pilgrims WHERE "companyId"=$1 AND "deletedAt" IS NULL AND COALESCE("overstayDays",0) > 0) AS overstays,
           (SELECT COUNT(*)::int FROM umrah_seasons WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status='active') AS "activeSeasons",
           (SELECT COUNT(*)::int FROM umrah_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status NOT IN ('resolved','closed','cancelled')) AS "openViolations"`,
        [companyId]
      );
      return {
        totalPilgrims: Number(r?.totalPilgrims ?? 0),
        overstays: Number(r?.overstays ?? 0),
        activeSeasons: Number(r?.activeSeasons ?? 0),
        openViolations: Number(r?.openViolations ?? 0),
      };
    }, { totalPilgrims: 0, overstays: 0, activeSeasons: 0, openViolations: 0 }),

    // ─── 14. LEGAL SUMMARY (cross-domain — was missing from CEO view) ──────
    safe(async () => {
      const [r] = await rawQuery<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*)::int FROM legal_cases WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status NOT IN ('closed','resolved','cancelled')) AS "openCases",
           (SELECT COUNT(*)::int FROM legal_judgments WHERE "companyId"=$1 AND COALESCE("paidAmount",0) < amount AND "dueDate" < CURRENT_DATE) AS "overdueJudgments",
           (SELECT COALESCE(SUM(amount - COALESCE("paidAmount",0)),0) FROM legal_judgments WHERE "companyId"=$1 AND COALESCE("paidAmount",0) < amount) AS "unpaidJudgments"`,
        [companyId]
      );
      return {
        openCases: Number(r?.openCases ?? 0),
        overdueJudgments: Number(r?.overdueJudgments ?? 0),
        unpaidJudgments: roundTo2(Number(r?.unpaidJudgments ?? 0)),
      };
    }, { openCases: 0, overdueJudgments: 0, unpaidJudgments: 0 }),
    ]); // end Promise.all

    // ─── ROLL-UP RISK SCORE ───────────────────────────────────────────────
    // Composite: 0..100 — higher means more attention needed
    const riskSignals = {
      criticalObligations: obligations.breached + obligations.escalatedL1 * 2 + obligations.escalatedL2 * 3,
      slaBreaches: slaBreaches.support + slaBreaches.workflow,
      stuckWorkflows,
      budgetOver100: budgetOverages.over100,
      ar90Plus: ar.d90_plus > 0 ? 10 : 0,
      dunningL4L5: dunning.filter((d: any) => d.stage >= 4).reduce((s: number, d: any) => s + d.count, 0),
      expiringContracts,
      fleetMaintenance,
      hrDocExpiries,
    };
    const rawScore =
      riskSignals.criticalObligations * 3 +
      riskSignals.slaBreaches * 4 +
      riskSignals.stuckWorkflows * 2 +
      riskSignals.budgetOver100 * 5 +
      riskSignals.ar90Plus +
      riskSignals.dunningL4L5 * 3 +
      riskSignals.expiringContracts +
      riskSignals.fleetMaintenance +
      riskSignals.hrDocExpiries;
    const riskScore = Math.min(100, rawScore);
    const riskLevel = riskScore >= 70 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 15 ? "medium" : "low";

    res.json(maskFields(req, {
      generatedAt: new Date().toISOString(),
      companyId,
      riskScore,
      riskLevel,
      riskSignals,
      cashPosition,
      ar,
      ap,
      mtd,
      obligations,
      slaBreaches,
      stuckWorkflows,
      budgetOverages,
      dunning,
      expiringContracts,
      fleetMaintenance,
      hrDocExpiries,
      umrahSummary,
      legalSummary,
    }));
  } catch (err) {
    handleRouteError(err, res, "Exec dashboard error:");
  }
});

// Drill-down: top overdue invoices
execDashboardRouter.get("/overdue-invoices", authorize({ feature: "dashboard.executive", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    // Was N+1: correlated MAX(stage) per invoice over dunning_letters.
    // LIMIT 50 caps the surface but the CFO Cockpit refreshes this on
    // every dashboard tick. Single GROUP BY CTE collapses to one scan.
    const rows = await rawQuery<Record<string, unknown>>(
      `WITH dunning_stages AS (
         SELECT "invoiceId", MAX(stage) AS stage
           FROM dunning_letters
          GROUP BY "invoiceId"
       )
       SELECT i.id, i.ref AS "invoiceNumber", i."dueDate",
              i.total, COALESCE(i."paidAmount",0) AS "paidAmount",
              (i.total - COALESCE(i."paidAmount",0)) AS outstanding,
              (CURRENT_DATE - i."dueDate"::date)::int AS "daysPastDue",
              COALESCE(ds.stage, 0) AS "dunningStage",
              c.name AS "clientName"
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId" AND c."companyId" = i."companyId" AND c."deletedAt" IS NULL
         LEFT JOIN dunning_stages ds ON ds."invoiceId" = i.id
        WHERE i."companyId"=$1 AND i.status NOT IN ('paid','cancelled')
          AND i."deletedAt" IS NULL
          AND i."dueDate"::date < CURRENT_DATE
          AND (i.total - COALESCE(i."paidAmount",0)) > 0
        ORDER BY (CURRENT_DATE - i."dueDate"::date) DESC
        LIMIT 50`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) {
    handleRouteError(err, res, "Overdue invoices error:");
  }
});

// Drill-down: critical obligations
// N18 — Unified company-wide P&L across every revenue/expense domain.
//
// The audit found that the per-module dashboards stop at their own
// domain (umrah commission report covers commissions only, property
// dashboard covers rent only, etc.) — but the GL substrate already
// dimensions every journal line with sourceType + per-domain FKs
// (umrahAgentId, vehicleId, propertyId, contractId, projectId).
// That means a true company P&L is a rollup of journal_lines grouped
// by (a) account type (revenue vs expense) and (b) sourceType, with
// no new tables needed.
//
// Output shape:
//   {
//     period: { from, to },
//     totals: { revenue, expense, net },
//     bySource: [{ sourceType, revenue, expense, net }],
//     byAccount: [{ accountCode, name, type, debit, credit, total }]
//   }
//
// Filters: optional ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to this
// fiscal month if absent). Date is matched against journal_entries.date,
// not createdAt, so back-dated entries land in the correct period.
execDashboardRouter.get("/unified-pnl", authorize({ feature: "dashboard.executive", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    const companyId = scope.companyId;

    // Period bounds. Default = Riyadh month-to-date. Match
    // journal_entries.date, not createdAt, so a JE dated 2026-01-15
    // entered on 2026-02-03 shows up in January's P&L not February's.
    // Use currentYear/currentMonthPadded — both anchored at
    // Asia/Riyadh — instead of `new Date()` whose UTC slip would put
    // the first of every Hijri month in the wrong period at midnight.
    const ryYear = currentYear();
    const ryMonth = Number(currentMonthPadded());
    const defaultFrom = `${ryYear}-${String(ryMonth).padStart(2, "0")}-01`;
    const defaultTo = todayISO();
    const fromDate = String(req.query.from ?? defaultFrom);
    const toDate = String(req.query.to ?? defaultTo);

    // 1. Totals — Revenue is `4xxx` accounts (credit-natural), expense is
    //    `5xxx` (debit-natural). Net = Revenue - Expense.
    const totals = await safe(async () => {
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT
           COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         LEFT JOIN chart_of_accounts coa
                ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId" = $1
           AND je.status = 'posted'
           AND je."deletedAt" IS NULL
           AND je.date BETWEEN $2::date AND $3::date`,
        [companyId, fromDate, toDate]
      );
      const revenue = Number(row?.revenue ?? 0);
      const expense = Number(row?.expense ?? 0);
      return { revenue: roundTo2(revenue), expense: roundTo2(expense), net: roundTo2(revenue - expense) };
    }, { revenue: 0, expense: 0, net: 0 });

    // 2. Breakdown by sourceType — surfaces "which domain is making
    //    money / losing money". sourceType=null means manual journal
    //    entries — grouped under 'manual' for readability.
    const bySource = await safe(async () => {
      return rawQuery<Record<string, unknown>>(
        `SELECT
           COALESCE(je."sourceType", 'manual') AS "sourceType",
           COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         LEFT JOIN chart_of_accounts coa
                ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId" = $1
           AND je.status = 'posted'
           AND je."deletedAt" IS NULL
           AND je.date BETWEEN $2::date AND $3::date
           AND coa.type IN ('revenue', 'expense')
         GROUP BY je."sourceType"
         ORDER BY ABS(COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN jl.credit - jl.debit
                                        WHEN coa.type = 'expense' THEN -(jl.debit - jl.credit)
                                        ELSE 0 END), 0)) DESC`,
        [companyId, fromDate, toDate]
      ).then(rows => rows.map(r => {
        const revenue = Number(r.revenue ?? 0);
        const expense = Number(r.expense ?? 0);
        return { sourceType: r.sourceType, revenue: roundTo2(revenue), expense: roundTo2(expense), net: roundTo2(revenue - expense) };
      }));
    }, []);

    // 3. Top accounts — ordered by absolute impact, capped at 50 so the
    //    response stays small. Drilldown UIs can ask for more via pagination.
    const byAccount = await safe(async () => {
      return rawQuery<Record<string, unknown>>(
        `SELECT
           jl."accountCode" AS "accountCode",
           coa.name AS name,
           coa.type AS type,
           COALESCE(SUM(jl.debit), 0) AS debit,
           COALESCE(SUM(jl.credit), 0) AS credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         LEFT JOIN chart_of_accounts coa
                ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId" = $1
           AND je.status = 'posted'
           AND je."deletedAt" IS NULL
           AND je.date BETWEEN $2::date AND $3::date
           AND coa.type IN ('revenue', 'expense')
         GROUP BY jl."accountCode", coa.name, coa.type
         ORDER BY ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) DESC
         LIMIT 50`,
        [companyId, fromDate, toDate]
      ).then(rows => rows.map(r => {
        const debit = Number(r.debit ?? 0);
        const credit = Number(r.credit ?? 0);
        return {
          accountCode: r.accountCode,
          name: r.name,
          type: r.type,
          debit: roundTo2(debit),
          credit: roundTo2(credit),
          total: roundTo2(r.type === "revenue" ? credit - debit : debit - credit),
        };
      }));
    }, []);

    res.json(maskFields(req, {
      period: { from: fromDate, to: toDate },
      totals,
      bySource,
      byAccount,
    }));
  } catch (err) {
    handleRouteError(err, res, "[exec-dashboard/unified-pnl]");
  }
});

execDashboardRouter.get("/critical-obligations", authorize({ feature: "dashboard.executive", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "entityType", "entityId", "obligationType", title, "dueAt",
              status, "escalationLevel", "assignedTo"
       FROM obligations
       WHERE "companyId"=$1 AND status IN ('breached','escalated_l1','escalated_l2')
       ORDER BY "escalationLevel" DESC, "dueAt" ASC
       LIMIT 50`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "exec dashboard query failed"); return []; });
    res.json(maskFields(req, { data: rows }));
  } catch (err) {
    handleRouteError(err, res, "Critical obligations error:");
  }
});

export default execDashboardRouter;
