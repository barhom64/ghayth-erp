import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Closes the last umrah↔finance integration gap (vendor side):
 *
 *   - Migration 239 adds companies.nuskSupplierId so each tenant can
 *     designate which supplier row represents NUSK.
 *
 *   - The vendor-statement endpoint detects that match and includes
 *     umrah_nusk_invoices in opening balance / in-period / aging.
 *     Non-NUSK suppliers behave identically to before (no regression).
 *
 *   - Both customer- and vendor-statement endpoints accept an optional
 *     `?seasonId=` query param so the umrah rows can be scoped to a
 *     single season (the operator's "show me this season's nusk only"
 *     ask).
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/239_companies_nusk_supplier_link.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-reports.ts"),
  "utf8",
);

describe("migration 239 — companies.nuskSupplierId", () => {
  it("adds nuskSupplierId as nullable integer (additive — old companies stay valid)", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE companies\s+ADD COLUMN IF NOT EXISTS "nuskSupplierId" integer/);
  });

  it("documents the rollback path", () => {
    expect(MIGRATION).toMatch(/-- @rollback: ALTER TABLE companies DROP COLUMN IF EXISTS "nuskSupplierId"/);
  });

  it("schema_pre.sql mirrors the column on the companies table", () => {
    const block = SCHEMA.match(/CREATE TABLE public\.companies \(([\s\S]*?)\);/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/"nuskSupplierId" integer/);
  });
});

describe("/reports/vendor-statement/:supplierId — NUSK integration", () => {
  it("loads the company's nuskSupplierId and compares against the URL supplier", () => {
    expect(ROUTE).toMatch(/SELECT "nuskSupplierId" FROM companies WHERE id = \$1/);
    expect(ROUTE).toMatch(/const isNuskSupplier = companyCfg\?\.nuskSupplierId === supplierId/);
  });

  it("non-NUSK suppliers skip the umrah work (no extra round-trips)", () => {
    // The gate must be the FIRST check inside each umrah branch so
    // a wrong-supplier statement doesn't pay the NUSK-query cost.
    expect(ROUTE).toMatch(/if \(isNuskSupplier\) \{[\s\S]{1,1200}FROM umrah_nusk_invoices/);
  });

  it("opening balance adds NUSK totals before startDate, net of refunds", () => {
    expect(ROUTE).toMatch(/SUM\("totalAmount" - COALESCE\("refundAmount",0\)\)[\s\S]{0,300}FROM umrah_nusk_invoices/);
    expect(ROUTE).toMatch(/openingBalance = Number\(obPORow\?\.total \?\? 0\) \+ obNuskAmount - Number\(obPayRow\?\.total \?\? 0\)/);
  });

  it("in-period merges NUSK rows into the same sorted timeline", () => {
    expect(ROUTE).toMatch(/\[\.\.\.\s*pos,\s*\.\.\.\s*payRows,\s*\.\.\.\s*nuskMovements\s*\]\.sort/);
    expect(ROUTE).toMatch(/'umrah_nusk_invoice' AS "movementType"/);
    expect(ROUTE).toMatch(/CONCAT\('فاتورة نسك ', "nuskInvoiceNumber"\)/);
  });

  it("aging buckets include open NUSK invoices (nuskStatus filter)", () => {
    // Open = not paid/cancelled/refunded. Same bucket loop as PO
    // rows, so the math is single-sourced.
    expect(ROUTE).toMatch(/"nuskStatus" NOT IN \('paid','cancelled','refunded'\)/);
    expect(ROUTE).toMatch(/for \(const inv of openNuskInvoices\)/);
  });

  it("NUSK aging uses createdAt + 30 days as the implicit due (no dueDate column)", () => {
    // umrah_nusk_invoices has no dueDate, so the bucketer needs a
    // sensible default. +30 days matches the AP industry convention
    // and the same fallback the PO loop uses for delivery-less rows.
    expect(ROUTE).toMatch(/openNuskInvoices[\s\S]{0,500}new Date\(inv\.createdAt as string \| Date\)\.getTime\(\) \+ 30 \* 86400000/);
  });
});

describe("both statements — optional ?seasonId= filter on umrah rows", () => {
  it("vendor statement parses seasonId from req.query with digit-only validation", () => {
    // /^\d+$/ guards against SQL-injection via the query param. The
    // resulting `seasonIdNum` is bound as a parameter, not interpolated.
    expect(ROUTE).toMatch(/const seasonIdNum = seasonIdRaw && \/\^\\d\+\$\/\.test\(seasonIdRaw\) \? Number\(seasonIdRaw\) : null/);
  });

  it("customer statement uses the same seasonIdNum parser", () => {
    // Both endpoints' season filter is keyed on the same parse
    // logic — duplicated literally rather than refactored so the
    // two endpoints don't develop divergent definitions of "valid
    // seasonId" silently.
    const customerHandler = ROUTE.match(/"\/reports\/customer-statement\/:clientId"[\s\S]*?(?=reportsRouter\.(?:get|post|patch|put|delete)\()/);
    expect(customerHandler).not.toBeNull();
    expect(customerHandler![0]).toMatch(/const seasonIdNum = seasonIdRaw && \/\^\\d\+\$\/\.test\(seasonIdRaw\) \? Number\(seasonIdRaw\) : null/);
  });

  it("customer statement filters all 3 umrah_sales_invoices queries by seasonId", () => {
    // The seasonId filter must apply to: opening-balance, in-period
    // invoices, and aging — otherwise the running balance vs. aging
    // total stops reconciling.
    const matches = ROUTE.match(/u\."seasonId" = \$\$\{[a-zA-Z]+\.length\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("vendor statement filters all 3 NUSK queries by seasonId", () => {
    const matches = ROUTE.match(/"seasonId" = \$\$\{[a-zA-Z]+\.length\}/g) ?? [];
    // 3 customer queries (u."seasonId" =) + 3 vendor queries
    // ("seasonId" = without u prefix because the NUSK queries don't
    // alias the table).
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });
});
