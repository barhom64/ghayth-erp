import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/hrEngine.ts"),
  "utf8"
);

// ─── HR Engine GL Posting Contract Tests ────────────────────────────────────
// Validates the structural contracts of every GL posting function:
// sourceKey patterns, account codes, debit/credit line structure,
// guard tables, and cross-domain wiring.

describe("hrEngine GL account resolution patterns", () => {
  it("postPayrollGL resolves 4 account codes: salary_expense, allowance_expense, employee_deductions, salary_payable", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollGL");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("salary_expense");
    expect(section).toContain("allowance_expense");
    expect(section).toContain("employee_deductions");
    expect(section).toContain("salary_payable");
  });

  it("postLoanDisbursementGL resolves receivable + disbursement", () => {
    const idx = ENGINE_SRC.indexOf("async postLoanDisbursementGL");
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("employee_loan_receivable");
    expect(section).toContain("employee_loan_disbursement");
  });

  it("postExitSettlementGL resolves EOS expense, leave expense, settlement payable", () => {
    const idx = ENGINE_SRC.indexOf("async postExitSettlementGL");
    const section = ENGINE_SRC.slice(idx, idx + 1000);
    expect(section).toContain("eos_expense");
    expect(section).toContain("leave_settlement_expense");
    expect(section).toContain("settlement_payable");
  });

  it("postPayrollRunGL (accrual) resolves expense + salary_payable + GOSI/deductions payable", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollRunGL");
    // Slice to the next async method boundary so the assertion stays
    // correct as the body grows (breakdown comment block, etc).
    const next = ENGINE_SRC.indexOf("  async ", idx + 10);
    const section = ENGINE_SRC.slice(idx, next > idx ? next : idx + 5000);
    expect(section).toContain("payroll_salary_expense");
    expect(section).toContain("payroll_gosi_expense");
    expect(section).toContain("payroll_overtime_expense");
    expect(section).toContain("salary_payable");
    expect(section).toContain("payroll_gosi_payable");
    expect(section).toContain("payroll_deductions_payable");
    // #2303 — deduction classification: loan repayment CLOSES the receivable,
    // late/absence/violation hit their own contra-expense leaves (5215/16/17).
    expect(section).toContain("employee_loan_receivable");
    expect(section).toContain("payroll_late_deduction");
    expect(section).toContain("payroll_absence_deduction");
    expect(section).toContain("payroll_violation_deduction");
  });

  it("postPayrollPostGL (payment) resolves salary_payable + bank only", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollPostGL");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("salary_payable");
    expect(section).toContain("payroll_bank_payout");
  });

  it("postMonthlyAccrualsGL resolves 4 accounts: leave + EOS expense/liability", () => {
    const idx = ENGINE_SRC.indexOf("async postMonthlyAccrualsGL");
    // window widened: the per-employee `breakdown` param + doc grew the function.
    const section = ENGINE_SRC.slice(idx, idx + 2400);
    expect(section).toContain("hr_leave_accrual_expense");
    // Leave-accrual LIABILITY must honour finance's controllable mapping key
    // `leave_accrual_liability` (accounting_mappings → 2150, migration 365 /
    // #2277) with a 2150 fallback — NOT the hr_-prefixed key, which is seeded
    // nowhere and silently fell back to 2220, bypassing finance's pinned
    // account. (`leave_accrual_liability` is a substring of the old prefixed
    // key, so we assert the full 2150 signature + absence of the hr_ key.)
    expect(section).toContain('"leave_accrual_liability", "credit", "2150"');
    expect(section).not.toContain("hr_leave_accrual_liability");
    expect(section).toContain("hr_eos_accrual_expense");
    // EOS accrual stays on its own long-term-provision account (2220).
    expect(section).toContain('"hr_eos_accrual_liability", "credit", "2220"');
  });
});

describe("hrEngine sourceKey conventions", () => {
  it("postPayrollGL uses hr:payroll:{id}", () => {
    expect(ENGINE_SRC).toContain("`hr:payroll:${payroll.id}`");
  });

  it("postLoanDisbursementGL uses hr:loan:{id}", () => {
    expect(ENGINE_SRC).toContain("`hr:loan:${loan.id}`");
  });

  it("postExitSettlementGL uses hr:exit:{id}", () => {
    expect(ENGINE_SRC).toContain("`hr:exit:${exit.id}`");
  });

  it("postPayrollRunGL uses hr:payroll_run:{runId}", () => {
    expect(ENGINE_SRC).toContain("`hr:payroll_run:${payroll.runId}`");
  });

  it("postPayrollPostGL uses hr:payroll_post:{runId}", () => {
    expect(ENGINE_SRC).toContain("`hr:payroll_post:${payroll.runId}`");
  });

  it("postMonthlyAccrualsGL uses hr:monthly_accruals:{companyId}:{period}", () => {
    expect(ENGINE_SRC).toContain("`hr:monthly_accruals:${ctx.companyId}:${accruals.period}`");
  });

  it("postPayrollLiabilitySettlementGL uses hr:liab_settle:{type}:{runId}", () => {
    expect(ENGINE_SRC).toContain("`hr:liab_settle:${settlement.liabilityType}:${settlement.runId}`");
  });

  it("all sourceKeys start with hr: prefix", () => {
    const sourceKeys = ENGINE_SRC.matchAll(/sourceKey:\s*`(hr:[^`]+)`/g);
    let count = 0;
    for (const m of sourceKeys) {
      expect(m[1]).toMatch(/^hr:/);
      count++;
    }
    expect(count).toBe(7);
  });
});

describe("hrEngine ref patterns", () => {
  it("payroll ref is JE-PAY-{YYYYMM}-{id}", () => {
    expect(ENGINE_SRC).toContain("JE-PAY-");
  });

  it("loan ref is JE-LOAN-{id}", () => {
    expect(ENGINE_SRC).toContain("JE-LOAN-");
  });

  it("exit ref is JE-EXIT-{id}", () => {
    expect(ENGINE_SRC).toContain("JE-EXIT-");
  });

  it("payroll run ref is PAYROLL-{period}", () => {
    expect(ENGINE_SRC).toContain("PAYROLL-${payroll.period}");
  });

  it("payroll post ref is PAYROLL-POST-{period}", () => {
    expect(ENGINE_SRC).toContain("PAYROLL-POST-${payroll.period}");
  });
});

describe("hrEngine debit/credit structure", () => {
  it("postPayrollGL: basic salary is always debit", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollGL");
    const section = ENGINE_SRC.slice(idx, idx + 5000);
    expect(section).toContain("debit: totalBasic, credit: 0");
  });

  it("postPayrollGL: allowances are conditionally added when > 0", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollGL");
    const section = ENGINE_SRC.slice(idx, idx + 5000);
    expect(section).toContain("totalAllowances > 0");
    expect(section).toContain("debit: totalAllowances");
  });

  it("postPayrollGL: deductions are conditionally added when > 0", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollGL");
    const section = ENGINE_SRC.slice(idx, idx + 5000);
    expect(section).toContain("totalDeductions > 0");
    expect(section).toContain("credit: totalDeductions");
  });

  it("postPayrollGL: net salary is always credit (payable)", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollGL");
    const section = ENGINE_SRC.slice(idx, idx + 5000);
    expect(section).toContain("credit: totalNet");
  });

  it("postLoanDisbursementGL: debit receivable, credit disbursement", () => {
    const idx = ENGINE_SRC.indexOf("async postLoanDisbursementGL");
    const section = ENGINE_SRC.slice(idx, idx + 1800);
    expect(section).toContain("debit: loan.amount, credit: 0");
    expect(section).toContain("debit: 0, credit: loan.amount");
  });

  it("postExitSettlementGL: conditionally adds EOS + leave debit lines", () => {
    const idx = ENGINE_SRC.indexOf("async postExitSettlementGL");
    const section = ENGINE_SRC.slice(idx, idx + 5000);
    expect(section).toContain("exit.eosAmount > 0");
    expect(section).toContain("exit.remainingLeaveAmount > 0");
    expect(section).toContain("credit: exit.totalSettlement");
  });

  it("postPayrollRunGL: filters out zero-value lines", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollRunGL");
    const next = ENGINE_SRC.indexOf("  async ", idx + 10);
    const section = ENGINE_SRC.slice(idx, next > idx ? next : idx + 6000);
    expect(section).toContain(".filter(l => l.debit > 0 || l.credit > 0)");
  });

  it("postPayrollRunGL: classifies deductions per-employee with a balancing residual (#2303)", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollRunGL");
    const next = ENGINE_SRC.indexOf("  async ", idx + 10);
    const section = ENGINE_SRC.slice(idx, next > idx ? next : idx + 8000);
    // Loan repayment credits the receivable account to CLOSE the loan.
    expect(section).toContain("loanReceivableCode");
    // Per-employee deduction credit lines (dimensional, stamped employeeId).
    expect(section).toContain("pushDeduction");
    expect(section).toContain("employeeId: e.employeeId");
    // Residual safety keeps the entry balanced if anything stays unclassified.
    expect(section).toContain("otherDeductions - classified");
    // The split is gated on the reconciled breakdown (else legacy 2150 line).
    expect(section).toContain("breakdownTrusted");
  });

  it("postPayrollPostGL: payment leg is balanced by construction (DR salary_payable = CR bank)", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollPostGL");
    const section = ENGINE_SRC.slice(idx, idx + 2500);
    expect(section).toContain("debit: amount, credit: 0");
    expect(section).toContain("debit: 0, credit: amount");
  });

  it("postMonthlyAccrualsGL: filters zero-value lines (aggregate fallback)", () => {
    const idx = ENGINE_SRC.indexOf("async postMonthlyAccrualsGL");
    // window widened past the per-employee `breakdown` branch to the aggregate
    // fallback, which still drops zero-value account lines.
    const section = ENGINE_SRC.slice(idx, idx + 3600);
    expect(section).toContain(".filter(l => l.debit > 0 || l.credit > 0)");
    // per-employee branch skips zero amounts per leg (no zero lines emitted).
    expect(section).toContain("if (leave > 0)");
    expect(section).toContain("if (eos > 0)");
  });
});

describe("hrEngine guard tables", () => {
  it("payrollGL guards against payroll_runs", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollGL");
    const section = ENGINE_SRC.slice(idx, idx + 4500);
    expect(section).toContain('guardTable: "payroll_runs"');
    expect(section).toContain("guardId: payroll.id");
  });

  it("loanGL guards against hr_loans", () => {
    const idx = ENGINE_SRC.indexOf("async postLoanDisbursementGL");
    const section = ENGINE_SRC.slice(idx, idx + 1800);
    expect(section).toContain('guardTable: "hr_loans"');
  });

  it("exitGL guards against hr_exit_requests", () => {
    const idx = ENGINE_SRC.indexOf("async postExitSettlementGL");
    const section = ENGINE_SRC.slice(idx, idx + 4000);
    expect(section).toContain('guardTable: "hr_exit_requests"');
  });
});

describe("hrEngine cross-domain wiring", () => {
  it("createPayrollDeduction inserts into payroll_deductions", () => {
    const idx = ENGINE_SRC.indexOf("async createPayrollDeduction");
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("INSERT INTO payroll_deductions");
    expect(section).toContain("companyId");
    expect(section).toContain("employeeId");
    expect(section).toContain("type");
    expect(section).toContain("amount");
    expect(section).toContain("reason");
  });

  it("fleet violation handler calls createPayrollDeduction with traffic_violation type", () => {
    expect(ENGINE_SRC).toContain("fleet.violation.deduction_requested");
    expect(ENGINE_SRC).toContain('type: "traffic_violation"');
    expect(ENGINE_SRC).toContain("خصم مخالفة مرورية");
  });

  it("fleet handler validates required fields before calling", () => {
    expect(ENGINE_SRC).toContain("!payload?.companyId || !payload?.employeeId || !payload?.amount");
  });
});

describe("hrEngine DomainEngine interface", () => {
  it("implements DomainEngine with domainId 'hr'", () => {
    expect(ENGINE_SRC).toContain('readonly domainId = "hr"');
  });

  it("implements DomainEngine with Arabic label", () => {
    expect(ENGINE_SRC).toContain('readonly label = "الموارد البشرية"');
  });

  it("class is exported as singleton", () => {
    expect(ENGINE_SRC).toContain("export const hrEngine = new HREngineImpl()");
  });
});
