import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8"
);

// ─── Phase 5.4 — wire resolver into GRN posting ─────────────────────────────
// The resolver (#975) now also drives the per-line DR account on
// GRN approval. Rules win over the static TREATMENT_PURPOSE map
// (Phase 4.2); operator pins still win over rules; un-matched
// lines fall through TREATMENT_PURPOSE → defaultInvAccount.

describe("resolver wiring on GRN", () => {
  it("dynamically imports accountingAllocation", () => {
    expect(ROUTE).toContain('await import("../lib/accountingAllocation.js")');
  });

  it("calls resolveLineAllocation per receipt line", () => {
    expect(ROUTE).toContain("resolveLineAllocation");
    expect(ROUTE).toMatch(/receiptLineRows\.map\(\(ln\)/);
  });

  it("passes documentType='grn'", () => {
    expect(ROUTE).toMatch(/documentType:\s*"grn"/);
  });

  it("passes lineType from lineTreatment", () => {
    expect(ROUTE).toMatch(/lineType:\s*ln\.lineTreatment/);
  });

  it("passes entityType='vendor'", () => {
    expect(ROUTE).toMatch(/entityType:\s*"vendor"/);
  });

  it("sourceTable + sourceLineId point at goods_receipt_items", () => {
    expect(ROUTE).toContain('sourceTable: "goods_receipt_items"');
    expect(ROUTE).toMatch(/sourceLineId:\s*ln\.id/);
  });

  it("passes vendorId in dimensions", () => {
    expect(ROUTE).toMatch(/vendorId:\s*po\.supplierId/);
  });
});

describe("posting uses resolver output", () => {
  it("bucket loop reads res.resolvedAccountCode first", () => {
    expect(ROUTE).toContain("let acct = res.resolvedAccountCode");
  });

  it("bucket loop reads resolver dimensions (dims.*)", () => {
    expect(ROUTE).toContain("res.dimensions");
    expect(ROUTE).toContain("dims.vehicleId");
    expect(ROUTE).toContain("dims.propertyId");
  });

  it("preserves TREATMENT_PURPOSE fallback when resolver returns null", () => {
    // After `if (!acct) { ...TREATMENT_PURPOSE... }` the second
    // fallback to defaultInvAccount remains.
    expect(ROUTE).toContain("TREATMENT_PURPOSE[ln.lineTreatment]");
    expect(ROUTE).toContain("if (!acct) acct = defaultInvAccount");
  });
});

describe("writeAllocationResult is called per receipt line", () => {
  it("imports writeAllocationResult", () => {
    expect(ROUTE).toContain("writeAllocationResult");
  });

  it("runs only when GRN JE was actually new (not on idempotent replay)", () => {
    expect(ROUTE).toMatch(/if \(!grnJournalResult\.alreadyExists\)/);
  });

  it("loops over receiptLineRows and writes one result per line", () => {
    const idx = ROUTE.indexOf("writeAllocationResult(\n");
    expect(idx).toBeGreaterThan(-1);
    const beforeCall = ROUTE.slice(Math.max(0, idx - 400), idx);
    expect(beforeCall).toMatch(/for \(let i = 0; i < receiptLineRows\.length/);
  });

  it("writes documentType='grn'", () => {
    expect(ROUTE).toMatch(/documentType:\s*"grn"/);
  });
});
