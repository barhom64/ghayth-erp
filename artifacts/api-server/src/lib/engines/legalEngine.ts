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
      financialEngine.resolveAccountCode(ctx.companyId, "legal_expense", "debit", "5920"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_payable", "credit", "2150"),
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
        financialEngine.resolveAccountCode(ctx.companyId, "legal_receivable", "debit", "1131"),
        financialEngine.resolveAccountCode(ctx.companyId, "legal_settlement_revenue", "credit", "4930"),
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
        sourceKey: `legal:settlement:${settlement.caseId}:for`,
        guardTable: "legal_cases",
        guardId: settlement.caseId,
        lines: [
          { accountCode: debitCode, debit: settlement.amount, credit: 0, description: "ذمم تسوية قانونية" },
          { accountCode: creditCode, debit: 0, credit: settlement.amount, description: "إيرادات تسوية" },
        ],
      });
    }

    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "legal_settlement_expense", "debit", "5910"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_payable", "credit", "2150"),
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
      sourceKey: `legal:settlement:${settlement.caseId}:against`,
      guardTable: "legal_cases",
      guardId: settlement.caseId,
      lines: [
        { accountCode: debitCode, debit: settlement.amount, credit: 0, description: "مصروف تسوية قانونية" },
        { accountCode: creditCode, debit: 0, credit: settlement.amount, description: "مستحقات تسوية" },
      ],
    });
  }

  /**
   * Post a judgment payment to GL — the missing half of the settlement cycle.
   *
   * postSettlementGL() records the liability (against) or receivable (for)
   * when a judgment is FIRST recorded. When that judgment is later paid
   * (PATCH /cases/:caseId/judgments/:id with paidAmount), we need the
   * reciprocal entry to clear the liability / collect the receivable.
   *
   *   Against the company, payment out:
   *     Dr legal_payable (clear the liability)
   *     Cr cash
   *
   *   In favor of the company, collection in:
   *     Dr cash
   *     Cr legal_receivable (clear the asset)
   *
   * Called with `priorPaid → newPaid` cumulative bounds so each payment
   * increment posts exactly one journal entry and re-PATCHing with the same
   * paidAmount is a no-op at the financialEngine dedup layer (sourceKey
   * collides). Encoding the cumulative bounds — not Date.now — also keeps
   * the sourceKey idempotent under retry, which the glBoundaryCompliance
   * test enforces project-wide.
   */
  async postJudgmentPaymentGL(
    ctx: LegalGLContext,
    payment: {
      caseId: number;
      judgmentId: number;
      priorPaid: number;
      newPaid: number;
      isInFavor: boolean;
    },
  ) {
    const delta = payment.newPaid - payment.priorPaid;
    const increment = `${payment.priorPaid.toFixed(2)}_${payment.newPaid.toFixed(2)}`;
    if (payment.isInFavor) {
      const [debitCode, creditCode] = await Promise.all([
        financialEngine.resolveAccountCode(ctx.companyId, "cash", "debit", "1111"),
        financialEngine.resolveAccountCode(ctx.companyId, "legal_receivable", "credit", "1131"),
      ]);
      return financialEngine.postJournalEntry({
        companyId: ctx.companyId,
        branchId: ctx.branchId,
        createdBy: ctx.createdBy,
        ref: `JE-LCOLLECT-${payment.judgmentId}-${increment}`,
        description: `تحصيل حكم لصالح الشركة — حكم #${payment.judgmentId} / قضية #${payment.caseId}`,
        type: "general",
        sourceType: "legal_judgments",
        sourceId: payment.judgmentId,
        sourceKey: `legal:judgment_payment:${payment.judgmentId}:${increment}`,
        guardTable: "legal_judgments",
        guardId: payment.judgmentId,
        lines: [
          { accountCode: debitCode, debit: delta, credit: 0, description: "تحصيل تسوية قانونية" },
          { accountCode: creditCode, debit: 0, credit: delta, description: "إقفال ذمم تسوية قانونية" },
        ],
      });
    }

    const [debitCode, creditCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "legal_payable", "debit", "2150"),
      financialEngine.resolveAccountCode(ctx.companyId, "cash", "credit", "1111"),
    ]);
    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-LPAY-${payment.judgmentId}-${increment}`,
      description: `سداد حكم ضد الشركة — حكم #${payment.judgmentId} / قضية #${payment.caseId}`,
      type: "general",
      sourceType: "legal_judgments",
      sourceId: payment.judgmentId,
      sourceKey: `legal:judgment_payment:${payment.judgmentId}:${increment}`,
      guardTable: "legal_judgments",
      guardId: payment.judgmentId,
      lines: [
        { accountCode: debitCode, debit: delta, credit: 0, description: "إقفال مستحقات تسوية قانونية" },
        { accountCode: creditCode, debit: 0, credit: delta, description: "سداد نقدي" },
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
      financialEngine.resolveAccountCode(ctx.companyId, "legal_fee", "debit", "5920"),
      financialEngine.resolveAccountCode(ctx.companyId, "vat_input", "debit", "1180"),
      financialEngine.resolveAccountCode(ctx.companyId, "legal_fee_payable", "credit", "2150"),
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
    /**
     * Optional caseNumber issued by numberingService. When supplied,
     * written into legal_cases.caseNumber so the row carries a real
     * numbering assignment. When omitted (legacy callers) the column
     * is left NULL — coverage report §3 G5 closure tracks elimination
     * of all NULL-caseNumber code paths.
     */
    caseNumber?: string;
  }): Promise<{ insertId: number }> {
    if (params.caseNumber !== undefined) {
      const { insertId } = await rawExecute(
        `INSERT INTO legal_cases ("companyId", title, description, status, priority, "caseType", "lawyerName", "caseNumber", "createdAt") VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, NOW())`,
        [params.companyId, params.title, params.description, params.priority, params.caseType, params.lawyerName, params.caseNumber]
      );
      return { insertId };
    }
    const { insertId } = await rawExecute(
      `INSERT INTO legal_cases ("companyId", title, description, status, priority, "caseType", "lawyerName", "createdAt") VALUES ($1, $2, $3, 'open', $4, $5, $6, NOW())`,
      [params.companyId, params.title, params.description, params.priority, params.caseType, params.lawyerName]
    );
    return { insertId };
  }
}

export const legalEngine = new LegalEngineImpl();
