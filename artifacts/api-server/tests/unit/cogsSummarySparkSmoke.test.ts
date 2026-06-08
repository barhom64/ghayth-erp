import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline sparklines on the COGS / margin summary KPIs. The page
 * already builds a `byPeriod` array (one entry per month) — the
 * 4 sparks visualise the per-month trajectory beside the headline
 * totals: revenue / COGS / profit / margin %. The "returns
 * (reversals)" KPI deliberately stays sparkline-free because it's
 * sporadic by nature; a near-flat-near-zero series would be noise.
 *
 * Tone semantics:
 *   - revenue:  neutral (size is a fact, not good/bad)
 *   - COGS:     warning (it's a cost; reading the SHAPE is what
 *     matters — bursts vs steady)
 *   - profit:   success if totalProfit >= 0, warning otherwise
 *   - margin %: success if marginPct >= 0, warning otherwise
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cogs-summary.tsx"),
  "utf8",
);

describe("cogs-summary — inline sparklines on KPI cards", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("reuses the existing byPeriod array for all four KPI sparks — no new state/fetch", () => {
    expect(PAGE).toMatch(/values=\{byPeriod\.map\(\(p\) => p\.revenue\)\}/);
    expect(PAGE).toMatch(/values=\{byPeriod\.map\(\(p\) => p\.cogsNet\)\}/);
    expect(PAGE).toMatch(/values=\{byPeriod\.map\(\(p\) => p\.profit\)\}/);
    expect(PAGE).toMatch(/values=\{byPeriod\.map\(\(p\) => p\.marginPct\)\}/);
  });

  it("revenue spark is neutral-toned (size is a fact, not good/bad)", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone="neutral"[\s\S]{0,200}testid="cogs-summary-revenue-spark"/);
  });

  it("COGS spark is warning-toned regardless of slope (cost is always cost; SHAPE is what to read)", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone="warning"[\s\S]{0,200}testid="cogs-summary-cogs-spark"/);
  });

  it("profit spark tone flips by total sign (success ⇔ warning at totalProfit boundary)", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,250}tone=\{summary\.totalProfit >= 0 \? "success" : "warning"\}[\s\S]{0,200}testid="cogs-summary-profit-spark"/);
  });

  it("margin %% spark tone flips by margin sign", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,250}tone=\{summary\.marginPct >= 0 \? "success" : "warning"\}[\s\S]{0,200}testid="cogs-summary-margin-spark"/);
  });

  it("returns KPI (المرتجعات) stays sparkline-free — sporadic series = noise", () => {
    const returnsIdx = PAGE.indexOf("المرتجعات");
    const returnsSparkAttempt = PAGE.indexOf('testid="cogs-summary-returns-spark"');
    expect(returnsIdx).toBeGreaterThan(0);
    expect(returnsSparkAttempt).toBe(-1);
  });

  it("scoped testids — 4 surfaces selectable independently", () => {
    expect(PAGE).toContain('testid="cogs-summary-revenue-spark"');
    expect(PAGE).toContain('testid="cogs-summary-cogs-spark"');
    expect(PAGE).toContain('testid="cogs-summary-profit-spark"');
    expect(PAGE).toContain('testid="cogs-summary-margin-spark"');
  });
});
