import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Inventory valuation report — audit follow-up to the COGS campaign.
// Verifies that GET /reports/inventory-valuation:
//   1. sums lot.quantity × lot.unitCost over ACTIVE qc-APPROVED lots
//      (the canonical on-hand book value — NOT
//      lastWaCost × currentStock which is denormalised),
//   2. supports warehouse / category / product / includeZeroStock filters,
//   3. exposes per-warehouse and per-category rollups + summary totals,
//   4. is read-only (no postJournalEntry / withTransaction / INSERT / UPDATE).

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/inventory-valuation"');
const HANDLER = ROUTE.slice(START);

describe("/reports/inventory-valuation endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/inventory-valuation"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("valuation report sums lot.quantity × lot.unitCost", () => {
  it("filters lots by status='active' AND qualityControlStatus='approved'", () => {
    expect(HANDLER).toMatch(/l\.status = 'active'/);
    expect(HANDLER).toMatch(/l\."qualityControlStatus" = 'approved'/);
  });
  it("excludes soft-deleted lots, warehouses, categories, products", () => {
    expect(HANDLER).toMatch(/l\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/w\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/cat\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/p\."deletedAt" IS NULL/);
  });
  it("filters products by status='active' (skips draft / archived)", () => {
    expect(HANDLER).toMatch(/COALESCE\(p\.status, 'active'\) = 'active'/);
  });
  it("valuation = SUM(quantity * unitCost) with COALESCE on null lots", () => {
    expect(HANDLER).toMatch(/SUM\(COALESCE\(l\.quantity, 0\) \* COALESCE\(l\."unitCost", 0\)\)/);
  });
  it("weightedAvgCost = SUM(qty*cost)/SUM(qty), guarded for divide-by-zero", () => {
    expect(HANDLER).toMatch(/CASE WHEN SUM\(COALESCE\(l\.quantity, 0\)\) > 0/);
  });
});

describe("valuation report exposes the right filters", () => {
  for (const f of ["warehouseId", "categoryId", "productId", "includeZeroStock"]) {
    it(`accepts ${f} query parameter`, () => {
      expect(HANDLER).toContain(`${f}`);
    });
  }
  it("zero-stock rows excluded unless includeZeroStock=true", () => {
    expect(HANDLER).toMatch(/includeZeroStock === "true" \? "" : `HAVING SUM\(COALESCE\(l\.quantity, 0\)\) > 0`/);
  });
  it("branch scope honoured against the warehouse (alias 'w')", () => {
    expect(HANDLER).toMatch(/getBranchCondition\(scope, undefined, params, "w"\)/);
  });
});

describe("valuation report rollups", () => {
  it("per-warehouse rollup keyed on warehouseId", () => {
    expect(HANDLER).toContain("byWarehouse");
    expect(HANDLER).toMatch(/byWarehouse\.set\(r\.warehouseId, w\)/);
  });
  it("per-category rollup keyed on categoryId (with _uncat fallback)", () => {
    expect(HANDLER).toContain("byCategory");
    expect(HANDLER).toMatch(/categoryId \?\? "_uncat"/);
  });
  it("summary totals valuation + onHandQty + lots + product-row count", () => {
    expect(HANDLER).toMatch(/totalValuation: roundTo2\(totalValuation\)/);
    expect(HANDLER).toMatch(/totalOnHandQty: roundTo2\(totalOnHandQty\)/);
    expect(HANDLER).toMatch(/totalLots,/);
    expect(HANDLER).toMatch(/productRows: rows\.length/);
  });
  it("rollups sorted DESC by valuation (biggest first)", () => {
    expect(HANDLER).toMatch(/byWarehouse[\s\S]{0,200}\.sort\(\(a, b\) => b\.valuation - a\.valuation\)/);
    expect(HANDLER).toMatch(/byCategory[\s\S]{0,200}\.sort\(\(a, b\) => b\.valuation - a\.valuation\)/);
  });
});

describe("valuation report payload shape", () => {
  it("exposes filters + summary + byWarehouse + byCategory + data", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toContain("byWarehouse:");
    expect(HANDLER).toContain("byCategory:");
    expect(HANDLER).toContain("data: rows.map");
  });
  it("response passed through maskFields (RBAC field policy)", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
  it("LIMIT 10000 on the detail rows (worst-case multi-warehouse SKU count)", () => {
    expect(HANDLER).toMatch(/LIMIT 10000/);
  });
});

describe("valuation report is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
