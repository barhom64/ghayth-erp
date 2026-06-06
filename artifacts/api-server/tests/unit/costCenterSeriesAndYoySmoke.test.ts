import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Feature-parity pass — brings the per-CC drill (cost-center-drill-pnl)
 * to the same level as the per-entity drill (entity-pnl) by adding:
 *   1. NEW GET /finance/cost-centers/:id/series — monthly buckets across
 *      the CC + its descendants
 *   2. NEW GET /finance/cost-centers/:id/yoy — current vs prior-year same
 *      period buckets + delta
 *   3. CSV export, TrendCard, and YoyCard on the drill page
 *
 * Same queries/conventions as the per-entity equivalents — drift alarm.
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-drill-pnl.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Series endpoint
// ─────────────────────────────────────────────────────────────────────────────
const SERIES = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/:id\/series"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/cost-centers/:id/series handler not found");
  return m[0];
})();

describe("GET /finance/cost-centers/:id/series — monthly trend for a CC", () => {
  it("registers under feature: finance.cost_centers, action: view", () => {
    expect(SERIES).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("404s when the CC doesn't belong to the tenant (defence)", () => {
    expect(SERIES).toMatch(/throw new NotFoundError\("مركز التكلفة غير موجود"\)/);
  });

  it("rolls up THIS CC + all descendants via recursive CTE (mirrors the drill's rolled bucket)", () => {
    expect(SERIES).toMatch(/WITH RECURSIVE tree AS \(/);
    expect(SERIES).toMatch(/JOIN tree t ON t\.id = cc\."parentId"/);
    expect(SERIES).toMatch(/jl\."costCenterId" IN \(SELECT id FROM tree\)/);
  });

  it("uses generate_series('month') so inactive months still appear (chart continuity)", () => {
    expect(SERIES).toMatch(/generate_series\(\s*date_trunc\('month', \$2::date\),\s*date_trunc\('month', \$3::date\),\s*interval '1 month'\s*\)::date AS m/);
  });

  it("LEFT JOIN aggregate onto month rows so zero-activity months come through as 0", () => {
    expect(SERIES).toMatch(/LEFT JOIN agg ON agg\.m = months\.m/);
  });

  it("revenue/expense classification matches the per-entity equivalents (chart_of_accounts.type)", () => {
    expect(SERIES).toMatch(/ca\.type = 'revenue'[\s\S]{0,200}jl\.credit - jl\.debit/);
    expect(SERIES).toMatch(/ca\.type IN \('expense','cost_of_sales'\)[\s\S]{0,200}jl\.debit - jl\.credit/);
  });

  it("default range = last 12 months ending today (mirrors entity series)", () => {
    expect(SERIES).toMatch(/today\.getUTCFullYear\(\) - 1, today\.getUTCMonth\(\), 1/);
  });

  it("tenant-safe — JE companyId + recursive CTE both gate on the scope", () => {
    const gates = SERIES.match(/je\."companyId" = \$4/g);
    expect(gates?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(SERIES).toMatch(/cc\."companyId" = \$4/);
  });

  it("totals reduced over buckets — same shape as the entity series", () => {
    expect(SERIES).toMatch(/const totals = buckets\.reduce\(/);
  });

  it("response includes costCenter + dateFrom + dateTo + buckets + totals", () => {
    expect(SERIES).toMatch(/res\.json\(\{[\s\S]{0,200}costCenter: cc,[\s\S]{0,200}dateFrom: from,[\s\S]{0,200}dateTo: to,[\s\S]{0,200}buckets,[\s\S]{0,200}totals,/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YoY endpoint
// ─────────────────────────────────────────────────────────────────────────────
const YOY = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/:id\/yoy"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/cost-centers/:id/yoy handler not found");
  return m[0];
})();

describe("GET /finance/cost-centers/:id/yoy — YoY for a CC", () => {
  it("registers under feature: finance.cost_centers, action: view", () => {
    expect(YOY).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("default current range = year-to-date (Jan 1 → today)", () => {
    expect(YOY).toMatch(/const defaultFrom = `\$\{today\.getUTCFullYear\(\)\}-01-01`/);
  });

  it("prior range shifted by EXACTLY one calendar year (string-shift, not Date math)", () => {
    expect(YOY).toMatch(/const shiftYear = \(iso: string\): string =>/);
  });

  it("BOTH aggregates in a single UNION ALL query with a 'period' discriminator", () => {
    expect(YOY).toContain("'current' AS period");
    expect(YOY).toContain("UNION ALL");
    expect(YOY).toContain("'prior' AS period");
  });

  it("rolls up THIS CC + descendants via recursive CTE (same as the series endpoint)", () => {
    expect(YOY).toMatch(/WITH RECURSIVE tree AS \(/);
    expect(YOY).toMatch(/jl\."costCenterId" IN \(SELECT id FROM tree\)/);
  });

  it("pct change uses |prior| as the denominator (sign-agnostic)", () => {
    expect(YOY).toMatch(/\(\(cur - pri\) \/ Math\.abs\(pri\)\)/);
  });

  it("pct returns null when prior is 0 (front-end shows '—')", () => {
    expect(YOY).toMatch(/if \(pri === 0\) return null/);
  });

  it("response includes costCenter + current + prior + delta with 7 fields", () => {
    expect(YOY).toMatch(/res\.json\(\{[\s\S]{0,200}costCenter: cc,[\s\S]{0,200}current: \{[\s\S]{0,400}prior:[\s\S]{0,400}delta: \{/);
    for (const f of ["revenue:", "expense:", "net:", "entries:", "revenuePct:", "expensePct:", "netPct:"]) {
      expect(YOY).toMatch(new RegExp(`delta: \\{[\\s\\S]{0,800}${f}`));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend wiring
// ─────────────────────────────────────────────────────────────────────────────
describe("cost-center-drill-pnl page — feature parity with entity-pnl", () => {
  it("queries the new series endpoint", () => {
    expect(PAGE).toMatch(/`\/finance\/cost-centers\/\$\{id\}\/series\?dateFrom=\$\{from\}&dateTo=\$\{to\}`/);
  });

  it("queries the new YoY endpoint", () => {
    expect(PAGE).toMatch(/`\/finance\/cost-centers\/\$\{id\}\/yoy\?dateFrom=\$\{from\}&dateTo=\$\{to\}`/);
  });

  it("renders CcYoyCard between bucket cards and TrendCard (visual hierarchy)", () => {
    expect(PAGE).toContain("{yoy && <CcYoyCard yoy={yoy} />}");
    const bucketIdx = PAGE.indexOf('testid="cost-center-pnl-rolled"');
    const yoyIdx = PAGE.indexOf("<CcYoyCard yoy={yoy} />");
    const trendIdx = PAGE.indexOf("<CcTrendCard series={series} />");
    expect(bucketIdx).toBeGreaterThan(0);
    expect(yoyIdx).toBeGreaterThan(bucketIdx);
    expect(trendIdx).toBeGreaterThan(yoyIdx);
  });

  it("CcTrendCard reuses the same SVG geometry as the entity TrendCard", () => {
    expect(PAGE).toMatch(/BAR_GROUP_WIDTH = 40/);
    expect(PAGE).toMatch(/CHART_HEIGHT = 140/);
    expect(PAGE).toMatch(/Math\.max\(\s*1,[\s\S]{0,300}Math\.abs\(b\.revenue\), Math\.abs\(b\.expense\)/);
  });

  it("CcYoyCard's expense delta INVERTS the tone (rising cost = warning)", () => {
    expect(PAGE).toMatch(/<CcDeltaCell[\s\S]{1,400}label="المصروفات"[\s\S]{0,300}higherIsBetter=\{false\}/);
    expect(PAGE).toMatch(/<CcDeltaCell[\s\S]{1,400}label="الإيرادات"[\s\S]{0,300}higherIsBetter=\{true\}/);
    expect(PAGE).toMatch(/<CcDeltaCell[\s\S]{1,400}label="الصافي"[\s\S]{0,300}higherIsBetter=\{true\}/);
  });

  it("CSV export uses entityType='report_cost_center_pnl' on the unified-export helper", () => {
    expect(PAGE).toMatch(/import \{ exportRowsToCsv \}/);
    expect(PAGE).toMatch(/entityType: "report_cost_center_pnl"/);
  });

  it("CSV payload includes BOTH self and rolled buckets + per-month rows", () => {
    expect(PAGE).toContain("إيرادات (ذاتي)");
    expect(PAGE).toContain("إيرادات (تجميعي)");
    expect(PAGE).toMatch(/\.\.\.\(series\?\.buckets \?\? \[\]\)\.map/);
  });

  it("stable testids on the 3 new pieces — trend / yoy / CSV", () => {
    for (const id of [
      "cost-center-pnl-trend",
      "cost-center-pnl-trend-chart",
      "cost-center-pnl-yoy",
      "cost-center-pnl-yoy-revenue",
      "cost-center-pnl-yoy-expense",
      "cost-center-pnl-yoy-net",
      "cost-center-pnl-export-csv",
    ]) {
      expect(PAGE).toContain(`testid="${id}"`);
    }
  });
});
