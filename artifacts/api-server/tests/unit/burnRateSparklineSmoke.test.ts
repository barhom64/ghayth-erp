import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline sparklines wired into the expense-burn-rate page. The page
 * already computes a 6-month `monthlyStats` array; the sparklines
 * just render the existing series next to the headline KPI values
 * so the operator sees the BURN TRAJECTORY beside the AVERAGE
 * BURN number (and beside the TREND number).
 *
 * Both sparklines use the same series — they're TWO different
 * framings of the same 6-point trajectory:
 *   - "متوسط الحرق الشهري" KPI shows the AVERAGE; the spark shows
 *     each month's burn so volatility is visible.
 *   - "اتجاه الحرق" KPI shows recent − prior; the same spark beside
 *     it makes the direction reading immediate.
 *
 * Tone follows the KPI: positive burn ⇒ warning (red), negative
 * burn ⇒ success (green).
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/expense-burn-rate.tsx"),
  "utf8",
);

describe("expense-burn-rate page — inline sparklines on KPI cards", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("reuses the existing monthlyStats array — no new state, no new fetch", () => {
    // Drift alarm: the page should NOT duplicate the series for the
    // sparkline. Both sparklines feed off `monthlyStats.map((m) => m.burn)`.
    const matches = PAGE.match(/values=\{monthlyStats\.map\(\(m\) => m\.burn\)\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("tone follows avg burn — warning when burning, success when net profit", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone=\{avgBurn > 0 \? "warning" : "success"\}/);
  });

  it("tone follows burn trend — warning when worsening, success when improving", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone=\{burnTrend > 0 \? "warning" : "success"\}/);
  });

  it("avg-burn sparkline renders in the avgBurn KPI Card (multi-line context match)", () => {
    // Match the spark inside the avgBurn Card by anchoring to its
    // distinctive border class — the avgBurn card is the ONE that
    // colour-codes its border by burn sign. The spark must appear
    // before that Card closes.
    expect(PAGE).toMatch(/avgBurn > 0 \? "border-status-danger-foreground border-2"[\s\S]{0,2000}testid="burn-rate-avg-spark"[\s\S]{0,200}<\/Card>/);
  });

  it("trend sparkline renders in the burnTrend KPI Card", () => {
    // Anchor on the burnTrend conditional class for the headline value
    // so the test fails if the spark is moved out of that Card.
    expect(PAGE).toMatch(/burnTrend > 0 \? "\+" : ""\}\{formatCurrency\(burnTrend\)\}[\s\S]{0,1500}testid="burn-rate-trend-spark"/);
  });

  it("scoped testids — both surfaces selectable independently in screenshot regression", () => {
    expect(PAGE).toContain('testid="burn-rate-avg-spark"');
    expect(PAGE).toContain('testid="burn-rate-trend-spark"');
  });
});
