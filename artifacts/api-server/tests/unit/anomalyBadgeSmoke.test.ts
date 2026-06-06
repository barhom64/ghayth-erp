import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-row anomaly badge — surfaces YoY shifts inline on the two
 * ranking pages. Backend extended with an `includePrior` query
 * param that returns each row's prior-year same-period bucket
 * alongside the current. The badge is a noise filter: only shows
 * when |% change| ≥ a threshold (default 25%).
 */

const COMPONENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/anomaly-badge.tsx"),
  "utf8",
);
const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
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
// Component
// ─────────────────────────────────────────────────────────────────────────────
describe("AnomalyBadge — presentational + noise filter", () => {
  it("HIGHER_IS_BETTER table flips for 'expense' so rising cost renders as deterioration", () => {
    expect(COMPONENT).toMatch(/revenue: true/);
    expect(COMPONENT).toMatch(/expense: false/);
    expect(COMPONENT).toMatch(/net:     true/);
    expect(COMPONENT).toMatch(/entries: true/);
  });

  it("returns null when prior is null (entity didn't exist last year)", () => {
    expect(COMPONENT).toMatch(/if \(prior == null\) return null;/);
  });

  it("returns null when current AND prior are both 0 (no signal to surface)", () => {
    expect(COMPONENT).toMatch(/if \(current === 0 && prior === 0\) return null;/);
  });

  it("special-cases prior=0 / current>0 as 'جديد' (divide-by-zero would otherwise blow up)", () => {
    expect(COMPONENT).toMatch(/if \(prior === 0\) \{[\s\S]{0,500}جديد/);
  });

  it("pct uses |prior| as denominator (sign-agnostic — same convention as YoY card)", () => {
    expect(COMPONENT).toMatch(/\(\(current - prior\) \/ Math\.abs\(prior\)\) \* 100/);
  });

  it("threshold gate (default 25%) — small moves stay quiet, big shifts surface", () => {
    expect(COMPONENT).toMatch(/threshold = 25/);
    expect(COMPONENT).toMatch(/if \(absPct < threshold\) return null;/);
  });

  it("tone class follows direction-aware improvement vs deterioration logic", () => {
    expect(COMPONENT).toMatch(/const isImprovement = higherIsBetter \? pctChange > 0 : pctChange < 0/);
    expect(COMPONENT).toMatch(/text-status-success-foreground/);
    expect(COMPONENT).toMatch(/text-status-warning-foreground/);
  });

  it("title attribute surfaces both raw values on hover (a11y + tooltip)", () => {
    expect(COMPONENT).toMatch(/title=\{`السابق: \$\{prior\.toLocaleString\("ar-SA"\)\} · الحالي: \$\{current\.toLocaleString\("ar-SA"\)\}`\}/);
  });

  it("stable testid + data-direction attribute for screenshot regression", () => {
    expect(COMPONENT).toMatch(/data-testid=\{`\$\{testidPrefix\}-badge`\}/);
    expect(COMPONENT).toMatch(/data-direction=\{isImprovement \? "improvement" : "deterioration"\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint extensions — entity-ranking + cc-ranking both gain includePrior
// ─────────────────────────────────────────────────────────────────────────────
const ENTITY_RANKING = (() => {
  const m = FCC.match(/router\.get\("\/entity-ranking"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/entity-ranking handler not found");
  return m[0];
})();
const CC_RANKING = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/ranking"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/cost-centers/ranking handler not found");
  return m[0];
})();

describe("entity-ranking — includePrior=true returns a prior bucket per row", () => {
  it("triggers ONLY when includePrior=true AND rows is non-empty (no wasted query)", () => {
    expect(ENTITY_RANKING).toMatch(/if \(q\.includePrior === "true" && rows\.length > 0\) \{/);
  });

  it("shifts the calendar window back by 1 year (preserves Q1/Q2/.. boundary semantics)", () => {
    expect(ENTITY_RANKING).toMatch(/const shiftYear = \(iso: string\): string =>/);
    expect(ENTITY_RANKING).toMatch(/return `\$\{Number\(yStr\) - 1\}-\$\{m\}-\$\{d\}`/);
  });

  it("prior query uses ANY(\\$::int[]) over the top-N ids — one query, no N+1", () => {
    expect(ENTITY_RANKING).toMatch(/AND jl\.\$\{column\} = ANY\(\$4::int\[\]\)/);
  });

  it("emits priorByEntity → row.prior on each response row (or null when absent)", () => {
    expect(ENTITY_RANKING).toMatch(/const priorByEntity = new Map\(priorRows\.map\(\(p\) => \[p\.entityId, p\]\)\)/);
    expect(ENTITY_RANKING).toMatch(/const prior = priorByEntity\.get\(r\.entityId\) \?\? null/);
  });

  it("response carries includePrior flag for the frontend to read", () => {
    expect(ENTITY_RANKING).toMatch(/includePrior: q\.includePrior === "true"/);
  });
});

describe("cc-ranking — includePrior=true via recursive-CTE prior aggregate", () => {
  it("triggers ONLY when includePrior=true AND rows is non-empty", () => {
    expect(CC_RANKING).toMatch(/if \(q\.includePrior === "true" && rows\.length > 0\) \{/);
  });

  it("prior query uses the SAME recursive-CTE shape as the current query (consistent rollup)", () => {
    // Each CC's prior bucket rolls up across the SAME descendant subtree
    // as the current bucket — drift alarm: a different shape would
    // produce per-row apples-vs-oranges comparisons.
    expect(CC_RANKING).toMatch(/WITH RECURSIVE tree AS \(/);
    expect(CC_RANKING).toMatch(/AND id = ANY\(\$4::int\[\]\)/);
  });

  it("prior aggregate uses LEFT JOIN on JE so a CC with no prior activity returns 0 (not absent)", () => {
    expect(CC_RANKING).toMatch(/LEFT JOIN journal_lines jl ON jl\."costCenterId" = t\.desc_id/);
  });

  it("emits priorByCc → row.prior + includePrior flag (mirrors entity-ranking response)", () => {
    expect(CC_RANKING).toMatch(/const priorByCc = new Map\(priorRows\.map\(\(p\) => \[p\.ccId, p\]\)\)/);
    expect(CC_RANKING).toMatch(/includePrior: q\.includePrior === "true"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page wirings
// ─────────────────────────────────────────────────────────────────────────────
describe("entity-ranking page — anomaly toggle + badge per row", () => {
  it("imports the badge", () => {
    expect(ENTITY_PAGE).toMatch(/import \{ AnomalyBadge \} from "@\/components\/shared\/anomaly-badge"/);
  });

  it("toggle wires includePrior into the query string (only when on)", () => {
    expect(ENTITY_PAGE).toMatch(/\.\.\.\(includePrior \? \{ includePrior: "true" \} : \{\}\)/);
    expect(ENTITY_PAGE).toContain('data-testid="entity-ranking-include-prior-toggle"');
  });

  it("query key includes includePrior so React Query refetches on toggle", () => {
    expect(ENTITY_PAGE).toMatch(/\["entity-ranking",[\s\S]{0,200}String\(includePrior\)\]/);
  });

  it("renders AnomalyBadge per row with metric-aware comparison", () => {
    // Compares CURRENT row's metric value to PRIOR row's metric value
    // — uses metricValue helper to pick the right field based on the
    // ranked metric.
    expect(ENTITY_PAGE).toMatch(/<AnomalyBadge[\s\S]{0,300}current=\{metricValue\(r, metric\)\}[\s\S]{0,300}prior=\{r\.prior \? metricValue\(r\.prior, metric\) : null\}/);
  });

  it("metricValue helper resolves the 4 cases", () => {
    expect(ENTITY_PAGE).toMatch(/function metricValue\([\s\S]{0,400}case "revenue": return row\.revenue[\s\S]{0,200}case "expense": return row\.expense[\s\S]{0,200}case "net":     return row\.net[\s\S]{0,200}case "entries": return row\.entries/);
  });
});

describe("cc-ranking page — anomaly toggle + badge per row", () => {
  it("imports the badge", () => {
    expect(CC_PAGE).toMatch(/import \{ AnomalyBadge \} from "@\/components\/shared\/anomaly-badge"/);
  });

  it("toggle wires includePrior into the query string + testid scaffolding", () => {
    expect(CC_PAGE).toMatch(/\.\.\.\(includePrior \? \{ includePrior: "true" \} : \{\}\)/);
    expect(CC_PAGE).toContain('data-testid="cc-ranking-include-prior-toggle"');
  });

  it("query key includes includePrior so React Query refetches on toggle", () => {
    expect(CC_PAGE).toMatch(/\["cc-ranking",[\s\S]{0,200}String\(includePrior\)\]/);
  });

  it("renders AnomalyBadge per row + metricValue helper mirrors the entity page", () => {
    expect(CC_PAGE).toMatch(/<AnomalyBadge[\s\S]{0,300}current=\{metricValue\(r, metric\)\}/);
    expect(CC_PAGE).toMatch(/function metricValue\([\s\S]{0,400}case "revenue": return row\.revenue/);
  });
});
