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
import { handleRouteError } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { renderPrint } from "../lib/print/printService.js";
import { gccExclusionSqlFragment } from "../lib/umrahNationalityRules.js";

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


export default router;
