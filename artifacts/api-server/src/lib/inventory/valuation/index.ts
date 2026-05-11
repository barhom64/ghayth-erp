/**
 * Valuation picker factory.
 *
 * The route handler picks the right strategy by reading
 * `product_valuation_settings.method` (or the company default when
 * absent) and calls the matching picker with the lots it pulled
 * from `warehouse_stock_lots`.
 */
import { pickFifo } from "./fifo.js";
import { pickLifo } from "./lifo.js";
import { pickAverage, computeWeightedAverage } from "./average.js";
import type { PickPlan, PickableLot, ValuationMethod } from "../types.js";

export { pickFifo, pickLifo, pickAverage, computeWeightedAverage };

export interface PickOpts {
  method: ValuationMethod;
  quantity: number;
  lots: PickableLot[];
}

/**
 * Single entry point. Throws on an unknown method so a typo in
 * `product_valuation_settings.method` surfaces as a clear error
 * instead of silently using FIFO.
 */
export function pickWithMethod({ method, quantity, lots }: PickOpts): PickPlan {
  switch (method) {
    case "fifo":
      return pickFifo({ quantity, lots });
    case "lifo":
      return pickLifo({ quantity, lots });
    case "average":
      return pickAverage({ quantity, lots });
    default:
      throw new Error(`Unknown valuation method: ${method as string}`);
  }
}
