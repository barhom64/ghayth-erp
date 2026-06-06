import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cumulative Pareto column on the customer-risk table. The page
 * already sorts customers by outstanding AR DESC and has a per-row
 * `shareOfTotal` column. This PR adds the cumulative complement +
 * an 80% crown.
 *
 * Operator answer: "these N customers carry 80% of total AR —
 * collect from THESE first; the long tail can wait."
 *
 * Uses the same shared computeParetoCumulative as the other 4
 * pages, so the math is identical and audited once.
 *
 * Lookup-by-name instead of by row index — the table is filtered
 * by riskBand, so the rendered row's position differs from the
 * full sorted-customers position. Mapping by `clientName` keeps
 * the cumulative correct under any filter.
 */

const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/customer-risk.tsx"),
  "utf8",
);

describe("customer-risk — cumulative Pareto column", () => {
  it("imports both presentation + math from the shared helper", () => {
    expect(PAGE).toMatch(/import \{ ParetoMarker, computeParetoCumulative \} from "@\/components\/shared\/pareto-marker"/);
  });

  it("computes cumulative on the full sorted customers list (BEFORE band filter)", () => {
    // Customers is the sorted unfiltered list; the table renders `filtered`.
    // Pareto must use `customers` so the math is the same across band filters.
    expect(PAGE).toMatch(/computeParetoCumulative\(\s*customers\.map\(\(c\) => c\.outstandingAmount\),\s*80\s*\)/);
  });

  it("builds a name→cumulative map so filtered-row lookups stay correct", () => {
    // Drift alarm: if anyone changes the lookup to `customers.indexOf(c)`,
    // the filtered table will index into the wrong slot.
    expect(PAGE).toMatch(/const cumulativeByName = new Map\(/);
    expect(PAGE).toMatch(/customers\.map\(\(c, i\) => \[c\.clientName,/);
  });

  it("new column key + Arabic header", () => {
    expect(PAGE).toMatch(/key: "_arPareto"/);
    expect(PAGE).toMatch(/header: "حصة تراكمية"/);
  });

  it("ParetoMarker reads the per-row entry from the map (not indexed lookup)", () => {
    expect(PAGE).toMatch(/cumulativeByName\.get\(c\.clientName\)/);
    expect(PAGE).toMatch(/cumulativePct=\{e\?\.pct \?\? 0\}/);
    expect(PAGE).toMatch(/isThresholdRow=\{e\?\.isThreshold \?\? false\}/);
  });

  it("per-customer testid scope so screenshot regression catches per-row drift", () => {
    expect(PAGE).toMatch(/testidPrefix=\{`customer-risk-pareto-\$\{c\.clientName\}`\}/);
  });

  it("Pareto column sits AFTER the existing per-row share column (visual coupling)", () => {
    const shareIdx = PAGE.indexOf('header: "% من الإجمالي"');
    const paretoIdx = PAGE.indexOf('header: "حصة تراكمية"');
    expect(shareIdx).toBeGreaterThan(0);
    expect(paretoIdx).toBeGreaterThan(shareIdx);
  });

  it("does NOT change the existing sort, filter, or share-column behaviour", () => {
    expect(PAGE).toMatch(/\.sort\(\(a, b\) => b\.outstandingAmount - a\.outstandingAmount\)/);
    expect(PAGE).toMatch(/bandFilter \? customers\.filter\(\(c\) => c\.riskBand === bandFilter\) : customers/);
    expect(PAGE).toMatch(/c\.shareOfTotal = totalOutstanding > 0/);
  });
});
