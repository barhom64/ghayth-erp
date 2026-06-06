import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-entity time-series — month-by-month P&L for a single entity
 * (the new endpoint) + the chart + CSV-export action added to the
 * existing entity-pnl drill page.
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-pnl.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────────────────────────────────────
const SERIES = (() => {
  const m = FCC.match(/router\.get\("\/entity-pnl\/:entityType\/:entityId\/series"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/entity-pnl/.../series handler not found");
  return m[0];
})();

describe("GET /finance/entity-pnl/:entityType/:entityId/series — monthly trend", () => {
  it("registers under feature: finance.cost_centers, action: view (read-only)", () => {
    expect(SERIES).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("reuses ENTITY_TYPE_TO_JL_COLUMN — same closed allowlist as the drill + ranking", () => {
    expect(SERIES).toMatch(/const column = ENTITY_TYPE_TO_JL_COLUMN\[entityType\]/);
    expect(SERIES).toMatch(/throw new ValidationError\(`نوع الكيان غير مدعوم/);
  });

  it("default range = last 12 months ending today (operator's lifetime-vs-trend mental model)", () => {
    expect(SERIES).toMatch(/today\.getUTCFullYear\(\) - 1, today\.getUTCMonth\(\), 1/);
  });

  it("uses generate_series('month') to ensure inactive months still appear (chart continuity)", () => {
    expect(SERIES).toMatch(/generate_series\(\s*date_trunc\('month', \$2::date\),\s*date_trunc\('month', \$3::date\),\s*interval '1 month'\s*\)::date AS m/);
  });

  it("LEFT JOIN month-bucket onto the activity aggregate so zero-activity months come through as 0", () => {
    expect(SERIES).toMatch(/LEFT JOIN agg ON agg\.m = months\.m/);
  });

  it("revenue/expense classification matches the drill (chart_of_accounts.type)", () => {
    expect(SERIES).toMatch(/ca\.type = 'revenue'[\s\S]{0,200}jl\.credit - jl\.debit/);
    expect(SERIES).toMatch(/ca\.type IN \('expense','cost_of_sales'\)[\s\S]{0,200}jl\.debit - jl\.credit/);
  });

  it("month is formatted to_char(..., 'YYYY-MM') for stable string keys on the frontend", () => {
    expect(SERIES).toMatch(/to_char\(months\.m, 'YYYY-MM'\) AS month/);
  });

  it("tenant-safe — both the JE filter and the CoA join gate on companyId", () => {
    expect(SERIES).toMatch(/je\."companyId" = \$1/);
    expect(SERIES).toMatch(/ca\."companyId" = je\."companyId"/);
  });

  it("totals computed by reducing over buckets (revenue + expense + net + entries)", () => {
    expect(SERIES).toMatch(/const totals = buckets\.reduce\([\s\S]{1,300}revenue: acc\.revenue \+ b\.revenue[\s\S]{0,200}expense: acc\.expense \+ b\.expense[\s\S]{0,200}net: acc\.net \+ b\.net[\s\S]{0,200}entries: acc\.entries \+ b\.entries/);
  });

  it("response shape — entityType + entityId + dateFrom + dateTo + buckets + totals", () => {
    expect(SERIES).toMatch(/res\.json\(\{[\s\S]{0,400}entityType,[\s\S]{0,200}entityId,[\s\S]{0,200}dateFrom: from,[\s\S]{0,200}dateTo: to,[\s\S]{0,200}buckets,[\s\S]{0,200}totals,/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page — trend card + CSV export
// ─────────────────────────────────────────────────────────────────────────────
describe("entity-pnl page — trend card + CSV export", () => {
  it("queries the series endpoint with the same date range as the bucket query", () => {
    expect(PAGE).toMatch(/`\/finance\/entity-pnl\/\$\{entityType\}\/\$\{entityId\}\/series\$\{qs \? "\?" \+ qs : ""\}`/);
  });

  it("renders TrendCard only when there are buckets (no empty-axis flash)", () => {
    expect(PAGE).toMatch(/\{series && series\.buckets\.length > 0 && \(/);
    expect(PAGE).toContain("<TrendCard series={series} />");
  });

  it("TrendCard renders a single SVG (no charting dependency pulled in)", () => {
    expect(PAGE).toMatch(/<svg\s+width=\{chartWidth\}\s+height=\{CHART_HEIGHT\}/);
  });

  it("each month bucket emits a stable testid for screenshot regression", () => {
    expect(PAGE).toContain('data-testid={`entity-pnl-trend-bar-${b.month}`}');
    expect(PAGE).toContain('data-testid="entity-pnl-trend"');
    expect(PAGE).toContain('data-testid="entity-pnl-trend-chart"');
  });

  it("bar heights scale by the max(|revenue|, |expense|) across all buckets (Math.abs)", () => {
    // Without Math.abs a negative outlier would skew the chart.
    expect(PAGE).toMatch(/Math\.max\(\s*1,[\s\S]{0,300}Math\.abs\(b\.revenue\), Math\.abs\(b\.expense\)/);
  });

  it("<title> on each bar surfaces the value on hover (a11y + tooltip)", () => {
    expect(PAGE).toMatch(/<title>\{`\$\{b\.month\} · إيراد \$\{formatCurrency\(b\.revenue\)\}`\}<\/title>/);
    expect(PAGE).toMatch(/<title>\{`\$\{b\.month\} · مصروف \$\{formatCurrency\(b\.expense\)\}`\}<\/title>/);
  });

  it("CSV export button uses the unified-export helper with entityType='report_entity_pnl'", () => {
    expect(PAGE).toMatch(/import \{ exportRowsToCsv \} from "@\/lib\/unified-export"/);
    expect(PAGE).toMatch(/entityType: "report_entity_pnl"/);
  });

  it("CSV payload includes the 4 headline metrics + a per-month row for each bucket", () => {
    for (const m of ["الإيرادات", "المصروفات", "الصافي", "عدد القيود"]) {
      expect(PAGE).toContain(`metric: "${m}"`);
    }
    expect(PAGE).toMatch(/\.\.\.\(series\?\.buckets \?\? \[\]\)\.map/);
  });

  it("CSV filename encodes entityType + entityId (operator can identify their download)", () => {
    expect(PAGE).toMatch(/`entity-pnl-\$\{entityType\}-\$\{entityId\}`/);
  });

  it("stable testid on the CSV button", () => {
    expect(PAGE).toContain('data-testid="entity-pnl-export-csv"');
  });
});
