/**
 * سقف أعلى لمصفوفات استيراد العمرة — آخر دفعة من صنف سقف المصفوفات. محرّك الاستيراد
 * يعالج كل صف بدفعات (INSERT + استعلامات FK لكل صف)، فمصفوفة rows غير محدودة ⇒
 * ساعات من عمل القاعدة + استنزاف. أُضيف .max(5000) لمخطّطات الاستيراد الأربعة
 * (معاينة/معتمرين/قسائم/legacy). 5000/طلب سخيٌّ لقوائم المواسم؛ الأكبر يُجزَّأ.
 * اختبار ثابت (يقرأ المصدر).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE = readFileSync(join(import.meta.dirname!, "../../src/routes/umrah.ts"), "utf8");

describe("array input bounds — umrah import rows (per-row INSERT + FK resolution)", () => {
  it("all import-rows arrays are capped with .max(5000)", () => {
    const capped = ROUTE.match(/rows: z\.array\(z\.any\(\)\)\.min\(1, "[^"]*"\)\.max\(5000,/g) || [];
    expect(capped.length).toBe(4);
  });
  it("no unbounded z.any() import-rows array remains", () => {
    expect(/rows: z\.array\(z\.any\(\)\)\.min\(1, "[^"]*"\),/.test(ROUTE)).toBe(false);
  });
});
