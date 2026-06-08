/**
 * Vehicle profile sub-resources (#1733 Issue Comment 7).
 *
 * Three CRUD surfaces hung off the vehicle:
 *
 *   /fleet/vehicles/:vehicleId/components            — engine, brakes, AC, ...
 *   /fleet/vehicles/:vehicleId/components/:id        — PATCH lifecycle
 *
 *   /fleet/vehicles/:vehicleId/driver-assignments    — primary / backup /
 *                                                       temporary history
 *   /fleet/vehicles/:vehicleId/driver-assignments/:id
 *
 *   /fleet/vehicles/:vehicleId/maintenance-schedules — preventive rules
 *   /fleet/vehicles/:vehicleId/maintenance-schedules/:id
 *
 * Tire CRUD already lives elsewhere; this PR extends the existing
 * fleet_tires schema with axleNumber/side/serialNumber/expectedLifeKm/
 * currentMileageKm/removalReason fields the rest of the audit asks for.
 *
 * Gating is via the existing `fleet.vehicles` feature (no new feature
 * keys needed — these are sub-resources of the vehicle).
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError,
  NotFoundError,
  ConflictError,
  ValidationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";

export const vehicleProfileRouter = Router();
vehicleProfileRouter.use(authMiddleware);

const COMPONENT_TYPES = [
  "engine", "transmission", "axle", "battery",
  "ac_unit", "cooling_unit", "hydraulic_system", "lift_gate", "crane",
  "box_or_bed", "trailer", "doors", "seats", "upholstery", "screens",
  "brakes", "suspension", "steering", "safety_system",
  "fuel_system", "electrical_system", "other",
] as const;

const COMPONENT_STATUSES = [
  "active", "serviceable", "needs_service", "replaced", "removed", "damaged",
] as const;

const ASSIGNMENT_TYPES = ["primary", "backup", "temporary"] as const;
const ASSIGNMENT_STATUSES = ["active", "ended", "cancelled"] as const;
const INTERVAL_TYPES = ["mileage", "hours", "days"] as const;

const createComponentSchema = z.object({
  componentType: z.enum(COMPONENT_TYPES),
  componentSubtype: z.string().max(128).optional(),
  serialNumber: z.string().max(128).optional(),
  manufacturer: z.string().max(128).optional(),
  model: z.string().max(128).optional(),
  installationDate: z.string().optional(),
  installationMileageKm: z.coerce.number().int().optional(),
  installationHours: z.coerce.number().optional(),
  expectedLifeKm: z.coerce.number().int().optional(),
  expectedLifeHours: z.coerce.number().optional(),
  expectedLifeDays: z.coerce.number().int().optional(),
  lastServiceDate: z.string().optional(),
  lastServiceMileageKm: z.coerce.number().int().optional(),
  nextServiceDate: z.string().optional(),
  nextServiceMileageKm: z.coerce.number().int().optional(),
  status: z.enum(COMPONENT_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
});

const updateComponentSchema = createComponentSchema.partial().extend({
  removalDate: z.string().optional(),
  removalReason: z.string().max(500).optional(),
});

const createAssignmentSchema = z.object({
  driverId: z.coerce.number().int().positive(),
  assignmentType: z.enum(ASSIGNMENT_TYPES),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  reason: z.string().max(500).optional(),
});

const updateAssignmentSchema = z.object({
  endDate: z.string().optional(),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  reason: z.string().max(500).optional(),
});

const createScheduleSchema = z.object({
  scheduleName: z.string().min(1).max(255),
  intervalType: z.enum(INTERVAL_TYPES),
  intervalValue: z.coerce.number().int().positive(),
  componentId: z.coerce.number().int().positive().optional(),
  vehicleType: z.string().max(32).optional(),
  nextDueDate: z.string().optional(),
  nextDueKm: z.coerce.number().int().optional(),
  nextDueHours: z.coerce.number().optional(),
  notes: z.string().max(1000).optional(),
});

const updateScheduleSchema = createScheduleSchema.partial().extend({
  isActive: z.boolean().optional(),
  lastTriggeredAt: z.string().optional(),
  lastTriggeredKm: z.coerce.number().int().optional(),
  lastTriggeredHours: z.coerce.number().optional(),
});

async function assertVehicleBelongsToTenant(vehicleId: number, companyId: number) {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT id FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [vehicleId, companyId],
  );
  if (!row) throw new NotFoundError("المركبة غير موجودة");
}

// ─── Components ───────────────────────────────────────────────────────
vehicleProfileRouter.get(
  "/fleet/vehicles/:vehicleId/components",
  authorize({ feature: "fleet.vehicles", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      await assertVehicleBelongsToTenant(vehicleId, scope.companyId);
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM vehicle_components
          WHERE "vehicleId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          ORDER BY "componentType", "installationDate" DESC NULLS LAST`,
        [vehicleId, scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List vehicle components error:");
    }
  },
);

vehicleProfileRouter.post(
  "/fleet/vehicles/:vehicleId/components",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      await assertVehicleBelongsToTenant(vehicleId, scope.companyId);
      const b = zodParse(createComponentSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO vehicle_components (
           "companyId", "vehicleId", "componentType", "componentSubtype",
           "serialNumber", manufacturer, model,
           "installationDate", "installationMileageKm", "installationHours",
           "expectedLifeKm", "expectedLifeHours", "expectedLifeDays",
           "lastServiceDate", "lastServiceMileageKm",
           "nextServiceDate", "nextServiceMileageKm",
           status, notes, "createdBy"
         ) VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12,$13,
                   $14,$15, $16,$17, $18,$19,$20)`,
        [
          scope.companyId, vehicleId, b.componentType, b.componentSubtype ?? null,
          b.serialNumber ?? null, b.manufacturer ?? null, b.model ?? null,
          b.installationDate ?? null, b.installationMileageKm ?? null, b.installationHours ?? null,
          b.expectedLifeKm ?? null, b.expectedLifeHours ?? null, b.expectedLifeDays ?? null,
          b.lastServiceDate ?? null, b.lastServiceMileageKm ?? null,
          b.nextServiceDate ?? null, b.nextServiceMileageKm ?? null,
          b.status ?? "active", b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "vehicle_components");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "vehicle_components", entityId: insertId,
        after: { vehicleId, componentType: b.componentType },
      }).catch((e) => logger.error(e, "vehicle component audit failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create vehicle component error:");
    }
  },
);

vehicleProfileRouter.patch(
  "/fleet/vehicles/:vehicleId/components/:id",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateComponentSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        componentSubtype: '"componentSubtype"',
        serialNumber: '"serialNumber"',
        manufacturer: "manufacturer",
        model: "model",
        installationDate: '"installationDate"',
        installationMileageKm: '"installationMileageKm"',
        installationHours: '"installationHours"',
        expectedLifeKm: '"expectedLifeKm"',
        expectedLifeHours: '"expectedLifeHours"',
        expectedLifeDays: '"expectedLifeDays"',
        lastServiceDate: '"lastServiceDate"',
        lastServiceMileageKm: '"lastServiceMileageKm"',
        nextServiceDate: '"nextServiceDate"',
        nextServiceMileageKm: '"nextServiceMileageKm"',
        status: "status",
        removalDate: '"removalDate"',
        removalReason: '"removalReason"',
        notes: "notes",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(v);
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, vehicleId, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE vehicle_components SET ${sets.join(", ")}
          WHERE id = $${p++} AND "vehicleId" = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("المكوّن غير موجود");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "vehicle_components", entityId: id,
        after: { vehicleId, fields: Object.keys(b) },
      }).catch((e) => logger.error(e, "vehicle component audit failed"));
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update vehicle component error:");
    }
  },
);

// ─── Driver assignments (history) ─────────────────────────────────────
vehicleProfileRouter.get(
  "/fleet/vehicles/:vehicleId/driver-assignments",
  authorize({ feature: "fleet.vehicles", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      await assertVehicleBelongsToTenant(vehicleId, scope.companyId);
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT a.*, d.name AS "driverName", d."licenseClass"
           FROM vehicle_driver_assignments a
           LEFT JOIN fleet_drivers d ON d.id = a."driverId" AND d."companyId" = a."companyId"
          WHERE a."vehicleId" = $1 AND a."companyId" = $2
          ORDER BY a.status = 'active' DESC, a."startDate" DESC`,
        [vehicleId, scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List vehicle driver assignments error:");
    }
  },
);

vehicleProfileRouter.post(
  "/fleet/vehicles/:vehicleId/driver-assignments",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      await assertVehicleBelongsToTenant(vehicleId, scope.companyId);
      const b = zodParse(createAssignmentSchema.safeParse(req.body));

      // Validate driver belongs to the tenant before insert.
      const [drv] = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.driverId, scope.companyId],
      );
      if (!drv) throw new NotFoundError("السائق غير موجود");

      // For primary assignments: the uq_vehicle_active_primary partial
      // unique enforces only-one-active-primary at the DB level. We end
      // any existing active primary BEFORE the insert so the constraint
      // doesn't fire as a 409 — and the historical row stays for audit.
      if (b.assignmentType === "primary") {
        await rawExecute(
          `UPDATE vehicle_driver_assignments
              SET status = 'ended', "endDate" = COALESCE("endDate", CURRENT_DATE),
                  "updatedAt" = NOW()
            WHERE "vehicleId" = $1 AND "companyId" = $2
              AND status = 'active' AND "assignmentType" = 'primary'`,
          [vehicleId, scope.companyId],
        );
      }

      const { insertId } = await rawExecute(
        `INSERT INTO vehicle_driver_assignments
           ("companyId", "branchId", "vehicleId", "driverId",
            "assignmentType", "startDate", "endDate", reason, "createdBy")
         VALUES ($1,$2,$3,$4, $5,$6,$7,$8,$9)`,
        [scope.companyId, scope.branchId ?? null, vehicleId, b.driverId,
         b.assignmentType, b.startDate, b.endDate ?? null, b.reason ?? null, scope.userId],
      );
      assertInsert(insertId, "vehicle_driver_assignments");
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.vehicle.driver_assignment_created",
        entity: "vehicle_driver_assignments", entityId: insertId,
        details: JSON.stringify({
          vehicleId, driverId: b.driverId, assignmentType: b.assignmentType,
        }),
      }).catch((e) => logger.error(e, "assignment event failed"));
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "vehicle_driver_assignments", entityId: insertId,
        after: { vehicleId, driverId: b.driverId, assignmentType: b.assignmentType },
      }).catch((e) => logger.error(e, "assignment audit failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create vehicle driver assignment error:");
    }
  },
);

vehicleProfileRouter.patch(
  "/fleet/vehicles/:vehicleId/driver-assignments/:id",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateAssignmentSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        endDate: '"endDate"',
        status: "status",
        reason: "reason",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(v);
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, vehicleId, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE vehicle_driver_assignments SET ${sets.join(", ")}
          WHERE id = $${p++} AND "vehicleId" = $${p++} AND "companyId" = $${p++}`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("الإسناد غير موجود");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "vehicle_driver_assignments", entityId: id,
        after: { vehicleId, fields: Object.keys(b) },
      }).catch((e) => logger.error(e, "assignment audit failed"));
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update vehicle driver assignment error:");
    }
  },
);

// ─── Preventive maintenance schedules ─────────────────────────────────
vehicleProfileRouter.get(
  "/fleet/vehicles/:vehicleId/maintenance-schedules",
  authorize({ feature: "fleet.vehicles", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      await assertVehicleBelongsToTenant(vehicleId, scope.companyId);
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM vehicle_maintenance_schedules
          WHERE "companyId" = $1
            AND ("vehicleId" = $2 OR "vehicleType" = (SELECT "vehicleType" FROM fleet_vehicles WHERE id = $2))
            AND "deletedAt" IS NULL
          ORDER BY "isActive" DESC, "nextDueDate" ASC NULLS LAST`,
        [scope.companyId, vehicleId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List maintenance schedules error:");
    }
  },
);

vehicleProfileRouter.post(
  "/fleet/vehicles/:vehicleId/maintenance-schedules",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId, "vehicleId");
      await assertVehicleBelongsToTenant(vehicleId, scope.companyId);
      const b = zodParse(createScheduleSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO vehicle_maintenance_schedules
           ("companyId", "vehicleId", "vehicleType", "componentId",
            "scheduleName", "intervalType", "intervalValue",
            "nextDueDate", "nextDueKm", "nextDueHours",
            notes, "createdBy")
         VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12)`,
        [
          scope.companyId, vehicleId, b.vehicleType ?? null, b.componentId ?? null,
          b.scheduleName, b.intervalType, b.intervalValue,
          b.nextDueDate ?? null, b.nextDueKm ?? null, b.nextDueHours ?? null,
          b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "vehicle_maintenance_schedules");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "vehicle_maintenance_schedules", entityId: insertId,
        after: { vehicleId, scheduleName: b.scheduleName, intervalType: b.intervalType },
      }).catch((e) => logger.error(e, "maintenance schedule audit failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create maintenance schedule error:");
    }
  },
);

vehicleProfileRouter.patch(
  "/fleet/vehicles/:vehicleId/maintenance-schedules/:id",
  authorize({ feature: "fleet.vehicles", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateScheduleSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        scheduleName: '"scheduleName"',
        intervalType: '"intervalType"',
        intervalValue: '"intervalValue"',
        componentId: '"componentId"',
        vehicleType: '"vehicleType"',
        nextDueDate: '"nextDueDate"',
        nextDueKm: '"nextDueKm"',
        nextDueHours: '"nextDueHours"',
        isActive: '"isActive"',
        lastTriggeredAt: '"lastTriggeredAt"',
        lastTriggeredKm: '"lastTriggeredKm"',
        lastTriggeredHours: '"lastTriggeredHours"',
        notes: "notes",
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
        `UPDATE vehicle_maintenance_schedules SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("الجدولة غير موجودة");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "vehicle_maintenance_schedules", entityId: id,
        after: { fields: Object.keys(b) },
      }).catch((e) => logger.error(e, "maintenance schedule audit failed"));
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update maintenance schedule error:");
    }
  },
);

export default vehicleProfileRouter;
