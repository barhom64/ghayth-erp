/**
 * Transport Planning Engine routes (#1812).
 *
 *   GET    /transport/planning-settings              — load company settings
 *   PATCH  /transport/planning-settings              — update settings
 *
 *   POST   /transport/bookings/:id/suggest-assignment — engine output
 *   POST   /transport/bookings/:id/estimate-route     — MapsService passthrough
 *
 *   GET    /transport/ops-dashboard                   — daily KPIs + lists
 *
 *   GET    /transport/itineraries                    — list
 *   POST   /transport/itineraries                    — create
 *   GET    /transport/itineraries/:id                — detail (with legs)
 *   PATCH  /transport/itineraries/:id                — update
 *   DELETE /transport/itineraries/:id                — soft delete
 *   POST   /transport/itineraries/:id/legs           — add a leg
 *   PATCH  /transport/itineraries/:id/legs/:legId    — update a leg
 *   DELETE /transport/itineraries/:id/legs/:legId    — remove a leg
 *
 *   POST   /transport/dispatch-orders/:id/navigation/start    — start session
 *   POST   /transport/dispatch-orders/:id/navigation/ping     — driver ping
 *   POST   /transport/dispatch-orders/:id/navigation/event    — state transition
 *   POST   /transport/dispatch-orders/:id/navigation/complete — end session
 *   GET    /transport/dispatch-orders/:id/navigation          — current session
 *   GET    /fleet/driver/me/navigation                        — driver's active
 *
 * Gating:
 *   • Settings + suggest + ops-dashboard + itineraries → fleet.bookings
 *   • Navigation session: driver-side endpoints check the caller against
 *     the dispatch_order's driverId. Operator-side reads gate on
 *     fleet.dispatch.
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError, NotFoundError, ValidationError,
  parseId, zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import {
  MapsService, loadPlanningSettings, updatePlanningSettings,
} from "../lib/fleet/mapsService.js";
// Maps Provider Adapter — masking helper is exported separately so
// any route that needs to echo the planning settings goes through
// the single chokepoint instead of re-implementing the masking.
import {
  suggestAssignments,
  suggestForLeg,
  suggestForItinerary,
  type ExcludedCandidate,
} from "../lib/fleet/assignmentSuggestionEngine.js";
import { diagnoseEmptySuggest } from "../lib/fleet/suggestDiagnostics.js";

export const transportPlanningRouter = Router();
transportPlanningRouter.use(authMiddleware);

// ─── Planning settings ───────────────────────────────────────────────

// #2079 FIX-11 (DEAD-02) — the `mapbox` and `here_maps` providers
// remain declared in the TS type union and the DB CHECK constraint
// (migration 271:130) because old rows may still carry them, but
// the mapsService falls back to `manual_only` for both of them.
// Exposing them as a settable value through the PATCH endpoint is
// misleading — the operator picks "mapbox", clicks save, then
// notices every estimate is still a straight-line manual
// approximation. Restrict the input enum to the three providers
// that ACTUALLY work end-to-end:
//   • manual_only — explicit "use internal estimate, do not call Google"
//   • google_maps — explicit "always use Google, fail loud if no key"
//   • auto        — operator-friendly: use Google if a key exists,
//                   else fall back to the internal estimate
// (Maps Provider Adapter, owner brief 2026-06-15.)
const MAP_PROVIDERS_WRITABLE = ["manual_only", "google_maps", "auto"] as const;

transportPlanningRouter.get(
  "/transport/planning-settings",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const settings = await loadPlanningSettings(scope.companyId);
      // Maps Provider Adapter — `toClientSettings` is the SINGLE
      // chokepoint that strips the raw API key (returns the masked
      // form) and adds the SPA-ready fallback notice. Wrap with
      // `maskFields` so any future per-field policy still applies.
      res.json(maskFields(req, { data: MapsService.toClientSettings(settings) }));
    } catch (err) {
      handleRouteError(err, res, "Load planning settings error:");
    }
  },
);

const updateSettingsSchema = z.object({
  mapProvider: z.enum(MAP_PROVIDERS_WRITABLE, {
    errorMap: () => ({
      message: "مزوّد الخرائط المختار غير مفعَّل في النظام — المسموح: manual_only أو google_maps أو auto",
    }),
  }).optional(),
  mapProviderApiKey: z.string().max(255).nullable().optional(),
  defaultRestHoursRequired: z.coerce.number().min(0).max(24).optional(),
  defaultLoadingMinutes: z.coerce.number().int().min(0).max(480).optional(),
  defaultUnloadingMinutes: z.coerce.number().int().min(0).max(480).optional(),
  defaultBufferMinutes: z.coerce.number().int().min(0).max(480).optional(),
  defaultDeadheadKmh: z.coerce.number().int().min(10).max(200).optional(),
  estimateCacheTtlMinutes: z.coerce.number().int().min(15).max(43200).optional(),
  // Maps Provider Adapter (owner brief 2026-06-15) — operator toggle
  // for the driver's "ابدأ الملاحة" external link. The link itself is
  // keyless; this flag is for fleets that want to forbid the driver
  // from leaving the app even when no in-app map is available. We
  // accept boolean OR the strings "true"/"false" since some form
  // libraries serialize toggles as strings; everything else rejects.
  enableExternalNavigationUrls: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
});

transportPlanningRouter.patch(
  "/transport/planning-settings",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(updateSettingsSchema.safeParse(req.body));
      const updated = await updatePlanningSettings(scope.companyId, b);
      // Audit-log the PATCH body, but never the raw API key. Owner
      // brief: «لا تطبعه في logs». Replace it with `[set]`/`[cleared]`
      // before the row hits the audit trail.
      const auditPayload: Record<string, unknown> = { ...b };
      if ("mapProviderApiKey" in auditPayload) {
        auditPayload.mapProviderApiKey =
          auditPayload.mapProviderApiKey == null || auditPayload.mapProviderApiKey === ""
            ? "[cleared]"
            : "[set]";
      }
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "transport_planning_settings", entityId: scope.companyId,
        after: auditPayload,
      }).catch((e) => logger.error(e, "planning settings audit failed"));
      // Echo back the masked client view, never the raw settings row.
      res.json({ data: MapsService.toClientSettings(updated) });
    } catch (err) {
      handleRouteError(err, res, "Update planning settings error:");
    }
  },
);

// #1812 — maps-provider health check. Admin UI calls this immediately
// after the operator pastes a new API key to give live feedback
// ("ok" / "invalid_key" / "quota_exceeded" / "network_error" /
// "missing" / "not_supported") so they know whether to fix the key.
transportPlanningRouter.post(
  "/transport/planning-settings/health-check",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const status = await MapsService.healthCheck(scope.companyId);
      res.json({ data: { status } });
    } catch (err) {
      handleRouteError(err, res, "Maps provider health-check error:");
    }
  },
);

// ─── Suggest-assignment + estimate-route ─────────────────────────────

const suggestSchema = z.object({
  bookingLineId: z.coerce.number().int().positive().optional(),
  scheduledStartAt: z.string().optional(),
  scheduledEndAt: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

transportPlanningRouter.post(
  "/transport/bookings/:id/suggest-assignment",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const bookingId = parseId(req.params.id, "id");
      const b = zodParse(suggestSchema.safeParse(req.body ?? {}));
      // #TA-T18-UX-AUDIT-01 P0-4 — collect pre-scoring ejections so the
      // SPA can explain WHY an expected vehicle/driver isn't suggested
      // (مصفوفة القدرات / الجاهزية / الصيانة / الإجازة / حدود القيادة)
      // بدل إخفائها بصمت.
      const sink: ExcludedCandidate[] = [];
      const candidates = await suggestAssignments({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        bookingId,
        bookingLineId: b.bookingLineId,
        scheduledStartAt: b.scheduledStartAt,
        scheduledEndAt: b.scheduledEndAt,
        limit: b.limit,
        sink,
      });
      // #1812 gap #5 — when the engine returns 0, surface a structured
      // diagnostic so the SPA can explain WHY (no vehicles vs no
      // active drivers vs no window vs all busy) instead of the
      // generic "no candidates" copy.
      let diagnostics = null;
      if (candidates.length === 0) {
        diagnostics = await diagnoseEmptySuggest({
          companyId: scope.companyId,
          scheduledStartAt: b.scheduledStartAt,
          scheduledEndAt: b.scheduledEndAt,
        });
      }
      // Cap the excluded list so a large fleet can't bloat the payload.
      res.json({ data: candidates, diagnostics, excluded: sink.slice(0, 40) });
    } catch (err) {
      handleRouteError(err, res, "Suggest assignment error:");
    }
  },
);

const estimateRouteSchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
  destinationLat: z.coerce.number().min(-90).max(90),
  destinationLng: z.coerce.number().min(-180).max(180),
});

transportPlanningRouter.post(
  "/transport/bookings/:id/estimate-route",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(estimateRouteSchema.safeParse(req.body));
      const result = await MapsService.estimateRoute({
        companyId: scope.companyId,
        originLat: b.originLat,
        originLng: b.originLng,
        destinationLat: b.destinationLat,
        destinationLng: b.destinationLng,
      });
      res.json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Estimate route error:");
    }
  },
);

// ─── Operations dashboard ────────────────────────────────────────────
// One endpoint, returns the bundle the daily-ops UI shows:
//   - counters: trips today / late / unassigned / conflicting
//   - lists: trips in progress, late, unassigned, completed today
//   - vehicle/driver availability rollup

transportPlanningRouter.get(
  "/transport/ops-dashboard",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const today = (req.query.date as string | undefined) ?? todayISO();

      // Trips for the day (dispatch orders + their booking).
      const trips = await rawQuery<Record<string, unknown>>(
        `SELECT d.id, d.status, d."scheduledStartAt", d."scheduledEndAt",
                d."acceptedAt", d."startedAt", d."completedAt",
                d."driverId", d."vehicleId",
                v."plateNumber" AS "vehiclePlate",
                dr.name AS "driverName",
                b.id AS "bookingId", b."bookingNumber", b."transportServiceType",
                b."fromLocationText", b."toLocationText"
           FROM transport_dispatch_orders d
                JOIN transport_booking_lines l ON l.id = d."bookingLineId" AND l."deletedAt" IS NULL
                JOIN transport_bookings b      ON b.id = l."bookingId" AND b."deletedAt" IS NULL
                LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."deletedAt" IS NULL
                LEFT JOIN fleet_drivers dr ON dr.id = d."driverId" AND dr."deletedAt" IS NULL
          WHERE d."companyId" = $1
            AND d."scheduledStartAt"::date = $2::date
          ORDER BY d."scheduledStartAt" ASC LIMIT 500`,
        [scope.companyId, today],
      );

      const now = new Date();
      const lateThreshold = 15 * 60_000; // 15 minutes

      const inProgress = trips.filter((t) =>
        t.status === "executing" || t.status === "accepted",
      );
      const late = trips.filter((t) => {
        if (t.status === "completed" || t.status === "cancelled" || t.status === "closed") return false;
        const startAt = t.scheduledStartAt as string | null;
        if (!startAt) return false;
        return new Date(startAt).getTime() + lateThreshold < now.getTime() &&
               (t.status === "pending" || t.status === "notified");
      });
      const completed = trips.filter((t) => t.status === "completed" || t.status === "closed");

      // Unassigned bookings — approved/scheduled but no dispatch order yet
      // for the chosen date.
      const unassigned = await rawQuery<Record<string, unknown>>(
        `SELECT b.id, b."bookingNumber", b."transportServiceType",
                b."customerName", b."fromLocationText", b."toLocationText",
                b."requestedPickupDate", b."pickupWindowStart",
                b."pickupWindowEnd", b."fixedAppointmentTime",
                b.priority, b.status
           FROM transport_bookings b
          WHERE b."companyId" = $1
            AND b."deletedAt" IS NULL
            AND b.status IN ('approved', 'scheduled', 'submitted', 'pending_approval')
            AND COALESCE(b."requestedPickupDate"::date,
                         b."fixedAppointmentTime"::date,
                         b."pickupWindowStart"::date) = $2::date
            AND NOT EXISTS (
              SELECT 1 FROM transport_booking_lines l
                JOIN transport_dispatch_orders d ON d."bookingLineId" = l.id
               WHERE l."bookingId" = b.id
                 AND l."deletedAt" IS NULL
                 AND d.status NOT IN ('declined', 'cancelled')
            )
          ORDER BY b.priority DESC, b."pickupWindowStart" ASC NULLS LAST
          LIMIT 200`,
        [scope.companyId, today],
      );

      // Vehicle availability rollup.
      const vehicles = await rawQuery<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
           FROM fleet_vehicles
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
          GROUP BY status`,
        [scope.companyId],
      );
      const driverCount = await rawQuery<{ status: string; count: string }>(
        `SELECT COALESCE(status, 'active') AS status, COUNT(*)::text AS count
           FROM fleet_drivers
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
          GROUP BY COALESCE(status, 'active')`,
        [scope.companyId],
      );

      res.json(maskFields(req, {
        data: {
          date: today,
          counters: {
            totalTrips: trips.length,
            inProgress: inProgress.length,
            late: late.length,
            completed: completed.length,
            unassigned: unassigned.length,
          },
          trips,
          late,
          unassigned,
          vehiclesByStatus: Object.fromEntries(vehicles.map((r) => [r.status, Number(r.count)])),
          driversByStatus:  Object.fromEntries(driverCount.map((r) => [r.status, Number(r.count)])),
        },
      }));
    } catch (err) {
      handleRouteError(err, res, "Ops dashboard error:");
    }
  },
);

// ─── Weekly planning view ────────────────────────────────────────────
// Returns 7 days of dispatch activity, grouped by date + per-vehicle
// utilisation rollup. Drives the "أسبوع كامل" tab on the ops
// dashboard. The user's Comment 2: "التخطيط الأسبوعي — توزيع
// الحجوزات على الأسبوع، أيام الضغط، المركبات الأعلى/الأقل استخدامًا."

transportPlanningRouter.get(
  "/transport/ops-weekly",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const startDate = (req.query.startDate as string | undefined) ?? todayISO();

      // Daily counters across 7 consecutive days starting from startDate.
      const daily = await rawQuery<{
        day: string;
        total: string;
        completed: string;
        cancelled: string;
        late: string;
      }>(
        `WITH days AS (
           SELECT generate_series($2::date, $2::date + INTERVAL '6 days', INTERVAL '1 day')::date AS day
         )
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(COUNT(o.id) FILTER (WHERE o.id IS NOT NULL), 0)::text AS total,
                COALESCE(COUNT(o.id) FILTER (WHERE o.status IN ('completed', 'closed')), 0)::text AS completed,
                COALESCE(COUNT(o.id) FILTER (WHERE o.status = 'cancelled'), 0)::text AS cancelled,
                COALESCE(COUNT(o.id) FILTER (
                  WHERE o.status IN ('pending', 'notified')
                    AND o."scheduledStartAt" + INTERVAL '15 minutes' < NOW()
                ), 0)::text AS late
           FROM days d
                LEFT JOIN transport_dispatch_orders o
                  ON o."companyId" = $1
                 AND o."scheduledStartAt"::date = d.day
          GROUP BY d.day
          ORDER BY d.day`,
        [scope.companyId, startDate],
      );

      // Per-vehicle utilisation: minutes booked across the 7-day window
      // / total minutes in the window. Sorts heaviest at top so the
      // dispatcher can spot the at-risk units (and the under-used ones).
      const vehicleUtilisation = await rawQuery<{
        vehicleId: number;
        plateNumber: string | null;
        vehicleType: string | null;
        bookedMinutes: number;
        tripCount: number;
        utilisation: number;
      }>(
        `SELECT v.id AS "vehicleId",
                v."plateNumber",
                v."vehicleType",
                COALESCE(SUM(
                  EXTRACT(EPOCH FROM (o."scheduledEndAt" - o."scheduledStartAt")) / 60
                )::int, 0) AS "bookedMinutes",
                COUNT(o.id)::int AS "tripCount",
                ROUND(
                  COALESCE(SUM(
                    EXTRACT(EPOCH FROM (o."scheduledEndAt" - o."scheduledStartAt"))
                  )::numeric, 0) / NULLIF(7 * 24 * 3600, 0) * 100,
                  1
                ) AS utilisation
           FROM fleet_vehicles v
                LEFT JOIN transport_dispatch_orders o
                  ON o."vehicleId" = v.id
                 AND o."companyId" = v."companyId"
                 AND o.status NOT IN ('declined', 'cancelled')
                 AND o."scheduledStartAt"::date BETWEEN $2::date AND $2::date + INTERVAL '6 days'
          WHERE v."companyId" = $1
            AND v."deletedAt" IS NULL
          GROUP BY v.id, v."plateNumber", v."vehicleType"
          HAVING COUNT(o.id) > 0 OR v.status = 'available'
          ORDER BY utilisation DESC NULLS LAST, v.id ASC
          LIMIT 100`,
        [scope.companyId, startDate],
      );

      res.json(maskFields(req, {
        data: {
          startDate,
          endDate: new Date(new Date(startDate).getTime() + 6 * 86400_000)
            .toISOString().slice(0, 10),
          daily,
          vehicleUtilisation,
        },
      }));
    } catch (err) {
      handleRouteError(err, res, "Ops weekly error:");
    }
  },
);

// ─── Itineraries ─────────────────────────────────────────────────────

const TRANSPORT_SERVICE_TYPES = [
  "cargo_load", "passenger_umrah", "passenger_general",
  "equipment_rental", "internal_transfer", "other",
] as const;

const createItinerarySchema = z.object({
  itineraryName: z.string().min(1).max(255),
  transportServiceType: z.enum(TRANSPORT_SERVICE_TYPES),
  customerId: z.coerce.number().int().positive().optional(),
  umrahGroupId: z.coerce.number().int().positive().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

const updateItinerarySchema = createItinerarySchema.partial().extend({
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "cancelled"]).optional(),
});

transportPlanningRouter.get(
  "/transport/itineraries",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { status, serviceType } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
      if (status) { params.push(status); where += ` AND status = $${params.length}`; }
      if (serviceType) { params.push(serviceType); where += ` AND "transportServiceType" = $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_itineraries
          WHERE ${where}
          ORDER BY "startsAt" DESC NULLS LAST, id DESC LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List itineraries error:");
    }
  },
);

transportPlanningRouter.post(
  "/transport/itineraries",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createItinerarySchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO transport_itineraries
           ("companyId", "branchId", "itineraryName",
            "customerId", "umrahGroupId", "transportServiceType",
            "startsAt", "endsAt", notes, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          scope.companyId, scope.branchId ?? null, b.itineraryName,
          b.customerId ?? null, b.umrahGroupId ?? null, b.transportServiceType,
          b.startsAt ?? null, b.endsAt ?? null, b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "transport_itineraries");
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create itinerary error:");
    }
  },
);

transportPlanningRouter.get(
  "/transport/itineraries/:id",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [itin] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_itineraries
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!itin) throw new NotFoundError("البرنامج غير موجود");
      const legs = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_itinerary_legs
          WHERE "itineraryId" = $1 AND "companyId" = $2
          ORDER BY "legNumber" ASC`,
        [id, scope.companyId],
      );
      res.json(maskFields(req, { data: { ...itin, legs } }));
    } catch (err) {
      handleRouteError(err, res, "Get itinerary error:");
    }
  },
);

transportPlanningRouter.patch(
  "/transport/itineraries/:id",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateItinerarySchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        itineraryName: '"itineraryName"', transportServiceType: '"transportServiceType"',
        customerId: '"customerId"', umrahGroupId: '"umrahGroupId"',
        startsAt: '"startsAt"', endsAt: '"endsAt"',
        status: "status", notes: "notes",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(v);
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE transport_itineraries SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("البرنامج غير موجود");
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update itinerary error:");
    }
  },
);

transportPlanningRouter.delete(
  "/transport/itineraries/:id",
  authorize({ feature: "fleet.bookings", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE transport_itineraries
            SET "deletedAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("البرنامج غير موجود");
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Delete itinerary error:");
    }
  },
);

const LEG_TYPES = ["transit", "pickup", "dropoff", "rest", "fuel", "inspection", "custom"] as const;

const createLegSchema = z.object({
  legNumber: z.coerce.number().int().min(1),
  legType: z.enum(LEG_TYPES).optional(),
  originText: z.string().max(255).optional(),
  originLocationId: z.coerce.number().int().positive().optional(),
  destinationText: z.string().max(255).optional(),
  destinationLocationId: z.coerce.number().int().positive().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  pickupWindowStart: z.string().optional(),
  pickupWindowEnd: z.string().optional(),
  dropoffWindowStart: z.string().optional(),
  dropoffWindowEnd: z.string().optional(),
  requiredVehicleClass: z.string().max(32).optional(),
  assignedVehicleId: z.coerce.number().int().positive().optional(),
  assignedDriverId: z.coerce.number().int().positive().optional(),
  estimatedDistanceKm: z.coerce.number().nonnegative().optional(),
  estimatedDurationMinutes: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
});

const updateLegSchema = createLegSchema.partial().extend({
  status: z.enum([
    "pending", "scheduled", "assigned", "in_progress",
    "completed", "cancelled", "skipped",
  ]).optional(),
});

// #2079 PE-05 — self-overlap guard.
//
// Refuses to accept a leg whose [scheduledStart, scheduledEnd] window
// overlaps another leg in the SAME itinerary. The audit (file 20 §2
// MULTI-02) flagged silent self-overlap as a latent itinerary bug:
// the engine would later produce a contradictory plan.
//
// Skips when either bound is null (transit / rest legs with no
// schedule). `excludeLegId` lets PATCH ignore the row being updated.
async function assertLegDoesNotOverlap(args: {
  companyId: number;
  itineraryId: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  excludeLegId?: number;
}): Promise<void> {
  if (!args.scheduledStart || !args.scheduledEnd) return;
  const rows = await rawQuery<{ legNumber: number }>(
    `SELECT "legNumber" FROM transport_itinerary_legs
      WHERE "companyId" = $1
        AND "itineraryId" = $2
        AND ($5::int IS NULL OR id <> $5)
        AND "scheduledStart" IS NOT NULL
        AND "scheduledEnd" IS NOT NULL
        AND tstzrange("scheduledStart", "scheduledEnd", '[)')
            && tstzrange($3::timestamptz, $4::timestamptz, '[)')
      LIMIT 1`,
    [
      args.companyId,
      args.itineraryId,
      args.scheduledStart,
      args.scheduledEnd,
      args.excludeLegId ?? null,
    ],
  );
  if (rows.length > 0) {
    throw new ValidationError(
      `تتعارض نافذة هذه المرحلة زمنيًّا مع المرحلة ${rows[0].legNumber} في نفس البرنامج`,
    );
  }
}

transportPlanningRouter.post(
  "/transport/itineraries/:id/legs",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const itineraryId = parseId(req.params.id, "id");
      const b = zodParse(createLegSchema.safeParse(req.body));

      // Verify itinerary belongs to scope
      const [itin] = await rawQuery<{ id: number }>(
        `SELECT id FROM transport_itineraries
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [itineraryId, scope.companyId],
      );
      if (!itin) throw new NotFoundError("البرنامج غير موجود");

      // #2079 PE-05 — block self-overlap before INSERT.
      await assertLegDoesNotOverlap({
        companyId: scope.companyId,
        itineraryId,
        scheduledStart: b.scheduledStart ?? null,
        scheduledEnd:   b.scheduledEnd   ?? null,
      });

      const { insertId } = await rawExecute(
        `INSERT INTO transport_itinerary_legs
           ("companyId", "itineraryId", "legNumber", "legType",
            "originText", "originLocationId",
            "destinationText", "destinationLocationId",
            "scheduledStart", "scheduledEnd",
            "pickupWindowStart", "pickupWindowEnd",
            "dropoffWindowStart", "dropoffWindowEnd",
            "requiredVehicleClass",
            "assignedVehicleId", "assignedDriverId",
            "estimatedDistanceKm", "estimatedDurationMinutes",
            notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          scope.companyId, itineraryId, b.legNumber, b.legType ?? "transit",
          b.originText ?? null, b.originLocationId ?? null,
          b.destinationText ?? null, b.destinationLocationId ?? null,
          b.scheduledStart ?? null, b.scheduledEnd ?? null,
          b.pickupWindowStart ?? null, b.pickupWindowEnd ?? null,
          b.dropoffWindowStart ?? null, b.dropoffWindowEnd ?? null,
          b.requiredVehicleClass ?? null,
          b.assignedVehicleId ?? null, b.assignedDriverId ?? null,
          b.estimatedDistanceKm ?? null, b.estimatedDurationMinutes ?? null,
          b.notes ?? null,
        ],
      );
      assertInsert(insertId, "transport_itinerary_legs");
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create itinerary leg error:");
    }
  },
);

transportPlanningRouter.patch(
  "/transport/itineraries/:id/legs/:legId",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const itineraryId = parseId(req.params.id, "id");
      const legId = parseId(req.params.legId, "legId");
      const b = zodParse(updateLegSchema.safeParse(req.body));

      // #2079 PE-05 — block self-overlap on PATCH. When the operator
      // moves a leg's window, we honour the NEW value for the row
      // being updated (PATCH semantics: omitted fields keep DB value)
      // and exclude the row itself from the overlap probe.
      if (b.scheduledStart !== undefined || b.scheduledEnd !== undefined) {
        const [current] = await rawQuery<{
          scheduledStart: string | null;
          scheduledEnd: string | null;
        }>(
          `SELECT "scheduledStart", "scheduledEnd"
             FROM transport_itinerary_legs
            WHERE id = $1 AND "itineraryId" = $2 AND "companyId" = $3`,
          [legId, itineraryId, scope.companyId],
        );
        if (current) {
          await assertLegDoesNotOverlap({
            companyId: scope.companyId,
            itineraryId,
            scheduledStart: b.scheduledStart !== undefined ? (b.scheduledStart ?? null) : current.scheduledStart,
            scheduledEnd:   b.scheduledEnd   !== undefined ? (b.scheduledEnd   ?? null) : current.scheduledEnd,
            excludeLegId: legId,
          });
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        legNumber: '"legNumber"', legType: '"legType"',
        originText: '"originText"', originLocationId: '"originLocationId"',
        destinationText: '"destinationText"', destinationLocationId: '"destinationLocationId"',
        scheduledStart: '"scheduledStart"', scheduledEnd: '"scheduledEnd"',
        pickupWindowStart: '"pickupWindowStart"', pickupWindowEnd: '"pickupWindowEnd"',
        dropoffWindowStart: '"dropoffWindowStart"', dropoffWindowEnd: '"dropoffWindowEnd"',
        requiredVehicleClass: '"requiredVehicleClass"',
        assignedVehicleId: '"assignedVehicleId"', assignedDriverId: '"assignedDriverId"',
        estimatedDistanceKm: '"estimatedDistanceKm"',
        estimatedDurationMinutes: '"estimatedDurationMinutes"',
        status: "status", notes: "notes",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(v);
        }
      }
      if (sets.length === 0) { res.json({ data: { id: legId } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(legId, scope.companyId, itineraryId);
      const { affectedRows } = await rawExecute(
        `UPDATE transport_itinerary_legs SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "itineraryId" = $${p++}`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("مرحلة البرنامج غير موجودة");
      res.json({ data: { id: legId } });
    } catch (err) {
      handleRouteError(err, res, "Update itinerary leg error:");
    }
  },
);

transportPlanningRouter.delete(
  "/transport/itineraries/:id/legs/:legId",
  authorize({ feature: "fleet.bookings", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const itineraryId = parseId(req.params.id, "id");
      const legId = parseId(req.params.legId, "legId");
      const { affectedRows } = await rawExecute(
        `DELETE FROM transport_itinerary_legs
          WHERE id = $1 AND "companyId" = $2 AND "itineraryId" = $3`,
        [legId, scope.companyId, itineraryId],
      );
      if (affectedRows === 0) throw new NotFoundError("مرحلة البرنامج غير موجودة");
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Delete itinerary leg error:");
    }
  },
);

// ─── Per-leg suggest-assignment ──────────────────────────────────────
// Routes the AssignmentSuggestionEngine through a leg's criteria
// (requiredVehicleClass + scheduledStart/End + originLocationId). The
// SPA itinerary detail uses this for the "اقترح المركبة والسائق"
// button on each leg in a chained trip.

const legSuggestSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

transportPlanningRouter.post(
  "/transport/itineraries/:id/legs/:legId/suggest-assignment",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const itineraryId = parseId(req.params.id, "id");
      const legId = parseId(req.params.legId, "legId");
      const b = zodParse(legSuggestSchema.safeParse(req.body ?? {}));
      // Verify the leg belongs to scope + the named itinerary.
      const [leg] = await rawQuery<{ id: number }>(
        `SELECT id FROM transport_itinerary_legs
          WHERE id = $1 AND "itineraryId" = $2 AND "companyId" = $3`,
        [legId, itineraryId, scope.companyId],
      );
      if (!leg) throw new NotFoundError("مرحلة البرنامج غير موجودة");
      const candidates = await suggestForLeg(scope.companyId, legId, { limit: b.limit });
      res.json({ data: candidates });
    } catch (err) {
      handleRouteError(err, res, "Suggest assignment for leg error:");
    }
  },
);

// #2079 PE-05 — itinerary-aware suggest.
//
// Walks the itinerary's legs in legNumber order and runs the engine
// on each. The previous leg's top (vehicle, driver) pair is threaded
// forward so the same crew naturally ranks first on the next leg
// (continuity bonus +10). The full hard-guard chain (Operating
// Window → VCM → Vehicle Readiness → Driver Readiness) still runs
// on every leg — continuity NEVER bypasses an ejection.
const itinerarySuggestSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

transportPlanningRouter.post(
  "/transport/itineraries/:id/suggest",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const itineraryId = parseId(req.params.id, "id");
      const b = zodParse(itinerarySuggestSchema.safeParse(req.body ?? {}));
      const [itin] = await rawQuery<{ id: number }>(
        `SELECT id FROM transport_itineraries
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [itineraryId, scope.companyId],
      );
      if (!itin) throw new NotFoundError("البرنامج غير موجود");
      const legs = await suggestForItinerary(
        scope.companyId,
        itineraryId,
        { limit: b.limit },
      );
      res.json({ data: legs });
    } catch (err) {
      handleRouteError(err, res, "Itinerary suggest error:");
    }
  },
);

// ─── Navigation sessions ─────────────────────────────────────────────

async function loadDispatchOrderForDriver(
  companyId: number, dispatchOrderId: number,
): Promise<{
  id: number; driverId: number; vehicleId: number;
  status: string; bookingLineId: number;
  fromLat: number | null; fromLng: number | null;
  toLat: number | null; toLng: number | null;
} | null> {
  const [row] = await rawQuery<{
    id: number; driverId: number; vehicleId: number;
    status: string; bookingLineId: number;
    fromLat: number | null; fromLng: number | null;
    toLat: number | null; toLng: number | null;
  }>(
    `SELECT d.id, d."driverId", d."vehicleId", d.status, d."bookingLineId",
            fl.latitude  AS "fromLat",
            fl.longitude AS "fromLng",
            tl.latitude  AS "toLat",
            tl.longitude AS "toLng"
       FROM transport_dispatch_orders d
            JOIN transport_booking_lines bl ON bl.id = d."bookingLineId" AND bl."deletedAt" IS NULL
            JOIN transport_bookings b ON b.id = bl."bookingId" AND b."deletedAt" IS NULL
            LEFT JOIN transport_locations fl ON fl.id = b."fromLocationId" AND fl."deletedAt" IS NULL
            LEFT JOIN transport_locations tl ON tl.id = b."toLocationId" AND tl."deletedAt" IS NULL
      WHERE d.id = $1 AND d."companyId" = $2`,
    [dispatchOrderId, companyId],
  );
  return row ?? null;
}

transportPlanningRouter.post(
  "/transport/dispatch-orders/:id/navigation/start",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const dispatchOrderId = parseId(req.params.id, "id");
      const order = await loadDispatchOrderForDriver(scope.companyId, dispatchOrderId);
      if (!order) throw new NotFoundError("أمر التوزيع غير موجود");
      if (!["accepted", "executing"].includes(order.status)) {
        throw new ValidationError(
          `لا يمكن بدء جلسة ملاحة على أمر بحالة "${order.status}". يجب قبول المهمة أولاً.`,
          { field: "status" },
        );
      }
      const settings = await loadPlanningSettings(scope.companyId);

      const { insertId } = await rawExecute(
        `INSERT INTO driver_navigation_sessions
           ("companyId", "dispatchOrderId", "driverId", "vehicleId",
            "originLat", "originLng", "destinationLat", "destinationLng",
            provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          scope.companyId, dispatchOrderId, order.driverId, order.vehicleId,
          order.fromLat, order.fromLng, order.toLat, order.toLng,
          settings.mapProvider,
        ],
      );
      assertInsert(insertId, "driver_navigation_sessions");

      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.dispatch.navigation_started",
        entity: "driver_navigation_sessions", entityId: insertId,
        details: JSON.stringify({ dispatchOrderId, provider: settings.mapProvider }),
      }).catch((e) => logger.error(e, "navigation start event failed"));

      res.status(201).json({ data: { id: insertId, provider: settings.mapProvider } });
    } catch (err) {
      handleRouteError(err, res, "Start navigation session error:");
    }
  },
);

const pingSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  speedKmh: z.coerce.number().min(0).max(400).optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  etaSeconds: z.coerce.number().int().nonnegative().optional(),
  remainingMeters: z.coerce.number().int().nonnegative().optional(),
});

transportPlanningRouter.post(
  "/transport/dispatch-orders/:id/navigation/ping",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const dispatchOrderId = parseId(req.params.id, "id");
      const b = zodParse(pingSchema.safeParse(req.body));
      const { affectedRows } = await rawExecute(
        `UPDATE driver_navigation_sessions
            SET "lastLat" = $1, "lastLng" = $2,
                "lastSpeedKmh" = $3, "lastHeading" = $4,
                "lastPingAt" = NOW(),
                "etaSeconds" = COALESCE($5, "etaSeconds"),
                "remainingMeters" = COALESCE($6, "remainingMeters"),
                "updatedAt" = NOW()
          WHERE "dispatchOrderId" = $7 AND "companyId" = $8
            AND status NOT IN ('ended', 'cancelled')`,
        [
          b.lat, b.lng, b.speedKmh ?? null, b.heading ?? null,
          b.etaSeconds ?? null, b.remainingMeters ?? null,
          dispatchOrderId, scope.companyId,
        ],
      );
      if (affectedRows === 0) throw new NotFoundError("لا توجد جلسة ملاحة نشطة لهذه المهمة");

      // Also record a vehicle_location_snapshot so the operator's live
      // map sees the ping. The dispatch order knows the vehicle.
      const [order] = await rawQuery<{ vehicleId: number }>(
        `SELECT "vehicleId" FROM transport_dispatch_orders
          WHERE id = $1 AND "companyId" = $2`,
        [dispatchOrderId, scope.companyId],
      );
      if (order) {
        await rawExecute(
          `INSERT INTO vehicle_location_snapshots
             ("companyId", "vehicleId", latitude, longitude, "capturedAt", source)
           VALUES ($1, $2, $3, $4, NOW(), 'driver_navigation')`,
          [scope.companyId, order.vehicleId, b.lat, b.lng],
        ).catch((e) => logger.warn({ err: e }, "ping snapshot write failed"));
      }

      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Navigation ping error:");
    }
  },
);

const NAV_EVENTS = ["arrived_pickup", "loaded", "arrived_dropoff", "delivered"] as const;
const eventSchema = z.object({ event: z.enum(NAV_EVENTS) });

transportPlanningRouter.post(
  "/transport/dispatch-orders/:id/navigation/event",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const dispatchOrderId = parseId(req.params.id, "id");
      const b = zodParse(eventSchema.safeParse(req.body));
      const colMap: Record<string, { col: string; status: string }> = {
        arrived_pickup:  { col: '"arrivedPickupAt"',  status: "arrived_pickup"  },
        loaded:          { col: '"loadedAt"',          status: "loaded"          },
        arrived_dropoff: { col: '"arrivedDropoffAt"', status: "arrived_dropoff" },
        delivered:       { col: '"deliveredAt"',       status: "delivered"       },
      };
      const m = colMap[b.event]!;
      const { affectedRows } = await rawExecute(
        `UPDATE driver_navigation_sessions
            SET ${m.col} = COALESCE(${m.col}, NOW()),
                status = $1,
                "updatedAt" = NOW()
          WHERE "dispatchOrderId" = $2 AND "companyId" = $3
            AND status NOT IN ('ended', 'cancelled')`,
        [m.status, dispatchOrderId, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("لا توجد جلسة ملاحة نشطة لهذه المهمة");

      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: `fleet.dispatch.navigation_${b.event}`,
        entity: "driver_navigation_sessions", entityId: dispatchOrderId,
      }).catch((e) => logger.error(e, "navigation event emit failed"));

      res.json({ ok: true, status: m.status });
    } catch (err) {
      handleRouteError(err, res, "Navigation event error:");
    }
  },
);

transportPlanningRouter.post(
  "/transport/dispatch-orders/:id/navigation/complete",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const dispatchOrderId = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE driver_navigation_sessions
            SET status = 'ended',
                "endedAt" = NOW(),
                "updatedAt" = NOW()
          WHERE "dispatchOrderId" = $1 AND "companyId" = $2
            AND status NOT IN ('ended', 'cancelled')`,
        [dispatchOrderId, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("لا توجد جلسة ملاحة نشطة");

      // Stamp the driver's lastDutyEndedAt — drives the rest-constraint
      // engine on the next assignment.
      await rawExecute(
        `UPDATE fleet_drivers
            SET "lastDutyEndedAt" = NOW(), "updatedAt" = NOW()
           FROM transport_dispatch_orders d
          WHERE fleet_drivers.id = d."driverId"
            AND d.id = $1 AND d."companyId" = $2 AND fleet_drivers."companyId" = $2`,
        [dispatchOrderId, scope.companyId],
      );

      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.dispatch.navigation_ended",
        entity: "driver_navigation_sessions", entityId: dispatchOrderId,
      }).catch((e) => logger.error(e, "navigation complete event failed"));

      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Complete navigation error:");
    }
  },
);

transportPlanningRouter.get(
  "/transport/dispatch-orders/:id/navigation",
  authorize({ feature: "fleet.dispatch", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const dispatchOrderId = parseId(req.params.id, "id");
      const [session] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM driver_navigation_sessions
          WHERE "dispatchOrderId" = $1 AND "companyId" = $2
          ORDER BY id DESC LIMIT 1`,
        [dispatchOrderId, scope.companyId],
      );
      res.json(maskFields(req, { data: session ?? null }));
    } catch (err) {
      handleRouteError(err, res, "Get navigation session error:");
    }
  },
);

transportPlanningRouter.get(
  "/fleet/driver/me/navigation",
  authorize({ feature: "fleet.driver.me", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      // The driver self-service surface — find the active session for
      // this employee's driver record.
      const [session] = await rawQuery<Record<string, unknown>>(
        `SELECT s.*, d."bookingLineId",
                b."bookingNumber", b."transportServiceType",
                b."fromLocationText", b."toLocationText"
           FROM driver_navigation_sessions s
                JOIN transport_dispatch_orders d ON d.id = s."dispatchOrderId"
                JOIN transport_booking_lines bl  ON bl.id = d."bookingLineId" AND bl."deletedAt" IS NULL
                JOIN transport_bookings b        ON b.id = bl."bookingId" AND b."deletedAt" IS NULL
                JOIN fleet_drivers fd            ON fd.id = s."driverId" AND fd."deletedAt" IS NULL
          WHERE s."companyId" = $1
            AND fd."employeeId" = $2
            AND s.status NOT IN ('ended', 'cancelled')
          ORDER BY s."startedAt" DESC LIMIT 1`,
        [scope.companyId, scope.userId],
      );
      res.json(maskFields(req, { data: session ?? null }));
    } catch (err) {
      handleRouteError(err, res, "Driver-me navigation error:");
    }
  },
);

export default transportPlanningRouter;
