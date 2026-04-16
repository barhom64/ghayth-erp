// ============================================================================
// date-utils.ts
// طبقة منطق التاريخ الموحّدة لكامل النظام (الفرونت إند).
//
// مبدأ التصميم:
// - فصل المنطق عن العرض: parsing, formatting, validation, conversion هنا.
// - تخزين داخلي موحّد: ISO 8601 (YYYY-MM-DD أو YYYY-MM-DDTHH:mm).
// - دعم الإدخال المرن: عربي/إنجليزي، هجري/ميلادي، فواصل /‏ - .
// - عرض ثنائي بسهولة: نفس التاريخ بالميلادي والهجري في آنٍ واحد.
// ============================================================================

// ── أرقام عربية ↔ غربية ───────────────────────────────────────────
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toWesternDigits(str: string): string {
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => {
    const ar = ARABIC_DIGITS.indexOf(d);
    if (ar !== -1) return String(ar);
    const fa = PERSIAN_DIGITS.indexOf(d);
    if (fa !== -1) return String(fa);
    return d;
  });
}

export function toArabicDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

// ── أنواع التقاويم ─────────────────────────────────────────────────
export type CalendarType = "gregory" | "hijri";

// ── شكل التاريخ المُحلَّل ──────────────────────────────────────────
export interface ParsedDate {
  /** التاريخ الميلادي القياسي بصيغة ISO (YYYY-MM-DD) */
  iso: string;
  /** نوع التقويم الذي أدخله المستخدم أصلاً */
  detectedCalendar: CalendarType;
  /** الوقت إن وجد بصيغة HH:mm */
  time?: string;
}

// ============================================================================
// التحويل بين التقاويم
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** يحوّل تاريخاً ميلادياً إلى مكوّناته الهجرية باستخدام Intl. */
export function gregorianToHijri(date: Date): { year: number; month: number; day: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    return {
      year: parseInt(toWesternDigits(get("year")), 10),
      month: parseInt(toWesternDigits(get("month")), 10),
      day: parseInt(toWesternDigits(get("day")), 10),
    };
  } catch {
    return { year: 0, month: 0, day: 0 };
  }
}

/** يحوّل تاريخاً هجرياً إلى ميلادي عبر بحث صغير حول التقدير. */
export function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date {
  // نقطة البداية: عصر الهجرة (16 يوليو 622م)
  const hijriEpochMs = new Date(622, 6, 16).getTime();
  // متوسط السنة الهجرية: 354.367 يوم
  const approxMs = hijriEpochMs + ((hYear - 1) * 354.367 + (hMonth - 1) * 29.53 + hDay - 1) * MS_PER_DAY;
  const approxGreg = new Date(approxMs);
  for (let offset = -30; offset <= 30; offset++) {
    const candidate = new Date(approxGreg.getTime() + offset * MS_PER_DAY);
    const h = gregorianToHijri(candidate);
    if (h.year === hYear && h.month === hMonth && h.day === hDay) {
      return candidate;
    }
  }
  return approxGreg;
}

// ============================================================================
// التنسيق (formatting)
// ============================================================================

export type DateFormatStyle = "short" | "medium" | "long";

/** تنسيق ميلادي عربي: 17/04/2026 (short) أو 17 أبريل 2026 (long). */
export function formatGregorian(date: Date, style: DateFormatStyle = "short"): string {
  if (!isValidDate(date)) return "";
  if (style === "short") {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${date.getFullYear()}`;
  }
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: style === "long" ? "long" : "short",
    day: "numeric",
  }).format(date);
}

/** تنسيق هجري عربي: 17/10/1447هـ (short) أو 17 شوال 1447هـ (long). */
export function formatHijri(date: Date, style: DateFormatStyle = "short"): string {
  if (!isValidDate(date)) return "";
  try {
    if (style === "short") {
      const h = gregorianToHijri(date);
      const d = String(h.day).padStart(2, "0");
      const m = String(h.month).padStart(2, "0");
      return `${d}/${m}/${h.year}هـ`;
    }
    const formatted = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: style === "long" ? "long" : "short",
      day: "numeric",
    }).format(date);
    return formatted.endsWith("هـ") ? formatted : `${formatted}هـ`;
  } catch {
    return "";
  }
}

/** تنسيق الوقت: 14:30 أو 02:30 م (12-hour). */
export function formatTime(date: Date, hour12: boolean = false): string {
  if (!isValidDate(date)) return "";
  if (hour12) {
    return new Intl.DateTimeFormat("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** ميلادي + هجري معاً للعرض المزدوج. */
export function formatDual(date: Date, style: DateFormatStyle = "short"): string {
  return `${formatGregorian(date, style)} — ${formatHijri(date, style)}`;
}

// ============================================================================
// التحليل (parsing) — يقبل صيغ متعددة
// ============================================================================

/**
 * يحلّل نصاً إلى ParsedDate. يقبل:
 *   - 2026-04-17, 2026/04/17 (ISO)
 *   - 17/04/2026, 17-04-2026, 17.04.2026 (DMY ميلادي)
 *   - 17/10/1447, 1447-10-17 (هجري — يُستنتج من السنة)
 *   - مع وقت اختياري: 17/04/2026 14:30 أو 17/04/2026 2:30 PM
 *   - أرقام عربية أو غربية
 *
 * يُرجع null إذا لم يستطع التحليل أو كان التاريخ غير صحيح.
 */
export function parseFlexibleDate(
  input: string | null | undefined,
  hint?: CalendarType,
): ParsedDate | null {
  if (!input) return null;
  const cleaned = toWesternDigits(String(input).trim());
  if (!cleaned) return null;

  // افصل التاريخ عن الوقت إن وجد
  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM|ص|م))?$/i);
  let time: string | undefined;
  let datePart = cleaned;
  if (timeMatch) {
    let hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);
    const meridiem = (timeMatch[3] || "").toUpperCase();
    if (meridiem === "PM" || meridiem === "م") {
      if (hh < 12) hh += 12;
    } else if (meridiem === "AM" || meridiem === "ص") {
      if (hh === 12) hh = 0;
    }
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    datePart = cleaned.slice(0, timeMatch.index).trim();
  }

  // فصّل أجزاء التاريخ
  const parts = datePart.split(/[\/\-\.\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;

  let year: number, month: number, day: number;
  let detectedCalendar: CalendarType = "gregory";

  // اكتشف الترتيب من حجم القيم
  if (nums[0] > 31) {
    // YYYY-MM-DD
    [year, month, day] = nums;
  } else if (nums[2] > 31) {
    // DD-MM-YYYY
    [day, month, year] = nums;
  } else {
    return null;
  }

  // اكتشف نوع التقويم: السنة الهجرية عادة < 1500
  if (hint) {
    detectedCalendar = hint;
  } else if (year < 1500) {
    detectedCalendar = "hijri";
  }

  // تحقق من صحة الشهر واليوم
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let gregorianDate: Date;
  if (detectedCalendar === "hijri") {
    gregorianDate = hijriToGregorian(year, month, day);
  } else {
    gregorianDate = new Date(year, month - 1, day);
    // تأكد أن JS لم يصحّح خطأً (مثل 31 فبراير → 3 مارس)
    if (
      gregorianDate.getFullYear() !== year ||
      gregorianDate.getMonth() !== month - 1 ||
      gregorianDate.getDate() !== day
    ) {
      return null;
    }
  }

  if (!isValidDate(gregorianDate)) return null;

  const iso = toISODate(gregorianDate);
  return { iso, detectedCalendar, time };
}

// ============================================================================
// أدوات تاريخ عامة
// ============================================================================

export function isValidDate(d: any): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** يحوّل Date إلى صيغة ISO YYYY-MM-DD (محلية، بدون منطقة زمنية). */
export function toISODate(date: Date): string {
  if (!isValidDate(date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** يحوّل Date إلى صيغة datetime محلية YYYY-MM-DDTHH:mm. */
export function toISODateTime(date: Date): string {
  if (!isValidDate(date)) return "";
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${toISODate(date)}T${h}:${m}`;
}

/** يحلّل ISO إلى Date بأمان. */
export function fromISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // قبول YYYY-MM-DD و YYYY-MM-DDTHH:mm
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    m[4] ? parseInt(m[4], 10) : 0,
    m[5] ? parseInt(m[5], 10) : 0,
  );
  return isValidDate(d) ? d : null;
}

// ============================================================================
// التحقق المنطقي (validation)
// ============================================================================

export interface DateValidationOptions {
  required?: boolean;
  /** أقدم تاريخ مسموح به */
  minDate?: Date | string;
  /** أحدث تاريخ مسموح به */
  maxDate?: Date | string;
  /** يمنع التاريخ بعد اليوم */
  noFuture?: boolean;
  /** يمنع التاريخ قبل اليوم */
  noPast?: boolean;
}

export interface DateValidationResult {
  valid: boolean;
  error?: string;
}

export function validateDate(
  iso: string | null | undefined,
  options: DateValidationOptions = {},
): DateValidationResult {
  if (!iso) {
    if (options.required) return { valid: false, error: "هذا الحقل مطلوب" };
    return { valid: true };
  }
  const date = fromISO(iso);
  if (!date) return { valid: false, error: "تاريخ غير صحيح" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (options.noFuture && date.getTime() > today.getTime() + MS_PER_DAY - 1) {
    return { valid: false, error: "لا يمكن اختيار تاريخ مستقبلي" };
  }
  if (options.noPast && date.getTime() < today.getTime()) {
    return { valid: false, error: "لا يمكن اختيار تاريخ قديم" };
  }
  if (options.minDate) {
    const min = options.minDate instanceof Date ? options.minDate : fromISO(options.minDate);
    if (min && date.getTime() < min.getTime()) {
      return { valid: false, error: `التاريخ قبل الحد الأدنى (${formatGregorian(min)})` };
    }
  }
  if (options.maxDate) {
    const max = options.maxDate instanceof Date ? options.maxDate : fromISO(options.maxDate);
    if (max && date.getTime() > max.getTime()) {
      return { valid: false, error: `التاريخ بعد الحد الأقصى (${formatGregorian(max)})` };
    }
  }
  return { valid: true };
}

/** تحقق من صحة فترة (من ≤ إلى). */
export function validateRange(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
  options: DateValidationOptions = {},
): DateValidationResult {
  const f = validateDate(fromIso, options);
  if (!f.valid) return f;
  const t = validateDate(toIso, options);
  if (!t.valid) return t;
  if (fromIso && toIso) {
    const from = fromISO(fromIso);
    const to = fromISO(toIso);
    if (from && to && from.getTime() > to.getTime()) {
      return { valid: false, error: "تاريخ النهاية قبل تاريخ البداية" };
    }
  }
  return { valid: true };
}

// ============================================================================
// اختصارات سريعة (presets)
// ============================================================================

export interface DatePreset {
  key: string;
  label: string;
  /** يُرجع تاريخاً واحداً (للحقل المفرد) أو فترة [from, to] للنطاق. */
  getDate: () => Date | [Date, Date];
}

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

export const DATE_PRESETS: DatePreset[] = [
  { key: "today", label: "اليوم", getDate: () => startOfDay(new Date()) },
  {
    key: "yesterday",
    label: "أمس",
    getDate: () => {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - 1);
      return d;
    },
  },
  {
    key: "tomorrow",
    label: "غداً",
    getDate: () => {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() + 1);
      return d;
    },
  },
  { key: "month_start", label: "بداية الشهر", getDate: () => startOfMonth(new Date()) },
  { key: "month_end", label: "نهاية الشهر", getDate: () => endOfMonth(new Date()) },
];

export const RANGE_PRESETS: DatePreset[] = [
  {
    key: "today",
    label: "اليوم",
    getDate: (): [Date, Date] => {
      const d = startOfDay(new Date());
      return [d, d];
    },
  },
  {
    key: "this_week",
    label: "هذا الأسبوع",
    getDate: (): [Date, Date] => {
      const today = startOfDay(new Date());
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return [start, end];
    },
  },
  {
    key: "this_month",
    label: "هذا الشهر",
    getDate: (): [Date, Date] => [startOfMonth(new Date()), endOfMonth(new Date())],
  },
  {
    key: "last_30_days",
    label: "آخر 30 يوماً",
    getDate: (): [Date, Date] => {
      const end = startOfDay(new Date());
      const start = new Date(end);
      start.setDate(end.getDate() - 29);
      return [start, end];
    },
  },
  {
    key: "this_year",
    label: "هذه السنة",
    getDate: (): [Date, Date] => {
      const now = new Date();
      return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)];
    },
  },
];
