// ============================================================================
// hrHelpers.ts
// أدوات مساعدة موحّدة لكافة مسارات الموارد البشرية في الباك إند.
// تجنّب تكرار generateNumber / period helpers في كل ملف مسارات.
// ============================================================================

import { rawQuery } from "./rawdb.js";
import { currentYear, roundTo2 } from "./businessHelpers.js";

// ─── توليد رقم متسلسل سنوي ─────────────────────────────────────────────────
// مثال: generateSequentialNumber("hr_employee_loans", 1, "LN") → "LN-2026-0001"
export async function generateSequentialNumber(
  tableName: string,
  companyId: number,
  prefix: string,
  year: number = currentYear(),
): Promise<string> {
  const [row] = await rawQuery<{ cnt: string }>(
    `SELECT COUNT(*)::int AS cnt FROM ${tableName}
     WHERE "companyId" = $1 AND EXTRACT(YEAR FROM "createdAt") = $2`,
    [companyId, year],
  );
  const seq = Number(row?.cnt ?? 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

// ─── الفترة التالية (YYYY-MM) ──────────────────────────────────────────────
// مثال: nextPeriod("2026-04") → "2026-05"; nextPeriod("2026-12") → "2027-01"
export function nextPeriod(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// ─── التقدم بعدد فترات (للأقساط) ───────────────────────────────────────────
// مثال: advancePeriod("2026-04", 3) → "2026-07"
export function advancePeriod(period: string, count: number): string {
  let result = period;
  for (let i = 0; i < count; i++) {
    result = nextPeriod(result);
  }
  return result;
}

// ─── معدل الساعة وفق نظام العمل السعودي (المادة 98) ──────────────────────
// الراتب الشهري / 30 يوم / 8 ساعات
export function calcHourlyRate(monthlySalary: number): number {
  return roundTo2(monthlySalary / 30 / 8);
}

// ─── قيمة الوقت الإضافي ─────────────────────────────────────────────────────
// المعدل بالساعة × عدد الساعات × المضاعف (افتراضي 1.5)
export function calcOvertimeAmount(
  monthlySalary: number,
  hours: number,
  multiplier: number = 1.5,
): number {
  return roundTo2(calcHourlyRate(monthlySalary) * hours * multiplier);
}

// ─── سنوات الخدمة بين تاريخين — calendar-date semantics (Asia/Riyadh) ────
// Uses pure calendar arithmetic on YYYY-MM-DD strings, so a worker hired
// 2020-03-15 and exiting 2025-03-15 lands EXACTLY on 5.000 years
// regardless of host timezone. The previous millisecond-diff
// implementation could land at 4.997 on a UTC server (sub-day skew) and
// flip the Article-85 tier, costing thousands of riyals per exit.
export function yearsOfService(
  startDate: string | Date,
  endDate: string | Date,
): number {
  const toYMD = (d: string | Date): [number, number, number] => {
    const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
    const [y, m, day] = s.slice(0, 10).split("-").map((n) => parseInt(n, 10));
    return [y, m, day];
  };
  const [hy, hm, hd] = toYMD(startDate);
  const [ny, nm, nd] = toYMD(endDate);
  const days = Math.max(
    0,
    (Date.UTC(ny, nm - 1, nd) - Date.UTC(hy, hm - 1, hd)) / 86_400_000,
  );
  return roundTo2(days / 365.25);
}

// ─── نوع إنهاء العقد لأغراض حساب مكافأة نهاية الخدمة ────────────────────
// - termination: إنهاء من صاحب العمل بلا سبب (المادة 84) — كامل المكافأة.
// - resignation: استقالة الموظف (المادة 85) — تدرّج: <2y لا شيء،
//   2-5y الثلث، 5-10y الثلثان، 10y+ كامل.
// - just_cause: فصل لسبب (المادة 80) — لا مكافأة.
export type ExitType = "termination" | "resignation" | "just_cause";

// ─── مكافأة نهاية الخدمة (المادتان 84 و 85 من نظام العمل السعودي) ────────
// المادة 84: أول 5 سنوات = نصف شهر/سنة، بعدها = شهر كامل/سنة.
// المادة 85: على الاستقالة، الموظف يستحق نسبة من المكافأة الكاملة:
//   - أقل من سنتين: لا شيء.
//   - من سنتين إلى أقل من 5 سنوات: ثلث الكامل.
//   - من 5 إلى أقل من 10 سنوات: ثلثا الكامل.
//   - 10 سنوات فما فوق: كامل المكافأة.
// المادة 80: الفصل لسبب مشروع — لا مكافأة.
export function calcGratuity(
  monthlySalary: number,
  years: number,
  exitType: ExitType = "termination",
): {
  first5Years: number;
  after5Years: number;
  /** المكافأة الكاملة قبل تطبيق نسبة المادة 85 */
  fullGratuity: number;
  /** نسبة الاستحقاق (1 لكامل، 2/3، 1/3، 0) */
  resignationFraction: number;
  /** المكافأة بعد تطبيق المادة 85 (هي المبلغ الفعلي المستحق) */
  total: number;
} {
  const safeYears = Math.max(0, years);
  const first5 = Math.min(safeYears, 5);
  const after5 = Math.max(0, safeYears - 5);
  const first5Years = roundTo2(monthlySalary * 0.5 * first5);
  const after5Years = roundTo2(monthlySalary * 1 * after5);
  const fullGratuity = roundTo2(first5Years + after5Years);

  let resignationFraction = 1;
  if (exitType === "just_cause") {
    resignationFraction = 0;
  } else if (exitType === "resignation") {
    if (safeYears < 2) resignationFraction = 0;
    else if (safeYears < 5) resignationFraction = 1 / 3;
    else if (safeYears < 10) resignationFraction = 2 / 3;
    else resignationFraction = 1;
  }

  return {
    first5Years,
    after5Years,
    fullGratuity,
    resignationFraction,
    total: roundTo2(fullGratuity * resignationFraction),
  };
}

// ─── GOSI حسب الجنسية (نظام التأمينات الاجتماعية السعودي) ──────────────────────
// السعودي + مواطنو دول الخليج (مدّ الحماية التأمينية الخليجية) → اشتراك كامل
// (المعاشات + الأخطار المهنية + ساند). الوافد (غير خليجي) → فرع الأخطار المهنية
// فقط: الموظف 0٪ · الشركة ~2٪. قيمة nationality هي الاسم العربي من قائمة الجنسيات
// (lib/nationalities.ts، صيغة المذكّر)، لكن بيانات قديمة/بذور قد تحمل صيغة المؤنث
// (سعودية) فنُسقِط تاء التأنيث قبل المطابقة. جنسية فارغة → تُعامَل كاشتراك كامل
// تحفّظًا (لا نُنقِص اشتراك سعوديٍّ بياناته ناقصة — يطابق السلوك السابق للفارغ).
const GCC_GOSI_NATIONALITIES = new Set([
  "سعودي", "إماراتي", "كويتي", "بحريني", "قطري", "عماني",
]);

/** هل يخضع الموظف لاشتراك GOSI الكامل (مواطن سعودي/خليجي)؟ دالة نقية — مُصدَّرة للاختبار. */
export function isGccGosiNationality(nationality: string | null | undefined): boolean {
  const n = (nationality ?? "").trim();
  if (!n) return true; // جنسية فارغة → اشتراك كامل تحفّظًا (بلا تغيير عن السابق)
  const masculine = n.replace(/ة$/, ""); // أسقط تاء التأنيث: سعودية → سعودي
  return GCC_GOSI_NATIONALITIES.has(masculine);
}

/**
 * حصّتا GOSI (الموظف/الشركة) على وعاء الاشتراك، متفرّعتان على الجنسية:
 *   • خاضع للاشتراك الكامل (سعودي/خليجي): موظف = base×employeeRate · شركة = base×employerRate.
 *   • وافد: موظف = 0 · شركة = base×hazardsRate (فرع الأخطار المهنية فقط).
 * دالة نقية — الوعاء (base) محسوب ومحدّد بالسقف قبل الاستدعاء. مُصدَّرة للاختبار
 * (اختبار assertion على المبالغ التي تصير سطورَ قيد الرواتب — الدستور م٣).
 */
export function computeGosiContribution(params: {
  base: number;
  fullContribution: boolean;
  employeeRate: number;
  employerRate: number;
  hazardsRate: number;
}): { employee: number; employer: number } {
  const { base, fullContribution, employeeRate, employerRate, hazardsRate } = params;
  if (fullContribution) {
    return { employee: roundTo2(base * employeeRate), employer: roundTo2(base * employerRate) };
  }
  return { employee: 0, employer: roundTo2(base * hazardsRate) };
}

// ─── ترقية رصيد الإجازة وفق المادة 109 ────────────────────────────────────
// المادة 109: 21 يومًا للسنة الأولى وحتى 5 سنوات خدمة، 30 يومًا بعد ذلك.
// تُستخدم عند توليد الرصيد السنوي أو على طلبات الإجازة قبل قبول رصيد
// مُعرَّف يدويًا في `hr_leave_types.annualDays`.
export function annualLeaveEntitlement(
  yearsOfServiceAtPeriodStart: number,
  configuredDays: number | null | undefined = null,
): number {
  // If the leave type explicitly sets annualDays > 0, honor it (custom
  // types like "unpaid personal" set their own value). Only the
  // canonical annual leave (typically annualDays=null or 21) is upgraded
  // to 30 after 5 years.
  if (configuredDays && configuredDays > 0 && configuredDays !== 21) {
    return configuredDays;
  }
  return yearsOfServiceAtPeriodStart >= 5 ? 30 : 21;
}

// ─── استثناء أيام الراحة الأسبوعية من نطاق إجازة ─────────────────────────
// نظام العمل السعودي (المادة 104): الجمعة هي يوم الراحة الأسبوعية الافتراضي.
// عند حساب أيام الإجازة المخصومة من الرصيد، تُستثنى أيام الراحة.
// يأخذ مصفوفة أرقام أيام الأسبوع كأيام راحة (0=الأحد .. 6=السبت).
// الافتراضي: [5] أي الجمعة فقط.
export function countLeaveDaysExcludingRest(
  startDate: string,
  endDate: string,
  restDays: number[] = [5],
): number {
  const [sy, sm, sd] = startDate.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endDate.slice(0, 10).split("-").map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  if (endUtc < startUtc) return 0;
  let count = 0;
  for (let t = startUtc; t <= endUtc; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (!restDays.includes(dow)) count++;
  }
  return count;
}

// ─── معامل ضغط الساعات في رمضان (المادة 98) ──────────────────────────────
// لا يتجاوز العامل المسلم 6 ساعات/يوم في رمضان. هذا المعامل = 6/8.
// يُستخدم في حساب التأخر/الانصراف المبكر/الراتب اليومي عندما تكون
// التاريخ ضمن رمضان (هجري). الاستخدام: hourlyRate * RAMADAN_HOURS_FACTOR.
export const RAMADAN_HOURS_FACTOR = 6 / 8;

// ─── معدل ساعة العمل وفق إعدادات الشركة (قابل للتخصيص) ────────────────────
// الافتراضي حسب نظام العمل السعودي: 30 يومًا × 8 ساعات.
// يمكن للشركة تخصيص أيام العمل في الشهر (مثلًا 26 لأسبوع 6 أيام).
export function calcHourlyRateConfigurable(
  monthlySalary: number,
  workingDaysPerMonth: number = 30,
  hoursPerDay: number = 8,
): number {
  if (workingDaysPerMonth <= 0 || hoursPerDay <= 0) {
    return calcHourlyRate(monthlySalary);
  }
  return roundTo2(monthlySalary / workingDaysPerMonth / hoursPerDay);
}
