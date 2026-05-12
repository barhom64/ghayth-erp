/**
 * First-In, First-Out picker.
 *
 * Picks from the OLDEST lots first, walking forward by receivedDate
 * (and id as tiebreaker for receipts on the same day). Returns a
 * plan; doesn't mutate.
 *
 * Pure: no DB, no time. The caller is responsible for ordering the
 * input — but this picker also sorts defensively so a caller that
 * passes lots in random order still gets correct FIFO behaviour.
 */
import type { PickPlan, PickableLot } from "../types.js";

export interface PickOpts {
  /** Quantity the caller wants to issue. */
  quantity: number;
  /** Available lots — caller pulled them from DB already. */
  lots: PickableLot[];
}

export function pickFifo({ quantity, lots }: PickOpts): PickPlan {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("FIFO pick: quantity must be a positive finite number");
  }

  // Defensive sort: oldest first, ties broken by id so the same
  // input always produces the same output (stable for retries).
  const ordered = [...lots].sort((a, b) => {
    if (a.receivedDate < b.receivedDate) return -1;
    if (a.receivedDate > b.receivedDate) return 1;
    return a.id - b.id;
  });

  return walkAllocations(ordered, quantity);
}

/**
 * Shared with the LIFO picker — they only differ in input ordering.
 * Splitting this out keeps both files focused on their sort rule.
 */
export function walkAllocations(orderedLots: PickableLot[], quantity: number): PickPlan {
  let remaining = quantity;
  let totalCost = 0;
  const allocations: PickPlan["allocations"] = [];

  for (const lot of orderedLots) {
    if (remaining <= 0) break;
    if (lot.quantity <= 0) continue;

    const take = Math.min(lot.quantity, remaining);
    const extendedCost = round4dp(take * lot.unitCost);
    allocations.push({
      lotId: lot.id,
      quantity: take,
      unitCost: lot.unitCost,
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

function round4dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 10000 + Number.EPSILON) / 10000;
}
