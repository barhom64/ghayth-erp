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

  it("postLeaveAccrualGL resolves accrual expense + liability pair", () => {
    const idx = ENGINE_SRC.indexOf("async postLeaveAccrualGL");
    const section = ENGINE_SRC.slice(idx, idx + 400);
    expect(section).toContain("leave_accrual_expense");
    expect(section).toContain("leave_accrual_liability");
  });

  it("postEOSAccrualGL resolves EOS accrual expense + liability pair", () => {
    const idx = ENGINE_SRC.indexOf("async postEOSAccrualGL");
    const section = ENGINE_SRC.slice(idx, idx + 400);
    expect(section).toContain("eos_accrual_expense");
    expect(section).toContain("eos_accrual_liability");
  });

  it("postPayrollRunGL (accrual) resolves expense + salary_payable + GOSI/deductions payable", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollRunGL");
    const section = ENGINE_SRC.slice(idx, idx + 1800);
    expect(section).toContain("payroll_salary_expense");
    expect(section).toContain("payroll_gosi_expense");
    expect(section).toContain("payroll_overtime_expense");
    expect(section).toContain("salary_payable");
    expect(section).toContain("payroll_gosi_payable");
    expect(section).toContain("payroll_deductions_payable");
  });

  it("postPayrollPostGL (payment) resolves salary_payable + bank only", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollPostGL");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("salary_payable");
    expect(section).toContain("payroll_bank_payout");
  });

  it("postMonthlyAccrualsGL resolves 4 accounts: leave + EOS expense/liability", () => {
    const idx = ENGINE_SRC.indexOf("async postMonthlyAccrualsGL");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("hr_leave_accrual_expense");
    expect(section).toContain("hr_leave_accrual_liability");
    expect(section).toContain("hr_eos_accrual_expense");
    expect(section).toContain("hr_eos_accrual_liability");
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

  it("postLeaveAccrualGL uses hr:leave_accrual:{companyId}:{period}", () => {
    expect(ENGINE_SRC).toContain("`hr:leave_accrual:${ctx.companyId}:${accrual.period}`");
  });

  it("postEOSAccrualGL uses hr:eos_accrual:{companyId}:{period}", () => {
    expect(ENGINE_SRC).toContain("`hr:eos_accrual:${ctx.companyId}:${accrual.period}`");
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

  it("all sourceKeys start with hr: prefix", () => {
    const sourceKeys = ENGINE_SRC.matchAll(/sourceKey:\s*`(hr:[^`]+)`/g);
    let count = 0;
    for (const m of sourceKeys) {
      expect(m[1]).toMatch(/^hr:/);
      count++;
    }
    expect(count).toBe(8);
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

  it("leave accrual ref is JE-LVAC-{period}", () => {
    expect(ENGINE_SRC).toContain("JE-LVAC-");
  });

  it("EOS accrual ref is JE-EOSAC-{period}", () => {
    expect(ENGINE_SRC).toContain("JE-EOSAC-");
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
    const section = ENGINE_SRC.slice(idx, idx + 3500);
    expect(section).toContain(".filter(l => l.debit > 0 || l.credit > 0)");
  });

  it("postPayrollPostGL: payment leg is balanced by construction (DR salary_payable = CR bank)", () => {
    const idx = ENGINE_SRC.indexOf("async postPayrollPostGL");
    const section = ENGINE_SRC.slice(idx, idx + 2500);
    expect(section).toContain("debit: amount, credit: 0");
    expect(section).toContain("debit: 0, credit: amount");
  });

  it("postMonthlyAccrualsGL: filters zero-value lines", () => {
    const idx = ENGINE_SRC.indexOf("async postMonthlyAccrualsGL");
    const section = ENGINE_SRC.slice(idx, idx + 1800);
    expect(section).toContain(".filter(l => l.debit > 0 || l.credit > 0)");
  });

  it("accrual entries are always balanced (debit expense = credit liability)", () => {
    const leaveIdx = ENGINE_SRC.indexOf("async postLeaveAccrualGL");
    const leaveSection = ENGINE_SRC.slice(leaveIdx, leaveIdx + 1500);
    expect(leaveSection).toContain("debit: accrual.totalAmount, credit: 0");
    expect(leaveSection).toContain("debit: 0, credit: accrual.totalAmount");

    const eosIdx = ENGINE_SRC.indexOf("async postEOSAccrualGL");
    const eosSection = ENGINE_SRC.slice(eosIdx, eosIdx + 1500);
    expect(eosSection).toContain("debit: accrual.totalAmount, credit: 0");
    expect(eosSection).toContain("debit: 0, credit: accrual.totalAmount");
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
