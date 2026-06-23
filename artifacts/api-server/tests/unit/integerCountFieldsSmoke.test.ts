/**
 * عدد صحيح (.int) لحقول العدّ المنفصل — تكميل لعائلة الحدود. حقول عدّ كانت تقبل
 * كسورًا (سعة 45.5 مقعدًا، 4.5 معتمرًا، 3.5 أقساط) رغم أنها كميات منفصلة. أُضيف
 * .int() (وللتدريب .nonnegative() أيضًا إذ كان بلا حدّ). اختبار ثابت.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(API_SRC, rel), "utf8");

describe("integer constraint on discrete-count fields", () => {
  it("umrah transport capacity + pilgrimCount are .int()", () => {
    const u = read("routes/umrah.ts");
    expect((u.match(/capacity: z\.coerce\.number\(\)\.int\(/g) || []).length).toBe(2);
    expect((u.match(/pilgrimCount: z\.coerce\.number\(\)\.int\(/g) || []).length).toBe(2);
  });
  it("properties numberOfInstallments is .int()", () => {
    expect((read("routes/properties.ts").match(/numberOfInstallments: z\.coerce\.number\(\)\.int\(/g) || []).length).toBe(2);
  });
  it("training capacity is .int() and non-negative", () => {
    const t = read("routes/training.ts");
    expect((t.match(/capacity: z\.coerce\.number\(\)\.int\([^)]*\)\.nonnegative\(/g) || []).length).toBe(2);
  });
});
