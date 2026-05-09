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

  async postPenaltyGL(
    ctx: UmrahGLContext,
    penalty: { id: number; amount: number; pilgrimName: string; agentName?: string; type: string }
  ) {
    const [receivableCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_receivable", "debit", "1220"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_revenue", "credit", "4210"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `UMRAH-PEN-${penalty.id}`,
      description: `غرامة ${penalty.type} — ${penalty.pilgrimName}${penalty.agentName ? ` / ${penalty.agentName}` : ""}`,
      type: "general",
      sourceType: "umrah_penalty",
      sourceId: penalty.id,
      sourceKey: `umrah:penalty:${penalty.id}`,
      guardTable: "umrah_penalties",
      guardId: penalty.id,
      lines: [
        { accountCode: receivableCode, debit: penalty.amount, credit: 0, description: `ذمم غرامة — ${penalty.pilgrimName}` },
        { accountCode: revenueCode, debit: 0, credit: penalty.amount, description: `إيراد غرامة ${penalty.type}` },
      ],
    });
  }

  async postPenaltyWaiverGL(
    ctx: UmrahGLContext,
    penalty: { id: number; amount: number; pilgrimName: string }
  ) {
    const [receivableCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_receivable", "debit", "1220"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_revenue", "credit", "4210"),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `UMRAH-PEN-WAIVE-${penalty.id}`,
      description: `إعفاء غرامة — ${penalty.pilgrimName}`,
      type: "general",
      sourceType: "umrah_penalty_waiver",
      sourceId: penalty.id,
      sourceKey: `umrah:penalty_waiver:${penalty.id}`,
      guardTable: "umrah_penalties",
      guardId: penalty.id,
      lines: [
        { accountCode: revenueCode, debit: penalty.amount, credit: 0, description: `عكس إيراد غرامة — إعفاء` },
        { accountCode: receivableCode, debit: 0, credit: penalty.amount, description: `إلغاء ذمم غرامة — إعفاء` },
      ],
    });
  }
}

export const umrahEngine = new UmrahEngineImpl();
