// ─── Legal Engine — محرك الشؤون القانونية ────────────────────────────────
// Encapsulates legal-domain GL operations — case costs, settlements, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import { eventBus } from "../eventBus.js";
import { rawExecute } from "../rawdb.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface LegalGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class LegalEngineImpl implements DomainEngine {
  readonly domainId = "legal";
  readonly label = "الشؤون القانونية";

  async postCaseCostGL(
    ctx: LegalGLContext,
    caseCost: {
      caseId: number;
      amount: number;
      type: string;
    }
  ) {
    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "legal_expense", "debit", "6500"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-LEGAL-${caseCost.caseId}`,
      description: `مصروف قانوني — قضية #${caseCost.caseId} — ${caseCost.type}`,
      type: "general",
      sourceType: "legal_cases",
      sourceId: caseCost.caseId,
      sourceKey: `legal:case_cost:${caseCost.caseId}:${caseCost.type}`,
      guardTable: "legal_cases",
      guardId: caseCost.caseId,
      lines: [
        { accountCode: debitCode, debit: caseCost.amount, credit: 0, description: `مصروف قانوني — ${caseCost.type}` },
        { accountCode: creditCode, debit: 0, credit: caseCost.amount, description: "مستحقات قانونية" },
      ],
    });
  }

  async postSettlementGL(
    ctx: LegalGLContext,
    settlement: {
      caseId: number;
      amount: number;
      isInFavor: boolean;
    }
  ) {
    if (settlement.isInFavor) {
      const [debitCode, creditCode] = await Promise.all([
        financialEngine.resolveAccountCode(ctx.companyId, "legal_receivable", "debit", "1200"),
        financialEngine.resolveAccountCode(ctx.companyId, "legal_settlement_revenue", "credit", "4500"),
      ]);

      return financialEngine.postJournalEntry({
        companyId: ctx.companyId,
        branchId: ctx.branchId,
        createdBy: ctx.createdBy,
        ref: `JE-LSETTLE-${settlement.caseId}`,
        description: `تسوية قانونية لصالح الشركة — قضية #${settlement.caseId}`,
        type: "general",
        sourceType: "legal_cases",
        sourceId: settlement.caseId,
        sourceKey: `legal:settlement:${settlement.caseId}`,
        guardTable: "legal_cases",
        guardId: settlement.caseId,
        lines: [
          { accountCode: debitCode, debit: settlement.amount, credit: 0, description: "ذمم تسوية قانونية" },
          { accountCode: creditCode, debit: 0, credit: settlement.amount, description: "إيرادات تسوية" },
        ],
      });
    }

    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "legal_settlement_expense", "debit", "6510"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-LSETTLE-${settlement.caseId}`,
      description: `تسوية قانونية ضد الشركة — قضية #${settlement.caseId}`,
      type: "general",
      sourceType: "legal_cases",
      sourceId: settlement.caseId,
      sourceKey: `legal:settlement:${settlement.caseId}`,
      guardTable: "legal_cases",
      guardId: settlement.caseId,
      lines: [
        { accountCode: debitCode, debit: settlement.amount, credit: 0, description: "مصروف تسوية قانونية" },
        { accountCode: creditCode, debit: 0, credit: settlement.amount, description: "مستحقات تسوية" },
      ],
    });
  }
  async postLegalSessionFeeGL(
    ctx: LegalGLContext,
    session: {
      id: number;
      caseTitle: string;
      sessionDate: string;
      billingAmount: number;
      vatAmount: number;
    }
  ) {
    const totalWithVat = session.billingAmount + session.vatAmount;
    const [feeExpenseCode, vatReceivableCode, apCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "legal_fee", "debit", "5400"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_fee", "credit", "1400"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_fee_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `LEGAL-FEE-${session.id}`,
      description: `أتعاب قانونية / ${session.caseTitle} / جلسة ${session.sessionDate} / ${session.billingAmount.toLocaleString()} ريال`,
      type: "general",
      sourceType: "legal_sessions",
      sourceId: session.id,
      sourceKey: `legal:session_fee:${session.id}`,
      guardTable: "legal_sessions",
      guardId: session.id,
      lines: [
        { accountCode: feeExpenseCode, debit: session.billingAmount, credit: 0 },
        { accountCode: vatReceivableCode, debit: session.vatAmount, credit: 0 },
        { accountCode: apCode, debit: 0, credit: totalWithVat },
      ],
    });
  }

  async requestInvoiceCreation(
    ctx: LegalGLContext,
    params: {
      ref: string;
      description: string;
      subtotal: number;
      vatAmount: number;
      total: number;
      dueDate: string;
      sourceType: string;
      sourceId: number;
    }
  ) {
    eventBus.emit("legal.invoice.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      ...params,
    });
    return { requested: true };
  }

  async createCase(params: {
    companyId: number;
    title: string;
    description: string;
    priority: string;
    caseType: string;
    lawyerName: string | null;
  }): Promise<{ insertId: number }> {
    const { insertId } = await rawExecute(
      `INSERT INTO legal_cases ("companyId", title, description, status, priority, "caseType", "lawyerName", "createdAt") VALUES ($1, $2, $3, 'open', $4, $5, $6, NOW())`,
      [params.companyId, params.title, params.description, params.priority, params.caseType, params.lawyerName]
    );
    return { insertId };
  }
}

export const legalEngine = new LegalEngineImpl();
