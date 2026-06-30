// fuelEfficiency.ts
//
// البند ٤ ج-٣ — كفاءة الوقود + تنبيه الاستهلاك الشاذ (ملحق أ §أ.١). طبقة تحليلية
// **للقراءة فقط** فوق `fleet_fuel_logs` — لا قيد، لا هجرة، لا كتابة. تحسب كفاءة
// المركبة (كم/لتر) بين تعبئتين متتاليتين بطريقة «الخزّان الممتلئ»: المسافة المقطوعة
// (فرق العدّاد) ÷ لترات التعبئة التي أعادت الخزّان ممتلئًا. ثم ترصد الشذوذ:
//   • low_efficiency      — كفاءة أقلّ من الوسيط بنسبة العتبة (استهلاك مرتفع/تسريب/عطل).
//   • odometer_regression — العدّاد رجع أو لم يتغيّر (خطأ إدخال/إعادة ضبط).
//   • implausible         — كفاءة مرتفعة شذوذًا (تعبئة فائتة أو عدّاد قافز).
//
// دالة **نقية** + حتمية: قابلة للاختبار وحدةً دون قاعدة بيانات (يطابق نمط
// financeDocumentJournal). المسار الخادم يحمّل السطور ويستدعيها فقط.

/** صفّ تعبئة وقود خام (من fleet_fuel_logs) — ما تحتاجه الحسبة فقط. */
export interface FuelLogRow {
  id: number;
  /** تاريخ التعبئة (ISO yyyy-mm-dd) — للترتيب الزمني. */
  fuelDate: string;
  /** اللترات المعبّأة (> 0). */
  liters: number;
  /** قراءة العدّاد عند التعبئة (كم) — قد تغيب لبعض السطور. */
  mileageAtFuel: number | null;
  /** التكلفة الإجمالية شاملة الضريبة (ريال). */
  totalCost: number;
}

/** تعبئة بعد حساب كفاءتها مقارنةً بالتعبئة السابقة ذات العدّاد. */
export interface FuelFill extends FuelLogRow {
  /** المسافة منذ آخر تعبئة بعدّاد (كم) — null للتعبئة الأولى أو بلا عدّاد. */
  kmSinceLast: number | null;
  /** الكفاءة (كم/لتر) — null حين تتعذّر الحسبة. */
  kmPerLiter: number | null;
  /** تكلفة الكيلومتر (ريال/كم) — null حين تتعذّر الحسبة. */
  costPerKm: number | null;
  /** وسم الشذوذ إن وُجد، وإلا null. */
  anomaly: null | { kind: "low_efficiency" | "odometer_regression" | "implausible"; detail: string };
}

export interface FuelEfficiencyReport {
  vehicleId: number;
  /** التعبئات بالترتيب الزمني، كلٌّ بكفاءته ووسم شذوذه. */
  fills: FuelFill[];
  summary: {
    /** عدد التعبئات التي أمكن قياس كفاءتها. */
    measuredFills: number;
    avgKmPerLiter: number | null;
    medianKmPerLiter: number | null;
    totalKm: number;
    totalLiters: number;
    totalCost: number;
    avgCostPerKm: number | null;
    anomalyCount: number;
  };
}

export interface FuelEfficiencyOptions {
  /** عتبة شذوذ الانخفاض كنسبة من الوسيط (افتراضي 0.25 = 25% دون الوسيط). */
  anomalyThresholdPct?: number;
  /** عتبة الكفاءة المرتفعة شذوذًا كمضاعف للوسيط (افتراضي 3 = ثلاثة أضعاف). */
  implausibleFactor?: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * احسب تقرير كفاءة وقود مركبة من سطور تعبئتها. نقية وحتمية:
 *   1) رتّب زمنيًّا (fuelDate ثم id) — العدّاد يطّرد مع الزمن.
 *   2) لكل تعبئة لها عدّاد وسبقتها تعبئةٌ بعدّاد: المسافة = الفرق، الكفاءة = المسافة÷اللترات.
 *      فرق ≤ 0 ⇒ odometer_regression (بلا كفاءة).
 *   3) الوسيط للكفاءات المقيسة ⇒ ارصد low_efficiency (دون العتبة) و implausible (فوق المضاعف).
 */
export function computeFuelEfficiency(
  vehicleId: number,
  logs: FuelLogRow[],
  opts: FuelEfficiencyOptions = {},
): FuelEfficiencyReport {
  const thresholdPct = opts.anomalyThresholdPct ?? 0.25;
  const implausibleFactor = opts.implausibleFactor ?? 3;

  // (1) ترتيب زمني ثابت.
  const ordered = [...logs].sort((a, b) =>
    a.fuelDate === b.fuelDate ? a.id - b.id : a.fuelDate < b.fuelDate ? -1 : 1,
  );

  // (2) كفاءة كل تعبئة مقابل التعبئة **السابقة مباشرةً** (طريقة الخزّان الممتلئ تتطلّب
  //     قراءتَي عدّاد متتاليتين تحيطان بتعبئةٍ واحدة). تعبئةٌ بلا عدّاد تكسر السلسلة:
  //     التعبئة التالية لها لا تُقاس (الفترة غامضة)، فلا نضخّم الكفاءة عبر فجوة مفقودة.
  let prevMileage: number | null = null;
  const fills: FuelFill[] = ordered.map((row): FuelFill => {
    const liters = Number(row.liters) || 0;
    const mileage = row.mileageAtFuel != null && Number.isFinite(Number(row.mileageAtFuel)) ? Number(row.mileageAtFuel) : null;
    let kmSinceLast: number | null = null;
    let kmPerLiter: number | null = null;
    let costPerKm: number | null = null;
    let anomaly: FuelFill["anomaly"] = null;

    if (mileage != null && prevMileage != null) {
      const delta = mileage - prevMileage;
      if (delta <= 0) {
        anomaly = { kind: "odometer_regression", detail: `العدّاد لم يتقدّم (${prevMileage}→${mileage})` };
      } else {
        kmSinceLast = delta;
        if (liters > 0) {
          kmPerLiter = round2(delta / liters);
          costPerKm = round2((Number(row.totalCost) || 0) / delta);
        }
      }
    }
    prevMileage = mileage; // قراءة هذه التعبئة (قد تكون null فتكسر السلسلة للتالية).
    return { ...row, mileageAtFuel: mileage, liters, kmSinceLast, kmPerLiter, costPerKm, anomaly };
  });

  // (3) الوسيط ثم وسم الشذوذ (الكفاءة المنخفضة/المرتفعة شذوذًا) — لا يلمس odometer_regression.
  const measured = fills.filter((f) => f.kmPerLiter != null).map((f) => f.kmPerLiter as number);
  const med = median(measured);
  if (med != null && med > 0) {
    const lowBound = med * (1 - thresholdPct);
    const highBound = med * implausibleFactor;
    for (const f of fills) {
      if (f.kmPerLiter == null || f.anomaly) continue;
      if (f.kmPerLiter < lowBound) {
        f.anomaly = { kind: "low_efficiency", detail: `كفاءة ${f.kmPerLiter} كم/لتر دون الوسيط ${round2(med)} بأكثر من ${Math.round(thresholdPct * 100)}%` };
      } else if (f.kmPerLiter > highBound) {
        f.anomaly = { kind: "implausible", detail: `كفاءة ${f.kmPerLiter} كم/لتر تفوق الوسيط ${round2(med)} بأكثر من ${implausibleFactor}×` };
      }
    }
  }

  const totalKm = fills.reduce((s, f) => s + (f.kmSinceLast ?? 0), 0);
  const totalLiters = round2(fills.reduce((s, f) => s + (Number(f.liters) || 0), 0));
  const totalCost = round2(fills.reduce((s, f) => s + (Number(f.totalCost) || 0), 0));
  const avgKmPerLiter = measured.length > 0 ? round2(measured.reduce((s, v) => s + v, 0) / measured.length) : null;
  const avgCostPerKm = totalKm > 0 ? round2(fills.reduce((s, f) => s + (Number(f.totalCost) || 0) * (f.kmSinceLast != null ? 1 : 0), 0) / totalKm) : null;

  return {
    vehicleId,
    fills,
    summary: {
      measuredFills: measured.length,
      avgKmPerLiter,
      medianKmPerLiter: med != null ? round2(med) : null,
      totalKm: round2(totalKm),
      totalLiters,
      totalCost,
      avgCostPerKm,
      anomalyCount: fills.filter((f) => f.anomaly).length,
    },
  };
}
