import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah ↔ finance customer-statement integration.
 *
 * Before this PR the customer-statement endpoint (which operators use
 * daily to answer "what does this customer owe?") was BLIND to umrah
 * activity. The umrah module already posts every sales invoice +
 * payment to journal_entries via umrahInvoicingEngine, so the GL was
 * correct — only the statement endpoint was broken. Customers with
 * non-trivial umrah activity saw understated AR.
 *
 * Match rule for umrah_sales_invoices: a row belongs to the customer
 * if either (a) clientId directly references them OR (b) their
 * subAgentId resolves to a sub-agent whose clientId is the customer
 * (the common path — sub-agents are who actually pay).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-reports.ts"),
  "utf8",
);

describe("/reports/customer-statement/:clientId — umrah AR inclusion", () => {
  it("defines a single umrahMatchSql clause so the rule is consistent across all 4 queries", () => {
    // The same WHERE pattern must apply to (1) opening-balance invoices,
    // (2) in-period invoices, (3) aging, (4) opening-balance payments —
    // dedupe via a shared SQL fragment, not 4 copy-pastes that can
    // drift apart silently.
    expect(ROUTE).toMatch(/const umrahMatchSql = `\(u\."clientId" = \$1/);
    expect(ROUTE).toMatch(/EXISTS \(\s*SELECT 1 FROM umrah_sub_agents sa[\s\S]{1,400}sa\."clientId" = \$1/);
    expect(ROUTE).toMatch(/sa\."deletedAt" IS NULL/);
  });

  it("opening balance includes umrah sales invoices BEFORE startDate", () => {
    // Without this, the statement's running balance starts from a
    // number that doesn't match the prior period's ending balance —
    // a "lost" reconciliation bug operators chase for hours.
    expect(ROUTE).toMatch(/COALESCE\(SUM\(u\.total\), 0\) AS total[\s\S]{1,400}FROM umrah_sales_invoices u[\s\S]{1,400}u\."createdAt" < \$3/);
  });

  it("opening balance subtracts umrah payments BEFORE startDate", () => {
    // umrah_payments.sarAmount is the canonical SAR figure (handles
    // multi-currency payments). paymentDate (not createdAt) is the
    // cash-effective date.
    expect(ROUTE).toMatch(/COALESCE\(SUM\(up\."sarAmount"\), 0\) AS total[\s\S]{1,600}FROM umrah_payments up[\s\S]{1,600}up\."paymentDate" < \$3/);
  });

  it("in-period movements include umrah sales invoices in the timeline", () => {
    expect(ROUTE).toMatch(/SELECT u\.id, u\.ref, u\."createdAt" AS date, u\.total AS debit, 0 AS credit[\s\S]{1,500}'umrah_sales_invoice' AS "movementType"/);
    // Description is operator-readable Arabic so the row is
    // distinguishable from core-finance invoices in the timeline.
    expect(ROUTE).toMatch(/CONCAT\('فاتورة عمرة ', COALESCE\(u\.ref, CONCAT\('#', u\.id\)\)\)/);
  });

  it("in-period movements include umrah payments (credit side)", () => {
    expect(ROUTE).toMatch(/up\."paymentDate" AS date, 0 AS debit, up\."sarAmount" AS credit[\s\S]{1,400}'umrah_payment' AS "movementType"/);
    expect(ROUTE).toMatch(/CONCAT\('دفعة عمرة \(', COALESCE\(up\.method,'manual'\)/);
  });

  it("merges umrah rows into the existing sorted timeline (one array, one sort)", () => {
    // Sorting once at the end keeps the running balance correct
    // regardless of insertion order. The merge MUST include all 4
    // sources or the running balance jumps backwards.
    expect(ROUTE).toMatch(/\[\.\.\.\s*invoices,\s*\.\.\.\s*payments,\s*\.\.\.\s*umrahInvoices,\s*\.\.\.\s*umrahPayments\s*\]\.sort/);
  });

  it("aging buckets include OPEN umrah sales invoices", () => {
    // Without this, the aging total understates AR — a customer
    // with SAR 50,000 in unpaid umrah invoices shows as "current 0,
    // 30-day 0..." instead of the correct overdue position.
    expect(ROUTE).toMatch(/FROM umrah_sales_invoices u[\s\S]{0,600}\(u\.total - COALESCE\(u\."paidAmount",0\)\) > 0\.01/);
    // The umrah aging result is pushed into openInvoices so the
    // SAME bucket loop bins it (no duplicate bucket logic).
    expect(ROUTE).toMatch(/openInvoices\.push\(\.\.\.openUmrahInvoices\)/);
  });

  it("branch scoping applies to umrah queries too (no cross-branch leak)", () => {
    // A user with allowedBranches = [3] must not see Branch 1's
    // umrah sales invoices on their customer statement. Match the
    // same `csBranchIds` filter shape used by the core queries.
    expect(ROUTE).toMatch(/u\."branchId" = ANY\(\$\$\{[a-zA-Z]+\.length\}::int\[\]\)/);
    expect(ROUTE).toMatch(/up\."branchId" = ANY\(\$\$\{[a-zA-Z]+\.length\}::int\[\]\)/);
  });

  it("umrah_sub_agents JOIN matches companyId AND filters deletedAt (defence-in-depth)", () => {
    // Same pattern as PR #1425 — without these guards a stale FK
    // could pull another tenant's umrah_sub_agents row into the
    // EXISTS clause and let a foreign payment satisfy the match.
    expect(ROUTE).toMatch(/sa\."companyId" = up\."companyId"[\s\S]{0,200}sa\."deletedAt" IS NULL/);
  });
});
