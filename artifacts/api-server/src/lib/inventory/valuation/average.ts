/**
 * Weighted-Average valuation picker.
 *
 * Computes a single blended unit cost across all on-hand lots:
 *
 *   avgCost = Σ (lot.qty × lot.unitCost) / Σ lot.qty
 *
 * Then issues at that flat rate, decrementing oldest lots first
 * (so individual lot quantities stay accurate for traceability —
 * only the COST attribution is averaged). The plan returns the
 * blended cost as `unitCost` on every allocation; the lot-level
 * extendedCost reflects that flat rate, not the lot's original
 * cost.
 *
 * This is the cleanest method when manufacturing buys identical
 * fungible items at slightly different prices (oil, sugar, screws)
 * and the operator doesn't want to track which physical unit
 * came from which receipt.
 *
 * Pure: no DB, no time.
 */
import type { PickPlan, PickableLot } from "../types.js";

export interface PickOpts {
  quantity: number;
  lots: PickableLot[];
}

export function pickAverage({ quantity, lots }: PickOpts): PickPlan {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Average pick: quantity must be a positive finite number");
  }

  const avgCost = computeWeightedAverage(lots);

  // Walk lots oldest-first so the per-lot quantity decrements remain
  // FIFO-shaped (auditors expect physical flow ≠ cost flow under
  // weighted-average — and oldest-first is the most defensible
  // physical assumption).
  const ordered = [...lots].sort((a, b) => {
    if (a.receivedDate < b.receivedDate) return -1;
    if (a.receivedDate > b.receivedDate) return 1;
    return a.id - b.id;
  });

  let remaining = quantity;
  let totalCost = 0;
  const allocations: PickPlan["allocations"] = [];

  for (const lot of ordered) {
    if (remaining <= 0) break;
    if (lot.quantity <= 0) continue;

    const take = Math.min(lot.quantity, remaining);
    const extendedCost = round4dp(take * avgCost);
    allocations.push({
      lotId: lot.id,
      quantity: take,
      unitCost: avgCost,
      extendedCost,
    });
    totalCost += extendedCost;
    remaining -= take;
  }

  return {
    allocations,
    totalQuantity: quantity - remaining,
    totalCost: round4dp(totalCost),
    shortfall: round4dp(remaining),
  };
}

/**
 * Compute the weighted-average unit cost. Returns 0 when total
 * on-hand is zero (no lots = no cost basis).
 *
 * Exported separately so the route handler can write it back to
 * `product_valuation_settings.avgUnitCost` after each receipt for
 * O(1) reads on subsequent picks.
 */
export function computeWeightedAverage(lots: PickableLot[]): number {
  let totalQty = 0;
  let totalCost = 0;
  for (const lot of lots) {
    if (lot.quantity <= 0) continue;
    totalQty += lot.quantity;
    totalCost += lot.quantity * lot.unitCost;
  }
  if (totalQty <= 0) return 0;
  return round4dp(totalCost / totalQty);
}

function round4dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 10000 + Number.EPSILON) / 10000;
}
