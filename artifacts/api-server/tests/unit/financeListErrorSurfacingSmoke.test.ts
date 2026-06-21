/**
 * F8 — منع «ابتلاع الخطأ الصامت» في معالِجات القوائم المالية (GET).
 * اختبار ثابت (يقرأ المصدر) — لا DB.
 *
 * كانت هذه المعالِجات تلتقط خطأ DB ثم ترجع HTTP 200 بمصفوفة فارغة
 * (`res.json({ data: [] ... })`)، فيرى العميل «نجاح، لا بيانات» بينما فشل الاستعلام
 * فعلًا (وأحدها لم يكن يسجّل الخطأ أصلًا). الإصلاح: توحيدها على `handleRouteError`
 * (النمط القانوني في المستودع) فتُرجِع حالة خطأ صحيحة ويُسجَّل العطل.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const FILES = [
  "finance-accounts.ts",
  "finance-journal.ts",
  "finance-budget.ts",
  "finance-vendors.ts",
  "finance-custodies.ts",
  "finance-pricing.ts",
] as const;

// True if any `catch (...) {` block returns an empty-data success payload
// (the silent-swallow signature) within its body.
function hasSwallowingCatch(src: string): boolean {
  const re = /catch\s*\([^)]*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const seg = src.slice(m.index, m.index + 300);
    if (/res\.json\(\s*\{\s*data:\s*\[\]/.test(seg)) return true;
  }
  return false;
}

describe("F8 — finance list handlers surface errors instead of swallowing them", () => {
  for (const file of FILES) {
    const src = readFileSync(join(API_SRC, "routes", file), "utf8");
    it(`${file} has no catch block that returns an empty-data 200`, () => {
      expect(hasSwallowingCatch(src)).toBe(false);
    });
    it(`${file} uses handleRouteError as the error path`, () => {
      expect(src).toMatch(/handleRouteError\(/);
    });
  }
});
