import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline sparklines added to 3 of the 4 KPI cards on the DSO-trend
 * page. The page already builds a `trend: MonthDSO[]` array (one
 * entry per month in the lookback window) via N parallel income-
 * statement queries.
 *
 * The 3 KPI sparks all visualise the SAME series (`trend.dso`) but
 * with DIFFERENT TONE SEMANTICS:
 *
 *   - "DSO الحالي" — status-driven tone (good → success,
 *     warn/critical → warning). Mirrors the headline number colour.
 *   - "متوسط الفترة" — muted tone (no judgement on the avg itself).
 *   - "الاتجاه" — direction-driven tone (up = deteriorating = warning,
 *     down = improving = success). DSO is one of those metrics where
 *     "up" is bad (longer collection cycle).
 *
 * The "الهدف" (target) card stays sparkline-free — a target is a
 * single constant, not a series.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dso-trend.tsx"),
  "utf8",
);

describe("dso-trend — inline sparklines on KPI cards", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("3 sparks render — all feeding off the SAME existing series (drift alarm)", () => {
    const matches = PAGE.match(/values=\{trend\.map\(\(t\) => t\.dso\)\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(3);
  });

  it("current-DSO spark mirrors the status colour (good → success, otherwise warning)", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone=\{statusFor\(latestDso\) === "good" \? "success" : "warning"\}[\s\S]{0,200}testid="dso-trend-current-spark"/);
  });

  it("avg-period spark is muted — no judgement on the avg itself", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone="muted"[\s\S]{0,200}testid="dso-trend-avg-spark"/);
  });

  it("direction spark — 'up' is warning (longer collection cycle is bad)", () => {
    expect(PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}tone=\{trendArrow === "up" \? "warning" : "success"\}[\s\S]{0,200}testid="dso-trend-direction-spark"/);
  });

  it("target card stays sparkline-free — a target is a constant, not a series", () => {
    const targetIdx = PAGE.indexOf("الهدف");
    const targetSparkAttempt = PAGE.indexOf('testid="dso-trend-target-spark"');
    expect(targetIdx).toBeGreaterThan(0);
    expect(targetSparkAttempt).toBe(-1);
  });

  it("scoped testids — 3 surfaces selectable independently", () => {
    expect(PAGE).toContain('testid="dso-trend-current-spark"');
    expect(PAGE).toContain('testid="dso-trend-avg-spark"');
    expect(PAGE).toContain('testid="dso-trend-direction-spark"');
  });
});
