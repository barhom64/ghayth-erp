// #2140 شريحة 5-د — حارس R2: التحقق من أن calcDepreciationAmount وdepreciate route
// يطرحان accumulatedImpairment من القيمة الدفترية.
//
// اختبار ساكن — يقرأ الملف المصدري ويبحث عن الأنماط الصحيحة.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROUTE_FILE = resolve(__dirname, "../../src/routes/finance-algorithms.ts");
const src = readFileSync(ROUTE_FILE, "utf-8");

describe("#2140 شريحة 5-د — حارس R2: accumulatedImpairment في الإهلاك", () => {

  it("calcDepreciationAmount يستخرج accumulatedImpairment من asset", () => {
    // نتحقق أن الدالة تقرأ accumulatedImpairment
    const hasProp = /accumulatedImpairment\s*=\s*Number\(asset\.accumulatedImpairment/.test(src);
    expect(hasProp, "calcDepreciationAmount must read asset.accumulatedImpairment").toBe(true);
  });

  it("fallback currentBookValue يطرح accumulatedImpairment", () => {
    // نتحقق أن fallback currentBookValue يطرح كلا المتغيرين
    const fallbackOk = /currentBookValue\s*=\s*Number\(asset\.currentBookValue\s*\?\?\s*\(purchaseCost\s*-\s*accumulatedDepreciation\s*-\s*accumulatedImpairment\)/.test(src);
    expect(fallbackOk, 'currentBookValue fallback must subtract both accumulatedDepreciation and accumulatedImpairment').toBe(true);
  });

  it("depreciate route: newBookValue يطرح accumulatedImpairment", () => {
    // نبحث عن النمط الصحيح في route الإهلاك الفردي
    const depRouteBlock = src.match(/\/fixed-assets\/:id\/depreciate[\s\S]*?^}\);/m)?.[0] ?? "";
    const hasImpairmentSubtraction = /newBookValue[\s\S]{0,200}accumulatedImpairment/.test(depRouteBlock);
    expect(hasImpairmentSubtraction, 'single-asset depreciate route must subtract accumulatedImpairment from newBookValue').toBe(true);
  });

  it("depreciate-all route: newBookValue يطرح accumulatedImpairment", () => {
    // نبحث عن النمط الصحيح في route الإهلاك الدفعي
    const batchBlock = src.match(/\/fixed-assets\/depreciate-all[\s\S]*?^}\);/m)?.[0] ?? "";
    const hasImpairmentSubtraction = /newBookValue[\s\S]{0,200}accumulatedImpairment/.test(batchBlock);
    expect(hasImpairmentSubtraction, 'depreciate-all route must subtract accumulatedImpairment from newBookValue').toBe(true);
  });

  it("لا يوجد newBookValue = purchaseCost - newAccumulated بدون طرح accumulatedImpairment", () => {
    // نتحقق أن الأنماط القديمة (بدون accumulatedImpairment) غير موجودة
    const oldPattern = /newBookValue\s*=\s*Math\.max\(\s*Number\(asset\.purchaseCost\)\s*-\s*newAccumulated\s*,/;
    expect(oldPattern.test(src), 'old newBookValue pattern without accumulatedImpairment must not exist').toBe(false);
  });
});
