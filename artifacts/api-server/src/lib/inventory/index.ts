/**
 * Public surface of the advanced-inventory module.
 *
 * Today this is types + the three pure valuation pickers. Lot
 * lifecycle DB helpers, serial allocation, cycle-count workflow,
 * and ABC analysis land in weeks 2-4 (see
 * docs/INVENTORY_ADVANCED_DESIGN.md).
 */

export * from "./types.js";
export {
  pickFifo,
  pickLifo,
  pickAverage,
  computeWeightedAverage,
  pickWithMethod,
} from "./valuation/index.js";
