/**
 * Vehicle Class Ladder — PE-07 (#2079).
 *
 * Closes UPG-01 from `docs/transport-audit/20` §6: the legacy
 * `UPGRADE_LADDER` in assignmentSuggestionEngine.ts mixed passenger
 * and cargo classes into one sequence — so `isUpgrade("sedan",
 * "truck")` returned true and the agreement scorer happily rewarded
 * a sedan→truck "upgrade" on a passenger booking. This module
 * splits the ladder by trip family and adds an explicit
 * cross-family blocker.
 *
 * Owner's mandate (2026-06-11):
 *   «افصل ladder حسب العائلة: passenger ladder مستقل. cargo
 *    ladder مستقل. أي ladder عام مشترك ممنوع إلا كتعريف تقني لا
 *    يغير القرار. PE-07 لا يتجاوز VCM... إذا المركبة غير صالحة
 *    للركاب فلا تدخل ركاب مهما كانت الترقية.»
 *
 * Boundary:
 *   • Scoring + reinforcing-blocker module only.
 *   • Does NOT replace VCM (which already ejects cross-family
 *     vehicles upstream). This is the second line — if VCM lets a
 *     vehicle through because of an over-broad vehicleServiceTypes
 *     list, the agreement scorer still refuses to call a class jump
 *     across families an "upgrade".
 *   • No UI, no finance, no VRP, no driver reputation.
 *   • Family classification is intentionally narrow: anything we
 *     can't confidently tag stays "unknown" and falls through to
 *     the existing CLASS_EQUIVALENCES path (no behaviour change).
 */

export type ClassFamily = "passenger" | "cargo" | "equipment" | "unknown";

/** Passenger ladder: small → large seat capacity. */
export const PASSENGER_LADDER: readonly string[] = [
  "compact", "sedan", "suv", "crossover",
  "van", "minivan",
  "bus_22", "bus_29", "bus_45", "bus_50",
] as const;

/** Cargo ladder: small → large payload / box size. */
export const CARGO_LADDER: readonly string[] = [
  "pickup", "truck", "trailer",
] as const;

/** Equipment ladder (heavy machinery — not transport in the booking
 *  sense, but #2079 §10 marks the type so we cover it for completeness). */
export const EQUIPMENT_LADDER: readonly string[] = [
  "equipment",
] as const;

const PASSENGER_SET  = new Set<string>(PASSENGER_LADDER);
const CARGO_SET      = new Set<string>(CARGO_LADDER);
const EQUIPMENT_SET  = new Set<string>(EQUIPMENT_LADDER);

/**
 * Classify a vehicle class label into its operational family.
 *
 *   • Anything in PASSENGER_LADDER → "passenger".
 *   • Anything in CARGO_LADDER     → "cargo".
 *   • Anything in EQUIPMENT_LADDER → "equipment".
 *   • Anything else                → "unknown" (no ladder enforcement).
 *
 * "unknown" intentionally degrades gracefully — a class that's not
 * mapped here doesn't trigger a cross-family blocker; it just falls
 * outside the ladder rewards. Operators can adopt the helper as they
 * roll out canonical class names.
 */
export function classFamily(vehicleClass: string | null | undefined): ClassFamily {
  if (!vehicleClass) return "unknown";
  if (PASSENGER_SET.has(vehicleClass))  return "passenger";
  if (CARGO_SET.has(vehicleClass))      return "cargo";
  if (EQUIPMENT_SET.has(vehicleClass))  return "equipment";
  return "unknown";
}

export interface LadderVerdict {
  /** True when from→to is an upgrade STRICTLY within the same family
   *  and the trip family matches that family. */
  isUpgrade: boolean;
  /** True when from and to belong to different operational families,
   *  OR when the candidate's family contradicts the booking's trip
   *  family. The agreement scorer turns this into a blocker. */
  crossesFamily: boolean;
  /** Arabic, ready for `reasons`/`blockers` strings. Null when neither
   *  upgrade nor cross-family applies. */
  reason: string | null;
}

/**
 * Decide what the candidate's vehicle class means for a request that
 * asked for a different class — within the same trip family.
 *
 *   • Cross-family request vs vehicle → crossesFamily.
 *   • Trip family enforced explicitly when supplied (engine threads
 *     `tripFamily` from the booking).
 *   • Otherwise check ladder direction inside the matching family.
 */
export function evaluateLadder(
  fromClass: string,
  toClass: string,
  tripFamily: "passenger" | "cargo" | null,
): LadderVerdict {
  const fromFam = classFamily(fromClass);
  const toFam   = classFamily(toClass);

  // 1) Trip family wins when present. A passenger booking that asked
  //    for a cargo class is a data-entry error, but the candidate
  //    must still be a passenger-family vehicle to score normally.
  if (tripFamily === "passenger" && toFam === "cargo") {
    return {
      isUpgrade: false, crossesFamily: true,
      reason: "مرفوض: لا يجوز استخدام ladder الحمولة لرحلة ركاب",
    };
  }
  if (tripFamily === "cargo" && toFam === "passenger") {
    return {
      isUpgrade: false, crossesFamily: true,
      reason: "مرفوض: لا يجوز استخدام ladder الركاب لرحلة حمولة",
    };
  }

  // 2) Request vs candidate cross-family (independent of tripFamily).
  if (fromFam !== "unknown" && toFam !== "unknown" && fromFam !== toFam) {
    if (fromFam === "passenger") {
      return {
        isUpgrade: false, crossesFamily: true,
        reason: "مرفوض: لا يجوز استخدام ladder الحمولة لرحلة ركاب",
      };
    }
    return {
      isUpgrade: false, crossesFamily: true,
      reason: "مرفوض: لا يجوز استخدام ladder الركاب لرحلة حمولة",
    };
  }

  // 3) Within-family ladder. Only direction "higher than requested"
  //    counts as an upgrade for the agreement scorer's reward path.
  const ladder = toFam === "passenger" ? PASSENGER_LADDER
              : toFam === "cargo"     ? CARGO_LADDER
              : toFam === "equipment" ? EQUIPMENT_LADDER
              : null;
  if (!ladder) return { isUpgrade: false, crossesFamily: false, reason: null };

  const fi = ladder.indexOf(fromClass);
  const ti = ladder.indexOf(toClass);
  if (fi >= 0 && ti >= 0 && ti > fi) {
    const reason = toFam === "passenger"
      ? "تم توسيع الترشيح داخل عائلة الركاب لعدم توفر مطابقة دقيقة"
      : "تم ترشيح مركبة بسعة أعلى داخل عائلة الحمولة";
    return { isUpgrade: true, crossesFamily: false, reason };
  }

  return { isUpgrade: false, crossesFamily: false, reason: null };
}
