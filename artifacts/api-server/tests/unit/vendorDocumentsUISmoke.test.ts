/**
 * #2140 slice 2 — vendor documents UI smoke (مستندات الموردين).
 *
 * Three backend-complete AP document services (advances / credit memos /
 * vendor invoices — the AP mirrors of the customer-side documents) had
 * no page. Pins: all nine endpoints wired, Arabic status vocabularies
 * match the derived statuses the handlers actually write, apply dialog
 * carries the poId+amount contract, and the page is reachable (route +
 * sidebar) so it can never regress into an orphan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PAGE = read("artifacts/ghayth-erp/src/pages/finance/vendor-documents.tsx");
const ROUTES = read("artifacts/ghayth-erp/src/routes/financeRoutes.tsx");
const SIDEBAR = read("artifacts/ghayth-erp/src/components/layout/navigation.registry.ts");
const BACKEND = read("artifacts/api-server/src/routes/finance-purchase.ts");

describe("vendor-documents page — all nine endpoints wired", () => {
  it("lists the three document types", () => {
    expect(PAGE).toContain('"/finance/vendor-advances"');
    expect(PAGE).toContain('"/finance/vendor-credits"');
    expect(PAGE).toContain('"/finance/vendor-invoices"');
  });
  it("creates all three via POST with the backend create contracts", () => {
    // advance: supplierId+amount (+method/reference/notes)
    expect(PAGE).toMatch(/supplierId: number; amount: number; method\?: string/);
    // credit: supplierId+amount+reason (+poId)
    expect(PAGE).toMatch(/supplierId: number; amount: number; reason: string; poId\?: number/);
    // invoice: supplierId+ref+invoiceDate+subtotal (+vat/dueDate/poId)
    expect(PAGE).toMatch(/supplierId: number; ref: string; invoiceDate: string/);
  });
  it("applies advances and credits against a purchase order (poId + amount)", () => {
    expect(PAGE).toContain("/finance/vendor-advances/${b.id}/apply");
    expect(PAGE).toContain("/finance/vendor-credits/${b.id}/apply");
    expect(PAGE).toMatch(/\{ id: number; poId: number; amount: number \}/);
  });
  it("supporting lists come from the canonical finance sources", () => {
    expect(PAGE).toContain('"/finance/vendors?limit=500"');
    expect(PAGE).toContain('"/finance/purchase-orders?limit=500"');
  });
});

describe("status vocabulary matches what the backend handlers write", () => {
  it("derived statuses the handlers actually write (open → applied; invoices created approved) labelled in Arabic", () => {
    // open/applied are written by the apply CASE; approved by the invoice INSERT.
    expect(BACKEND).toMatch(/THEN 'applied' ELSE status END/);
    expect(BACKEND).toMatch(/'approved',\$13\) RETURNING id/);
    for (const s of ["open", "applied", "approved", "paid"]) {
      expect(PAGE).toMatch(new RegExp(`${s}:\\s*\\{ label: "[\\u0600-\\u06FF]`));
    }
  });
  it("the page does NOT invent payment statuses the backend never writes", () => {
    expect(PAGE).not.toContain("unpaid");
    expect(PAGE).not.toContain("partially_paid");
    expect(PAGE).not.toContain("fully_applied");
  });
  it("no manual status-mutation buttons — statuses are derived by apply/pay only", () => {
    expect(PAGE).not.toMatch(/status.*onClick|تغيير الحالة/);
  });
});

describe("navigation — reachable, no orphan", () => {
  it("route mounted", () => {
    expect(ROUTES).toContain('{ path: "/finance/vendor-documents", component: VendorDocuments }');
  });
  it("sidebar carries مستندات الموردين", () => {
    expect(SIDEBAR).toContain('path: "/finance/vendor-documents"');
    expect(SIDEBAR).toContain('"مستندات الموردين"');
  });
});

describe("permissions — frontend gates mirror authorize()", () => {
  it("every create/apply action is behind GuardedButton finance:create", () => {
    const guarded = PAGE.match(/GuardedButton perm="finance:create"/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(5); // 3 create + apply + dialog confirm
  });
  it("backend gates are finance.purchase list/create", () => {
    expect(BACKEND).toMatch(/"\/vendor-advances", authorize\(\{ feature: "finance.purchase", action: "create" \}/);
    expect(BACKEND).toMatch(/"\/vendor-invoices", authorize\(\{ feature: "finance.purchase", action: "list" \}/);
  });
});
