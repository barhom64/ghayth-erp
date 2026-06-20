// fleet-inspections.ts — متابعة النقل بالصور: فحص مركبة (استلام/تسليم/يومي/طارئ)
// مع قراءة عداد + صور متعددة الاتجاهات + سير اعتماد. مُركَّب تحت /fleet.
//
// يبني على القائم: العداد يُلتقط أصلًا على fleet_rental_contracts (handover/return)؛
// والصور تُرفع إلى GCS عبر POST /storage/uploads/request-url ثم تُسجَّل هنا بمسارها
// (storageKey). الجداول: migration 394 (fleet_vehicle_inspections + ..._photos).
import { Router } from "express";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";

const router = Router();

const INSPECTION_TYPES = ["handover", "return", "daily", "adhoc"] as const;
const PHOTO_TYPES = [
  "odometer", "front", "rear", "left", "right",
  "interior", "fuel_gauge", "damage", "other",
] as const;

const createInspectionSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  driverId: z.coerce.number().int().positive().optional(),
  rentalContractId: z.coerce.number().int().positive().optional(),
  tripId: z.coerce.number().int().positive().optional(),
  inspectionType: z.enum(INSPECTION_TYPES),
  odometer: z.coerce.number().int().nonnegative().optional(),
  fuelLevel: z.coerce.number().min(0).max(1).optional(),
  notes: z.string().max(2000).optional(),
});

const addPhotoSchema = z.object({
  photoType: z.enum(PHOTO_TYPES),
  storageKey: z.string().min(1).max(1024),
  fileName: z.string().max(512).optional(),
  mimeType: z.string().max(60).optional(),
  fileSize: z.coerce.number().int().nonnegative().optional(),
});

const rejectSchema = z.object({ reason: z.string().min(1).max(2000) });

// ─── POST /inspections — تسجيل فحص مركبة (موظف) ──────────────────────────────
router.post("/inspections", authorize({ feature: "fleet.vehicles", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createInspectionSchema.safeParse(req.body));

    // المركبة يجب أن تخص الشركة (وغير محذوفة).
    const [vehicle] = await rawQuery<{ id: number }>(
      `SELECT id FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.vehicleId, scope.companyId],
    );
    if (!vehicle) throw new NotFoundError("المركبة غير موجودة");

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_vehicle_inspections
         ("companyId","branchId","vehicleId","driverId","rentalContractId","tripId",
          "inspectionType","odometer","fuelLevel","notes","status",
          "capturedByUserId","capturedByRole","capturedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted',$11,'staff',NOW())`,
      [
        scope.companyId, scope.branchId ?? null, b.vehicleId, b.driverId ?? null,
        b.rentalContractId ?? null, b.tripId ?? null, b.inspectionType,
        b.odometer ?? null, b.fuelLevel ?? null, b.notes ?? null, scope.userId,
      ],
    );
    assertInsert(insertId, "fleet_vehicle_inspections");

    auditFromRequest(req, "fleet.inspection.created", "fleet_vehicle_inspections", insertId, {
      after: { vehicleId: b.vehicleId, inspectionType: b.inspectionType, odometer: b.odometer ?? null },
    }).catch((e) => logger.error(e, "fleet-inspections create audit failed"));

    res.status(201).json({ id: insertId, status: "submitted" });
  } catch (err) { handleRouteError(err, res, "Create vehicle inspection error:"); }
});

// ─── GET /inspections — قائمة الفحوص (مرشّحات) ───────────────────────────────
router.get("/inspections", authorize({ feature: "fleet.vehicles", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { vehicleId, driverId, inspectionType, status } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `i."companyId" = $1 AND i."deletedAt" IS NULL`;
    if (vehicleId) { params.push(Number(vehicleId)); where += ` AND i."vehicleId" = $${params.length}`; }
    if (driverId) { params.push(Number(driverId)); where += ` AND i."driverId" = $${params.length}`; }
    if (inspectionType && (INSPECTION_TYPES as readonly string[]).includes(inspectionType)) {
      params.push(inspectionType); where += ` AND i."inspectionType" = $${params.length}`;
    }
    if (status) { params.push(status); where += ` AND i."status" = $${params.length}`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i."vehicleId", v."plateNumber", i."driverId", i."rentalContractId",
              i."inspectionType", i."odometer", i."fuelLevel", i."status", i."dueDate",
              i."capturedByRole", i."capturedAt", i."reviewedAt", i."createdAt",
              (SELECT COUNT(*)::int FROM fleet_inspection_photos p
                WHERE p."inspectionId" = i.id AND p."deletedAt" IS NULL) AS "photoCount"
         FROM fleet_vehicle_inspections i
         LEFT JOIN fleet_vehicles v ON v.id = i."vehicleId"
        WHERE ${where}
        ORDER BY i."createdAt" DESC
        LIMIT 500`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List vehicle inspections error:"); }
});

// ─── GET /inspections/:id — فحص واحد + صوره ──────────────────────────────────
router.get("/inspections/:id", authorize({ feature: "fleet.vehicles", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [inspection] = await rawQuery<Record<string, unknown>>(
      `SELECT i.*, v."plateNumber"
         FROM fleet_vehicle_inspections i
         LEFT JOIN fleet_vehicles v ON v.id = i."vehicleId"
        WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!inspection) throw new NotFoundError("الفحص غير موجود");
    const photos = await rawQuery<Record<string, unknown>>(
      `SELECT id, "photoType", "storageKey", "fileName", "mimeType", "fileSize", "capturedAt"
         FROM fleet_inspection_photos
        WHERE "inspectionId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        ORDER BY id`,
      [id, scope.companyId],
    );
    res.json(maskFields(req, { inspection, photos }));
  } catch (err) { handleRouteError(err, res, "Get vehicle inspection error:"); }
});

// ─── POST /inspections/:id/photos — تسجيل صورة (بعد رفعها لـGCS) ──────────────
router.post("/inspections/:id/photos", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(addPhotoSchema.safeParse(req.body));

    const [inspection] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM fleet_vehicle_inspections
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!inspection) throw new NotFoundError("الفحص غير موجود");
    if (inspection.status === "approved" || inspection.status === "rejected") {
      throw new ValidationError("لا يمكن إضافة صور بعد اعتماد الفحص أو رفضه");
    }

    const { insertId } = await rawExecute(
      `INSERT INTO fleet_inspection_photos
         ("companyId","inspectionId","photoType","storageKey","fileName","mimeType","fileSize","capturedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [scope.companyId, id, b.photoType, b.storageKey, b.fileName ?? null, b.mimeType ?? null, b.fileSize ?? null],
    );
    assertInsert(insertId, "fleet_inspection_photos");

    auditFromRequest(req, "fleet.inspection.photo_added", "fleet_vehicle_inspections", id, {
      after: { photoId: insertId, photoType: b.photoType },
    }).catch((e) => logger.error(e, "fleet-inspections photo audit failed"));

    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Add inspection photo error:"); }
});

// ─── DELETE /inspections/:id/photos/:photoId — حذف ناعم لصورة ────────────────
router.delete("/inspections/:id/photos/:photoId", authorize({ feature: "fleet.vehicles", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const photoId = parseId(req.params.photoId, "photoId");
    const { affectedRows } = await rawExecute(
      `UPDATE fleet_inspection_photos SET "deletedAt" = NOW()
        WHERE id = $1 AND "inspectionId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
      [photoId, id, scope.companyId],
    );
    if (!affectedRows) throw new NotFoundError("الصورة غير موجودة");
    auditFromRequest(req, "fleet.inspection.photo_removed", "fleet_vehicle_inspections", id, {
      before: { photoId },
    }).catch((e) => logger.error(e, "fleet-inspections photo-remove audit failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Delete inspection photo error:"); }
});

// ─── POST /inspections/:id/approve — اعتماد المشرف ───────────────────────────
router.post("/inspections/:id/approve", authorize({ feature: "fleet.vehicles", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE fleet_vehicle_inspections
          SET "status" = 'approved', "reviewedByUserId" = $1, "reviewedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL
          AND "status" IN ('submitted','pending')`,
      [scope.userId, id, scope.companyId],
    );
    if (!affectedRows) throw new NotFoundError("الفحص غير موجود أو لا يمكن اعتماده في حالته الحالية");
    auditFromRequest(req, "fleet.inspection.approved", "fleet_vehicle_inspections", id, {})
      .catch((e) => logger.error(e, "fleet-inspections approve audit failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "fleet.inspection.approved", entity: "fleet_vehicle_inspections", entityId: id,
    }).catch((e) => logger.error(e, "fleet-inspections approve event failed"));
    res.json({ ok: true, status: "approved" });
  } catch (err) { handleRouteError(err, res, "Approve inspection error:"); }
});

// ─── POST /inspections/:id/reject — رفض المشرف مع سبب ────────────────────────
router.post("/inspections/:id/reject", authorize({ feature: "fleet.vehicles", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(rejectSchema.safeParse(req.body));
    const { affectedRows } = await rawExecute(
      `UPDATE fleet_vehicle_inspections
          SET "status" = 'rejected', "reviewedByUserId" = $1, "reviewedAt" = NOW(),
              "reviewNotes" = $2, "updatedAt" = NOW()
        WHERE id = $3 AND "companyId" = $4 AND "deletedAt" IS NULL
          AND "status" IN ('submitted','pending')`,
      [scope.userId, b.reason, id, scope.companyId],
    );
    if (!affectedRows) throw new NotFoundError("الفحص غير موجود أو لا يمكن رفضه في حالته الحالية");
    auditFromRequest(req, "fleet.inspection.rejected", "fleet_vehicle_inspections", id, {
      reason: b.reason,
    }).catch((e) => logger.error(e, "fleet-inspections reject audit failed"));
    res.json({ ok: true, status: "rejected" });
  } catch (err) { handleRouteError(err, res, "Reject inspection error:"); }
});

export default router;
