/**
 * Running (perpetual) weighted-average cost — single source of truth.
 *
 * Stock movements keep ONE blended unit cost per product on
 * `warehouse_products.costPrice` (mirrored to `lastWaCost`). On every
 * incoming movement the stored cost is re-blended with the receipt:
 *
 *   newCost = (prevQty × prevCost + inQty × inCost) / (prevQty + inQty)
 *
 * This is the PERPETUAL variant — it blends the previously stored
 * average with a single new receipt. It is deliberately distinct from
 * `computeWeightedAverage(lots)` in ./average.ts, which re-derives the
 * average from the full set of on-hand lots for the FIFO/LIFO/Average
 * pick planner. The two solve different problems and must not be merged.
 *
 * Both the `POST /movements` route and the `updateWeightedAverageCost`
 * maintenance helper in routes/warehouse.ts call this function, so the
 * formula can never drift between the two write paths.
 *
 * Pure: no DB, no time. Result is rounded to 4 dp via roundTo4.
 *
 * Edge cases (preserve the historical route behaviour exactly):
 *  - Negative previous stock is clamped to 0 (overdraw guard).
 *  - Incoming quantity is taken as an absolute value.
 *  - When the resulting total quantity is <= 0 the average is
 *    undefined, so the incoming unit cost is returned unchanged.
 */
import { roundTo4 } from "../../businessHelpers.js";

export function runningWeightedAverageCost(
  prevQty: number,
  prevCost: number,
  incomingQty: number,
  incomingCost: number,
): number {
  const pq = Math.max(0, Number(prevQty) || 0);
  const pc = Number(prevCost) || 0;
  const iq = Math.abs(Number(incomingQty) || 0);
  const ic = Number(incomingCost) || 0;

  const totalQty = pq + iq;
  if (totalQty <= 0) return ic;

  return roundTo4((pq * pc + iq * ic) / totalQty);
}
