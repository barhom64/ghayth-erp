import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { haversineKm } from "../lib/algorithms.js";
import { createAuditLog, createNotification, emitEvent } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { eventBus } from "../lib/eventBus.js";
import { getVehicleStatusImpact } from "../lib/impactPreview.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { registerObligation, markObligationMet, cancelObligation } from "../lib/obligationsEngine.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { fleetEngine } from "../lib/engines/index.js";
import { z } from "zod";

// ─── Zod schemas for POST route body validation ─────────────────────────────
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
});

const createDriverSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  licenseNumber: z.string().min(1),
  licenseExpiry: z.string().optional(),
  licenseType: z.string().optional(),
  employeeId: z.coerce.number().optional(),
  status: z.string().optional(),
});

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
  status: z.string().optional(),
});

const createFuelLogSchema = z.object({
  vehicleId: z.coerce.number().optional(),
  vehiclePlate: z.string().optional(),
  liters: z.coerce.number().positive("كمية الوقود يجب أن تكون أكبر من صفر"),
  driverId: z.coerce.number().optional(),
  costPerLiter: z.coerce.number().optional(),
  fuelDate: z.string().optional(),
  mileageAtFuel: z.coerce.number().optional(),
  stationName: z.string().optional(),
  fuelType: z.string().optional(),
});

const createInsuranceSchema = z.object({
  vehicleId: z.coerce.number({ required_error: "المركبة مطلوبة" }),
  provider: z.string().min(1, "شركة التأمين مطلوبة"),
  startDate: z.string().min(1, "تاريخ بداية الوثيقة مطلوب"),
  endDate: z.string().min(1, "تاريخ انتهاء الوثيقة مطلوب"),
  type: z.string().optional(),
  policyNumber: z.string().optional(),
  premium: z.coerce.number().optional(),
  coverageAmount: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const router = Router();
router.use(authMiddleware);

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

router.get("/vehicles", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, search } = req.query as any;
    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['v."plateNumber"', 'v.make', 'v.model']; }
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'v."companyId"', branchColumn: 'v."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND v.status = $${paramIdx}`; params.push(status); paramIdx++; }
    const rows = await rawQuery<any>(`SELECT v.*, d.name AS "driverName", (SELECT COUNT(*) FROM gov_integration_links gl WHERE gl."entityType" = 'vehicle' AND gl."entityId" = v.id AND gl."companyId" = v."companyId")::int AS "govLinkCount", (SELECT MAX(fi."endDate") FROM fleet_insurance fi WHERE fi."vehicleId" = v.id AND fi."companyId" = v."companyId" AND fi."deletedAt" IS NULL) AS "insuranceExpiry" FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id = v."assignedDriverId" AND d."deletedAt" IS NULL WHERE ${where} AND v."deletedAt" IS NULL ORDER BY v.id DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet vehicles error:"); }
});

router.post("/vehicles", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createVehicleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

    const plateNumber = b.plateNumber.trim();
    if (b.year !== undefined && b.year !== null) {
      const yr = Number(b.year);
      const currentYear = new Date().getFullYear();
      if (!Number.isFinite(yr) || yr < 1950 || yr > currentYear + 1) {
        throw new ValidationError(`السنة غير صالحة — يجب أن تكون بين 1950 و${currentYear + 1}`, { field: "year", fix: "أدخل سنة صنع المركبة بصيغة صحيحة" });
      }
    }

    const [existingVehicle] = await rawQuery<any>(
      `SELECT id FROM fleet_vehicles WHERE "plateNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [plateNumber, scope.companyId]
    );
    if (existingVehicle) {
      throw new ConflictError("رقم اللوحة مسجل مسبقاً", { field: "plateNumber", fix: "استخدم رقم لوحة مختلف أو تحقق من السجل الموجود" });
    }

    if (b.vinNumber) {
      const [existingVin] = await rawQuery<any>(
        `SELECT id FROM fleet_vehicles WHERE "vinNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.vinNumber, scope.companyId]
      );
      if (existingVin) {
        throw new ConflictError("رقم الهيكل (VIN) مسجل مسبقاً", { field: "vinNumber", fix: "تحقق من رقم الهيكل — لا يمكن تسجيل نفس المركبة مرتين" });
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_vehicles ("companyId","plateNumber",make,model,year,color,"vinNumber","fuelType","currentMileage",status,"branchId",notes,"registrationNumber","registrationExpiry","inspectionDate","nextInspectionDate","plateType","sequenceNumber","insuranceExpiry","fuelCapacity") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [scope.companyId, plateNumber, b.make.trim(), b.model.trim(), b.year ? Number(b.year) : null, b.color, b.vinNumber, b.fuelType || 'gasoline', b.currentMileage || 0, 'available', b.branchId || scope.branchId, b.notes, b.registrationNumber || null, b.registrationExpiry || null, b.inspectionDate || null, b.nextInspectionDate || null, b.plateType || null, b.sequenceNumber || null, b.insuranceExpiry || null, b.fuelCapacity ? Number(b.fuelCapacity) : null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_vehicles", entityId: insertId,
      after: { plateNumber: b.plateNumber, make: b.make, model: b.model, year: b.year, status: 'available' },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.vehicle.created", entity: "fleet_vehicles", entityId: insertId,
      details: `مركبة جديدة: ${b.plateNumber}${b.make ? ` — ${b.make}` : ''}${b.model ? ` ${b.model}` : ''}`,
    }).catch(console.error);
    createSubsidiaryAccountsForEntity(
      scope.companyId, "vehicle", insertId,
      `${b.plateNumber} ${b.make || ""} ${b.model || ""}`.trim()
    ).catch(console.error);
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
              purchaseDate: b.purchaseDate || new Date().toISOString().slice(0, 10),
              purchaseCost: Number(b.purchasePrice),
              salvageValue: salvage,
              usefulLifeYears: usefulYears,
            }
          );
          createNotification({
            companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
            type: "auto_journal", title: "قيد تلقائي — إثبات أصل مركبة",
            body: `تم إنشاء قيد محاسبي تلقائي لإثبات أصل المركبة ${vName} بقيمة ${Number(b.purchasePrice).toLocaleString("ar-SA")} ريال، وتسجيلها كأصل ثابت يخضع للإهلاك الشهري`,
            priority: "normal", refType: "fleet_vehicle", refId: insertId,
            actionUrl: `/fleet`,
          }).catch(console.error);
        } catch (e) { console.error("Vehicle asset JE/fixed-asset failed:", e); }
      })();
    }
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create vehicle error:"); }
});

router.get("/drivers", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'd."companyId"', branchColumn: 'd."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<any>(
      `SELECT d.*, e.name AS "employeeName", e."empNumber" AS "employeeNumber",
              ea."jobTitle" AS "employeeJobTitle"
       FROM fleet_drivers d
       LEFT JOIN employees e ON e.id = d."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       WHERE ${where} AND d."deletedAt" IS NULL
       ORDER BY d.name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet drivers error:"); }
});

router.post("/drivers", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createDriverSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

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
    const [dupLicense] = await rawQuery<any>(
      `SELECT id FROM fleet_drivers WHERE "licenseNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [licenseNumber, scope.companyId]
    );
    if (dupLicense) {
      throw new ConflictError("رقم الرخصة مسجل مسبقاً لسائق آخر", { field: "licenseNumber", fix: "استخدم رقم رخصة صحيح أو راجع السجل الموجود" });
    }

    // FK pre-check on employeeId if provided
    if (b.employeeId !== undefined && b.employeeId !== null && b.employeeId !== "") {
      const [emp] = await rawQuery<any>(
        `SELECT id FROM employees WHERE id=$1`,
        [b.employeeId]
      );
      if (!emp) {
        throw new ValidationError("الموظف المرتبط غير موجود", { field: "employeeId", fix: "اختر موظفاً مسجلاً في النظام أو اترك الحقل فارغاً" });
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_drivers ("companyId",name,phone,"licenseNumber","licenseExpiry","licenseType","employeeId",status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, name, phone, licenseNumber, b.licenseExpiry || null, b.licenseType || null, b.employeeId || null, b.status || 'available']
    );
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_drivers WHERE id=$1`, [insertId]);

    createSubsidiaryAccountsForEntity(scope.companyId, "driver", insertId, name).catch(console.error);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "fleet_drivers",
      entityId: insertId,
      after: { name: b.name, phone: b.phone, licenseNumber: b.licenseNumber, employeeId: b.employeeId },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.driver.created", entity: "fleet_drivers", entityId: insertId,
      details: `سائق جديد: ${b.name}`,
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create driver error:"); }
});

router.get("/vehicles/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = Number(req.params.id);
    const [row] = await rawQuery<any>(`SELECT v.*, d.name AS "driverName", d.phone AS "driverPhone" FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id = v."assignedDriverId" AND d."deletedAt" IS NULL WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`, [vehicleId, scope.companyId]);
    if (!row) throw new NotFoundError("المركبة غير موجودة");
    const [trips, maintenance, fuelLogs, insurance] = await Promise.all([
      rawQuery<any>(
        `SELECT t.id, t."fromLocation", t."toLocation", t.distance, t.cost, t.status, t."startTime", t."endTime", d.name AS "driverName"
         FROM fleet_trips t LEFT JOIN fleet_drivers d ON d.id=t."driverId" AND d."deletedAt" IS NULL
         WHERE t."vehicleId"=$1 AND t."companyId"=$2 AND t."deletedAt" IS NULL ORDER BY t.id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, type, description, cost, "serviceDate", status, "mileageAtService", "nextServiceDate"
         FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, "fuelDate", liters, "costPerLiter", "totalCost", "mileageAtFuel", "stationName"
         FROM fleet_fuel_logs WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, type, provider, "policyNumber", "startDate", "endDate", premium
         FROM fleet_insurance WHERE "vehicleId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY "endDate" DESC LIMIT 5`,
        [vehicleId, scope.companyId]
      ),
    ]);
    res.json({ ...row, trips, maintenance, fuelLogs, insurance });
  } catch (err) { handleRouteError(err, res, "Get vehicle error:"); }
});

router.get("/vehicles/:id/impact-preview", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { status } = req.query as { status?: string };
    if (!status) {
      throw new ValidationError("الحالة المطلوبة", { field: "status", fix: "أرسل معامل status في الرابط" });
    }
    const preview = await getVehicleStatusImpact(id, scope.companyId, status);
    res.json(preview);
  } catch (err) { handleRouteError(err, res, "Vehicle impact preview error:"); }
});

router.patch("/vehicles/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المركبة غير موجودة");
    const b = req.body;

    // State machine — if the caller is changing status, the transition must be
    // allowed from the current status. Unknown target → 422; disallowed → 409.
    if (b.status !== undefined && b.status !== existing.status) {
      if (!VEHICLE_STATUSES.includes(b.status)) {
        throw new ValidationError(`حالة غير صالحة: ${b.status}`, { field: "status", fix: `اختر من: ${VEHICLE_STATUSES.join(", ")}` });
      }
      const allowedNext = VEHICLE_TRANSITIONS[existing.status] ?? [];
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
      const [dup] = await rawQuery<any>(
        `SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3`,
        [b.plateNumber, scope.companyId, id]
      );
      if (dup) {
        throw new ConflictError("رقم اللوحة مسجل مسبقاً", { field: "plateNumber", fix: "اختر رقم لوحة مختلف" });
      }
    }

    // FK pre-check on assignedDriverId
    if (b.assignedDriverId !== undefined && b.assignedDriverId !== null) {
      const [drv] = await rawQuery<any>(
        `SELECT id, status FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.assignedDriverId, scope.companyId]
      );
      if (!drv) {
        throw new ValidationError("السائق غير موجود", { field: "assignedDriverId", fix: "اختر سائقاً مسجلاً في النظام" });
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    const trackedFields = ["plateNumber","make","model","year","color","status","fuelType","notes","assignedDriverId","registrationNumber","registrationExpiry","inspectionDate","nextInspectionDate","plateType","sequenceNumber","vinNumber"] as const;
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
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const f of trackedFields) {
      if (b[f] !== undefined && b[f] !== existing[f]) {
        const val = (f === "registrationExpiry" || f === "inspectionDate" || f === "nextInspectionDate")
          ? (b[f] || null)
          : b[f];
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
    await rawExecute(`UPDATE fleet_vehicles SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

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
    }).catch(console.error);

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
      }).catch(console.error);
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
      }).catch(console.error);
    }

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update vehicle error:"); }
});

router.delete("/vehicles/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, "plateNumber", status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المركبة غير موجودة");

    // Block delete if the vehicle is tied up in an active trip or in-progress
    // maintenance — otherwise the delete would orphan the driver assignment
    // and leave a ghost trip referencing a missing vehicle.
    const [activeTrip] = await rawQuery<any>(
      `SELECT id FROM fleet_trips WHERE "vehicleId"=$1 AND "companyId"=$2 AND status IN ('scheduled','planned','in_progress') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeTrip) {
      throw new ConflictError("لا يمكن حذف المركبة — توجد رحلة نشطة مرتبطة بها", { field: "status", fix: "أنهِ الرحلة النشطة أو ألغِها قبل حذف المركبة" });
    }
    const [activeMaint] = await rawQuery<any>(
      `SELECT id FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 AND status IN ('scheduled','in_progress') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeMaint) {
      throw new ConflictError("لا يمكن حذف المركبة — توجد صيانة قيد التنفيذ", { field: "status", fix: "أكمل أو ألغِ سجل الصيانة قبل حذف المركبة" });
    }

    await rawExecute(`UPDATE fleet_vehicles SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.vehicle.deleted",
      entity: "fleet_vehicles",
      entityId: id,
      before: { plateNumber: existing.plateNumber, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_vehicles", entityId: id,
      after: { plateNumber: existing.plateNumber, status: existing.status },
    }).catch(console.error);

    res.json({ message: "تم حذف المركبة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete vehicle error:"); }
});

router.get("/drivers/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("السائق غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get driver error:"); }
});

router.patch("/drivers/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("السائق غير موجود");
    const b = req.body;

    // State machine on driver status
    if (b.status !== undefined && b.status !== existing.status) {
      if (!DRIVER_STATUSES.includes(b.status)) {
        throw new ValidationError(`حالة سائق غير صالحة: ${b.status}`, { field: "status", fix: `اختر من: ${DRIVER_STATUSES.join(", ")}` });
      }
      const allowedNext = DRIVER_TRANSITIONS[existing.status] ?? DRIVER_TRANSITIONS.available;
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(`لا يمكن نقل السائق من "${existing.status}" إلى "${b.status}"`, { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` });
      }
    }

    // Duplicate license check on rename
    if (b.licenseNumber && b.licenseNumber !== existing.licenseNumber) {
      const [dup] = await rawQuery<any>(
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

    const trackedFields = ["name","phone","licenseNumber","licenseExpiry","status","licenseType"] as const;
    const colMap: Record<string, string> = {
      name: "name",
      phone: "phone",
      licenseNumber: '"licenseNumber"',
      licenseExpiry: '"licenseExpiry"',
      status: "status",
      licenseType: '"licenseType"',
    };
    const sets: string[] = [];
    const params: any[] = [];
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
    await rawExecute(`UPDATE fleet_drivers SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_drivers WHERE id=$1`, [id]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_drivers",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "fleet.driver.status_changed" : "fleet.driver.updated",
      entity: "fleet_drivers",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update driver error:"); }
});

router.delete("/drivers/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, name, status FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("السائق غير موجود");

    const [activeTrip] = await rawQuery<any>(
      `SELECT id FROM fleet_trips WHERE "driverId"=$1 AND "companyId"=$2 AND status IN ('scheduled','planned','in_progress') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeTrip) {
      throw new ConflictError("لا يمكن حذف السائق — توجد رحلة نشطة مسندة إليه", { field: "status", fix: "أنهِ أو ألغِ الرحلة النشطة قبل حذف السائق" });
    }

    await rawExecute(`UPDATE fleet_drivers SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.driver.deleted",
      entity: "fleet_drivers",
      entityId: id,
      before: { name: existing.name, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_drivers", entityId: id,
      after: { name: existing.name, status: existing.status },
    }).catch(console.error);

    res.json({ message: "تم حذف السائق بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete driver error:"); }
});

router.get("/trips", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', branchColumn: 't."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND t.status = $${paramIdx}`; params.push(status); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT t.*, t."fromLocation" AS origin, t."toLocation" AS destination, t."startDate" AS "tripDate",
              v."plateNumber", v."plateNumber" AS "vehiclePlate", d.name AS "driverName"
       FROM fleet_trips t LEFT JOIN fleet_vehicles v ON v.id=t."vehicleId" AND v."deletedAt" IS NULL LEFT JOIN fleet_drivers d ON d.id=t."driverId" AND d."deletedAt" IS NULL WHERE ${where} AND t."deletedAt" IS NULL ORDER BY t.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet trips error:"); }
});

router.get("/trips/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT t.*, t."fromLocation" AS origin, t."toLocation" AS destination, t."startDate" AS "tripDate",
              v."plateNumber", v."plateNumber" AS "vehiclePlate", d.name AS "driverName"
       FROM fleet_trips t
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id = t."driverId"
       WHERE t.id = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL`,
      [tripId, scope.companyId]
    );
    if (!row) throw new NotFoundError("الرحلة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get trip error:"); }
});

router.post("/trips", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (b.vehicleId) {
      const [vehicle] = await rawQuery<any>(
        `SELECT v.id, v."assignedDriverId", v.status,
                (SELECT MAX(fi."endDate") FROM fleet_insurance fi WHERE fi."vehicleId" = v.id) AS "insuranceEnd"
         FROM fleet_vehicles v WHERE v.id = $1 AND v."companyId" = $2`,
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
        const insuranceEnd = vehicle.insuranceEnd ? new Date(vehicle.insuranceEnd) : null;
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

    const fromLat = parseFloat(b.fromLat || 0);
    const fromLng = parseFloat(b.fromLng || 0);
    const toLat = parseFloat(b.toLat || 0);
    const toLng = parseFloat(b.toLng || 0);

    let estimatedDistanceKm = b.distance || 0;
    if (fromLat && fromLng && toLat && toLng) {
      estimatedDistanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
    }

    let selectedVehicleId = b.vehicleId || null;
    let selectedDriverId = b.driverId || null;

    if (!selectedVehicleId) {
      const vehicles = await rawQuery<any>(
        `SELECT v.*,
                (SELECT COUNT(*) FROM fleet_trips WHERE "vehicleId"=v.id AND status='completed') AS "tripCount",
                (SELECT MAX("endDate") FROM fleet_insurance WHERE "vehicleId"=v.id) AS "insuranceEnd"
         FROM fleet_vehicles v
         WHERE v."companyId"=$1 AND v.status='available' AND v."deletedAt" IS NULL
         ORDER BY v.id LIMIT 20`,
        [scope.companyId]
      );
      if (vehicles.length > 0) {
        let best = vehicles[0];
        let bestScore = -Infinity;
        for (const v of vehicles) {
          let score = 0;
          const insuranceEnd = v.insuranceEnd ? new Date(v.insuranceEnd) : null;
          const hasValidInsurance = insuranceEnd && insuranceEnd > new Date();
          if (hasValidInsurance) score += 20;
          if (fromLat && fromLng && v.latitude && v.longitude) {
            const dist = haversineKm(fromLat, fromLng, Number(v.latitude), Number(v.longitude));
            score += Math.max(0, 30 - dist);
          }
          score += Math.max(0, 10 - Number(v.tripCount || 0) * 0.1);
          if (score > bestScore) { bestScore = score; best = v; }
        }
        selectedVehicleId = best.id;
      }
    }

    if (!selectedDriverId) {
      const drivers = await rawQuery<any>(
        `SELECT d.*,
                (SELECT COUNT(*) FROM fleet_trips WHERE "driverId"=d.id AND status='completed') AS "tripCount",
                (SELECT COUNT(*) FROM fleet_trips WHERE "driverId"=d.id AND status='in_progress') AS "activeTrips",
                COALESCE(d.rating, 3) AS "driverRating"
         FROM fleet_drivers d
         WHERE d."companyId"=$1 AND d.status='available'
           AND (d."licenseExpiry" IS NULL OR d."licenseExpiry" > CURRENT_DATE)
         ORDER BY d.id LIMIT 20`,
        [scope.companyId]
      );
      if (drivers.length > 0) {
        let best = drivers[0];
        let bestScore = -Infinity;
        const maxTrips = Math.max(...drivers.map((d: any) => Number(d.tripCount) || 1), 1);
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

          const hasValidLicense = d.licenseExpiry ? new Date(d.licenseExpiry) > new Date() : true;
          const licenseScore = hasValidLicense ? 0.2 : 0;

          const rating = Number(d.driverRating) || 3;
          const ratingScore = (rating / 5) * 0.1;

          const combined = fewestTripsScore + proximityScore + licenseScore + ratingScore;
          if (combined > bestScore) { bestScore = combined; best = d; }
        }
        selectedDriverId = best.id;
      }
    }

    if (selectedVehicleId && !b.vehicleId) {
      const [autoVehicle] = await rawQuery<any>(
        `SELECT v.id,
                (SELECT MAX(fi."endDate") FROM fleet_insurance fi WHERE fi."vehicleId" = v.id) AS "insuranceEnd"
         FROM fleet_vehicles v WHERE v.id = $1 AND v."companyId" = $2`,
        [selectedVehicleId, scope.companyId]
      );
      if (autoVehicle) {
        const insuranceEnd = autoVehicle.insuranceEnd ? new Date(autoVehicle.insuranceEnd) : null;
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

    const fuelPricePerLiter = b.fuelPricePerLiter || 2.5;
    const fuelEfficiency = 10;
    const estimatedFuelCost = (estimatedDistanceKm / fuelEfficiency) * fuelPricePerLiter;
    const driverFare = b.driverFare || estimatedDistanceKm * 0.5;
    const depreciation = estimatedDistanceKm * 0.15;
    const totalEstimatedCost = estimatedFuelCost + driverFare + depreciation;

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_trips ("companyId","vehicleId","driverId","clientId","fromLocation","toLocation","fromLat","fromLng","toLat","toLng","distance","cost","startTime",status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [scope.companyId, selectedVehicleId, selectedDriverId, b.clientId, b.fromLocation, b.toLocation, fromLat || null, fromLng || null, toLat || null, toLng || null, estimatedDistanceKm, totalEstimatedCost, b.startTime || new Date().toISOString(), 'in_progress', b.notes]
    );

    if (selectedVehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='in_use', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [selectedVehicleId, scope.companyId]);
    }
    if (selectedDriverId) {
      await rawExecute(`UPDATE fleet_drivers SET status='on_trip' WHERE id=$1 AND "companyId"=$2`, [selectedDriverId, scope.companyId]);

      try {
        const [driverEmp] = await rawQuery<any>(
          `SELECT d."employeeId", ea.id AS "assignmentId" FROM fleet_drivers d
           LEFT JOIN employee_assignments ea ON ea."employeeId"=d."employeeId" AND ea.status='active'
           WHERE d.id=$1`, [selectedDriverId]);
        if (driverEmp?.assignmentId) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: driverEmp.assignmentId,
            type: "fleet_trip",
            title: "رحلة جديدة مسندة إليك",
            body: `رحلة من ${b.fromLocation || 'غير محدد'} إلى ${b.toLocation || 'غير محدد'} — المسافة: ${estimatedDistanceKm.toFixed(1)} كم`,
            priority: "normal",
            refType: "fleet_trips",
            refId: insertId,
          }).catch(console.error);
        }
      } catch (notifErr) { console.error("Trip notification error:", notifErr); }

      console.log(`[SMS] رحلة جديدة #${insertId} — SMS للعميل ${b.clientId || 'N/A'}`);
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_trips", entityId: insertId,
      after: { vehicleId: selectedVehicleId, driverId: selectedDriverId, distance: estimatedDistanceKm, cost: totalEstimatedCost },
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_trips WHERE id=$1`, [insertId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.created", entity: "fleet_trips", entityId: insertId,
      details: JSON.stringify({ vehicleId: selectedVehicleId, driverId: selectedDriverId, distance: estimatedDistanceKm, fromLocation: b.fromLocation, toLocation: b.toLocation }),
    }).catch(console.error);
    res.status(201).json({
      ...row,
      estimatedCostBreakdown: { fuel: estimatedFuelCost, driverFare, depreciation, total: totalEstimatedCost },
      vehicleAutoSelected: !b.vehicleId,
      driverAutoSelected: !b.driverId,
    });
  } catch (err) { handleRouteError(err, res, "Create trip error:"); }
});

router.post("/trips/:id/complete", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = Number(req.params.id);
    const b = req.body;

    const [trip] = await rawQuery<any>(`SELECT * FROM fleet_trips WHERE id=$1 AND "companyId"=$2`, [tripId, scope.companyId]);
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
    const fuelPricePerLiter = b.fuelPricePerLiter || 2.5;
    const fuelEfficiency = 10;
    const actualFuelCost = (actualDistanceKm / fuelEfficiency) * fuelPricePerLiter;
    const driverFare = b.driverFare || actualDistanceKm * 0.5;
    const depreciation = actualDistanceKm * 0.15;
    const totalCost = actualFuelCost + driverFare + depreciation;

    await rawExecute(
      `UPDATE fleet_trips SET status='completed', "endTime"=NOW(), distance=$1, cost=$2 WHERE id=$3`,
      [actualDistanceKm, totalCost, tripId]
    );

    if (trip.vehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='available', "currentMileage"="currentMileage"+$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`, [actualDistanceKm, trip.vehicleId, scope.companyId]);
    }

    if (trip.driverId) {
      await rawExecute(
        `UPDATE fleet_drivers SET status='available', "totalTrips"=COALESCE("totalTrips",0)+1 WHERE id=$1 AND "companyId"=$2`,
        [trip.driverId, scope.companyId]
      );
    }

    const { fleetEngine } = await import("../lib/engines/index.js");
    const tripGLResult = await fleetEngine.postTripCompletionGL(
      { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
      { id: tripId, vehicleId: trip.vehicleId, fuelCost: actualFuelCost, driverFare, depreciation, totalCost }
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
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.trip.completed", entity: "fleet_trips", entityId: tripId,
      details: `رحلة #${tripId} — ${actualDistanceKm.toFixed(1)} كم — تكلفة ${totalCost.toFixed(2)} ريال`,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.completed", entity: "fleet_trips", entityId: tripId,
      details: JSON.stringify({ status: "completed", distance: actualDistanceKm, cost: totalCost, fuelCost: actualFuelCost, driverFare, depreciation, journalEntryId }),
    }).catch(console.error);

    const [updated] = await rawQuery<any>(`SELECT * FROM fleet_trips WHERE id=$1`, [tripId]);
    res.json({
      ...updated,
      event: 'fleet.trip.completed',
      journalEntryId,
      costBreakdown: { fuel: actualFuelCost, driverFare, depreciation, total: totalCost },
    });
  } catch (err) { handleRouteError(err, res, "Complete trip error:"); }
});

/** Cancel a trip — frees vehicle+driver via the lifecycle engine, no cost posted */
router.post("/trips/:id/cancel", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = Number(req.params.id);
    const reason = (req.body?.reason as string | undefined)?.trim();
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
            `UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
            [row.vehicleId, scope.companyId]
          );
        }
        if (row.driverId) {
          await client.query(
            `UPDATE fleet_drivers SET status='available' WHERE id=$1 AND "companyId"=$2`,
            [row.driverId, scope.companyId]
          );
        }
      },
    });
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.cancelled", entity: "fleet_trips", entityId: tripId,
      details: JSON.stringify({ tripId, reason }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_trips", entityId: tripId,
      after: { status: "cancelled", reason },
    }).catch(console.error);

    res.json({ ...updated, event: "fleet.trip.cancelled" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Cancel trip error:");
  }
});

router.post("/trips/:id/waypoints", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = Number(req.params.id);
    const b = req.body;
    const [trip] = await rawQuery<any>(
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
      `INSERT INTO fleet_gps_tracking ("vehicleId","driverId",latitude,longitude,speed,"recordedAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
      [trip.vehicleId, trip.driverId, lat, lon, b.speed || 0]
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.trip.waypoint_added", entity: "fleet_trip_waypoints", entityId: insertId,
      details: JSON.stringify({ tripId, lat, lon }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_trip_waypoints", entityId: insertId,
      after: { tripId, lat, lon, speed: b.speed || 0 },
    }).catch(console.error);

    res.status(201).json({ id: insertId, tripId, lat, lon });
  } catch (err) { handleRouteError(err, res, "Waypoint error:"); }
});

router.get("/maintenance", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'm."companyId"', branchColumn: 'm."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (vehicleId) { where += ` AND m."vehicleId" = $${paramIdx}`; params.push(Number(vehicleId)); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT m.*, m.type AS "maintenanceType", m.cost AS amount,
              m."serviceDate" AS "scheduledDate", m."serviceDate" AS date,
              m."mileageAtService" AS mileage, m."nextServiceKm" AS "nextServiceMileage",
              m."performedBy" AS workshop,
              v."plateNumber", v."plateNumber" AS "vehiclePlateNumber", v."plateNumber" AS "vehiclePlate",
              v.make AS "vehicleMake", v.model AS "vehicleModel"
       FROM fleet_maintenance m LEFT JOIN fleet_vehicles v ON v.id=m."vehicleId" WHERE ${where} AND m."deletedAt" IS NULL ORDER BY m.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet maintenance error:"); }
});

router.get("/maintenance/:id", requirePermission("fleet:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (req.path.includes("/complete") || req.path.includes("/cancel")) return;
    const [row] = await rawQuery<any>(
      `SELECT m.*, m.type AS "maintenanceType", m.cost AS amount,
              m."serviceDate" AS "scheduledDate", m."serviceDate" AS date,
              m."mileageAtService" AS mileage, m."nextServiceKm" AS "nextServiceMileage",
              m."performedBy" AS workshop,
              v."plateNumber", v."plateNumber" AS "vehiclePlateNumber",
              v.make AS "vehicleMake", v.model AS "vehicleModel"
       FROM fleet_maintenance m
       LEFT JOIN fleet_vehicles v ON v.id=m."vehicleId"
       WHERE m.id = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل الصيانة غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Fleet maintenance detail error:"); }
});

router.post("/maintenance", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createMaintenanceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

    // FK pre-check: vehicle must exist and not be deleted
    const [vehicleRow] = await rawQuery<any>(
      `SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!vehicleRow) {
      throw new ValidationError("المركبة غير موجودة", { field: "vehicleId", fix: "اختر مركبة مسجلة في النظام" });
    }
    if (vehicleRow.status === "out_of_service") {
      throw new ConflictError("لا يمكن إنشاء صيانة لمركبة خارج الخدمة", { field: "vehicleId", fix: "أعد المركبة للحالة المتاحة أو اختر مركبة أخرى" });
    }

    const mechanics = await rawQuery<any>(
      `SELECT e.* FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active' WHERE e.status='active' ORDER BY e.id LIMIT 5`,
      [scope.companyId]
    );
    const assignedMechanic = b.performedBy || (mechanics[0]?.name ?? null);

    const defaultNextDate = new Date();
    defaultNextDate.setMonth(defaultNextDate.getMonth() + 3);
    const effectiveNextServiceDate = b.nextServiceDate || defaultNextDate.toISOString().split('T')[0];

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_maintenance ("companyId","vehicleId",type,description,cost,"mileageAtService","serviceDate","performedBy",status,"nextServiceDate","nextServiceKm") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [scope.companyId, b.vehicleId, b.type, b.description, b.cost || 0, b.mileageAtService, b.serviceDate || new Date().toISOString().split('T')[0], assignedMechanic, b.status || 'in_progress', effectiveNextServiceDate, b.nextServiceKm ?? null]
    );

    if (b.vehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='maintenance', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [b.vehicleId, scope.companyId]);
    }

    if (b.partsUsed && Array.isArray(b.partsUsed)) {
      fleetEngine.requestWarehouseDeduction(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
        { maintenanceId: insertId, parts: b.partsUsed }
      );
    }

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_maintenance WHERE id=$1`, [insertId]);

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
        serviceDate: b.serviceDate || new Date().toISOString().split("T")[0],
      },
    }).catch(console.error);

    if (b.type && ["breakdown", "emergency"].includes(b.type)) {
      const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [b.vehicleId]);
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? 0, userId: scope.userId,
        action: "fleet.vehicle.breakdown", entity: "fleet_vehicles", entityId: b.vehicleId,
        details: JSON.stringify({ plateNumber: vehicle?.plateNumber, description: b.description, source: "manual_maintenance" }),
      }).catch(console.error);
    }

    // Register obligation for the scheduled service date (for previews, inspections, etc.)
    try {
      const serviceDate = new Date(b.serviceDate || new Date().toISOString());
      if (serviceDate > new Date()) {
        const [veh] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [b.vehicleId]);
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
    } catch (obErr) { console.error("Maintenance obligation registration failed:", obErr); }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_maintenance", entityId: insertId,
      after: { vehicleId: b.vehicleId, type: b.type, description: b.description, cost: b.cost || 0 },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create maintenance error:"); }
});

router.post("/maintenance/:id/complete", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const [m] = await rawQuery<any>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
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
    await rawExecute(`UPDATE fleet_maintenance SET status='completed', cost=$1 WHERE id=$2 AND "companyId"=$3`, [finalCost, id, scope.companyId]);
    if (m.vehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='available', "lastMaintenanceDate"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [m.vehicleId, scope.companyId]);
    }

    // Auto journal entry for maintenance cost
    if (finalCost > 0) {
      const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [m.vehicleId]);
      const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.postMaintenanceGL(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id, vehicleId: m.vehicleId, totalCost: finalCost, type: m.type, description: `مصروف صيانة مركبة${plateLabel} / ${m.type ?? ""} / ${m.description ?? ""}` }
      );
    }

    // Mark the scheduled obligation as met and register the next one
    try {
      await markObligationMet(scope.companyId, "fleet_maintenance", id, "maintenance");
      if (m.nextServiceDate) {
        const [veh] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [m.vehicleId]);
        const nextDate = new Date(m.nextServiceDate);
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "fleet_vehicle",
          entityId: Number(m.vehicleId),
          obligationType: "maintenance",
          title: `صيانة دورية قادمة — ${veh?.plateNumber || `مركبة #${m.vehicleId}`}`,
          dueAt: nextDate.toISOString(),
          metadata: { previousMaintenanceId: id, type: m.type },
          dedupeKey: `vehicle-${m.vehicleId}-next-service-${nextDate.toISOString().split("T")[0]}`,
        });
      }
    } catch (obErr) { console.error("Maintenance obligation update failed:", obErr); }

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
    }).catch(console.error);

    res.json({ ...m, status: 'completed', cost: finalCost, event: "fleet.maintenance.completed" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

/** Cancel a maintenance job — frees vehicle, no cost posted */
router.post("/maintenance/:id/cancel", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body || {};
    const [m] = await rawQuery<any>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
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
    if (!b.reason) {
      throw new ValidationError("سبب الإلغاء مطلوب", {
        field: "reason",
        fix: "أدخل سبب إلغاء الصيانة",
      });
    }

    await rawExecute(
      `UPDATE fleet_maintenance SET status='cancelled', description=COALESCE(description,'') || ' | إلغاء: ' || $1 WHERE id=$2`,
      [b.reason, id]
    );
    if (m.vehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [m.vehicleId, scope.companyId]);
    }
    await cancelObligation(scope.companyId, "fleet_maintenance", id, "maintenance");

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "fleet.maintenance.cancelled",
      entity: "fleet_maintenance",
      entityId: id,
      details: `إلغاء صيانة #${id}: ${b.reason}`,
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_maintenance", entityId: id,
      after: { status: "cancelled", reason: b.reason },
    }).catch(console.error);

    const [updated] = await rawQuery<any>(`SELECT * FROM fleet_maintenance WHERE id=$1`, [id]);
    res.json({ ...updated, event: "fleet.maintenance.cancelled" });
  } catch (err) { handleRouteError(err, res, "Cancel maintenance error:"); }
});

router.get("/alerts", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const alerts: any[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const in7Days = new Date(today); in7Days.setDate(today.getDate() + 7);
    const in14Days = new Date(today); in14Days.setDate(today.getDate() + 14);
    const in30Days = new Date(today); in30Days.setDate(today.getDate() + 30);
    const in90Days = new Date(today); in90Days.setDate(today.getDate() + 90);

    const allInsurance = await rawQuery<any>(
      `SELECT v."plateNumber", i."endDate", i.type AS "insuranceType",
              (i."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM fleet_insurance i JOIN fleet_vehicles v ON v.id=i."vehicleId" AND v."deletedAt" IS NULL
       WHERE i."companyId"=$1 AND i."deletedAt" IS NULL AND i."endDate" BETWEEN $2 AND $3`,
      [cid, todayStr, in90Days.toISOString().split('T')[0]]
    );
    for (const r of allInsurance) {
      const daysLeft = Number(r.daysLeft);
      let severity: string;
      if (daysLeft <= 0) severity = 'blocked';
      else if (daysLeft <= 7) severity = 'critical';
      else if (daysLeft <= 14) severity = 'high';
      else if (daysLeft <= 30) severity = 'medium';
      else severity = 'low';
      alerts.push({
        type: 'insurance_expiry', severity, vehicle: r.plateNumber,
        daysLeft, date: r.endDate,
        message: daysLeft <= 0
          ? `تأمين المركبة ${r.plateNumber} منتهٍ — يجب حظر الاستخدام`
          : `تأمين المركبة ${r.plateNumber} ينتهي خلال ${daysLeft} يوم`,
      });
    }

    const expiringLicenses = await rawQuery<any>(
      `SELECT d.name, d."licenseExpiry", d."licenseNumber",
              (d."licenseExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM fleet_drivers d
       WHERE d."companyId"=$1 AND d."licenseExpiry" IS NOT NULL
         AND d."licenseExpiry" BETWEEN $2 AND $3`,
      [cid, todayStr, in90Days.toISOString().split('T')[0]]
    );
    for (const d of expiringLicenses) {
      const daysLeft = Number(d.daysLeft);
      let severity = daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low';
      alerts.push({
        type: 'driver_license_expiry', severity, driver: d.name,
        daysLeft, date: d.licenseExpiry,
        message: `رخصة السائق ${d.name} تنتهي خلال ${daysLeft} يوم`,
      });
    }

    const speedAlerts = await rawQuery<any>(
      `SELECT g.speed, g.latitude, g.longitude, g."recordedAt",
              v."plateNumber", d.name AS "driverName"
       FROM fleet_gps_tracking g
       LEFT JOIN fleet_vehicles v ON v.id=g."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id=g."driverId"
       WHERE g.speed > 120 AND g."recordedAt" > NOW() - INTERVAL '24 hours'
       ORDER BY g."recordedAt" DESC LIMIT 50`,
      []
    );
    for (const s of speedAlerts) {
      alerts.push({
        type: 'speed_violation', severity: 'high',
        vehicle: s.plateNumber, driver: s.driverName,
        speed: s.speed, recordedAt: s.recordedAt,
        message: `تجاوز سرعة: ${s.driverName || 'غير معروف'} — ${s.speed} كم/س (المركبة ${s.plateNumber || 'غير محدد'})`,
      });
    }

    const abnormalFuel = await rawQuery<any>(
      `SELECT v."plateNumber", v.id AS "vehicleId",
              AVG(f.liters) AS "avgLiters",
              MAX(f.liters) AS "maxLiters"
       FROM fleet_fuel_logs f
       JOIN fleet_vehicles v ON v.id=f."vehicleId"
       WHERE f."companyId"=$1 AND f."fuelDate" > CURRENT_DATE - INTERVAL '30 days'
       GROUP BY v.id, v."plateNumber"
       HAVING MAX(f.liters) > AVG(f.liters) * 1.2`,
      [cid]
    );
    for (const r of abnormalFuel) {
      alerts.push({
        type: 'abnormal_fuel', severity: 'medium', vehicle: r.plateNumber,
        avgLiters: Number(r.avgLiters).toFixed(1), maxLiters: Number(r.maxLiters).toFixed(1),
        message: `وقود غير طبيعي: المركبة ${r.plateNumber} — أقصى ${Number(r.maxLiters).toFixed(1)} لتر (المتوسط ${Number(r.avgLiters).toFixed(1)}) تجاوز 120%`,
      });
    }

    const frequentBreakdowns = await rawQuery<any>(
      `SELECT v."plateNumber", v.id AS "vehicleId", COUNT(m.id) AS "breakdownCount"
       FROM fleet_maintenance m
       JOIN fleet_vehicles v ON v.id=m."vehicleId"
       WHERE m."companyId"=$1 AND m."serviceDate" > CURRENT_DATE - INTERVAL '30 days'
         AND m.type IN ('breakdown','emergency','repair')
       GROUP BY v.id, v."plateNumber"
       HAVING COUNT(m.id) >= 3`,
      [cid]
    );
    for (const r of frequentBreakdowns) {
      alerts.push({
        type: 'frequent_breakdowns', severity: 'high', vehicle: r.plateNumber,
        count: Number(r.breakdownCount),
        message: `المركبة ${r.plateNumber} تعطلت ${r.breakdownCount} مرات خلال الشهر — يُنصح بالاستبعاد`,
      });
    }

    const lowRatingDrivers = await rawQuery<any>(
      `SELECT d.name, d.rating, d.id FROM fleet_drivers d
       WHERE d."companyId"=$1 AND d.rating IS NOT NULL AND d.rating < 3`,
      [cid]
    );
    for (const d of lowRatingDrivers) {
      alerts.push({
        type: 'low_driver_rating', severity: 'medium', driver: d.name,
        rating: Number(d.rating).toFixed(1),
        message: `تقييم السائق ${d.name} منخفض: ${Number(d.rating).toFixed(1)}/5 — يحتاج مراجعة`,
      });
    }

    const oilDue = await rawQuery<any>(
      `SELECT v."plateNumber", v."currentMileage", m."mileageAtService" FROM fleet_vehicles v LEFT JOIN fleet_maintenance m ON m.id=(SELECT id FROM fleet_maintenance WHERE "vehicleId"=v.id AND type='oil_change' ORDER BY "mileageAtService" DESC LIMIT 1) WHERE v."companyId"=$1 AND v."deletedAt" IS NULL AND (v."currentMileage" - COALESCE(m."mileageAtService",0)) >= 5000`,
      [cid]
    );
    oilDue.forEach((r: any) => alerts.push({ type: 'oil_change_due', severity: 'medium', vehicle: r.plateNumber, message: `تغيير زيت المركبة ${r.plateNumber} مستحق (الكيلومتراج: ${r.currentMileage})` }));

    res.json({ data: alerts, total: alerts.length, page: 1, pageSize: alerts.length });
  } catch (err) { handleRouteError(err, res, "Fleet alerts error:"); }
});

router.get("/fuel-logs", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'f."companyId"', branchColumn: 'f."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (vehicleId) { where += ` AND f."vehicleId" = $${paramIdx}`; params.push(Number(vehicleId)); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT f.*, f.liters AS quantity, f."totalCost" AS cost, f."mileageAtFuel" AS mileage, f."stationName" AS station, f."fuelDate" AS date, v."plateNumber", v."plateNumber" AS "vehiclePlate" FROM fleet_fuel_logs f LEFT JOIN fleet_vehicles v ON v.id=f."vehicleId" WHERE ${where} AND f."deletedAt" IS NULL ORDER BY f.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet fuel error:"); }
});

router.get("/fuel-logs/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT f.*, f.liters AS quantity, f."totalCost" AS cost, f."mileageAtFuel" AS odometer,
              f."stationName" AS station, f."fuelDate" AS date,
              v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel",
              d.name AS "driverName"
       FROM fleet_fuel_logs f
       LEFT JOIN fleet_vehicles v ON v.id=f."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id=f."driverId"
       WHERE f.id = $1 AND f."companyId" = $2 AND f."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل الوقود غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Fleet fuel detail error:"); }
});

router.post("/fuel-logs", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createFuelLogSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

    const vehicleId = b.vehicleId || null;
    const vehiclePlate = b.vehiclePlate || null;
    let resolvedVehicleId = vehicleId;
    if (!resolvedVehicleId && vehiclePlate) {
      const [v] = await rawQuery<any>(`SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [vehiclePlate, scope.companyId]);
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
    const [veh] = await rawQuery<any>(
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
    const fuelDate = b.fuelDate || b.date || new Date().toISOString().split('T')[0];
    const mileageAtFuel = Number(b.mileageAtFuel || b.mileage) || null;
    const stationName = b.stationName || b.station || null;
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_fuel_logs ("companyId","vehicleId","driverId","fuelDate",liters,"costPerLiter","totalCost","mileageAtFuel","stationName") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, resolvedVehicleId, b.driverId, fuelDate, liters, costPerLiter, totalCost, mileageAtFuel, stationName]
    );

    // Auto journal entry for fuel cost
    if (totalCost > 0) {
      const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [resolvedVehicleId]);
      const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.postFuelExpenseGL(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id: insertId, vehicleId: resolvedVehicleId, amount: totalCost, description: `مصروف وقود${plateLabel} / ${liters} لتر / ${stationName ?? ""}` }
      );
    }

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_fuel_logs WHERE id=$1`, [insertId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.fuel_log.created", entity: "fleet_fuel_logs", entityId: insertId,
      details: JSON.stringify({ vehicleId: resolvedVehicleId, liters, totalCost }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_fuel_logs", entityId: insertId,
      after: { vehicleId: resolvedVehicleId, liters, totalCost, fuelDate, stationName },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create fuel log error:"); }
});

router.get("/insurance", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'i."companyId"', branchColumn: 'i."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (vehicleId) { where += ` AND i."vehicleId" = $${paramIdx}`; params.push(Number(vehicleId)); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT i.*, v."plateNumber" FROM fleet_insurance i LEFT JOIN fleet_vehicles v ON v.id=i."vehicleId" WHERE ${where} ORDER BY i."endDate" ASC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet insurance error:"); }
});

router.get("/insurance/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT i.*, v."plateNumber", v.make AS "vehicleMake", v.model AS "vehicleModel"
       FROM fleet_insurance i
       LEFT JOIN fleet_vehicles v ON v.id=i."vehicleId"
       WHERE i.id = $1 AND i."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل التأمين غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Fleet insurance detail error:"); }
});

router.post("/insurance", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createInsuranceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

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

    const [vehicleRow] = await rawQuery<any>(
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

    // Auto journal entry for insurance premium
    if (premium > 0) {
      const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [b.vehicleId]);
      const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
      const insuranceType = b.type || b.insuranceType || 'comprehensive';
      const insuranceTypeLabel = insuranceType === 'comprehensive' ? 'شامل' : insuranceType === 'third_party' ? 'طرف ثالث' : insuranceType;
      const { fleetEngine } = await import("../lib/engines/index.js");
      await fleetEngine.postInsuranceGL(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId ?? scope.userId },
        { id: insertId, vehicleId: Number(b.vehicleId), premium, description: `مصروف تأمين${plateLabel} / ${insuranceTypeLabel} / ${b.provider ?? ""}` }
      );
    }

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_insurance WHERE id=$1`, [insertId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.insurance.created", entity: "fleet_insurance", entityId: insertId,
      details: JSON.stringify({ vehicleId: b.vehicleId, provider: b.provider, premium }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_insurance", entityId: insertId,
      after: { vehicleId: b.vehicleId, provider: b.provider, policyNumber: b.policyNumber, premium },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create insurance error:"); }
});

router.patch("/trips/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الرحلة غير موجودة");

    const { fromLocation, toLocation, destination, status, notes, cost } = req.body as any;
    const finalTo = toLocation ?? destination;

    // PATCH on trips is an edit surface only — lifecycle transitions must go
    // through /complete or /cancel. Explicit status writes here are limited to
    // the allowlist so the status machine can't be bypassed.
    if (status !== undefined && status !== existing.status) {
      if (!TRIP_STATUSES.includes(status)) {
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
      const allowedNext = TRIP_TRANSITIONS[existing.status] ?? [];
      if (!allowedNext.includes(status)) {
        throw new ConflictError(`لا يمكن نقل الرحلة من "${existing.status}" إلى "${status}" عبر PATCH`, { field: "status", fix: `استخدم /trips/:id/complete أو /trips/:id/cancel لإدارة دورة حياة الرحلة. الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` });
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
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
    const [row] = await rawQuery<any>(
      `UPDATE fleet_trips SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_trips",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.trip.updated",
      entity: "fleet_trips",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update trip error:"); }
});

router.delete("/trips/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, status FROM fleet_trips WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الرحلة غير موجودة");
    if (existing.status === "in_progress") {
      throw new ConflictError("لا يمكن حذف رحلة قيد التنفيذ", { field: "status", fix: "ألغِ الرحلة عبر /trips/:id/cancel أو أكملها قبل الحذف" });
    }
    await rawExecute(`UPDATE fleet_trips SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.trip.deleted",
      entity: "fleet_trips",
      entityId: id,
      before: { status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_trips", entityId: id,
      after: { status: existing.status },
    }).catch(console.error);

    res.json({ success: true, message: "تم حذف الرحلة" });
  } catch (err) { handleRouteError(err, res, "Delete trip error:"); }
});

router.patch("/maintenance/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الصيانة غير موجود");

    const { description, status, cost } = req.body as any;

    // State machine — lifecycle transitions still go through /complete + /cancel,
    // PATCH can only make non-lifecycle edits or same-status noops.
    if (status !== undefined && status !== existing.status) {
      if (!MAINTENANCE_STATUSES.includes(status)) {
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
      const allowedNext = MAINTENANCE_TRANSITIONS[existing.status] ?? [];
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
    const params: any[] = [];
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
    const [row] = await rawQuery<any>(
      `UPDATE fleet_maintenance SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_maintenance",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.maintenance.updated",
      entity: "fleet_maintenance",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update maintenance error:"); }
});

router.delete("/maintenance/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, status, "vehicleId" FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الصيانة غير موجود");
    if (existing.status === "in_progress") {
      throw new ConflictError("لا يمكن حذف صيانة قيد التنفيذ", { field: "status", fix: "ألغِ الصيانة عبر /maintenance/:id/cancel أو أكملها قبل الحذف" });
    }
    await rawExecute(`UPDATE fleet_maintenance SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.maintenance.deleted",
      entity: "fleet_maintenance",
      entityId: id,
      before: { status: existing.status, vehicleId: existing.vehicleId },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_maintenance", entityId: id,
      after: { status: existing.status, vehicleId: existing.vehicleId },
    }).catch(console.error);

    res.json({ success: true, message: "تم حذف سجل الصيانة" });
  } catch (err) { handleRouteError(err, res, "Delete maintenance error:"); }
});

router.patch("/fuel-logs/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الوقود غير موجود");

    const { liters, quantity, costPerLiter, totalCost, stationName } = req.body as any;
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
    const params: any[] = [];
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
    const [row] = await rawQuery<any>(
      `UPDATE fleet_fuel_logs SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_fuel_logs",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.fuel_log.updated", entity: "fleet_fuel_logs", entityId: id,
      details: JSON.stringify({ id, ...after }),
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update fuel log error:"); }
});

router.delete("/fuel-logs/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل الوقود غير موجود");
    await rawExecute(`UPDATE fleet_fuel_logs SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.fuel_log.deleted",
      entity: "fleet_fuel_logs",
      entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_fuel_logs", entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ success: true, message: "تم حذف سجل الوقود" });
  } catch (err) { handleRouteError(err, res, "Delete fuel log error:"); }
});

router.patch("/insurance/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_insurance WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("سجل التأمين غير موجود");

    const { provider, policyNumber, premium, endDate } = req.body as any;

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
      if (existing.startDate && ed <= new Date(existing.startDate)) {
        throw new ValidationError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية", { field: "endDate", fix: "اختر تاريخاً لاحقاً لتاريخ بداية الوثيقة" });
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
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
    const [row] = await rawQuery<any>(
      `UPDATE fleet_insurance SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "fleet_insurance",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.insurance.updated", entity: "fleet_insurance", entityId: id,
      details: JSON.stringify({ id, ...after }),
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update insurance error:"); }
});

router.delete("/insurance/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_insurance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("سجل التأمين غير موجود");
    await rawExecute(`UPDATE fleet_insurance SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "fleet.insurance.deleted",
      entity: "fleet_insurance",
      entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "fleet_insurance", entityId: id,
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ success: true, message: "تم حذف سجل التأمين" });
  } catch (err) { handleRouteError(err, res, "Delete insurance error:"); }
});

router.get("/stats", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [vehicles] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available, COUNT(*) FILTER (WHERE status='in_use') as "inUse", COUNT(*) FILTER (WHERE status='maintenance') as "inMaintenance" FROM fleet_vehicles WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [trips] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='completed') as completed FROM fleet_trips WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [fuel] = await rawQuery<any>(`SELECT COALESCE(SUM("totalCost"),0) as "totalFuelCost" FROM fleet_fuel_logs WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [insurance] = await rawQuery<any>(`SELECT COUNT(*) as total FROM fleet_insurance WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [maintenance] = await rawQuery<any>(`SELECT COUNT(*) as total FROM fleet_maintenance WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [drivers] = await rawQuery<any>(`SELECT COUNT(*) as total FROM fleet_drivers WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [alerts] = await rawQuery<any>(`SELECT COUNT(*) as total FROM fleet_maintenance WHERE "companyId"=$1 AND status='in_progress' AND "deletedAt" IS NULL`, [cid]);
    res.json({
      totalVehicles: Number(vehicles.total), availableVehicles: Number(vehicles.available),
      inUseVehicles: Number(vehicles.inUse), inMaintenanceVehicles: Number(vehicles.inMaintenance),
      totalTrips: Number(trips.total), completedTrips: Number(trips.completed),
      totalFuelCost: Number(fuel.totalFuelCost), totalInsurance: Number(insurance.total),
      totalMaintenance: Number(maintenance.total), activeAlerts: Number(alerts.total),
      totalDrivers: Number(drivers.total),
      vehicles, trips,
    });
  } catch (err) { handleRouteError(err, res, "Fleet stats error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PREVENTIVE MAINTENANCE PLANS — خطة الصيانة الوقائية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/preventive-plans", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId } = req.query as any;
    const conditions = [`p."companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (vehicleId) { params.push(Number(vehicleId)); conditions.push(`p."vehicleId"=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT p.*, v."plateNumber", v."currentMileage"
       FROM fleet_preventive_plans p
       JOIN fleet_vehicles v ON v.id=p."vehicleId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY p."nextServiceDate" ASC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Preventive plans error:"); }
});

router.post("/preventive-plans", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.vehicleId) {
      throw new ValidationError("المركبة مطلوبة", { field: "vehicleId", fix: "اختر المركبة التي ستُنشأ لها خطة الصيانة" });
    }
    if (!b.serviceType || typeof b.serviceType !== "string" || !b.serviceType.trim()) {
      throw new ValidationError("نوع الخدمة مطلوب", { field: "serviceType", fix: "اختر نوع الصيانة الوقائية (تغيير زيت، فلتر هواء، إلخ)" });
    }
    if (!b.intervalKm && !b.intervalDays) {
      throw new ValidationError("فترة الصيانة مطلوبة — كم أو أيام", { field: "intervalKm", fix: "أدخل فترة الصيانة بالكيلومترات أو بالأيام (أو كليهما)" });
    }
    const [vehicleRow] = await rawQuery<any>(
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
      nextServiceDate = lastDate.toISOString().split("T")[0];
    }
    if (!nextServiceMileage && b.lastServiceMileage && b.intervalKm) {
      nextServiceMileage = Number(b.lastServiceMileage) + Number(b.intervalKm);
    }

    // If neither interval was provided, also try fetching vehicle current mileage
    if (!nextServiceMileage && b.intervalKm) {
      const [vehicle] = await rawQuery<any>(
        `SELECT "currentMileage" FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2`,
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
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_preventive_plans WHERE id=$1`, [insertId]);
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.preventive.created", entity: "fleet_preventive_plans", entityId: insertId,
      details: JSON.stringify({ vehicleId: b.vehicleId, serviceType: b.serviceType }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "fleet_preventive_plans", entityId: insertId,
      after: { vehicleId: b.vehicleId, serviceType: b.serviceType, intervalKm: b.intervalKm, intervalDays: b.intervalDays },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create preventive plan error:"); }
});

router.patch("/preventive-plans/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];

    // Fetch existing plan to recompute due values when last service is updated
    const [existing] = await rawQuery<any>(
      `SELECT p.*, v."currentMileage" FROM fleet_preventive_plans p
       JOIN fleet_vehicles v ON v.id=p."vehicleId"
       WHERE p.id=$1 AND p."companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الخطة غير موجودة");

    if (b.nextServiceDate !== undefined) { params.push(b.nextServiceDate); sets.push(`"nextServiceDate"=$${params.length}`); }
    if (b.nextServiceMileage !== undefined) { params.push(b.nextServiceMileage); sets.push(`"nextServiceMileage"=$${params.length}`); }
    if (b.lastServiceDate !== undefined) { params.push(b.lastServiceDate); sets.push(`"lastServiceDate"=$${params.length}`); }
    if (b.lastServiceMileage !== undefined) { params.push(b.lastServiceMileage); sets.push(`"lastServiceMileage"=$${params.length}`); }
    if (b.estimatedCost !== undefined) { params.push(b.estimatedCost); sets.push(`"estimatedCost"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }

    // When last service date/mileage is updated and no explicit next values, recompute from intervals
    const effectiveLastDate = b.lastServiceDate ?? existing.lastServiceDate;
    const effectiveLastMileage = b.lastServiceMileage ?? existing.lastServiceMileage;

    if ((b.lastServiceDate !== undefined || b.lastServiceMileage !== undefined) && b.nextServiceDate === undefined) {
      if (effectiveLastDate && existing.intervalDays) {
        const d = new Date(effectiveLastDate);
        d.setDate(d.getDate() + Number(existing.intervalDays));
        const nextDate = d.toISOString().split("T")[0];
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
    const rows = await rawQuery<any>(
      `UPDATE fleet_preventive_plans SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("الخطة غير موجودة");

    if (b.partsUsed && Array.isArray(b.partsUsed) && b.partsUsed.length > 0) {
      fleetEngine.requestWarehouseDeduction(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
        { maintenanceId: id, parts: b.partsUsed }
      );
    }

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "fleet.preventive.updated", entity: "fleet_preventive_plans", entityId: id,
      details: JSON.stringify({ id }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "fleet_preventive_plans", entityId: id,
      after: { ...b },
    }).catch(console.error);

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update preventive plan error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRAFFIC VIOLATIONS — مخالفات مرورية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/traffic-violations", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId, driverId } = req.query as any;
    const conditions = [`tv."companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (vehicleId) { params.push(Number(vehicleId)); conditions.push(`tv."vehicleId"=$${params.length}`); }
    if (driverId) { params.push(Number(driverId)); conditions.push(`tv."driverId"=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT tv.*, v."plateNumber", d.name AS "driverName"
       FROM fleet_traffic_violations tv
       LEFT JOIN fleet_vehicles v ON v.id=tv."vehicleId" AND v."deletedAt" IS NULL
       LEFT JOIN fleet_drivers d ON d.id=tv."driverId" AND d."deletedAt" IS NULL
       WHERE ${conditions.join(" AND ")} AND tv."deletedAt" IS NULL
       ORDER BY tv."violationDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Traffic violations error:"); }
});

router.get("/traffic-violations/:id", requirePermission("fleet:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (req.path.includes("/pay")) return;
    const [row] = await rawQuery<any>(
      `SELECT tv.*, v."plateNumber", d.name AS "driverName"
       FROM fleet_traffic_violations tv
       LEFT JOIN fleet_vehicles v ON v.id=tv."vehicleId" AND v."deletedAt" IS NULL
       LEFT JOIN fleet_drivers d ON d.id=tv."driverId" AND d."deletedAt" IS NULL
       WHERE tv.id = $1 AND tv."companyId" = $2 AND tv."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة المرورية غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Traffic violation detail error:"); }
});

router.post("/traffic-violations", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
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
    const [vehicleRow] = await rawQuery<any>(
      `SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId]
    );
    if (!vehicleRow) {
      throw new ValidationError("المركبة غير موجودة", { field: "vehicleId", fix: "اختر مركبة مسجلة" });
    }
    if (b.driverId) {
      const [driverRow] = await rawQuery<any>(
        `SELECT id FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.driverId, scope.companyId]
      );
      if (!driverRow) {
        throw new ValidationError("السائق غير موجود", { field: "driverId", fix: "اختر سائقاً مسجلاً في النظام" });
      }
    }
    // "company" (default) = company pays the fine → GL expense.
    // "driver" = fine liability shifted to driver → payroll deduction in current period.
    const liability: 'company' | 'driver' = b.liability === 'driver' ? 'driver' : 'company';

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_traffic_violations
       ("companyId","vehicleId","driverId","violationType","violationDate","fineAmount","location","violationNumber",status,notes,"paidAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
      [scope.companyId, b.vehicleId, b.driverId || null, b.violationType,
       b.violationDate || new Date().toISOString().split('T')[0],
       fineAmount, b.location || null, b.violationNumber || null,
       b.notes || null, null]
    );

    // GL posting — company-borne fines hit expense account immediately. If
    // the GL fails we roll back the violation row so we never have a visible
    // fine without its accounting impact.
    let journalEntryId: number | null = null;
    if (fineAmount > 0 && liability === 'company') {
      try {
        const { fleetEngine } = await import("../lib/engines/index.js");
        const glResult = await fleetEngine.postTrafficViolationGL(
          { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
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
        console.error("Traffic violation journal entry failed:", jeErr);
        await rawExecute(`UPDATE fleet_traffic_violations SET "deletedAt" = NOW() WHERE id=$1`, [insertId]).catch(console.error);
        throw new IntegrationError("تعذّر إنشاء القيد المحاسبي للمخالفة — لم يتم تسجيل المخالفة", { field: "journalEntry", fix: "تحقق من إعدادات ربط الحسابات (fleet_fines_expense / fleet_fines_payable) ثم أعد المحاولة" });
      }
    }

    // Driver-liability: request a payroll deduction via Fleet Engine →
    // HR Engine event boundary (no direct write to HR-owned table).
    let driverAssignmentId: number | null = null;
    if (fineAmount > 0 && liability === 'driver' && b.driverId) {
      try {
        const [driver] = await rawQuery<any>(
          `SELECT fd."employeeId", ea.id AS "assignmentId"
           FROM fleet_drivers fd
           LEFT JOIN employee_assignments ea ON ea."employeeId" = fd."employeeId" AND ea."companyId" = fd."companyId" AND ea.status = 'active'
           WHERE fd.id = $1 AND fd."companyId" = $2`,
          [b.driverId, scope.companyId]
        );
        if (driver?.employeeId) {
          const { fleetEngine } = await import("../lib/engines/index.js");
          await fleetEngine.requestPayrollDeduction(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
            {
              employeeId: driver.employeeId,
              violationId: insertId,
              amount: fineAmount,
              reason: `مخالفة مرورية: ${b.violationType}`,
            }
          );
          driverAssignmentId = driver.assignmentId ?? null;
        }
      } catch (pdErr) {
        console.error("Traffic violation payroll deduction request failed:", pdErr);
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
        }).catch(console.error);
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
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.traffic_violation.created", entity: "fleet_traffic_violations", entityId: insertId,
      details: `${b.violationType} — ${fineAmount} ﷼ — ${liability === 'driver' ? 'على السائق' : 'على الشركة'}`,
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_traffic_violations WHERE id=$1`, [insertId]);
    res.status(201).json({ ...row, journalEntryId, liability });
  } catch (err) { handleRouteError(err, res, "Create traffic violation error:"); }
});

router.patch("/traffic-violations/:id/pay", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM fleet_traffic_violations WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المخالفة غير موجودة");

    // State machine: must be pending or disputed to pay. paid/cancelled are terminal.
    const allowedNext = VIOLATION_TRANSITIONS[existing.status] ?? [];
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
        console.error("Traffic violation payment JE failed:", jeErr);
        throw new IntegrationError("فشل قيد السداد — لم يتم تسجيل العملية", { field: "journalEntry", fix: "راجع إعدادات الحسابات المالية (2100 / 1100) ثم أعد المحاولة" });
      }
    }

    await rawExecute(
      `UPDATE fleet_traffic_violations SET status='paid', "paidAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "pay", entity: "fleet_traffic_violations", entityId: id,
      before: { status: existing.status }, after: { status: "paid", fineAmount },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.traffic_violation.paid", entity: "fleet_traffic_violations", entityId: id,
      details: `سداد مخالفة ${existing.violationNumber ?? id} بقيمة ${fineAmount}`,
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_traffic_violations WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Pay violation error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TCO ANALYSIS — تحليل التكلفة الكلية للمركبة
// ─────────────────────────────────────────────────────────────────────────────

router.get("/vehicles/:id/tco", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = Number(req.params.id);

    const [vehicle] = await rawQuery<any>(
      `SELECT v.*, d.name AS "driverName"
       FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id=v."assignedDriverId"
       WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`,
      [vehicleId, scope.companyId]
    );
    if (!vehicle) throw new NotFoundError("المركبة غير موجودة");

    const [fuelCost] = await rawQuery<any>(
      `SELECT COALESCE(SUM("totalCost"),0) AS total, COALESCE(SUM(liters),0) AS liters,
              COALESCE(SUM(CASE WHEN "mileageAtFuel" IS NOT NULL THEN "totalCost" ELSE 0 END),0) AS "withMileage"
       FROM fleet_fuel_logs WHERE "vehicleId"=$1`,
      [vehicleId]
    );
    const [maintenanceCost] = await rawQuery<any>(
      `SELECT COALESCE(SUM(cost),0) AS total FROM fleet_maintenance WHERE "vehicleId"=$1 AND "deletedAt" IS NULL`,
      [vehicleId]
    );
    const [insuranceCost] = await rawQuery<any>(
      `SELECT COALESCE(SUM(premium),0) AS total FROM fleet_insurance WHERE "vehicleId"=$1`,
      [vehicleId]
    );
    const [tripRevenue] = await rawQuery<any>(
      `SELECT COALESCE(SUM(cost),0) AS revenue, COUNT(*) AS trips,
              COALESCE(SUM(distance),0) AS "totalKm"
       FROM fleet_trips WHERE "vehicleId"=$1 AND status='completed'`,
      [vehicleId]
    );
    const [trafficFines] = await rawQuery<any>(
      `SELECT COALESCE(SUM("fineAmount"),0) AS total FROM fleet_traffic_violations WHERE "vehicleId"=$1 AND "companyId"=$2`,
      [vehicleId, scope.companyId]
    );

    const purchasePrice = Number(vehicle.purchasePrice || 0);
    const yearsSincePurchase = vehicle.purchaseDate
      ? (Date.now() - new Date(vehicle.purchaseDate).getTime()) / (365.25 * 24 * 3600 * 1000)
      : 1;
    const annualDepreciation = purchasePrice > 0 ? purchasePrice * 0.2 : 0;
    const totalDepreciation = Math.round(annualDepreciation * yearsSincePurchase * 100) / 100;

    const fuelTotal = Number(fuelCost.total);
    const maintenanceTotal = Number(maintenanceCost.total);
    const insuranceTotal = Number(insuranceCost.total);
    const finesTotal = Number(trafficFines?.total || 0);
    const totalCost = purchasePrice + fuelTotal + maintenanceTotal + insuranceTotal + finesTotal;
    const totalKm = Number(tripRevenue.totalKm) || Number(vehicle.currentMileage) || 1;
    const costPerKm = totalKm > 0 ? Math.round((totalCost / totalKm) * 100) / 100 : 0;

    res.json({
      vehicleId, plateNumber: vehicle.plateNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year,
      purchasePrice, totalDepreciation,
      fuelCost: fuelTotal, maintenanceCost: maintenanceTotal,
      insuranceCost: insuranceTotal, trafficFines: finesTotal,
      totalCost: Math.round(totalCost * 100) / 100,
      totalKm, costPerKm,
      totalTrips: Number(tripRevenue.trips),
      yearsSincePurchase: Math.round(yearsSincePurchase * 100) / 100,
      breakdown: {
        purchase: purchasePrice,
        depreciation: totalDepreciation,
        fuel: fuelTotal,
        maintenance: maintenanceTotal,
        insurance: insuranceTotal,
        fines: finesTotal,
      },
    });
  } catch (err) { handleRouteError(err, res, "TCO analysis error:"); }
});

export default router;
