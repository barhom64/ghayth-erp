import { describe, it, expect } from "vitest";
import {
  evalCondition,
  applyAction,
  type PricingContext,
  type ConditionRow,
  type ActionRow,
} from "../../src/lib/engines/pricingEngine.js";

// Pure-logic coverage for the revived pricing engine (migration 171). The DB
// walk (resolvePrice / recordApplication) hits pricing_* tables and belongs in
// the integration suite; here we exercise the two deterministic primitives the
// engine is built from: condition evaluation and action application.

const baseCtx = (over: Partial<PricingContext> = {}): PricingContext => ({
  companyId: 1,
  clientId: 42,
  clientSegment: "vip",
  productId: 7,
  productCategory: "electronics",
  quantity: 10,
  basePrice: 100,
  date: "2026-06-21",
  ...over,
});

const cond = (
  field: ConditionRow["field"],
  operator: ConditionRow["operator"],
  value: string,
): ConditionRow => ({ ruleId: 1, field, operator, value });

describe("evalCondition — scalar operators", () => {
  it("eq matches on equal value (JSON-encoded number)", () => {
    expect(evalCondition(cond("productId", "eq", "7"), baseCtx())).toBe(true);
    expect(evalCondition(cond("productId", "eq", "8"), baseCtx())).toBe(false);
  });

  it("eq matches string segments (JSON-encoded string)", () => {
    expect(evalCondition(cond("clientSegment", "eq", '"vip"'), baseCtx())).toBe(true);
    expect(evalCondition(cond("clientSegment", "eq", '"gold"'), baseCtx())).toBe(false);
  });

  it("neq is the inverse of eq", () => {
    expect(evalCondition(cond("clientSegment", "neq", '"gold"'), baseCtx())).toBe(true);
    expect(evalCondition(cond("clientSegment", "neq", '"vip"'), baseCtx())).toBe(false);
  });

  it("gt / gte / lt / lte compare numerically on quantity", () => {
    expect(evalCondition(cond("quantity", "gt", "5"), baseCtx())).toBe(true);
    expect(evalCondition(cond("quantity", "gt", "10"), baseCtx())).toBe(false);
    expect(evalCondition(cond("quantity", "gte", "10"), baseCtx())).toBe(true);
    expect(evalCondition(cond("quantity", "lt", "20"), baseCtx())).toBe(true);
    expect(evalCondition(cond("quantity", "lte", "10"), baseCtx())).toBe(true);
    expect(evalCondition(cond("quantity", "lte", "9"), baseCtx())).toBe(false);
  });
});

describe("evalCondition — set / range operators", () => {
  it("in matches when field is a member of the JSON array", () => {
    expect(evalCondition(cond("clientSegment", "in", '["vip","gold"]'), baseCtx())).toBe(true);
    expect(evalCondition(cond("clientSegment", "in", '["silver","bronze"]'), baseCtx())).toBe(false);
  });

  it("in returns false when the value isn't an array", () => {
    expect(evalCondition(cond("clientSegment", "in", '"vip"'), baseCtx())).toBe(false);
  });

  it("between is inclusive on both bounds", () => {
    expect(evalCondition(cond("quantity", "between", "[5,10]"), baseCtx())).toBe(true);
    expect(evalCondition(cond("quantity", "between", "[10,20]"), baseCtx())).toBe(true);
    expect(evalCondition(cond("quantity", "between", "[1,9]"), baseCtx())).toBe(false);
  });

  it("between returns false for malformed ranges", () => {
    expect(evalCondition(cond("quantity", "between", "[5]"), baseCtx())).toBe(false);
    expect(evalCondition(cond("quantity", "between", "5"), baseCtx())).toBe(false);
  });
});

const act = (
  actionType: ActionRow["actionType"],
  value: string,
  formula: string | null = null,
): ActionRow => ({ ruleId: 1, actionType, value, formula });

describe("applyAction — discount semantics", () => {
  it("fixed_price replaces the base price", () => {
    const out = applyAction(act("fixed_price", "70"), baseCtx({ basePrice: 100 }));
    expect(out.price).toBe(70);
    expect(out.discount).toBe(30);
  });

  it("percent_discount removes the given percentage", () => {
    const out = applyAction(act("percent_discount", "15"), baseCtx({ basePrice: 200 }));
    expect(out.price).toBe(170);
    expect(out.discount).toBe(30);
  });

  it("amount_discount subtracts a flat amount", () => {
    const out = applyAction(act("amount_discount", "25"), baseCtx({ basePrice: 100 }));
    expect(out.price).toBe(75);
    expect(out.discount).toBe(25);
  });

  it("never produces a negative price or negative discount", () => {
    const out = applyAction(act("amount_discount", "500"), baseCtx({ basePrice: 100 }));
    expect(out.price).toBe(0);
    expect(out.discount).toBe(100);
  });

  it("a fixed price ABOVE base yields a zero (clamped) discount", () => {
    const out = applyAction(act("fixed_price", "150"), baseCtx({ basePrice: 100 }));
    expect(out.price).toBe(150);
    expect(out.discount).toBe(0);
  });
});

describe("applyAction — formula evaluator", () => {
  it("evaluates a safe arithmetic formula over basePrice/quantity", () => {
    // The evaluator's whitelist is arithmetic-only (+ - * / ( ) . ,) plus
    // Math.*; no comparison/ternary operators. A per-unit volume discount is
    // expressed arithmetically: 85% of base.
    const out = applyAction(
      act("formula", "0", "basePrice * 0.85"),
      baseCtx({ basePrice: 100, quantity: 10 }),
    );
    expect(out.price).toBe(85);
    expect(out.discount).toBe(15);
  });

  it("supports Math.min / Math.max and the quantity variable", () => {
    const out = applyAction(
      act("formula", "0", "Math.max(basePrice - quantity, 50)"),
      baseCtx({ basePrice: 100, quantity: 40 }),
    );
    expect(out.price).toBe(60);
  });

  it("rejects comparison/ternary operators (not in the safe subset) → base", () => {
    // `>`, `=`, `?`, `:` are deliberately outside the evaluator's character
    // whitelist, so a ternary formula is treated as unsafe and ignored.
    const out = applyAction(
      act("formula", "0", "basePrice * (quantity >= 10 ? 0.85 : 1)"),
      baseCtx({ basePrice: 100, quantity: 10 }),
    );
    expect(out.price).toBe(100);
    expect(out.discount).toBe(0);
  });

  it("falls back to base price on a disallowed/unsafe expression", () => {
    const out = applyAction(
      act("formula", "0", "process.exit(1)"),
      baseCtx({ basePrice: 100 }),
    );
    expect(out.price).toBe(100);
    expect(out.discount).toBe(0);
  });

  it("falls back to base price on an empty formula", () => {
    const out = applyAction(act("formula", "0", ""), baseCtx({ basePrice: 100 }));
    expect(out.price).toBe(100);
  });
});
