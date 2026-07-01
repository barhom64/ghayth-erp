import { describe, it, expect, vi } from "vitest";

// مكافآت حركات النقل (الدفعة ب) — اختبار assertion إلزامي على سطور القيد
// (الدستور). محرّك مالي مُحاكى يلتقط حمولة القيد، فنتحقّق: حساب 5245 منفصل،
// التوازن للهللة، البُعد (employeeId)، تعايُش مع أجر السائق، ومنع المساس بـ5245
// حين لا مكافآت.

interface Line {
  accountCode: string; debit?: number; credit?: number;
  employeeId?: number; departmentId?: number;
}
const captured: { lines: Line[] } = { lines: [] };
const resolvedOps: string[] = [];

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_companyId: number, op: string, _side: string, fallback: string) => {
        resolvedOps.push(op);
        return fallback;
      },
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 7777, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async () => []),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({})),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter((l) => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter((l) => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("postPayrollRunGL — سطر مكافآت حركات النقل (5245)", () => {
  it("DR 5245 مكافآت منفصل عن الراتب، والقيد متوازن، والبُعد مختوم", async () => {
    captured.lines = []; resolvedOps.length = 0;
    // موظف عادي (راتب 5000) + سائق بمكافأة 1500. صافي = 6500. الراتب المُشتقّ 5000.
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 1, period: "2026-06", employeeCount: 2,
      totalGross: 5000, totalOvertime: 0, totalGosiEmployer: 0,
      totalBankPayout: 6500, totalGosiPayable: 0, totalOtherDeductions: 0,
      totalWht: 0, totalCommission: 0, totalDriverWages: 0, totalBonuses: 1500,
      breakdown: [
        { employeeId: 42, departmentId: 7, basic: 5000, overtime: 0, gosiEmployer: 0, bonus: 0 },
        { employeeId: 43, departmentId: 8, basic: 0, overtime: 0, gosiEmployer: 0, bonus: 1500 },
      ],
    });
    const l = captured.lines;
    expect(debitFor(l, "5245")).toBe(1500);
    expect(debitFor(l, "5210")).toBe(5000);
    expect(creditFor(l, "2120")).toBe(6500);
    expect(sumDebit(l)).toBe(sumCredit(l));
    const bn = l.filter((x) => x.accountCode === "5245");
    expect(bn.length).toBeGreaterThan(0);
    expect(bn.every((x) => x.employeeId === 43)).toBe(true);
  });

  it("مكافأة + أجر سائق بالساعة معًا → سطران منفصلان (5245 و5220) والقيد متوازن", async () => {
    captured.lines = []; resolvedOps.length = 0;
    // سائق: أجر ساعات 2000 + مكافأة 1000. صافي = 3000.
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 2, period: "2026-06", employeeCount: 1,
      totalGross: 0, totalOvertime: 0, totalGosiEmployer: 0,
      totalBankPayout: 3000, totalGosiPayable: 0, totalOtherDeductions: 0,
      totalWht: 0, totalCommission: 0, totalDriverWages: 2000, totalBonuses: 1000,
      breakdown: [
        { employeeId: 50, departmentId: 9, basic: 0, overtime: 0, gosiEmployer: 0, driverWages: 2000, bonus: 1000 },
      ],
    });
    const l = captured.lines;
    expect(debitFor(l, "5220")).toBe(2000);   // أجر الساعات
    expect(debitFor(l, "5245")).toBe(1000);   // المكافأة
    expect(creditFor(l, "2120")).toBe(3000);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("بلا مكافآت: لا سطر 5245 إطلاقًا، ولا يُحلّ الحساب", async () => {
    captured.lines = []; resolvedOps.length = 0;
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 3, period: "2026-06", employeeCount: 1,
      totalGross: 5000, totalOvertime: 0, totalGosiEmployer: 0,
      totalBankPayout: 5000, totalGosiPayable: 0, totalOtherDeductions: 0,
      totalWht: 0, totalCommission: 0, totalDriverWages: 0, totalBonuses: 0,
      breakdown: [{ employeeId: 60, departmentId: 1, basic: 5000, overtime: 0, gosiEmployer: 0 }],
    });
    const l = captured.lines;
    expect(debitFor(l, "5245")).toBe(0);
    expect(resolvedOps).not.toContain("payroll_driver_bonus_expense");
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
