/**
 * VCM completeness — SPA mirror of the server's
 * `vehicleCapabilityMatrix.ts:SAFETY_FIELDS` calculation.
 *
 * #2079 TA-T18-05. The vehicle-detail VCM tab uses this to render a
 * Red / Amber / Green badge so the operator sees at-a-glance whether
 * a vehicle would pass Gate-PE-1's `VCM_MIN_COMPLETENESS` (70%) gate.
 *
 * IMPORTANT: this list MUST stay identical to the server's
 * `SAFETY_FIELDS` array. The parity test
 * `vcmCompletenessParityStatic.test.ts` parses both files and
 * compares the field sets — any drift fails the build.
 *
 * Why 11 fields and not 19?
 *   The server weighs eligibility on the SAFETY-relevant subset only
 *   (the ones that drive scoring + per-family eligibility). Cosmetic
 *   fields like `upholsteryType` / `screenCount` do NOT affect Gate
 *   passability, so they are excluded from the completeness number.
 *   The form still lets the operator EDIT all 19; the badge tracks
 *   the eligibility-relevant subset alone.
 */

export const VCM_SAFETY_FIELDS = [
  "vehicleType",
  "fuelType",
  "validForPassengers",
  "validForCargo",
  "payloadKg",
  "operationalPayloadKg",
  "seatCount",
  "axleCount",
  "tireCount",
  "engineDisplacementCc",
  "transmissionType",
] as const;

export const VCM_MIN_COMPLETENESS = 70;

export type VcmSafetyField = (typeof VCM_SAFETY_FIELDS)[number];

/**
 * Count how many safety fields are populated on the row and return
 * a 0..100 percentage that mirrors the server's rounding.
 *
 * NULL / undefined / "" all count as "missing" — same predicate the
 * server uses (`v !== null && v !== undefined && v !== ""`).
 */
export function computeVcmCompleteness(row: Record<string, unknown>): number {
  const populated = VCM_SAFETY_FIELDS.filter((f) => {
    const v = row[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((populated / VCM_SAFETY_FIELDS.length) * 100);
}

export type VcmTone = "red" | "amber" | "green";

/**
 * Tone bucket for the badge. The thresholds match the operator's
 * mental model from the audit ملف 20 §12: red = below the gate
 * (rejected by VCM eligibility); amber = passes the gate but the
 * profile is still thin; green = fully or near-fully profiled.
 */
export function vcmTone(pct: number): VcmTone {
  if (pct < VCM_MIN_COMPLETENESS) return "red";
  if (pct < 90) return "amber";
  return "green";
}
