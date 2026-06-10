// ─── HR Engine — محرك الموارد البشرية ────────────────────────────────────
// Encapsulates HR-domain operations that touch financial or cross-domain
// boundaries. Payroll GL posting, loan processing, exit settlement —
// all go through the Financial Engine for proper period checks and guards.

import { financialEngine } from "./financialEngine.js";
import { rawQuery, rawExecute } from "../rawdb.js";
import { registerCrossDomainHandler } from "../eventBus.js";
import { roundTo2 } from "../businessHelpers.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface HRGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class HREngineImpl implements DomainEngine {
  readonly domainId = "hr";
  readonly label = "الموارد البشرية";

  // @deprecated — legacy aggregate-line payroll poster, retained only
  // for the contract tests in tests/unit/hrEngineContracts.test.ts.
  // The production payroll flow uses postPayrollRunGL below (per-employee
  // breakdown carrying employeeId + departmentId + branchId on every
  // line so payroll cost rolls up by branch and dept in the dimensional
  // GL). No active route calls postPayrollGL; do not add new callers.
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

    // The four payroll totals are each rounded independently, so Σdebit can
    // drift a sub-cent from Σcredit. The salary-expense debit is DERIVED as
    // the exact complement of the credit legs so the entry balances to the
    // cent — net pay and the deduction liability stay exact.
    const totalAllowances = roundTo2(payroll.totalAllowances);
    const totalDeductions = roundTo2(payroll.totalDeductions);
    const totalNet = roundTo2(payroll.totalNet);
    const totalBasic = roundTo2(totalDeductions + totalNet - totalAllowances);

    const lines = [
      { accountCode: salaryExpense, debit: totalBasic, credit: 0, description: `رواتب أساسية — ${payroll.month}/${payroll.year}` },
    ];

    if (totalAllowances > 0) {
      lines.push({
        accountCode: allowanceExpense,
        debit: totalAllowances,
        credit: 0,
        description: `بدلات — ${payroll.month}/${payroll.year}`,
      });
    }

    if (totalDeductions > 0) {
      lines.push({
        accountCode: deductionAccount,
        debit: 0,
        credit: totalDeductions,
        description: `خصومات — ${payroll.month}/${payroll.year}`,
      });
    }

    lines.push({
      accountCode: salaryPayable,
      debit: 0,
      credit: totalNet,
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
    loan: { id: number; employeeId: number; amount: number; departmentId?: number | null }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "employee_loan_receivable", "debit", "1400"),
      financialEngine.resolveAccountCode(ctx.companyId, "employee_loan_disbursement", "credit", "1100"),
    ]);

    // departmentId carries the employee's home cost-centre so per-dept
    // labour-cost roll-ups capture loan accruals alongside payroll. The
    // caller (hr-loans.ts:approve) pulls it from employee_assignments.
    const departmentId = loan.departmentId ?? undefined;

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
        { accountCode: debitCode, debit: loan.amount, credit: 0, description: "ذمم سلف موظفين", employeeId: loan.employeeId, departmentId },
        { accountCode: creditCode, debit: 0, credit: loan.amount, description: "صرف سلفة", employeeId: loan.employeeId, departmentId },
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
      departmentId?: number | null;
    }
  ) {
    const [eosExpense, leaveExpense, settlementPayable] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "eos_expense", "debit", "6150"),
      financialEngine.resolveAccountCode(ctx.companyId, "leave_settlement_expense", "debit", "6160"),
      financialEngine.resolveAccountCode(ctx.companyId, "settlement_payable", "credit", "2140"),
    ]);

    const lines = [];
    // departmentId — employee's home department lets per-dept labour
    // cost roll-ups capture EOS / leave settlement expense in the same
    // bucket as monthly payroll. Caller (hr-exit.ts:complete) reads
    // from employee_assignments at exit time.
    const departmentId = exit.departmentId ?? undefined;

    if (exit.eosAmount > 0) {
      lines.push({
        accountCode: eosExpense,
        debit: exit.eosAmount,
        credit: 0,
        description: `مكافأة نهاية خدمة — موظف #${exit.employeeId}`,
        employeeId: exit.employeeId,
        departmentId,
      });
    }

    if (exit.remainingLeaveAmount > 0) {
      lines.push({
        accountCode: leaveExpense,
        debit: exit.remainingLeaveAmount,
        credit: 0,
        description: `بدل إجازات — موظف #${exit.employeeId}`,
        employeeId: exit.employeeId,
        departmentId,
      });
    }

    lines.push({
      accountCode: settlementPayable,
      debit: 0,
      credit: exit.totalSettlement,
      description: `تسوية نهاية خدمة — موظف #${exit.employeeId}`,
      employeeId: exit.employeeId,
      departmentId,
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
      /** ZATCA WHT total — when > 0, a CR line on the WHT-payable
       *  account (default 2330) is added so the employer remits the
       *  amount on the next filing. The caller has already netted
       *  WHT off totalBankPayout, so credit-side totals remain balanced. */
      totalWht?: number;
      /** Umrah sales commissions consumed by this run (راتب + عمولة).
       *  When > 0, a DR on the commission-expense account (op
       *  `payroll_commission_expense`, default 5240 «المكافآت والحوافز»)
       *  is emitted — separate from salary expense so commission cost
       *  stays its own ledger line. The caller has already ADDED the
       *  commission into each line's net (→ totalBankPayout), so the
       *  credit side carries it; subtracting it from the derived
       *  salary-expense figure keeps the entry balanced and honest. */
      totalCommission?: number;
      /**
       * Optional per-employee breakdown. When provided, the salary +
       * GOSI expense + overtime DR lines are split per employee with
       * employeeId + departmentId stamped on each journal_line, so
       * profitability reports can aggregate payroll cost by
       * department / branch / individual. The credit liabilities
       * stay aggregated (one salary_payable, one gosi_payable, one
       * deductions_payable line) since they're collective balances.
       *
       * When omitted (legacy callers), the function emits the same
       * 6-line aggregate JE as before — backwards compatible.
       */
      breakdown?: Array<{
        employeeId: number;
        departmentId?: number | null;
        branchId?: number | null;
        basic: number;
        overtime: number;
        gosiEmployer: number;
        whtAmount?: number;
        /** Per-employee umrah commission — splits the commission-expense
         *  DR per employee (dimensional like salary/OT/GOSI). */
        commission?: number;
      }>;
    }
  ) {
    // HR-001 — accrual leg. Run creation recognises the payroll expense and
    // the matching liabilities; it does NOT touch the bank. The net pay is
    // credited to salary_payable, settled later by postPayrollPostGL when the
    // run is posted. Crediting the bank here (and again at posting) was the
    // source of the double-count.
    const [salaryExpenseCode, gosiExpenseCode, overtimeExpenseCode, salaryPayableCode, gosiPayableCode, deductionsPayableCode, whtPayableCode, commissionExpenseCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_salary_expense", "debit", "5100"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_gosi_expense", "debit", "5110"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_overtime_expense", "debit", "5120"),
      financialEngine.resolveAccountCode(ctx.companyId, "salary_payable", "credit", "2120"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_gosi_payable", "credit", "2200"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_deductions_payable", "credit", "2210"),
      financialEngine.resolveAccountCode(ctx.companyId, "wht_payable", "credit", "2330"),
      // Umrah commission expense — seeded by migration 288 to 5240
      // (المكافآت والحوافز); the fallback matches the seed.
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_commission_expense", "debit", "5240"),
    ]);
    const totalWht = roundTo2(payroll.totalWht ?? 0);
    const totalCommission = roundTo2(payroll.totalCommission ?? 0);

    // The six payroll aggregates are each rounded independently, so Σdebit
    // can drift a sub-cent from Σcredit. The salary-expense debit is DERIVED
    // as the exact balancing figure (Σcredit − the other debits) — it is
    // always the dominant line and the rounding remainder belongs in payroll
    // cost. Net pay, GOSI payable and the deduction liabilities stay exact,
    // so this accrual still matches the later payment leg to the cent.
    const totalOvertime = roundTo2(payroll.totalOvertime);
    const gosiEmployer = roundTo2(payroll.totalGosiEmployer);
    const bankPayout = roundTo2(payroll.totalBankPayout);
    const gosiPayable = roundTo2(payroll.totalGosiPayable);
    const otherDeductions = roundTo2(payroll.totalOtherDeductions);
    // totalGross is derived as Σcredit − Σother-debits so debits and
    // credits balance to the cent. The WHT-payable credit is part of
    // the credit side (caller already netted WHT off bankPayout), so
    // it joins the running total. Commission joined the credit side
    // inside bankPayout (net pay grew by it), so the commission DR is
    // subtracted here to keep salary expense pure.
    const totalGross = roundTo2(bankPayout + gosiPayable + otherDeductions + totalWht - totalOvertime - gosiEmployer - totalCommission);

    // Build debit lines — per-employee when breakdown is provided,
    // otherwise the legacy 3-line aggregate. The credit side stays
    // aggregated regardless: salary_payable, gosi_payable and
    // deductions_payable are settlement liabilities, not per-employee
    // expense.
    const debitLines: Array<{
      accountCode: string; debit: number; credit: number;
      employeeId?: number; departmentId?: number;
    }> = [];

    if (payroll.breakdown && payroll.breakdown.length > 0) {
      // Validate the breakdown sums match the aggregates within a
      // small rounding tolerance. If they diverge by more than a
      // cent the breakdown is unreliable — fall back to aggregate.
      let sumBasic = 0, sumOT = 0, sumGosi = 0, sumCommission = 0;
      for (const e of payroll.breakdown) {
        sumBasic += roundTo2(e.basic);
        sumOT += roundTo2(e.overtime);
        sumGosi += roundTo2(e.gosiEmployer);
        sumCommission += roundTo2(e.commission ?? 0);
      }
      const grossDiff = Math.abs(roundTo2(sumBasic) - totalGross);
      const otDiff = Math.abs(roundTo2(sumOT) - totalOvertime);
      const gosiDiff = Math.abs(roundTo2(sumGosi) - gosiEmployer);
      const commissionDiff = Math.abs(roundTo2(sumCommission) - totalCommission);
      const breakdownTrusted = grossDiff < 0.5 && otDiff < 0.5 && gosiDiff < 0.5 && commissionDiff < 0.5;

      if (breakdownTrusted) {
        // Per-employee DR lines for salary + overtime + GOSI + commission.
        // The rounding remainder lands on the LAST employee row in
        // each bucket so the bucket total stays exact.
        const lastIdx = payroll.breakdown.length - 1;
        let runningBasic = 0, runningOT = 0, runningGosi = 0, runningCommission = 0;
        for (let i = 0; i < payroll.breakdown.length; i++) {
          const e = payroll.breakdown[i];
          const basicRounded = i === lastIdx
            ? roundTo2(totalGross - runningBasic)
            : roundTo2(e.basic);
          const otRounded = i === lastIdx
            ? roundTo2(totalOvertime - runningOT)
            : roundTo2(e.overtime);
          const gosiRounded = i === lastIdx
            ? roundTo2(gosiEmployer - runningGosi)
            : roundTo2(e.gosiEmployer);
          const commissionRounded = i === lastIdx
            ? roundTo2(totalCommission - runningCommission)
            : roundTo2(e.commission ?? 0);
          if (basicRounded > 0) {
            debitLines.push({
              accountCode: salaryExpenseCode, debit: basicRounded, credit: 0,
              employeeId: e.employeeId,
              ...(e.departmentId != null ? { departmentId: e.departmentId } : {}),
            });
            runningBasic = roundTo2(runningBasic + basicRounded);
          }
          if (otRounded > 0) {
            debitLines.push({
              accountCode: overtimeExpenseCode, debit: otRounded, credit: 0,
              employeeId: e.employeeId,
              ...(e.departmentId != null ? { departmentId: e.departmentId } : {}),
            });
            runningOT = roundTo2(runningOT + otRounded);
          }
          if (gosiRounded > 0) {
            debitLines.push({
              accountCode: gosiExpenseCode, debit: gosiRounded, credit: 0,
              employeeId: e.employeeId,
              ...(e.departmentId != null ? { departmentId: e.departmentId } : {}),
            });
            runningGosi = roundTo2(runningGosi + gosiRounded);
          }
          if (commissionRounded > 0) {
            debitLines.push({
              accountCode: commissionExpenseCode, debit: commissionRounded, credit: 0,
              employeeId: e.employeeId,
              ...(e.departmentId != null ? { departmentId: e.departmentId } : {}),
            });
            runningCommission = roundTo2(runningCommission + commissionRounded);
          }
        }
      } else {
        // Breakdown didn't reconcile — fall back to aggregate lines
        // so the entry still posts; the dimensional split would be
        // misleading.
        debitLines.push(
          { accountCode: salaryExpenseCode, debit: totalGross, credit: 0 },
          { accountCode: overtimeExpenseCode, debit: totalOvertime, credit: 0 },
          { accountCode: gosiExpenseCode, debit: gosiEmployer, credit: 0 },
          { accountCode: commissionExpenseCode, debit: totalCommission, credit: 0 },
        );
      }
    } else {
      // Legacy aggregate lines.
      debitLines.push(
        { accountCode: salaryExpenseCode, debit: totalGross, credit: 0 },
        { accountCode: overtimeExpenseCode, debit: totalOvertime, credit: 0 },
        { accountCode: gosiExpenseCode, debit: gosiEmployer, credit: 0 },
        { accountCode: commissionExpenseCode, debit: totalCommission, credit: 0 },
      );
    }

    const lines = [
      ...debitLines,
      { accountCode: salaryPayableCode, debit: 0, credit: bankPayout },
      { accountCode: gosiPayableCode, debit: 0, credit: gosiPayable },
      { accountCode: deductionsPayableCode, debit: 0, credit: otherDeductions },
      // WHT payable — separate CR line on the ZATCA WHT-payable account.
      // Caller has already netted WHT off bankPayout so the entry balances.
      { accountCode: whtPayableCode, debit: 0, credit: totalWht },
    ].filter(l => l.debit > 0 || l.credit > 0);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PAYROLL-${payroll.period}`,
      description: `استحقاق رواتب ${payroll.period} – ${payroll.employeeCount} موظف`,
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
      totalBankPayout: number;
    }
  ) {
    // HR-001 — payment leg. Posting a run settles the net-pay liability that
    // postPayrollRunGL accrued: it moves the amount from salary_payable to the
    // bank. The expense and the GOSI/deductions liabilities were already
    // recognised at accrual, so re-posting them here would double-count.
    const amount = roundTo2(payroll.totalBankPayout);
    if (amount <= 0) return null;

    const [salaryPayableCode, bankCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "salary_payable", "debit", "2120"),
      financialEngine.resolveAccountCode(ctx.companyId, "payroll_bank_payout", "credit", "1100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `PAYROLL-POST-${payroll.period}`,
      description: `سداد رواتب ${payroll.period}`,
      type: "payroll",
      sourceType: "payroll_run",
      sourceId: payroll.runId,
      sourceKey: `hr:payroll_post:${payroll.runId}`,
      guardTable: "payroll_runs",
      guardId: payroll.runId,
      lines: [
        { accountCode: salaryPayableCode, debit: amount, credit: 0, description: "تسوية رواتب مستحقة" },
        { accountCode: bankCode, debit: 0, credit: amount, description: "سداد رواتب — بنك" },
      ],
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

  /**
   * Upgrade an employee's PRIMARY active assignment to a target role —
   * but only when the current role is at the lowest tier ('employee'
   * or empty). Used by cross-domain hooks (e.g. fleet linking a driver
   * to an employee, #1354) so they can grant the right access without
   * silently demoting managers / owners.
   *
   * Returns the number of rows updated (0 means the role wasn't
   * eligible — caller should leave HR a manual note).
   */
  async upgradePrimaryAssignmentRoleIfLowTier(params: {
    companyId: number;
    employeeId: number;
    toRole: string;
  }): Promise<number> {
    const { affectedRows } = await rawExecute(
      `UPDATE employee_assignments
          SET role = $3, "updatedAt" = NOW()
        WHERE "employeeId" = $1
          AND "companyId" = $2
          AND status = 'active'
          AND "isPrimary" = TRUE
          AND role IN ('employee', '')
          AND role IS NOT NULL`,
      [params.employeeId, params.companyId, params.toRole]
    );
    return affectedRows ?? 0;
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
