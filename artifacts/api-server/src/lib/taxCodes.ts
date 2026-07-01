// ─────────────────────────────────────────────────────────────────────────────
// taxCodes.ts
//
// Centralised tax-code lookup + amount math.
//
// Today every invoice line carries a free-form `vatRate` numeric.
// Daftra-style flow: pick a TAX CODE (tied to its own GL account +
// ZATCA category), declare whether the entered amount is gross
// (tax-inclusive) or net (tax-exclusive), and let the helper compute
// the split. No more hard-coded 15 / 5 / 0 literals scattered across
// route handlers.
//
// Pure module — no Express, no authorize, no Router. Reads tax_codes
// via rawQuery in the current transaction's connection.
// ─────────────────────────────────────────────────────────────────────────────

import { rawQuery } from "./rawdb.js";
import { roundTo2 } from "./businessHelpers.js";
import { resolveVatLegAccount } from "./vatLeg.js";

export type TaxType = "standard" | "zero" | "exempt" | "out_of_scope" | "reverse_charge";

export interface TaxCodeRow {
  id: number;
  companyId: number;
  code: string;
  name: string;
  nameEn: string | null;
  rate: number;
  taxType: TaxType;
  accountId: number | null;       // output VAT account (sales side)
  inputAccountId: number | null;  // input VAT account (purchases side)
  isInclusiveDefault: boolean;
  zatcaCategoryCode: string | null;
  zatcaExemptionReason: string | null;
  isActive: boolean;
}

export interface TaxSplit {
  /** Net amount, before tax. */
  net: number;
  /** Tax amount. */
  tax: number;
  /** Gross amount = net + tax. Equals the input amount when inclusive=true. */
  gross: number;
  /** The tax code that produced this split. */
  taxCode: string;
  /** Effective rate used (snapshot for audit). */
  rate: number;
}

// In-process cache per (companyId, code). tax_codes change rarely;
// invalidated on writes via clearTaxCodeCache.
const _cache = new Map<string, TaxCodeRow>();
const cacheKey = (companyId: number, code: string) => `${companyId}::${code}`;

export function clearTaxCodeCache(companyId?: number, code?: string): void {
  if (!companyId) {
    _cache.clear();
    return;
  }
  if (code) {
    _cache.delete(cacheKey(companyId, code));
  } else {
    // Clear all entries for this company.
    for (const k of _cache.keys()) {
      if (k.startsWith(`${companyId}::`)) _cache.delete(k);
    }
  }
}

/**
 * Load a tax code row by (companyId, code). Returns null when missing
 * or inactive. Cached.
 */
export async function getTaxCode(companyId: number, code: string): Promise<TaxCodeRow | null> {
  if (!code) return null;
  const k = cacheKey(companyId, code);
  const cached = _cache.get(k);
  if (cached) return cached;

  const rows = await rawQuery<TaxCodeRow>(
    `SELECT id, "companyId", code, name, "nameEn", rate::float8 AS rate,
            "taxType", "accountId", "inputAccountId",
            "isInclusiveDefault", "zatcaCategoryCode", "zatcaExemptionReason",
            "isActive"
       FROM tax_codes
      WHERE "companyId" = $1 AND code = $2
        AND "deletedAt" IS NULL
        AND "isActive" = true
      LIMIT 1`,
    [companyId, code]
  );
  const row = rows[0] ?? null;
  if (row) _cache.set(k, row);
  return row;
}

/**
 * Resolve the default tax code for a company. Picks 'VAT15' if active,
 * otherwise the first active 'standard' row, otherwise null. Used when
 * a line doesn't specify a tax code and the route falls back to the
 * tenant's default.
 */
export async function getDefaultTaxCode(companyId: number): Promise<TaxCodeRow | null> {
  // Try the conventional 'VAT15' first.
  const std = await getTaxCode(companyId, "VAT15");
  if (std) return std;
  const rows = await rawQuery<TaxCodeRow>(
    `SELECT id, "companyId", code, name, "nameEn", rate::float8 AS rate,
            "taxType", "accountId", "inputAccountId",
            "isInclusiveDefault", "zatcaCategoryCode", "zatcaExemptionReason",
            "isActive"
       FROM tax_codes
      WHERE "companyId" = $1 AND "taxType" = 'standard'
        AND "deletedAt" IS NULL AND "isActive" = true
      ORDER BY rate DESC, id ASC
      LIMIT 1`,
    [companyId]
  );
  return rows[0] ?? null;
}

/**
 * Compute the tax split for a single line.
 *
 *   computeTaxFromTaxCode(115, true,  taxCode='VAT15')  → { net: 100, tax: 15, gross: 115 }
 *   computeTaxFromTaxCode(100, false, taxCode='VAT15')  → { net: 100, tax: 15, gross: 115 }
 *   computeTaxFromTaxCode(100, false, taxCode='VAT0')   → { net: 100, tax: 0,  gross: 100 }
 *   computeTaxFromTaxCode(100, false, taxCode='EXEMPT') → { net: 100, tax: 0,  gross: 100 }
 *
 * `taxCode` is read once and the result snapshots its rate. Caller
 * passes EITHER the gross (taxInclusive=true) OR the net
 * (taxInclusive=false) as `amount`.
 *
 * Throws ValidationError if the code isn't found / inactive. Returns
 * a balanced { net, tax, gross } rounded to 2dp.
 */
export async function computeTaxFromTaxCode(input: {
  companyId: number;
  amount: number;
  taxInclusive: boolean;
  taxCode: string;
}): Promise<TaxSplit> {
  const code = await getTaxCode(input.companyId, input.taxCode);
  if (!code) {
    throw new Error(`Tax code not found or inactive: ${input.taxCode}`);
  }
  return splitFromRate(input.amount, input.taxInclusive, code.code, code.rate);
}

/**
 * Pure math — split an amount by a known rate. Exposed for cases where
 * the caller has the rate in hand (e.g., legacy invoices that stored
 * `vatRate` directly) and doesn't need a tax_codes lookup.
 */
export function splitFromRate(
  amount: number,
  taxInclusive: boolean,
  taxCode: string,
  ratePercent: number,
): TaxSplit {
  const rate = Number(ratePercent) || 0;
  if (rate < 0 || rate > 100) {
    throw new Error(`Invalid tax rate: ${rate}`);
  }
  let net: number, tax: number, gross: number;
  if (rate === 0) {
    net = roundTo2(amount);
    tax = 0;
    gross = net;
  } else if (taxInclusive) {
    // amount = net + net*rate/100 = net*(1+rate/100)
    net = roundTo2(amount / (1 + rate / 100));
    gross = roundTo2(amount);
    tax = roundTo2(gross - net);
  } else {
    net = roundTo2(amount);
    tax = roundTo2(net * (rate / 100));
    gross = roundTo2(net + tax);
  }
  return { net, tax, gross, taxCode, rate };
}

/**
 * Resolve the output VAT account for a tax code. Used by invoice
 * approval to find which VAT-payable account the credit goes on —
 * standard rate may want '2300', RC may want '2305 reverse-charge
 * payable', exempt has no VAT account.
 *
 * Returns null when the tax code's GL account isn't configured (the
 * caller should fall back to the company-level invoice_vat_payable
 * mapping).
 */
export async function getOutputVatAccountCode(companyId: number, taxCode: string): Promise<string | null> {
  const code = await getTaxCode(companyId, taxCode);
  if (!code || !code.accountId) return null;
  const rows = await rawQuery<{ code: string }>(
    `SELECT code FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [code.accountId, companyId]
  );
  return rows[0]?.code ?? null;
}

/** Symmetric helper for purchases. */
export async function getInputVatAccountCode(companyId: number, taxCode: string): Promise<string | null> {
  const code = await getTaxCode(companyId, taxCode);
  if (!code || !code.inputAccountId) return null;
  const rows = await rawQuery<{ code: string }>(
    `SELECT code FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [code.inputAccountId, companyId]
  );
  return rows[0]?.code ?? null;
}

/**
 * البند ٤ (جانب المشتريات) — حساب ضريبة المدخلات للشركة. فواتير الشراء وأوامره
 * لا تحمل رمز ضريبة لكل وثيقة (بخلاف فواتير المبيعات)، فيُشتقّ حساب المدخلات من
 * رمز الضريبة القياسي للشركة (getDefaultTaxCode → inputAccountId). يرتدّ إلى
 * `fallbackAccount` (تعيين الشركة العام) حين لا رمز قياسي أو لا حساب مدخلات
 * مُهيّأ له — فيبقى السلوك مطابقًا تمامًا للسابق عند عدم التهيئة.
 *
 * نظير resolveVatLegAccount على جانب المبيعات، لكن المصدر هنا الرمز القياسي
 * لا رمز الوثيقة (لغياب عمود taxCode على المشتريات). الدقّة لكل وثيقة تحتاج
 * هجرة (عمود taxCode على purchase_orders/vendor_invoices) — خارج هذا النطاق.
 */
export async function resolveCompanyInputVatAccount(
  companyId: number,
  fallbackAccount: string,
): Promise<string> {
  const def = await getDefaultTaxCode(companyId);
  const specific = def ? await getInputVatAccountCode(companyId, def.code) : null;
  // القرار نفسه المثبَّت على جانب المبيعات: حساب الرمز إن وُجد، وإلا الاحتياطي.
  return resolveVatLegAccount(specific, fallbackAccount);
}

/**
 * البند ٤ (دقّة لكل وثيقة شراء) — حساب ضريبة المدخلات لوثيقة بعينها. تَرتُّب
 * الاشتقاق: **رمز ضريبة الوثيقة** (إن حملته وكان حسابه مُهيّأً) ← **الرمز القياسي
 * للشركة** ← **الاحتياطي العام**. فوثيقة برمز غير قياسي تُرحّل ضريبتها إلى حساب
 * رمزها، والوثائق بلا رمز تبقى على الرمز القياسي (سلوك #3084).
 *
 * يُستعمل في المعالج الحقيقي لفاتورة المورد (resolveVendorInvoicePlan) حيث رمز
 * الوثيقة يُشتقّ من بنودها (vendorInvoiceLineSchema.taxCode) — بلا هجرة.
 */
export async function resolveInputVatAccount(
  companyId: number,
  docTaxCode: string | null | undefined,
  fallbackAccount: string,
): Promise<string> {
  const code = typeof docTaxCode === "string" ? docTaxCode.trim() : "";
  if (code) {
    const specific = await getInputVatAccountCode(companyId, code);
    if (specific) return specific;
  }
  return resolveCompanyInputVatAccount(companyId, fallbackAccount);
}

/**
 * البند ٤ — رمز ضريبة الوثيقة من بنودها: أوّل بند خاضع للضريبة (vatAmount > 0)
 * يحمل رمزًا غير فارغ. سطر ضريبة المدخلات رأسيّ واحد، فالبنود مختلطة الرموز
 * تأخذ أوّل رمز (نظير قيد سطر الضريبة الرأسي في المبيعات). لا بند برمز ⇒ null
 * (يرتدّ resolveInputVatAccount عندئذٍ للرمز القياسي للشركة). وحدة نقية.
 */
export function pickDocTaxCodeFromLines(
  lines: ReadonlyArray<{ taxCode?: string | null; vatAmount?: number | null }>,
): string | null {
  for (const l of lines) {
    const code = (l.taxCode ?? "").trim();
    if (Number(l.vatAmount) > 0 && code) return code;
  }
  return null;
}

/**
 * Validate that a tax code is usable in a given direction. Throws if
 * the code is exempt/out-of-scope but the caller is trying to compute
 * VAT, or if the code has no account configured.
 *
 * Currently soft (no throw) — the helper math handles rate=0 and the
 * caller can still post a line with no VAT account. Reserved for future
 * tightening when a tenant turns on "strict mode".
 */
export async function assertTaxCodeUsable(_companyId: number, _taxCode: string, _side: "output" | "input"): Promise<void> {
  // no-op stub — kept so call sites can wire the contract early.
}
