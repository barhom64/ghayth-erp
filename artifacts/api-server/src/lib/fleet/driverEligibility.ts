/**
 * #1733 Phase 2 — driver license-class eligibility guard.
 *
 * Implements the matching driver-side acceptance scenario:
 *
 *   لا يمكن إسناد سائق غير مؤهل إلا باستثناء موثق
 *
 * Mirror of `assertVehicleCapacity` from Blocker #2. Same contract,
 * same four branches:
 *
 *   1. either side has a NULL profile → soft-allow + warning event
 *   2. driver's class covers the vehicle's required class → allow
 *   3. driver's class does not cover + no overrideReason → ValidationError
 *   4. driver's class does not cover + overrideReason → record the
 *      driver_eligibility_overrides row, emit exception event, allow
 *
 * The class hierarchy follows the KSA driving-licence stack:
 *
 *   heavy ⊇ medium ⊇ light_trans ⊇ private
 *
 * `public_trans` (buses), `motorcycle`, and `equipment` are
 * SEPARATE branches — a heavy-licence driver isn't automatically
 * qualified to drive a bus full of pilgrims unless they hold the
 * `public_trans` endorsement.
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { emitEvent } from "../businessHelpers.js";
import { ValidationError } from "../errorHandler.js";

export type LicenseClass =
  | "private"
  | "light_trans"
  | "medium"
  | "heavy"
  | "public_trans"
  | "motorcycle"
  | "equipment";

export type EligibilitySource = "cargo_manifest" | "fleet_trip" | "umrah_transport";

// Map: a driver holding the KEY class is qualified for any vehicle whose
// requiredLicenseClass is in the VALUE set. Branches that are NOT linearly
// ordered (bus / motorcycle / equipment) only cover themselves.
export const LICENSE_COVERS: Record<LicenseClass, LicenseClass[]> = {
  heavy:        ["heavy", "medium", "light_trans", "private"],
  medium:       ["medium", "light_trans", "private"],
  light_trans:  ["light_trans", "private"],
  private:      ["private"],
  public_trans: ["public_trans"],
  motorcycle:   ["motorcycle"],
  equipment:    ["equipment"],
};

export function driverCoversVehicle(
  driverClass: LicenseClass | null | undefined,
  vehicleRequired: LicenseClass | null | undefined,
): "unknown" | "covers" | "missing" {
  if (!driverClass || !vehicleRequired) return "unknown";
  const covered = LICENSE_COVERS[driverClass];
  if (!covered) return "missing";
  return covered.includes(vehicleRequired) ? "covers" : "missing";
}

interface EligibilityCheckInput {
  companyId: number;
  branchId: number | null;
  userId: number;
  driverId: number;
  vehicleId: number;
  sourceType: EligibilitySource;
  sourceId: number;
  overrideReason?: string | null;
}

export interface EligibilityCheckResult {
  ok: true;
  /** True when either side's licenseClass is NULL — caller proceeds but
   *  the operator should fill the profile. */
  unknown?: boolean;
  /** True when the assignment was accepted via a documented exception. */
  override?: boolean;
  driverClass?: LicenseClass | null;
  vehicleRequired?: LicenseClass | null;
}

export async function assertDriverEligibility(
  input: EligibilityCheckInput,
): Promise<EligibilityCheckResult> {
  const [pair] = await rawQuery<{
    driverClass: LicenseClass | null;
    vehicleRequired: LicenseClass | null;
  }>(
    `SELECT
       (SELECT "licenseClass"            FROM fleet_drivers  WHERE id = $1 AND "companyId" = $3 AND "deletedAt" IS NULL) AS "driverClass",
       (SELECT "requiredLicenseClass"    FROM fleet_vehicles WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL) AS "vehicleRequired"`,
    [input.driverId, input.vehicleId, input.companyId],
  );
  const driverClass = (pair?.driverClass ?? null) as LicenseClass | null;
  const vehicleRequired = (pair?.vehicleRequired ?? null) as LicenseClass | null;

  const status = driverCoversVehicle(driverClass, vehicleRequired);

  if (status === "unknown") {
    emitEvent({
      companyId: input.companyId,
      branchId: input.branchId ?? undefined,
      userId: input.userId,
      action: "fleet.driver.eligibility.unknown",
      entity: "fleet_drivers",
      entityId: input.driverId,
      details: JSON.stringify({
        driverClass,
        vehicleRequired,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      }),
    }).catch(() => undefined);
    return { ok: true, unknown: true, driverClass, vehicleRequired };
  }

  if (status === "covers") {
    return { ok: true, driverClass, vehicleRequired };
  }

  // Driver's class does not cover the vehicle's required class.
  if (!input.overrideReason || input.overrideReason.trim().length === 0) {
    throw new ValidationError(
      `السائق ليس مؤهلاً لقيادة هذه المركبة — رخصة السائق "${driverClass}"، الفئة المطلوبة "${vehicleRequired}".`,
      {
        field: "driverId",
        fix: `اختر سائقاً برخصة من فئة "${vehicleRequired}" أو أعلى، أو أرسل البند مع "overrideReason" يوضّح سبب الاستثناء.`,
      },
    );
  }

  await rawExecute(
    `INSERT INTO driver_eligibility_overrides (
       "companyId", "branchId",
       "driverId", "vehicleId",
       "sourceType", "sourceId",
       "driverLicenseClass", "vehicleRequiredClass",
       reason, "approvedBy"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING`,
    [
      input.companyId,
      input.branchId,
      input.driverId,
      input.vehicleId,
      input.sourceType,
      input.sourceId,
      driverClass,
      vehicleRequired,
      input.overrideReason.trim(),
      input.userId,
    ],
  );
  emitEvent({
    companyId: input.companyId,
    branchId: input.branchId ?? undefined,
    userId: input.userId,
    action: "fleet.driver.eligibility.exception",
    entity: "driver_eligibility_overrides",
    entityId: input.driverId,
    details: JSON.stringify({
      driverClass,
      vehicleRequired,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason: input.overrideReason.trim(),
    }),
  }).catch(() => undefined);

  return { ok: true, override: true, driverClass, vehicleRequired };
}
