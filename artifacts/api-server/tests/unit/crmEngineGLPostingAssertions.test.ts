import { describe, it, expect, vi } from "vitest";

// Ledger assertion coverage for crmEngine.postDealWonGL — a deal-won revenue
// recognition that posts REAL money but lacked a runtime journal_lines test
// (constitution: assertion على سطور القيد لأي مسار يمسّ الدفتر). Executes the
// method with a mocked financial engine that CAPTURES the journal payload, so
// we assert on the REAL produced journal_lines:
//   DR 1131 ذمم عميل (amount + VAT)  /  CR 4111 إيرادات (amount)  /  CR 2131 VAT
// every line carries clientId, and debit == credit to the cent.

interface Line { accountCode: string; debit?: number; credit?: number; clientId?: number; }
const captured: { lines: Line[] } = { lines: [] };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_companyId: number, _op: string, _side: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 9001, alreadyExists: false };
    }),
  },
}));
// crmEngine imports eventBus at module load (used only by requestInvoiceCreation,
// not by postDealWonGL); stub it so the import resolves.
vi.mock("../../src/lib/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), publish: vi.fn() },
  registerCrossDomainHandler: vi.fn(),
}));

import { crmEngine } from "../../src/lib/engines/crmEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("crmEngine.postDealWonGL — journal_lines", () => {
  it("DR 1131 AR (amount+VAT) / CR 4111 revenue / CR 2131 VAT, balanced, clientId stamped", async () => {
    captured.lines = [];
    await crmEngine.postDealWonGL(ctx, { id: 11, clientId: 88, amount: 10000, vatAmount: 1500 });
    const l = captured.lines;
    expect(debitFor(l, "1131")).toBe(11500);  // receivable = net + VAT
    expect(creditFor(l, "4111")).toBe(10000); // revenue recognised ex-VAT
    expect(creditFor(l, "2131")).toBe(1500);  // VAT output liability
    expect(sumDebit(l)).toBe(sumCredit(l));
    // clientId stamped on every leg (subledger dimension).
    expect(l.every(x => x.clientId === 88)).toBe(true);
  });

  it("omits the VAT credit line when vatAmount is 0 (VAT-exempt deal)", async () => {
    captured.lines = [];
    await crmEngine.postDealWonGL(ctx, { id: 12, clientId: 5, amount: 8000, vatAmount: 0 });
    const l = captured.lines;
    expect(debitFor(l, "1131")).toBe(8000);
    expect(creditFor(l, "4111")).toBe(8000);
    expect(creditFor(l, "2131")).toBe(0);  // no VAT line
    expect(l.length).toBe(2);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
