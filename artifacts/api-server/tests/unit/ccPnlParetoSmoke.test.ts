import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cumulative Pareto column on the cost-centre P&L comparison table.
 * The existing «% من الأرباح» column is a PER-ROW share — useful but
 * doesn't surface the 80-20 inflection. This PR adds a CUMULATIVE
 * column right next to it, with a Crown on the row that crosses
 * 80%. Operator answer: "if I had to focus on N centres, which?"
 *
 * Uses the same shared helper as entity-ranking / cc-ranking /
 * vehicle-portfolio so the math is identical across pages.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-pnl.tsx"),
  "utf8",
);

describe("cost-center-pnl — cumulative Pareto column", () => {
  it("imports both presentation + math from the shared helper", () => {
    expect(PAGE).toMatch(/import \{ ParetoMarker, computeParetoCumulative \} from "@\/components\/shared\/pareto-marker"/);
  });

  it("computes cumulative on the existing net-DESC rows (no separate sort)", () => {
    expect(PAGE).toMatch(/computeParetoCumulative\(\s*rows\.map\(\(r\) => r\.net\),\s*80,?\s*\)/);
  });

  it("the new column renders the ParetoMarker with cumulativePcts indexed by row position", () => {
    expect(PAGE).toMatch(/key: "_pareto"/);
    expect(PAGE).toMatch(/header: "حصة تراكمية"/);
    expect(PAGE).toMatch(/cumulativePct=\{cumulativePcts\[idx\] \?\? 0\}/);
  });

  it("crown derived from the helper's thresholdIdx (not hand-coded)", () => {
    expect(PAGE).toMatch(/isThresholdRow=\{idx === thresholdIdx\}/);
  });

  it("per-row testid scoped by index for screenshot regression", () => {
    expect(PAGE).toMatch(/testidPrefix=\{`cc-pnl-pareto-\$\{idx\}`\}/);
  });

  it("Pareto column lives BESIDE the existing per-row share column (visual coupling)", () => {
    // The share column header is «% من الأرباح»; the Pareto column header is
    // «حصة تراكمية». The share column's render must appear BEFORE the
    // Pareto block in the file (drift alarm if anyone separates them).
    const shareIdx = PAGE.indexOf('header: "% من الأرباح"');
    const paretoIdx = PAGE.indexOf('header: "حصة تراكمية"');
    expect(shareIdx).toBeGreaterThan(0);
    expect(paretoIdx).toBeGreaterThan(shareIdx);
  });

  it("the existing «الترتيب» rank badges (Crown for top, Frown for worst) are NOT removed", () => {
    // Pareto is additive, not a replacement for the existing rank UX.
    expect(PAGE).toMatch(/key: "_rank"/);
    expect(PAGE).toMatch(/الأعلى|الأسوأ/);
  });
});
