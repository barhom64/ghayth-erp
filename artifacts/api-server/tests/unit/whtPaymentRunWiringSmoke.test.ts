import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// WHT wiring on POST /payment-run/execute — follow-up to migration 208.
// Verifies the route now:
//   1. pulls supplier residency + WHT defaults alongside each PO,
//   2. calls computeWHT for each PO,
//   3. reduces the cash credit by the total WHT and adds CR WHT-payable
//      lines aggregated by payable account,
//   4. snapshots per-PO WHT onto supplier_payment_allocations so the next
//      ZATCA WHT filing has the audit trail.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8"
);

// Isolate the payment-run/execute handler so assertions don't pick up
// matches from unrelated routes that happen to share a token.
const HANDLER_START = ROUTE.indexOf('"/payment-run/execute"');
const HANDLER_END_MARKER = 'purchaseRouter.get("/payment-run"';
const HANDLER_END = ROUTE.indexOf(HANDLER_END_MARKER, HANDLER_START);
const HANDLER = ROUTE.slice(HANDLER_START, HANDLER_END);

describe("payment-run pulls supplier residency + WHT defaults", () => {
  it("joins suppliers to get residencyStatus / defaultWhtRate / whtCategoryDefault", () => {
    expect(HANDLER).toContain('"residencyStatus"');
    expect(HANDLER).toContain('"defaultWhtRate"');
    expect(HANDLER).toContain('"whtCategoryDefault"');
  });
  it("LEFT JOINs suppliers on po.supplierId (soft-delete safe)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN suppliers s ON s\.id = po\."supplierId" AND s\."deletedAt" IS NULL/);
  });
});

describe("payment-run calls computeWHT per PO", () => {
  it("dynamically imports computeWHT", () => {
    expect(HANDLER).toContain('await import("../lib/withholdingTax.js")');
    expect(HANDLER).toContain("computeWHT");
  });
  it("passes companyId + supplierId + grossAmount", () => {
    expect(HANDLER).toMatch(/companyId: scope\.companyId/);
    expect(HANDLER).toMatch(/supplierId,/);
    expect(HANDLER).toMatch(/grossAmount: Number\(po\.totalAmount\)/);
  });
  it("skips POs where split.applies is false (resident suppliers)", () => {
    expect(HANDLER).toMatch(/if \(split\.applies && split\.wht > 0\)/);
  });
});

describe("payment-run JE reduces cash by the WHT total", () => {
  it("computes netCashOut = totalPayment − totalWht", () => {
    expect(HANDLER).toMatch(/netCashOut\s*=\s*roundTo2\(totalPayment - totalWht\)/);
  });
  it("buckets WHT-payable credits by account code (default fallback 2132)", () => {
    expect(HANDLER).toContain("whtCreditByAccount");
    expect(HANDLER).toMatch(/"wht_payable",\s*"credit",\s*"2132"/);
  });
  it("CR Cash line uses netCashOut, not totalPayment", () => {
    expect(HANDLER).toMatch(/accountCode: cashAccount, debit: 0, credit: netCashOut/);
  });
  it("adds one CR WHT-payable line per bucketed account", () => {
    expect(HANDLER).toMatch(/for \(const \[code, amount\] of whtCreditByAccount\)/);
  });
  it("AP debit per PO stays at FULL gross (so subledger reconciles)", () => {
    // Loosened to match the multi-branch shape — each AP DR now carries
    // branchId from po.branchId so cross-branch payment runs split per
    // branch on the GL. The gross and vendorId assertions still anchor
    // the subledger contract.
    expect(HANDLER).toMatch(/debit: Number\(po\.totalAmount\)[\s\S]{0,80}credit: 0[\s\S]{0,80}vendorId: po\.supplierId/);
  });
});

describe("payment-run snapshots WHT to supplier_payment_allocations", () => {
  it("INSERT INTO supplier_payment_allocations with WHT columns", () => {
    expect(HANDLER).toContain("INSERT INTO supplier_payment_allocations");
    expect(HANDLER).toContain('"whtAmount"');
    expect(HANDLER).toContain('"whtRate"');
    expect(HANDLER).toContain('"whtCategory"');
  });
  it("uses obligationType='purchase_order'", () => {
    expect(HANDLER).toContain("'purchase_order'");
  });
  it("records the NET amount paid (not gross) on the allocation", () => {
    // The amount column holds the cash that actually went to the supplier;
    // gross stays implicit (= amount + whtAmount).
    expect(HANDLER).toMatch(/w\.net,\s+\/\/ amount actually paid/);
  });
  it("skips snapshot on idempotent replay", () => {
    expect(HANDLER).toMatch(/!paymentRunJournalResult\.alreadyExists/);
  });
  it("snapshot loop only runs for POs that actually had WHT", () => {
    expect(HANDLER).toMatch(/whtByPo\.length > 0/);
  });
});

describe("payment-run description reflects WHT split", () => {
  it("when WHT > 0, description shows net + withholding breakdown", () => {
    expect(HANDLER).toMatch(/استقطاع/);
    expect(HANDLER).toMatch(/totalWht > 0/);
  });
});
