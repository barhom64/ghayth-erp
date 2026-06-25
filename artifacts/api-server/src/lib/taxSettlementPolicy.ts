// ─── سياسة تسوية ضريبة القيمة المضافة (VAT settlement policy) ─────────────────
// إعدادات **دورية تسوية/تقديم** إقرار ضريبة القيمة المضافة: قابلة للتحكم لكل
// شركة عبر مفتاح الإعدادات `finance.tax_settlement_policy`، مع **افتراضي قياسي**
// سعودي مدمج (تسوية شهرية، استحقاق خلال 30 يومًا من نهاية الفترة).
//
// نطاق مقصود وضيّق — لا تكرار لمصادر قائمة:
//   • نسبة الضريبة تبقى مصدرها الوحيد `getCompanyVatRate` (system_settings/vat_rate).
//   • أكواد حسابات المخرجات/المدخلات تبقى مصدرها accounting_mappings عبر
//     resolveAccountCode("vat_output"/"vat_input").
//   • معاينة صافي الضريبة لفترة موجودة في GET /finance/reports/vat-reconciliation.
// هذا الملف يحكم فقط ما لا بيت له: **دورية التسوية ومهلة الاستحقاق**.
//
// الطبقات (الأعلى يفوز): تجاوز الطلب (override) ← تهيئة الشركة (settings) ← القياسي.
// كل حقل يُتحقَّق منه على حدة؛ القيمة غير الصالحة تسقط للطبقة الأدنى.
import { resolveSettings } from "./settings.js";

/** دورية التسوية المسموح بها. */
export type TaxSettlementFrequency = "monthly" | "quarterly";

export interface TaxSettlementPolicy {
  /** دورية تقديم الإقرار/التسوية. */
  frequency: TaxSettlementFrequency;
  /** مهلة الاستحقاق بالأيام بعد نهاية الفترة (هيئة الزكاة والضريبة: نهاية الشهر التالي ≈ 30). */
  filingDueDays: number;
}

/**
 * السياسة القياسية الافتراضية — مطابقة لنظام ضريبة القيمة المضافة السعودي:
 * تسوية شهرية، استحقاق خلال 30 يومًا من نهاية الفترة. تُطبَّق عند غياب تهيئة الشركة.
 */
export const STANDARD_TAX_SETTLEMENT_POLICY: Readonly<TaxSettlementPolicy> = Object.freeze({
  frequency: "monthly",
  filingDueDays: 30,
});

/** مفتاح الإعداد القابل للتحكم لكل شركة (جدول settings). */
export const TAX_SETTLEMENT_POLICY_SETTING_KEY = "finance.tax_settlement_policy";

const FREQUENCIES: ReadonlyArray<TaxSettlementFrequency> = ["monthly", "quarterly"];

/** دورية صالحة فقط لو ضمن القيم المسموح بها؛ غير ذلك يسقط للبديل. */
function pickFrequency(v: unknown, fallback: TaxSettlementFrequency): TaxSettlementFrequency {
  return typeof v === "string" && FREQUENCIES.includes(v as TaxSettlementFrequency)
    ? (v as TaxSettlementFrequency)
    : fallback;
}

/** مهلة صالحة فقط لو عدد صحيح ضمن [1,120] يومًا؛ غير ذلك يسقط للبديل. */
function pickDueDays(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * يدمج السياسة: القياسي ← تهيئة الشركة (`stored`) ← تجاوز الطلب (`override`).
 * نقي وقابل للاختبار وحدةً (لا I/O). كل طبقة تُقرأ فقط لو حقلها موجود وصالح.
 */
export function resolveTaxSettlementPolicyFrom(
  stored?: unknown,
  override?: Partial<TaxSettlementPolicy> | null,
): TaxSettlementPolicy {
  const s = asRecord(stored);
  const o = asRecord(override);
  const present = (rec: Record<string, unknown>, k: string) => rec[k] !== undefined && rec[k] !== null;

  const freqCo = present(s, "frequency") ? pickFrequency(s.frequency, STANDARD_TAX_SETTLEMENT_POLICY.frequency) : STANDARD_TAX_SETTLEMENT_POLICY.frequency;
  const frequency = present(o, "frequency") ? pickFrequency(o.frequency, freqCo) : freqCo;

  const daysCo = present(s, "filingDueDays") ? pickDueDays(s.filingDueDays, STANDARD_TAX_SETTLEMENT_POLICY.filingDueDays) : STANDARD_TAX_SETTLEMENT_POLICY.filingDueDays;
  const filingDueDays = present(o, "filingDueDays") ? pickDueDays(o.filingDueDays, daysCo) : daysCo;

  return { frequency, filingDueDays };
}

/**
 * يحلّ سياسة تسوية الضريبة لشركة من الإعدادات (مع تجاوز الطلب الاختياري فوقها)،
 * بالرجوع للقياسي عند غياب التهيئة. لا migration — يقرأ من جدول settings القائم.
 */
export async function resolveTaxSettlementPolicy(
  companyId: number,
  override?: Partial<TaxSettlementPolicy> | null,
): Promise<TaxSettlementPolicy> {
  const stored = await resolveSettings(TAX_SETTLEMENT_POLICY_SETTING_KEY, companyId).catch(() => undefined);
  return resolveTaxSettlementPolicyFrom(stored, override);
}
