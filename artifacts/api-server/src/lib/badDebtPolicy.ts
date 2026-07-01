// ─── سياسة مخصّص الديون المشكوك فيها (Bad-debt provision policy) ────────────────
// نِسَب التقادم لمخصّص الديون: **قابلة للتحكم لكل شركة** عبر مفتاح الإعدادات
// `finance.bad_debt_policy`، مع **افتراضي قياسي** مدمج يُطبَّق عند غياب تهيئة.
//
// الطبقات (الأعلى يفوز): تجاوز الطلب (override) ← تهيئة الشركة (settings) ← القياسي.
// كل نسبة تُقصَر على [0,1]؛ القيمة غير الصالحة تسقط للطبقة الأدنى — فلا تُفسد
// قيمة محقونة (>100% أو سالبة) المخصّص.
//
// أعمار الذمم الخمسة (بالأيام بعد الاستحقاق): حالية (≤0) · 1-30 · 31-60 · 61-90 · 90+.
import { resolveSettings } from "./settings.js";

export interface BadDebtRates {
  /** ذمم غير متأخرة (≤ 0 يوم بعد الاستحقاق). */
  current: number;
  /** 1-30 يومًا بعد الاستحقاق. */
  d30: number;
  /** 31-60 يومًا. */
  d60: number;
  /** 61-90 يومًا. */
  d90: number;
  /** أكثر من 90 يومًا. */
  d90plus: number;
}

/**
 * السياسة القياسية الافتراضية — متحفّظة ومتدرّجة مع التقادم. تُطبَّق عند غياب
 * تهيئة الشركة. (نفس القيم التي كانت مضمّنة في مساري المعاينة/الترحيل سابقًا،
 * مرفوعة هنا كمصدر واحد قابل للتحكم.)
 */
export const STANDARD_BAD_DEBT_RATES: Readonly<BadDebtRates> = Object.freeze({
  current: 0,
  d30: 0.05,
  d60: 0.25,
  d90: 0.5,
  d90plus: 0.75,
});

/** مفتاح الإعداد القابل للتحكم لكل شركة (جدول settings). */
export const BAD_DEBT_POLICY_SETTING_KEY = "finance.bad_debt_policy";

const BUCKETS: ReadonlyArray<keyof BadDebtRates> = ["current", "d30", "d60", "d90", "d90plus"];

/** نسبة صالحة فقط لو رقم نهائي ضمن [0,1]؛ غير ذلك يسقط للبديل. */
function clampRate(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * يدمج النِسَب: القياسي ← تهيئة الشركة (`stored`) ← تجاوز الطلب (`override`).
 * نقي وقابل للاختبار وحدةً (لا I/O). كل طبقة تُقرأ فقط لو حقلها موجود وصالح.
 */
export function resolveBadDebtRates(
  stored?: unknown,
  override?: Partial<BadDebtRates> | null,
): BadDebtRates {
  const s = asRecord(stored);
  const o = asRecord(override);
  const out = {} as BadDebtRates;
  for (const k of BUCKETS) {
    const standard = STANDARD_BAD_DEBT_RATES[k];
    const company = s[k] !== undefined && s[k] !== null ? clampRate(s[k], standard) : standard;
    out[k] = o[k] !== undefined && o[k] !== null ? clampRate(o[k], company) : company;
  }
  return out;
}

/**
 * يحلّ نِسَب سياسة الشركة من الإعدادات (مع تجاوز الطلب الاختياري فوقها)،
 * بالرجوع للقياسي عند غياب التهيئة. لا migration — يقرأ من جدول settings القائم.
 */
export async function resolveBadDebtPolicy(
  companyId: number,
  override?: Partial<BadDebtRates> | null,
): Promise<BadDebtRates> {
  const stored = await resolveSettings(BAD_DEBT_POLICY_SETTING_KEY, companyId).catch(() => undefined);
  return resolveBadDebtRates(stored, override);
}
