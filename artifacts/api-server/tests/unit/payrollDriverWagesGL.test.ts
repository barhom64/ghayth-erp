import { describe, it, expect, vi } from "vitest";

// أجر السائق بالساعة (الدفعة 3) — اختبار assertion إلزامي على سطور القيد
// (الدستور: «أي تغيير يمس القيود يلزمه اختبار assertion على سطور القيد»).
// يُنفّذ postPayrollRunGL بمحرّك مالي مُحاكى يلتقط حمولة القيد، فنتحقّق من
// السطور الفعلية: حساب 5220، التوازن للهللة، البُعد (employeeId)، ومنع المساس
// بـ5220 حين لا أجر سائقين.

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

describe("postPayrollRunGL — سطر أجر السائق بالساعة (5220)", () => {
  it("DR 5220 أجور سائقين منفصل عن الراتب، والقيد متوازن للهللة، والبُعد مختوم", async () => {
    captured.lines = []; resolvedOps.length = 0;
    // موظف عادي (راتب 5000) + سائق بالساعة (أجر ساعات 2000، لا راتب أساسي).
    // صافي = 5000 + 2000 = 7000 (لا خصومات). الراتب المُشتقّ = 7000 − 2000 = 5000.
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 1, period: "2026-06", employeeCount: 2,
      totalGross: 5000, totalOvertime: 0, totalGosiEmployer: 0,
      totalBankPayout: 7000, totalGosiPayable: 0, totalOtherDeductions: 0,
      totalWht: 0, totalCommission: 0, totalDriverWages: 2000,
      breakdown: [
        { employeeId: 42, departmentId: 7, basic: 5000, overtime: 0, gosiEmployer: 0, driverWages: 0 },
        { employeeId: 43, departmentId: 8, basic: 0, overtime: 0, gosiEmployer: 0, driverWages: 2000 },
      ],
    });
    const l = captured.lines;
    expect(debitFor(l, "5220")).toBe(2000);   // أجور سائقين منفصلة
    expect(debitFor(l, "5210")).toBe(5000);   // الراتب مُشتقّ ونقيّ (لا يبتلع أجر السائق)
    expect(creditFor(l, "2120")).toBe(7000);  // رواتب مستحقة تحمل الكلفة
    expect(sumDebit(l)).toBe(sumCredit(l));   // التوازن للهللة
    // سطر 5220 مختوم بالموظف السائق (dimensional)
    const dw = l.filter((x) => x.accountCode === "5220");
    expect(dw.length).toBeGreaterThan(0);
    expect(dw.every((x) => x.employeeId === 43)).toBe(true);
  });

  it("أجر سائق + GOSI معًا يبقى القيد متوازنًا (GOSI يخضع — قرار إبراهيم)", async () => {
    captured.lines = []; resolvedOps.length = 0;
    // سائق بالساعة: أجر 3000، GOSI صاحب عمل 200، GOSI موظف 150 (ضمن المستحق).
    // صافي = 3000 − 150 = 2850. مستحق GOSI = 350.
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 2, period: "2026-06", employeeCount: 1,
      totalGross: 0, totalOvertime: 0, totalGosiEmployer: 200,
      totalBankPayout: 2850, totalGosiPayable: 350, totalOtherDeductions: 0,
      totalWht: 0, totalCommission: 0, totalDriverWages: 3000,
      breakdown: [
        { employeeId: 50, departmentId: 9, basic: 0, overtime: 0, gosiEmployer: 200, driverWages: 3000 },
      ],
    });
    const l = captured.lines;
    expect(debitFor(l, "5220")).toBe(3000);
    expect(debitFor(l, "5250")).toBe(200);    // GOSI صاحب العمل
    expect(creditFor(l, "2120")).toBe(2850);  // صافي
    expect(creditFor(l, "2140")).toBe(350);   // GOSI مستحق
    expect(sumDebit(l)).toBe(sumCredit(l));   // متوازن رغم تفاعل الأجر مع GOSI
  });

  it("بلا أجر سائقين: لا سطر 5220 إطلاقًا، ولا يُحلّ الحساب (صفر مخاطرة على الشركات)", async () => {
    captured.lines = []; resolvedOps.length = 0;
    await hrEngine.postPayrollRunGL(ctx, {
      runId: 3, period: "2026-06", employeeCount: 1,
      totalGross: 5000, totalOvertime: 0, totalGosiEmployer: 0,
      totalBankPayout: 5000, totalGosiPayable: 0, totalOtherDeductions: 0,
      totalWht: 0, totalCommission: 0, totalDriverWages: 0,
      breakdown: [{ employeeId: 60, departmentId: 1, basic: 5000, overtime: 0, gosiEmployer: 0 }],
    });
    const l = captured.lines;
    expect(debitFor(l, "5220")).toBe(0);                               // لا سطر أجور سائقين
    expect(resolvedOps).not.toContain("payroll_driver_wages_expense"); // لم يُمسّ 5220 أصلًا
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
