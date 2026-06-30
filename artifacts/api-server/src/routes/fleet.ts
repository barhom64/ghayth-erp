import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { requestIdempotencyToken, markIdempotencyReplay } from "../lib/requestIdempotency.js";
import { cascadeDispatchToBooking } from "../lib/transportDispatchCascade.js";
import { logger } from "../lib/logger.js";
import { registerEntityParty } from "../lib/partyService.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { hashPassword } from "../lib/auth.js";
import { issueNumber, voidNumber } from "../lib/numberingService.js";
import { haversineKm } from "../lib/algorithms.js";
import { createAuditLog, createNotification, emitEvent, todayISO, currentYear, toDateISO, roundTo2, currentDateInTz } from "../lib/businessHelpers.js";
import { sendMessage } from "../lib/messageSender.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { getVehicleStatusImpact } from "../lib/impactPreview.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { registerObligation, markObligationMet, cancelObligation } from "../lib/obligationsEngine.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { ensureCostCenterForEntity } from "../lib/costCenterAutoCreate.js";
import { fleetEngine, hrEngine } from "../lib/engines/index.js";
import {
  computeDriverReputation,
  loadDriverReputation,
  recomputeAllDrivers,
} from "../lib/fleet/driverReputation.js";
import { z } from "zod";
import { zCoerceBoolean } from "../lib/zodCoerce.js";

// ─── Zod schemas for POST route body validation ─────────────────────────────

// #1733 Phase 2 — KSA-aligned license-class enum used by the
// eligibility helper (lib/fleet/driverEligibility.ts). The driver row
// carries `licenseClass`; the vehicle row carries `requiredLicenseClass`;
// the helper enforces hierarchy + override rules at cargo/umrah
// assignment time.
const LICENSE_CLASS_VALUES = [
  "private", "light_trans", "medium", "heavy",
  "public_trans", "motorcycle", "equipment",
] as const;

// #1733 Blocker #2 — vehicle technical profile.
// Optional everywhere: the field set is large and most callers fill it
// in incrementally (operator creates a stub, mechanic finishes the
// profile). The capacity validator treats NULL as "unknown" — no hard
// block, soft warning — so legacy vehicles keep working.
const vehicleTechnicalProfileSchema = z.object({
  vehicleType: z.enum(["truck", "bus", "van", "pickup", "sedan", "trailer", "equipment"]).optional(),
  payloadKg: z.coerce.number().nonnegative().optional(),
  boxLengthCm: z.coerce.number().int().nonnegative().optional(),
  boxWidthCm: z.coerce.number().int().nonnegative().optional(),
  boxHeightCm: z.coerce.number().int().nonnegative().optional(),
  axleCount: z.coerce.number().int().positive().optional(),
  tireCount: z.coerce.number().int().positive().optional(),
  tireSize: z.string().max(50).optional(),
  engineDisplacementCc: z.coerce.number().int().positive().optional(),
  transmissionType: z.enum(["manual", "automatic", "amt", "cvt"]).optional(),
  seatCount: z.coerce.number().int().positive().optional(),
  hasAc: z.boolean().optional(),
  screenCount: z.coerce.number().int().nonnegative().optional(),
  doorCount: z.coerce.number().int().positive().optional(),
  upholsteryType: z.enum(["fabric", "leather", "premium"]).optional(),
  safetyFeatures: z.array(z.string()).optional(),
  operatingHours: z.coerce.number().nonnegative().optional(),
  equipmentAttachments: z.array(z.string()).optional(),
  // #1812 Wave 0.3 — assignment-decision fields (migration 284). The
  // canonical filter the assignment engine uses to decide which
  // vehicles can serve a passenger booking vs a cargo booking, and
  // what payload the dispatcher should actually quote (operational
  // payload sits below technical payloadKg for a safety margin).
  operationalPayloadKg: z.coerce.number().nonnegative().optional(),
  validForPassengers: z.boolean().optional(),
  validForCargo: z.boolean().optional(),
  // #2079 Gate-PE-1 — Vehicle Capability Matrix canon (migration 315).
  // operationalPassengerCapacity mirrors operationalPayloadKg for the
  // passenger family: a "safe operating" pax count distinct from the
  // nominal seatCount. vehicleServiceTypes is the explicit allow-list
  // of transportServiceType values this vehicle may serve — the engine
  // hard-ejects vehicles outside the list before scoring.
  operationalPassengerCapacity: z.coerce.number().nonnegative().optional(),
  vehicleServiceTypes: z.array(z.enum([
    "cargo_load",
    "passenger_umrah",
    "passenger_general",
    "equipment_rental",
    "internal_transfer",
    "other",
  ])).optional(),
});

// #1733 Pricing tier (Issue Comment 3) — driverServiceProfile extends
// the #1761 licence-class guard with a service-type specialisation.
// A driver might hold the right class for a bus but only be trained
// for cargo runs; the dispatch board filters accordingly.
const DRIVER_SERVICE_PROFILES = [
  "cargo_driver", "umrah_driver", "passenger_driver", "rental_driver", "mixed",
] as const;

// #1812 — KSA license-origin alphabet. Tightens the previously freeform
// `licenseType` text column into the four canonical values used by the
// KSA traffic department.
const LICENSE_ORIGIN_VALUES = [
  "saudi", "gcc", "international", "temporary",
] as const;

const createVehicleSchema = z.object({
  plateNumber: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().optional(),
  fuelType: z.enum(["gasoline", "diesel", "electric", "hybrid", "lpg"]).optional(),
  color: z.string().optional(),
  vinNumber: z.string().optional(),
  currentMileage: z.coerce.number().optional(),
  fuelCapacity: z.coerce.number().optional(),
  status: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  registrationExpiry: z.string().optional(),
  notes: z.string().optional(),
  registrationNumber: z.string().optional(),
  plateType: z.string().optional(),
  sequenceNumber: z.string().optional(),
  inspectionDate: z.string().optional(),
  nextInspectionDate: z.string().optional(),
  // FLT-003 — purchase data drives the TCO report and the vehicle-asset
  // capitalisation entry (postVehicleAssetGL); without these the schema
  // stripped the fields and both were dead.
  purchasePrice: z.coerce.number().nonnegative().optional(),
  purchaseDate: z.string().optional(),
  // #1733 Phase 2 — eligibility guard reads this column on cargo /
  // umrah assignment to refuse drivers who don't hold (or cover) the
  // required class.
  requiredLicenseClass: z.enum(LICENSE_CLASS_VALUES).optional(),
}).merge(vehicleTechnicalProfileSchema);

const createDriverSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  licenseType: z.string().optional(),
  licenseClass: z.enum(LICENSE_CLASS_VALUES).optional(),
  // #1812 — KSA driver identity fields (user's operational review).
  // The app layer enforces "saudi → nationalId required" and
  // "non-saudi → iqamaNumber required"; both columns are nullable
  // at the DB level so legacy rows stay valid.
  nationalId: z.string().regex(/^\d{10}$/, "الهوية الوطنية يجب أن تكون 10 أرقام").optional(),
  iqamaNumber: z.string().regex(/^\d{10}$/, "رقم الإقامة يجب أن يكون 10 أرقام").optional(),
  licenseIssueDate: z.string().optional(),
  licenseIssuingAuthority: z.string().max(255).optional(),
  licenseOrigin: z.enum(LICENSE_ORIGIN_VALUES).optional(),
  // #1733 Pricing tier — service-type specialisation. Used by the
  // dispatch board to surface only drivers whose profile matches the
  // booking's transportServiceType.
  driverServiceProfile: z.enum(DRIVER_SERVICE_PROFILES).optional(),
  employeeId: z.coerce.number().optional(),
  status: z.string().optional(),
}).refine(
  (d) => {
    // Saudi origin → must carry nationalId.
    // Non-Saudi origin (gcc / international / temporary) → must carry iqamaNumber.
    if (!d.licenseOrigin) return true; // legacy / not yet specified
    if (d.licenseOrigin === "saudi") return !!d.nationalId;
    // Non-Saudi must carry both an iqama AND a real license number
    // (Saudi licenses use the national ID, so licenseNumber is optional there).
    return !!d.iqamaNumber && !!d.licenseNumber;
  },
  (d) => ({
    message: d.licenseOrigin === "saudi"
      ? "الرخصة سعودية — رقم الهوية الوطنية مطلوب"
      : !d.iqamaNumber
      ? "السائق غير سعودي — رقم الإقامة مطلوب"
      : "السائق غير سعودي — رقم الرخصة مطلوب",
    path: d.licenseOrigin === "saudi"
      ? ["nationalId"]
      : !d.iqamaNumber ? ["iqamaNumber"] : ["licenseNumber"],
  }),
);

const createMaintenanceSchema = z.object({
  vehicleId: z.coerce.number({ required_error: "المركبة مطلوبة" }),
  type: z.string().min(1, "نوع الصيانة مطلوب"),
  description: z.string().min(1, "وصف الصيانة مطلوب"),
  cost: z.coerce.number().min(0).optional(),
  mileageAtService: z.coerce.number().optional(),
  serviceDate: z.string().optional(),
  nextServiceDate: z.string().optional(),
  nextServiceKm: z.coerce.number().optional(),
  performedBy: z.string().optional(),
  supplierId: z.coerce.number().optional(),
  unregisteredSupplierName: z.string().optional(),
  status: z.string().optional(),
});

const createFuelLogSchema = z.object({
  vehicleId: z.coerce.number().optional(),
  vehiclePlate: z.string().optional(),
  liters: z.coerce.number().positive("كمية الوقود يجب أن تكون أكبر من صفر"),
  driverId: z.coerce.number().optional(),
  costPerLiter: z.coerce.number().nonnegative().optional(),
  fuelDate: z.string().optional(),
  mileageAtFuel: z.coerce.number().optional(),
  stationName: z.string().optional(),
  fuelType: z.string().optional(),
  // M7 fix: optional link back to the trip the fuel was burned on.
  // When set, /trips/:id/complete will sum these actual costs instead
  // of using the estimate, avoiding double-counting fuel expense in
  // the GL.
  tripId: z.coerce.number().optional(),
});

const createInsuranceSchema = z.object({
  vehicleId: z.coerce.number({ required_error: "المركبة مطلوبة" }),
  provider: z.string().min(1, "شركة التأمين مطلوبة"),
  startDate: z.string().min(1, "تاريخ بداية الوثيقة مطلوب"),
  endDate: z.string().min(1, "تاريخ انتهاء الوثيقة مطلوب"),
  type: z.string().optional(),
  policyNumber: z.string().optional(),
  premium: z.coerce.number().optional(),
  coverageAmount: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

// ─── Zod schemas for PATCH / action route body validation ──────────────────
export const updateVehicleSchema = z.object({
  plateNumber: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().optional(),
  color: z.string().optional(),
  status: z.string().optional(),
  fuelType: z.enum(["gasoline", "diesel", "electric", "hybrid", "lpg"]).optional(),
  notes: z.string().optional(),
  assignedDriverId: z.coerce.number().nullable().optional(),
  registrationNumber: z.string().optional(),
  registrationExpiry: z.string().optional(),
  inspectionDate: z.string().optional(),
  nextInspectionDate: z.string().optional(),
  plateType: z.string().optional(),
  sequenceNumber: z.string().optional(),
  vinNumber: z.string().optional(),
  // #1733 Phase 2 — PATCHable so operators can set / change the
  // required class without re-creating the vehicle row.
  requiredLicenseClass: z.enum(LICENSE_CLASS_VALUES).optional(),
}).merge(vehicleTechnicalProfileSchema);

const updateDriverSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  status: z.string().optional(),
  licenseType: z.string().optional(),
  licenseClass: z.enum(LICENSE_CLASS_VALUES).optional(),
  // #1812 KSA identity (same alphabet as create).
  nationalId: z.string().regex(/^\d{10}$/, "الهوية الوطنية يجب أن تكون 10 أرقام").optional(),
  iqamaNumber: z.string().regex(/^\d{10}$/, "رقم الإقامة يجب أن يكون 10 أرقام").optional(),
  licenseIssueDate: z.string().optional(),
  licenseIssuingAuthority: z.string().max(255).optional(),
  licenseOrigin: z.enum(LICENSE_ORIGIN_VALUES).optional(),
  driverServiceProfile: z.enum(DRIVER_SERVICE_PROFILES).optional(),
});

const createTripSchema = z.object({
  // #2079 TA-T18-14 (RM-02 a+b) — every new fleet_trips row must be
  // anchored to a parent transport_dispatch_orders entry. This
  // closes the back-door the audit flagged: previously the POST
  // accepted free-form trip data with no source, which made
  // trips that bypassed VCM / Vehicle Readiness / Driver Readiness
  // entirely. Required + positive — the handler then verifies the
  // order actually exists for the caller's company.
  dispatchOrderId: z.coerce.number({
    required_error: "رقم أمر التوزيع مطلوب — الرحلات تُنشأ فقط من خط الإسناد",
  }).int().positive(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  clientId: z.coerce.number().optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  fromLat: z.coerce.number().optional(),
  fromLng: z.coerce.number().optional(),
  toLat: z.coerce.number().optional(),
  toLng: z.coerce.number().optional(),
  distance: z.coerce.number().nonnegative("المسافة يجب ألا تكون سالبة").optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  fuelPricePerLiter: z.coerce.number().nonnegative().optional(),
  driverFare: z.coerce.number().optional(),
  cost: z.coerce.number().nonnegative().optional(),
  status: z.string().optional(),
});

const completeTripSchema = z.object({
  endMileage: z.coerce.number().optional(),
  startMileage: z.coerce.number().optional(),
  fuelPricePerLiter: z.coerce.number().nonnegative().optional(),
  driverFare: z.coerce.number().optional(),
});

const cancelTripSchema = z.object({
  reason: z.string().optional(),
});

const completeMaintenanceSchema = z.object({
  cost: z.coerce.number().nonnegative().optional(),
  // البند ٤ ج-٥ — مَن يتحمّل الصيانة (يلتقطه المُكمِل ويُحمَل على ترشيح المحاسب كافتراض).
  costBearer: z.enum(["company", "driver", "insurance", "warranty", "customer", "tenant", "third_party"]).optional(),
});

const updateTripSchema = z.object({
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  destination: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  cost: z.coerce.number().nonnegative().optional(),
});

const updateMaintenanceSchema = z.object({
  description: z.string().optional(),
  status: z.string().optional(),
  cost: z.coerce.number().nonnegative().optional(),
});

const updateFuelLogSchema = z.object({
  liters: z.coerce.number().optional(),
  quantity: z.coerce.number().optional(),
  costPerLiter: z.coerce.number().nonnegative().optional(),
  totalCost: z.coerce.number().nonnegative().optional(),
  stationName: z.string().optional(),
});

const updateInsuranceSchema = z.object({
  provider: z.string().optional(),
  policyNumber: z.string().optional(),
  premium: z.coerce.number().optional(),
  endDate: z.string().optional(),
});

const createPreventivePlanSchema = z.object({
  vehicleId: z.coerce.number({ required_error: "المركبة مطلوبة" }),
  serviceType: z.string().min(1, "نوع الخدمة مطلوب"),
  intervalKm: z.coerce.number().optional(),
  intervalDays: z.coerce.number().optional(),
  lastServiceDate: z.string().optional(),
  lastServiceMileage: z.coerce.number().optional(),
  nextServiceDate: z.string().optional(),
  nextServiceMileage: z.coerce.number().optional(),
  estimatedCost: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const updatePreventivePlanSchema = z.object({
  nextServiceDate: z.string().optional(),
  nextServiceMileage: z.coerce.number().optional(),
  lastServiceDate: z.string().optional(),
  lastServiceMileage: z.coerce.number().optional(),
  estimatedCost: z.coerce.number().nonnegative().optional(),
  status: z.string().optional(),
  partsUsed: z.array(z.any()).optional(),
});

const createWaypointSchema = z.object({
  lat: z.coerce.number().optional(),
  latitude: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  speed: z.coerce.number().optional(),
});

const cancelMaintenanceSchema = z.object({
  reason: z.string().min(1, "سبب الإلغاء مطلوب"),
});

const createTrafficViolationSchema = z.object({
  vehicleId: z.coerce.number({ required_error: "المركبة مطلوبة" }),
  driverId: z.coerce.number().optional(),
  violationType: z.string().min(1, "نوع المخالفة مطلوب"),
  violationDate: z.string().optional(),
  fineAmount: z.coerce.number().optional(),
  location: z.string().optional(),
  violationNumber: z.string().optional(),
  notes: z.string().optional(),
  liability: z.string().optional(),
});

const router = Router();

// FLT-CONST-01 — single source for tunable trip-cost constants. Reads
// per-company overrides from system_settings keys with a `fleet.*`
// prefix; falls back to SA-defaults when unset. Cached for the process
// lifetime since rates rarely change mid-day.
interface FleetCostSettings {
  fuelPricePerLiter: number;
  fuelEfficiencyKmPerLiter: number;
  driverFarePerKm: number;
  depreciationPerKm: number;
}
const _fleetSettingsCache = new Map<number, FleetCostSettings>();
const FLEET_COST_DEFAULTS: FleetCostSettings = {
  fuelPricePerLiter: 2.5,
  fuelEfficiencyKmPerLiter: 10,
  driverFarePerKm: 0.5,
  depreciationPerKm: 0.15,
};
async function getFleetCostSettings(companyId: number): Promise<FleetCostSettings> {
  const cached = _fleetSettingsCache.get(companyId);
  if (cached) return cached;
  try {
    const rows = await rawQuery<{ key: string; value: string | null }>(
      `SELECT key, value FROM system_settings
        WHERE key IN ('fleet.fuel_price_per_liter','fleet.fuel_efficiency_km_per_liter','fleet.driver_fare_per_km','fleet.depreciation_per_km')
          AND ( "companyId" = $1 OR "companyId" IS NULL )
        ORDER BY ("companyId" IS NULL) ASC`,
      [companyId],
    );
    const pick = (key: string, fallback: number) => {
      const row = rows.find((r) => r.key === key);
      const n = row?.value == null ? NaN : Number(row.value);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const settings: FleetCostSettings = {
      fuelPricePerLiter: pick("fleet.fuel_price_per_liter", FLEET_COST_DEFAULTS.fuelPricePerLiter),
      fuelEfficiencyKmPerLiter: pick("fleet.fuel_efficiency_km_per_liter", FLEET_COST_DEFAULTS.fuelEfficiencyKmPerLiter),
      driverFarePerKm: pick("fleet.driver_fare_per_km", FLEET_COST_DEFAULTS.driverFarePerKm),
      depreciationPerKm: pick("fleet.depreciation_per_km", FLEET_COST_DEFAULTS.depreciationPerKm),
    };
    _fleetSettingsCache.set(companyId, settings);
    return settings;
  } catch {
    return FLEET_COST_DEFAULTS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE MACHINES — Phase C.3 Fleet audit
//
// Every lifecycle transition (vehicle status, trip status, maintenance status,
// traffic violation status) must go through one of these allowlists. A direct
// `UPDATE status` on any of these tables outside the allowlist is a bug — the
// PATCH handlers below refuse unknown transitions with a 409 and a helpful
// `allowedNext` payload so the UI can grey out invalid buttons.
// ─────────────────────────────────────────────────────────────────────────────
const VEHICLE_STATUSES = ["available", "in_use", "maintenance", "out_of_service"] as const;
const VEHICLE_TRANSITIONS: Record<string, readonly string[]> = {
  available:       ["in_use", "maintenance", "out_of_service"],
  in_use:          ["available", "maintenance"],
  maintenance:     ["available", "out_of_service"],
  out_of_service:  ["available", "maintenance"],
};

const TRIP_STATUSES = ["scheduled", "planned", "in_progress", "completed", "cancelled"] as const;
const TRIP_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled:   ["planned", "in_progress", "cancelled"],
  planned:     ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const MAINTENANCE_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
const MAINTENANCE_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled:   ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const VIOLATION_TRANSITIONS: Record<string, readonly string[]> = {
  pending:   ["paid", "disputed", "cancelled"],
  disputed:  ["paid", "cancelled"],
  paid:      [],
  cancelled: [],
};

const DRIVER_STATUSES = ["available", "on_trip", "off_duty", "suspended"] as const;
const DRIVER_TRANSITIONS: Record<string, readonly string[]> = {
  available:  ["on_trip", "off_duty", "suspended"],
  on_trip:    ["available", "off_duty"],
  off_duty:   ["available", "suspended"],
  suspended:  ["off_duty", "available"],
};

router.get("/vehicles", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, search, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['v."plateNumber"', 'v.make', 'v.model']; }
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'v."companyId"', branchColumn: 'v."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND v.status = $${paramIdx}`; params.push(status); paramIdx++; }
    if (dateFrom) { where += ` AND v."createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND v."createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }
    // Dedicated binding for the gov_counts + insurance CTEs so we
    // don't depend on any specific position inside the scoped where
    // clause (which may pass companyId as an array via = ANY($1)).
    params.push(scope.companyId);
    const govCompanyIdx = paramIdx++;
    // Pre-aggregate gov_integration_links + fleet_insurance once
    // each instead of running scalar subqueries per row. The original
    // pair of SELECT-list correlated subqueries was N+1: postgres
    // planned one execution PER returned row, so 500 vehicles = 1001
    // index lookups (501 gov + 500 insurance). Two CTEs scan each
    // table once and the main SELECT LEFT JOINs the aggregates.
    const rows = await rawQuery<Record<string, unknown>>(
      `WITH gov_counts AS (
         SELECT "entityId", COUNT(*) AS "govLinkCount"
         FROM gov_integration_links
         WHERE "entityType" = 'vehicle' AND "companyId" = $${govCompanyIdx}
         GROUP BY "entityId"
       ),
       insurance_expiry AS (
         SELECT "vehicleId", MAX("endDate") AS "insuranceExpiry"
         FROM fleet_insurance
         WHERE "companyId" = $${govCompanyIdx} AND "deletedAt" IS NULL
         GROUP BY "vehicleId"
       )
       SELECT v.*,
              COALESCE(av."driverId", v."assignedDriverId") AS "currentDriverId",
              d.name AS "driverName",
              COALESCE(gc."govLinkCount", 0)::int AS "govLinkCount",
              ie."insuranceExpiry"
       FROM fleet_vehicles v
       LEFT JOIN LATERAL (
         SELECT vda."driverId"
           FROM vehicle_driver_assignments vda
          WHERE vda."vehicleId" = v.id AND vda."companyId" = v."companyId"
            AND vda.status = 'active' AND vda."assignmentType" = 'primary'
          ORDER BY vda."startDate" DESC
          LIMIT 1
       ) av ON TRUE
       LEFT JOIN fleet_drivers d ON d.id = COALESCE(av."driverId", v."assignedDriverId") AND d."deletedAt" IS NULL
       LEFT JOIN gov_counts gc ON gc."entityId" = v.id
       LEFT JOIN insurance_expiry ie ON ie."vehicleId" = v.id
       WHERE ${where} AND v."deletedAt" IS NULL
       ORDER BY v.id DESC LIMIT 500`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet vehicles error:"); }
});

router.post("/vehicles", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createVehicleSchema.safeParse(req.body)) as any;

    const plateNumber = b.plateNumber.trim();
    if (b.year !== undefined && b.year !== null) {
      const yr = Number(b.year);
      const thisYear = currentYear();
      if (!Number.isFinite(yr) || yr < 1950 || yr > thisYear + 1) {
        throw new ValidationError(`السنة غير صالحة — يجب أن تكون بين 1950 و${thisYear + 1}`, { field: "year", fix: "أدخل سنة صنع المركبة بصيغة صحيحة" });
      }
    }

    const [existingVehicle] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_vehicles WHERE "plateNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [plateNumber, scope.companyId]
    );
    if (existingVehicle) {
      throw new ConflictError("رقم اللوحة مسجل مسبقاً", { field: "plateNumber", fix: "استخدم رقم لوحة مختلف أو تحقق من السجل الموجود" });
    }

    if (b.vinNumber) {
      const [existingVin] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM fleet_vehicles WHERE "vinNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.vinNumber, scope.companyId]
      );
      if (existingVin) {
        throw new ConflictError("رقم الهيكل (VIN) مسجل مسبقاً", { field: "vinNumber", fix: "تحقق من رقم الهيكل — لا يمكن تسجيل نفس المركبة مرتين" });
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_vehicles ("companyId","plateNumber",make,model,year,color,"vinNumber","fuelType","currentMileage",status,"branchId",notes,"registrationNumber","registrationExpiry","inspectionDate","nextInspectionDate","plateType","sequenceNumber","insuranceExpiry","fuelCapacity","purchasePrice","purchaseDate","requiredLicenseClass",
        "vehicleType","payloadKg","boxLengthCm","boxWidthCm","boxHeightCm","axleCount","tireCount","tireSize","engineDisplacementCc","transmissionType","seatCount","hasAc","screenCount","doorCount","upholsteryType","safetyFeatures","operatingHours","equipmentAttachments",
        "operationalPayloadKg","validForPassengers","validForCargo",
        "operationalPassengerCapacity","vehicleServiceTypes")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,
        $42,$43,$44,
        $45,$46)`,
      [scope.companyId, plateNumber, b.make.trim(), b.model.trim(), b.year ? Number(b.year) : null, b.color, b.vinNumber, b.fuelType || 'gasoline', b.currentMileage || 0, 'available', b.branchId || scope.branchId, b.notes, b.registrationNumber || null, b.registrationExpiry || null, b.inspectionDate || null, b.nextInspectionDate || null, b.plateType || null, b.sequenceNumber || null, b.insuranceExpiry || null, b.fuelCapacity ? Number(b.fuelCapacity) : null, b.purchasePrice ? Number(b.purchasePrice) : null, b.purchaseDate || null, b.requiredLicenseClass || null,
        b.vehicleType ?? null, b.payloadKg ?? null, b.boxLengthCm ?? null, b.boxWidthCm ?? null, b.boxHeightCm ?? null, b.axleCount ?? null, b.tireCount ?? null, b.tireSize ?? null, b.engineDisplacementCc ?? null, b.transmissionType ?? null, b.seatCount ?? null, b.hasAc ?? null, b.screenCount ?? null, b.doorCount ?? null, b.upholsteryType ?? null, b.safetyFeatures ? JSON.stringify(b.safetyFeatures) : null, b.operatingHours ?? null, b.equipmentAttachments ? JSON.stringify(b.equipmentAttachments) : null,
        b.operationalPayloadKg ?? null, b.validForPassengers ?? null, b.validForCargo ?? null,
        b.operationalPassengerCapacity ?? null, b.vehicleServiceTypes ?? null]
    );
    assertInsert(insertId, "fleet_vehicles");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    // Vehicle → custody subsidiary (fuel-card / parking-deposit cash
    // held on the plate) + cost-centre nested under the vehicle's branch
    // (per-vehicle maintenance + fuel cost roll-up). Both fire-and-
    // forget — the vehicle create must succeed regardless.
    const vehicleLabel = `${b.make} ${b.model} — ${b.plateNumber}`;
    createSubsidiaryAccountsForEntity(scope.companyId, "vehicle", insertId, vehicleLabel, { branchId: scope.branchId, actorUserId: scope.userId })
      .catch((e) => logger.error(e, "vehicle subsidiary auto-create failed"));
    // Batch 6 — cost-centre link is now GUARANTEED (awaited) before the 201,
    // not fire-and-forget: the vehicle must never reach its first posting with
    // a null cost-centre dimension. ensureCostCenterForEntity never throws and
    // stays idempotent, so the vehicle create still succeeds on a CC hiccup —
    // it just logs a non-silent LINK_GAP marker instead of swallowing it.
    await ensureCostCenterForEntity(
      scope.companyId, "vehicle", insertId, vehicleLabel,
      {
        parentEntityType: (b.branchId || scope.branchId) ? "branch" : null,
        parentEntityId: b.branchId ?? scope.branchId ?? null,
        actorUserId: scope.userId,
      },
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_vehicles", entityId: insertId,
      after: { plateNumber: b.plateNumber, make: b.make, model: b.model, year: b.year, status: 'available' },
    }).catch((e) => logger.error(e, "fleet background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.vehicle.created", entity: "fleet_vehicles", entityId: insertId,
      details: `مركبة جديدة: ${b.plateNumber}${b.make ? ` — ${b.make}` : ''}${b.model ? ` ${b.model}` : ''}`,
    }).catch((e) => logger.error(e, "fleet background task failed"));
    createSubsidiaryAccountsForEntity(
      scope.companyId, "vehicle", insertId,
      `${b.plateNumber} ${b.make || ""} ${b.model || ""}`.trim(), { branchId: scope.branchId, actorUserId: scope.userId }
    ).catch((e) => logger.error(e, "fleet background task failed"));
    if (b.purchasePrice && Number(b.purchasePrice) > 0) {
      (async () => {
        try {
          const { fleetEngine } = await import("../lib/engines/index.js");
          await fleetEngine.postVehicleAssetGL(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId },
            { id: insertId, purchasePrice: Number(b.purchasePrice), plateNumber, make: b.make, model: b.model }
          );
          const vName = `${plateNumber} ${b.make || ""} ${b.model || ""}`.trim();
          const usefulYears = Number(b.usefulLifeYears) || 5;
          const salvage = Number(b.salvageValue) || 0;
          fleetEngine.requestFixedAssetRegistration(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId },
            {
              vehicleId: insertId,
              code: `VEH-${insertId}`,
              name: vName,
              description: `أصل ثابت — مركبة ${vName}`,
              purchaseDate: b.purchaseDate || todayISO(),
              purchaseCost: Number(b.purchasePrice),
              salvageValue: salvage,
              usefulLifeYears: usefulYears,
            }
          ).catch((e: unknown) => logger.error(e, "Fleet asset registration error:"));
          createNotification({
            companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
            type: "auto_journal", title: "قيد تلقائي — إثبات أصل مركبة",
            body: `تم إنشاء قيد محاسبي تلقائي لإثبات أصل المركبة ${vName} بقيمة ${Number(b.purchasePrice).toLocaleString("ar-SA")} ريال، وتسجيلها كأصل ثابت يخضع للإهلاك الشهري`,
            priority: "normal", refType: "fleet_vehicle", refId: insertId,
            actionUrl: `/fleet`,
          }).catch((e) => logger.error(e, "fleet background task failed"));
        } catch (e) { logger.error(e, "Vehicle asset JE/fixed-asset failed:"); }
      })();
    }
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create vehicle error:"); }
});

// ─────────────────────────────────────────────────────────────────────────
// Driver self-service surface (#1354).
//
// Replaces the standalone /driver-portal/* JWT-separated app. Drivers
// log in with their regular ERP credentials (employees / users), get
// the `driver` role on their employee_assignment, and call the same
// endpoints below — bound to req.scope.employeeId via fleet_drivers.
//
// This is the architecturally-correct shape: one auth, one RBAC, one
// session boundary. A driver who's fired (assignment ended) loses
// access immediately — no separate driver_portal_accounts row to
// chase. The operator-side fleet.cargo + fleet.trips features stay
// invisible to the driver because the role doesn't carry them.
// ─────────────────────────────────────────────────────────────────────────
export async function resolveDriverFromScope(req: import("express").Request): Promise<{ id: number; companyId: number; status: string } | null> {
  const scope = req.scope!;
  if (!scope.employeeId) return null;
  const [driver] = await rawQuery<{ id: number; companyId: number; status: string }>(
    `SELECT id, "companyId", status FROM fleet_drivers
      WHERE "employeeId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
      LIMIT 1`,
    [scope.employeeId, scope.companyId]
  );
  return driver ?? null;
}

router.get("/me", authorize({ feature: "fleet.driver.me", action: "view" }), async (req, res) => {
  try {
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const [row] = await rawQuery(
      `SELECT id, name, phone, "licenseNumber", "licenseExpiry", "licenseType",
              "licenseClass", "nationalId", "iqamaNumber",
              "licenseIssueDate", "licenseIssuingAuthority", "licenseOrigin",
              status, rating, "totalTrips"
         FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [driver.id, driver.companyId]
    );
    res.json({ data: row });
  } catch (err) { handleRouteError(err, res, "Driver self-profile error:"); }
});

router.patch("/me/availability", authorize({ feature: "fleet.driver.me", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const status = String(req.body?.status ?? "");
    if (status !== "available" && status !== "off_duty") {
      throw new ValidationError("الحالة يجب أن تكون 'available' أو 'off_duty'");
    }
    if (driver.status === "on_trip") {
      throw new ConflictError("لا يمكن تغيير الحالة أثناء وجود رحلة جارية");
    }
    if (driver.status === "suspended") {
      throw new ConflictError("الحساب موقوف، الرجاء التواصل مع الإدارة");
    }
    await rawExecute(
      `UPDATE fleet_drivers SET status = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3`,
      [status, driver.id, driver.companyId]
    );
    void createAuditLog({ companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "fleet_drivers", entityId: driver.id,
      before: { status: driver.status }, after: { status, source: "driver_self" } });
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.driver.availability_changed", entity: "fleet_drivers", entityId: driver.id,
      details: JSON.stringify({ from: driver.status, to: status, source: "driver_self" }) });
    res.json({ data: { status } });
  } catch (err) { handleRouteError(err, res, "Driver availability error:"); }
});

// ─── POST /me/fuel-logs — السائق يبلّغ عن تعبئة وقود ميدانيًا ─────────────────
// بلاغ تشغيلي: السائق يسجّل واقعة التعبئة (مركبته + كمية + تكلفة)، فتُنشأ واقعة
// وقود + مرشّح مصروف للمالية تُجسّده لاحقًا (لا ترحيل مباشر للدفتر — نموذج
// «الحقيقة التشغيلية ← المالية تشتق»). driverId مُسنَد إجباريًا للسائق المُحلَّل،
// فلا يبلّغ نيابة عن غيره.
router.post("/me/fuel-logs", authorize({ feature: "fleet.driver.me", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const b = zodParse(createFuelLogSchema.safeParse(req.body)) as any;

    // المركبة مطلوبة وتُحلّ من المعرّف أو رقم اللوحة داخل شركة السائق.
    let resolvedVehicleId = b.vehicleId || null;
    if (!resolvedVehicleId && b.vehiclePlate) {
      const [v] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.vehiclePlate, driver.companyId]);
      if (v) resolvedVehicleId = v.id;
    }
    if (!resolvedVehicleId) {
      throw new ValidationError("المركبة مطلوبة", { field: "vehicleId", fix: "اختر مركبتك أو أدخل رقم اللوحة" });
    }
    const [veh] = await rawQuery<{ id: number; fuelCapacity: number | null; branchId: number | null }>(
      `SELECT id, "fuelCapacity", "branchId" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [resolvedVehicleId, driver.companyId]);
    if (!veh) {
      throw new ValidationError(`المركبة رقم ${resolvedVehicleId} غير موجودة`, { field: "vehicleId", fix: "اختر مركبة مسجلة" });
    }
    const liters = b.liters;
    const tankCapacity = Number(veh.fuelCapacity ?? 0);
    if (tankCapacity > 0 && liters > tankCapacity) {
      throw new ValidationError(
        `لا يمكن تسجيل وقود يتجاوز سعة الخزان (${tankCapacity} لتر). الكمية المدخلة: ${liters} لتر`,
        { field: "liters", fix: `أدخل كمية لا تتجاوز سعة الخزان (${tankCapacity} لتر)` });
    }

    // الرحلة اختيارية: إن وُجدت يجب أن تخصّ هذا السائق وهذه المركبة.
    let validatedTripId: number | null = null;
    if (b.tripId) {
      const [trip] = await rawQuery<{ id: number; vehicleId: number | null }>(
        `SELECT id, "vehicleId" FROM fleet_trips
          WHERE id = $1 AND "companyId" = $2 AND "driverId" = $3 AND "deletedAt" IS NULL`,
        [Number(b.tripId), driver.companyId, driver.id]);
      if (!trip) throw new ValidationError("الرحلة غير موجودة أو لا تخصّك", { field: "tripId", fix: "اختر إحدى رحلاتك" });
      if (trip.vehicleId && trip.vehicleId !== resolvedVehicleId) {
        throw new ValidationError("الرحلة المختارة تخص مركبة أخرى", { field: "tripId" });
      }
      validatedTripId = trip.id;
    }

    const costPerLiter = Number(b.costPerLiter || b.cost) || 0;
    const totalCost = liters * costPerLiter;
    const fuelDate = b.fuelDate || b.date || todayISO();
    const mileageAtFuel = Number(b.mileageAtFuel || b.mileage) || null;
    const stationName = b.stationName || b.station || null;

    // Fuel-log INSERT + odometer advance are wrapped in one transaction so the
    // two writes are atomic (no partial state if the second fails). The inner
    // rawExecute calls auto-join the ambient transaction via ALS.
    const insertId = await withTransaction(async () => {
      const ins = await rawExecute(
        `INSERT INTO fleet_fuel_logs ("companyId","vehicleId","driverId","fuelDate",liters,"costPerLiter","totalCost","mileageAtFuel","stationName","tripId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [driver.companyId, resolvedVehicleId, driver.id, fuelDate, liters, costPerLiter, totalCost, mileageAtFuel, stationName, validatedTripId]);
      assertInsert(ins.insertId, "fleet_fuel_logs");
      // Advance the vehicle odometer to the fuel reading (monotonic — GREATEST,
      // never decreases), so currentMileage stays fresh and the next form
      // auto-fills the true reading. Mirrors the trip-completion update pattern.
      if (mileageAtFuel != null) {
        await rawExecute(
          `UPDATE fleet_vehicles SET "currentMileage" = GREATEST(COALESCE("currentMileage", 0), $1), "updatedAt" = NOW()
            WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
          [mileageAtFuel, resolvedVehicleId, driver.companyId]);
      }
      return ins.insertId;
    });

    // مرشّح مصروف للمالية (لا ترحيل مباشر للدفتر) — يُجسّده المحاسب لاحقًا.
    if (totalCost > 0) {
      const plateLabel = b.vehiclePlate ? ` / ${b.vehiclePlate}` : "";
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.createFuelExpenseCandidate(
        { companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id: insertId, vehicleId: resolvedVehicleId, cost: totalCost, description: `مصروف وقود (بلاغ سائق)${plateLabel} / ${liters} لتر / ${stationName ?? ""}` }
      ).catch((e: unknown) => logger.error(e, "Driver fuel expense candidate failed:"));
    }

    void emitEvent({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "fleet.fuel_log.created", entity: "fleet_fuel_logs", entityId: insertId,
      details: JSON.stringify({ vehicleId: resolvedVehicleId, liters, totalCost, source: "driver_self" }) });
    void createAuditLog({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_fuel_logs", entityId: insertId,
      after: { vehicleId: resolvedVehicleId, driverId: driver.id, liters, totalCost, fuelDate, stationName, source: "driver_self" } });

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, driver.companyId]);
    res.status(201).json({ data: row });
  } catch (err) { handleRouteError(err, res, "Driver fuel-log error:"); }
});

// ─── GET /me/fuel-logs — السائق يستعرض بلاغات وقوده ──────────────────────────
router.get("/me/fuel-logs", authorize({ feature: "fleet.driver.me", action: "view" }), async (req, res) => {
  try {
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT f.*, v."plateNumber"
         FROM fleet_fuel_logs f
         LEFT JOIN fleet_vehicles v ON v.id = f."vehicleId" AND v."deletedAt" IS NULL
        WHERE f."driverId" = $1 AND f."companyId" = $2 AND f."deletedAt" IS NULL
        ORDER BY f."fuelDate" DESC, f.id DESC LIMIT 200`,
      [driver.id, driver.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Driver fuel-logs list error:"); }
});

// ─── بلاغ عطل مركبة (نقاط السائق الميدانية، الدفعة B) ────────────────────────
// البلاغ واقعة تشغيلية بلا تكلفة — كلفة الإصلاح (إن وُجدت) تُعالَج لاحقًا عبر
// مسار الصيانة القائم بمنطق costBearer هناك، لا هنا. (خالٍ من الدفتر.)
const driverBreakdownSchema = z.object({
  vehicleId: z.coerce.number().optional(),
  vehiclePlate: z.string().optional(),
  description: z.string().min(3, "وصف العطل مطلوب"),
  category: z.enum(["engine", "tire", "electrical", "brakes", "transmission", "cooling", "bodywork", "other"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  odometer: z.coerce.number().optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
  tripId: z.coerce.number().optional(),
});

// POST /me/breakdowns — السائق يبلّغ عن عطل مركبته. driverId مُسنَد ذاتيًا.
router.post("/me/breakdowns", authorize({ feature: "fleet.driver.me", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const b = zodParse(driverBreakdownSchema.safeParse(req.body)) as any;

    let resolvedVehicleId = b.vehicleId || null;
    if (!resolvedVehicleId && b.vehiclePlate) {
      const [v] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.vehiclePlate, driver.companyId]);
      if (v) resolvedVehicleId = v.id;
    }
    if (!resolvedVehicleId) {
      throw new ValidationError("المركبة مطلوبة", { field: "vehicleId", fix: "اختر مركبتك أو أدخل رقم اللوحة" });
    }
    const [veh] = await rawQuery<{ id: number; branchId: number | null; plateNumber: string | null }>(
      `SELECT id, "branchId", "plateNumber" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [resolvedVehicleId, driver.companyId]);
    if (!veh) throw new ValidationError(`المركبة رقم ${resolvedVehicleId} غير موجودة`, { field: "vehicleId" });

    let validatedTripId: number | null = null;
    if (b.tripId) {
      const [trip] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_trips WHERE id = $1 AND "companyId" = $2 AND "driverId" = $3 AND "deletedAt" IS NULL`,
        [Number(b.tripId), driver.companyId, driver.id]);
      if (!trip) throw new ValidationError("الرحلة غير موجودة أو لا تخصّك", { field: "tripId" });
      validatedTripId = trip.id;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_breakdowns
         ("companyId","branchId","vehicleId","driverId","tripId","category","severity","status",
          "description","odometer","locationLat","locationLng","reportedByUserId","reportedByRole")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'reported',$8,$9,$10,$11,$12,'driver')`,
      [driver.companyId, veh.branchId ?? scope.branchId, resolvedVehicleId, driver.id, validatedTripId,
       b.category ?? null, b.severity ?? "medium", b.description, b.odometer ?? null,
       b.locationLat ?? null, b.locationLng ?? null, scope.userId]);
    assertInsert(insertId, "fleet_breakdowns");

    void emitEvent({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "fleet.breakdown.reported", entity: "fleet_breakdowns", entityId: insertId,
      details: JSON.stringify({ vehicleId: resolvedVehicleId, severity: b.severity ?? "medium", category: b.category ?? null, source: "driver_self" }) });
    // يُشغّل المعالج القائم proactiveVehicleBreakdown: تذكرة صيانة تلقائية + مهمة
    // عاجلة لمدير الأسطول (entityId = vehicleId حسب توقيع المعالج).
    void emitEvent({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "fleet.vehicle.breakdown", entity: "fleet_vehicle", entityId: resolvedVehicleId,
      plateNumber: veh.plateNumber ?? undefined, description: b.description, source: "driver" });
    void createAuditLog({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_breakdowns", entityId: insertId,
      after: { vehicleId: resolvedVehicleId, driverId: driver.id, severity: b.severity ?? "medium", source: "driver_self" } });

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_breakdowns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, driver.companyId]);
    res.status(201).json({ data: row });
  } catch (err) { handleRouteError(err, res, "Driver breakdown report error:"); }
});

// GET /me/breakdowns — السائق يستعرض بلاغات أعطاله.
router.get("/me/breakdowns", authorize({ feature: "fleet.driver.me", action: "view" }), async (req, res) => {
  try {
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT b.*, v."plateNumber"
         FROM fleet_breakdowns b
         LEFT JOIN fleet_vehicles v ON v.id = b."vehicleId" AND v."deletedAt" IS NULL
        WHERE b."driverId" = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL
        ORDER BY b."reportedAt" DESC, b.id DESC LIMIT 200`,
      [driver.id, driver.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Driver breakdowns list error:"); }
});

// ─── صور بلاغ العطل ──────────────────────────────────────────────────────────
const breakdownPhotoSchema = z.object({
  photoType: z.enum(["fault", "dashboard", "vehicle", "other"]),
  storageKey: z.string().min(1).max(1024),
  fileName: z.string().max(512).optional(),
  mimeType: z.string().max(60).optional(),
  fileSize: z.coerce.number().int().nonnegative().optional(),
});

// POST /me/breakdowns/:id/photos — السائق يرفق صورة لبلاغ عطله.
router.post("/me/breakdowns/:id/photos", authorize({ feature: "fleet.driver.me", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(breakdownPhotoSchema.safeParse(req.body));
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const [bd] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM fleet_breakdowns WHERE id=$1 AND "companyId"=$2 AND "driverId"=$3 AND "deletedAt" IS NULL`,
      [id, scope.companyId, driver.id]);
    if (!bd) throw new NotFoundError("البلاغ غير موجود أو لا يخصّك");
    if (bd.status === "resolved" || bd.status === "cancelled") {
      throw new ValidationError("لا يمكن إضافة صور بعد إغلاق البلاغ");
    }
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_breakdown_photos ("companyId","breakdownId","photoType","storageKey","fileName","mimeType","fileSize","capturedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [scope.companyId, id, b.photoType, b.storageKey, b.fileName ?? null, b.mimeType ?? null, b.fileSize ?? null]);
    assertInsert(insertId, "fleet_breakdown_photos");
    void createAuditLog({ companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "fleet_breakdown_photos", entityId: insertId,
      after: { breakdownId: id, photoType: b.photoType, source: "driver" } });
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Driver breakdown photo error:"); }
});

// GET /me/breakdowns/:id/photos — صور السائق لبلاغه. (المشرف يستخدم /breakdowns/:id/photos.)
router.get("/me/breakdowns/:id/photos", authorize({ feature: "fleet.driver.me", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.* FROM fleet_breakdown_photos p
         JOIN fleet_breakdowns b ON b.id = p."breakdownId" AND b."deletedAt" IS NULL
        WHERE p."breakdownId"=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL AND b."driverId"=$3
        ORDER BY p.id ASC`, [id, scope.companyId, driver.id]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Driver breakdown photos list error:"); }
});

// GET /breakdowns/:id/photos — المشرف يعرض صور بلاغ (مُفلتر بالنطاق).
router.get("/breakdowns/:id/photos", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.* FROM fleet_breakdown_photos p
        WHERE p."breakdownId"=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL
        ORDER BY p.id ASC`, [id, scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Breakdown photos list error:"); }
});

// GET /breakdowns — مشرف الأسطول يتابع البلاغات (مُفلتر بالنطاق).
router.get("/breakdowns", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'b."companyId"', branchColumn: 'b."branchId"', enforceBranchScope: true });
    let w = where; const p = params; let idx = nextParamIndex;
    const status = (req.query.status as string) || "";
    if (status) { w += ` AND b."status" = $${idx}`; p.push(status); idx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT b.*, v."plateNumber", d.name AS "driverName",
              (SELECT COUNT(*)::int FROM fleet_breakdown_photos ph
                WHERE ph."breakdownId" = b.id AND ph."deletedAt" IS NULL) AS "photoCount"
         FROM fleet_breakdowns b
         LEFT JOIN fleet_vehicles v ON v.id = b."vehicleId" AND v."deletedAt" IS NULL
         LEFT JOIN fleet_drivers d ON d.id = b."driverId" AND d."deletedAt" IS NULL
        WHERE ${w} AND b."deletedAt" IS NULL
        ORDER BY b."reportedAt" DESC LIMIT 500`, p);
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Breakdowns list error:"); }
});

// PATCH /breakdowns/:id — المشرف يحدّث حالة البلاغ (إقرار/إصلاح/إغلاق).
router.patch("/breakdowns/:id", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const status = String(req.body?.status ?? "");
    if (!["acknowledged", "in_repair", "resolved", "cancelled"].includes(status)) {
      throw new ValidationError("الحالة غير صحيحة", { field: "status", fix: "acknowledged / in_repair / resolved / cancelled" });
    }
    const [cur] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM fleet_breakdowns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]);
    if (!cur) throw new NotFoundError("البلاغ غير موجود");

    const ack = status === "acknowledged";
    const resolved = status === "resolved" || status === "cancelled";
    await rawExecute(
      `UPDATE fleet_breakdowns
          SET status=$1,
              "acknowledgedByUserId" = COALESCE("acknowledgedByUserId", $2),
              "acknowledgedAt"       = COALESCE("acknowledgedAt", $3),
              "resolutionNotes"      = COALESCE($4, "resolutionNotes"),
              "resolvedAt"           = $5,
              "updatedAt" = NOW()
        WHERE id=$6 AND "companyId"=$7`,
      [status, ack ? scope.userId : null, ack ? new Date() : null,
       req.body?.resolutionNotes ?? null, resolved ? new Date() : null, id, scope.companyId]);

    void createAuditLog({ companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "fleet_breakdowns", entityId: id,
      before: { status: cur.status }, after: { status } });
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.breakdown.status_changed", entity: "fleet_breakdowns", entityId: id,
      details: JSON.stringify({ from: cur.status, to: status }) });
    res.json({ data: { id, status } });
  } catch (err) { handleRouteError(err, res, "Breakdown update error:"); }
});

// ─── بلاغ حادث مركبة (نقاط السائق الميدانية، الدفعة C1) ──────────────────────
// البلاغ واقعة تشغيلية بحالة 'reported' — خالٍ من الدفتر. الترحيل المحاسبي حسب
// costBearer (ذمة موظف/مطالبة HR/مخالفة) هو الدفعة C2 المستقلة عند التقييم، مع
// assertion tests على سطور القيد (القاعدة 3). هنا: تسجيل الواقعة فقط.
const driverAccidentSchema = z.object({
  vehicleId: z.coerce.number().optional(),
  vehiclePlate: z.string().optional(),
  description: z.string().min(3, "وصف الحادث مطلوب"),
  occurredAt: z.string().optional(),
  severity: z.enum(["minor", "moderate", "severe", "total_loss"]).optional(),
  locationText: z.string().optional(),
  locationLat: z.coerce.number().optional(),
  locationLng: z.coerce.number().optional(),
  odometer: z.coerce.number().optional(),
  hasInjuries: zCoerceBoolean().optional(),
  thirdPartyInvolved: zCoerceBoolean().optional(),
  thirdPartyDetails: z.string().optional(),
  policeReportNo: z.string().optional(),
  tripId: z.coerce.number().optional(),
});

// POST /me/accidents — السائق يبلّغ عن حادث مركبته. driverId مُسنَد ذاتيًا.
router.post("/me/accidents", authorize({ feature: "fleet.driver.me", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const b = zodParse(driverAccidentSchema.safeParse(req.body)) as any;

    let resolvedVehicleId = b.vehicleId || null;
    if (!resolvedVehicleId && b.vehiclePlate) {
      const [v] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.vehiclePlate, driver.companyId]);
      if (v) resolvedVehicleId = v.id;
    }
    if (!resolvedVehicleId) {
      throw new ValidationError("المركبة مطلوبة", { field: "vehicleId", fix: "اختر مركبتك أو أدخل رقم اللوحة" });
    }
    const [veh] = await rawQuery<{ id: number; branchId: number | null; plateNumber: string | null }>(
      `SELECT id, "branchId", "plateNumber" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [resolvedVehicleId, driver.companyId]);
    if (!veh) throw new ValidationError(`المركبة رقم ${resolvedVehicleId} غير موجودة`, { field: "vehicleId" });

    let validatedTripId: number | null = null;
    if (b.tripId) {
      const [trip] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_trips WHERE id = $1 AND "companyId" = $2 AND "driverId" = $3 AND "deletedAt" IS NULL`,
        [Number(b.tripId), driver.companyId, driver.id]);
      if (!trip) throw new ValidationError("الرحلة غير موجودة أو لا تخصّك", { field: "tripId" });
      validatedTripId = trip.id;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_accidents
         ("companyId","branchId","vehicleId","driverId","tripId","occurredAt","severity","status",
          "description","locationText","locationLat","locationLng","odometer","hasInjuries",
          "thirdPartyInvolved","thirdPartyDetails","policeReportNo","reportedByUserId","reportedByRole")
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, NOW()),$7,'reported',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'driver')`,
      [driver.companyId, veh.branchId ?? scope.branchId, resolvedVehicleId, driver.id, validatedTripId,
       b.occurredAt ?? null, b.severity ?? "minor", b.description, b.locationText ?? null,
       b.locationLat ?? null, b.locationLng ?? null, b.odometer ?? null, b.hasInjuries ?? false,
       b.thirdPartyInvolved ?? false, b.thirdPartyDetails ?? null, b.policeReportNo ?? null, scope.userId]);
    assertInsert(insertId, "fleet_accidents");

    // top-level vehicleId/plateNumber/severity/hasInjuries ليقرأها معالج
    // proactiveVehicleAccident → مهمة تقييم عاجلة + إشعار لمدير الأسطول.
    void emitEvent({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "fleet.accident.reported", entity: "fleet_accidents", entityId: insertId,
      vehicleId: resolvedVehicleId, plateNumber: veh.plateNumber ?? undefined,
      severity: b.severity ?? "minor", hasInjuries: b.hasInjuries ?? false,
      details: JSON.stringify({ vehicleId: resolvedVehicleId, severity: b.severity ?? "minor", hasInjuries: b.hasInjuries ?? false, source: "driver_self" }) });
    void createAuditLog({ companyId: driver.companyId, branchId: veh.branchId ?? scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_accidents", entityId: insertId,
      after: { vehicleId: resolvedVehicleId, driverId: driver.id, severity: b.severity ?? "minor", source: "driver_self" } });

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_accidents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, driver.companyId]);
    res.status(201).json({ data: row });
  } catch (err) { handleRouteError(err, res, "Driver accident report error:"); }
});

// GET /me/accidents — السائق يستعرض بلاغات حوادثه.
router.get("/me/accidents", authorize({ feature: "fleet.driver.me", action: "view" }), async (req, res) => {
  try {
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT a.*, v."plateNumber"
         FROM fleet_accidents a
         LEFT JOIN fleet_vehicles v ON v.id = a."vehicleId" AND v."deletedAt" IS NULL
        WHERE a."driverId" = $1 AND a."companyId" = $2 AND a."deletedAt" IS NULL
        ORDER BY a."occurredAt" DESC, a.id DESC LIMIT 200`,
      [driver.id, driver.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Driver accidents list error:"); }
});

// ─── صور بلاغ الحادث (دليل تأمين) ────────────────────────────────────────────
const accidentPhotoSchema = z.object({
  photoType: z.enum(["scene", "damage", "vehicle", "plate", "document", "other"]),
  storageKey: z.string().min(1).max(1024),
  fileName: z.string().max(512).optional(),
  mimeType: z.string().max(60).optional(),
  fileSize: z.coerce.number().int().nonnegative().optional(),
});

// POST /me/accidents/:id/photos — السائق يرفق صورة لبلاغ حادثه (دليل).
router.post("/me/accidents/:id/photos", authorize({ feature: "fleet.driver.me", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(accidentPhotoSchema.safeParse(req.body));
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const [acc] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM fleet_accidents WHERE id=$1 AND "companyId"=$2 AND "driverId"=$3 AND "deletedAt" IS NULL`,
      [id, scope.companyId, driver.id]);
    if (!acc) throw new NotFoundError("البلاغ غير موجود أو لا يخصّك");
    if (acc.status === "closed" || acc.status === "cancelled") {
      throw new ValidationError("لا يمكن إضافة صور بعد إغلاق البلاغ");
    }
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_accident_photos ("companyId","accidentId","photoType","storageKey","fileName","mimeType","fileSize","capturedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [scope.companyId, id, b.photoType, b.storageKey, b.fileName ?? null, b.mimeType ?? null, b.fileSize ?? null]);
    assertInsert(insertId, "fleet_accident_photos");
    void createAuditLog({ companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "fleet_accident_photos", entityId: insertId,
      after: { accidentId: id, photoType: b.photoType, source: "driver" } });
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Driver accident photo error:"); }
});

// GET /me/accidents/:id/photos — صور السائق لبلاغه.
router.get("/me/accidents/:id/photos", authorize({ feature: "fleet.driver.me", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.* FROM fleet_accident_photos p
         JOIN fleet_accidents a ON a.id = p."accidentId" AND a."deletedAt" IS NULL
        WHERE p."accidentId"=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL AND a."driverId"=$3
        ORDER BY p.id ASC`, [id, scope.companyId, driver.id]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Driver accident photos list error:"); }
});

// GET /accidents/:id/photos — المشرف يعرض صور الحادث (مُفلتر بالنطاق).
router.get("/accidents/:id/photos", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.* FROM fleet_accident_photos p
        WHERE p."accidentId"=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL
        ORDER BY p.id ASC`, [id, scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Accident photos list error:"); }
});

// GET /accidents — مشرف الأسطول يتابع البلاغات (مُفلتر بالنطاق).
router.get("/accidents", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'a."companyId"', branchColumn: 'a."branchId"', enforceBranchScope: true });
    let w = where; const p = params; let idx = nextParamIndex;
    const status = (req.query.status as string) || "";
    if (status) { w += ` AND a."status" = $${idx}`; p.push(status); idx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT a.*, v."plateNumber", d.name AS "driverName",
              (SELECT COUNT(*)::int FROM fleet_accident_photos ph
                WHERE ph."accidentId" = a.id AND ph."deletedAt" IS NULL) AS "photoCount"
         FROM fleet_accidents a
         LEFT JOIN fleet_vehicles v ON v.id = a."vehicleId" AND v."deletedAt" IS NULL
         LEFT JOIN fleet_drivers d ON d.id = a."driverId" AND d."deletedAt" IS NULL
        WHERE ${w} AND a."deletedAt" IS NULL
        ORDER BY a."occurredAt" DESC LIMIT 500`, p);
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Accidents list error:"); }
});

// PATCH /accidents/:id/assess — المشرف يقيّم الحادث: يحدّد المتحمّل والكلفة فيُرحَّل
// القيد حسب السياسة المعتمدة (الدفعة C2). يمسّ الدفتر — محروس بـfleet.vehicles.
const assessAccidentSchema = z.object({
  costBearer: z.enum(["company", "driver", "insurance", "warranty", "customer", "tenant", "third_party"]),
  estimatedCost: z.coerce.number().nonnegative("الكلفة يجب ألا تكون سالبة"),
  assessmentNotes: z.string().optional(),
});
router.patch("/accidents/:id/assess", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(assessAccidentSchema.safeParse(req.body));

    const [acc] = await rawQuery<{ id: number; vehicleId: number; driverId: number | null; status: string; branchId: number | null; costBearer: string | null }>(
      `SELECT id, "vehicleId", "driverId", status, "branchId", "costBearer" FROM fleet_accidents
        WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!acc) throw new NotFoundError("بلاغ الحادث غير موجود");
    if (acc.status === "closed" || acc.status === "cancelled") {
      throw new ConflictError("لا يمكن تقييم بلاغ مغلق أو ملغى");
    }

    // تحديث التقييم أولًا (الحقيقة التشغيلية).
    await rawExecute(
      `UPDATE fleet_accidents
          SET "costBearer"=$1, "estimatedCost"=$2, "assessmentNotes"=COALESCE($3,"assessmentNotes"),
              status='assessed', "assessedByUserId"=$4, "assessedAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$5 AND "companyId"=$6`,
      [b.costBearer, b.estimatedCost, b.assessmentNotes ?? null, scope.userId, id, scope.companyId]);

    const { fleetEngine } = await import("../lib/engines/index.js");
    const glCtx = { companyId: scope.companyId, branchId: acc.branchId ?? scope.branchId, createdBy: scope.userId };

    // ترحيل القيد حسب السياسة. postAccidentGL يعكس القيد السابق تلقائيًا عند
    // إعادة التقييم (idempotent عبر sourceKey)، ويُرجِع reversedJournalId.
    // الكلفة الصفرية = عكس فقط بلا قيد جديد.
    const gl = await fleetEngine.postAccidentGL(glCtx,
      { id, vehicleId: acc.vehicleId, cost: b.estimatedCost, costBearer: b.costBearer });
    const journalId: number | null = (gl as any)?.journalId ?? null;
    const reversedJournalId: number | null = (gl as any)?.reversedJournalId ?? null;
    const isReassessment = !!reversedJournalId;

    // تسوية خصم السائق عبر عقد HR (لا كتابة مباشرة):
    //  • التحوّل بعيدًا عن السائق في إعادة تقييم → إلغاء الخصم السابق غير المطبَّق.
    //  • التحوّل إلى السائق (أول تقييم أو إعادة) → طلب خصم بالمبلغ الجديد. عند
    //    driver→driver بمبلغ مختلف: إلغاء القديم + طلب الجديد (تسوية صحيحة).
    if (isReassessment && acc.costBearer === "driver") {
      await fleetEngine.requestAccidentDeductionReversal(glCtx, { accidentId: id });
    }
    if (b.estimatedCost > 0 && b.costBearer === "driver" && acc.driverId) {
      const [drv] = await rawQuery<{ employeeId: number | null }>(
        `SELECT "employeeId" FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [acc.driverId, scope.companyId]);
      if (drv?.employeeId) {
        await fleetEngine.requestAccidentDeduction(glCtx,
          { employeeId: drv.employeeId, accidentId: id, amount: b.estimatedCost, reason: `استرداد كلفة حادث مركبة #${acc.vehicleId}` });
      }
    }

    void createAuditLog({ companyId: scope.companyId, branchId: acc.branchId ?? scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_accidents", entityId: id,
      before: { status: acc.status }, after: { status: "assessed", costBearer: b.costBearer, estimatedCost: b.estimatedCost, journalId, reassessment: isReassessment, reversedJournalId } });
    void emitEvent({ companyId: scope.companyId, branchId: acc.branchId ?? scope.branchId, userId: scope.userId,
      action: "fleet.accident.assessed", entity: "fleet_accidents", entityId: id,
      details: JSON.stringify({ costBearer: b.costBearer, estimatedCost: b.estimatedCost, journalId }) });

    res.json({ data: { id, status: "assessed", costBearer: b.costBearer, estimatedCost: b.estimatedCost, journalId } });
  } catch (err) { handleRouteError(err, res, "Accident assess error:"); }
});

router.get("/me/trips", authorize({ feature: "fleet.trips.my", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) { res.json({ data: [] }); return; }
    const { status } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [driver.id, scope.companyId];
    let where = `t."driverId" = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL`;
    if (status) { params.push(status); where += ` AND t.status = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT t.id, t.status, t."startTime" AS "tripDate", t."startTime", t."endTime",
              t."fromLocation", t."toLocation", t.distance, t.cost, t.notes,
              v."plateNumber" AS "vehiclePlate"
         FROM fleet_trips t
         LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."companyId" = t."companyId" AND v."deletedAt" IS NULL
        WHERE ${where}
        ORDER BY COALESCE(t."startTime", t."createdAt") DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Driver trips error:"); }
});

router.post("/me/trips/:id/start", authorize({ feature: "fleet.trips.my", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const id = parseId(req.params.id, "id");
    const [trip] = await rawQuery<{ status: string }>(
      `SELECT status FROM fleet_trips
        WHERE id = $1 AND "driverId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [id, driver.id, scope.companyId]
    );
    if (!trip) throw new NotFoundError("الرحلة غير موجودة");
    if (trip.status !== "scheduled" && trip.status !== "planned") {
      throw new ConflictError(`لا يمكن بدء رحلة بحالة ${trip.status}`);
    }
    await rawExecute(
      `UPDATE fleet_trips
          SET status = 'in_progress', "startTime" = COALESCE("startTime", NOW()), "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.driver_started", entity: "fleet_trips", entityId: id,
      details: JSON.stringify({ driverId: driver.id }) });
    // الحدث القانوني: يُفعّل مسجّل التدقيق + خطوة «أول رحلة» في تأهّل الأسطول
    // (journeyEngine) + محرّك القواعد. لم يكن يُطلَق من أي مكان (المسار يطلق
    // driver_started فقط، بلا مستهلك) فظلّت تلك المستهلكات معطّلة. غير دفتري.
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.started", entity: "fleet_trips", entityId: id,
      details: JSON.stringify({ driverId: driver.id, source: "driver" }) });
    res.json({ data: { id, status: "in_progress" } });
  } catch (err) { handleRouteError(err, res, "Driver trip-start error:"); }
});

router.post("/me/trips/:id/complete", authorize({ feature: "fleet.trips.my", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const id = parseId(req.params.id, "id");
    const [trip] = await rawQuery<{ status: string }>(
      `SELECT status FROM fleet_trips
        WHERE id = $1 AND "driverId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [id, driver.id, scope.companyId]
    );
    if (!trip) throw new NotFoundError("الرحلة غير موجودة");
    if (trip.status !== "in_progress") {
      throw new ConflictError(`لا يمكن إنهاء رحلة بحالة ${trip.status}`);
    }
    // Completing the trip + freeing the driver are atomic: a completed
    // trip must never leave its driver stuck 'on_trip' (or a driver freed
    // without the trip closed). rawQuery joins the ambient tx (txStore).
    await withTransaction(async () => {
      await rawExecute(
        `UPDATE fleet_trips
            SET status = 'completed', "endTime" = COALESCE("endTime", NOW()), "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId]
      );
      // Free the driver (only flip when they're on_trip — operator-only states stay).
      await rawExecute(
        `UPDATE fleet_drivers SET status = 'available', "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND status = 'on_trip'`,
        [driver.id, scope.companyId]
      );
    });
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.driver_completed", entity: "fleet_trips", entityId: id,
      details: JSON.stringify({ driverId: driver.id }) });
    // الحدث القانوني (تدقيق + قواعد + تأهّل). القيد ليس مدفوعًا بالحدث (يُرحَّل
    // مباشرة في مسار الإكمال الإداري)، فهذا الإطلاق غير دفتري ولا يُكرّر قيدًا.
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.completed", entity: "fleet_trips", entityId: id,
      details: JSON.stringify({ driverId: driver.id, source: "driver" }) });
    res.json({ data: { id, status: "completed" } });
  } catch (err) { handleRouteError(err, res, "Driver trip-complete error:"); }
});

router.get("/me/cargo", authorize({ feature: "fleet.cargo.my", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) { res.json({ data: [] }); return; }
    const { status } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [driver.id, scope.companyId];
    let where = `m."driverId" = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL`;
    if (status) { params.push(status); where += ` AND m.status = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT m.id, m."manifestNumber", m.status, m."fromLocation", m."toLocation",
              m."pickupDate", m."deliveryDate", m."customerName", m."totalWeight",
              v."plateNumber" AS "vehiclePlate"
         FROM cargo_manifests m
         LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = m."companyId" AND v."deletedAt" IS NULL
        WHERE ${where}
        ORDER BY COALESCE(m."pickupDate", m."createdAt") DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Driver cargo error:"); }
});

router.post("/me/cargo/:id/advance", authorize({ feature: "fleet.cargo.my", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const id = parseId(req.params.id, "id");
    const status = String(req.body?.status ?? "");
    // #1733 Blocker #3 — driver-controlled forward path. The dispatcher
    // owns draft / requested / approved / assigned_to_driver; the moment
    // the assignment lands the driver carries it through the operational
    // states up to `delivered`. Operational close (`completed`) and the
    // billing-candidate handoff are dispatcher / accountant moves.
    const DRIVER_ALLOWED_TRANSITIONS = [
      "driver_accepted",
      "trip_started",
      "arrived_pickup",
      "loaded",
      "in_transit",
      "arrived_delivery",
      "delivered",
    ];
    if (!DRIVER_ALLOWED_TRANSITIONS.includes(status)) {
      throw new ValidationError(
        `الانتقال المسموح للسائق: ${DRIVER_ALLOWED_TRANSITIONS.join(" / ")}`,
      );
    }
    const [manifest] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM cargo_manifests
        WHERE id = $1 AND "driverId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [id, driver.id, scope.companyId]
    );
    if (!manifest) throw new NotFoundError("بوليصة الشحن غير موجودة");
    const current = String(manifest.status);
    // Strict forward-only walk. The dispatcher's machine in cargo.ts
    // owns cancellation; this map only allows the driver to advance one
    // step at a time so an operator can audit the timeline cleanly.
    const allowed: Record<string, string[]> = {
      assigned_to_driver: ["driver_accepted"],
      driver_accepted:    ["trip_started"],
      trip_started:       ["arrived_pickup"],
      arrived_pickup:     ["loaded"],
      loaded:             ["in_transit"],
      in_transit:         ["arrived_delivery"],
      arrived_delivery:   ["delivered"],
    };
    if (!(allowed[current] ?? []).includes(status)) {
      throw new ConflictError(`الانتقال من ${current} إلى ${status} غير مسموح للسائق`);
    }
    await rawExecute(
      `UPDATE cargo_manifests SET status = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3`,
      [status, id, scope.companyId]
    );
    void emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.cargo.manifest.status_changed", entity: "cargo_manifests", entityId: id,
      details: JSON.stringify({ from: current, to: status, source: "driver_self" }) });

    // #1733 Foundation — the driver's `delivered` tap never triggers
    // any financial artefact. The dispatcher carries the manifest from
    // `delivered → completed → ready_for_invoice`, and that last
    // transition is where the candidate + service line are created
    // (see cargo.ts PATCH /manifests/:id).
    res.json({ data: { id, status } });
  } catch (err) { handleRouteError(err, res, "Driver cargo-advance error:"); }
});

// ─── TR-016 — cargo driver operational checkpoints ──────────────────
// Per-trip log of WITHIN-step events (weighbridge stop, rest break,
// inspection, customs, unloading milestones). They do NOT change the
// manifest's 7-state lifecycle — that machine still belongs to
// /me/cargo/:id/advance. Checkpoints are free-form chronological
// facts that the dispatcher renders on the cargo timeline.
//
// Driver-side gating:
//   - status MUST be one of the driver-controlled states
//     (driver_accepted .. delivered). A checkpoint on a draft or
//     closed manifest is rejected.
//   - recordedBy is FORCED to the auth scope's userId — a driver
//     can't backdate a peer's checkpoint via the API.
const CARGO_CHECKPOINT_TYPES = [
  "loading_start", "loading_complete",
  "weighing", "rest_break", "inspection",
  "customs", "fueling",
  "unloading_start", "unloading_complete",
  "other",
] as const;

const CARGO_DRIVER_CHECKPOINT_OPEN_STATES = [
  "driver_accepted", "trip_started", "arrived_pickup",
  "loaded", "in_transit", "arrived_delivery", "delivered",
];

const createCheckpointSchema = z.object({
  checkpointType: z.enum(CARGO_CHECKPOINT_TYPES),
  notes: z.string().max(1000).optional(),
  latitude:  z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  measuredValue: z.coerce.number().nonnegative().optional(),
  measuredUnit:  z.string().max(16).optional(),
  recordedAt: z.string().optional(),
});

router.post("/me/cargo/:id/checkpoint", authorize({ feature: "fleet.cargo.my", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) throw new NotFoundError("لا يوجد سجل سائق مرتبط بحسابك");
    const id = parseId(req.params.id, "id");
    const b = zodParse(createCheckpointSchema.safeParse(req.body));
    const [manifest] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM cargo_manifests
        WHERE id = $1 AND "driverId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [id, driver.id, scope.companyId],
    );
    if (!manifest) throw new NotFoundError("بوليصة الشحن غير موجودة");
    if (!CARGO_DRIVER_CHECKPOINT_OPEN_STATES.includes(manifest.status)) {
      throw new ConflictError(
        `لا يمكن تسجيل نقطة تشغيل على بوليصة في حالة ${manifest.status}`,
      );
    }
    const { insertId } = await rawExecute(
      `INSERT INTO cargo_manifest_checkpoints
         ("companyId", "manifestId", "checkpointType", notes,
          latitude, longitude, "measuredValue", "measuredUnit",
          "recordedBy", "recordedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()))`,
      [
        scope.companyId, id, b.checkpointType, b.notes ?? null,
        b.latitude ?? null, b.longitude ?? null,
        b.measuredValue ?? null, b.measuredUnit ?? null,
        scope.userId, b.recordedAt ?? null,
      ],
    );
    assertInsert(insertId, "cargo_manifest_checkpoints");
    void emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.cargo.checkpoint_recorded",
      entity: "cargo_manifest_checkpoints", entityId: insertId,
      details: JSON.stringify({
        manifestId: id, checkpointType: b.checkpointType,
        measuredValue: b.measuredValue ?? null, measuredUnit: b.measuredUnit ?? null,
      }),
    });
    res.status(201).json({ data: { id: insertId } });
  } catch (err) { handleRouteError(err, res, "Cargo checkpoint create error:"); }
});

router.get("/me/cargo/:id/checkpoints", authorize({ feature: "fleet.cargo.my", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const driver = await resolveDriverFromScope(req);
    if (!driver) { res.json({ data: [] }); return; }
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT c.id, c."checkpointType", c.notes, c.latitude, c.longitude,
              c."measuredValue", c."measuredUnit",
              c."recordedBy", c."recordedAt", c."createdAt"
         FROM cargo_manifest_checkpoints c
         JOIN cargo_manifests m
           ON m.id = c."manifestId"
          AND m."companyId" = c."companyId"
          AND m."driverId" = $1
          AND m."deletedAt" IS NULL
        WHERE c."manifestId" = $2 AND c."companyId" = $3
        ORDER BY c."recordedAt" ASC`,
      [driver.id, id, scope.companyId],
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Driver cargo checkpoints list error:"); }
});

// Dispatcher / ops view — every checkpoint on a given manifest,
// regardless of who recorded it. Gated on fleet.cargo so a regular
// dispatcher (not the driver-self role) can see the timeline on the
// cargo detail page.
router.get("/cargo/manifests/:id/checkpoints", authorize({ feature: "fleet.cargo", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT c.id, c."checkpointType", c.notes, c.latitude, c.longitude,
              c."measuredValue", c."measuredUnit",
              c."recordedBy", c."recordedAt", c."createdAt"
         FROM cargo_manifest_checkpoints c
         JOIN cargo_manifests m
           ON m.id = c."manifestId" AND m."companyId" = c."companyId"
        WHERE c."manifestId" = $1 AND c."companyId" = $2
          AND m."deletedAt" IS NULL
        ORDER BY c."recordedAt" ASC`,
      [id, scope.companyId],
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Cargo checkpoints list error:"); }
});

router.get("/drivers", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search, status } = req.query as Record<string, string | undefined>;
    // #2713 (تعميم) — سلة المحذوفات: deleted=true يعرض السائقين المحذوفين فقط.
    const showDeleted = (req.query as Record<string, string | undefined>).deleted === "true";
    const filters = parseScopeFilters(req);
    // fleet_drivers has no branchId column; the joined employees +
    // employee_assignments BOTH have one, so an unqualified branch filter
    // 500'd with `column reference "branchId" is ambiguous`.
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'd."companyId"', disableBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (search) { params.push(`%${search}%`); where += ` AND (d.name ILIKE $${paramIdx} OR d.phone ILIKE $${paramIdx} OR d."licenseNumber" ILIKE $${paramIdx})`; paramIdx++; }
    if (status) { where += ` AND d.status = $${paramIdx}`; params.push(status); paramIdx++; }
    where += showDeleted ? ` AND d."deletedAt" IS NOT NULL` : ` AND d."deletedAt" IS NULL`;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT d.*, e.name AS "employeeName", e."empNumber" AS "employeeNumber",
              ea."jobTitle" AS "employeeJobTitle"
       FROM fleet_drivers d
       LEFT JOIN employees e ON e.id = d."employeeId" AND e."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       WHERE ${where}
       ORDER BY d.name LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet drivers error:"); }
});

router.post("/drivers", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createDriverSchema.safeParse(req.body)) as any;

    const name = b.name.trim();
    const phone = b.phone.trim();
    const licenseNumber = b.licenseNumber.trim();
    if (b.licenseExpiry) {
      const exp = new Date(b.licenseExpiry);
      if (Number.isNaN(exp.getTime())) {
        throw new ValidationError("تاريخ انتهاء الرخصة غير صالح", { field: "licenseExpiry", fix: "استخدم تنسيق التاريخ YYYY-MM-DD" });
      }
      if (exp < new Date()) {
        throw new ValidationError("رخصة السائق منتهية بالفعل", { field: "licenseExpiry", fix: "لا يمكن تسجيل سائق برخصة منتهية — جدّد الرخصة أولاً" });
      }
    }

    // Duplicate licenseNumber check (case where the same driver is added twice)
    const [dupLicense] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_drivers WHERE "licenseNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [licenseNumber, scope.companyId]
    );
    if (dupLicense) {
      throw new ConflictError("رقم الرخصة مسجل مسبقاً لسائق آخر", { field: "licenseNumber", fix: "استخدم رقم رخصة صحيح أو راجع السجل الموجود" });
    }

    // FK pre-check on employeeId if provided (verify employee belongs to same company)
    if (b.employeeId !== undefined && b.employeeId !== null && b.employeeId !== "") {
      const [emp] = await rawQuery<Record<string, unknown>>(
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [b.employeeId, scope.companyId]
      );
      if (!emp) {
        throw new ValidationError("الموظف المرتبط غير موجود", { field: "employeeId", fix: "اختر موظفاً مسجلاً في النظام أو اترك الحقل فارغاً" });
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_drivers (
         "companyId",name,phone,"licenseNumber","licenseExpiry","licenseType","licenseClass",
         "nationalId","iqamaNumber","licenseIssueDate","licenseIssuingAuthority","licenseOrigin",
         "driverServiceProfile","employeeId",status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7, $8,$9,$10,$11,$12, $13,$14,$15)`,
      [
        scope.companyId, name, phone, licenseNumber,
        b.licenseExpiry || null, b.licenseType || null, b.licenseClass || null,
        b.nationalId || null, b.iqamaNumber || null,
        b.licenseIssueDate || null, b.licenseIssuingAuthority || null, b.licenseOrigin || null,
        b.driverServiceProfile || null, b.employeeId || null, b.status || 'available',
      ]
    );
    assertInsert(insertId, "fleet_drivers");

    // Auto-grant the `driver` role on the linked employee's PRIMARY
    // active assignment so the SSO flow lands them on /me/driver next
    // login. Routes through hrEngine to respect the fleet→hr domain
    // boundary (employee_assignments is HR-owned). The engine method
    // only upgrades from the lowest tiers ('employee' / '') so a GM
    // doing a one-off driver assignment isn't silently demoted.
    if (b.employeeId) {
      try {
        const upgraded = await hrEngine.upgradePrimaryAssignmentRoleIfLowTier({
          companyId: scope.companyId,
          employeeId: b.employeeId,
          toRole: "driver",
        });
        if (upgraded > 0) {
          void emitEvent({
            companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
            action: "hr.assignment.role_auto_upgraded", entity: "employee_assignments", entityId: 0,
            details: JSON.stringify({ employeeId: b.employeeId, to: "driver", reason: "fleet_driver_linked" }),
          });
        }
      } catch (assignErr) {
        logger.warn({ err: assignErr, employeeId: b.employeeId },
          "[fleet] auto-upgrade to driver role failed — HR can set manually");
      }
    }

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

    createSubsidiaryAccountsForEntity(scope.companyId, "driver", insertId, name, { branchId: scope.branchId, actorUserId: scope.userId }).catch((e) => logger.error(e, "fleet background task failed"));

    // Master-data identity (migration 249): link the driver to ONE party so a
    // driver who is also an employee/client resolves to a single 360° record
    // immediately. Non-fatal: a registry-link failure must not block creation.
    registerEntityParty(scope.companyId, "fleet_drivers", insertId, "driver", {
      displayName: name, nationalId: b.nationalId || null, phone: phone || null, kind: "person",
    }).catch((e) => logger.error(e, "[partyService] fleet_drivers registration failed"));

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "fleet_drivers",
      entityId: insertId,
      after: { name: b.name, phone: b.phone, licenseNumber: b.licenseNumber, employeeId: b.employeeId },
    }).catch((e) => logger.error(e, "fleet background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.driver.created", entity: "fleet_drivers", entityId: insertId,
      details: `سائق جديد: ${b.name}`,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create driver error:"); }
});

// RBAC v2: vehicle detail with scope check + maskFields. Branch-scoped
// roles see only their branch's vehicles.
router.get("/vehicles/:id", authorize({ feature: "fleet.vehicles", action: "view", resource: { table: "fleet_vehicles", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = parseId(req.params.id, "id");
    // Current driver = the ACTIVE PRIMARY row in vehicle_driver_assignments
    // (the temporal source of truth; one active-primary per vehicle is enforced
    // by uq_vehicle_active_primary, migration 267). Falls back to the legacy
    // fleet_vehicles.assignedDriverId for vehicles created before the assignment
    // model — so no data migration is required and old rows keep resolving.
    // `currentDriverId` is the unified value; `assignedDriverId` stays in v.* for
    // backward compatibility. driverName/driverPhone now reflect the CURRENT driver.
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT v.*,
              COALESCE(av."driverId", v."assignedDriverId") AS "currentDriverId",
              d.name AS "driverName", d.phone AS "driverPhone"
         FROM fleet_vehicles v
         LEFT JOIN LATERAL (
           SELECT vda."driverId"
             FROM vehicle_driver_assignments vda
            WHERE vda."vehicleId" = v.id AND vda."companyId" = v."companyId"
              AND vda.status = 'active' AND vda."assignmentType" = 'primary'
            ORDER BY vda."startDate" DESC
            LIMIT 1
         ) av ON TRUE
         LEFT JOIN fleet_drivers d ON d.id = COALESCE(av."driverId", v."assignedDriverId") AND d."deletedAt" IS NULL
        WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`,
      [vehicleId, scope.companyId],
    );
    if (!row) throw new NotFoundError("المركبة غير موجودة");
    const [trips, maintenance, fuelLogs, insurance] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT t.id, t."fromLocation", t."toLocation", t.distance, t.cost, t.status, t."startTime", t."endTime", d.name AS "driverName"
         FROM fleet_trips t LEFT JOIN fleet_drivers d ON d.id=t."driverId" AND d."deletedAt" IS NULL
         WHERE t."vehicleId"=$1 AND t."companyId"=$2 AND t."deletedAt" IS NULL ORDER BY t.id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, type, description, cost, "serviceDate", status, "mileageAtService", "nextServiceDate"
         FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, "fuelDate", liters, "costPerLiter", "totalCost", "mileageAtFuel", "stationName"
         FROM fleet_fuel_logs WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, type, provider, "policyNumber", "startDate", "endDate", premium
         FROM fleet_insurance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY "endDate" DESC LIMIT 5`,
        [vehicleId, scope.companyId]
      ),
    ]);
    res.json(maskFields(req, { ...row, trips, maintenance, fuelLogs, insurance }));
  } catch (err) { handleRouteError(err, res, "Get vehicle error:"); }
});

router.get("/vehicles/:id/impact-preview", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { status } = req.query as { status?: string };
    if (!status) {
      throw new ValidationError("الحالة المطلوبة", { field: "status", fix: "أرسل معامل status في الرابط" });
    }
    const preview = await getVehicleStatusImpact(id, scope.companyId, status);
    res.json(maskFields(req, preview));
  } catch (err) { handleRouteError(err, res, "Vehicle impact preview error:"); }
});

router.patch("/vehicles/:id", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المركبة غير موجودة");
    const b = zodParse(updateVehicleSchema.safeParse(req.body));

    // State machine — if the caller is changing status, the transition must be
    // allowed from the current status. Unknown target → 422; disallowed → 409.
    if (b.status !== undefined && b.status !== existing.status) {
      if (!(VEHICLE_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(`حالة غير صالحة: ${b.status}`, { field: "status", fix: `اختر من: ${VEHICLE_STATUSES.join(", ")}` });
      }
      const allowedNext = VEHICLE_TRANSITIONS[existing.status as string] ?? [];
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(`لا يمكن نقل المركبة من "${existing.status}" إلى "${b.status}"`, { field: "status", fix: `الانتقالات المسموحة من الحالة الحالية: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد (حالة نهائية)"}` });
      }
      // Business-impact guard (blocks status change if e.g. the vehicle is on
      // an active trip and the caller tries to mark it as out_of_service).
      const preview = await getVehicleStatusImpact(id, scope.companyId, b.status);
      if (!preview.canProceed) {
        throw new ConflictError("لا يمكن تغيير الحالة بسبب ارتباطات نشطة", { field: "status", fix: "أنهِ الرحلات أو الصيانة المرتبطة بالمركبة قبل تغيير الحالة" });
      }
    }

    // Duplicate-plate pre-check on rename
    if (b.plateNumber && b.plateNumber !== existing.plateNumber) {
      const [dup] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3`,
        [b.plateNumber, scope.companyId, id]
      );
      if (dup) {
        throw new ConflictError("رقم اللوحة مسجل مسبقاً", { field: "plateNumber", fix: "اختر رقم لوحة مختلف" });
      }
    }

    // FK pre-check on assignedDriverId
    if (b.assignedDriverId !== undefined && b.assignedDriverId !== null) {
      const [drv] = await rawQuery<Record<string, unknown>>(
        `SELECT id, status FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.assignedDriverId, scope.companyId]
      );
      if (!drv) {
        throw new ValidationError("السائق غير موجود", { field: "assignedDriverId", fix: "اختر سائقاً مسجلاً في النظام" });
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: unknown[] = [];
    const trackedFields = [
      "plateNumber","make","model","year","color","status","fuelType","notes","assignedDriverId","registrationNumber","registrationExpiry","inspectionDate","nextInspectionDate","plateType","sequenceNumber","vinNumber",
      // #1733 Phase 2 — eligibility guard reads this column at PATCH time.
      "requiredLicenseClass",
      // #1733 Blocker #2 — technical profile fields.
      "vehicleType","payloadKg","boxLengthCm","boxWidthCm","boxHeightCm","axleCount","tireCount","tireSize","engineDisplacementCc","transmissionType","seatCount","hasAc","screenCount","doorCount","upholsteryType","safetyFeatures","operatingHours","equipmentAttachments",
      // #1812 Wave 0.3 — assignment-decision fields from migration 284.
      "operationalPayloadKg","validForPassengers","validForCargo",
      // #2079 Gate-PE-1 — Vehicle Capability Matrix canon (migration 315).
      "operationalPassengerCapacity","vehicleServiceTypes",
    ] as const;
    const colMap: Record<string, string> = {
      plateNumber: '"plateNumber"',
      make: "make",
      model: "model",
      year: "year",
      color: "color",
      status: "status",
      fuelType: '"fuelType"',
      notes: "notes",
      assignedDriverId: '"assignedDriverId"',
      registrationNumber: '"registrationNumber"',
      registrationExpiry: '"registrationExpiry"',
      inspectionDate: '"inspectionDate"',
      nextInspectionDate: '"nextInspectionDate"',
      plateType: '"plateType"',
      sequenceNumber: '"sequenceNumber"',
      vinNumber: '"vinNumber"',
      // #1733 Phase 2.
      requiredLicenseClass: '"requiredLicenseClass"',
      // #1733 Blocker #2 — technical profile column mapping.
      vehicleType: '"vehicleType"',
      payloadKg: '"payloadKg"',
      boxLengthCm: '"boxLengthCm"',
      boxWidthCm: '"boxWidthCm"',
      boxHeightCm: '"boxHeightCm"',
      axleCount: '"axleCount"',
      tireCount: '"tireCount"',
      tireSize: '"tireSize"',
      engineDisplacementCc: '"engineDisplacementCc"',
      transmissionType: '"transmissionType"',
      seatCount: '"seatCount"',
      hasAc: '"hasAc"',
      screenCount: '"screenCount"',
      doorCount: '"doorCount"',
      upholsteryType: '"upholsteryType"',
      safetyFeatures: '"safetyFeatures"',
      operatingHours: '"operatingHours"',
      equipmentAttachments: '"equipmentAttachments"',
      // #1812 Wave 0.3.
      operationalPayloadKg: '"operationalPayloadKg"',
      validForPassengers: '"validForPassengers"',
      validForCargo: '"validForCargo"',
      // #2079 Gate-PE-1.
      operationalPassengerCapacity: '"operationalPassengerCapacity"',
      vehicleServiceTypes: '"vehicleServiceTypes"',
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const f of trackedFields) {
      if (b[f] !== undefined && b[f] !== existing[f]) {
        let val: unknown = b[f];
        if (f === "registrationExpiry" || f === "inspectionDate" || f === "nextInspectionDate") {
          val = b[f] || null;
        } else if (f === "safetyFeatures" || f === "equipmentAttachments") {
          // jsonb columns — Array<string> must be stringified.
          val = b[f] != null ? JSON.stringify(b[f]) : null;
        }
        params.push(val);
        sets.push(`${colMap[f]}=$${params.length}`);
        before[f] = existing[f];
        after[f] = val;
      }
    }

    if (Object.keys(after).length === 0) {
      res.json(existing);
      return;
    }

    params.push(id, scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE fleet_vehicles SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);

    // Audit diff for any tracked field change.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_vehicles",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    // If the status changed, emit a dedicated lifecycle event so listeners fire.
    // Other edits get a generic `fleet.vehicle.updated` so BI / rules engine see them.
    if ("status" in after) {
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "fleet.vehicle.status_changed",
        entity: "fleet_vehicles",
        entityId: id,
        before,
        after,
      }).catch((e) => logger.error(e, "fleet background task failed"));
    } else {
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "fleet.vehicle.updated",
        entity: "fleet_vehicles",
        entityId: id,
        before,
        after,
      }).catch((e) => logger.error(e, "fleet background task failed"));
    }

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update vehicle error:"); }
});

router.delete("/vehicles/:id", authorize({ feature: "fleet.vehicles", action: "delete", resource: { table: "fleet_vehicles", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "plateNumber", status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المركبة غير موجودة");

    // Block delete if the vehicle is tied up in an active trip or in-progress
    // maintenance — otherwise the delete would orphan the driver assignment
    // and leave a ghost trip referencing a missing vehicle.
    const [activeTrip] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_trips WHERE "vehicleId"=$1 AND "companyId"=$2 AND status IN ('scheduled','planned','in_progress') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeTrip) {
      throw new ConflictError("لا يمكن حذف المركبة — توجد رحلة نشطة مرتبطة بها", { field: "status", fix: "أنهِ الرحلة النشطة أو ألغِها قبل حذف المركبة" });
    }
    const [activeMaint] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND status IN ('scheduled','in_progress') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeMaint) {
      throw new ConflictError("لا يمكن حذف المركبة — توجد صيانة قيد التنفيذ", { field: "status", fix: "أكمل أو ألغِ سجل الصيانة قبل حذف المركبة" });
    }

    const { affectedRows } = await rawExecute(`UPDATE fleet_vehicles SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.vehicle.deleted",
      entity: "fleet_vehicles",
      entityId: id,
      before: { plateNumber: existing.plateNumber, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_vehicles", entityId: id,
      after: { plateNumber: existing.plateNumber, status: existing.status },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ message: "تم حذف المركبة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete vehicle error:"); }
});

router.get("/drivers/:id", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("السائق غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get driver error:"); }
});

// TA-T18-DR Phase 1 — Driver Reputation Scoring.
//
//   GET  /drivers/:id/reputation              — read persisted breakdown
//   POST /drivers/:id/recompute-reputation    — recompute one driver
//   POST /drivers/reputation/recompute-all    — recompute every active driver
//
// Phase 1 is storage + compute + read API only. The engine integration
// (using `reputationScore` as a scoring axis with rebalanced weights)
// lands in a follow-up PR after this data has populated.
router.get(
  "/drivers/:id/reputation",
  authorize({ feature: "fleet.vehicles", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const reputation = await loadDriverReputation(scope.companyId, id);
      if (!reputation) throw new NotFoundError("السائق غير موجود");
      res.json({ data: reputation });
    } catch (err) {
      handleRouteError(err, res, "Get driver reputation error:");
    }
  },
);

const recomputeOneSchema = z.object({
  windowDays: z.coerce.number().int().min(7).max(365).optional(),
});

router.post(
  "/drivers/:id/recompute-reputation",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(recomputeOneSchema.safeParse(req.body ?? {}));
      // Verify driver belongs to scope before doing the compute.
      const [exists] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_drivers
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!exists) throw new NotFoundError("السائق غير موجود");
      const reputation = await computeDriverReputation({
        companyId: scope.companyId,
        driverId: id,
        windowDays: b.windowDays,
      });
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "fleet_drivers", entityId: id,
        after: { reputationScore: reputation.reputationScore, recomputed: true },
      }).catch((e) => logger.error(e, "driver reputation audit failed"));
      res.json({ data: reputation });
    } catch (err) {
      handleRouteError(err, res, "Recompute driver reputation error:");
    }
  },
);

router.post(
  "/drivers/reputation/recompute-all",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(recomputeOneSchema.safeParse(req.body ?? {}));
      const result = await recomputeAllDrivers({
        companyId: scope.companyId,
        windowDays: b.windowDays,
      });
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "fleet_drivers", entityId: scope.companyId,
        after: { bulkReputationRecompute: result },
      }).catch((e) => logger.error(e, "bulk reputation audit failed"));
      res.json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Bulk recompute reputation error:");
    }
  },
);

router.patch("/drivers/:id", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("السائق غير موجود");
    const b = zodParse(updateDriverSchema.safeParse(req.body));

    // State machine on driver status
    if (b.status !== undefined && b.status !== existing.status) {
      if (!(DRIVER_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(`حالة سائق غير صالحة: ${b.status}`, { field: "status", fix: `اختر من: ${DRIVER_STATUSES.join(", ")}` });
      }
      const allowedNext = DRIVER_TRANSITIONS[existing.status as string] ?? DRIVER_TRANSITIONS.available;
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(`لا يمكن نقل السائق من "${existing.status}" إلى "${b.status}"`, { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` });
      }
    }

    // Duplicate license check on rename
    if (b.licenseNumber && b.licenseNumber !== existing.licenseNumber) {
      const [dup] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM fleet_drivers WHERE "licenseNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3`,
        [b.licenseNumber, scope.companyId, id]
      );
      if (dup) {
        throw new ConflictError("رقم الرخصة مسجل مسبقاً لسائق آخر", { field: "licenseNumber", fix: "اختر رقم رخصة صحيح" });
      }
    }
    if (b.licenseExpiry) {
      const exp = new Date(b.licenseExpiry);
      if (Number.isNaN(exp.getTime())) {
        throw new ValidationError("تاريخ انتهاء الرخصة غير صالح", { field: "licenseExpiry", fix: "استخدم تنسيق التاريخ YYYY-MM-DD" });
      }
    }

    const trackedFields = [
      "name","phone","licenseNumber","licenseExpiry","status","licenseType","licenseClass",
      "nationalId","iqamaNumber","licenseIssueDate","licenseIssuingAuthority","licenseOrigin",
      "driverServiceProfile",
    ] as const;
    const colMap: Record<string, string> = {
      name: "name",
      phone: "phone",
      licenseNumber: '"licenseNumber"',
      licenseExpiry: '"licenseExpiry"',
      status: "status",
      licenseType: '"licenseType"',
      // #1812 KSA identity fields.
      nationalId: '"nationalId"',
      iqamaNumber: '"iqamaNumber"',
      licenseIssueDate: '"licenseIssueDate"',
      licenseIssuingAuthority: '"licenseIssuingAuthority"',
      licenseOrigin: '"licenseOrigin"',
      // #1733 Phase 2 — KSA driving-licence stack used by the eligibility guard.
      licenseClass: '"licenseClass"',
      // #1733 Pricing tier — service-type specialisation.
      driverServiceProfile: '"driverServiceProfile"',
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const f of trackedFields) {
      if (b[f] !== undefined && b[f] !== existing[f]) {
        params.push(b[f]);
        sets.push(`${colMap[f]}=$${params.length}`);
        before[f] = existing[f];
        after[f] = b[f];
      }
    }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id);
    const { affectedRows } = await rawExecute(`UPDATE fleet_drivers SET ${sets.join(",")} WHERE id=$${params.length} AND "companyId"=$${params.length + 1} AND "deletedAt" IS NULL`, [...params, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_drivers",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "fleet.driver.status_changed" : "fleet.driver.updated",
      entity: "fleet_drivers",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update driver error:"); }
});

// Drivers fall under the parent "fleet" feature; no dedicated catalog
// entry yet. Delete checks scope against the drivers table.
router.delete("/drivers/:id", authorize({ feature: "fleet.vehicles", action: "delete", resource: { table: "fleet_drivers", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, status FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("السائق غير موجود");

    const [activeTrip] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_trips WHERE "driverId"=$1 AND "companyId"=$2 AND status IN ('scheduled','planned','in_progress') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeTrip) {
      throw new ConflictError("لا يمكن حذف السائق — توجد رحلة نشطة مسندة إليه", { field: "status", fix: "أنهِ أو ألغِ الرحلة النشطة قبل حذف السائق" });
    }

    const { affectedRows } = await rawExecute(`UPDATE fleet_drivers SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.driver.deleted",
      entity: "fleet_drivers",
      entityId: id,
      before: { name: existing.name, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_drivers", entityId: id,
      after: { name: existing.name, status: existing.status },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ message: "تم حذف السائق بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete driver error:"); }
});

// #2713 (تعميم) — استرجاع سائق محذوف ناعمًا (سلة المحذوفات). صلاحية حذف + Audit.
router.post("/drivers/:id/restore", authorize({ feature: "fleet.vehicles", action: "delete", resource: { table: "fleet_drivers", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE fleet_drivers SET "deletedAt"=NULL WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NOT NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("لا يوجد سائق محذوف بهذا المعرّف");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "fleet.driver.restored", entity: "fleet_drivers", entityId: id }).catch((e) => logger.error(e, "fleet background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "restore", entity: "fleet_drivers", entityId: id }).catch((e) => logger.error(e, "fleet background task failed"));
    res.json({ message: "تم استرجاع السائق" });
  } catch (err) { handleRouteError(err, res, "Restore driver error:"); }
});

// ─── Driver portal-account provisioning (#1354) ──────────────────────────
// Operator-side endpoints to manage driver_portal_accounts (migration 242).
// Mirrors the client portal-account endpoints in routes/clients.ts. The
// driver-side login + my-trips view lives in routes/driverPortal.ts and
// reads from the same table.
const driverPortalAccountCreateSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

const driverPortalAccountUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل").optional(),
});

router.get("/drivers/:id/portal-account", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [account] = await rawQuery<Record<string, unknown>>(
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt"
       FROM driver_portal_accounts
       WHERE "driverId" = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    res.json({ account: account ?? null });
  } catch (err) { handleRouteError(err, res, "Get driver portal account error:"); }
});

router.post("/drivers/:id/portal-account", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(driverPortalAccountCreateSchema.safeParse(req.body ?? {}));
    const email = b.email.trim().toLowerCase();
    const [driver] = await rawQuery<{ id: number }>(
      `SELECT id FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!driver) throw new NotFoundError("السائق غير موجود");
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM driver_portal_accounts WHERE "driverId" = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (existing) throw new ConflictError("يوجد حساب بوابة لهذا السائق مسبقاً");
    const [emailTaken] = await rawQuery<{ id: number }>(
      `SELECT id FROM driver_portal_accounts WHERE email = $1`,
      [email]
    );
    if (emailTaken) throw new ConflictError("هذا البريد الإلكتروني مستخدم بالفعل في بوابة السائقين");
    const passwordHash = await hashPassword(b.password);
    const { insertId } = await rawExecute(
      `INSERT INTO driver_portal_accounts ("driverId", "companyId", email, "passwordHash", "isActive", "mustChangePassword")
       VALUES ($1, $2, $3, $4, true, true)`,
      [id, scope.companyId, email, passwordHash]
    );
    assertInsert(insertId, "driver_portal_accounts");
    const [account] = await rawQuery<Record<string, unknown>>(
      `SELECT id, email, "isActive", "mustChangePassword", "createdAt" FROM driver_portal_accounts WHERE id = $1`,
      [insertId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "driver.portal_created", entity: "driver_portal_accounts", entityId: insertId, details: JSON.stringify({ driverId: id, email }) }).catch((e) => logger.error(e, "fleet background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "create", entity: "driver_portal_accounts", entityId: insertId, after: { driverId: id, email } }).catch((e) => logger.error(e, "fleet background task failed"));
    res.status(201).json({ account });
  } catch (err) { handleRouteError(err, res, "Create driver portal account error:"); }
});

router.patch("/drivers/:id/portal-account", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(driverPortalAccountUpdateSchema.safeParse(req.body ?? {}));
    const [account] = await rawQuery<{ id: number }>(
      `SELECT id FROM driver_portal_accounts WHERE "driverId" = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!account) throw new NotFoundError("حساب البوابة غير موجود");
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.isActive !== undefined) { params.push(b.isActive); sets.push(`"isActive" = $${params.length}`); }
    if (b.password) {
      const hash = await hashPassword(b.password);
      params.push(hash); sets.push(`"passwordHash" = $${params.length}`);
      params.push(true); sets.push(`"mustChangePassword" = $${params.length}`);
    }
    // Any reset (password OR suspend) bumps tokenVersion so all
    // already-issued JWTs die immediately. Same model as client portal.
    if (b.password || b.isActive === false) {
      sets.push(`"tokenVersion" = COALESCE("tokenVersion", 0) + 1`);
    }
    if (sets.length === 0) { res.json({ account }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(account.id);
    await rawExecute(
      `UPDATE driver_portal_accounts SET ${sets.join(",")} WHERE id = $${params.length} AND "companyId" = $${params.length + 1}`,
      [...params, scope.companyId]
    );
    const [updated] = await rawQuery<Record<string, unknown>>(
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt" FROM driver_portal_accounts WHERE id = $1`,
      [account.id]
    );
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "driver_portal_accounts", entityId: account.id, after: { passwordReset: !!b.password, suspended: b.isActive === false } }).catch((e) => logger.error(e, "fleet background task failed"));
    res.json({ account: updated });
  } catch (err) { handleRouteError(err, res, "Update driver portal account error:"); }
});

router.get("/trips", authorize({ feature: "fleet.trips", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, search, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', branchColumn: 'v."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND t.status = $${paramIdx}`; params.push(status); paramIdx++; }
    if (search) { params.push(`%${search}%`); where += ` AND (v."plateNumber" ILIKE $${paramIdx} OR d.name ILIKE $${paramIdx})`; paramIdx++; }
    // #651 follow-up — normalize to createdAt per PR #653 template (was t."startTime")
    if (dateFrom) { where += ` AND t."createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND t."createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT t.*, t."fromLocation" AS origin, t."toLocation" AS destination, t."startTime" AS "tripDate",
              v."plateNumber", v."plateNumber" AS "vehiclePlate", d.name AS "driverName"
       FROM fleet_trips t LEFT JOIN fleet_vehicles v ON v.id=t."vehicleId" AND v."deletedAt" IS NULL LEFT JOIN fleet_drivers d ON d.id=t."driverId" AND d."deletedAt" IS NULL WHERE ${where} AND t."deletedAt" IS NULL ORDER BY t.id DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet trips error:"); }
});

// RBAC v2: trip detail. Drivers can have scope=self via fleet.trips.my
// (self-service) for their own trips; managers via fleet.trips at branch.
router.get("/trips/:id", authorize({ feature: "fleet.trips", action: "view", resource: { table: "fleet_trips", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT t.*, t."fromLocation" AS origin, t."toLocation" AS destination, t."startTime" AS "tripDate",
              v."plateNumber", v."plateNumber" AS "vehiclePlate", d.name AS "driverName"
       FROM fleet_trips t
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."deletedAt" IS NULL
       LEFT JOIN fleet_drivers d ON d.id = t."driverId" AND d."deletedAt" IS NULL
       WHERE t.id = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL`,
      [tripId, scope.companyId]
    );
    if (!row) throw new NotFoundError("الرحلة غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get trip error:"); }
});

router.post("/trips", authorize({ feature: "fleet.trips", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createTripSchema.safeParse(req.body));

    // #2079 TA-T18-14 — verify the parent dispatch order belongs to
    // the caller's company. The zod schema already enforces a
    // positive integer; this lookup turns "free-form trip data
    // bypassing the guards" into a hard 404 when the upstream
    // dispatch row doesn't exist.
    const [parentDispatch] = await rawQuery<{ id: number }>(
      `SELECT id FROM transport_dispatch_orders
        WHERE id = $1 AND "companyId" = $2`,
      [b.dispatchOrderId, scope.companyId],
    );
    if (!parentDispatch) {
      throw new NotFoundError("أمر التوزيع المرجعي غير موجود");
    }

    if (b.vehicleId) {
      const [vehicle] = await rawQuery<Record<string, unknown>>(
        `SELECT v.id, v."assignedDriverId", v.status,
                (SELECT MAX(fi."endDate") FROM fleet_insurance fi WHERE fi."vehicleId" = v.id AND fi."companyId" = v."companyId" AND fi."deletedAt" IS NULL) AS "insuranceEnd"
         FROM fleet_vehicles v WHERE v.id = $1 AND v."companyId" = $2 AND v."deletedAt" IS NULL`,
        [b.vehicleId, scope.companyId]
      );
      if (vehicle) {
        if (!vehicle.assignedDriverId && !b.driverId) {
          throw new ValidationError(
            "لا يمكن بدء رحلة بدون سائق مرتبط بالمركبة",
            {
              field: "driverId",
              fix: "عيّن سائقاً للمركبة أو حدد سائقاً في الطلب",
            },
          );
        }
        const insuranceEnd = vehicle.insuranceEnd ? new Date(vehicle.insuranceEnd as string | Date) : null;
        if (!insuranceEnd || insuranceEnd < new Date()) {
          throw new ValidationError(
            "لا يمكن بدء رحلة بمركبة تأمينها منتهي",
            {
              field: "vehicleId",
              fix: "جدد تأمين المركبة قبل بدء الرحلة",
            },
          );
        }
      }
    }

    const fromLat = b.fromLat || 0;
    const fromLng = b.fromLng || 0;
    const toLat = b.toLat || 0;
    const toLng = b.toLng || 0;

    let estimatedDistanceKm = b.distance || 0;
    if (fromLat && fromLng && toLat && toLng) {
      estimatedDistanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
    }

    let selectedVehicleId = b.vehicleId || null;
    let selectedDriverId = b.driverId || null;

    // NF-FLEET-01 — when the operator picks a driver explicitly, the
    // auto-pick branch below is skipped, so we'd otherwise dispatch a
    // trip to a driver that is `on_leave`, `inactive`, or off-duty. The
    // auto-pick branch already filters `status='available'`; mirror that
    // check on the manual path.
    if (b.driverId) {
      const [drv] = await rawQuery<{ id: number; status: string | null }>(
        `SELECT id, status FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [Number(b.driverId), scope.companyId]
      );
      if (!drv) {
        throw new ValidationError("السائق غير موجود", { field: "driverId" });
      }
      if (drv.status !== "available") {
        throw new ConflictError(
          `لا يمكن تعيين السائق — الحالة الحالية "${drv.status ?? "غير محددة"}"`,
          { field: "driverId", fix: "اختر سائقاً بحالة available" }
        );
      }
    }

    if (!selectedVehicleId) {
      // Pre-aggregate fleet_trips + fleet_insurance once instead of
      // running scalar subqueries per row. Original was N+1: 20
      // vehicles × 2 subqueries = ~41 round-trips. CTEs reduce to one
      // scan per joined table.
      const vehicles = await rawQuery<Record<string, unknown>>(
        `WITH v_trip_counts AS (
           SELECT "vehicleId", COUNT(*) AS "tripCount"
           FROM fleet_trips
           WHERE status='completed' AND "deletedAt" IS NULL
           GROUP BY "vehicleId"
         ),
         v_insurance_max AS (
           SELECT "vehicleId", MAX("endDate") AS "insuranceEnd"
           FROM fleet_insurance
           WHERE "companyId"=$1 AND "deletedAt" IS NULL
           GROUP BY "vehicleId"
         )
         SELECT v.*,
                COALESCE(vtc."tripCount", 0)::int AS "tripCount",
                vim."insuranceEnd"
         FROM fleet_vehicles v
         LEFT JOIN v_trip_counts vtc ON vtc."vehicleId" = v.id
         LEFT JOIN v_insurance_max vim ON vim."vehicleId" = v.id
         WHERE v."companyId"=$1 AND v.status='available' AND v."deletedAt" IS NULL
         ORDER BY v.id LIMIT 20`,
        [scope.companyId]
      );
      if (vehicles.length > 0) {
        let best = vehicles[0];
        let bestScore = -Infinity;
        for (const v of vehicles) {
          let score = 0;
          const insuranceEnd = v.insuranceEnd ? new Date(v.insuranceEnd as string | Date) : null;
          const hasValidInsurance = insuranceEnd && insuranceEnd > new Date();
          if (hasValidInsurance) score += 20;
          if (fromLat && fromLng && v.latitude && v.longitude) {
            const dist = haversineKm(fromLat, fromLng, Number(v.latitude), Number(v.longitude));
            score += Math.max(0, 30 - dist);
          }
          score += Math.max(0, 10 - Number(v.tripCount || 0) * 0.1);
          if (score > bestScore) { bestScore = score; best = v; }
        }
        selectedVehicleId = best.id as number;
      }
    }

    if (!selectedDriverId) {
      // Pre-aggregate fleet_trips counts once instead of running TWO
      // scalar subqueries per row. Original was N+1: 20 drivers × 2
      // subqueries = ~41 round-trips. The single CTE below uses
      // FILTER to count both completed + in-progress in one scan.
      const drivers = await rawQuery<Record<string, unknown>>(
        `WITH d_trip_counts AS (
           SELECT "driverId",
                  COUNT(*) FILTER (WHERE status='completed') AS "tripCount",
                  COUNT(*) FILTER (WHERE status='in_progress') AS "activeTrips"
           FROM fleet_trips
           WHERE "deletedAt" IS NULL
           GROUP BY "driverId"
         )
         SELECT d.*,
                COALESCE(dtc."tripCount", 0)::int AS "tripCount",
                COALESCE(dtc."activeTrips", 0)::int AS "activeTrips",
                COALESCE(d.rating, 3) AS "driverRating"
         FROM fleet_drivers d
         LEFT JOIN d_trip_counts dtc ON dtc."driverId" = d.id
         WHERE d."companyId"=$1 AND d.status='available'
           AND d."deletedAt" IS NULL
           AND (d."licenseExpiry" IS NULL OR d."licenseExpiry" > CURRENT_DATE)
         ORDER BY d.id LIMIT 20`,
        [scope.companyId]
      );
      if (drivers.length > 0) {
        let best = drivers[0];
        let bestScore = -Infinity;
        const maxTrips = Math.max(...drivers.map((d) => Number(d.tripCount) || 1), 1);
        for (const d of drivers) {
          const tripCount = Number(d.tripCount) || 0;
          const fewestTripsScore = (1 - tripCount / maxTrips) * 0.4;

          let proximityScore = 0;
          if (fromLat && fromLng && d.latitude && d.longitude) {
            const dist = haversineKm(fromLat, fromLng, Number(d.latitude), Number(d.longitude));
            proximityScore = (1 / (1 + dist)) * 0.3;
          } else {
            proximityScore = 0.15;
          }

          const hasValidLicense = d.licenseExpiry ? new Date(d.licenseExpiry as string | Date) > new Date() : true;
          const licenseScore = hasValidLicense ? 0.2 : 0;

          const rating = Number(d.driverRating) || 3;
          const ratingScore = (rating / 5) * 0.1;

          const combined = fewestTripsScore + proximityScore + licenseScore + ratingScore;
          if (combined > bestScore) { bestScore = combined; best = d; }
        }
        selectedDriverId = best.id as number;
      }
    }

    if (selectedVehicleId && !b.vehicleId) {
      const [autoVehicle] = await rawQuery<Record<string, unknown>>(
        `SELECT v.id,
                (SELECT MAX(fi."endDate") FROM fleet_insurance fi WHERE fi."vehicleId" = v.id AND fi."companyId" = v."companyId" AND fi."deletedAt" IS NULL) AS "insuranceEnd"
         FROM fleet_vehicles v WHERE v.id = $1 AND v."companyId" = $2 AND v."deletedAt" IS NULL`,
        [selectedVehicleId, scope.companyId]
      );
      if (autoVehicle) {
        const insuranceEnd = autoVehicle.insuranceEnd ? new Date(autoVehicle.insuranceEnd as string | Date) : null;
        if (!insuranceEnd || insuranceEnd < new Date()) {
          throw new ValidationError(
            "لا يمكن بدء رحلة بمركبة تأمينها منتهي",
            {
              field: "vehicleId",
              fix: "جدد تأمين المركبة قبل بدء الرحلة أو حدد مركبة بتأمين ساري",
            },
          );
        }
      }
    }

    if (!selectedDriverId) {
      throw new ValidationError("لا يمكن تسليم مركبة بدون سائق مرتبط", {
        field: "driverId",
        fix: "حدد سائقاً للرحلة أو أضف سائقين متاحين في النظام",
      });
    }

    if (b.clientId) {
      const [cl] = await rawQuery<{ id: number }>(`SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [b.clientId, scope.companyId]);
      if (!cl) throw new ValidationError("العميل غير موجود", { field: "clientId", fix: "اختر عميلاً من قائمة العملاء." });
    }

    // FLT-CONST-01 — trip cost estimates used to bake in hardcoded fuel
    // efficiency (10 km/L), driver fare rate (0.5/km) and depreciation
    // rate (0.15/km). The estimate is stored on the trip row and feeds
    // fleet cost reports, so tenants in non-SA jurisdictions or with
    // different fleets had no way to tune them. Read from system_settings
    // with sensible fallbacks; explicit per-trip overrides still win.
    const fleetSettings = await getFleetCostSettings(scope.companyId);
    const fuelPricePerLiter = b.fuelPricePerLiter || fleetSettings.fuelPricePerLiter;
    const fuelEfficiency = fleetSettings.fuelEfficiencyKmPerLiter;
    const estimatedFuelCost = (estimatedDistanceKm / fuelEfficiency) * fuelPricePerLiter;
    const driverFare = b.driverFare || estimatedDistanceKm * fleetSettings.driverFarePerKm;
    const depreciation = estimatedDistanceKm * fleetSettings.depreciationPerKm;
    const totalEstimatedCost = estimatedFuelCost + driverFare + depreciation;

    // Idempotency — a double-click on the «Create Trip» button used to
    // create two rows. The driver/vehicle status guard caught duplicates
    // only when the user explicitly passed the same ids; in auto-select
    // mode click #2 picked a DIFFERENT available driver/vehicle, both
    // INSERTs succeeded, and the operator ended up with two trips. The
    // partial-unique index on (companyId, sourceKey) — migration 196 —
    // collapses retried POSTs onto the same row at the DB level.
    // #2079 TA-T18-14 — encode the parent dispatch order in the
    // canonical sourceKey shape so the existing (companyId, sourceKey)
    // partial-unique index doubles as the "one trip per dispatch
    // order" guarantee. The idempotency token suffix lets a retried
    // POST land on the same row, but two DIFFERENT dispatch orders
    // can never share the prefix — they're distinct keys by
    // construction.
    const idempotencyToken = requestIdempotencyToken(req);
    const sourceKey = `dispatch:${b.dispatchOrderId}:${idempotencyToken}`;
    const [preExisting] = await rawQuery<{ id: number }>(
      `SELECT id FROM fleet_trips WHERE "companyId" = $1 AND "sourceKey" = $2 LIMIT 1`,
      [scope.companyId, sourceKey]
    );
    if (preExisting) {
      markIdempotencyReplay(req, res, true);
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM fleet_trips WHERE id = $1 AND "companyId" = $2`,
        [preExisting.id, scope.companyId]
      );
      res.status(200).json({ ...row, idempotentReplay: true });
      return;
    }

    // Numbering center (Issue #1141) — trip ref from authority.
    // Issued OUTSIDE the transaction so the counter only burns when
    // sourceKey upsert is fresh (handled by the link-back below).
    const issuedTrip = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "fleet",
      entityKey: "fleet_trip",
      entityTable: "fleet_trips",
      actorId: scope.userId,
      metadata: { sourceKey, vehicleId: selectedVehicleId },
      expectedTiming: "on_draft",
    });
    let alreadyExists = false;
    const insertId = await withTransaction(async (client) => {
      const tripResult = await client.query(
        `INSERT INTO fleet_trips ("companyId","vehicleId","driverId","clientId","fromLocation","toLocation","fromLat","fromLng","toLat","toLng","distance","cost","startTime",status,notes,"sourceKey",ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT ("companyId", "sourceKey") WHERE "sourceKey" IS NOT NULL DO NOTHING
         RETURNING id`,
        [scope.companyId, selectedVehicleId, selectedDriverId, b.clientId, b.fromLocation, b.toLocation, fromLat || null, fromLng || null, toLat || null, toLng || null, estimatedDistanceKm, totalEstimatedCost, b.startTime || new Date().toISOString(), 'in_progress', b.notes, sourceKey, issuedTrip.number]
      );
      let tripId = tripResult.rows[0]?.id;
      if (tripId) {
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [tripId, issuedTrip.assignmentId]
        );
      }
      if (!tripId) {
        // Race: a concurrent POST with the same key won the INSERT.
        // Fetch the existing row and short-circuit — the driver/vehicle
        // UPDATEs already ran on the winning side. Void the issued
        // number through the service (not a direct UPDATE) so the
        // lifecycle gate runs and the audit log records the void.
        // voidNumber opens its own withTransaction which joins ours
        // via SAVEPOINT.
        const { rows: existingRows } = await client.query(
          `SELECT id FROM fleet_trips WHERE "companyId" = $1 AND "sourceKey" = $2 LIMIT 1`,
          [scope.companyId, sourceKey]
        );
        tripId = existingRows[0]?.id;
        await voidNumber({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          assignmentId: issuedTrip.assignmentId,
          actorId: scope.userId,
          reason: 'fleet trip de-duplicated by sourceKey',
        });
        alreadyExists = true;
        return tripId;
      }

      if (selectedVehicleId) {
        const vResult = await client.query(`UPDATE fleet_vehicles SET status='in_use', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='available' AND "deletedAt" IS NULL`, [selectedVehicleId, scope.companyId]);
        if (!vResult.rowCount) throw new NotFoundError("المركبة غير موجودة أو حالتها غير مناسبة");
      }
      if (selectedDriverId) {
        const dResult = await client.query(`UPDATE fleet_drivers SET status='on_trip' WHERE id=$1 AND "companyId"=$2 AND status='available' AND "deletedAt" IS NULL`, [selectedDriverId, scope.companyId]);
        if (!dResult.rowCount) throw new NotFoundError("السائق غير موجود أو حالته غير مناسبة");
      }

      return tripId;
    });
    markIdempotencyReplay(req, res, alreadyExists);

    if (selectedDriverId) {
      try {
        const [driverInfo] = await rawQuery<{ employeeId: number | null; assignmentId: number | null; phone: string | null; name: string | null }>(
          `SELECT d."employeeId", d.phone, d.name, ea.id AS "assignmentId" FROM fleet_drivers d
           LEFT JOIN employee_assignments ea ON ea."employeeId"=d."employeeId" AND ea.status='active' AND ea."companyId"=$2
           WHERE d.id=$1 AND d."companyId"=$2 AND d."deletedAt" IS NULL`, [selectedDriverId, scope.companyId]);
        const tripSummary = `رحلة من ${b.fromLocation || 'غير محدد'} إلى ${b.toLocation || 'غير محدد'} — المسافة التقديرية: ${estimatedDistanceKm.toFixed(1)} كم`;
        // In-system notification — only for drivers linked to an active
        // employee assignment (i.e. drivers who are also staff with an
        // ERP login). The badge appears in the regular notifications inbox.
        if (driverInfo?.assignmentId) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: driverInfo.assignmentId,
            type: "fleet_trip",
            title: "رحلة جديدة مسندة إليك",
            body: tripSummary,
            priority: "normal",
            refType: "fleet_trips",
            refId: insertId,
          }).catch((e) => logger.error(e, "fleet background task failed"));
        }
        // WhatsApp dispatch — reaches drivers regardless of employee
        // linkage as long as the driver row has a phone number. Routes
        // through messageSender (DLP-scanned, audited, queued in
        // outbound_queue). Best-effort: any send failure logs but
        // doesn't fail the trip creation.
        if (driverInfo?.phone) {
          sendMessage({
            channel: "whatsapp",
            recipient: driverInfo.phone,
            recipientName: driverInfo.name,
            body: `رحلة جديدة #${insertId} مسندة إليك:\n${tripSummary}\nالرجاء الاطلاع على تفاصيل الرحلة في النظام.`,
            companyId: scope.companyId,
            userId: scope.userId,
            relatedType: "fleet_trips",
            relatedId: insertId,
            templateKey: "fleet.trip.driver_assigned",
            eventAction: "fleet.trip.driver_notified",
          }).catch((e) => logger.error({ err: e, driverId: selectedDriverId, tripId: insertId }, "[fleet] driver WhatsApp dispatch failed"));
        } else {
          logger.info({ driverId: selectedDriverId, tripId: insertId }, "[fleet] driver has no phone — WhatsApp dispatch skipped");
        }
      } catch (notifErr) { logger.error(notifErr, "Trip notification error:"); }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_trips", entityId: insertId,
      after: { vehicleId: selectedVehicleId, driverId: selectedDriverId, distance: estimatedDistanceKm, cost: totalEstimatedCost },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.created", entity: "fleet_trips", entityId: insertId,
      details: JSON.stringify({ vehicleId: selectedVehicleId, driverId: selectedDriverId, distance: estimatedDistanceKm, fromLocation: b.fromLocation, toLocation: b.toLocation }),
    }).catch((e) => logger.error(e, "fleet background task failed"));
    res.status(201).json({
      ...row,
      estimatedCostBreakdown: { fuel: estimatedFuelCost, driverFare, depreciation, total: totalEstimatedCost },
      vehicleAutoSelected: !b.vehicleId,
      driverAutoSelected: !b.driverId,
    });
  } catch (err) { handleRouteError(err, res, "Create trip error:"); }
});

router.post("/trips/:id/complete", authorize({ feature: "fleet.trips", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = parseId(req.params.id, "id");
    const b = zodParse(completeTripSchema.safeParse(req.body));

    const [trip] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [tripId, scope.companyId]);
    if (!trip) throw new NotFoundError("الرحلة غير موجودة");
    if (trip.status === "completed") {
      throw new ValidationError("الرحلة مكتملة بالفعل", {
        field: "status",
        fix: "لا يمكن إكمال رحلة مكتملة مرة أخرى",
      });
    }
    if (trip.status === "cancelled") {
      throw new ValidationError("الرحلة ملغاة", {
        field: "status",
        fix: "لا يمكن إكمال رحلة ملغاة",
      });
    }

    const endMileage = b.endMileage || 0;
    const startMileage = b.startMileage || 0;
    const actualDistanceKm = endMileage > startMileage ? endMileage - startMileage : (Number(trip.distance) || 0);
    // FLT-CONST-01 — same per-company tunable constants used by the
    // /trips POST estimate. Tying both paths to the same helper means
    // the estimate-vs-actual delta on cost reports reflects real
    // variance, not a rate mismatch between create and complete.
    const completeSettings = await getFleetCostSettings(scope.companyId);
    const fuelPricePerLiter = b.fuelPricePerLiter || completeSettings.fuelPricePerLiter;
    const fuelEfficiency = completeSettings.fuelEfficiencyKmPerLiter;
    const estimatedFuelCost = (actualDistanceKm / fuelEfficiency) * fuelPricePerLiter;
    // M7 fix: if any fuel_logs carry tripId = this trip, sum their
    // actual cost and use THAT instead of the estimate. The fuel-log
    // route already posted GLs for those rows, so re-posting the
    // estimate would double-count fuel expense on the same trip.
    //
    // Behaviour:
    //   - No tagged logs (legacy fuel flow): use estimate (status quo).
    //   - Has tagged logs: use their sum. Estimate is ignored entirely.
    //   - Mixed (some tagged, some untagged): we treat untagged as
    //     "different fill-ups, not this trip" and still use the sum
    //     of the tagged ones. Operators who tag selectively are
    //     telling us which fills belonged to which trip.
    const [actualFuelRow] = await rawQuery<{ total: string }>(
      `SELECT COALESCE(SUM("totalCost"), 0)::text AS total
         FROM fleet_fuel_logs
        WHERE "companyId" = $1 AND "tripId" = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, tripId]
    ).catch(() => [{ total: "0" }]);
    const actualFuelFromLogs = Number(actualFuelRow?.total ?? 0);
    const actualFuelCost = actualFuelFromLogs > 0 ? actualFuelFromLogs : estimatedFuelCost;
    const driverFare = b.driverFare || actualDistanceKm * completeSettings.driverFarePerKm;
    const depreciation = actualDistanceKm * completeSettings.depreciationPerKm;
    const totalCost = actualFuelCost + driverFare + depreciation;

    await applyTransition({
      entity: "fleet_trips",
      id: tripId,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "fleet.trip.completed",
      fromStates: ["in_progress"],
      toState: "completed",
      setExtras: { endTime: { raw: "NOW()" }, distance: actualDistanceKm, cost: totalCost },
      onApply: async (_row, client) => {
        if (trip.vehicleId) {
          const vRes = await client.query(`UPDATE fleet_vehicles SET status='available', "currentMileage"="currentMileage"+$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND status='in_use' AND "deletedAt" IS NULL`, [actualDistanceKm, trip.vehicleId, scope.companyId]);
          if (!vRes.rowCount) logger.warn({ vehicleId: trip.vehicleId }, "trip complete: vehicle status reset affected 0 rows");
        }
        if (trip.driverId) {
          const dRes = await client.query(`UPDATE fleet_drivers SET status='available', "totalTrips"=COALESCE("totalTrips",0)+1 WHERE id=$1 AND "companyId"=$2 AND status='on_trip' AND "deletedAt" IS NULL`, [trip.driverId, scope.companyId]);
          if (!dRes.rowCount) logger.warn({ driverId: trip.driverId }, "trip complete: driver status reset affected 0 rows");
        }
        // #12 auto-status — a trip spun up from a dispatch order carries the
        // canonical sourceKey "dispatch:<orderId>:<token>" (see POST /trips).
        // Completing that trip auto-completes the dispatch order and cascades
        // to its booking line + booking, so the operator never closes the
        // dispatch-board entry by hand. Mirrors the terminal side-effects of
        // POST /transport/dispatch-orders/:id/action (status + completedAt, end
        // the live navigation session, stamp driver duty) and shares the
        // booking cascade via cascadeDispatchToBooking. Guarded to orders still
        // "executing" so it never force-closes one the operator already moved
        // past, and is a silent no-op for ad-hoc (non-dispatch) trips. Runs on
        // the transition's own client, so it commits atomically with the trip.
        const tripSourceKey = typeof trip.sourceKey === "string" ? trip.sourceKey : "";
        const dispatchLink = /^dispatch:(\d+):/.exec(tripSourceKey);
        if (dispatchLink) {
          const dispatchOrderId = Number(dispatchLink[1]);
          const dispRes = await client.query<{ id: number; bookingLineId: number; driverId: number | null }>(
            `SELECT id, "bookingLineId", "driverId"
               FROM transport_dispatch_orders
              WHERE id = $1 AND "companyId" = $2 AND status = 'executing'
              FOR UPDATE`,
            [dispatchOrderId, scope.companyId],
          );
          const disp = dispRes.rows[0];
          if (disp) {
            await client.query(
              `UPDATE transport_dispatch_orders
                  SET status = 'completed', "completedAt" = NOW(), "updatedAt" = NOW()
                WHERE id = $1 AND "companyId" = $2`,
              [disp.id, scope.companyId],
            );
            await client.query(
              `UPDATE driver_navigation_sessions
                  SET status = 'ended', "endedAt" = NOW(), "updatedAt" = NOW()
                WHERE "dispatchOrderId" = $1 AND "companyId" = $2
                  AND status NOT IN ('ended', 'cancelled')`,
              [disp.id, scope.companyId],
            );
            if (disp.driverId) {
              await client.query(
                `UPDATE fleet_drivers SET "lastDutyEndedAt" = NOW(), "updatedAt" = NOW()
                  WHERE id = $1 AND "companyId" = $2`,
                [disp.driverId, scope.companyId],
              );
            }
            await cascadeDispatchToBooking(client, {
              bookingLineId: disp.bookingLineId,
              target: "completed",
              companyId: scope.companyId,
            });
          }
        }
      },
    });

    const { fleetEngine } = await import("../lib/engines/index.js");
    // M7 fix continued: when actual fuel logs already posted GLs for
    // this trip, exclude their cost from the trip-completion GL —
    // posting it again would double-count fuel expense. Driver fare
    // and depreciation are NOT in any other JE so they always post.
    const glFuelCost = actualFuelFromLogs > 0 ? 0 : actualFuelCost;
    const glTotalCost = glFuelCost + driverFare + depreciation;
    const tripGLResult = await fleetEngine.postTripCompletionGL(
      { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
      { id: tripId, vehicleId: trip.vehicleId as number, fuelCost: glFuelCost, driverFare, depreciation, totalCost: glTotalCost }
    );
    const journalEntryId = tripGLResult?.journalId ?? null;

    // Persist audit + event via the shared helpers so they land in audit_logs
    // and event_logs with consistent shape. Swallowing this behind a raw
    // INSERT used to mean a failed insert would silently drop the lifecycle
    // record.
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "complete", entity: "fleet_trips", entityId: tripId,
      before: { status: trip.status, distance: trip.distance, cost: trip.cost },
      after: {
        status: "completed", distance: actualDistanceKm, cost: totalCost,
        fuelCost: actualFuelCost, driverFare, depreciation, journalEntryId,
      },
    }).catch((e) => logger.error(e, "fleet background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.trip.completed", entity: "fleet_trips", entityId: tripId,
      details: `رحلة #${tripId} — ${actualDistanceKm.toFixed(1)} كم — تكلفة ${totalCost.toFixed(2)} ريال`,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.completed", entity: "fleet_trips", entityId: tripId,
      details: JSON.stringify({ status: "completed", distance: actualDistanceKm, cost: totalCost, fuelCost: actualFuelCost, driverFare, depreciation, journalEntryId }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    const [updated] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [tripId, scope.companyId]);
    res.json({
      ...updated,
      event: 'fleet.trip.completed',
      journalEntryId,
      costBreakdown: { fuel: actualFuelCost, driverFare, depreciation, total: totalCost },
    });
  } catch (err) { handleRouteError(err, res, "Complete trip error:"); }
});

/** Cancel a trip — frees vehicle+driver via the lifecycle engine, no cost posted */
router.post("/trips/:id/cancel", authorize({ feature: "fleet.trips", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = parseId(req.params.id, "id");
    const { reason: rawReason } = zodParse(cancelTripSchema.safeParse(req.body));
    const reason = (rawReason as string | undefined)?.trim();
    if (!reason) {
      throw new ValidationError("سبب الإلغاء مطلوب", {
        field: "reason",
        fix: "اكتب سبب إلغاء الرحلة",
      });
    }

    const updated = await applyTransition({
      entity: "fleet_trips",
      id: tripId,
      scope,
      action: "fleet.trip.cancelled",
      fromStates: ["scheduled", "planned", "in_progress"],
      toState: "cancelled",
      reason,
      setExtras: {
        cancelledAt: { raw: "NOW()" },
        cancellationReason: reason,
      },
      after: { cancellationReason: reason },
      onApply: async (row, client) => {
        // Release vehicle and driver so the resources come back to the pool.
        if (row.vehicleId) {
          await client.query(
            `UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='in_use' AND "deletedAt" IS NULL`,
            [row.vehicleId, scope.companyId]
          );
        }
        if (row.driverId) {
          await client.query(
            `UPDATE fleet_drivers SET status='available' WHERE id=$1 AND "companyId"=$2 AND status='on_trip' AND "deletedAt" IS NULL`,
            [row.driverId, scope.companyId]
          );
        }
        // Re-dispatch on cancel (operator decision) — a cancelled trip is NOT a
        // cancelled booking. If this trip came from a dispatch order
        // ("dispatch:<id>:<token>" sourceKey) that's still mid-flight, send the
        // order back to the pool so another driver can be assigned, rather than
        // cancelling the operational need. The order returns to "pending" (its
        // accept/start stamps cleared; driverId/vehicleId are NOT NULL columns
        // so they linger as the last assignment until the order is re-notified
        // or reassigned via the assignment endpoint), its live navigation
        // session is cancelled, and the booking line returns to "open"
        // (re-pickable; 'open' is the valid awaiting-dispatch booking-line
        // state — 'pending' is a dispatch-ORDER status, not a line one).
        // The booking itself is left unchanged — mirroring the
        // driver-decline flow. A silent no-op for ad-hoc trips or orders already
        // terminal. Runs on the transition client → atomic with the cancel.
        const tripSourceKey = typeof row.sourceKey === "string" ? row.sourceKey : "";
        const dispatchLink = /^dispatch:(\d+):/.exec(tripSourceKey);
        if (dispatchLink) {
          const dispatchOrderId = Number(dispatchLink[1]);
          const dispRes = await client.query<{ id: number; bookingLineId: number }>(
            `SELECT id, "bookingLineId"
               FROM transport_dispatch_orders
              WHERE id = $1 AND "companyId" = $2 AND status IN ('accepted', 'executing')
              FOR UPDATE`,
            [dispatchOrderId, scope.companyId],
          );
          const disp = dispRes.rows[0];
          if (disp) {
            await client.query(
              `UPDATE transport_dispatch_orders
                  SET status = 'pending', "acceptedAt" = NULL, "startedAt" = NULL,
                      "updatedAt" = NOW()
                WHERE id = $1 AND "companyId" = $2`,
              [disp.id, scope.companyId],
            );
            await client.query(
              `UPDATE driver_navigation_sessions
                  SET status = 'cancelled', "endedAt" = NOW(), "updatedAt" = NOW()
                WHERE "dispatchOrderId" = $1 AND "companyId" = $2
                  AND status NOT IN ('ended', 'cancelled')`,
              [disp.id, scope.companyId],
            );
            await client.query(
              `UPDATE transport_booking_lines
                  SET status = 'open', "updatedAt" = NOW()
                WHERE id = $1 AND "companyId" = $2`,
              [disp.bookingLineId, scope.companyId],
            );
          }
        }
      },
    });
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.cancelled", entity: "fleet_trips", entityId: tripId,
      details: JSON.stringify({ tripId, reason }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_trips", entityId: tripId,
      after: { status: "cancelled", reason },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ ...updated, event: "fleet.trip.cancelled" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Cancel trip error:");
  }
});

router.post("/trips/:id/waypoints", authorize({ feature: "fleet.trips", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = parseId(req.params.id, "id");
    const b = zodParse(createWaypointSchema.safeParse(req.body ?? {}));
    const [trip] = await rawQuery<Record<string, unknown>>(
      `SELECT "vehicleId","driverId", status FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [tripId, scope.companyId]
    );
    if (!trip) throw new NotFoundError("الرحلة غير موجودة");
    if (trip.status !== "in_progress") {
      throw new ConflictError("لا يمكن تسجيل نقاط GPS لرحلة غير نشطة", { field: "status", fix: "نقاط الرحلة تُسجل فقط أثناء التنفيذ" });
    }
    const lat = b.lat ?? b.latitude;
    const lon = b.lon ?? b.longitude;
    if (lat === undefined || lon === undefined) {
      throw new ValidationError("إحداثيات النقطة مطلوبة", { field: "lat", fix: "أرسل lat و lon (أو latitude و longitude) في جسم الطلب" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_gps_tracking ("companyId","vehicleId","driverId",latitude,longitude,speed,"recordedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [scope.companyId, trip.vehicleId, trip.driverId, lat, lon, b.speed || 0]
    );
    assertInsert(insertId, "fleet_gps_tracking");
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.waypoint_added", entity: "fleet_gps_tracking", entityId: insertId,
      details: JSON.stringify({ tripId, lat, lon }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_gps_tracking", entityId: insertId,
      after: { tripId, lat, lon, speed: b.speed || 0 },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_gps_tracking WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, tripId, lat, lon });
  } catch (err) { handleRouteError(err, res, "Waypoint error:"); }
});

router.get("/maintenance", authorize({ feature: "fleet.maintenance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId, search, status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'm."companyId"', branchColumn: 'v."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (vehicleId) { where += ` AND m."vehicleId" = $${paramIdx}`; params.push(Number(vehicleId) || 0); paramIdx++; }
    if (search) { params.push(`%${search}%`); where += ` AND (v."plateNumber" ILIKE $${paramIdx} OR m.description ILIKE $${paramIdx})`; paramIdx++; }
    if (status) { where += ` AND m.status = $${paramIdx}`; params.push(status); paramIdx++; }
    // #651 follow-up — normalize to createdAt per PR #653 template (was m."serviceDate")
    if (dateFrom) { where += ` AND m."createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND m."createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT m.*, m.type AS "maintenanceType", m.cost AS amount,
              m."serviceDate" AS "scheduledDate", m."serviceDate" AS date,
              m."mileageAtService" AS mileage, m."nextServiceKm" AS "nextServiceMileage",
              m."performedBy" AS workshop,
              v."plateNumber", v."plateNumber" AS "vehiclePlateNumber", v."plateNumber" AS "vehiclePlate",
              v.make AS "vehicleMake", v.model AS "vehicleModel"
       FROM fleet_maintenance m LEFT JOIN fleet_vehicles v ON v.id=m."vehicleId" AND v."deletedAt" IS NULL WHERE ${where} AND m."deletedAt" IS NULL ORDER BY m.id DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet maintenance error:"); }
});

router.get("/maintenance/:id", authorize({ feature: "fleet.maintenance", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (req.path.includes("/complete") || req.path.includes("/cancel")) return;
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT m.*, m.type AS "maintenanceType", m.cost AS amount,
              m."serviceDate" AS "scheduledDate", m."serviceDate" AS date,
              m."mileageAtService" AS mileage, m."nextServiceKm" AS "nextServiceMileage",
              m."performedBy" AS workshop,
              v."plateNumber", v."plateNumber" AS "vehiclePlateNumber",
              v.make AS "vehicleMake", v.model AS "vehicleModel"
       FROM fleet_maintenance m
       LEFT JOIN fleet_vehicles v ON v.id=m."vehicleId" AND v."deletedAt" IS NULL
       WHERE m.id = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل الصيانة غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Fleet maintenance detail error:"); }
});

router.post("/maintenance", authorize({ feature: "fleet.maintenance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createMaintenanceSchema.safeParse(req.body)) as any;

    // FK pre-check: vehicle must exist and not be deleted
    const [vehicleRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!vehicleRow) {
      throw new ValidationError("المركبة غير موجودة", { field: "vehicleId", fix: "اختر مركبة مسجلة في النظام" });
    }
    if (vehicleRow.status === "out_of_service") {
      throw new ConflictError("لا يمكن إنشاء صيانة لمركبة خارج الخدمة", { field: "vehicleId", fix: "أعد المركبة للحالة المتاحة أو اختر مركبة أخرى" });
    }

    const mechanics = await rawQuery<Record<string, unknown>>(
      `SELECT e.* FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active' WHERE e.status='active' AND e."deletedAt" IS NULL ORDER BY e.id LIMIT 5`,
      [scope.companyId]
    );
    const assignedMechanic = b.performedBy || (mechanics[0]?.name ?? null);

    // Next-service reminder = 3 months from the Riyadh wall-clock date (not the
    // UTC `new Date()` "now", which drifts the date across the day boundary in
    // +03). Derived from currentDateInTz so the reminder is anchored to local
    // time; setUTCMonth on the parsed midnight is calendar-correct.
    const defaultNextDate = new Date(`${currentDateInTz("Asia/Riyadh")}T00:00:00Z`);
    defaultNextDate.setUTCMonth(defaultNextDate.getUTCMonth() + 3);
    const effectiveNextServiceDate = b.nextServiceDate || toDateISO(defaultNextDate);

    const insertId = await withTransaction(async (client) => {
      const maintResult = await client.query(
        `INSERT INTO fleet_maintenance ("companyId","vehicleId",type,description,cost,"mileageAtService","serviceDate","performedBy","supplierId","unregisteredSupplierName",status,"nextServiceDate","nextServiceKm") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [scope.companyId, b.vehicleId, b.type, b.description, b.cost || 0, b.mileageAtService, b.serviceDate || todayISO(), assignedMechanic, b.supplierId ?? null, b.unregisteredSupplierName ?? null, b.status || 'in_progress', effectiveNextServiceDate, b.nextServiceKm ?? null]
      );
      const maintId = maintResult.rows[0]?.id;

      if (b.vehicleId) {
        await client.query(`UPDATE fleet_vehicles SET status='maintenance', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='available' AND "deletedAt" IS NULL`, [b.vehicleId, scope.companyId]);
        // Advance the odometer to the service reading (monotonic — GREATEST,
        // never decreases), keeping currentMileage fresh for the next form.
        const svcMileage = Number(b.mileageAtService) || null;
        if (svcMileage != null) {
          await client.query(
            `UPDATE fleet_vehicles SET "currentMileage" = GREATEST(COALESCE("currentMileage", 0), $1), "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
            [svcMileage, b.vehicleId, scope.companyId],
          );
        }
      }

      return maintId;
    });

    if (b.partsUsed && Array.isArray(b.partsUsed)) {
      fleetEngine.requestWarehouseDeduction(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
        { maintenanceId: insertId, parts: b.partsUsed }
      ).catch((e: unknown) => logger.error(e, "Fleet warehouse deduction error:"));
    }

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

    // Emit the creation event so listeners write audit + event_logs in one place.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.maintenance.created",
      entity: "fleet_maintenance",
      entityId: insertId,
      after: {
        vehicleId: b.vehicleId,
        type: b.type,
        description: b.description,
        cost: b.cost || 0,
        serviceDate: b.serviceDate || todayISO(),
      },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    if (b.type && ["breakdown", "emergency"].includes(b.type)) {
      const [vehicle] = await rawQuery<Record<string, unknown>>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.vehicleId, scope.companyId]);
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? 0, userId: scope.userId,
        action: "fleet.vehicle.breakdown", entity: "fleet_vehicles", entityId: b.vehicleId,
        details: JSON.stringify({ plateNumber: vehicle?.plateNumber, description: b.description, source: "manual_maintenance" }),
      }).catch((e) => logger.error(e, "fleet background task failed"));
    }

    // Register obligation for the scheduled service date (for previews, inspections, etc.)
    try {
      const serviceDate = new Date(b.serviceDate || new Date().toISOString());
      if (serviceDate > new Date()) {
        const [veh] = await rawQuery<Record<string, unknown>>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.vehicleId, scope.companyId]);
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "fleet_maintenance",
          entityId: insertId,
          obligationType: "maintenance",
          title: `صيانة مجدولة — ${veh?.plateNumber || `مركبة #${b.vehicleId}`} / ${b.type || ""}`,
          dueAt: serviceDate.toISOString(),
          metadata: { vehicleId: b.vehicleId, type: b.type },
          dedupeKey: `maintenance-${insertId}-scheduled`,
          escalationSteps: [{ hoursAfterDue: 24, notifyRole: "fleet_manager" }],
        });
      }
    } catch (obErr) { logger.error(obErr, "Maintenance obligation registration failed:"); }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_maintenance", entityId: insertId,
      after: { vehicleId: b.vehicleId, type: b.type, description: b.description, cost: b.cost || 0 },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create maintenance error:"); }
});

router.post("/maintenance/:id/complete", authorize({ feature: "fleet.maintenance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(completeMaintenanceSchema.safeParse(req.body));
    const [m] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!m) throw new NotFoundError("سجل الصيانة غير موجود");
    if (m.status === "completed") {
      throw new ValidationError("سجل الصيانة مكتمل بالفعل", {
        field: "status",
        fix: "لا يمكن إكمال سجل مكتمل",
      });
    }
    if (m.status === "cancelled") {
      throw new ValidationError("سجل الصيانة ملغى", {
        field: "status",
        fix: "لا يمكن إكمال سجل ملغى",
      });
    }
    const finalCost = Number(b.cost || m.cost || 0);
    await applyTransition({
      entity: "fleet_maintenance",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "fleet.maintenance.completed",
      fromStates: ["scheduled", "in_progress"],
      toState: "completed",
      setExtras: { cost: finalCost },
      onApply: async (_row, client) => {
        if (m.vehicleId) {
          await client.query(`UPDATE fleet_vehicles SET status='available', "lastMaintenanceDate"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='maintenance' AND "deletedAt" IS NULL`, [m.vehicleId, scope.companyId]);
        }
      },
    });

    // #TA-T18 finance-boundary — completing maintenance no longer posts
    // GL directly. It queues an EXPENSE candidate for the accountant, who
    // materialises it (postMaintenanceGL runs then, in finance). Transport
    // never touches the ledger; finance is the authority for the money.
    if (finalCost > 0) {
      // The candidate (and the eventual JE) lands on the VEHICLE's branch,
      // not the operator's — a vehicle on Branch A serviced from Branch B
      // must still book to Branch A for correct per-branch fleet P&L.
      const [vehicle] = await rawQuery<{ plateNumber?: string; branchId?: number | null }>(
        `SELECT "plateNumber", "branchId" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [m.vehicleId, scope.companyId]
      );
      const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
      const vehicleBranchId = vehicle?.branchId ?? scope.branchId;
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.createMaintenanceExpenseCandidate(
        { companyId: scope.companyId, branchId: vehicleBranchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id, vehicleId: m.vehicleId as number, cost: finalCost, type: m.type as string | undefined, description: `مصروف صيانة مركبة${plateLabel} / ${m.type ?? ""} / ${m.description ?? ""}`, costBearer: b.costBearer }
      ).catch((e: unknown) => logger.error(e, "Maintenance expense candidate failed:"));
    }

    // Mark the scheduled obligation as met and register the next one
    try {
      await markObligationMet(scope.companyId, "fleet_maintenance", id, "maintenance");
      if (m.nextServiceDate) {
        const [veh] = await rawQuery<Record<string, unknown>>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [m.vehicleId, scope.companyId]);
        const nextDate = new Date(m.nextServiceDate as string | Date);
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "fleet_vehicle",
          entityId: Number(m.vehicleId),
          obligationType: "maintenance",
          title: `صيانة دورية قادمة — ${veh?.plateNumber || `مركبة #${m.vehicleId}`}`,
          dueAt: nextDate.toISOString(),
          metadata: { previousMaintenanceId: id, type: m.type },
          dedupeKey: `vehicle-${m.vehicleId}-next-service-${toDateISO(nextDate)}`,
        });
      }
    } catch (obErr) { logger.error(obErr, "Maintenance obligation update failed:"); }

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fleet.maintenance.completed",
      entity: "fleet_maintenance",
      entityId: id,
      details: `إكمال صيانة #${id} بتكلفة ${finalCost} ريال`,
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_maintenance", entityId: id,
      after: { status: "completed", cost: finalCost, vehicleId: m.vehicleId },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ ...m, status: 'completed', cost: finalCost, event: "fleet.maintenance.completed" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

/** Cancel a maintenance job — frees vehicle, no cost posted */
router.post("/maintenance/:id/cancel", authorize({ feature: "fleet.maintenance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(cancelMaintenanceSchema.safeParse(req.body ?? {}));
    const [m] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!m) throw new NotFoundError("سجل الصيانة غير موجود");
    if (m.status === "completed") {
      throw new ValidationError("لا يمكن إلغاء صيانة مكتملة", {
        field: "status",
        fix: "السجل مكتمل مسبقاً",
      });
    }
    if (m.status === "cancelled") {
      throw new ValidationError("السجل ملغى بالفعل", {
        field: "status",
        fix: "لا حاجة لإلغاء سجل ملغى",
      });
    }

    await applyTransition({
      entity: "fleet_maintenance",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "fleet.maintenance.cancelled",
      fromStates: ["scheduled", "in_progress"],
      toState: "cancelled",
      reason: b.reason,
      setExtras: { description: `${(m as any).description || ""} | إلغاء: ${b.reason}`.trim() },
      onApply: async (_row, client) => {
        if (m.vehicleId) {
          await client.query(`UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='maintenance' AND "deletedAt" IS NULL`, [m.vehicleId, scope.companyId]);
        }
      },
    });
    await cancelObligation(scope.companyId, "fleet_maintenance", id, "maintenance");

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_maintenance", entityId: id,
      after: { status: "cancelled", reason: b.reason },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    const [updated] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json({ ...updated, event: "fleet.maintenance.cancelled" });
  } catch (err) { handleRouteError(err, res, "Cancel maintenance error:"); }
});

// FLT-006 — fleet_alerts reconciliation.
//
// Alerts are derived from many source tables (insurance, licenses,
// maintenance, gps, fuel, driver ratings). Before fleet_alerts existed,
// `GET /alerts` recomputed them every call and never persisted, so an
// operator couldn't acknowledge a known alert and a one-off speeding
// incident kept reappearing in the list. The endpoint now:
//
//   1. Computes the fresh, ground-truth alert set from the source
//      queries (unchanged business rules).
//   2. UPSERTs each fresh alert into fleet_alerts keyed by
//      (companyId, type, relatedType, relatedId). Severity / message /
//      daysLeft are refreshed; status stays 'acknowledged' if the
//      operator already silenced it, and bounces 'resolved' → 'active'
//      when a condition re-appears.
//   3. Marks active rows that are no longer in the fresh set as
//      'resolved' (the underlying condition cleared — insurance
//      renewed, driver fixed, etc.).
//   4. Returns the persisted active+acknowledged rows joined with the
//      related vehicle / driver names so the UI keeps showing the same
//      vehicle/driver columns.
//
// The natural key collapses speed-violation incidents to one row per
// vehicle (a recurring summary), an explicit trade-off documented in
// the audit plan.
type ComputedAlert = {
  type: string;
  severity: string;
  title: string;
  message: string;
  relatedType: string | null;
  relatedId: number | null;
  daysLeft: number | null;
};

router.get("/alerts", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const bid = scope.branchId ?? null;
    const today = new Date();
    const todayStr = toDateISO(today);
    const in90Days = new Date(today); in90Days.setDate(today.getDate() + 90);
    const in90Str = toDateISO(in90Days);

    const [allInsurance, expiringLicenses, speedAlerts, abnormalFuel, frequentBreakdowns, lowRatingDrivers, oilDue] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT v.id AS "vehicleId", v."plateNumber", i."endDate", i.type AS "insuranceType",
                (i."endDate"::date - CURRENT_DATE) AS "daysLeft"
         FROM fleet_insurance i JOIN fleet_vehicles v ON v.id=i."vehicleId" AND v."deletedAt" IS NULL
         WHERE i."companyId"=$1 AND i."deletedAt" IS NULL AND i."endDate" BETWEEN $2 AND $3`,
        [cid, todayStr, in90Str]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT d.id AS "driverId", d.name, d."licenseExpiry", d."licenseNumber",
                (d."licenseExpiry"::date - CURRENT_DATE) AS "daysLeft"
         FROM fleet_drivers d
         WHERE d."companyId"=$1 AND d."licenseExpiry" IS NOT NULL
           AND d."deletedAt" IS NULL
           AND d."licenseExpiry" BETWEEN $2 AND $3`,
        [cid, todayStr, in90Str]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT g.speed, g.latitude, g.longitude, g."recordedAt",
                v.id AS "vehicleId", v."plateNumber", d.name AS "driverName"
         FROM fleet_gps_tracking g
         LEFT JOIN fleet_vehicles v ON v.id=g."vehicleId" AND v."companyId"=$1 AND v."deletedAt" IS NULL
         LEFT JOIN fleet_drivers d ON d.id=g."driverId" AND d."companyId"=$1 AND d."deletedAt" IS NULL
         WHERE g.speed > 120 AND g."recordedAt" > NOW() - INTERVAL '24 hours'
           AND v."companyId" = $1
         ORDER BY g."recordedAt" DESC LIMIT 50`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT v."plateNumber", v.id AS "vehicleId",
                AVG(f.liters) AS "avgLiters",
                MAX(f.liters) AS "maxLiters"
         FROM fleet_fuel_logs f
         JOIN fleet_vehicles v ON v.id=f."vehicleId" AND v."deletedAt" IS NULL
         WHERE f."companyId"=$1 AND f."fuelDate" > CURRENT_DATE - INTERVAL '30 days'
         GROUP BY v.id, v."plateNumber"
         HAVING MAX(f.liters) > AVG(f.liters) * 1.2`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT v."plateNumber", v.id AS "vehicleId", COUNT(m.id) AS "breakdownCount"
         FROM fleet_maintenance m
         JOIN fleet_vehicles v ON v.id=m."vehicleId" AND v."deletedAt" IS NULL
         WHERE m."companyId"=$1 AND m."serviceDate" > CURRENT_DATE - INTERVAL '30 days'
           AND m.type IN ('breakdown','emergency','repair')
         GROUP BY v.id, v."plateNumber"
         HAVING COUNT(m.id) >= 3`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT d.name, d.rating, d.id AS "driverId" FROM fleet_drivers d
         WHERE d."companyId"=$1 AND d.rating IS NOT NULL AND d.rating < 3 AND d."deletedAt" IS NULL
         LIMIT 500`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT v.id AS "vehicleId", v."plateNumber", v."currentMileage", m."mileageAtService" FROM fleet_vehicles v LEFT JOIN fleet_maintenance m ON m.id=(SELECT id FROM fleet_maintenance WHERE "vehicleId"=v.id AND type='oil_change' ORDER BY "mileageAtService" DESC LIMIT 1) WHERE v."companyId"=$1 AND v."deletedAt" IS NULL AND (v."currentMileage" - COALESCE(m."mileageAtService",0)) >= 5000`,
        [cid]
      ),
    ]);

    const computed: ComputedAlert[] = [];
    for (const r of allInsurance) {
      const daysLeft = Number(r.daysLeft);
      const severity = daysLeft <= 0 ? 'blocked' : daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low';
      computed.push({
        type: 'insurance_expiry', severity,
        title: 'انتهاء تأمين مركبة',
        message: daysLeft <= 0
          ? `تأمين المركبة ${r.plateNumber} منتهٍ — يجب حظر الاستخدام`
          : `تأمين المركبة ${r.plateNumber} ينتهي خلال ${daysLeft} يوم`,
        relatedType: 'vehicle', relatedId: Number(r.vehicleId) || null,
        daysLeft,
      });
    }
    for (const d of expiringLicenses) {
      const daysLeft = Number(d.daysLeft);
      const severity = daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low';
      computed.push({
        type: 'driver_license_expiry', severity,
        title: 'انتهاء رخصة سائق',
        message: `رخصة السائق ${d.name} تنتهي خلال ${daysLeft} يوم`,
        relatedType: 'driver', relatedId: Number(d.driverId) || null,
        daysLeft,
      });
    }
    for (const s of speedAlerts) {
      computed.push({
        type: 'speed_violation', severity: 'high',
        title: 'تجاوز سرعة',
        message: `تجاوز سرعة: ${s.driverName || 'غير معروف'} — ${s.speed} كم/س (المركبة ${s.plateNumber || 'غير محدد'})`,
        relatedType: 'vehicle', relatedId: Number(s.vehicleId) || null,
        daysLeft: null,
      });
    }
    for (const r of abnormalFuel) {
      computed.push({
        type: 'abnormal_fuel', severity: 'medium',
        title: 'استهلاك وقود شاذ',
        message: `وقود غير طبيعي: المركبة ${r.plateNumber} — أقصى ${Number(r.maxLiters).toFixed(1)} لتر (المتوسط ${Number(r.avgLiters).toFixed(1)}) تجاوز 120%`,
        relatedType: 'vehicle', relatedId: Number(r.vehicleId) || null,
        daysLeft: null,
      });
    }
    for (const r of frequentBreakdowns) {
      computed.push({
        type: 'frequent_breakdowns', severity: 'high',
        title: 'أعطال متكرّرة',
        message: `المركبة ${r.plateNumber} تعطلت ${r.breakdownCount} مرات خلال الشهر — يُنصح بالاستبعاد`,
        relatedType: 'vehicle', relatedId: Number(r.vehicleId) || null,
        daysLeft: null,
      });
    }
    for (const d of lowRatingDrivers) {
      computed.push({
        type: 'low_driver_rating', severity: 'medium',
        title: 'تقييم سائق منخفض',
        message: `تقييم السائق ${d.name} منخفض: ${Number(d.rating).toFixed(1)}/5 — يحتاج مراجعة`,
        relatedType: 'driver', relatedId: Number(d.driverId) || null,
        daysLeft: null,
      });
    }
    for (const r of oilDue) {
      computed.push({
        type: 'oil_change_due', severity: 'medium',
        title: 'تغيير زيت مستحق',
        message: `تغيير زيت المركبة ${r.plateNumber} مستحق (الكيلومتراج: ${r.currentMileage})`,
        relatedType: 'vehicle', relatedId: Number(r.vehicleId) || null,
        daysLeft: null,
      });
    }

    // Reconcile into fleet_alerts. Done in best-effort mode — a DB error
    // here must not blank the operator's alert list, so we log and fall
    // through to the read.
    try {
      if (computed.length > 0) {
        const placeholders: string[] = [];
        const params: unknown[] = [];
        for (const c of computed) {
          if (c.relatedId == null) continue; // skip unkeyed alerts (can't dedup)
          const base = params.length;
          placeholders.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`);
          params.push(cid, bid, c.type, c.severity, c.title, c.message, c.relatedType, c.relatedId, c.daysLeft);
        }
        if (placeholders.length > 0) {
          await rawExecute(
            `INSERT INTO fleet_alerts ("companyId","branchId",type,severity,title,message,"relatedType","relatedId","daysLeft")
             VALUES ${placeholders.join(",")}
             ON CONFLICT ("companyId", type, "relatedType", "relatedId") DO UPDATE SET
               severity = EXCLUDED.severity,
               title = EXCLUDED.title,
               message = EXCLUDED.message,
               "daysLeft" = EXCLUDED."daysLeft",
               status = CASE WHEN fleet_alerts.status = 'resolved' THEN 'active' ELSE fleet_alerts.status END,
               "updatedAt" = NOW()`,
            params,
          );
        }
      }
      // Mark stale active rows as resolved. Build a key set from the
      // live computed alerts; anything active in the DB that's not in
      // the live set means the underlying condition cleared.
      const liveKeys = new Set<string>();
      for (const c of computed) {
        if (c.relatedId != null) liveKeys.add(`${c.type}|${c.relatedType ?? ''}|${c.relatedId}`);
      }
      const dbActive = await rawQuery<{ id: number; type: string; relatedType: string | null; relatedId: number | null }>(
        `SELECT id, type, "relatedType", "relatedId" FROM fleet_alerts WHERE "companyId" = $1 AND status = 'active'`,
        [cid],
      );
      const staleIds = dbActive
        .filter((r) => !liveKeys.has(`${r.type}|${r.relatedType ?? ''}|${r.relatedId ?? ''}`))
        .map((r) => r.id);
      if (staleIds.length > 0) {
        await rawExecute(
          `UPDATE fleet_alerts SET status = 'resolved', "updatedAt" = NOW() WHERE id = ANY($1)`,
          [staleIds],
        );
      }
    } catch (e) {
      logger.warn(e, "[fleet-alerts] reconciliation failed — returning live computation");
    }

    // Read back persisted alerts (active + acknowledged) joined to
    // vehicle/driver so the UI's vehicle/driver columns still work.
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT a.*,
              CASE WHEN a."relatedType" = 'vehicle' THEN v."plateNumber" END AS vehicle,
              CASE WHEN a."relatedType" = 'driver' THEN d.name END AS driver
         FROM fleet_alerts a
         LEFT JOIN fleet_vehicles v ON a."relatedType" = 'vehicle' AND v.id = a."relatedId" AND v."deletedAt" IS NULL
         LEFT JOIN fleet_drivers d ON a."relatedType" = 'driver' AND d.id = a."relatedId" AND d."deletedAt" IS NULL
        WHERE a."companyId" = $1 AND a.status IN ('active','acknowledged')
        ORDER BY
          CASE a.severity WHEN 'blocked' THEN 0 WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          a."updatedAt" DESC
        LIMIT 500`,
      [cid],
    );

    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet alerts error:"); }
});

router.post("/alerts/:id/acknowledge", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_alerts SET status = 'acknowledged', "acknowledgedBy" = $1, "acknowledgedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3 AND status IN ('active','acknowledged') RETURNING *`,
      [scope.userId, id, scope.companyId],
    );
    if (!row) throw new NotFoundError("التنبيه غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "acknowledge", entity: "fleet_alerts", entityId: id }).catch((e) => logger.error(e, "fleet bg"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Acknowledge fleet alert"); }
});

router.post("/alerts/:id/dismiss", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_alerts SET status = 'dismissed', "dismissedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, scope.companyId],
    );
    if (!row) throw new NotFoundError("التنبيه غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "dismiss", entity: "fleet_alerts", entityId: id }).catch((e) => logger.error(e, "fleet bg"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Dismiss fleet alert"); }
});

router.get("/fuel-logs", authorize({ feature: "fleet.trips", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId, search, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'f."companyId"', branchColumn: 'v."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (vehicleId) { where += ` AND f."vehicleId" = $${paramIdx}`; params.push(Number(vehicleId) || 0); paramIdx++; }
    if (search) { params.push(`%${search}%`); where += ` AND (v."plateNumber" ILIKE $${paramIdx} OR f."stationName" ILIKE $${paramIdx})`; paramIdx++; }
    // #651 follow-up — normalize to createdAt per PR #653 template (was f."fuelDate")
    if (dateFrom) { where += ` AND f."createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND f."createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT f.*, f.liters AS quantity, f."totalCost" AS cost, f."mileageAtFuel" AS mileage, f."stationName" AS station, f."fuelDate" AS date, v."plateNumber", v."plateNumber" AS "vehiclePlate" FROM fleet_fuel_logs f LEFT JOIN fleet_vehicles v ON v.id=f."vehicleId" AND v."deletedAt" IS NULL WHERE ${where} AND f."deletedAt" IS NULL ORDER BY f.id DESC LIMIT 1000`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet fuel error:"); }
});

router.get("/fuel-logs/:id", authorize({ feature: "fleet.trips", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT f.*, f.liters AS quantity, f."totalCost" AS cost, f."mileageAtFuel" AS odometer,
              f."stationName" AS station, f."fuelDate" AS date,
              v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel",
              d.name AS "driverName"
       FROM fleet_fuel_logs f
       LEFT JOIN fleet_vehicles v ON v.id=f."vehicleId" AND v."deletedAt" IS NULL
       LEFT JOIN fleet_drivers d ON d.id=f."driverId" AND d."deletedAt" IS NULL
       WHERE f.id = $1 AND f."companyId" = $2 AND f."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل الوقود غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Fleet fuel detail error:"); }
});

// ─── GET /vehicles/:id/fuel-efficiency — كفاءة وقود المركبة + شذوذ الاستهلاك (ج-٣) ─
// طبقة تحليلية للقراءة فقط: كم/لتر بين تعبئتين + وسم الشذوذ (انخفاض كفاءة/تراجع عدّاد/
// قيمة غير معقولة). لا قيد ولا كتابة — يحمّل سطور تعبئة المركبة ويستدعي الدالة النقية.
router.get(
  "/vehicles/:id/fuel-efficiency",
  authorize({ feature: "fleet.vehicles", action: "view", resource: { table: "fleet_vehicles", idParam: "id" } }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.id, "id");
      const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [vehicleId, scope.companyId];
      let where = `f."vehicleId" = $1 AND f."companyId" = $2 AND f."deletedAt" IS NULL`;
      let idx = 3;
      if (dateFrom) { where += ` AND f."fuelDate" >= $${idx}::date`; params.push(dateFrom); idx++; }
      if (dateTo) { where += ` AND f."fuelDate" <= $${idx}::date`; params.push(dateTo); idx++; }
      const rows = await rawQuery<{ id: number; fuelDate: string; liters: string; mileageAtFuel: number | null; totalCost: string }>(
        `SELECT f.id, to_char(f."fuelDate", 'YYYY-MM-DD') AS "fuelDate", f.liters, f."mileageAtFuel", f."totalCost"
           FROM fleet_fuel_logs f
          WHERE ${where}
          ORDER BY f."fuelDate" ASC, f.id ASC
          LIMIT 2000`,
        params,
      );
      const { computeFuelEfficiency } = await import("../lib/fleet/fuelEfficiency.js");
      const report = computeFuelEfficiency(
        vehicleId,
        rows.map((r) => ({
          id: Number(r.id),
          fuelDate: r.fuelDate,
          liters: Number(r.liters) || 0,
          mileageAtFuel: r.mileageAtFuel != null ? Number(r.mileageAtFuel) : null,
          totalCost: Number(r.totalCost) || 0,
        })),
      );
      res.json(report);
    } catch (err) {
      handleRouteError(err, res, "vehicle fuel efficiency error:");
    }
  },
);

router.post("/fuel-logs", authorize({ feature: "fleet.trips", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createFuelLogSchema.safeParse(req.body)) as any;

    const vehicleId = b.vehicleId || null;
    const vehiclePlate = b.vehiclePlate || null;
    let resolvedVehicleId = vehicleId;
    if (!resolvedVehicleId && vehiclePlate) {
      const [v] = await rawQuery<Record<string, unknown>>(`SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [vehiclePlate, scope.companyId]);
      if (v) resolvedVehicleId = v.id;
    }
    if (!resolvedVehicleId) {
      throw new ValidationError("المركبة مطلوبة", {
        field: "vehicleId",
        fix: "اختر مركبة من القائمة أو أدخل رقم اللوحة",
      });
    }

    const liters = b.liters;

    // FK pre-check: the vehicle must exist in the caller's company. Without
    // this, bogus vehicleId would fail inside the INSERT as an opaque
    // 23503 with no field tag.
    const [veh] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "fuelCapacity" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [resolvedVehicleId, scope.companyId]
    );
    if (!veh) {
      throw new ValidationError(`المركبة رقم ${resolvedVehicleId} غير موجودة`, {
        field: "vehicleId",
        fix: "اختر مركبة مسجلة في النظام",
      });
    }
    const tankCapacity = Number(veh.fuelCapacity ?? 0);
    if (tankCapacity > 0 && liters > tankCapacity) {
      throw new ValidationError(
        `لا يمكن تسجيل وقود يتجاوز سعة الخزان (${tankCapacity} لتر). الكمية المدخلة: ${liters} لتر`,
        {
          field: "liters",
          fix: `أدخل كمية لا تتجاوز سعة خزان المركبة (${tankCapacity} لتر)`,
        },
      );
    }

    // driverId is optional; if provided, FK-check it inside scope.
    if (b.driverId) {
      const [drv] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(b.driverId), scope.companyId]
      );
      if (!drv) {
        throw new ValidationError(`السائق رقم ${b.driverId} غير موجود`, {
          field: "driverId",
          fix: "اختر سائقاً مسجلاً أو اتركه فارغاً",
        });
      }
    }

    const costPerLiter = Number(b.costPerLiter || b.cost) || 0;
    const totalCost = liters * costPerLiter;
    const fuelDate = b.fuelDate || b.date || todayISO();
    const mileageAtFuel = Number(b.mileageAtFuel || b.mileage) || null;
    const stationName = b.stationName || b.station || null;
    // M7: validate tripId if provided so a bogus id can't smuggle a
    // fuel log onto someone else's trip and confuse the dedup logic.
    let validatedTripId: number | null = null;
    if (b.tripId) {
      const [trip] = await rawQuery<{ id: number; vehicleId: number | null }>(
        `SELECT id, "vehicleId" FROM fleet_trips
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(b.tripId), scope.companyId]
      );
      if (!trip) {
        throw new ValidationError(`الرحلة رقم ${b.tripId} غير موجودة`, {
          field: "tripId",
          fix: "اختر رحلة من القائمة",
        });
      }
      // If the trip has a vehicle and the fuel log claims a different
      // vehicle, the operator probably picked the wrong trip.
      if (trip.vehicleId && trip.vehicleId !== resolvedVehicleId) {
        throw new ValidationError("الرحلة المختارة تخص مركبة أخرى", {
          field: "tripId",
          fix: "اختر رحلة على نفس المركبة",
        });
      }
      validatedTripId = trip.id;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_fuel_logs ("companyId","vehicleId","driverId","fuelDate",liters,"costPerLiter","totalCost","mileageAtFuel","stationName","tripId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, resolvedVehicleId, b.driverId, fuelDate, liters, costPerLiter, totalCost, mileageAtFuel, stationName, validatedTripId]
    );
    assertInsert(insertId, "fleet_fuel_logs");

    // #TA-T18 finance-boundary — logging fuel no longer posts GL directly;
    // it queues an EXPENSE candidate the accountant materialises (then the
    // GL is posted, in finance). Transport never touches the ledger.
    if (totalCost > 0) {
      const [vehicle] = await rawQuery<{ plateNumber?: string; branchId?: number | null }>(
        `SELECT "plateNumber", "branchId" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [resolvedVehicleId, scope.companyId]
      );
      const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
      const vehicleBranchId = vehicle?.branchId ?? scope.branchId;
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.createFuelExpenseCandidate(
        { companyId: scope.companyId, branchId: vehicleBranchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id: insertId, vehicleId: resolvedVehicleId, cost: totalCost, description: `مصروف وقود${plateLabel} / ${liters} لتر / ${stationName ?? ""}` }
      ).catch((e: unknown) => logger.error(e, "Fuel expense candidate failed:"));
    }

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.fuel_log.created", entity: "fleet_fuel_logs", entityId: insertId,
      details: JSON.stringify({ vehicleId: resolvedVehicleId, liters, totalCost }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_fuel_logs", entityId: insertId,
      after: { vehicleId: resolvedVehicleId, liters, totalCost, fuelDate, stationName },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create fuel log error:"); }
});

router.get("/insurance", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'i."companyId"', branchColumn: 'v."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (vehicleId) { where += ` AND i."vehicleId" = $${paramIdx}`; params.push(Number(vehicleId) || 0); paramIdx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT i.*, v."plateNumber" FROM fleet_insurance i LEFT JOIN fleet_vehicles v ON v.id=i."vehicleId" AND v."deletedAt" IS NULL WHERE ${where} AND i."deletedAt" IS NULL ORDER BY i."endDate" ASC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Fleet insurance error:"); }
});

router.get("/insurance/:id", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT i.*, v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel"
       FROM fleet_insurance i
       LEFT JOIN fleet_vehicles v ON v.id=i."vehicleId" AND v."deletedAt" IS NULL
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل التأمين غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Fleet insurance detail error:"); }
});

router.post("/insurance", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createInsuranceSchema.safeParse(req.body)) as any;

    const startD = new Date(b.startDate);
    const endD = new Date(b.endDate);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
      throw new ValidationError("التواريخ غير صالحة", { field: "startDate", fix: "استخدم تنسيق YYYY-MM-DD" });
    }
    if (endD <= startD) {
      throw new ValidationError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية", { field: "endDate", fix: "اختر تاريخ انتهاء لاحق لتاريخ البداية" });
    }
    const premium = Number(b.premium || 0);
    if (!Number.isFinite(premium) || premium < 0) {
      throw new ValidationError("قيمة القسط غير صالحة", { field: "premium", fix: "أدخل قيمة غير سالبة" });
    }

    const [vehicleRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!vehicleRow) {
      throw new ValidationError("المركبة غير موجودة", { field: "vehicleId", fix: "اختر مركبة مسجلة" });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_insurance ("companyId","vehicleId",type,provider,"policyNumber","startDate","endDate",premium,"coverageAmount",notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.vehicleId, b.type || b.insuranceType || 'comprehensive', b.provider.trim(), b.policyNumber, b.startDate, b.endDate, premium, b.coverageAmount ? Number(b.coverageAmount) : null, b.notes || null]
    );
    assertInsert(insertId, "fleet_insurance");

    // Auto journal entry for insurance premium (vehicle's branch).
    if (premium > 0) {
      const [vehicle] = await rawQuery<{ plateNumber?: string; branchId?: number | null }>(
        `SELECT "plateNumber", "branchId" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.vehicleId, scope.companyId]
      );
      const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
      const insuranceVehicleBranchId = vehicle?.branchId ?? scope.branchId;
      const insuranceType = b.type || b.insuranceType || 'comprehensive';
      const insuranceTypeLabel = insuranceType === 'comprehensive' ? 'شامل' : insuranceType === 'third_party' ? 'طرف ثالث' : insuranceType;
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.createInsuranceExpenseCandidate(
        { companyId: scope.companyId, branchId: insuranceVehicleBranchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id: insertId, vehicleId: Number(b.vehicleId), cost: premium, description: `مصروف تأمين${plateLabel} / ${insuranceTypeLabel} / ${b.provider ?? ""}` }
      ).catch((e: unknown) => logger.error(e, "Insurance expense candidate failed:"));
    }

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_insurance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.insurance.created", entity: "fleet_insurance", entityId: insertId,
      details: JSON.stringify({ vehicleId: b.vehicleId, provider: b.provider, premium }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_insurance", entityId: insertId,
      after: { vehicleId: b.vehicleId, provider: b.provider, policyNumber: b.policyNumber, premium },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create insurance error:"); }
});

router.patch("/trips/:id", authorize({ feature: "fleet.trips", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الرحلة غير موجودة");

    const { fromLocation, toLocation, destination, status, notes, cost } = zodParse(updateTripSchema.safeParse(req.body));
    const finalTo = toLocation ?? destination;

    // PATCH on trips is an edit surface only — lifecycle transitions must go
    // through /complete or /cancel. Explicit status writes here are limited to
    // the allowlist so the status machine can't be bypassed.
    if (status !== undefined && status !== existing.status) {
      if (!(TRIP_STATUSES as readonly string[]).includes(status)) {
        throw new ValidationError(`حالة رحلة غير صالحة: ${status}`, { field: "status", fix: `اختر من: ${TRIP_STATUSES.join(", ")}` });
      }
      // Lifecycle-owned transitions MUST go through the dedicated endpoints.
      // Even though `completed` and `cancelled` are in TRIP_TRANSITIONS
      // (e.g. `in_progress → [completed, cancelled]`), letting PATCH write
      // them directly would silently skip:
      //   • the cost/fuel/depreciation calculation (complete path)
      //   • the vehicle release (status back to 'available')
      //   • the driver release (status back to 'available')
      //   • the `JE-FLEET-...` journal entry
      //   • the `fleet.trip.completed` / `fleet.trip.cancelled` event
      // This was Test 11 in docs/verification/fleet.md and was flagged as
      // ⚠️ Partial during the first verification run; this explicit
      // refuse-list is the follow-up fix.
      if (status === "completed" || status === "cancelled") {
        throw new ConflictError(
          `لا يمكن نقل الرحلة إلى "${status}" عبر PATCH`,
          {
            field: "status",
            fix: status === "completed"
              ? "استخدم POST /trips/:id/complete لإقفال الرحلة مع حساب التكلفة وإصدار القيد المحاسبي وتحرير المركبة والسائق"
              : "استخدم POST /trips/:id/cancel لإلغاء الرحلة وتحرير المركبة والسائق",
          }
        );
      }
      const allowedNext = TRIP_TRANSITIONS[existing.status as string] ?? [];
      if (!allowedNext.includes(status)) {
        throw new ConflictError(`لا يمكن نقل الرحلة من "${existing.status}" إلى "${status}" عبر PATCH`, { field: "status", fix: `استخدم /trips/:id/complete أو /trips/:id/cancel لإدارة دورة حياة الرحلة. الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` });
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let idx = 1;
    if (fromLocation !== undefined && fromLocation !== existing.fromLocation) {
      sets.push(`"fromLocation" = $${idx++}`); params.push(fromLocation);
      before.fromLocation = existing.fromLocation; after.fromLocation = fromLocation;
    }
    if (finalTo !== undefined && finalTo !== existing.toLocation) {
      sets.push(`"toLocation" = $${idx++}`); params.push(finalTo);
      before.toLocation = existing.toLocation; after.toLocation = finalTo;
    }
    if (status !== undefined && status !== existing.status) {
      sets.push(`status = $${idx++}`); params.push(status);
      before.status = existing.status; after.status = status;
    }
    if (notes !== undefined && notes !== existing.notes) {
      sets.push(`notes = $${idx++}`); params.push(notes);
      before.notes = existing.notes; after.notes = notes;
    }
    if (cost !== undefined && Number(cost) !== Number(existing.cost)) {
      sets.push(`cost = $${idx++}`); params.push(cost);
      before.cost = existing.cost; after.cost = cost;
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتعديل", { fix: "أرسل حقلاً واحداً على الأقل لتعديله" });
    }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_trips SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("الرحلة غير موجودة");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_trips",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.trip.updated",
      entity: "fleet_trips",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update trip error:"); }
});

router.delete("/trips/:id", authorize({ feature: "fleet.trips", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id, status, "vehicleId", "driverId" FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الرحلة غير موجودة");
    if (existing.status === "in_progress") {
      throw new ConflictError("لا يمكن حذف رحلة قيد التنفيذ", { field: "status", fix: "ألغِ الرحلة عبر /trips/:id/cancel أو أكملها قبل الحذف" });
    }
    await withTransaction(async (client) => {
      await client.query(`UPDATE fleet_trips SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

      if (["scheduled", "planned"].includes(existing.status as string)) {
        if (existing.vehicleId) {
          await client.query(
            `UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status IN ('in_use','on_trip') AND "deletedAt" IS NULL`,
            [existing.vehicleId, scope.companyId]
          );
        }
        if (existing.driverId) {
          await client.query(
            `UPDATE fleet_drivers SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='on_trip' AND "deletedAt" IS NULL`,
            [existing.driverId, scope.companyId]
          );
        }
      }
    });

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.trip.deleted",
      entity: "fleet_trips",
      entityId: id,
      before: { status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_trips", entityId: id,
      after: { status: existing.status },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ success: true, message: "تم حذف الرحلة" });
  } catch (err) { handleRouteError(err, res, "Delete trip error:"); }
});

router.patch("/maintenance/:id", authorize({ feature: "fleet.maintenance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الصيانة غير موجود");

    const { description, status, cost } = zodParse(updateMaintenanceSchema.safeParse(req.body));

    // State machine — lifecycle transitions still go through /complete + /cancel,
    // PATCH can only make non-lifecycle edits or same-status noops.
    if (status !== undefined && status !== existing.status) {
      if (!(MAINTENANCE_STATUSES as readonly string[]).includes(status)) {
        throw new ValidationError(`حالة صيانة غير صالحة: ${status}`, { field: "status", fix: `اختر من: ${MAINTENANCE_STATUSES.join(", ")}` });
      }
      // Same defence-in-depth as PATCH /trips/:id — the allowlist permits
      // `in_progress → completed` and `in_progress → cancelled` but routing
      // those through PATCH silently skips: vehicle release, journal entry,
      // obligation mark-met / cancel, and the `fleet.maintenance.completed`
      // / `fleet.maintenance.cancelled` event. Force the caller to the
      // dedicated lifecycle endpoints.
      if (status === "completed" || status === "cancelled") {
        throw new ConflictError(
          `لا يمكن نقل الصيانة إلى "${status}" عبر PATCH`,
          {
            field: "status",
            fix: status === "completed"
              ? "استخدم POST /maintenance/:id/complete لإكمال الصيانة مع إصدار القيد المحاسبي وتحرير المركبة"
              : "استخدم POST /maintenance/:id/cancel لإلغاء الصيانة وتحرير المركبة",
          }
        );
      }
      const allowedNext = MAINTENANCE_TRANSITIONS[existing.status as string] ?? [];
      if (!allowedNext.includes(status)) {
        throw new ConflictError(`لا يمكن نقل الصيانة من "${existing.status}" إلى "${status}" عبر PATCH`, { field: "status", fix: `استخدم /maintenance/:id/complete أو /maintenance/:id/cancel. الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` });
      }
    }

    if (cost !== undefined && cost !== null) {
      const c = Number(cost);
      if (!Number.isFinite(c) || c < 0) {
        throw new ValidationError("التكلفة غير صالحة", { field: "cost", fix: "أدخل قيمة غير سالبة" });
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let idx = 1;
    if (description !== undefined && description !== existing.description) {
      sets.push(`description = $${idx++}`); params.push(description);
      before.description = existing.description; after.description = description;
    }
    if (status !== undefined && status !== existing.status) {
      sets.push(`status = $${idx++}`); params.push(status);
      before.status = existing.status; after.status = status;
    }
    if (cost !== undefined && Number(cost) !== Number(existing.cost)) {
      sets.push(`cost = $${idx++}`); params.push(cost);
      before.cost = existing.cost; after.cost = cost;
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتعديل", { fix: "أرسل حقلاً واحداً على الأقل لتعديله" });
    }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_maintenance SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("سجل الصيانة غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_maintenance",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.maintenance.updated",
      entity: "fleet_maintenance",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update maintenance error:"); }
});

router.delete("/maintenance/:id", authorize({ feature: "fleet.maintenance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id, status, "vehicleId" FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الصيانة غير موجود");
    if (existing.status === "in_progress") {
      throw new ConflictError("لا يمكن حذف صيانة قيد التنفيذ", { field: "status", fix: "ألغِ الصيانة عبر /maintenance/:id/cancel أو أكملها قبل الحذف" });
    }
    await withTransaction(async (client) => {
      await client.query(`UPDATE fleet_maintenance SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

      if (existing.vehicleId) {
        await client.query(
          `UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status='maintenance' AND "deletedAt" IS NULL`,
          [existing.vehicleId, scope.companyId]
        );
      }
    });

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.maintenance.deleted",
      entity: "fleet_maintenance",
      entityId: id,
      before: { status: existing.status, vehicleId: existing.vehicleId },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_maintenance", entityId: id,
      after: { status: existing.status, vehicleId: existing.vehicleId },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ success: true, message: "تم حذف سجل الصيانة" });
  } catch (err) { handleRouteError(err, res, "Delete maintenance error:"); }
});

router.patch("/fuel-logs/:id", authorize({ feature: "fleet.trips", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الوقود غير موجود");

    const { liters, quantity, costPerLiter, totalCost, stationName } = zodParse(updateFuelLogSchema.safeParse(req.body));
    const finalLiters = liters ?? quantity;
    if (finalLiters !== undefined) {
      const L = Number(finalLiters);
      if (!Number.isFinite(L) || L <= 0) {
        throw new ValidationError("كمية الوقود يجب أن تكون أكبر من صفر", { field: "liters", fix: "أدخل كمية الوقود باللتر" });
      }
    }
    if (costPerLiter !== undefined) {
      const c = Number(costPerLiter);
      if (!Number.isFinite(c) || c < 0) {
        throw new ValidationError("سعر اللتر غير صالح", { field: "costPerLiter", fix: "أدخل قيمة غير سالبة" });
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let idx = 1;
    if (finalLiters !== undefined && Number(finalLiters) !== Number(existing.liters)) {
      sets.push(`liters = $${idx++}`); params.push(finalLiters);
      before.liters = existing.liters; after.liters = finalLiters;
    }
    if (costPerLiter !== undefined && Number(costPerLiter) !== Number(existing.costPerLiter)) {
      sets.push(`"costPerLiter" = $${idx++}`); params.push(costPerLiter);
      before.costPerLiter = existing.costPerLiter; after.costPerLiter = costPerLiter;
    }
    if (totalCost !== undefined && Number(totalCost) !== Number(existing.totalCost)) {
      sets.push(`"totalCost" = $${idx++}`); params.push(totalCost);
      before.totalCost = existing.totalCost; after.totalCost = totalCost;
    }
    if (stationName !== undefined && stationName !== existing.stationName) {
      sets.push(`"stationName" = $${idx++}`); params.push(stationName);
      before.stationName = existing.stationName; after.stationName = stationName;
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتعديل", { fix: "أرسل حقلاً واحداً على الأقل لتعديله" });
    }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_fuel_logs SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("سجل الوقود غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_fuel_logs",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.fuel_log.updated", entity: "fleet_fuel_logs", entityId: id,
      details: JSON.stringify({ id, ...after }),
    }).catch((e) => logger.error(e, "fleet background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update fuel log error:"); }
});

router.delete("/fuel-logs/:id", authorize({ feature: "fleet.trips", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الوقود غير موجود");
    const { affectedRows } = await rawExecute(`UPDATE fleet_fuel_logs SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.fuel_log.deleted",
      entity: "fleet_fuel_logs",
      entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_fuel_logs", entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ success: true, message: "تم حذف سجل الوقود" });
  } catch (err) { handleRouteError(err, res, "Delete fuel log error:"); }
});

router.patch("/insurance/:id", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_insurance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل التأمين غير موجود");

    const { provider, policyNumber, premium, endDate } = zodParse(updateInsuranceSchema.safeParse(req.body));

    if (premium !== undefined) {
      const p = Number(premium);
      if (!Number.isFinite(p) || p < 0) {
        throw new ValidationError("قيمة القسط غير صالحة", { field: "premium", fix: "أدخل قيمة غير سالبة" });
      }
    }
    if (endDate !== undefined) {
      const ed = new Date(endDate);
      if (Number.isNaN(ed.getTime())) {
        throw new ValidationError("تاريخ الانتهاء غير صالح", { field: "endDate", fix: "استخدم تنسيق YYYY-MM-DD" });
      }
      if (existing.startDate && ed <= new Date(existing.startDate as string | Date)) {
        throw new ValidationError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية", { field: "endDate", fix: "اختر تاريخاً لاحقاً لتاريخ بداية الوثيقة" });
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let idx = 1;
    if (provider !== undefined && provider !== existing.provider) {
      sets.push(`provider = $${idx++}`); params.push(provider);
      before.provider = existing.provider; after.provider = provider;
    }
    if (policyNumber !== undefined && policyNumber !== existing.policyNumber) {
      sets.push(`"policyNumber" = $${idx++}`); params.push(policyNumber);
      before.policyNumber = existing.policyNumber; after.policyNumber = policyNumber;
    }
    if (premium !== undefined && Number(premium) !== Number(existing.premium)) {
      sets.push(`premium = $${idx++}`); params.push(premium);
      before.premium = existing.premium; after.premium = premium;
    }
    if (endDate !== undefined && endDate !== existing.endDate) {
      sets.push(`"endDate" = $${idx++}`); params.push(endDate);
      before.endDate = existing.endDate; after.endDate = endDate;
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتعديل", { fix: "أرسل حقلاً واحداً على الأقل لتعديله" });
    }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_insurance SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("سجل التأمين غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_insurance",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.insurance.updated", entity: "fleet_insurance", entityId: id,
      details: JSON.stringify({ id, ...after }),
    }).catch((e) => logger.error(e, "fleet background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update insurance error:"); }
});

router.delete("/insurance/:id", authorize({ feature: "fleet.vehicles", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id FROM fleet_insurance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("سجل التأمين غير موجود");
    const { affectedRows } = await rawExecute(`UPDATE fleet_insurance SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.insurance.deleted",
      entity: "fleet_insurance",
      entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_insurance", entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json({ success: true, message: "تم حذف سجل التأمين" });
  } catch (err) { handleRouteError(err, res, "Delete insurance error:"); }
});

router.get("/stats", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[vehicles], [trips], [fuel], [insurance], [maintenance], [drivers], [alerts]] = await Promise.all([
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available, COUNT(*) FILTER (WHERE status='in_use') as "inUse", COUNT(*) FILTER (WHERE status='maintenance') as "inMaintenance" FROM fleet_vehicles WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='completed') as completed FROM fleet_trips WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("totalCost"),0) as "totalFuelCost" FROM fleet_fuel_logs WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM fleet_insurance WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM fleet_maintenance WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM fleet_drivers WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM fleet_maintenance WHERE "companyId"=$1 AND status='in_progress' AND "deletedAt" IS NULL`, [cid]),
    ]);
    res.json(maskFields(req, {
      totalVehicles: Number(vehicles.total), availableVehicles: Number(vehicles.available),
      inUseVehicles: Number(vehicles.inUse), inMaintenanceVehicles: Number(vehicles.inMaintenance),
      totalTrips: Number(trips.total), completedTrips: Number(trips.completed),
      totalFuelCost: Number(fuel.totalFuelCost), totalInsurance: Number(insurance.total),
      totalMaintenance: Number(maintenance.total), activeAlerts: Number(alerts.total),
      totalDrivers: Number(drivers.total),
      vehicles, trips,
    }));
  } catch (err) { handleRouteError(err, res, "Fleet stats error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PREVENTIVE MAINTENANCE PLANS — خطة الصيانة الوقائية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/preventive-plans", authorize({ feature: "fleet.maintenance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId } = req.query as Record<string, string | undefined>;
    const conditions = [`p."companyId"=$1`];
    const params: unknown[] = [scope.companyId];
    if (vehicleId) { params.push(Number(vehicleId) || 0); conditions.push(`p."vehicleId"=$${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.*, v."plateNumber", v."currentMileage"
       FROM fleet_preventive_plans p
       JOIN fleet_vehicles v ON v.id=p."vehicleId" AND v."deletedAt" IS NULL
       WHERE ${conditions.join(" AND ")} AND p."deletedAt" IS NULL
       ORDER BY p."nextServiceDate" ASC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Preventive plans error:"); }
});

router.post("/preventive-plans", authorize({ feature: "fleet.maintenance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPreventivePlanSchema.safeParse(req.body));
    if (!b.vehicleId) {
      throw new ValidationError("المركبة مطلوبة", { field: "vehicleId", fix: "اختر المركبة التي ستُنشأ لها خطة الصيانة" });
    }
    if (!b.serviceType || typeof b.serviceType !== "string" || !b.serviceType.trim()) {
      throw new ValidationError("نوع الخدمة مطلوب", { field: "serviceType", fix: "اختر نوع الصيانة الوقائية (تغيير زيت، فلتر هواء، إلخ)" });
    }
    if (!b.intervalKm && !b.intervalDays) {
      throw new ValidationError("فترة الصيانة مطلوبة — كم أو أيام", { field: "intervalKm", fix: "أدخل فترة الصيانة بالكيلومترات أو بالأيام (أو كليهما)" });
    }
    const [vehicleRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!vehicleRow) {
      throw new ValidationError("المركبة غير موجودة", { field: "vehicleId", fix: "اختر مركبة مسجلة" });
    }

    // Auto-compute nextServiceDate and nextServiceMileage from intervals + last service values
    // "due by whichever comes first" — both are computed; the earlier triggers the service
    let nextServiceDate: string | null = b.nextServiceDate || null;
    let nextServiceMileage: number | null = b.nextServiceMileage ? Number(b.nextServiceMileage) : null;

    if (!nextServiceDate && b.lastServiceDate && b.intervalDays) {
      const lastDate = new Date(b.lastServiceDate);
      lastDate.setDate(lastDate.getDate() + Number(b.intervalDays));
      nextServiceDate = toDateISO(lastDate);
    }
    if (!nextServiceMileage && b.lastServiceMileage && b.intervalKm) {
      nextServiceMileage = Number(b.lastServiceMileage) + Number(b.intervalKm);
    }

    // If neither interval was provided, also try fetching vehicle current mileage
    if (!nextServiceMileage && b.intervalKm) {
      const [vehicle] = await rawQuery<Record<string, unknown>>(
        `SELECT "currentMileage" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.vehicleId, scope.companyId]
      );
      if (vehicle?.currentMileage) {
        nextServiceMileage = Number(vehicle.currentMileage) + Number(b.intervalKm);
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_preventive_plans
       ("companyId","vehicleId","serviceType","intervalKm","intervalDays","lastServiceDate","lastServiceMileage","nextServiceDate","nextServiceMileage","estimatedCost",status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)`,
      [scope.companyId, b.vehicleId, b.serviceType,
       b.intervalKm || null, b.intervalDays || null,
       b.lastServiceDate || null, b.lastServiceMileage || null,
       nextServiceDate, nextServiceMileage,
       b.estimatedCost || 0, b.notes || null]
    );
    assertInsert(insertId, "fleet_preventive_plans");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_preventive_plans WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.preventive.created", entity: "fleet_preventive_plans", entityId: insertId,
      details: JSON.stringify({ vehicleId: b.vehicleId, serviceType: b.serviceType }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_preventive_plans", entityId: insertId,
      after: { vehicleId: b.vehicleId, serviceType: b.serviceType, intervalKm: b.intervalKm, intervalDays: b.intervalDays },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create preventive plan error:"); }
});

router.patch("/preventive-plans/:id", authorize({ feature: "fleet.maintenance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updatePreventivePlanSchema.safeParse(req.body));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: unknown[] = [];

    // Fetch existing plan to recompute due values when last service is updated
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT p.*, v."currentMileage" FROM fleet_preventive_plans p
       JOIN fleet_vehicles v ON v.id=p."vehicleId" AND v."deletedAt" IS NULL
       WHERE p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الخطة غير موجودة");

    if (b.nextServiceDate !== undefined) { params.push(b.nextServiceDate); sets.push(`"nextServiceDate"=$${params.length}`); }
    if (b.nextServiceMileage !== undefined) { params.push(b.nextServiceMileage); sets.push(`"nextServiceMileage"=$${params.length}`); }
    if (b.lastServiceDate !== undefined) { params.push(b.lastServiceDate); sets.push(`"lastServiceDate"=$${params.length}`); }
    if (b.lastServiceMileage !== undefined) { params.push(b.lastServiceMileage); sets.push(`"lastServiceMileage"=$${params.length}`); }
    if (b.estimatedCost !== undefined) { params.push(b.estimatedCost); sets.push(`"estimatedCost"=$${params.length}`); }
    // NF-FLEET-PREF-01 — preventive plans previously accepted any status
    // value here, so a plan could leap from `pending` to `completed`
    // (or even backwards) without a maintenance record being filed.
    // Restrict to the documented forward path; completed/cancelled are
    // terminal.
    if (b.status !== undefined && b.status !== existing.status) {
      const allowedNext: Record<string, string[]> = {
        pending: ["in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: ["pending"],
      };
      const allowed = allowedNext[String(existing.status)] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل الخطة الوقائية من "${existing.status}" إلى "${b.status}"`,
          { field: "status", fix: `الحالات المسموحة: ${allowed.join(", ") || "(لا شيء)"}` }
        );
      }
      params.push(b.status); sets.push(`status=$${params.length}`);
    }

    // When last service date/mileage is updated and no explicit next values, recompute from intervals
    const effectiveLastDate = b.lastServiceDate ?? existing.lastServiceDate;
    const effectiveLastMileage = b.lastServiceMileage ?? existing.lastServiceMileage;

    if ((b.lastServiceDate !== undefined || b.lastServiceMileage !== undefined) && b.nextServiceDate === undefined) {
      if (effectiveLastDate && existing.intervalDays) {
        const d = new Date(effectiveLastDate as string | Date);
        d.setDate(d.getDate() + Number(existing.intervalDays));
        const nextDate = toDateISO(d);
        params.push(nextDate); sets.push(`"nextServiceDate"=$${params.length}`);
      }
    }
    if ((b.lastServiceMileage !== undefined) && b.nextServiceMileage === undefined) {
      if (effectiveLastMileage && existing.intervalKm) {
        const nextKm = Number(effectiveLastMileage) + Number(existing.intervalKm);
        params.push(nextKm); sets.push(`"nextServiceMileage"=$${params.length}`);
      }
    }

    if (sets.length === 1) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<Record<string, unknown>>(
      `UPDATE fleet_preventive_plans SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("الخطة غير موجودة");

    if (b.partsUsed && Array.isArray(b.partsUsed) && b.partsUsed.length > 0) {
      fleetEngine.requestWarehouseDeduction(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
        { maintenanceId: id, parts: b.partsUsed }
      ).catch((e: unknown) => logger.error(e, "Fleet warehouse deduction error:"));
    }

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.preventive.updated", entity: "fleet_preventive_plans", entityId: id,
      details: JSON.stringify({ id }),
    }).catch((e) => logger.error(e, "fleet background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_preventive_plans", entityId: id,
      after: { ...b },
    }).catch((e) => logger.error(e, "fleet background task failed"));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update preventive plan error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAFFIC VIOLATIONS — مخالفات مرورية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/traffic-violations", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId, driverId } = req.query as Record<string, string | undefined>;
    const conditions = [`tv."companyId"=$1`];
    const params: unknown[] = [scope.companyId];
    if (vehicleId) { params.push(Number(vehicleId) || 0); conditions.push(`tv."vehicleId"=$${params.length}`); }
    if (driverId) { params.push(Number(driverId) || 0); conditions.push(`tv."driverId"=$${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT tv.*, v."plateNumber", d.name AS "driverName"
       FROM fleet_traffic_violations tv
       LEFT JOIN fleet_vehicles v ON v.id=tv."vehicleId" AND v."deletedAt" IS NULL
       LEFT JOIN fleet_drivers d ON d.id=tv."driverId" AND d."deletedAt" IS NULL
       WHERE ${conditions.join(" AND ")} AND tv."deletedAt" IS NULL
       ORDER BY tv."violationDate" DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Traffic violations error:"); }
});

router.get("/traffic-violations/:id", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT tv.*, v."plateNumber", d.name AS "driverName"
       FROM fleet_traffic_violations tv
       LEFT JOIN fleet_vehicles v ON v.id=tv."vehicleId" AND v."deletedAt" IS NULL
       LEFT JOIN fleet_drivers d ON d.id=tv."driverId" AND d."deletedAt" IS NULL
       WHERE tv.id = $1 AND tv."companyId" = $2 AND tv."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة المرورية غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Traffic violation detail error:"); }
});

router.post("/traffic-violations", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createTrafficViolationSchema.safeParse(req.body));
    if (!b.vehicleId) {
      throw new ValidationError("المركبة مطلوبة", { field: "vehicleId", fix: "اختر المركبة المرتبطة بالمخالفة" });
    }
    if (!b.violationType || typeof b.violationType !== "string" || !b.violationType.trim()) {
      throw new ValidationError("نوع المخالفة مطلوب", { field: "violationType", fix: "أدخل وصف نوع المخالفة" });
    }
    const fineAmount = Number(b.fineAmount || 0);
    if (!Number.isFinite(fineAmount) || fineAmount < 0) {
      throw new ValidationError("قيمة الغرامة غير صالحة", { field: "fineAmount", fix: "أدخل قيمة غير سالبة" });
    }
    // If liability is on the driver, we need an actual driver on the violation
    // otherwise the payroll deduction step can't fire and the violation becomes
    // an orphan.
    if (b.liability === "driver" && !b.driverId) {
      throw new ValidationError("مسؤولية السائق تتطلب تحديد السائق", { field: "driverId", fix: "اختر السائق صاحب المخالفة أو غيّر المسؤولية إلى الشركة" });
    }
    const [vehicleRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!vehicleRow) {
      throw new ValidationError("المركبة غير موجودة", { field: "vehicleId", fix: "اختر مركبة مسجلة" });
    }
    let driverEmployeeId: number | null = null;
    if (b.driverId) {
      const [driverRow] = await rawQuery<{ id: number; employeeId: number | null }>(
        `SELECT id, "employeeId" FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.driverId, scope.companyId]
      );
      if (!driverRow) {
        throw new ValidationError("السائق غير موجود", { field: "driverId", fix: "اختر سائقاً مسجلاً في النظام" });
      }
      driverEmployeeId = driverRow.employeeId ?? null;
    }
    // "company" (default) = company pays the fine → GL expense.
    // "driver" = fine liability shifted to driver → payroll deduction in current period.
    const liability: 'company' | 'driver' = b.liability === 'driver' ? 'driver' : 'company';
    // Guard the silent-drop: a driver-liability fine can only be docked if the
    // driver is linked to an employee record. Without this the deduction step
    // skips quietly — no GL (liability isn't company), no payroll row, no error
    // — and the fine vanishes from both ledgers. Fail fast at validation time.
    if (liability === 'driver' && fineAmount > 0 && driverEmployeeId == null) {
      throw new ValidationError(
        "السائق غير مرتبط بسجل موظف — لا يمكن حسم الغرامة من راتبه",
        { field: "driverId", fix: "اربط السائق بموظف، أو غيّر المسؤولية إلى «الشركة» لترحيلها كمصروف." }
      );
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_traffic_violations
       ("companyId","vehicleId","driverId","violationType","violationDate","fineAmount","location","violationNumber",status,notes,"paidAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
      [scope.companyId, b.vehicleId, b.driverId || null, b.violationType,
       b.violationDate || todayISO(),
       fineAmount, b.location || null, b.violationNumber || null,
       b.notes || null, null]
    );
    assertInsert(insertId, "fleet_traffic_violations");

    // GL posting — company-borne fines hit expense account immediately. If
    // the GL fails we roll back the violation row so we never have a visible
    // fine without its accounting impact.
    let journalEntryId: number | null = null;
    if (fineAmount > 0 && liability === 'company') {
      try {
        // Violation JE lands on the vehicle's branch when known.
        let violationBranchId: number | null | undefined = scope.branchId;
        if (b.vehicleId) {
          const [v] = await rawQuery<{ branchId?: number | null }>(
            `SELECT "branchId" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
            [b.vehicleId, scope.companyId]
          ).catch(() => [] as { branchId?: number | null }[]);
          violationBranchId = v?.branchId ?? scope.branchId;
        }
        const { fleetEngine } = await import("../lib/engines/index.js");
        const glResult = await fleetEngine.postTrafficViolationGL(
          { companyId: scope.companyId, branchId: violationBranchId, createdBy: scope.userId },
          {
            id: insertId,
            vehicleId: b.vehicleId ? Number(b.vehicleId) : 0,
            driverId: b.driverId ? Number(b.driverId) : undefined,
            amount: fineAmount,
            description: `مخالفة مرورية — ${b.violationType}${b.violationNumber ? ` #${b.violationNumber}` : ''}`,
          }
        );
        journalEntryId = glResult.journalId;
      } catch (jeErr) {
        logger.error(jeErr, "Traffic violation journal entry failed");
        await rawExecute(`UPDATE fleet_traffic_violations SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]).catch((e) => logger.error(e, "Failed to rollback traffic violation"));
        throw new IntegrationError("تعذّر إنشاء القيد المحاسبي للمخالفة — لم يتم تسجيل المخالفة", { field: "journalEntry", fix: "تحقق من إعدادات ربط الحسابات (fleet_fines_expense / fleet_fines_payable) ثم أعد المحاولة" });
      }
    }

    // Driver-liability: request a payroll deduction via Fleet Engine →
    // HR Engine event boundary (no direct write to HR-owned table).
    let driverAssignmentId: number | null = null;
    if (fineAmount > 0 && liability === 'driver' && b.driverId) {
      try {
        const [driver] = await rawQuery<Record<string, unknown>>(
          `SELECT fd."employeeId", ea.id AS "assignmentId"
           FROM fleet_drivers fd
           LEFT JOIN employee_assignments ea ON ea."employeeId" = fd."employeeId" AND ea."companyId" = fd."companyId" AND ea.status = 'active'
           WHERE fd.id = $1 AND fd."companyId" = $2 AND fd."deletedAt" IS NULL`,
          [b.driverId, scope.companyId]
        );
        if (driver?.employeeId) {
          const { fleetEngine } = await import("../lib/engines/index.js");
          await fleetEngine.requestPayrollDeduction(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
            {
              employeeId: driver.employeeId as number,
              violationId: insertId,
              amount: fineAmount,
              reason: `مخالفة مرورية: ${b.violationType}`,
            }
          );
          driverAssignmentId = (driver.assignmentId as number | null) ?? null;
        }
      } catch (pdErr) {
        logger.error(pdErr, "Traffic violation payroll deduction request failed:");
      }
      if (driverAssignmentId) {
        createNotification({
          companyId: scope.companyId,
          assignmentId: driverAssignmentId,
          type: "traffic_violation_deducted",
          title: "تم تسجيل مخالفة مرورية على عهدتك",
          body: `${b.violationType} — قيمة ${fineAmount} ﷼ — سيتم الخصم في الراتب القادم${b.violationNumber ? ` (رقم: ${b.violationNumber})` : ''}`,
          priority: "high",
          refType: "fleet_traffic_violation",
          refId: insertId,
          actionUrl: `/fleet/violations/${insertId}`,
        }).catch((e) => logger.error(e, "fleet background task failed"));
      }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_traffic_violations", entityId: insertId,
      after: {
        vehicleId: b.vehicleId, driverId: b.driverId ?? null,
        violationType: b.violationType, fineAmount, liability,
        journalEntryId, deductionRequested: liability === 'driver',
      },
    }).catch((e) => logger.error(e, "fleet background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.traffic_violation.created", entity: "fleet_traffic_violations", entityId: insertId,
      details: `${b.violationType} — ${fineAmount} ﷼ — ${liability === 'driver' ? 'على السائق' : 'على الشركة'}`,
    }).catch((e) => logger.error(e, "fleet background task failed"));

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_traffic_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    res.status(201).json({ ...row, journalEntryId, liability });
  } catch (err) { handleRouteError(err, res, "Create traffic violation error:"); }
});

router.patch("/traffic-violations/:id/pay", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM fleet_traffic_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المخالفة غير موجودة");

    // State machine: must be pending or disputed to pay. paid/cancelled are terminal.
    const allowedNext = VIOLATION_TRANSITIONS[existing.status as string] ?? [];
    if (!allowedNext.includes("paid")) {
      throw new ConflictError(
        existing.status === "paid"
          ? "المخالفة مدفوعة بالفعل"
          : `لا يمكن سداد مخالفة حالتها "${existing.status}"`,
        {
          field: "status",
          fix: `الانتقالات المسموحة من الحالة الحالية: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد (حالة نهائية)"}`,
        }
      );
    }

    // Post the cash-out journal entry BEFORE flipping status so dual-entry is guaranteed.
    const fineAmount = Number(existing.fineAmount || 0);
    if (fineAmount > 0) {
      try {
        const { fleetEngine } = await import("../lib/engines/index.js");
        await fleetEngine.postViolationPaymentGL(
          { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
          { id, vehicleId: existing.vehicleId ? Number(existing.vehicleId) : undefined, amount: fineAmount }
        );
      } catch (jeErr) {
        logger.error(jeErr, "Traffic violation payment JE failed:");
        throw new IntegrationError("فشل قيد السداد — لم يتم تسجيل العملية", { field: "journalEntry", fix: "راجع إعدادات الحسابات المالية (2100 / 1100) ثم أعد المحاولة" });
      }
    }

    await applyTransition({
      entity: "fleet_traffic_violations",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "fleet.traffic_violation.paid",
      fromStates: ["pending", "unpaid"],
      toState: "paid",
      setExtras: { paidAt: { raw: "NOW()" } },
      after: { fineAmount },
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "pay", entity: "fleet_traffic_violations", entityId: id,
      before: { status: existing.status }, after: { status: "paid", fineAmount },
    }).catch((e) => logger.error(e, "fleet background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.traffic_violation.paid", entity: "fleet_traffic_violations", entityId: id,
      details: `سداد مخالفة ${existing.violationNumber ?? id} بقيمة ${fineAmount}`,
    }).catch((e) => logger.error(e, "fleet background task failed"));


    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM fleet_traffic_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Pay violation error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TCO ANALYSIS — تحليل التكلفة الكلية للمركبة
// ─────────────────────────────────────────────────────────────────────────────

router.get("/vehicles/:id/tco", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = parseId(req.params.id, "id");

    const [vehicle] = await rawQuery<Record<string, unknown>>(
      `SELECT v.*, d.name AS "driverName"
       FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id=v."assignedDriverId" AND d."deletedAt" IS NULL
       WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );
    if (!vehicle) throw new NotFoundError("المركبة غير موجودة");

    const [fuelCost] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM("totalCost"),0) AS total, COALESCE(SUM(liters),0) AS liters,
              COALESCE(SUM(CASE WHEN "mileageAtFuel" IS NOT NULL THEN "totalCost" ELSE 0 END),0) AS "withMileage"
       FROM fleet_fuel_logs WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );
    const [maintenanceCost] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(cost),0) AS total FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );
    const [insuranceCost] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(premium),0) AS total FROM fleet_insurance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );
    const [tripRevenue] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(cost),0) AS revenue, COUNT(*) AS trips,
              COALESCE(SUM(distance),0) AS "totalKm"
       FROM fleet_trips WHERE "vehicleId"=$1 AND "companyId"=$2 AND status='completed' AND "deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );
    const [trafficFines] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM("fineAmount"),0) AS total FROM fleet_traffic_violations WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );

    const purchasePrice = Number(vehicle.purchasePrice || 0);
    const yearsSincePurchase = vehicle.purchaseDate
      ? (Date.now() - new Date(vehicle.purchaseDate as string | Date).getTime()) / (365.25 * 24 * 3600 * 1000)
      : 1;
    const annualDepreciation = purchasePrice > 0 ? purchasePrice * 0.2 : 0;
    const totalDepreciation = roundTo2(annualDepreciation * yearsSincePurchase);

    const fuelTotal = Number(fuelCost.total);
    const maintenanceTotal = Number(maintenanceCost.total);
    const insuranceTotal = Number(insuranceCost.total);
    const finesTotal = Number(trafficFines?.total || 0);
    const totalCost = purchasePrice + fuelTotal + maintenanceTotal + insuranceTotal + finesTotal;
    const totalKm = Number(tripRevenue.totalKm) || Number(vehicle.currentMileage) || 1;
    const costPerKm = totalKm > 0 ? roundTo2(totalCost / totalKm) : 0;

    res.json(maskFields(req, {
      vehicleId, plateNumber: vehicle.plateNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year,
      purchasePrice, totalDepreciation,
      fuelCost: fuelTotal, maintenanceCost: maintenanceTotal,
      insuranceCost: insuranceTotal, trafficFines: finesTotal,
      totalCost: roundTo2(totalCost),
      totalKm, costPerKm,
      totalTrips: Number(tripRevenue.trips),
      yearsSincePurchase: roundTo2(yearsSincePurchase),
      breakdown: {
        purchase: purchasePrice,
        depreciation: totalDepreciation,
        fuel: fuelTotal,
        maintenance: maintenanceTotal,
        insurance: insuranceTotal,
        fines: finesTotal,
      },
    }));
  } catch (err) { handleRouteError(err, res, "TCO analysis error:"); }
});

// ─── N4 — Tires CRUD ─────────────────────────────────────────────────────────
// Per-vehicle tire inventory. Closes N4 from
// docs/testing/CRITICAL_DEFECTS_REPORT.md (pre-fix: tires existed only
// as a preventive-plan task type and an alert reason — no entity, no
// stock tracking, no per-position lifecycle).
const createTireSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  position: z.enum(["front_left", "front_right", "rear_left", "rear_right", "spare", "extra"]),
  brand: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  installMileage: z.coerce.number().int().optional(),
  installDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateTireSchema = createTireSchema.partial().extend({
  status: z.enum(["active", "rotated", "replaced", "discarded"]).optional(),
  replaceMileage: z.coerce.number().int().optional(),
  replaceDate: z.string().optional(),
});

router.get("/tires", authorize({ feature: "fleet.maintenance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const params: unknown[] = [scope.companyId];
    let sql = `SELECT t.*, v."plateNumber"
                 FROM fleet_tires t
                 LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."deletedAt" IS NULL
                WHERE t."companyId" = $1 AND t."deletedAt" IS NULL`;
    if (vehicleId) { params.push(vehicleId); sql += ` AND t."vehicleId" = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND t.status = $${params.length}`; }
    sql += ` ORDER BY t."vehicleId", t."position", t.id DESC LIMIT 500`;
    const rows = await rawQuery(sql, params).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "tires list error"); }
});

router.post("/tires", authorize({ feature: "fleet.maintenance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createTireSchema.safeParse(req.body));
    const [v] = await rawQuery<{ id: number; branchId: number | null }>(
      `SELECT id, "branchId" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!v) throw new ValidationError("المركبة غير موجودة", { field: "vehicleId" });
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_tires ("companyId","branchId","vehicleId","position",brand,size,"installMileage","installDate",notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
      [scope.companyId, v.branchId, b.vehicleId, b.position, b.brand ?? null, b.size ?? null, b.installMileage ?? null, b.installDate ?? null, b.notes ?? null]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: v.branchId ?? undefined, userId: scope.userId,
      action: "create", entity: "fleet_tires", entityId: insertId,
      after: { vehicleId: b.vehicleId, position: b.position, brand: b.brand },
    }).catch((e) => logger.error(e, "tires audit failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.tire.installed", entity: "fleet_tires", entityId: insertId,
    }).catch((e) => logger.error(e, "tires event failed"));
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "tires create error"); }
});

router.patch("/tires/:id", authorize({ feature: "fleet.maintenance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateTireSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (b.position !== undefined) set("position", b.position);
    if (b.brand !== undefined) set("brand", b.brand);
    if (b.size !== undefined) set("size", b.size);
    if (b.installMileage !== undefined) set("installMileage", b.installMileage);
    if (b.installDate !== undefined) set("installDate", b.installDate);
    if (b.status !== undefined) set("status", b.status);
    if (b.replaceMileage !== undefined) set("replaceMileage", b.replaceMileage);
    if (b.replaceDate !== undefined) set("replaceDate", b.replaceDate);
    if (b.notes !== undefined) set("notes", b.notes);
    if (!sets.length) { res.json({ ok: true, updated: 0 }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE fleet_tires SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
      params
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "fleet_tires", entityId: id,
      after: b,
    }).catch((e) => logger.error(e, "tires audit failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "tires update error"); }
});

router.delete("/tires/:id", authorize({ feature: "fleet.maintenance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE fleet_tires SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "fleet_tires", entityId: id,
    }).catch((e) => logger.error(e, "tires audit failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "tires delete error"); }
});


// ─── N5 — Vehicle Rental Contracts ──────────────────────────────────────────
// External-customer vehicle rental. Closes N5 from
// CRITICAL_DEFECTS_REPORT.md. Mirrors properties.rental_contracts shape:
// contract row + payment schedule + GL on payment received.
const createRentalContractSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  clientId: z.coerce.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  dailyRate: z.coerce.number().nonnegative().optional(),
  weeklyRate: z.coerce.number().nonnegative().optional(),
  monthlyRate: z.coerce.number().nonnegative().optional(),
  totalAmount: z.coerce.number().nonnegative().optional(),
  securityDeposit: z.coerce.number().nonnegative().optional(),
  paymentTerms: z.enum(["daily", "weekly", "monthly", "quarterly", "one_time"]).optional(),
  // #1812 Wave 1 Step C — R5: with or without a company driver. When
  // withDriver is true, driverId must point to a fleet_drivers row in
  // the same company; the rental is then logged as a "driver assigned"
  // operation and the driver's licence/eligibility checks apply.
  withDriver: z.boolean().optional(),
  driverId: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
}).refine(
  (b) => !b.withDriver || b.driverId != null,
  { message: "driverId مطلوب عند withDriver=true", path: ["driverId"] },
);

// #1812 Wave 1 Step C — R7: handover state recorded at vehicle pickup.
// The contract must already be active. Odometer is the integer km
// reading; fuelLevel is a 0..1 fraction. notes captures pre-existing
// scratches / interior wear so a return inspection has a baseline.
const rentalHandoverSchema = z.object({
  handoverOdometer: z.coerce.number().int().nonnegative(),
  handoverFuelLevel: z.coerce.number().min(0).max(1),
  handoverNotes: z.string().max(2000).optional(),
});

// #1812 Wave 1 Step C — R9: return state recorded when the customer
// brings the vehicle back. Overage (extra km / refuel charge / damage
// surcharge) is set by the operator on the same call so the Accounting
// Candidate downstream carries the surcharge as a separate line.
const rentalReturnSchema = z.object({
  returnOdometer: z.coerce.number().int().nonnegative(),
  returnFuelLevel: z.coerce.number().min(0).max(1),
  returnNotes: z.string().max(2000).optional(),
  actualEndDate: z.string().optional(),
  overageAmount: z.coerce.number().nonnegative().optional(),
});

router.get("/rental-contracts", authorize({ feature: "fleet.rentals", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const params: unknown[] = [scope.companyId];
    let sql = `SELECT c.*, v."plateNumber", v.make, v.model,
                      cl.name AS "clientName",
                      d.name AS "driverName"
                 FROM fleet_rental_contracts c
                 LEFT JOIN fleet_vehicles v ON v.id = c."vehicleId" AND v."deletedAt" IS NULL
                 LEFT JOIN clients cl ON cl.id = c."clientId" AND cl."deletedAt" IS NULL
                 LEFT JOIN fleet_drivers d ON d.id = c."driverId" AND d."deletedAt" IS NULL
                WHERE c."companyId" = $1 AND c."deletedAt" IS NULL`;
    if (vehicleId) { params.push(vehicleId); sql += ` AND c."vehicleId" = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND c.status = $${params.length}`; }
    sql += ` ORDER BY c."startDate" DESC LIMIT 500`;
    const rows = await rawQuery(sql, params).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "rental contracts list error"); }
});

router.post("/rental-contracts", authorize({ feature: "fleet.rentals", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createRentalContractSchema.safeParse(req.body));
    const [veh] = await rawQuery<{ id: number; branchId: number | null }>(
      `SELECT id, "branchId" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!veh) throw new ValidationError("المركبة غير موجودة", { field: "vehicleId" });
    const [cli] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.clientId, scope.companyId]
    );
    if (!cli) throw new ValidationError("العميل غير موجود", { field: "clientId" });

    // #1812 Wave 1 Step C — if withDriver, validate the driverId is a
    // fleet driver in the same company. The rental row links the
    // historical driver assignment; eligibility/license checks live on
    // dispatch-time guards in transport-bookings.ts.
    if (b.withDriver) {
      const [drv] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.driverId!, scope.companyId],
      );
      if (!drv) throw new ValidationError("السائق غير موجود", { field: "driverId" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_rental_contracts
         ("companyId","branchId","vehicleId","clientId","startDate","endDate",
          "dailyRate","weeklyRate","monthlyRate","totalAmount","securityDeposit",
          "paymentTerms",status,
          "withDriver","driverId",
          notes,"createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,
               $7,$8,$9,$10,$11,
               $12,'draft',
               $13,$14,
               $15,$16)`,
      [
        scope.companyId, veh.branchId, b.vehicleId, b.clientId, b.startDate, b.endDate ?? null,
        b.dailyRate ?? null, b.weeklyRate ?? null, b.monthlyRate ?? null,
        b.totalAmount ?? null, b.securityDeposit ?? 0,
        b.paymentTerms ?? 'monthly',
        b.withDriver ?? false, b.withDriver ? b.driverId! : null,
        b.notes ?? null, scope.userId,
      ],
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "fleet_rental_contracts", entityId: insertId,
      after: { vehicleId: b.vehicleId, clientId: b.clientId, totalAmount: b.totalAmount },
    }).catch((e) => logger.error(e, "fleet rental contract audit failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.rental_contract.created", entity: "fleet_rental_contracts", entityId: insertId,
    }).catch((e) => logger.error(e, "fleet rental contract event failed"));
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "rental contract create error"); }
});

// #1812 Wave 1 Step C — single-contract detail. The SPA detail page
// (rental-detail.tsx) needs the full row + joined vehicle/client/
// driver labels so the handover + return forms can render without
// re-fetching three lookup endpoints.
router.get("/rental-contracts/:id", authorize({ feature: "fleet.rentals", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT c.*, v."plateNumber", v.make, v.model,
              cl.name AS "clientName",
              d.name AS "driverName"
         FROM fleet_rental_contracts c
         LEFT JOIN fleet_vehicles v ON v.id = c."vehicleId" AND v."deletedAt" IS NULL
         LEFT JOIN clients cl ON cl.id = c."clientId" AND cl."deletedAt" IS NULL
         LEFT JOIN fleet_drivers d ON d.id = c."driverId" AND d."deletedAt" IS NULL
        WHERE c.id = $1 AND c."companyId" = $2 AND c."deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!row) throw new NotFoundError("العقد غير موجود");
    res.json({ data: row });
  } catch (err) { handleRouteError(err, res, "rental contract detail error"); }
});

router.post("/rental-contracts/:id/activate", authorize({ feature: "fleet.rentals", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE fleet_rental_contracts SET status = 'active', "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!affectedRows) throw new NotFoundError("العقد غير موجود أو ليس في حالة مسودّة");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "activate", entity: "fleet_rental_contracts", entityId: id,
    }).catch((e) => logger.error(e, "fleet rental audit failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "rental contract activate error"); }
});

// #1812 Wave 1 Step C — R7 handover. The dispatcher records the
// vehicle state (odometer + fuel level + any pre-existing damage
// notes) at the moment the customer takes the keys. Allowed only when
// the contract is `active` (not draft / completed / cancelled).
router.post("/rental-contracts/:id/handover", authorize({ feature: "fleet.rentals", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(rentalHandoverSchema.safeParse(req.body));
    const [c] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM fleet_rental_contracts
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!c) throw new NotFoundError("العقد غير موجود");
    if (c.status !== "active") {
      throw new ConflictError("التسليم لا يُسجَّل إلا بعد تفعيل العقد");
    }
    await rawExecute(
      `UPDATE fleet_rental_contracts
          SET "handoverOdometer" = $1,
              "handoverFuelLevel" = $2,
              "handoverNotes" = $3,
              "handoverAt" = NOW(),
              "updatedAt" = NOW()
        WHERE id = $4 AND "companyId" = $5`,
      [b.handoverOdometer, b.handoverFuelLevel, b.handoverNotes ?? null, id, scope.companyId],
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "handover", entity: "fleet_rental_contracts", entityId: id,
      after: { odometer: b.handoverOdometer, fuelLevel: b.handoverFuelLevel },
    }).catch((e) => logger.error(e, "rental handover audit failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "rental handover error"); }
});

// #1812 Wave 1 Step C — R9 return. Records the closing state and
// flips the contract to `completed`. The overage amount the operator
// supplies here is what will surface as a separate line in the
// downstream Accounting Candidate — no JE is posted in this screen
// (per the user's "السائق/الشاشة لا ترى المال — Candidate فقط" rule).
router.post("/rental-contracts/:id/return", authorize({ feature: "fleet.rentals", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(rentalReturnSchema.safeParse(req.body));
    const [c] = await rawQuery<{
      id: number; status: string; handoverAt: string | null;
      ref: string | null; clientId: number; vehicleId: number;
      driverId: number | null; startDate: string;
      totalAmount: string | null; notes: string | null;
      branchId: number | null;
    }>(
      `SELECT id, status, "handoverAt", ref, "clientId", "vehicleId",
              "driverId", "startDate", "totalAmount", notes, "branchId"
         FROM fleet_rental_contracts
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!c) throw new NotFoundError("العقد غير موجود");
    if (c.status !== "active") {
      throw new ConflictError("الإرجاع لا يُسجَّل إلا على عقد فعّال");
    }
    if (!c.handoverAt) {
      throw new ConflictError("لا يمكن تسجيل الإرجاع قبل التسليم");
    }
    await rawExecute(
      `UPDATE fleet_rental_contracts
          SET "returnOdometer" = $1,
              "returnFuelLevel" = $2,
              "returnNotes" = $3,
              "returnedAt" = NOW(),
              "actualEndDate" = COALESCE($4, CURRENT_DATE),
              "overageAmount" = COALESCE($5, 0),
              status = 'completed',
              "updatedAt" = NOW()
        WHERE id = $6 AND "companyId" = $7`,
      [b.returnOdometer, b.returnFuelLevel, b.returnNotes ?? null,
       b.actualEndDate ?? null, b.overageAmount ?? null,
       id, scope.companyId],
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "return", entity: "fleet_rental_contracts", entityId: id,
      after: {
        returnOdometer: b.returnOdometer, returnFuelLevel: b.returnFuelLevel,
        overageAmount: b.overageAmount ?? 0,
      },
    }).catch((e) => logger.error(e, "rental return audit failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.rental_contract.completed",
      entity: "fleet_rental_contracts", entityId: id,
      details: JSON.stringify({ overageAmount: b.overageAmount ?? 0 }),
    }).catch((e) => logger.error(e, "rental return event failed"));
    // #1812 — الإيراد عند الإغلاق → Accounting Candidate. Hands the
    // closed rental to the accountant queue (transport_billing_candidates)
    // with quantity = rental days so revenue is recognised over the
    // duration. NO journal entry here — the accountant materializes from
    // the finance side. Soft-fail: a candidate hiccup must not roll back
    // the operational close (the insert is idempotent and re-runnable).
    const candidate = await fleetEngine.createRentalBillingCandidate(
      { companyId: scope.companyId, branchId: c.branchId ?? scope.branchId ?? 0, createdBy: scope.userId },
      {
        id: c.id, ref: c.ref, clientId: c.clientId, vehicleId: c.vehicleId,
        driverId: c.driverId,
        startDate: c.startDate,
        actualEndDate: b.actualEndDate ?? currentDateInTz(),
        totalAmount: c.totalAmount != null ? Number(c.totalAmount) : null,
        overageAmount: b.overageAmount ?? 0,
        notes: c.notes,
      },
    ).catch((e) => { logger.error(e, "rental billing candidate failed"); return null; });
    res.json({ ok: true, billingCandidateId: candidate?.id ?? null });
  } catch (err) { handleRouteError(err, res, "rental return error"); }
});

// Schedule a payment row (operator-driven schedule, mirrors property
// payments' pattern). GL posting happens on the /pay endpoint below.
router.post("/rental-contracts/:id/payments", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = z.object({
      dueDate: z.string().min(1),
      amount: z.coerce.number().positive(),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!b.success) throw new ValidationError(b.error.errors[0]?.message ?? "بيانات غير صالحة");
    const [c] = await rawQuery<{ id: number }>(
      `SELECT id FROM fleet_rental_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!c) throw new NotFoundError("العقد غير موجود");
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_rental_payments ("companyId","contractId","dueDate",amount,status,notes)
       VALUES ($1,$2,$3,$4,'pending',$5)`,
      [scope.companyId, id, b.data.dueDate, b.data.amount, b.data.notes ?? null]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.rental_payment.scheduled", entity: "fleet_rental_payments", entityId: insertId,
      after: { contractId: id, dueDate: b.data.dueDate, amount: b.data.amount },
    }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "rental schedule error"); }
});

// Record payment receipt. Posts a real GL JE (Dr Cash / Cr Rental
// Revenue) so the fleet rental flow has the same financial integrity
// as the property rental flow.
router.post("/rental-payments/:id/pay", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = z.object({
      paidAmount: z.coerce.number().positive(),
      paidDate: z.string().optional(),
      method: z.string().optional(),
    }).safeParse(req.body);
    if (!b.success) throw new ValidationError(b.error.errors[0]?.message ?? "بيانات غير صالحة");

    let journalEntryId: number | null = null;
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; contractId: number; amount: string; vehicleId: number; branchId: number | null }>(
        `SELECT p.id, p."contractId", p.amount, c."vehicleId", c."branchId"
           FROM fleet_rental_payments p
           JOIN fleet_rental_contracts c ON c.id = p."contractId" AND c."companyId" = $2
          WHERE p.id = $1 AND p."companyId" = $2
            AND p.status IN ('pending', 'partial', 'overdue')
          FOR UPDATE`,
        [id, scope.companyId]
      );
      if (!rows.length) throw new NotFoundError("الدفعة غير موجودة أو مدفوعة");
      const payment = rows[0];
      const paidAmount = Math.min(b.data.paidAmount, Number(payment.amount));

      const { fleetEngine } = await import("../lib/engines/index.js");
      // postRentalRevenueGL — Dr 1100 Cash / Cr 4220 Fleet Rental
      // Revenue, dimensioned with vehicleId. If the engine doesn't have
      // this method yet, fall back to a direct call into financial-
      // Engine.postJournalEntry with the same shape so the GL still posts.
      try {
        const [cashCode, revCode] = await Promise.all([
          (await import("../lib/engines/financialEngine.js")).financialEngine.resolveAccountCode(scope.companyId, "fleet_cash_source", "credit", "1111"),
          (await import("../lib/engines/financialEngine.js")).financialEngine.resolveAccountCode(scope.companyId, "fleet_rental_revenue", "credit", "4150"),
        ]);
        const fe = (await import("../lib/engines/financialEngine.js")).financialEngine;
        const result = await fe.postJournalEntry({
          companyId: scope.companyId,
          branchId: payment.branchId ?? 0,
          createdBy: scope.userId,
          ref: `JE-FLEET-RENT-${payment.id}`,
          description: `إيراد تأجير مركبة — دفعة #${payment.id}`,
          type: "sales",
          sourceType: "fleet_rental_payments",
          sourceId: payment.id,
          sourceKey: `fleet:rental_payment:${payment.id}`,
          guardTable: "fleet_rental_payments",
          guardId: payment.id,
          lines: [
            { accountCode: cashCode, debit: paidAmount, credit: 0, vehicleId: payment.vehicleId },
            { accountCode: revCode, debit: 0, credit: paidAmount, vehicleId: payment.vehicleId },
          ],
        });
        journalEntryId = result.journalId;
      } catch (glErr) {
        logger.error(glErr, "fleet rental GL post failed");
        throw glErr; // block on GL failure — dual-entry invariant
      }

      const finalStatus = paidAmount >= Number(payment.amount) ? "paid" : "partial";
      await client.query(
        `UPDATE fleet_rental_payments
            SET "paidAmount" = "paidAmount" + $1,
                "paidDate" = COALESCE($2, CURRENT_DATE),
                method = COALESCE($3, method),
                status = $4,
                "journalEntryId" = $5,
                "updatedAt" = NOW()
          WHERE id = $6`,
        [paidAmount, b.data.paidDate ?? null, b.data.method ?? null, finalStatus, journalEntryId, id]
      );
    });

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.rental_payment.received", entity: "fleet_rental_payments", entityId: id,
      details: JSON.stringify({ journalEntryId }),
    }).catch((e) => logger.error(e, "fleet rental event failed"));
    res.json({ ok: true, journalEntryId });
  } catch (err) { handleRouteError(err, res, "rental pay error"); }
});

router.get("/rental-contracts/:id/payments", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT * FROM fleet_rental_payments WHERE "companyId" = $1 AND "contractId" = $2 ORDER BY "dueDate" ASC`,
      [scope.companyId, id]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "rental payments list error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// البند ٣ (دفعة ٢) — عقد الأسطول: تطبيق مستخرَج OCR مؤكَّد (استمارة مركبة) على المركبة.
//
// حدّ المسار: مسار الوثائق (خادم) لا يكتب في جدول المركبة؛ يمرّر الحقول المؤكَّدة، وهذا
// العقد المملوك للأسطول يكتبها داخل نطاقه — بصلاحية fleet.vehicles (لا صلاحية الوثائق)
// + ACL للصف + عزل companyId + تدقيق. السياسة: «املأ الفارغ فقط» — لا يطمس لوحة/هيكل/
// انتهاء استمارة قائمًا؛ القائم يبقى ويُبلَّغ في skipped. (نفس نمط عقد HR في الموظف.)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/vehicles/:id/ocr-apply",
  authorize({ feature: "fleet.vehicles", action: "update", resource: { table: "fleet_vehicles", idParam: "id" } }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const docType = String(req.body?.docType ?? "");
      const fields = req.body?.fields && typeof req.body.fields === "object" ? req.body.fields : {};
      if (!/vehicle|registration|استمارة|مركبة|سيارة/i.test(docType)) {
        throw new ValidationError("نوع المستند غير مدعوم بعد للتطبيق الآلي على المركبة", {
          field: "docType",
          fix: "الدفعة الحالية تدعم استمارة المركبة فقط.",
        });
      }
      const [veh] = await rawQuery<{ id: number; plateNumber: string | null; vinNumber: string | null; registrationExpiry: string | null }>(
        `SELECT id, "plateNumber", "vinNumber", "registrationExpiry" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!veh) throw new NotFoundError("المركبة غير موجودة");
      const plate =
        typeof fields.plateNumber === "string" && fields.plateNumber.trim() ? fields.plateNumber.trim().slice(0, 20) : null;
      const vin =
        typeof fields.vinNumber === "string" && /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(fields.vinNumber) ? fields.vinNumber.toUpperCase() : null;
      const expiry =
        typeof fields.registrationExpiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fields.registrationExpiry) ? fields.registrationExpiry : null;
      const setPlate = !!plate && !veh.plateNumber;
      const setVin = !!vin && !veh.vinNumber;
      const setExpiry = !!expiry && !veh.registrationExpiry;
      const applied: string[] = [];
      const skipped: string[] = [];
      if (plate) (setPlate ? applied : skipped).push("plateNumber");
      if (vin) (setVin ? applied : skipped).push("vinNumber");
      if (expiry) (setExpiry ? applied : skipped).push("registrationExpiry");
      if (!applied.length) {
        res.json({ ok: true, applied, skipped, message: "لا حقول فارغة للتعبئة — القيم القائمة محفوظة." });
        return;
      }
      await rawExecute(
        `UPDATE fleet_vehicles SET
           "plateNumber"        = COALESCE(NULLIF("plateNumber", ''), $1),
           "vinNumber"          = COALESCE(NULLIF("vinNumber", ''), $2),
           "registrationExpiry" = COALESCE("registrationExpiry", $3),
           "updatedAt"          = NOW()
         WHERE id=$4 AND "companyId"=$5 AND "deletedAt" IS NULL`,
        [setPlate ? plate : null, setVin ? vin : null, setExpiry ? expiry : null, id, scope.companyId],
      );
      void createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "vehicle.ocr.applied",
        entity: "fleet_vehicles",
        entityId: id,
        after: { docType, applied, skipped },
      }).catch((e) => logger.error(e, "vehicle ocr apply audit failed"));
      res.json({ ok: true, applied, skipped });
    } catch (err) {
      handleRouteError(err, res, "vehicle OCR apply error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// البند ٤ (شريحة ١) — واقعة «وقود» المركبة (الكيان يقود التجربة، ملحق أ §أ.١).
//
// تركيبٌ لمحرّك المالية الخادم postFinancialDocument (م٥، مُختبَر بـassertion): بند
// وقود + تخصيص المركبة + costBearer → المحرّك يحلّ الحساب الفرعي للوحة تلقائيًّا
// (substituteSubsidiaryAccountCodes)، ويفرّع المتحمِّل (company→مصروف · سائق/موظف→ذمته)،
// ويضع بُعد vehicleId، ويُرحّل القيد المتوازن. ثم السجل التشغيلي + تحديث العداد. لا منطق
// دفتر جديد (التوجيه المحاسبي يقرّره المحرّك حسب التوجيه — مبدأ إبراهيم). RBAC الأسطول +
// عقد خدمة للمالية (صفر SQL دفتر عابر في هذا الملف) + عزل companyId + Audit.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/vehicles/:id/fuel-event",
  authorize({ feature: "fleet.vehicles", action: "update", resource: { table: "fleet_vehicles", idParam: "id" } }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.id, "id");
      const b = (req.body ?? {}) as Record<string, unknown>;
      const liters = Number(b.liters) || 0;
      const costPerLiter = Number(b.costPerLiter) || 0;
      const mileageAtFuel = b.mileageAtFuel != null && Number.isFinite(Number(b.mileageAtFuel)) ? Number(b.mileageAtFuel) : null;
      const vatRatePercent = b.vatRatePercent != null && Number.isFinite(Number(b.vatRatePercent)) ? Number(b.vatRatePercent) : 0;
      const stationName = typeof b.stationName === "string" ? b.stationName.slice(0, 120) : null;
      const fuelDate = typeof b.fuelDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fuelDate) ? b.fuelDate : todayISO();
      const driverId = b.driverId != null && Number.isInteger(Number(b.driverId)) && Number(b.driverId) > 0 ? Number(b.driverId) : null;
      // costBearer: مَن يتحمّل التكلفة — شركة (تشغيلي، الافتراض) أو سائق/موظف… (→ ذمته عبر م٥).
      const costBearer = typeof b.costBearer === "string" && b.costBearer.trim() ? b.costBearer.trim() : "company";
      // ج-٤: طريقة الدفع — نقدًا (الافتراض) أو آجلًا على ذمة مورّد محطة الوقود. الآجل يستلزم مورّدًا
      // معتمدًا (suppliers.id) يُربط به الالتزام (لا تَدِين «لا أحد»).
      const paymentMethod = b.paymentMethod === "credit" ? "credit" : "cash";
      const supplierId = b.supplierId != null && Number.isInteger(Number(b.supplierId)) && Number(b.supplierId) > 0 ? Number(b.supplierId) : null;
      if (liters <= 0 || costPerLiter <= 0) {
        throw new ValidationError("اللترات وسعر اللتر مطلوبان وموجبان", { field: "liters" });
      }
      if (paymentMethod === "credit" && !supplierId) {
        throw new ValidationError("الشراء الآجل يستلزم تحديد مورّد الوقود", { field: "supplierId" });
      }
      const [veh] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [vehicleId, scope.companyId],
      );
      if (!veh) throw new NotFoundError("المركبة غير موجودة");
      const totalNet = Math.round(liters * costPerLiter * 100) / 100;

      // حلّ الحسابات عبر محرّك المالية (عقد خدمة): حساب وقود المركبة + مصدر النقد + ضريبة المدخلات.
      const { financialEngine } = await import("../lib/engines/financialEngine.js");
      // أوراق قابلة للترحيل (الدستور م١٧ / check:postable-fallbacks): fleet_fuel_expense→5510
      // (وقود الأسطول، postable)؛ vat_input→1180؛ fleet_cash_source→1111؛ purchase_vendor_ap→2111.
      // الـenricher يستبدل 5510 بحساب الوقود الفرعي للوحة (بُعد vehicleId)، و2111 بالحساب
      // الفرعي للمورّد (بُعد vendorId) عند الترحيل — الحساب الخاص لكل كيان.
      const fuelAccount = await financialEngine.resolveAccountCode(scope.companyId, "fleet_fuel_expense", "debit", "5510");
      // ج-٤: ساق الدائن — نقدًا (مصدر نقد الأسطول) أو آجلًا على ذمة المورّد (شراء آجل).
      const creditAccount = paymentMethod === "credit"
        ? await financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "credit", "2111")
        : await financialEngine.resolveAccountCode(scope.companyId, "fleet_cash_source", "credit", "1111");
      const vatAccount = vatRatePercent > 0 ? await financialEngine.resolveAccountCode(scope.companyId, "vat_input", "debit", "1180") : null;

      // الترحيل عبر محرّك م٥ المُختبَر (idempotent على sourceKey): يحلّ الحساب الفرعي للوحة + يفرّع costBearer.
      const sourceKey = `fleet:fuel:${scope.companyId}:${vehicleId}:${fuelDate}:${mileageAtFuel ?? "x"}:${Math.round(totalNet * 100)}`;
      const { postFinancialDocument } = await import("../lib/financeDocumentService.js");
      const posted = await postFinancialDocument({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        createdBy: scope.userId ?? 0,
        documentKind: "expense",
        direction: "payment",
        cashAccountCode: creditAccount,
        vatAccountCode: vatAccount,
        // ج-٤: عند الآجل اختِم vendorId على ساق ذمة المورّد (ربط الالتزام + الحساب الفرعي للمورّد).
        ...(paymentMethod === "credit" && supplierId ? { cashAccountDims: { vendorId: supplierId } } : {}),
        ref: `FUEL-${vehicleId}-${fuelDate}`,
        description: `وقود المركبة — ${liters} لتر${paymentMethod === "credit" ? " (آجل)" : ""}`,
        sourceKey,
        postingDate: fuelDate,
        rawLines: [
          {
            lineNo: 1,
            quantity: liters,
            unitPrice: costPerLiter,
            taxRatePercent: vatRatePercent,
            counterAccountCode: fuelAccount,
            itemName: "وقود",
            allocations: [
              {
                entityType: "vehicle",
                entityId: vehicleId,
                allocationType: "percent",
                percent: 100,
                costBearer,
                ...(driverId ? { dims: { driverId } } : {}),
              },
            ],
          },
        ],
        headerMeta: { relatedEntity: { type: "vehicle", id: vehicleId }, operationType: "fuel" },
      });

      // السجل التشغيلي + العداد (كتابتا الأسطول داخل معاملة — لا كتابة جزئية).
      let fuelLogId = 0;
      await withTransaction(async () => {
        const totalCost = Math.round((totalNet + totalNet * (vatRatePercent / 100)) * 100) / 100;
        const { insertId } = await rawExecute(
          `INSERT INTO fleet_fuel_logs ("companyId","vehicleId","driverId","fuelDate",liters,"costPerLiter","totalCost","mileageAtFuel","stationName")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [scope.companyId, vehicleId, driverId, fuelDate, liters, costPerLiter, totalCost, mileageAtFuel, stationName],
        );
        assertInsert(insertId, "fleet_fuel_logs");
        fuelLogId = insertId;
        if (mileageAtFuel != null) {
          await rawExecute(
            `UPDATE fleet_vehicles SET "currentMileage" = GREATEST(COALESCE("currentMileage", 0), $1), "updatedAt" = NOW()
             WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
            [mileageAtFuel, vehicleId, scope.companyId],
          );
        }
      });

      void createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "fleet.fuel_event.posted",
        entity: "fleet_vehicles",
        entityId: vehicleId,
        after: { journalId: posted.journalId, fuelLogId, liters, costPerLiter, costBearer, paymentMethod, supplierId, alreadyExists: posted.alreadyExists },
      }).catch((e) => logger.error(e, "fuel event audit failed"));

      res.status(201).json({ ok: true, journalId: posted.journalId, fuelLogId, costBearer, paymentMethod, supplierId });
    } catch (err) {
      handleRouteError(err, res, "vehicle fuel event error:");
    }
  },
);

export default router;
