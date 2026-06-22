/**
 * سقف أعلى لمصفوفات المدخلات المتعلّقة بالدفتر — متابعة #2885 (التشغيلية). بنود
 * تُدرَج صفًّا لكل عنصر في القيد/الفاتورة كانت بلا .max()، فمصفوفة بعشرات الآلاف ⇒
 * إدراج ضخم في معاملة (استنزاف). تحقّق إدخال فقط؛ منطق الترحيل لم يُمسّ — الحدّ
 * سخيٌّ (أعلى بكثير من أي فاتورة/طلب حقيقي). اختبار ثابت (يقرأ المصدر).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const INV = readFileSync(join(API_SRC, "routes/finance-invoices.ts"), "utf8");
const PUR = readFileSync(join(API_SRC, "routes/finance-purchase.ts"), "utf8");

describe("array input bounds (ledger write-path)", () => {
  it("finance-invoices lines is capped (.max 500) — per-line INSERT loop", () => {
    expect(INV).toMatch(/\.min\(1, "[^"]*"\)\.max\(500, "عدد بنود الفاتورة/);
  });
  it("finance-purchase items is capped (.max 1000) — bulk per-item INSERT", () => {
    expect(PUR).toMatch(/\.min\(1, "[^"]*"\)\.max\(1000, "عدد بنود الطلب/);
  });
});
