import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// COGS wiring on POST /invoices/:id/approve — follow-up to #1002
// (COGS foundation). Verifies the approve handler now:
//   1. selects quantity from invoice_lines so the planner has it,
//   2. calls planCogsForInvoice with companyId + invoiceId + per-
//      line input (productId, quantity, dimensions),
//   3. BLOCKS approval on insufficient_stock warnings,
//   4. logs (but doesn't block) for other warning categories,
//   5. appends the planner's journalLines into the same JE the
//      revenue + AR + VAT lines belong to,
//   6. writes cogsAmount + cogsUnitCost + cogsAllocationJson +
//      cogsPostedAt back onto invoice_lines after the JE posts,
//   7. updates invoices.cogsTotal,
//   8. applies the stock movements (lots + warehouse_movements).

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

// Isolate the approve handler so assertions stay scoped to it.
const HANDLER_START = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/approve"');
// Next route on the file.
const HANDLER_END = ROUTE.indexOf("// ─────────────────────────────────────────────────────────────────────────────\n// POSTING PREVIEW", HANDLER_START);
const HANDLER = ROUTE.slice(HANDLER_START, HANDLER_END);

describe("approve handler reads quantity for COGS", () => {
  it("invoice_lines SELECT now picks up quantity::text", () => {
    expect(HANDLER).toMatch(/quantity::text AS quantity/);
  });
});

describe("approve handler runs planCogsForInvoice", () => {
  it("dynamically imports both planner + stock-mover", () => {
    expect(HANDLER).toContain('await import(\n        "../lib/inventory/cogsPosting.js"\n      )');
    expect(HANDLER).toContain("planCogsForInvoice");
    expect(HANDLER).toContain("applyStockMovements");
  });
  it("passes companyId + invoiceId + branchId + per-line input", () => {
    expect(HANDLER).toMatch(/companyId: scope\.companyId/);
    expect(HANDLER).toMatch(/invoiceId: id,/);
    expect(HANDLER).toMatch(/lines: dimLines\.rows\.map/);
    expect(HANDLER).toMatch(/quantity: Number\(r\.quantity \?\? 0\)/);
    expect(HANDLER).toMatch(/productId: r\.productId/);
  });
  it("forwards costCenterId / projectId / employeeId so COGS keeps dimensions", () => {
    expect(HANDLER).toMatch(/costCenterId: r\.costCenterId/);
    expect(HANDLER).toMatch(/projectId: r\.projectId/);
    expect(HANDLER).toMatch(/employeeId: r\.employeeId/);
  });
});

describe("approve handler BLOCKS on insufficient stock", () => {
  it("filters warnings by insufficient_stock and throws ValidationError", () => {
    expect(HANDLER).toMatch(/shortages = cogsPlan\.warnings\.filter/);
    expect(HANDLER).toMatch(/w\.reason === "insufficient_stock"/);
    expect(HANDLER).toMatch(/throw new ValidationError/);
    expect(HANDLER).toContain("مخزون غير كافٍ");
  });
  it("non-fatal warnings are logged, not thrown", () => {
    expect(HANDLER).toMatch(/cogsPlan\.warnings\.length > 0/);
    expect(HANDLER).toMatch(/logger\.warn[\s\S]{0,250}skipped COGS posting/);
  });
});

describe("approve handler splices COGS into the JE", () => {
  it("postJournalEntry lines array spreads cogsPlan.journalLines", () => {
    expect(HANDLER).toMatch(/\.\.\.cogsPlan\.journalLines/);
  });
  it("AR debit + revenue credits + VAT credit stay header-level", () => {
    // Sanity check — we did NOT remove the existing legs.
    expect(HANDLER).toMatch(/accountCode: invArCode, debit: Number\(invoice\.total\)/);
    expect(HANDLER).toMatch(/\.\.\.revenueLines/);
    expect(HANDLER).toMatch(/accountCode: invVatPayableCode/);
  });
});

describe("approve handler persists per-line + header COGS snapshots", () => {
  it("UPDATE invoices SET journalEntryId AND cogsTotal", () => {
    expect(HANDLER).toMatch(/UPDATE invoices SET "journalEntryId" = \$1, "cogsTotal" = \$2/);
  });
  it("per-line UPDATE invoice_lines writes cogsAmount / cogsUnitCost / cogsAllocationJson / cogsPostedAt", () => {
    expect(HANDLER).toMatch(/UPDATE invoice_lines/);
    expect(HANDLER).toContain('"cogsAmount"');
    expect(HANDLER).toContain('"cogsUnitCost"');
    expect(HANDLER).toContain('"cogsAllocationJson"');
    expect(HANDLER).toMatch(/"cogsPostedAt" = NOW\(\)/);
  });
  it("cogsAllocationJson is serialised through JSON.stringify", () => {
    expect(HANDLER).toMatch(/JSON\.stringify\(snap\.allocations\)/);
  });
  it("snapshot loop skipped on idempotent replay", () => {
    expect(HANDLER).toMatch(/!alreadyExists && cogsPlan\.journalLines\.length > 0/);
  });
  it("applyStockMovements runs inside the same withTransaction client", () => {
    expect(HANDLER).toMatch(/applyStockMovements\(\s*client as any/);
  });
});
