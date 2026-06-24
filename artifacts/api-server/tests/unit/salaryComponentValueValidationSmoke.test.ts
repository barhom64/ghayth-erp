/**
 * تحقّق مشروط لقيمة مكوّن الراتب حسب calculationType (قرار إبراهيم 2026-06-21:
 * ثابت/نسبة/معادلة حسب اختيار المستخدم). اختبار سلوكي على المخطّط المُصدَّر — لا DB.
 *
 * منطق الحساب (computePayroll، hr.ts): percentage ⇒ basic*value/100؛ fixed/formula
 * ⇒ value مبلغ مباشر. لذا: percentage 0..100، و fixed/formula غير سالب. حدّ ثابت
 * 0..100 على الكل كان سيكسر مبلغ "ثابت" كبيرًا — لذلك التحقّق مشروط (superRefine).
 *
 * يغذّي الرواتب ثم الدفتر ⇒ تحقّق إدخال (صنف F9). مسار PATCH يطبّق نفس المنطق على
 * القيمة الفعلية (المدموجة) في المعالِج (يُغطّى بفحص ثابت أدناه).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { salaryComponentSchema } from "../../src/routes/hr.js";

const ok = (body: unknown) => salaryComponentSchema.safeParse(body).success;

describe("salary component value — conditional bound by calculationType (create schema)", () => {
  it("percentage: 0..100 accepted, >100 and <0 rejected", () => {
    expect(ok({ name: "تأمينات", calculationType: "percentage", value: 9.75 })).toBe(true);
    expect(ok({ name: "تأمينات", calculationType: "percentage", value: 0 })).toBe(true);
    expect(ok({ name: "تأمينات", calculationType: "percentage", value: 100 })).toBe(true);
    expect(ok({ name: "تأمينات", calculationType: "percentage", value: 101 })).toBe(false);
    expect(ok({ name: "تأمينات", calculationType: "percentage", value: -1 })).toBe(false);
  });

  it("fixed: any non-negative amount accepted (no upper cap), negative rejected", () => {
    expect(ok({ name: "بدل سكن", calculationType: "fixed", value: 5000 })).toBe(true);
    expect(ok({ name: "بدل سكن", calculationType: "fixed", value: 250000 })).toBe(true); // > 100 is fine for a fixed amount
    expect(ok({ name: "بدل سكن", calculationType: "fixed", value: -1 })).toBe(false);
  });

  it("formula: treated like a direct amount (non-negative, no 0..100 cap)", () => {
    expect(ok({ name: "مكوّن", calculationType: "formula", value: 3200 })).toBe(true);
    expect(ok({ name: "مكوّن", calculationType: "formula", value: -5 })).toBe(false);
  });

  it("calculationType omitted defaults to fixed (non-negative, no upper cap)", () => {
    expect(ok({ name: "مكوّن", value: 7000 })).toBe(true);
    expect(ok({ name: "مكوّن", value: -1 })).toBe(false);
  });

  it("value omitted is allowed (optional)", () => {
    expect(ok({ name: "مكوّن", calculationType: "percentage" })).toBe(true);
  });
});

describe("salary component PATCH — merged-value conditional check is present", () => {
  const HR = readFileSync(join(import.meta.dirname!, "../../src/routes/hr.ts"), "utf8");
  it("PATCH validates the effective (merged) calculationType + value", () => {
    expect(HR).toMatch(/const effType = String\(b\.calculationType \?\? beforeRow\?\.calculationType \?\? "fixed"\)/);
    expect(HR).toMatch(/effType === "percentage"/);
    expect(HR).toMatch(/نسبة المكوّن يجب أن تكون بين 0 و100/);
    expect(HR).toMatch(/قيمة المكوّن يجب ألا تكون سالبة/);
  });
});
