/**
 * Shared types for the advanced-inventory module.
 * See docs/INVENTORY_ADVANCED_DESIGN.md for the full plan.
 */

export type ValuationMethod = "fifo" | "lifo" | "average";

export type LotStatus = "active" | "quarantine" | "recalled" | "expired" | "disposed";
export type QualityControlStatus = "pending" | "approved" | "rejected";

export type SerialStatus =
  | "in_stock"
  | "reserved"
  | "sold"
  | "returned"
  | "warranty_repair"
  | "scrapped";

export type CycleCountStatus =
  | "pending"
  | "in_progress"
  | "reviewed"
  | "approved"
  | "rejected";

export interface Lot {
  id: number;
  companyId: number;
  productId: number;
  warehouseId: number;
  lotNumber: string;
  quantity: number;
  originalQuantity: number;
  unitCost: number;
  currency: string;
  receivedDate: string;
  expiryDate: string | null;
  manufactureDate: string | null;
  supplierId: number | null;
  supplierLotRef: string | null;
  status: LotStatus;
  qualityControlStatus: QualityControlStatus;
  recallId: number | null;
  recalledAt: string | null;
}

/**
 * Result of running a valuation pick (FIFO/LIFO/Average) for a
 * requested issue quantity. The pure pickers don't mutate the lot
 * rows — they return a plan that the DB layer applies inside a
 * transaction.
 */
export interface PickPlan {
  /** Per-lot allocations consumed by this pick. */
  allocations: Array<{
    lotId: number;
    quantity: number;
    unitCost: number;
    /** Total cost contribution from this allocation. */
    extendedCost: number;
  }>;
  /** Sum of allocations.quantity — equals the requested qty when
   *  there's enough stock; otherwise less, with `shortfall > 0`. */
  totalQuantity: number;
  /** Sum of allocations.extendedCost. */
  totalCost: number;
  /** Quantity the picker COULDN'T fulfil (insufficient stock). */
  shortfall: number;
}

/**
 * Inputs the pickers operate over. A small subset of the full Lot
 * shape — keeps the pure functions independent of the DB layer.
 */
export interface PickableLot {
  id: number;
  quantity: number;
  unitCost: number;
  receivedDate: string;
}
