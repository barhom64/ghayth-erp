import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins Phase 1 of the per-line VAT + GL-routing migration. Applies
 * the finance `invoice_items` pattern to `umrah_sales_invoice_items`:
 * each line carries its own productId / vatRate / vatAmount /
 * accountCode so future GL posting can split revenue and VAT
 * credits by line-type bucket.
 *
 *   تأشيرة 422 — vatRate=0 (zero-rated)
 *   خدمات 50  — vatRate=15
 *   نقل 200   — vatRate=15
 *
 * Phase 1 (this PR): schema + engine persists per-line values.
 * Phase 2 (next): GL posting reads accountCode + vatRate buckets
 *   instead of one lump JE line.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/240_umrah_sales_invoice_items_per_line_vat.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("migration 240 — umrah_sales_invoice_items per-line VAT columns", () => {
  it("adds productId / vatRate / vatAmount / accountCode (all nullable, additive)", () => {
    // Nullable + IF NOT EXISTS so the migration is idempotent and
    // old rows stay valid without a backfill.
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "productId" integer/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "vatRate" numeric\(5,2\) DEFAULT 15/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "vatAmount" numeric\(12,2\) DEFAULT 0/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "accountCode" varchar\(20\)/);
  });

  it("rollback drops all four columns (additive ⇒ trivial undo)", () => {
    expect(MIGRATION).toMatch(/-- @rollback: ALTER TABLE umrah_sales_invoice_items/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "accountCode"/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "vatAmount"/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "vatRate"/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "productId"/);
  });

  it("schema_pre.sql mirror has the new columns on umrah_sales_invoice_items", () => {
    const block = SCHEMA.match(/CREATE TABLE public\.umrah_sales_invoice_items \(([\s\S]*?)\);/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/"productId" integer/);
    expect(block![1]).toMatch(/"vatRate" numeric\(5,2\)/);
    expect(block![1]).toMatch(/"vatAmount" numeric\(12,2\)/);
    expect(block![1]).toMatch(/"accountCode" character varying\(20\)/);
  });
});

describe("InvoiceLineItem TS type — Phase 1 extensions", () => {
  it("interface declares the 4 new optional per-line fields", () => {
    expect(ENGINE).toMatch(/productId\?:\s*number \| null/);
    expect(ENGINE).toMatch(/vatRate\?:\s*number/);
    expect(ENGINE).toMatch(/vatAmount\?:\s*number/);
    expect(ENGINE).toMatch(/accountCode\?:\s*string \| null/);
  });
});

describe("engine INSERT — persists per-line VAT alongside the existing 8 columns", () => {
  it("column count bumped from 8 to 12 (4 new persisted fields)", () => {
    expect(ENGINE).toMatch(/const cols = 12;/);
  });

  it("INSERT statement names all 12 columns explicitly (no SELECT *)", () => {
    // Explicit column list keeps the bind-position contract
    // verifiable against the params.push order.
    expect(ENGINE).toMatch(/INSERT INTO umrah_sales_invoice_items[\s\S]{1,500}"productId","vatRate","vatAmount","accountCode"/);
  });

  it("vatRate falls back to the invoice-header vatRate (consistency)", () => {
    // Until Phase 2 wires a per-itemType resolver, every line uses
    // the same rate as the header so totals tie out exactly.
    expect(ENGINE).toMatch(/const lineVatRate = li\.vatRate \?\? vatRate/);
  });

  it("per-line vatAmount respects the SAME inclusive/exclusive mode as the header", () => {
    // §6 of #1870 — VAT direction is operator-configurable. The per-
    // line value is informational (sum-of-lines may exceed the header
    // when costBasis > 0 — line uses gross, header uses margin), but
    // it must follow the same formula as the header so ZATCA per-
    // line tax fields don't contradict the invoice-total tax.
    //
    //   inclusive:  lineVatAmount = lineTotal × rate / (100 + rate)   (extracted)
    //   exclusive:  lineVatAmount = lineTotal × rate / 100             (added)
    expect(ENGINE).toMatch(/li\.vatAmount \?\? \(vatInclusive[\s\S]{0,300}roundTo2\(li\.lineTotal \* lineVatRate \/ \(100 \+ lineVatRate\)\)[\s\S]{0,300}roundTo2\(li\.lineTotal \* lineVatRate \/ 100\)\)/);
  });

  it("productId + accountCode fall back to null until Phase 2 resolver", () => {
    expect(ENGINE).toMatch(/li\.productId \?\? null/);
    expect(ENGINE).toMatch(/li\.accountCode \?\? null/);
  });

  it("params.push order matches the column list (no silent off-by-one bugs)", () => {
    // Anchor on the literal push block — order MUST be:
    //   invoiceId, itemType, groupId, violationId, description,
    //   quantity, unitPrice, lineTotal,
    //   productId, vatRate, vatAmount, accountCode
    expect(ENGINE).toMatch(/params\.push\(\s*invoiceId,\s*li\.itemType,\s*li\.groupId,\s*li\.violationId,\s*li\.description,\s*li\.quantity,\s*li\.unitPrice,\s*li\.lineTotal,\s*li\.productId \?\? null,\s*lineVatRate,\s*lineVatAmount,\s*li\.accountCode \?\? null/);
  });
});
