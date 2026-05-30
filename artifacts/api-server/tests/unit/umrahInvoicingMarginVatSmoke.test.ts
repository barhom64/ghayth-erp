import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah margin-VAT correctness fixes:
 *
 *   - Cost basis is NET OF REFUNDS. Partially-refunded NUSK invoices
 *     used to inflate cost → shrink margin → undercharge VAT (a real
 *     ZATCA compliance violation).
 *
 *   - Cancelled NUSK invoices are EXCLUDED. They exist for audit but
 *     no payable was actually owed; counting them as cost had the
 *     same effect as overstated refunds.
 *
 *   - Selling-below-cost is detected and surfaced on the return shape
 *     so the UI/alerting can warn. Previously the Math.max(0, ...)
 *     clamp silently masked operator-loss situations.
 *
 *   - The cost-basis query shape matches the vendor-statement
 *     integration (PR #1453) so both reports converge on the same
 *     "real cost" number.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("umrahInvoicingEngine — margin-VAT cost-basis fix", () => {
  it("cost basis subtracts refundAmount (was: SUM(totalAmount) flat)", () => {
    // Without this fix, a NUSK invoice for SAR 10,000 with a SAR 2,000
    // refund still counted as SAR 10,000 of cost → margin understated
    // by 2k → VAT undercharged by 300 SAR (15% of 2k). Multiplied
    // across a season, this is a six-figure compliance gap.
    expect(ENGINE).toMatch(/SUM\("totalAmount" - COALESCE\("refundAmount", 0\)\)/);
  });

  it("cost basis excludes cancelled NUSK invoices", () => {
    // Cancellations leave the row for audit but the AP was never owed;
    // counting them as cost was the same kind of bug as the refund
    // case (margin understated → VAT undercharged).
    expect(ENGINE).toMatch(/"nuskStatus" NOT IN \('cancelled'\)/);
  });

  it("sellingBelowCost flag is computed BEFORE the Math.max clamp", () => {
    // The clamp prevents negative VAT, but the original comparison
    // (subtotal < costBasis) must survive separately so operator-loss
    // situations are visible. Pin both lines so a future refactor
    // can't accidentally consolidate them and lose the signal.
    expect(ENGINE).toMatch(/const sellingBelowCost = subtotal < costBasis/);
    expect(ENGINE).toMatch(/Math\.max\(0, subtotal - costBasis\)/);
  });

  it("return shape exposes costBasis, marginBase, sellingBelowCost", () => {
    // These were already computed locally but never returned, so the
    // UI couldn't render the margin breakdown that operators ask for
    // ("what's the gross profit on this invoice?"). Surfacing them
    // also lets alerting hook into sellingBelowCost without parsing
    // log lines.
    expect(ENGINE).toMatch(/return \{[\s\S]{1,800}costBasis,\s*marginBase,\s*sellingBelowCost/);
  });

  it("retains the existing margin-scheme math (VAT = marginBase × vatRate, not subtotal)", () => {
    // Regression guard — the previous engine was already on the
    // margin scheme. This PR fixed inputs to the formula, not the
    // formula itself. Pin the formula so a future "simplify VAT
    // calculation" PR can't accidentally regress to gross-VAT.
    expect(ENGINE).toMatch(/vatAmount = roundTo2\(marginBase \* \(vatRate \/ 100\)\)/);
  });

  it("query is scoped by companyId + groupId (tenant + obligation match)", () => {
    // Defence-in-depth: a cross-tenant or wrong-group leak here would
    // give the wrong margin and the wrong VAT. Pin the scope.
    expect(ENGINE).toMatch(/FROM umrah_nusk_invoices[\s\S]{1,400}"companyId" = \$1[\s\S]{0,200}"groupId" = ANY\(\$2\)[\s\S]{0,200}"deletedAt" IS NULL/);
  });
});
