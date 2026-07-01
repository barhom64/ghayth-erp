import { describe, it, expect } from "vitest";
import {
  eosAccrualProfile, type EosAccrualRow,
  leaveAccrualProfile, type LeaveAccrualRow,
  planRecurringPostings,
} from "../../src/lib/engines/recurringPostingEngine.js";

// Spec §6 steps 2-3 (FIN-RECURRING-POSTING-ENGINE): the eos_accrual + leave_accrual
// profiles reproduce hr.ts `/accruals/monthly` per-employee formulas EXACTLY
// (the current route posts the aggregate of these same per-employee numbers).
// Pure functions — no DB, no mocks. NOT wired live (needs the labor dimension
// contract extension + purpose seeds first — spec §5).

// ── EOS — 1/24 of salary for first 5 years, 1/12 afterwards (hr.ts:7662-7669) ──
const eosBase: EosAccrualRow = { id: 1, salary: 0, yearsOfService: 0 };

describe("eosAccrualProfile.amountFor — matches hr.ts monthly EOS accrual", () => {
  it("≤ 5 years of service ⇒ salary / 24", () => {
    expect(eosAccrualProfile.amountFor({ ...eosBase, salary: 12000, yearsOfService: 3 }))
      .toBe(500); // 12000 / 24
  });

  it("exactly 5 years (boundary) ⇒ still salary / 24", () => {
    expect(eosAccrualProfile.amountFor({ ...eosBase, salary: 12000, yearsOfService: 5 }))
      .toBe(500); // > 5 is the /12 trigger, so 5 → /24
  });

  it("> 5 years ⇒ salary / 12", () => {
    expect(eosAccrualProfile.amountFor({ ...eosBase, salary: 12000, yearsOfService: 6 }))
      .toBe(1000); // 12000 / 12
  });

  it("under 1 year still accrues at /24 (hr.ts:7662)", () => {
    expect(eosAccrualProfile.amountFor({ ...eosBase, salary: 2400, yearsOfService: 0.5 }))
      .toBe(100); // 2400 / 24
  });

  it("zero / non-positive salary ⇒ 0 (skipped)", () => {
    expect(eosAccrualProfile.amountFor({ ...eosBase, salary: 0, yearsOfService: 10 })).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    expect(eosAccrualProfile.amountFor({ ...eosBase, salary: 1000, yearsOfService: 2 }))
      .toBe(41.67); // 1000 / 24 = 41.666… → 41.67
  });
});

describe("eosAccrualProfile.journalTemplate — DR 5260 / CR 2220, per-employee dims, balanced", () => {
  it("default accounts + employee/dept/branch dims on BOTH legs", () => {
    const lines = eosAccrualProfile.journalTemplate(
      { ...eosBase, id: 42, salary: 12000, yearsOfService: 6, departmentId: 7, branchId: 3 }, 1000,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: "5260", debit: 1000, credit: 0, employeeId: 42, departmentId: 7, branchId: 3 });
    expect(lines[1]).toMatchObject({ accountCode: "2220", debit: 0, credit: 1000, employeeId: 42, departmentId: 7, branchId: 3 });
    const sumD = lines.reduce((s, l) => s + l.debit, 0);
    const sumC = lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBe(sumC); // balanced
  });

  it("honors account-code overrides", () => {
    const lines = eosAccrualProfile.journalTemplate(
      { ...eosBase, id: 42, eosExpenseAccountCode: "5261", eosLiabilityAccountCode: "2221" }, 500,
    );
    expect(lines[0].accountCode).toBe("5261");
    expect(lines[1].accountCode).toBe("2221");
  });
});

describe("eosAccrualProfile.sourceKey — idempotency per (employee, period)", () => {
  it("hr:eos_accrual:{employeeId}:{period}", () => {
    expect(eosAccrualProfile.sourceKey({ ...eosBase, id: 42 }, "2026-06"))
      .toBe("hr:eos_accrual:42:2026-06");
  });
});

// ── Leave — (salary / 30) × (annualLeaveDays / 12) (hr.ts:7655-7657) ──────────
const leaveBase: LeaveAccrualRow = { id: 1, salary: 0 };

describe("leaveAccrualProfile.amountFor — matches hr.ts monthly leave accrual", () => {
  it("default 21 annual days: (salary/30) × (21/12)", () => {
    // 9000/30 = 300 daily; 21/12 = 1.75 days/month; 300 × 1.75 = 525
    expect(leaveAccrualProfile.amountFor({ ...leaveBase, salary: 9000 })).toBe(525);
  });

  it("honors a custom annualLeaveDays (e.g. 30)", () => {
    // 9000/30 = 300; 30/12 = 2.5; 300 × 2.5 = 750
    expect(leaveAccrualProfile.amountFor({ ...leaveBase, salary: 9000, annualLeaveDays: 30 })).toBe(750);
  });

  it("zero salary ⇒ 0 (skipped)", () => {
    expect(leaveAccrualProfile.amountFor({ ...leaveBase, salary: 0 })).toBe(0);
  });
});

describe("leaveAccrualProfile.journalTemplate — DR 5270 / CR 2150 (NOT 2220), balanced", () => {
  it("default accounts + dims on both legs; liability is 2150 (migration 365)", () => {
    const lines = leaveAccrualProfile.journalTemplate(
      { ...leaveBase, id: 42, salary: 9000, departmentId: 7, branchId: 3 }, 525,
    );
    expect(lines[0]).toMatchObject({ accountCode: "5270", debit: 525, credit: 0, employeeId: 42, departmentId: 7, branchId: 3 });
    expect(lines[1]).toMatchObject({ accountCode: "2150", debit: 0, credit: 525, employeeId: 42, departmentId: 7, branchId: 3 });
    // Guard against re-conflating leave with the EOS liability.
    expect(lines[1].accountCode).not.toBe("2220");
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
  });
});

describe("leaveAccrualProfile.sourceKey", () => {
  it("hr:leave_accrual:{employeeId}:{period}", () => {
    expect(leaveAccrualProfile.sourceKey({ ...leaveBase, id: 42 }, "2026-06"))
      .toBe("hr:leave_accrual:42:2026-06");
  });
});

// ── runner compatibility — both profiles plug into planRecurringPostings ──────
describe("planRecurringPostings — EOS/leave profiles are runner-compatible", () => {
  it("plans one posting per eligible employee, skips already-posted + zero-amount", () => {
    const rows: EosAccrualRow[] = [
      { id: 1, salary: 12000, yearsOfService: 6 }, // 1000
      { id: 2, salary: 0, yearsOfService: 3 },     // 0 → skipped
      { id: 3, salary: 12000, yearsOfService: 2 }, // 500
    ];
    const alreadyPosted = new Set<string>(["hr:eos_accrual:3:2026-06"]); // 3 done → skipped
    const planned = planRecurringPostings(eosAccrualProfile, rows, "2026-06", alreadyPosted);
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ sourceType: "eos_accrual", entityId: 1, amount: 1000 });
    expect(planned[0].lines).toHaveLength(2);
  });
});
