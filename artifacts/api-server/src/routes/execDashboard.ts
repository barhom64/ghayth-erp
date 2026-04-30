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
import { currentPeriod, toDateISO, roundTo2 } from "../lib/businessHelpers.js";
import { handleRouteError, ForbiddenError } from "../lib/errorHandler.js";
import { obligationSummary } from "../lib/obligationsEngine.js";
import { EXEC_ROLES } from "../lib/rbacCatalog.js";
import { logger } from "../lib/logger.js";

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

execDashboardRouter.get("/overview", async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    const companyId = scope.companyId;

    // ─── 1. CASH POSITION ─────────────────────────────────────────────────
    const cashPosition = await safe(async () => {
      const rows = await rawQuery<any>(
        `SELECT code, name, "currentBalance"
         FROM chart_of_accounts
         WHERE "companyId"=$1 AND code LIKE '11%' AND type='asset'
         ORDER BY code`,
        [companyId]
      );
      const total = rows.reduce((s: number, r: any) => s + Number(r.currentBalance ?? 0), 0);
      return { total: roundTo2(total), accounts: rows };
    }, { total: 0, accounts: [] });

    // ─── 2. AR AGING ───────────────────────────────────────────────────────
    const ar = await safe(async () => {
      const [sums] = await rawQuery<any>(
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
    }, { total: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });

    // ─── 3. AP EXPOSURE (open POs) ────────────────────────────────────────
    const ap = await safe(async () => {
      const [sums] = await rawQuery<any>(
        `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS count
         FROM purchase_orders
         WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled','draft') AND "deletedAt" IS NULL`,
        [companyId]
      );
      return { total: Number(sums?.total ?? 0), count: Number(sums?.count ?? 0) };
    }, { total: 0, count: 0 });

    // ─── 4. OBLIGATIONS SUMMARY ───────────────────────────────────────────
    const obligations = await safe(
      () => obligationSummary(companyId),
      { pending: 0, breached: 0, escalatedL1: 0, escalatedL2: 0, dueIn24h: 0, dueIn7d: 0, byType: {} }
    );

    // ─── 5. SLA BREACHES (support + workflow) ─────────────────────────────
    const slaBreaches = await safe(async () => {
      const [support] = await rawQuery<any>(
        `SELECT COUNT(*)::int AS n FROM support_tickets
         WHERE "companyId"=$1 AND status='open' AND "deletedAt" IS NULL AND "slaDeadline" < NOW()`,
        [companyId]
      );
      const [workflow] = await rawQuery<any>(
        `SELECT COUNT(*)::int AS n FROM workflow_instances
         WHERE "companyId"=$1 AND status IN ('pending','in_review','escalated')
           AND "slaStatus" IN ('breached','at_risk')`,
        [companyId]
      ).catch(() => [{ n: 0 }]);
      return {
        support: Number(support?.n ?? 0),
        workflow: Number(workflow?.n ?? 0),
      };
    }, { support: 0, workflow: 0 });

    // ─── 6. STUCK WORKFLOWS (pending >3 days) ─────────────────────────────
    const stuckWorkflows = await safe(async () => {
      const [r] = await rawQuery<any>(
        `SELECT COUNT(*)::int AS n FROM workflow_instances
         WHERE "companyId"=$1 AND status IN ('pending','in_review')
           AND "createdAt" < NOW() - INTERVAL '3 days'`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0);

    // ─── 7. BUDGET OVERAGES (current month) ───────────────────────────────
    const budgetOverages = await safe(async () => {
      const period = currentPeriod();
      const [y, m] = period.split("-").map(Number);
      const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const periodEnd = toDateISO(new Date(y, m, 0));
      const rows = await rawQuery<any>(
        `SELECT b."accountCode", coa.name AS "accountName", b.amount AS "budget",
                COALESCE((
                  SELECT SUM(jl.debit - jl.credit)
                  FROM journal_lines jl
                  JOIN journal_entries je ON je.id = jl."journalId"
                  WHERE je."companyId" = b."companyId" AND je."deletedAt" IS NULL
                    AND je.status = 'posted'
                    AND jl."accountCode" = b."accountCode"
                    AND je."createdAt"::date BETWEEN $2::date AND $3::date
                ), 0) AS "actual"
         FROM budgets b
         LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
         WHERE b."companyId"=$1 AND b.period=$4 AND b.amount > 0`,
        [companyId, periodStart, periodEnd, period]
      );
      const withPct = rows
        .map((r: any) => {
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
        .filter((r: any) => r.pct >= 80)
        .sort((a: any, b: any) => b.pct - a.pct);
      return {
        count: withPct.length,
        over100: withPct.filter((r: any) => r.pct > 100).length,
        top5: withPct.slice(0, 5),
      };
    }, { count: 0, over100: 0, top5: [] });

    // ─── 8. DUNNING PIPELINE ──────────────────────────────────────────────
    const dunning = await safe(async () => {
      const rows = await rawQuery<any>(
        `SELECT "lastDunningStage" AS stage, COUNT(*)::int AS count,
                COALESCE(SUM(total - COALESCE("paidAmount",0)), 0) AS amount
         FROM invoices
         WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled')
           AND "deletedAt" IS NULL AND "lastDunningStage" > 0
         GROUP BY "lastDunningStage" ORDER BY "lastDunningStage"`,
        [companyId]
      );
      return rows;
    }, []);

    // ─── 9. PROPERTY CONTRACTS EXPIRING (60 days) ─────────────────────────
    const expiringContracts = await safe(async () => {
      const [r] = await rawQuery<any>(
        `SELECT COUNT(*)::int AS n FROM property_contracts
         WHERE "companyId"=$1 AND status='active'
           AND "endDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0);

    // ─── 10. FLEET MAINTENANCE DUE (30 days) ──────────────────────────────
    const fleetMaintenance = await safe(async () => {
      const [r] = await rawQuery<any>(
        `SELECT COUNT(*)::int AS n FROM fleet_vehicles
         WHERE "companyId"=$1 AND "deletedAt" IS NULL
           AND ("nextServiceDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                OR "registrationExpiry"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0);

    // ─── 11. HR DOCUMENT EXPIRIES (30 days) ───────────────────────────────
    const hrDocExpiries = await safe(async () => {
      const [r] = await rawQuery<any>(
        `SELECT COUNT(*)::int AS n FROM employees
         WHERE "companyId"=$1 AND status='active'
           AND ("iqamaExpiry"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                OR "passportExpiry"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')`,
        [companyId]
      );
      return Number(r?.n ?? 0);
    }, 0);

    // ─── 12. MONTH-TO-DATE FINANCIALS ─────────────────────────────────────
    const mtd = await safe(async () => {
      const period = currentPeriod();
      const [y, m] = period.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = toDateISO(new Date(y, m, 0));
      const [revenue] = await rawQuery<any>(
        `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS v
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId"=$1 AND je."deletedAt" IS NULL
           AND je.status = 'posted'
           AND coa.type='revenue' AND je."createdAt"::date BETWEEN $2::date AND $3::date`,
        [companyId, start, end]
      );
      const [expense] = await rawQuery<any>(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS v
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = je."companyId"
         WHERE je."companyId"=$1 AND je."deletedAt" IS NULL
           AND je.status = 'posted'
           AND coa.type='expense' AND je."createdAt"::date BETWEEN $2::date AND $3::date`,
        [companyId, start, end]
      );
      return {
        revenue: Number(revenue?.v ?? 0),
        expense: Number(expense?.v ?? 0),
        net: Number(revenue?.v ?? 0) - Number(expense?.v ?? 0),
      };
    }, { revenue: 0, expense: 0, net: 0 });

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

    res.json({
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
    });
  } catch (err) {
    handleRouteError(err, res, "Exec dashboard error:");
  }
});

// Drill-down: top overdue invoices
execDashboardRouter.get("/overdue-invoices", async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    const rows = await rawQuery<any>(
      `SELECT i.id, i.ref AS "invoiceNumber", i."dueDate",
              i.total, COALESCE(i."paidAmount",0) AS "paidAmount",
              (i.total - COALESCE(i."paidAmount",0)) AS outstanding,
              (CURRENT_DATE - i."dueDate"::date)::int AS "daysPastDue",
              COALESCE(i."lastDunningStage",0) AS "dunningStage",
              c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       WHERE i."companyId"=$1 AND i.status NOT IN ('paid','cancelled')
         AND i."deletedAt" IS NULL
         AND i."dueDate"::date < CURRENT_DATE
         AND (i.total - COALESCE(i."paidAmount",0)) > 0
       ORDER BY (CURRENT_DATE - i."dueDate"::date) DESC
       LIMIT 50`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Overdue invoices error:");
  }
});

// Drill-down: critical obligations
execDashboardRouter.get("/critical-obligations", async (req, res) => {
  try {
    const scope = req.scope!;
    requireExec(scope);
    const rows = await rawQuery<any>(
      `SELECT id, "entityType", "entityId", "obligationType", title, "dueAt",
              status, "escalationLevel", "assignedTo"
       FROM obligations
       WHERE "companyId"=$1 AND status IN ('breached','escalated_l1','escalated_l2')
       ORDER BY "escalationLevel" DESC, "dueAt" ASC
       LIMIT 50`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "exec dashboard query failed"); return []; });
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Critical obligations error:");
  }
});

export default execDashboardRouter;
