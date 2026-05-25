import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Negative-stock outliers — companion to the inventory valuation
// report (#1033). Verifies that GET /reports/negative-stock:
//   1. lists every lot where quantity < 0 (the "should never happen"
//      data-integrity outliers),
//   2. joins LATERAL warehouse_movements for the latest movement +
//      JE id so ops can drill into what last touched the lot,
//   3. exposes filters (warehouseId, productId, branch),
//   4. rolls up per-warehouse deficit value for triage,
//   5. is read-only.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/negative-stock"');
const HANDLER = ROUTE.slice(START);

describe("/reports/negative-stock endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/negative-stock"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("negative-stock query lists lot.quantity < 0", () => {
  it("WHERE pins l.quantity < 0", () => {
    expect(HANDLER).toMatch(/l\.quantity < 0/);
  });
  it("excludes soft-deleted lots", () => {
    expect(HANDLER).toMatch(/l\."deletedAt" IS NULL/);
  });
  it("joins warehouses + warehouse_products for the label context", () => {
    expect(HANDLER).toMatch(/LEFT JOIN warehouses w/);
    expect(HANDLER).toMatch(/LEFT JOIN warehouse_products p/);
  });
  it("LATERAL join surfaces the latest movement + its JE id", () => {
    expect(HANDLER).toMatch(/LEFT JOIN LATERAL/);
    expect(HANDLER).toMatch(/m\."journalEntryId"/);
    expect(HANDLER).toMatch(/ORDER BY m\."createdAt" DESC/);
    expect(HANDLER).toMatch(/LIMIT 1/);
  });
  it("computes deficitValue = ABS(quantity) × unitCost", () => {
    expect(HANDLER).toMatch(/ABS\(l\.quantity\) \* l\."unitCost"/);
  });
});

describe("negative-stock report exposes filters", () => {
  for (const f of ["warehouseId", "productId"]) {
    it(`accepts ${f} query parameter`, () => {
      expect(HANDLER).toContain(`${f}`);
    });
  }
  it("branch scope honoured against the warehouse (alias 'w')", () => {
    expect(HANDLER).toMatch(/getBranchCondition\(scope, undefined, params, "w"\)/);
  });
});

describe("negative-stock report rollups", () => {
  it("byWarehouse rollup keyed on warehouseId", () => {
    expect(HANDLER).toContain("byWarehouse");
    expect(HANDLER).toMatch(/byWarehouse\.set\(r\.warehouseId, w\)/);
  });
  it("summary exposes lotCount + totalDeficitValue", () => {
    expect(HANDLER).toMatch(/lotCount: rows\.length/);
    expect(HANDLER).toMatch(/totalDeficitValue: roundTo2\(totalDeficitValue\)/);
  });
  it("byWarehouse sorted DESC by deficitValue (biggest leaks first)", () => {
    expect(HANDLER).toMatch(/byWarehouse[\s\S]{0,300}\.sort\(\(a, b\) => b\.deficitValue - a\.deficitValue\)/);
  });
  it("data rows sorted ASC by quantity (most-negative first)", () => {
    expect(HANDLER).toMatch(/ORDER BY l\.quantity ASC/);
  });
});

describe("negative-stock report payload shape", () => {
  it("exposes filters + summary + byWarehouse + data", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toContain("byWarehouse:");
    expect(HANDLER).toContain("data: rows,");
  });
  it("response passed through maskFields", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
  it("LIMIT 1000 — outliers should never exceed this; if they do, bug is systemic", () => {
    expect(HANDLER).toMatch(/LIMIT 1000/);
  });
});

describe("negative-stock report is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
