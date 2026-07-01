// GOSI حسب الجنسية — assertion على المبالغ التي تصير سطورَ قيد الرواتب (الدستور م٣).
//
// الخلل المُصحَّح (٢٠٢٦-٠٧-٠١): كانت الرواتب تطبّق نسبة GOSI الكاملة على **كل**
// موظف بلا تفريع جنسية، فيُخصَم من الوافد GOSI موظف (~10٪) ويُحمَّل على الشركة
// نسبة كاملة (~12٪). الصحيح في نظام التأمينات السعودي: الوافد (غير الخليجي) →
// فرع الأخطار المهنية فقط (الموظف 0٪ + الشركة ~2٪)؛ السعودي/الخليجي → اشتراك كامل.
//
// هاتان الدالتان النقيّتان تُغذّيان gosiEmployee (خصم من الصافي + دائن GOSI مستحق)
// وgosiEmployer (مدين مصروف GOSI + دائن GOSI مستحق) في postPayrollRunGL، فالتأكيد
// على مبالغهما تأكيدٌ على قيم سطور القيد.
import { describe, it, expect } from "vitest";
import { isGccGosiNationality, computeGosiContribution } from "../../src/lib/hrHelpers.js";

describe("isGccGosiNationality — تصنيف الجنسية لاشتراك GOSI", () => {
  it("السعودي (مذكّر/مؤنّث) → اشتراك كامل", () => {
    expect(isGccGosiNationality("سعودي")).toBe(true);
    expect(isGccGosiNationality("سعودية")).toBe(true); // بيانات بذور/قديمة بصيغة المؤنّث
    expect(isGccGosiNationality("  سعودي  ")).toBe(true); // مع فراغات
  });

  it("مواطنو دول الخليج → اشتراك كامل (مدّ الحماية التأمينية)", () => {
    for (const n of ["إماراتي", "كويتي", "بحريني", "قطري", "عماني"]) {
      expect(isGccGosiNationality(n), n).toBe(true);
    }
    expect(isGccGosiNationality("إماراتية")).toBe(true); // مؤنّث خليجي
  });

  it("الوافد (غير الخليجي) → ليس اشتراكًا كاملًا (أخطار مهنية فقط)", () => {
    for (const n of ["مصري", "هندي", "يمني", "فلبيني", "باكستاني", "سوداني", "بريطاني"]) {
      expect(isGccGosiNationality(n), n).toBe(false);
    }
  });

  it("جنسية فارغة/غير محدّدة → تُعامَل كاشتراك كامل تحفّظًا (لا نُنقِص اشتراك سعوديّ ببيانات ناقصة)", () => {
    expect(isGccGosiNationality("")).toBe(true);
    expect(isGccGosiNationality("   ")).toBe(true);
    expect(isGccGosiNationality(null)).toBe(true);
    expect(isGccGosiNationality(undefined)).toBe(true);
  });
});

describe("computeGosiContribution — حصّتا GOSI متفرّعتان على الجنسية", () => {
  const EMP = 0.0975; // موظف سعودي 9.75٪
  const EMPR = 0.1175; // شركة سعودي 11.75٪
  const HAZ = 0.02; // أخطار مهنية 2٪

  it("سعودي/خليجي (اشتراك كامل): موظف = base×employeeRate · شركة = base×employerRate", () => {
    const r = computeGosiContribution({ base: 10000, fullContribution: true, employeeRate: EMP, employerRate: EMPR, hazardsRate: HAZ });
    expect(r.employee).toBe(975);   // 10000 × 9.75٪
    expect(r.employer).toBe(1175);  // 10000 × 11.75٪
  });

  it("وافد: الموظف صفر · الشركة = base×hazardsRate فقط (لا اشتراك موظف، لا نسبة كاملة على الشركة)", () => {
    const r = computeGosiContribution({ base: 10000, fullContribution: false, employeeRate: EMP, employerRate: EMPR, hazardsRate: HAZ });
    expect(r.employee).toBe(0);    // الخلل السابق كان 975 — يُخصم من الوافد خطأً
    expect(r.employer).toBe(200);  // الخلل السابق كان 1175 — يُحمَّل على الشركة خطأً
  });

  it("يحترم النِّسب الافتراضية للكود (10٪/12٪) عند تمريرها", () => {
    const full = computeGosiContribution({ base: 11000, fullContribution: true, employeeRate: 0.10, employerRate: 0.12, hazardsRate: HAZ });
    expect(full.employee).toBe(1100);
    expect(full.employer).toBe(1320);
    const foreign = computeGosiContribution({ base: 11000, fullContribution: false, employeeRate: 0.10, employerRate: 0.12, hazardsRate: HAZ });
    expect(foreign.employee).toBe(0);
    expect(foreign.employer).toBe(220); // 11000 × 2٪
  });

  it("وعاء صفري → صفر في الحالتين", () => {
    expect(computeGosiContribution({ base: 0, fullContribution: true, employeeRate: EMP, employerRate: EMPR, hazardsRate: HAZ })).toEqual({ employee: 0, employer: 0 });
    expect(computeGosiContribution({ base: 0, fullContribution: false, employeeRate: EMP, employerRate: EMPR, hazardsRate: HAZ })).toEqual({ employee: 0, employer: 0 });
  });

  it("التقريب لخانتين (roundTo2) على وعاء كسريّ", () => {
    // 10333.33 × 9.75٪ = 1007.4996.. → 1007.50
    const r = computeGosiContribution({ base: 10333.33, fullContribution: true, employeeRate: EMP, employerRate: EMPR, hazardsRate: HAZ });
    expect(r.employee).toBeCloseTo(1007.50, 2);
  });
});
