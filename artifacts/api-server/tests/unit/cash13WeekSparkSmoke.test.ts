import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline sparklines added to the 13-week cash forecast KPI cards.
 * The page already builds a `weeks: WeekBucket[]` array (13 entries)
 * with `inflow`, `outflow`, and `endingBalance` per week.
 *
 * The 3 aggregate KPIs at the top each get a sparkline showing
 * the per-week trajectory behind the headline number:
 *
 *   - "تدفقات داخلة 13أ"  ← inflows trajectory (success tone)
 *   - "تدفقات خارجة 13أ"  ← outflows trajectory (warning tone — high
 *     outflow is worse than low, so the chart colour stays warning
 *     regardless of slope; the SHAPE is what the operator reads)
 *   - "رصيد نهاية الـ 13أ" ← ending balance per week. Tone flips by
 *     end-of-13-weeks sign (worsening balance = warning).
 *
 * No new data — feeds off the existing `weeks` array.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cash-13week.tsx"),
  "utf8",
);

describe("cash-13week — inline sparklines on aggregate KPIs", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("reuses the existing weeks array for ALL 3 sparks — no new state, no new fetch", () => {
    expect(PAGE).toMatch(/values=\{weeks\.map\(\(w\) => w\.inflow\)\}/);
    expect(PAGE).toMatch(/values=\{weeks\.map\(\(w\) => w\.outflow\)\}/);
    expect(PAGE).toMatch(/values=\{weeks\.map\(\(w\) => w\.endingBalance\)\}/);
  });

  it("inflows spark is success-toned (aligned with the green KPI value)", () => {
    expect(PAGE).toMatch(/values=\{weeks\.map\(\(w\) => w\.inflow\)\}[\s\S]{0,200}tone="success"/);
  });

  it("outflows spark is warning-toned regardless of slope (high outflow always = bad)", () => {
    expect(PAGE).toMatch(/values=\{weeks\.map\(\(w\) => w\.outflow\)\}[\s\S]{0,200}tone="warning"/);
  });

  it("ending-balance spark tone flips by sign — warning when negative, success when positive", () => {
    expect(PAGE).toMatch(/values=\{weeks\.map\(\(w\) => w\.endingBalance\)\}[\s\S]{0,300}tone=\{endingBalance < 0 \? "warning" : "success"\}/);
  });

  it("scoped testids — 3 surfaces selectable independently", () => {
    expect(PAGE).toContain('testid="cash-13week-inflow-spark"');
    expect(PAGE).toContain('testid="cash-13week-outflow-spark"');
    expect(PAGE).toContain('testid="cash-13week-balance-spark"');
  });
});
