// ─── HR Engine — محرك الموارد البشرية ────────────────────────────────────
// Encapsulates HR-domain operations that touch financial or cross-domain
// boundaries. Payroll GL posting, loan processing, exit settlement —
// all go through the Financial Engine for proper period checks and guards.

import { financialEngine } from "./financialEngine.js";
import { rawQuery, rawExecute } from "../rawdb.js";
import { registerCrossDomainHandler } from "../eventBus.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface HRGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class HREngineImpl implements DomainEngine {
  readonly domainId = "hr";
  readonly label = "الموارد البشرية";

  async postPayrollGL(
    ctx: HRGLContext,
    payroll: {
      id: number;
      totalBasic: number;
      totalAllowances: number;
      totalDeductions: number;
      totalNet: number;
      month: number;
      year: number;
    }
  ) {
    const grossSalary = payroll.totalBasic + payroll.totalAllowances;

    const [salaryExpense, allowanceExpense, deductionAccount, salaryPayable] =
      await Promise.all([
        financialEngine.resolveAccountCode(ctx.companyId, "salary_expense", "debit", "6100"),
        financialEngine.resolveAccountCode(ctx.companyId, "allowance_expense", "debit", "6110"),
        financialEngine.resolveAccountCode(ctx.companyId, "employee_deductions", "credit", "2130"),
        financialEngine.resolveAccountCode(ctx.companyId, "salary_payable", "credit", "2120"),
      ]);

    const lines = [
      { accountCode: salaryExpense, debit: payroll.totalBasic, credit: 0, description: `رواتب أساسية — ${payroll.month}/${payroll.year}` },
    ];

    if (payroll.totalAllowances > 0) {
      lines.push({
        accountCode: allowanceExpense,
        debit: payroll.totalAllowances,
        credit: 0,
        description: `بدلات — ${payroll.month}/${payroll.year}`,
      });
    }

    if (payroll.totalDeductions > 0) {
      lines.push({
        accountCode: deductionAccount,
        debit: 0,
        credit: payroll.totalDeductions,
        description: `خصومات — ${payroll.month}/${payroll.year}`,
      });
    }

    lines.push({
      accountCode: salaryPayable,
      debit: 0,
      credit: payroll.totalNet,
      description: `صافي رواتب مستحقة — ${payroll.month}/${payroll.year}`,
    });

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-PAY-${payroll.year}${String(payroll.month).padStart(2, "0")}-${payroll.id}`,
      description: `مسير رواتب — ${payroll.month}/${payroll.year}`,
      type: "general",
      sourceType: "payroll_runs",
      sourceId: payroll.id,
      sourceKey: `hr:payroll:${payroll.id}`,
      guardTable: "payroll_runs",
      guardId: payroll.id,
      lines,
    });
  }

  async postLoanDisbursementGL(
    ctx: HRGLContext,
    loan: { id: number; employeeId: number; amount: number }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "employee_loan_receivable", "debit", "1400"),
      financialEngine.resolveAccountCode(ctx.companyId, "employee_loan_disbursement", "credit", "1100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-LOAN-${loan.id}`,
      description: `صرف سلفة — موظف #${loan.employeeId}`,
      type: "general",
      sourceType: "hr_loans",
      sourceId: loan.id,
      sourceKey: `hr:loan:${loan.id}`,
      guardTable: "hr_loans",
      guardId: loan.id,
      lines: [
        { accountCode: debitCode, debit: loan.amount, credit: 0, description: "ذمم سلف موظفين", employeeId: loan.employeeId },
        { accountCode: creditCode, debit: 0, credit: loan.amount, description: "صرف سلفة", employeeId: loan.employeeId },
      ],
    });
  }

  async postExitSettlementGL(
    ctx: HRGLContext,
    exit: {
      id: number;
      employeeId: number;
      eosAmount: number;
      remainingLeaveAmount: number;
      totalSettlement: number;
    }
  ) {
    const [eosExpense, leaveExpense, settlementPayable] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "eos_expense", "debit", "6150"),
      financialEngine.resolveAccountCode(ctx.companyId, "leave_settlement_expense", "debit", "6160"),
      financialEngine.resolveAccountCode(ctx.companyId, "settlement_payable", "credit", "2140"),
    ]);

    const lines = [];

    if (exit.eosAmount > 0) {
      lines.push({
        accountCode: eosExpense,
        debit: exit.eosAmount,
        credit: 0,
        description: `مكافأة نهاية خدمة — موظف #${exit.employeeId}`,
        employeeId: exit.employeeId,
      });
    }

    if (exit.remainingLeaveAmount > 0) {
      lines.push({
        accountCode: leaveExpense,
        debit: exit.remainingLeaveAmount,
        credit: 0,
        description: `بدل إجازات — موظف #${exit.employeeId}`,
        employeeId: exit.employeeId,
      });
    }

    lines.push({
      accountCode: settlementPayable,
      debit: 0,
      credit: exit.totalSettlement,
      description: `تسوية نهاية خدمة — موظف #${exit.employeeId}`,
      employeeId: exit.employeeId,
    });

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-EXIT-${exit.id}`,
      description: `تسوية نهاية خدمة — موظف #${exit.employeeId}`,
      type: "general",
      sourceType: "hr_exit_requests",
      sourceId: exit.id,
      sourceKey: `hr:exit:${exit.id}`,
      guardTable: "hr_exit_requests",
      guardId: exit.id,
      lines,
    });
  }

  async postLeaveAccrualGL(
    ctx: HRGLContext,
    accrual: { period: string; totalAmount: number; employeeCount: number }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "leave_accrual_expense", "debit", "6170"),
      financialEngine.resolveAccountCode(ctx.companyId, "leave_accrual_liability", "credit", "2150"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-LVAC-${accrual.period}`,
      description: `استحقاق إجازات — ${accrual.period} (${accrual.employeeCount} موظف)`,
      type: "accrual",
      sourceType: "hr_leave_accruals",
      sourceId: 0,
      sourceKey: `hr:leave_accrual:${ctx.companyId}:${accrual.period}`,
      guardTable: "payroll_runs",
      guardId: 0,
      lines: [
        { accountCode: debitCode, debit: accrual.totalAmount, credit: 0, description: `مصروف استحقاق إجازات — ${accrual.period}` },
        { accountCode: creditCode, debit: 0, credit: accrual.totalAmount, description: `التزام إجازات مستحقة — ${accrual.period}` },
      ],
    });
  }

  async postEOSAccrualGL(
    ctx: HRGLContext,
    accrual: { period: string; totalAmount: number; employeeCount: number }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "eos_accrual_expense", "debit", "6180"),
      financialEngine.resolveAccountCode(ctx.companyId, "eos_accrual_liability", "credit", "2160"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-EOSAC-${accrual.period}`,
      description: `استحقاق مكافأة نهاية خدمة — ${accrual.period} (${accrual.employeeCount} موظف)`,
      type: "accrual",
      sourceType: "hr_eos_accruals",
      sourceId: 0,
      sourceKey: `hr:eos_accrual:${ctx.companyId}:${accrual.period}`,
      guardTable: "payroll_runs",
      guardId: 0,
      lines: [
        { accountCode: debitCode, debit: accrual.totalAmount, credit: 0, description: `مصروف استحقاق نهاية خدمة — ${accrual.period}` },
        { accountCode: creditCode, debit: 0, credit: accrual.totalAmount, description: `التزام نهاية خدمة — ${accrual.period}` },
      ],
    });
  }

  async postPayrollRunGL(
    ctx: HRGLContext,
    payroll: {
      runId: number;
      period: string;
      employeeCount: number;
      totalGross: number;
      totalOvertime: number;
      totalGosiEmployer: number;
      totalBankPayout: number;
      totalGosiPayable: number;
      totalOtherDeductions: number;
    }
  ) {
    const [salaryExpenseCode, gosiExpenseCode, overtimeExpenseCode, bankCode, gosiPayableCode, deductionsPayableCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_salary_expense", "debit", "5100"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_gosi_expense", "debit", "5110"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_overtime_expense", "debit", "5120"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_bank_payout", "credit", "1100"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_gosi_payable", "credit", "2200"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_deductions_payable", "credit", "2210"),
    ]);

    const lines = [
      { accountCode: salaryExpenseCode, debit: payroll.totalGross, credit: 0 },
      { accountCode: overtimeExpenseCode, debit: payroll.totalOvertime, credit: 0 },
      { accountCode: gosiExpenseCode, debit: Math.round(payroll.totalGosiEmployer * 100) / 100, credit: 0 },
      { accountCode: bankCode, debit: 0, credit: payroll.totalBankPayout },
      { accountCode: gosiPayableCode, debit: 0, credit: payroll.totalGosiPayable },
      { accountCode: deductionsPayableCode, debit: 0, credit: payroll.totalOtherDeductions },
    ].filter(l => l.debit > 0 || l.credit > 0);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PAYROLL-${payroll.period}`,
      description: `صرف رواتب ${payroll.period} – ${payroll.employeeCount} موظف`,
      type: "general",
      sourceType: "payroll_runs",
      sourceId: payroll.runId,
      sourceKey: `hr:payroll_run:${payroll.runId}`,
      guardTable: "payroll_runs",
      guardId: payroll.runId,
      lines,
    });
  }

  async postPayrollPostGL(
    ctx: HRGLContext,
    payroll: {
      runId: number;
      period: string;
      totalGross: number;
      totalGosiEmployer: number;
      totalBankPayout: number;
      totalGosiPayable: number;
    }
  ) {
    const [salaryExpenseCode, gosiExpenseCode, bankCode, gosiPayableCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_salary_expense", "debit", "5100"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_gosi_expense", "debit", "5110"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_bank_payout", "credit", "1100"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_gosi_payable", "credit", "2200"),
    ]);

    const jlLines = [
      { accountCode: salaryExpenseCode, debit: payroll.totalGross, credit: 0, description: "مصاريف رواتب" },
      { accountCode: gosiExpenseCode, debit: Math.round(payroll.totalGosiEmployer * 100) / 100, credit: 0, description: "تأمينات اجتماعية صاحب عمل" },
      { accountCode: bankCode, debit: 0, credit: payroll.totalBankPayout, description: "صرف رواتب — بنك" },
      { accountCode: gosiPayableCode, debit: 0, credit: Math.round(payroll.totalGosiPayable * 100) / 100, description: "تأمينات اجتماعية مستحقة" },
    ].filter(l => l.debit > 0 || l.credit > 0);

    const totalJeDebit = jlLines.reduce((s, l) => s + l.debit, 0);
    const totalJeCredit = jlLines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalJeDebit - totalJeCredit) > 0.01) {
      throw new Error(
        `لا يمكن ترحيل الرواتب: القيد المحاسبي غير متوازن (مدين=${totalJeDebit.toFixed(2)} ≠ دائن=${totalJeCredit.toFixed(2)})`
      );
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PAYROLL-POST-${payroll.period}`,
      description: `قيد إقفال رواتب ${payroll.period}`,
      type: "payroll",
      sourceType: "payroll_run",
      sourceId: payroll.runId,
      sourceKey: `hr:payroll_post:${payroll.runId}`,
      guardTable: "payroll_runs",
      guardId: payroll.runId,
      lines: jlLines,
    });
  }

  async postMonthlyAccrualsGL(
    ctx: HRGLContext,
    accruals: {
      ref: string;
      period: string;
      totalLeaveAccrual: number;
      totalEosAccrual: number;
      employeeCount: number;
    }
  ) {
    const [leaveExpenseCode, leaveLiabilityCode, eosExpenseCode, eosLiabilityCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "hr_leave_accrual_expense", "debit", "5120"),
      financialEngine.resolveAccountCode(ctx.companyId, "hr_leave_accrual_liability", "credit", "2220"),
      financialEngine.resolveAccountCode(ctx.companyId, "hr_eos_accrual_expense", "debit", "5130"),
      financialEngine.resolveAccountCode(ctx.companyId, "hr_eos_accrual_liability", "credit", "2230"),
    ]);

    const lines = [
      { accountCode: leaveExpenseCode, debit: accruals.totalLeaveAccrual, credit: 0 },
      { accountCode: eosExpenseCode, debit: accruals.totalEosAccrual, credit: 0 },
      { accountCode: leaveLiabilityCode, debit: 0, credit: accruals.totalLeaveAccrual },
      { accountCode: eosLiabilityCode, debit: 0, credit: accruals.totalEosAccrual },
    ].filter(l => l.debit > 0 || l.credit > 0);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: accruals.ref,
      description: `استحقاقات شهرية: إجازات ${accruals.totalLeaveAccrual} + نهاية خدمة ${accruals.totalEosAccrual} (${accruals.employeeCount} موظف)`,
      type: "general",
      sourceType: "hr_monthly_accruals",
      sourceId: 0,
      sourceKey: `hr:monthly_accruals:${ctx.companyId}:${accruals.period}`,
      guardTable: "journal_entries",
      guardId: 0,
      lines,
    });
  }

  /**
   * Handle a payroll deduction request from another domain (e.g. Fleet).
   * This is the proper boundary — only HR writes to payroll_deductions.
   */
  async createPayrollDeduction(params: {
    companyId: number;
    employeeId: number;
    type: string;
    amount: number;
    reason: string;
    sourceType?: string;
    sourceId?: number;
  }) {
    await rawExecute(
      `INSERT INTO payroll_deductions ("companyId","employeeId",type,amount,reason,date,"createdAt")
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,NOW())`,
      [params.companyId, params.employeeId, params.type, params.amount, params.reason]
    );
  }
}

export const hrEngine = new HREngineImpl();

registerCrossDomainHandler("fleet.violation.deduction_requested", async (payload) => {
  if (!payload?.companyId || !payload?.employeeId || !payload?.amount) return;
  await hrEngine.createPayrollDeduction({
    companyId: payload.companyId,
    employeeId: payload.employeeId as number,
    type: "traffic_violation",
    amount: payload.amount as number,
    reason: (payload.reason as string) ?? "خصم مخالفة مرورية",
    sourceType: "fleet_traffic_violations",
    sourceId: payload.violationId as number,
  });
});
