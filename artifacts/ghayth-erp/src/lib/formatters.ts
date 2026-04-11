import { getGlobalCurrencyLabel, getGlobalCalendarMode } from "./settings-store";

const westernToArabic: Record<string, string> = {
  "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
  "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩",
};

function toArabicNumerals(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => westernToArabic[d] || d);
}

const arabicMonths = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function formatGregorian(d: Date): string {
  const day = toArabicNumerals(d.getDate());
  const month = arabicMonths[d.getMonth()];
  const year = toArabicNumerals(d.getFullYear());
  return `${day} ${month} ${year}`;
}

function formatHijriDate(d: Date): string {
  try {
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
    return hijri;
  } catch {
    return formatGregorian(d);
  }
}

export function formatDateAr(dateStr: string | Date | null | undefined, forceMode?: "hijri" | "gregorian" | "both"): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  const mode = forceMode ?? getGlobalCalendarMode();
  if (mode === "both") return `${formatGregorian(d)} / ${formatHijriDate(d)}`;
  if (mode === "hijri") return formatHijriDate(d);
  return formatGregorian(d);
}

export function formatDateBoth(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return `${formatGregorian(d)} / ${formatHijriDate(d)}`;
}

export function formatTimeAr(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return "-";
  return toArabicNumerals(num.toLocaleString("en-US"));
}

export function formatCurrency(num: number | null | undefined): string {
  if (num == null) return "-";
  const label = getGlobalCurrencyLabel();
  return `${toArabicNumerals(num.toLocaleString("en-US"))} ${label}`;
}

export function getCurrencySymbol(): string {
  return getGlobalCurrencyLabel();
}
