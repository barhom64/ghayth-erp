import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Round 2 of the deep dimensional integration:
 *   1. Source-context header inference — clientId / vendorId /
 *      umrahAgentId / umrahSeasonId / employeeId / vehicleId / driverId
 *      / contractId / projectId auto-propagated to every line based on
 *      the JE's sourceType + sourceId, with a single round-trip per JE
 *      (not per line).
 *   2. Per-CC P&L drill — GET /finance/cost-centers/:id/pnl returns
 *      self + rolled (descendants-included) revenue / expense / net
 *      with date range + recent JEs for the drill list.
 *   3. The visual P&L drill page at /finance/cost-centers/:id/pnl with
 *      two bucket cards and an entries list, surfaced via the tree
 *      page's per-row BarChart3 button.
 */

const ENRICHER = readFileSync(
  join(import.meta.dirname!, "../../src/lib/journalLineDimensionalEnricher.ts"),
  "utf8",
);
const BH = readFileSync(
  join(import.meta.dirname!, "../../src/lib/businessHelpers.ts"),
  "utf8",
);
const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const TREE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-centers-tree.tsx"),
  "utf8",
);
const DRILL_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-drill-pnl.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Source-context inference
// ─────────────────────────────────────────────────────────────────────────────
describe("inferHeaderDimensionsFromSource — sourceType → propagation bag", () => {
  it("exports the header-inference function + bag type", () => {
    expect(ENRICHER).toMatch(/export interface InferredHeaderDims/);
    expect(ENRICHER).toMatch(/export async function inferHeaderDimensionsFromSource/);
  });

  it("returns {} early when sourceType/sourceId are missing or non-positive", () => {
    expect(ENRICHER).toMatch(/if \(!sourceType \|\| !sourceId \|\| sourceId <= 0\) return \{\};/);
  });

  it("wraps the switch in try/catch — JE post never fails because the source row was deleted mid-flight", () => {
    expect(ENRICHER).toMatch(/try \{\s*switch \(sourceType\) \{/);
    expect(ENRICHER).toMatch(/\} catch \{\s*return empty;\s*\}/);
  });

  it("handles 'invoice' (singular — matches the actual routes/finance-invoices.ts string)", () => {
    expect(ENRICHER).toMatch(/case "invoice":/);
    expect(ENRICHER).toMatch(/FROM invoices/);
    expect(ENRICHER).toMatch(/clientId: rows\[0\]\.clientId/);
  });

  it("'umrah_sales_invoices' joins through umrah_sub_agents to lift agentId (not subAgentId)", () => {
    // journal_lines has umrahAgentId, not umrahSubAgentId — the
    // sub-agent dim lives on subsidiary_accounts only.
    expect(ENRICHER).toMatch(/case "umrah_sales_invoices":/);
    expect(ENRICHER).toMatch(/LEFT JOIN umrah_sub_agents sa[\s\S]{0,200}sa\."companyId" = inv\."companyId"/);
    expect(ENRICHER).toMatch(/umrahAgentId: rows\[0\]\.agentId/);
    expect(ENRICHER).toMatch(/umrahSeasonId: rows\[0\]\.seasonId/);
  });

  it("'umrah_payments' also lifts the parent agent via the sub_agent join", () => {
    expect(ENRICHER).toMatch(/case "umrah_payments":/);
    expect(ENRICHER).toMatch(/FROM umrah_payments pay/);
  });

  it("'expense' (singular) lifts employeeId only — expenses table has no vendorId/projectId column", () => {
    expect(ENRICHER).toMatch(/case "expense":/);
    expect(ENRICHER).toMatch(/SELECT "employeeId" FROM expenses/);
  });

  it("'fleet_maintenance' lifts both vehicleId + driverId from the same row", () => {
    expect(ENRICHER).toMatch(/case "fleet_maintenance":/);
    expect(ENRICHER).toMatch(/SELECT "vehicleId", "driverId" FROM fleet_maintenance/);
  });

  it("sourceType where the id IS the entity id — no SELECT needed (legal_contracts, projects, fleet_*)", () => {
    expect(ENRICHER).toMatch(/case "legal_contracts":\s*return \{ contractId: sourceId \}/);
    expect(ENRICHER).toMatch(/case "projects":\s*return \{ projectId: sourceId \}/);
    expect(ENRICHER).toMatch(/case "fleet_vehicles":\s*return \{ vehicleId: sourceId \}/);
    expect(ENRICHER).toMatch(/case "fleet_drivers":\s*return \{ driverId: sourceId \}/);
  });

  it("applyHeaderDimensionsToLines NEVER overrides explicit operator values (audit-safe)", () => {
    // Each conditional is `line.X == null && dims.X != null` — symmetric.
    const guards = ENRICHER.match(/== null && dims\./g);
    expect(guards?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("source-row queries gate on companyId — defence in depth against cross-tenant inference", () => {
    const tenantGuards = ENRICHER.match(/"companyId" = \$2/g);
    expect(tenantGuards?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. createJournalEntry wires the inference BEFORE the CC enrichment
// ─────────────────────────────────────────────────────────────────────────────
describe("createJournalEntry — source inference runs BEFORE per-line CC resolution", () => {
  it("imports both helpers from the enricher module", () => {
    expect(BH).toMatch(/import \{ enrichJournalLines, inferHeaderDimensionsFromSource, applyHeaderDimensionsToLines \} from "\.\/journalLineDimensionalEnricher\.js"/);
  });

  it("calls inferHeaderDimensionsFromSource with companyId + sourceType + sourceId", () => {
    expect(BH).toMatch(/await inferHeaderDimensionsFromSource\(\s*client, params\.companyId, params\.sourceType \?\? null, params\.sourceId \?\? null,\s*\)/);
  });

  it("applies the bag to lines BEFORE the CC enrichment (order matters — CC reads from filled dims)", () => {
    // The two calls must appear in this exact order. Without it, the
    // CC resolver would run on lines with NULL projectId/etc and
    // miss the per-source propagation.
    const inferIdx = BH.indexOf("await inferHeaderDimensionsFromSource");
    const applyIdx = BH.indexOf("applyHeaderDimensionsToLines(params.lines");
    const enrichIdx = BH.indexOf("await enrichJournalLines(client, params.lines");
    expect(inferIdx).toBeGreaterThan(0);
    expect(applyIdx).toBeGreaterThan(inferIdx);
    expect(enrichIdx).toBeGreaterThan(applyIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /finance/cost-centers/:id/pnl
// ─────────────────────────────────────────────────────────────────────────────
const PNL = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/:id\/pnl"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/cost-centers/:id/pnl handler not found");
  return m[0];
})();

describe("GET /finance/cost-centers/:id/pnl — per-CC drill with descendant rollup", () => {
  it("registers under feature: finance.cost_centers, action: view", () => {
    expect(PNL).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"view"\s*\}\)/);
  });

  it("404s when the CC doesn't exist in the tenant (defence)", () => {
    expect(PNL).toMatch(/throw new NotFoundError\("مركز التكلفة غير موجود"\)/);
  });

  it("uses a recursive CTE to gather descendant ids in one round-trip", () => {
    expect(PNL).toMatch(/WITH RECURSIVE tree AS/);
    expect(PNL).toMatch(/JOIN tree t ON t\.id = cc\."parentId"/);
  });

  it("computes BOTH self (only this CC) AND rolled (descendants-included) buckets in ONE aggregate query", () => {
    expect(PNL).toMatch(/AS "selfRevenue"/);
    expect(PNL).toMatch(/AS "selfExpense"/);
    expect(PNL).toMatch(/AS "rolledRevenue"/);
    expect(PNL).toMatch(/AS "rolledExpense"/);
  });

  it("revenue = sum(credit - debit) on credit-natured accounts (chart_of_accounts.type='revenue')", () => {
    // The aggregate uses `jl.credit - jl.debit` for revenue. Pinning
    // the column-qualified form so a column-rename refactor catches
    // this in tests, not in QA.
    expect(PNL).toMatch(/ca\.type = 'revenue'[\s\S]{0,300}jl\.credit - jl\.debit/);
  });

  it("expense = sum(debit - credit) on debit-natured accounts (expense OR cost_of_sales)", () => {
    expect(PNL).toMatch(/ca\.type IN \('expense','cost_of_sales'\)[\s\S]{0,300}jl\.debit - jl\.credit/);
  });

  it("tenant-safe — the LEFT JOIN to chart_of_accounts is gated on companyId", () => {
    expect(PNL).toMatch(/ca\."companyId" = je\."companyId"/);
  });

  it("entries count uses COUNT(DISTINCT je.id) FILTER — avoids double-counting multi-line JEs", () => {
    expect(PNL).toMatch(/COUNT\(DISTINCT je\.id\) FILTER \(WHERE jl\."costCenterId" = \$1\)::int AS "selfEntries"/);
    expect(PNL).toMatch(/COUNT\(DISTINCT je\.id\) FILTER \(WHERE jl\."costCenterId" = ANY\(\$3::int\[\]\)\)::int AS "rolledEntries"/);
  });

  it("recent entries sorted by date DESC + capped at 50 (operator drill list)", () => {
    expect(PNL).toMatch(/ORDER BY je\.date DESC, je\.id DESC\s+LIMIT 50/);
  });

  it("descendantCount = total - self (excludes the CC itself from the count)", () => {
    expect(PNL).toMatch(/descendantCount: allIds\.length - 1/);
  });

  it("default date range = current Riyadh calendar month (operator can override via query)", () => {
    expect(PNL).toMatch(/const from = dateFrom \|\| defaultFrom/);
    expect(PNL).toMatch(/const to = dateTo \|\| defaultTo/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. UI — tree page links to drill page + drill page consumes the endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe("Tree page — adds the per-CC P&L drill button to every row", () => {
  it("renders a Link to /finance/cost-centers/${id}/pnl on each row", () => {
    expect(TREE_PAGE).toMatch(/href=\{`\/finance\/cost-centers\/\$\{node\.id\}\/pnl`\}/);
  });

  it("uses the BarChart3 icon (visual signal for 'report')", () => {
    expect(TREE_PAGE).toContain("BarChart3");
  });

  it("button carries a stable testid for screenshot regression", () => {
    expect(TREE_PAGE).toContain('data-testid={`cost-centers-tree-pnl-${node.id}`}');
  });
});

describe("/finance/cost-centers/:id/pnl — drill page", () => {
  it("route registered in financeRoutes.tsx", () => {
    expect(ROUTES).toMatch(/CostCenterDrillPnl = lazy\(\(\) => import\("@\/pages\/finance\/cost-center-drill-pnl"\)\)/);
    expect(ROUTES).toMatch(/path: "\/finance\/cost-centers\/:id\/pnl", component: CostCenterDrillPnl/);
  });

  it("uses useRoute<{ id: string }> to extract the CC id from the path", () => {
    expect(DRILL_PAGE).toMatch(/useRoute<\{ id: string \}>\("\/finance\/cost-centers\/:id\/pnl"\)/);
  });

  it("renders BOTH bucket cards — self + rolled", () => {
    expect(DRILL_PAGE).toContain('"cost-center-pnl-self"');
    expect(DRILL_PAGE).toContain('"cost-center-pnl-rolled"');
  });

  it("recent-entries list is itself testable + each row links to /finance/journal/:jeId", () => {
    expect(DRILL_PAGE).toContain('"cost-center-pnl-entries-list"');
    expect(DRILL_PAGE).toMatch(/href=\{`\/finance\/journal\/\$\{e\.jeId\}`\}/);
  });

  it("'عرض الكل' link carries the date range + costCenterId in the URL (journal-list filter)", () => {
    expect(DRILL_PAGE).toMatch(/href=\{`\/finance\/journal\?costCenterId=\$\{id\}&dateFrom=\$\{from\}&dateTo=\$\{to\}`\}/);
  });

  it("date range defaults to current calendar month (matches the backend default)", () => {
    expect(DRILL_PAGE).toMatch(/function defaultRange\(\)/);
    expect(DRILL_PAGE).toMatch(/Date\.UTC\(d\.getUTCFullYear\(\), d\.getUTCMonth\(\), 1\)/);
  });

  it("net metric highlights — bold + tone flip success/warning based on sign", () => {
    expect(DRILL_PAGE).toMatch(/tone=\{positive \? "success" : "warning"\}/);
    expect(DRILL_PAGE).toMatch(/highlight/);
  });

  it("stable testids — date inputs + refresh + back-to-tree + bucket-level revenue/expense/net", () => {
    for (const id of [
      "cost-center-pnl-from",
      "cost-center-pnl-to",
      "cost-center-pnl-refresh",
      "cost-center-pnl-back",
      "cost-center-pnl-all-entries",
    ]) {
      expect(DRILL_PAGE).toContain(`testid="${id}"`);
    }
  });
});
