/**
 * #1733 Transport pricing engine (Issue Comment 3).
 *
 * Single entry point: `resolveTransportPrice(input)` — looks up the
 * most-specific matching `transport_price_rules` row for a service
 * line and returns the unit price plus the matched rule id so the
 * accountant's `transport_invoice_links` row can record provenance.
 *
 * Specificity ranking (more non-NULL match keys win):
 *
 *   8: customer + serviceType + vehicleType + routeFrom + routeTo + cargoType
 *   …
 *   1: serviceType only (the "global default" rule)
 *
 * Within the same specificity tier, `priority DESC` then `createdAt DESC`
 * breaks ties. Returns null when no rule matches — the accountant must
 * key in a unit price by hand on those lines (and that lands a price
 * rule for next time, per the operator's discretion).
 */

import { rawQuery } from "../rawdb.js";

export interface PricingInput {
  companyId: number;
  customerId?: number | null;
  transportServiceType: string;
  vehicleType?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  cargoType?: string | null;
  /** Service date — the price rule must be valid on this date. */
  serviceDate: string; // YYYY-MM-DD
}

export interface PricingResult {
  ruleId: number;
  unitPrice: number;
  minimumCharge: number | null;
  currency: string;
  vatRate: number | null;
  unitOfMeasure: string;
}

interface PriceRuleRow {
  id: number;
  customerId: number | null;
  vehicleType: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  cargoType: string | null;
  unitOfMeasure: string;
  unitPrice: string;
  minimumCharge: string | null;
  currency: string;
  vatRate: string | null;
  priority: number;
}

/** Returns the number of match keys that are non-NULL on the rule
 *  AND match the request's value. Higher = more specific. */
function specificity(rule: PriceRuleRow, input: PricingInput): number {
  let s = 1; // serviceType always matches (filtered by query)
  if (rule.customerId != null && rule.customerId === input.customerId) s += 4; // customer is the strongest dimension
  if (rule.vehicleType != null && rule.vehicleType === input.vehicleType) s += 2;
  if (rule.routeFrom != null && rule.routeFrom === input.routeFrom) s += 1;
  if (rule.routeTo != null && rule.routeTo === input.routeTo) s += 1;
  if (rule.cargoType != null && rule.cargoType === input.cargoType) s += 1;
  return s;
}

/** True if the rule's non-NULL match keys ALL agree with the input. */
function matches(rule: PriceRuleRow, input: PricingInput): boolean {
  if (rule.customerId != null && rule.customerId !== input.customerId) return false;
  if (rule.vehicleType != null && rule.vehicleType !== input.vehicleType) return false;
  if (rule.routeFrom != null && rule.routeFrom !== input.routeFrom) return false;
  if (rule.routeTo != null && rule.routeTo !== input.routeTo) return false;
  if (rule.cargoType != null && rule.cargoType !== input.cargoType) return false;
  return true;
}

export async function resolveTransportPrice(
  input: PricingInput,
): Promise<PricingResult | null> {
  const rows = await rawQuery<PriceRuleRow>(
    `SELECT id, "customerId", "vehicleType", "routeFrom", "routeTo", "cargoType",
            "unitOfMeasure", "unitPrice", "minimumCharge", currency, "vatRate", priority
       FROM transport_price_rules
      WHERE "companyId" = $1
        AND "transportServiceType" = $2
        AND ("customerId" IS NULL OR "customerId" = $3)
        AND "isActive" = TRUE
        AND "deletedAt" IS NULL
        AND $4::date >= "validFrom"
        AND ($4::date <= "validTo" OR "validTo" IS NULL)
      ORDER BY priority DESC, "createdAt" DESC`,
    [input.companyId, input.transportServiceType, input.customerId ?? null, input.serviceDate],
  );

  const candidates = rows.filter((r) => matches(r, input));
  if (candidates.length === 0) return null;

  // Most specific wins; priority + createdAt already ordered from the SQL.
  candidates.sort((a, b) => specificity(b, input) - specificity(a, input));
  const winner = candidates[0]!;
  return {
    ruleId: winner.id,
    unitPrice: Number(winner.unitPrice),
    minimumCharge: winner.minimumCharge != null ? Number(winner.minimumCharge) : null,
    currency: winner.currency,
    vatRate: winner.vatRate != null ? Number(winner.vatRate) : null,
    unitOfMeasure: winner.unitOfMeasure,
  };
}
