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
import {
  computeVcm,
  effectiveCapacity,
  isEligibleForTripFamily,
  type TripFamily,
  type VehicleRowForVcm,
} from "./vehicleCapabilityMatrix.js";
import {
  checkVehicleDocumentReadiness,
  type MaintenanceBlock,
} from "./vehicleReadiness.js";
import {
  checkDriverDrivingCaps,
  checkDriverLeave,
  type DriverDrivingMinutes,
  type LeaveOverlap,
} from "./driverReadiness.js";

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

/** #1812 — internal criteria shared between booking-based and
 *  leg-based suggest entry points. Lets `suggestForCriteria` stay
 *  source-of-truth while public wrappers (`suggestAssignments`,
 *  `suggestForLeg`) load the row from either domain. */
export interface SuggestionCriteria {
  companyId: number;
  branchId: number | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  transportServiceType: string;          // routes capacity scorer
  passengerCount: number | null;
  cargoWeight: number | null;
  requestedVehicleClass: string | null;
  vehicleSubstitutionPolicy: string;
  allowUpgrade: boolean;
  requiredExactVehicleId: number | null;
  requiredExactDriverId: number | null;
  fromLat: number | null;
  fromLng: number | null;
  limit?: number;
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
  // #2079 Gate-PE-1 — VCM canon fields. Hydrated alongside the base
  // technical profile so `computeVcm` runs from a single row without a
  // second SELECT per vehicle.
  fuelType: string | null;
  operationalPayloadKg: string | null;
  operationalPassengerCapacity: string | null;
  boxLengthCm: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  axleCount: number | null;
  tireCount: number | null;
  tireSize: string | null;
  hasAc: boolean | null;
  screenCount: number | null;
  doorCount: number | null;
  upholsteryType: string | null;
  safetyFeatures: unknown;
  operatingHours: string | null;
  equipmentAttachments: unknown;
  engineDisplacementCc: number | null;
  transmissionType: string | null;
  validForPassengers: boolean | null;
  validForCargo: boolean | null;
  vehicleServiceTypes: string[] | null;
  // #2079 PE-02 — document expiry columns (already on fleet_vehicles).
  // Engine treats anything expiring BEFORE the booking window ends as
  // a hard blocker — see `checkVehicleDocumentReadiness`.
  registrationExpiry: string | null;
  insuranceExpiry: string | null;
  nextInspectionDate: string | null;
}

interface DriverRow {
  id: number;
  name: string | null;
  primaryVehicleId: number | null;
  restHoursRequired: number;
  lastDutyEndedAt: string | null;
  licenseClass: string | null;
  status: string;
  // #2079 PE-03 — driver readiness fields. employeeId is the join key
  // for hr_leave_requests; without it the leave gate is silently
  // skipped (legacy drivers not linked to an employee row).
  employeeId: number | null;
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

  return suggestForCriteria({
    companyId: req.companyId,
    branchId: req.branchId,
    scheduledStartAt: start,
    scheduledEndAt: end,
    transportServiceType: booking.transportServiceType,
    passengerCount: booking.passengerCount,
    cargoWeight: booking.cargoWeight ? Number(booking.cargoWeight) : null,
    requestedVehicleClass: booking.requestedVehicleClass,
    vehicleSubstitutionPolicy: booking.vehicleSubstitutionPolicy,
    allowUpgrade: booking.allowUpgrade,
    requiredExactVehicleId: booking.requiredExactVehicleId,
    requiredExactDriverId: booking.requiredExactDriverId,
    fromLat: booking.fromLat,
    fromLng: booking.fromLng,
    limit: req.limit,
  });
}

/**
 * #1812 — Same engine, leg-based entry. The user-facing "اقترح المركبة
 * والسائق" button on each itinerary leg routes here so the operator
 * can sequence a chained trip (مكة → المدينة → ...) without leaving
 * the itinerary detail. Updates only the leg's assignedVehicleId/
 * DriverId — does NOT create a dispatch order (that happens when the
 * leg gets materialized into bookings, which is a separate flow).
 */
export async function suggestForLeg(
  companyId: number,
  legId: number,
  options?: { limit?: number },
): Promise<SuggestionResult[]> {
  const [leg] = await rawQuery<{
    id: number;
    transportServiceType: string;
    requiredVehicleClass: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    pickupWindowStart: string | null;
    pickupWindowEnd: string | null;
    fromLat: number | null;
    fromLng: number | null;
  }>(
    `SELECT l.id,
            i."transportServiceType",
            l."requiredVehicleClass",
            l."scheduledStart",
            l."scheduledEnd",
            l."pickupWindowStart",
            l."pickupWindowEnd",
            fl."latitude"  AS "fromLat",
            fl."longitude" AS "fromLng"
       FROM transport_itinerary_legs l
            JOIN transport_itineraries i ON i.id = l."itineraryId" AND i."companyId" = l."companyId"
            LEFT JOIN transport_locations fl ON fl.id = l."originLocationId" AND fl."companyId" = l."companyId"
      WHERE l.id = $1 AND l."companyId" = $2`,
    [legId, companyId],
  );
  if (!leg) return [];

  const start = leg.scheduledStart ?? leg.pickupWindowStart;
  const end   = leg.scheduledEnd   ?? leg.pickupWindowEnd;
  if (!start || !end) return [];

  return suggestForCriteria({
    companyId,
    branchId: null,
    scheduledStartAt: start,
    scheduledEndAt: end,
    transportServiceType: leg.transportServiceType,
    passengerCount: null,
    cargoWeight: null,
    requestedVehicleClass: leg.requiredVehicleClass,
    // Itinerary legs default to "equivalent_allowed" — the customer's
    // substitution policy lives on the source booking, not the leg.
    vehicleSubstitutionPolicy: "equivalent_allowed",
    allowUpgrade: false,
    requiredExactVehicleId: null,
    requiredExactDriverId: null,
    fromLat: leg.fromLat,
    fromLng: leg.fromLng,
    limit: options?.limit,
  });
}

/** The actual engine: load candidates + score against criteria. */
async function suggestForCriteria(c: SuggestionCriteria): Promise<SuggestionResult[]> {
  const start = c.scheduledStartAt;
  const end = c.scheduledEndAt;
  // Synthetic "booking-like" record so the existing scoring loop is
  // 100% unchanged below — just consumed via this binding.
  const booking = {
    transportServiceType: c.transportServiceType,
    passengerCount: c.passengerCount,
    cargoWeight: c.cargoWeight,
    requestedVehicleClass: c.requestedVehicleClass,
    vehicleSubstitutionPolicy: c.vehicleSubstitutionPolicy,
    allowUpgrade: c.allowUpgrade,
    requiredExactVehicleId: c.requiredExactVehicleId,
    requiredExactDriverId: c.requiredExactDriverId,
    fromLat: c.fromLat,
    fromLng: c.fromLng,
  };
  const req = { companyId: c.companyId, branchId: c.branchId, limit: c.limit };

  // 2) Load candidate vehicles. Pull `vehicle_location_snapshots`
  //    latest ping per vehicle as the proxy for "current location".
  const vehicles = await rawQuery<VehicleRow>(
    `SELECT v.id, v."plateNumber", v."vehicleType", v.status,
            v."payloadKg", v."seatCount",
            v."fuelType",
            v."operationalPayloadKg",
            v."operationalPassengerCapacity",
            v."boxLengthCm", v."boxWidthCm", v."boxHeightCm",
            v."axleCount", v."tireCount", v."tireSize",
            v."hasAc", v."screenCount", v."doorCount",
            v."upholsteryType", v."safetyFeatures",
            v."operatingHours", v."equipmentAttachments",
            v."engineDisplacementCc", v."transmissionType",
            v."validForPassengers", v."validForCargo",
            v."vehicleServiceTypes",
            v."registrationExpiry", v."insuranceExpiry", v."nextInspectionDate",
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
            COALESCE(d.status, 'active') AS status,
            d."employeeId"
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

  // 4b) #2079 PE-02 — maintenance window probe. A vehicle in
  // 'scheduled' or 'in_progress' maintenance whose serviceDate falls
  // INSIDE the booking window (treated as a same-day event) is hard-
  // ejected. Reason is built in vehicleReadiness so the wording stays
  // out of the engine and out of the user-facing PR diff.
  const maintenanceHits = await rawQuery<MaintenanceBlock>(
    `SELECT m."vehicleId",
            m.type           AS "maintenanceType",
            m."serviceDate",
            m."nextServiceDate",
            m.status
       FROM fleet_maintenance m
      WHERE m."companyId" = $1
        AND m.status IN ('scheduled', 'in_progress')
        AND m."serviceDate" IS NOT NULL
        AND m."serviceDate" >= $2::date - INTERVAL '1 day'
        AND m."serviceDate" <= $3::date + INTERVAL '1 day'`,
    [req.companyId, start, end],
  );
  const maintenanceByVehicleId = new Map<number, MaintenanceBlock>();
  for (const hit of maintenanceHits) {
    if (!maintenanceByVehicleId.has(hit.vehicleId)) {
      maintenanceByVehicleId.set(hit.vehicleId, hit);
    }
  }

  // 4c) #2079 PE-03 — approved leave overlap probe. Drivers whose
  // employee row has a non-deleted approved leave that overlaps the
  // booking window get hard-ejected before scoring. Pending leaves
  // are intentionally ignored — operators can still plan around them
  // and approve/reject after the fact.
  const leaveRows = await rawQuery<LeaveOverlap>(
    `SELECT lr."employeeId",
            to_char(lr."startDate", 'YYYY-MM-DD') AS "startDate",
            to_char(lr."endDate",   'YYYY-MM-DD') AS "endDate",
            lt.name AS "leaveType"
       FROM hr_leave_requests lr
            LEFT JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
      WHERE lr."companyId" = $1
        AND lr."deletedAt" IS NULL
        AND lr.status = 'approved'
        AND lr."startDate" <= $3::date
        AND lr."endDate"   >= $2::date`,
    [req.companyId, start, end],
  );
  const leaveByEmployeeId = new Map<number, LeaveOverlap>();
  for (const lv of leaveRows) {
    if (!leaveByEmployeeId.has(lv.employeeId)) {
      leaveByEmployeeId.set(lv.employeeId, lv);
    }
  }

  // 4d) #2079 PE-03 — daily / weekly driving-minute probe. One SQL
  // query per suggest call, two SUMs against `transport_dispatch_orders`
  // for every driver, then the cap is enforced in the loop via
  // `checkDriverDrivingCaps`. The trailing windows are anchored on the
  // booking START so a future booking on a quiet driver still benefits
  // from their idle time before the planned trip.
  const minutesRows = await rawQuery<{
    driverId: number;
    daily: string;
    weekly: string;
  }>(
    `SELECT "driverId",
            COALESCE(SUM(
              EXTRACT(EPOCH FROM ("scheduledEndAt" - "scheduledStartAt")) / 60
            ) FILTER (
              WHERE "scheduledStartAt" >= $2::timestamptz - INTERVAL '24 hours'
                AND "scheduledStartAt" <  $2::timestamptz
            ), 0)::int AS daily,
            COALESCE(SUM(
              EXTRACT(EPOCH FROM ("scheduledEndAt" - "scheduledStartAt")) / 60
            ) FILTER (
              WHERE "scheduledStartAt" >= $2::timestamptz - INTERVAL '7 days'
                AND "scheduledStartAt" <  $2::timestamptz
            ), 0)::int AS weekly
       FROM transport_dispatch_orders
      WHERE "companyId" = $1
        AND status NOT IN ('declined', 'cancelled')
      GROUP BY "driverId"`,
    [req.companyId, start],
  );
  const drivingMinutesByDriverId = new Map<number, DriverDrivingMinutes>();
  for (const r of minutesRows) {
    drivingMinutesByDriverId.set(r.driverId, {
      daily:  Number(r.daily)  || 0,
      weekly: Number(r.weekly) || 0,
    });
  }

  // 5) Settings (for the manual maps haversine baseline).
  const settings = await loadPlanningSettings(req.companyId);

  // #2079 PE-03 — load driving caps from per-company settings. The
  // 780/3600 defaults match what migration 325 applies on every row
  // (13h / day, 60h / week). One row per company, so this is a fast
  // PK lookup. Falling back to industry defaults when the row is
  // missing keeps the suggest path resilient on fresh tenants.
  const [capsRow] = await rawQuery<{
    dailyMinutes: number;
    weeklyMinutes: number;
  }>(
    `SELECT "defaultMaxDailyDrivingMinutes"  AS "dailyMinutes",
            "defaultMaxWeeklyDrivingMinutes" AS "weeklyMinutes"
       FROM transport_planning_settings
      WHERE "companyId" = $1`,
    [req.companyId],
  );
  const drivingCaps = {
    dailyMinutes:  capsRow?.dailyMinutes  ?? 780,
    weeklyMinutes: capsRow?.weeklyMinutes ?? 3600,
  };
  // Estimated trip duration in minutes. Used for the projected sum
  // against the caps — chaining a 5h trip onto a driver who has
  // already done 9h triggers the daily ejection.
  const tripDurationMinutes = Math.max(
    1,
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 60_000,
    ),
  );

  // 6) Score every (vehicle, driver) pair.
  const results: SuggestionResult[] = [];
  const passengers = booking.passengerCount ?? 0;
  const cargoKg    = booking.cargoWeight ? Number(booking.cargoWeight) : 0;
  const isCargo    = booking.transportServiceType === "cargo_load";
  const isPax      = booking.transportServiceType.startsWith("passenger_");

  // #2079 Gate-PE-1 — Vehicle Capability Matrix. Compute the matrix
  // once per candidate and hard-eject vehicles whose profile (a) is
  // too sparse to trust, (b) marks them ineligible for the trip
  // family, or (c) doesn't list this serviceType. This stops the
  // owner's failing scenarios at the gate: a cargo-only trailer is
  // never shown for a passenger_umrah booking, and a 30t-safe truck
  // is never shown for a 38t haul (the safer comparison happens in
  // the capacity scorer below via `effectiveCapacity`).
  const tripFamily: TripFamily | null = isCargo ? "cargo" : isPax ? "passenger" : null;
  const vcmByVehicleId = new Map<number, ReturnType<typeof computeVcm>>();
  const eligibleVehicles: VehicleRow[] = [];
  for (const v of vehicles) {
    const vcm = computeVcm(v as unknown as VehicleRowForVcm);
    vcmByVehicleId.set(v.id, vcm);
    if (tripFamily) {
      const verdict = isEligibleForTripFamily(vcm, tripFamily, booking.transportServiceType);
      if (!verdict.eligible) continue;
    }
    // #2079 PE-02 — vehicle readiness gate. Document-expiry and
    // active-maintenance ejections fire BEFORE scoring so the
    // dispatcher never sees a candidate they would have to reject
    // for paperwork or workshop reasons.
    const readiness = checkVehicleDocumentReadiness(v, end);
    if (readiness.blocked) continue;
    if (maintenanceByVehicleId.has(v.id)) continue;
    eligibleVehicles.push(v);
  }

  // #2079 PE-03 — driver pre-elimination mirroring the vehicle gate.
  // Drivers in approved leave during the window, or who would exceed
  // a driving cap with this trip, never enter the scoring loop. Result:
  // the (vehicle × driver) pair count drops to (eligible × eligible)
  // and the dispatcher never sees an unactionable candidate.
  const eligibleDrivers: DriverRow[] = [];
  for (const d of drivers) {
    const leaveVerdict = checkDriverLeave(d.employeeId, leaveByEmployeeId);
    if (leaveVerdict.blocked) continue;
    const capVerdict = checkDriverDrivingCaps(
      drivingMinutesByDriverId.get(d.id) ?? null,
      tripDurationMinutes,
      drivingCaps,
    );
    if (capVerdict.blocked) continue;
    eligibleDrivers.push(d);
  }

  for (const v of eligibleVehicles) {
    // Hard filter: exact-required vehicle.
    if (booking.requiredExactVehicleId != null && v.id !== booking.requiredExactVehicleId) {
      continue;
    }
    const vcm = vcmByVehicleId.get(v.id)!;

    for (const d of eligibleDrivers) {
      if (booking.requiredExactDriverId != null && d.id !== booking.requiredExactDriverId) {
        continue;
      }

      const reasons: string[] = [];
      const blockers: string[] = [];

      // ─ capacity (weight 20) ─────────────────────────────────────
      //
      // #2079 Gate-PE-1 — compare against the OPERATIONAL ceiling
      // (operationalPayloadKg / operationalPassengerCapacity) not
      // the nominal one. When the request falls between the
      // operational cap and the nominal cap we score 60 + soft
      // reason (the dispatcher CAN proceed with a documented
      // override) but never auto-block on the legal ceiling alone.
      let capacityScore = 100;
      if (isCargo) {
        const { effective, nominal } = effectiveCapacity(vcm, "cargo");
        if (effective == null) {
          capacityScore = 50;
          reasons.push("سعة المركبة غير معروفة — يرجى استكمال الملف الفني");
        } else if (effective < cargoKg) {
          if (nominal != null && nominal >= cargoKg) {
            capacityScore = 60;
            reasons.push(
              `الحمولة (${cargoKg} كجم) ضمن السقف القانوني (${nominal}) لكنها تتجاوز الحمولة التشغيلية الآمنة (${effective})`,
            );
          } else {
            capacityScore = 0;
            blockers.push(`الحمولة المطلوبة ${cargoKg} كجم تتجاوز سعة المركبة ${effective} كجم`);
          }
        } else {
          // Reward when capacity is well-utilised but not over-spec.
          const fillRatio = cargoKg / effective;
          capacityScore = fillRatio < 0.2 ? 70 :
                          fillRatio > 0.95 ? 80 : 100;
          if (fillRatio >= 0.8 && fillRatio <= 0.95) {
            reasons.push("سعة المركبة مناسبة جداً للحمولة");
          }
        }
      } else if (isPax) {
        const { effective, nominal } = effectiveCapacity(vcm, "passenger");
        if (effective == null) {
          capacityScore = 50;
          reasons.push("عدد المقاعد غير معروف — يرجى استكمال الملف الفني");
        } else if (effective < passengers) {
          if (nominal != null && nominal >= passengers) {
            capacityScore = 60;
            reasons.push(
              `عدد الركاب (${passengers}) ضمن سقف المقاعد (${nominal}) لكنه يتجاوز السعة التشغيلية (${effective})`,
            );
          } else {
            capacityScore = 0;
            blockers.push(`عدد الركاب ${passengers} يتجاوز عدد المقاعد ${effective}`);
          }
        } else {
          const fillRatio = effective > 0 ? passengers / effective : 0;
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
