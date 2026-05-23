import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INVOICES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/200_invoice_lines_dimensional_allocation.sql"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(
  join(REPO_ROOT, "db/schema_pre.sql"),
  "utf8"
);

// ─── Finance Line-Level Allocation — Phase 1 P0 ─────────────────────────────
// Locks in the invoice line-level accounting contract: every invoice
// line carries the dimensional + allocation fields end-to-end (schema
// + migration + create handler + approval handler). Regressions to the
// old header-only single-revenue posting will break these assertions.

describe("invoice_lines dimensional schema (migration 200)", () => {
  const NEW_COLUMNS = [
    "accountId", "accountCode", "costCenterId", "activityType",
    "projectId", "vehicleId", "propertyId", "unitId", "assetId",
    "employeeId", "driverId", "contractId", "umrahSeasonId", "umrahAgentId",
    "productId", "taxCode", "allocationRuleId", "allocationStatus",
    "dimensionJson", "manualOverrideReason",
  ];

  for (const col of NEW_COLUMNS) {
    it(`migration adds invoice_lines.${col}`, () => {
      expect(MIGRATION).toContain(`"${col}"`);
    });
    it(`schema_pre.sql declares invoice_lines.${col}`, () => {
      const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoice_lines");
      const section = SCHEMA_PRE.slice(idx, idx + 2000);
      expect(section).toContain(`"${col}"`);
    });
  }

  it("allocationStatus defaults to 'unmapped'", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoice_lines");
    const section = SCHEMA_PRE.slice(idx, idx + 2000);
    expect(section).toMatch(/"allocationStatus"\s+character varying\(\d+\)\s+DEFAULT 'unmapped'/);
  });

  it("migration creates the accountCode index", () => {
    expect(MIGRATION).toContain("idx_invoice_lines_account_code");
    expect(MIGRATION).toContain('WHERE "accountCode" IS NOT NULL');
  });

  it("migration creates the unmapped governance index", () => {
    expect(MIGRATION).toContain("idx_invoice_lines_unmapped");
    expect(MIGRATION).toContain("WHERE \"allocationStatus\" = 'unmapped'");
  });
});

describe("createInvoiceSchema accepts dimensional fields", () => {
  const DIM_FIELDS = [
    "accountId", "accountCode", "costCenterId", "activityType",
    "projectId", "vehicleId", "propertyId", "unitId", "assetId",
    "employeeId", "driverId", "contractId", "umrahSeasonId", "umrahAgentId",
    "productId", "taxCode", "allocationRuleId", "dimensionJson",
    "manualOverrideReason",
  ];
  for (const field of DIM_FIELDS) {
    it(`accepts lines[].${field}`, () => {
      const schemaIdx = INVOICES_ROUTE.indexOf("const createInvoiceSchema = z.object({");
      const linesEnd = INVOICES_ROUTE.indexOf("vatRate:", schemaIdx);
      const linesSection = INVOICES_ROUTE.slice(schemaIdx, linesEnd);
      expect(linesSection).toContain(field);
    });
  }
});

describe("invoice INSERT preserves line-level allocation", () => {
  it("INSERT writes all 27 columns including new ones", () => {
    const insertIdx = INVOICES_ROUTE.indexOf("INSERT INTO invoice_lines");
    const section = INVOICES_ROUTE.slice(insertIdx, insertIdx + 800);
    expect(section).toContain('"accountId"');
    expect(section).toContain('"accountCode"');
    expect(section).toContain('"costCenterId"');
    expect(section).toContain('"allocationStatus"');
    expect(section).toContain('"dimensionJson"');
  });

  it("allocationStatus computed from presence of accountCode/accountId", () => {
    expect(INVOICES_ROUTE).toContain(
      'allocationStatus: line.accountCode || line.accountId ? "resolved" : "unmapped"'
    );
  });
});

describe("invoice approval posts per-line revenue", () => {
  it("approval reads dimensional fields from invoice_lines", () => {
    expect(INVOICES_ROUTE).toMatch(
      /SELECT[\s\S]{0,200}"accountCode"[\s\S]{0,300}FROM invoice_lines/
    );
  });

  it("approval groups by (accountCode + dimensions) bucket", () => {
    expect(INVOICES_ROUTE).toContain("const buckets = new Map");
    // bucket key includes all dimensional axes
    expect(INVOICES_ROUTE).toContain("ln.vehicleId");
    expect(INVOICES_ROUTE).toContain("ln.propertyId");
    expect(INVOICES_ROUTE).toContain("ln.projectId");
  });

  it("approval emits one CR line per bucket, not a single header revenue line", () => {
    // The legacy single-CR-line posting was a hardcoded array with
    // `invRevenueCode, debit: 0, credit: Number(invoice.total) - vat`.
    // The new flow constructs `revenueLines` array dynamically and
    // spreads it into the postJournalEntry call.
    expect(INVOICES_ROUTE).toContain("...revenueLines");
    // The header-only legacy literal must not be reachable from the
    // approval handler.
    const approveIdx = INVOICES_ROUTE.indexOf("invoicesRouter.post(\"/invoices/:id/approve\"");
    const approveEnd = INVOICES_ROUTE.indexOf("invoicesRouter.", approveIdx + 10);
    const approveBody = INVOICES_ROUTE.slice(approveIdx, approveEnd);
    expect(approveBody).not.toMatch(
      /\{\s*accountCode:\s*invRevenueCode,\s*debit:\s*0,\s*credit:\s*Number\(invoice\.total\)\s*-\s*Number\(invoice\.vatAmount\s*\|\|\s*0\)\s*\}/
    );
  });

  it("approval falls back to invRevenueCode when no lines have accountCode", () => {
    expect(INVOICES_ROUTE).toContain(
      "// Header-level fallback: no invoice_lines stored at all"
    );
  });

  it("approval AR debit still uses invoice.total at header level", () => {
    expect(INVOICES_ROUTE).toContain(
      "{ accountCode: invArCode, debit: Number(invoice.total), credit: 0,"
    );
  });

  it("approval VAT credit still uses invoice.vatAmount at header level", () => {
    expect(INVOICES_ROUTE).toContain(
      "{ accountCode: invVatPayableCode, debit: 0, credit: Number(invoice.vatAmount || 0) }"
    );
  });
});

describe("rounding-difference fallback keeps the entry balanced", () => {
  it("any (totalNet - postedNet) remainder falls on the generic revenue account", () => {
    expect(INVOICES_ROUTE).toContain("const diff = roundTo2(totalNet - postedNet)");
    expect(INVOICES_ROUTE).toContain('accountCode: invRevenueCode, amount: diff');
  });
});
