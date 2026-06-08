import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pareto (80-20) marker for the two ranking pages. Pure-frontend
 * computation: takes the sorted metric values, computes a cumulative
 * percentage per row, and marks the first row that crosses the
 * threshold (default 80%). Operator sees "top X% of customers drive
 * Y% of revenue" without leaving the ranking screen.
 */

const COMPONENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/pareto-marker.tsx"),
  "utf8",
);
const ENTITY_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-ranking.tsx"),
  "utf8",
);
const CC_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-ranking.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Component + helper
// ─────────────────────────────────────────────────────────────────────────────
describe("ParetoMarker + computeParetoCumulative", () => {
  it("exports both the helper and the presentational component", () => {
    expect(COMPONENT).toMatch(/export function ParetoMarker/);
    expect(COMPONENT).toMatch(/export function computeParetoCumulative/);
    expect(COMPONENT).toMatch(/export interface ParetoMarkerProps/);
  });

  it("helper uses |value| for the running sum (sign-agnostic for net metrics that can be negative)", () => {
    // Without Math.abs a negative outlier would make the cumulative
    // percentage wonky (could go negative or exceed 100).
    expect(COMPONENT).toMatch(/values\.reduce\(\(s, v\) => s \+ Math\.abs\(v\), 0\)/);
    expect(COMPONENT).toMatch(/running \+= Math\.abs\(values\[i\]\)/);
  });

  it("helper returns thresholdIdx=-1 when total is 0 (defensive)", () => {
    expect(COMPONENT).toMatch(/if \(total === 0\) \{/);
    expect(COMPONENT).toMatch(/thresholdIdx: -1/);
  });

  it("thresholdIdx is the FIRST row that crosses the threshold (not the last)", () => {
    // Pinned because "find the threshold" can be ambiguous.
    expect(COMPONENT).toMatch(/if \(thresholdIdx === -1 && pct >= threshold\) \{\s*thresholdIdx = i;/);
  });

  it("default threshold is 80 (classic Pareto)", () => {
    expect(COMPONENT).toMatch(/threshold = 80/);
  });

  it("badge variant flips by side of the threshold (head=secondary, tail=outline)", () => {
    expect(COMPONENT).toMatch(/const isTail = cumulativePct > threshold/);
    expect(COMPONENT).toMatch(/const toneVariant = isTail \? "outline" : "secondary"/);
  });

  it("Crown icon shows ONLY on the threshold row (the operator's 'you're here' line)", () => {
    expect(COMPONENT).toMatch(/\{isThresholdRow && \(\s*<Crown/);
  });

  it("displays the cumulative pct with 1-decimal precision in the badge", () => {
    expect(COMPONENT).toMatch(/pct\.toFixed\(1\)/);
  });

  it("clamps pct to [0, 100] before display (defensive against rounding errors)", () => {
    expect(COMPONENT).toMatch(/Math\.min\(100, Math\.max\(0,/);
  });

  it("stable testid + data attributes for screenshot regression", () => {
    expect(COMPONENT).toMatch(/data-testid=\{`\$\{testidPrefix\}-marker`\}/);
    expect(COMPONENT).toMatch(/data-cumulative-pct=\{pct\.toFixed\(1\)\}/);
    expect(COMPONENT).toMatch(/data-is-threshold=\{isThresholdRow \? "true" : undefined\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring on the entity-ranking page
// ─────────────────────────────────────────────────────────────────────────────
describe("entity-ranking page — Pareto wired through the chosen metric", () => {
  it("imports the marker + helper", () => {
    expect(ENTITY_PAGE).toMatch(/import \{ ParetoMarker, computeParetoCumulative \} from "@\/components\/shared\/pareto-marker"/);
  });

  it("passes the current metric down to the RankingTable", () => {
    expect(ENTITY_PAGE).toMatch(/<RankingTable rows=\{data\.rows\} entityType=\{entityType\} metric=\{metric\} \/>/);
  });

  it("metric switch picks the right value (revenue / expense / net / entries)", () => {
    // The switch is duplicated on the CC page — drift alarm: keep them
    // in sync. Pinned so a refactor that drops a case fails tests.
    expect(ENTITY_PAGE).toMatch(/case "revenue": return r\.revenue/);
    expect(ENTITY_PAGE).toMatch(/case "expense": return r\.expense/);
    expect(ENTITY_PAGE).toMatch(/case "net":     return r\.net/);
    expect(ENTITY_PAGE).toMatch(/case "entries": return r\.entries/);
  });

  it("renders the ParetoMarker on each row with a per-row testid prefix", () => {
    expect(ENTITY_PAGE).toMatch(/<ParetoMarker[\s\S]{1,400}testidPrefix=\{`entity-ranking-pareto-\$\{r\.entityId\}`\}/);
  });

  it("threshold row gets an amber background highlight (subtle visual)", () => {
    expect(ENTITY_PAGE).toMatch(/\$\{isThresholdRow \? "bg-amber-50 dark:bg-amber-950\/20" : ""\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring on the CC ranking page
// ─────────────────────────────────────────────────────────────────────────────
describe("cc-ranking page — Pareto wired through the chosen metric", () => {
  it("imports the marker + helper", () => {
    expect(CC_PAGE).toMatch(/import \{ ParetoMarker, computeParetoCumulative \} from "@\/components\/shared\/pareto-marker"/);
  });

  it("passes the current metric down to the RankingList", () => {
    expect(CC_PAGE).toMatch(/<RankingList rows=\{data\.rows\} metric=\{metric\} \/>/);
  });

  it("metric switch matches the entity page exactly (4 cases)", () => {
    expect(CC_PAGE).toMatch(/case "revenue": return r\.revenue/);
    expect(CC_PAGE).toMatch(/case "expense": return r\.expense/);
    expect(CC_PAGE).toMatch(/case "net":     return r\.net/);
    expect(CC_PAGE).toMatch(/case "entries": return r\.entries/);
  });

  it("renders the ParetoMarker per row with a CC-id-keyed testid prefix", () => {
    expect(CC_PAGE).toMatch(/<ParetoMarker[\s\S]{1,400}testidPrefix=\{`cc-ranking-pareto-\$\{r\.ccId\}`\}/);
  });

  it("threshold row highlight uses the same amber tones (visual consistency)", () => {
    expect(CC_PAGE).toMatch(/\$\{isThresholdRow \? "bg-amber-50 dark:bg-amber-950\/20" : ""\}/);
  });
});
