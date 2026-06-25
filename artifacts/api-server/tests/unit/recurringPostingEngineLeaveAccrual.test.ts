import { describe, it, expect } from "vitest";
import {
  leaveAccrualProfile,
  planRecurringPostings,
  type LeaveAccrualEmployeeRow,
} from "../../src/lib/engines/recurringPostingEngine.js";

// leave_accrual profile — reproduces postMonthlyAccrualsGL's per-employee leave
// accrual: amount = (salary/30) × (21/12); journal DR 5270 expense / CR **2150**
// liability (the #2939-corrected account, NOT 2220), with employee dimensions.
// Pure functions — NOT wired live yet (no migration, no posting).

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: { debit: number }[]) => round2(ls.reduce((s, l) => s + l.debit, 0));
const sumCredit = (ls: { credit: number }[]) => round2(ls.reduce((s, l) => s + l.credit, 0));

const emp = (over: Partial<LeaveAccrualEmployeeRow> = {}): LeaveAccrualEmployeeRow =>
  ({ id: 1, salary: 0, ...over });

describe("leaveAccrualProfile.amountFor — (salary/30) × (21/12)", () => {
  it("3000 salary ⇒ 175/mo", () => {
    expect(leaveAccrualProfile.amountFor(emp({ salary: 3000 }))).toBe(175); // 100 × 1.75
  });
  it("6000 salary ⇒ 350/mo", () => {
    expect(leaveAccrualProfile.amountFor(emp({ salary: 6000 }))).toBe(350);
  });
  it("zero / non-positive salary ⇒ 0 (employee skipped)", () => {
    expect(leaveAccrualProfile.amountFor(emp({ salary: 0 }))).toBe(0);
    expect(leaveAccrualProfile.amountFor(emp({ salary: -100 }))).toBe(0);
  });
});

describe("leaveAccrualProfile.journalTemplate — DR 5270 / CR 2150 (#2939 account)", () => {
  it("defaults to 5270 / 2150, employee+dept+branch on both legs, balanced", () => {
    const lines = leaveAccrualProfile.journalTemplate(emp({ id: 42, departmentId: 7, branchId: 3 }), 175);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: "5270", debit: 175, credit: 0, employeeId: 42, departmentId: 7, branchId: 3 });
    expect(lines[1]).toMatchObject({ accountCode: "2150", debit: 0, credit: 175, employeeId: 42, departmentId: 7, branchId: 3 });
    expect(sumDebit(lines)).toBe(sumCredit(lines));
    // guard against the #2939 regression — liability must NOT be 2220
    expect(lines[1].accountCode).not.toBe("2220");
  });

  it("honors resolved account-code overrides (accounting_mappings at live-wire)", () => {
    const lines = leaveAccrualProfile.journalTemplate(
      emp({ id: 42, leaveExpenseAccountCode: "5271", leaveLiabilityAccountCode: "2151" }), 175,
    );
    expect(lines[0].accountCode).toBe("5271");
    expect(lines[1].accountCode).toBe("2151");
  });
});

describe("leaveAccrualProfile — sourceKey + planner integration", () => {
  it("sourceKey is per-employee: hr:leave_accrual:{id}:{period}", () => {
    expect(leaveAccrualProfile.sourceKey(emp({ id: 42 }), "2026-06")).toBe("hr:leave_accrual:42:2026-06");
  });

  it("planRecurringPostings skips already-posted + zero-salary employees", () => {
    const rows = [emp({ id: 1, salary: 3000 }), emp({ id: 2, salary: 6000 }), emp({ id: 3, salary: 0 })];
    const planned = planRecurringPostings(leaveAccrualProfile, rows, "2026-06", new Set(["hr:leave_accrual:2:2026-06"]));
    expect(planned.map(p => p.entityId)).toEqual([1]); // 2 already posted, 3 zero-salary
    expect(planned[0]).toMatchObject({ sourceType: "leave_accrual", amount: 175 });
  });
});
