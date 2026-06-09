/**
 * Transport Route Patterns (#1812 Comment 4663005810 — cargo recurring).
 *
 * A route_pattern is a TEMPLATE for cargo trips that repeat on a
 * recurring schedule. Materialised into `transport_bookings` rows by
 * the daily cron, with bookingSource = "recurring_schedule" and
 * routePatternId pointing back to the template.
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
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
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

      // #1812 — input sanitization. The target shapes the bookingNumber
      // so we enforce ISO YYYY-MM-DD only (no full ISO timestamp).
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

      // #1812 — idempotency. The bookingNumber is deterministic from
      // (pattern, target_date), so a duplicate materialise (operator
      // double-click, cron retry, manual + scheduled) must return the
      // existing booking instead of creating a duplicate row that gets
      // billed twice.
      const bookingNumber = `RP-${pattern.patternCode}-${target.replace(/-/g, "")}`;
      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM transport_bookings
          WHERE "companyId" = $1 AND "routePatternId" = $2
            AND "requestedPickupDate" = $3 AND "deletedAt" IS NULL
          LIMIT 1`,
        [scope.companyId, id, target],
      );
      if (existing) {
        // Idempotent return — operator's double-click resolves to the
        // booking that the first click created. Status 200 (not 201)
        // signals "already existed, no new write".
        res.json({ data: { bookingId: existing.id, bookingNumber, alreadyExisted: true } });
        return;
      }

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
            "cargoWeight", "cargoUnit",
            status, "createdBy")
         VALUES ($1, $2, $3, 'recurring_schedule', 'cargo_load',
                 $4, 'cargo',
                 $5, $6,
                 $7, $8, $9, $10,
                 $11, $12,
                 $13, $14, $15, $16,
                 $17, $18, $19,
                 'draft', $20)`,
        [
          scope.companyId, scope.branchId ?? null, bookingNumber,
          id, pattern.defaultCustomerId ?? null, pattern.defaultContractId ?? null,
          pattern.fromLocationId ?? null, pattern.toLocationId ?? null,
          pattern.fromLocationText ?? null, pattern.toLocationText ?? null,
          pattern.fromLocationKind ?? null, pattern.toLocationKind ?? null,
          pattern.fromLat ?? null, pattern.fromLng ?? null,
          pattern.toLat ?? null, pattern.toLng ?? null,
          target, pattern.defaultCargoWeight ?? null, pattern.defaultCargoUnit ?? null,
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
