// ─── Support Engine — محرك الدعم الفني ──────────────────────────────────
// Encapsulates support-domain GL operations — billable ticket resolution, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface SupportGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class SupportEngineImpl implements DomainEngine {
  readonly domainId = "support";
  readonly label = "الدعم الفني";

  async postBillingGL(
    ctx: SupportGLContext,
    ticket: {
      id: number;
      ref: string;
      clientId: number;
      billableAmount: number;
    }
  ) {
    const [arCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "support_ar", "debit", "1200"),
      financialEngine.resolveAccountCode(ctx.companyId, "support_service_revenue", "credit", "4300"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `SUPPORT-${ticket.ref}`,
      description: `قيد خدمة دعم فني — تذكرة ${ticket.ref}`,
      type: "general",
      sourceType: "support_ticket",
      sourceId: ticket.id,
      sourceKey: `support:billing:${ticket.id}`,
      guardTable: "support_tickets",
      guardId: ticket.id,
      lines: [
        { accountCode: arCode, debit: ticket.billableAmount, credit: 0, description: `ذمم مدينة — دعم فني ${ticket.ref}`, clientId: ticket.clientId },
        { accountCode: revenueCode, debit: 0, credit: ticket.billableAmount, description: `إيراد خدمة دعم — ${ticket.ref}`, clientId: ticket.clientId },
      ],
    });
  }
}

export const supportEngine = new SupportEngineImpl();
