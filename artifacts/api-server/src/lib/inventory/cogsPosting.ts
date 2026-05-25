// ─────────────────────────────────────────────────────────────────────────────
// cogsPosting.ts
//
// Cost-of-Goods-Sold (COGS) posting helper for customer invoices.
//
// Customer invoice approval today posts:
//
//   DR Accounts Receivable     115     (1200)
//        CR Revenue               100  (4000)
//        CR VAT Payable            15  (2300)
//
// But omits the inventory side, which leaves gross margin
// systematically overstated. Right answer:
//
//                                      add:
//   DR COGS                     60      (5100)
//        CR Inventory             60   (1400)
//
// This module is the PURE PLANNER: given a list of invoice lines
// with productId + quantity, it
//
//   1. resolves each product's valuation method + active lots from
//      warehouse_stock_lots,
//   2. runs the matching picker (FIFO / LIFO / weighted average) to
//      decide which physical lots feed the sale,
//   3. aggregates the extended costs per (product, warehouse) and
//      builds DR COGS + CR Inventory JE lines, AND
//   4. returns a stock-movement plan the caller applies in the same
//      transaction.
//
// It does NOT write the GL or move stock itself — that's the
// invoice approve handler's job (so everything posts atomically
// inside its existing `withTransaction`).
//
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from "pg";
import { roundTo2 } from "../businessHelpers.js";
import { pickWithMethod } from "./valuation/index.js";
import type { PickableLot, PickPlan, ValuationMethod } from "./types.js";
import { getAccountForPurpose } from "../gl/account-purposes.js";

// ─── Inputs ─────────────────────────────────────────────────────────────────

/**
 * A single invoice line that COULD trigger COGS posting. Lines
 * without a productId, or for non-inventory products (services),
 * are skipped by the planner.
 */
export interface CogsLineInput {
  /** invoice_lines.id — used as the source-row pointer on the
   *  warehouse_movement record we'll insert. */
  invoiceLineId: number;
  /** Quantity sold on this line. Must be > 0; lines with non-
   *  positive qty are filtered out by the planner. */
  quantity: number;
  /** warehouse_products.id; null = service line, skip. */
  productId: number | null;
  /** Optional dimensions to propagate onto the COGS JE line so
   *  segment P&L reports stay attributed correctly. */
  costCenterId?: number | null;
  branchId?: number | null;
  projectId?: number | null;
  departmentId?: number | null;
}

export interface CogsPlanInput {
  companyId: number;
  invoiceId: number;
  branchId?: number | null;
  /** When set, restrict lot selection to lots in this warehouse.
   *  When null/undefined the planner uses every active lot for the
   *  product in the company (legacy behaviour for tenants without
   *  warehouse separation). */
  warehouseId?: number | null;
  lines: CogsLineInput[];
}

// ─── Outputs ────────────────────────────────────────────────────────────────

/**
 * One DR COGS / CR Inventory pair, ready to feed into financialEngine
 * .postJournalEntry. Bucketed by (account, dimensions) to avoid line
 * explosion when an invoice has 200 SKUs all hitting the same account
 * pair.
 */
export interface CogsJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  // Dimensions use `undefined` (not `null`) so the object is
  // structurally compatible with the JE line shape the engine
  // expects. Builders convert null/missing → undefined before
  // emitting.
  costCenterId?: number;
  branchId?: number;
  projectId?: number;
  departmentId?: number;
}

/**
 * Per-line COGS snapshot to write back onto invoice_lines so the
 * sales-return reversal can credit the SAME lots the sale consumed
 * (FIFO compliance — auditors flag if a return restocks at a price
 * that doesn't match the original sale).
 */
export interface CogsLineSnapshot {
  invoiceLineId: number;
  productId: number;
  quantity: number;
  /** Sum of extendedCost from the picker. */
  cogsAmount: number;
  /** Blended unit cost (cogsAmount / quantity) — for display. */
  cogsUnitCost: number;
  /** Lot-by-lot breakdown for sales-return reversal. */
  allocations: PickPlan["allocations"];
}

/**
 * One stock-movement row to insert in warehouse_movements after the
 * GL posts. Type 'out', signed positive quantity (the table convention
 * is unsigned + 'in'/'out' on the type column).
 */
export interface StockMovementInput {
  productId: number;
  quantity: number;
  unitCost: number;
  lotId: number;
  warehouseId: number;
  reference: string;
  notes: string;
}

export interface CogsPlan {
  /** Aggregated DR COGS / CR Inventory pairs. Empty when no
   *  inventoried products on the invoice. */
  journalLines: CogsJournalLine[];
  /** Per-invoice-line snapshots → write back to invoice_lines. */
  lineSnapshots: CogsLineSnapshot[];
  /** Stock-movement rows + lot decrements the caller must apply. */
  stockMovements: StockMovementInput[];
  /** Σ cogsAmount across all lines. */
  totalCogs: number;
  /** Lines that COULDN'T be costed (insufficient stock / product not
   *  tracked / not found). Caller decides whether to block approval
   *  or post a partial COGS + warn. */
  warnings: CogsWarning[];
}

export type CogsWarning = {
  invoiceLineId: number;
  productId: number | null;
  reason:
    | "product_not_found"
    | "product_not_tracked"
    | "no_active_lots"
    | "insufficient_stock"
    | "no_cogs_account"
    | "no_inventory_account";
  detail?: string;
};

// ─── Internal types ─────────────────────────────────────────────────────────

interface ProductRow {
  id: number;
  costingMethod: ValuationMethod;
  tracksLots: boolean;
  lastWaCost: number;
}

interface LotRow extends PickableLot {
  warehouseId: number;
}

// ─── Pure planner ───────────────────────────────────────────────────────────

/**
 * Build the COGS posting plan for an invoice. Does NOT mutate the
 * DB. The route handler must:
 *
 *   1. call this inside a transaction,
 *   2. throw if `warnings` contains an `insufficient_stock` and
 *      the company has «block on shortage» turned on,
 *   3. extend the invoice JE with `plan.journalLines`,
 *   4. apply `plan.stockMovements` via applyStockMovements() below.
 *
 * The DB I/O (lot lookup + account resolution) goes through the
 * passed-in PoolClient so everything stays in one transaction.
 */
export async function planCogsForInvoice(
  client: PoolClient,
  input: CogsPlanInput,
): Promise<CogsPlan> {
  const lineSnapshots: CogsLineSnapshot[] = [];
  const stockMovements: StockMovementInput[] = [];
  const warnings: CogsWarning[] = [];

  // 1. Resolve account pair once per invoice.
  const cogsRes = await getAccountForPurpose(input.companyId, "cogs_default", "debit");
  const invRes  = await getAccountForPurpose(input.companyId, "inventory_asset", "credit");
  if (!cogsRes || !invRes) {
    // No account configured AND no fallback in the chart — surface
    // one warning per line and return an empty plan so the caller
    // can decide whether to block.
    for (const ln of input.lines) {
      if (ln.productId == null || ln.quantity <= 0) continue;
      warnings.push({
        invoiceLineId: ln.invoiceLineId,
        productId: ln.productId,
        reason: !cogsRes ? "no_cogs_account" : "no_inventory_account",
        detail: "Configure cogs_default + inventory_asset in accounting_mappings",
      });
    }
    return {
      journalLines: [], lineSnapshots, stockMovements,
      totalCogs: 0, warnings,
    };
  }

  // 2. Group lines by product so we hit the DB once per product
  //    instead of once per line (an invoice with 5 lines of the
  //    same SKU = 1 product lookup, not 5).
  const linesByProduct = new Map<number, CogsLineInput[]>();
  for (const ln of input.lines) {
    if (ln.productId == null || ln.quantity <= 0) continue;
    const arr = linesByProduct.get(ln.productId) ?? [];
    arr.push(ln);
    linesByProduct.set(ln.productId, arr);
  }
  if (linesByProduct.size === 0) {
    return { journalLines: [], lineSnapshots, stockMovements, totalCogs: 0, warnings };
  }

  // 3. Bulk-load products + lots in one round-trip each.
  const productIds = [...linesByProduct.keys()];
  const productRows = await loadProducts(client, input.companyId, productIds);
  const productById = new Map(productRows.map((p) => [p.id, p]));

  // 4. For each product, run the picker once per line and collect
  //    allocations.
  // Bucket COGS lines by (account+dimensions) to keep the JE compact.
  const bucketsDr = new Map<string, CogsJournalLine>();
  const bucketsCr = new Map<string, CogsJournalLine>();

  for (const [productId, lines] of linesByProduct) {
    const product = productById.get(productId);
    if (!product) {
      for (const ln of lines) warnings.push({
        invoiceLineId: ln.invoiceLineId, productId, reason: "product_not_found",
      });
      continue;
    }
    if (!product.tracksLots) {
      for (const ln of lines) warnings.push({
        invoiceLineId: ln.invoiceLineId, productId, reason: "product_not_tracked",
        detail: "Product has tracksLots=false; cannot compute COGS via lot picker",
      });
      continue;
    }

    const lots = await loadLots(client, input.companyId, productId, input.warehouseId ?? null);
    if (lots.length === 0) {
      for (const ln of lines) warnings.push({
        invoiceLineId: ln.invoiceLineId, productId, reason: "no_active_lots",
      });
      continue;
    }

    // Mutate-in-place lot quantities as we walk the lines so the
    // SECOND line of the same product doesn't double-pick the first
    // line's stock.
    for (const ln of lines) {
      const plan = pickWithMethod({
        method: product.costingMethod,
        quantity: Number(ln.quantity),
        lots: lots.filter((l) => l.quantity > 0),
      });

      if (plan.shortfall > 0) {
        warnings.push({
          invoiceLineId: ln.invoiceLineId, productId,
          reason: "insufficient_stock",
          detail: `Need ${ln.quantity}, picked ${plan.totalQuantity}, short ${plan.shortfall}`,
        });
        // Don't post a partial-COGS line — let the caller decide
        // whether to block. Skip this invoice line.
        continue;
      }

      const cogsAmount = roundTo2(plan.totalCost);
      lineSnapshots.push({
        invoiceLineId: ln.invoiceLineId,
        productId,
        quantity: Number(ln.quantity),
        cogsAmount,
        cogsUnitCost: ln.quantity > 0 ? roundTo2(plan.totalCost / Number(ln.quantity)) : 0,
        allocations: plan.allocations,
      });

      // Decrement the in-memory lot quantities so the next line
      // picks from what's left, not from the original snapshot.
      for (const alloc of plan.allocations) {
        const lot = lots.find((l) => l.id === alloc.lotId);
        if (lot) lot.quantity = roundTo2(lot.quantity - alloc.quantity);

        const lotRow = lots.find((l) => l.id === alloc.lotId);
        if (!lotRow) continue;
        stockMovements.push({
          productId,
          quantity: alloc.quantity,
          unitCost: alloc.unitCost,
          lotId: alloc.lotId,
          warehouseId: lotRow.warehouseId,
          reference: `INV-${input.invoiceId}`,
          notes: `بيع — فاتورة #${input.invoiceId} سطر #${ln.invoiceLineId}`,
        });
      }

      // Aggregate into JE buckets by (account, dimensions).
      const dimKey = `${ln.costCenterId ?? ""}|${ln.branchId ?? input.branchId ?? ""}|${ln.projectId ?? ""}|${ln.departmentId ?? ""}`;
      const drKey = `${cogsRes.accountCode}|${dimKey}`;
      const crKey = `${invRes.accountCode}|${dimKey}`;
      const drExisting = bucketsDr.get(drKey);
      if (drExisting) {
        drExisting.debit = roundTo2(drExisting.debit + cogsAmount);
      } else {
        bucketsDr.set(drKey, {
          accountCode: cogsRes.accountCode,
          debit: cogsAmount, credit: 0,
          description: `تكلفة بضاعة مباعة — فاتورة #${input.invoiceId}`,
          costCenterId: ln.costCenterId ?? undefined,
          branchId: ln.branchId ?? input.branchId ?? undefined,
          projectId: ln.projectId ?? undefined,
          departmentId: ln.departmentId ?? undefined,
        });
      }
      const crExisting = bucketsCr.get(crKey);
      if (crExisting) {
        crExisting.credit = roundTo2(crExisting.credit + cogsAmount);
      } else {
        bucketsCr.set(crKey, {
          accountCode: invRes.accountCode,
          debit: 0, credit: cogsAmount,
          description: `مخزون — فاتورة #${input.invoiceId}`,
          costCenterId: ln.costCenterId ?? undefined,
          branchId: ln.branchId ?? input.branchId ?? undefined,
          projectId: ln.projectId ?? undefined,
          departmentId: ln.departmentId ?? undefined,
        });
      }
    }
  }

  const journalLines = [...bucketsDr.values(), ...bucketsCr.values()];
  const totalCogs = roundTo2(
    [...bucketsDr.values()].reduce((s, l) => s + l.debit, 0)
  );
  return { journalLines, lineSnapshots, stockMovements, totalCogs, warnings };
}

/**
 * Apply the stock movements + lot decrements produced by planCogsForInvoice.
 * Called by the invoice-approve handler INSIDE the same transaction as
 * the JE posting so a JE failure rolls the stock back automatically.
 */
export async function applyStockMovements(
  client: PoolClient,
  companyId: number,
  movements: StockMovementInput[],
  createdBy: number,
  /** Stamped onto warehouse_movements.journalEntryId so auditors can
   *  jump from a stock OUT row directly to the JE that booked the
   *  matching DR COGS / CR Inventory pair. Optional for callers that
   *  apply movements before the JE id is known (the route handler
   *  passes the result.journalId from postJournalEntry). */
  journalEntryId?: number,
): Promise<void> {
  for (const mv of movements) {
    // 1. Decrement the lot quantity.
    await client.query(
      `UPDATE warehouse_stock_lots
          SET quantity = quantity - $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [mv.quantity, mv.lotId, companyId],
    );

    // 2. Decrement the denormalised product stock counter (used by
    //    the warehouse dashboard and reorder alerts; OK if it drifts
    //    by a few ms behind the lots — the lots are the source of
    //    truth).
    await client.query(
      `UPDATE warehouse_products
          SET "currentStock" = GREATEST("currentStock" - $1, 0),
              "updatedAt"    = NOW()
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [Math.ceil(mv.quantity), mv.productId, companyId],
    );

    // 3. Insert the audit row (journalEntryId nullable — see migration 211).
    await client.query(
      `INSERT INTO warehouse_movements
         ("companyId","productId",type,quantity,"unitCost",reference,notes,
          "createdBy","branchId","lotId","glStatus","journalEntryId")
       VALUES ($1,$2,'out',$3,$4,$5,$6,$7,NULL,$8,'posted',$9)`,
      [
        companyId, mv.productId, mv.quantity, mv.unitCost,
        mv.reference, mv.notes, createdBy, mv.lotId,
        journalEntryId ?? null,
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSAL — credit-memo / sales-return path.
//
// When a customer returns goods we must undo the COGS that was
// posted at invoice approval. The original allocation lives on
// invoice_lines.cogsAllocationJson — for a full return we restore
// 100 % of those lots; for a partial we restore proportionally
// (creditAmount / invoice.total).
//
// The planner is PURE — it reads invoice_lines + the JSON,
// returns the inverted DR Inventory / CR COGS lines + the stock
// movements (`type='return'`), and the per-line UPDATEs the
// route must apply (cumulative `cogsReversedAmount` + append a
// snapshot to `cogsReversalJson`). The credit-memo handler
// splices the JE lines into its own posting and calls
// applyStockReversals() to do the restock.
// ─────────────────────────────────────────────────────────────────────────────

export interface CogsReversalInput {
  companyId: number;
  invoiceId: number;
  /** Proportion of the original COGS to reverse. 1.0 = full
   *  return; 0.25 = a quarter of the invoice's value was
   *  refunded. The caller computes this from creditAmount /
   *  invoice.total so the math here stays pure. */
  ratio: number;
  /** Memo id stamped onto the per-line cogsReversalJson entry so
   *  a second / third partial memo can see what's already been
   *  restored and not over-reverse. */
  memoId: number;
}

export interface CogsReversalLineUpdate {
  invoiceLineId: number;
  /** New value to assign to invoice_lines.cogsReversedAmount
   *  (caller does the UPDATE; this is the cumulative running
   *  total, not the delta). */
  newReversedAmount: number;
  /** Per-memo reversal snapshot to APPEND onto cogsReversalJson. */
  snapshot: {
    memoId: number;
    ratio: number;
    reversedAt: string;
    cogsReversed: number;
    allocations: PickPlan["allocations"];
  };
}

export interface CogsReversalPlan {
  /** Inverted DR Inventory / CR COGS pairs ready to splice into
   *  the credit-memo's JE. Bucketed by (account, dimensions). */
  journalLines: CogsJournalLine[];
  /** Stock-movement rows to apply via applyStockReversals(). */
  stockMovements: StockMovementInput[];
  /** Per-line UPDATEs the route must commit alongside the JE. */
  lineUpdates: CogsReversalLineUpdate[];
  /** Σ COGS being reversed by this plan. */
  totalReversed: number;
  /** Soft warnings surfaced to the route layer — non-fatal. The
   *  credit-memo handler bubbles these into its response so the
   *  operator + UI can show "review before approval" without
   *  blocking the refund. */
  warnings: CogsReversalWarning[];
}

export type CogsReversalWarningReason =
  | "lot_quarantine"
  | "lot_recalled"
  | "lot_expired"
  | "lot_disposed"
  | "lot_qc_rejected"
  | "lot_not_found";

export interface CogsReversalWarning {
  invoiceLineId: number;
  productId: number;
  lotId: number;
  reason: CogsReversalWarningReason;
  detail?: string;
}

interface InvoiceLineCogsRow {
  id: number;
  productId: number | null;
  cogsAmount: string | number | null;
  cogsReversedAmount: string | number | null;
  cogsAllocationJson: PickPlan["allocations"] | null;
  costCenterId: number | null;
  projectId: number | null;
  employeeId: number | null;
  branchId: number | null;
}

/**
 * Plan the COGS reversal for a credit memo. Does NOT mutate the
 * DB. The route handler must:
 *
 *   1. call this inside a transaction,
 *   2. extend the memo JE with `plan.journalLines`,
 *   3. apply `plan.stockMovements` via applyStockReversals() below,
 *   4. apply `plan.lineUpdates` via UPDATE invoice_lines (per-line
 *      cogsReversedAmount + append snapshot to cogsReversalJson).
 *
 * Returns an empty plan when `ratio <= 0`, when the invoice has
 * no COGS to reverse, or when every line was already fully
 * reversed by earlier memos. Caller treats an empty plan as
 * "skip COGS reversal for this memo" — not an error.
 */
export async function planCogsReversal(
  client: PoolClient,
  input: CogsReversalInput,
): Promise<CogsReversalPlan> {
  const empty: CogsReversalPlan = {
    journalLines: [], stockMovements: [], lineUpdates: [], totalReversed: 0,
    warnings: [],
  };
  if (input.ratio <= 0) return empty;
  // Cap at 100 % so a buggy ratio like 1.0001 doesn't over-restock.
  const ratio = Math.min(input.ratio, 1);

  // 1. Resolve the same account pair the forward planner uses —
  //    inverted (DR Inventory / CR COGS).
  const invRes  = await getAccountForPurpose(input.companyId, "inventory_asset", "debit");
  const cogsRes = await getAccountForPurpose(input.companyId, "cogs_default", "credit");
  if (!invRes || !cogsRes) return empty;

  // 2. Pull every invoice line that had COGS posted and isn't
  //    already fully reversed.
  const linesRes = await client.query<InvoiceLineCogsRow>(
    `SELECT id, "productId",
            "cogsAmount"::float8         AS "cogsAmount",
            "cogsReversedAmount"::float8 AS "cogsReversedAmount",
            "cogsAllocationJson"         AS "cogsAllocationJson",
            "costCenterId", "projectId", "employeeId", "branchId"
       FROM invoice_lines
      WHERE "invoiceId" = $1
        AND COALESCE("cogsAmount", 0) > COALESCE("cogsReversedAmount", 0)
      ORDER BY id`,
    [input.invoiceId],
  );
  if (linesRes.rows.length === 0) return empty;

  const stockMovements: StockMovementInput[] = [];
  const lineUpdates: CogsReversalLineUpdate[] = [];
  const warnings: CogsReversalWarning[] = [];
  const bucketsDr = new Map<string, CogsJournalLine>();
  const bucketsCr = new Map<string, CogsJournalLine>();
  let totalReversed = 0;
  const reversedAt = new Date().toISOString();

  for (const ln of linesRes.rows) {
    const cogsAmount = Number(ln.cogsAmount ?? 0);
    const alreadyReversed = Number(ln.cogsReversedAmount ?? 0);
    const remaining = roundTo2(cogsAmount - alreadyReversed);
    if (remaining <= 0) continue;
    // Slice off `ratio` of the ORIGINAL cogsAmount, then cap at
    // what's still unreversed. This guarantees that
    //   memo₁ ratio 0.5 + memo₂ ratio 0.5 + memo₃ ratio 0.5
    // reverses 1.0 once (not 1.5). The unused half of memo₃ is
    // simply lost — at-fault data, not silent over-restock.
    const slice = roundTo2(Math.min(cogsAmount * ratio, remaining));
    if (slice <= 0) continue;
    // Within this line, prorate each lot by `slice / remaining`.
    const allocs = Array.isArray(ln.cogsAllocationJson) ? ln.cogsAllocationJson : [];
    if (allocs.length === 0 || !ln.productId) continue;
    const lineRatio = slice / cogsAmount; // 0 < lineRatio ≤ ratio
    const lotsForProduct = await loadLotsForReversal(client, input.companyId, ln.productId, allocs.map((a) => a.lotId));

    const reversedAllocs: PickPlan["allocations"] = [];
    for (const alloc of allocs) {
      const restoreQty = roundTo2(alloc.quantity * lineRatio);
      const restoreCost = roundTo2(alloc.extendedCost * lineRatio);
      if (restoreQty <= 0) continue;
      reversedAllocs.push({
        lotId: alloc.lotId,
        quantity: restoreQty,
        unitCost: alloc.unitCost,
        extendedCost: restoreCost,
      });
      const lot = lotsForProduct.find((l) => l.id === alloc.lotId);
      // Flag operator / QC if the lot's status drifted between sale
      // and return. We still proceed with the restock (the customer
      // is owed their refund and the inventory must balance) — the
      // warning is purely advisory so QC can re-inspect.
      if (!lot) {
        warnings.push({
          invoiceLineId: ln.id, productId: ln.productId, lotId: alloc.lotId,
          reason: "lot_not_found",
          detail: "Original lot deleted between sale and return — restock will hit a missing row (no quantity increment); review manually.",
        });
      } else {
        const statusReasonMap: Record<string, CogsReversalWarningReason | null> = {
          quarantine: "lot_quarantine",
          recalled:   "lot_recalled",
          expired:    "lot_expired",
          disposed:   "lot_disposed",
        };
        const statusReason = statusReasonMap[lot.status] ?? null;
        if (statusReason) {
          warnings.push({
            invoiceLineId: ln.id, productId: ln.productId, lotId: alloc.lotId,
            reason: statusReason,
            detail: `Lot status is '${lot.status}'${lot.recalledAt ? ` (since ${lot.recalledAt})` : ""} — QC should re-inspect the returned units before re-issuing.`,
          });
        }
        if (lot.qualityControlStatus === "rejected") {
          warnings.push({
            invoiceLineId: ln.id, productId: ln.productId, lotId: alloc.lotId,
            reason: "lot_qc_rejected",
            detail: "Lot was QC-rejected after the original sale — the returned units may be physically defective.",
          });
        }
      }
      stockMovements.push({
        productId: ln.productId,
        quantity: restoreQty,
        unitCost: alloc.unitCost,
        lotId: alloc.lotId,
        warehouseId: lot?.warehouseId ?? 0,
        reference: `CM-${input.memoId}`,
        notes: `إرجاع — إشعار دائن #${input.memoId} (سطر فاتورة #${ln.id})`,
      });
    }

    // Bucket DR Inventory / CR COGS lines by dimensions so a
    // 200-line invoice's reversal still posts as compact pairs.
    const dimKey = `${ln.costCenterId ?? ""}|${ln.branchId ?? ""}|${ln.projectId ?? ""}|${ln.employeeId ?? ""}`;
    const drKey = `${invRes.accountCode}|${dimKey}`;
    const crKey = `${cogsRes.accountCode}|${dimKey}`;
    const drExisting = bucketsDr.get(drKey);
    if (drExisting) {
      drExisting.debit = roundTo2(drExisting.debit + slice);
    } else {
      bucketsDr.set(drKey, {
        accountCode: invRes.accountCode,
        debit: slice, credit: 0,
        description: `استرجاع مخزون — إشعار دائن #${input.memoId}`,
        costCenterId: ln.costCenterId ?? undefined,
        branchId: ln.branchId ?? undefined,
        projectId: ln.projectId ?? undefined,
        departmentId: undefined,
      });
    }
    const crExisting = bucketsCr.get(crKey);
    if (crExisting) {
      crExisting.credit = roundTo2(crExisting.credit + slice);
    } else {
      bucketsCr.set(crKey, {
        accountCode: cogsRes.accountCode,
        debit: 0, credit: slice,
        description: `عكس تكلفة بضاعة — إشعار دائن #${input.memoId}`,
        costCenterId: ln.costCenterId ?? undefined,
        branchId: ln.branchId ?? undefined,
        projectId: ln.projectId ?? undefined,
        departmentId: undefined,
      });
    }

    lineUpdates.push({
      invoiceLineId: ln.id,
      newReversedAmount: roundTo2(alreadyReversed + slice),
      snapshot: {
        memoId: input.memoId,
        ratio: lineRatio,
        reversedAt,
        cogsReversed: slice,
        allocations: reversedAllocs,
      },
    });
    totalReversed = roundTo2(totalReversed + slice);
  }

  return {
    journalLines: [...bucketsDr.values(), ...bucketsCr.values()],
    stockMovements,
    lineUpdates,
    totalReversed,
    warnings,
  };
}

/**
 * Apply the stock movements + per-line updates produced by
 * planCogsReversal. Called by the credit-memo handler INSIDE the
 * same transaction as the JE post so a JE failure rolls the
 * restock back automatically.
 */
export async function applyStockReversals(
  client: PoolClient,
  companyId: number,
  movements: StockMovementInput[],
  createdBy: number,
  /** Stamped onto warehouse_movements.journalEntryId so the type='return'
   *  rows point at the credit-memo JE that booked the inventory
   *  restoration. Optional for callers that don't know the JE id at
   *  call-time — they can update later by reference. */
  journalEntryId?: number,
): Promise<void> {
  for (const mv of movements) {
    // 1. Restore the lot quantity.
    await client.query(
      `UPDATE warehouse_stock_lots
          SET quantity = quantity + $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [mv.quantity, mv.lotId, companyId],
    );

    // 2. Bump the denormalised product stock counter back.
    await client.query(
      `UPDATE warehouse_products
          SET "currentStock" = "currentStock" + $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [Math.ceil(mv.quantity), mv.productId, companyId],
    );

    // 3. Write the audit row — type='return' so the warehouse
    //    history shows the OUT/IN pair cleanly.
    await client.query(
      `INSERT INTO warehouse_movements
         ("companyId","productId",type,quantity,"unitCost",reference,notes,
          "createdBy","branchId","lotId","glStatus","journalEntryId")
       VALUES ($1,$2,'return',$3,$4,$5,$6,$7,NULL,$8,'posted',$9)`,
      [
        companyId, mv.productId, mv.quantity, mv.unitCost,
        mv.reference, mv.notes, createdBy, mv.lotId,
        journalEntryId ?? null,
      ],
    );
  }
}

interface ReversalLotRow {
  id: number;
  warehouseId: number;
  status: string;
  qualityControlStatus: string;
  recallId: number | null;
  recalledAt: string | null;
}

async function loadLotsForReversal(
  client: PoolClient,
  companyId: number,
  productId: number,
  lotIds: number[],
): Promise<ReversalLotRow[]> {
  if (lotIds.length === 0) return [];
  // No status filter — even quarantined / expired lots get the
  // returned units back. The lot row stays around for traceability
  // even when its status was flipped after the original sale.
  // We DO pull status fields so the planner can emit a warning when
  // the operator is about to restock into a non-active lot.
  const res = await client.query<ReversalLotRow>(
    `SELECT id, "warehouseId",
            status,
            "qualityControlStatus",
            "recallId",
            "recalledAt"::text AS "recalledAt"
       FROM warehouse_stock_lots
      WHERE "companyId" = $1
        AND "productId" = $2
        AND id = ANY($3::int[])
        AND "deletedAt" IS NULL`,
    [companyId, productId, lotIds],
  );
  return res.rows;
}

// ─── DB I/O ─────────────────────────────────────────────────────────────────

async function loadProducts(
  client: PoolClient, companyId: number, ids: number[],
): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  const res = await client.query<{
    id: number;
    costingMethod: string | null;
    tracksLots: boolean | null;
    lastWaCost: string | number | null;
  }>(
    `SELECT id,
            COALESCE("costingMethod",'weighted_average') AS "costingMethod",
            COALESCE("tracksLots", false)                AS "tracksLots",
            COALESCE("lastWaCost", 0)                    AS "lastWaCost"
       FROM warehouse_products
      WHERE "companyId" = $1
        AND id = ANY($2::int[])
        AND "deletedAt" IS NULL`,
    [companyId, ids],
  );
  return res.rows.map((r) => ({
    id: r.id,
    costingMethod: normaliseMethod(r.costingMethod),
    tracksLots: r.tracksLots === true,
    lastWaCost: Number(r.lastWaCost ?? 0),
  }));
}

async function loadLots(
  client: PoolClient,
  companyId: number,
  productId: number,
  warehouseId: number | null,
): Promise<LotRow[]> {
  const params: unknown[] = [companyId, productId];
  let warehouseClause = "";
  if (warehouseId != null) {
    params.push(warehouseId);
    warehouseClause = ` AND "warehouseId" = $${params.length}`;
  }
  const res = await client.query<{
    id: number; quantity: string | number; unitCost: string | number;
    receivedDate: string; warehouseId: number;
  }>(
    `SELECT id, quantity::float8 AS quantity, "unitCost"::float8 AS "unitCost",
            "receivedDate"::text AS "receivedDate", "warehouseId"
       FROM warehouse_stock_lots
      WHERE "companyId" = $1
        AND "productId" = $2
        AND status = 'active'
        AND "qualityControlStatus" = 'approved'
        AND quantity > 0
        AND "deletedAt" IS NULL
        ${warehouseClause}
      ORDER BY "receivedDate" ASC, id ASC`,
    params,
  );
  return res.rows.map((r) => ({
    id: r.id,
    quantity: Number(r.quantity),
    unitCost: Number(r.unitCost),
    receivedDate: r.receivedDate,
    warehouseId: r.warehouseId,
  }));
}

/**
 * Map the legacy DB strings to the picker's enum. `weighted_average`
 * was the old name; `average` is the canonical one in the new picker
 * factory, so we normalise on the way in. Anything unknown defaults
 * to weighted-average (the safest pick for a misconfigured tenant).
 */
function normaliseMethod(m: string | null): ValuationMethod {
  switch ((m ?? "").toLowerCase()) {
    case "fifo": return "fifo";
    case "lifo": return "lifo";
    case "average":
    case "weighted_average":
    case "wa":
      return "average";
    default:
      return "average";
  }
}
