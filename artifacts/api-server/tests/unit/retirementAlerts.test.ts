// تنبيه اقتراب سن التقاعد — اختبار الدالة النقية (تفعيل حقل dateOfBirth تلقائيًّا).
import { describe, it, expect } from "vitest";
import {
  selectApproachingRetirement,
  RETIREMENT_ALERT_THRESHOLDS_DAYS,
  DEFAULT_RETIREMENT_AGE,
} from "../../src/lib/saudi-compliance/retirement-alerts.js";

const emp = (employeeId: number, dateOfBirth: string | null) => ({ employeeId, dateOfBirth });

describe("selectApproachingRetirement", () => {
  it("يبلغ سن التقاعد اليوم (daysLeft=0) → مُدرَج مع تاريخ التقاعد الصحيح", () => {
    const r = selectApproachingRetirement({ asOfDate: "2025-06-15", employees: [emp(1, "1965-06-15")] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ employeeId: 1, retirementDate: "2025-06-15", daysLeft: 0 });
  });

  it("يعبُر كل عتبة (180/90/30/7) بالضبط → مُدرَج", () => {
    const cases: Array<[string, number]> = [
      ["2024-12-17", 180],
      ["2025-03-17", 90],
      ["2025-05-16", 30],
      ["2025-06-08", 7],
    ];
    for (const [asOf, days] of cases) {
      const r = selectApproachingRetirement({ asOfDate: asOf, employees: [emp(1, "1965-06-15")] });
      expect(r, asOf).toHaveLength(1);
      expect(r[0].daysLeft, asOf).toBe(days);
    }
  });

  it("يومٌ ليس عتبةً (بين العتبات) → غير مُدرَج", () => {
    const r = selectApproachingRetirement({ asOfDate: "2025-04-01", employees: [emp(1, "1965-06-15")] }); // ~75 يومًا
    expect(r).toHaveLength(0);
  });

  it("تجاوز سن التقاعد (daysLeft سالب) → غير مُدرَج", () => {
    const r = selectApproachingRetirement({ asOfDate: "2025-06-16", employees: [emp(1, "1965-06-15")] });
    expect(r).toHaveLength(0);
  });

  it("بلا تاريخ ميلاد أو تاريخ غير صالح → يُتخطّى", () => {
    const r = selectApproachingRetirement({
      asOfDate: "2025-06-15",
      employees: [emp(1, null), emp(2, ""), emp(3, "not-a-date")],
    });
    expect(r).toHaveLength(0);
  });

  it("سن تقاعد مخصّص (62) يُحرّك تاريخ بلوغ السن", () => {
    // مولود 1963-06-15، سن 62 → تقاعد 2025-06-15
    const r = selectApproachingRetirement({ asOfDate: "2025-06-15", retirementAge: 62, employees: [emp(1, "1963-06-15")] });
    expect(r).toHaveLength(1);
    expect(r[0].retirementDate).toBe("2025-06-15");
  });

  it("عتبات مخصّصة تُحترم", () => {
    const r = selectApproachingRetirement({ asOfDate: "2025-06-14", thresholds: [1], employees: [emp(1, "1965-06-15")] });
    expect(r).toHaveLength(1);
    expect(r[0].daysLeft).toBe(1);
  });

  it("يُدرَج مَن يعبُر العتبة فقط من بين عدة موظفين", () => {
    const r = selectApproachingRetirement({
      asOfDate: "2025-06-15",
      employees: [emp(1, "1965-06-15"), emp(2, "1970-01-01"), emp(3, "1965-03-17")], // #1 daysLeft=0؛ #3 تقاعد سابقًا؛ #2 بعيد
    });
    expect(r.map((w) => w.employeeId)).toEqual([1]);
  });

  it("asOfDate غير صالح → خطأ صريح", () => {
    expect(() => selectApproachingRetirement({ asOfDate: "bad", employees: [] })).toThrow();
  });

  it("الثوابت المُصدَّرة كما هو متوقّع", () => {
    expect(DEFAULT_RETIREMENT_AGE).toBe(60);
    expect(RETIREMENT_ALERT_THRESHOLDS_DAYS).toContain(0);
    expect(RETIREMENT_ALERT_THRESHOLDS_DAYS).toContain(180);
  });
});
