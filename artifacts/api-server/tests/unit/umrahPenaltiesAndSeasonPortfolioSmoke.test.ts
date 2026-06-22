import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins two post-#1496 fixes:
 *
 * (1) Penalties endpoint hardening — the LEFT JOINs against
 *     umrah_pilgrims + umrah_agents lacked the tenant + soft-delete
 *     guards we've been adding everywhere else. A stale FK could
 *     surface a name from another tenant in the response.
 *
 * (2) Season portfolio P&L — companion to /reports/group-portfolio
 *     (#1495) at the season grain. Operators compare seasons across
 *     years without opening each one.
 */
const ROUTE_UMRAH = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
// U-07 Phase 11: the season-portfolio report was carved into umrah-reports.ts.
const ROUTE_ENT = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/umrah-season-portfolio.tsx"),
  "utf8",
);
const FIN_ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);

// Isolate the two penalty handlers — list + detail — so unrelated
// JOIN clauses elsewhere can't accidentally satisfy a pin.
const PEN_LIST = (() => {
  const m = ROUTE_UMRAH.match(/router\.get\("\/penalties",[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("penalties list handler not found");
  return m[0];
})();
const PEN_DETAIL = (() => {
  const m = ROUTE_UMRAH.match(/router\.get\("\/penalties\/:id"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("penalties detail handler not found");
  return m[0];
})();
const SEASON_PORT = (() => {
  const m = ROUTE_ENT.match(/router\.get\("\/reports\/season-portfolio"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\n\/\/ ==|\nexport default)/);
  if (!m) throw new Error("season-portfolio handler not found");
  return m[0];
})();

describe("GET /umrah/penalties — tenant-safe JOIN hardening", () => {
  it("list: umrah_pilgrims JOIN now carries companyId + deletedAt", () => {
    expect(PEN_LIST).toMatch(/LEFT JOIN umrah_pilgrims p\s+ON pen\."pilgrimId" = p\.id\s+AND p\."companyId"\s*= pen\."companyId"\s+AND p\."deletedAt"\s*IS NULL/);
  });

  it("list: umrah_agents JOIN now carries companyId + deletedAt", () => {
    expect(PEN_LIST).toMatch(/LEFT JOIN umrah_agents a\s+ON pen\."agentId"\s*= a\.id\s+AND a\."companyId"\s*= pen\."companyId"\s+AND a\."deletedAt"\s*IS NULL/);
  });

  it("detail: same tenant guard applied (list + detail share the same shape)", () => {
    expect(PEN_DETAIL).toMatch(/p\."companyId"\s*= pen\."companyId"/);
    expect(PEN_DETAIL).toMatch(/a\."companyId"\s*= pen\."companyId"/);
    expect(PEN_DETAIL).toMatch(/p\."deletedAt"\s*IS NULL/);
    expect(PEN_DETAIL).toMatch(/a\."deletedAt"\s*IS NULL/);
  });
});

describe("GET /umrah/reports/season-portfolio — endpoint contract", () => {
  it("registers under feature: umrah, action: list", () => {
    expect(SEASON_PORT).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("revenue + paid come from umrah_sales_invoices (header has seasonId — no items JOIN needed)", () => {
    // Unlike the group portfolio (#1495) which had to JOIN through
    // umrah_sales_invoice_items, the sales invoice HEADER carries
    // seasonId directly — so a flat SUM is the right query shape.
    expect(SEASON_PORT).toMatch(/SUM\(total\), 0\) AS revenue/);
    expect(SEASON_PORT).toMatch(/FROM umrah_sales_invoices/);
    expect(SEASON_PORT).toMatch(/"seasonId"\s*= s\.id/);
    expect(SEASON_PORT).toMatch(/status <> 'cancelled'/);
  });

  it("cost reaches the season via the group (nusk header has no seasonId)", () => {
    // NUSK invoices know their group, the group knows its season —
    // chain through.
    expect(SEASON_PORT).toMatch(/SUM\(ni\."netCost"\)/);
    expect(SEASON_PORT).toMatch(/ni\."groupId" IN \([\s\S]{1,400}FROM umrah_groups[\s\S]{1,200}"seasonId"\s*= s\.id/);
    expect(SEASON_PORT).toMatch(/"nuskStatus" <> 'cancelled'/);
  });

  it("groupsCount + pilgrimsCount come from tenant-scoped CTEs (N+1 fix)", () => {
    // After the N+1 fix the two count aggregates were lifted out of
    // per-row correlated subqueries into sibling CTEs keyed by
    // (seasonId, companyId). The tenant boundary now lives on the
    // LEFT JOIN's ON clause instead of inside the subquery WHERE.
    expect(SEASON_PORT).toContain("WITH season_pilgrim_counts AS");
    expect(SEASON_PORT).toContain("season_group_counts AS");
    expect(SEASON_PORT).toMatch(
      /LEFT JOIN season_pilgrim_counts spc\s+ON spc\."seasonId" = s\.id AND spc\."companyId" = s\."companyId"/,
    );
    expect(SEASON_PORT).toMatch(
      /LEFT JOIN season_group_counts sgc\s+ON sgc\."seasonId" = s\.id AND sgc\."companyId" = s\."companyId"/,
    );
  });

  it("ORDER BY margin DESC + bounded LIMIT 1..200", () => {
    expect(SEASON_PORT).toMatch(/ORDER BY margin DESC/);
    expect(SEASON_PORT).toMatch(/Math\.min\(Math\.max\(Number\(limitStr \?\? "50"\) \|\| 50, 1\), 200\)/);
  });

  it("optional ?status filter scopes the slice", () => {
    expect(SEASON_PORT).toMatch(/if \(status\) \{[\s\S]{0,200}statusClause = ` AND s\.status = \$/);
  });

  it("totals reducer is strongly typed (no implicit-any regression)", () => {
    // Caught this once on the group portfolio — pinning the reduce
    // generic here so a future refactor that drops it lands a clear
    // smoke failure instead of a tsc error chain.
    expect(SEASON_PORT).toMatch(/rows\.reduce<\{ revenue: number; cost: number; paid: number; margin: number \}>/);
  });

  it("response shape carries data + total + totals", () => {
    expect(SEASON_PORT).toMatch(/data: rows,\s*total: rows\.length,\s*totals,/);
  });
});

describe("UmrahSeasonPortfolio page — registration + UX", () => {
  it("registered under /finance/umrah-season-portfolio", () => {
    expect(FIN_ROUTES).toMatch(/UmrahSeasonPortfolio = lazy\(\(\) => import\("@\/pages\/finance\/umrah-season-portfolio"\)\)/);
    expect(FIN_ROUTES).toMatch(/path: "\/finance\/umrah-season-portfolio", component: UmrahSeasonPortfolio/);
  });

  it("status filter drives the query string (server-side filter)", () => {
    expect(PAGE).toContain('data-testid="season-portfolio-filter-status"');
    expect(PAGE).toMatch(/statusFilter && statusFilter !== "all" \? `\?status=\$\{statusFilter\}` : ""/);
  });

  it("renders KPI tiles + best/worst cards + table with stable testids", () => {
    expect(PAGE).toContain('data-testid="season-portfolio-total-count"');
    expect(PAGE).toContain('data-testid="season-portfolio-best-card"');
    expect(PAGE).toContain('data-testid="season-portfolio-worst-card"');
    expect(PAGE).toContain('data-testid="season-portfolio-table"');
    expect(PAGE).toContain("data-testid={`season-portfolio-row-${r.id}`}");
    expect(PAGE).toContain("data-testid={`season-portfolio-margin-${r.id}`}");
  });

  it("each row drills to /umrah/seasons/:id (single source of truth)", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/seasons\/\$\{r\.id\}`\}/);
  });

  it("negative-margin styling matches the symptom-surfacing on group portfolio", () => {
    expect(PAGE).toMatch(/margin < 0 \? "text-status-error-foreground" : "text-status-success-foreground"/);
  });

  it("CSV export uses the unified export helper + same filtered rows (no extra roundtrip)", () => {
    // GAP_MATRIX item #7 — page routes through `exportRowsToCsv`
    // so the download lands in /reports/print-log with audit.
    expect(PAGE).toContain('data-testid="season-portfolio-export-csv"');
    expect(PAGE).toContain('exportRowsToCsv');
    expect(PAGE).toMatch(/rows:\s*rows\s+as\s+unknown/);
    expect(PAGE).toMatch(/disabled=\{rows\.length === 0\}/);
  });
});
