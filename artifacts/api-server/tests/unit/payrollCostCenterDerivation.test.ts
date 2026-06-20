import { describe, it, expect, vi, beforeEach } from "vitest";

// محرّك اشتقاق مراكز التكلفة — الدفعة 2 (الاشتقاق والترحيل).
//
// يُنفّذ postPayrollRunGL مقابل financial-engine + db مموَّهين، ويؤكّد على
// «سطور القيد» الفعلية أن استمام مركز التكلفة:
//   1. بُعد فقط — لا يغيّر أي مبلغ مدين/دائن، والقيد متوازن للقرش.
//   2. كل موظف يحمل مركز تكلفة فرعه الرئيسي (المشتق من الفرع).
//   3. التجاوز الصريح costCenterId في التخصيص يفوز على المشتق.
//   4. الموظف بلا تخصيص يبقى بلا مركز تكلفة (توافق خلفي تام).

interface Line {
  accountCode: string; debit?: number; credit?: number;
  employeeId?: number; costCenterId?: number; branchId?: number;
}
interface Payload { lines: Line[]; sourceKey: string; }
const captured: { payload: Payload | null } = { payload: null };

// صفوف التخصيصات التي يقرؤها المحرّك (employee_branch_allocations).
let allocRows: Array<{ employeeId: number; branchId: number | null; costCenterId: number | null; allocationPercent?: number }> = [];

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_companyId: number, _op: string, _side: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: Payload) => {
      captured.payload = payload;
      return { journalId: 1, sourceKey: payload.sourceKey, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async (sql: string) => {
    if (sql.includes("employee_branch_allocations")) return allocRows;
    return [];
  }),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
// مركز تكلفة الفرع المشتق: الفرع 1 → 100، الفرع 2 → 200.
vi.mock("../../src/lib/accountingAllocation.js", () => ({
  deriveBranchCostCenter: vi.fn(async (_companyId: number, branchId: number | null) =>
    branchId === 1 ? 100 : branchId === 2 ? 200 : null,
  ),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { companyId: 1, branchId: 1, createdBy: 1 } as any;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));

// سيناريو نظيف بلا استقطاعات/ضريبة/عمولة، موظفان على فرعين:
//   DR رواتب 10000 + إضافي 500 + تأمينات 1000 = 11500
//   CR رواتب مستحقة 10500 + تأمينات مستحقة 1000 = 11500
const basePayroll = {
  runId: 1, period: "2026-06", employeeCount: 2,
  totalGross: 0, // مُهمَل — المحرّك يشتقه من الجانب الدائن
  totalOvertime: 500,
  totalGosiEmployer: 1000,
  totalBankPayout: 10500,
  totalGosiPayable: 1000,
  totalOtherDeductions: 0,
  breakdown: [
    { employeeId: 11, branchId: 1, basic: 6000, overtime: 500, gosiEmployer: 600 },
    { employeeId: 12, branchId: 2, basic: 4000, overtime: 0, gosiEmployer: 400 },
  ],
};

beforeEach(() => {
  captured.payload = null;
  allocRows = [];
});

describe("الدفعة 2 — استمام مركز التكلفة على سطور الرواتب", () => {
  it("القيد متوازن للقرش بعد الاستمام (بُعد فقط لا يغيّر المبالغ)", async () => {
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: null },
      { employeeId: 12, branchId: 2, costCenterId: null },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    expect(sumDebit(lines)).toBe(11500);
    expect(sumCredit(lines)).toBe(11500);
    // مصروف الرواتب الإجمالي (5210) ثابت = 10000 بعد الاستمام.
    const salary = round2(lines.filter((l) => l.accountCode === "5210").reduce((s, l) => s + (l.debit || 0), 0));
    expect(salary).toBe(10000);
  });

  it("كل موظف يحمل مركز تكلفة فرعه الرئيسي المشتق", async () => {
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: null },
      { employeeId: 12, branchId: 2, costCenterId: null },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    const emp11 = lines.filter((l) => l.employeeId === 11);
    const emp12 = lines.filter((l) => l.employeeId === 12);
    expect(emp11.length).toBeGreaterThan(0);
    expect(emp12.length).toBeGreaterThan(0);
    expect(emp11.every((l) => l.costCenterId === 100)).toBe(true);
    expect(emp12.every((l) => l.costCenterId === 200)).toBe(true);
    // والفرع يُستمّ كذلك على السطر.
    expect(emp11.every((l) => l.branchId === 1)).toBe(true);
    expect(emp12.every((l) => l.branchId === 2)).toBe(true);
  });

  it("التجاوز الصريح للتخصيص يفوز على المركز المشتق", async () => {
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: 777 }, // تجاوز يدوي
      { employeeId: 12, branchId: 2, costCenterId: null },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    expect(lines.filter((l) => l.employeeId === 11).every((l) => l.costCenterId === 777)).toBe(true);
    expect(lines.filter((l) => l.employeeId === 12).every((l) => l.costCenterId === 200)).toBe(true);
  });

  it("موظف بلا تخصيص يشتق مركز التكلفة من فرع الـbreakdown (يغطّي التفعيل السريع)", async () => {
    allocRows = []; // لا تخصيصات — كموظف أُنشئ عبر التفعيل السريع
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    // الفرع المصدر من breakdown (emp11→1، emp12→2) فيُشتق المركز رغم غياب التخصيص.
    expect(lines.filter((l) => l.employeeId === 11).every((l) => l.costCenterId === 100)).toBe(true);
    expect(lines.filter((l) => l.employeeId === 12).every((l) => l.costCenterId === 200)).toBe(true);
    expect(sumDebit(lines)).toBe(11500);
    expect(sumCredit(lines)).toBe(11500);
  });

  it("تجاوز تخصيص في فرع مختلف عن فرع الرواتب يُتجاهَل (يحمي من صفوف منح الوصول)", async () => {
    // تخصيص emp11 بمركز 777 لكن في الفرع 9 (≠ فرع رواتبه 1) → يُتجاهَل،
    // ويُشتق المركز من فرع الرواتب الفعلي (1 → 100).
    allocRows = [
      { employeeId: 11, branchId: 9, costCenterId: 777 },
      { employeeId: 12, branchId: 2, costCenterId: null },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    expect(lines.filter((l) => l.employeeId === 11).every((l) => l.costCenterId === 100)).toBe(true);
    expect(lines.filter((l) => l.employeeId === 12).every((l) => l.costCenterId === 200)).toBe(true);
  });

  it("موظف بلا تخصيص وبلا فرع في breakdown يبقى بلا مركز تكلفة", async () => {
    allocRows = [];
    const noBranch = {
      ...basePayroll,
      breakdown: [
        { employeeId: 11, branchId: null, basic: 6000, overtime: 500, gosiEmployer: 600 },
        { employeeId: 12, branchId: null, basic: 4000, overtime: 0, gosiEmployer: 400 },
      ],
    };
    await hrEngine.postPayrollRunGL(ctx, noBranch);
    const lines = captured.payload!.lines;
    expect(lines.some((l) => l.costCenterId != null)).toBe(false);
    expect(sumDebit(lines)).toBe(11500);
    expect(sumCredit(lines)).toBe(11500);
  });

  it("سطور الالتزام الجماعية (مستحقات) لا تُستمّ بمركز تكلفة موظف", async () => {
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: null },
      { employeeId: 12, branchId: 2, costCenterId: null },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    // الرواتب المستحقة (2120) والتأمينات المستحقة (2140) بلا employeeId ولا costCenterId.
    const payable = lines.filter((l) => l.accountCode === "2120" || l.accountCode === "2140");
    expect(payable.length).toBeGreaterThan(0);
    expect(payable.every((l) => l.costCenterId == null && l.employeeId == null)).toBe(true);
  });
});

describe("الدفعة 2ب — التوزيع متعدد الفروع حسب النسبة", () => {
  it("يقسّم سطور الموظف متعدد الفروع بالنسبة، مع حفظ التوازن والمجموع", async () => {
    // emp11: فرع1 60% + فرع2 40%؛ emp12: فرع2 100%.
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: null, allocationPercent: 60 },
      { employeeId: 11, branchId: 2, costCenterId: null, allocationPercent: 40 },
      { employeeId: 12, branchId: 2, costCenterId: null, allocationPercent: 100 },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    // التوازن محفوظ.
    expect(sumDebit(lines)).toBe(11500);
    expect(sumCredit(lines)).toBe(11500);
    // راتب emp11 (6000) انقسم: 3600 على فرع1/مركز100 + 2400 على فرع2/مركز200.
    const emp11Salary = lines.filter((l) => l.employeeId === 11 && l.accountCode === "5210");
    expect(emp11Salary.length).toBe(2);
    const byCc = Object.fromEntries(emp11Salary.map((l) => [l.costCenterId, l.debit]));
    expect(byCc[100]).toBe(3600);
    expect(byCc[200]).toBe(2400);
    expect(round2(emp11Salary.reduce((s, l) => s + (l.debit || 0), 0))).toBe(6000);
    // الفرع مُستمّ على كل حصة.
    expect(emp11Salary.find((l) => l.costCenterId === 100)!.branchId).toBe(1);
    expect(emp11Salary.find((l) => l.costCenterId === 200)!.branchId).toBe(2);
    // emp12 أحادي الفرع — سطر واحد كامل على مركز200.
    const emp12Salary = lines.filter((l) => l.employeeId === 12 && l.accountCode === "5210");
    expect(emp12Salary.length).toBe(1);
    expect(emp12Salary[0].debit).toBe(4000);
    expect(emp12Salary[0].costCenterId).toBe(200);
  });

  it("بواقي التقريب على آخر حصة فيبقى مجموع السطر مساويًا للأصل بالضبط", async () => {
    // نِسَب لا تقسم بالتساوي: 33.34 / 66.66 على راتب emp11 (6000).
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: null, allocationPercent: 33.34 },
      { employeeId: 11, branchId: 2, costCenterId: null, allocationPercent: 66.66 },
      { employeeId: 12, branchId: 2, costCenterId: null, allocationPercent: 100 },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    expect(sumDebit(lines)).toBe(11500);
    expect(sumCredit(lines)).toBe(11500);
    const emp11Salary = lines.filter((l) => l.employeeId === 11 && l.accountCode === "5210");
    expect(round2(emp11Salary.reduce((s, l) => s + (l.debit || 0), 0))).toBe(6000);
  });

  it("مجموع النِسَب ≠ 100% يتراجع لمسار أحادي الفرع (لا توزيع مُضلِّل)", async () => {
    // emp11: 60% + 30% = 90% ≠ 100 → لا يُقسَّم، يُحمَّل على فرع الـbreakdown (1/مركز100).
    allocRows = [
      { employeeId: 11, branchId: 1, costCenterId: null, allocationPercent: 60 },
      { employeeId: 11, branchId: 2, costCenterId: null, allocationPercent: 30 },
      { employeeId: 12, branchId: 2, costCenterId: null, allocationPercent: 100 },
    ];
    await hrEngine.postPayrollRunGL(ctx, basePayroll);
    const lines = captured.payload!.lines;
    expect(sumDebit(lines)).toBe(11500);
    const emp11Salary = lines.filter((l) => l.employeeId === 11 && l.accountCode === "5210");
    expect(emp11Salary.length).toBe(1);
    expect(emp11Salary[0].debit).toBe(6000);
    expect(emp11Salary[0].costCenterId).toBe(100);
  });
});
