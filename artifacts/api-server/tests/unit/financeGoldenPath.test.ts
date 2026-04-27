import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INV_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"), "utf8");
const JRN_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");

// ─── Finance Golden Path Tests ─────────────────────────────────────────────
// P4.8 — Lock in finance domain lifecycle contracts: invoices, journal
// entries, expenses, vouchers, salary advances, customer advances.

describe("Invoice route structure", () => {
  it("invoice CRUD endpoints exist", () => {
    expect(INV_ROUTE).toContain('invoicesRouter.get("/invoices"');
    expect(INV_ROUTE).toContain('invoicesRouter.post("/invoices"');
    expect(INV_ROUTE).toContain('invoicesRouter.patch("/invoices/:id"');
    expect(INV_ROUTE).toContain('invoicesRouter.delete("/invoices/:id"');
  });

  it("invoice lifecycle endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/invoices/:id/send"');
    expect(INV_ROUTE).toContain('"/invoices/:id/approve"');
    expect(INV_ROUTE).toContain('"/invoices/:id/payment"');
    expect(INV_ROUTE).toContain('"/invoices/:id/post"');
  });

  it("credit/debit memo endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/invoices/:id/credit-memo"');
    expect(INV_ROUTE).toContain('"/invoices/:id/debit-memo"');
    expect(INV_ROUTE).toContain('"/invoices/:id/memos"');
  });

  it("dunning endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/dunning/preview"');
    expect(INV_ROUTE).toContain('"/dunning/send"');
    expect(INV_ROUTE).toContain('"/dunning/history"');
  });

  it("customer advance endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/customer-advances"');
    expect(INV_ROUTE).toContain('"/customer-advances/:id/apply"');
  });

  it("bad debt endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/bad-debt/preview"');
    expect(INV_ROUTE).toContain('"/bad-debt/post"');
  });

  it("tax summary and declarations endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/tax/summary"');
    expect(INV_ROUTE).toContain('"/tax/declarations"');
  });

  it("invoice impact preview endpoint exists", () => {
    expect(INV_ROUTE).toContain('"/invoices/impact-preview"');
  });
});

describe("Invoice state machine", () => {
  it("defines INVOICE_STATUSES and INVOICE_TRANSITIONS", () => {
    expect(INV_ROUTE).toContain("INVOICE_STATUSES");
    expect(INV_ROUTE).toContain("INVOICE_TRANSITIONS");
  });

  it("invoice statuses include draft through cancelled", () => {
    expect(INV_ROUTE).toContain('"draft"');
    expect(INV_ROUTE).toContain('"approved"');
    expect(INV_ROUTE).toContain('"sent"');
    expect(INV_ROUTE).toContain('"partial"');
    expect(INV_ROUTE).toContain('"paid"');
    expect(INV_ROUTE).toContain('"overdue"');
    expect(INV_ROUTE).toContain('"cancelled"');
    expect(INV_ROUTE).toContain('"closed"');
    expect(INV_ROUTE).toContain('"posted"');
  });

  it("closed, cancelled, posted are terminal invoice states", () => {
    const idx = INV_ROUTE.indexOf("INVOICE_TRANSITIONS");
    const block = INV_ROUTE.slice(idx, idx + 700);
    expect(block).toContain("closed:    []");
    expect(block).toContain("cancelled: []");
    expect(block).toContain("posted:    []");
  });

  it("validates invoice status transitions", () => {
    expect(INV_ROUTE).toContain("INVOICE_TRANSITIONS[existing.status]");
  });
});

describe("Journal entry state machine", () => {
  it("defines JOURNAL_TRANSITIONS", () => {
    expect(JRN_ROUTE).toContain("JOURNAL_TRANSITIONS");
  });

  it("journal statuses include draft through reversed", () => {
    const idx = JRN_ROUTE.indexOf("JOURNAL_TRANSITIONS");
    const block = JRN_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("draft:");
    expect(block).toContain("pending_approval:");
    expect(block).toContain("approved:");
    expect(block).toContain("posted:");
  });

  it("reversed and cancelled are terminal journal states", () => {
    const idx = JRN_ROUTE.indexOf("JOURNAL_TRANSITIONS");
    const block = JRN_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("reversed:         []");
    expect(block).toContain("cancelled:        []");
  });

  it("posted can only transition to reversed", () => {
    const idx = JRN_ROUTE.indexOf("JOURNAL_TRANSITIONS");
    const block = JRN_ROUTE.slice(idx, idx + 500);
    const postedLine = block.slice(
      block.indexOf("posted:"),
      block.indexOf("\n", block.indexOf("posted:"))
    );
    expect(postedLine).toContain("reversed");
  });
});

describe("Journal route structure", () => {
  it("expense CRUD endpoints exist", () => {
    expect(JRN_ROUTE).toContain('journalRouter.get("/expenses"');
    expect(JRN_ROUTE).toContain('journalRouter.post("/expenses"');
    expect(JRN_ROUTE).toContain('journalRouter.patch("/expenses/:id"');
    expect(JRN_ROUTE).toContain('journalRouter.delete("/expenses/:id"');
  });

  it("expense approval endpoint exists", () => {
    expect(JRN_ROUTE).toContain('"/expenses/:id/approve"');
  });

  it("voucher CRUD endpoints exist", () => {
    expect(JRN_ROUTE).toContain('journalRouter.get("/vouchers"');
    expect(JRN_ROUTE).toContain('journalRouter.post("/vouchers"');
    expect(JRN_ROUTE).toContain('journalRouter.patch("/vouchers/:id"');
    expect(JRN_ROUTE).toContain('journalRouter.delete("/vouchers/:id"');
  });

  it("salary advance endpoints exist", () => {
    expect(JRN_ROUTE).toContain('"/salary-advances"');
    expect(JRN_ROUTE).toContain('"/salary-advances/:id/approve"');
  });

  it("journal entry endpoints exist", () => {
    expect(JRN_ROUTE).toContain('journalRouter.get("/journal"');
    expect(JRN_ROUTE).toContain('journalRouter.post("/journal"');
  });

  it("journal reverse endpoint exists", () => {
    expect(JRN_ROUTE).toContain('"/journal/:id/reverse"');
  });

  it("year-end close endpoint exists", () => {
    expect(JRN_ROUTE).toContain("year-end-close");
  });

  it("opening balances endpoints exist", () => {
    expect(JRN_ROUTE).toContain('"/opening-balances"');
    expect(JRN_ROUTE).toContain('"/opening-balances/import-csv"');
  });
});

describe("Finance lifecycle integration", () => {
  it("invoices import applyTransition", () => {
    expect(INV_ROUTE).toContain("applyTransition");
    expect(INV_ROUTE).toContain("lifecycleEngine");
  });

  it("journal imports applyTransition", () => {
    expect(JRN_ROUTE).toContain("applyTransition");
    expect(JRN_ROUTE).toContain("lifecycleEngine");
  });

  it("invoices use lifecycleErrorResponse", () => {
    expect(INV_ROUTE).toContain("lifecycleErrorResponse");
  });
});

describe("Finance event emission contract", () => {
  it("emits events on invoice operations", () => {
    expect(INV_ROUTE).toContain("emitEvent");
  });

  it("emits events on journal operations", () => {
    expect(JRN_ROUTE).toContain("emitEvent");
  });

  it("invoices create audit logs", () => {
    const auditCalls = INV_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(3);
  });

  it("journal creates audit logs", () => {
    const auditCalls = JRN_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Finance security contracts", () => {
  it("validates invoice input with zod on create", () => {
    expect(INV_ROUTE).toContain("createInvoiceSchema.safeParse");
  });

  it("validates payment input with zod", () => {
    expect(INV_ROUTE).toContain("createPaymentSchema.safeParse");
  });

  it("validates credit memo input with zod", () => {
    expect(INV_ROUTE).toContain("createCreditMemoSchema.safeParse");
  });

  it("checks financial period open before posting", () => {
    expect(INV_ROUTE).toContain("checkFinancialPeriodOpen");
    expect(JRN_ROUTE).toContain("checkFinancialPeriodOpen");
  });

  it("invoice approval uses approval chain", () => {
    expect(INV_ROUTE).toContain("initiateApprovalChain");
  });

  it("invoice approval actions: approve, reject, return", () => {
    expect(INV_ROUTE).toContain('"/invoices/:id/approve"');
    expect(INV_ROUTE).toContain('"/invoices/:id/reject"');
    expect(INV_ROUTE).toContain('"/invoices/:id/return"');
  });

  it("reverseAccountBalances is available for journal reversal", () => {
    expect(JRN_ROUTE).toContain("reverseAccountBalances");
  });

  it("attachment is required for high-value operations", () => {
    expect(JRN_ROUTE).toContain("checkAttachmentRequired");
  });
});

describe("Finance VAT handling", () => {
  it("invoice creation computes VAT", () => {
    expect(INV_ROUTE).toContain("computeVat");
  });

  it("supports extractBaseFromGross", () => {
    expect(INV_ROUTE).toContain("extractBaseFromGross");
  });
});
