// ─── Umrah Engine — محرك العمرة ──────────────────────────────────────────
// Encapsulates umrah-domain GL operations — agent invoices, transport, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import { rawExecute } from "../rawdb.js";
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
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_revenue", "credit", "4130"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_revenue", "credit", "4930"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_commission", "debit", "5240"),
    ]);

    // Carry umrahAgentId on every line so per-agent revenue/AR/penalty/
    // commission reports tie out from the GL. The previous shape used
    // `vendorId: invoice.agentId` on the AR line only — a semantic bug
    // (umrah_agents is its own table, not vendors) AND a coverage gap
    // (CR + commission lines dropped the agent dim entirely). Migration
    // 201 added the umrahAgentId column to journal_lines for exactly
    // this drilldown.
    const lines: { accountCode: string; debit: number; credit: number; description: string; umrahAgentId?: number }[] = [
      { accountCode: arCode, debit: invoice.total, credit: 0, description: `ذمم وكيل عمرة — ${invoice.agentName}`, umrahAgentId: invoice.agentId },
    ];
    if (invoice.servicesTotal > 0) {
      lines.push({ accountCode: revenueCode, debit: 0, credit: invoice.servicesTotal, description: `إيراد خدمات عمرة — ${invoice.agentName}`, umrahAgentId: invoice.agentId });
    }
    if (invoice.penaltiesTotal > 0) {
      lines.push({ accountCode: penaltyCode, debit: 0, credit: invoice.penaltiesTotal, description: `إيراد غرامات تأخر — ${invoice.agentName}`, umrahAgentId: invoice.agentId });
    }
    if (invoice.commission > 0) {
      lines.push({ accountCode: commissionCode, debit: invoice.commission, credit: 0, description: `عمولة وكيل — ${invoice.agentName}`, umrahAgentId: invoice.agentId });
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
      /** Season cost-centre — without this, per-season transport-cost
       *  breakdowns at season close had to JOIN umrah_transport back
       *  to the JE; now the GL line carries it directly. */
      umrahSeasonId?: number | null;
    }
  ) {
    const [expenseCode, payableCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_transport_expense", "debit", "5140"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_transport_payable", "credit", "2150"),
    ]);

    const umrahSeasonId = transport.umrahSeasonId ?? undefined;

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
        { accountCode: expenseCode, debit: transport.cost, credit: 0, description: `مصروف نقل — ${transport.fromLocation} → ${transport.toLocation}`, vehicleId: transport.vehicleId, driverId: transport.driverId, umrahSeasonId },
        { accountCode: payableCode, debit: 0, credit: transport.cost, description: `مستحقات نقل عمرة`, vehicleId: transport.vehicleId, driverId: transport.driverId, umrahSeasonId },
      ],
    });
  }

  async postPenaltyGL(
    ctx: UmrahGLContext,
    penalty: {
      id: number;
      amount: number;
      pilgrimName: string;
      agentName?: string;
      type: string;
      /** umrah_agents.id — propagates onto both lines so per-agent
       *  penalty income reports work from the GL. */
      agentId?: number;
      /** umrah_seasons.id — propagates onto both lines so per-season
       *  penalty income breakdowns work from the GL. */
      seasonId?: number;
    }
  ) {
    const [receivableCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_receivable", "debit", "1220"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_revenue", "credit", "4930"),
    ]);

    const result = await financialEngine.postJournalEntry({
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
        { accountCode: receivableCode, debit: penalty.amount, credit: 0, description: `ذمم غرامة — ${penalty.pilgrimName}`, umrahAgentId: penalty.agentId, umrahSeasonId: penalty.seasonId },
        { accountCode: revenueCode, debit: 0, credit: penalty.amount, description: `إيراد غرامة ${penalty.type}`, umrahAgentId: penalty.agentId, umrahSeasonId: penalty.seasonId },
      ],
    });

    // Bidirectional traceability — store the JE id on the penalty row
    // so operators can navigate from penalty → GL trail without
    // separately querying journal_entries by (sourceType, sourceId).
    // Skipped on already-existing entries (idempotency re-runs) since
    // the row was already linked the first time around.
    if (!result.alreadyExists) {
      await rawExecute(
        `UPDATE umrah_penalties SET "journalEntryId" = $1
          WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [result.journalId, penalty.id, ctx.companyId],
      );
    }

    return result;
  }

  async postPenaltyWaiverGL(
    ctx: UmrahGLContext,
    penalty: {
      id: number;
      amount: number;
      pilgrimName: string;
      /** Same agent/season dims as postPenaltyGL so a waiver reverses
       *  cleanly against the original posting in per-agent / per-season
       *  reports. */
      agentId?: number;
      seasonId?: number;
    }
  ) {
    const [receivableCode, revenueCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_receivable", "debit", "1220"),
      financialEngine.resolveAccountCode(ctx.companyId, "umrah_penalty_revenue", "credit", "4930"),
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
        { accountCode: revenueCode, debit: penalty.amount, credit: 0, description: `عكس إيراد غرامة — إعفاء`, umrahAgentId: penalty.agentId, umrahSeasonId: penalty.seasonId },
        { accountCode: receivableCode, debit: 0, credit: penalty.amount, description: `إلغاء ذمم غرامة — إعفاء`, umrahAgentId: penalty.agentId, umrahSeasonId: penalty.seasonId },
      ],
    });
  }
}

export const umrahEngine = new UmrahEngineImpl();
