import { describe, it, expect, vi } from "vitest";

// Ledger assertion coverage for the GL-posting methods of four non-contested
// domain engines that post REAL money but lacked a runtime journal_lines test
// (constitution: assertion على سطور القيد لكل مسار يمسّ الدفتر):
//   • legalEngine    — case cost / settlement (for & against) / judgment payment / session fee
//   • projectsEngine — project cost (cash & AP) / closure WIP transfer / dev-unit COGS
//   • storeEngine    — order sale (revenue + VAT + COGS legs)
//   • supportEngine  — ticket billing
// Each method runs against a mocked financial engine that CAPTURES the journal
// payload, so we assert the REAL produced accounts, dimensions, and balance.

interface Line {
  accountCode: string; debit?: number; credit?: number;
  projectId?: number; clientId?: number;
}
const captured: { lines: Line[] } = { lines: [] };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    // singular form echoes the fallback (4th arg)
    resolveAccountCode: vi.fn(
      async (_c: number, _op: string, _s: string, fallback: string) => fallback,
    ),
    // plural form mirrors production: keyed `${operationType}_${side}` → fallback
    resolveAccountCodes: vi.fn(
      async (_c: number, mappings: Array<{ operationType: string; side: string; fallbackCode: string }>) =>
        Object.fromEntries(mappings.map(m => [`${m.operationType}_${m.side}`, m.fallbackCode])),
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 4242, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({ eventBus: { emit: vi.fn() }, registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawExecute: vi.fn(async () => ({ insertId: 1, affectedRows: 1 })),
  rawQuery: vi.fn(async () => []),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../src/lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { legalEngine } from "../../src/lib/engines/legalEngine.js";
import { projectsEngine } from "../../src/lib/engines/projectsEngine.js";
import { storeEngine } from "../../src/lib/engines/storeEngine.js";
import { supportEngine } from "../../src/lib/engines/supportEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));
const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("legalEngine GL postings — journal_lines", () => {
  it("postCaseCostGL: DR 5920 legal-expense / CR 2111 legal-payable, balanced", async () => {
    captured.lines = [];
    await legalEngine.postCaseCostGL(ctx, { caseId: 3, amount: 5000, type: "أتعاب" });
    const l = captured.lines;
    expect(debitFor(l, "5920")).toBe(5000);
    expect(creditFor(l, "2111")).toBe(5000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postSettlementGL against the company: DR 5910 settlement-expense / CR 2111 payable", async () => {
    captured.lines = [];
    await legalEngine.postSettlementGL(ctx, { caseId: 4, amount: 20000, isInFavor: false });
    const l = captured.lines;
    expect(debitFor(l, "5910")).toBe(20000);
    expect(creditFor(l, "2111")).toBe(20000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postSettlementGL in favor of the company: DR 1131 receivable / CR 4930 settlement-revenue", async () => {
    captured.lines = [];
    await legalEngine.postSettlementGL(ctx, { caseId: 5, amount: 15000, isInFavor: true });
    const l = captured.lines;
    expect(debitFor(l, "1131")).toBe(15000);
    expect(creditFor(l, "4930")).toBe(15000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postJudgmentPaymentGL against (pay out): DR 2111 payable / CR 1111 cash, only the delta", async () => {
    captured.lines = [];
    await legalEngine.postJudgmentPaymentGL(ctx, { caseId: 6, judgmentId: 60, priorPaid: 1000, newPaid: 3000, isInFavor: false });
    const l = captured.lines;
    expect(debitFor(l, "2111")).toBe(2000);   // newPaid − priorPaid
    expect(creditFor(l, "1111")).toBe(2000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postJudgmentPaymentGL in favor (collect in): DR 1111 cash / CR 1131 receivable, only the delta", async () => {
    captured.lines = [];
    await legalEngine.postJudgmentPaymentGL(ctx, { caseId: 7, judgmentId: 70, priorPaid: 0, newPaid: 2500, isInFavor: true });
    const l = captured.lines;
    expect(debitFor(l, "1111")).toBe(2500);
    expect(creditFor(l, "1131")).toBe(2500);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postLegalSessionFeeGL: DR 5920 fee + DR 1180 VAT-input / CR 2111 payable (incl. VAT), balanced", async () => {
    captured.lines = [];
    await legalEngine.postLegalSessionFeeGL(ctx, { id: 8, caseTitle: "قضية", sessionDate: "2026-06-01", billingAmount: 4000, vatAmount: 600 });
    const l = captured.lines;
    expect(debitFor(l, "5920")).toBe(4000);
    expect(debitFor(l, "1180")).toBe(600);
    expect(creditFor(l, "2111")).toBe(4600);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});

describe("projectsEngine GL postings — journal_lines", () => {
  it("postProjectCostGL (cash source): DR 1270 WIP / CR 1100 cash, projectId stamped, balanced", async () => {
    captured.lines = [];
    await projectsEngine.postProjectCostGL(ctx, { id: 1, projectId: 9, projectName: "برج", amount: 3000, description: "مواد", sourceType: "cash" });
    const l = captured.lines;
    expect(debitFor(l, "1270")).toBe(3000);
    expect(creditFor(l, "1100")).toBe(3000);
    expect(l.every(x => x.projectId === 9)).toBe(true);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postProjectCostGL (AP source): credit leg routes to 2100 payable", async () => {
    captured.lines = [];
    await projectsEngine.postProjectCostGL(ctx, { id: 2, projectId: 9, projectName: "برج", amount: 7000, description: "مقاول", sourceType: "ap" });
    const l = captured.lines;
    expect(debitFor(l, "1270")).toBe(7000);
    expect(creditFor(l, "2100")).toBe(7000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postProjectClosureGL: DR 5130 cost / CR 1270 WIP transfer, balanced", async () => {
    captured.lines = [];
    await projectsEngine.postProjectClosureGL(ctx, { projectId: 9, projectName: "برج", totalWip: 50000 });
    const l = captured.lines;
    expect(debitFor(l, "5130")).toBe(50000);
    expect(creditFor(l, "1270")).toBe(50000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postUnitSaleCogsGL: DR 5110 COGS / CR 1270 WIP (cost basis out of WIP), balanced", async () => {
    captured.lines = [];
    await projectsEngine.postUnitSaleCogsGL(ctx, { unitId: 11, unitName: "شقة", projectId: 9, projectName: "برج", costBasis: 80000 });
    const l = captured.lines;
    expect(debitFor(l, "5110")).toBe(80000);
    expect(creditFor(l, "1270")).toBe(80000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});

describe("storeEngine.postOrderGL — journal_lines", () => {
  it("revenue + VAT + COGS legs: DR 1111 cash + DR 5110 COGS / CR 4111 revenue + CR 2131 VAT + CR 1151 inventory, balanced", async () => {
    captured.lines = [];
    await storeEngine.postOrderGL(ctx, { id: 1, subtotal: 10000, vatAmount: 1500, total: 11500, cogsAmount: 6000 });
    const l = captured.lines;
    expect(debitFor(l, "1111")).toBe(11500);   // cash = total incl. VAT
    expect(creditFor(l, "4111")).toBe(10000);  // revenue ex-VAT
    expect(creditFor(l, "2131")).toBe(1500);   // VAT output
    expect(debitFor(l, "5110")).toBe(6000);    // COGS
    expect(creditFor(l, "1151")).toBe(6000);   // inventory relief
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("no VAT, no COGS: just DR 1111 / CR 4111, two lines, balanced", async () => {
    captured.lines = [];
    await storeEngine.postOrderGL(ctx, { id: 2, subtotal: 5000, vatAmount: 0, total: 5000 });
    const l = captured.lines;
    expect(debitFor(l, "1111")).toBe(5000);
    expect(creditFor(l, "4111")).toBe(5000);
    expect(creditFor(l, "2131")).toBe(0);
    expect(l.length).toBe(2);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});

describe("supportEngine.postBillingGL — journal_lines", () => {
  it("DR 1131 support-AR / CR 4130 support-revenue, clientId stamped, balanced", async () => {
    captured.lines = [];
    await supportEngine.postBillingGL(ctx, { id: 1, ref: "TKT-1", clientId: 42, billableAmount: 1200 });
    const l = captured.lines;
    expect(debitFor(l, "1131")).toBe(1200);
    expect(creditFor(l, "4130")).toBe(1200);
    expect(l.every(x => x.clientId === 42)).toBe(true);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
