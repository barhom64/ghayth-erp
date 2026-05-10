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

// ─── سنوات الخدمة بين تاريخين ──────────────────────────────────────────────
export function yearsOfService(startDate: string | Date, endDate: string | Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const ms = end.getTime() - start.getTime();
  return roundTo2(ms / (1000 * 60 * 60 * 24 * 365.25));
}

// ─── مكافأة نهاية الخدمة وفق نظام العمل السعودي (المادة 84) ──────────────
// أول 5 سنوات: نصف شهر/سنة. ما بعدها: شهر كامل/سنة.
export function calcGratuity(monthlySalary: number, years: number): {
  first5Years: number;
  after5Years: number;
  total: number;
} {
  const first5 = Math.min(years, 5);
  const after5 = Math.max(0, years - 5);
  const first5Years = roundTo2(monthlySalary * 0.5 * first5);
  const after5Years = roundTo2(monthlySalary * 1 * after5);
  return {
    first5Years,
    after5Years,
    total: roundTo2(first5Years + after5Years),
  };
}
