import { describe, it, expect } from "vitest";
import {
  pickFifo,
  pickLifo,
  pickAverage,
  computeWeightedAverage,
  pickWithMethod,
} from "../../src/lib/inventory/valuation/index.js";
import type { PickableLot } from "../../src/lib/inventory/types.js";

const LOTS: PickableLot[] = [
  { id: 1, quantity: 50, unitCost: 10, receivedDate: "2026-01-01" },   // oldest, cheapest
  { id: 2, quantity: 30, unitCost: 12, receivedDate: "2026-02-15" },
  { id: 3, quantity: 20, unitCost: 15, receivedDate: "2026-03-01" },   // newest, most expensive
];

describe("FIFO picker", () => {
  it("walks oldest lot first and stops when quantity satisfied", () => {
    const plan = pickFifo({ quantity: 40, lots: LOTS });
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0]).toMatchObject({ lotId: 1, quantity: 40, unitCost: 10 });
    expect(plan.totalQuantity).toBe(40);
    expect(plan.totalCost).toBe(400);
    expect(plan.shortfall).toBe(0);
  });

  it("crosses lot boundaries when needed", () => {
    const plan = pickFifo({ quantity: 70, lots: LOTS });
    expect(plan.allocations).toHaveLength(2);
    expect(plan.allocations[0]).toMatchObject({ lotId: 1, quantity: 50 });
    expect(plan.allocations[1]).toMatchObject({ lotId: 2, quantity: 20 });
    // 50×10 + 20×12 = 740
    expect(plan.totalCost).toBe(740);
  });

  it("reports shortfall when stock is insufficient", () => {
    const plan = pickFifo({ quantity: 200, lots: LOTS });
    expect(plan.totalQuantity).toBe(100);  // 50+30+20 = 100 on hand
    expect(plan.shortfall).toBe(100);
    expect(plan.allocations).toHaveLength(3);
  });

  it("sorts defensively even when input is shuffled", () => {
    const shuffled: PickableLot[] = [LOTS[2], LOTS[0], LOTS[1]];
    const plan = pickFifo({ quantity: 60, lots: shuffled });
    // Still picks lot 1 first (oldest), then lot 2.
    expect(plan.allocations[0].lotId).toBe(1);
    expect(plan.allocations[1].lotId).toBe(2);
  });

  it("breaks same-day ties by id (lower id first)", () => {
    const sameDay: PickableLot[] = [
      { id: 5, quantity: 10, unitCost: 8, receivedDate: "2026-01-01" },
      { id: 3, quantity: 10, unitCost: 7, receivedDate: "2026-01-01" },
    ];
    const plan = pickFifo({ quantity: 5, lots: sameDay });
    expect(plan.allocations[0].lotId).toBe(3);
  });

  it("rejects non-positive / non-finite quantities", () => {
    expect(() => pickFifo({ quantity: 0, lots: LOTS })).toThrow();
    expect(() => pickFifo({ quantity: -1, lots: LOTS })).toThrow();
    expect(() => pickFifo({ quantity: Number.NaN, lots: LOTS })).toThrow();
  });

  it("skips zero-quantity lots without disturbing the order", () => {
    const withEmpty: PickableLot[] = [
      { id: 9, quantity: 0, unitCost: 99, receivedDate: "2026-01-01" },
      ...LOTS,
    ];
    const plan = pickFifo({ quantity: 40, lots: withEmpty });
    expect(plan.allocations[0].lotId).toBe(1); // skipped lot 9 (0 qty)
  });
});

describe("LIFO picker", () => {
  it("walks newest lot first", () => {
    const plan = pickLifo({ quantity: 15, lots: LOTS });
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0]).toMatchObject({ lotId: 3, quantity: 15, unitCost: 15 });
  });

  it("crosses lot boundaries newest-to-oldest", () => {
    const plan = pickLifo({ quantity: 35, lots: LOTS });
    expect(plan.allocations).toHaveLength(2);
    expect(plan.allocations[0]).toMatchObject({ lotId: 3, quantity: 20 });
    expect(plan.allocations[1]).toMatchObject({ lotId: 2, quantity: 15 });
    // 20×15 + 15×12 = 480
    expect(plan.totalCost).toBe(480);
  });

  it("breaks same-day ties by id (higher id first)", () => {
    const sameDay: PickableLot[] = [
      { id: 3, quantity: 10, unitCost: 7, receivedDate: "2026-01-01" },
      { id: 5, quantity: 10, unitCost: 8, receivedDate: "2026-01-01" },
    ];
    const plan = pickLifo({ quantity: 5, lots: sameDay });
    expect(plan.allocations[0].lotId).toBe(5);
  });
});

describe("Weighted-Average picker", () => {
  it("computes blended unit cost across all lots", () => {
    // (50×10 + 30×12 + 20×15) / (50+30+20) = (500+360+300)/100 = 11.6
    expect(computeWeightedAverage(LOTS)).toBe(11.6);
  });

  it("returns 0 when total on-hand is zero", () => {
    const empty: PickableLot[] = [
      { id: 1, quantity: 0, unitCost: 99, receivedDate: "2026-01-01" },
    ];
    expect(computeWeightedAverage(empty)).toBe(0);
  });

  it("issues at the blended rate even when crossing lot boundaries", () => {
    const plan = pickAverage({ quantity: 70, lots: LOTS });
    // All allocations carry the SAME unitCost (the blended 11.6)
    for (const a of plan.allocations) {
      expect(a.unitCost).toBe(11.6);
    }
    // Total cost = 70 × 11.6 = 812
    expect(plan.totalCost).toBe(812);
  });

  it("decrements oldest-first physically (audit trail), even though cost is averaged", () => {
    const plan = pickAverage({ quantity: 60, lots: LOTS });
    expect(plan.allocations[0].lotId).toBe(1);  // oldest physically picked first
    expect(plan.allocations[0].quantity).toBe(50);
    expect(plan.allocations[1].lotId).toBe(2);
    expect(plan.allocations[1].quantity).toBe(10);
  });
});

describe("pickWithMethod factory", () => {
  it.each(["fifo", "lifo", "average"] as const)("dispatches to the %s picker", (method) => {
    const plan = pickWithMethod({ method, quantity: 10, lots: LOTS });
    expect(plan.totalQuantity).toBe(10);
  });

  it("throws on an unknown method (typo guard)", () => {
    expect(() =>
      pickWithMethod({ method: "fifoo" as any, quantity: 10, lots: LOTS }),
    ).toThrow(/Unknown valuation method/);
  });

  it("FIFO and LIFO produce different costs for the same pick on identical lots", () => {
    const fifo = pickWithMethod({ method: "fifo", quantity: 25, lots: LOTS });
    const lifo = pickWithMethod({ method: "lifo", quantity: 25, lots: LOTS });
    // FIFO uses cheapest (oldest, $10): 25 × 10 = 250
    // LIFO uses most-expensive (newest, $15): 20 × 15 + 5 × 12 = 360
    expect(fifo.totalCost).toBe(250);
    expect(lifo.totalCost).toBe(360);
    expect(fifo.totalCost).toBeLessThan(lifo.totalCost);
  });
});
