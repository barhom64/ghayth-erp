import { describe, it, expect } from "vitest";
import {
  buildSalaryEntryInput,
  computeGross,
  type SalaryComponents,
  type SalaryJournalAccounts,
} from "../../src/lib/saudi-compliance/mudad/post-salary-journal.js";
import { buildEntry } from "../../src/lib/gl/journal-poster.js";

const ACCOUNTS: SalaryJournalAccounts = {
  expense:           { accountId: 5200, accountCode: "5200", source: "fallback" },
  payable:           { accountId: 2200, accountCode: "2200", source: "fallback" },
  deductionsPayable: { accountId: 2210, accountCode: "2210", source: "fallback" },
};

const BASE = {
  description: "test",
  accounts: ACCOUNTS,
  settlementId: 7,
  employeeId: 42,
  period: "2026-05",
};

describe("computeGross", () => {
  it("sums basic + housing + other allowances", () => {
    expect(
      computeGross({
        amount: 0, basicSalary: 5000, housingAllowance: 1000, otherAllowances: 500, deductions: 0,
      }),
    ).toBe(6500);
  });

  it("ignores deductions and net amount (gross is upstream of those)", () => {
    expect(
      computeGross({
        amount: 4000, basicSalary: 5000, housingAllowance: 1000, otherAllowances: 0, deductions: 2000,
      }),
    ).toBe(6000);
  });

  it("rounds to 2dp", () => {
    expect(
      computeGross({
        amount: 0, basicSalary: 1000.333, housingAllowance: 1000.333, otherAllowances: 1000.334, deductions: 0,
      }),
    ).toBe(3001);
  });
});

describe("buildSalaryEntryInput — common payroll shapes", () => {
  it("no deductions → 2 lines (DR expense / CR payable), balanced", () => {
    const components: SalaryComponents = {
      amount: 6000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 0,
    };
    const input = buildSalaryEntryInput({ ...BASE, components });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ accountId: 5200, amount: 6000 });
    expect(input.lines[1]).toMatchObject({ accountId: 2200, amount: -6000 });

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(6000);
    expect(entry.totalCredit).toBe(6000);
  });

  it("with deductions → 3 lines (DR expense / CR payable / CR deductions), balanced", () => {
    const components: SalaryComponents = {
      amount: 4000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 2000,
    };
    const input = buildSalaryEntryInput({ ...BASE, components });
    expect(input.lines).toHaveLength(3);
    expect(input.lines[0]).toMatchObject({ accountId: 5200, amount: 6000 });
    expect(input.lines[1]).toMatchObject({ accountId: 2200, amount: -4000 });
    expect(input.lines[2]).toMatchObject({ accountId: 2210, amount: -2000 });

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(6000);
    expect(entry.totalCredit).toBe(6000);
  });

  it("all-zero payload → empty lines (caller handles via 'noop')", () => {
    const components: SalaryComponents = {
      amount: 0, basicSalary: 0, housingAllowance: 0, otherAllowances: 0, deductions: 0,
    };
    const input = buildSalaryEntryInput({ ...BASE, components });
    expect(input.lines).toEqual([]);
  });

  it("throws when net + deductions ≠ gross (catches payroll calc bugs)", () => {
    const components: SalaryComponents = {
      // Gross = 6000, but net+deductions = 4000+1500 = 5500 — drift of 500
      amount: 4000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 1500,
    };
    expect(() => buildSalaryEntryInput({ ...BASE, components })).toThrow(/component mismatch/);
  });

  it("tolerates sub-cent IEEE-754 drift (≤ 1¢ within rounding)", () => {
    // gross = 6000.005 → round to 6000.01; net+ded = 4000 + 2000.005 = 6000.005 → round to 6000.01
    // After 2dp rounding both sides land at 6000.01, drift = 0.
    const components: SalaryComponents = {
      amount: 4000, basicSalary: 5000.005, housingAllowance: 700, otherAllowances: 300, deductions: 2000.005,
    };
    expect(() => buildSalaryEntryInput({ ...BASE, components })).not.toThrow();
  });

  it("propagates settlementId on every line for drilldown", () => {
    const components: SalaryComponents = {
      amount: 4000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 2000,
    };
    const input = buildSalaryEntryInput({ ...BASE, components, settlementId: 99 });
    for (const line of input.lines) {
      expect(line.referenceType).toBe("mudad_settlements");
      expect(line.referenceId).toBe(99);
    }
  });

  it("line descriptions name the employee + period for audit-trail readability", () => {
    const components: SalaryComponents = {
      amount: 4000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 2000,
    };
    const input = buildSalaryEntryInput({
      ...BASE, components, employeeId: 1234, period: "2026-05",
    });
    expect(input.lines[0].description).toMatch(/employee #1234/);
    expect(input.lines[1].description).toMatch(/2026-05/);
    expect(input.lines[2].description).toMatch(/2026-05/);
  });

  it("uses salary_expense (5200), salary_payable (2200), deductions_payable (2210) — no FX/inventory leak", () => {
    const components: SalaryComponents = {
      amount: 4000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 2000,
    };
    const input = buildSalaryEntryInput({ ...BASE, components });
    const ids = input.lines.map((l) => l.accountId).sort();
    expect(ids).toEqual([2200, 2210, 5200]);
    // No FX revaluation (4900/5900), realised FX (4910/5910),
    // inventory write-off (5610), cycle-count (4620/5620), AR (1130),
    // AP (2100) or inventory_asset (1400) leak.
    for (const stray of [1130, 1400, 2100, 4620, 4900, 4910, 5610, 5620, 5900, 5910]) {
      expect(input.lines.some((l) => l.accountId === stray)).toBe(false);
    }
  });

  it("zero net + non-zero deductions → only DR expense + CR deductions (2 lines, balanced)", () => {
    // Edge case: deductions == gross (e.g. full salary applied against loan).
    const components: SalaryComponents = {
      amount: 0, basicSalary: 2000, housingAllowance: 0, otherAllowances: 0, deductions: 2000,
    };
    const input = buildSalaryEntryInput({ ...BASE, components });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ accountId: 5200, amount: 2000 });
    expect(input.lines[1]).toMatchObject({ accountId: 2210, amount: -2000 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("zero deductions + net = gross → 2 lines, no deductions leg", () => {
    const components: SalaryComponents = {
      amount: 6000, basicSalary: 5000, housingAllowance: 700, otherAllowances: 300, deductions: 0,
    };
    const input = buildSalaryEntryInput({ ...BASE, components });
    // No 2210 leg.
    expect(input.lines.some((l) => l.accountId === 2210)).toBe(false);
    expect(input.lines).toHaveLength(2);
  });
});
