// شريحة 2 — اشتقاق ملخّص وزن الرحلة من وقائعها.
// المصدر الواحد: الصافي يُحسب عند القراءة من قيم الوقائع، ولا يُخزَّن.

export interface TripWeightEvent {
  weightKg: number | null;
  weightKind: string | null;
}

export interface TripWeightSummary {
  /** آخر وزن فارغ (tare). */
  tareKg: number | null;
  /** آخر وزن محمّل (gross). */
  grossKg: number | null;
  /** صافي الحمولة = محمّل − فارغ (إن توفّر الطرفان، وإلا null). */
  netKg: number | null;
}

/**
 * يأخذ آخر قراءة `tare` وآخر قراءة `gross` (الوقائع مرتّبة زمنيًا تصاعديًا،
 * فآخر إسناد يفوز — يدعم إعادة الوزن)، ويشتقّ الصافي. يتجاهل القراءات بلا
 * قيمة. الصافي يبقى null ما لم يتوفّر الوزنان.
 */
export function summarizeTripWeights(events: TripWeightEvent[]): TripWeightSummary {
  let tareKg: number | null = null;
  let grossKg: number | null = null;
  for (const e of events) {
    if (e.weightKg == null) continue;
    if (e.weightKind === "tare") tareKg = e.weightKg;
    else if (e.weightKind === "gross") grossKg = e.weightKg;
  }
  const netKg =
    tareKg != null && grossKg != null
      ? Math.round((grossKg - tareKg) * 1000) / 1000
      : null;
  return { tareKg, grossKg, netKg };
}

export const TRIP_WEIGHT_KIND_LABEL: Record<string, string> = {
  tare: "فارغ",
  gross: "محمّل",
  axle: "محور",
  other: "أخرى",
};
