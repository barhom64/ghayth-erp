/**
 * حدّ دنيا للكميات غير المالية (≥0) — دفعة تشغيلية. حقول عدّ/سعة كانت
 * z.coerce.number() بلا حدّ أدنى، فيُقبل عدد سالب (سعة/عدد معتمرين/كمية مجرودة/
 * أقساط سالبة) ⇒ سجلّ بلا معنى أو حساب مقلوب. أُضيف .nonnegative() لكلٍّ.
 * اختبار ثابت (يقرأ المصدر). صنف من نوع F9 على الكميات (لا المبالغ).
 *
 * مستثنى: finance-algorithms unitsThisPeriod (محميّ وقت التشغيل بـ units<=0 ⇒ 0)؛
 * وحقول الدلتا التي يكون السالب فيها مشروعًا (لم تُرصد هنا).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const cases: Array<[string, string, number]> = [
  // [file, field, expected #occurrences bounded]
  ["routes/umrah.ts", "capacity", 2],
  ["routes/umrah.ts", "pilgrimCount", 2],
  ["routes/warehouse.ts", "physicalCount", 1],
  ["routes/properties.ts", "numberOfInstallments", 2],
];

describe("quantity fields are non-negative (operational write-path)", () => {
  for (const [rel, field, n] of cases) {
    const src = readFileSync(join(API_SRC, rel), "utf8");
    it(`${rel}: ${field} is bounded .nonnegative() (${n}x)`, () => {
      // tolerate an optional .int() inserted before .nonnegative() (discrete-count fields)
      const bounded = new RegExp(`${field}: z\\.coerce\\.number\\(\\)(\\.int\\([^)]*\\))?\\.nonnegative\\(`, "g");
      expect((src.match(bounded) || []).length).toBe(n);
    });
    it(`${rel}: no unbounded ${field}: z.coerce.number().optional() remains`, () => {
      const unbounded = new RegExp(`${field}: z\\.coerce\\.number\\(\\)\\.optional\\(\\),`);
      expect(unbounded.test(src)).toBe(false);
    });
  }
});
