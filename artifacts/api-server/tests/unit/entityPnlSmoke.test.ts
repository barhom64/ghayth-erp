import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-entity P&L — the natural payoff of journal-line dimensional
 * enrichment. Every JE post auto-fills the relevant entity FK on
 * each line; this endpoint reads those FKs directly to compute a
 * client/vendor/employee/vehicle/driver/project/contract/umrah_agent/
 * umrah_season P&L in one indexed query.
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-pnl.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Endpoint
// ─────────────────────────────────────────────────────────────────────────────
const PNL = (() => {
  const m = FCC.match(/router\.get\("\/entity-pnl\/:entityType\/:entityId"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/entity-pnl handler not found");
  return m[0];
})();

describe("GET /finance/entity-pnl/:entityType/:entityId — per-entity drill", () => {
  it("registers under feature: finance.cost_centers, action: view", () => {
    expect(PNL).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("supports all 9 routable entity types via a closed allowlist map", () => {
    // The map is the source of truth for which entity columns this
    // endpoint can drill on. Closed allowlist (no arbitrary entityType
    // → arbitrary column injection).
    for (const t of [
      "client", "vendor", "employee", "vehicle", "driver",
      "project", "contract", "umrah_agent", "umrah_season",
    ]) {
      expect(FCC).toMatch(new RegExp(`${t}:\\s+\`"[a-zA-Z]+Id"\``));
    }
  });

  it("rejects an unknown entityType with a clear ValidationError", () => {
    expect(PNL).toMatch(/throw new ValidationError\(`نوع الكيان غير مدعوم/);
  });

  it("looks up the entity name from the source table (defence + UI header)", () => {
    expect(PNL).toMatch(/const \[name\] = await rawQuery<\{ name: string \}>\(nameSql, \[entityId, scope\.companyId\]\)/);
    expect(PNL).toMatch(/throw new NotFoundError\("الكيان غير موجود"\)/);
  });

  it("defaults to all-time when no date range given (lifetime drill)", () => {
    expect(PNL).toMatch(/const from = dateFrom \|\| "1970-01-01"/);
    expect(PNL).toMatch(/const to = dateTo \|\| "2099-12-31"/);
  });

  it("revenue = sum(credit - debit) on credit-natured CoA rows", () => {
    expect(PNL).toMatch(/ca\.type = 'revenue'[\s\S]{0,200}jl\.credit - jl\.debit/);
  });

  it("expense = sum(debit - credit) on debit-natured CoA rows (expense OR cost_of_sales)", () => {
    expect(PNL).toMatch(/ca\.type IN \('expense','cost_of_sales'\)[\s\S]{0,200}jl\.debit - jl\.credit/);
  });

  it("tenant-safe — both join + filter gate on companyId", () => {
    expect(PNL).toMatch(/je\."companyId" = \$1/);
    expect(PNL).toMatch(/ca\."companyId" = je\."companyId"/);
  });

  it("dimensional column interpolation is SAFE — closed map, not user input", () => {
    // The column name comes from ENTITY_TYPE_TO_JL_COLUMN[entityType]
    // which is a closed allowlist. Pinned so a refactor can't switch
    // to a `req.query.column` shortcut.
    expect(PNL).toMatch(/const column = ENTITY_TYPE_TO_JL_COLUMN\[entityType\]/);
    expect(PNL).toMatch(/if \(!column \|\| !nameSql\)/);
  });

  it("recent entries: top 50 by date DESC, grouped by JE (no double-counting)", () => {
    expect(PNL).toMatch(/GROUP BY je\.id, je\.ref, je\.date, je\.description\s+ORDER BY je\.date DESC, je\.id DESC\s+LIMIT 50/);
  });

  it("response shape — entity + dateFrom + dateTo + bucket + recentEntries", () => {
    expect(PNL).toMatch(/res\.json\(\{[\s\S]{0,400}entity: \{ type: entityType, id: entityId, name: name\.name \}[\s\S]{0,400}bucket: \{ revenue, expense, net: revenue - expense, entries:[\s\S]{0,200}recentEntries:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. UI page
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/entity-pnl/:entityType/:entityId — visual drill", () => {
  it("route registered in financeRoutes.tsx", () => {
    expect(ROUTES).toMatch(/EntityPnl = lazy\(\(\) => import\("@\/pages\/finance\/entity-pnl"\)\)/);
    expect(ROUTES).toMatch(/path: "\/finance\/entity-pnl\/:entityType\/:entityId", component: EntityPnl/);
  });

  it("extracts entityType + entityId from the path via useRoute", () => {
    expect(PAGE).toMatch(/useRoute<\{ entityType: string; entityId: string \}>/);
    expect(PAGE).toMatch(/"\/finance\/entity-pnl\/:entityType\/:entityId"/);
  });

  it("renders ONE bucket card (this entity has no descendants — no rollup distinction)", () => {
    expect(PAGE).toContain('"entity-pnl-bucket"');
  });

  it("net metric flips success/warning by sign + bold for highlight", () => {
    expect(PAGE).toMatch(/tone=\{positive \? "success" : "warning"\}/);
    expect(PAGE).toContain("highlight");
  });

  it("recent-entries list links each row to /finance/journal/:jeId", () => {
    expect(PAGE).toContain('"entity-pnl-entries-list"');
    expect(PAGE).toMatch(/href=\{`\/finance\/journal\/\$\{e\.jeId\}`\}/);
  });

  it("'عرض الكل' link carries `${entityType}Id=${id}` so the journal list can filter", () => {
    expect(PAGE).toMatch(/href=\{`\/finance\/journal\?\$\{entityType\}Id=\$\{entityId\}/);
  });

  it("back-link map covers all 9 entity types", () => {
    for (const t of [
      "client", "vendor", "employee", "vehicle", "driver",
      "project", "contract", "umrah_agent", "umrah_season",
    ]) {
      expect(PAGE).toContain(`${t}:`);
    }
  });

  it("date range defaults to empty strings → all-time view (the operator's first question)", () => {
    expect(PAGE).toMatch(/const def = useMemo\(\(\) => \(\{ from: "", to: "" \}\), \[\]\)/);
  });

  it("stable testids — date inputs + refresh + per-entry + bucket metrics", () => {
    for (const id of [
      "entity-pnl-from",
      "entity-pnl-to",
      "entity-pnl-refresh",
      "entity-pnl-back",
      "entity-pnl-all-entries",
      "entity-pnl-revenue",
      "entity-pnl-expense",
      "entity-pnl-net",
    ]) {
      expect(PAGE).toContain(`testid="${id}"`);
    }
  });
});
