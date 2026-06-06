import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Running-balance trajectory sparkline added to the current-balance
 * KPI on BOTH the customer-360 and vendor-360 sheets. Both pages
 * already pull `stmt.movements` (with `runningBalance` per entry)
 * — the spark renders that EXISTING series next to the headline
 * balance number.
 *
 * Tone semantics flip between the two pages because the sign of
 * `endingBalance` has opposite meaning:
 *
 *   - customer: balance > 0 ⇒ customer OWES the company ⇒ warning
 *     (the higher, the more receivable risk)
 *   - vendor: balance < 0 ⇒ company OWES the vendor ⇒ warning
 *     (the more negative, the higher the payable)
 */

const CUSTOMER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/customer-360-sheet.tsx"),
  "utf8",
);
const VENDOR = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/vendor-360-sheet.tsx"),
  "utf8",
);

describe("customer-360-sheet — running-balance sparkline", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(CUSTOMER).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("feeds the existing stmt.movements series — no new state, no new fetch", () => {
    expect(CUSTOMER).toMatch(/values=\{stmt\.movements\.map\(\(m\) => Number\(m\.runningBalance \?\? 0\)\)\}/);
  });

  it("tone flips at endingBalance > 0 (customer owes ⇒ warning, balanced/credit ⇒ success)", () => {
    expect(CUSTOMER).toMatch(/<InlineSparkline[\s\S]{0,300}tone=\{stmt\.endingBalance > 0 \? "warning" : "success"\}[\s\S]{0,200}testid="customer-360-balance-spark"/);
  });

  it("scoped testid for screenshot regression", () => {
    expect(CUSTOMER).toContain('testid="customer-360-balance-spark"');
  });
});

describe("vendor-360-sheet — running-balance sparkline (mirrors customer with tone flipped)", () => {
  it("imports the shared InlineSparkline component", () => {
    expect(VENDOR).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("feeds the existing stmt?.movements series, guarded for the no-stmt case", () => {
    expect(VENDOR).toMatch(/values=\{\(stmt\?\.movements \?\? \[\]\)\.map\(\(m\) => Number\(m\.runningBalance \?\? 0\)\)\}/);
  });

  it("tone INVERTS at owedToVendor < 0 (vendor owed ⇒ warning) — opposite sign convention from customer", () => {
    // Drift alarm: if this sign comparison ever drifts to match the
    // customer convention, payable risk silently renders as 'success'.
    expect(VENDOR).toMatch(/<InlineSparkline[\s\S]{0,300}tone=\{owedToVendor < 0 \? "warning" : "success"\}[\s\S]{0,200}testid="vendor-360-balance-spark"/);
  });

  it("scoped testid distinct from customer-360", () => {
    expect(VENDOR).toContain('testid="vendor-360-balance-spark"');
    expect(VENDOR).not.toContain('testid="customer-360-balance-spark"');
  });
});
