// ─── Warehouse Engine — محرك المستودعات ─────────────────────────────────
// Encapsulates warehouse-domain GL operations — inventory movements, etc.
// All journal entries go through the Financial Engine.

import { financialEngine } from "./financialEngine.js";
import type { DomainEngine } from "./domainEngineBase.js";
import { withTransaction, rawExecute } from "../rawdb.js";
import { checkFinancialPeriodOpen, todayISO, roundTo2 } from "../businessHelpers.js";
import { logger } from "../logger.js";

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
      /** Product FK on the JE line so per-product COGS / variance /
       *  inventory-on-hand drilldowns work from the GL. The route
       *  already has productId in scope (warehouse.ts:279 used to
       *  drop it on the floor); migration 201 added the column. */
      productId?: number;
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
        { accountCode: drCode, debit: movement.totalValue, credit: 0, productId: movement.productId },
        { accountCode: crCode, debit: 0, credit: movement.totalValue, productId: movement.productId },
      ],
    });
  }

  /**
   * Issue stock for internal consumption (e.g. fleet/maintenance parts) as a
   * REAL movement with full accounting: FIFO batch depletion + an `out`
   * movement row + COGS GL posting (DR COGS / CR inventory) via
   * `postMovementGL`. The cross-domain consumer (eventListeners.ts) used to
   * write a raw stock UPDATE + movement INSERT that skipped FIFO and GL —
   * leaving maintenance parts cost out of COGS. This keeps "كل إجراء له أثر"
   * true for consumption-side issues.
   *
   * Cost = explicit `unitCost` when given, else the product's weighted-average
   * cost (`costPrice`, falling back to `lastWaCost`). Stock mutation runs in a
   * transaction; the GL leg is posted afterwards in try/catch so a journal
   * failure never rolls back the committed physical movement (mirrors the
   * `/warehouse/movements` route).
   */
  async issueStock(
    ctx: WarehouseGLContext,
    params: {
      productId: number;
      quantity: number;
      unitCost?: number;
      /** Required movement reference — the CALLER owns numbering/correlation
       *  (e.g. the fleet maintenance handler passes `MAINT-{id}`). Same
       *  contract as financialEngine.createPurchaseOrder's required `ref`. */
      reference: string;
      notes?: string | null;
    }
  ): Promise<{ movementId: number | null; journalId: number | null }> {
    const qty = Math.abs(Number(params.quantity));
    if (!(qty > 0)) return { movementId: null, journalId: null };

    let movementId = 0;
    let issueCost = 0;
    let productName: string | undefined;

    await withTransaction(async (client) => {
      const prodRes = await client.query(
        `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [params.productId, ctx.companyId]
      );
      const product = prodRes.rows[0];
      if (!product) {
        logger.warn(`[warehouse.issueStock] product ${params.productId} not found for company ${ctx.companyId} — skipped`);
        return;
      }
      productName = product.name ?? undefined;

      // Valuation: explicit unit cost, else weighted-average (costPrice → lastWaCost).
      const waCost = Number(product.costPrice ?? 0) > 0 ? Number(product.costPrice) : Number(product.lastWaCost ?? 0);
      issueCost = Number(params.unitCost) > 0 ? Number(params.unitCost) : waCost;

      // FIFO batch depletion — oldest received first.
      const batchRes = await client.query(
        `SELECT id, quantity FROM warehouse_stock_batches WHERE "productId"=$1 AND quantity > 0 ORDER BY "receivedDate" ASC`,
        [params.productId]
      );
      let remaining = qty;
      const updates: { id: number; newQty: number }[] = [];
      for (const batch of batchRes.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(batch.quantity));
        remaining -= take;
        updates.push({ id: batch.id, newQty: Math.max(Number(batch.quantity) - take, 0) });
      }
      if (updates.length > 0) {
        const valuesSql: string[] = [];
        const p: unknown[] = [];
        for (const u of updates) {
          const base = p.length;
          valuesSql.push(`($${base + 1}::int, $${base + 2}::numeric)`);
          p.push(u.id, u.newQty);
        }
        await client.query(
          `UPDATE warehouse_stock_batches AS wsb SET quantity = v.new_qty
             FROM (VALUES ${valuesSql.join(",")}) AS v(id, new_qty) WHERE wsb.id = v.id`,
          p
        );
      }

      // On-hand decrement + the physical `out` movement.
      await client.query(
        `UPDATE warehouse_products SET "currentStock" = "currentStock" - $1, "updatedAt" = NOW()
           WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
        [qty, params.productId, ctx.companyId]
      );
      const movRes = await client.query(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy","branchId")
         VALUES ($1,$2,'out',$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ctx.companyId, params.productId, qty, issueCost, params.reference, params.notes ?? null, ctx.createdBy, ctx.branchId]
      );
      movementId = movRes.rows[0]?.id ?? 0;
    });

    if (!movementId) return { movementId: null, journalId: null };

    // COGS GL — guarded by an open financial period; a GL failure must never
    // undo the committed physical movement.
    let journalId: number | null = null;
    const totalValue = roundTo2(qty * Math.abs(issueCost));
    if (totalValue > 0) {
      try {
        const today = todayISO().toString().slice(0, 10);
        const period = await checkFinancialPeriodOpen(ctx.companyId, today);
        if (period.open) {
          const ref = params.reference && params.reference.length > 0
            ? `${params.reference}-JE-${movementId}`
            : `INV-MV-${movementId}`;
          const gl = await this.postMovementGL(ctx, {
            id: movementId,
            trigger: "issue",
            totalValue,
            productName,
            productId: params.productId,
            ref,
          });
          journalId = gl.journalId;
        } else {
          await rawExecute(
            `UPDATE warehouse_movements SET notes = COALESCE(notes,'') || $1 WHERE id=$2`,
            [` [GL skipped: الفترة المالية "${period.periodName ?? ""}" مغلقة]`, movementId]
          );
        }
      } catch (glErr) {
        logger.error(glErr, `[warehouse.issueStock] COGS GL posting failed for movement ${movementId}`);
      }
    }
    return { movementId, journalId };
  }
}

export const warehouseEngine = new WarehouseEngineImpl();
