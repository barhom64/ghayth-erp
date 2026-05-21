import { describe, it, expect } from "vitest";
import { runningWeightedAverageCost } from "../../src/lib/inventory/valuation/running-average.js";

/**
 * Regression lock for the running weighted-average cost formula.
 *
 * Before unification this math was inlined twice in routes/warehouse.ts
 * (the POST /movements route and the updateWeightedAverageCost helper).
 * These cases pin the single shared implementation so the two write
 * paths can never silently diverge.
 *
 *   newCost = (prevQty × prevCost + inQty × inCost) / (prevQty + inQty)
 */
describe("runningWeightedAverageCost", () => {
  it("blends a receipt into existing stock", () => {
    // (10×5 + 10×7) / 20 = 120/20 = 6
    expect(runningWeightedAverageCost(10, 5, 10, 7)).toBe(6);
  });

  it("returns the incoming cost when there is no prior stock", () => {
    // (0×0 + 5×8) / 5 = 8
    expect(runningWeightedAverageCost(0, 0, 5, 8)).toBe(8);
  });

  it("rounds the blended cost to 4 decimal places", () => {
    // (7×1 + 2×2) / 9 = 11/9 = 1.2222… → 1.2222
    expect(runningWeightedAverageCost(7, 1, 2, 2)).toBe(1.2222);
  });

  it("falls back to the incoming cost when total quantity is zero", () => {
    // Average is undefined with no quantity on either side.
    expect(runningWeightedAverageCost(0, 0, 0, 9)).toBe(9);
  });

  it("clamps negative previous stock to zero (overdraw guard)", () => {
    // prevQty −5 is clamped to 0 → (0 + 10×6) / 10 = 6
    expect(runningWeightedAverageCost(-5, 4, 10, 6)).toBe(6);
  });

  it("treats the incoming quantity as an absolute value", () => {
    // inQty −10 is taken as 10 → (10×5 + 10×7) / 20 = 6
    expect(runningWeightedAverageCost(10, 5, -10, 7)).toBe(6);
  });

  it("keeps the stored cost unchanged when a same-priced receipt arrives", () => {
    expect(runningWeightedAverageCost(100, 12.5, 50, 12.5)).toBe(12.5);
  });
});
