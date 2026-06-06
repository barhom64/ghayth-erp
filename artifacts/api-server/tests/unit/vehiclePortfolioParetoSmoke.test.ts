import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pareto marker wired into the vehicle-portfolio-dashboard.
 * Existing ranking sorts vehicles by profit DESC. The marker
 * computes cumulative |profit| share and crowns the first row
 * that crosses 80% — operational insight is "this row + everything
 * above accounts for 80% of total profit magnitude; the rest is
 * the long tail."
 *
 * No backend change — feeds off the existing sorted array using
 * the shared computeParetoCumulative helper (single source of
 * truth for the math).
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/vehicle-portfolio-dashboard.tsx"),
  "utf8",
);

describe("vehicle-portfolio-dashboard — Pareto marker on the ranking table", () => {
  it("imports both ParetoMarker (presentation) and computeParetoCumulative (math)", () => {
    expect(PAGE).toMatch(/import \{ ParetoMarker, computeParetoCumulative \} from "@\/components\/shared\/pareto-marker"/);
  });

  it("computes cumulative from the existing sorted (profit-DESC) list — no separate sort", () => {
    expect(PAGE).toMatch(/computeParetoCumulative\(\s*sorted\.map\(\(p\) => p\.profit\),\s*80,?\s*\)/);
  });

  it("renders ParetoMarker per row using the cumulativePcts array indexed by row position", () => {
    expect(PAGE).toMatch(/<ParetoMarker[\s\S]{0,300}cumulativePct=\{cumulativePcts\[idx\] \?\? 0\}/);
  });

  it("crown appears only on the threshold row (drift alarm — derived from helper, not handcoded)", () => {
    expect(PAGE).toMatch(/isThresholdRow=\{idx === thresholdIdx\}/);
  });

  it("testid is scoped per-vehicle for screenshot regression — uses vehicle id as suffix", () => {
    expect(PAGE).toMatch(/testidPrefix=\{`vehicle-portfolio-pareto-\$\{p\.id\}`\}/);
  });

  it("table head adds the 'حصة تراكمية' column and tfoot colSpan compensates for the extra cell", () => {
    expect(PAGE).toMatch(/<th[\s\S]{0,200}حصة تراكمية/);
    // The tfoot was colSpan={3} for the rank/vehicle/driver group + 4
    // metric cells + 1 (empty) Link cell = 8 columns total before this
    // PR. After adding the Pareto column the trailing empty colSpan
    // must be 2 (Pareto + Link) so the totals row stays aligned.
    expect(PAGE).toMatch(/<td colSpan=\{2\}><\/td>/);
  });
});
