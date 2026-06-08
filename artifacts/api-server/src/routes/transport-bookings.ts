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
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { assertDriverEligibility } from "../lib/fleet/driverEligibility.js";
import { assertDriverRest } from "../lib/fleet/driverRest.js";

export const transportBookingsRouter = Router();
transportBookingsRouter.use(authMiddleware);

// ─── Shared enums ─────────────────────────────────────────────────────
const BOOKING_SOURCES = [
  "manual_entry", "customer_request", "umrah_group",
  "contract_schedule", "import_excel", "api_integration",
  "recurring_schedule",
] as const;

const TRANSPORT_SERVICE_TYPES = [
  "cargo_load", "passenger_umrah", "passenger_general",
  "equipment_rental", "internal_transfer", "other",
] as const;

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
const createBookingSchema = z.object({
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
  costCenterId: z.coerce.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
});

const updateBookingSchema = createBookingSchema.partial().extend({
  status: z.enum(BOOKING_STATUSES).optional(),
});

const bookingLineSchema = z.object({
  lineNumber: z.coerce.number().int().positive(),
  requiredVehicleType: z.string().max(32).optional(),
  requiredCapacityKg: z.coerce.number().optional(),
  requiredSeatCount: z.coerce.number().int().optional(),
  requiredLicenseClass: z.string().max(32).optional(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  scheduledPickupAt: z.string().optional(),
  scheduledDeliveryAt: z.string().optional(),
  lineDescription: z.string().max(1000).optional(),
  quantity: z.coerce.number().optional(),
  unitOfMeasure: z.string().max(32).optional(),
  passengerCount: z.coerce.number().int().optional(),
  notes: z.string().max(1000).optional(),
});

const dispatchOrderSchema = z.object({
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
});

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

const createLocationSchema = z.object({
  code: z.string().max(32).optional(),
  name: z.string().min(1).max(255),
  locationType: z.string().max(32).optional(),
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
        `SELECT * FROM transport_booking_lines WHERE "bookingId" = $1 AND "deletedAt" IS NULL ORDER BY "lineNumber"`,
        [id],
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
      res.json(maskFields(req, { data: { ...booking, lines, dispatchOrders } }));
    } catch (err) {
      handleRouteError(err, res, "Get transport booking error:");
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
      const { insertId } = await rawExecute(
        `INSERT INTO transport_bookings
           ("companyId", "branchId", "bookingNumber", "bookingSource", "transportServiceType",
            "customerId", "customerName", "customerPhone", "contractId",
            "fromLocationId", "toLocationId", "fromLocationText", "toLocationText", "routeType",
            "requestedPickupDate", "requestedPickupTime", "requestedDeliveryDate", "requestedDeliveryTime",
            "cargoDescription", "cargoQuantity", "cargoUnit", "cargoWeight",
            "passengerCount", "umrahGroupId", "flightNumber", "supervisorName", "supervisorPhone",
            "hotelName", "hotelLocation",
            "beneficiaryType", "beneficiaryId", "projectId", "waqfId", "costCenterId",
            notes, "createdBy")
         VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14, $15,$16,$17,$18,
                 $19,$20,$21,$22, $23,$24,$25,$26,$27, $28,$29,
                 $30,$31,$32,$33,$34, $35,$36)`,
        [
          scope.companyId, scope.branchId ?? null, b.bookingNumber,
          b.bookingSource ?? "manual_entry", b.transportServiceType,
          b.customerId ?? null, b.customerName ?? null, b.customerPhone ?? null, b.contractId ?? null,
          b.fromLocationId ?? null, b.toLocationId ?? null, b.fromLocationText ?? null, b.toLocationText ?? null, b.routeType ?? null,
          b.requestedPickupDate ?? null, b.requestedPickupTime ?? null, b.requestedDeliveryDate ?? null, b.requestedDeliveryTime ?? null,
          b.cargoDescription ?? null, b.cargoQuantity ?? null, b.cargoUnit ?? null, b.cargoWeight ?? null,
          b.passengerCount ?? null, b.umrahGroupId ?? null, b.flightNumber ?? null, b.supervisorName ?? null, b.supervisorPhone ?? null,
          b.hotelName ?? null, b.hotelLocation ?? null,
          b.beneficiaryType ?? null, b.beneficiaryId ?? null, b.projectId ?? null, b.waqfId ?? null, b.costCenterId ?? null,
          b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "transport_bookings");
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.booking.created", entity: "transport_bookings", entityId: insertId,
        details: JSON.stringify({ bookingNumber: b.bookingNumber, serviceType: b.transportServiceType }),
      }).catch((e) => logger.error(e, "booking event failed"));
      res.status(201).json({ data: { id: insertId } });
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
      const [existing] = await rawQuery<{ status: typeof BOOKING_STATUSES[number] }>(
        `SELECT status FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("الحجز غير موجود");
      if (b.status && b.status !== existing.status) {
        const allowed = BOOKING_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(`الانتقال من ${existing.status} إلى ${b.status} غير مسموح`);
        }
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const [col, val] of Object.entries(b)) {
        if (val !== undefined) {
          sets.push(`"${col}" = $${p++}`);
          params.push(val);
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      await rawExecute(
        `UPDATE transport_bookings SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "transport_bookings", entityId: id,
        before: { status: existing.status }, after: b,
      }).catch((e) => logger.error(e, "booking audit failed"));
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update transport booking error:");
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
      const conflicts = await rawQuery<{ id: number; kind: string }>(
        `SELECT id, 'driver' AS kind FROM transport_dispatch_orders
          WHERE "companyId" = $1 AND "driverId" = $2
            AND status NOT IN ('declined', 'cancelled')
            AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
                && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         UNION
         SELECT id, 'vehicle' AS kind FROM transport_dispatch_orders
          WHERE "companyId" = $1 AND "vehicleId" = $5
            AND status NOT IN ('declined', 'cancelled')
            AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
                && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
        [scope.companyId, b.driverId, b.scheduledStartAt, b.scheduledEndAt, b.vehicleId],
      );
      if (conflicts.length > 0 && !b.overrideReason) {
        const kinds = [...new Set(conflicts.map((c) => c.kind))].join("+");
        throw new ConflictError(
          `تعارض في الجدولة: ${kinds === "driver+vehicle" ? "السائق والمركبة" : kinds === "driver" ? "السائق" : "المركبة"} محجوز/ة في الفترة المطلوبة. أرسل overrideReason للموافقة على التعارض.`,
          { field: kinds, fix: "اختر سائقاً/مركبة أخرى أو وضّح سبب الاستثناء" },
        );
      }

      const { insertId } = await rawExecute(
        `INSERT INTO transport_dispatch_orders
           ("companyId", "branchId", "bookingId", "bookingLineId",
            "vehicleId", "driverId", "scheduledStartAt", "scheduledEndAt",
            status, "dispatchedBy", "dispatchedAt")
         VALUES ($1,$2,$3,$4, $5,$6,$7,$8, 'pending', $9, NOW())`,
        [scope.companyId, scope.branchId ?? null, line.bookingId, b.bookingLineId,
         b.vehicleId, b.driverId, b.scheduledStartAt, b.scheduledEndAt, scope.userId],
      );
      assertInsert(insertId, "transport_dispatch_orders");
      await rawExecute(
        `UPDATE transport_booking_lines SET status = 'dispatched', "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2`,
        [b.bookingLineId, scope.companyId],
      );
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
        }>(
          `SELECT id, status, "companyId" FROM transport_dispatch_orders
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
        const declinedSet = target === "declined" ? `, "declinedReason" = $3` : "";
        const params: unknown[] = [target, id];
        if (target === "declined") params.push(b.declinedReason);
        await tx.query(
          `UPDATE transport_dispatch_orders
              SET status = $1, "updatedAt" = NOW()${stamps.length ? "," + stamps.join(",") : ""}${declinedSet}
            WHERE id = $2 AND "companyId" = ${scope.companyId}`,
          params,
        );
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
        const conflicts = await tx.query<{ id: number; kind: string }>(
          `SELECT id, 'driver' AS kind FROM transport_dispatch_orders
            WHERE "companyId" = $1 AND "driverId" = $2 AND id <> $6
              AND status NOT IN ('declined', 'cancelled')
              AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
                  && tstzrange($3::timestamptz, $4::timestamptz, '[)')
           UNION
           SELECT id, 'vehicle' AS kind FROM transport_dispatch_orders
            WHERE "companyId" = $1 AND "vehicleId" = $5 AND id <> $6
              AND status NOT IN ('declined', 'cancelled')
              AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
                  && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
          [scope.companyId, targetDriverId, targetStart, targetEnd, targetVehicleId, id],
        );
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
