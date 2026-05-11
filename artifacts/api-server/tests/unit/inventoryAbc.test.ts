import { describe, it, expect } from "vitest";
import {
  classifyAbc,
  DEFAULT_ABC_THRESHOLDS,
  type AbcInput,
} from "../../src/lib/inventory/abc-analysis.js";

/**
 * Build an input set whose total value is exactly the parameter
 * `total` so the assertion math works at precise cumulative
 * boundaries (0.80, 0.95, 1.0).
 */
function buildInputs(...values: number[]): AbcInput[] {
  return values.map((v, i) => ({ productId: i + 1, periodValue: v }));
}

describe("classifyAbc — Pareto math", () => {
  it("classifies a heavy-skew distribution as A→B→C correctly", () => {
    // 1 product = 80% of value, 1 product = 15%, 1 product = 5%
    const inputs = buildInputs(80, 15, 5);
    const out = classifyAbc(inputs);
    expect(out.map((r) => r.category)).toEqual(["A", "B", "C"]);
    expect(out[0]).toMatchObject({ productId: 1, paretoShare: 0.8 });
    expect(out[1]).toMatchObject({ productId: 2, paretoShare: 0.15 });
    expect(out[2]).toMatchObject({ productId: 3, paretoShare: 0.05 });
  });

  it("sorts highest-value first regardless of input order", () => {
    const inputs: AbcInput[] = [
      { productId: 3, periodValue: 5 },
      { productId: 1, periodValue: 80 },
      { productId: 2, periodValue: 15 },
    ];
    const out = classifyAbc(inputs);
    expect(out.map((r) => r.productId)).toEqual([1, 2, 3]);
  });

  it("breaks ties by ascending productId so the same input is deterministic", () => {
    const inputs = buildInputs(40, 40, 20);
    const out = classifyAbc(inputs);
    // Two products with periodValue=40: lower productId comes first
    expect(out[0].productId).toBe(1);
    expect(out[1].productId).toBe(2);
    expect(out[2].productId).toBe(3);
  });

  it("computes cumulative share as a running total up to and INCLUDING each row", () => {
    const inputs = buildInputs(60, 25, 10, 5);
    const out = classifyAbc(inputs);
    expect(out[0].cumulativeShare).toBe(0.6);
    expect(out[1].cumulativeShare).toBe(0.85);
    expect(out[2].cumulativeShare).toBe(0.95);
    expect(out[3].cumulativeShare).toBe(1);
  });

  it("rounds paretoShare to 4dp", () => {
    const inputs = buildInputs(33.33, 33.33, 33.34);
    const out = classifyAbc(inputs);
    // share = 33.33 / 100 = 0.3333
    expect(out[0].paretoShare).toBe(0.3334); // sorted desc puts 33.34 first
    expect(out[1].paretoShare).toBe(0.3333);
    expect(out[2].paretoShare).toBe(0.3333);
  });

  it("classifies all rows as C when total value is zero", () => {
    const inputs = buildInputs(0, 0, 0);
    const out = classifyAbc(inputs);
    expect(out.every((r) => r.category === "C")).toBe(true);
    expect(out.every((r) => r.paretoShare === 0)).toBe(true);
  });

  it("returns an empty array on empty input", () => {
    expect(classifyAbc([])).toEqual([]);
  });

  it("respects custom thresholds (70/20/10)", () => {
    const inputs = buildInputs(70, 20, 10);
    const out = classifyAbc(inputs, { a: 0.7, b: 0.9 });
    expect(out.map((r) => r.category)).toEqual(["A", "B", "C"]);
  });

  it("rejects malformed thresholds (a >= b)", () => {
    const inputs = buildInputs(80, 15, 5);
    expect(() => classifyAbc(inputs, { a: 0.9, b: 0.8 })).toThrow(/thresholds/);
    expect(() => classifyAbc(inputs, { a: 0.5, b: 0.5 })).toThrow(/thresholds/);
    expect(() => classifyAbc(inputs, { a: 0, b: 0.95 })).toThrow(/thresholds/);
    expect(() => classifyAbc(inputs, { a: 0.8, b: 1 })).toThrow(/thresholds/);
  });

  it("rejects negative or non-finite period values", () => {
    expect(() => classifyAbc([{ productId: 1, periodValue: -1 }])).toThrow(/non-negative/);
    expect(() => classifyAbc([{ productId: 1, periodValue: Number.NaN }])).toThrow();
    expect(() => classifyAbc([{ productId: 1, periodValue: Number.POSITIVE_INFINITY }])).toThrow();
  });

  it("DEFAULT_ABC_THRESHOLDS exposes the spec'd 80/95 boundaries", () => {
    expect(DEFAULT_ABC_THRESHOLDS).toEqual({ a: 0.8, b: 0.95 });
  });
});

describe("classifyAbc — realistic 100-item distribution", () => {
  it("buckets ~20% of items into A, the rest split into B and C", () => {
    // Synthetic Pareto-ish distribution: 20 items × 4 = 80, 30 items × 0.5 = 15, 50 items × 0.1 = 5
    const inputs: AbcInput[] = [];
    for (let i = 0; i < 20; i++) inputs.push({ productId: i + 1, periodValue: 4 });
    for (let i = 0; i < 30; i++) inputs.push({ productId: 100 + i, periodValue: 0.5 });
    for (let i = 0; i < 50; i++) inputs.push({ productId: 200 + i, periodValue: 0.1 });

    const out = classifyAbc(inputs);

    const a = out.filter((r) => r.category === "A").length;
    const b = out.filter((r) => r.category === "B").length;
    const c = out.filter((r) => r.category === "C").length;

    expect(a).toBe(20);  // top 80% of value
    expect(b).toBe(30);  // next 15%
    expect(c).toBe(50);  // bottom 5%
  });
});
