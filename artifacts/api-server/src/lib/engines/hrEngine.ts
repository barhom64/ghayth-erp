// ─── HR Engine — محرك الموارد البشرية ────────────────────────────────────
// Encapsulates HR-domain operations that touch financial or cross-domain
// boundaries. Payroll GL posting, loan processing, exit settlement —
// all go through the Financial Engine for proper period checks and guards.

import { financialEngine } from "./financialEngine.js";
import { rawQuery, rawExecute } from "../rawdb.js";
import { eventBus } from "../eventBus.js";
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
        financialEngine.resolveAccountCode(ctx.companyId, "employee_deductions", "debit", "2130"),
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
      financialEngine.resolveAccountCode(ctx.companyId, "employee_loan_payable", "credit", "1100"),
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

// Listen for cross-domain deduction requests
eventBus.on("fleet.violation.deduction_requested", (payload: any) => {
  if (!payload?.companyId || !payload?.employeeId || !payload?.amount) return;
  hrEngine
    .createPayrollDeduction({
      companyId: payload.companyId,
      employeeId: payload.employeeId,
      type: "traffic_violation",
      amount: payload.amount,
      reason: payload.reason ?? "خصم مخالفة مرورية",
      sourceType: "fleet_traffic_violations",
      sourceId: payload.violationId,
    })
    .catch((err) => {
      console.error("[HREngine] Failed to create payroll deduction from fleet event:", err);
    });
});
