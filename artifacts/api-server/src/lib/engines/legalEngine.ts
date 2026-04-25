// ─── Legal Engine — محرك الشؤون القانونية ────────────────────────────────
// Encapsulates legal-domain GL operations — case costs, settlements, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
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
}

export const legalEngine = new LegalEngineImpl();
