import { describe, it, expect, vi } from "vitest";

// #2303 — FIN-PAYROLL-DEDUCTIONS-LOAN-INTEGRITY.
//
// Executes postPayrollRunGL with a mocked financial engine that CAPTURES the
// journal payload, so we assert on the REAL produced journal_lines — not just
// source substrings. Proves: the entry balances to the cent, and the deduction
// credit side is classified per-employee into its real homes (loan→1143,
// late→5215, absence→5216, violation→5217) with NOTHING bundled into the
// generic deductions-payable clearing (2150).

interface Line {
  accountCode: string; debit?: number; credit?: number;
  employeeId?: number; departmentId?: number;
}
const captured: { lines: Line[] } = { lines: [] };

// Mock the financial engine: resolveAccountCode returns the fallback code the
// engine passes (4th arg) so account codes are deterministic; postJournalEntry
// captures the lines the builder produced.
vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_companyId: number, op: string, _side: string, fallback: string) =>
        // Mirror migration 256: payroll_deductions_payable is SEEDED to 2150.
        // (Its code-level fallback is 2120, which collides with salary_payable —
        // production resolves the seed, so the test does too.)
        op === "payroll_deductions_payable" ? "2150" : fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return 12345;
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
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

describe("postPayrollRunGL — #2303 deduction classification (journal_lines)", () => {
  it("splits deductions per-employee to 1143/5215/5216/5217 and stays balanced", async () => {
    captured.lines = [];
    // Two employees, internally consistent so the breakdown reconciles
    // (derived gross == Σ basic — every other term cancels in the identity):
    //   A: gross 10000, gosiEmployee 975, late 100, absence 200, violation 50,
    //      loan 500  → net = 10000 − 975 − 850 = 8175
    //   B: gross  6000, gosiEmployee 585, violation 100, loan 300
    //      → net = 6000 − 585 − 400 = 5015
    const breakdown = [
      { employeeId: 1, departmentId: 10, basic: 10000, overtime: 0, gosiEmployer: 1125,
        loanRepayment: 500, lateDeduction: 100, absenceDeduction: 200, violationDeduction: 50 },
      { employeeId: 2, departmentId: 20, basic: 6000, overtime: 0, gosiEmployer: 675,
        loanRepayment: 300, lateDeduction: 0, absenceDeduction: 0, violationDeduction: 100 },
    ];
    const totalOtherDeductions = 500 + 100 + 200 + 50 + 300 + 100; // 1250
    const totalGosiEmployer = 1125 + 675;                          // 1800
    const totalGosiPayable = totalGosiEmployer + (975 + 585);      // 3360
    const totalBankPayout = 8175 + 5015;                           // 13190

    await hrEngine.postPayrollRunGL(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { companyId: 1, branchId: 1, createdBy: 1 } as any,
      {
        runId: 1, period: "2026-06", employeeCount: 2,
        totalGross: 16000, totalOvertime: 0, totalGosiEmployer,
        totalBankPayout, totalGosiPayable, totalOtherDeductions,
        totalWht: 0, totalCommission: 0, breakdown,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );

    const { lines } = captured;
    expect(lines.length).toBeGreaterThan(0);

    // 1) The entry balances to the cent.
    expect(sumDebit(lines)).toBe(sumCredit(lines));

    // 2) Loan repayment CLOSES the receivable (1143), per-employee, Σ = 800.
    const loanLines = lines.filter(l => l.accountCode === "1143" && (l.credit || 0) > 0);
    expect(creditFor(lines, "1143")).toBe(800);
    expect(loanLines.length).toBe(2);
    expect(loanLines.every(l => l.employeeId != null)).toBe(true);

    // 3) late→5215, absence→5216, violation→5217.
    expect(creditFor(lines, "5215")).toBe(100);
    expect(creditFor(lines, "5216")).toBe(200);
    expect(creditFor(lines, "5217")).toBe(150); // 50 + 100

    // 4) NOTHING bundled into the generic deductions clearing (2150).
    expect(lines.some(l => l.accountCode === "2150")).toBe(false);

    // 5) The classified credits sum exactly to totalOtherDeductions.
    expect(creditFor(lines, "1143") + creditFor(lines, "5215")
      + creditFor(lines, "5216") + creditFor(lines, "5217")).toBe(totalOtherDeductions);

    // 6) The deduction lines are dimensional (carry employeeId).
    const dedLines = lines.filter(l => ["1143", "5215", "5216", "5217"].includes(l.accountCode));
    expect(dedLines.every(l => l.employeeId != null)).toBe(true);
  });

  it("falls back to the single 2150 clearing line when no breakdown is given", async () => {
    captured.lines = [];
    await hrEngine.postPayrollRunGL(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { companyId: 1, branchId: 1, createdBy: 1 } as any,
      {
        runId: 2, period: "2026-06", employeeCount: 1,
        totalGross: 5000, totalOvertime: 0, totalGosiEmployer: 562.5,
        totalBankPayout: 4000, totalGosiPayable: 1125, totalOtherDeductions: 500,
        totalWht: 0, totalCommission: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );

    const { lines } = captured;
    // Still balanced.
    expect(sumDebit(lines)).toBe(sumCredit(lines));
    // Legacy single clearing line carries the aggregate; no per-type split.
    const c2150 = lines.filter(l => l.accountCode === "2150");
    expect(c2150.length).toBe(1);
    expect(c2150[0].credit).toBe(500);
    expect(lines.some(l => l.accountCode === "1143")).toBe(false);
  });
});
