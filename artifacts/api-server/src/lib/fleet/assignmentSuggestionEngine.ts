/**
 * AssignmentSuggestionEngine (#1812).
 *
 * The user explicitly said: "النظام يقترح، يتحقق، ينبه" — the dispatcher
 * should NOT have to manually search for vehicles + drivers. Given a
 * booking line + a time window, this engine returns a ranked list of
 * (vehicle, driver) candidate pairs with a score in [0..100] and a
 * structured list of human-readable reasons.
 *
 * Scoring factors (each contributes a weighted score; final = weighted sum):
 *
 *   • capacity      — does the vehicle's payloadKg / seatCount cover demand?
 *                     (HARD if requestedExact + soft otherwise — see Comment 3)
 *   • availability  — is the vehicle in `available` status + not in maintenance?
 *   • conflict      — does the vehicle / driver have a colliding time window?
 *                     (HARD — overlapping = score 0 unless reschedulable)
 *   • driver_rest   — has the driver had ≥ restHoursRequired since lastDutyEndedAt?
 *                     (HARD unless overrideReason is later supplied at dispatch)
 *   • license       — does the driver's license class match the vehicle type?
 *                     (HARD via existing assertDriverEligibility on commit;
 *                      ranking penalises mismatches so they sink in the list)
 *   • distance      — kilometers from vehicle's last known location to the
 *                     booking pickup point (estimated via MapsService).
 *                     Closer is better; bounded.
 *   • agreement     — does the vehicle match requestedVehicleClass /
 *                     requiredExactVehicleId per the booking's
 *                     vehicleSubstitutionPolicy? Exact matches outrank
 *                     same_class, which outrank equivalent, which outrank
 *                     upgrades (only allowed when allowUpgrade or the
 *                     policy explicitly opts in).
 *
 * Returns 0..N candidates. The dispatcher picks one + presses "Assign";
 * the regular create-dispatch-order endpoint then re-runs the HARD
 * guards (eligibility + capacity + conflict + rest). This engine is
 * advisory + ordering only — never the authority.
 */

import { rawQuery } from "../rawdb.js";
import { MapsService, loadPlanningSettings } from "./mapsService.js";

export interface SuggestionRequest {
  companyId: number;
  branchId: number | null;
  bookingId: number;
  bookingLineId?: number;
  /** Override the booking's pickup window when the dispatcher is
   *  exploring a non-default slot. */
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  /** Max candidates to return (default 10). */
  limit?: number;
}

export interface SuggestionResult {
  vehicleId: number;
  vehiclePlate: string | null;
  vehicleType: string | null;
  driverId: number;
  driverName: string | null;
  score: number;
  /** Detailed sub-scores so the UI can show "why" the engine ranked
   *  this candidate first. */
  scores: {
    capacity: number;
    availability: number;
    conflict: number;
    driverRest: number;
    license: number;
    distance: number;
    agreement: number;
  };
  /** Arabic explanation strings — direct user-facing. */
  reasons: string[];
  /** Blocking issues (score 0 contributions). Surfaced in red — the
   *  dispatcher can still try to override but the regular guards will
   *  re-reject without an overrideReason. */
  blockers: string[];
  estimatedDistanceKm: number | null;
  /** Predicted vehicle utilisation if this assignment is committed
   *  (estimate based on existing same-day orders + this one). */
  predictedUtilisation?: number;
}

interface BookingRow {
  id: number;
  transportServiceType: string;
  passengerCount: number | null;
  cargoWeight: string | null;
  requestedVehicleClass: string | null;
  vehicleSubstitutionPolicy: string;
  allowUpgrade: boolean;
  requiredExactVehicleId: number | null;
  requiredExactDriverId: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  fixedAppointmentTime: string | null;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  priority: number;
}

interface VehicleRow {
  id: number;
  plateNumber: string | null;
  vehicleType: string | null;
  status: string;
  payloadKg: string | null;
  seatCount: number | null;
  lastLat: number | null;
  lastLng: number | null;
}

interface DriverRow {
  id: number;
  name: string | null;
  primaryVehicleId: number | null;
  restHoursRequired: number;
  lastDutyEndedAt: string | null;
  licenseClass: string | null;
  status: string;
}

interface ConflictRow {
  vehicleId: number;
  driverId: number;
}

// ── Vehicle-type ↔ required-class equivalence ────────────────────────
// Used by the agreement scorer when the booking declares a specific
// requestedVehicleClass. Anything not listed is treated as "exact_only".

const CLASS_EQUIVALENCES: Record<string, string[]> = {
  sedan:     ["sedan", "compact"],
  suv:       ["suv", "crossover"],
  van:       ["van", "minivan"],
  bus_22:    ["bus_22", "bus_29"],
  bus_29:    ["bus_29", "bus_45"],
  bus_45:    ["bus_45", "bus_50"],
  bus_50:    ["bus_50"],
  truck:     ["truck", "trailer"],
  trailer:   ["trailer", "truck"],
  pickup:    ["pickup", "van"],
};

// Higher class (for upgrade detection).
const UPGRADE_LADDER = [
  "compact", "sedan", "suv", "crossover",
  "van", "minivan", "pickup",
  "bus_22", "bus_29", "bus_45", "bus_50",
  "truck", "trailer",
];

function classesAreEquivalent(a: string, b: string): boolean {
  return a === b || (CLASS_EQUIVALENCES[a] ?? []).includes(b);
}

function isUpgrade(from: string, to: string): boolean {
  const fi = UPGRADE_LADDER.indexOf(from);
  const ti = UPGRADE_LADDER.indexOf(to);
  return fi >= 0 && ti >= 0 && ti > fi;
}

// ── Public API ───────────────────────────────────────────────────────

export async function suggestAssignments(
  req: SuggestionRequest,
): Promise<SuggestionResult[]> {
  // 1) Load the booking + new planning fields.
  const [booking] = await rawQuery<BookingRow>(
    `SELECT b.id,
            b."transportServiceType",
            b."passengerCount",
            b."cargoWeight",
            b."requestedVehicleClass",
            b."vehicleSubstitutionPolicy",
            b."allowUpgrade",
            b."requiredExactVehicleId",
            b."requiredExactDriverId",
            b."pickupWindowStart",
            b."pickupWindowEnd",
            b."fixedAppointmentTime",
            fl."latitude"  AS "fromLat",
            fl."longitude" AS "fromLng",
            tl."latitude"  AS "toLat",
            tl."longitude" AS "toLng",
            b.priority
       FROM transport_bookings b
            LEFT JOIN transport_locations fl ON fl.id = b."fromLocationId" AND fl."companyId" = b."companyId"
            LEFT JOIN transport_locations tl ON tl.id = b."toLocationId"   AND tl."companyId" = b."companyId"
      WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL`,
    [req.bookingId, req.companyId],
  );
  if (!booking) return [];

  const start = req.scheduledStartAt ?? booking.pickupWindowStart ?? booking.fixedAppointmentTime;
  const end   = req.scheduledEndAt   ?? booking.pickupWindowEnd   ?? booking.fixedAppointmentTime;
  if (!start || !end) return [];

  // 2) Load candidate vehicles. Pull `vehicle_location_snapshots`
  //    latest ping per vehicle as the proxy for "current location".
  const vehicles = await rawQuery<VehicleRow>(
    `SELECT v.id, v."plateNumber", v."vehicleType", v.status,
            v."payloadKg", v."seatCount",
            (
              SELECT s."latitude" FROM vehicle_location_snapshots s
               WHERE s."vehicleId" = v.id AND s."companyId" = v."companyId"
               ORDER BY s."capturedAt" DESC LIMIT 1
            ) AS "lastLat",
            (
              SELECT s."longitude" FROM vehicle_location_snapshots s
               WHERE s."vehicleId" = v.id AND s."companyId" = v."companyId"
               ORDER BY s."capturedAt" DESC LIMIT 1
            ) AS "lastLng"
       FROM fleet_vehicles v
      WHERE v."companyId" = $1
        AND v."deletedAt" IS NULL
        AND v.status IN ('available', 'in_use')
      LIMIT 200`,
    [req.companyId],
  );

  // 3) Load candidate drivers. The "primary vehicle" link is derived
  //    from fleet_vehicles.assignedDriverId — drivers are paired with
  //    a vehicle through that side of the relation.
  const drivers = await rawQuery<DriverRow>(
    `SELECT d.id, d.name,
            (
              SELECT v.id FROM fleet_vehicles v
               WHERE v."companyId" = d."companyId"
                 AND v."assignedDriverId" = d.id
                 AND v."deletedAt" IS NULL
               LIMIT 1
            ) AS "primaryVehicleId",
            COALESCE(d."restHoursRequired", 8)::float AS "restHoursRequired",
            d."lastDutyEndedAt",
            d."licenseClass",
            COALESCE(d.status, 'active') AS status
       FROM fleet_drivers d
      WHERE d."companyId" = $1
        AND d."deletedAt" IS NULL
        AND COALESCE(d.status, 'active') NOT IN ('inactive', 'terminated')
      LIMIT 200`,
    [req.companyId],
  );

  // 4) Conflict probe — every dispatch order in [start, end] overlap.
  const conflicts = await rawQuery<ConflictRow>(
    `SELECT "vehicleId", "driverId"
       FROM transport_dispatch_orders
      WHERE "companyId" = $1
        AND status NOT IN ('declined', 'cancelled')
        AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
            && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [req.companyId, start, end],
  );
  const conflictedVehicles = new Set(conflicts.map((c) => c.vehicleId));
  const conflictedDrivers  = new Set(conflicts.map((c) => c.driverId));

  // 5) Settings (for the manual maps haversine baseline).
  const settings = await loadPlanningSettings(req.companyId);

  // 6) Score every (vehicle, driver) pair.
  const results: SuggestionResult[] = [];
  const passengers = booking.passengerCount ?? 0;
  const cargoKg    = booking.cargoWeight ? Number(booking.cargoWeight) : 0;
  const isCargo    = booking.transportServiceType === "cargo_load";
  const isPax      = booking.transportServiceType.startsWith("passenger_");

  for (const v of vehicles) {
    // Hard filter: exact-required vehicle.
    if (booking.requiredExactVehicleId != null && v.id !== booking.requiredExactVehicleId) {
      continue;
    }

    for (const d of drivers) {
      if (booking.requiredExactDriverId != null && d.id !== booking.requiredExactDriverId) {
        continue;
      }

      const reasons: string[] = [];
      const blockers: string[] = [];

      // ─ capacity (weight 20) ─────────────────────────────────────
      let capacityScore = 100;
      if (isCargo) {
        const cap = v.payloadKg == null ? null : Number(v.payloadKg);
        if (cap == null) {
          capacityScore = 50;
          reasons.push("سعة المركبة غير معروفة — يرجى استكمال الملف الفني");
        } else if (cap < cargoKg) {
          capacityScore = 0;
          blockers.push(`الحمولة المطلوبة ${cargoKg} كجم تتجاوز سعة المركبة ${cap} كجم`);
        } else {
          // Reward when capacity is well-utilised but not over-spec.
          const fillRatio = cargoKg / cap;
          capacityScore = fillRatio < 0.2 ? 70 :
                          fillRatio > 0.95 ? 80 : 100;
          if (fillRatio >= 0.8 && fillRatio <= 0.95) {
            reasons.push("سعة المركبة مناسبة جداً للحمولة");
          }
        }
      } else if (isPax) {
        const seats = v.seatCount ?? null;
        if (seats == null) {
          capacityScore = 50;
          reasons.push("عدد المقاعد غير معروف — يرجى استكمال الملف الفني");
        } else if (seats < passengers) {
          capacityScore = 0;
          blockers.push(`عدد الركاب ${passengers} يتجاوز عدد المقاعد ${seats}`);
        } else {
          const fillRatio = seats > 0 ? passengers / seats : 0;
          capacityScore = fillRatio < 0.3 ? 60 :
                          fillRatio > 0.95 ? 80 : 100;
        }
      }

      // ─ availability (weight 10) ─────────────────────────────────
      let availabilityScore = v.status === "available" ? 100 : 60;
      if (v.status !== "available") {
        reasons.push(`حالة المركبة الحالية: ${v.status}`);
      }

      // ─ conflict (weight 25, hardest) ────────────────────────────
      let conflictScore = 100;
      if (conflictedVehicles.has(v.id)) {
        conflictScore = 0;
        blockers.push("تعارض زمني — المركبة محجوزة في الفترة المطلوبة");
      } else if (conflictedDrivers.has(d.id)) {
        conflictScore = 0;
        blockers.push("تعارض زمني — السائق مسند في الفترة المطلوبة");
      }

      // ─ driver_rest (weight 15) ───────────────────────────────────
      let restScore = 100;
      if (d.status === "on_leave") {
        restScore = 0;
        blockers.push("السائق في إجازة");
      } else if (d.lastDutyEndedAt) {
        const hoursSinceLastDuty =
          (new Date(start).getTime() - new Date(d.lastDutyEndedAt).getTime()) / 3_600_000;
        if (hoursSinceLastDuty < d.restHoursRequired) {
          restScore = 0;
          blockers.push(
            `لم يستوفِ السائق ساعات الراحة المطلوبة (${d.restHoursRequired} ساعة) — أمضى ${hoursSinceLastDuty.toFixed(1)} فقط`,
          );
        } else if (hoursSinceLastDuty < d.restHoursRequired + 2) {
          restScore = 80;
          reasons.push("استوفى السائق الراحة المطلوبة لكن بقرب الحد الأدنى");
        }
      }

      // ─ license (weight 10) ───────────────────────────────────────
      let licenseScore = 80;
      if (d.licenseClass && v.vehicleType) {
        // Pass-through; the strict assertDriverEligibility check fires
        // at commit. Ranking softens the score for likely mismatches.
        const heavyTypes = ["truck", "trailer", "bus_45", "bus_50"];
        if (heavyTypes.includes(v.vehicleType) &&
            !["heavy", "trailer", "bus"].some((c) => d.licenseClass!.includes(c))) {
          licenseScore = 30;
          reasons.push("قد يحتاج السائق ترخيصاً ثقيلاً — تحقق قبل الإسناد");
        } else {
          licenseScore = 100;
        }
      } else if (!d.licenseClass) {
        licenseScore = 60;
        reasons.push("صنف رخصة السائق غير مسجّل");
      }

      // ─ distance (weight 10) ──────────────────────────────────────
      let distanceScore = 50;
      let estimatedDistanceKm: number | null = null;
      if (v.lastLat != null && v.lastLng != null && booking.fromLat != null && booking.fromLng != null) {
        const route = await MapsService.estimateRoute({
          companyId: req.companyId,
          originLat: Number(v.lastLat),
          originLng: Number(v.lastLng),
          destinationLat: Number(booking.fromLat),
          destinationLng: Number(booking.fromLng),
        });
        estimatedDistanceKm = Math.round((route.distanceMeters / 1000) * 100) / 100;
        // 0 km → 100, 50 km → 50, ≥ 200 km → 10.
        distanceScore = estimatedDistanceKm <= 0   ? 100 :
                         estimatedDistanceKm <= 5   ? 95 :
                         estimatedDistanceKm <= 25  ? 80 :
                         estimatedDistanceKm <= 50  ? 60 :
                         estimatedDistanceKm <= 100 ? 40 :
                         estimatedDistanceKm <= 200 ? 25 : 10;
        if (distanceScore >= 80) {
          reasons.push(`المركبة قريبة (${estimatedDistanceKm} كم تقريباً)`);
        } else if (distanceScore <= 25) {
          reasons.push(`المركبة بعيدة (${estimatedDistanceKm} كم تقريباً)`);
        }
      } else {
        // Use the per-vehicle settings haversine fallback or skip silently.
        void settings;
      }

      // ─ agreement (weight 10) ─────────────────────────────────────
      let agreementScore = 80;
      if (booking.requestedVehicleClass && v.vehicleType) {
        if (v.vehicleType === booking.requestedVehicleClass) {
          agreementScore = 100;
          reasons.push("المركبة تطابق الفئة المطلوبة من العميل");
        } else if (classesAreEquivalent(booking.requestedVehicleClass, v.vehicleType)) {
          agreementScore = ["equivalent_allowed", "upgrade_allowed", "same_class_only"].includes(
            booking.vehicleSubstitutionPolicy,
          ) ? 85 : 30;
          if (agreementScore < 50) {
            blockers.push(`سياسة الاستبدال تمنع تغيير الفئة (${booking.vehicleSubstitutionPolicy})`);
          } else {
            reasons.push("المركبة تنتمي لفئة مكافئة للفئة المطلوبة");
          }
        } else if (isUpgrade(booking.requestedVehicleClass, v.vehicleType)) {
          if (booking.allowUpgrade || booking.vehicleSubstitutionPolicy === "upgrade_allowed") {
            agreementScore = 70;
            reasons.push("ترقية مسموحة على فئة المركبة");
          } else {
            agreementScore = 20;
            blockers.push("اتفاق العميل لا يسمح بترقية فئة المركبة");
          }
        } else {
          agreementScore = 15;
          blockers.push(`فئة المركبة (${v.vehicleType}) لا تطابق الفئة المطلوبة (${booking.requestedVehicleClass})`);
        }
      }

      // ─ Aggregate ─────────────────────────────────────────────────
      const finalScore = Math.round(
        capacityScore     * 0.20 +
        availabilityScore * 0.10 +
        conflictScore     * 0.25 +
        restScore         * 0.15 +
        licenseScore      * 0.10 +
        distanceScore     * 0.10 +
        agreementScore    * 0.10,
      );

      // Drop candidates with HARD blockers UNLESS the dispatcher
      // explicitly asks for "include with overrides". For now we
      // surface them at the bottom with score=0 so the operator sees
      // why and can produce an overrideReason.
      results.push({
        vehicleId: v.id,
        vehiclePlate: v.plateNumber,
        vehicleType: v.vehicleType,
        driverId: d.id,
        driverName: d.name,
        score: blockers.length > 0 ? 0 : finalScore,
        scores: {
          capacity: capacityScore,
          availability: availabilityScore,
          conflict: conflictScore,
          driverRest: restScore,
          license: licenseScore,
          distance: distanceScore,
          agreement: agreementScore,
        },
        reasons,
        blockers,
        estimatedDistanceKm,
      });
    }
  }

  // 7) Sort: best score first, then prefer primary-driver+vehicle pairs.
  const primaryPairs = new Set(
    drivers
      .filter((d) => d.primaryVehicleId != null)
      .map((d) => `${d.primaryVehicleId}|${d.id}`),
  );
  results.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const aPrimary = primaryPairs.has(`${a.vehicleId}|${a.driverId}`);
    const bPrimary = primaryPairs.has(`${b.vehicleId}|${b.driverId}`);
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
    return 0;
  });

  return results.slice(0, req.limit ?? 10);
}
