// ─── Store Engine — محرك المتجر ──────────────────────────────────────────
// Encapsulates store-domain GL operations, routing all journal entries
// through the Financial Engine with proper period checks and sourceKey.

import { financialEngine } from "./financialEngine.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface StoreGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

class StoreEngineImpl implements DomainEngine {
  readonly domainId = "store";
  readonly label = "المتجر الإلكتروني";

  async postOrderGL(
    ctx: StoreGLContext,
    order: {
      id: number;
      subtotal: number;
      vatAmount: number;
      total: number;
      cogsAmount?: number;
    }
  ) {
    const codes = await financialEngine.resolveAccountCodes(ctx.companyId, [
      { operationType: "store_cash", side: "debit", fallbackCode: "1100" },
      { operationType: "store_revenue", side: "credit", fallbackCode: "4300" },
      { operationType: "vat_output", side: "credit", fallbackCode: "2200" },
      { operationType: "store_cogs", side: "debit", fallbackCode: "5300" },
      { operationType: "store_inventory", side: "credit", fallbackCode: "1500" },
    ]);

    const lines = [
      { accountCode: codes["store_cash_debit"], debit: order.total, credit: 0, description: `مبيعات متجر — طلب #${order.id}` },
      { accountCode: codes["store_revenue_credit"], debit: 0, credit: order.subtotal, description: `إيرادات مبيعات — طلب #${order.id}` },
    ];

    if (order.vatAmount > 0) {
      lines.push({
        accountCode: codes["vat_output_credit"],
        debit: 0,
        credit: order.vatAmount,
        description: `ضريبة القيمة المضافة — طلب #${order.id}`,
      });
    }

    if (order.cogsAmount && order.cogsAmount > 0) {
      lines.push(
        { accountCode: codes["store_cogs_debit"], debit: order.cogsAmount, credit: 0, description: `تكلفة بضاعة مباعة — طلب #${order.id}` },
        { accountCode: codes["store_inventory_credit"], debit: 0, credit: order.cogsAmount, description: `مخزون — طلب #${order.id}` }
      );
    }

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref: `JE-STORE-${order.id}`,
      description: `مبيعات متجر — طلب #${order.id}`,
      type: "sales",
      sourceType: "store_orders",
      sourceId: order.id,
      sourceKey: `store:order:${order.id}`,
      guardTable: "store_orders",
      guardId: order.id,
      lines,
    });
  }
}

export const storeEngine = new StoreEngineImpl();
