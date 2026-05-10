// ─── CRM Engine — محرك إدارة العملاء ─────────────────────────────────────
// Encapsulates CRM-domain operations that cross domain boundaries.
// Deal-won invoice creation goes through events instead of direct writes.

import { financialEngine } from "./financialEngine.js";
import { eventBus } from "../eventBus.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface CRMGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class CRMEngineImpl implements DomainEngine {
  readonly domainId = "crm";
  readonly label = "إدارة العملاء";

  async postDealWonGL(
    ctx: CRMGLContext,
    deal: {
      id: number;
      clientId: number;
      amount: number;
      vatAmount: number;
      description?: string;
    }
  ) {
    const [debitCode, creditCode, vatCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "accounts_receivable", "debit", "1200"),
      financialEngine.resolveAccountCode(ctx.companyId, "sales_revenue", "credit", "4100"),
      financialEngine.resolveAccountCode(ctx.companyId, "vat_output", "credit", "2200"),
    ]);

    const lines = [
      {
        accountCode: debitCode,
        debit: deal.amount + deal.vatAmount,
        credit: 0,
        description: `ذمم عميل — صفقة #${deal.id}`,
        clientId: deal.clientId,
      },
      {
        accountCode: creditCode,
        debit: 0,
        credit: deal.amount,
        description: `إيرادات صفقة #${deal.id}`,
        clientId: deal.clientId,
      },
    ];

    if (deal.vatAmount > 0) {
      lines.push({
        accountCode: vatCode,
        debit: 0,
        credit: deal.vatAmount,
        description: `ضريبة القيمة المضافة — صفقة #${deal.id}`,
        clientId: deal.clientId,
      });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-CRM-${deal.id}`,
      description: deal.description ?? `إتمام صفقة #${deal.id}`,
      type: "sales",
      sourceType: "crm_opportunities",
      sourceId: deal.id,
      sourceKey: `crm:deal:${deal.id}`,
      guardTable: "crm_opportunities",
      guardId: deal.id,
      lines,
    });
  }

  /**
   * Request invoice creation from Finance domain when a deal is won.
   * Emits event instead of writing directly to the invoices table.
   */
  async requestInvoiceCreation(
    ctx: CRMGLContext,
    params: {
      clientId: number;
      opportunityId: number;
      ref: string;
      description: string;
      subtotal: number;
      vatAmount: number;
      total: number;
      dueDate: string;
    }
  ) {
    eventBus.emit("crm.deal.invoice_requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      ...params,
    });

    return { requested: true };
  }

  async requestLegalContractCreation(
    ctx: CRMGLContext,
    params: {
      ref: string;
      title: string;
      contractType: string;
      partyName: string;
      startDate: string;
      endDate: string;
      value: number;
    }
  ) {
    eventBus.emit("crm.legal_contract.requested", {
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      userId: ctx.createdBy,
      ...params,
    });
    return { requested: true };
  }
}

export const crmEngine = new CRMEngineImpl();
