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
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { renderPrint } from "../lib/print/printService.js";

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

export default router;
