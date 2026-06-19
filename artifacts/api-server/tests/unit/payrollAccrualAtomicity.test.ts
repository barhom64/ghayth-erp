import { describe, it, expect, vi, beforeEach } from "vitest";

// HR-002 — payroll accrual JE (posted INSIDE the run-creation transaction).
// The run + lines + loan/installment/overtime side-effects and this accrual now
// commit or roll back together; a GL failure aborts the whole creation instead
// of orphaning the run. This asserts the REAL accrual lines the engine produces:
// DR salary/OT/GOSI/commission expense, CR salary_payable + GOSI/deductions/WHT
// payable — balanced to the cent, idempotent on hr:payroll_run:{runId}.

interface Line { accountCode: string; debit?: number; credit?: number; }
interface Payload { lines: Line[]; sourceKey: string; sourceType: string; guardTable?: string; guardId?: number; }

const captured: { payload: Payload | null } = { payload: null };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    // Return the fallback (4th arg) so codes are deterministic:
    // salary_expense→5210, gosi_expense→5250, overtime→5230, salary_payable→2120,
    // gosi_payable→2140, deductions_payable→2150, wht_payable→2132, commission→5240.
    resolveAccountCode: vi.fn(
      async (_companyId: number, _op: string, _side: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: Payload) => {
      captured.payload = payload;
      return { journalId: 7001, sourceKey: payload.sourceKey, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async () => []),
  rawExecute: vi.fn(async () => ({ insertId: 0, affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({})),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { companyId: 1, branchId: 1, createdBy: 1 } as any;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));

beforeEach(() => {
  captured.payload = null;
});

describe("postPayrollRunGL — HR-002 accrual JE (balanced, dimensional)", () => {
  it("aggregate run: DR salary/GOSI expense = CR salary_payable + GOSI payable, balanced", async () => {
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 50,
      period: "2026-06",
      employeeCount: 1,
      totalGross: 8400,
      totalOvertime: 0,
      totalGosiEmployer: 600,
      totalBankPayout: 8000,
      totalGosiPayable: 1000,
      totalOtherDeductions: 0,
    });

    const p = captured.payload!;
    expect(p).not.toBeNull();

    // Net pay accrues to salary_payable; GOSI to the GOSI-payable liability.
    const salaryPayable = p.lines.find((l) => l.accountCode === "2120");
    const gosiPayable = p.lines.find((l) => l.accountCode === "2140");
    expect(salaryPayable?.credit).toBe(8000);
    expect(gosiPayable?.credit).toBe(1000);
    // The salary-expense leg is a debit.
    expect((p.lines.find((l) => l.accountCode === "5210")?.debit ?? 0)).toBeGreaterThan(0);

    // The accrual must balance to the cent.
    expect(sumDebit(p.lines)).toBe(sumCredit(p.lines));

    // Idempotency + traceability so a retry dedupes against the same run.
    expect(p.sourceKey).toBe("hr:payroll_run:50");
    expect(p.sourceType).toBe("payroll_runs");
    expect(p.guardTable).toBe("payroll_runs");
    expect(p.guardId).toBe(50);
  });

  it("per-employee breakdown with deductions stays balanced", async () => {
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 51,
      period: "2026-06",
      employeeCount: 2,
      totalGross: 16800,
      totalOvertime: 500,
      totalGosiEmployer: 1200,
      totalBankPayout: 15300,
      totalGosiPayable: 2000,
      totalOtherDeductions: 700,
      breakdown: [
        {
          employeeId: 7, departmentId: 3, branchId: 1,
          basic: 8400, overtime: 250, gosiEmployer: 600,
          loanRepayment: 400, lateDeduction: 0, absenceDeduction: 0, violationDeduction: 0,
        },
        {
          employeeId: 8, departmentId: 4, branchId: 1,
          basic: 8400, overtime: 250, gosiEmployer: 600,
          loanRepayment: 0, lateDeduction: 150, absenceDeduction: 100, violationDeduction: 50,
        },
      ],
    });

    const p = captured.payload!;
    expect(p).not.toBeNull();
    // Whatever the per-employee split, the entry must balance to the cent.
    expect(sumDebit(p.lines)).toBe(sumCredit(p.lines));
    // Salary payable carries the aggregate net pay.
    expect(p.lines.find((l) => l.accountCode === "2120")?.credit).toBe(15300);
    expect(p.sourceKey).toBe("hr:payroll_run:51");
  });
});
