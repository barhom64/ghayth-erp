import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Debit-memo PREVIEW endpoint — AR-side mirror of #1024
// (credit-memo preview). Same intent: surface the GL impact +
// blockers BEFORE the operator clicks "Create Memo". No inventory
// side — a debit memo charges the customer extra; nothing leaves
// the warehouse.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/invoices/:id/debit-memo/preview"');
const END = ROUTE.indexOf('"/invoices/:id/debit-memo"', START + 50);
const HANDLER = ROUTE.slice(START, END);

describe("previewDebitMemoSchema is permissive (reason optional)", () => {
  it("declares previewDebitMemoSchema that omits the reason requirement", () => {
    expect(ROUTE).toContain("previewDebitMemoSchema");
    expect(ROUTE).toMatch(/createDebitMemoSchema\.omit\(\{ reason: true \}\)/);
  });
  it("preview handler parses with previewDebitMemoSchema", () => {
    expect(HANDLER).toContain("previewDebitMemoSchema");
  });
});

describe("preview handler is read-only", () => {
  it("authorize action is 'view' (not 'create')", () => {
    expect(HANDLER).toMatch(/action: "view"/);
  });
  it("does NOT call postJournalEntry / open a transaction / insert / update", () => {
    expect(HANDLER).not.toContain("postJournalEntry");
    expect(HANDLER).not.toContain("withTransaction");
    expect(HANDLER).not.toMatch(/INSERT\s+INTO/i);
    expect(HANDLER).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
  it("does NOT touch inventory (debit memo is an AR-only event)", () => {
    expect(HANDLER).not.toContain("planCogsForInvoice");
    expect(HANDLER).not.toContain("planCogsReversal");
    expect(HANDLER).not.toContain("applyStockMovements");
    expect(HANDLER).not.toContain("warehouse_stock_lots");
    expect(HANDLER).not.toContain("warehouse_movements");
  });
});

describe("preview blocks on commit-time gates", () => {
  it("blocks when financial period is closed", () => {
    expect(HANDLER).toMatch(/!periodCheck\.open[\s\S]{0,200}blockers\.push/);
    expect(HANDLER).toContain("الفترة المالية مغلقة");
  });
  it("canIssue is false when blockers OR JE not balanced", () => {
    expect(HANDLER).toMatch(/canIssue: blockers\.length === 0 && isBalanced/);
  });
});

describe("preview builds the correct AR-side JE", () => {
  it("DR Accounts Receivable for the FULL chargeAmount", () => {
    expect(HANDLER).toMatch(/accountCode: arCode, debit: chargeAmount, credit: 0/);
  });
  it("CR Revenue for the net (vat extracted)", () => {
    expect(HANDLER).toMatch(/accountCode: revenueCode, debit: 0, credit: previewNet/);
  });
  it("CR VAT Payable only when previewVat > 0", () => {
    expect(HANDLER).toMatch(/previewVat > 0\s*\?\s*\[\{ accountCode: vatPayableCode, debit: 0, credit: previewVat/);
  });
  it("resolves the SAME accounts the commit handler uses", () => {
    expect(HANDLER).toMatch(/"invoice_ar", "debit", "1131"/);
    expect(HANDLER).toMatch(/"invoice_revenue", "credit", "4111"/);
    expect(HANDLER).toMatch(/"invoice_vat_payable", "credit", "2131"/);
  });
});

describe("preview response payload", () => {
  it("exposes canIssue + blockers + warnings + memoDate + chargeAmount", () => {
    expect(HANDLER).toMatch(/canIssue:/);
    expect(HANDLER).toMatch(/blockers,/);
    expect(HANDLER).toMatch(/warnings,/);
    expect(HANDLER).toMatch(/memoDate: memoDateStr,/);
    expect(HANDLER).toMatch(/chargeAmount,/);
  });
  it("exposes netAmount + vatAmount split", () => {
    expect(HANDLER).toMatch(/netAmount: previewNet,/);
    expect(HANDLER).toMatch(/vatAmount: previewVat,/);
  });
  it("exposes journalLines + totals.balanced", () => {
    expect(HANDLER).toMatch(/journalLines: previewLines,/);
    expect(HANDLER).toMatch(/totals: \{ debit: totalDebit, credit: totalCredit, balanced: isBalanced \}/);
  });
});
