/**
 * Transport Bookings + Dispatch (#1733 Issue Comment 9).
 *
 * Pre-trip pipeline:
 *
 *   intake →  booking  →  lines  →  dispatch order  →  cargo manifest /
 *                                                     fleet trip / umrah
 *                                                     transport row
 *
 * Endpoints:
 *
 *   GET    /transport/bookings              — list (filter by status, customer, date)
 *   GET    /transport/bookings/:id          — booking + lines + dispatch orders
 *   POST   /transport/bookings              — create + optional lines
 *   PATCH  /transport/bookings/:id          — update + status transition
 *   POST   /transport/bookings/:id/lines    — add a line
 *   PATCH  /transport/bookings/:id/lines/:lineId — update a line
 *
 *   GET    /transport/dispatch-orders       — board view (filter by date window, driver, vehicle)
 *   POST   /transport/dispatch-orders       — dispatch a line (conflict-checked + eligibility-checked)
 *   PATCH  /transport/dispatch-orders/:id   — accept / decline / start / complete
 *
 *   GET    /transport/locations             — locations master
 *   POST   /transport/locations             — create
 *
 * RBAC: gated on `fleet.bookings` and `fleet.dispatch` features
 * (added in featureCatalog.ts in the same PR).
 *
 * Conflict detection: when creating a dispatch order, the route checks
 * the partial indexes for any other order on the same driver / vehicle
 * whose time window overlaps. Override requires a documented reason
 * (consistent with #1753 capacity and #1761 eligibility patterns).
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { checkAccess } from "../lib/rbac/authzEngine.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { cascadeDispatchToBooking, cancelTripsForDispatchOrder } from "../lib/transportDispatchCascade.js";
import { resolveSettings } from "../lib/settings.js";
import { assertDriverEligibility } from "../lib/fleet/driverEligibility.js";
import { assertDriverRest } from "../lib/fleet/driverRest.js";
import { suggestAssignments } from "../lib/fleet/assignmentSuggestionEngine.js";
import { fleetEngine } from "../lib/engines/index.js";
import { recordTripEventSchema, recordBookingTripEvent } from "../lib/transport/tripEvents.js";
import { deductionCandidateSchema, createDeductionCandidate, resolveDeductionRates } from "../lib/transport/deductions.js";

export const transportBookingsRouter = Router();
transportBookingsRouter.use(authMiddleware);

// ─── Shared enums ─────────────────────────────────────────────────────
const BOOKING_SOURCES = [
  "manual_entry", "customer_request", "umrah_group",
  "contract_schedule", "import_excel", "api_integration",
  "recurring_schedule",
] as const;

import { TRANSPORT_SERVICE_TYPES } from "../lib/transportEnums.js";

// #1812 Comment 4663005810 — explicit cargo vs passenger family.
// The booking row carries a `tripFamily` column (migration 284) so
// every downstream surface (UI rendering, assignment engine filter,
// reports, cargo operational metadata) can branch cleanly.
const TRIP_FAMILIES = ["passenger", "cargo"] as const;

function deriveTripFamily(
  serviceType: typeof TRANSPORT_SERVICE_TYPES[number],
  passengerCount?: number | null,
  cargoWeight?: number | null,
): typeof TRIP_FAMILIES[number] {
  // Unambiguous mappings.
  if (serviceType === "cargo_load") return "cargo";
  if (serviceType === "passenger_umrah" || serviceType === "passenger_general") return "passenger";
  // equipment_rental / internal_transfer / other: tip by data.
  if ((passengerCount ?? 0) > 0) return "passenger";
  if ((cargoWeight ?? 0) > 0) return "cargo";
  // Default: equipment_rental tilts passenger (driver+1), the rest tilt cargo.
  return serviceType === "equipment_rental" ? "passenger" : "cargo";
}

const BOOKING_STATUSES = [
  "draft", "submitted", "pending_approval", "approved",
  "scheduled", "dispatched", "in_progress", "completed",
  "cancelled", "rejected",
] as const;

const BOOKING_TRANSITIONS: Record<typeof BOOKING_STATUSES[number], string[]> = {
  draft:            ["submitted", "cancelled"],
  submitted:        ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved:         ["scheduled", "cancelled"],
  scheduled:        ["dispatched", "cancelled"],
  dispatched:       ["in_progress", "cancelled"],
  in_progress:      ["completed", "cancelled"],
  completed:        [],
  cancelled:        [],
  rejected:         [],
};

const ROUTE_TYPES = [
  "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
  "makkah_local", "madinah_local", "ziyarah", "custom",
] as const;

const LOCATION_KINDS = [
  "airport", "gate", "hotel", "mazar", "warehouse",
  "project", "customer_site", "depot", "mosque", "other",
] as const;

const DISPATCH_STATUSES = [
  "pending", "notified", "accepted", "declined",
  "executing", "completed", "closed", "cancelled",
] as const;

const DISPATCH_TRANSITIONS: Record<typeof DISPATCH_STATUSES[number], string[]> = {
  pending:   ["notified", "cancelled"],
  notified:  ["accepted", "declined", "cancelled"],
  accepted:  ["executing", "cancelled"],
  declined:  [],
  executing: ["completed", "cancelled"],
  completed: ["closed"],
  closed:    [],
  cancelled: [],
};

// ─── Zod schemas ──────────────────────────────────────────────────────
const createBookingBaseSchema = z.object({
  bookingNumber: z.string().min(1).max(64),
  bookingSource: z.enum(BOOKING_SOURCES).optional(),
  transportServiceType: z.enum(TRANSPORT_SERVICE_TYPES),
  customerId: z.coerce.number().int().positive().optional(),
  customerName: z.string().max(255).optional(),
  customerPhone: z.string().max(64).optional(),
  contractId: z.coerce.number().int().positive().optional(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  fromLocationText: z.string().max(255).optional(),
  toLocationText: z.string().max(255).optional(),
  fromLocationKind: z.enum(LOCATION_KINDS).optional(),
  toLocationKind: z.enum(LOCATION_KINDS).optional(),
  fromLat: z.coerce.number().min(-90).max(90).optional(),
  fromLng: z.coerce.number().min(-180).max(180).optional(),
  fromPlaceId: z.string().max(255).optional(),
  toLat: z.coerce.number().min(-90).max(90).optional(),
  toLng: z.coerce.number().min(-180).max(180).optional(),
  toPlaceId: z.string().max(255).optional(),
  routeType: z.enum(ROUTE_TYPES).optional(),
  requestedPickupDate: z.string().optional(),
  requestedPickupTime: z.string().optional(),
  requestedDeliveryDate: z.string().optional(),
  requestedDeliveryTime: z.string().optional(),
  cargoDescription: z.string().max(1000).optional(),
  cargoQuantity: z.coerce.number().optional(),
  cargoUnit: z.string().max(32).optional(),
  cargoWeight: z.coerce.number().optional(),
  passengerCount: z.coerce.number().int().optional(),
  umrahGroupId: z.coerce.number().int().positive().optional(),
  flightNumber: z.string().max(32).optional(),
  supervisorName: z.string().max(255).optional(),
  supervisorPhone: z.string().max(64).optional(),
  hotelName: z.string().max(255).optional(),
  hotelLocation: z.string().max(255).optional(),
  beneficiaryType: z.string().max(64).optional(),
  beneficiaryId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  waqfId: z.coerce.number().int().positive().optional(),
  // #1812 audit fix — routePatternId was a dead-letter from the SPA
  // (BookingSourceSelector + booking-create both sent it) but the
  // schema rejected it. Now accepted; INSERT writes it to the column
  // added by migration 284 when the booking is created from a
  // recurring pattern via the materialise endpoint OR by the operator
  // picking a pattern in the source selector.
  routePatternId: z.coerce.number().int().positive().optional(),
  costCenterId: z.coerce.number().int().positive().optional(),
  // #1812 customer-agreement fields (Comment 3 — اتفاق العميل).
  // The schema columns were added in migration 271; this surface
  // lets operators actually set them on create/update.
  requestedVehicleClass: z.string().max(32).optional(),
  vehicleSubstitutionPolicy: z.enum([
    "exact_only", "same_class_only", "equivalent_allowed",
    "upgrade_allowed", "operator_approval", "customer_approval",
  ]).optional(),
  allowUpgrade: z.boolean().optional(),
  requiredExactVehicleId: z.coerce.number().int().positive().optional(),
  requiredExactDriverId: z.coerce.number().int().positive().optional(),
  // #1812 time-window fields.
  pickupWindowStart: z.string().optional(),
  pickupWindowEnd: z.string().optional(),
  dropoffWindowStart: z.string().optional(),
  dropoffWindowEnd: z.string().optional(),
  fixedAppointmentTime: z.string().optional(),
  isFlexibleTime: z.boolean().optional(),
  priority: z.coerce.number().int().optional(),
  notes: z.string().max(2000).optional(),
  // #1812 multi-leg — accept N legs in one create payload.
  // The server-side INSERT happens atomically in withTransaction;
  // if any leg fails validation, the booking header is rolled back.
  // z.lazy avoids the forward-reference TDZ at module load time —
  // bookingLineSchema is declared below.
  lines: z.lazy(() => z.array(nestedBookingLineSchema).max(20)).optional(),
});

// #1812 Wave 0.2 — enforce linked source on CREATE. The base schema
// stays a ZodObject so .partial() still works for PATCH (which has its
// own update semantics — e.g. an admin clearing a stale link must be
// able to do so without re-asserting a new one in the same call).
const createBookingSchema = createBookingBaseSchema.refine(
  (b) =>
    b.customerId != null ||
    b.umrahGroupId != null ||
    b.contractId != null ||
    b.projectId != null ||
    b.waqfId != null ||
    (b.beneficiaryType != null && b.beneficiaryId != null),
  {
    message:
      "يجب ربط الحجز بمصدر منظَّم (عميل / مجموعة عمرة / عقد / مشروع / وقف / مستفيد) — اسم العميل النصّي وحده غير مقبول.",
    path: ["customerId"],
  },
);

const updateBookingSchema = createBookingBaseSchema.partial().extend({
  status: z.enum(BOOKING_STATUSES).optional(),
});

// #1812 multi-leg booking — line-level vocab extends the booking
// header's. Lines without a lineNumber are auto-numbered server-side
// when posted as part of the create-booking `lines: []` array.
const bookingLineSchema = z.object({
  lineNumber: z.coerce.number().int().positive().optional(),
  requiredVehicleType: z.string().max(32).optional(),
  requiredCapacityKg: z.coerce.number().optional(),
  requiredSeatCount: z.coerce.number().int().optional(),
  requiredLicenseClass: z.string().max(32).optional(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  // #1812 multi-leg — freeform + kind + geo on each leg.
  fromLocationText: z.string().max(255).optional(),
  toLocationText: z.string().max(255).optional(),
  fromLocationKind: z.string().max(32).optional(),
  toLocationKind: z.string().max(32).optional(),
  fromLat: z.coerce.number().min(-90).max(90).optional(),
  fromLng: z.coerce.number().min(-180).max(180).optional(),
  fromPlaceId: z.string().max(255).optional(),
  toLat: z.coerce.number().min(-90).max(90).optional(),
  toLng: z.coerce.number().min(-180).max(180).optional(),
  toPlaceId: z.string().max(255).optional(),
  legRouteType: z.enum(ROUTE_TYPES).optional(),
  scheduledPickupAt: z.string().optional(),
  scheduledDeliveryAt: z.string().optional(),
  lineDescription: z.string().max(1000).optional(),
  quantity: z.coerce.number().optional(),
  unitOfMeasure: z.string().max(32).optional(),
  passengerCount: z.coerce.number().int().optional(),
  notes: z.string().max(1000).optional(),
});

// The bookingLine variant used when nested under create-booking's
// `lines: []` array — lineNumber stays optional so the operator can
// just append legs and the server auto-numbers them.
const nestedBookingLineSchema = bookingLineSchema;

export const dispatchOrderSchema = z.object({
  bookingLineId: z.coerce.number().int().positive(),
  vehicleId: z.coerce.number().int().positive(),
  driverId: z.coerce.number().int().positive(),
  scheduledStartAt: z.string().min(1),
  scheduledEndAt: z.string().min(1),
  // Documented exception for assignment conflicts (driver/vehicle
  // already busy in the window) AND for driver-eligibility failures.
  // Without this, both checks reject; with it, the conflict is recorded
  // in the audit log and the order is created anyway.
  overrideReason: z.string().min(1).max(500).optional(),
}).refine(
  (d) => {
    const s = Date.parse(d.scheduledStartAt);
    const e = Date.parse(d.scheduledEndAt);
    // skip if either is unparseable (other validation handles format);
    // tstzrange() silently inverts a reversed window, so block it here.
    return Number.isNaN(s) || Number.isNaN(e) || e >= s;
  },
  { path: ["scheduledEndAt"], message: "وقت نهاية الجدولة يجب ألا يسبق وقت بدايتها" },
);

const dispatchOrderActionSchema = z.object({
  action: z.enum(["notify", "accept", "decline", "start", "complete", "close", "cancel"]),
  declinedReason: z.string().max(500).optional(),
});

// #1733 Comment 9 — reschedule by dispatcher (e.g. drag-and-drop on the
// dispatch board). Any subset of the four fields may be supplied; the
// guard chain (eligibility + tstzrange conflict detection) is re-run
// against the NEW combination so a drop onto a busy driver still gets
// rejected unless overrideReason is supplied. Status must be a
// pre-execution state (pending / notified) — the operator can't
// retroactively reschedule a trip that's already executing.
const dispatchOrderRescheduleSchema = z.object({
  driverId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  scheduledStartAt: z.string().optional(),
  scheduledEndAt: z.string().optional(),
  overrideReason: z.string().min(1).max(500).optional(),
}).refine(
  (d) => d.driverId != null || d.vehicleId != null || d.scheduledStartAt != null || d.scheduledEndAt != null,
  { message: "يجب إرسال حقل واحد على الأقل من: driverId / vehicleId / scheduledStartAt / scheduledEndAt" },
);

// The driver/vehicle time-window overlap check, shared by dispatch-create and
// reschedule (was copy-pasted in both). Builds the SQL + params — the duplicated
// part — and each caller executes with its own executor (rawQuery on create; the
// tx client on the FOR-UPDATE reschedule path). `excludeId` skips the order being
// rescheduled (omit on create — there is no self row yet). Declined/cancelled
// orders don't reserve resources, so they're excluded.
function dispatchConflictQuery(
  companyId: number,
  driverId: number,
  vehicleId: number,
  startAt: string,
  endAt: string,
  excludeId?: number,
): { sql: string; params: unknown[] } {
  const ex = excludeId != null ? " AND id <> $6" : "";
  const sql =
    `SELECT id, 'driver' AS kind FROM transport_dispatch_orders
        WHERE "companyId" = $1 AND "driverId" = $2${ex}
          AND status NOT IN ('declined', 'cancelled')
          AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
              && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     UNION
     SELECT id, 'vehicle' AS kind FROM transport_dispatch_orders
        WHERE "companyId" = $1 AND "vehicleId" = $5${ex}
          AND status NOT IN ('declined', 'cancelled')
          AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
              && tstzrange($3::timestamptz, $4::timestamptz, '[)')`;
  const params = excludeId != null
    ? [companyId, driverId, startAt, endAt, vehicleId, excludeId]
    : [companyId, driverId, startAt, endAt, vehicleId];
  return { sql, params };
}

const createLocationSchema = z.object({
  code: z.string().max(32).optional(),
  name: z.string().min(1).max(255),
  locationType: z.enum(LOCATION_KINDS).optional(),
  city: z.string().max(128).optional(),
  address: z.string().max(500).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  notes: z.string().max(500).optional(),
});

// ─── Locations ────────────────────────────────────────────────────────
transportBookingsRouter.get(
  "/transport/locations",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_locations
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
          ORDER BY name ASC LIMIT 500`,
        [scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List transport locations error:");
    }
  },
);

transportBookingsRouter.post(
  "/transport/locations",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createLocationSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO transport_locations
           ("companyId", "branchId", code, name, "locationType", city, address, latitude, longitude, notes, "createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [scope.companyId, scope.branchId ?? null, b.code ?? null, b.name,
         b.locationType ?? null, b.city ?? null, b.address ?? null,
         b.latitude ?? null, b.longitude ?? null, b.notes ?? null, scope.userId],
      );
      assertInsert(insertId, "transport_locations");
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create transport location error:");
    }
  },
);

// ─── Bookings ─────────────────────────────────────────────────────────
transportBookingsRouter.get(
  "/transport/bookings",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { status, customerId, fromDate, toDate } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
      if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
      if (customerId) { params.push(Number(customerId)); where += ` AND b."customerId" = $${params.length}`; }
      if (fromDate) { params.push(fromDate); where += ` AND b."requestedPickupDate" >= $${params.length}`; }
      if (toDate) { params.push(toDate); where += ` AND b."requestedPickupDate" <= $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT b.*, c.name AS "linkedCustomerName"
           FROM transport_bookings b
           LEFT JOIN clients c ON c.id = b."customerId" AND c."companyId" = b."companyId"
          WHERE ${where}
          ORDER BY b."requestedPickupDate" DESC NULLS LAST, b."createdAt" DESC
          LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List transport bookings error:");
    }
  },
);

transportBookingsRouter.get(
  "/transport/bookings/:id",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [booking] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!booking) throw new NotFoundError("الحجز غير موجود");
      const lines = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_booking_lines WHERE "bookingId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "lineNumber"`,
        [id, scope.companyId],
      );
      const dispatchOrders = await rawQuery<Record<string, unknown>>(
        `SELECT d.*, v."plateNumber" AS "vehiclePlate", dr.name AS "driverName"
           FROM transport_dispatch_orders d
           LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."companyId" = d."companyId"
           LEFT JOIN fleet_drivers dr ON dr.id = d."driverId" AND dr."companyId" = d."companyId"
          WHERE d."bookingId" = $1
          ORDER BY d."scheduledStartAt" ASC`,
        [id],
      );
      // شريحة 1 — وقائع الرحلة (تسجيل واقعة): الجدول الزمني التشغيلي
      // (تحميل/خروج/وصول/فحص/تفريغ/تسليم) الذي تُشتقّ منه حالة الحجز والـPOD.
      // المُبطَلة (voidedAt) تُستبعد من العرض التشغيلي.
      const tripEvents = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM fleet_trip_events
          WHERE "bookingId" = $1 AND "companyId" = $2 AND "voidedAt" IS NULL
          ORDER BY "occurredAt" ASC, id ASC`,
        [id, scope.companyId],
      );
      // شريحة 4 — مرشّحات خصم النقص/التأخير (تشغيلية؛ القيد في المالية).
      const deductions = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_deduction_candidates
          WHERE "bookingId" = $1 AND "companyId" = $2
          ORDER BY "createdAt" DESC`,
        [id, scope.companyId],
      );
      // معدّلات الخصم المُعدّة (لاقتراح المبلغ في الواجهة: قياس × معدّل).
      const deductionRates = await resolveDeductionRates(scope.companyId, scope.branchId);
      // #1812 source context (operational review feedback: "النظام لا
      // يستفيد بما يكفي من العمرة / CRM / العقود / المشاريع / الأوقاف /
      // التقويم"). Resolve the upstream entity referenced by the
      // bookingSource so the SPA can show contextual data without
      // forcing the operator to click through other modules.
      const sourceContext = await loadSourceContext(scope.companyId, booking);
      // #2475-follow-up — surface the resolved booking-cancel policy so the SPA
      // shows an accurate confirmation/preview before a (destructive) cancel.
      const rawCancelPolicy = await resolveSettings(
        "fleet.bookings.cancelPolicy", scope.companyId, scope.branchId ?? undefined,
      );
      const cancelPolicy = rawCancelPolicy === "cascade" ? "cascade" : "guard";
      res.json(maskFields(req, { data: { ...booking, lines, dispatchOrders, tripEvents, deductions, deductionRates, sourceContext, cancelPolicy } }));
    } catch (err) {
      handleRouteError(err, res, "Get transport booking error:");
    }
  },
);

/**
 * #1812 source-context resolver. Returns null when the booking is a
 * manual_entry, otherwise pulls a compact summary of the upstream
 * entity (umrah group / customer / contract / project).
 *
 * Defensive: each query is wrapped in catch(() => null) so a missing
 * source row never breaks the booking detail page. The SPA renders
 * the panel only when sourceContext !== null.
 */
async function loadSourceContext(
  companyId: number,
  booking: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const source = booking.bookingSource as string | undefined;
  if (!source || source === "manual_entry") return null;

  if (source === "umrah_group" && booking.umrahGroupId) {
    const [g] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, "nuskGroupNumber" AS "groupNumber",
              "mutamerCount", "programDuration",
              "arrivalDate", "departureDate", "supervisorName" AS "umrahSupervisor"
         FROM umrah_groups
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [booking.umrahGroupId, companyId],
    ).catch(() => [null]);
    return g ? { source: "umrah_group", entity: g } : null;
  }

  if (booking.customerId) {
    const [c] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, phone, email, "customerType"
         FROM clients
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [booking.customerId, companyId],
    ).catch(() => [null]);
    if (c) return { source, entity: c };
  }

  if (source === "contract_schedule" && booking.contractId) {
    const [k] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "contractNumber", "startDate", "endDate", status
         FROM contracts
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [booking.contractId, companyId],
    ).catch(() => [null]);
    if (k) return { source: "contract_schedule", entity: k };
  }

  if (booking.projectId) {
    const [p] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, code, status FROM projects
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [booking.projectId, companyId],
    ).catch(() => [null]);
    if (p) return { source, entity: p };
  }

  return null;
}

// #1812 — booking confirmation document (user's gap #10).
// Returns the booking + lines + dispatch + a QR data-URL the SPA can
// drop into a printable confirmation page. The QR encodes a deeplink
// payload so a scan can be reconciled against the live booking.
transportBookingsRouter.get(
  "/transport/bookings/:id/confirmation",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [booking] = await rawQuery<Record<string, unknown>>(
        `SELECT b.*, c.name AS "linkedCustomerName"
           FROM transport_bookings b
           LEFT JOIN clients c ON c.id = b."customerId" AND c."companyId" = b."companyId" AND c."deletedAt" IS NULL
          WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!booking) throw new NotFoundError("الحجز غير موجود");
      const lines = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_booking_lines WHERE "bookingId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "lineNumber"`,
        [id, scope.companyId],
      );
      const dispatchOrders = await rawQuery<Record<string, unknown>>(
        `SELECT d.*, v."plateNumber" AS "vehiclePlate", dr.name AS "driverName", dr.phone AS "driverPhone"
           FROM transport_dispatch_orders d
           LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."companyId" = d."companyId"
           LEFT JOIN fleet_drivers dr ON dr.id = d."driverId" AND dr."companyId" = d."companyId"
          WHERE d."bookingId" = $1
          ORDER BY d."scheduledStartAt" ASC`,
        [id],
      );
      const qrPayload = `GHAYTH|TRANSPORT_BOOKING|${booking.bookingNumber}|${id}|${scope.companyId}`;
      let qrDataUrl: string | null = null;
      try {
        // qrcode is already a project dep (ZATCA invoicing uses it).
        const QRCode = (await import("qrcode")).default;
        qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1 });
      } catch (err) {
        logger.warn({ err }, "[transport-bookings] QR generation failed (decorative)");
      }
      res.json(maskFields(req, {
        data: { ...booking, lines, dispatchOrders, qrDataUrl, qrPayload },
      }));
    } catch (err) {
      handleRouteError(err, res, "Get transport booking confirmation error:");
    }
  },
);

// شريحة وقائع الرحلة (الكيان يقود التجربة / تسجيل واقعة):
// الثوابت والمخطّط والمنطق المشترك في lib/transport/tripEvents.ts — يُستعمل من
// سطح المشغّل هنا، ومن سطح السائق في transport-planning (نفس السجل، لا منطق مزدوج).
// تشغيلي بحت — الإغلاق المالي يبقى منفصلًا (مرشّح الفوترة → المالية).

// GET /transport/bookings/:id/events — الجدول الزمني لوقائع الرحلة.
transportBookingsRouter.get(
  "/transport/bookings/:id/events",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [booking] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!booking) throw new NotFoundError("الحجز غير موجود");
      const events = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM fleet_trip_events
          WHERE "bookingId" = $1 AND "companyId" = $2 AND "voidedAt" IS NULL
          ORDER BY "occurredAt" ASC, id ASC`,
        [id, scope.companyId],
      );
      res.json(maskFields(req, { data: events }));
    } catch (err) {
      handleRouteError(err, res, "List trip events error:");
    }
  },
);

// POST /transport/bookings/:id/events — تسجيل واقعة رحلة + اشتقاق الحالة.
transportBookingsRouter.post(
  "/transport/bookings/:id/events",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(recordTripEventSchema.safeParse(req.body));
      // سطح المشغّل: الصلاحية fleet.bookings:update تكفي للملكية (مفلتر بالشركة).
      const { insertId, derivedStatus } = await recordBookingTripEvent(scope, id, b);
      res.status(201).json({ data: { id: insertId, derivedStatus } });
    } catch (err) {
      handleRouteError(err, res, "Record trip event error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// شريحة 4 — خصم نقص الوزن/التأخير (مرشّح خصم، تشغيلي بحت — لا قيد هنا).
// النقل يُنشئ المرشّح (الحقيقة التشغيلية)؛ المالية تُصدر منه إشعارًا دائنًا
// (تخفيض إيراد العميل) عبر تدفّقها المُختبَر — قفل الحدود: لا يرحّل النقل الدفتر.
// ─────────────────────────────────────────────────────────────────────────
// المخطّط والمنطق المشترك في lib/transport/deductions.ts (يُستعمل من سطح
// المشغّل هنا وسطح السائق في transport-planning — منطق واحد، بلا تكرار).

transportBookingsRouter.get(
  "/transport/bookings/:id/deductions",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_deduction_candidates
          WHERE "bookingId" = $1 AND "companyId" = $2
          ORDER BY "createdAt" DESC`,
        [id, scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List deduction candidates error:");
    }
  },
);

transportBookingsRouter.post(
  "/transport/bookings/:id/deductions",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(deductionCandidateSchema.safeParse(req.body));
      const { insertId, amount } = await createDeductionCandidate(scope, id, b);
      res.status(201).json({ data: { id: insertId, amount } });
    } catch (err) {
      handleRouteError(err, res, "Create deduction candidate error:");
    }
  },
);

transportBookingsRouter.post(
  "/transport/bookings",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createBookingSchema.safeParse(req.body));
      // #1812 multi-leg — wrap booking header + lines in one transaction
      // so a leg-validation failure rolls back the orphan header.
      // #TA-T18-UX-AUDIT-01 P2-1 — نموذج توقيت موحّد: التوقيت المرئي (أوقات
      // التحميل/التسليم) يشتقّ نافذة المحرك (pickupWindowStart/End) حين لا
      // يحدّد المشغّل النافذة المتقدمة صراحةً، فلا يبقى الحجز بلا نافذة (يُنهي
      // مأزق «صفر ترشيح» من الجذر). إزاحة الرياض ثابتة (+03:00 — لا توقيت صيفي).
      const toRiyadhTs = (d?: string | null, t?: string | null): string | null =>
        d ? `${d}T${t && t.length >= 4 ? t : "00:00"}:00+03:00` : null;
      const effPickupStart = b.pickupWindowStart ?? toRiyadhTs(b.requestedPickupDate, b.requestedPickupTime);
      const effPickupEnd = b.pickupWindowEnd
        ?? toRiyadhTs(b.requestedDeliveryDate, b.requestedDeliveryTime)
        ?? effPickupStart;

      const { insertId, legsInserted } = await withTransaction(async () => {
        const headerInsert = await rawExecute(
        `INSERT INTO transport_bookings
           ("companyId", "branchId", "bookingNumber", "bookingSource", "transportServiceType",
            "customerId", "customerName", "customerPhone", "contractId",
            "fromLocationId", "toLocationId", "fromLocationText", "toLocationText", "routeType",
            "fromLocationKind", "toLocationKind",
            "fromLat", "fromLng", "fromPlaceId", "toLat", "toLng", "toPlaceId",
            "requestedPickupDate", "requestedPickupTime", "requestedDeliveryDate", "requestedDeliveryTime",
            "cargoDescription", "cargoQuantity", "cargoUnit", "cargoWeight",
            "passengerCount", "umrahGroupId", "flightNumber", "supervisorName", "supervisorPhone",
            "hotelName", "hotelLocation",
            "beneficiaryType", "beneficiaryId", "projectId", "waqfId", "costCenterId",
            "requestedVehicleClass", "vehicleSubstitutionPolicy", "allowUpgrade",
            "requiredExactVehicleId", "requiredExactDriverId",
            "pickupWindowStart", "pickupWindowEnd",
            "dropoffWindowStart", "dropoffWindowEnd",
            "fixedAppointmentTime", "isFlexibleTime", priority,
            notes, "createdBy", "routePatternId", "tripFamily")
         VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14,
                 $15,$16, $17,$18,$19,$20,$21,$22,
                 $23,$24,$25,$26,
                 $27,$28,$29,$30, $31,$32,$33,$34,$35, $36,$37,
                 $38,$39,$40,$41,$42,
                 $43,$44,$45,
                 $46,$47,
                 $48,$49,
                 $50,$51,
                 $52,$53,$54,
                 $55,$56, $57, $58)`,
        [
          scope.companyId, scope.branchId ?? null, b.bookingNumber,
          b.bookingSource ?? "manual_entry", b.transportServiceType,
          b.customerId ?? null, b.customerName ?? null, b.customerPhone ?? null, b.contractId ?? null,
          b.fromLocationId ?? null, b.toLocationId ?? null, b.fromLocationText ?? null, b.toLocationText ?? null, b.routeType ?? null,
          b.fromLocationKind ?? null, b.toLocationKind ?? null,
          b.fromLat ?? null, b.fromLng ?? null, b.fromPlaceId ?? null,
          b.toLat ?? null, b.toLng ?? null, b.toPlaceId ?? null,
          b.requestedPickupDate ?? null, b.requestedPickupTime ?? null, b.requestedDeliveryDate ?? null, b.requestedDeliveryTime ?? null,
          b.cargoDescription ?? null, b.cargoQuantity ?? null, b.cargoUnit ?? null, b.cargoWeight ?? null,
          b.passengerCount ?? null, b.umrahGroupId ?? null, b.flightNumber ?? null, b.supervisorName ?? null, b.supervisorPhone ?? null,
          b.hotelName ?? null, b.hotelLocation ?? null,
          b.beneficiaryType ?? null, b.beneficiaryId ?? null, b.projectId ?? null, b.waqfId ?? null, b.costCenterId ?? null,
          b.requestedVehicleClass ?? null,
          b.vehicleSubstitutionPolicy ?? "equivalent_allowed",
          b.allowUpgrade ?? false,
          b.requiredExactVehicleId ?? null, b.requiredExactDriverId ?? null,
          effPickupStart, effPickupEnd,
          b.dropoffWindowStart ?? null, b.dropoffWindowEnd ?? null,
          b.fixedAppointmentTime ?? null, b.isFlexibleTime ?? false,
          b.priority ?? 0,
          b.notes ?? null, scope.userId,
          // #1812 audit fix — accept the SPA's routePatternId prefill (was a dead-letter pre-audit).
          b.routePatternId ?? null,
          // #1812 Comment 4663005810 — explicit tripFamily column.
          deriveTripFamily(b.transportServiceType, b.passengerCount, b.cargoWeight),
        ],
        );
        assertInsert(headerInsert.insertId, "transport_bookings");
        const bookingId = headerInsert.insertId;

        // #1812 multi-leg + #2079 Gate-PE-2 (Route Leg as Canon).
        // Server auto-numbers any leg that didn't supply lineNumber so
        // the operator can just push legs onto an array without
        // bookkeeping. If the caller omitted `lines` entirely or sent
        // an empty array, we synthesise a single leg derived from the
        // booking header so the invariant «every booking has ≥1 line»
        // holds for every new row. Single-leg posts therefore look
        // exactly the same as before from the wire — but on the DB
        // side they always produce a line.
        let inserted = 0;
        const legsToInsert: typeof bookingLineSchema._type[] = b.lines && b.lines.length > 0
          ? b.lines
          : [{
              fromLocationId:   b.fromLocationId,
              toLocationId:     b.toLocationId,
              fromLocationText: b.fromLocationText,
              toLocationText:   b.toLocationText,
              fromLocationKind: b.fromLocationKind,
              toLocationKind:   b.toLocationKind,
              fromLat:          b.fromLat,
              fromLng:          b.fromLng,
              fromPlaceId:      b.fromPlaceId,
              toLat:            b.toLat,
              toLng:            b.toLng,
              toPlaceId:        b.toPlaceId,
              legRouteType:     b.routeType,
              scheduledPickupAt:
                effPickupStart ?? b.fixedAppointmentTime ?? undefined,
              scheduledDeliveryAt:
                b.dropoffWindowStart ?? undefined,
              lineDescription:  b.cargoDescription ?? undefined,
              quantity:         b.cargoQuantity ?? undefined,
              unitOfMeasure:    b.cargoUnit ?? undefined,
              passengerCount:   b.passengerCount ?? undefined,
              notes:            "Auto-derived single leg",
            }];
        for (let i = 0; i < legsToInsert.length; i++) {
          const leg = legsToInsert[i];
          const lineNumber = leg.lineNumber ?? i + 1;
          await rawExecute(
            `INSERT INTO transport_booking_lines
               ("companyId", "bookingId", "lineNumber", "requiredVehicleType",
                "requiredCapacityKg", "requiredSeatCount", "requiredLicenseClass",
                "fromLocationId", "toLocationId",
                "fromLocationText", "toLocationText",
                "fromLocationKind", "toLocationKind",
                "fromLat", "fromLng", "fromPlaceId",
                "toLat", "toLng", "toPlaceId",
                "legRouteType",
                "scheduledPickupAt", "scheduledDeliveryAt",
                "lineDescription", quantity, "unitOfMeasure", "passengerCount", notes)
             VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9, $10,$11, $12,$13,
                     $14,$15,$16, $17,$18,$19, $20, $21,$22,
                     $23,$24,$25,$26,$27)`,
            [
              scope.companyId, bookingId, lineNumber, leg.requiredVehicleType ?? null,
              leg.requiredCapacityKg ?? null, leg.requiredSeatCount ?? null, leg.requiredLicenseClass ?? null,
              leg.fromLocationId ?? null, leg.toLocationId ?? null,
              leg.fromLocationText ?? null, leg.toLocationText ?? null,
              leg.fromLocationKind ?? null, leg.toLocationKind ?? null,
              leg.fromLat ?? null, leg.fromLng ?? null, leg.fromPlaceId ?? null,
              leg.toLat ?? null, leg.toLng ?? null, leg.toPlaceId ?? null,
              leg.legRouteType ?? null,
              leg.scheduledPickupAt ?? null, leg.scheduledDeliveryAt ?? null,
              leg.lineDescription ?? null, leg.quantity ?? null,
              leg.unitOfMeasure ?? null, leg.passengerCount ?? null, leg.notes ?? null,
            ],
          );
          inserted++;
        }
        return { insertId: bookingId, legsInserted: inserted };
      });

      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.booking.created", entity: "transport_bookings", entityId: insertId,
        details: JSON.stringify({
          bookingNumber: b.bookingNumber,
          serviceType: b.transportServiceType,
          legsCount: legsInserted,
        }),
      }).catch((e) => logger.error(e, "booking event failed"));
      res.status(201).json({ data: { id: insertId, legsInserted } });
    } catch (err) {
      handleRouteError(err, res, "Create transport booking error:");
    }
  },
);

transportBookingsRouter.patch(
  "/transport/bookings/:id",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateBookingSchema.safeParse(req.body));
      const [existing] = await rawQuery<{
        status: typeof BOOKING_STATUSES[number];
        // #2079 FIX-13 (TA-SEC-02) — pull the linked-source fields
        // alongside status so the audit log below can compute a true
        // before/after delta for `linked_source_changed` events.
        customerId: number | null;
        umrahGroupId: number | null;
        contractId: number | null;
      }>(
        `SELECT status, "customerId", "umrahGroupId", "contractId"
           FROM transport_bookings
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("الحجز غير موجود");
      if (b.status && b.status !== existing.status) {
        // #2079 TA-T18-08 — SoD: moving a booking to `approved` or
        // `rejected` is an APPROVAL decision and requires the
        // `fleet.bookings:approve` action on top of `update`. The
        // generic update grant on its own does NOT unlock this
        // transition. This rule is the second line of defence — the
        // primary path is the dedicated POST /approve + /reject
        // endpoints, but a permitted client can still drive the
        // status via PATCH as long as it holds approve.
        if (b.status === "approved" || b.status === "rejected") {
          const approval = await checkAccess(scope, {
            feature: "fleet.bookings",
            action: "approve",
          });
          if (!approval.allowed) {
            throw new ValidationError(
              "اعتماد/رفض الحجز يتطلب صلاحية fleet.bookings:approve منفصلة عن صلاحية التعديل العامة",
            );
          }
        }
        const allowed = BOOKING_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(`الانتقال من ${existing.status} إلى ${b.status} غير مسموح`);
        }
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      // #1812 — column whitelist. `tripFamily` and `routePatternId`
      // are system-managed (set by the create or materialise endpoint).
      // Drop silently so the SPA can PATCH a wider partial safely.
      const PATCH_BANNED = new Set([
        "tripFamily", "routePatternId", "bookingSource",
        "bookingNumber", "companyId", "branchId",
        "createdBy", "createdAt", "deletedAt",
      ]);
      for (const [col, val] of Object.entries(b)) {
        if (val !== undefined && !PATCH_BANNED.has(col)) {
          sets.push(`"${col}" = $${p++}`);
          params.push(val);
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      const bookingUpdateSql =
        `UPDATE transport_bookings SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`;

      // ─── booking-cancel policy (configurable, top of the cascade) ────────
      // Cancelling a booking has downstream operational state: its dispatch
      // orders, the fleet trips those spawned, and the held driver/vehicle.
      // Until now the PATCH flipped only the booking row and orphaned all of
      // it. How the downstream is handled is a company preference resolved from
      // the 3-level `settings` engine (key: fleet.bookings.cancelPolicy):
      //   • "guard"   (default) — refuse the cancel while any dispatch order is
      //                still active; the operator cancels those first (which,
      //                via the dispatch-cancel cascade, releases the trips and
      //                resources) and only then cancels the booking. Safest: it
      //                never force-cancels a trip with a driver already en route.
      //   • "cascade" — cancel everything top-down in ONE atomic step: each
      //                active dispatch order → cancelled, its nav session ended,
      //                its trip cancelled + vehicle/driver released (shared
      //                helper), every non-terminal line cancelled, then the
      //                booking row itself.
      const cancelling = b.status === "cancelled" && existing.status !== "cancelled";
      let bookingUpdateDone = false;
      if (cancelling) {
        const rawPolicy = await resolveSettings(
          "fleet.bookings.cancelPolicy", scope.companyId, scope.branchId ?? undefined,
        );
        const policy = rawPolicy === "cascade" ? "cascade" : "guard";

        if (policy === "guard") {
          const [activeRow] = await rawQuery<{ active: number }>(
            `SELECT COUNT(*)::int AS active
               FROM transport_dispatch_orders
              WHERE "companyId" = $1 AND "bookingId" = $2
                AND status IN ('pending', 'notified', 'accepted', 'executing')`,
            [scope.companyId, id],
          );
          const active = activeRow?.active ?? 0;
          if (active > 0) {
            throw new ConflictError(
              `لا يمكن إلغاء الحجز: يوجد ${active} أمر توزيع نشط. ألغِ أوامر التوزيع أولاً (سيُلغى معها الرحلة المرتبطة وتُحرَّر المركبة/السائق تلقائيًا) ثم ألغِ الحجز.`,
            );
          }
          // No active orders → nothing to orphan; fall through to the generic
          // UPDATE below, which simply marks the booking cancelled.
        } else {
          // "cascade" — do the whole top-down cancel atomically with the
          // booking row update so a mid-cascade failure rolls everything back.
          await withTransaction(async (tx) => {
            const ordersRes = await tx.query<{ id: number; bookingLineId: number }>(
              `SELECT id, "bookingLineId"
                 FROM transport_dispatch_orders
                WHERE "companyId" = $1 AND "bookingId" = $2
                  AND status IN ('pending', 'notified', 'accepted', 'executing')
                FOR UPDATE`,
              [scope.companyId, id],
            );
            for (const order of ordersRes.rows) {
              await tx.query(
                `UPDATE transport_dispatch_orders
                    SET status = 'cancelled', "updatedAt" = NOW()
                  WHERE id = $1 AND "companyId" = $2`,
                [order.id, scope.companyId],
              );
              // End the driver's active nav session (mirrors the dispatch-action
              // cancel branch's session cleanup).
              await tx.query(
                `UPDATE driver_navigation_sessions
                    SET status = 'cancelled', "endedAt" = NOW(), "updatedAt" = NOW()
                  WHERE "dispatchOrderId" = $1 AND "companyId" = $2
                    AND status NOT IN ('ended', 'cancelled')`,
                [order.id, scope.companyId],
              );
              // Cancel the spawned trip + release vehicle/driver (shared helper,
              // identical to the dispatch board's top-down cancel).
              await cancelTripsForDispatchOrder(tx, {
                dispatchOrderId: order.id,
                companyId: scope.companyId,
                reason: "أُلغي الحجز المرتبط",
              });
              // Cascade the cancelled state down to the booking line (and up to
              // the booking once every line is terminal).
              await cascadeDispatchToBooking(tx, {
                bookingLineId: order.bookingLineId,
                target: "cancelled",
                companyId: scope.companyId,
              });
            }
            // Cancel any remaining non-terminal lines that had no active order
            // (e.g. still-"pending" legs awaiting dispatch) so the booking is
            // consistently closed; completed legs are left intact.
            await tx.query(
              `UPDATE transport_booking_lines
                  SET status = 'cancelled', "updatedAt" = NOW()
                WHERE "bookingId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
                  AND status NOT IN ('completed', 'cancelled')`,
              [id, scope.companyId],
            );
            // Finally the booking row itself (+ any other PATCHed fields).
            await tx.query(bookingUpdateSql, params);
          });
          bookingUpdateDone = true;
        }
      }

      if (!bookingUpdateDone) {
        await rawExecute(bookingUpdateSql, params);
      }
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "transport_bookings", entityId: id,
        before: { status: existing.status }, after: b,
      }).catch((e) => logger.error(e, "booking audit failed"));

      // #2079 FIX-13 (TA-SEC-02) — when the operator touches a link
      // field (customerId / umrahGroupId / contractId), surface that
      // as a SEPARATE audit event on top of the generic update log.
      // The audit trail needs a distinct row whose `action` makes
      // the SoD-sensitive nature obvious — silently lumping a
      // source-link rebind under "update" lets a malicious operator
      // hide a customer swap inside a noisy notes/cost edit. The
      // before/after carries ONLY the linked-source fields so the
      // auditor reads the row cleanly without scrolling through
      // unrelated field deltas.
      const linkedSourceFields = ["customerId", "umrahGroupId", "contractId"] as const;
      const linkedChange: Record<string, { before: number | null; after: number | null }> = {};
      for (const field of linkedSourceFields) {
        if (b[field] !== undefined && b[field] !== existing[field]) {
          linkedChange[field] = {
            before: existing[field],
            after: (b[field] as number | null | undefined) ?? null,
          };
        }
      }
      if (Object.keys(linkedChange).length > 0) {
        createAuditLog({
          companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
          action: "linked_source_changed",
          entity: "transport_bookings",
          entityId: id,
          before: Object.fromEntries(
            Object.entries(linkedChange).map(([k, v]) => [k, v.before]),
          ),
          after: Object.fromEntries(
            Object.entries(linkedChange).map(([k, v]) => [k, v.after]),
          ),
        }).catch((e) => logger.error(e, "booking linked-source audit failed"));
      }

      // #2079 TA-T18-01 — passenger booking close → Accounting Candidate.
      // Mirrors the cargo + rental handoffs. Only fires when status
      // actually transitions INTO `completed` (not when other fields
      // change while already completed — idempotency still holds, but
      // we save the query). Soft-fail: a candidate hiccup is logged
      // and never rolls back the operational close (the insert is
      // idempotent and the operator can re-fire the transition).
      let passengerCandidateId: number | null = null;
      if (b.status === "completed" && existing.status !== "completed") {
        try {
          const [row] = await rawQuery<{
            tripFamily: string | null; customerId: number | null;
            passengerCount: number | null;
            bookingNumber: string;
            fromLocationText: string | null; toLocationText: string | null;
            notes: string | null;
            vehicleId: number | null; driverId: number | null;
          }>(
            `SELECT b."tripFamily", b."customerId", b."passengerCount",
                    b."bookingNumber", b."fromLocationText", b."toLocationText", b.notes,
                    d."vehicleId", d."driverId"
               FROM transport_bookings b
               LEFT JOIN LATERAL (
                 SELECT "vehicleId", "driverId"
                   FROM transport_dispatch_orders
                  WHERE "companyId" = b."companyId"
                    AND "bookingId" = b.id
                    AND status NOT IN ('declined', 'cancelled')
                  ORDER BY id DESC LIMIT 1
               ) d ON TRUE
              WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL`,
            [id, scope.companyId],
          );
          if (row) {
            const candidate = await fleetEngine.createPassengerBillingCandidate(
              { companyId: scope.companyId, branchId: scope.branchId ?? 0, createdBy: scope.userId },
              {
                id, bookingNumber: row.bookingNumber,
                tripFamily: row.tripFamily, customerId: row.customerId,
                passengerCount: row.passengerCount,
                fromLocationText: row.fromLocationText, toLocationText: row.toLocationText,
                vehicleId: row.vehicleId, driverId: row.driverId,
                notes: row.notes,
              },
            );
            passengerCandidateId = candidate?.id ?? null;
          }
        } catch (err) {
          logger.error(err, "passenger billing candidate failed");
        }
      }
      res.json({ data: { id, billingCandidateId: passengerCandidateId } });
    } catch (err) {
      handleRouteError(err, res, "Update transport booking error:");
    }
  },
);

// ─── #2079 TA-T18-08 — Approval endpoints (SoD) ──────────────────────
//
// These two routes are the canonical paths for moving a booking out of
// `pending_approval`. They are authorized on the NEW `approve` action
// (declared `approvableActions: ["approve"]` in the feature catalog),
// distinct from `update`. A role can now hold `fleet.bookings:update`
// (read+edit) without `fleet.bookings:approve`, which is the
// segregation-of-duties guarantee the audit required:
//
//   • creator role  →  update only       (cannot self-approve)
//   • approver role →  approve (+ view)  (cannot edit booking fields)
//   • admin role    →  both              (legacy behaviour preserved
//                                         via wildcard fleet.bookings:*
//                                         or fleet.*)
//
// The generic PATCH still accepts status=approved|rejected from
// callers who hold BOTH update + approve (e.g. the legacy admin
// dropdown). The dedicated endpoints are the path the SPA's new
// Approve / Reject buttons use.
const approveBookingSchema = z.object({
  note: z.string().max(2000).optional(),
});
const rejectBookingSchema = z.object({
  reason: z.string().min(1, "سبب الرفض مطلوب").max(2000),
});

transportBookingsRouter.post(
  "/transport/bookings/:id/approve",
  authorize({ feature: "fleet.bookings", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(approveBookingSchema.safeParse(req.body));
      const [existing] = await rawQuery<{ status: typeof BOOKING_STATUSES[number] }>(
        `SELECT status FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("الحجز غير موجود");
      const allowed = BOOKING_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes("approved")) {
        throw new ConflictError(`لا يمكن اعتماد حجز في حالة "${existing.status}"`);
      }
      await rawExecute(
        `UPDATE transport_bookings
            SET status = 'approved', "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "approve", entity: "transport_bookings", entityId: id,
        before: { status: existing.status },
        after: { status: "approved", note: b.note ?? null },
      }).catch((e) => logger.error(e, "booking approve audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.booking.approved", entity: "transport_bookings", entityId: id,
        details: JSON.stringify({ previousStatus: existing.status }),
      }).catch((e) => logger.error(e, "booking approve event failed"));
      res.json({ data: { id, status: "approved" } });
    } catch (err) {
      handleRouteError(err, res, "Approve transport booking error:");
    }
  },
);

transportBookingsRouter.post(
  "/transport/bookings/:id/reject",
  authorize({ feature: "fleet.bookings", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(rejectBookingSchema.safeParse(req.body));
      const [existing] = await rawQuery<{ status: typeof BOOKING_STATUSES[number] }>(
        `SELECT status FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("الحجز غير موجود");
      const allowed = BOOKING_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes("rejected")) {
        throw new ConflictError(`لا يمكن رفض حجز في حالة "${existing.status}"`);
      }
      await rawExecute(
        `UPDATE transport_bookings
            SET status = 'rejected', "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "reject", entity: "transport_bookings", entityId: id,
        before: { status: existing.status },
        after: { status: "rejected", reason: b.reason },
      }).catch((e) => logger.error(e, "booking reject audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.booking.rejected", entity: "transport_bookings", entityId: id,
        details: JSON.stringify({ previousStatus: existing.status, reason: b.reason }),
      }).catch((e) => logger.error(e, "booking reject event failed"));
      res.json({ data: { id, status: "rejected" } });
    } catch (err) {
      handleRouteError(err, res, "Reject transport booking error:");
    }
  },
);

transportBookingsRouter.post(
  "/transport/bookings/:id/lines",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const bookingId = parseId(req.params.id, "id");
      const b = zodParse(bookingLineSchema.safeParse(req.body));
      const [booking] = await rawQuery<{ id: number }>(
        `SELECT id FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [bookingId, scope.companyId],
      );
      if (!booking) throw new NotFoundError("الحجز غير موجود");
      const { insertId } = await rawExecute(
        `INSERT INTO transport_booking_lines
           ("companyId", "bookingId", "lineNumber", "requiredVehicleType",
            "requiredCapacityKg", "requiredSeatCount", "requiredLicenseClass",
            "fromLocationId", "toLocationId",
            "scheduledPickupAt", "scheduledDeliveryAt",
            "lineDescription", quantity, "unitOfMeasure", "passengerCount", notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          scope.companyId, bookingId, b.lineNumber,
          b.requiredVehicleType ?? null, b.requiredCapacityKg ?? null,
          b.requiredSeatCount ?? null, b.requiredLicenseClass ?? null,
          b.fromLocationId ?? null, b.toLocationId ?? null,
          b.scheduledPickupAt ?? null, b.scheduledDeliveryAt ?? null,
          b.lineDescription ?? null, b.quantity ?? null,
          b.unitOfMeasure ?? null, b.passengerCount ?? null, b.notes ?? null,
        ],
      );
      assertInsert(insertId, "transport_booking_lines");
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Add booking line error:");
    }
  },
);

// ─── Dispatch orders ──────────────────────────────────────────────────
transportBookingsRouter.get(
  "/transport/dispatch-orders",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { fromDate, toDate, driverId, vehicleId, status } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `d."companyId" = $1`;
      if (fromDate) { params.push(fromDate); where += ` AND d."scheduledStartAt" >= $${params.length}`; }
      if (toDate)   { params.push(toDate);   where += ` AND d."scheduledStartAt" <= $${params.length}`; }
      if (driverId) { params.push(Number(driverId));  where += ` AND d."driverId" = $${params.length}`; }
      if (vehicleId){ params.push(Number(vehicleId)); where += ` AND d."vehicleId" = $${params.length}`; }
      if (status)   { params.push(status); where += ` AND d.status = $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT d.*, b."bookingNumber", v."plateNumber" AS "vehiclePlate", dr.name AS "driverName"
           FROM transport_dispatch_orders d
           LEFT JOIN transport_bookings b ON b.id = d."bookingId"
           LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."companyId" = d."companyId"
           LEFT JOIN fleet_drivers dr ON dr.id = d."driverId" AND dr."companyId" = d."companyId"
          WHERE ${where}
          ORDER BY d."scheduledStartAt" ASC LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List dispatch orders error:");
    }
  },
);

transportBookingsRouter.post(
  "/transport/dispatch-orders",
  authorize({ feature: "fleet.dispatch", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(dispatchOrderSchema.safeParse(req.body));

      const [line] = await rawQuery<{ id: number; bookingId: number }>(
        `SELECT id, "bookingId" FROM transport_booking_lines
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.bookingLineId, scope.companyId],
      );
      if (!line) throw new NotFoundError("سطر الحجز غير موجود");

      // #TA-T18-UX-AUDIT-01 §11-ب — الاختيار اليدوي لا يتجاوز الحراس الصلبة.
      // نمرّر الزوج (مركبة/سائق) عبر المحرك نفسه (مصدر الحراس الوحيد) للنافذة
      // المطلوبة: إن غاب الزوج عن نتائج المحرك فهو غير مؤهّل (مصفوفة القدرات /
      // جاهزية المركبة / صيانة / إجازة السائق / حدود القيادة)؛ وإن حمل عوائق
      // صلبة (تعارض / راحة / سعة / اتفاق العميل) رُفض ما لم يُوثَّق استثناء.
      // معزول عن المسار التلقائي (plan-bookings يُدرج مباشرةً في transport-integration).
      const ranked = await suggestAssignments({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        bookingId: line.bookingId,
        bookingLineId: b.bookingLineId,
        scheduledStartAt: b.scheduledStartAt,
        scheduledEndAt: b.scheduledEndAt,
        limit: 100000,
      });
      const guardPair = ranked.find(
        (c) => c.vehicleId === b.vehicleId && c.driverId === b.driverId,
      );
      if (!guardPair) {
        // الزوج خارج نتائج المحرك = غير مؤهّل (مصفوفة قدرات غير مكتملة / جاهزية /
        // صيانة / إجازة / حدود قيادة). يُحجب افتراضيًا ويُسمح فقط باستثناء موثَّق
        // (overrideReason) — اتساقًا مع فلسفة الحراس القائمة (الأهلية/الراحة/
        // التعارض كلها override-able)، فلا يكسر إسناد مركبة لم يكتمل ملفها بعد.
        if (!b.overrideReason) {
          throw new ValidationError(
            "هذه المركبة أو هذا السائق غير مؤهّل لهذا الحجز (مصفوفة القدرات، جاهزية المركبة، إجازة السائق، أو حدود القيادة). أرسل overrideReason للموافقة الموثَّقة على الاستثناء.",
            { field: "vehicleId", fix: "اختر تركيبة مؤهّلة من الاقتراح، أو عالج سبب عدم الأهلية في الملف الفني/جاهزية السائق، أو وثّق سبب الاستثناء." },
          );
        }
      } else if (guardPair.blockers.length > 0 && !b.overrideReason) {
        throw new ConflictError(
          `الإسناد يكسر حارسًا صلبًا: ${guardPair.blockers.join("؛ ")}. أرسل overrideReason للموافقة الموثَّقة.`,
          { field: "blockers", fix: "اختر تركيبة بلا عوائق أو وضّح سبب الاستثناء." },
        );
      }

      // 1) Driver eligibility — reuses the #1761 guard.
      await assertDriverEligibility({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        userId: scope.userId,
        driverId: b.driverId,
        vehicleId: b.vehicleId,
        sourceType: "fleet_trip", // dispatch orders predate the trip row; piggyback on the existing enum
        sourceId: b.bookingLineId,
        overrideReason: b.overrideReason ?? null,
      });

      // 1b) Driver rest constraint (#1812) — block if the driver
      //     hasn't had their required rest hours since the last duty.
      await assertDriverRest({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        userId: scope.userId,
        driverId: b.driverId,
        nextAssignmentStartAt: b.scheduledStartAt,
        overrideReason: b.overrideReason ?? null,
      });

      // 2) Conflict detection — driver / vehicle already booked in
      //    the window. Excludes declined / cancelled orders since they
      //    don't reserve resources.
      const cq = dispatchConflictQuery(scope.companyId, b.driverId, b.vehicleId, b.scheduledStartAt, b.scheduledEndAt);
      const conflicts = await rawQuery<{ id: number; kind: string }>(cq.sql, cq.params);
      if (conflicts.length > 0 && !b.overrideReason) {
        const kinds = [...new Set(conflicts.map((c) => c.kind))].join("+");
        throw new ConflictError(
          `تعارض في الجدولة: ${kinds === "driver+vehicle" ? "السائق والمركبة" : kinds === "driver" ? "السائق" : "المركبة"} محجوز/ة في الفترة المطلوبة. أرسل overrideReason للموافقة على التعارض.`,
          { field: kinds, fix: "اختر سائقاً/مركبة أخرى أو وضّح سبب الاستثناء" },
        );
      }

      // Creating the dispatch order + flipping the booking line to
      // 'dispatched' are atomic: a dispatch order must never exist without
      // its line marked dispatched (or a line flipped with no order).
      // rawQuery joins the ambient transaction (txStore).
      const insertId = await withTransaction(async () => {
        const { insertId: orderId } = await rawExecute(
          `INSERT INTO transport_dispatch_orders
             ("companyId", "branchId", "bookingId", "bookingLineId",
              "vehicleId", "driverId", "scheduledStartAt", "scheduledEndAt",
              status, "dispatchedBy", "dispatchedAt")
           VALUES ($1,$2,$3,$4, $5,$6,$7,$8, 'pending', $9, NOW())`,
          [scope.companyId, scope.branchId ?? null, line.bookingId, b.bookingLineId,
           b.vehicleId, b.driverId, b.scheduledStartAt, b.scheduledEndAt, scope.userId],
        );
        assertInsert(orderId, "transport_dispatch_orders");
        await rawExecute(
          `UPDATE transport_booking_lines SET status = 'dispatched', "updatedAt" = NOW()
            WHERE id = $1 AND "companyId" = $2`,
          [b.bookingLineId, scope.companyId],
        );
        return orderId;
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.dispatch.created", entity: "transport_dispatch_orders", entityId: insertId,
        details: JSON.stringify({ driverId: b.driverId, vehicleId: b.vehicleId,
          bookingId: line.bookingId, overrideUsed: !!b.overrideReason }),
      }).catch((e) => logger.error(e, "dispatch event failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create dispatch order error:");
    }
  },
);

const DISPATCH_ACTION_TARGETS: Record<string, typeof DISPATCH_STATUSES[number]> = {
  notify:   "notified",
  accept:   "accepted",
  decline:  "declined",
  start:    "executing",
  complete: "completed",
  close:    "closed",
  cancel:   "cancelled",
};

transportBookingsRouter.patch(
  "/transport/dispatch-orders/:id",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(dispatchOrderActionSchema.safeParse(req.body));
      const target = DISPATCH_ACTION_TARGETS[b.action];

      const result = await withTransaction(async (tx) => {
        const lockRes = await tx.query<{
          id: number; status: typeof DISPATCH_STATUSES[number]; companyId: number;
          driverId: number; vehicleId: number; bookingLineId: number;
        }>(
          `SELECT id, status, "companyId", "driverId", "vehicleId", "bookingLineId"
             FROM transport_dispatch_orders
            WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
          [id, scope.companyId],
        );
        const order = lockRes.rows[0];
        if (!order) throw new NotFoundError("أمر التوزيع غير موجود");
        const allowed = DISPATCH_TRANSITIONS[order.status] ?? [];
        if (!allowed.includes(target)) {
          throw new ConflictError(`الانتقال من ${order.status} إلى ${target} غير مسموح`);
        }
        if (target === "declined" && !b.declinedReason) {
          throw new ValidationError("سبب الرفض مطلوب", {
            field: "declinedReason", fix: "أضف سبباً للرفض",
          });
        }
        const stamps: string[] = [];
        if (target === "accepted") stamps.push(`"acceptedAt" = NOW()`);
        if (target === "executing") stamps.push(`"startedAt" = NOW()`);
        if (target === "completed") stamps.push(`"completedAt" = NOW()`);
        const declinedSet = target === "declined" ? `, "declinedReason" = $4` : "";
        const params: unknown[] = [target, id, scope.companyId];
        if (target === "declined") params.push(b.declinedReason);
        await tx.query(
          `UPDATE transport_dispatch_orders
              SET status = $1, "updatedAt" = NOW()${stamps.length ? "," + stamps.join(",") : ""}${declinedSet}
            WHERE id = $2 AND "companyId" = $3`,
          params,
        );

        // #1812 integration — auto-manage driver_navigation_sessions
        // alongside the dispatch lifecycle. The earlier #1819 design
        // required the operator to explicitly POST .../navigation/start;
        // this hooks it onto the natural action flow so the driver app
        // sees the session the moment they tap "accepted".
        if (target === "accepted") {
          // Lazy-create a session. Skip if one already exists for this
          // order (e.g. operator clicked "accept" twice).
          await tx.query(
            `INSERT INTO driver_navigation_sessions
               ("companyId", "dispatchOrderId", "driverId", "vehicleId",
                "originLat", "originLng", "destinationLat", "destinationLng",
                provider)
             SELECT $1, $2, $3, $4,
                    fl.latitude, fl.longitude, tl.latitude, tl.longitude,
                    COALESCE(s."mapProvider", 'manual_only')
               FROM transport_booking_lines bl
                    JOIN transport_bookings b ON b.id = bl."bookingId"
                    LEFT JOIN transport_locations fl ON fl.id = b."fromLocationId"
                    LEFT JOIN transport_locations tl ON tl.id = b."toLocationId"
                    LEFT JOIN transport_planning_settings s ON s."companyId" = $1
              WHERE bl.id = $5
                AND NOT EXISTS (
                  SELECT 1 FROM driver_navigation_sessions ns
                   WHERE ns."dispatchOrderId" = $2
                     AND ns.status NOT IN ('ended', 'cancelled')
                )
              LIMIT 1`,
            [scope.companyId, id, order.driverId, order.vehicleId, order.bookingLineId],
          );
        }
        if (target === "completed" || target === "closed" || target === "cancelled") {
          // End the active session + stamp the driver's lastDutyEndedAt
          // so the rest constraint engine sees a fresh checkpoint.
          await tx.query(
            `UPDATE driver_navigation_sessions
                SET status = $1, "endedAt" = NOW(), "updatedAt" = NOW()
              WHERE "dispatchOrderId" = $2 AND "companyId" = $3
                AND status NOT IN ('ended', 'cancelled')`,
            [target === "cancelled" ? "cancelled" : "ended", id, scope.companyId],
          );
          if (target === "completed" || target === "closed") {
            await tx.query(
              `UPDATE fleet_drivers
                  SET "lastDutyEndedAt" = NOW(), "updatedAt" = NOW()
                WHERE id = $1 AND "companyId" = $2`,
              [order.driverId, scope.companyId],
            );
          }
        }

        // Top-down cancel cascade — cancelling the dispatch order must also
        // cancel the trip it spawned ("dispatch:<id>:<token>" sourceKey) and
        // release its vehicle/driver, else the trip is orphaned and the
        // resources stay locked. Extracted to the shared helper so the booking
        // cancel cascade (PATCH /transport/bookings/:id, "cascade" policy)
        // releases resources by the identical rule. No re-dispatch loop: the
        // order is already 'cancelled' here, so the fleet trip-cancel
        // re-dispatch guard (status IN 'accepted'/'executing') no-ops. (A
        // simultaneous trip-cancel locks trip→order while this locks
        // order→trip; the rare inversion is Postgres-detected and self-heals on
        // retry since both sides no-op once the other has run.)
        if (target === "cancelled") {
          await cancelTripsForDispatchOrder(tx, {
            dispatchOrderId: id,
            companyId: scope.companyId,
            reason: "أُلغي أمر التوزيع المرتبط",
          });
        }

        // #1812 — cascade the dispatch state down to the booking line and up
        // to the booking. Shared with the fleet trip-completion auto-status
        // path (#12) via lib/transportDispatchCascade so the two entry points
        // never drift on the "booking completes only when ALL lines terminal"
        // aggregate rule.
        await cascadeDispatchToBooking(tx, {
          bookingLineId: order.bookingLineId,
          target,
          companyId: scope.companyId,
        });

        return { previous: order.status, next: target };
      });

      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "transport_dispatch_orders", entityId: id,
        before: { status: result.previous }, after: { status: result.next, action: b.action },
      }).catch((e) => logger.error(e, "dispatch audit failed"));

      res.json({ ok: true, status: result.next });
    } catch (err) {
      handleRouteError(err, res, "Dispatch order action error:");
    }
  },
);

// #1733 Comment 9 — reschedule (drag-and-drop entry point).
// Atomically validates the NEW combination against eligibility and
// time-window conflicts, then updates the row inside a transaction.
transportBookingsRouter.post(
  "/transport/dispatch-orders/:id/reschedule",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(dispatchOrderRescheduleSchema.safeParse(req.body));

      const result = await withTransaction(async (tx) => {
        const lockRes = await tx.query<{
          id: number; companyId: number; bookingLineId: number;
          vehicleId: number; driverId: number;
          scheduledStartAt: string; scheduledEndAt: string;
          status: typeof DISPATCH_STATUSES[number];
        }>(
          `SELECT id, "companyId", "bookingLineId",
                  "vehicleId", "driverId",
                  "scheduledStartAt", "scheduledEndAt", status
             FROM transport_dispatch_orders
            WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
          [id, scope.companyId],
        );
        const order = lockRes.rows[0];
        if (!order) throw new NotFoundError("أمر التوزيع غير موجود");
        // Only pre-execution states can be rescheduled. Once executing
        // / completed / closed the operator must cancel + create a
        // fresh order.
        if (!["pending", "notified"].includes(order.status)) {
          throw new ConflictError(
            `لا يمكن إعادة جدولة أمر بحالة "${order.status}". الرجاء إلغاؤه وإنشاء أمر جديد.`,
          );
        }

        const targetDriverId = b.driverId ?? order.driverId;
        const targetVehicleId = b.vehicleId ?? order.vehicleId;
        const targetStart = b.scheduledStartAt ?? order.scheduledStartAt;
        const targetEnd = b.scheduledEndAt ?? order.scheduledEndAt;

        // 1) Re-run driver eligibility against the new combination.
        if (b.driverId != null || b.vehicleId != null) {
          await assertDriverEligibility({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            userId: scope.userId,
            driverId: targetDriverId,
            vehicleId: targetVehicleId,
            sourceType: "fleet_trip",
            sourceId: order.bookingLineId,
            overrideReason: b.overrideReason ?? null,
          });
        }

        // 2) Re-run time-window conflict detection EXCLUDING this row
        //    itself (otherwise an unchanged window reads as a conflict).
        const cq = dispatchConflictQuery(scope.companyId, targetDriverId, targetVehicleId, targetStart, targetEnd, id);
        const conflicts = await tx.query<{ id: number; kind: string }>(cq.sql, cq.params);
        if (conflicts.rows.length > 0 && !b.overrideReason) {
          const kinds = [...new Set(conflicts.rows.map((c) => c.kind))].join("+");
          throw new ConflictError(
            `تعارض في الجدولة: ${kinds === "driver+vehicle" ? "السائق والمركبة" : kinds === "driver" ? "السائق" : "المركبة"} محجوز/ة في الفترة المطلوبة. أرسل overrideReason للموافقة على التعارض.`,
            { field: kinds, fix: "اختر موعداً آخر أو وضّح سبب الاستثناء" },
          );
        }

        await tx.query(
          `UPDATE transport_dispatch_orders
              SET "driverId" = $1,
                  "vehicleId" = $2,
                  "scheduledStartAt" = $3,
                  "scheduledEndAt" = $4,
                  "updatedAt" = NOW()
            WHERE id = $5 AND "companyId" = $6`,
          [targetDriverId, targetVehicleId, targetStart, targetEnd, id, scope.companyId],
        );

        return {
          before: {
            driverId: order.driverId, vehicleId: order.vehicleId,
            scheduledStartAt: order.scheduledStartAt, scheduledEndAt: order.scheduledEndAt,
          },
          after: {
            driverId: targetDriverId, vehicleId: targetVehicleId,
            scheduledStartAt: targetStart, scheduledEndAt: targetEnd,
          },
        };
      });

      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "transport_dispatch_orders", entityId: id,
        before: result.before, after: result.after,
      }).catch((e) => logger.error(e, "dispatch reschedule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.dispatch.rescheduled",
        entity: "transport_dispatch_orders", entityId: id,
        details: JSON.stringify({ ...result, overrideUsed: !!b.overrideReason }),
      }).catch((e) => logger.error(e, "dispatch reschedule event failed"));

      res.json({ ok: true, ...result.after });
    } catch (err) {
      handleRouteError(err, res, "Dispatch order reschedule error:");
    }
  },
);

export default transportBookingsRouter;
