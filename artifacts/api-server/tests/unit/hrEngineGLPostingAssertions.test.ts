import { describe, it, expect, vi } from "vitest";

// Ledger assertion coverage for HR GL-posting methods that post REAL money but
// lacked a runtime journal_lines test (constitution: «أي تغيير يمس القيود يلزمه
// اختبار assertion على سطور القيد»). Executes each method with a mocked financial
// engine that CAPTURES the journal payload, so we assert on the REAL produced
// journal_lines — accounts, dimensions, and debit/credit balance to the cent —
// not just source substrings:
//   • postLoanDisbursementGL  — DR 1143 ذمم سلف / CR 1111 صرف نقدي
//   • postExitSettlementGL    — DR 5260 مكافأة نهاية خدمة + DR 5270 بدل إجازات / CR 2120 تسوية مستحقة
//   • postPayrollPostGL       — DR 2120 رواتب مستحقة / CR 1124 بنك (سداد)

interface Line {
  accountCode: string; debit?: number; credit?: number;
  employeeId?: number; departmentId?: number;
}
const captured: { lines: Line[] } = { lines: [] };

// resolveAccountCode echoes the fallback code each call passes (4th arg) so the
// produced account codes are deterministic and equal the engine's intended GL
// accounts; postJournalEntry captures the lines the builder produced.
vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_companyId: number, _op: string, _side: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 7777, alreadyExists: false };
    }),
  },
}));
// Isolate import-time side effects (cross-domain handler registration + DB).
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async () => []),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("postLoanDisbursementGL — journal_lines", () => {
  it("DR 1143 employee-loan-receivable / CR 1111 cash, balanced, dimensions stamped", async () => {
    captured.lines = [];
    await hrEngine.postLoanDisbursementGL(ctx, { id: 5, employeeId: 42, amount: 3000, departmentId: 7 });
    const l = captured.lines;
    expect(debitFor(l, "1143")).toBe(3000);
    expect(creditFor(l, "1111")).toBe(3000);
    expect(sumDebit(l)).toBe(sumCredit(l));
    // employeeId + departmentId stamped on BOTH legs (per-dept labour-cost roll-up).
    expect(l.every(x => x.employeeId === 42)).toBe(true);
    expect(l.every(x => x.departmentId === 7)).toBe(true);
  });
});

describe("postExitSettlementGL — journal_lines", () => {
  it("DR 5260 EOS + DR 5270 leave / CR 2120 settlement-payable, balanced", async () => {
    captured.lines = [];
    await hrEngine.postExitSettlementGL(ctx, {
      id: 9, employeeId: 42, eosAmount: 10000, remainingLeaveAmount: 2000,
      totalSettlement: 12000, departmentId: 7,
    });
    const l = captured.lines;
    expect(debitFor(l, "5260")).toBe(10000);
    expect(debitFor(l, "5270")).toBe(2000);
    expect(creditFor(l, "2120")).toBe(12000);
    expect(sumDebit(l)).toBe(sumCredit(l));
    expect(l.every(x => x.employeeId === 42)).toBe(true);
  });

  it("omits the EOS debit line when eosAmount is 0 (leave-only settlement)", async () => {
    captured.lines = [];
    await hrEngine.postExitSettlementGL(ctx, {
      id: 10, employeeId: 1, eosAmount: 0, remainingLeaveAmount: 1500,
      totalSettlement: 1500, departmentId: null,
    });
    const l = captured.lines;
    expect(debitFor(l, "5260")).toBe(0);           // no EOS line
    expect(debitFor(l, "5270")).toBe(1500);
    expect(creditFor(l, "2120")).toBe(1500);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});

describe("postPayrollPostGL — journal_lines (payment leg)", () => {
  it("DR 2120 salary-payable / CR 1124 bank, balanced", async () => {
    captured.lines = [];
    await hrEngine.postPayrollPostGL(ctx, { runId: 3, period: "2026-06", totalBankPayout: 55000 });
    const l = captured.lines;
    expect(debitFor(l, "2120")).toBe(55000);
    expect(creditFor(l, "1124")).toBe(55000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("posts nothing when totalBankPayout <= 0 (returns null, no JE)", async () => {
    captured.lines = [];
    const r = await hrEngine.postPayrollPostGL(ctx, { runId: 4, period: "2026-06", totalBankPayout: 0 });
    expect(r).toBeNull();
    expect(captured.lines.length).toBe(0);
  });
});
