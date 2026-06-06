import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline sparkline added to the renderTrendCell helper on the
 * income-statement-trend page. The page already builds an
 * `amounts: number[]` array per account row (one entry per month
 * in the lookback window). The sparkline takes that EXISTING array
 * — no new data — and renders the full trajectory beside the MoM
 * % so the operator can distinguish:
 *
 *   "+3%" steady creep vs "+3%" recent jump after flat months
 *
 * (only the spark shape reveals the difference).
 *
 * Compact dimensions (48×16) because trend cells live in a dense
 * table row and the percent is the headline.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/income-statement-trend.tsx"),
  "utf8",
);

describe("income-statement-trend — inline sparkline in renderTrendCell", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("renders the spark inside renderTrendCell — applies to ALL 5 callers automatically", () => {
    // renderTrendCell is called for: 4 different row types (revenue
    // rows, totRev, expense rows, totExp) + netRow. Putting the spark
    // inside the helper means all 5 surfaces gain it from one edit.
    expect(PAGE).toMatch(/const renderTrendCell = \(amounts: number\[\]\) =>[\s\S]{0,1000}<InlineSparkline values=\{amounts\}/);
  });

  it("feeds the EXISTING amounts array — no new state, no new fetch", () => {
    expect(PAGE).toMatch(/<InlineSparkline values=\{amounts\}/);
  });

  it("tone follows the MoM thresholds — success / warning / muted (same as the arrow)", () => {
    // Drift alarm: the spark tone should mirror the arrow's success/
    // warning thresholds. If the arrow uses >5/<-5 the spark must too.
    expect(PAGE).toMatch(/sparkTone[\s\S]{0,200}mom\.pct > 5 \? "success" : mom\.pct < -5 \? "warning" : "muted"/);
  });

  it("compact dimensions (48×16) keep the cell readable in a dense table", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}width=\{48\} height=\{16\}/);
  });

  it("renderTrendCell is still called for ALL 5 row types — no regression in coverage", () => {
    const matches = PAGE.match(/renderTrendCell\(/g);
    expect(matches).not.toBeNull();
    // 5 invocations (revenue rows, totRev, expense rows, totExp, netRow).
    // The declaration uses `=` so it doesn't match the `(` form.
    // If anyone removes a sparkline by removing a call, this catches it.
    expect(matches!.length).toBeGreaterThanOrEqual(5);
  });

  it("MoM arrow + % stay (spark is ADDITIVE, not a replacement)", () => {
    expect(PAGE).toMatch(/<TrendingUp className="h-3 w-3 text-emerald-600" \/>/);
    expect(PAGE).toMatch(/<TrendingDown className="h-3 w-3 text-red-600" \/>/);
    expect(PAGE).toMatch(/\{mom\.pct > 0 \? "\+" : ""\}\{mom\.pct\.toFixed\(0\)\}%/);
  });
});
