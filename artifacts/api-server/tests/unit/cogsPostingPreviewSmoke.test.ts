import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// COGS surfacing in /invoices/:id/preview-posting — audit follow-up
// to #1013. Without this, the only way an operator finds out a
// product is out of stock is by clicking approve and getting a 400.
// With this, the preview shows:
//   * COGS journal lines spliced into journalLines[],
//   * insufficient_stock as a blocker (disables approve button),
//   * other warnings (product_not_tracked / no_active_lots / …)
//     as per-line cogsWarnings the UI can pin to each line.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

// Isolate the preview handler.
const START = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/preview-posting"');
const END = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/post"', START);
const HANDLER = ROUTE.slice(START, END);

describe("preview handler reads quantity for the planner", () => {
  it("invoice_lines SELECT picks up quantity::text", () => {
    expect(HANDLER).toMatch(/quantity::text\s+AS quantity/);
  });
});

describe("preview handler runs planCogsForInvoice", () => {
  it("dynamically imports the planner", () => {
    expect(HANDLER).toContain('await import("../lib/inventory/cogsPosting.js")');
    expect(HANDLER).toContain("planCogsForInvoice");
  });
  it("uses the pool directly (preview must not hold a transaction)", () => {
    expect(HANDLER).toContain('await import("../lib/rawdb.js")');
    expect(HANDLER).toMatch(/await planCogsForInvoice\(cogsPool/);
    // The neighbouring `invoicePostingPreviewSmoke` test pins the absence
    // of withTransaction in the same handler; no need to re-assert here.
  });
  it("does NOT call applyStockMovements (preview never writes stock)", () => {
    // The string appears only in a comment explaining why we DON'T call
    // it — assert that no CALL exists by ruling out the call pattern.
    expect(HANDLER).not.toMatch(/await applyStockMovements\(/);
  });
  it("passes per-line input including productId / quantity / dimensions", () => {
    expect(HANDLER).toMatch(/invoiceLineId: r\.id/);
    expect(HANDLER).toMatch(/quantity: Number\(r\.quantity \?\? 0\)/);
    expect(HANDLER).toMatch(/productId: r\.productId/);
    expect(HANDLER).toMatch(/costCenterId: r\.costCenterId/);
  });
});

describe("preview surfaces insufficient_stock as a blocker", () => {
  it("filters warnings by insufficient_stock and pushes to blockers[]", () => {
    expect(HANDLER).toMatch(/w\.reason === "insufficient_stock"/);
    expect(HANDLER).toContain("blockers.push");
    expect(HANDLER).toContain("مخزون غير كافٍ");
  });
  it("blocker field points at the offending line (invoice_lines[N])", () => {
    expect(HANDLER).toMatch(/field: `invoice_lines\[\$\{w\.invoiceLineId\}\]`/);
  });
});

describe("preview splices COGS lines into journalLines", () => {
  it("loops cogsPreviewLines and pushes onto previewLines", () => {
    expect(HANDLER).toMatch(/for \(const cl of cogsPreviewLines\)/);
    expect(HANDLER).toMatch(/previewLines\.push\(\{[\s\S]{0,200}accountCode: cl\.accountCode/);
  });
});

describe("preview response exposes cogsWarnings + cogsTotal", () => {
  it("res.json includes cogsWarnings: [{ lineId, productId, reason, detail? }]", () => {
    expect(HANDLER).toMatch(/cogsWarnings,/);
  });
  it("res.json includes cogsTotal", () => {
    expect(HANDLER).toMatch(/cogsTotal,/);
  });
});

describe("preview degrades gracefully if planner throws", () => {
  it("wraps planner call in try/catch and logs without 500", () => {
    expect(HANDLER).toMatch(/try \{\s*[\s\S]{0,200}const cogsPlan = await planCogsForInvoice/);
    expect(HANDLER).toMatch(/catch \(err\) \{[\s\S]{0,300}logger\.warn/);
  });
  it("adds a soft warning so operator knows COGS is hidden", () => {
    expect(HANDLER).toMatch(/تعذّر حساب تكلفة البضاعة/);
  });
});
