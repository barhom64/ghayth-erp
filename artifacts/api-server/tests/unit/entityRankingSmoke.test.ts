import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Entity ranking — top-N rollup across all entities of a given type
 * ordered by revenue / expense / net / entries. Companion to the
 * per-entity P&L drill (same 9-entityType allowlist).
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-ranking.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);
const HUB = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dimensional-routing.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Endpoint
// ─────────────────────────────────────────────────────────────────────────────
const RANKING = (() => {
  const m = FCC.match(/router\.get\("\/entity-ranking"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/entity-ranking handler not found");
  return m[0];
})();

describe("GET /finance/entity-ranking — top-N rollup", () => {
  it("registers under feature: finance.cost_centers, action: view", () => {
    expect(RANKING).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("reuses ENTITY_TYPE_TO_JL_COLUMN — same allowlist as the per-entity P&L drill", () => {
    // Single source of truth: changing one map without the other
    // breaks the smoke. The endpoint MUST look up the column from
    // the closed map (not from req.query).
    expect(RANKING).toMatch(/const column = ENTITY_TYPE_TO_JL_COLUMN\[entityType\]/);
  });

  it("metric is validated against a closed allowlist (revenue / expense / net / entries)", () => {
    expect(FCC).toMatch(/const RANKING_METRICS = new Set\(\["revenue", "expense", "net", "entries"\]\)/);
    expect(RANKING).toMatch(/if \(!RANKING_METRICS\.has\(metric\)\)/);
  });

  it("clamps limit [5, 100] — protects against expensive correlated name lookups", () => {
    expect(RANKING).toMatch(/Math\.max\(5, Math\.min\(100, Number\(q\.limit\) > 0 \? Number\(q\.limit\) : 20\)\)/);
  });

  it("direction: ASC for 'worst' rankings, DESC default for 'top'", () => {
    expect(RANKING).toMatch(/const direction = q\.direction === "asc" \? "ASC" : "DESC"/);
  });

  it("ORDER BY column resolved from another closed allowlist — never the path/query string directly", () => {
    expect(RANKING).toMatch(/const orderCol: Record<string, string> = \{[\s\S]{1,300}revenue: "revenue",[\s\S]{1,200}expense: "expense",[\s\S]{1,200}net:     "net",[\s\S]{1,200}entries: "entries",/);
    expect(RANKING).toMatch(/ORDER BY \$\{orderCol\[metric\]\} \$\{direction\} NULLS LAST/);
  });

  it("aggregates revenue + expense with the SAME chart_of_accounts.type classification as the P&L drill", () => {
    expect(RANKING).toMatch(/ca\.type = 'revenue'[\s\S]{0,200}jl\.credit - jl\.debit/);
    expect(RANKING).toMatch(/ca\.type IN \('expense','cost_of_sales'\)[\s\S]{0,200}jl\.debit - jl\.credit/);
  });

  it("GROUPs by the dimension column and FILTERs out null rows (untagged JE lines don't pollute the ranking)", () => {
    expect(RANKING).toMatch(/AND jl\.\$\{column\} IS NOT NULL/);
    expect(RANKING).toMatch(/GROUP BY jl\.\$\{column\}/);
  });

  it("name lookup is a CORRELATED subquery from ENTITY_TYPE_TO_NAME_LATERAL_SQL (one per top-N row)", () => {
    expect(FCC).toMatch(/const ENTITY_TYPE_TO_NAME_LATERAL_SQL: Record<string, string> = \{/);
    expect(RANKING).toMatch(/\(\$\{nameLateral\}\) AS "entityName"/);
  });

  it("tenant-safe — JE companyId + LATERAL name subqueries all gated on the scope", () => {
    expect(RANKING).toMatch(/je\."companyId" = \$1/);
    expect(RANKING).toMatch(/ca\."companyId" = je\."companyId"/);
  });

  it("default date range = all-time (1970 → 2099) — same convention as the drill", () => {
    expect(RANKING).toMatch(/const from = q\.dateFrom \|\| "1970-01-01"/);
    expect(RANKING).toMatch(/const to = q\.dateTo \|\| "2099-12-31"/);
  });

  it("response: entityType + metric + direction + dateFrom + dateTo + limit + rows", () => {
    expect(RANKING).toMatch(/res\.json\(\{[\s\S]{0,400}entityType,[\s\S]{0,200}metric,[\s\S]{0,200}direction: direction\.toLowerCase\(\),[\s\S]{0,200}dateFrom: from,[\s\S]{0,200}dateTo: to,[\s\S]{0,200}limit,[\s\S]{0,200}rows:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Page
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/entity-ranking page", () => {
  it("route registered in financeRoutes.tsx", () => {
    expect(ROUTES).toMatch(/EntityRanking = lazy\(\(\) => import\("@\/pages\/finance\/entity-ranking"\)\)/);
    expect(ROUTES).toMatch(/path: "\/finance\/entity-ranking", component: EntityRanking/);
  });

  it("linked from the dimensional-routing dashboard", () => {
    expect(HUB).toContain(`"/finance/entity-ranking"`);
    expect(HUB).toContain('data-testid="dim-routing-ranking-link"');
  });

  it("ENTITY_OPTIONS list covers all 9 routable entity types", () => {
    for (const t of [
      "client", "vendor", "employee", "vehicle", "driver",
      "project", "contract", "umrah_agent", "umrah_season",
    ]) {
      expect(PAGE).toMatch(new RegExp(`value:\\s*"${t}"`));
    }
  });

  it("METRIC_OPTIONS list covers revenue / expense / net / entries", () => {
    for (const m of ["revenue", "expense", "net", "entries"]) {
      expect(PAGE).toMatch(new RegExp(`value:\\s*"${m}"`));
    }
  });

  it("direction selector — top first (desc) vs bottom first (asc)", () => {
    expect(PAGE).toMatch(/setDirection.*"desc" \| "asc"/);
    expect(PAGE).toContain("الأعلى أولاً");
    expect(PAGE).toContain("الأدنى أولاً");
  });

  it("limit input clamps [5, 100] client-side (defence + UX)", () => {
    expect(PAGE).toMatch(/Math\.max\(5, Math\.min\(100, v\)\)/);
  });

  it("each row deep-links to /finance/entity-pnl/:entityType/:id (drill through)", () => {
    expect(PAGE).toMatch(/href=\{`\/finance\/entity-pnl\/\$\{entityType\}\/\$\{r\.entityId\}`\}/);
  });

  it("renders bar-chart-style metric bars sized by max in the result set", () => {
    expect(PAGE).toMatch(/const maxRevenue = Math\.max\(\.\.\.rows\.map\(\(r\) => r\.revenue\), 0\)/);
    expect(PAGE).toMatch(/const maxExpense = Math\.max\(\.\.\.rows\.map\(\(r\) => r\.expense\), 0\)/);
  });

  it("net sign flips success/warning + bold (highlight)", () => {
    expect(PAGE).toMatch(/netPositive \? "text-status-success-foreground" : "text-status-warning-foreground"/);
  });

  it("stable testids — type / metric / direction / from / to / limit / list / per-row", () => {
    for (const id of [
      "entity-ranking-type",
      "entity-ranking-metric",
      "entity-ranking-direction",
      "entity-ranking-from",
      "entity-ranking-to",
      "entity-ranking-limit",
      "entity-ranking-list",
    ]) {
      expect(PAGE).toContain(`data-testid="${id}"`);
    }
    expect(PAGE).toContain("data-testid={`entity-ranking-row-${r.entityId}`}");
  });
});
