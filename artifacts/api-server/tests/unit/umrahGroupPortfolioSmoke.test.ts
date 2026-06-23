import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins two post-#1486 additions:
 *
 * (1) Group portfolio P&L — `/umrah/reports/group-portfolio` returns a
 *     ranked rollup of every group's revenue / cost / margin in a
 *     single roundtrip. Mirrors the vehicle/project/property portfolio
 *     pattern but at the group granularity. Without this the CFO had
 *     to open every group detail page one by one to compare margins.
 *
 * (2) Group invoice-action card — closes the loop between the group
 *     detail page and the sales wizard. Operator no longer has to
 *     navigate away + re-find the group; the card jumps to the
 *     existing invoice (if any) or opens the wizard.
 */
// U-07 Phase 11: the group-portfolio report was carved into umrah-reports.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const PORTFOLIO_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/umrah-group-portfolio.tsx"),
  "utf8",
);
const DETAIL_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-group-detail.tsx"),
  "utf8",
);
const FIN_ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);

// Isolate the new handler — the file is big, no point letting the
// reconciliation handler's identifiers satisfy a pin by accident.
const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/reports\/group-portfolio"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\n\/\/ ==|\nexport default)/);
  if (!m) throw new Error("group-portfolio handler not found");
  return m[0];
})();

describe("GET /umrah/reports/group-portfolio — endpoint contract", () => {
  it("registers under feature: umrah, action: list (CFO-friendly read view)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("revenue + paid land via a LATERAL on umrah_sales_invoice_items (header has no groupId)", () => {
    // The invoice header (umrah_sales_invoices) doesn't carry groupId
    // — the relationship lives on the items table. DISTINCT on si.id
    // collapses a multi-group invoice so it isn't double-counted.
    expect(HANDLER).toMatch(/LEFT JOIN LATERAL \([\s\S]{1,800}SUM\(DISTINCT si\.total\)[\s\S]{1,800}FROM umrah_sales_invoice_items it[\s\S]{1,400}JOIN umrah_sales_invoices si/);
    expect(HANDLER).toMatch(/si\.status <> 'cancelled'/);
  });

  it("cost lands via a LATERAL on umrah_nusk_invoices.netCost", () => {
    expect(HANDLER).toMatch(/SUM\("netCost"\)/);
    expect(HANDLER).toMatch(/"nuskStatus" <> 'cancelled'/);
  });

  it("LEFT JOINs season + agent carry companyId + deletedAt (tenant-safe)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_seasons s\s+ON s\.id = g\."seasonId" AND s\."companyId" = g\."companyId" AND s\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/LEFT JOIN umrah_agents a\s+ON a\.id = g\."agentId" AND a\."companyId" = g\."companyId" AND a\."deletedAt" IS NULL/);
  });

  it("ORDER BY margin DESC + per-group LIMIT capped (no unbounded portfolio scan)", () => {
    // The portfolio is naturally ranked by "which group made most
    // money" — DESC by margin lines that up so the CFO sees the
    // top-bottom story without resorting client-side.
    expect(HANDLER).toMatch(/ORDER BY margin DESC/);
    // The limit is parameterised with a JS-side Math.min cap, not
    // hard-coded SQL, so the test pins the cap call.
    expect(HANDLER).toMatch(/Math\.min\(Math\.max\(Number\(limitStr \?\? "50"\) \|\| 50, 1\), 500\)/);
  });

  it("optional ?seasonId filter scopes the slice", () => {
    expect(HANDLER).toMatch(/if \(seasonId\) \{[\s\S]{0,300}seasonClause = ` AND g\."seasonId" = \$/);
  });

  it("response shape carries the row-level metrics + tenant totals", () => {
    expect(HANDLER).toMatch(/data: rows,\s*total: rows\.length,\s*totals,/);
    // totals object must reflect revenue + cost + paid + margin —
    // those are the headline KPIs on the page.
    expect(HANDLER).toMatch(/revenue:\s*acc\.revenue/);
    expect(HANDLER).toMatch(/cost:\s*acc\.cost/);
    expect(HANDLER).toMatch(/margin:\s*acc\.margin/);
  });
});

describe("UmrahGroupPortfolio page — registration + UX", () => {
  it("registered under /finance/umrah-group-portfolio", () => {
    expect(FIN_ROUTES).toMatch(/UmrahGroupPortfolio = lazy\(\(\) => import\("@\/pages\/finance\/umrah-group-portfolio"\)\)/);
    expect(FIN_ROUTES).toMatch(/path: "\/finance\/umrah-group-portfolio", component: UmrahGroupPortfolio/);
  });

  it("season filter drives the query string (server-side filter)", () => {
    expect(PORTFOLIO_PAGE).toContain('data-testid="group-portfolio-filter-season"');
    expect(PORTFOLIO_PAGE).toMatch(/seasonFilter && seasonFilter !== "all" \? `\?seasonId=\$\{seasonFilter\}` : ""/);
  });

  it("renders KPI tiles + best/worst cards + table with stable testids", () => {
    expect(PORTFOLIO_PAGE).toContain('data-testid="group-portfolio-total-count"');
    expect(PORTFOLIO_PAGE).toContain('data-testid="group-portfolio-best-card"');
    expect(PORTFOLIO_PAGE).toContain('data-testid="group-portfolio-worst-card"');
    expect(PORTFOLIO_PAGE).toContain('data-testid="group-portfolio-table"');
    expect(PORTFOLIO_PAGE).toContain("data-testid={`group-portfolio-row-${r.id}`}");
    expect(PORTFOLIO_PAGE).toContain("data-testid={`group-portfolio-margin-${r.id}`}");
  });

  it("each row drills to /umrah/groups/:id (single source of truth)", () => {
    expect(PORTFOLIO_PAGE).toMatch(/href=\{`\/umrah\/groups\/\$\{r\.id\}`\}/);
  });

  it("negative-margin styling matches the symptom-surfacing on the detail page", () => {
    // Operator caught a "selling below cost" issue earlier; the
    // portfolio page must surface that same red-margin signal.
    expect(PORTFOLIO_PAGE).toMatch(/margin < 0 \? "text-status-error-foreground" : "text-status-success-foreground"/);
  });

  it("CSV export uses the unified export helper + same filtered rows (no extra roundtrip)", () => {
    // GAP_MATRIX item #7 — the page now routes through `exportRowsToCsv`
    // instead of a local Blob+createObjectURL builder so the download
    // lands in /reports/print-log with audit + letterhead.
    expect(PORTFOLIO_PAGE).toContain('data-testid="group-portfolio-export-csv"');
    expect(PORTFOLIO_PAGE).toContain('exportRowsToCsv');
    expect(PORTFOLIO_PAGE).toMatch(/rows:\s*rows\s+as\s+unknown/);
    expect(PORTFOLIO_PAGE).toMatch(/disabled=\{rows\.length === 0\}/);
  });
});

describe("group detail — invoice-action card", () => {
  it("salesInvoiceId is now in the GroupDetail type", () => {
    expect(DETAIL_PAGE).toMatch(/salesInvoiceId: number \| null/);
  });

  it("renders a stable testid for the action card", () => {
    expect(DETAIL_PAGE).toContain('data-testid="group-invoice-action-card"');
  });

  it("when an invoice exists, surfaces a link to /umrah/invoices/:id (jump straight to it)", () => {
    expect(DETAIL_PAGE).toMatch(/href=\{`\/umrah\/invoices\/\$\{data\.salesInvoiceId\}`\}/);
    expect(DETAIL_PAGE).toContain('data-testid="group-invoice-view-link"');
  });

  it("when no invoice exists, surfaces a link to the sales wizard + sub-agent warning when missing", () => {
    expect(DETAIL_PAGE).toContain('data-testid="group-invoice-create-link"');
    expect(DETAIL_PAGE).toMatch(/href=\{`\/umrah\/sales-wizard`\}/);
    // Sub-agent missing → operator gets a warning before clicking
    // (otherwise the wizard would force them to back out).
    expect(DETAIL_PAGE).toMatch(/data\?\.subAgentId == null/);
    expect(DETAIL_PAGE).toContain("بدون وكيل فرعي");
  });
});
