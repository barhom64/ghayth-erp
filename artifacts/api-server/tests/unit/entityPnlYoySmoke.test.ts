import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-entity year-over-year comparison — closes the natural
 * "how am I doing vs last year?" question for any client / vendor /
 * agent / vehicle. Endpoint returns TWO buckets (current + prior-year
 * same period) + a delta computed server-side. Front-end renders a
 * 3-cell card on the existing entity-pnl drill page.
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
const YOY = (() => {
  const m = FCC.match(/router\.get\("\/entity-pnl\/:entityType\/:entityId\/yoy"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/entity-pnl/.../yoy handler not found");
  return m[0];
})();

describe("GET /finance/entity-pnl/:entityType/:entityId/yoy — YoY comparison", () => {
  it("registers under feature: finance.cost_centers, action: view (read-only)", () => {
    expect(YOY).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("reuses ENTITY_TYPE_TO_JL_COLUMN — same closed allowlist as the drill + series + ranking", () => {
    expect(YOY).toMatch(/const column = ENTITY_TYPE_TO_JL_COLUMN\[entityType\]/);
  });

  it("default current range = year-to-date (Jan 1 → today) — most common YoY framing", () => {
    expect(YOY).toMatch(/const defaultFrom = `\$\{today\.getUTCFullYear\(\)\}-01-01`/);
  });

  it("prior range derived by shifting the calendar year by -1 (preserves the calendar window)", () => {
    // Operators think "vs same month last year", NOT "vs 365 days ago"
    // — so we shift by calendar year, not by days. The string-shift
    // helper avoids Date.setFullYear() timezone drift on Feb 29 etc.
    expect(YOY).toMatch(/const shiftYear = \(iso: string\): string =>/);
    expect(YOY).toMatch(/return `\$\{y\}-\$\{m\}-\$\{d\}`/);
  });

  it("BOTH aggregates in a single UNION ALL query with a 'period' discriminator", () => {
    // Single round-trip; the period column tells the front-end which
    // bucket is which. Pinned so a future refactor that splits to
    // two queries trips this test.
    expect(YOY).toContain("'current' AS period");
    expect(YOY).toContain("UNION ALL");
    expect(YOY).toContain("'prior' AS period");
  });

  it("revenue/expense classification matches the drill (chart_of_accounts.type)", () => {
    expect(YOY).toMatch(/ca\.type = 'revenue'/);
    expect(YOY).toMatch(/ca\.type IN \('expense','cost_of_sales'\)/);
  });

  it("tenant-safe — JE companyId + CoA join gated on the same scope", () => {
    const tenantGates = YOY.match(/je\."companyId" = \$1/g);
    expect(tenantGates?.length ?? 0).toBeGreaterThanOrEqual(2); // one per period
    expect(YOY).toMatch(/ca\."companyId" = je\."companyId"/);
  });

  it("pct change uses |prior| as the denominator (sign-agnostic — no bogus % flip)", () => {
    // (current - prior) / |prior| — a negative-to-positive flip
    // doesn't render a fake -200%.
    expect(YOY).toMatch(/\(\(cur - pri\) \/ Math\.abs\(pri\)\)/);
  });

  it("pct returns null when prior is 0 (front-end renders '—' instead of '+∞%')", () => {
    expect(YOY).toMatch(/if \(pri === 0\) return null;/);
  });

  it("pct rounded to 1 decimal (avoids '0.1234567%' noise)", () => {
    expect(YOY).toMatch(/Math\.round\([\s\S]{0,200}\* 1000\) \/ 10/);
  });

  it("response shape — entityType + entityId + current + prior + delta with 7 fields", () => {
    expect(YOY).toMatch(/res\.json\(\{[\s\S]{0,200}entityType,[\s\S]{0,200}entityId,[\s\S]{0,200}current: \{[\s\S]{0,400}prior: \{[\s\S]{0,400}delta: \{/);
    for (const f of ["revenue:", "expense:", "net:", "entries:", "revenuePct:", "expensePct:", "netPct:"]) {
      expect(YOY).toMatch(new RegExp(`delta: \\{[\\s\\S]{0,800}${f}`));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page — YoyCard
// ─────────────────────────────────────────────────────────────────────────────
describe("entity-pnl page — YoY card", () => {
  it("queries the YoY endpoint with the same date filter as the drill", () => {
    expect(PAGE).toMatch(/`\/finance\/entity-pnl\/\$\{entityType\}\/\$\{entityId\}\/yoy\$\{qs \? "\?" \+ qs : ""\}`/);
  });

  it("renders YoyCard when yoy data is present (after BucketCard, before TrendCard)", () => {
    expect(PAGE).toContain("{yoy && <YoyCard yoy={yoy} />}");
    // Order matters for visual hierarchy — totals first, then YoY
    // delta, then trend chart, then JE list.
    const bucketIdx = PAGE.indexOf("<BucketCard bucket={data.bucket}");
    const yoyIdx = PAGE.indexOf("<YoyCard yoy={yoy} />");
    const trendIdx = PAGE.indexOf("<TrendCard series={series} />");
    expect(bucketIdx).toBeGreaterThan(0);
    expect(yoyIdx).toBeGreaterThan(bucketIdx);
    expect(trendIdx).toBeGreaterThan(yoyIdx);
  });

  it("3 delta cells — revenue / expense / net — each with its own testid", () => {
    for (const id of [
      "entity-pnl-yoy",
      "entity-pnl-yoy-revenue",
      "entity-pnl-yoy-expense",
      "entity-pnl-yoy-net",
    ]) {
      expect(PAGE).toContain(`testid="${id}"`);
    }
  });

  it("expense delta INVERTS the tone — higher expense = warning (operator-correct semantics)", () => {
    // higherIsBetter={false} only for expense; higherIsBetter={true}
    // for revenue + net. Without the inverse, a rising expense would
    // render green, which is misleading.
    expect(PAGE).toMatch(/<DeltaCell[\s\S]{1,400}label="المصروفات"[\s\S]{0,300}higherIsBetter=\{false\}/);
    expect(PAGE).toMatch(/<DeltaCell[\s\S]{1,400}label="الإيرادات"[\s\S]{0,300}higherIsBetter=\{true\}/);
    expect(PAGE).toMatch(/<DeltaCell[\s\S]{1,400}label="الصافي"[\s\S]{0,300}higherIsBetter=\{true\}/);
  });

  it("DeltaCell tone classes flip on improvement vs deterioration", () => {
    expect(PAGE).toMatch(/const isImprovement = higherIsBetter \? delta > 0 : delta < 0/);
    expect(PAGE).toMatch(/const isDeterioration = higherIsBetter \? delta < 0 : delta > 0/);
  });

  it("renders '—' as the percentage when pct is null (prior was 0)", () => {
    expect(PAGE).toMatch(/pct == null && [\s\S]{0,200}\(—\)/);
  });

  it("delta value carries an explicit + sign when positive (visual signal)", () => {
    expect(PAGE).toMatch(/\{delta >= 0 \? "\+" : ""\}\{formatCurrency\(delta\)\}/);
  });

  it("subtitle shows BOTH date ranges (current vs prior) for context", () => {
    expect(PAGE).toContain("yoy.current.dateFrom");
    expect(PAGE).toContain("yoy.prior.dateFrom");
    expect(PAGE).toContain("مقارنة بـ");
  });
});
