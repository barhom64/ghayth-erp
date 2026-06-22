/**
 * حدّ أعلى لطول مصفوفات المدخلات (نظير DoS الترقيم) — دفعة تشغيلية. حقول z.array
 * تُدرَج/تُحدَّث صفًّا لكل عنصر كانت بلا .max()، فمصفوفة بعشرات الآلاف ⇒ كتابات
 * متسلسلة ضخمة (استنزاف). أُضيف .max() بحدٍّ سخيٍّ يمنع الإساءة دون رفض الاستخدام
 * المشروع. اختبار ثابت (يقرأ المصدر).
 *
 * مؤجّل: umrah import rows (المسار قيد إعادة هيكلة من main — يُعالَج لاحقًا لتفادي
 * التعارض). دفعة الدفتر (finance-invoices lines + finance-purchase items) منفصلة.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const EMP = readFileSync(join(API_SRC, "routes/employees.ts"), "utf8");
const WCC = readFileSync(join(API_SRC, "routes/warehouse-cycle-counts.ts"), "utf8");

describe("array input bounds (operational write-path)", () => {
  it("employees branchAllocations is capped (.max) — per-element INSERT loop", () => {
    expect(EMP).toMatch(/\}\)\)\.max\(50, "عدد تخصيصات الفروع/);
  });
  it("warehouse cycle-count items is capped (.max) — per-element UPDATE loop", () => {
    expect(WCC).toMatch(/\.min\(1, "[^"]*"\)\.max\(1000, "عدد بنود الجرد/);
  });
});
