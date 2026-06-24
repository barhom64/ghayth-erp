/**
 * F9-extension — حدود 0–100 على الحقول النِّسبية (مئوية). اختبار ثابت (يقرأ المصدر).
 *
 * F9 أضاف الحدّ الأدنى (غير سالب) للمبالغ؛ هذه الدفعة تضيف الحدّ الأعلى (≤100)
 * للحقول التي هي نسبة مئوية 0–100 فعلًا (يُثبتها استعمالها: قسمة على 100، أو جمع
 * إلى 100، أو مقارنة/عرض كنسبة). مدخل >100 أو سالب كان يصل لمنطق الحساب فيُضخّم
 * الضريبة/العمولة/التوزيع. إدخالٌ فقط — لا تغيير في منطق القيد (الحساب نفسه ثابت،
 * وكامل مجموعة اختبارات الدفتر تبقى خضراء في guard).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const INVOICES = readFileSync(join(API_SRC, "routes/finance-invoices.ts"), "utf8");
const JOURNAL = readFileSync(join(API_SRC, "routes/finance-journal.ts"), "utf8");
// U-07 Phase 5: commission plan schemas now live in the dedicated sub-router.
const UMRAH = readFileSync(join(API_SRC, "routes/umrah-commission.ts"), "utf8");

describe("percent bounds — invoice tax rates (feed the GL tax line via rate/100)", () => {
  it("vatRate is bounded 0..100 (nonnegative + max 100)", () => {
    expect(INVOICES).toMatch(/vatRate: z\.coerce\.number\(\)\.nonnegative\(\)\.max\(100,/);
  });
  it("taxRate is bounded 0..100 (nonnegative + max 100)", () => {
    expect(INVOICES).toMatch(/taxRate: z\.coerce\.number\(\)\.nonnegative\(\)\.max\(100,/);
  });
});

describe("percent bounds — branch split percentage (must sum to 100)", () => {
  it("branchSplits[].percentage is bounded 0..100", () => {
    expect(JOURNAL).toMatch(/percentage: z\.coerce\.number\(\)\.min\(0,[^)]*\)\.max\(100,/);
  });
});

describe("percent bounds — umrah commission plan rates (rate/100 + threshold %)", () => {
  it("percentageRate is bounded 0..100 in all three schemas (create/update/simulate)", () => {
    const n = (UMRAH.match(/percentageRate: z\.coerce\.number\(\)\.min\(0,[^)]*\)\.max\(100,/g) || []).length;
    expect(n).toBe(3);
  });
  it("minSalesPercent is bounded 0..100 in all three schemas", () => {
    const n = (UMRAH.match(/minSalesPercent: z\.coerce\.number\(\)\.min\(0,[^)]*\)\.max\(100,/g) || []).length;
    expect(n).toBe(3);
  });
  it("no unbounded percentageRate/minSalesPercent remain", () => {
    expect(UMRAH).not.toMatch(/percentageRate: z\.coerce\.number\(\)\.nullable\(\)\.optional\(\)/);
    expect(UMRAH).not.toMatch(/minSalesPercent: z\.coerce\.number\(\)\.nullable\(\)\.optional\(\)/);
  });
});
