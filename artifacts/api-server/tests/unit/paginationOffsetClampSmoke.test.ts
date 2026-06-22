/**
 * حدّ الترقيم — منع OFFSET غير المحدود (DoS). كان LIMIT مقيَّدًا بـ500 بينما OFFSET
 * يُحسب من limit الخام للعميل: `?limit=100000000&page=2` ⇒ `LIMIT 500 OFFSET 1e8`
 * = مسح تسلسلي ضخم. الإصلاح: safeLim واحد مقيَّد (1..500) يُستعمل للإزاحة والحدّ
 * والحجم المُبلَّغ — مطابقة للنمط الآمن في finance-invoices/purchase/zatca/store.
 *
 * اختبار ثابت (يقرأ المصدر) — معالِجا القائمة يحتاجان DB للاختبار السلوكي.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const FILES = ["routes/clients.ts", "routes/employees.ts"] as const;

describe("pagination — client OFFSET is clamped (no unbounded sequential scan)", () => {
  for (const rel of FILES) {
    const src = readFileSync(join(API_SRC, rel), "utf8");
    it(`${rel} clamps limit once (1..500) before using it`, () => {
      expect(src).toMatch(/const safeLim = Math\.min\(Math\.max\(Number\(lim\) \|\| 20, 1\), 500\)/);
    });
    it(`${rel} computes offset from the clamped safeLim, not raw client limit`, () => {
      expect(src).toMatch(/const offset = \(Math\.max\(Number\(page\) \|\| 1, 1\) - 1\) \* safeLim/);
      // the vulnerable form (offset from raw lim) must be gone
      expect(src).not.toMatch(/- 1\) \* \(Number\(lim\)/);
    });
    it(`${rel} pushes the clamped safeLim as the SQL LIMIT param`, () => {
      expect(src).toMatch(/params\.push\(safeLim\)/);
      expect(src).not.toMatch(/params\.push\(Math\.min\(Number\(lim\)/);
    });
  }
});
