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

// Browser-local today as YYYY-MM-DD for `<input type="date">` defaults.
// Intentionally NOT a period filter — uses `Intl.DateTimeFormat("en-CA")`
// in the browser's local TZ to avoid the bound-`new Date()`.getMonth/getFullYear
// pattern banned by check:finance-period-drift.
const LOCAL_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function todayLocal(): string {
  return LOCAL_DAY_FMT.format(new Date());
}

// ── Riyadh-aware "current period" helpers ─────────────────────────
// Always return the current period in Asia/Riyadh regardless of the
// browser/server timezone. Use these in place of `new Date().getMonth()`
// / `new Date().getFullYear()` for any value that drives a business
// "current period" (defaults on create forms, "this month" filters,
// default report periods…). Otherwise at ~21:00 Riyadh on the last day
// of the month a UTC clock already thinks it's next month and the value
// points at the wrong period (Task #433/#435/#437/#439 family).
const RIYADH_PERIOD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function riyadhTodayISO(): string {
  return RIYADH_PERIOD_FMT.format(new Date());
}

export function currentYearRiyadh(): number {
  return Number(riyadhTodayISO().slice(0, 4));
}

export function currentMonthPaddedRiyadh(): string {
  return riyadhTodayISO().slice(5, 7);
}

export function currentPeriodRiyadh(): string {
  return riyadhTodayISO().slice(0, 7);
}
