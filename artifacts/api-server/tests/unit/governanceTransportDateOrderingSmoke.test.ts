/**
 * تعميم «التحديث/الإنشاء يفرض ترتيب التواريخ» — سياسات الحوكمة + قواعد تسعير النقل.
 * اختبار ثابت (يقرأ المصدر) — لا DB، نمط appointmentsSmoke. صنف F.
 *
 * قبل الإصلاح: لا الإنشاء ولا التحديث يفرض ترتيب تاريخَي السريان/الانتهاء، فيمكن
 * إنشاء/تعديل سجلّ بمدى مقلوب — ويكسر ذلك فلتر «السياسة النشطة» (effective<=اليوم
 * AND expiry>=اليوم) واستعلامات التسعير حسب التاريخ.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const GOV = readFileSync(join(API_SRC, "routes/governance.ts"), "utf8");
const TRANSPORT = readFileSync(join(API_SRC, "routes/transport-pricing.ts"), "utf8");

describe("governance policies — effective/expiry ordering on create + update + version", () => {
  it("defines a shared conditional ordering predicate (applies only when both dates present)", () => {
    expect(GOV).toMatch(/const policyDatesOrdered = .*!d\.effectiveDate \|\| !d\.expiryDate \|\| d\.expiryDate >= d\.effectiveDate/s);
  });

  it("applies the refine to all three schemas (create, update, version)", () => {
    const refines = GOV.match(/\.refine\(policyDatesOrdered, policyDatesRefine\)/g) || [];
    expect(refines.length).toBe(3);
  });

  it("PATCH re-validates ordering against the effective (merged) values", () => {
    expect(GOV).toMatch(/SELECT "effectiveDate"::text AS "effectiveDate", "expiryDate"::text AS "expiryDate" FROM governance_policies/);
    expect(GOV).toMatch(/const effEff = b\.effectiveDate !== undefined/);
    expect(GOV).toMatch(/const effExp = b\.expiryDate !== undefined/);
    expect(GOV).toMatch(/if \(effEff && effExp && effExp < effEff\)/);
  });
});

describe("transport price rules — validFrom/validTo ordering on create + update", () => {
  it("create rejects validTo before validFrom", () => {
    expect(TRANSPORT).toMatch(/if \(b\.validTo && b\.validTo < b\.validFrom\)/);
  });

  it("PATCH re-validates ordering against the effective (merged) values", () => {
    expect(TRANSPORT).toMatch(/SELECT "validFrom"::text AS "validFrom", "validTo"::text AS "validTo" FROM transport_price_rules/);
    expect(TRANSPORT).toMatch(/const effFrom = b\.validFrom !== undefined \? b\.validFrom : cur\.validFrom/);
    expect(TRANSPORT).toMatch(/const effTo = b\.validTo !== undefined \? b\.validTo : cur\.validTo/);
    expect(TRANSPORT).toMatch(/if \(effFrom && effTo && effTo < effFrom\)/);
  });
});
