// ============================================================================
// hrValidation.ts — shared Zod refinements for HR + finance schemas.
//
// Addresses audit findings VAL-1 (no max-length on text), VAL-2 (no trim
// before min check — whitespace-only strings pass), VAL-3 / VAL-4 (no
// cap on monetary amounts), VAL-5 (no ISO-2 nationality enum).
//
// Use these helpers instead of bare `z.string()` / `z.coerce.number()`
// when accepting user input that lands in a TEXT column or a money
// amount. Each helper carries a clear Arabic message so the frontend
// can surface the right field error without translation.
// ============================================================================

import { z } from "zod";

// ─── Length bands ───────────────────────────────────────────────────────────
export const HR_TEXT_LIMITS = {
  /** Short labels / type slugs / single-word identifiers. */
  SHORT: 100,
  /** Names, titles, single-line subjects. */
  NAME: 200,
  /** Multi-line reasons, notes, descriptions. */
  TEXT: 2_000,
  /** Long documents (letter bodies, full memos). */
  LONG_TEXT: 10_000,
} as const;

// ─── Money caps ─────────────────────────────────────────────────────────────
// All caps are upper bounds for plausibility — they catch obvious typos
// (an extra zero, a confused sign), not legitimate business edge cases.
// A company that needs to pay more than these limits must do so via an
// explicit override path, not through a default form.
export const HR_MONEY_CAPS = {
  /** Salary deduction (violation, late, absence). One full month's basic. */
  DEDUCTION_MAX: 50_000,
  /** Single employee loan principal. */
  LOAN_MAX: 200_000,
  /** Monthly salary line. */
  SALARY_MAX: 200_000,
  /** Single overtime line — most months are <100h × 100 SAR/h. */
  OVERTIME_MAX: 50_000,
} as const;

// ─── Reusable Zod helpers ───────────────────────────────────────────────────

/**
 * Trimmed required text. Whitespace-only strings fail with the supplied
 * message. Pass a max-length band; default is TEXT (2,000 chars).
 *
 * Replaces the common `z.string().min(1, "X مطلوب")` pattern which
 * accepted "   " (3 spaces) as valid.
 */
export function trimmedRequired(
  message: string,
  max: number = HR_TEXT_LIMITS.TEXT,
): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, message)
    .max(max, `الحد الأقصى ${max} حرفًا`);
}

/**
 * Trimmed optional text. NULL, undefined, and whitespace-only all
 * collapse to `undefined` so downstream code can stick to a single
 * "missing" sentinel (matches existing `reason ?? undefined` patterns
 * across the routes).
 */
export function trimmedOptional(max: number = HR_TEXT_LIMITS.TEXT) {
  return z
    .string()
    .max(max, `الحد الأقصى ${max} حرفًا`)
    .nullable()
    .optional()
    .transform((v): string | undefined => {
      if (v == null) return undefined;
      const t = v.trim();
      return t.length === 0 ? undefined : t;
    });
}

/**
 * Capped non-negative money amount. Refuses NaN, negatives, and values
 * exceeding the supplied cap.
 */
export function moneyAmount(
  fieldLabel: string,
  cap: number = HR_MONEY_CAPS.SALARY_MAX,
): z.ZodNumber {
  return z
    .coerce
    .number()
    .nonnegative(`${fieldLabel} يجب أن يكون رقمًا موجبًا`)
    .max(cap, `${fieldLabel} لا يمكن أن يتجاوز ${cap.toLocaleString("ar-SA")} ريال`);
}

/**
 * Strictly positive money amount (e.g. loan principal, salary).
 */
export function positiveMoneyAmount(
  fieldLabel: string,
  cap: number = HR_MONEY_CAPS.SALARY_MAX,
): z.ZodNumber {
  return z
    .coerce
    .number()
    .positive(`${fieldLabel} يجب أن يكون أكبر من صفر`)
    .max(cap, `${fieldLabel} لا يمكن أن يتجاوز ${cap.toLocaleString("ar-SA")} ريال`);
}

// ─── ISO-3166 alpha-2 country codes (subset relevant to Saudi employers) ────
// We don't ship the full ISO list — just the countries actually present
// in employee nationality data plus the GCC + common expat origins. New
// countries can be added with a one-line addition; the goal is to keep
// Nitaqat classification deterministic (VAL-5).
export const SUPPORTED_NATIONALITIES = [
  "SA", // المملكة العربية السعودية
  "AE", "KW", "BH", "OM", "QA", // GCC
  "EG", "JO", "LB", "SY", "PS", "YE", "IQ", "SD", "MA", "DZ", "TN", "LY", // الدول العربية
  "TR", "IR", "AF", "PK", "BD", "IN", "LK", "NP", "PH", "ID", "MY", // آسيا
  "GB", "US", "CA", "AU", "DE", "FR", "IT", "ES", "NL", "BE", // غرب
  "ET", "SO", "KE", "NG", "GH", "TZ", "UG", // أفريقيا
  "BR", "ZA", "RU", "CN", "KR", "JP", "TH", "VN", // متفرقات
  "OTHER", // fallback for new nationalities not yet listed
] as const;

export type Nationality = (typeof SUPPORTED_NATIONALITIES)[number];

/**
 * ISO-3166 alpha-2 nationality enum. Coerces input to uppercase before
 * matching, so "sa" / "Sa" / "SA" all resolve to "SA". Required for
 * Nitaqat snapshots so the Saudization classifier sees a known value.
 */
export function nationalityCode(required: boolean = false) {
  // Cast through the mutable tuple shape that z.enum() requires. The
  // `readonly` annotation on SUPPORTED_NATIONALITIES is correct at the
  // type level (we want callers to treat it as immutable) but Zod's
  // signature wants a regular tuple — the cast resolves the mismatch
  // without losing literal-string narrowing in the inferred output.
  const tuple = SUPPORTED_NATIONALITIES as unknown as [string, ...string[]];
  const base = z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.enum(tuple, {
      errorMap: () => ({
        message: `الجنسية يجب أن تكون من القائمة المعتمدة (مثل SA, AE, EG)`,
      }),
    }));
  return required ? base : base.optional();
}
