import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { haversineKm } from "../lib/algorithms.js";
import { createAuditLog, createNotification, createJournalEntry } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { eventBus } from "../lib/eventBus.js";
import { getVehicleStatusImpact } from "../lib/impactPreview.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";

const router = Router();
router.use(authMiddleware);

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
    const rows = await rawQuery<any>(`SELECT v.*, d.name AS "driverName", (SELECT COUNT(*) FROM gov_integration_links gl WHERE gl."entityType" = 'vehicle' AND gl."entityId" = v.id AND gl."companyId" = v."companyId")::int AS "govLinkCount", (SELECT MAX(fi."endDate") FROM fleet_insurance fi WHERE fi."vehicleId" = v.id AND fi."companyId" = v."companyId") AS "insuranceExpiry" FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id = v."assignedDriverId" WHERE ${where} AND v."deletedAt" IS NULL ORDER BY v.id DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet vehicles error:"); }
});

router.post("/vehicles", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (!b.plateNumber) {
      res.status(400).json({ error: "رقم اللوحة مطلوب" });
      return;
    }
    const [existingVehicle] = await rawQuery<any>(
      `SELECT id FROM fleet_vehicles WHERE "plateNumber" = $1 AND "companyId" = $2`,
      [b.plateNumber, scope.companyId]
    );
    if (existingVehicle) {
      res.status(409).json({ error: "رقم اللوحة مسجل مسبقاً" });
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_vehicles ("companyId","plateNumber",make,model,year,color,"vinNumber","fuelType","currentMileage",status,"branchId",notes,"registrationNumber","registrationExpiry","inspectionDate","nextInspectionDate","plateType","sequenceNumber","insuranceExpiry") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [scope.companyId, b.plateNumber, b.make, b.model, b.year, b.color, b.vinNumber, b.fuelType || 'gasoline', b.currentMileage || 0, 'available', b.branchId || scope.branchId, b.notes, b.registrationNumber || null, b.registrationExpiry || null, b.inspectionDate || null, b.nextInspectionDate || null, b.plateType || null, b.sequenceNumber || null, b.insuranceExpiry || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_vehicles WHERE id=$1`, [insertId]);
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
       WHERE ${where}
       ORDER BY d.name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet drivers error:"); }
});

router.post("/drivers", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_drivers ("companyId",name,phone,"licenseNumber","licenseExpiry","licenseType","employeeId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, b.name, b.phone, b.licenseNumber, b.licenseExpiry, b.licenseType, b.employeeId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_drivers WHERE id=$1`, [insertId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "fleet_drivers",
      entityId: insertId,
      after: { name: b.name, phone: b.phone, licenseNumber: b.licenseNumber, employeeId: b.employeeId },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create driver error:"); }
});

router.get("/vehicles/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const vehicleId = Number(req.params.id);
    const [row] = await rawQuery<any>(`SELECT v.*, d.name AS "driverName", d.phone AS "driverPhone" FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id = v."assignedDriverId" WHERE v.id=$1 AND v."companyId"=$2`, [vehicleId, scope.companyId]);
    if (!row) { res.status(404).json({ error: "المركبة غير موجودة" }); return; }
    const [trips, maintenance, fuelLogs, insurance] = await Promise.all([
      rawQuery<any>(
        `SELECT t.id, t."fromLocation", t."toLocation", t.distance, t.cost, t.status, t."startTime", t."endTime", d.name AS "driverName"
         FROM fleet_trips t LEFT JOIN fleet_drivers d ON d.id=t."driverId"
         WHERE t."vehicleId"=$1 AND t."companyId"=$2 ORDER BY t.id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, type, description, cost, "serviceDate", status, "mileageAtService", "nextServiceDate"
         FROM fleet_maintenance WHERE "vehicleId"=$1 AND "companyId"=$2 ORDER BY id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, "fuelDate", liters, "costPerLiter", "totalCost", "mileageAtFuel", "stationName"
         FROM fleet_fuel_logs WHERE "vehicleId"=$1 AND "companyId"=$2 ORDER BY id DESC LIMIT 20`,
        [vehicleId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, type, provider, "policyNumber", "startDate", "endDate", premium
         FROM fleet_insurance WHERE "vehicleId"=$1 AND "companyId"=$2 ORDER BY "endDate" DESC LIMIT 5`,
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
    if (!status) { res.status(400).json({ error: "status مطلوب" }); return; }
    const preview = await getVehicleStatusImpact(id, scope.companyId, status);
    res.json(preview);
  } catch (err) { handleRouteError(err, res, "Vehicle impact preview error:"); }
});

router.patch("/vehicles/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المركبة غير موجودة" }); return; }
    const b = req.body;
    if (b.status !== undefined && b.status !== existing.status) {
      const preview = await getVehicleStatusImpact(id, scope.companyId, b.status);
      if (!preview.canProceed) {
        res.status(422).json({ error: "لا يمكن تغيير الحالة", blockers: preview.blockers });
        return;
      }
    }
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.plateNumber !== undefined) { params.push(b.plateNumber); sets.push(`"plateNumber"=$${params.length}`); }
    if (b.make !== undefined) { params.push(b.make); sets.push(`make=$${params.length}`); }
    if (b.model !== undefined) { params.push(b.model); sets.push(`model=$${params.length}`); }
    if (b.year !== undefined) { params.push(b.year); sets.push(`year=$${params.length}`); }
    if (b.color !== undefined) { params.push(b.color); sets.push(`color=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.fuelType !== undefined) { params.push(b.fuelType); sets.push(`"fuelType"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.assignedDriverId !== undefined) { params.push(b.assignedDriverId); sets.push(`"assignedDriverId"=$${params.length}`); }
    if (b.registrationNumber !== undefined) { params.push(b.registrationNumber); sets.push(`"registrationNumber"=$${params.length}`); }
    if (b.registrationExpiry !== undefined) { params.push(b.registrationExpiry || null); sets.push(`"registrationExpiry"=$${params.length}`); }
    if (b.inspectionDate !== undefined) { params.push(b.inspectionDate || null); sets.push(`"inspectionDate"=$${params.length}`); }
    if (b.nextInspectionDate !== undefined) { params.push(b.nextInspectionDate || null); sets.push(`"nextInspectionDate"=$${params.length}`); }
    if (b.plateType !== undefined) { params.push(b.plateType); sets.push(`"plateType"=$${params.length}`); }
    if (b.sequenceNumber !== undefined) { params.push(b.sequenceNumber); sets.push(`"sequenceNumber"=$${params.length}`); }
    if (b.vinNumber !== undefined) { params.push(b.vinNumber); sets.push(`"vinNumber"=$${params.length}`); }
    params.push(id);
    await rawExecute(`UPDATE fleet_vehicles SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    if (b.status !== undefined && b.status !== existing.status) {
      await createAuditLog({
        userId: scope.userId,
        entity: "fleet_vehicles",
        entityId: id,
        action: "status_change",
        before: { status: existing.status },
        after: { status: b.status },
        companyId: scope.companyId,
      });
    }
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_vehicles WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update vehicle error:"); }
});

router.delete("/vehicles/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المركبة غير موجودة" }); return; }
    await rawExecute(`UPDATE fleet_vehicles SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المركبة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete vehicle error:"); }
});

router.get("/drivers/:id", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_drivers WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "السائق غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get driver error:"); }
});

router.patch("/drivers/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_drivers WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "السائق غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.phone !== undefined) { params.push(b.phone); sets.push(`phone=$${params.length}`); }
    if (b.licenseNumber !== undefined) { params.push(b.licenseNumber); sets.push(`"licenseNumber"=$${params.length}`); }
    if (b.licenseExpiry !== undefined) { params.push(b.licenseExpiry); sets.push(`"licenseExpiry"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id);
    await rawExecute(`UPDATE fleet_drivers SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM fleet_drivers WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update driver error:"); }
});

router.delete("/drivers/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "السائق غير موجود" }); return; }
    await rawExecute(`UPDATE fleet_drivers SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
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
      `SELECT t.*, v."plateNumber", d.name AS "driverName" FROM fleet_trips t LEFT JOIN fleet_vehicles v ON v.id=t."vehicleId" LEFT JOIN fleet_drivers d ON d.id=t."driverId" WHERE ${where} AND t."deletedAt" IS NULL ORDER BY t.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet trips error:"); }
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
          validationError(res, "لا يمكن بدء رحلة بدون سائق مرتبط بالمركبة", "driverId", "عيّن سائقاً للمركبة أو حدد سائقاً في الطلب");
          return;
        }
        const insuranceEnd = vehicle.insuranceEnd ? new Date(vehicle.insuranceEnd) : null;
        if (!insuranceEnd || insuranceEnd < new Date()) {
          validationError(res, "لا يمكن بدء رحلة بمركبة تأمينها منتهي", "vehicleId", "جدد تأمين المركبة قبل بدء الرحلة");
          return;
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
         WHERE v."companyId"=$1 AND v.status='available'
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
          validationError(res, "لا يمكن بدء رحلة بمركبة تأمينها منتهي", "vehicleId", "جدد تأمين المركبة قبل بدء الرحلة أو حدد مركبة بتأمين ساري");
          return;
        }
      }
    }

    if (!selectedDriverId) {
      validationError(res, "لا يمكن تسليم مركبة بدون سائق مرتبط", "driverId", "حدد سائقاً للرحلة أو أضف سائقين متاحين في النظام");
      return;
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

    // Emit on the event bus so eventListeners.ts can write an audit_logs row
    // and any future rule / analytics subscriber gets the notification. Before
    // this we only wrote an audit row manually — the listener was dead.
    eventBus.emit("fleet.trip.started", {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "fleet_trips",
      entityId: insertId,
      action: "create",
      after: {
        vehicleId: selectedVehicleId,
        driverId: selectedDriverId,
        distance: estimatedDistanceKm,
        cost: totalEstimatedCost,
        fromLocation: b.fromLocation,
        toLocation: b.toLocation,
      },
    });

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_trips WHERE id=$1`, [insertId]);
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
    if (!trip) { res.status(404).json({ error: "الرحلة غير موجودة" }); return; }

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

    let journalEntryId: number | null = null;
    try {
      journalEntryId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.userId,
        ref: `JE-FLEET-${tripId}-${Date.now()}`,
        description: `تكلفة رحلة #${tripId} — وقود: ${actualFuelCost.toFixed(2)} + أجرة: ${driverFare.toFixed(2)} + استهلاك: ${depreciation.toFixed(2)} = ${totalCost.toFixed(2)} ريال`,
        lines: [
          { accountCode: "5200", debit: actualFuelCost, credit: 0 },
          { accountCode: "5210", debit: driverFare, credit: 0 },
          { accountCode: "5220", debit: depreciation, credit: 0 },
          { accountCode: "1000", debit: 0, credit: totalCost },
        ],
      });
    } catch (jeErr) {
      console.error("Journal entry creation failed for trip", tripId, jeErr);
    }

    try {
      await rawExecute(
        `INSERT INTO event_logs ("companyId","userId",action,entity,"entityId",details) VALUES ($1,$2,$3,$4,$5,$6)`,
        [scope.companyId, scope.userId, 'fleet.trip.completed', 'fleet_trips', String(tripId), JSON.stringify({ tripId, vehicleId: trip.vehicleId, driverId: trip.driverId, distanceKm: actualDistanceKm, fuelCost: actualFuelCost, driverFare, depreciation, totalCost, journalEntryId })]
      );
    } catch (evtErr) {
      console.error("Event log creation failed for trip", tripId, evtErr);
    }

    // Bus emission — closes the fleet.trip.started → fleet.trip.completed
    // pair so rules engine + audit-log subscribers see the full lifecycle.
    eventBus.emit("fleet.trip.completed", {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "fleet_trips",
      entityId: tripId,
      action: "update",
      before: { status: trip.status, distance: trip.distance, cost: trip.cost },
      after: {
        status: "completed",
        distance: actualDistanceKm,
        cost: totalCost,
        fuelCost: actualFuelCost,
        driverFare,
        depreciation,
        journalEntryId,
      },
    });

    const [updated] = await rawQuery<any>(`SELECT * FROM fleet_trips WHERE id=$1`, [tripId]);
    res.json({
      ...updated,
      event: 'fleet.trip.completed',
      journalEntryId,
      costBreakdown: { fuel: actualFuelCost, driverFare, depreciation, total: totalCost },
    });
  } catch (err) { handleRouteError(err, res, "Complete trip error:"); }
});

router.post("/trips/:id/cancel", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const tripId = Number(req.params.id);
    const reason = (req.body?.reason as string | undefined)?.trim();
    if (!reason) {
      validationError(res, "سبب الإلغاء مطلوب", "reason", "اكتب سبب إلغاء الرحلة");
      return;
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
    const [trip] = await rawQuery<any>(`SELECT "vehicleId","driverId" FROM fleet_trips WHERE id=$1 AND "companyId"=$2`, [tripId, scope.companyId]);
    if (!trip) { res.status(404).json({ error: "الرحلة غير موجودة" }); return; }
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_gps_tracking ("vehicleId","driverId",latitude,longitude,speed,"recordedAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
      [trip.vehicleId, trip.driverId, b.lat || b.latitude, b.lon || b.longitude, b.speed || 0]
    );
    res.status(201).json({ id: insertId, tripId, lat: b.lat || b.latitude, lon: b.lon || b.longitude });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
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
      `SELECT m.*, v."plateNumber" FROM fleet_maintenance m LEFT JOIN fleet_vehicles v ON v.id=m."vehicleId" WHERE ${where} AND m."deletedAt" IS NULL ORDER BY m.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet maintenance error:"); }
});

router.post("/maintenance", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    const mechanics = await rawQuery<any>(
      `SELECT e.* FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active' WHERE e.status='active' ORDER BY e.id LIMIT 5`,
      [scope.companyId]
    );
    const assignedMechanic = b.performedBy || (mechanics[0]?.name ?? null);

    const nextServiceDate = new Date();
    nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_maintenance ("companyId","vehicleId",type,description,cost,"mileageAtService","serviceDate","performedBy",status,"nextServiceDate") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.vehicleId, b.type, b.description, b.cost || 0, b.mileageAtService, b.serviceDate || new Date().toISOString().split('T')[0], assignedMechanic, b.status || 'in_progress', nextServiceDate.toISOString().split('T')[0]]
    );

    if (b.vehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='maintenance', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [b.vehicleId, scope.companyId]);
    }

    if (b.partsUsed && Array.isArray(b.partsUsed)) {
      for (const part of b.partsUsed) {
        try {
          await rawExecute(`UPDATE warehouse_products SET "currentStock"="currentStock"-$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`, [part.quantity, part.productId, scope.companyId]);
          await rawExecute(
            `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy") VALUES ($1,$2,'out',$3,$4,$5,$6,$7)`,
            [scope.companyId, part.productId, part.quantity, part.unitCost || 0, `MAINT-${insertId}`, `صيانة مركبة - طلب #${insertId}`, scope.userId]
          );
        } catch (partErr) {
          console.error(`Failed to deduct part ${part.productId} for maintenance ${insertId}:`, partErr);
        }
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_maintenance WHERE id=$1`, [insertId]);

    if (b.type && ["breakdown", "emergency"].includes(b.type)) {
      const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [b.vehicleId]);
      eventBus.emit("fleet.vehicle.breakdown", {
        companyId: scope.companyId,
        entityId: b.vehicleId,
        plateNumber: vehicle?.plateNumber || `مركبة #${b.vehicleId}`,
        description: b.description,
        source: "manual_maintenance",
        userId: scope.userId,
      });
    }

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create maintenance error:"); }
});

router.post("/maintenance/:id/complete", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const [m] = await rawQuery<any>(`SELECT * FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!m) { res.status(404).json({ error: "سجل الصيانة غير موجود" }); return; }
    const finalCost = Number(b.cost || m.cost || 0);
    await rawExecute(`UPDATE fleet_maintenance SET status='completed', cost=$1 WHERE id=$2`, [finalCost, id]);
    if (m.vehicleId) {
      await rawExecute(`UPDATE fleet_vehicles SET status='available', "lastMaintenanceDate"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [m.vehicleId, scope.companyId]);
    }

    // Auto journal entry for maintenance cost
    if (finalCost > 0) {
      try {
        const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [m.vehicleId]);
        const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
        await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.activeAssignmentId ?? scope.userId,
          ref: `MAINT-${id}`,
          description: `مصروف صيانة مركبة${plateLabel} / ${m.type ?? ""} / ${m.description ?? ""}`,
          lines: [
            { accountCode: "5300", debit: finalCost, credit: 0 },
            { accountCode: "1100", debit: 0, credit: finalCost },
          ],
        });
      } catch (jErr) { console.error("Maintenance journal entry failed:", jErr); }
    }

    res.json({ ...m, status: 'completed', cost: finalCost });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
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
       FROM fleet_insurance i JOIN fleet_vehicles v ON v.id=i."vehicleId"
       WHERE i."companyId"=$1 AND i."endDate" BETWEEN $2 AND $3`,
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
      `SELECT v."plateNumber", v."currentMileage", m."mileageAtService" FROM fleet_vehicles v LEFT JOIN fleet_maintenance m ON m.id=(SELECT id FROM fleet_maintenance WHERE "vehicleId"=v.id AND type='oil_change' ORDER BY "mileageAtService" DESC LIMIT 1) WHERE v."companyId"=$1 AND (v."currentMileage" - COALESCE(m."mileageAtService",0)) >= 5000`,
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
      `SELECT f.*, v."plateNumber" FROM fleet_fuel_logs f LEFT JOIN fleet_vehicles v ON v.id=f."vehicleId" WHERE ${where} AND f."deletedAt" IS NULL ORDER BY f.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Fleet fuel error:"); }
});

router.post("/fuel-logs", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const vehicleId = b.vehicleId || null;
    const vehiclePlate = b.vehiclePlate || null;
    let resolvedVehicleId = vehicleId;
    if (!resolvedVehicleId && vehiclePlate) {
      const [v] = await rawQuery<any>(`SELECT id FROM fleet_vehicles WHERE "plateNumber"=$1 AND "companyId"=$2`, [vehiclePlate, scope.companyId]);
      if (v) resolvedVehicleId = v.id;
    }
    const liters = Number(b.liters) || 0;

    if (liters <= 0) {
      validationError(res, "كمية الوقود يجب أن تكون أكبر من صفر", "liters", "أدخل كمية الوقود باللتر");
      return;
    }

    if (resolvedVehicleId) {
      const [veh] = await rawQuery<any>(
        `SELECT "fuelCapacity" FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2`,
        [resolvedVehicleId, scope.companyId]
      );
      const tankCapacity = Number(veh?.fuelCapacity ?? 0);
      if (tankCapacity > 0 && liters > tankCapacity) {
        validationError(
          res,
          `لا يمكن تسجيل وقود يتجاوز سعة الخزان (${tankCapacity} لتر). الكمية المدخلة: ${liters} لتر`,
          "liters",
          `أدخل كمية لا تتجاوز سعة خزان المركبة (${tankCapacity} لتر)`
        );
        return;
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
      try {
        const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [resolvedVehicleId]);
        const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
        await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.activeAssignmentId ?? scope.userId,
          ref: `FUEL-${insertId}`,
          description: `مصروف وقود${plateLabel} / ${liters} لتر / ${stationName ?? ""}`,
          lines: [
            { accountCode: "5200", debit: totalCost, credit: 0 },
            { accountCode: "1100", debit: 0, credit: totalCost },
          ],
        });
      } catch (jErr) { console.error("Fuel log journal entry failed:", jErr); }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_fuel_logs WHERE id=$1`, [insertId]);
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

router.post("/insurance", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const premium = Number(b.premium || 0);
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_insurance ("companyId","vehicleId",type,provider,"policyNumber","startDate","endDate",premium) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, b.vehicleId, b.type || b.insuranceType || 'comprehensive', b.provider, b.policyNumber, b.startDate, b.endDate, premium]
    );

    // Auto journal entry for insurance premium
    if (premium > 0) {
      try {
        const [vehicle] = await rawQuery<any>(`SELECT "plateNumber" FROM fleet_vehicles WHERE id=$1`, [b.vehicleId]);
        const plateLabel = vehicle?.plateNumber ? ` / ${vehicle.plateNumber}` : "";
        const insuranceType = b.type || b.insuranceType || 'comprehensive';
        const insuranceTypeLabel = insuranceType === 'comprehensive' ? 'شامل' : insuranceType === 'third_party' ? 'طرف ثالث' : insuranceType;
        await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.activeAssignmentId ?? scope.userId,
          ref: `INS-${insertId}`,
          description: `مصروف تأمين${plateLabel} / ${insuranceTypeLabel} / ${b.provider ?? ""}`,
          lines: [
            { accountCode: "1350", debit: premium, credit: 0 },
            { accountCode: "1100", debit: 0, credit: premium },
          ],
        });
      } catch (jErr) { console.error("Insurance journal entry failed:", jErr); }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_insurance WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create insurance error:"); }
});

router.patch("/trips/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { fromLocation, toLocation, destination, status, notes, cost } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const finalTo = toLocation ?? destination;
    if (fromLocation !== undefined) { sets.push(`"fromLocation" = $${idx++}`); params.push(fromLocation); }
    if (finalTo !== undefined) { sets.push(`"toLocation" = $${idx++}`); params.push(finalTo); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(notes); }
    if (cost !== undefined) { sets.push(`cost = $${idx++}`); params.push(cost); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE fleet_trips SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "الرحلة غير موجودة" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/trips/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_trips WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الرحلة غير موجودة" }); return; }
    await rawExecute(`UPDATE fleet_trips SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.patch("/maintenance/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { description, status, cost } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (cost !== undefined) { sets.push(`cost = $${idx++}`); params.push(cost); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE fleet_maintenance SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "سجل الصيانة غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/maintenance/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_maintenance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "سجل الصيانة غير موجود" }); return; }
    await rawExecute(`UPDATE fleet_maintenance SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.patch("/fuel-logs/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { liters, quantity, costPerLiter, totalCost, stationName } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const finalLiters = liters ?? quantity;
    if (finalLiters !== undefined) { sets.push(`liters = $${idx++}`); params.push(finalLiters); }
    if (costPerLiter !== undefined) { sets.push(`"costPerLiter" = $${idx++}`); params.push(costPerLiter); }
    if (totalCost !== undefined) { sets.push(`"totalCost" = $${idx++}`); params.push(totalCost); }
    if (stationName !== undefined) { sets.push(`"stationName" = $${idx++}`); params.push(stationName); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE fleet_fuel_logs SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "سجل الوقود غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/fuel-logs/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_fuel_logs WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "سجل الوقود غير موجود" }); return; }
    await rawExecute(`UPDATE fleet_fuel_logs SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.patch("/insurance/:id", requirePermission("fleet:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { provider, policyNumber, premium, endDate } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (provider !== undefined) { sets.push(`provider = $${idx++}`); params.push(provider); }
    if (policyNumber !== undefined) { sets.push(`"policyNumber" = $${idx++}`); params.push(policyNumber); }
    if (premium !== undefined) { sets.push(`premium = $${idx++}`); params.push(premium); }
    if (endDate !== undefined) { sets.push(`"endDate" = $${idx++}`); params.push(endDate); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE fleet_insurance SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "سجل التأمين غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/insurance/:id", requirePermission("fleet:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM fleet_insurance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "سجل التأمين غير موجود" }); return; }
    await rawExecute(`UPDATE fleet_insurance SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/stats", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [vehicles] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available, COUNT(*) FILTER (WHERE status='in_use') as "inUse", COUNT(*) FILTER (WHERE status='maintenance') as "inMaintenance" FROM fleet_vehicles WHERE "companyId"=$1`, [cid]);
    const [trips] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='completed') as completed FROM fleet_trips WHERE "companyId"=$1`, [cid]);
    const [fuel] = await rawQuery<any>(`SELECT COALESCE(SUM("totalCost"),0) as "totalFuelCost" FROM fleet_fuel_logs WHERE "companyId"=$1`, [cid]);
    const [insurance] = await rawQuery<any>(`SELECT COUNT(*) as total FROM fleet_insurance WHERE "companyId"=$1`, [cid]);
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
    if (!b.vehicleId || !b.serviceType) {
      res.status(400).json({ error: "المركبة ونوع الخدمة مطلوبان" }); return;
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
    if (!existing) { res.status(404).json({ error: "الخطة غير موجودة" }); return; }

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
    if (!rows[0]) { res.status(404).json({ error: "الخطة غير موجودة" }); return; }

    // If parts were consumed during this service, deduct from warehouse inventory
    if (b.partsUsed && Array.isArray(b.partsUsed) && b.partsUsed.length > 0) {
      for (const part of b.partsUsed) {
        try {
          await rawExecute(
            `UPDATE warehouse_products SET "currentStock"="currentStock"-$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`,
            [part.quantity, part.productId, scope.companyId]
          );
          await rawExecute(
            `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy") VALUES ($1,$2,'out',$3,$4,$5,$6,$7)`,
            [scope.companyId, part.productId, part.quantity, part.unitCost || 0, `PM-PLAN-${id}`, `صيانة وقائية - خطة #${id} (${existing.serviceType})`, scope.userId]
          );
        } catch (partErr) {
          console.error(`Failed to deduct spare part ${part.productId} for preventive plan ${id}:`, partErr);
        }
      }
    }

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
       LEFT JOIN fleet_vehicles v ON v.id=tv."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id=tv."driverId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY tv."violationDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Traffic violations error:"); }
});

router.post("/traffic-violations", requirePermission("fleet:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.vehicleId || !b.violationType) {
      res.status(400).json({ error: "المركبة ونوع المخالفة مطلوبان" }); return;
    }
    const fineAmount = Number(b.fineAmount || 0);
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

    // GL posting — company-borne fines hit expense account immediately
    let journalEntryId: number | null = null;
    if (fineAmount > 0 && liability === 'company') {
      try {
        journalEntryId = await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.userId,
          ref: `TV-${insertId}`,
          description: `مخالفة مرورية — ${b.violationType}${b.violationNumber ? ` #${b.violationNumber}` : ''}`,
          sourceType: "fleet_traffic_violation",
          sourceId: insertId,
          lines: [
            { accountCode: "5290", debit: fineAmount, credit: 0 }, // fleet other expenses / fines
            { accountCode: "2100", debit: 0, credit: fineAmount }, // accounts payable (govt)
          ],
        });
      } catch (jeErr) {
        console.error("Traffic violation journal entry failed:", jeErr);
      }
    }

    // Driver-liability: create a payroll deduction for the current month so it is withheld on the next run
    let deductionId: number | null = null;
    if (fineAmount > 0 && liability === 'driver' && b.driverId) {
      try {
        const [driver] = await rawQuery<any>(
          `SELECT "employeeId" FROM fleet_drivers WHERE id = $1 AND "companyId" = $2`,
          [b.driverId, scope.companyId]
        );
        if (driver?.employeeId) {
          const { insertId: pdId } = await rawExecute(
            `INSERT INTO payroll_deductions ("companyId","employeeId",type,amount,reason,date,"createdAt")
             VALUES ($1,$2,'traffic_violation',$3,$4,CURRENT_DATE,NOW())`,
            [scope.companyId, driver.employeeId, fineAmount, `مخالفة مرورية: ${b.violationType}`]
          );
          deductionId = pdId;
        }
      } catch (pdErr) {
        console.error("Traffic violation payroll deduction failed:", pdErr);
      }
    }

    try {
      eventBus.emit("fleet.traffic.violation.created", {
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        entity: "fleet_traffic_violations", entityId: insertId, action: "create",
        after: { vehicleId: b.vehicleId, driverId: b.driverId, fineAmount, liability, journalEntryId, deductionId },
      });
    } catch {}

    const [row] = await rawQuery<any>(`SELECT * FROM fleet_traffic_violations WHERE id=$1`, [insertId]);
    res.status(201).json({ ...row, journalEntryId, deductionId, liability });
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
    if (!existing) { res.status(404).json({ error: "المخالفة غير موجودة" }); return; }
    if (existing.status === 'paid') {
      res.status(409).json({ error: "المخالفة مدفوعة بالفعل" }); return;
    }

    // Post the cash-out journal entry BEFORE flipping status so dual-entry is guaranteed.
    const fineAmount = Number(existing.fineAmount || 0);
    if (fineAmount > 0) {
      try {
        await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.userId,
          ref: `TV-${id}-PAY`,
          description: `سداد مخالفة مرورية #${existing.violationNumber ?? id}`,
          sourceType: "fleet_traffic_violation_payment",
          sourceId: id,
          lines: [
            { accountCode: "2100", debit: fineAmount, credit: 0 }, // clear AP
            { accountCode: "1100", debit: 0, credit: fineAmount }, // cash out
          ],
        });
      } catch (jeErr) {
        console.error("Traffic violation payment JE failed:", jeErr);
        res.status(500).json({ error: "فشل قيد السداد — لم يتم تسجيل العملية" });
        return;
      }
    }

    await rawExecute(
      `UPDATE fleet_traffic_violations SET status='paid', "paidAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
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
       WHERE v.id=$1 AND v."companyId"=$2`,
      [vehicleId, scope.companyId]
    );
    if (!vehicle) { res.status(404).json({ error: "المركبة غير موجودة" }); return; }

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
    const totalCost = fuelTotal + maintenanceTotal + insuranceTotal + totalDepreciation + purchasePrice + finesTotal;
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
