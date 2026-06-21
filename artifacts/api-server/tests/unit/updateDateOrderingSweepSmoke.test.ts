import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * تعميم نمط «التحديث يطابق تحقّق الإنشاء» لترتيب نطاق التاريخ (فحص النظام 2026-06-20).
 * كل معالج تحديث يكتب زوج بداية/نهاية ويملك إنشاؤه تحقّق ترتيب، يجب أن يعيد التحقق
 * على القيمة الفعّالة (الواردة أو المخزَّنة). اختبار ثابت — لا DB.
 */
const SRC = (f: string) => readFileSync(join(import.meta.dirname!, "../../src/routes", f), "utf8");
const MK = SRC("marketing.ts");
const TASKS = SRC("tasks.ts");

describe("update date-ordering parity with create (F6/F7)", () => {
  it("marketing PATCH /campaigns/:id re-validates start/end (F6)", () => {
    expect(MK).toMatch(/SELECT id, "startDate", "endDate" FROM marketing_campaigns/);
    expect(MK).toMatch(/const sd = b\.startDate \?\? existing\.startDate/);
    expect(MK).toMatch(/sd && ed && new Date\(ed\) < new Date\(sd\)/);
  });

  it("tasks PATCH /:id re-validates scheduledStart/scheduledEnd (F7)", () => {
    expect(TASKS).toMatch(/SELECT "scheduledStart", "scheduledEnd" FROM tasks/);
    expect(TASKS).toMatch(/const ss = scheduledStart \?\? cur\?\.scheduledStart/);
    expect(TASKS).toMatch(/ss && se && new Date\(se\) < new Date\(ss\)/);
  });
});
