import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cost-centre ranking — mirror of the per-entity ranking but for CCs.
 * Answers "which CCs bled the most cash?" / "which projects margin
 * the highest?". Each row aggregates THIS CC + descendants via a
 * recursive CTE so the ranking reflects total responsibility.
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-ranking.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);
const TREE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-centers-tree.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────────────────────────────────────
const RANKING = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/ranking"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/cost-centers/ranking handler not found");
  return m[0];
})();

describe("GET /finance/cost-centers/ranking — top-N CCs", () => {
  it("registers under feature: finance.cost_centers, action: view", () => {
    expect(RANKING).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("metric is validated against a closed allowlist (revenue / expense / net / entries)", () => {
    expect(FCC).toMatch(/const CC_RANKING_METRICS = new Set\(\["revenue", "expense", "net", "entries"\]\)/);
    expect(RANKING).toMatch(/if \(!CC_RANKING_METRICS\.has\(metric\)\)/);
  });

  it("clamps limit to [5, 100] (cheap correlated rollups but still capped)", () => {
    expect(RANKING).toMatch(/Math\.max\(5, Math\.min\(100, Number\(q\.limit\) > 0 \? Number\(q\.limit\) : 20\)\)/);
  });

  it("ORDER BY column resolved from another closed allowlist (not user input)", () => {
    expect(RANKING).toMatch(/const orderCol: Record<string, string> = \{[\s\S]{0,400}revenue: "revenue",[\s\S]{0,200}expense: "expense",[\s\S]{0,200}net:     "net",[\s\S]{0,200}entries: "entries",/);
    expect(RANKING).toMatch(/ORDER BY \$\{orderCol\[metric\]\} \$\{direction\} NULLS LAST/);
  });

  it("default metric is 'expense' (the most common ranking — 'who bled?')", () => {
    expect(RANKING).toMatch(/const metric = String\(q\.metric \?\? "expense"\)/);
  });

  it("each row aggregates THIS CC + all descendants via a recursive CTE (one query)", () => {
    expect(RANKING).toMatch(/WITH RECURSIVE tree AS \(/);
    // The CTE produces (root_id, desc_id) pairs — root_id is the
    // CC being ranked, desc_id is any descendant whose JE lines
    // contribute to the rollup.
    expect(RANKING).toMatch(/SELECT id AS root_id, id AS desc_id/);
    expect(RANKING).toMatch(/JOIN tree t ON cc\."parentId" = t\.desc_id/);
    expect(RANKING).toMatch(/SELECT t\.root_id AS cc_id/);
  });

  it("LEFT JOIN on journal_lines/entries so CCs with no activity still rank (with 0)", () => {
    expect(RANKING).toMatch(/LEFT JOIN journal_lines jl ON jl\."costCenterId" = t\.desc_id/);
    expect(RANKING).toMatch(/LEFT JOIN journal_entries je\s+ON je\.id = jl\."journalId"/);
  });

  it("revenue/expense classification matches the per-entity ranking exactly", () => {
    expect(RANKING).toMatch(/ca\.type = 'revenue'[\s\S]{0,200}jl\.credit - jl\.debit/);
    expect(RANKING).toMatch(/ca\.type IN \('expense','cost_of_sales'\)[\s\S]{0,200}jl\.debit - jl\.credit/);
  });

  it("supports an optional rootId param to scope the ranking to a subtree", () => {
    // "What are the top projects under THIS branch's CC?" — the
    // rootId narrows the recursive seed. Pinned because it's
    // injected via string interpolation (after a Number() guard)
    // so the test catches if a refactor weakens the guard.
    expect(RANKING).toMatch(/const rootId = q\.rootId && Number\(q\.rootId\) > 0 \? Number\(q\.rootId\) : null/);
    expect(RANKING).toMatch(/\$\{rootId \? `AND id = \$\{rootId\}` : ""\}/);
  });

  it("tenant-safe — the recursive CTE + every JE/CC filter gate on companyId", () => {
    const gates = RANKING.match(/"companyId" = \$1/g);
    expect(gates?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("response shape — metric + direction + dateFrom + dateTo + limit + rootId + rows", () => {
    expect(RANKING).toMatch(/res\.json\(\{[\s\S]{0,400}metric,[\s\S]{0,200}direction: direction\.toLowerCase\(\),[\s\S]{0,200}dateFrom: from,[\s\S]{0,200}dateTo: to,[\s\S]{0,200}limit,[\s\S]{0,200}rootId,[\s\S]{0,200}rows:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/cost-centers/ranking page", () => {
  it("route registered in financeRoutes.tsx", () => {
    expect(ROUTES).toMatch(/CostCenterRanking = lazy\(\(\) => import\("@\/pages\/finance\/cost-center-ranking"\)\)/);
    expect(ROUTES).toMatch(/path: "\/finance\/cost-centers\/ranking", component: CostCenterRanking/);
  });

  it("linked from the CC tree page actions bar", () => {
    expect(TREE_PAGE).toContain(`"/finance/cost-centers/ranking"`);
    expect(TREE_PAGE).toContain('data-testid="cost-centers-tree-ranking-link"');
  });

  it("default metric is 'expense' (matches backend default)", () => {
    expect(PAGE).toMatch(/const \[metric, setMetric\] = useState<string>\("expense"\)/);
  });

  it("renders all 4 metrics + 2 directions", () => {
    for (const m of ["revenue", "expense", "net", "entries"]) {
      expect(PAGE).toMatch(new RegExp(`value: "${m}"`));
    }
    expect(PAGE).toContain("الأعلى أولاً");
    expect(PAGE).toContain("الأدنى أولاً");
  });

  it("uses the shared DateRangePresets component", () => {
    expect(PAGE).toMatch(/import \{ DateRangePresets \}/);
    expect(PAGE).toContain('testidPrefix="cc-ranking-preset"');
  });

  it("each row deep-links to /finance/cost-centers/:id/pnl (drill from rank → P&L)", () => {
    expect(PAGE).toMatch(/href=\{`\/finance\/cost-centers\/\$\{r\.ccId\}\/pnl`\}/);
  });

  it("limit input clamps [5, 100] client-side (defence + UX)", () => {
    expect(PAGE).toMatch(/Math\.max\(5, Math\.min\(100, v\)\)/);
  });

  it("CSV export uses entityType='report_cc_ranking' on the unified-export helper", () => {
    expect(PAGE).toMatch(/import \{ exportRowsToCsv \}/);
    expect(PAGE).toMatch(/entityType: "report_cc_ranking"/);
  });

  it("CSV columns include rank + ccId + ccCode + ccName + revenue + expense + net + entries", () => {
    for (const k of ["rank", "ccId", "ccCode", "ccName", "revenue", "expense", "net", "entries"]) {
      expect(PAGE).toContain(`key: "${k}"`);
    }
  });

  it("net sign flips success/warning tone on each row (visible bleeding signal)", () => {
    expect(PAGE).toMatch(/netPositive \? "text-status-success-foreground" : "text-status-warning-foreground"/);
  });

  it("stable testids — filters + list + per-row + CSV + back-to-tree", () => {
    for (const id of [
      "cc-ranking-metric",
      "cc-ranking-direction",
      "cc-ranking-from",
      "cc-ranking-to",
      "cc-ranking-limit",
      "cc-ranking-list",
      "cc-ranking-export-csv",
      "cc-ranking-tree",
    ]) {
      expect(PAGE).toContain(`data-testid="${id}"`);
    }
    expect(PAGE).toContain("data-testid={`cc-ranking-row-${r.ccId}`}");
  });
});
