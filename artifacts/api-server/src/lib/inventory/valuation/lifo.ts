/**
 * Last-In, First-Out picker.
 *
 * Picks from the NEWEST lots first. Same shape as FIFO but with the
 * sort reversed; reuses the shared `walkAllocations` helper so the
 * allocation arithmetic stays in one place.
 *
 * Pure: no DB, no time.
 */
import type { PickPlan, PickableLot } from "../types.js";
import { walkAllocations } from "./fifo.js";

export interface PickOpts {
  quantity: number;
  lots: PickableLot[];
}

export function pickLifo({ quantity, lots }: PickOpts): PickPlan {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("LIFO pick: quantity must be a positive finite number");
  }

  const ordered = [...lots].sort((a, b) => {
    if (a.receivedDate > b.receivedDate) return -1;
    if (a.receivedDate < b.receivedDate) return 1;
    // Tiebreaker: higher id wins for same-day receipts (the row
    // most recently inserted is the "newest" for LIFO).
    return b.id - a.id;
  });

  return walkAllocations(ordered, quantity);
}
