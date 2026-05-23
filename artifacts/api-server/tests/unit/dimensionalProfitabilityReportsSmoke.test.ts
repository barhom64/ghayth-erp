import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

// ─── Phase 7 P2 — Dimensional Profitability Reports ─────────────────────────
// Seven new endpoints that read directly from journal_lines using the
// dimensional columns added in migration 201. The point of the whole
// Line-Level Allocation campaign is operationalised here: a single
// indexed query on (vehicleId, propertyId, projectId, …) returns
// profitability without joining back to source documents.

describe("dimensional profitability endpoints", () => {
  const ENDPOINTS = [
    "/reports/profitability/vehicle/:vehicleId",
    "/reports/profitability/property/:propertyId",
    "/reports/profitability/project/:projectId",
    "/reports/profitability/umrah-agent/:umrahAgentId",
    "/reports/revenue-by-activity-type",
    "/reports/expenses-by-cost-center",
    "/reports/unmapped-lines",
  ];

  for (const ep of ENDPOINTS) {
    it(`registers GET ${ep}`, () => {
      expect(ROUTE).toContain(`"${ep}"`);
    });
  }
});

describe("queries apply the standard JE filters", () => {
  const sections = [
    "vehicleId", "propertyId", "projectId", "umrahAgentId",
    "activity-type", "cost-center",
  ];

  for (const tag of sections) {
    it(`${tag} report filters by balancesApplied + reversedById IS NULL`, () => {
      // Find the section by a unique anchor inside it.
      let anchor = "";
      if (tag === "vehicleId")    anchor = 'jl."vehicleId" = $2';
      else if (tag === "propertyId") anchor = 'jl."propertyId" = $2';
      else if (tag === "projectId")  anchor = 'jl."projectId" = $2';
      else if (tag === "umrahAgentId") anchor = 'jl."umrahAgentId" = $2';
      else if (tag === "activity-type") anchor = 'jl."activityType"';
      else if (tag === "cost-center") anchor = 'jl."costCenterId"';

      const idx = ROUTE.indexOf(anchor);
      expect(idx).toBeGreaterThan(-1);
      // 1500 chars before the anchor should contain both filters.
      const section = ROUTE.slice(Math.max(0, idx - 1500), idx + 500);
      expect(section).toContain('je."balancesApplied" = true');
      expect(section).toContain('je."reversedById" IS NULL');
      expect(section).toContain('je."deletedAt" IS NULL');
    });
  }
});

describe("profitability summary shape", () => {
  it("every profitability report exposes { totalRevenue, totalExpense, netProfit }", () => {
    const reports = [
      "Vehicle profitability error",
      "Property profitability error",
      "Project profitability error",
      "Umrah agent profitability error",
    ];
    for (const r of reports) {
      const idx = ROUTE.indexOf(r);
      expect(idx).toBeGreaterThan(-1);
      const section = ROUTE.slice(Math.max(0, idx - 2500), idx);
      expect(section).toContain("totalRevenue");
      expect(section).toContain("totalExpense");
      expect(section).toContain("netProfit");
    }
  });
});

describe("unmapped-lines governance report", () => {
  const handlerIdx = ROUTE.indexOf('"/reports/unmapped-lines"');
  const handlerEnd = ROUTE.indexOf("// ─", handlerIdx + 10);
  const handler = ROUTE.slice(handlerIdx, handlerEnd > handlerIdx ? handlerEnd : ROUTE.length);

  it("covers invoice_lines, purchase_order_items, goods_receipt_items", () => {
    expect(handler).toContain("invoice_lines");
    expect(handler).toContain("purchase_order_items");
    expect(handler).toContain("goods_receipt_items");
  });

  it("only returns lines where allocationStatus = 'unmapped'", () => {
    expect(handler).toContain('"allocationStatus" = \'unmapped\'');
    // and not 'resolved'
    expect(handler).not.toMatch(/"allocationStatus"\s*=\s*'resolved'/);
  });

  it("supports filtering by ?sourceTable=...", () => {
    expect(handler).toContain("tableFilter");
    expect(handler).toContain("sourceTable === table");
  });

  it("scopes to companyId in every section", () => {
    // count "companyId" occurrences in the handler - should be at least 3 (one per section)
    const matches = handler.match(/"companyId"/g);
    expect(matches?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("read-only guarantee", () => {
  const sectionIdx = ROUTE.indexOf("DIMENSIONAL PROFITABILITY REPORTS");
  const section = ROUTE.slice(sectionIdx);

  it("no INSERT/UPDATE/DELETE in the entire dimensional reports section", () => {
    expect(section).not.toMatch(/INSERT\s+INTO/i);
    expect(section).not.toMatch(/UPDATE\s+\w+\s+SET/i);
    expect(section).not.toMatch(/DELETE\s+FROM/i);
  });

  it("no postJournalEntry / withTransaction in dimensional reports", () => {
    expect(section).not.toContain("postJournalEntry");
    expect(section).not.toContain("withTransaction");
  });

  it("all dimensional reports use authorize action:'list'", () => {
    // Each new endpoint should be guarded by reports list permission.
    const newReports = section.match(/action:\s*"(\w+)"/g) || [];
    for (const m of newReports) {
      expect(m).toContain('"list"');
    }
  });
});
