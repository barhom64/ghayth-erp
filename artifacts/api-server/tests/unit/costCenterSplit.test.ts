import { describe, it, expect } from "vitest";
import { resolveCostCenterSplits } from "../../src/lib/costCenterSplit.js";

// #1715 — proration math for multi cost-center expense distribution. The
// invariant that matters for the GL: the legs must sum EXACTLY to the total,
// otherwise the journal entry is unbalanced.
describe("resolveCostCenterSplits", () => {
  it("splits by percentage and sums exactly to the total", () => {
    const legs = resolveCostCenterSplits(
      [
        { costCenterId: 1, percentage: 60 },
        { costCenterId: 2, percentage: 40 },
      ],
      1000
    );
    expect(legs).toEqual([
      { costCenterId: 1, amount: 600 },
      { costCenterId: 2, amount: 400 },
    ]);
    expect(legs.reduce((s, l) => s + l.amount, 0)).toBe(1000);
  });

  it("absorbs the rounding remainder into the last leg (33/33/34 of 100)", () => {
    const legs = resolveCostCenterSplits(
      [
        { costCenterId: 1, percentage: 33.33 },
        { costCenterId: 2, percentage: 33.33 },
        { costCenterId: 3, percentage: 33.34 },
      ],
      100
    );
    // legs must still total the base to the cent so the JE balances
    expect(legs.reduce((s, l) => s + l.amount, 0)).toBe(100);
  });

  it("splits by explicit amount", () => {
    const legs = resolveCostCenterSplits(
      [
        { costCenterId: 1, amount: 250 },
        { costCenterId: 2, amount: 750 },
      ],
      1000
    );
    expect(legs).toEqual([
      { costCenterId: 1, amount: 250 },
      { costCenterId: 2, amount: 750 },
    ]);
  });

  it("rejects percentages that do not total 100", () => {
    expect(() =>
      resolveCostCenterSplits(
        [
          { costCenterId: 1, percentage: 60 },
          { costCenterId: 2, percentage: 30 },
        ],
        1000
      )
    ).toThrow();
  });

  it("rejects amounts that do not total the base", () => {
    expect(() =>
      resolveCostCenterSplits(
        [
          { costCenterId: 1, amount: 250 },
          { costCenterId: 2, amount: 700 },
        ],
        1000
      )
    ).toThrow();
  });

  it("rejects mixing percentage and amount modes", () => {
    expect(() =>
      resolveCostCenterSplits(
        [
          { costCenterId: 1, percentage: 50 },
          { costCenterId: 2, amount: 500 },
        ],
        1000
      )
    ).toThrow();
  });
});
