// ─── Umrah Engine — محرك العمرة ──────────────────────────────────────────
// Encapsulates umrah-domain GL operations — agent invoices, transport, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface UmrahGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class UmrahEngineImpl implements DomainEngine {
  readonly domainId = "umrah";
  readonly label = "إدارة العمرة";

  async postAgentInvoiceGL(
    ctx: UmrahGLContext,
    invoice: {
      id: number;
      ref: string;
      agentName: string;
      agentId: number;
      total: number;
      servicesTotal: number;
      penaltiesTotal: number;
      commission: number;
    }
  ) {
    const [arCode, revenueCode, penaltyCode, commissionCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_agent_receivable", "debit", "1210"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_revenue", "credit", "4200"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_revenue", "credit", "4210"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_commission", "debit", "5200"),
    ]);

    const lines: { accountCode: string; debit: number; credit: number; description: string; vendorId?: number }[] = [
      { accountCode: arCode, debit: invoice.total, credit: 0, description: `ذمم وكيل عمرة — ${invoice.agentName}`, vendorId: invoice.agentId },
    ];
    if (invoice.servicesTotal > 0) {
      lines.push({ accountCode: revenueCode, debit: 0, credit: invoice.servicesTotal, description: `إيراد خدمات عمرة — ${invoice.agentName}` });
    }
    if (invoice.penaltiesTotal > 0) {
      lines.push({ accountCode: penaltyCode, debit: 0, credit: invoice.penaltiesTotal, description: `إيراد غرامات تأخر — ${invoice.agentName}` });
    }
    if (invoice.commission > 0) {
      lines.push({ accountCode: commissionCode, debit: invoice.commission, credit: 0, description: `عمولة وكيل — ${invoice.agentName}` });
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `UMRAH-GL-${invoice.ref}`,
      description: `قيد فاتورة وكيل عمرة — ${invoice.agentName}`,
      type: "general",
      sourceType: "umrah_agent_invoice",
      sourceId: invoice.id,
      sourceKey: `umrah:agent_invoice:${invoice.id}`,
      guardTable: "umrah_agent_invoices",
      guardId: invoice.id,
      lines,
    });
  }

  async postTransportExpenseGL(
    ctx: UmrahGLContext,
    transport: {
      id: number;
      cost: number;
      fromLocation: string;
      toLocation: string;
      vehicleId?: number;
      driverId?: number;
    }
  ) {
    const [expenseCode, payableCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_transport_expense", "debit", "5300"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_transport_payable", "credit", "2100"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `UMRAH-TRN-${transport.id}`,
      description: `مصروف نقل عمرة — ${transport.fromLocation} → ${transport.toLocation}`,
      type: "general",
      sourceType: "umrah_transport",
      sourceId: transport.id,
      sourceKey: `umrah:transport:${transport.id}`,
      guardTable: "umrah_transport",
      guardId: transport.id,
      lines: [
        { accountCode: expenseCode, debit: transport.cost, credit: 0, description: `مصروف نقل — ${transport.fromLocation} → ${transport.toLocation}`, vehicleId: transport.vehicleId, driverId: transport.driverId },
        { accountCode: payableCode, debit: 0, credit: transport.cost, description: `مستحقات نقل عمرة` },
      ],
    });
  }
}

export const umrahEngine = new UmrahEngineImpl();
