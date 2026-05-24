import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// COGS / margin summary report — audit follow-up to the COGS campaign.
// Verifies that GET /reports/cogs-summary:
//   1. joins invoice_lines + invoices + clients + warehouse_products,
//   2. only counts lines where COGS was actually posted
//      (cogsPostedAt IS NOT NULL — guards out un-approved drafts &
//      service lines),
//   3. nets COGS by cogsReversedAmount so returns don't inflate margin,
//   4. exposes per-product / per-client / per-period rollups,
//   5. is read-only.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/cogs-summary"');
const HANDLER = ROUTE.slice(START);

describe("/reports/cogs-summary endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/cogs-summary"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("COGS report joins active invoice lines", () => {
  it("joins invoices via il.invoiceId, drops soft-deleted invoices", () => {
    expect(HANDLER).toMatch(/JOIN invoices i ON i\.id = il\."invoiceId"/);
    expect(HANDLER).toMatch(/i\."deletedAt" IS NULL/);
  });
  it("LEFT JOINs clients + warehouse_products for label context", () => {
    expect(HANDLER).toMatch(/LEFT JOIN clients c ON c\.id = i\."clientId"/);
    expect(HANDLER).toMatch(/LEFT JOIN warehouse_products p ON p\.id = il\."productId"/);
  });
  it("WHERE filters to lines where COGS was actually posted", () => {
    expect(HANDLER).toMatch(/COALESCE\(il\."cogsAmount", 0\) > 0/);
    expect(HANDLER).toMatch(/il\."cogsPostedAt" IS NOT NULL/);
  });
});

describe("COGS report nets cogs by reversals", () => {
  it("cogsNet = cogsAmount − cogsReversedAmount (returns don't inflate margin)", () => {
    expect(HANDLER).toMatch(/COALESCE\(il\."cogsAmount", 0\) - COALESCE\(il\."cogsReversedAmount", 0\)/);
  });
  it("profit = lineTotal − cogsNet", () => {
    expect(HANDLER).toMatch(/il\."lineTotal" -\s+\(COALESCE\(il\."cogsAmount", 0\) - COALESCE\(il\."cogsReversedAmount", 0\)\)/);
  });
});

describe("COGS report exposes filters", () => {
  for (const f of ["startDate", "endDate", "productId", "clientId"]) {
    it(`accepts ${f} query parameter`, () => {
      expect(HANDLER).toContain(`${f}`);
    });
  }
  it("date filters bind against il.cogsPostedAt (ledger date)", () => {
    expect(HANDLER).toMatch(/il\."cogsPostedAt" >= \$\$\{params\.length\}/);
    expect(HANDLER).toMatch(/il\."cogsPostedAt" < \(\$\$\{params\.length\}::date \+ 1\)/);
  });
  it("branch scope honoured against the invoice (alias 'i')", () => {
    expect(HANDLER).toMatch(/getBranchCondition\(scope, undefined, params, "i"\)/);
  });
});

describe("COGS report rollups", () => {
  it("byProduct keyed on productId", () => {
    expect(HANDLER).toContain("byProduct");
    expect(HANDLER).toMatch(/byProduct\.set\(r\.productId, p\)/);
  });
  it("byClient keyed on clientId", () => {
    expect(HANDLER).toContain("byClient");
    expect(HANDLER).toMatch(/byClient\.set\(r\.clientId, cl\)/);
  });
  it("byPeriod keyed on YYYY-MM", () => {
    expect(HANDLER).toContain("byPeriod");
    expect(HANDLER).toMatch(/to_char\(il\."cogsPostedAt", 'YYYY-MM'\) AS period/);
  });
  it("summary exposes totalRevenue / Gross / Reversed / Net / Profit / marginPct", () => {
    expect(HANDLER).toMatch(/totalRevenue:\s+roundTo2\(totalRevenue\)/);
    expect(HANDLER).toMatch(/totalCogsGross:/);
    expect(HANDLER).toMatch(/totalCogsReversed:/);
    expect(HANDLER).toMatch(/totalCogsNet:/);
    expect(HANDLER).toMatch(/totalProfit:/);
    expect(HANDLER).toMatch(/marginPct:/);
  });
  it("marginPct guarded against divide-by-zero", () => {
    expect(HANDLER).toMatch(/revenue > 0 \? roundTo2\(\(profit \/ revenue\) \* 100\) : 0/);
  });
  it("byProduct + byClient sorted DESC by profit", () => {
    expect(HANDLER).toMatch(/byProduct[\s\S]{0,400}\.sort\(\(a, b\) => b\.profit - a\.profit\)/);
    expect(HANDLER).toMatch(/byClient[\s\S]{0,400}\.sort\(\(a, b\) => b\.profit - a\.profit\)/);
  });
  it("byPeriod sorted ASC by period (chronological)", () => {
    expect(HANDLER).toMatch(/byPeriod[\s\S]{0,400}\.sort\(\(a, b\) => \(a\.period < b\.period \? -1 : 1\)\)/);
  });
});

describe("COGS report payload shape", () => {
  it("exposes filters + summary + byProduct + byClient + byPeriod + data", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toContain("byProduct:");
    expect(HANDLER).toContain("byClient:");
    expect(HANDLER).toContain("byPeriod:");
    expect(HANDLER).toContain("data: rows,");
  });
  it("response passed through maskFields", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
  it("LIMIT 10000 on the detail rows", () => {
    expect(HANDLER).toMatch(/LIMIT 10000/);
  });
});

describe("COGS report is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
