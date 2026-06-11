import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

// ─── Phase 5.5 — Preview consults the resolver too ──────────────────────────
// The Posting Preview now runs the same resolver as /approve. A line
// with no accountCode but a matching rule shows "resolved" with the
// rule's chosen account; un-matched lines surface as resolverWarnings
// pinned to the originating lineId so the UI can highlight them.

describe("preview resolves per-line allocations", () => {
  const idx = ROUTE.indexOf('"/invoices/:id/preview-posting"');
  const endIdx = ROUTE.indexOf("// ─", idx + 50);
  const handler = ROUTE.slice(idx, endIdx > idx ? endIdx : idx + 12000);

  it("dynamically imports accountingAllocation", () => {
    expect(handler).toContain('await import("../lib/accountingAllocation.js")');
  });

  it("calls resolveLineAllocation per invoice line", () => {
    expect(handler).toContain("resolveLineAllocation");
    expect(handler).toContain("Promise.all");
    expect(handler).toMatch(/lines\.map\(\(ln\)/);
  });

  it("does NOT call writeAllocationResult (preview is read-only)", () => {
    expect(handler).not.toContain("writeAllocationResult");
  });

  it("bucket builder reads res.resolvedAccountCode, not raw ln.accountCode", () => {
    expect(handler).toContain("res.resolvedAccountCode");
    // #1945 item 6 — the fallback chain gained the product revenue map
    // between the resolver output and the generic account:
    //   res.resolvedAccountCode || productRevenueCodes.get(productId) || invRevenueCode
    expect(handler).toMatch(/res\.resolvedAccountCode\s*\|\|[\s\S]*?productRevenueCodes[\s\S]*?\|\|\s*invRevenueCode/);
  });

  it("bucket dimensions come from resolver (dims.*)", () => {
    expect(handler).toContain("res.dimensions");
    expect(handler).toContain("dims.vehicleId");
    expect(handler).toContain("dims.propertyId");
    expect(handler).toContain("dims.projectId");
  });

  it("unmappedLineIds pushed when resolver returns status='unmapped'", () => {
    expect(handler).toMatch(/res\.status === "unmapped"[\s\S]{0,200}unmappedLineIds\.push/);
  });

  it("per-line resolverWarnings are collected", () => {
    expect(handler).toContain("resolverWarnings");
    expect(handler).toMatch(/for \(const w of res\.warnings\)[\s\S]{0,200}resolverWarnings\.push/);
  });

  it("preview output exposes ruleId + resolutionStatus per bucket", () => {
    expect(handler).toContain("ruleId: res.ruleId");
    expect(handler).toContain("resolutionStatus: res.status");
  });

  it("response payload includes resolverWarnings array", () => {
    expect(handler).toContain("resolverWarnings,");
  });
});

describe("read-only invariant preserved", () => {
  const idx = ROUTE.indexOf('"/invoices/:id/preview-posting"');
  // The preview handler ends at the next invoicesRouter. registration.
  const endIdx = ROUTE.indexOf("invoicesRouter.", idx + 50);
  const handler = ROUTE.slice(idx, endIdx > idx ? endIdx : idx + 12000);

  it("no INSERT / UPDATE / postJournalEntry / withTransaction", () => {
    expect(handler).not.toMatch(/INSERT\s+INTO/i);
    expect(handler).not.toMatch(/UPDATE\s+\w+\s+SET/i);
    expect(handler).not.toContain("postJournalEntry");
    expect(handler).not.toContain("withTransaction");
  });
});
