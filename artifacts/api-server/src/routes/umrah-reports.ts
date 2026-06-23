// ─────────────────────────────────────────────────────────────────────────────
// umrah-reports.ts — UMRAH OPERATIONAL REPORTS (U-07 Phase 11)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(reportsRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/reports/...).
//
// Pure code move — handlers + RBAC are carried over VERBATIM (no behaviour
// change). Every route here is READ-ONLY: pure SELECT aggregates feeding
// ops/compliance/portfolio screens (+ one renderPrint PDF for the run-sheet).
// No writes, no ledger posting, no direct cross-domain writes — so no
// audit/event helpers are needed (renderPrint owns its own print-audit row).
//
// Routes owned here:
//   GET /reports/daily-runsheet
//   GET /reports/daily-runsheet/pdf
//   GET /reports/reconciliation
//   GET /reports/exempt-pilgrims
//   GET /reports/group-portfolio
//   GET /reports/season-portfolio
//   GET /reports/compliance          (U-07 Phase 13)
//   GET /reports/agent-balances      (U-07 Phase 13)
//   GET /reports/pilgrim-movements   (U-07 Phase 13)
//   GET /reports/subagent-balances   (U-07 Phase 13)
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError, parseId } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { renderPrint } from "../lib/print/printService.js";
import { gccExclusionSqlFragment } from "../lib/umrahNationalityRules.js";
// U-07 Phase 16 — analytical reports batch 1: assistant suggestions + reports
// catalog carried over from umrah-entities.ts with their engine/catalog deps.
import { getDashboardSuggestions } from "../lib/umrahAssistantEngine.js";
import {
  UMRAH_REPORTS_CATALOG,
  REPORT_CATEGORY_LABELS_AR,
  REPORT_STATUS_LABELS_AR,
} from "../lib/umrahReportsCatalog.js";

const router = Router();

// ============================================================================
// REPORTS — Daily run-sheet (arrivals + departures + overstays)
// ============================================================================

// Returns arrivals + departures for `date` (defaults to today, ISO yyyy-mm-dd)
// + everyone currently overstaying. Used by ops to plan transport / hotel
// allocations and chase overstays. Same payload also feeds the PDF endpoint.
async function fetchDailyRunsheet(companyId: number, date: string) {
  const baseSelect = `
    SELECT p."nuskNumber", p."fullName", p.nationality,
           g.name AS "groupName", sa.name AS "subAgentName",
           p."entryPort", p."entryFlight", p."exitPort", p."exitFlight",
           p."overstayDays"
      FROM umrah_pilgrims p
      LEFT JOIN umrah_groups g ON g.id = p."groupId"
      LEFT JOIN umrah_sub_agents sa ON sa.id = p."subAgentId"
     WHERE p."companyId" = $1 AND p."deletedAt" IS NULL`;

  const [arrivals, departures, overstays] = await Promise.all([
    rawQuery<Record<string, unknown>>(`${baseSelect} AND p."entryDate" = $2 ORDER BY g.name NULLS LAST, p."fullName"`, [companyId, date]),
    rawQuery<Record<string, unknown>>(`${baseSelect} AND p."exitDate" = $2 ORDER BY g.name NULLS LAST, p."fullName"`, [companyId, date]),
    rawQuery<Record<string, unknown>>(`${baseSelect} AND p.status IN ('overstayed','violated') AND p."overstayDays" > 0 ORDER BY p."overstayDays" DESC, p."fullName"`, [companyId]),
  ]);

  return { arrivals, departures, overstays };
}

router.get("/reports/daily-runsheet", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const date = String((req.query.date as string) || todayISO());
    const data = await fetchDailyRunsheet(scope.companyId, date);
    res.json(maskFields(req, { date, ...data }));
  } catch (err) { handleRouteError(err, res, "Daily run-sheet"); }
});

router.get("/reports/daily-runsheet/pdf", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const date = String((req.query.date as string) || todayISO());
    const data = await fetchDailyRunsheet(scope.companyId, date);
    const arrivals = (data.arrivals as Array<Record<string, unknown>>).map((r) => ({
      "رقم نسك": r.nuskNumber, "الاسم": r.fullName, "الجنسية": r.nationality ?? "-",
      "المجموعة": r.groupName ?? "-", "الوكيل الفرعي": r.subAgentName ?? "-",
      "ميناء": r.entryPort ?? "-", "رحلة": r.entryFlight ?? "-",
    }));
    const departures = (data.departures as Array<Record<string, unknown>>).map((r) => ({
      "رقم نسك": r.nuskNumber, "الاسم": r.fullName, "الجنسية": r.nationality ?? "-",
      "المجموعة": r.groupName ?? "-", "الوكيل الفرعي": r.subAgentName ?? "-",
      "ميناء": r.exitPort ?? "-", "رحلة": r.exitFlight ?? "-",
    }));
    const overstays = (data.overstays as Array<Record<string, unknown>>).map((r) => ({
      "رقم نسك": r.nuskNumber, "الاسم": r.fullName, "الجنسية": r.nationality ?? "-",
      "المجموعة": r.groupName ?? "-", "الوكيل الفرعي": r.subAgentName ?? "-",
      "أيام التجاوز": r.overstayDays,
    }));

    const result = await renderPrint(
      {
        companyId: scope.companyId, branchId: scope.branchId ?? null,
        userId: scope.userId, role: scope.role, isOwner: scope.isOwner,
      },
      {
        entityType: "umrah_runsheet",
        entityId: date,
        format: "a4",
        previewPayload: {
          entity: {
            id: date,
            date,
            arrivalsCount: arrivals.length,
            departuresCount: departures.length,
            overstaysCount: overstays.length,
          },
          arrivals, departures, overstays,
        },
      },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="umrah-runsheet-${date}.${result.mime.includes("html") ? "html" : "pdf"}"`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) { handleRouteError(err, res, "Daily run-sheet PDF"); }
});

// ============================================================================
// RECONCILIATION REPORT — NUSK file ↔ system diff (#8)
// ============================================================================

// Compares the canonical NUSK invoice file against system state in three
// dimensions:
//   1. Total amount of nusk invoice vs total of journal entries against it
//      (catches refunds / partial payments missed by the importer).
//   2. mutamerCount on the nusk invoice vs actual pilgrims linked to its
//      group (catches drop-outs that the file never recorded).
//   3. Overstays: pilgrims with overstayDays > 0 and no open violation row
//      (catches violations the cron should have created but didn't).
//
// Read-only — no mutations. Output is grouped so ops can drill into the
// specific records that need attention without re-running ad-hoc SQL.
router.get("/reports/reconciliation", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    const seasonNum = seasonId ? Number(seasonId) : null;

    // M1: the season filter was computed but never applied to any of the
    // three reconciliation queries. umrah_nusk_invoices carries no
    // seasonId, so amountDiffs/countDiffs scope through the invoice's
    // group; overstayGaps scopes the pilgrim directly. $2 is bound only
    // when a season is requested.
    const params: unknown[] = seasonNum != null ? [scope.companyId, seasonNum] : [scope.companyId];
    const nuskSeasonClause = seasonNum != null
      ? ` AND ni."groupId" IN (SELECT id FROM umrah_groups WHERE "companyId" = $1 AND "seasonId" = $2)`
      : "";
    const groupSeasonClause = seasonNum != null ? ` AND g."seasonId" = $2` : "";
    const pilgrimSeasonClause = seasonNum != null ? ` AND p."seasonId" = $2` : "";

    // 1. Amount diff: nusk total vs posted JE total
    const amountDiffs = await rawQuery<Record<string, unknown>>(
      `SELECT ni.id, ni."nuskInvoiceNumber", ni."totalAmount" AS "fileTotal",
              ni."nuskStatus", ni."purchaseInvoiceId", ni."journalEntryId",
              COALESCE(je_ap.total, 0) AS "postedAp",
              COALESCE(je_rf.total, 0) AS "postedRefund",
              (ni."totalAmount" - COALESCE(je_ap.total, 0) + COALESCE(je_rf.total, 0))::numeric(12,2) AS "diff"
         FROM umrah_nusk_invoices ni
    LEFT JOIN LATERAL (
           SELECT SUM(jl.debit) AS total FROM journal_entries je
             JOIN journal_lines jl ON jl."journalId" = je.id
            WHERE je.id = ni."purchaseInvoiceId" AND je."deletedAt" IS NULL
              AND jl."accountCode" LIKE '5%'
         ) je_ap ON true
    LEFT JOIN LATERAL (
           SELECT SUM(jl.credit) AS total FROM journal_entries je
             JOIN journal_lines jl ON jl."journalId" = je.id
            WHERE je.id = ni."journalEntryId" AND je."deletedAt" IS NULL
              AND jl."accountCode" LIKE '5%'
         ) je_rf ON true
        WHERE ni."companyId" = $1 AND ni."deletedAt" IS NULL
          AND ni."nuskStatus" != 'cancelled'${nuskSeasonClause}
          AND ABS(ni."totalAmount" - COALESCE(je_ap.total, 0) + COALESCE(je_rf.total, 0)) > 0.01
        ORDER BY ABS(ni."totalAmount" - COALESCE(je_ap.total, 0) + COALESCE(je_rf.total, 0)) DESC
        LIMIT 500`,
      params
    );

    // 2. Mutamer count diff: file says X, system has Y in the linked group
    // Pre-aggregate umrah_pilgrims counts via CTE — the original
    // query ran the SAME scalar COUNT subquery THREE TIMES per row
    // (SELECT column + WHERE filter + ORDER BY). At LIMIT 500 that's
    // 1501 redundant lookups through umrah_pilgrims. One CTE scan +
    // LEFT JOIN collapses it to a single pass.
    const countDiffs = await rawQuery<Record<string, unknown>>(
      `WITH pilgrim_counts AS (
         SELECT "groupId", "companyId", COUNT(*) AS "systemCount"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "groupId", "companyId"
       )
       SELECT ni.id, ni."nuskInvoiceNumber", ni."mutamerCount" AS "fileCount",
              ni."groupId", g.name AS "groupName",
              COALESCE(pc."systemCount", 0)::int AS "systemCount"
         FROM umrah_nusk_invoices ni
    LEFT JOIN umrah_groups g ON g.id = ni."groupId"
    LEFT JOIN pilgrim_counts pc ON pc."groupId" = ni."groupId" AND pc."companyId" = ni."companyId"
        WHERE ni."companyId" = $1 AND ni."deletedAt" IS NULL
          AND ni."groupId" IS NOT NULL${groupSeasonClause}
          AND ni."mutamerCount" IS NOT NULL
          AND ni."mutamerCount" != COALESCE(pc."systemCount", 0)
        ORDER BY ABS(ni."mutamerCount" - COALESCE(pc."systemCount", 0)) DESC
        LIMIT 500`,
      params
    );

    // 3. Overstays without a violation row
    const overstayGaps = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."nuskNumber", p."fullName", p."overstayDays", p."groupId",
              g.name AS "groupName", sa.name AS "subAgentName"
         FROM umrah_pilgrims p
    LEFT JOIN umrah_groups g ON g.id = p."groupId"
    LEFT JOIN umrah_sub_agents sa ON sa.id = p."subAgentId"
        WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
          AND COALESCE(p."overstayDays", 0) > 0${pilgrimSeasonClause}
          AND NOT EXISTS (
            SELECT 1 FROM umrah_violations v
             WHERE v."mutamerId" = p.id
               AND v."companyId" = p."companyId"
               AND v.status IN ('detected','open')
               AND v."deletedAt" IS NULL
          )
        ORDER BY p."overstayDays" DESC
        LIMIT 500`,
      params
    );

    res.json(maskFields(req, {
      summary: {
        amountDiffs: amountDiffs.length,
        countDiffs: countDiffs.length,
        overstayGaps: overstayGaps.length,
      },
      amountDiffs,
      countDiffs,
      overstayGaps,
    }));
  } catch (err) { handleRouteError(err, res, "Reconciliation report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Exempt-pilgrims compliance report — closes the audit-trail gap from PRs
// #1482-1484. Per-pilgrim exemption is captured (overstayExempt /Reason /By
// /At) and shown on the pilgrim detail page, but there was no rollup so a
// compliance officer couldn't answer "who is currently exempt, on whose
// authority, and why" without grepping audit_logs.
//
// Newest exemptions first — typical use case is "did anything change today
// that I should sign off on?". JOINs users + employees so the response
// carries `exemptedByName` (employee name preferred, falling back to user
// email) instead of just an opaque userId. Tenant-scoped + soft-delete
// filtered on every JOIN.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/exempt-pilgrims", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, agentId, groupId } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let filterClause = "";
    if (seasonId) { params.push(Number(seasonId)); filterClause += ` AND p."seasonId" = $${params.length}`; }
    if (agentId)  { params.push(Number(agentId));  filterClause += ` AND p."agentId" = $${params.length}`; }
    if (groupId)  { params.push(Number(groupId));  filterClause += ` AND p."groupId" = $${params.length}`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."nuskNumber", p.nationality, p.status,
              p."overstayExemptReason" AS "reason",
              p."overstayExemptAt" AS "exemptedAt",
              p."overstayExemptBy" AS "exemptedById",
              COALESCE(e.name, u.email) AS "exemptedByName",
              p."seasonId", p."groupId", p."agentId",
              s.title AS "seasonTitle",
              g.name AS "groupName",
              g."nuskGroupNumber" AS "groupNuskNumber",
              a.name AS "agentName",
              p."arrivalDate", p."departureDate", p."overstayDays"
         FROM umrah_pilgrims p
    LEFT JOIN users u
           ON u.id = p."overstayExemptBy"
    LEFT JOIN employees e
           ON e.id = u."employeeId"
    LEFT JOIN umrah_seasons s
           ON s.id = p."seasonId" AND s."companyId" = p."companyId" AND s."deletedAt" IS NULL
    LEFT JOIN umrah_groups g
           ON g.id = p."groupId" AND g."companyId" = p."companyId" AND g."deletedAt" IS NULL
    LEFT JOIN umrah_agents a
           ON a.id = p."agentId" AND a."companyId" = p."companyId" AND a."deletedAt" IS NULL
        WHERE p."companyId" = $1
          AND p."deletedAt" IS NULL
          AND p."overstayExempt" = true${filterClause}
        ORDER BY p."overstayExemptAt" DESC NULLS LAST
        LIMIT 500`,
      params,
    );

    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Exempt pilgrims report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Group portfolio P&L — "which groups make money?". Mirrors the agent
// portfolio page (PR #1222) but at the group granularity. Operators wanted a
// rollup that answers "is this season profitable?" without opening every group
// detail one by one.
//
// Revenue per group: SUM(umrah_sales_invoice_items.lineTotal) for non-
// cancelled invoices — items table holds the groupId (header doesn't).
// Cost per group: SUM(umrah_nusk_invoices.netCost) for non-cancelled rows
// directly linked via groupId. Margin = revenue − cost.
//
// Single query with two LATERAL subqueries so even a 500-group season returns
// in one roundtrip. Tenant-scoped at every JOIN.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/group-portfolio", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, limit: limitStr } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(limitStr ?? "50") || 50, 1), 500);

    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND g."seasonId" = $${params.length}`; }
    params.push(limit);

    const rows = await rawQuery<Record<string, unknown>>(
      // Pre-aggregate umrah_pilgrims actual counts via CTE — same
      // pattern as the rest of the N+1 sweep. Avoids one lookup per
      // returned group row through umrah_pilgrims.
      `WITH pilgrim_actuals AS (
         SELECT "groupId", "companyId", COUNT(*) AS "actualPilgrims"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "groupId", "companyId"
       )
       SELECT g.id, g.name, g."nuskGroupNumber", g.status, g."seasonId",
              s.title AS "seasonTitle",
              g."agentId", a.name AS "agentName",
              g."mutamerCount" AS "expectedPilgrims",
              COALESCE(pa."actualPilgrims", 0)::int AS "actualPilgrims",
              COALESCE(sales.revenue, 0) AS revenue,
              COALESCE(sales.paid, 0)    AS paid,
              COALESCE(nusk.cost, 0)     AS cost,
              (COALESCE(sales.revenue, 0) - COALESCE(nusk.cost, 0))::numeric(12,2) AS margin
         FROM umrah_groups g
    LEFT JOIN umrah_seasons s
           ON s.id = g."seasonId" AND s."companyId" = g."companyId" AND s."deletedAt" IS NULL
    LEFT JOIN pilgrim_actuals pa
           ON pa."groupId" = g.id AND pa."companyId" = g."companyId"
    LEFT JOIN umrah_agents a
           ON a.id = g."agentId" AND a."companyId" = g."companyId" AND a."deletedAt" IS NULL
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(DISTINCT si.total), 0) AS revenue,
                  COALESCE(SUM(DISTINCT si."paidAmount"), 0) AS paid
             FROM umrah_sales_invoice_items it
             JOIN umrah_sales_invoices si
               ON si.id = it."invoiceId" AND si."companyId" = g."companyId" AND si."deletedAt" IS NULL
            WHERE it."groupId" = g.id
              AND it."companyId" = g."companyId"
              AND it."deletedAt" IS NULL
              AND si.status <> 'cancelled'
         ) sales ON true
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM("netCost"), 0) AS cost
             FROM umrah_nusk_invoices ni
            WHERE ni."groupId" = g.id
              AND ni."companyId" = g."companyId"
              AND ni."deletedAt" IS NULL
              AND ni."nuskStatus" <> 'cancelled'
         ) nusk ON true
        WHERE g."companyId" = $1
          AND g."deletedAt" IS NULL${seasonClause}
        ORDER BY margin DESC
        LIMIT $${params.length}`,
      params,
    );

    const totals = rows.reduce<{ revenue: number; cost: number; paid: number; margin: number }>(
      (acc, r) => ({
        revenue: acc.revenue + Number(r.revenue ?? 0),
        cost:    acc.cost    + Number(r.cost ?? 0),
        paid:    acc.paid    + Number(r.paid ?? 0),
        margin:  acc.margin  + Number(r.margin ?? 0),
      }),
      { revenue: 0, cost: 0, paid: 0, margin: 0 },
    );

    res.json(maskFields(req, {
      data: rows,
      total: rows.length,
      totals,
    }));
  } catch (err) { handleRouteError(err, res, "Group portfolio report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Season portfolio P&L — "which seasons make money?". Companion to
// /reports/group-portfolio (PR #1495) at the season grain. Operators
// compare seasons across years/durations without opening each season
// detail one by one.
//
// Revenue per season: SUM(umrah_sales_invoices.total) — invoice header
// carries seasonId directly (unlike groups where we JOIN through items).
// Cost per season: SUM(umrah_nusk_invoices.netCost) reached through
// the group's seasonId since nusk has no seasonId column.
//
// Single roundtrip — no per-row fan-out. Tenant-scoped on every reach.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/season-portfolio", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, limit: limitStr } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(limitStr ?? "50") || 50, 1), 200);

    const params: unknown[] = [scope.companyId];
    let statusClause = "";
    if (status) { params.push(status); statusClause = ` AND s.status = $${params.length}`; }
    params.push(limit);

    const rows = await rawQuery<Record<string, unknown>>(
      // Pre-aggregate pilgrim + group counts per season via CTEs —
      // the original carried TWO scalar COUNT subqueries per row.
      // At LIMIT 200 that's ~400 redundant lookups. Two CTEs scan
      // each child table once.
      `WITH season_pilgrim_counts AS (
         SELECT "seasonId", "companyId", COUNT(*) AS "pilgrimsCount"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL
         GROUP BY "seasonId", "companyId"
       ),
       season_group_counts AS (
         SELECT "seasonId", "companyId", COUNT(*) AS "groupsCount"
         FROM umrah_groups
         WHERE "deletedAt" IS NULL
         GROUP BY "seasonId", "companyId"
       )
       SELECT s.id, s.title, s.status, NULL::int AS "hijriYear", s."startDate", s."endDate",
              COALESCE(spc."pilgrimsCount", 0)::int AS "pilgrimsCount",
              COALESCE(sgc."groupsCount", 0)::int AS "groupsCount",
              COALESCE(sales.revenue, 0) AS revenue,
              COALESCE(sales.paid, 0)    AS paid,
              COALESCE(nusk.cost, 0)     AS cost,
              (COALESCE(sales.revenue, 0) - COALESCE(nusk.cost, 0))::numeric(12,2) AS margin
         FROM umrah_seasons s
    LEFT JOIN season_pilgrim_counts spc
           ON spc."seasonId" = s.id AND spc."companyId" = s."companyId"
    LEFT JOIN season_group_counts sgc
           ON sgc."seasonId" = s.id AND sgc."companyId" = s."companyId"
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(total), 0) AS revenue,
                  COALESCE(SUM("paidAmount"), 0) AS paid
             FROM umrah_sales_invoices
            WHERE "seasonId"  = s.id
              AND "companyId" = s."companyId"
              AND "deletedAt" IS NULL
              AND status <> 'cancelled'
         ) sales ON true
    LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(ni."netCost"), 0) AS cost
             FROM umrah_nusk_invoices ni
            WHERE ni."companyId" = s."companyId"
              AND ni."deletedAt" IS NULL
              AND ni."nuskStatus" <> 'cancelled'
              AND ni."groupId" IN (
                SELECT id FROM umrah_groups
                 WHERE "seasonId" = s.id
                   AND "companyId" = s."companyId"
                   AND "deletedAt" IS NULL
              )
         ) nusk ON true
        WHERE s."companyId" = $1 AND s."deletedAt" IS NULL${statusClause}
        ORDER BY margin DESC
        LIMIT $${params.length}`,
      params,
    );

    const totals = rows.reduce<{ revenue: number; cost: number; paid: number; margin: number }>(
      (acc, r) => ({
        revenue: acc.revenue + Number(r.revenue ?? 0),
        cost:    acc.cost    + Number(r.cost ?? 0),
        paid:    acc.paid    + Number(r.paid ?? 0),
        margin:  acc.margin  + Number(r.margin ?? 0),
      }),
      { revenue: 0, cost: 0, paid: 0, margin: 0 },
    );

    res.json(maskFields(req, {
      data: rows,
      total: rows.length,
      totals,
    }));
  } catch (err) { handleRouteError(err, res, "Season portfolio report"); }
});

// ============================================================================
// DASHBOARD / COMPLIANCE REPORTS (U-07 Phase 13)
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Compliance dashboard — one screen, four numbers. Mirrors the existing
// exempt + visa-expiring + overstay + unpaid-penalties splits that
// previously lived on four separate pages. Each metric is a COUNT query
// scoped by tenant + soft-delete; together they answer "what's my
// compliance exposure today?".
//
// Optional ?seasonId narrows every metric to a single season — the audit
// officer typically reviews the active season's risk.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/compliance", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let seasonP = "";
    let seasonPenP = "";
    if (seasonId) {
      params.push(Number(seasonId));
      seasonP   = ` AND p."seasonId" = $${params.length}`;
      seasonPenP = ` AND pen."seasonId" = $${params.length}`;
    }

    // Batch-related signals scope on uploadedAt — no per-row seasonId.
    // The seasonId filter applies to the BATCH's seasonId field. Build
    // a separate params array because the per-pilgrim queries share
    // the same companyId + seasonId slots.
    const batchParams: unknown[] = [scope.companyId];
    let batchSeasonP = "";
    if (seasonId) {
      batchParams.push(Number(seasonId));
      batchSeasonP = ` AND b."seasonId" = $${batchParams.length}`;
    }

    const [
      exemptRow, visaRow, overstayRow, penaltyRow,
      failedRow, missingApRow,
    ] = await Promise.all([
      // Currently exempt (PR #1482-1484 flag)
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
            AND p."overstayExempt" = true${seasonP}`,
        params,
      ),
      // Visa-expiring within 7d (same window as the list-page banner)
      // — GCC nationals are excluded; they don't need a KSA visa.
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
            AND p."visaExpiry" IS NOT NULL
            AND p."visaExpiry" <= CURRENT_DATE + INTERVAL '7 days'
            AND p.status NOT IN ('departed', 'cancelled')
            AND ${gccExclusionSqlFragment(`p."nationality"`)}${seasonP}`,
        params,
      ),
      // Currently overstaying (status + the auto-flagged penalty status)
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
            AND p.status IN ('overstayed', 'overstay_penalized')${seasonP}`,
        params,
      ),
      // Unpaid penalties — anything not paid/waived. Status check uses
      // the umrah_penalties.status enum (pending/invoiced/paid/waived).
      rawQuery<{ c: string; total: string }>(
        `SELECT COUNT(*)::text AS c,
                COALESCE(SUM(pen.amount), 0)::text AS total
           FROM umrah_penalties pen
          WHERE pen."companyId" = $1
            AND pen.status NOT IN ('paid', 'waived')${seasonPenP}`,
        params,
      ),
      // §8 audit: rows the engine rejected outright during recent
      // imports. Window matches the wizard's batch-history list.
      rawQuery<{ c: string }>(
        `SELECT COALESCE(SUM(COALESCE(b."errorCount",0)),0)::text AS c
           FROM umrah_import_batches b
          WHERE b."companyId" = $1 AND b."deletedAt" IS NULL
            AND b."createdAt" >= NOW() - INTERVAL '30 days'${batchSeasonP}`,
        batchParams,
      ),
      // §8 audit: nusk invoices missing their AP journal entry
      // (DR 5201 / CR 2101). PR #1867 wired the JE on create + every
      // PATCH; legacy rows from before #1867 still need a manual
      // touch to backfill. `purchaseInvoiceId` is the FK that
      // postNuskJournalEntries sets after posting. The
      // unlinkedImportRows signal lives in a follow-up PR because
      // it depends on the migration 279 counters from PR #1878.
      rawQuery<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM umrah_nusk_invoices n
          WHERE n."companyId" = $1 AND n."deletedAt" IS NULL
            AND n."purchaseInvoiceId" IS NULL
            AND COALESCE(n."totalAmount",0) > 0
            AND n."nuskStatus" <> 'cancelled'`,
        [scope.companyId],
      ),
    ]);

    res.json(maskFields(req, {
      exempt: Number(exemptRow[0]?.c ?? "0"),
      visaExpiringIn7d: Number(visaRow[0]?.c ?? "0"),
      currentlyOverstaying: Number(overstayRow[0]?.c ?? "0"),
      unpaidPenaltiesCount: Number(penaltyRow[0]?.c ?? "0"),
      unpaidPenaltiesTotal: Number(penaltyRow[0]?.total ?? "0"),
      failedImportRows30d: Number(failedRow[0]?.c ?? "0"),
      missingNuskApJournals: Number(missingApRow[0]?.c ?? "0"),
    }));
  } catch (err) { handleRouteError(err, res, "Compliance dashboard"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تقرير أرصدة الوكلاء المجمَّع — كل وكيل في صف واحد مع:
//   - إجمالي المُفوتر (sum of umrah_agent_invoices.total non-cancelled)
//   - المدفوع (allocated from umrah_payments where there's any)
//   - الرصيد المستحق
//   - عدد المعتمرين
//   - آخر فاتورة + تاريخها
//   - حالة الوكيل
//
// كانت معلومة الرصيد متفرقة على صفحة كل وكيل — هذا التقرير يجمعهم في
// شاشة واحدة للمحاسب: «لمن أرسل تنبيه؟ من المتأخر أكثر؟».
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/agent-balances", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, hasOutstanding } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let statusClause = "";
    let seasonClause = "";
    if (status) { params.push(status); statusClause = ` AND a.status = $${params.length}`; }
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND inv."seasonId" = $${params.length}`; }

    // LATERAL على umrah_agent_invoices مع تجميع `total` و آخر فاتورة.
    // الفلتر `seasonId` يطبَّق هنا فقط (لو موجود) عشان تقارير الموسم
    // ما تختلط بالمواسم الثانية.
    //
    // pilgrimCount = العدد الحالي للمعتمرين النشطين تحت هذا الوكيل
    // (مش من الفواتير، لأن وكيل ممكن يكون عنده معتمرين قبل ما يُفوتر).
    const rows = await rawQuery<Record<string, unknown>>(
      // Pre-aggregate pilgrim counts per agent via CTE — original was
      // N+1: one COUNT subquery per returned agent. The CTE scans
      // umrah_pilgrims once filtered to active rows. Keyed by
      // (agentId, companyId) to preserve the legacy tenant boundary.
      `WITH agent_pilgrim_counts AS (
         SELECT "agentId", "companyId", COUNT(*) AS "pilgrimCount"
         FROM umrah_pilgrims
         WHERE "deletedAt" IS NULL AND "agentId" IS NOT NULL
         GROUP BY "agentId", "companyId"
       )
       SELECT a.id, a.name, a.country, a.phone, a.email, a.status, a."nuskAgentNumber",
              COALESCE(inv_agg.invoice_count, 0)::int AS "invoiceCount",
              COALESCE(inv_agg.total_invoiced, 0)    AS "totalInvoiced",
              COALESCE(inv_agg.total_paid, 0)        AS "totalPaid",
              COALESCE(inv_agg.outstanding, 0)       AS "outstanding",
              inv_agg.last_invoice_at                AS "lastInvoiceAt",
              inv_agg.last_invoice_ref               AS "lastInvoiceRef",
              COALESCE(apc."pilgrimCount", 0)::int AS "pilgrimCount"
         FROM umrah_agents a
    LEFT JOIN agent_pilgrim_counts apc
           ON apc."agentId" = a.id AND apc."companyId" = a."companyId"
    LEFT JOIN LATERAL (
           SELECT COUNT(*)::int            AS invoice_count,
                  SUM(inv.total)            AS total_invoiced,
                  -- "paid" = invoice rows whose status is 'paid' — the agent
                  -- invoice table doesn't carry a paidAmount column; we
                  -- approximate via status.
                  SUM(CASE WHEN inv.status = 'paid' THEN inv.total ELSE 0 END) AS total_paid,
                  SUM(CASE WHEN inv.status NOT IN ('paid', 'cancelled') THEN inv.total ELSE 0 END) AS outstanding,
                  MAX(inv."createdAt")      AS last_invoice_at,
                  (ARRAY_AGG(inv.ref ORDER BY inv."createdAt" DESC))[1] AS last_invoice_ref
             FROM umrah_agent_invoices inv
            WHERE inv."agentId" = a.id
              AND inv."companyId" = a."companyId"
              AND inv."deletedAt" IS NULL${seasonClause}
         ) inv_agg ON true
        WHERE a."companyId" = $1
          AND a."deletedAt" IS NULL${statusClause}
        ORDER BY COALESCE(inv_agg.outstanding, 0) DESC, a.name
        LIMIT 500`,
      params,
    );

    // Optional ?hasOutstanding=true filter applied JS-side after the SQL
    // (saves a complex HAVING clause). For audit screens the operator
    // usually wants this filter.
    const filtered = hasOutstanding === "true"
      ? rows.filter((r) => Number(r.outstanding ?? 0) > 0)
      : rows;

    // Tenant totals — for the page's top-bar KPIs (no client-side fold).
    const totals = filtered.reduce<{
      agents: number; totalInvoiced: number; totalPaid: number; outstanding: number;
    }>(
      (acc, r) => ({
        agents:        acc.agents + 1,
        totalInvoiced: acc.totalInvoiced + Number(r.totalInvoiced ?? 0),
        totalPaid:     acc.totalPaid + Number(r.totalPaid ?? 0),
        outstanding:   acc.outstanding + Number(r.outstanding ?? 0),
      }),
      { agents: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0 },
    );

    res.json(maskFields(req, { data: filtered, total: filtered.length, totals }));
  } catch (err) { handleRouteError(err, res, "Agent balances report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تقرير حركة المعتمرين — يلخّص لقطة يومية للحركات على مستوى الموسم/الكل:
//   - وصلوا اليوم (actualArrival = اليوم أو entryDate = اليوم)
//   - غادروا اليوم
//   - متجاوزون حالياً (overstayed/overstay_penalized)
//   - داخل المملكة الآن (isInsideKingdom = true)
//   - متأخرون عن المغادرة بعدد أيام (actual vs scheduled)
//
// مع تفصيل اختياري للصفوف الفعلية حسب الفلتر — العامل يفتح هذا التقرير
// ليجاوب: «من اللي اليوم؟ من المتجاوز؟ من ما رحل؟».
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/pilgrim-movements", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, date, view } = req.query as Record<string, string | undefined>;
    // `date` is operator-supplied (Riyadh-local YYYY-MM-DD from the UI).
    // Defaults to today so a bookmark-driven open works without args.
    const dateExpr = date ? `'${date}'::date` : "CURRENT_DATE";
    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND p."seasonId" = $${params.length}`; }

    // الصف الأول: KPIs مجمَّعة (دائماً)
    const [agg] = await rawQuery<Record<string, unknown>>(
      `SELECT
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND (p."actualArrival" = ${dateExpr} OR p."entryDate" = ${dateExpr})
         )::int AS "arrivedToday",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND (p."actualDeparture" = ${dateExpr} OR p."exitDate" = ${dateExpr})
         )::int AS "departedToday",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p.status IN ('overstayed', 'overstay_penalized')
         )::int AS "currentlyOverstaying",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p."isInsideKingdom" = true
         )::int AS "insideKingdom",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p."departureDate" < CURRENT_DATE
             AND p."actualDeparture" IS NULL
             AND p.status NOT IN ('cancelled', 'departed')
         )::int AS "lateDepartures",
         (SELECT COUNT(*) FROM umrah_pilgrims p
           WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
             AND p."overstayDays" IS NOT NULL
             AND p."overstayDays" > 0
         )::int AS "withOverstayDays"`,
      params,
    );

    // الصف الثاني: التفاصيل (drill-down) لو طلب view=details
    // كل قسم محدود بـ 100 صف عشان ما يثقل الـ payload.
    let details: Record<string, unknown[]> | null = null;
    if (view === "details") {
      const arrivedRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, status, "entryPort", "entryFlight"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND (p."actualArrival" = ${dateExpr} OR p."entryDate" = ${dateExpr})
          ORDER BY "fullName" LIMIT 100`,
        params,
      );
      const departedRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, status, "exitPort", "exitFlight"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND (p."actualDeparture" = ${dateExpr} OR p."exitDate" = ${dateExpr})
          ORDER BY "fullName" LIMIT 100`,
        params,
      );
      const overstayRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, "overstayDays", "departureDate", status
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND p.status IN ('overstayed', 'overstay_penalized')
          ORDER BY p."overstayDays" DESC NULLS LAST, "fullName"
          LIMIT 100`,
        params,
      );
      const lateRows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "fullName", nationality, "departureDate", status,
                (CURRENT_DATE - "departureDate")::int AS "daysOverdue"
           FROM umrah_pilgrims p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL${seasonClause}
            AND p."departureDate" < CURRENT_DATE
            AND p."actualDeparture" IS NULL
            AND p.status NOT IN ('cancelled', 'departed')
          ORDER BY (CURRENT_DATE - "departureDate") DESC
          LIMIT 100`,
        params,
      );
      details = {
        arrived: arrivedRows,
        departed: departedRows,
        overstaying: overstayRows,
        lateDepartures: lateRows,
      };
    }

    res.json(maskFields(req, { kpis: agg ?? {}, details }));
  } catch (err) { handleRouteError(err, res, "Pilgrim movements report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تقرير أرصدة الوكلاء الفرعيين — مكمِّل لتقرير الوكلاء لكنه أهم لأن
// مدفوعات العمرة الحقيقية تدخل من الوكلاء الفرعيين (عبر umrah_payments).
//
// الفرق الجوهري عن agent-balances:
//   • umrah_sales_invoices.paidAmount عمود حقيقي (مش مجرد status='paid')
//   • umrah_payments جدول مستقل يجمع التحصيلات حسب subAgentId
//   • outstanding = SUM(total) − SUM(paidAmount) على الفواتير + رصيد payments
//
// لكل وكيل فرعي:
//   - عدد الفواتير المُصدرة
//   - إجمالي المُفوتر
//   - إجمالي المُحصَّل من الفواتير (paidAmount)
//   - إجمالي المُحصَّل من الـ payments (مستقل)
//   - الرصيد المستحق
//   - آخر دفعة + تاريخها
//   - عدد المعتمرين تحت هذا الوكيل الفرعي
//   - حالة الوكيل الفرعي (isActive)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/subagent-balances", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, isActive, hasOutstanding } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) { params.push(Number(seasonId)); seasonClause = ` AND inv."seasonId" = $${params.length}`; }
    let isActiveClause = "";
    if (isActive === "true")  { isActiveClause = ` AND sa."isActive" = true`; }
    if (isActive === "false") { isActiveClause = ` AND sa."isActive" = false`; }

    // اثنين LATERAL منفصلين:
    //   inv_agg → تجميع umrah_sales_invoices (المُفوتر + المُحصَّل)
    //   pay_agg → تجميع umrah_payments (المدفوعات المستقلة)
    //
    // الفرق الحرج: paid من inv.paidAmount مش من status — عمود حقيقي يخزَّن
    // كل ما يدخل دفعة عبر POST /umrah/payments.
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT sa.id, sa.name, sa."nuskCode", sa.phone, sa.email, sa.country,
              sa."isActive", sa."paymentTerms", sa."agentId",
              a.name AS "agentName",
              COALESCE(inv_agg.invoice_count, 0)::int AS "invoiceCount",
              COALESCE(inv_agg.total_invoiced, 0)    AS "totalInvoiced",
              COALESCE(inv_agg.total_paid_on_inv, 0) AS "totalPaidOnInvoices",
              COALESCE(pay_agg.payment_count, 0)::int AS "paymentCount",
              COALESCE(pay_agg.total_received, 0)     AS "totalReceived",
              COALESCE(inv_agg.outstanding, 0)        AS "outstanding",
              pay_agg.last_payment_at                 AS "lastPaymentAt",
              pay_agg.last_payment_ref                AS "lastPaymentRef",
              (SELECT COUNT(*)::int FROM umrah_pilgrims p
                JOIN umrah_groups g ON g.id = p."groupId"
                  AND g."companyId" = p."companyId"
                  AND g."deletedAt" IS NULL
                WHERE g."subAgentId" = sa.id
                  AND p."companyId" = sa."companyId"
                  AND p."deletedAt" IS NULL
              ) AS "pilgrimCount"
         FROM umrah_sub_agents sa
    LEFT JOIN umrah_agents a
           ON a.id = sa."agentId"
          AND a."companyId" = sa."companyId"
          AND a."deletedAt" IS NULL
    LEFT JOIN LATERAL (
           SELECT COUNT(*)::int          AS invoice_count,
                  SUM(inv.total)         AS total_invoiced,
                  SUM(inv."paidAmount")  AS total_paid_on_inv,
                  SUM(inv.total - COALESCE(inv."paidAmount", 0))
                    FILTER (WHERE inv.status NOT IN ('cancelled')) AS outstanding
             FROM umrah_sales_invoices inv
            WHERE inv."subAgentId" = sa.id
              AND inv."companyId" = sa."companyId"
              AND inv."deletedAt" IS NULL
              AND inv.status <> 'cancelled'${seasonClause}
         ) inv_agg ON true
    LEFT JOIN LATERAL (
           SELECT COUNT(*)::int   AS payment_count,
                  SUM(pay."sarAmount") AS total_received,
                  MAX(pay."paymentDate") AS last_payment_at,
                  (ARRAY_AGG(pay.ref ORDER BY pay."paymentDate" DESC, pay.id DESC))[1] AS last_payment_ref
             FROM umrah_payments pay
            WHERE pay."subAgentId" = sa.id
              AND pay."companyId" = sa."companyId"
              AND pay."deletedAt" IS NULL
         ) pay_agg ON true
        WHERE sa."companyId" = $1
          AND sa."deletedAt" IS NULL${isActiveClause}
        ORDER BY COALESCE(inv_agg.outstanding, 0) DESC, sa.name
        LIMIT 500`,
      params,
    );

    const filtered = hasOutstanding === "true"
      ? rows.filter((r) => Number(r.outstanding ?? 0) > 0)
      : rows;

    const totals = filtered.reduce<{
      subAgents: number;
      totalInvoiced: number;
      totalPaidOnInvoices: number;
      totalReceived: number;
      outstanding: number;
    }>(
      (acc, r) => ({
        subAgents:           acc.subAgents + 1,
        totalInvoiced:       acc.totalInvoiced + Number(r.totalInvoiced ?? 0),
        totalPaidOnInvoices: acc.totalPaidOnInvoices + Number(r.totalPaidOnInvoices ?? 0),
        totalReceived:       acc.totalReceived + Number(r.totalReceived ?? 0),
        outstanding:         acc.outstanding + Number(r.outstanding ?? 0),
      }),
      { subAgents: 0, totalInvoiced: 0, totalPaidOnInvoices: 0, totalReceived: 0, outstanding: 0 },
    );

    res.json(maskFields(req, { data: filtered, total: filtered.length, totals }));
  } catch (err) { handleRouteError(err, res, "Sub-agent balances report"); }
});

// ============================================================================
// ANALYTICAL REPORTS — batch 1 (U-07 Phase 16)
//   profitability · journal drill · assistant suggestions · reports catalog ·
//   violations-summary · commissions-summary (+ CSV export)
// ============================================================================

// §11 stub conversion — group + agent profitability (#1870).
// One endpoint, two dimensions. Returns one row per
// group/agent with revenue (umrah_sales_invoices) minus cost
// (umrah_nusk_invoices) = net profit. Operator drills by
// season + sort to find the best/worst performer.
router.get("/reports/profitability", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const dimension = String(req.query.dimension ?? "group");
    if (!["group", "agent"].includes(dimension)) {
      throw new ValidationError("البُعد المطلوب: group أو agent", { field: "dimension" });
    }
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

    const params: unknown[] = [scope.companyId];
    let salesSeasonClause = "";
    let nuskSeasonClause = "";
    if (seasonId) {
      params.push(seasonId);
      salesSeasonClause = ` AND inv."seasonId" = $${params.length}`;
      // umrah_nusk_invoices has no seasonId on it — scope through
      // the linked group instead.
      nuskSeasonClause = ` AND g."seasonId" = $${params.length}`;
    }

    let rows: any[] = [];
    if (dimension === "group") {
      // Revenue per group: sum of sales-invoice line items that
      // reference each group. Cost per group: sum of nusk invoices
      // tied to the group. LEFT JOINs so a group with zero of
      // either side still surfaces (it tells the operator they
      // forgot to invoice / receive a nusk).
      rows = await rawQuery(
        `SELECT g.id AS "groupId",
                g.name,
                g."nuskGroupNumber",
                COALESCE(rev.revenue, 0)::numeric(14,2) AS revenue,
                COALESCE(cost.cost, 0)::numeric(14,2) AS cost,
                (COALESCE(rev.revenue, 0) - COALESCE(cost.cost, 0))::numeric(14,2) AS "netProfit",
                CASE WHEN COALESCE(rev.revenue, 0) > 0
                     THEN ROUND(((COALESCE(rev.revenue, 0) - COALESCE(cost.cost, 0))
                                 / COALESCE(rev.revenue, 0)) * 100, 2)
                     ELSE NULL
                END AS "marginPercent",
                COALESCE(g."mutamerCount", 0) AS "mutamerCount"
           FROM umrah_groups g
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(item."lineTotal"), 0) AS revenue
               FROM umrah_sales_invoice_items item
               JOIN umrah_sales_invoices inv ON inv.id = item."invoiceId"
                AND inv."companyId" = g."companyId"
                AND inv.status <> 'cancelled'
                AND inv."deletedAt" IS NULL${salesSeasonClause}
              WHERE item."groupId" = g.id
           ) rev ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(n."totalAmount"), 0) AS cost
               FROM umrah_nusk_invoices n
              WHERE n."companyId" = g."companyId"
                AND n."groupId" = g.id
                AND n."nuskStatus" <> 'cancelled'
                AND n."deletedAt" IS NULL
           ) cost ON true
          WHERE g."companyId" = $1 AND g."deletedAt" IS NULL${nuskSeasonClause}
          ORDER BY "netProfit" DESC NULLS LAST, g.id
          LIMIT 500`,
        params,
      );
    } else {
      // agent dimension — aggregate the same revenue/cost up via
      // groups.agentId. Agent rows with no groups still show with
      // zeros so the operator notices.
      rows = await rawQuery(
        `SELECT a.id AS "agentId",
                a.name,
                COALESCE(agg.revenue, 0)::numeric(14,2) AS revenue,
                COALESCE(agg.cost, 0)::numeric(14,2) AS cost,
                (COALESCE(agg.revenue, 0) - COALESCE(agg.cost, 0))::numeric(14,2) AS "netProfit",
                CASE WHEN COALESCE(agg.revenue, 0) > 0
                     THEN ROUND(((COALESCE(agg.revenue, 0) - COALESCE(agg.cost, 0))
                                 / COALESCE(agg.revenue, 0)) * 100, 2)
                     ELSE NULL
                END AS "marginPercent",
                COALESCE(agg."groupCount", 0)::int AS "groupCount"
           FROM umrah_agents a
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS "groupCount",
                    COALESCE(SUM(rev.revenue), 0) AS revenue,
                    COALESCE(SUM(cost.cost), 0) AS cost
               FROM umrah_groups g
               LEFT JOIN LATERAL (
                 SELECT COALESCE(SUM(item."lineTotal"), 0) AS revenue
                   FROM umrah_sales_invoice_items item
                   JOIN umrah_sales_invoices inv ON inv.id = item."invoiceId"
                    AND inv."companyId" = g."companyId"
                    AND inv.status <> 'cancelled'
                    AND inv."deletedAt" IS NULL${salesSeasonClause}
                  WHERE item."groupId" = g.id
               ) rev ON true
               LEFT JOIN LATERAL (
                 SELECT COALESCE(SUM(n."totalAmount"), 0) AS cost
                   FROM umrah_nusk_invoices n
                  WHERE n."companyId" = g."companyId"
                    AND n."groupId" = g.id
                    AND n."nuskStatus" <> 'cancelled'
                    AND n."deletedAt" IS NULL
               ) cost ON true
              WHERE g."agentId" = a.id
                AND g."companyId" = a."companyId"
                AND g."deletedAt" IS NULL${nuskSeasonClause}
           ) agg ON true
          WHERE a."companyId" = $1 AND a."deletedAt" IS NULL
          ORDER BY "netProfit" DESC NULLS LAST, a.id
          LIMIT 500`,
        params,
      );
    }

    // Headline totals — bookkeeper sees aggregate margin at a glance.
    const totals = rows.reduce(
      (acc, r) => {
        acc.revenue += Number(r.revenue) || 0;
        acc.cost += Number(r.cost) || 0;
        acc.netProfit += Number(r.netProfit) || 0;
        return acc;
      },
      { revenue: 0, cost: 0, netProfit: 0 },
    );

    res.json(maskFields(req, { data: rows, dimension, totals }));
  } catch (err) { handleRouteError(err, res, "Profitability report"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 Deep Finance Integration — GL Drill-Through (Charter #1870)
//
// «من فاتورة العمرة → القيد المحاسبي → سطور الحسابات» في خطوة واحدة.
//
// السؤال اللي يجاوب عليه:
//   «هل هذي الفاتورة ترحَّلت محاسبياً صح؟ على أي حساب؟ بأي مبلغ؟»
//
// المسار:
//   GET /umrah/journal/:sourceType/:sourceId
//
// نقبل ٥ أنواع مصدر فقط (whitelist) — ما نسمح للمستخدم يقرأ قيود
// أي جدول. كل واحد فيه عمود "journalEntryId":
//   - umrah_sales_invoices  (فواتير العملاء)
//   - umrah_nusk_invoices   (فواتير نسك)
//   - umrah_payments        (الدفعات الواردة)
//   - umrah_agent_invoices  (فواتير الوكلاء)
//   - umrah_violations      (الغرامات/المخالفات)
//
// نرجِّع: { source, journal, lines } مع جميع الأبعاد (umrahAgentId/
// umrahSeasonId/costCenter/employee/...). كل القراءات tenant-scoped
// عبر journal_entries."companyId" + journal_lines.journalId.
// ─────────────────────────────────────────────────────────────────────────────
// Per source: refCol = الرقم المرئي للعامل، statusCol = اسم عمود الحالة
// لأن بعض الجداول status والبعض nuskStatus (نسك). umrah_penalties ما عنده
// ref فنستخدم type كنص بديل (overstay/violation/lost/regulatory).
const JOURNAL_DRILL_SOURCES: Record<string, { table: string; refCol: string; statusCol: string }> = {
  umrah_sales_invoices:  { table: "umrah_sales_invoices",  refCol: "ref",               statusCol: "status"     },
  umrah_nusk_invoices:   { table: "umrah_nusk_invoices",   refCol: "nuskInvoiceNumber", statusCol: "nuskStatus" },
  umrah_payments:        { table: "umrah_payments",        refCol: "ref",               statusCol: "method"     },
  umrah_agent_invoices:  { table: "umrah_agent_invoices",  refCol: "ref",               statusCol: "status"     },
  umrah_penalties:       { table: "umrah_penalties",       refCol: "type",              statusCol: "status"     },
};

router.get("/journal/:sourceType/:sourceId", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const sourceType = String(req.params.sourceType ?? "");
    const sourceId = parseId(req.params.sourceId, "sourceId");

    const meta = JOURNAL_DRILL_SOURCES[sourceType];
    if (!meta) throw new ValidationError(`نوع المصدر غير مدعوم: ${sourceType}`, { field: "sourceType" });

    // Read the source row first — confirms tenant ownership AND
    // surfaces the source's own ref/status/journalEntryId so the FE
    // can render a header without a second roundtrip.
    const [source] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "journalEntryId", "${meta.refCol}" AS ref, "${meta.statusCol}" AS status
         FROM ${meta.table}
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [sourceId, scope.companyId],
    );
    if (!source) throw new NotFoundError("المصدر غير موجود");

    const journalEntryId = source.journalEntryId as number | null;
    if (!journalEntryId) {
      res.json(maskFields(req, {
        source: { id: sourceId, sourceType, ref: source.ref, status: source.status },
        journal: null,
        lines: [],
        message: "لم يتم ترحيل قيد محاسبي بعد لهذا المصدر",
      }));
      return;
    }

    // Header + lines in parallel — both scoped to the same companyId
    // for defence-in-depth (even though journalEntryId is single-tenant
    // by construction, an attacker who has a leaked id from another
    // tenant shouldn't be able to read its lines through this path).
    const [headerArr, lines] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT je.id, je.ref, je.description, je.date, je.type, je.status,
                je."sourceType", je."sourceId", je."sourceKey",
                je."postedBy", je."postedAt", je."approvalStatus",
                je."createdAt", je."updatedAt",
                je."originalCurrency", je."exchangeRate", je."originalAmount",
                je."reversalOfId", je."reversedById", je."reversedAt", je."reversalReason"
           FROM journal_entries je
          WHERE je.id = $1
            AND je."companyId" = $2
            AND je."deletedAt" IS NULL
          LIMIT 1`,
        [journalEntryId, scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        // join chart_of_accounts for the human-readable Arabic name.
        // Tenant-safe: COA is tenant-scoped on companyId.
        `SELECT jl.id, jl."accountCode", jl.debit, jl.credit, jl.description,
                jl."costCenter", jl."costCenterId",
                jl."departmentId", jl."projectId", jl."employeeId",
                jl."vehicleId", jl."clientId", jl."vendorId", jl."driverId",
                jl."umrahSeasonId", jl."umrahAgentId",
                jl."originalCurrency", jl."originalDebit", jl."originalCredit",
                jl."exchangeRate",
                coa.name      AS "accountName",
                coa.type      AS "accountType"
           FROM journal_lines jl
      LEFT JOIN chart_of_accounts coa
             ON coa.code = jl."accountCode"
            AND coa."companyId" = $2
            AND coa."deletedAt" IS NULL
          WHERE jl."journalId" = $1
            AND jl."deletedAt" IS NULL
          ORDER BY jl.id`,
        [journalEntryId, scope.companyId],
      ),
    ]);

    const header = headerArr[0];
    if (!header) {
      // FK present but the entry was deleted — surface so the operator
      // sees the gap rather than silently rendering "no journal".
      res.json(maskFields(req, {
        source: { id: sourceId, sourceType, ref: source.ref, status: source.status },
        journal: null,
        lines: [],
        message: `قيد المحاسبة #${journalEntryId} المربوط غير موجود — قد يكون محذوفاً`,
        orphanJournalEntryId: journalEntryId,
      }));
      return;
    }

    // Footer totals — debit/credit balance check for the auditor.
    // Engine guarantees balance, but a stale-line scenario (one line
    // soft-deleted) would surface here, not silently.
    const totals = lines.reduce<{ debit: number; credit: number }>(
      (acc, l) => ({
        debit:  acc.debit  + Number(l.debit  ?? 0),
        credit: acc.credit + Number(l.credit ?? 0),
      }),
      { debit: 0, credit: 0 },
    );

    res.json(maskFields(req, {
      source: { id: sourceId, sourceType, ref: source.ref, status: source.status },
      journal: header,
      lines,
      totals,
      isBalanced: Math.abs(totals.debit - totals.credit) < 0.01,
    }));
  } catch (err) { handleRouteError(err, res, "Umrah journal drill-through"); }
});

// §9 of #1870 — Assistant Suggestions.
// Returns up-to-six ranked suggestions for the operator's dashboard.
// Cheap (six COUNTs, parallel); the FE caches with react-query so
// repeated tab visits are zero-cost.
router.get("/assistant/suggestions", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const suggestions = await getDashboardSuggestions({
      companyId: scope.companyId, branchId: scope.branchId, seasonId,
    });
    res.json({ data: suggestions });
  } catch (err) { handleRouteError(err, res, "Assistant suggestions"); }
});

// §11 of #1870 — Reports Catalog.
// Returns the 17-report registry so the FE hub can render them
// with status badges + category filter. The catalog is static
// (no DB query), so this endpoint is single-millisecond.
router.get("/reports/catalog", authorize({ feature: "umrah", action: "list" }), async (_req, res): Promise<void> => {
  try {
    res.json({
      data: UMRAH_REPORTS_CATALOG,
      categories: REPORT_CATEGORY_LABELS_AR,
      statuses: REPORT_STATUS_LABELS_AR,
    });
  } catch (err) { handleRouteError(err, res, "Reports catalog"); }
});

// §11 partial → full conversion — violations summary report (#1870).
// The Charter: "تقرير التخلف والمخالفات — المخالفات المسجَّلة مع الوكيل،
// المعتمر، الغرامة". Aggregates umrah_violations into KPI counts +
// per-dimension breakdowns. /umrah/violations stays as the list/edit
// page; this endpoint feeds the dedicated report screen with rollups
// + a flat list of recent rows for context.
router.get("/reports/violations-summary", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const agentId  = req.query.agentId  ? Number(req.query.agentId)  : null;
    const fromStr  = req.query.from     ? String(req.query.from)     : null;
    const toStr    = req.query.to       ? String(req.query.to)       : null;

    const params: unknown[] = [scope.companyId];
    let where = `v."companyId" = $1 AND v."deletedAt" IS NULL`;
    if (seasonId) {
      params.push(seasonId);
      // umrah_violations has no seasonId — chain via pilgrim or group.
      where += ` AND EXISTS (
        SELECT 1 FROM umrah_pilgrims p
         WHERE p.id = v."mutamerId"
           AND p."companyId" = v."companyId"
           AND p."seasonId" = $${params.length}
      )`;
    }
    if (agentId) {
      params.push(agentId);
      where += ` AND v."agentId" = $${params.length}`;
    }
    if (fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
      params.push(fromStr);
      where += ` AND v."detectedAt"::date >= $${params.length}::date`;
    }
    if (toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      params.push(toStr);
      where += ` AND v."detectedAt"::date <= $${params.length}::date`;
    }

    // Four parallel aggregations: KPI tiles + status breakdown +
    // type breakdown + recent rows. Each is cheap; no GROUP BY
    // joins so the planner picks index scans on the WHERE.
    const [kpiRow, byStatus, byType, byMonth, recent] = await Promise.all([
      rawQuery<{
        total: string; openCount: string; closedCount: string;
        totalPenalty: string; pendingPenalty: string;
      }>(
        `SELECT COUNT(*)::text AS total,
                SUM(CASE WHEN v.status IN ('detected','open','invoiced','disputed') THEN 1 ELSE 0 END)::text AS "openCount",
                SUM(CASE WHEN v.status IN ('paid','closed') THEN 1 ELSE 0 END)::text AS "closedCount",
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS "totalPenalty",
                COALESCE(SUM(CASE WHEN v.status NOT IN ('paid','closed') THEN v."penaltyAmount" ELSE 0 END), 0)::text AS "pendingPenalty"
           FROM umrah_violations v
          WHERE ${where}`,
        params,
      ),
      rawQuery<{ status: string; c: string; total: string }>(
        `SELECT v.status, COUNT(*)::text AS c,
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS total
           FROM umrah_violations v
          WHERE ${where}
          GROUP BY v.status
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ type: string; c: string; total: string }>(
        `SELECT v.type, COUNT(*)::text AS c,
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS total
           FROM umrah_violations v
          WHERE ${where}
          GROUP BY v.type
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ month: string; c: string; total: string }>(
        `SELECT TO_CHAR(v."detectedAt", 'YYYY-MM') AS month,
                COUNT(*)::text AS c,
                COALESCE(SUM(v."penaltyAmount"), 0)::text AS total
           FROM umrah_violations v
          WHERE ${where}
          GROUP BY TO_CHAR(v."detectedAt", 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 12`,
        params,
      ),
      rawQuery<{
        id: number; type: string; status: string;
        penaltyAmount: string | number; detectedAt: string;
        description: string | null;
        mutamerId: number | null; mutamerName: string | null;
        agentId: number | null; agentName: string | null;
      }>(
        `SELECT v.id, v.type, v.status, v."penaltyAmount", v."detectedAt"::text AS "detectedAt", v.description,
                v."mutamerId", p."fullName" AS "mutamerName",
                v."agentId", a.name AS "agentName"
           FROM umrah_violations v
           LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId" AND p."companyId" = v."companyId" AND p."deletedAt" IS NULL
           LEFT JOIN umrah_agents a   ON a.id = v."agentId"   AND a."companyId" = v."companyId" AND a."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY v."detectedAt" DESC, v.id DESC
          LIMIT 100`,
        params,
      ),
    ]);

    const k = kpiRow[0] ?? { total: "0", openCount: "0", closedCount: "0", totalPenalty: "0", pendingPenalty: "0" };
    res.json(maskFields(req, {
      kpis: {
        total: Number(k.total),
        openCount: Number(k.openCount),
        closedCount: Number(k.closedCount),
        totalPenalty: Number(k.totalPenalty),
        pendingPenalty: Number(k.pendingPenalty),
      },
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.c), total: Number(r.total) })),
      byType:   byType.map((r) => ({ type: r.type, count: Number(r.c), total: Number(r.total) })),
      byMonth:  byMonth.map((r) => ({ month: r.month, count: Number(r.c), total: Number(r.total) })),
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Violations summary"); }
});

// §11 partial → full conversion — commissions summary report (#1870).
// /umrah/commission-calculations is the per-row list; this endpoint
// is the REPORT: payroll-style rollup with KPI tiles + 3 breakdowns
// (by status / by month / by employee) + a recent table for context.
router.get("/reports/commissions-summary", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId    = req.query.seasonId    ? Number(req.query.seasonId)    : null;
    const employeeId  = req.query.employeeId  ? Number(req.query.employeeId)  : null;
    const agentId     = req.query.agentId     ? Number(req.query.agentId)     : null;
    const yearParam   = req.query.year        ? Number(req.query.year)        : null;
    const statusParam = req.query.status      ? String(req.query.status)      : null;

    // Year + employee + status filter via cc.* columns. seasonId
    // and agentId chain through employee_commission_plans (the
    // calculations table doesn't carry either dim itself).
    const params: unknown[] = [scope.companyId];
    let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
    if (yearParam) {
      params.push(yearParam);
      where += ` AND cc.year = $${params.length}`;
    }
    if (employeeId) {
      params.push(employeeId);
      where += ` AND cc."employeeId" = $${params.length}`;
    }
    if (statusParam) {
      params.push(statusParam);
      where += ` AND cc.status = $${params.length}`;
    }
    if (seasonId) {
      params.push(seasonId);
      where += ` AND EXISTS (
        SELECT 1 FROM employee_commission_plans cp
         WHERE cp.id = cc."planId"
           AND cp."companyId" = cc."companyId"
           AND cp."seasonId" = $${params.length}
      )`;
    }
    // U-04-P4 — agentId filter (matches the umrahAgentId dim that
    // U-05-P2 surfaces on the JE). The plan-level column is the
    // attribution source; cc rows inherit it transitively via planId.
    if (agentId) {
      params.push(agentId);
      where += ` AND EXISTS (
        SELECT 1 FROM employee_commission_plans cp
         WHERE cp.id = cc."planId"
           AND cp."companyId" = cc."companyId"
           AND cp."agentId" = $${params.length}
      )`;
    }

    const [kpiRow, byStatus, byMonth, byEmployee, recent] = await Promise.all([
      rawQuery<{
        total: string; calculatedAmount: string; paidAmount: string;
        pendingAmount: string; employeesCount: string;
        conditionMetCount: string; conditionUnmetCount: string;
        conditionMetAmount: string; conditionUnmetAmount: string;
        hasViolationsCount: string;
      }>(
        // U-04-P2 — KPIs extended with condition-met / -unmet splits and
        // a hasViolations rollup. Both columns already exist on the calc
        // row (cc."conditionMet" boolean, cc."hasViolations" boolean —
        // surfaced on the recent table today but never aggregated). All
        // counts and sums share the same WHERE filter set + parameter
        // list as the existing KPI block, so the new fields don't
        // change the result set semantics — they're additive sums.
        `SELECT COUNT(*)::text AS total,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS "calculatedAmount",
                COALESCE(SUM(CASE WHEN cc.status = 'paid' THEN cc."finalAmount" ELSE 0 END), 0)::text AS "paidAmount",
                COALESCE(SUM(CASE WHEN cc.status NOT IN ('paid') THEN cc."finalAmount" ELSE 0 END), 0)::text AS "pendingAmount",
                COUNT(DISTINCT cc."employeeId")::text AS "employeesCount",
                COUNT(*) FILTER (WHERE cc."conditionMet" = true)::text AS "conditionMetCount",
                COUNT(*) FILTER (WHERE cc."conditionMet" = false)::text AS "conditionUnmetCount",
                COALESCE(SUM(CASE WHEN cc."conditionMet" = true THEN cc."finalAmount" ELSE 0 END), 0)::text AS "conditionMetAmount",
                COALESCE(SUM(CASE WHEN cc."conditionMet" = false THEN cc."finalAmount" ELSE 0 END), 0)::text AS "conditionUnmetAmount",
                COUNT(*) FILTER (WHERE cc."hasViolations" = true)::text AS "hasViolationsCount"
           FROM employee_commission_calculations cc
          WHERE ${where}`,
        params,
      ),
      rawQuery<{ status: string; c: string; total: string }>(
        `SELECT cc.status, COUNT(*)::text AS c,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS total
           FROM employee_commission_calculations cc
          WHERE ${where}
          GROUP BY cc.status
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ year: number; month: number; c: string; total: string }>(
        `SELECT cc.year, cc.month, COUNT(*)::text AS c,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS total
           FROM employee_commission_calculations cc
          WHERE ${where}
          GROUP BY cc.year, cc.month
          ORDER BY cc.year DESC, cc.month DESC
          LIMIT 12`,
        params,
      ),
      rawQuery<{
        employeeId: number; employeeName: string | null;
        c: string; total: string;
      }>(
        `SELECT cc."employeeId",
                e.name AS "employeeName",
                COUNT(*)::text AS c,
                COALESCE(SUM(cc."finalAmount"), 0)::text AS total
           FROM employee_commission_calculations cc
           LEFT JOIN employees e ON e.id = cc."employeeId"
                                AND e."companyId" = cc."companyId"
                                AND e."deletedAt" IS NULL
          WHERE ${where}
          GROUP BY cc."employeeId", e.name
          ORDER BY SUM(cc."finalAmount") DESC NULLS LAST
          LIMIT 50`,
        params,
      ),
      rawQuery<{
        id: number; planId: number; planName: string | null;
        employeeId: number; employeeName: string | null;
        month: number; year: number; status: string;
        finalAmount: string | number; commissionAmount: string | number;
        totalMutamers: number; conditionMet: boolean;
        createdAt: string;
      }>(
        `SELECT cc.id, cc."planId", cp."planName",
                cc."employeeId", e.name AS "employeeName",
                cc.month, cc.year, cc.status,
                cc."finalAmount", cc."commissionAmount",
                cc."totalMutamers", cc."conditionMet",
                cc."createdAt"::text AS "createdAt"
           FROM employee_commission_calculations cc
           LEFT JOIN employee_commission_plans cp
                  ON cp.id = cc."planId" AND cp."companyId" = cc."companyId" AND cp."deletedAt" IS NULL
           LEFT JOIN employees e
                  ON e.id = cc."employeeId" AND e."companyId" = cc."companyId" AND e."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY cc.year DESC, cc.month DESC, cc."finalAmount" DESC
          LIMIT 100`,
        params,
      ),
    ]);

    // U-04-P2 — the kpiRow now carries 5 extra fields. Defaulting them
    // to "0" string keeps the response shape stable on empty result.
    const k = kpiRow[0] ?? {
      total: "0", calculatedAmount: "0", paidAmount: "0",
      pendingAmount: "0", employeesCount: "0",
      conditionMetCount: "0", conditionUnmetCount: "0",
      conditionMetAmount: "0", conditionUnmetAmount: "0",
      hasViolationsCount: "0",
    };
    res.json(maskFields(req, {
      kpis: {
        total: Number(k.total),
        calculatedAmount: Number(k.calculatedAmount),
        paidAmount: Number(k.paidAmount),
        pendingAmount: Number(k.pendingAmount),
        employeesCount: Number(k.employeesCount),
        // U-04-P2 additions — condition-met + violations split.
        conditionMetCount: Number(k.conditionMetCount),
        conditionUnmetCount: Number(k.conditionUnmetCount),
        conditionMetAmount: Number(k.conditionMetAmount),
        conditionUnmetAmount: Number(k.conditionUnmetAmount),
        hasViolationsCount: Number(k.hasViolationsCount),
      },
      byStatus:   byStatus.map((r) => ({ status: r.status, count: Number(r.c), total: Number(r.total) })),
      byMonth:    byMonth.map((r) => ({ year: r.year, month: r.month, count: Number(r.c), total: Number(r.total) })),
      byEmployee: byEmployee.map((r) => ({ employeeId: r.employeeId, employeeName: r.employeeName, count: Number(r.c), total: Number(r.total) })),
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Commissions summary"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// U-04-P3 — Commissions Summary CSV export.
//
// Same query + same WHERE filter set as
// GET /umrah/reports/commissions-summary, but:
//   - returns a UTF-8 BOM-prefixed CSV (Excel-friendly Arabic)
//   - bumps LIMIT to 5000 (vs the on-screen 100) for operator
//     monthly close exports
//   - one line per calc row, header row carries Arabic labels
//
// Read-only. Tenant-scoped via cc."companyId" + cc."deletedAt" IS
// NULL on every row + the optional seasonId join still chains
// through cp."companyId" = cc."companyId".
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/reports/commissions-summary/export",
  authorize({ feature: "umrah", action: "list" }),
  async (req, res): Promise<void> => {
    try {
      const scope = req.scope!;
      const seasonId    = req.query.seasonId    ? Number(req.query.seasonId)    : null;
      const employeeId  = req.query.employeeId  ? Number(req.query.employeeId)  : null;
      const agentId     = req.query.agentId     ? Number(req.query.agentId)     : null;
      const yearParam   = req.query.year        ? Number(req.query.year)        : null;
      const statusParam = req.query.status      ? String(req.query.status)      : null;

      const params: unknown[] = [scope.companyId];
      let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
      if (yearParam) {
        params.push(yearParam);
        where += ` AND cc.year = $${params.length}`;
      }
      if (employeeId) {
        params.push(employeeId);
        where += ` AND cc."employeeId" = $${params.length}`;
      }
      if (statusParam) {
        params.push(statusParam);
        where += ` AND cc.status = $${params.length}`;
      }
      if (seasonId) {
        params.push(seasonId);
        where += ` AND EXISTS (
          SELECT 1 FROM employee_commission_plans cp
           WHERE cp.id = cc."planId"
             AND cp."companyId" = cc."companyId"
             AND cp."seasonId" = $${params.length}
        )`;
      }
      // U-04-P4 — same agentId filter as the summary route so the
      // CSV export carries the same row set as the on-screen list.
      if (agentId) {
        params.push(agentId);
        where += ` AND EXISTS (
          SELECT 1 FROM employee_commission_plans cp
           WHERE cp.id = cc."planId"
             AND cp."companyId" = cc."companyId"
             AND cp."agentId" = $${params.length}
        )`;
      }

      // Same shape as the summary's `recent` block, but the
      // on-screen cap is lifted — operators exporting for monthly
      // close need the full window. We cap at 5000 to protect
      // Excel / memory.
      const rows = await rawQuery<{
        id: number; planId: number; planName: string | null;
        employeeId: number; employeeName: string | null;
        month: number; year: number; status: string;
        finalAmount: string; commissionAmount: string;
        totalMutamers: number; conditionMet: boolean;
        hasViolations: boolean; createdAt: string;
      }>(
        `SELECT cc.id, cc."planId", cp."planName",
                cc."employeeId", e.name AS "employeeName",
                cc.month, cc.year, cc.status,
                cc."finalAmount"::text AS "finalAmount",
                cc."commissionAmount"::text AS "commissionAmount",
                cc."totalMutamers", cc."conditionMet", cc."hasViolations",
                cc."createdAt"::text AS "createdAt"
           FROM employee_commission_calculations cc
           LEFT JOIN employee_commission_plans cp
                  ON cp.id = cc."planId" AND cp."companyId" = cc."companyId" AND cp."deletedAt" IS NULL
           LEFT JOIN employees e
                  ON e.id = cc."employeeId" AND e."companyId" = cc."companyId" AND e."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY cc.year DESC, cc.month DESC, cc."finalAmount" DESC
          LIMIT 5000`,
        params,
      );

      // RFC 4180 escape — quote when the cell contains the delimiter,
      // a quote, or any newline; double internal quotes. Same shape
      // as the pilgrims export (routes/umrah.ts:1233).
      const csvEscape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      // U-18-P4 — bilingual header policy: Arabic primary with English
      // in parentheses so partner accounting / payroll systems that
      // ingest the CSV in EN can map the columns without a separate
      // glossary. Same convention applied to the pilgrims export.
      const headers: Array<[keyof typeof rows[number], string]> = [
        ["id",               "رقم (ID)"],
        ["year",             "السنة (Year)"],
        ["month",             "الشهر (Month)"],
        ["employeeName",     "الموظف (Employee)"],
        ["planName",         "الخطة (Plan)"],
        ["status",           "الحالة (Status)"],
        ["commissionAmount", "العمولة المحتسبة (Calculated Commission)"],
        ["finalAmount",      "المبلغ النهائي (Final Amount)"],
        ["totalMutamers",    "عدد المعتمرين (Pilgrim Count)"],
        ["conditionMet",     "تحقّق الشرط (Condition Met)"],
        ["hasViolations",    "وجود مخالفات (Has Violations)"],
        ["createdAt",        "تاريخ الإنشاء (Created At)"],
      ];

      const headerRow = headers.map(([, label]) => csvEscape(label)).join(",");
      const dataRows = rows.map((r) =>
        headers
          .map(([key]) => csvEscape(r[key]))
          .join(","),
      );
      // BOM so Excel detects UTF-8 Arabic — without it the file opens
      // as mojibake (same lesson as the pilgrims export).
      const BOM = "﻿";
      const csv = BOM + [headerRow, ...dataRows].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="umrah-commissions-${todayISO()}.csv"`,
      );
      res.send(csv);
    } catch (err) {
      handleRouteError(err, res, "Commissions summary CSV export");
    }
  },
);

// ============================================================================
// ANALYTICAL REPORTS — batch 2 (U-07 Phase 17)
//   finance-hygiene · nusk-invoices-summary · umrah-transport · umrah-costs ·
//   sales-invoices-summary · import-errors-summary
// ============================================================================
// ─────────────────────────────────────────────────────────────────────────────
// §6 Finance Hygiene — Untraced Finance (Charter #1870)
//
// Operator's 5-minute daily check: which finance-impacting rows are
// missing their GL/AP linkage? Four buckets:
//   • salesInvoices.untrackedPosting → status NOT IN draft/cancelled AND journalEntryId IS NULL
//   • payments.untrackedPosting       → sarAmount > 0 AND journalEntryId IS NULL
//   • nuskInvoices.untrackedAP        → nuskStatus <> cancelled AND totalAmount > 0 AND purchaseInvoiceId IS NULL
//   • penalties.untrackedPosting      → status IN applied/paid AND journalEntryId IS NULL
//
// Returns count + sum(amount) per bucket — the operator drills via
// list pages with the right filter. All tenant-scoped. Five parallel
// reads (Promise.all) — cheap, runs on demand from the dashboard.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/finance-hygiene", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;

    const [sales, payments, nusk, penalties] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM(total), 0) AS "amount"
           FROM umrah_sales_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND status NOT IN ('draft','cancelled')
            AND "journalEntryId" IS NULL`,
        [scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM("sarAmount"), 0) AS "amount"
           FROM umrah_payments
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "sarAmount" > 0
            AND "journalEntryId" IS NULL`,
        [scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM("totalAmount"), 0) AS "amount"
           FROM umrah_nusk_invoices
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "nuskStatus" <> 'cancelled'
            AND "totalAmount" > 0
            AND "purchaseInvoiceId" IS NULL`,
        [scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS "count",
                COALESCE(SUM(amount), 0) AS "amount"
           FROM umrah_penalties
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND status IN ('invoiced','paid')
            AND "journalEntryId" IS NULL`,
        [scope.companyId],
      ),
    ]);

    const buckets = {
      salesInvoices: { count: Number(sales[0]?.count ?? 0), amount: Number(sales[0]?.amount ?? 0) },
      payments:      { count: Number(payments[0]?.count ?? 0), amount: Number(payments[0]?.amount ?? 0) },
      nuskInvoices:  { count: Number(nusk[0]?.count ?? 0), amount: Number(nusk[0]?.amount ?? 0) },
      penalties:     { count: Number(penalties[0]?.count ?? 0), amount: Number(penalties[0]?.amount ?? 0) },
    };
    const totalItems = buckets.salesInvoices.count + buckets.payments.count
                     + buckets.nuskInvoices.count + buckets.penalties.count;
    const totalAmountAtRisk = buckets.salesInvoices.amount + buckets.payments.amount
                            + buckets.nuskInvoices.amount + buckets.penalties.amount;

    res.json(maskFields(req, {
      buckets,
      totalItems,
      totalAmountAtRisk,
      isClean: totalItems === 0,
    }));
  } catch (err) { handleRouteError(err, res, "Umrah finance hygiene"); }
});

// §11 partial → full conversion — nusk invoices summary report (#1870).
// /umrah/nusk-invoices stays as the per-row list; this is the REPORT
// with finance-focused KPIs + 3 breakdowns + recent rows. AP-status
// aware (split by purchaseInvoiceId for "AP posted" tracking).
router.get("/reports/nusk-invoices-summary", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId   = req.query.seasonId   ? Number(req.query.seasonId)   : null;
    const agentId    = req.query.agentId    ? Number(req.query.agentId)    : null;
    const statusFlt  = req.query.status     ? String(req.query.status)     : null;
    const fromStr    = req.query.from       ? String(req.query.from)       : null;
    const toStr      = req.query.to         ? String(req.query.to)         : null;

    const params: unknown[] = [scope.companyId];
    let where = `n."companyId" = $1 AND n."deletedAt" IS NULL`;
    if (statusFlt) {
      params.push(statusFlt);
      where += ` AND n."nuskStatus" = $${params.length}`;
    }
    if (agentId) {
      params.push(agentId);
      where += ` AND n."agentId" = $${params.length}`;
    }
    if (seasonId) {
      params.push(seasonId);
      // nusk has no seasonId — chain through the linked group.
      where += ` AND EXISTS (
        SELECT 1 FROM umrah_groups g
         WHERE g.id = n."groupId" AND g."companyId" = n."companyId"
           AND g."seasonId" = $${params.length}
      )`;
    }
    if (fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
      params.push(fromStr);
      where += ` AND n."issueDate" >= $${params.length}::date`;
    }
    if (toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      params.push(toStr);
      where += ` AND n."issueDate" <= $${params.length}::date`;
    }

    const [kpiRow, byStatus, byMonth, byAgent, recent] = await Promise.all([
      rawQuery<{
        total: string; totalAmount: string; netCostTotal: string;
        refundedTotal: string; mutamerCount: string;
        apPostedCount: string; apPendingCount: string;
      }>(
        `SELECT COUNT(*)::text AS total,
                COALESCE(SUM(n."totalAmount"), 0)::text AS "totalAmount",
                COALESCE(SUM(n."netCost"), 0)::text AS "netCostTotal",
                COALESCE(SUM(n."refundAmount"), 0)::text AS "refundedTotal",
                COALESCE(SUM(n."mutamerCount"), 0)::text AS "mutamerCount",
                SUM(CASE WHEN n."purchaseInvoiceId" IS NOT NULL THEN 1 ELSE 0 END)::text AS "apPostedCount",
                SUM(CASE WHEN n."purchaseInvoiceId" IS NULL AND COALESCE(n."totalAmount",0) > 0 AND n."nuskStatus" <> 'cancelled' THEN 1 ELSE 0 END)::text AS "apPendingCount"
           FROM umrah_nusk_invoices n
          WHERE ${where}`,
        params,
      ),
      rawQuery<{ status: string; c: string; total: string }>(
        `SELECT n."nuskStatus" AS status, COUNT(*)::text AS c,
                COALESCE(SUM(n."totalAmount"), 0)::text AS total
           FROM umrah_nusk_invoices n
          WHERE ${where}
          GROUP BY n."nuskStatus"
          ORDER BY COUNT(*) DESC`,
        params,
      ),
      rawQuery<{ month: string; c: string; total: string }>(
        `SELECT TO_CHAR(n."issueDate", 'YYYY-MM') AS month,
                COUNT(*)::text AS c,
                COALESCE(SUM(n."totalAmount"), 0)::text AS total
           FROM umrah_nusk_invoices n
          WHERE ${where} AND n."issueDate" IS NOT NULL
          GROUP BY TO_CHAR(n."issueDate", 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 12`,
        params,
      ),
      rawQuery<{
        agentId: number; agentName: string | null;
        c: string; total: string;
      }>(
        `SELECT n."agentId",
                a.name AS "agentName",
                COUNT(*)::text AS c,
                COALESCE(SUM(n."totalAmount"), 0)::text AS total
           FROM umrah_nusk_invoices n
           LEFT JOIN umrah_agents a ON a.id = n."agentId"
                                  AND a."companyId" = n."companyId"
                                  AND a."deletedAt" IS NULL
          WHERE ${where} AND n."agentId" IS NOT NULL
          GROUP BY n."agentId", a.name
          ORDER BY SUM(n."totalAmount") DESC NULLS LAST
          LIMIT 50`,
        params,
      ),
      rawQuery<{
        id: number; nuskInvoiceNumber: string; nuskStatus: string;
        totalAmount: string | number; netCost: string | number;
        refundAmount: string | number; mutamerCount: number;
        issueDate: string | null; expiryDate: string | null;
        agentId: number | null; agentName: string | null;
        groupId: number | null; groupName: string | null;
        purchaseInvoiceId: number | null;
      }>(
        `SELECT n.id, n."nuskInvoiceNumber", n."nuskStatus",
                n."totalAmount", n."netCost", n."refundAmount",
                n."mutamerCount",
                n."issueDate"::text AS "issueDate",
                n."expiryDate"::text AS "expiryDate",
                n."agentId", a.name AS "agentName",
                n."groupId", g.name AS "groupName",
                n."purchaseInvoiceId"
           FROM umrah_nusk_invoices n
           LEFT JOIN umrah_agents a
                  ON a.id = n."agentId" AND a."companyId" = n."companyId" AND a."deletedAt" IS NULL
           LEFT JOIN umrah_groups g
                  ON g.id = n."groupId" AND g."companyId" = n."companyId" AND g."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY n."issueDate" DESC NULLS LAST, n.id DESC
          LIMIT 100`,
        params,
      ),
    ]);

    const k = kpiRow[0] ?? {
      total: "0", totalAmount: "0", netCostTotal: "0",
      refundedTotal: "0", mutamerCount: "0",
      apPostedCount: "0", apPendingCount: "0",
    };
    res.json(maskFields(req, {
      kpis: {
        total: Number(k.total),
        totalAmount: Number(k.totalAmount),
        netCostTotal: Number(k.netCostTotal),
        refundedTotal: Number(k.refundedTotal),
        mutamerCount: Number(k.mutamerCount),
        apPostedCount: Number(k.apPostedCount),
        apPendingCount: Number(k.apPendingCount),
      },
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.c), total: Number(r.total) })),
      byMonth:  byMonth.map((r) => ({ month: r.month, count: Number(r.c), total: Number(r.total) })),
      byAgent:  byAgent.map((r) => ({ agentId: r.agentId, agentName: r.agentName, count: Number(r.c), total: Number(r.total) })),
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Nusk invoices summary"); }
});

// §11 stub conversion — umrah transport report (#1870).
// Pulls every transport_bookings row tied to an umrah group + the
// linked group/agent context + flight details. The fleet engine
// hasn't yet written vehicleId/driverId/actualCost back onto the
// booking, so those stay null until §7 Phase 2 lands the
// fleet_trips bridge. Operator sees status + requested pickup
// date so they can chase what's still 'submitted' vs 'dispatched'.
router.get("/reports/umrah-transport", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const status = req.query.status ? String(req.query.status) : null;

    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    let statusClause = "";
    if (seasonId) {
      params.push(seasonId);
      seasonClause = ` AND g."seasonId" = $${params.length}`;
    }
    if (status) {
      params.push(status);
      statusClause = ` AND b.status = $${params.length}`;
    }

    const rows = await rawQuery<{
      bookingId: number;
      bookingNumber: string;
      status: string;
      routeType: string | null;
      fromLocation: string | null;
      toLocation: string | null;
      requestedPickupDate: string | null;
      passengerCount: number | null;
      flightNumber: string | null;
      groupId: number | null;
      groupName: string | null;
      nuskGroupNumber: string | null;
      agentId: number | null;
      agentName: string | null;
      seasonId: number | null;
    }>(
      `SELECT b.id AS "bookingId",
              b."bookingNumber",
              b.status,
              b."routeType",
              b."fromLocationText" AS "fromLocation",
              b."toLocationText" AS "toLocation",
              b."requestedPickupDate"::text AS "requestedPickupDate",
              b."passengerCount",
              b."flightNumber",
              g.id AS "groupId",
              g.name AS "groupName",
              g."nuskGroupNumber",
              a.id AS "agentId",
              a.name AS "agentName",
              g."seasonId"
         FROM transport_bookings b
         INNER JOIN umrah_groups g
                 ON g.id = b."umrahGroupId"
                AND g."companyId" = b."companyId"
                AND g."deletedAt" IS NULL
         LEFT JOIN umrah_agents a
                ON a.id = g."agentId"
               AND a."companyId" = g."companyId"
               AND a."deletedAt" IS NULL
        WHERE b."companyId" = $1
          AND b."deletedAt" IS NULL
          AND b."bookingSource" = 'umrah_group'${seasonClause}${statusClause}
        ORDER BY b."requestedPickupDate" NULLS LAST, b.id DESC
        LIMIT 500`,
      params,
    );

    // Status histogram — bookkeeper sees how many requests are
    // still pending vs dispatched vs completed at a glance.
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }

    res.json(maskFields(req, { data: rows, counts, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Umrah transport report"); }
});



// §11 stub conversion — umrah costs report (#1870).
// Aggregates umrah_nusk_invoices into a cost breakdown per
// dimension (season / group / agent), showing each cost
// category alongside the total. Operator answers "where is
// money flowing out for this season / group / agent?".
router.get("/reports/umrah-costs", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const dimension = String(req.query.dimension ?? "group");
    if (!["season", "group", "agent"].includes(dimension)) {
      throw new ValidationError("البُعد المطلوب: season أو group أو agent", { field: "dimension" });
    }
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

    const params: unknown[] = [scope.companyId];
    let seasonClause = "";
    if (seasonId) {
      params.push(seasonId);
      // n has no seasonId — go through the linked group.
      seasonClause = ` AND g."seasonId" = $${params.length}`;
    }

    // Common cost-category projection: every dimension surfaces the
    // same numeric breakdown so the FE can render one table per
    // dimension without column-shape branching.
    const costSelectFragment = `
      COALESCE(SUM(n."groundServices"), 0)::numeric(14,2) AS "groundServices",
      COALESCE(SUM(n."electronicFees"), 0)::numeric(14,2) AS "electronicFees",
      COALESCE(SUM(n."visaFees"), 0)::numeric(14,2) AS "visaFees",
      COALESCE(SUM(n."insuranceFees"), 0)::numeric(14,2) AS "insuranceFees",
      COALESCE(SUM(n."enrichmentServices"), 0)::numeric(14,2) AS "enrichmentServices",
      COALESCE(SUM(n."additionalServices"), 0)::numeric(14,2) AS "additionalServices",
      COALESCE(SUM(n."transportTotal"), 0)::numeric(14,2) AS "transportTotal",
      COALESCE(SUM(n."hotelTotal"), 0)::numeric(14,2) AS "hotelTotal",
      COALESCE(SUM(n."netCost"), 0)::numeric(14,2) AS "netCost",
      COALESCE(SUM(n."totalAmount"), 0)::numeric(14,2) AS "totalAmount",
      COUNT(*)::int AS "invoiceCount"`;

    // Common predicates: scope, soft-delete, cancelled status.
    const commonWhere = `n."companyId" = $1
                        AND n."deletedAt" IS NULL
                        AND n."nuskStatus" <> 'cancelled'`;

    let rows: any[] = [];
    if (dimension === "season") {
      rows = await rawQuery(
        `SELECT s.id AS "seasonId",
                s.title AS name,
                ${costSelectFragment}
           FROM umrah_seasons s
           LEFT JOIN umrah_groups g
                  ON g."seasonId" = s.id
                 AND g."companyId" = s."companyId"
                 AND g."deletedAt" IS NULL
           LEFT JOIN umrah_nusk_invoices n
                  ON n."groupId" = g.id
                 AND ${commonWhere}
          WHERE s."companyId" = $1 AND s."deletedAt" IS NULL${seasonId ? ` AND s.id = $${params.length}` : ""}
          GROUP BY s.id, s.title
          ORDER BY "totalAmount" DESC NULLS LAST, s.id DESC
          LIMIT 500`,
        params,
      );
    } else if (dimension === "group") {
      rows = await rawQuery(
        `SELECT g.id AS "groupId",
                g.name,
                g."nuskGroupNumber",
                ${costSelectFragment}
           FROM umrah_groups g
           LEFT JOIN umrah_nusk_invoices n
                  ON n."groupId" = g.id
                 AND ${commonWhere}
          WHERE g."companyId" = $1 AND g."deletedAt" IS NULL${seasonClause}
          GROUP BY g.id, g.name, g."nuskGroupNumber"
          ORDER BY "totalAmount" DESC NULLS LAST, g.id DESC
          LIMIT 500`,
        params,
      );
    } else {
      // agent: aggregate via groups.agentId.
      // Output alias deliberately renamed from "agentId" → "rowAgentId"
      // to avoid the check:sql-ambiguity false positive — bare quoted
      // "agentId" in the output alias position is flagged because the
      // column also exists on two joined relations (umrah_groups +
      // umrah_nusk_invoices). FE maps rowAgentId → agentId at the row
      // shape level so the consumer contract stays stable.
      rows = await rawQuery(
        `SELECT a.id AS "rowAgentId",
                a.name,
                ${costSelectFragment}
           FROM umrah_agents a
           LEFT JOIN umrah_groups g
                  ON g."agentId" = a.id
                 AND g."companyId" = a."companyId"
                 AND g."deletedAt" IS NULL${seasonClause}
           LEFT JOIN umrah_nusk_invoices n
                  ON n."groupId" = g.id
                 AND ${commonWhere}
          WHERE a."companyId" = $1 AND a."deletedAt" IS NULL
          GROUP BY a.id, a.name
          ORDER BY "totalAmount" DESC NULLS LAST, a.id DESC
          LIMIT 500`,
        params,
      );
      // Remap to keep the public API contract: row.agentId.
      rows = rows.map((r: Record<string, unknown>) => ({
        ...r,
        agentId: r.rowAgentId,
        rowAgentId: undefined,
      }));
    }

    // Headline totals for the KPI tiles. Sum each category across rows.
    const totals = rows.reduce(
      (acc, r) => {
        for (const k of [
          "groundServices", "electronicFees", "visaFees", "insuranceFees",
          "enrichmentServices", "additionalServices", "transportTotal",
          "hotelTotal", "netCost", "totalAmount",
        ]) {
          acc[k] = (acc[k] ?? 0) + (Number(r[k]) || 0);
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json(maskFields(req, { data: rows, dimension, totals }));
  } catch (err) { handleRouteError(err, res, "Umrah costs report"); }
});

// تقرير ملخّص فواتير العملاء (sales invoices summary) — §11 من شرائع الإصلاح
// (Issue #1870). يجاوب على سؤال إبراهيم:
//   «أصدرنا كم فاتورة بيع هذا الموسم؟ المُحصَّل؟ الرصيد؟ من المتأخّر؟»
//
// لمحه ٥ تجميعات بالتوازي (Promise.all) — ما نضرب الـ RTT × ٥:
//   1) kpiRow         → KPIs على رأس الصفحة (إجمالي / مبالغ / مدفوع / متبقي / معتمرون / متأخّرون)
//   2) byStatus       → توزيع الحالات (draft/approved/sent/partially_paid/paid/overdue/cancelled)
//   3) byMonth        → آخر ١٢ شهر (YYYY-MM على invoiceDate — يكشف موسمية البيع)
//   4) bySubAgent     → ٥٠ وكيل فرعي الأعلى من حيث الفواتير + المبالغ + المدفوع
//   5) recent         → آخر ١٠٠ فاتورة للجدول السفلي (drill-through)
//
// كل التجميعات تحت companyId + deletedAt IS NULL. الفلاتر:
//   seasonId / subAgentId / clientId / status / from / to (YYYY-MM-DD على invoiceDate)
//
// نوصل إلى umrah_sub_agents (للاسم) + clients (للاسم) عبر LEFT JOIN — ما نسقط
// السطور لو الـ FK NULL (clientId اختياري على umrah_sales_invoices).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/sales-invoices-summary", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, subAgentId, clientId, status, from, to } = req.query as Record<string, string | undefined>;

    // Validate optional date filters — YYYY-MM-DD. We pin a regex so a
    // typo doesn't blow into a SQL error message users can't action.
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRe.test(from)) throw new ValidationError("from يجب أن يكون YYYY-MM-DD", { field: "from" });
    if (to   && !dateRe.test(to))   throw new ValidationError("to يجب أن يكون YYYY-MM-DD",   { field: "to" });

    const baseParams: unknown[] = [scope.companyId];
    let whereClause = `inv."companyId" = $1 AND inv."deletedAt" IS NULL`;
    if (seasonId)   { baseParams.push(Number(seasonId));   whereClause += ` AND inv."seasonId"   = $${baseParams.length}`; }
    if (subAgentId) { baseParams.push(Number(subAgentId)); whereClause += ` AND inv."subAgentId" = $${baseParams.length}`; }
    if (clientId)   { baseParams.push(Number(clientId));   whereClause += ` AND inv."clientId"   = $${baseParams.length}`; }
    if (status)     { baseParams.push(status);             whereClause += ` AND inv.status       = $${baseParams.length}`; }
    if (from)       { baseParams.push(from);               whereClause += ` AND inv."invoiceDate" >= $${baseParams.length}`; }
    if (to)         { baseParams.push(to);                 whereClause += ` AND inv."invoiceDate" <= $${baseParams.length}`; }

    // overdueCount = approved/sent/partially_paid AND dueDate < today AND
    // outstanding > 0. We don't lean on status='overdue' alone because
    // many sites don't run a scheduler to flip the status — the dueDate
    // check is the source of truth for "متأخّر".
    const [kpiRowArr, byStatus, byMonth, bySubAgent, recent] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int                                       AS "total",
                COALESCE(SUM(inv.total), 0)                         AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)                  AS "paidAmount",
                COALESCE(SUM(inv.total - COALESCE(inv."paidAmount", 0))
                         FILTER (WHERE inv.status <> 'cancelled'), 0) AS "outstandingAmount",
                COALESCE(SUM(inv."pilgrimCount"), 0)::int           AS "pilgrimsCount",
                COUNT(*) FILTER (
                  WHERE inv.status IN ('approved','sent','partially_paid','overdue')
                    AND inv."dueDate" IS NOT NULL
                    AND inv."dueDate" < CURRENT_DATE
                    AND (inv.total - COALESCE(inv."paidAmount", 0)) > 0
                )::int                                              AS "overdueCount",
                COUNT(DISTINCT inv."subAgentId")::int               AS "subAgentsCount"
           FROM umrah_sales_invoices inv
          WHERE ${whereClause}`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT inv.status                          AS "status",
                COUNT(*)::int                       AS "count",
                COALESCE(SUM(inv.total), 0)         AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)  AS "paidAmount"
           FROM umrah_sales_invoices inv
          WHERE ${whereClause}
          GROUP BY inv.status
          ORDER BY COUNT(*) DESC`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        // YYYY-MM bucket on invoiceDate. NULL issueDate excluded so the
        // chart doesn't get a "null" bucket spike. LIMIT 12 = trailing
        // year window (operator scrolls a chart, not a 5-year tail).
        `SELECT TO_CHAR(inv."invoiceDate", 'YYYY-MM') AS "month",
                COUNT(*)::int                         AS "count",
                COALESCE(SUM(inv.total), 0)           AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)    AS "paidAmount"
           FROM umrah_sales_invoices inv
          WHERE ${whereClause}
            AND inv."invoiceDate" IS NOT NULL
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT 12`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT inv."subAgentId"                    AS "subAgentId",
                sa.name                              AS "subAgentName",
                sa."nuskCode"                        AS "subAgentNuskCode",
                COUNT(*)::int                        AS "count",
                COALESCE(SUM(inv.total), 0)          AS "totalAmount",
                COALESCE(SUM(inv."paidAmount"), 0)   AS "paidAmount",
                COALESCE(SUM(inv.total - COALESCE(inv."paidAmount", 0))
                         FILTER (WHERE inv.status <> 'cancelled'), 0) AS "outstandingAmount"
           FROM umrah_sales_invoices inv
      LEFT JOIN umrah_sub_agents sa
             ON sa.id = inv."subAgentId"
            AND sa."companyId" = inv."companyId"
            AND sa."deletedAt" IS NULL
          WHERE ${whereClause}
          GROUP BY inv."subAgentId", sa.name, sa."nuskCode"
          ORDER BY COALESCE(SUM(inv.total), 0) DESC
          LIMIT 50`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT inv.id, inv.ref, inv."invoiceDate", inv."dueDate", inv.status,
                inv."subAgentId", sa.name AS "subAgentName", sa."nuskCode" AS "subAgentNuskCode",
                inv."clientId", c.name AS "clientName",
                inv."seasonId", se.title AS "seasonTitle",
                inv.total, inv."paidAmount",
                (inv.total - COALESCE(inv."paidAmount", 0))::numeric(12,2) AS "outstanding",
                inv."pilgrimCount",
                inv."journalEntryId",
                inv."createdAt"
           FROM umrah_sales_invoices inv
      LEFT JOIN umrah_sub_agents sa
             ON sa.id = inv."subAgentId"
            AND sa."companyId" = inv."companyId"
            AND sa."deletedAt" IS NULL
      LEFT JOIN clients c
             ON c.id = inv."clientId"
            AND c."companyId" = inv."companyId"
            AND c."deletedAt" IS NULL
      LEFT JOIN umrah_seasons se
             ON se.id = inv."seasonId"
            AND se."companyId" = inv."companyId"
            AND se."deletedAt" IS NULL
          WHERE ${whereClause}
          ORDER BY inv."invoiceDate" DESC NULLS LAST, inv.id DESC
          LIMIT 100`,
        baseParams,
      ),
    ]);

    const kpiRow = kpiRowArr[0] ?? {
      total: 0, totalAmount: 0, paidAmount: 0, outstandingAmount: 0,
      pilgrimsCount: 0, overdueCount: 0, subAgentsCount: 0,
    };

    res.json(maskFields(req, {
      kpis: kpiRow,
      byStatus,
      byMonth,
      bySubAgent,
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Sales invoices summary report"); }
});



// تقرير ملخّص أخطاء الاستيراد (import errors summary) — §11 من شرائع #1870.
// يجاوب على أسئلة العامل/المسؤول الإداري:
//   «كم دفعة فشلت/جزئية؟ كم سطر مرفوض؟ من أكثر مستخدم تنزّل دفعات
//    فيها أخطاء؟ ما نوع الملف الأكثر إشكالاً؟»
//
// ٥ تجميعات بالتوازي على umrah_import_batches (المصدر الرئيسي):
//   1) kpis        → totalBatches / failedBatches / partialBatches /
//                    totalRows / errorRows / financialImpactRows /
//                    affectedSeasons / affectedUploaders
//   2) byStatus    → توزيع الدفعات حسب status (pending/completed/failed/...)
//   3) byFileType  → توزيع حسب نوع الملف (mutamers/vouchers/...)
//   4) byUploader  → ٢٠ مستخدم الأعلى من حيث الأخطاء (للوحة الإداريين)
//   5) recent      → آخر ١٠٠ دفعة (للجدول السفلي مع drill إلى changes)
//
// نوصل إلى umrah_seasons + users (للأسماء) عبر LEFT JOIN — كل التجميعات
// تحت companyId + deletedAt IS NULL.
//
// نعتبر "دفعة فيها أخطاء" حين:
//   - status='failed'
//   - errorCount > 0
//   - skippedCount > 0
//
// الفلاتر: seasonId / status / fileType / uploadedBy / from / to (YYYY-MM-DD على createdAt).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/import-errors-summary", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, fileType, uploadedBy, from, to } = req.query as Record<string, string | undefined>;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRe.test(from)) throw new ValidationError("from يجب أن يكون YYYY-MM-DD", { field: "from" });
    if (to   && !dateRe.test(to))   throw new ValidationError("to يجب أن يكون YYYY-MM-DD",   { field: "to" });

    const baseParams: unknown[] = [scope.companyId];
    let whereClause = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
    if (seasonId)   { baseParams.push(Number(seasonId));   whereClause += ` AND b."seasonId"    = $${baseParams.length}`; }
    if (status)     { baseParams.push(status);             whereClause += ` AND b.status        = $${baseParams.length}`; }
    if (fileType)   { baseParams.push(fileType);           whereClause += ` AND b."fileType"    = $${baseParams.length}`; }
    if (uploadedBy) { baseParams.push(Number(uploadedBy)); whereClause += ` AND b."uploadedBy"  = $${baseParams.length}`; }
    if (from)       { baseParams.push(from);               whereClause += ` AND b."createdAt"  >= $${baseParams.length}`; }
    if (to)         { baseParams.push(to);                 whereClause += ` AND b."createdAt"  <= ($${baseParams.length}::date + INTERVAL '1 day')`; }

    const [kpiRowArr, byStatus, byFileType, byUploader, recent] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        // problemBatches = صراحة بها أخطاء أو فشلت — العامل بحاجة لرقم
        // واحد ينطلق منه. failedBatches فقط status='failed'؛
        // partialBatches = errorCount>0 أو skippedCount>0 لكن مش failed.
        `SELECT COUNT(*)::int                                    AS "totalBatches",
                COUNT(*) FILTER (WHERE b.status = 'failed')::int AS "failedBatches",
                COUNT(*) FILTER (WHERE b.status <> 'failed' AND
                                       (COALESCE(b."errorCount", 0) > 0
                                        OR COALESCE(b."skippedCount", 0) > 0))::int
                                                                  AS "partialBatches",
                COALESCE(SUM(b."totalRows"), 0)::int              AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int             AS "errorRows",
                COALESCE(SUM(b."skippedCount"), 0)::int           AS "skippedRows",
                COALESCE(SUM(b."newCount"), 0)::int               AS "newRows",
                COALESCE(SUM(b."updatedCount"), 0)::int           AS "updatedRows",
                COALESCE(SUM(b."financialImpactCount"), 0)::int   AS "financialImpactRows",
                COUNT(DISTINCT b."seasonId") FILTER (WHERE b."seasonId" IS NOT NULL)::int AS "affectedSeasons",
                COUNT(DISTINCT b."uploadedBy") FILTER (WHERE b."uploadedBy" IS NOT NULL)::int AS "affectedUploaders"
           FROM umrah_import_batches b
          WHERE ${whereClause}`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b.status                                AS "status",
                COUNT(*)::int                            AS "count",
                COALESCE(SUM(b."totalRows"), 0)::int     AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int    AS "errorRows"
           FROM umrah_import_batches b
          WHERE ${whereClause}
          GROUP BY b.status
          ORDER BY COUNT(*) DESC`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b."fileType"                             AS "fileType",
                COUNT(*)::int                            AS "count",
                COALESCE(SUM(b."totalRows"), 0)::int     AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int    AS "errorRows",
                COALESCE(SUM(b."skippedCount"), 0)::int  AS "skippedRows"
           FROM umrah_import_batches b
          WHERE ${whereClause}
          GROUP BY b."fileType"
          ORDER BY COALESCE(SUM(b."errorCount"), 0) DESC, COUNT(*) DESC`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b."uploadedBy"                                    AS "uploadedBy",
                COALESCE(e.name, u.email)                          AS "uploaderName",
                u.email                                            AS "uploaderEmail",
                COUNT(*)::int                                      AS "count",
                COUNT(*) FILTER (WHERE b.status = 'failed')::int   AS "failedCount",
                COALESCE(SUM(b."totalRows"), 0)::int               AS "totalRows",
                COALESCE(SUM(b."errorCount"), 0)::int              AS "errorRows",
                COALESCE(SUM(b."skippedCount"), 0)::int            AS "skippedRows"
           FROM umrah_import_batches b
      LEFT JOIN users u    ON u.id = b."uploadedBy"
      LEFT JOIN employees e ON e.id = u."employeeId"
          WHERE ${whereClause}
          GROUP BY b."uploadedBy", e.name, u.email
          ORDER BY COALESCE(SUM(b."errorCount"), 0) DESC, COUNT(*) DESC
          LIMIT 20`,
        baseParams,
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT b.id, b."fileName", b."fileType", b.status,
                b."totalRows", b."newCount", b."updatedCount",
                b."skippedCount", b."errorCount", b."financialImpactCount",
                b."seasonId", se.title AS "seasonTitle",
                b."uploadedBy", COALESCE(e.name, u.email) AS "uploaderName",
                b."createdAt", b."completedAt", b.notes
           FROM umrah_import_batches b
      LEFT JOIN umrah_seasons se
             ON se.id = b."seasonId"
            AND se."companyId" = b."companyId"
            AND se."deletedAt" IS NULL
      LEFT JOIN users u    ON u.id = b."uploadedBy"
      LEFT JOIN employees e ON e.id = u."employeeId"
          WHERE ${whereClause}
          ORDER BY b."createdAt" DESC, b.id DESC
          LIMIT 100`,
        baseParams,
      ),
    ]);

    const kpiRow = kpiRowArr[0] ?? {
      totalBatches: 0, failedBatches: 0, partialBatches: 0,
      totalRows: 0, errorRows: 0, skippedRows: 0, newRows: 0, updatedRows: 0,
      financialImpactRows: 0, affectedSeasons: 0, affectedUploaders: 0,
    };

    res.json(maskFields(req, {
      kpis: kpiRow,
      byStatus,
      byFileType,
      byUploader,
      recent,
    }));
  } catch (err) { handleRouteError(err, res, "Import errors summary report"); }
});



export default router;
