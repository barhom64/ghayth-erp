/**
 * Transport Route Patterns (#1812 Comment 4663005810 — cargo recurring).
 *
 * A route_pattern is a TEMPLATE for cargo trips that repeat on a
 * recurring schedule. Materialised into `transport_bookings` rows by
 * either:
 *   1. the dispatcher firing /materialise (one day) or /materialise-range
 *      (a date window) from the SPA, or
 *   2. the `materialise_due_route_patterns` cron at 06:30 Riyadh —
 *      gated on transport_planning_settings.autoMaterialiseEnabled
 *      (default FALSE; companies opt in explicitly per #2079 TA-T18-02).
 * Either path emits bookings with bookingSource = "recurring_schedule"
 * and routePatternId pointing back to the template.
 *
 * Endpoints:
 *
 *   GET    /transport/route-patterns        — list (filter by status, day)
 *   POST   /transport/route-patterns        — create
 *   GET    /transport/route-patterns/:id    — detail
 *   PATCH  /transport/route-patterns/:id    — update
 *   DELETE /transport/route-patterns/:id    — soft delete
 *   POST   /transport/route-patterns/:id/materialise — manual fire
 *                                              (cron uses the same path)
 *
 * Gating: same as bookings (`fleet.bookings` feature).
 *
 * tripFamily semantics: every materialised booking from a pattern is
 * `tripFamily = "cargo"` by definition. Passenger recurring schedules
 * (e.g. weekly umrah groups) are NOT modelled here — they flow through
 * `umrah_groups` + the umrah-group picker.
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError, NotFoundError, ValidationError, parseId, zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, todayISO, currentDateInTz } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";

export const transportRoutePatternsRouter = Router();
transportRoutePatternsRouter.use(authMiddleware);

// ── Day-of-week mask helpers ──────────────────────────────────────────
// Bit 0 = Sunday, bit 1 = Monday, ... bit 6 = Saturday.
// JavaScript Date.getDay() returns 0..6 matching this convention.
export function dayMaskIncludes(mask: number, dayOfWeek: number): boolean {
  return (mask & (1 << dayOfWeek)) !== 0;
}

// ── Schemas ───────────────────────────────────────────────────────────

const createPatternSchema = z.object({
  patternCode: z.string().min(1).max(32),
  name: z.string().min(1).max(255),
  // 0..127 (7-bit mask)
  daysOfWeekMask: z.coerce.number().int().min(0).max(127),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeFrom: z.string().optional(),
  activeUntil: z.string().optional(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  fromLocationText: z.string().max(255).optional(),
  toLocationText: z.string().max(255).optional(),
  fromLocationKind: z.string().max(32).optional(),
  toLocationKind: z.string().max(32).optional(),
  fromLat: z.coerce.number().min(-90).max(90).optional(),
  fromLng: z.coerce.number().min(-180).max(180).optional(),
  toLat: z.coerce.number().min(-90).max(90).optional(),
  toLng: z.coerce.number().min(-180).max(180).optional(),
  defaultVehicleClass: z.string().max(32).optional(),
  defaultLicenseClass: z.string().max(32).optional(),
  defaultCustomerId: z.coerce.number().int().positive().optional(),
  defaultContractId: z.coerce.number().int().positive().optional(),
  defaultCargoWeight: z.coerce.number().optional(),
  defaultCargoUnit: z.string().max(32).optional(),
  // operationalWaypoints is a jsonb array — accept any shape; the
  // SPA renders it via a typed editor but the storage layer stays open.
  operationalWaypoints: z.array(z.record(z.unknown())).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  notes: z.string().max(2000).optional(),
});

const updatePatternSchema = createPatternSchema.partial();

// ── List ─────────────────────────────────────────────────────────────

transportRoutePatternsRouter.get(
  "/transport/route-patterns",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const status = (req.query.status as string | undefined) ?? "active";
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "patternCode", name, "daysOfWeekMask", "departureTime",
                "activeFrom", "activeUntil",
                "fromLocationText", "toLocationText",
                "fromLocationKind", "toLocationKind",
                "defaultVehicleClass", "defaultLicenseClass",
                "defaultCustomerId", "defaultContractId",
                "defaultCargoWeight", "defaultCargoUnit",
                "operationalWaypoints",
                status, notes, "createdAt", "updatedAt"
           FROM transport_route_patterns
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
            AND ($2 = 'all' OR status = $2)
          ORDER BY "patternCode" ASC LIMIT 500`,
        [scope.companyId, status],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List route patterns error:");
    }
  },
);

// ── Get one ──────────────────────────────────────────────────────────

transportRoutePatternsRouter.get(
  "/transport/route-patterns/:id",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_route_patterns
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("القالب غير موجود");
      // Count of bookings materialised from this pattern (audit + UX).
      const [{ count }] = await rawQuery<{ count: string }>(
        `SELECT COUNT(*) AS count
           FROM transport_bookings
          WHERE "companyId" = $1 AND "routePatternId" = $2 AND "deletedAt" IS NULL`,
        [scope.companyId, id],
      );
      res.json(maskFields(req, { data: { ...row, materialisedBookingsCount: Number(count) } }));
    } catch (err) {
      handleRouteError(err, res, "Get route pattern error:");
    }
  },
);

// ── Create ───────────────────────────────────────────────────────────

transportRoutePatternsRouter.post(
  "/transport/route-patterns",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createPatternSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO transport_route_patterns
           ("companyId", "branchId", "patternCode", name,
            "daysOfWeekMask", "departureTime", "activeFrom", "activeUntil",
            "fromLocationId", "toLocationId",
            "fromLocationText", "toLocationText",
            "fromLocationKind", "toLocationKind",
            "fromLat", "fromLng", "toLat", "toLng",
            "defaultVehicleClass", "defaultLicenseClass",
            "defaultCustomerId", "defaultContractId",
            "defaultCargoWeight", "defaultCargoUnit",
            "operationalWaypoints", status, notes, "createdBy")
         VALUES ($1,$2,$3,$4, $5,$6,$7,$8, $9,$10, $11,$12,
                 $13,$14, $15,$16,$17,$18,
                 $19,$20, $21,$22, $23,$24,
                 $25, $26, $27, $28)`,
        [
          scope.companyId, scope.branchId ?? null, b.patternCode, b.name,
          b.daysOfWeekMask, b.departureTime ?? null,
          b.activeFrom ?? null, b.activeUntil ?? null,
          b.fromLocationId ?? null, b.toLocationId ?? null,
          b.fromLocationText ?? null, b.toLocationText ?? null,
          b.fromLocationKind ?? null, b.toLocationKind ?? null,
          b.fromLat ?? null, b.fromLng ?? null,
          b.toLat ?? null, b.toLng ?? null,
          b.defaultVehicleClass ?? null, b.defaultLicenseClass ?? null,
          b.defaultCustomerId ?? null, b.defaultContractId ?? null,
          b.defaultCargoWeight ?? null, b.defaultCargoUnit ?? null,
          b.operationalWaypoints ? JSON.stringify(b.operationalWaypoints) : null,
          b.status ?? "active", b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "transport_route_patterns");
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.route_pattern.created", entity: "transport_route_patterns", entityId: insertId,
        details: JSON.stringify({ patternCode: b.patternCode, daysOfWeekMask: b.daysOfWeekMask }),
      }).catch((e) => logger.error(e, "route_pattern event failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create route pattern error:");
    }
  },
);

// ── Manual materialise (cron uses the same body) ─────────────────────
// Creates a transport_bookings row from this pattern for the given
// targetDate (or today). Useful for ops to "fire now" instead of
// waiting for tomorrow's cron.
transportRoutePatternsRouter.post(
  "/transport/route-patterns/:id/materialise",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const target = (req.body?.targetDate as string | undefined) ?? todayISO();

      // #1812 — input sanitization (bookingNumber is built from target, enforce YYYY-MM-DD).
      if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
        throw new ValidationError("targetDate يجب أن يكون بصيغة YYYY-MM-DD", {
          field: "targetDate", fix: "أرسل تاريخاً بصيغة 2026-06-09",
        });
      }

      const [pattern] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_route_patterns
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'active'`,
        [id, scope.companyId],
      );
      if (!pattern) throw new NotFoundError("القالب غير موجود أو غير نشط");

      // #1812 — idempotency: deterministic bookingNumber from (pattern, date).
      const bookingNumber = `RP-${pattern.patternCode}-${target.replace(/-/g, "")}`;
      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM transport_bookings
          WHERE "companyId" = $1 AND "routePatternId" = $2
            AND "requestedPickupDate" = $3 AND "deletedAt" IS NULL
          LIMIT 1`,
        [scope.companyId, id, target],
      );
      if (existing) {
        res.json({ data: { bookingId: existing.id, bookingNumber, alreadyExisted: true } });
        return;
      }

      // نقاط التشغيل القالبية تنتقل للحجز في cargoOperationalMetadata.waypoints
      // (تظهر في تنفيذ الرحلة). null إن لا نقاط — لا بيانات فارغة.
      const waypointsMeta = Array.isArray(pattern.operationalWaypoints) && pattern.operationalWaypoints.length
        ? JSON.stringify({ waypoints: pattern.operationalWaypoints })
        : null;
      const { insertId } = await rawExecute(
        `INSERT INTO transport_bookings
           ("companyId", "branchId", "bookingNumber", "bookingSource", "transportServiceType",
            "routePatternId", "tripFamily",
            "customerId", "contractId",
            "fromLocationId", "toLocationId",
            "fromLocationText", "toLocationText",
            "fromLocationKind", "toLocationKind",
            "fromLat", "fromLng", "toLat", "toLng",
            "requestedPickupDate",
            "cargoWeight", "cargoUnit", "cargoOperationalMetadata",
            status, "createdBy")
         VALUES ($1, $2, $3, 'recurring_schedule', 'cargo_load',
                 $4, 'cargo',
                 $5, $6,
                 $7, $8, $9, $10,
                 $11, $12,
                 $13, $14, $15, $16,
                 $17, $18, $19, $20,
                 'draft', $21)`,
        [
          scope.companyId, scope.branchId ?? null, bookingNumber,
          id, pattern.defaultCustomerId ?? null, pattern.defaultContractId ?? null,
          pattern.fromLocationId ?? null, pattern.toLocationId ?? null,
          pattern.fromLocationText ?? null, pattern.toLocationText ?? null,
          pattern.fromLocationKind ?? null, pattern.toLocationKind ?? null,
          pattern.fromLat ?? null, pattern.fromLng ?? null,
          pattern.toLat ?? null, pattern.toLng ?? null,
          target, pattern.defaultCargoWeight ?? null, pattern.defaultCargoUnit ?? null, waypointsMeta,
          scope.userId,
        ],
      );
      assertInsert(insertId, "transport_bookings");
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.booking.created", entity: "transport_bookings", entityId: insertId,
        details: JSON.stringify({
          bookingNumber, serviceType: "cargo_load",
          routePatternId: id, source: "recurring_schedule",
        }),
      }).catch((e) => logger.error(e, "booking event failed"));
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "materialise", entity: "transport_route_patterns", entityId: id,
        after: { bookingNumber, targetDate: target },
      }).catch((e) => logger.error(e, "route_pattern materialise audit failed"));
      res.status(201).json({ data: { bookingId: insertId, bookingNumber } });
    } catch (err) {
      handleRouteError(err, res, "Materialise route pattern error:");
    }
  },
);

// ── Bulk materialise (TR-017 / A-03) ─────────────────────────────────
// Walks a date window and creates one booking for every day inside it
// whose dayOfWeek matches the pattern's `daysOfWeekMask` AND falls
// inside (activeFrom..activeUntil). The single-day /materialise route
// above stays — this one is the "give me the next N occurrences"
// shortcut the dispatcher uses when onboarding a new pattern or
// recovering from a missed cron window. A-03 acceptance test:
//   weekly pattern + 4-week window = 4 independent booking rows.
//
// Idempotency: bookings are keyed `RP-{patternCode}-{YYYYMMDD}` and
// `(companyId, bookingNumber)` is the UNIQUE constraint (migration 266).
// Re-firing the same window therefore reports `existed` for any date
// that already has its row, NEVER creates duplicates.
//
// Safety cap: at most 90 calendar days per request — keeps a typo
// like `toDate = 2099-12-31` from spawning thousands of rows.
const MATERIALISE_RANGE_DAY_CAP = 90;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const materialiseRangeSchema = z.object({
  fromDate: z.string().regex(ISO_DATE, "fromDate must be YYYY-MM-DD"),
  // Either `toDate` (inclusive) OR `count` (number of MATCHING days to
  // create); the handler walks forward until that many matching days
  // have been emitted.
  toDate: z.string().regex(ISO_DATE).optional(),
  count: z.coerce.number().int().min(1).max(MATERIALISE_RANGE_DAY_CAP).optional(),
}).refine(
  (b) => b.toDate != null || b.count != null,
  { message: "Either toDate or count is required", path: ["toDate"] },
);

// Walk `fromDate` forward in 1-day steps, yielding each ISO date that
// satisfies the pattern's day-of-week mask + active window. Stops at
// either `toDate` (inclusive) or after `count` matches — whichever
// comes first. Always bounded by MATERIALISE_RANGE_DAY_CAP calendar
// days regardless of caller intent.
// node-postgres default-parses DATE columns to JS Date objects, so
// the activeFrom/activeUntil readings from `transport_route_patterns`
// arrive here as Dates — not the ISO strings the original signature
// implied. Defensive coercion: accept either shape, normalise to a
// `YYYY-MM-DD` string before the date-string template that the rest
// of the generator depends on. Without this the activeFrom/Until
// gates degraded to no-ops (NaN compares as `false` against both
// `<` and `>`), letting the generator emit dates outside the
// pattern's active window.
function toIsoDate(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v.slice(0, 10);
}

function* matchingDatesInRange(
  fromDate: string,
  toDate: string | undefined,
  count: number | undefined,
  daysOfWeekMask: number,
  activeFrom: string | Date | null,
  activeUntil: string | Date | null,
): Generator<string> {
  const start = new Date(`${fromDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return;
  const endLimit = toDate ? new Date(`${toDate}T00:00:00Z`).getTime() : Infinity;
  const activeFromIso = toIsoDate(activeFrom);
  const activeUntilIso = toIsoDate(activeUntil);
  const activeFromMs = activeFromIso ? new Date(`${activeFromIso}T00:00:00Z`).getTime() : -Infinity;
  const activeUntilMs = activeUntilIso ? new Date(`${activeUntilIso}T00:00:00Z`).getTime() : Infinity;
  let emitted = 0;
  for (let i = 0; i < MATERIALISE_RANGE_DAY_CAP; i++) {
    const t = start.getTime() + i * 86400000;
    if (t > endLimit) return;
    if (t < activeFromMs || t > activeUntilMs) continue;
    // Day-of-week computed in Asia/Riyadh so the mask convention
    // (bit 0 = Sunday Riyadh local) lines up with what dispatchers
    // expect when they configure a pattern.
    const localDateStr = currentDateInTz("Asia/Riyadh", new Date(t));
    const dayOfWeek = new Date(`${localDateStr}T12:00:00+03:00`).getUTCDay();
    if (((daysOfWeekMask >> dayOfWeek) & 1) === 0) continue;
    yield localDateStr;
    emitted++;
    if (count != null && emitted >= count) return;
  }
}

transportRoutePatternsRouter.post(
  "/transport/route-patterns/:id/materialise-range",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(materialiseRangeSchema.safeParse(req.body));
      const [pattern] = await rawQuery<{
        id: number; patternCode: string;
        daysOfWeekMask: number;
        activeFrom: string | Date | null; activeUntil: string | Date | null;
        defaultCustomerId: number | null; defaultContractId: number | null;
        fromLocationId: number | null; toLocationId: number | null;
        fromLocationText: string | null; toLocationText: string | null;
        fromLocationKind: string | null; toLocationKind: string | null;
        fromLat: number | null; fromLng: number | null;
        toLat: number | null; toLng: number | null;
        defaultCargoWeight: number | null; defaultCargoUnit: string | null;
        operationalWaypoints: unknown;
      }>(
        `SELECT id, "patternCode", "daysOfWeekMask",
                "activeFrom", "activeUntil",
                "defaultCustomerId", "defaultContractId",
                "fromLocationId", "toLocationId",
                "fromLocationText", "toLocationText",
                "fromLocationKind", "toLocationKind",
                "fromLat", "fromLng", "toLat", "toLng",
                "defaultCargoWeight", "defaultCargoUnit", "operationalWaypoints"
           FROM transport_route_patterns
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status = 'active'`,
        [id, scope.companyId],
      );
      if (!pattern) throw new NotFoundError("القالب غير موجود أو غير نشط");

      // نقاط التشغيل القالبية (ثابتة للقالب) تُحقن في كل حجز مُولَّد.
      const waypointsMeta = Array.isArray(pattern.operationalWaypoints) && pattern.operationalWaypoints.length
        ? JSON.stringify({ waypoints: pattern.operationalWaypoints })
        : null;

      const created: Array<{ date: string; bookingId: number; bookingNumber: string }> = [];
      const skipped: Array<{ date: string; reason: "exists" }> = [];

      for (const date of matchingDatesInRange(
        b.fromDate, b.toDate, b.count,
        pattern.daysOfWeekMask,
        pattern.activeFrom, pattern.activeUntil,
      )) {
        const bookingNumber = `RP-${pattern.patternCode}-${date.replace(/-/g, "")}`;
        // ON CONFLICT against the (companyId, bookingNumber) UNIQUE
        // constraint = the natural idempotency key. Re-firing the
        // same range never creates duplicates.
        const rows = await rawQuery<{ id: number; existed: boolean }>(
          `WITH ins AS (
             INSERT INTO transport_bookings
               ("companyId", "branchId", "bookingNumber", "bookingSource", "transportServiceType",
                "routePatternId", "tripFamily",
                "customerId", "contractId",
                "fromLocationId", "toLocationId",
                "fromLocationText", "toLocationText",
                "fromLocationKind", "toLocationKind",
                "fromLat", "fromLng", "toLat", "toLng",
                "requestedPickupDate",
                "cargoWeight", "cargoUnit", "cargoOperationalMetadata",
                status, "createdBy")
             VALUES ($1, $2, $3, 'recurring_schedule', 'cargo_load',
                     $4, 'cargo',
                     $5, $6,
                     $7, $8, $9, $10,
                     $11, $12,
                     $13, $14, $15, $16,
                     $17, $18, $19, $20,
                     'draft', $21)
             ON CONFLICT ("companyId", "bookingNumber") DO NOTHING
             RETURNING id, FALSE AS existed
           )
           SELECT id, existed FROM ins
           UNION ALL
           SELECT id, TRUE AS existed
             FROM transport_bookings
            WHERE "companyId" = $1 AND "bookingNumber" = $3
              AND "deletedAt" IS NULL
              AND NOT EXISTS (SELECT 1 FROM ins)
           LIMIT 1`,
          [
            scope.companyId, scope.branchId ?? null, bookingNumber,
            id, pattern.defaultCustomerId, pattern.defaultContractId,
            pattern.fromLocationId, pattern.toLocationId,
            pattern.fromLocationText, pattern.toLocationText,
            pattern.fromLocationKind, pattern.toLocationKind,
            pattern.fromLat, pattern.fromLng,
            pattern.toLat, pattern.toLng,
            date, pattern.defaultCargoWeight, pattern.defaultCargoUnit, waypointsMeta,
            scope.userId,
          ],
        );
        const row = rows[0];
        if (!row) continue;
        if (row.existed) {
          skipped.push({ date, reason: "exists" });
        } else {
          created.push({ date, bookingId: row.id, bookingNumber });
        }
      }

      // ONE audit row per fire so the dispatcher can answer "who
      // materialised when". Per-booking creation events are emitted
      // by the existing booking.created flow inside the single-day
      // /materialise; we do NOT emit them per-row here because a
      // 90-day fire would flood the bus — the bulk audit + the
      // bookings list are the trail.
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "materialise_range", entity: "transport_route_patterns", entityId: id,
        after: {
          fromDate: b.fromDate, toDate: b.toDate, count: b.count,
          createdCount: created.length, skippedCount: skipped.length,
        },
      }).catch((e) => logger.error(e, "route_pattern materialise_range audit failed"));

      res.status(201).json({
        data: {
          patternId: id,
          patternCode: pattern.patternCode,
          created,
          skipped,
          totalCreated: created.length,
          totalSkipped: skipped.length,
        },
      });
    } catch (err) {
      handleRouteError(err, res, "Materialise route pattern range error:");
    }
  },
);

// ── Update + soft delete ─────────────────────────────────────────────

transportRoutePatternsRouter.patch(
  "/transport/route-patterns/:id",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updatePatternSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        patternCode: '"patternCode"', name: "name",
        daysOfWeekMask: '"daysOfWeekMask"', departureTime: '"departureTime"',
        activeFrom: '"activeFrom"', activeUntil: '"activeUntil"',
        fromLocationId: '"fromLocationId"', toLocationId: '"toLocationId"',
        fromLocationText: '"fromLocationText"', toLocationText: '"toLocationText"',
        fromLocationKind: '"fromLocationKind"', toLocationKind: '"toLocationKind"',
        fromLat: '"fromLat"', fromLng: '"fromLng"', toLat: '"toLat"', toLng: '"toLng"',
        defaultVehicleClass: '"defaultVehicleClass"', defaultLicenseClass: '"defaultLicenseClass"',
        defaultCustomerId: '"defaultCustomerId"', defaultContractId: '"defaultContractId"',
        defaultCargoWeight: '"defaultCargoWeight"', defaultCargoUnit: '"defaultCargoUnit"',
        operationalWaypoints: '"operationalWaypoints"',
        status: "status", notes: "notes",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(k === "operationalWaypoints" ? JSON.stringify(v) : v);
        }
      }
      if (sets.length === 0) {
        res.json({ data: { id, unchanged: true } });
        return;
      }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE transport_route_patterns SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("القالب غير موجود");
      res.json({ data: { id, affected: affectedRows } });
    } catch (err) {
      handleRouteError(err, res, "Update route pattern error:");
    }
  },
);

transportRoutePatternsRouter.delete(
  "/transport/route-patterns/:id",
  authorize({ feature: "fleet.bookings", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE transport_route_patterns
            SET "deletedAt" = NOW(), status = 'archived'
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("القالب غير موجود");
      res.json({ data: { id, deleted: true } });
    } catch (err) {
      handleRouteError(err, res, "Delete route pattern error:");
    }
  },
);
