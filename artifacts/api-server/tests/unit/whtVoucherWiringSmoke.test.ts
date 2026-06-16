import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// WHT wiring on POST /vouchers (payment voucher with purchase_order
// allocations). Follow-up to #1006 (payment-run wiring).
//
// A payment voucher with allocations against POs from non-resident
// suppliers must:
//   1. compute WHT per allocation (NOT per voucher — different POs
//      can have different residency / categories),
//   2. reduce the cash credit by Σ wht and add CR WHT-Payable lines
//      bucketed by payable account,
//   3. record amount = NET + whtAmount + whtRate + whtCategory per
//      SPA row so vendor statements reproduce the split,
//   4. count gross (amount + whtAmount) against the obligation cap
//      so a 100K PO can't be over-allocated by paying 85K + holding
//      15K WHT four times.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8"
);

// Isolate the create-voucher handler (POST /vouchers).
const HANDLER_START = ROUTE.indexOf('journalRouter.post("/vouchers"');
// Stop at the next router decl so assertions stay scoped.
const HANDLER_END = ROUTE.indexOf('journalRouter.patch("/vouchers/:id"', HANDLER_START);
const HANDLER = ROUTE.slice(HANDLER_START, HANDLER_END);

describe("voucher route computes WHT for PO allocations", () => {
  it("dynamically imports computeWHT only for payment vouchers", () => {
    expect(HANDLER).toContain("if (!isReceipt && allocations && allocations.length > 0)");
    expect(HANDLER).toContain('await import("../lib/withholdingTax.js")');
  });
  it("looks up each allocation's PO to fetch supplierId", () => {
    expect(HANDLER).toMatch(/SELECT "supplierId" FROM purchase_orders/);
  });
  it("computeWHT runs on the allocation amount, not the PO total", () => {
    expect(HANDLER).toMatch(/grossAmount: Number\(a\.amount\)/);
  });
  it("skips when split.applies is false (resident supplier short-circuit)", () => {
    expect(HANDLER).toMatch(/if \(!split\.applies \|\| split\.wht <= 0\) continue/);
  });
  it("only walks purchase_order allocations (nusk/expense/manual skip)", () => {
    expect(HANDLER).toMatch(/if \(a\.obligationType !== "purchase_order"\) continue/);
  });
});

describe("voucher JE includes WHT", () => {
  it("netCashOut = totalWithVat − totalWht", () => {
    expect(HANDLER).toMatch(/netCashOut\s*=\s*roundTo2\(totalWithVat - totalWht\)/);
  });
  it("buckets WHT credits by payable account (default fallback 2132)", () => {
    expect(HANDLER).toContain("whtCreditByAccount");
    expect(HANDLER).toMatch(/"wht_payable",\s*"credit",\s*"2132"/);
  });
  it("payment lines splice in whtCreditLines before the cash credit", () => {
    // The voucher legs now spread `...voucherDims` so per-supplier /
    // per-customer / per-contract attribution flows through. The
    // sequencing relative to whtCreditLines is unchanged.
    expect(HANDLER).toMatch(/\.\.\.whtCreditLines,\s*\{ accountCode: cashAcct, debit: 0, credit: netCashOut, \.\.\.voucherDims \}/);
  });
  it("receipt path is unchanged (no WHT lines)", () => {
    // The receipt branch of the ternary still emits exactly its 3 lines;
    // each line now also spreads voucherDims for downstream drilldowns.
    expect(HANDLER).toMatch(/isReceipt\s*\?\s*\[\s*\{ accountCode: cashAcct, debit: totalWithVat, credit: 0, \.\.\.voucherDims \}/);
  });
});

describe("voucher SPA snapshot writes WHT columns", () => {
  it("INSERT lists whtAmount + whtRate + whtCategory", () => {
    expect(HANDLER).toContain("INSERT INTO supplier_payment_allocations");
    expect(HANDLER).toContain('"whtAmount", "whtRate", "whtCategory"');
  });
  it("amount column stores the NET (cash to supplier), not the gross", () => {
    expect(HANDLER).toMatch(/allocAmt,\s+\/\/ comment-anchor: amount = net/);
  });
});

describe("voucher cap-check counts gross discharged", () => {
  it("Σ already-allocated includes COALESCE whtAmount", () => {
    expect(HANDLER).toMatch(/SUM\(amount \+ COALESCE\("whtAmount", 0\)\)/);
  });
  it("new-row check uses grossDischarged = allocAmt + wht.wht", () => {
    expect(HANDLER).toMatch(/grossDischarged = roundTo2\(allocAmt \+ \(wht\?\.wht \?\? 0\)\)/);
    expect(HANDLER).toMatch(/alreadyAllocated \+ grossDischarged > roundTo2\(obligationCap\)/);
  });
});

describe("dry-run response includes WHT totals", () => {
  it("dryRun.totals exposes whtAmount + netCashOut", () => {
    expect(HANDLER).toMatch(/whtAmount: totalWht,/);
    expect(HANDLER).toMatch(/netCashOut,/);
  });
});
