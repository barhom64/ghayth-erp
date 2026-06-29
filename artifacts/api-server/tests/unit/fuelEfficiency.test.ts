import { describe, it, expect } from "vitest";
import { computeFuelEfficiency, type FuelLogRow } from "../../src/lib/fleet/fuelEfficiency.js";

/**
 * البند ٤ ج-٣ — كفاءة الوقود + تنبيه الاستهلاك الشاذ. الدالة نقية وحتمية، فتُختبَر
 * وحدةً دون قاعدة بيانات. تغطّي: الحسبة الأساسية (كم/لتر بين تعبئتين)، شذوذ الكفاءة
 * المنخفضة، تراجع العدّاد، كسر السلسلة عند غياب العدّاد، والملخّص.
 */
describe("computeFuelEfficiency — ج-٣", () => {
  const fill = (id: number, fuelDate: string, liters: number, mileageAtFuel: number | null, totalCost: number): FuelLogRow =>
    ({ id, fuelDate, liters, mileageAtFuel, totalCost });

  it("يحسب كم/لتر بين تعبئتين متتاليتين؛ الأولى أساسٌ بلا كفاءة", () => {
    const r = computeFuelEfficiency(5, [
      fill(1, "2026-01-01", 40, 10000, 80),
      fill(2, "2026-01-10", 40, 10400, 80), // مسافة 400 ÷ 40 = 10 كم/لتر
      fill(3, "2026-01-20", 40, 10800, 80), // 400 ÷ 40 = 10
    ]);
    expect(r.fills[0].kmPerLiter).toBeNull(); // الأساس
    expect(r.fills[1].kmSinceLast).toBe(400);
    expect(r.fills[1].kmPerLiter).toBe(10);
    expect(r.fills[1].costPerKm).toBe(0.2); // 80 ÷ 400
    expect(r.fills[2].kmPerLiter).toBe(10);
    expect(r.summary.measuredFills).toBe(2);
    expect(r.summary.avgKmPerLiter).toBe(10);
    expect(r.summary.totalKm).toBe(800);
    expect(r.summary.anomalyCount).toBe(0);
  });

  it("يرصد انخفاض الكفاءة الشاذّ (استهلاك مرتفع) دون الوسيط بأكثر من العتبة", () => {
    const r = computeFuelEfficiency(5, [
      fill(1, "2026-01-01", 40, 10000, 80),
      fill(2, "2026-01-10", 40, 10400, 80), // 10 كم/لتر
      fill(3, "2026-01-20", 40, 10800, 80), // 10
      fill(4, "2026-02-01", 40, 11000, 80), // مسافة 200 ÷ 40 = 5 كم/لتر → وسيط 10، حدّ 7.5 → شاذ
    ]);
    const anomalous = r.fills.find((f) => f.id === 4)!;
    expect(anomalous.kmPerLiter).toBe(5);
    expect(anomalous.anomaly?.kind).toBe("low_efficiency");
    expect(r.summary.medianKmPerLiter).toBe(10);
    expect(r.summary.anomalyCount).toBe(1);
    // التعبئتان السليمتان لا تُوسَمان.
    expect(r.fills.find((f) => f.id === 2)!.anomaly).toBeNull();
  });

  it("يرصد تراجع العدّاد (لم يتقدّم) دون احتساب كفاءة", () => {
    const r = computeFuelEfficiency(5, [
      fill(1, "2026-01-01", 40, 10000, 80),
      fill(2, "2026-01-10", 40, 9500, 80), // العدّاد رجع → شذوذ
    ]);
    expect(r.fills[1].anomaly?.kind).toBe("odometer_regression");
    expect(r.fills[1].kmPerLiter).toBeNull();
    expect(r.summary.measuredFills).toBe(0);
  });

  it("تعبئةٌ بلا عدّاد تكسر السلسلة — لا تُضخَّم الكفاءة عبر فجوة مفقودة", () => {
    const r = computeFuelEfficiency(5, [
      fill(1, "2026-01-01", 40, 10000, 80),
      fill(2, "2026-01-10", 40, null, 80), // بلا عدّاد → لا كفاءة لها، وتكسر السلسلة للتالية
      fill(3, "2026-01-20", 40, 10800, 80), // السابقة بلا عدّاد → لا تُقاس (الفترة غامضة)
    ]);
    expect(r.fills[1].kmPerLiter).toBeNull();
    expect(r.fills[2].kmPerLiter).toBeNull(); // كُسرت السلسلة
    expect(r.summary.measuredFills).toBe(0);
  });

  it("يرتّب زمنيًّا قبل الحسبة (إدخال غير مرتّب)", () => {
    const r = computeFuelEfficiency(5, [
      fill(3, "2026-01-20", 40, 10800, 80),
      fill(1, "2026-01-01", 40, 10000, 80),
      fill(2, "2026-01-10", 40, 10400, 80),
    ]);
    // بعد الترتيب: id=1 أساس، id=2 و id=3 بكفاءة 10.
    expect(r.fills.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(r.fills[1].kmPerLiter).toBe(10);
    expect(r.fills[2].kmPerLiter).toBe(10);
  });

  it("سجلّ فارغ → تقرير فارغ آمن", () => {
    const r = computeFuelEfficiency(5, []);
    expect(r.fills).toEqual([]);
    expect(r.summary.measuredFills).toBe(0);
    expect(r.summary.medianKmPerLiter).toBeNull();
    expect(r.summary.avgKmPerLiter).toBeNull();
  });
});
