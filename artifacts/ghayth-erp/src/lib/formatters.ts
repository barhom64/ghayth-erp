import { getGlobalCurrencyLabel, getGlobalCalendarMode } from "./settings-store";
import {
  toArabicDigits,
  formatGregorian as fmtGregorian,
  formatHijri as fmtHijri,
  formatTime as fmtTime,
  isValidDate,
} from "./date-utils";

function toArabicNumerals(str: string | number): string {
  return toArabicDigits(str);
}

export function formatDateAr(
  dateStr: string | Date | null | undefined,
  forceMode?: "hijri" | "gregorian" | "both",
): string {
  if (!dateStr) return "-";
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (!isValidDate(d)) return "-";
  const mode = forceMode ?? getGlobalCalendarMode();
  if (mode === "both") return `${fmtGregorian(d, "long")} / ${fmtHijri(d, "long")}`;
  if (mode === "hijri") return fmtHijri(d, "long");
  return fmtGregorian(d, "long");
}

export function formatDateBoth(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (!isValidDate(d)) return "-";
  return `${fmtGregorian(d, "long")} / ${fmtHijri(d, "long")}`;
}

export function formatTimeAr(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (!isValidDate(d)) return "-";
  return fmtTime(d, true);
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return "-";
  return toArabicNumerals(num.toLocaleString("en-US"));
}

/**
 * Round a money value to the given number of decimals (default 2).
 * Returns 0 for NaN/invalid input so it never pollutes accounting totals.
 */
export function roundMoney(n: number | string | null | undefined, decimals = 2): number {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || !Number.isFinite(v)) return 0;
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

export function formatCurrency(num: number | null | undefined): string {
  if (num == null) return "-";
  const label = getGlobalCurrencyLabel();
  return `${toArabicNumerals(num.toLocaleString("en-US"))} ${label}`;
}

export function getCurrencySymbol(): string {
  return getGlobalCurrencyLabel();
}
