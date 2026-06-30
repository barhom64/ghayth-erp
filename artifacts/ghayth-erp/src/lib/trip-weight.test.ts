import { describe, it, expect } from "vitest";
import { summarizeTripWeights, computeWeightShortage, TRIP_WEIGHT_KIND_LABEL } from "./trip-weight";

describe("summarizeTripWeights — صافي الحمولة (شريحة 2)", () => {
  it("يشتقّ الصافي = محمّل − فارغ", () => {
    const s = summarizeTripWeights([
      { weightKg: 8000, weightKind: "tare" },
      { weightKg: 20000, weightKind: "gross" },
    ]);
    expect(s).toEqual({ tareKg: 8000, grossKg: 20000, netKg: 12000 });
  });

  it("الصافي null ما لم يتوفّر الطرفان", () => {
    expect(summarizeTripWeights([{ weightKg: 8000, weightKind: "tare" }]).netKg).toBeNull();
    expect(summarizeTripWeights([{ weightKg: 20000, weightKind: "gross" }]).netKg).toBeNull();
    expect(summarizeTripWeights([]).netKg).toBeNull();
  });

  it("يأخذ آخر قراءة لكل نوع (إعادة وزن)", () => {
    const s = summarizeTripWeights([
      { weightKg: 8000, weightKind: "tare" },
      { weightKg: 20000, weightKind: "gross" },
      { weightKg: 21000, weightKind: "gross" }, // إعادة وزن لاحقة
    ]);
    expect(s.grossKg).toBe(21000);
    expect(s.netKg).toBe(13000);
  });

  it("يتجاهل القراءات بلا قيمة أو بلا نوع", () => {
    const s = summarizeTripWeights([
      { weightKg: null, weightKind: "tare" },
      { weightKg: 5000, weightKind: null },
      { weightKg: 20000, weightKind: "gross" },
    ]);
    expect(s.tareKg).toBeNull();
    expect(s.grossKg).toBe(20000);
    expect(s.netKg).toBeNull();
  });

  it("يحافظ على دقّة ثلاث منازل (NUMERIC(12,3))", () => {
    const s = summarizeTripWeights([
      { weightKg: 8000.125, weightKind: "tare" },
      { weightKg: 20000.5, weightKind: "gross" },
    ]);
    expect(s.netKg).toBe(12000.375);
  });

  it("المصطلحات عربية موحّدة", () => {
    expect(TRIP_WEIGHT_KIND_LABEL.tare).toBe("فارغ");
    expect(TRIP_WEIGHT_KIND_LABEL.gross).toBe("محمّل");
  });
});

describe("computeWeightShortage — نقص الحمولة (محمّل المنشأ − محمّل الوجهة)", () => {
  it("يشتقّ النقص من أول وآخر وزن محمّل", () => {
    const s = computeWeightShortage([
      { weightKg: 20000, weightKind: "gross" }, // المنشأ
      { weightKg: 8000, weightKind: "tare" },
      { weightKg: 19500, weightKind: "gross" }, // الوجهة
    ]);
    expect(s).toBe(500);
  });

  it("null عند أقل من قراءتين محمّلتين", () => {
    expect(computeWeightShortage([{ weightKg: 20000, weightKind: "gross" }])).toBeNull();
    expect(computeWeightShortage([{ weightKg: 8000, weightKind: "tare" }])).toBeNull();
    expect(computeWeightShortage([])).toBeNull();
  });

  it("null عند عدم وجود نقص (الوجهة ≥ المنشأ)", () => {
    expect(computeWeightShortage([
      { weightKg: 19500, weightKind: "gross" },
      { weightKg: 20000, weightKind: "gross" },
    ])).toBeNull();
  });

  it("يحفظ دقّة ثلاث منازل", () => {
    expect(computeWeightShortage([
      { weightKg: 20000.5, weightKind: "gross" },
      { weightKg: 19500.125, weightKind: "gross" },
    ])).toBe(500.375);
  });
});
