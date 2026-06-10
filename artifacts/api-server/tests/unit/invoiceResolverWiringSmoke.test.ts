import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

// ─── Phase 5.3 — wire resolver into invoice /approve ────────────────────────
// The resolver service (#975) now drives the per-line revenue account
// + cost-centre + required-dimension contract on invoice approval.
// Manual operator pins still win; rule matches resolve missing
// allocations; un-matched lines fall back to the company-level
// generic invoice_revenue account.

describe("invoice approval reads full dimensional payload + line id", () => {
  it("SELECT pulls line id + accountCode + accountId + dimensional fields", () => {
    const idx = ROUTE.indexOf("FROM invoice_lines\n");
    const start = ROUTE.lastIndexOf("SELECT", idx);
    const section = ROUTE.slice(start, idx);
    // `id` is bare (unquoted) in the SELECT; others are quoted because camelCase.
    expect(section).toMatch(/SELECT\s+id,/);
    for (const col of [
      "accountCode", "accountId",
      "costCenterId", "activityType",
      "projectId", "vehicleId", "propertyId", "unitId", "assetId",
      "employeeId", "driverId", "contractId", "productId",
      "umrahSeasonId", "umrahAgentId", "taxCode",
    ]) {
      expect(section).toContain(`"${col}"`);
    }
  });
});

describe("resolver wiring", () => {
  it("dynamically imports accountingAllocation", () => {
    expect(ROUTE).toContain('await import("../lib/accountingAllocation.js")');
  });

  it("calls resolveLineAllocation per line via Promise.all", () => {
    expect(ROUTE).toContain("resolveLineAllocation");
    expect(ROUTE).toContain("Promise.all");
    expect(ROUTE).toMatch(/dimLines\.rows\.map\(\(ln\)/);
  });

  it("passes documentType='invoice' to the resolver", () => {
    expect(ROUTE).toMatch(/documentType:\s*"invoice"/);
  });

  it("passes clientId in dimensions", () => {
    expect(ROUTE).toMatch(/clientId:\s*invoice\.clientId/);
  });

  it("sourceTable + sourceLineId point at invoice_lines", () => {
    expect(ROUTE).toContain('sourceTable: "invoice_lines"');
    expect(ROUTE).toMatch(/sourceLineId:\s*ln\.id/);
  });
});

describe("posting uses resolver output, not raw line fields", () => {
  it("bucket key is built from resolver result (res.dimensions / res.costCenterId)", () => {
    // The bucket loop should reference `res.resolvedAccountCode` or
    // `res.costCenterId` somewhere.
    expect(ROUTE).toContain("res.resolvedAccountCode");
    expect(ROUTE).toContain("res.dimensions");
    expect(ROUTE).toContain("res.costCenterId");
  });

  it("falls back to invRevenueCode when resolver returns null account", () => {
    // #1945 item 6 — the fallback chain gained the product revenue map
    // between the resolver output and the generic account:
    //   res.resolvedAccountCode || productRevenueCodes.get(productId) || invRevenueCode
    expect(ROUTE).toMatch(/res\.resolvedAccountCode\s*\|\|[\s\S]*?productRevenueCodes[\s\S]*?\|\|\s*invRevenueCode/);
  });
});

describe("writeAllocationResult is called after posting", () => {
  it("imports writeAllocationResult from the resolver module", () => {
    expect(ROUTE).toContain("writeAllocationResult");
  });

  it("UPSERTs only when the JE was actually new (not on idempotent replay)", () => {
    expect(ROUTE).toMatch(/if \(!alreadyExists\)/);
  });

  it("writes the result for every line", () => {
    const idx = ROUTE.indexOf("writeAllocationResult(");
    // Within a for loop over dimLines.rows so all lines get persisted.
    const beforeCall = ROUTE.slice(Math.max(0, idx - 400), idx);
    expect(beforeCall).toMatch(/for \(let i = 0; i < dimLines\.rows\.length/);
  });
});
