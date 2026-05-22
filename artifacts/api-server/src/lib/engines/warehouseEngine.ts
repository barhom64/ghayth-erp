// ─── Warehouse Engine — محرك المستودعات ─────────────────────────────────
// Encapsulates warehouse-domain GL operations — inventory movements, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import type { DomainEngine } from "./domainEngineBase.js";

interface WarehouseGLContext {
  companyId: number;
  branchId: number;
  createdBy: number;
}

type MovementTrigger =
  | "receipt"
  | "issue"
  | "variance_in"
  | "variance_out"
  | "adjustment_in"
  | "adjustment_out";

class WarehouseEngineImpl implements DomainEngine {
  readonly domainId = "warehouse";
  readonly label = "إدارة المستودعات";

  async postMovementGL(
    ctx: WarehouseGLContext,
    movement: {
      id: number;
      trigger: MovementTrigger;
      totalValue: number;
      productName?: string;
      ref?: string;
    }
  ) {
    const productLabel = movement.productName ? ` — ${movement.productName}` : "";
    const ref = movement.ref ?? `INV-MV-${movement.id}`;

    let debitMapping: string;
    let debitFallback: string;
    let creditMapping: string;
    let creditFallback: string;
    let description: string;

    // Task #190 fix: fallbacks must reference codes that exist in the
    // standard Saudi chart_of_accounts seeded into every company. The
    // previous "1300" was a placeholder that never existed in the seed
    // (only 1100/1110/1120/1130/1140/1150/1160/1170 are seeded under
    // "1100 الأصول المتداولة"). 1150 = "المخزون" — the canonical
    // inventory asset account — is the correct fallback for any
    // inventory-on-hand leg.
    switch (movement.trigger) {
      case "receipt":
        debitMapping = "inventory_receipt";
        debitFallback = "1151";
        creditMapping = "inventory_receipt";
        creditFallback = "2115";
        description = `استلام مخزون${productLabel} — ${movement.totalValue.toFixed(2)} ريال`;
        break;
      case "issue":
        debitMapping = "inventory_issue_cogs";
        debitFallback = "5110";
        creditMapping = "inventory_issue_cogs";
        creditFallback = "1151";
        description = `صرف مخزون${productLabel} — تكلفة ${movement.totalValue.toFixed(2)} ريال`;
        break;
      case "variance_in":
        debitMapping = "inventory_variance";
        debitFallback = "1151";
        creditMapping = "inventory_variance";
        creditFallback = "5150";
        description = `فائض جرد${productLabel} — ${movement.totalValue.toFixed(2)} ريال`;
        break;
      case "variance_out":
        debitMapping = "inventory_variance";
        debitFallback = "5150";
        creditMapping = "inventory_variance";
        creditFallback = "1151";
        description = `عجز جرد${productLabel} — ${movement.totalValue.toFixed(2)} ريال`;
        break;
      case "adjustment_in":
        // Manual stock-up correction — same inventory-variance accounts
        // as a count surplus, distinct description.
        debitMapping = "inventory_variance";
        debitFallback = "1151";
        creditMapping = "inventory_variance";
        creditFallback = "5150";
        description = `تسوية مخزون — زيادة${productLabel} — ${movement.totalValue.toFixed(2)} ريال`;
        break;
      case "adjustment_out":
        // Manual write-down correction.
        debitMapping = "inventory_variance";
        debitFallback = "5150";
        creditMapping = "inventory_variance";
        creditFallback = "1151";
        description = `تسوية مخزون — نقص${productLabel} — ${movement.totalValue.toFixed(2)} ريال`;
        break;
    }

    const [drCode, crCode] = await Promise.all([
      financialEngine.resolveAccountCode(ctx.companyId, debitMapping, "debit", debitFallback),
      financialEngine.resolveAccountCode(ctx.companyId, creditMapping, "credit", creditFallback),
    ]);

    return financialEngine.postJournalEntry({
      companyId: ctx.companyId,
      branchId: ctx.branchId,
      createdBy: ctx.createdBy,
      ref,
      description,
      type: "general",
      sourceType: "warehouse_movement",
      sourceId: movement.id,
      sourceKey: `warehouse:movement:${movement.id}`,
      guardTable: "warehouse_movements",
      guardId: movement.id,
      lines: [
        { accountCode: drCode, debit: movement.totalValue, credit: 0 },
        { accountCode: crCode, debit: 0, credit: movement.totalValue },
      ],
    });
  }
}

export const warehouseEngine = new WarehouseEngineImpl();
