/**
 * Customer statement — security-deposits block smoke test.
 *
 * P0-3 of the Properties plan (ودائع الضمان تظهر في الكشف): the
 * deposits post correctly to the GL as a liability (2300 — see
 * propertiesEngine.postSecurityDepositGL) but the customer statement
 * never surfaced them, so an operator settling a departing tenant
 * saw a clean slate while the company still held thousands in
 * deposit money.
 *
 * Source-level assertions, deliberately:
 *   - the deposits are a SEPARATE response block (`securityDeposits`)
 *     and must never be merged into the AR `movements` running
 *     balance — a held deposit is a liability (we owe the tenant),
 *     the opposite direction of a receivable;
 *   - the join chain (deposit → rental_contract → tenants.clientId)
 *     is the only correct path from a deposit row to the customer —
 *     property_security_deposits has no clientId of its own;
 *   - the held filter excludes refunded deposits
 *     (amount - refundAmount <= 0.01).
 *
 * The query itself was verified live against a provisioned head-of-
 * main DB with seeded client→tenant→contract→deposit rows (held
 * 5000 picked up; refunded 2000 excluded) before this section was
 * added to the route — see the PR description.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-reports.ts"),
  "utf8",
);

// Slice the customer-statement endpoint body so assertions can't
// accidentally match the vendor statement or another report.
const start = SRC.indexOf("reports/customer-statement/:clientId");
const end = SRC.indexOf("Vendor Statement");
const ENDPOINT = SRC.slice(start, end);

describe("customer statement — securityDeposits block", () => {
  it("endpoint exists and the slice is non-trivial", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(ENDPOINT.length).toBeGreaterThan(2000);
  });

  it("responds with a securityDeposits block (totalHeld + rows)", () => {
    expect(ENDPOINT).toContain("securityDeposits:");
    expect(ENDPOINT).toContain("totalHeld:");
  });

  it("reads property_security_deposits through the contract→tenant join chain", () => {
    expect(ENDPOINT).toContain("FROM property_security_deposits psd");
    expect(ENDPOINT).toContain(`JOIN rental_contracts rc ON rc.id = psd."contractId"`);
    expect(ENDPOINT).toContain(`JOIN tenants t ON t.id = rc."tenantId"`);
    expect(ENDPOINT).toContain(`t."clientId" = $1`);
  });

  it("filters to still-held amounts (excludes fully refunded deposits)", () => {
    expect(ENDPOINT).toContain(
      `(psd.amount - COALESCE(psd."refundAmount", 0)) > 0.01`,
    );
  });

  it("scopes by companyId — tenant isolation", () => {
    expect(ENDPOINT).toContain(`psd."companyId" = $2`);
  });

  it("bounds by the statement's asOf date", () => {
    expect(ENDPOINT).toContain(`psd."receivedDate" <= $3`);
  });

  it("does NOT add deposit rows into the AR movements timeline", () => {
    // The movements array is built from invoices + payments + umrah
    // rows only. If someone later spreads deposits into it, the AR
    // running balance silently absorbs a liability. Guard: the
    // movements merge line must not reference deposits.
    const mergeLine = ENDPOINT.match(/const all = \[[^\]]+\]/)?.[0] ?? "";
    expect(mergeLine).not.toContain("deposit");
    expect(mergeLine).toContain("...invoices");
    expect(mergeLine).toContain("...payments");
  });
});
