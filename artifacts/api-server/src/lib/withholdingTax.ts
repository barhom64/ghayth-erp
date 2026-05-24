// ─────────────────────────────────────────────────────────────────────────────
// withholdingTax.ts
//
// Saudi Withholding Tax (WHT) computation + GL routing.
//
// Buyer withholds WHT from a non-resident supplier's payment per
// Income Tax Law Article 68 / ZATCA's Withholding Tax Guideline:
//
//   royalties / technical / consulting    15%
//   management / performance fees         20%
//   dividends / interest / rent of
//     movable / telecoms / air tickets
//     / freight / insurance premium         5%
//
// Resident suppliers (Saudi/GCC w/ permanent establishment) are NOT
// withheld. Treaty-rate (DTAA) suppliers can override the default
// rate per category on the supplier record.
//
// The computation is PURE — pass in the gross amount and the
// supplier + category, get back { net, wht, accountCode }. The
// caller posts the JE.
// ─────────────────────────────────────────────────────────────────────────────

import { rawQuery } from "./rawdb.js";
import { roundTo2 } from "./businessHelpers.js";

export type SupplierResidency =
  | "resident"
  | "non_resident_gcc"
  | "non_resident_treaty"
  | "non_resident_other";

export type WhtAppliesTo =
  | "royalties" | "technical_services" | "management_fees"
  | "dividends" | "interest" | "rent_movable"
  | "telecommunications" | "air_tickets" | "freight"
  | "insurance_premium" | "other";

export interface WhtCategoryRow {
  id: number;
  companyId: number;
  code: string;
  name: string;
  nameEn: string | null;
  rate: number;
  appliesTo: WhtAppliesTo;
  payableAccountId: number | null;
  isActive: boolean;
}

export interface WhtSupplierRow {
  id: number;
  companyId: number;
  residencyStatus: SupplierResidency | null;
  taxResidenceCountry: string | null;
  defaultWhtRate: number | null;
  whtCategoryDefault: string | null;
}

export interface WhtSplit {
  /** Net amount paid to the supplier after withholding. */
  net: number;
  /** Amount withheld to remit to ZATCA. */
  wht: number;
  /** Original gross amount (= net + wht). */
  gross: number;
  /** Effective rate used. */
  rate: number;
  /** Category that produced the rate (snapshot for audit). */
  category: string | null;
  /** WHT-payable account code resolved from category. NULL if no
   *  GL account is mapped — caller falls back to the company-level
   *  `wht_payable` mapping. */
  payableAccountCode: string | null;
  /** Whether withholding actually applies (false for resident
   *  suppliers or rate=0 categories). */
  applies: boolean;
}

const _categoryCache = new Map<string, WhtCategoryRow>();
const _supplierCache = new Map<string, WhtSupplierRow>();
const catKey = (c: number, code: string) => `${c}::${code}`;
const supKey = (c: number, id: number) => `${c}::${id}`;

export function clearWhtCache(companyId?: number): void {
  if (!companyId) {
    _categoryCache.clear();
    _supplierCache.clear();
    return;
  }
  for (const k of _categoryCache.keys()) {
    if (k.startsWith(`${companyId}::`)) _categoryCache.delete(k);
  }
  for (const k of _supplierCache.keys()) {
    if (k.startsWith(`${companyId}::`)) _supplierCache.delete(k);
  }
}

export async function getWhtCategory(companyId: number, code: string): Promise<WhtCategoryRow | null> {
  if (!code) return null;
  const k = catKey(companyId, code);
  const cached = _categoryCache.get(k);
  if (cached) return cached;
  const rows = await rawQuery<WhtCategoryRow>(
    `SELECT id, "companyId", code, name, "nameEn", rate::float8 AS rate,
            "appliesTo", "payableAccountId", "isActive"
       FROM wht_categories
      WHERE "companyId" = $1 AND code = $2
        AND "deletedAt" IS NULL AND "isActive" = true
      LIMIT 1`,
    [companyId, code]
  );
  const row = rows[0] ?? null;
  if (row) _categoryCache.set(k, row);
  return row;
}

export async function getSupplier(companyId: number, supplierId: number): Promise<WhtSupplierRow | null> {
  const k = supKey(companyId, supplierId);
  const cached = _supplierCache.get(k);
  if (cached) return cached;
  const rows = await rawQuery<WhtSupplierRow>(
    `SELECT id, "companyId", "residencyStatus", "taxResidenceCountry",
            "defaultWhtRate"::float8 AS "defaultWhtRate",
            "whtCategoryDefault"
       FROM suppliers
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
      LIMIT 1`,
    [supplierId, companyId]
  );
  const row = rows[0] ?? null;
  if (row) _supplierCache.set(k, row);
  return row;
}

/**
 * Compute the WHT split for a payment to a supplier.
 *
 *   computeWHT({ companyId, supplierId: 42, grossAmount: 100_000,
 *               category: 'WHT-TEC15' })
 *
 * → resident supplier → { applies: false, wht: 0, net: 100_000, ... }
 * → non-resident, technical-services → { applies: true, rate: 15,
 *     wht: 15_000, net: 85_000, payableAccountCode: '2330' }
 *
 * Resolution order:
 *   1. category override (caller-pinned)
 *   2. supplier.whtCategoryDefault
 *   3. supplier.defaultWhtRate (no category, just a rate)
 *   4. residencyStatus == 'resident' → no withholding
 *   5. fallback: 0% (caller decides whether to warn)
 *
 * Rate overrides:
 *   * If caller passes `rateOverride`, that wins (treaty rate).
 *   * Otherwise category.rate or supplier.defaultWhtRate is used.
 */
export async function computeWHT(input: {
  companyId: number;
  supplierId: number;
  grossAmount: number;
  category?: string;
  rateOverride?: number;
}): Promise<WhtSplit> {
  const gross = roundTo2(input.grossAmount);
  const supplier = await getSupplier(input.companyId, input.supplierId);
  if (!supplier) {
    throw new Error(`WHT supplier not found: ${input.supplierId}`);
  }

  // Resident suppliers are never withheld.
  if (supplier.residencyStatus === "resident" || supplier.residencyStatus == null) {
    return { net: gross, wht: 0, gross, rate: 0, category: null, payableAccountCode: null, applies: false };
  }

  // Resolve the category (caller > supplier default).
  const catCode = input.category ?? supplier.whtCategoryDefault ?? null;
  let category: WhtCategoryRow | null = null;
  if (catCode) {
    category = await getWhtCategory(input.companyId, catCode);
  }

  // Resolve the rate (override > category > supplier default > 0).
  let rate = 0;
  if (input.rateOverride != null) {
    rate = Number(input.rateOverride);
  } else if (category) {
    rate = category.rate;
  } else if (supplier.defaultWhtRate != null) {
    rate = Number(supplier.defaultWhtRate);
  }
  if (rate < 0 || rate > 100) {
    throw new Error(`Invalid WHT rate: ${rate}`);
  }

  // Resolve the payable account code (if any).
  let payableAccountCode: string | null = null;
  if (category?.payableAccountId) {
    const rows = await rawQuery<{ code: string }>(
      `SELECT code FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [category.payableAccountId, input.companyId]
    );
    payableAccountCode = rows[0]?.code ?? null;
  }

  if (rate === 0) {
    return {
      net: gross, wht: 0, gross, rate: 0,
      category: category?.code ?? catCode ?? null,
      payableAccountCode,
      applies: false,
    };
  }

  const wht = roundTo2(gross * (rate / 100));
  const net = roundTo2(gross - wht);
  return {
    net, wht, gross, rate,
    category: category?.code ?? catCode ?? null,
    payableAccountCode,
    applies: true,
  };
}

/**
 * Determine whether a supplier is non-resident by any of the
 * supported flags. Hot path for the payment-run handler that wants
 * a cheap «does this supplier need WHT consideration?» check before
 * doing the full computeWHT lookup.
 */
export async function isNonResident(companyId: number, supplierId: number): Promise<boolean> {
  const supplier = await getSupplier(companyId, supplierId);
  if (!supplier) return false;
  return supplier.residencyStatus != null && supplier.residencyStatus !== "resident";
}

/**
 * List the seeded + custom WHT categories for a company. Convenience
 * wrapper so the route layer doesn't have to repeat the query.
 */
export async function listWhtCategories(companyId: number): Promise<WhtCategoryRow[]> {
  return rawQuery<WhtCategoryRow>(
    `SELECT id, "companyId", code, name, "nameEn", rate::float8 AS rate,
            "appliesTo", "payableAccountId", "isActive"
       FROM wht_categories
      WHERE "companyId" = $1 AND "deletedAt" IS NULL
      ORDER BY "appliesTo", rate DESC, code`,
    [companyId]
  );
}
