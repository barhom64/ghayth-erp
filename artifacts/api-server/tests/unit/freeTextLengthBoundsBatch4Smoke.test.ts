/**
 * حدّ أعلى لطول حقول النصّ الحرّ — الدفعة الأخيرة (hr-discipline + finance-invoices)،
 * تُكمل صنف «حدود طول النصوص» (#2891/#2893/#2894). حقول وصف/عقوبة/مرجع/سبب/ملاحظات
 * تُخزَّن بلا .max(). في finance-invoices حقول نصّية فقط (description/notes/reason) —
 * ليست مبالغ/ترحيل، فلا مساس بالدفتر. حدود سخيّة. اختبار ثابت — لا حقل بلا حدّ.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const DISC = readFileSync(join(API_SRC, "routes/hr-discipline.ts"), "utf8");
const INV = readFileSync(join(API_SRC, "routes/finance-invoices.ts"), "utf8");

describe("free-text length bounds — hr-discipline", () => {
  it("no unbounded free-text field remains", () => {
    const re = /(title|description|notes|reason|comment|note|justification|legalReference|incidentDescription|penalty[0-9]): z\.string\(\)(\.min\(1[^)]*\))?(\.optional\(\))?(\.nullable\(\))?,/;
    expect(re.test(DISC)).toBe(false);
  });
  it("regulation penalties + description are capped", () => {
    expect(DISC).toMatch(/description: z\.string\(\)\.max\(5000,/);
    expect((DISC.match(/penalty[0-9]: z\.string\(\)\.max\(2000,/g) || []).length).toBeGreaterThanOrEqual(8);
  });
});

describe("free-text length bounds — finance-invoices (text fields only, not amounts)", () => {
  it("no unbounded description/notes/reason remains", () => {
    const re = /(description|notes|reason): z\.string\(\)(\.min\(1[^)]*\))?(\.optional\(\))?,/;
    expect(re.test(INV)).toBe(false);
  });
  it("line description + invoice notes/reason are capped", () => {
    expect(INV).toMatch(/description: z\.string\(\)\.max\(2000,/);
    expect((INV.match(/(notes|reason): z\.string\(\)(\.min\(1[^)]*\))?\.max\(2000,/g) || []).length).toBeGreaterThanOrEqual(5);
  });
});
