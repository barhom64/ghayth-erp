import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// WHT summary report — audit follow-up to #999 / #1006 / #1010.
// Verifies that GET /reports/wht-summary:
//   1. joins supplier_payment_allocations + suppliers + journal_entries
//      filtering only WHT-bearing rows from active (non-reversed)
//      entries,
//   2. exposes by-category + by-supplier rollups (the ZATCA filing
//      demands the per-category split),
//   3. supports date / supplier / category / branch filters,
//   4. is read-only (no INSERT/UPDATE/postJournalEntry/withTransaction).

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/wht-summary"');
const HANDLER = ROUTE.slice(START);

describe("/reports/wht-summary endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/wht-summary"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("WHT report joins active SPA + suppliers + entries", () => {
  it("joins journal_entries via spa.journalEntryId (balancesApplied + reversedById guard)", () => {
    expect(HANDLER).toMatch(/JOIN journal_entries je\s+ON je\.id = spa\."journalEntryId"/);
    expect(HANDLER).toMatch(/je\."balancesApplied" = true/);
    expect(HANDLER).toMatch(/je\."reversedById" IS NULL/);
  });
  it("LEFT JOINs purchase_orders → suppliers (so nusk-invoice rows still surface)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN purchase_orders po\s+ON po\.id = spa\."obligationId"/);
    expect(HANDLER).toMatch(/spa\."obligationType" = 'purchase_order'/);
    expect(HANDLER).toMatch(/LEFT JOIN suppliers sup\s+ON sup\.id = po\."supplierId"/);
  });
  it("LEFT JOINs wht_categories for the category label + appliesTo", () => {
    expect(HANDLER).toMatch(/LEFT JOIN wht_categories cat\s+ON cat\."companyId" = spa\."companyId"/);
    expect(HANDLER).toMatch(/cat\.code = spa\."whtCategory"/);
  });
  it("WHERE drops SPA rows with whtAmount = 0 (sparse-index alignment)", () => {
    expect(HANDLER).toMatch(/COALESCE\(spa\."whtAmount", 0\) > 0/);
  });
  it("WHERE excludes soft-deleted SPA rows", () => {
    expect(HANDLER).toMatch(/spa\."deletedAt" IS NULL/);
  });
});

describe("WHT report exposes filters", () => {
  for (const f of ["startDate", "endDate", "supplierId", "category"]) {
    it(`accepts ${f} query parameter`, () => {
      expect(HANDLER).toContain(`${f}`);
    });
  }
  it("date filters bind against je.date (the ledger date column — not createdAt)", () => {
    expect(HANDLER).toMatch(/je\."date" >= \$\$\{params\.length\}/);
    expect(HANDLER).toMatch(/je\."date" < \(\$\$\{params\.length\}::date \+ 1\)/);
  });
  it("supplierId filter binds against sup.id (joined table)", () => {
    expect(HANDLER).toMatch(/sup\.id = \$\$\{params\.length\}/);
  });
  it("category filter binds against spa.whtCategory", () => {
    expect(HANDLER).toMatch(/spa\."whtCategory" = \$\$\{params\.length\}/);
  });
  it("branch scope honoured via getBranchCondition(scope, requestedBranchId, …)", () => {
    expect(HANDLER).toContain("getBranchCondition(scope, requestedBranchId, params)");
  });
});

describe("WHT report rollups", () => {
  it("computes per-category rollup keyed on whtCategory", () => {
    expect(HANDLER).toContain("byCategory");
    expect(HANDLER).toMatch(/byCategory\.set\(catKey, cat\)/);
  });
  it("computes per-supplier rollup keyed on supplierId", () => {
    expect(HANDLER).toContain("bySupplier");
    expect(HANDLER).toMatch(/bySupplier\.set\(r\.supplierId, sup\)/);
  });
  it("summary totals wht + net + gross + rowCount", () => {
    expect(HANDLER).toMatch(/totalWht: roundTo2\(totalWht\)/);
    expect(HANDLER).toMatch(/totalNet: roundTo2\(totalNet\)/);
    expect(HANDLER).toMatch(/totalGross: roundTo2\(totalGross\)/);
    expect(HANDLER).toMatch(/rowCount: rows\.length/);
  });
  it("gross = net + wht (cash gone out + tax withheld for ZATCA)", () => {
    expect(HANDLER).toMatch(/const gross = net \+ wht/);
  });
  it("byCategory + bySupplier sorted desc by wht (biggest first)", () => {
    expect(HANDLER).toMatch(/byCategory[\s\S]{0,200}\.sort\(\(a, b\) => b\.wht - a\.wht\)/);
    expect(HANDLER).toMatch(/bySupplier[\s\S]{0,200}\.sort\(\(a, b\) => b\.wht - a\.wht\)/);
  });
});

describe("WHT report payload shape", () => {
  it("exposes filters + summary + byCategory + bySupplier + data", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toContain("byCategory:");
    expect(HANDLER).toContain("bySupplier:");
    expect(HANDLER).toContain("data: rows,");
  });
  it("response passed through maskFields (RBAC field policy)", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
  it("LIMIT 5000 on the detail rows (one ZATCA month worst-case)", () => {
    expect(HANDLER).toMatch(/LIMIT 5000/);
  });
});

describe("WHT report is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    // Cap the handler search at the next route-block boundary so other
    // endpoints below don't pollute the assertions.
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
