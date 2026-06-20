import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P11-VENDOR-INVOICE-WORKSPACE (#2241) — vendor invoice (supplier bill)
 * static contract. A SEPARATE entry path from the fuel/expense path: a vendor
 * invoice posts a MULTI-LINE journal whose single credit leg is the supplier
 * PAYABLE (purchase_vendor_ap → 2111) when آجل, or the money source when paid.
 * Lines carry accountPurpose (TEXT — engine-resolved); the UI/memory never carry
 * a GL code. vendorId rides every line. The expense path is untouched.
 */
const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");
const PLAN = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/vendorInvoiceJournalPlan.ts"), "utf8");
const FORM = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/vendor-invoice-create.tsx"), "utf8");
const ROUTES = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/financeRoutes.tsx"), "utf8");
const MEMORY = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/lib/financial-memory.ts"), "utf8");

describe("#2241 backend pure plan module", () => {
  it("exports the vendor-invoice line builder + evaluator", () => {
    expect(PLAN).toContain("export function buildVendorInvoiceLines");
    expect(PLAN).toContain("export function evaluateVendorInvoicePlan");
  });
  it("stamps vendorId on every line and supports paid (source) vs credit (AP) leg", () => {
    expect(PLAN).toContain("vendorId: input.vendorId");
    expect(PLAN).toContain("input.paid");
    expect(PLAN).toContain("apAccountCode");
    expect(PLAN).toContain("sourceAccountCode");
  });
});

describe("#2241 backend routes (finance-journal)", () => {
  it("exposes POST /vendor-invoices + /vendor-invoices/impact-preview", () => {
    expect(ROUTE).toContain('journalRouter.post("/vendor-invoices/impact-preview"');
    expect(ROUTE).toContain('journalRouter.post("/vendor-invoices"');
  });
  it("resolves the supplier payable via purchase_vendor_ap and validates the supplier belongs to the company", () => {
    expect(ROUTE).toContain('"purchase_vendor_ap"');
    expect(ROUTE).toContain("assertVendorBelongsToCompany");
    expect(ROUTE).toContain('FROM suppliers WHERE id = $1 AND "companyId" = $2');
  });
  it("rejects a money source on a credit invoice / requires it on a paid invoice", () => {
    expect(ROUTE).toContain("لا مصدر صرف في الفاتورة الآجلة");
    expect(ROUTE).toContain("اختر مصدر الصرف للفاتورة المدفوعة");
  });
  it("requires an attachment and posts with sourceType vendor_invoice + idempotency", () => {
    expect(ROUTE).toContain('checkAttachmentRequired({ operationType: "vendor_invoice"');
    expect(ROUTE).toContain('sourceType: "vendor_invoice"');
    expect(ROUTE).toContain("VINV-");
    expect(ROUTE).toContain("finance:vendor_invoice:");
  });
  it("writes audit + emits finance.vendor_invoice.created", () => {
    expect(ROUTE).toContain('action: "vendor_invoice.created"');
    expect(ROUTE).toContain('action: "finance.vendor_invoice.created"');
  });
  it("builds lines through the shared builder + evaluates via the shared evaluator", () => {
    expect(ROUTE).toContain("buildVendorInvoiceLines");
    expect(ROUTE).toContain("evaluateVendorInvoicePlan");
  });
  it("resolves each line's account from its accountPurpose (TEXT, engine-resolved)", () => {
    expect(ROUTE).toContain("line.accountPurpose");
    expect(ROUTE).toContain("financialEngine.resolveAccountCode");
  });
  it("does NOT touch buildExpenseLines for the vendor-invoice path", () => {
    // the vendor invoice save path posts through the shared resolver
    // (resolveVendorInvoicePlan → buildVendorInvoiceLines), NOT buildExpenseLines.
    const viBlock = ROUTE.slice(ROUTE.indexOf('journalRouter.post("/vendor-invoices"'));
    expect(viBlock).toContain("resolveVendorInvoicePlan");
    expect(viBlock).not.toContain("buildExpenseLines(");
  });
});

describe("#2241 frontend page (vendor-invoice-create)", () => {
  it("uses SupplierSelect + multi-line state + attachment viewer", () => {
    expect(FORM).toContain("SupplierSelect");
    expect(FORM).toContain("useState<VendorInvoiceLine[]>");
    expect(FORM).toContain("FinancialAttachmentViewer");
    expect(FORM).toContain('mode="create"');
  });
  it("wires the impact-preview endpoint and gates save on blockers", () => {
    expect(FORM).toContain('endpoint="/finance/vendor-invoices/impact-preview"');
    expect(FORM).toContain("setJournalBlockers");
    expect(FORM).toContain("journalBlockers.length > 0");
  });
  it("posts to /finance/vendor-invoices and toggles paid/credit source", () => {
    expect(FORM).toContain('useApiMutation("/finance/vendor-invoices", "POST"');
    expect(FORM).toContain("setPaidToggle");
    expect(FORM).toContain("filterAccountsForPaymentMethod");
  });
  it("uses the memory hooks (supplier defaults + supplier items) and accountPurpose (no GL code)", () => {
    expect(FORM).toContain("useSupplierFinanceDefaults");
    expect(FORM).toContain("useSupplierItems");
    expect(FORM).toContain("accountPurpose");
    expect(FORM).toContain("SupplierItemPicker");
  });
  it("uses the sticky left aside grid (mirrors expenses-create)", () => {
    expect(FORM).toContain("lg:grid-cols-[1fr_360px]");
    expect(FORM).toContain("lg:sticky");
  });
});

describe("#2241 route registration + memory hook", () => {
  it("financeRoutes registers /finance/vendor-invoices/create lazily", () => {
    expect(ROUTES).toContain("vendor-invoice-create");
    expect(ROUTES).toContain('path: "/finance/vendor-invoices/create"');
  });
  it("financial-memory exposes useSupplierItems (engine-authoritative, accountPurpose only)", () => {
    expect(MEMORY).toContain("export function useSupplierItems");
    expect(MEMORY).toContain("/warehouse/suppliers/");
    expect(MEMORY).toContain("accountPurpose");
  });
});
