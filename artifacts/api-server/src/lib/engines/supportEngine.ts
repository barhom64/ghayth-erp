// ─── Support Engine — محرك الدعم الفني ──────────────────────────────────
// Encapsulates support-domain GL operations — billable ticket resolution, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import { rawExecute } from "../rawdb.js";
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

  async createTicket(params: {
    companyId: number;
    title: string;
    description: string;
    priority: string;
  }): Promise<{ insertId: number }> {
    const { insertId } = await rawExecute(
      `INSERT INTO support_tickets ("companyId", title, description, status, priority, "createdAt") VALUES ($1, $2, $3, 'open', $4, NOW())`,
      [params.companyId, params.title, params.description, params.priority]
    );
    return { insertId };
  }

  async createPortalTicket(params: {
    companyId: number;
    clientId: number;
    ref: string;
    title: string;
    description: string | null;
    category: string;
    priority: string;
    invoiceId: number | null;
    contractId: number | null;
  }): Promise<{ insertId: number }> {
    const { insertId } = await rawExecute(
      `INSERT INTO support_tickets (ref, title, description, category, priority, status, "clientId", "companyId", "invoiceId", "contractId") VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9)`,
      [params.ref, params.title, params.description, params.category, params.priority, params.clientId, params.companyId, params.invoiceId, params.contractId]
    );
    return { insertId };
  }

  async markTicketInProgress(ticketId: number, companyId: number): Promise<void> {
    await rawExecute(
      `UPDATE support_tickets SET status = 'in_progress', "updatedAt" = NOW() WHERE id = $1 AND status = 'open' AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [ticketId, companyId]
    );
  }
}

export const supportEngine = new SupportEngineImpl();
