import { describe, it, expect } from "vitest";
import {
  computeVarianceLines,
  summariseVariance,
  nextCycleCountStatus,
  assertApprovalEligible,
  IllegalCycleCountTransitionError,
} from "../../src/lib/inventory/cycle-count.js";
import type { VarianceInput } from "../../src/lib/inventory/cycle-count.js";
import type { CycleCountStatus } from "../../src/lib/inventory/types.js";

describe("computeVarianceLines — pure variance math", () => {
  it("emits a row only for non-zero variance", () => {
    const inputs: VarianceInput[] = [
      { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 10, unitCost: 5 },
      { productId: 2, lotId: 100, systemQuantity: 10, countedQuantity: 8, unitCost: 5 },
      { productId: 3, lotId: null, systemQuantity: 10, countedQuantity: 12, unitCost: 5 },
    ];
    const out = computeVarianceLines(inputs);
    expect(out).toHaveLength(2);
    expect(out.map((l) => l.productId)).toEqual([2, 3]);
  });

  it("computes shrinkage as a negative variance + negative value", () => {
    const out = computeVarianceLines([
      { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 8, unitCost: 5 },
    ]);
    expect(out[0].variance).toBe(-2);
    expect(out[0].varianceValue).toBe(-10);
  });

  it("computes overage as a positive variance + positive value", () => {
    const out = computeVarianceLines([
      { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 13, unitCost: 7 },
    ]);
    expect(out[0].variance).toBe(3);
    expect(out[0].varianceValue).toBe(21);
  });

  it("rounds variance value to 2dp", () => {
    const out = computeVarianceLines([
      { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 8, unitCost: 3.333333 },
    ]);
    expect(out[0].varianceValue).toBe(-6.67); // |-2 × 3.333333| = 6.666... → 6.67
  });

  it("preserves lotId on the output line", () => {
    const out = computeVarianceLines([
      { productId: 1, lotId: 42, systemQuantity: 10, countedQuantity: 9, unitCost: 1 },
    ]);
    expect(out[0].lotId).toBe(42);
  });

  it("rejects non-finite quantities", () => {
    expect(() =>
      computeVarianceLines([
        { productId: 1, lotId: null, systemQuantity: Number.NaN, countedQuantity: 10, unitCost: 5 },
      ]),
    ).toThrow(/finite/);
    expect(() =>
      computeVarianceLines([
        { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: Number.POSITIVE_INFINITY, unitCost: 5 },
      ]),
    ).toThrow(/finite/);
  });

  it("rejects negative unit cost (signals data-entry error)", () => {
    expect(() =>
      computeVarianceLines([
        { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 9, unitCost: -1 },
      ]),
    ).toThrow(/non-negative/);
  });

  it("allows zero unit cost (free items still count physically)", () => {
    const out = computeVarianceLines([
      { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 9, unitCost: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].varianceValue).toBe(0);
  });
});

describe("summariseVariance — gain/loss aggregation", () => {
  it("splits positive vs negative variance into gain and loss buckets", () => {
    const lines = computeVarianceLines([
      { productId: 1, lotId: null, systemQuantity: 10, countedQuantity: 12, unitCost: 5 }, // +10 gain
      { productId: 2, lotId: null, systemQuantity: 20, countedQuantity: 18, unitCost: 5 }, // -10 loss
      { productId: 3, lotId: null, systemQuantity: 30, countedQuantity: 35, unitCost: 4 }, // +20 gain
    ]);
    const summary = summariseVariance(lines);
    expect(summary.totalGainValue).toBe(30);
    expect(summary.totalLossValue).toBe(10);
    expect(summary.netValue).toBe(20);
  });

  it("returns zero summary on empty input", () => {
    expect(summariseVariance([])).toEqual({
      totalGainValue: 0,
      totalLossValue: 0,
      netValue: 0,
    });
  });
});

describe("nextCycleCountStatus — workflow FSM", () => {
  it.each([
    ["pending", "in_progress"],
    ["pending", "rejected"],
    ["in_progress", "reviewed"],
    ["in_progress", "rejected"],
    ["reviewed", "approved"],
    ["reviewed", "rejected"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(() => nextCycleCountStatus(from as CycleCountStatus, to as CycleCountStatus)).not.toThrow();
  });

  it("treats no-op self-transitions as legal", () => {
    expect(() => nextCycleCountStatus("approved", "approved")).not.toThrow();
  });

  it.each([
    ["approved", "in_progress"],
    ["approved", "reviewed"],
    ["rejected", "in_progress"],
    ["pending", "approved"],
    ["pending", "reviewed"],
    ["in_progress", "approved"],
  ] as const)("rejects %s → %s", (from, to) => {
    expect(() => nextCycleCountStatus(from as CycleCountStatus, to as CycleCountStatus)).toThrow(
      IllegalCycleCountTransitionError,
    );
  });
});

describe("assertApprovalEligible — 4-eye control", () => {
  it("passes when approver is distinct from both counter and reviewer", () => {
    expect(() =>
      assertApprovalEligible({ countedBy: 1, reviewedBy: 2, approverId: 3 }),
    ).not.toThrow();
  });

  it("throws when approver is the counter", () => {
    expect(() =>
      assertApprovalEligible({ countedBy: 1, reviewedBy: 2, approverId: 1 }),
    ).toThrow(/counter/);
  });

  it("throws when approver is the reviewer", () => {
    expect(() =>
      assertApprovalEligible({ countedBy: 1, reviewedBy: 2, approverId: 2 }),
    ).toThrow(/reviewer/);
  });

  it("passes when counter or reviewer is null (operator left blank)", () => {
    expect(() =>
      assertApprovalEligible({ countedBy: null, reviewedBy: 2, approverId: 3 }),
    ).not.toThrow();
    expect(() =>
      assertApprovalEligible({ countedBy: 1, reviewedBy: null, approverId: 3 }),
    ).not.toThrow();
  });
});
