/**
 * تعميم «PATCH يطابق تحقّق الإنشاء» لترتيب التواريخ — مسار العمرة (موسم + تسعير وكيل).
 * اختبار ثابت (يقرأ المصدر) — لا DB، نمط appointmentsSmoke.
 *
 * العيب المُصلَح (صنف F): الإنشاء يفرض ترتيب التواريخ، لكن التحديث الجزئي كان يسمح
 * بتعديل أحد الطرفين دون إعادة التحقق ضد القيمة الفعلية (المدموجة)، فيُنتِج مدى زمنيًا
 * مقلوبًا (بداية بعد نهاية / صلاحية تبدأ بعد انتهائها — وتكسر أيضًا فحص التداخل).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const UMRAH = readFileSync(join(API_SRC, "routes/umrah.ts"), "utf8");
// U-07 Phase 7 — agent pricing CRUD carved into a dedicated sub-router.
const UMRAH_PRICING = readFileSync(join(API_SRC, "routes/umrah-pricing.ts"), "utf8");

describe("umrah seasons — PATCH re-validates start/end ordering (F-class)", () => {
  it("create schema still enforces endDate >= startDate", () => {
    expect(UMRAH).toMatch(/\.refine\(\(d\) => d\.endDate >= d\.startDate/);
  });

  it("PATCH loads current dates and checks the effective (merged) pair", () => {
    // loads the current start/end as text…
    expect(UMRAH).toMatch(/SELECT "startDate"::text AS "startDate", "endDate"::text AS "endDate" FROM umrah_seasons/);
    // …merges with the patch body…
    expect(UMRAH).toMatch(/const effStart = b\.startDate \?\? curDates\.startDate/);
    expect(UMRAH).toMatch(/const effEnd = b\.endDate \?\? curDates\.endDate/);
    // …and rejects an inverted range.
    expect(UMRAH).toMatch(/if \(effEnd < effStart\)/);
    expect(UMRAH).toMatch(/تاريخ النهاية يجب أن يكون بعد تاريخ البداية/);
  });
});

describe("umrah agent pricing — create + PATCH enforce validFrom <= validTo (F-class)", () => {
  it("create schema now refines validTo >= validFrom", () => {
    expect(UMRAH_PRICING).toMatch(/\.refine\(\(d\) => d\.validTo >= d\.validFrom/);
  });

  it("PATCH re-validates ordering on the effective (merged) values before the overlap check", () => {
    // vf/vt are the merged effective values already loaded for the overlap check…
    expect(UMRAH_PRICING).toMatch(/const vf = b\.validFrom \|\| current\.validFrom/);
    expect(UMRAH_PRICING).toMatch(/const vt = b\.validTo \|\| current\.validTo/);
    // …and the inverted-range guard sits before the PATCH overlap query (which
    // assumes ordering). The overlap message also appears in the POST handler, so
    // assert there is an occurrence AFTER the guard (the PATCH one), not globally.
    const guardIdx = UMRAH_PRICING.search(/new Date\(vt\)\.getTime\(\) < new Date\(vf\)\.getTime\(\)/);
    expect(guardIdx).toBeGreaterThan(-1);
    const overlapAfterGuard = UMRAH_PRICING.indexOf("يوجد تداخل في فترات الأسعار", guardIdx);
    expect(overlapAfterGuard).toBeGreaterThan(guardIdx);
    expect(UMRAH_PRICING).toMatch(/تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء/);
  });
});
