import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Inventory turnover ratio — companion to #1033 (valuation) and
// #1034 (COGS summary). Verifies that GET /reports/inventory-turnover:
//   1. computes period COGS net of returns (cogsAmount − cogsReversedAmount),
//   2. computes current inventory value from active qc-approved lots,
//   3. joins the two by productId and emits turnover + daysOnHand,
//   4. guards against /0 (null when value=0),
//   5. is read-only.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/inventory-turnover"');
const HANDLER = ROUTE.slice(START);

describe("/reports/inventory-turnover endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/inventory-turnover"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("turnover query 1: period COGS by product", () => {
  it("sums cogsAmount − cogsReversedAmount", () => {
    expect(HANDLER).toMatch(/SUM\(COALESCE\(il\."cogsAmount", 0\) - COALESCE\(il\."cogsReversedAmount", 0\)\)/);
  });
  it("WHERE filters on productId IS NOT NULL + cogsPostedAt IS NOT NULL", () => {
    expect(HANDLER).toMatch(/il\."productId" IS NOT NULL/);
    expect(HANDLER).toMatch(/il\."cogsPostedAt" IS NOT NULL/);
  });
  it("date filters bind against cogsPostedAt", () => {
    expect(HANDLER).toMatch(/il\."cogsPostedAt" >= \$\$\{cogsParams\.length\}/);
    expect(HANDLER).toMatch(/il\."cogsPostedAt" < \(\$\$\{cogsParams\.length\}::date \+ 1\)/);
  });
  it("groups by productId only", () => {
    expect(HANDLER).toMatch(/GROUP BY il\."productId"/);
  });
});

describe("turnover query 2: current inventory value by product", () => {
  it("LEFT JOINs lots, filtering active + qc-approved + non-deleted", () => {
    expect(HANDLER).toMatch(/l\.status = 'active'/);
    expect(HANDLER).toMatch(/l\."qualityControlStatus" = 'approved'/);
    expect(HANDLER).toMatch(/l\."deletedAt" IS NULL/);
  });
  it("value = SUM(quantity × unitCost) with COALESCE on null lots", () => {
    expect(HANDLER).toMatch(/SUM\(COALESCE\(l\.quantity, 0\) \* COALESCE\(l\."unitCost", 0\)\)/);
  });
  it("filters products by status='active' (skips draft / archived)", () => {
    expect(HANDLER).toMatch(/COALESCE\(p\.status, 'active'\) = 'active'/);
  });
  it("warehouseId / productId filters supported", () => {
    expect(HANDLER).toMatch(/l\."warehouseId" = \$\$\{invParams\.length\}/);
    expect(HANDLER).toMatch(/p\.id = \$\$\{invParams\.length\}/);
  });
});

describe("turnover math", () => {
  it("turnover = periodCogs / value, null when value=0 (divide-by-zero guard)", () => {
    expect(HANDLER).toMatch(/turnover = value > 0 \? periodCogs \/ value : null/);
  });
  it("daysOnHand = periodDays / turnover, null when turnover=0 or period unknown", () => {
    expect(HANDLER).toMatch(/turnover != null && turnover > 0 && periodDays != null/);
    expect(HANDLER).toMatch(/Math\.round\(\(periodDays \/ turnover\) \* 100\) \/ 100/);
  });
  it("periodDays computed from start/end (inclusive endpoints → +1)", () => {
    expect(HANDLER).toMatch(/Math\.floor\(ms \/ 86400_000\) \+ 1/);
  });
  it("turnover rounded to 2 decimals (Math.round × 100 / 100)", () => {
    expect(HANDLER).toMatch(/Math\.round\(turnover \* 100\) \/ 100/);
  });
});

describe("turnover summary + branch scope", () => {
  it("overallTurnover and overallDaysOnHand computed from totals", () => {
    expect(HANDLER).toMatch(/overallTurnover = totalValue > 0/);
    expect(HANDLER).toMatch(/overallDaysOnHand = \(overallTurnover != null/);
  });
  it("branch scope honoured against the invoice (COGS) and warehouse (value)", () => {
    expect(HANDLER).toMatch(/getBranchCondition\(scope, undefined, cogsParams, "i"\)/);
    expect(HANDLER).toMatch(/getBranchCondition\(scope, undefined, invParams, "w"\)/);
  });
});

describe("turnover payload shape", () => {
  it("exposes filters + period.days + summary + data", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toMatch(/period: \{ days: periodDays \}/);
    expect(HANDLER).toContain("summary:");
    expect(HANDLER).toMatch(/data: rows\.sort/);
  });
  it("data rows sorted DESC by turnover (highest first; nulls last via -1)", () => {
    expect(HANDLER).toMatch(/\(b\.turnover \?\? -1\) - \(a\.turnover \?\? -1\)/);
  });
  it("response passed through maskFields", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
});

describe("turnover report is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
