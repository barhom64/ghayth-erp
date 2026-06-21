import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah reports hub + 2 new operational reports:
 *
 * (1) GET /umrah/reports/agent-balances — consolidated per-agent
 *     rollup (invoiced / paid / outstanding / pilgrims / last
 *     invoice). Mirrors the bookkeeper's "who do I chase?" query.
 *
 * (2) GET /umrah/reports/pilgrim-movements — daily snapshot of
 *     entry / exit / overstay / late departures. Mirrors the
 *     operator's "where are my pilgrims today?" question.
 *
 * (3) /umrah/reports hub + nav tab — single entry point for all
 *     existing + new reports, grouped by category.
 */
const ROUTE_ENT = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const HUB_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/index.tsx"),
  "utf8",
);
const AGENTS_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/agent-balances.tsx"),
  "utf8",
);
const MOVE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/pilgrim-movements.tsx"),
  "utf8",
);
const ROUTES_TSX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const TABS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

const BALANCES_HANDLER = (() => {
  const m = ROUTE_ENT.match(/router\.get\("\/reports\/agent-balances"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("/reports/agent-balances handler not found");
  return m[0];
})();
const MOVEMENTS_HANDLER = (() => {
  const m = ROUTE_ENT.match(/router\.get\("\/reports\/pilgrim-movements"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("/reports/pilgrim-movements handler not found");
  return m[0];
})();

describe("GET /umrah/reports/agent-balances — consolidated rollup", () => {
  it("registers under feature: umrah, action: list", () => {
    expect(BALANCES_HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("LATERAL on umrah_agent_invoices folds invoice_count + totals + last invoice", () => {
    // The LATERAL keeps the query at exactly 1 row per agent without
    // GROUP BY gymnastics on the outer SELECT. invoice_count + sums
    // + max(createdAt) + ARRAY_AGG(ref)[1] (newest ref) all in one
    // pass.
    expect(BALANCES_HANDLER).toMatch(/LEFT JOIN LATERAL \([\s\S]{1,800}FROM umrah_agent_invoices inv/);
    expect(BALANCES_HANDLER).toMatch(/COUNT\(\*\)::int\s+AS invoice_count/);
    expect(BALANCES_HANDLER).toMatch(/MAX\(inv\."createdAt"\)/);
    expect(BALANCES_HANDLER).toMatch(/ARRAY_AGG\(inv\.ref ORDER BY inv\."createdAt" DESC\)/);
  });

  it("outstanding excludes paid + cancelled, paid is status='paid' only", () => {
    // The agent invoice table doesn't carry a paidAmount column —
    // we approximate via status. Pinning this so a future refactor
    // that adds paidAmount must also update this sum (otherwise the
    // totals diverge silently).
    expect(BALANCES_HANDLER).toMatch(/inv\.status NOT IN \('paid', 'cancelled'\)/);
    expect(BALANCES_HANDLER).toMatch(/inv\.status = 'paid'/);
  });

  it("pilgrimCount comes from a tenant-scoped CTE (N+1 fix)", () => {
    // After the N+1 fix the scalar subquery was lifted into an
    // agent_pilgrim_counts CTE keyed by (agentId, companyId) so the
    // tenant boundary is preserved on the LEFT JOIN.
    expect(BALANCES_HANDLER).toContain("WITH agent_pilgrim_counts AS");
    expect(BALANCES_HANDLER).toMatch(
      /LEFT JOIN agent_pilgrim_counts apc\s+ON apc\."agentId" = a\.id AND apc\."companyId" = a\."companyId"/,
    );
    expect(BALANCES_HANDLER).toContain(
      'COALESCE(apc."pilgrimCount", 0)::int AS "pilgrimCount"',
    );
  });

  it("ORDER BY outstanding DESC — bookkeeper sees who owes most first", () => {
    expect(BALANCES_HANDLER).toMatch(/ORDER BY COALESCE\(inv_agg\.outstanding, 0\) DESC, a\.name/);
    expect(BALANCES_HANDLER).toMatch(/LIMIT 500/);
  });

  it("optional ?seasonId narrows the invoice JOIN (not the agents themselves)", () => {
    // seasonId on agents is loose — the meaningful question is
    // "outstanding for season X", which lives on the invoices.
    expect(BALANCES_HANDLER).toMatch(/seasonClause = ` AND inv\."seasonId" = \$/);
  });

  it("optional ?hasOutstanding=true filter applied JS-side after SQL", () => {
    expect(BALANCES_HANDLER).toMatch(/hasOutstanding === "true"[\s\S]{1,300}rows\.filter\(/);
  });

  it("totals reducer is strongly typed (no implicit-any)", () => {
    expect(BALANCES_HANDLER).toMatch(/filtered\.reduce<\{\s*agents: number;\s*totalInvoiced: number;\s*totalPaid: number;\s*outstanding: number;\s*\}>/);
  });
});

describe("GET /umrah/reports/pilgrim-movements — daily snapshot", () => {
  it("registers under feature: umrah, action: list", () => {
    expect(MOVEMENTS_HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("date defaults to CURRENT_DATE when no ?date= supplied", () => {
    // Bookmark-driven open works without args.
    expect(MOVEMENTS_HANDLER).toMatch(/const dateExpr = date \? `'\$\{date\}'::date` : "CURRENT_DATE"/);
  });

  it("kpis row has 6 numbers: arrivals + departures + overstay + insideKingdom + late + withOverstayDays", () => {
    for (const k of ["arrivedToday", "departedToday", "currentlyOverstaying", "insideKingdom", "lateDepartures", "withOverstayDays"]) {
      expect(MOVEMENTS_HANDLER).toMatch(new RegExp(`AS "${k}"`));
    }
  });

  it("arrivedToday counts on actualArrival OR entryDate (operator's source of truth varies)", () => {
    // Imports sometimes carry only entryDate; physical desk-clerk
    // sometimes records actualArrival. OR covers both.
    expect(MOVEMENTS_HANDLER).toMatch(/p\."actualArrival" = \$\{dateExpr\} OR p\."entryDate" = \$\{dateExpr\}/);
  });

  it("currentlyOverstaying counts both 'overstayed' and 'overstay_penalized'", () => {
    expect(MOVEMENTS_HANDLER).toMatch(/p\.status IN \('overstayed', 'overstay_penalized'\)/);
  });

  it("lateDepartures: scheduled departureDate in the past + no actualDeparture", () => {
    // The honest definition of "late" — scheduled past, no checkout
    // recorded, not cancelled. Pinned because the wording often
    // gets weaker over time.
    expect(MOVEMENTS_HANDLER).toMatch(/p\."departureDate" < CURRENT_DATE/);
    expect(MOVEMENTS_HANDLER).toMatch(/p\."actualDeparture" IS NULL/);
    expect(MOVEMENTS_HANDLER).toMatch(/p\.status NOT IN \('cancelled', 'departed'\)/);
  });

  it("?view=details returns 4 drill-down lists (arrived/departed/overstaying/late), each capped at 100", () => {
    // Bounded to 100 rows per section so the payload stays
    // human-scale even on a 5000-pilgrim season.
    expect(MOVEMENTS_HANDLER).toMatch(/if \(view === "details"\)/);
    expect(MOVEMENTS_HANDLER).toMatch(/details = \{[\s\S]{0,400}arrived: arrivedRows,[\s\S]{0,400}departed: departedRows,[\s\S]{0,400}overstaying: overstayRows,[\s\S]{0,400}lateDepartures: lateRows,/);
    const limitMatches = MOVEMENTS_HANDLER.match(/LIMIT 100/g);
    expect(limitMatches?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe("reports hub + new pages — registration + nav", () => {
  it("routes registered under /umrah/reports + /umrah/reports/agent-balances + /umrah/reports/pilgrim-movements", () => {
    expect(ROUTES_TSX).toMatch(/UmrahReportsHub = lazy/);
    expect(ROUTES_TSX).toMatch(/UmrahAgentBalancesReport = lazy/);
    expect(ROUTES_TSX).toMatch(/UmrahPilgrimMovementsReport = lazy/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/reports", component: UmrahReportsHub/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/reports\/agent-balances"/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/reports\/pilgrim-movements"/);
  });

  it("'التقارير' tab added to umrah nav", () => {
    expect(TABS).toMatch(/label: "التقارير", path: "\/umrah\/reports"/);
    expect(TABS).toMatch(/FileBarChart/);
  });

  it("hub page exposes category + status filters (§11 of #1870)", () => {
    // The hub was rewritten to consume the server-side catalog
    // (UMRAH_REPORTS_CATALOG) instead of a hand-curated tile list.
    // What previously lived inline now sits in /lib/umrahReportsCatalog.ts;
    // umrahReportsCatalogSmoke.test.ts pins the catalog contents.
    expect(HUB_PAGE).toContain('data-testid="reports-filter-category"');
    expect(HUB_PAGE).toContain('data-testid="reports-filter-status"');
    expect(HUB_PAGE).toMatch(/data-testid=\{`report-card-\$\{r\.id\}`\}/);
  });

  it("destination routes for the key reports are wired in the SERVER catalog", () => {
    // The hub used to pin destinations inline; with the §11 catalog
    // they live in the engine module. Pin them there so a future
    // edit that drops a route still trips this assertion.
    const CATALOG = readFileSync(
      join(import.meta.dirname!, "../../src/lib/umrahReportsCatalog.ts"),
      "utf8",
    );
    expect(CATALOG).toContain("/umrah/reports/agent-balances");
    expect(CATALOG).toContain("/umrah/reports/pilgrim-movements");
    expect(CATALOG).toContain("/umrah/reports/group-portfolio");
    expect(CATALOG).toContain("/umrah/reports/season-portfolio");
    expect(CATALOG).toContain("/umrah/compliance");
    expect(CATALOG).toContain("/umrah/daily-runsheet");
  });
});

describe("agent balances page — UX", () => {
  it("renders 4 KPI tiles + filters + table with stable testids", () => {
    // Filters unified into the canonical <AdvancedFilters> bar (was 4 bespoke
    // controls: season/status/outstanding/search). The status enum + the
    // season/outstanding extra-filters + the search placeholder feed it.
    expect(AGENTS_PAGE).toMatch(/<AdvancedFilters/);
    expect(AGENTS_PAGE).toContain('key: "seasonId"');
    expect(AGENTS_PAGE).toContain('key: "hasOutstanding"');
    expect(AGENTS_PAGE).toContain('searchPlaceholder: "اسم / رقم نسك / دولة..."');
    expect(AGENTS_PAGE).toContain('data-testid="agent-balances-table"');
    expect(AGENTS_PAGE).toContain("data-testid={`agent-balances-row-${r.id}`}");
    expect(AGENTS_PAGE).toContain("data-testid={`agent-balances-outstanding-${r.id}`}");
  });

  it("outstanding > 0 highlights in red (same signal as group/season portfolios)", () => {
    expect(AGENTS_PAGE).toMatch(/outstanding > 0 \? "text-status-error-foreground" : ""/);
  });

  it("each row drills to /umrah/agents/:id (single source of truth)", () => {
    expect(AGENTS_PAGE).toMatch(/href=\{`\/umrah\/agents\/\$\{r\.id\}`\}/);
  });

  it("CSV export via the unified helper (audit + letterhead)", () => {
    expect(AGENTS_PAGE).toContain('data-testid="agent-balances-export-csv"');
    expect(AGENTS_PAGE).toContain("exportRowsToCsv");
    expect(AGENTS_PAGE).toMatch(/entityType: "report_umrah_agent_balances"/);
  });
});

describe("pilgrim movements page — UX", () => {
  it("date defaults to todayLocal() + can be overridden", () => {
    // Riyadh-local default — bookmark or fresh-open lands on today.
    expect(MOVE_PAGE).toMatch(/useState\(todayLocal\(\)\)/);
    expect(MOVE_PAGE).toContain('data-testid="pilgrim-movements-filter-date"');
  });

  it("6 KPI tiles render with stable testids", () => {
    for (const key of ["arrived", "departed", "inside", "overstaying", "late", "withOverstay"]) {
      expect(MOVE_PAGE).toContain(`data-testid={\`pilgrim-movements-kpi-\${tile.key}\`}`);
    }
  });

  it("'عرض الأسماء' toggle requests view=details + renders 4 drill-down cards", () => {
    // testids are passed as `testid="..."` to the DetailCard sub-
    // component which renders them via `data-testid={testid}`. We
    // pin the literal-prop form (it's the only place where the 4
    // distinct names appear in source).
    expect(MOVE_PAGE).toContain('data-testid="pilgrim-movements-toggle-details"');
    expect(MOVE_PAGE).toContain('testid="pilgrim-movements-arrived-card"');
    expect(MOVE_PAGE).toContain('testid="pilgrim-movements-departed-card"');
    expect(MOVE_PAGE).toContain('testid="pilgrim-movements-overstaying-card"');
    expect(MOVE_PAGE).toContain('testid="pilgrim-movements-late-card"');
    expect(MOVE_PAGE).toMatch(/data-testid=\{testid\}/);
    expect(MOVE_PAGE).toMatch(/showDetails \? "إخفاء التفاصيل" : "عرض الأسماء"/);
  });

  it("drill-down rows link to /umrah/pilgrims/:id (single source of truth)", () => {
    expect(MOVE_PAGE).toMatch(/href=\{`\/umrah\/pilgrims\/\$\{r\.id\}`\}/);
  });

  it("overstaying + late cards tinted with the severity signal", () => {
    expect(MOVE_PAGE).toMatch(/tone === "error" \? "border-status-error-surface"/);
    expect(MOVE_PAGE).toMatch(/tone === "warning" \? "border-status-warning-surface"/);
  });
});
