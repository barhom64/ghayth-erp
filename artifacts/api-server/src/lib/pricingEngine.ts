import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import { todayISO } from "./businessHelpers.js";

export type ConditionField =
  | "clientId"
  | "clientSegment"
  | "productId"
  | "productCategory"
  | "quantity"
  | "date";

export type ConditionOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "between";

export type ActionType = "fixed_price" | "percent_discount" | "amount_discount" | "formula";

export interface PricingContext {
  companyId: number;
  clientId?: number | null;
  clientSegment?: string | null;
  productId?: number | null;
  productCategory?: string | null;
  quantity?: number | null;
  basePrice: number;
  date?: string;
}

export interface ResolvedPrice {
  price: number;
  basePrice: number;
  discountAmount: number;
  ruleId: number | null;
  ruleName: string | null;
  appliedAction: ActionType | null;
  evaluatedRules: number;
}

interface RuleRow {
  id: number;
  name: string;
  priority: number;
  logicOp: "AND" | "OR";
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
}

interface ConditionRow {
  ruleId: number;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

interface ActionRow {
  ruleId: number;
  actionType: ActionType;
  value: string;
  formula: string | null;
}

function parseValue(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

function evalCondition(c: ConditionRow, ctx: PricingContext): boolean {
  const fieldVal: unknown = (() => {
    switch (c.field) {
      case "clientId": return ctx.clientId ?? null;
      case "clientSegment": return ctx.clientSegment ?? null;
      case "productId": return ctx.productId ?? null;
      case "productCategory": return ctx.productCategory ?? null;
      case "quantity": return ctx.quantity ?? null;
      case "date": return ctx.date ?? todayISO();
      default: return null;
    }
  })();

  const expected = parseValue(c.value);

  switch (c.operator) {
    case "eq": return fieldVal == expected;
    case "neq": return fieldVal != expected;
    case "gt": return Number(fieldVal) > Number(expected);
    case "gte": return Number(fieldVal) >= Number(expected);
    case "lt": return Number(fieldVal) < Number(expected);
    case "lte": return Number(fieldVal) <= Number(expected);
    case "in":
      return Array.isArray(expected) && expected.some((v) => v == fieldVal);
    case "between":
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      return Number(fieldVal) >= Number(expected[0]) && Number(fieldVal) <= Number(expected[1]);
    default: return false;
  }
}

function applyAction(action: ActionRow, ctx: PricingContext): { price: number; discount: number } {
  const base = ctx.basePrice;
  const qty = Number(ctx.quantity ?? 1);
  const value = Number(action.value);
  let price = base;

  switch (action.actionType) {
    case "fixed_price":
      price = value;
      break;
    case "percent_discount":
      price = base * (1 - value / 100);
      break;
    case "amount_discount":
      price = base - value;
      break;
    case "formula": {
      // Tiny safe formula evaluator: only basePrice / quantity / value /
      // arithmetic + parentheses + Math.min/max are supported.
      const expr = (action.formula ?? "").trim();
      if (!expr || !/^[\sA-Za-z0-9_+\-*/().,]+$/.test(expr)) {
        price = base;
      } else {
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function("basePrice", "quantity", "value", "Math",
            `"use strict"; return (${expr});`);
          const out = Number(fn(base, qty, value, Math));
          price = Number.isFinite(out) ? out : base;
        } catch {
          price = base;
        }
      }
      break;
    }
  }

  if (price < 0) price = 0;
  return { price, discount: Math.max(0, base - price) };
}

/**
 * Resolve a unit price by walking active rules ordered by priority DESC,
 * createdAt ASC. Returns the original base price when no rule matches.
 */
export async function resolvePrice(ctx: PricingContext): Promise<ResolvedPrice> {
  const today = ctx.date ?? todayISO();

  const rules = await rawQuery<RuleRow>(
    `SELECT id, name, priority, "logicOp", "validFrom", "validTo", "createdAt"
       FROM pricing_rules
      WHERE "companyId" = $1
        AND status = 'active'
        AND "deletedAt" IS NULL
        AND ("validFrom" IS NULL OR "validFrom" <= $2::date)
        AND ("validTo"   IS NULL OR "validTo"   >= $2::date)
      ORDER BY priority DESC, "createdAt" ASC`,
    [ctx.companyId, today]
  );

  if (!rules.length) {
    return {
      price: ctx.basePrice, basePrice: ctx.basePrice, discountAmount: 0,
      ruleId: null, ruleName: null, appliedAction: null, evaluatedRules: 0,
    };
  }

  const ids = rules.map((r) => r.id);
  const conds = await rawQuery<ConditionRow>(
    `SELECT "ruleId", field, operator, value FROM pricing_conditions WHERE "ruleId" = ANY($1)`,
    [ids]
  );
  const acts = await rawQuery<ActionRow>(
    `SELECT "ruleId", "actionType", value, formula FROM pricing_actions WHERE "ruleId" = ANY($1)`,
    [ids]
  );

  const condByRule = new Map<number, ConditionRow[]>();
  for (const c of conds) {
    const arr = condByRule.get(c.ruleId) ?? [];
    arr.push(c);
    condByRule.set(c.ruleId, arr);
  }
  const actByRule = new Map<number, ActionRow>();
  for (const a of acts) actByRule.set(a.ruleId, a);

  for (const rule of rules) {
    const list = condByRule.get(rule.id) ?? [];
    const action = actByRule.get(rule.id);
    if (!action) continue;
    const matched = list.length === 0
      ? true
      : (rule.logicOp === "OR"
          ? list.some((c) => evalCondition(c, ctx))
          : list.every((c) => evalCondition(c, ctx)));
    if (!matched) continue;

    const { price, discount } = applyAction(action, ctx);
    return {
      price: Math.round(price * 100) / 100,
      basePrice: ctx.basePrice,
      discountAmount: Math.round(discount * 100) / 100,
      ruleId: rule.id,
      ruleName: rule.name,
      appliedAction: action.actionType,
      evaluatedRules: rules.length,
    };
  }

  return {
    price: ctx.basePrice, basePrice: ctx.basePrice, discountAmount: 0,
    ruleId: null, ruleName: null, appliedAction: null, evaluatedRules: rules.length,
  };
}

export async function recordApplication(params: {
  companyId: number;
  ruleId: number | null;
  ruleName: string | null;
  entityType: "invoice" | "quote" | "preview";
  entityId?: number | null;
  clientId?: number | null;
  productId?: number | null;
  productCategory?: string | null;
  quantity?: number | null;
  basePrice: number;
  resolvedPrice: number;
  discountAmount: number;
  overridden?: boolean;
  overridePrice?: number | null;
  overrideReason?: string | null;
  appliedBy?: number | null;
}): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO pricing_rule_applications
         ("companyId","ruleId","ruleName","entityType","entityId","clientId",
          "productId","productCategory",quantity,"basePrice","resolvedPrice",
          "discountAmount",overridden,"overridePrice","overrideReason","appliedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        params.companyId,
        params.ruleId,
        params.ruleName,
        params.entityType,
        params.entityId ?? null,
        params.clientId ?? null,
        params.productId ?? null,
        params.productCategory ?? null,
        params.quantity ?? null,
        params.basePrice,
        params.resolvedPrice,
        params.discountAmount,
        params.overridden ?? false,
        params.overridePrice ?? null,
        params.overrideReason ?? null,
        params.appliedBy ?? null,
      ]
    );
  } catch (err) {
    logger.error(err, "[pricingEngine] recordApplication failed");
  }
}
