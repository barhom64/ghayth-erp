import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { haversineKm, movingAverage, maintenancePriority, maintenanceSlaDeadline } from "../lib/algorithms.js";
import { createNotification, createAuditLog, createGuardedJournalEntry, emitEvent, getLegalResponsible, getAccountCodeFromMapping } from "../lib/businessHelpers.js";
import { getPropertyUnitStatusImpact } from "../lib/impactPreview.js";
import { eventBus } from "../lib/eventBus.js";
import { registerObligation, cancelObligation } from "../lib/obligationsEngine.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";

const createUnitSchema = z.object({
  unitNumber: z.string().min(1, "رقم الوحدة مطلوب"),
  buildingId: z.coerce.number().optional().nullable(),
  buildingName: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  area: z.coerce.number().min(0, "المساحة يجب أن تكون صفر أو أكثر").optional().nullable(),
  bedrooms: z.coerce.number().optional().nullable(),
  bathrooms: z.coerce.number().optional().nullable(),
  floor: z.coerce.number().optional().nullable(),
  monthlyRent: z.coerce.number().min(0, "الإيجار الشهري يجب أن يكون صفر أو أكثر").optional().nullable(),
  status: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  direction: z.string().optional().nullable(),
  finishing: z.string().optional().nullable(),
  amenities: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  branchId: z.coerce.number().optional().nullable(),
  electricityMeter: z.string().optional().nullable(),
  waterMeter: z.string().optional().nullable(),
  usageType: z.string().optional().nullable(),
  ownerId: z.coerce.number().optional().nullable(),
  parkingSpaces: z.coerce.number().optional().nullable(),
  acType: z.string().optional().nullable(),
  hasKitchen: z.boolean().optional().nullable(),
  yearlyRent: z.coerce.number().optional().nullable(),
  insurancePolicy: z.string().optional().nullable(),
  insuranceExpiry: z.string().optional().nullable(),
});

const updateUnitSchema = z.object({
  unitNumber: z.string().optional(),
  buildingId: z.coerce.number().optional().nullable(),
  buildingName: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  area: z.coerce.number().optional().nullable(),
  bedrooms: z.coerce.number().optional().nullable(),
  bathrooms: z.coerce.number().optional().nullable(),
  floor: z.coerce.number().optional().nullable(),
  monthlyRent: z.coerce.number().optional().nullable(),
  status: z.string().optional(),
  address: z.string().optional().nullable(),
  direction: z.string().optional().nullable(),
  finishing: z.string().optional().nullable(),
  amenities: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  branchId: z.coerce.number().optional().nullable(),
  electricityMeter: z.string().optional().nullable(),
  waterMeter: z.string().optional().nullable(),
  usageType: z.string().optional().nullable(),
  ownerId: z.coerce.number().optional().nullable(),
  parkingSpaces: z.coerce.number().optional().nullable(),
  acType: z.string().optional().nullable(),
  hasKitchen: z.boolean().optional().nullable(),
  yearlyRent: z.coerce.number().optional().nullable(),
  insurancePolicy: z.string().optional().nullable(),
  insuranceExpiry: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateBuildingSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  floors: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  deedNumber: z.string().optional().nullable(),
  deedDate: z.string().optional().nullable(),
  buildingPermitNumber: z.string().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  totalUnits: z.coerce.number().optional().nullable(),
  totalArea: z.coerce.number().optional().nullable(),
  yearBuilt: z.coerce.number().optional().nullable(),
  ownerId: z.coerce.number().optional().nullable(),
  managerId: z.coerce.number().optional().nullable(),
  nationalAddress: z.union([z.string(), z.record(z.any())]).optional().nullable(),
});

const updateContractSchema = z.object({
  tenantId: z.union([z.coerce.number(), z.string()]).optional().nullable(),
  tenantName: z.string().optional().nullable(),
  tenantPhone: z.string().optional().nullable(),
  tenantEmail: z.string().optional().nullable(),
  tenantIdNumber: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  monthlyRent: z.coerce.number().optional().nullable(),
  depositAmount: z.coerce.number().optional().nullable(),
  paymentDay: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
  contractNumber: z.string().optional().nullable(),
  ejarNumber: z.string().optional().nullable(),
  contractType: z.string().optional().nullable(),
  paymentFrequency: z.string().optional().nullable(),
  yearlyRent: z.coerce.number().optional().nullable(),
  totalContractValue: z.coerce.number().optional().nullable(),
  latePenaltyType: z.string().optional().nullable(),
  latePenaltyValue: z.coerce.number().optional().nullable(),
  gracePeriodDays: z.coerce.number().optional().nullable(),
  terminationNoticeDays: z.coerce.number().optional().nullable(),
  earlyTerminationFee: z.coerce.number().optional().nullable(),
  autoRenewal: z.boolean().optional().nullable(),
  renewalNoticeDays: z.coerce.number().optional().nullable(),
  renewalPeriodMonths: z.coerce.number().optional().nullable(),
  electricityResponsibility: z.string().optional().nullable(),
  waterResponsibility: z.string().optional().nullable(),
  gasResponsibility: z.string().optional().nullable(),
  maintenanceResponsibility: z.string().optional().nullable(),
  brokerageFee: z.coerce.number().optional().nullable(),
  brokeragePayor: z.string().optional().nullable(),
  depositHolder: z.string().optional().nullable(),
  insuranceRequired: z.boolean().optional().nullable(),
  ownerId: z.coerce.number().optional().nullable(),
  numberOfInstallments: z.coerce.number().optional().nullable(),
  specialConditions: z.string().optional().nullable(),
  ejarStatus: z.string().optional().nullable(),
  registrationDate: z.string().optional().nullable(),
});

const router = Router();
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE MACHINES — Phase C.4 Property audit
//
// Every status-changing endpoint must validate the transition against one of
// these allowlists. Direct `UPDATE status` outside the allowlist is a bug.
// Lifecycle transitions to terminal states (terminated/expired/refunded)
// must go through dedicated endpoints — PATCH refuses them with 409.
// ─────────────────────────────────────────────────────────────────────────────
const UNIT_STATUSES = ["available", "rented", "maintenance", "under_maintenance", "out_of_service", "reserved"] as const;
const UNIT_TRANSITIONS: Record<string, readonly string[]> = {
  available:         ["rented", "maintenance", "under_maintenance", "out_of_service", "reserved"],
  rented:            ["available", "maintenance", "under_maintenance"],
  maintenance:       ["available", "out_of_service"],
  under_maintenance: ["available", "out_of_service"],
  reserved:          ["available", "rented"],
  out_of_service:    ["available", "maintenance", "under_maintenance"],
};

const CONTRACT_STATUSES = ["draft", "active", "terminated", "expired", "cancelled", "renewed"] as const;
const CONTRACT_TRANSITIONS: Record<string, readonly string[]> = {
  // Lifecycle transitions to terminal states (terminated/expired/renewed) must
  // use the dedicated /contracts/:id/{renew,terminate} endpoints. Direct PATCH
  // writes to those states are refused so the obligations + JE side-effects
  // can't be bypassed.
  draft:      ["active", "cancelled"],
  active:     [],  // no direct status edits from active via PATCH
  terminated: [],
  expired:    [],
  cancelled:  [],
  renewed:    [],
};

const MAINT_REQUEST_STATUSES = [
  "pending", "open", "approved", "rejected", "returned",
  "assigned", "in_progress", "completed", "closed", "cancelled",
] as const;
const MAINT_REQUEST_TRANSITIONS: Record<string, readonly string[]> = {
  pending:     ["approved", "rejected", "returned", "cancelled"],
  open:        ["approved", "assigned", "rejected", "cancelled"],
  approved:    ["assigned", "in_progress", "cancelled"],
  returned:    ["approved", "rejected", "cancelled"],
  assigned:    ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   ["closed"],
  rejected:    [],
  cancelled:   [],
  closed:      [],
};

const INSPECTION_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
const INSPECTION_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled:   ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const DEPOSIT_TRANSITIONS: Record<string, readonly string[]> = {
  held:           ["refunded", "forfeited", "partial_refund"],
  partial_refund: ["refunded", "forfeited"],
  refunded:       [],
  forfeited:      [],
};

// P02-CRIT2 — `property:*` permissions exist in rbacCatalog and are
// seeded in role_permissions for `property_manager` / `general_manager`
// / `owner`, but the unit endpoints below never enforced them. Any
// authenticated user — junior accountant, sales rep, anyone with a
// login — could list, create, update, or soft-delete property units
// in their company. Owner role still bypasses all checks via the
// short-circuit in requirePermission, so legitimate workflows are
// unaffected. Aligning these five routes with the established
// requirePermission pattern used by fleet, hr, crm, etc.
router.get("/units", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, search, buildingId } = req.query as any;
    const conditions = [`u."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`u.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(u."unitNumber" ILIKE $${params.length} OR u."buildingName" ILIKE $${params.length})`); }
    if (buildingId) {
      params.push(Number(buildingId));
      conditions.push(`u."buildingId" = $${params.length}`);
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    conditions.push(`u."deletedAt" IS NULL`);
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    params.push(limit, offset);
    const rows = await rawQuery<any>(
      `SELECT u.* FROM property_units u WHERE ${conditions.join(" AND ")} ORDER BY u."buildingName", u."unitNumber" LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    // Drop the LIMIT/OFFSET params before running the COUNT(*) query so it
    // still matches the `conditions` WHERE clause.
    params.pop();
    params.pop();
    const [countRow] = await rawQuery<any>(`SELECT COUNT(*) as total FROM property_units u WHERE ${conditions.join(" AND ")}`, params);
    res.json({ data: rows, total: Number(countRow?.total || rows.length), page, pageSize: limit });
  } catch (err) { handleRouteError(err, res, "Property units error:"); }
});

router.post("/units", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createUnitSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data;

    const unitNumber = b.unitNumber.trim();

    // Pre-checks — fail fast with a typed error so the frontend can highlight
    // the offending field. The old code used an auto-generated unit number
    // which hid the UX cue that the user forgot to fill it in.
    if (b.buildingId !== undefined && b.buildingId !== null) {
      const [bldg] = await rawQuery<any>(
        `SELECT id, name FROM property_buildings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.buildingId, scope.companyId]
      );
      if (!bldg) {
        throw new ValidationError("المبنى غير موجود", { field: "buildingId", fix: "اختر مبنى مسجلاً أو أنشئه أولاً" });
      }
    }
    if (b.ownerId !== undefined && b.ownerId !== null) {
      const [owner] = await rawQuery<any>(
        `SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.ownerId, scope.companyId]
      );
      if (!owner) {
        throw new ValidationError("المالك غير موجود", { field: "ownerId", fix: "اختر مالكاً مسجلاً أو أنشئه أولاً" });
      }
    }
    // Duplicate (unitNumber, buildingId) — same unit number in the same building is not allowed
    const [dup] = await rawQuery<any>(
      `SELECT id FROM property_units
       WHERE "unitNumber"=$1 AND "companyId"=$2
         AND ("buildingId" IS NOT DISTINCT FROM $3)
         AND "deletedAt" IS NULL`,
      [unitNumber, scope.companyId, b.buildingId || null]
    );
    if (dup) {
      throw new ConflictError(
        "رقم الوحدة مستخدم مسبقاً في نفس المبنى",
        { field: "unitNumber", fix: "اختر رقم وحدة مختلف أو اختر مبنى آخر" }
      );
    }

    const amenities = b.amenities ? (Array.isArray(b.amenities) ? JSON.stringify(b.amenities) : b.amenities) : null;
    const { insertId } = await rawExecute(
      `INSERT INTO property_units ("companyId","unitNumber","buildingId","buildingName",type,area,bedrooms,bathrooms,floor,"monthlyRent",status,address,direction,finishing,amenities,"branchId","electricityMeter","waterMeter","usageType","ownerId","parkingSpaces","acType","hasKitchen","yearlyRent","insurancePolicy","insuranceExpiry")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [scope.companyId, unitNumber, b.buildingId || null, b.buildingName || b.name || null,
       b.type || 'apartment', b.area || null, b.bedrooms || 0, b.bathrooms || 0, b.floor || null,
       b.monthlyRent || 0, b.status || 'available', b.address || null,
       b.direction || null, b.finishing || null, amenities, b.branchId || scope.branchId,
       b.electricityMeter || null, b.waterMeter || null, b.usageType || 'residential',
       b.ownerId || null, b.parkingSpaces || 0, b.acType || null,
       b.hasKitchen || false, b.yearlyRent || null, b.insurancePolicy || null, b.insuranceExpiry || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_units WHERE id=$1 AND "deletedAt" IS NULL`, [insertId]);

    // The GET /units/:id handler renders a timeline straight from audit_logs
    // where entity='property_units', so without this write the unit would
    // appear in the UI with an empty history from day one.
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "property_units", entityId: insertId,
      after: { unitNumber, buildingId: b.buildingId ?? null, type: row?.type, status: row?.status },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "property.unit.created", entity: "property_units", entityId: insertId,
      details: `وحدة جديدة ${unitNumber}${b.buildingName ? ` — ${b.buildingName}` : ''}`,
    }).catch(console.error);
    createSubsidiaryAccountsForEntity(
      scope.companyId, "property", insertId,
      `${unitNumber}${b.buildingName ? ` — ${b.buildingName}` : ""}`
    ).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create unit error:"); }
});

router.get("/units/:id", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(`SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الوحدة غير موجودة");

    const [contracts, payments, maintenance, timeline] = await Promise.all([
      rawQuery<any>(
        `SELECT rc.*, (SELECT COUNT(*) FROM rent_payments WHERE "contractId"=rc.id AND status='paid') AS "paidCount",
                (SELECT COALESCE(SUM(amount),0) FROM rent_payments WHERE "contractId"=rc.id) AS "totalAmount",
                (SELECT COALESCE(SUM("paidAmount"),0) FROM rent_payments WHERE "contractId"=rc.id) AS "totalPaid"
         FROM rental_contracts rc WHERE "unitId"=$1 AND "companyId"=$2 ORDER BY rc.id DESC LIMIT 10`,
        [id, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT rp.*, c."tenantName" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" AND c."deletedAt" IS NULL WHERE c."unitId"=$1 AND c."companyId"=$2 ORDER BY rp."dueDate" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT * FROM maintenance_requests WHERE "unitId"=$1 AND "companyId"=$2 ORDER BY id DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT al.*, u.email AS "userName" FROM audit_logs al LEFT JOIN users u ON u.id=al."userId" WHERE al.entity='property_units' AND al."entityId"=$1 ORDER BY al."createdAt" DESC LIMIT 30`,
        [id]
      ),
    ]);

    res.json({ ...row, contracts, payments, maintenance, timeline });
  } catch (err) { handleRouteError(err, res, "Get unit error:"); }
});

router.get("/units/:id/impact-preview", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { status } = req.query as { status?: string };
    if (!status) {
      throw new ValidationError("الحالة المطلوبة", { field: "status", fix: "أرسل معامل status في الرابط" });
    }
    const preview = await getPropertyUnitStatusImpact(id, scope.companyId, status);
    res.json(preview);
  } catch (err) { handleRouteError(err, res, "Impact preview error:"); }
});

router.patch("/units/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الوحدة غير موجودة");
    const parsed = updateUnitSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

    // State machine + business impact guard
    if (b.status !== undefined && b.status !== existing.status) {
      if (!UNIT_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${UNIT_STATUSES.join(", ")}` }
        );
      }
      const allowedNext = UNIT_TRANSITIONS[existing.status] ?? [];
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل الوحدة من "${existing.status}" إلى "${b.status}"`,
          {
            field: "status",
            fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}`,
          }
        );
      }
      const preview = await getPropertyUnitStatusImpact(id, scope.companyId, b.status);
      if (!preview.canProceed) {
        throw new ConflictError(
          "لا يمكن تغيير حالة الوحدة بسبب ارتباطات نشطة",
          { field: "status", fix: "أنهِ العقود أو طلبات الصيانة المرتبطة بالوحدة أولاً" }
        );
      }
    }

    if (b.monthlyRent !== undefined && b.monthlyRent !== null) {
      const r = Number(b.monthlyRent);
      if (!Number.isFinite(r) || r < 0) {
        throw new ValidationError("الإيجار الشهري غير صالح", { field: "monthlyRent", fix: "أدخل قيمة غير سالبة" });
      }
    }
    if (b.unitNumber && b.unitNumber !== existing.unitNumber) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM property_units
         WHERE "unitNumber"=$1 AND "companyId"=$2
           AND ("buildingId" IS NOT DISTINCT FROM $3)
           AND "deletedAt" IS NULL AND id<>$4`,
        [b.unitNumber, scope.companyId, b.buildingId ?? existing.buildingId, id]
      );
      if (dup) {
        throw new ConflictError(
          "رقم الوحدة مستخدم مسبقاً في نفس المبنى",
          { field: "unitNumber", fix: "اختر رقماً مختلفاً" }
        );
      }
    }
    if (b.buildingId !== undefined && b.buildingId !== null && b.buildingId !== existing.buildingId) {
      const [bldg] = await rawQuery<any>(
        `SELECT id FROM property_buildings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.buildingId, scope.companyId]
      );
      if (!bldg) {
        throw new ValidationError("المبنى غير موجود", { field: "buildingId", fix: "اختر مبنى مسجلاً" });
      }
    }
    if (b.ownerId !== undefined && b.ownerId !== null && b.ownerId !== existing.ownerId) {
      const [owner] = await rawQuery<any>(
        `SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.ownerId, scope.companyId]
      );
      if (!owner) {
        throw new ValidationError("المالك غير موجود", { field: "ownerId", fix: "اختر مالكاً مسجلاً" });
      }
    }

    const trackedFields = [
      "unitNumber","buildingName","type","area","monthlyRent","status","address",
      "electricityMeter","waterMeter","usageType","ownerId","parkingSpaces","acType",
      "hasKitchen","yearlyRent","insurancePolicy","insuranceExpiry","amenities","notes",
      "buildingId","floor","bedrooms","bathrooms","direction","finishing",
    ] as const;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const f of trackedFields) {
      if (b[f] === undefined) continue;
      let val = b[f];
      if (f === "amenities" && val !== null) {
        val = Array.isArray(val) ? JSON.stringify(val) : val;
      }
      if ((f === "ownerId" || f === "buildingId") && !val) val = null;
      if (val === existing[f]) continue;
      params.push(val);
      sets.push(`"${f}"=$${params.length}`);
      before[f] = existing[f];
      after[f] = val;
    }
    if (Object.keys(after).length === 0) {
      res.json(existing);
      return;
    }
    params.push(id);
    await rawExecute(`UPDATE property_units SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM property_units WHERE id=$1 AND "deletedAt" IS NULL`, [id]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "property_units",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "property.unit.status_changed" : "property.unit.updated",
      entity: "property_units",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update unit error:"); }
});

router.delete("/units/:id", requirePermission("property:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, "unitNumber", status FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الوحدة غير موجودة");

    const [activeContract] = await rawQuery<any>(
      `SELECT id FROM rental_contracts WHERE "unitId"=$1 AND "companyId"=$2 AND status IN ('active','draft') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeContract) {
      throw new ConflictError(
        "لا يمكن حذف الوحدة — يوجد عقد إيجار نشط مرتبط بها",
        { field: "status", fix: "أنهِ العقد أو ألغِه قبل حذف الوحدة" }
      );
    }
    const [activeMaint] = await rawQuery<any>(
      `SELECT id FROM maintenance_requests WHERE "unitId"=$1 AND "companyId"=$2 AND status NOT IN ('completed','closed','rejected','cancelled') LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeMaint) {
      throw new ConflictError(
        "لا يمكن حذف الوحدة — يوجد طلب صيانة نشط",
        { field: "status", fix: "أكمل أو ألغِ طلب الصيانة قبل حذف الوحدة" }
      );
    }

    await rawExecute(`UPDATE property_units SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.unit.deleted",
      entity: "property_units",
      entityId: id,
      before: { unitNumber: existing.unitNumber, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ message: "تم حذف الوحدة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete unit error:"); }
});

// Impact preview — shows what will happen when the rental contract is created
router.post("/contracts/impact-preview", requirePermission("properties:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { unitId, tenantId, monthlyRent, startDate, endDate, securityDeposit } = req.body as any;

    const items: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [];

    let unitLabel = "";
    let unitStatus = "";
    if (unitId) {
      const [unit] = await rawQuery<any>(
        `SELECT "unitNumber", status FROM property_units WHERE id = $1 AND "companyId" = $2`,
        [Number(unitId), scope.companyId]
      );
      unitLabel = unit?.unitNumber || String(unitId);
      unitStatus = unit?.status || "";
      if (unit && unit.status !== "available") {
        items.push({
          category: "الوحدة",
          label: "حالة الوحدة",
          value: `الوحدة ${unitLabel} حالتها "${unit.status}" — لن تصبح مؤجرة حتى تعتمد العقد`,
          severity: unit.status === "rented" ? "danger" : "warning",
        });
      }
    }

    if (startDate && endDate) {
      const months = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (30 * 86400000));
      const totalRent = Number(monthlyRent || 0) * months;
      items.push({
        category: "مالي",
        label: "إجمالي الإيجار",
        value: `${totalRent.toLocaleString("ar-SA")} ر.س على ${months} شهر (${Number(monthlyRent || 0).toLocaleString("ar-SA")} ر.س/شهر)`,
        severity: "info",
      });

      items.push({
        category: "التزامات",
        label: "أقساط الإيجار الشهرية",
        value: `سيتم إنشاء ${months} التزام شهري تلقائياً للتحصيل`,
        severity: "info",
      });

      items.push({
        category: "التزامات",
        label: "تذكير انتهاء العقد",
        value: `سيتم تسجيل التزام تجديد قبل 30 يوم من ${new Date(endDate).toLocaleDateString("ar-SA")}`,
        severity: "info",
      });
    }

    if (securityDeposit && Number(securityDeposit) > 0) {
      items.push({
        category: "مالي",
        label: "ضمان تأمين",
        value: `استلام مبلغ ${Number(securityDeposit).toLocaleString("ar-SA")} ر.س كضمان يُعاد عند انتهاء العقد`,
        severity: "info",
      });
    }

    if (tenantId) {
      const [tenant] = await rawQuery<any>(
        `SELECT name FROM tenants WHERE id = $1 AND "companyId" = $2`,
        [Number(tenantId), scope.companyId]
      );
      const [[activeContracts]] = await Promise.all([
        rawQuery<any>(
          `SELECT COUNT(*)::int AS c FROM rental_contracts
           WHERE "tenantId" = $1 AND "companyId" = $2 AND status = 'active'`,
          [Number(tenantId), scope.companyId]
        ),
      ]);
      const existing = Number(activeContracts?.c || 0);
      if (existing > 0) {
        items.push({
          category: "المستأجر",
          label: `${tenant?.name || "المستأجر"} — عقود قائمة`,
          value: `لديه ${existing} عقد إيجار نشط حالياً`,
          severity: "info",
        });
      }
    }

    items.push({
      category: "الوحدة",
      label: "تحديث الحالة",
      value: unitLabel
        ? `الوحدة ${unitLabel} ستتحول إلى "مؤجرة" عند اعتماد العقد`
        : "الوحدة ستتحول إلى مؤجرة",
      severity: "info",
    });

    items.push({
      category: "تقارير",
      label: "لوحات العقارات",
      value: "ستتحدث تقارير الإشغال والعائد فوراً",
      severity: "info",
    });

    const hasDanger = items.some((i) => i.severity === "danger");
    const hasWarning = items.some((i) => i.severity === "warning");
    res.json({
      actionType: "create_rental_contract",
      employeeId: 0,
      employeeName: "",
      items,
      summary: hasDanger
        ? "العقد يتعارض مع حالة الوحدة الحالية — راجع قبل المتابعة"
        : hasWarning
        ? "العقد جاهز — راجع التحذيرات"
        : "العقد جاهز للإنشاء",
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في معاينة أثر العقد");
  }
});

router.get("/contracts", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`c."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }
    conditions.push(`c."deletedAt" IS NULL`);
    const rows = await rawQuery<any>(
      `SELECT c.*, u."unitNumber", u."buildingName" FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId" AND u."deletedAt" IS NULL WHERE ${conditions.join(" AND ")} ORDER BY c.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Rental contracts error:"); }
});

router.get("/contracts/:id", requirePermission("properties:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const contractId = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT c.*, u."unitNumber", u."buildingName", t.name AS "tenantFullName", t.phone AS "tenantPhoneFromRecord", t.email AS "tenantEmailFromRecord"
       FROM rental_contracts c
       LEFT JOIN property_units u ON u.id = c."unitId"
       LEFT JOIN tenants t ON t.id = c."tenantId"
       WHERE c.id = $1 AND c."companyId" = $2 AND c."deletedAt" IS NULL`,
      [contractId, scope.companyId]
    );
    if (!row) throw new NotFoundError("العقد غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get contract error:"); }
});

router.post("/contracts", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (!b.unitId) {
      throw new ValidationError("لا يمكن إنشاء عقد إيجار بدون وحدة عقارية", { field: "unitId", fix: "حدد الوحدة العقارية المراد تأجيرها" });
    }
    if (!b.startDate) {
      throw new ValidationError("لا يمكن إنشاء عقد بدون تاريخ بداية", { field: "startDate", fix: "حدد تاريخ بداية العقد" });
    }
    if (!b.endDate) {
      throw new ValidationError("لا يمكن إنشاء عقد بدون تاريخ نهاية", { field: "endDate", fix: "حدد تاريخ نهاية العقد" });
    }
    if (!b.tenantName || typeof b.tenantName !== "string" || !b.tenantName.trim()) {
      throw new ValidationError("اسم المستأجر مطلوب", { field: "tenantName", fix: "أدخل اسم المستأجر أو اختر من قائمة المستأجرين المسجلين" });
    }
    const startDate = new Date(b.startDate);
    const endDate = new Date(b.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ValidationError("تواريخ العقد غير صالحة", { field: "startDate", fix: "استخدم تنسيق التاريخ YYYY-MM-DD" });
    }
    if (endDate <= startDate) {
      throw new ValidationError(
        "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية",
        { field: "endDate", fix: "اختر تاريخ نهاية لاحقاً لتاريخ البداية" }
      );
    }
    const monthlyRent = Number(b.monthlyRent) || 0;
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
      throw new ValidationError("الإيجار الشهري غير صالح", { field: "monthlyRent", fix: "أدخل قيمة غير سالبة" });
    }

    // FK pre-check: unit must exist and not be rented
    const [unit] = await rawQuery<any>(
      `SELECT id, status, "unitNumber" FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.unitId, scope.companyId]
    );
    if (!unit) {
      throw new ValidationError("الوحدة غير موجودة", { field: "unitId", fix: "اختر وحدة مسجلة" });
    }
    if (unit.status === "rented") {
      throw new ConflictError(
        `الوحدة ${unit.unitNumber} مؤجرة بالفعل`,
        { field: "unitId", fix: "اختر وحدة متاحة أو أنهِ العقد الحالي قبل إنشاء عقد جديد" }
      );
    }
    if (["maintenance", "under_maintenance", "out_of_service"].includes(unit.status)) {
      throw new ConflictError(
        `لا يمكن تأجير وحدة بحالة ${unit.status}`,
        { field: "unitId", fix: "أعد الوحدة لحالة متاحة قبل إنشاء العقد" }
      );
    }

    // Defense in depth: even if the unit's status flag is stale, refuse to
    // create a second active/draft contract on the same unit. The unit.status
    // check above can lag (admin manually set "available" on a unit that
    // still has a contract), so this catches the contract-table truth.
    const [activeContract] = await rawQuery<{ id: number; contractNumber: string }>(
      `SELECT id, "contractNumber" FROM rental_contracts
       WHERE "unitId" = $1 AND "companyId" = $2 AND status IN ('active','draft')
         AND "deletedAt" IS NULL LIMIT 1`,
      [b.unitId, scope.companyId]
    );
    if (activeContract) {
      throw new ConflictError(
        `يوجد عقد نشط على الوحدة ${unit.unitNumber} (رقم ${activeContract.contractNumber})`,
        {
          field: "unitId",
          fix: "أنهِ العقد الحالي عبر زر الإنهاء أو التجديد قبل إنشاء عقد جديد.",
          meta: { existingContractId: activeContract.id },
        }
      );
    }

    // FK pre-check: tenant if provided
    if (b.tenantId) {
      const [tenant] = await rawQuery<any>(
        `SELECT id FROM tenants WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [Number(b.tenantId), scope.companyId]
      );
      if (!tenant) {
        throw new ValidationError("المستأجر غير موجود", { field: "tenantId", fix: "اختر مستأجراً مسجلاً أو اترك الحقل فارغاً" });
      }
    }

    const tenantId = b.tenantId ? Number(b.tenantId) : null;
    const frequency = b.paymentFrequency || 'monthly';
    let yearlyRent = b.yearlyRent ? Number(b.yearlyRent) : monthlyRent * 12;
    const contractMonths = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    const totalContractValue = b.totalContractValue ? Number(b.totalContractValue) : monthlyRent * contractMonths;

    let installmentCount = b.numberOfInstallments ? Number(b.numberOfInstallments) : null;
    if (!installmentCount) {
      if (frequency === 'monthly') installmentCount = contractMonths;
      else if (frequency === 'quarterly') installmentCount = Math.ceil(contractMonths / 3);
      else if (frequency === 'semi_annual') installmentCount = Math.ceil(contractMonths / 6);
      else if (frequency === 'annual') installmentCount = Math.ceil(contractMonths / 12);
      else installmentCount = contractMonths;
    }

    const contractNumber = b.contractNumber || `RC-${Date.now().toString(36).toUpperCase()}`;

    const { insertId } = await rawExecute(
      `INSERT INTO rental_contracts ("companyId","unitId","tenantId","tenantName","tenantPhone","tenantEmail","tenantIdNumber","startDate","endDate","monthlyRent","depositAmount","paymentDay",notes,status,
       "contractNumber","ejarNumber","contractType","paymentFrequency","yearlyRent","totalContractValue","latePenaltyType","latePenaltyValue","gracePeriodDays","terminationNoticeDays","earlyTerminationFee","autoRenewal","renewalNoticeDays","renewalPeriodMonths","electricityResponsibility","waterResponsibility","gasResponsibility","maintenanceResponsibility","brokerageFee","brokeragePayor","depositHolder","insuranceRequired","ownerId","numberOfInstallments","specialConditions","ejarStatus","registrationDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
       $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)`,
      [scope.companyId, b.unitId, tenantId, b.tenantName, b.tenantPhone, b.tenantEmail, b.tenantIdNumber, b.startDate, b.endDate, monthlyRent, b.depositAmount || 0, b.paymentDay || 1, b.notes, b.status || "active",
       contractNumber, b.ejarNumber || null, b.contractType || 'residential', frequency, yearlyRent, totalContractValue, b.latePenaltyType || 'percentage', b.latePenaltyValue || 0, b.gracePeriodDays || 0, b.terminationNoticeDays || 30, b.earlyTerminationFee || 0, b.autoRenewal || false, b.renewalNoticeDays || 60, b.renewalPeriodMonths || 12, b.electricityResponsibility || 'tenant', b.waterResponsibility || 'tenant', b.gasResponsibility || 'tenant', b.maintenanceResponsibility || 'shared', b.brokerageFee || 0, b.brokeragePayor || 'tenant', b.depositHolder || 'owner', b.insuranceRequired || false, b.ownerId || null, installmentCount, b.specialConditions || null, b.ejarStatus || 'draft', b.registrationDate || null]
    );

    await rawExecute(`UPDATE property_units SET status='rented', "updatedAt"=NOW() WHERE id=$1`, [b.unitId]);

    if (installmentCount && installmentCount > 0 && totalContractValue > 0) {
      const installmentAmount = Math.round((totalContractValue / installmentCount) * 100) / 100;
      const freqMonths = frequency === 'quarterly' ? 3 : frequency === 'semi_annual' ? 6 : frequency === 'annual' ? 12 : 1;
      for (let i = 0; i < installmentCount; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (i * freqMonths));
        if (b.paymentDay) dueDate.setDate(Math.min(Number(b.paymentDay), 28));
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const isLast = i === installmentCount - 1;
        const amt = isLast ? totalContractValue - (installmentAmount * (installmentCount - 1)) : installmentAmount;
        const rounded = Math.round(amt * 100) / 100;
        // Write to both contract_payment_schedule (legacy) and rent_payments (runtime table the queries read from)
        await rawExecute(
          `INSERT INTO contract_payment_schedule ("companyId","contractId","installmentNumber","dueDate",amount,status) VALUES ($1,$2,$3,$4,$5,'pending')`,
          [scope.companyId, insertId, i + 1, dueDateStr, rounded]
        );
        await rawExecute(
          `INSERT INTO rent_payments ("contractId","dueDate",amount,"paidAmount",status,notes) VALUES ($1,$2,$3,0,'pending',$4)`,
          [insertId, dueDateStr, rounded, `قسط ${i + 1}/${installmentCount}`]
        );
      }
    }

    // Register lifecycle obligations (renewal notice + expiration)
    try {
      const renewalNoticeDays = Number(b.renewalNoticeDays || 60);
      const renewalNoticeDate = new Date(endDate);
      renewalNoticeDate.setDate(renewalNoticeDate.getDate() - renewalNoticeDays);
      if (renewalNoticeDate > new Date()) {
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "rental_contract",
          entityId: insertId,
          obligationType: "renewal",
          title: `إشعار تجديد عقد ${contractNumber} — ${b.tenantName || ""}`,
          dueAt: renewalNoticeDate.toISOString(),
          metadata: { contractNumber, endDate: b.endDate, tenantName: b.tenantName },
          dedupeKey: `contract-${insertId}-renewal-notice`,
          escalationSteps: [{ hoursAfterDue: 24, notifyRole: "property_manager" }, { hoursAfterDue: 72, notifyRole: "general_manager" }],
        });
      }
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "rental_contract",
        entityId: insertId,
        obligationType: "document_expiry",
        title: `انتهاء عقد ${contractNumber} — ${b.tenantName || ""}`,
        dueAt: endDate.toISOString(),
        metadata: { contractNumber, unitId: b.unitId },
        dedupeKey: `contract-${insertId}-expiry`,
        escalationSteps: [{ hoursAfterDue: 0, notifyRole: "property_manager" }],
      });
    } catch (obErr) { console.error("Contract obligation registration failed:", obErr); }

    const [row] = await rawQuery<any>(`SELECT * FROM rental_contracts WHERE id=$1`, [insertId]);
    const schedule = await rawQuery<any>(`SELECT * FROM contract_payment_schedule WHERE "contractId"=$1 ORDER BY "installmentNumber"`, [insertId]);

    // Lifecycle event: lease.created
    await emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "lease.created", entity: "rental_contracts", entityId: insertId,
      details: `عقد إيجار جديد — ${b.tenantName || ''} — ${b.startDate} → ${b.endDate}`,
    }).catch(() => {});

    res.status(201).json({ ...row, paymentSchedule: schedule });
  } catch (err) { handleRouteError(err, res, "Create contract error:"); }
});

router.patch("/contracts/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM rental_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("العقد غير موجود");

    // Refuse any edits on contracts that have left the active lifecycle.
    // Historical contracts must stay immutable so audit trails and accounting
    // entries remain trustworthy. Use /renew or create a fresh contract.
    if (["terminated", "expired", "cancelled", "renewed"].includes(existing.status)) {
      throw new ConflictError(
        `لا يمكن تعديل عقد بحالة "${existing.status}"`,
        {
          field: "status",
          fix: "العقد منتهي. أنشئ عقداً جديداً أو جدّد العقد عبر /renew.",
          meta: { contractId: id, currentStatus: existing.status },
        }
      );
    }

    const parsed = updateContractSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

    // State machine: terminated/renewed/expired must go through dedicated
    // lifecycle endpoints (/renew, /terminate) so obligations + JE + unit
    // release side-effects fire. PATCH refuses those transitions outright.
    if (b.status !== undefined && b.status !== existing.status) {
      if (!CONTRACT_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة عقد غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${CONTRACT_STATUSES.join(", ")}` }
        );
      }
      if (["terminated", "renewed", "expired"].includes(b.status)) {
        throw new ConflictError(
          `لا يمكن تغيير حالة العقد إلى ${b.status} عبر PATCH`,
          { field: "status", fix: "استخدم /contracts/:id/renew أو /contracts/:id/terminate" }
        );
      }
      const allowedNext = CONTRACT_TRANSITIONS[existing.status] ?? [];
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل العقد من "${existing.status}" إلى "${b.status}" عبر PATCH`,
          {
            field: "status",
            fix: `استخدم /contracts/:id/renew أو /contracts/:id/terminate. الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}`,
          }
        );
      }
    }

    // Date range sanity check when either endpoint is edited
    if (b.startDate || b.endDate) {
      const sd = new Date(b.startDate || existing.startDate);
      const ed = new Date(b.endDate || existing.endDate);
      if (!Number.isNaN(sd.getTime()) && !Number.isNaN(ed.getTime()) && ed <= sd) {
        throw new ValidationError(
          "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية",
          { field: "endDate", fix: "اختر تاريخ نهاية لاحقاً لتاريخ البداية" }
        );
      }
    }

    const fields: string[] = [];
    const params: any[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const addField = (col: string, val: any) => {
      if (val === undefined) return;
      if (val === existing[col]) return;
      params.push(val);
      fields.push(`"${col}" = $${params.length}`);
      before[col] = existing[col];
      after[col] = val;
    };
    addField("tenantId", b.tenantId !== undefined ? (b.tenantId ? Number(b.tenantId) : null) : undefined);
    addField("tenantName", b.tenantName);
    addField("tenantPhone", b.tenantPhone);
    addField("tenantEmail", b.tenantEmail);
    addField("tenantIdNumber", b.tenantIdNumber);
    addField("startDate", b.startDate);
    addField("endDate", b.endDate);
    addField("monthlyRent", b.monthlyRent);
    addField("depositAmount", b.depositAmount);
    addField("paymentDay", b.paymentDay);
    addField("notes", b.notes);
    addField("status", b.status);
    addField("contractNumber", b.contractNumber);
    addField("ejarNumber", b.ejarNumber);
    addField("contractType", b.contractType);
    addField("paymentFrequency", b.paymentFrequency);
    addField("yearlyRent", b.yearlyRent);
    addField("totalContractValue", b.totalContractValue);
    addField("latePenaltyType", b.latePenaltyType);
    addField("latePenaltyValue", b.latePenaltyValue);
    addField("gracePeriodDays", b.gracePeriodDays);
    addField("terminationNoticeDays", b.terminationNoticeDays);
    addField("earlyTerminationFee", b.earlyTerminationFee);
    addField("autoRenewal", b.autoRenewal);
    addField("renewalNoticeDays", b.renewalNoticeDays);
    addField("renewalPeriodMonths", b.renewalPeriodMonths);
    addField("electricityResponsibility", b.electricityResponsibility);
    addField("waterResponsibility", b.waterResponsibility);
    addField("gasResponsibility", b.gasResponsibility);
    addField("maintenanceResponsibility", b.maintenanceResponsibility);
    addField("brokerageFee", b.brokerageFee);
    addField("brokeragePayor", b.brokeragePayor);
    addField("depositHolder", b.depositHolder);
    addField("insuranceRequired", b.insuranceRequired);
    addField("ownerId", b.ownerId !== undefined ? (b.ownerId || null) : undefined);
    addField("numberOfInstallments", b.numberOfInstallments);
    addField("specialConditions", b.specialConditions);
    addField("ejarStatus", b.ejarStatus);
    addField("registrationDate", b.registrationDate);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE rental_contracts SET ${fields.join(", ")}, "updatedAt"=NOW() WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) throw new NotFoundError("العقد غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "rental_contracts",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "property.contract.status_changed" : "property.contract.updated",
      entity: "rental_contracts",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update contract error:"); }
});

router.delete("/contracts/:id", requirePermission("property:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, status, "contractNumber", "unitId" FROM rental_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("العقد غير موجود");
    if (existing.status === "active") {
      throw new ConflictError(
        "لا يمكن حذف عقد نشط",
        { field: "status", fix: "أنهِ العقد عبر /contracts/:id/terminate قبل الحذف" }
      );
    }
    await rawExecute(`UPDATE rental_contracts SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.contract.deleted",
      entity: "rental_contracts",
      entityId: id,
      before: { status: existing.status, contractNumber: existing.contractNumber },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ message: "تم حذف العقد" });
  } catch (err) { handleRouteError(err, res, "Delete contract error:"); }
});

// ────────────────────────────────────────────────────────────────────────────
// Contract lifecycle endpoints — renew / terminate
// Status model: active → (renewed | terminated | expired)
// ────────────────────────────────────────────────────────────────────────────

/** Renew an active contract — extends endDate, generates new installments, resets obligations */
router.post("/contracts/:id/renew", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body || {};
    const [contract] = await rawQuery<any>(
      `SELECT * FROM rental_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (!["active", "expired"].includes(contract.status)) {
      throw new ConflictError(
        `لا يمكن تجديد عقد بحالة ${contract.status}`,
        { field: "status", fix: "يمكن تجديد العقود النشطة أو المنتهية فقط" }
      );
    }

    const renewalMonths = Number(b.renewalPeriodMonths || contract.renewalPeriodMonths || 12);
    const newStartDate = new Date(b.newStartDate || contract.endDate);
    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(newEndDate.getMonth() + renewalMonths);

    const newMonthlyRent = Number(b.monthlyRent || contract.monthlyRent);
    const newYearlyRent = b.yearlyRent ? Number(b.yearlyRent) : newMonthlyRent * 12;
    const newTotal = Number(b.totalContractValue || (newMonthlyRent * renewalMonths));

    // Update contract
    await rawExecute(
      `UPDATE rental_contracts
         SET "startDate"=$1,"endDate"=$2,"monthlyRent"=$3,"yearlyRent"=$4,"totalContractValue"=$5,
             status='active',"updatedAt"=NOW()
       WHERE id=$6 AND "companyId"=$7`,
      [newStartDate.toISOString().split("T")[0], newEndDate.toISOString().split("T")[0],
       newMonthlyRent, newYearlyRent, newTotal, id, scope.companyId]
    );

    // Generate new payment schedule for the renewal period
    const freq = contract.paymentFrequency || "monthly";
    const freqMonths = freq === "quarterly" ? 3 : freq === "semi_annual" ? 6 : freq === "annual" ? 12 : 1;
    const installmentCount = Math.ceil(renewalMonths / freqMonths);
    const installmentAmount = Math.round((newTotal / installmentCount) * 100) / 100;
    const [maxRow] = await rawQuery<any>(
      `SELECT COALESCE(MAX("installmentNumber"),0) AS max FROM contract_payment_schedule WHERE "contractId"=$1`,
      [id]
    );
    const startNum = Number(maxRow?.max || 0);
    for (let i = 0; i < installmentCount; i++) {
      const dueDate = new Date(newStartDate);
      dueDate.setMonth(dueDate.getMonth() + (i * freqMonths));
      if (contract.paymentDay) dueDate.setDate(Math.min(Number(contract.paymentDay), 28));
      const isLast = i === installmentCount - 1;
      const amt = isLast ? newTotal - (installmentAmount * (installmentCount - 1)) : installmentAmount;
      await rawExecute(
        `INSERT INTO contract_payment_schedule ("companyId","contractId","installmentNumber","dueDate",amount,status)
         VALUES ($1,$2,$3,$4,$5,'pending')`,
        [scope.companyId, id, startNum + i + 1, dueDate.toISOString().split("T")[0], Math.round(amt * 100) / 100]
      );
    }

    // Cancel old obligations and register new ones for the renewed period
    await cancelObligation(scope.companyId, "rental_contract", id, "renewal");
    await cancelObligation(scope.companyId, "rental_contract", id, "document_expiry");

    const renewalNoticeDays = Number(contract.renewalNoticeDays || 60);
    const renewalNoticeDate = new Date(newEndDate);
    renewalNoticeDate.setDate(renewalNoticeDate.getDate() - renewalNoticeDays);
    if (renewalNoticeDate > new Date()) {
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "rental_contract",
        entityId: id,
        obligationType: "renewal",
        title: `إشعار تجديد عقد ${contract.contractNumber} — ${contract.tenantName || ""}`,
        dueAt: renewalNoticeDate.toISOString(),
        metadata: { contractNumber: contract.contractNumber, endDate: newEndDate.toISOString() },
        dedupeKey: `contract-${id}-renewal-notice-${newEndDate.toISOString().split("T")[0]}`,
      });
    }
    await registerObligation({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      entityType: "rental_contract",
      entityId: id,
      obligationType: "document_expiry",
      title: `انتهاء عقد ${contract.contractNumber} — ${contract.tenantName || ""}`,
      dueAt: newEndDate.toISOString(),
      dedupeKey: `contract-${id}-expiry-${newEndDate.toISOString().split("T")[0]}`,
    });

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "property.contract.renewed",
      entity: "rental_contract",
      entityId: id,
      details: `تجديد عقد ${contract.contractNumber} حتى ${newEndDate.toISOString().split("T")[0]}`,
    });
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "renew", entity: "rental_contracts", entityId: id,
      before: { endDate: contract.endDate, totalContractValue: contract.totalContractValue },
      after: { endDate: newEndDate.toISOString().split("T")[0], totalContractValue: newTotal },
    }).catch(console.error);

    const [updated] = await rawQuery<any>(`SELECT * FROM rental_contracts WHERE id=$1`, [id]);
    res.json({ ...updated, event: "property.contract.renewed", renewalMonths });
  } catch (err) { handleRouteError(err, res, "Renew contract error:"); }
});

/** Terminate an active contract — early termination with optional fee */
router.post("/contracts/:id/terminate", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body || {};
    const [contract] = await rawQuery<any>(
      `SELECT * FROM rental_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (!["active", "draft"].includes(contract.status)) {
      throw new ConflictError(
        `لا يمكن إنهاء عقد بحالة ${contract.status}`,
        { field: "status", fix: "العقد منتهي أو ملغي مسبقاً" }
      );
    }
    if (!b.reason || typeof b.reason !== "string" || !b.reason.trim()) {
      throw new ValidationError("يجب تحديد سبب الإنهاء", { field: "reason", fix: "أدخل سبب إنهاء العقد" });
    }

    const terminationDate = b.terminationDate || new Date().toISOString().split("T")[0];
    const earlyFee = Number(b.earlyTerminationFee ?? contract.earlyTerminationFee ?? 0);

    // Update contract
    await rawExecute(
      `UPDATE rental_contracts
         SET status='terminated',"terminatedAt"=NOW(),"terminationReason"=$1,"updatedAt"=NOW()
       WHERE id=$2 AND "companyId"=$3`,
      [b.reason, id, scope.companyId]
    ).catch(async () => {
      // If terminatedAt/terminationReason columns don't exist, fall back to status-only
      await rawExecute(
        `UPDATE rental_contracts SET status='terminated',"updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
        [id, scope.companyId]
      );
    });

    // Cancel remaining pending installments
    await rawExecute(
      `UPDATE contract_payment_schedule SET status='cancelled'
       WHERE "contractId"=$1 AND status='pending' AND "dueDate" > $2`,
      [id, terminationDate]
    );

    // Free the unit
    if (contract.unitId) {
      await rawExecute(
        `UPDATE property_units SET status='available', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
        [contract.unitId, scope.companyId]
      );
    }

    // Cancel active obligations
    await cancelObligation(scope.companyId, "rental_contract", id, "renewal");
    await cancelObligation(scope.companyId, "rental_contract", id, "document_expiry");

    let journalEntryId: number | null = null;
    if (earlyFee > 0) {
      const receivableCode = await getAccountCodeFromMapping(scope.companyId, "rental_receivable", "debit", "1200");
      const revenueCode = await getAccountCodeFromMapping(scope.companyId, "rental_revenue", "credit", "4100");
      journalEntryId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `TERM-${id}-${Date.now()}`,
        description: `رسوم إنهاء مبكر لعقد ${contract.contractNumber} — ${b.reason}`,
        type: "rental", sourceType: "rental_contract", sourceId: Number(id),
        lines: [
          { accountCode: receivableCode, debit: earlyFee, credit: 0, contractId: Number(id), propertyId: contract.unitId },
          { accountCode: revenueCode, debit: 0, credit: earlyFee, contractId: Number(id), propertyId: contract.unitId },
        ],
      }, { table: "property_contracts", id: Number(id) }).catch(() => null);
    }

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "property.contract.terminated",
      entity: "rental_contract",
      entityId: id,
      details: `إنهاء عقد ${contract.contractNumber}: ${b.reason}`,
    });
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "terminate", entity: "rental_contracts", entityId: id,
      before: { status: contract.status },
      after: { status: "terminated", reason: b.reason, earlyFee, journalEntryId },
    }).catch(console.error);

    const [updated] = await rawQuery<any>(`SELECT * FROM rental_contracts WHERE id=$1`, [id]);
    res.json({ ...updated, event: "property.contract.terminated", earlyFee, journalEntryId });
  } catch (err) { handleRouteError(err, res, "Terminate contract error:"); }
});

router.patch("/tenants/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM tenants WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المستأجر غير موجود");
    const b = req.body;

    if (b.nationalId && b.nationalId !== existing.nationalId) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM tenants WHERE "nationalId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3`,
        [b.nationalId, scope.companyId, id]
      );
      if (dup) {
        throw new ConflictError(
          "رقم الهوية مسجل مسبقاً لمستأجر آخر",
          { field: "nationalId", fix: "تحقق من صحة الرقم" }
        );
      }
    }

    const fields: string[] = [];
    const params: any[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const addField = (col: string, val: any) => {
      if (val === undefined) return;
      if (val === existing[col]) return;
      params.push(val);
      fields.push(`"${col}" = $${params.length}`);
      before[col] = existing[col];
      after[col] = val;
    };
    addField("name", b.name);
    addField("phone", b.phone);
    addField("email", b.email);
    addField("nationalId", b.nationalId);
    addField("nationality", b.nationality);
    addField("idType", b.idType);
    addField("tenantType", b.tenantType);
    addField("crNumber", b.crNumber);
    addField("unifiedNumber", b.unifiedNumber);
    addField("birthDate", b.birthDate);
    addField("gender", b.gender);
    addField("guarantorName", b.guarantorName);
    addField("guarantorId", b.guarantorId);
    addField("guarantorPhone", b.guarantorPhone);
    addField("guarantorRelation", b.guarantorRelation);
    addField("emergencyContact", b.emergencyContact);
    addField("emergencyName", b.emergencyName);
    addField("maritalStatus", b.maritalStatus);
    addField("occupation", b.occupation);
    addField("monthlyIncome", b.monthlyIncome);
    addField("previousAddress", b.previousAddress);
    addField("previousLandlord", b.previousLandlord);
    addField("previousLandlordPhone", b.previousLandlordPhone);
    addField("notes", b.notes);
    if (fields.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE tenants SET ${fields.join(", ")}, "updatedAt"=NOW() WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "tenants",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "tenant.updated",
      entity: "tenants",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update tenant error:"); }
});

router.delete("/tenants/:id", requirePermission("property:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, name FROM tenants WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المستأجر غير موجود");

    const [activeContract] = await rawQuery<any>(
      `SELECT id FROM rental_contracts
       WHERE "tenantId"=$1 AND "companyId"=$2
         AND status IN ('active','draft') AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeContract) {
      throw new ConflictError(
        "لا يمكن حذف المستأجر — يوجد عقد إيجار نشط مرتبط به",
        { field: "status", fix: "أنهِ العقد قبل حذف المستأجر" }
      );
    }

    await rawExecute(`UPDATE tenants SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "tenant.deleted",
      entity: "tenants",
      entityId: id,
      before: { name: existing.name },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ message: "تم حذف المستأجر" });
  } catch (err) { handleRouteError(err, res, "Delete tenant error:"); }
});

router.get("/payments", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, contractId } = req.query as any;
    const conditions = [`c."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`rp.status = $${params.length}`); }
    if (contractId) { params.push(Number(contractId)); conditions.push(`rp."contractId" = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT rp.*, c."tenantName", u."unitNumber" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" AND c."deletedAt" IS NULL LEFT JOIN property_units u ON u.id=c."unitId" AND u."deletedAt" IS NULL WHERE ${conditions.join(" AND ")} ORDER BY rp."dueDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Rent payments error:"); }
});

router.post("/payments/:id/pay", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const b = req.body;
    const paidAmount = Number(b.paidAmount ?? b.amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      throw new ValidationError("مبلغ السداد غير صالح", { field: "paidAmount", fix: "أدخل مبلغاً موجباً" });
    }

    // Fetch payment + contract context BEFORE mutating so we can post GL first.
    const [existing] = await rawQuery<any>(
      `SELECT rp.*, c.status AS "contractStatus", c."tenantName", u."unitNumber", u."buildingName", u.id AS "unitId"
         FROM rent_payments rp
         JOIN rental_contracts c ON c.id = rp."contractId"
         LEFT JOIN property_units u ON u.id = c."unitId"
        WHERE rp.id = $1`,
      [Number(id)]
    );
    if (!existing) throw new NotFoundError("القسط غير موجود");

    // Refuse to record payments against contracts that are no longer in
    // a payable state. The /renew or /terminate flows are the only paths
    // that change a contract's lifecycle — a fresh payment on a terminated
    // contract would create a misleading audit trail.
    if (!["active", "draft"].includes(existing.contractStatus)) {
      throw new ConflictError(
        `لا يمكن تسجيل دفعة على عقد بحالة "${existing.contractStatus}"`,
        {
          field: "contractStatus",
          fix: "أعد تفعيل العقد أو أنشئ عقداً جديداً قبل تسجيل الدفعة.",
          meta: { paymentId: Number(id), contractStatus: existing.contractStatus },
        }
      );
    }

    // 1. Post journal entry FIRST. If this fails, the payment update never happens,
    //    preserving dual-entry invariants (no cash recorded without a GL post).
    const tenantLabel = existing.tenantName ? ` / ${existing.tenantName}` : "";
    const unitLabel = existing.unitNumber ? ` / وحدة ${existing.unitNumber}` : "";
    const buildingLabel = existing.buildingName ? ` / ${existing.buildingName}` : "";
    const cashDefault = b.method === 'cash' ? '1100' : '1110';
    const cashAccountCode = await getAccountCodeFromMapping(scope.companyId, "rental_cash_receipt", "debit", cashDefault);
    const rentalRevenueCode = await getAccountCodeFromMapping(scope.companyId, "rental_revenue", "credit", "4100");
    let journalEntryId: number | null = null;
    try {
      journalEntryId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `RENT-${id}`,
        description: `تحصيل إيجار${tenantLabel}${unitLabel}${buildingLabel}`,
        sourceType: "rent_payment",
        sourceId: Number(id),
        lines: [
          { accountCode: cashAccountCode, debit: paidAmount, credit: 0, contractId: existing.contractId, propertyId: existing.unitId },
          { accountCode: rentalRevenueCode, debit: 0, credit: paidAmount, contractId: existing.contractId, propertyId: existing.unitId },
        ],
      }, { table: "rent_payments", id: Number(id) });
    } catch (jErr) {
      console.error("Rent payment journal entry failed:", jErr);
      throw new IntegrationError(
        "فشل قيد تحصيل الإيجار — لم يتم تسجيل السداد",
        { field: "journalEntry", fix: "راجع إعدادات التوجيه المحاسبي (rental_revenue / rental_cash_receipt) ثم أعد المحاولة" }
      );
    }

    // 2. Journal succeeded — record the cash receipt on the rent_payments row.
    await rawExecute(
      `UPDATE rent_payments
          SET "paidAmount" = "paidAmount" + $1,
              "paidDate"   = $2,
              method       = $3,
              status       = CASE WHEN "paidAmount" + $1 >= amount THEN 'paid' ELSE 'partial' END,
              "journalEntryId" = COALESCE("journalEntryId", $4),
              "updatedAt"  = NOW()
        WHERE id = $5`,
      [paidAmount, b.paidDate || new Date().toISOString().split('T')[0], b.method || 'bank_transfer', journalEntryId, Number(id)]
    );

    const [row] = await rawQuery<any>(`SELECT * FROM rent_payments WHERE id=$1`, [Number(id)]);

    // 3. Emit lifecycle event so listeners/reports pick up the collection.
    await emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "rent_payment.received", entity: "rent_payments", entityId: Number(id),
      details: `تحصيل ${paidAmount} — JE ${journalEntryId ?? '-'}`,
    }).catch(() => {});

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Record rent payment error:"); }
});

router.post("/late-rent/escalate", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const today = new Date();

    const overduePayments = await rawQuery<any>(
      `SELECT rp.*, c."tenantName", c."tenantPhone", c.id AS "contractId", c."monthlyRent", u."unitNumber", u."buildingName" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" LEFT JOIN property_units u ON u.id=c."unitId" WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE`,
      [cid]
    );

    const results: any[] = [];
    for (const payment of overduePayments) {
      const dueDate = new Date(payment.dueDate);
      const lateDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      let targetStage: string | null = null;
      if (lateDays >= 90) targetStage = 'legal_transfer';
      else if (lateDays >= 60) targetStage = 'penalty_applied';
      else if (lateDays >= 30) targetStage = 'escalation';
      else if (lateDays >= 14) targetStage = 'field_visit';
      else if (lateDays >= 7) targetStage = 'notification';
      else if (lateDays >= 3) targetStage = 'alert';

      if (!targetStage) continue;

      const existingAction = await rawQuery<any>(
        `SELECT id FROM late_rent_actions WHERE "paymentId"=$1 AND phase=$2 LIMIT 1`,
        [payment.id, targetStage]
      );
      if (existingAction.length > 0) {
        results.push({ paymentId: payment.id, tenant: payment.tenantName, unit: payment.unitNumber, lateDays, stage: targetStage, skipped: true, reason: 'already_applied' });
        continue;
      }

      let action: string | null = null;
      let financialMutation: any = null;

      if (targetStage === 'legal_transfer') {
        action = 'تحويل للقسم القانوني';
        try {
          // Resolve a real responsible person so the auto-created case isn't
          // orphaned in open/NULL-assignee limbo.
          const responsible = await getLegalResponsible(cid);
          const lawyerName = responsible?.employeeName ?? null;

          const { insertId: caseId } = await rawExecute(
            `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType","opposingParty","lawyerName",status,priority,description) VALUES ($1,$2,$3,'property_rent',$4,$5,'open','high',$6)`,
            [cid, `RENT-${payment.id}-${Date.now()}`, `تحصيل إيجار - ${payment.unitNumber} - ${payment.tenantName}`, payment.tenantName, lawyerName, `إيجار متأخر ${lateDays} يوم - وحدة ${payment.unitNumber} - مبلغ ${payment.amount} ريال`]
          );

          emitEvent({
            companyId: cid, userId: scope.userId,
            action: "legal.case.created", entity: "legal_cases", entityId: Number(caseId),
            details: `قضية إيجار متأخر — ${payment.tenantName}`,
          }).catch(console.error);

          if (responsible) {
            createNotification({
              companyId: cid,
              assignmentId: responsible.assignmentId,
              type: "legal_case_assigned",
              title: "قضية إيجار متأخر مسندة إليك",
              body: `تم إنشاء قضية تحصيل إيجار متأخر للمستأجر ${payment.tenantName} — وحدة ${payment.unitNumber}`,
              priority: "high",
              refType: "legal_case",
              refId: Number(caseId),
              actionUrl: `/legal/cases/${caseId}`,
            }).catch(console.error);
          }
        } catch (legalErr) {
          console.error("Failed to create legal case:", legalErr);
        }
      } else if (targetStage === 'penalty_applied') {
        const lateFee = Number(payment.amount) * 0.02;
        action = `تطبيق غرامة تأخير 2% = ${lateFee.toFixed(2)} ريال`;
        await rawExecute(
          `UPDATE rent_payments SET amount=amount+$1, notes=CONCAT(COALESCE(notes,''), ' | غرامة تأخير 2%: ',$2::text) WHERE id=$3`,
          [lateFee, lateFee.toFixed(2), payment.id]
        );
        financialMutation = { lateFee, newAmount: Number(payment.amount) + lateFee };
      } else if (targetStage === 'escalation') {
        action = 'تصعيد لإدارة الأملاك';
      } else if (targetStage === 'field_visit') {
        action = 'زيارة ميدانية للمستأجر';
      } else if (targetStage === 'notification') {
        action = 'إشعار رسمي للمستأجر';
        console.log(`[SMS] تذكير متأخرات: ${payment.tenantName} — ${payment.tenantPhone} — مبلغ ${payment.amount} ريال`);
      } else if (targetStage === 'alert') {
        action = 'تنبيه بالتأخر';
      }

      try {
        await rawExecute(
          `INSERT INTO late_rent_actions ("contractId","paymentId",phase,action,"sentAt",notes) VALUES ($1,$2,$3,$4,NOW(),$5)`,
          [payment.contractId, payment.id, targetStage, action, `إيجار متأخر ${lateDays} يوم — المرحلة: ${targetStage}`]
        );
      } catch (logErr) {
        console.error("Failed to log late_rent_action:", logErr);
      }

      if (payment.unitId) {
        try {
          await createAuditLog({
            userId: scope.userId, entity: "property_units", entityId: payment.unitId,
            action: targetStage === "penalty_applied" ? "auto_penalty" : "late_rent_escalation",
            companyId: cid,
            before: null,
            after: { stage: targetStage, lateDays, action, paymentId: payment.id, tenant: payment.tenantName, ...(financialMutation || {}) },
          });
        } catch (auditErr) { console.error("Penalty audit log error:", auditErr); }
      }

      results.push({ paymentId: payment.id, tenant: payment.tenantName, unit: payment.unitNumber, lateDays, stage: targetStage, action, financialMutation });
    }

    res.json({ processed: results.length, results });
  } catch (err) { handleRouteError(err, res, "Late rent escalation error:"); }
});

router.get("/maintenance-requests", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`mr."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`mr.status = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT mr.*, u."unitNumber", u."buildingName", t.name AS "technicianName" FROM maintenance_requests mr LEFT JOIN property_units u ON u.id=mr."unitId" LEFT JOIN technicians t ON t.id=mr."assignedTo" WHERE ${conditions.join(" AND ")} ORDER BY mr.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Maintenance requests error:"); }
});

router.post("/maintenance-requests", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (!b.unitId) {
      throw new ValidationError("الوحدة مطلوبة", { field: "unitId", fix: "اختر الوحدة التي يتعلق بها البلاغ" });
    }
    if (!b.description || typeof b.description !== "string" || !b.description.trim()) {
      throw new ValidationError("وصف البلاغ مطلوب", { field: "description", fix: "اكتب وصفاً لمشكلة الصيانة" });
    }
    const [unit] = await rawQuery<any>(
      `SELECT id FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.unitId, scope.companyId]
    );
    if (!unit) {
      throw new ValidationError("الوحدة غير موجودة", { field: "unitId", fix: "اختر وحدة مسجلة في النظام" });
    }

    const emergencyKeywords = ['تسرب', 'حريق', 'كسر', 'انهيار', 'غاز', 'كهرباء', 'طوارئ', 'خطر', 'فيضان', 'ماس كهربائي'];
    const descLower = (b.description || '').toLowerCase();
    const isEmergency = emergencyKeywords.some(kw => descLower.includes(kw));

    const pastRequests = await rawQuery<any>(
      `SELECT EXTRACT(EPOCH FROM ("completedAt"::timestamp - "createdAt"::timestamp))/86400 AS days FROM maintenance_requests WHERE "unitId"=$1 AND status='completed' AND "completedAt" IS NOT NULL ORDER BY id DESC LIMIT 10`,
      [b.unitId]
    );
    const responseDays = pastRequests.map((r: any) => Number(r.days)).filter((d: number) => d > 0);
    const avgResponseDays = responseDays.length > 0 ? movingAverage(responseDays) : 5;
    const estimatedDuration = Math.max(1, Math.round(avgResponseDays));

    let autoPriority = b.priority || maintenancePriority(b.category, avgResponseDays);
    if (isEmergency && autoPriority !== 'critical') autoPriority = 'critical';
    const slaDeadline = maintenanceSlaDeadline(autoPriority);

    const technicians = await rawQuery<any>(
      `SELECT t.*, COUNT(mr2.id) AS "activeJobs",
              COALESCE(t.rating, 3) AS "techRating"
       FROM technicians t
       LEFT JOIN maintenance_requests mr2 ON mr2."assignedTo"=t.id AND mr2.status NOT IN ('completed','closed')
       WHERE t."companyId"=$1 AND t.status='available'
       GROUP BY t.id
       ORDER BY COUNT(mr2.id) ASC`,
      [scope.companyId]
    );

    let assignedTechnicianId = b.assignedTo || null;
    let techDistance: number | null = null;
    if (!assignedTechnicianId && technicians.length > 0) {
      let best = technicians[0];
      let bestScore = -Infinity;
      const maxJobs = Math.max(...technicians.map((t: any) => Number(t.activeJobs) || 0), 1);

      for (const tech of technicians) {
        const activeJobs = Number(tech.activeJobs) || 0;
        const loadScore = (1 - activeJobs / maxJobs) * 0.4;

        let proxScore = 0.15;
        if (b.unitLat && b.unitLon && tech.latitude && tech.longitude) {
          const dist = haversineKm(Number(b.unitLat), Number(b.unitLon), Number(tech.latitude), Number(tech.longitude));
          proxScore = (1 / (1 + dist)) * 0.3;
        }

        const rating = Number(tech.techRating) || 3;
        const ratingScore = (rating / 5) * 0.2;
        const specialtyMatch = (tech.specialty && b.category && tech.specialty.toLowerCase().includes(b.category.toLowerCase())) ? 0.1 : 0;

        const combined = loadScore + proxScore + ratingScore + specialtyMatch;
        if (combined > bestScore) { bestScore = combined; best = tech; }
      }
      assignedTechnicianId = best.id;

      if (b.unitLat && b.unitLon && best.latitude && best.longitude) {
        techDistance = haversineKm(Number(b.unitLat), Number(b.unitLon), Number(best.latitude), Number(best.longitude));
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO maintenance_requests ("companyId","unitId","contractId","tenantName",category,description,priority,status,"assignedTo","estimatedCost") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.unitId, b.contractId || null, b.tenantName || null, b.category || null, b.description, autoPriority, assignedTechnicianId ? 'assigned' : 'pending', assignedTechnicianId, b.estimatedCost || 0]
    );

    if (assignedTechnicianId) {
      try {
        const [techEmp] = await rawQuery<any>(
          `SELECT t."employeeId", ea.id AS "assignmentId" FROM technicians t
           LEFT JOIN employee_assignments ea ON ea."employeeId"=t."employeeId" AND ea.status='active'
           WHERE t.id=$1`, [assignedTechnicianId]);
        if (techEmp?.assignmentId) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: techEmp.assignmentId,
            type: "maintenance_request",
            title: "بلاغ صيانة جديد مسند إليك",
            body: `بلاغ صيانة: ${b.category || 'عام'} — ${b.description?.substring(0, 80) || ''} — الأولوية: ${autoPriority}`,
            priority: autoPriority === 'critical' ? 'high' : 'normal',
            refType: "maintenance_requests",
            refId: insertId,
          }).catch(console.error);
        }
      } catch (notifErr) { console.error("Technician notification error:", notifErr); }
    }

    if (b.tenantPhone) {
      console.log(`[SMS] بلاغ صيانة #${insertId} — SMS للمستأجر ${b.tenantName}: تم استلام بلاغك وسيتم التواصل معك خلال ${estimatedDuration} يوم`);
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "maintenance_requests", entityId: insertId,
      after: { category: b.category, priority: autoPriority, assignedTo: assignedTechnicianId, isEmergency },
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.maintenance.requested",
      entity: "property_maintenance_requests",
      entityId: insertId,
      details: JSON.stringify({ unitId: b.unitId, category: b.category, priority: autoPriority, isEmergency, assignedTo: assignedTechnicianId }),
    }).catch(console.error);

    try {
      let techAssignmentId = null;
      if (assignedTechnicianId) {
        const [techEmp] = await rawQuery<any>(
          `SELECT ea.id FROM technicians t LEFT JOIN employee_assignments ea ON ea."employeeId"=t."employeeId" AND ea.status='active' WHERE t.id=$1`,
          [assignedTechnicianId]
        );
        if (techEmp) techAssignmentId = techEmp.id;
      }
      await rawExecute(
        `INSERT INTO tasks ("companyId","branchId","assignmentId","assignedTo",title,description,type,priority,status,"linkedEntityType","linkedEntityId","autoGenerated","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,'task',$7,'pending','maintenance_request',$8,true,NOW())`,
        [
          scope.companyId, scope.branchId, scope.activeAssignmentId,
          techAssignmentId || scope.activeAssignmentId,
          `صيانة: ${b.category || 'عام'} — بلاغ #${insertId}`,
          b.description || null,
          autoPriority === 'critical' ? 'high' : 'medium',
          insertId,
        ]
      );
    } catch (taskErr) { console.error("Auto-task creation failed:", taskErr); }

    const [row] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [insertId]);
    res.status(201).json({
      ...row,
      smsNotificationQueued: !!b.tenantPhone,
      technicianAssigned: !!assignedTechnicianId,
      technicianDistance: techDistance,
      priority: autoPriority,
      isEmergency,
      avgResponseDays,
      estimatedDuration,
    });
  } catch (err) { handleRouteError(err, res, "Create maintenance request error:"); }
});

router.patch("/maintenance-requests/:id/approve", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { approved, notes } = req.body as any;

    const [mr] = await rawQuery<any>(
      `SELECT * FROM maintenance_requests WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!mr) throw new NotFoundError("طلب الصيانة غير موجود");

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && (!notes || !String(notes).trim())) {
      throw new ValidationError("يجب ذكر سبب الرفض", { field: "notes", fix: "أدخل سبب الرفض في حقل الملاحظات" });
    }

    // State machine: approval is only valid from pending/open/returned.
    const allowedNext = MAINT_REQUEST_TRANSITIONS[mr.status] ?? [];
    if (!allowedNext.includes(newStatus)) {
      throw new ConflictError(
        `لا يمكن ${newStatus === "approved" ? "اعتماد" : newStatus === "rejected" ? "رفض" : "إرجاع"} طلب بحالة "${mr.status}"`,
        {
          field: "status",
          fix: `الانتقالات المسموحة من الحالة الحالية: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}`,
        }
      );
    }

    await rawExecute(
      `UPDATE maintenance_requests SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('maintenance_request',$1,$2,$3,$4,$5)`,
        [id, newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    // Audit + event + creator notification. Without these the requester
    // (tenant-facing officer or reporting staff) has no idea whether their
    // maintenance request was approved, rejected, or returned for rework.
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: newStatus, entity: "maintenance_requests", entityId: id,
      before: { status: mr.status }, after: { status: newStatus, notes: notes ?? null },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: `maintenance.${newStatus}`, entity: "maintenance_requests", entityId: id,
      details: `طلب صيانة ${mr.title || id} — ${newStatus}`,
    }).catch(console.error);

    if (mr.createdBy) {
      const titleMap: Record<string, string> = {
        approved: "تم اعتماد طلب الصيانة",
        rejected: "تم رفض طلب الصيانة",
        returned: "تم إرجاع طلب الصيانة للمراجعة",
      };
      createNotification({
        companyId: scope.companyId,
        assignmentId: Number(mr.createdBy),
        type: `maintenance_${newStatus}`,
        title: titleMap[newStatus] || `حالة طلب الصيانة: ${newStatus}`,
        body: `${mr.title || `طلب #${id}`}${notes ? ` — ${notes}` : ''}`,
        priority: newStatus === "rejected" ? "high" : "normal",
        refType: "maintenance_request",
        refId: id,
        actionUrl: `/properties/maintenance/${id}`,
      }).catch(console.error);
    }

    res.json({ id, status: newStatus });
  } catch (err) { handleRouteError(err, res, "خطأ في اعتماد طلب الصيانة"); }
});

router.post("/maintenance-requests/:id/complete", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const [mr] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!mr) throw new NotFoundError("الطلب غير موجود");

    // State machine — only valid from assigned or in_progress
    const allowedNext = MAINT_REQUEST_TRANSITIONS[mr.status] ?? [];
    if (!allowedNext.includes("completed")) {
      throw new ConflictError(
        `لا يمكن إكمال طلب بحالة "${mr.status}"`,
        {
          field: "status",
          fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}`,
        }
      );
    }

    // Closure preconditions — report + after photos + cost + materials.
    // The previous implementation sent them as a raw validationErrors array
    // which the frontend's toast layer shows as a single "حدث خطأ" fallback.
    // Shipping them as one ValidationError with a structured meta lets the
    // client render each individual message.
    const validationErrors: string[] = [];
    if (!b.closureReport && !mr.closureReport) validationErrors.push("تقرير الإغلاق مطلوب");
    const afterPhotos = b.afterPhotos || (mr.afterPhotos ? (typeof mr.afterPhotos === "string" ? JSON.parse(mr.afterPhotos) : mr.afterPhotos) : []);
    if (!afterPhotos || afterPhotos.length === 0) validationErrors.push("صور ما بعد الصيانة مطلوبة (صورة واحدة على الأقل)");
    const costInput = b.actualCost !== undefined ? b.actualCost : b.cost;
    const resolvedCost = costInput !== undefined ? Number(costInput) : (mr.actualCost !== null && mr.actualCost !== undefined ? Number(mr.actualCost) : null);
    if (resolvedCost === null || isNaN(resolvedCost)) {
      validationErrors.push("التكلفة الفعلية مطلوبة");
    } else if (resolvedCost < 0) {
      validationErrors.push("التكلفة الفعلية لا يمكن أن تكون سالبة");
    } else if (resolvedCost === 0 && !b.zeroCostConfirmed) {
      validationErrors.push("يرجى تأكيد أن التكلفة صفر");
    }
    const materials = b.materialsUsed || (mr.materialsUsed ? (typeof mr.materialsUsed === "string" ? JSON.parse(mr.materialsUsed) : mr.materialsUsed) : []);
    if (!materials || !Array.isArray(materials) || materials.length === 0) validationErrors.push("قائمة المواد المستخدمة مطلوبة (مادة واحدة على الأقل)");
    if (validationErrors.length > 0) {
      throw new ValidationError(
        "بيانات الإغلاق غير مكتملة",
        {
          field: "closureReport",
          fix: validationErrors.join(" | "),
          meta: { validationErrors },
        }
      );
    }

    const cost = resolvedCost ?? 0;
    const completeSets = [`status='completed'`, `"completedAt"=NOW()`, `"updatedAt"=NOW()`];
    const completeParams: any[] = [];
    if (costInput !== undefined) { completeParams.push(cost); completeSets.push(`"actualCost"=$${completeParams.length}`); }
    if (b.closureReport) { completeParams.push(b.closureReport); completeSets.push(`"closureReport"=$${completeParams.length}`); }
    if (b.afterPhotos) { completeParams.push(JSON.stringify(b.afterPhotos)); completeSets.push(`"afterPhotos"=$${completeParams.length}`); }
    if (b.materialsUsed) { completeParams.push(JSON.stringify(b.materialsUsed)); completeSets.push(`"materialsUsed"=$${completeParams.length}`); }
    completeParams.push(id);
    await rawExecute(
      `UPDATE maintenance_requests SET ${completeSets.join(",")} WHERE id=$${completeParams.length}`,
      completeParams
    );

    let invoiceId: number | null = null;
    if (cost > 0 && !b.coveredByContract) {
      const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
      const yearShort = String(new Date().getFullYear()).slice(2);
      const ref = `INV-MAINT-${yearShort}${monthNum}-${id}`;
      const vatAmount = cost * 0.15;
      const { insertId: iId } = await rawExecute(
        `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,NULL,$2,$3,$4,$5,$6,15,0,'draft',$7,$8)`,
        [scope.companyId, ref, `صيانة - ${mr.category} - ${mr.tenantName}`, cost, cost + vatAmount, vatAmount, new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], scope.userId]
      );
      invoiceId = iId;
      try {
        await createAuditLog({
          companyId: scope.companyId,
          userId: scope.userId,
          action: "auto_invoice_created",
          entity: "maintenance_requests",
          entityId: id,
          after: { message: `تم إنشاء فاتورة مسودة تلقائياً بقيمة ${cost.toFixed(2)} ريال`, invoiceId: iId, ref },
        });
      } catch (aErr) { console.error("Auto-invoice audit log failed:", aErr); }
    }

    if (mr.assignedTo) {
      try {
        const completedCount = await rawQuery<any>(
          `SELECT COUNT(*) AS cnt FROM maintenance_requests WHERE "assignedTo"=$1 AND status='completed' AND "companyId"=$2`,
          [mr.assignedTo, scope.companyId]
        );
        const newRating = Math.min(5, 3 + Math.log10(Number(completedCount[0]?.cnt || 1) + 1));
        await rawExecute(`UPDATE technicians SET rating=$1 WHERE id=$2`, [parseFloat(newRating.toFixed(2)), mr.assignedTo]);
      } catch (ratingErr) {
        console.error("Failed to update technician rating:", ratingErr);
      }
    }

    let journalEntryId: number | null = null;
    if (cost > 0) {
      const maintExpCode = await getAccountCodeFromMapping(scope.companyId, "property_maintenance_expense", "debit", "5400");
      const cashCode = await getAccountCodeFromMapping(scope.companyId, "property_cash_source", "credit", "1100");
      journalEntryId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.userId,
        ref: `JE-MAINT-${id}-${Date.now()}`,
        description: `صيانة أملاك — بلاغ #${id} — ${mr.category} — ${cost.toFixed(2)} ريال`,
        type: "property",
        sourceType: "maintenance_request",
        sourceId: id,
        lines: [
          { accountCode: maintExpCode, debit: cost, credit: 0, propertyId: mr.unitId ? Number(mr.unitId) : undefined },
          { accountCode: cashCode, debit: 0, credit: cost },
        ],
      }, { table: "property_maintenance_requests", id: Number(id) }).catch(() => null);
    }

    await createAuditLog({
      userId: scope.userId, entity: "maintenance_requests", entityId: id,
      action: "status_change", companyId: scope.companyId,
      before: { status: mr.status }, after: { status: "completed" },
    });

    let followUpTaskId: number | null = null;
    try {
      const followUpRows = await rawQuery<any>(
        `INSERT INTO tasks ("companyId","branchId","assignmentId","assignedTo",title,description,type,priority,status,"linkedEntityType","linkedEntityId","autoGenerated","createdAt")
         VALUES ($1,$2,$3,$3,$4,$5,'task','medium','pending','maintenance_request',$6,true,NOW()) RETURNING id`,
        [scope.companyId, scope.branchId, scope.activeAssignmentId,
         `متابعة رضا المستأجر — بلاغ صيانة #${id}`,
         `تواصل مع المستأجر ${mr.tenantName || ""} للاستفسار عن رضاه عن خدمة الصيانة (${mr.category || ""})`,
         id]
      );
      followUpTaskId = followUpRows[0]?.id || null;
      if (followUpTaskId) {
        try {
          await createAuditLog({
            companyId: scope.companyId,
            userId: scope.userId,
            action: "auto_task_created",
            entity: "maintenance_requests",
            entityId: id,
            after: { message: `تم إنشاء مهمة متابعة رضا المستأجر تلقائياً`, taskId: followUpTaskId },
          });
        } catch (auditErr) { console.error("Cross-module audit log failed:", auditErr); }
      }
    } catch (taskErr) { console.error("Failed to create follow-up task:", taskErr); }

    console.log(`[SURVEY] Maintenance #${id} completed — follow-up task #${followUpTaskId} created for ${mr.tenantName}`);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.maintenance.completed",
      entity: "property_maintenance_requests",
      entityId: id,
      details: JSON.stringify({ invoiceId, followUpTaskId, journalEntryId, cost, category: mr.category, unitId: mr.unitId }),
    }).catch(console.error);

    eventBus.emit("maintenance.completed", {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "maintenance_requests",
      entityId: id,
      details: { invoiceId, followUpTaskId, journalEntryId, cost, category: mr.category, unitId: mr.unitId },
    });

    if (mr.unitId) {
      try {
        await createAuditLog({
          companyId: scope.companyId,
          userId: scope.userId,
          action: "maintenance_completed",
          entity: "property_units",
          entityId: mr.unitId,
          after: { message: `تم إتمام صيانة #${id} — ${mr.category || ""}`, maintenanceId: id, cost },
        });
      } catch (e) { console.error("Unit audit log for maintenance completion failed:", e); }
    }

    const [updated] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [id]);
    res.json({ ...updated, invoiceCreated: !!invoiceId, invoiceId, surveyQueued: true, journalEntryId, followUpTaskId });
  } catch (err) { handleRouteError(err, res, "Complete maintenance request error:"); }
});

router.get("/technicians", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM technicians WHERE "companyId"=$1 ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Technicians error:"); }
});

router.get("/tenants", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;
    const params: any[] = [scope.companyId];
    let whereClause = `"companyId"=$1`;
    if (search) { params.push(`%${search}%`); whereClause += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR "nationalId" ILIKE $${params.length})`; }
    whereClause += ` AND "deletedAt" IS NULL`;
    const rows = await rawQuery<any>(
      `SELECT id, name, phone, email, "nationalId", nationality, "idType", notes, "createdAt" FROM tenants WHERE ${whereClause} ORDER BY name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Tenants error:"); }
});

router.post("/tenants", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      throw new ValidationError("اسم المستأجر مطلوب", { field: "name", fix: "أدخل الاسم الكامل للمستأجر" });
    }
    if (b.nationalId) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM tenants WHERE "nationalId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.nationalId, scope.companyId]
      );
      if (dup) {
        throw new ConflictError(
          "رقم الهوية مسجل مسبقاً لمستأجر آخر",
          { field: "nationalId", fix: "تحقق من صحة الرقم أو راجع سجل المستأجر الموجود" }
        );
      }
    }
    const { insertId } = await rawExecute(
      `INSERT INTO tenants ("companyId", name, phone, email, "nationalId", nationality, "idType", notes, "tenantType", "crNumber", "unifiedNumber", "birthDate", "gender", "guarantorName", "guarantorId", "guarantorPhone", "guarantorRelation", "emergencyContact", "emergencyName", "maritalStatus", "occupation", "monthlyIncome", "previousAddress", "previousLandlord", "previousLandlordPhone")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [scope.companyId, b.name, b.phone || null, b.email || null, b.nationalId || null, b.nationality || null, b.idType || "national_id", b.notes || null,
       b.tenantType || 'individual', b.crNumber || null, b.unifiedNumber || null, b.birthDate || null, b.gender || null,
       b.guarantorName || null, b.guarantorId || null, b.guarantorPhone || null, b.guarantorRelation || null,
       b.emergencyContact || null, b.emergencyName || null, b.maritalStatus || null, b.occupation || null,
       b.monthlyIncome || null, b.previousAddress || null, b.previousLandlord || null, b.previousLandlordPhone || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM tenants WHERE id=$1`, [insertId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "tenants", entityId: insertId,
      after: { name: b.name, phone: b.phone ?? null, tenantType: b.tenantType ?? 'individual' },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "tenant.created", entity: "tenants", entityId: insertId,
      details: `مستأجر جديد: ${b.name}`,
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create tenant error:"); }
});

router.get("/tenants/list", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;

    const tConditions = [`t."companyId" = $1`];
    const tParams: any[] = [scope.companyId];
    if (search) {
      tParams.push(`%${search}%`);
      tConditions.push(`(t.name ILIKE $${tParams.length} OR t.phone ILIKE $${tParams.length} OR t."nationalId" ILIKE $${tParams.length})`);
    }
    const standaloneRows = await rawQuery<any>(
      `SELECT
        t.id,
        t.name,
        t.phone,
        t.email,
        t."nationalId",
        t.nationality,
        COUNT(DISTINCT c.id) AS "totalContracts",
        COUNT(DISTINCT c.id) FILTER (WHERE c.status='active') AS "activeContracts",
        MAX(CASE WHEN c.status='active' THEN u."unitNumber" END) AS "currentUnit",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalPaid",
        COALESCE(SUM(CASE WHEN rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE THEN rp.amount - rp."paidAmount" ELSE 0 END),0) AS "overdueAmount",
        t."createdAt"
       FROM tenants t
       LEFT JOIN rental_contracts c ON (c."tenantId"=t.id OR c."tenantName"=t.name) AND c."companyId"=$1
       LEFT JOIN property_units u ON u.id=c."unitId"
       LEFT JOIN rent_payments rp ON rp."contractId"=c.id
       WHERE ${tConditions.join(" AND ")}
       GROUP BY t.id, t.name, t.phone, t.email, t."nationalId", t.nationality, t."createdAt"
       ORDER BY t.name`,
      tParams
    );

    const conditions = [`c."companyId" = $1`];
    const cParams: any[] = [scope.companyId];
    if (search) { cParams.push(`%${search}%`); conditions.push(`(c."tenantName" ILIKE $${cParams.length} OR c."tenantPhone" ILIKE $${cParams.length} OR c."tenantIdNumber" ILIKE $${cParams.length})`); }
    const contractRows = await rawQuery<any>(
      `SELECT
        CONCAT('c-', ROW_NUMBER() OVER (ORDER BY c."tenantName")) AS id,
        c."tenantName" AS name,
        c."tenantPhone" AS phone,
        c."tenantEmail" AS email,
        c."tenantIdNumber" AS "nationalId",
        NULL AS nationality,
        COUNT(DISTINCT c.id) AS "totalContracts",
        COUNT(DISTINCT c.id) FILTER (WHERE c.status='active') AS "activeContracts",
        MAX(CASE WHEN c.status='active' THEN u."unitNumber" END) AS "currentUnit",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalPaid",
        COALESCE(SUM(CASE WHEN rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE THEN rp.amount - rp."paidAmount" ELSE 0 END),0) AS "overdueAmount",
        TRUE AS "contractOnly"
       FROM rental_contracts c
       LEFT JOIN property_units u ON u.id=c."unitId"
       LEFT JOIN rent_payments rp ON rp."contractId"=c.id
       WHERE ${conditions.join(" AND ")}
         AND c."tenantName" NOT IN (SELECT name FROM tenants WHERE "companyId"=$1)
         AND (c."tenantId" IS NULL OR c."tenantId" NOT IN (SELECT id FROM tenants WHERE "companyId"=$1))
       GROUP BY c."tenantName", c."tenantPhone", c."tenantEmail", c."tenantIdNumber"
       ORDER BY c."tenantName"`,
      cParams
    );

    const allRows = [...standaloneRows, ...contractRows];
    res.json({ data: allRows, total: allRows.length });
  } catch (err) { handleRouteError(err, res, "Tenants list error:"); }
});

router.get("/tenants/:id", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rawId = decodeURIComponent(String(req.params.id));
    const numericId = !isNaN(Number(rawId)) ? Number(rawId) : null;

    let tenantRecord: any = null;
    let tenantName: string | null = null;

    if (numericId) {
      const rows = await rawQuery<any>(
        `SELECT * FROM tenants WHERE id=$1 AND "companyId"=$2`,
        [numericId, scope.companyId]
      );
      if (rows.length > 0) {
        tenantRecord = rows[0];
        tenantName = tenantRecord.name;
      }
    }

    if (!tenantRecord && !numericId) {
      tenantName = rawId;
    }

    const contracts = tenantName
      ? await rawQuery<any>(
          `SELECT c.*, u."unitNumber", u."buildingName" FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId" WHERE c."companyId"=$1 AND (c."tenantId"=$2 OR c."tenantName"=$3) ORDER BY c.id DESC`,
          [scope.companyId, numericId ?? null, tenantName]
        )
      : [];

    if (!tenantRecord && contracts.length === 0) {
      throw new NotFoundError("المستأجر غير موجود");
    }

    const contractIds = contracts.map((c: any) => c.id);
    const payments = contractIds.length > 0
      ? await rawQuery<any>(
          `SELECT rp.*, c."tenantName", u."unitNumber" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" LEFT JOIN property_units u ON u.id=c."unitId" WHERE rp."contractId" = ANY($1::int[]) ORDER BY rp."dueDate" DESC`,
          [contractIds]
        )
      : [];

    const totalPaid = payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.paidAmount || 0), 0);
    const overduePayments = payments.filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date());

    const name = tenantRecord?.name ?? contracts[0]?.tenantName ?? rawId;
    const phone = tenantRecord?.phone ?? contracts[0]?.tenantPhone;
    const email = tenantRecord?.email ?? contracts[0]?.tenantEmail;
    const nationalId = tenantRecord?.nationalId ?? contracts[0]?.tenantIdNumber;

    res.json({
      id: tenantRecord?.id ?? rawId,
      name,
      phone,
      email,
      nationalId,
      nationality: tenantRecord?.nationality,
      idType: tenantRecord?.idType,
      notes: tenantRecord?.notes,
      contracts,
      payments,
      totalPaid,
      overdueAmount: overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.paidAmount || 0), 0),
    });
  } catch (err) { handleRouteError(err, res, "Tenant detail error:"); }
});

router.get("/buildings", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;
    const conditions = [`b."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (search) { params.push(`%${search}%`); conditions.push(`(b.name ILIKE $${params.length} OR b.address ILIKE $${params.length} OR b.city ILIKE $${params.length})`); }

    const rows = await rawQuery<any>(
      `SELECT b.*,
        COUNT(u.id) AS "totalUnits",
        COUNT(u.id) FILTER (WHERE u.status='rented') AS "rentedUnits",
        COUNT(u.id) FILTER (WHERE u.status='available') AS "availableUnits",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalRevenue"
       FROM property_buildings b
       LEFT JOIN property_units u ON (u."buildingId"=b.id OR u."buildingName"=b.name) AND u."companyId"=b."companyId"
       LEFT JOIN rental_contracts rc ON rc."unitId"=u.id AND rc."companyId"=b."companyId"
       LEFT JOIN rent_payments rp ON rp."contractId"=rc.id AND rp.status='paid'
       WHERE ${conditions.join(" AND ")} AND b."deletedAt" IS NULL
       GROUP BY b.id
       ORDER BY b.name`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Buildings list error:"); }
});

router.get("/buildings/:id", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [building] = await rawQuery<any>(
      `SELECT b.*,
        COUNT(u.id) AS "totalUnits",
        COUNT(u.id) FILTER (WHERE u.status='rented') AS "rentedUnits",
        COUNT(u.id) FILTER (WHERE u.status='available') AS "availableUnits"
       FROM property_buildings b
       LEFT JOIN property_units u ON (u."buildingId"=b.id OR u."buildingName"=b.name) AND u."companyId"=b."companyId"
       WHERE b.id=$1 AND b."companyId"=$2
       GROUP BY b.id`,
      [id, scope.companyId]
    );
    if (!building) throw new NotFoundError("المبنى غير موجود");
    res.json(building);
  } catch (err) { handleRouteError(err, res, "Building detail error:"); }
});

router.post("/buildings", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      throw new ValidationError("اسم المبنى مطلوب", { field: "name", fix: "أدخل اسم المبنى" });
    }
    if (b.ownerId) {
      const [owner] = await rawQuery<any>(
        `SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.ownerId, scope.companyId]
      );
      if (!owner) {
        throw new ValidationError("المالك غير موجود", { field: "ownerId", fix: "اختر مالكاً مسجلاً" });
      }
    }
    const nationalAddress = b.nationalAddress ? (typeof b.nationalAddress === 'string' ? b.nationalAddress : JSON.stringify(b.nationalAddress)) : null;
    const { insertId } = await rawExecute(
      `INSERT INTO property_buildings ("companyId",name,address,city,type,"deedNumber","deedDate","buildingPermitNumber","nationalAddress","latitude","longitude","totalUnits","totalArea","yearBuilt","ownerId","managerId","notes")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [scope.companyId, b.name, b.address || null, b.city || null, b.type || "residential",
       b.deedNumber || null, b.deedDate || null, b.buildingPermitNumber || null, nationalAddress, b.latitude || null, b.longitude || null,
       b.totalUnits || 0, b.totalArea || null, b.yearBuilt || null, b.ownerId || null, b.managerId || null, b.description || b.notes || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_buildings WHERE id=$1`, [insertId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "property_buildings", entityId: insertId,
      after: { name: b.name, city: b.city ?? null, type: b.type ?? 'residential', ownerId: b.ownerId ?? null },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "property.building.created", entity: "property_buildings", entityId: insertId,
      details: `مبنى جديد: ${b.name}${b.city ? ` — ${b.city}` : ''}`,
    }).catch(console.error);
    if (b.purchasePrice && Number(b.purchasePrice) > 0) {
      (async () => {
        try {
          const assetCode = await getAccountCodeFromMapping(scope.companyId, "property_building_asset", "debit", "1520");
          const depExpCode = await getAccountCodeFromMapping(scope.companyId, "property_depreciation", "debit", "6100");
          const accDepCode = await getAccountCodeFromMapping(scope.companyId, "property_acc_depreciation", "credit", "1590");
          const cashCode = await getAccountCodeFromMapping(scope.companyId, "property_building_asset", "credit", "1100");
          const usefulYears = Number(b.usefulLifeYears) || 20;
          const salvage = Number(b.salvageValue) || 0;
          await createGuardedJournalEntry({
            companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId,
            ref: `BLDG-${insertId}`,
            description: `إثبات أصل عقاري — ${b.name}`,
            type: "property", sourceType: "property_building", sourceId: insertId,
            lines: [
              { accountCode: assetCode, debit: Number(b.purchasePrice), credit: 0, propertyId: insertId },
              { accountCode: cashCode, debit: 0, credit: Number(b.purchasePrice) },
            ],
          }, { table: "property_buildings", id: insertId });
          await rawExecute(
            `INSERT INTO fixed_assets ("companyId","branchId",code,name,description,category,
              "purchaseDate","purchaseCost","salvageValue","usefulLifeYears",
              "depreciationMethod","currentBookValue","accumulatedDepreciation",
              "assetAccountCode","depreciationAccountCode","accDepreciationAccountCode",status)
             VALUES ($1,$2,$3,$4,$5,'عقارات',$6,$7,$8,$9,'straight_line',$7,0,$10,$11,$12,'active')`,
            [scope.companyId, scope.branchId, `BLDG-${insertId}`, b.name,
             `أصل ثابت — مبنى ${b.name}${b.city ? ` — ${b.city}` : ""}`,
             b.purchaseDate || new Date().toISOString().slice(0, 10),
             Number(b.purchasePrice), salvage, usefulYears,
             assetCode, depExpCode, accDepCode]
          );
          createNotification({
            companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
            type: "auto_journal", title: "قيد تلقائي — إثبات أصل عقاري",
            body: `تم إنشاء قيد محاسبي تلقائي لإثبات أصل المبنى "${b.name}" بقيمة ${Number(b.purchasePrice).toLocaleString("ar-SA")} ريال، وتسجيله كأصل ثابت يخضع للإهلاك`,
            priority: "normal", refType: "property_building", refId: insertId,
            actionUrl: `/properties/buildings`,
          }).catch(console.error);
        } catch (e) { console.error("Building asset JE/fixed-asset failed:", e); }
      })();
    }
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create building error:"); }
});

router.patch("/buildings/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM property_buildings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المبنى غير موجود");
    const parsed = updateBuildingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
    if (b.ownerId && b.ownerId !== existing.ownerId) {
      const [owner] = await rawQuery<any>(
        `SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.ownerId, scope.companyId]
      );
      if (!owner) {
        throw new ValidationError("المالك غير موجود", { field: "ownerId", fix: "اختر مالكاً مسجلاً" });
      }
    }
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (b.name !== undefined && b.name !== existing.name) { params.push(b.name); sets.push(`name=$${params.length}`); before.name = existing.name; after.name = b.name; }
    const trackedBldg = ["address","city","type","floors","description","deedNumber","deedDate","buildingPermitNumber","latitude","longitude","totalUnits","totalArea","yearBuilt","ownerId","managerId"] as const;
    for (const f of trackedBldg) {
      if (b[f] === undefined) continue;
      const val = f === "ownerId" ? (b[f] || null) : b[f];
      if (val === existing[f]) continue;
      params.push(val);
      const col = ["deedNumber","deedDate","buildingPermitNumber","totalUnits","totalArea","yearBuilt","ownerId","managerId"].includes(f) ? `"${f}"` : f;
      sets.push(`${col}=$${params.length}`);
      before[f] = existing[f];
      after[f] = val;
    }
    if (b.nationalAddress !== undefined) {
      const val = typeof b.nationalAddress === 'string' ? b.nationalAddress : JSON.stringify(b.nationalAddress);
      if (val !== existing.nationalAddress) {
        params.push(val);
        sets.push(`"nationalAddress"=$${params.length}`);
        before.nationalAddress = existing.nationalAddress;
        after.nationalAddress = val;
      }
    }
    if (Object.keys(after).length === 0) { res.json(existing); return; }
    params.push(id);
    await rawExecute(`UPDATE property_buildings SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM property_buildings WHERE id=$1`, [id]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "property_buildings",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.building.updated",
      entity: "property_buildings",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update building error:"); }
});

router.delete("/buildings/:id", requirePermission("property:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, name FROM property_buildings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المبنى غير موجود");

    const [activeUnit] = await rawQuery<any>(
      `SELECT id FROM property_units WHERE "buildingId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (activeUnit) {
      throw new ConflictError(
        "لا يمكن حذف المبنى — يوجد وحدات مسجلة تحته",
        { field: "status", fix: "احذف الوحدات أو انقلها لمبنى آخر قبل حذف المبنى" }
      );
    }

    await rawExecute(`UPDATE property_buildings SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.building.deleted",
      entity: "property_buildings",
      entityId: id,
      before: { name: existing.name },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ message: "تم حذف المبنى" });
  } catch (err) { handleRouteError(err, res, "Delete building error:"); }
});

router.get("/maintenance", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`mr."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`mr.status = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT mr.*, u."unitNumber", u."buildingName" FROM maintenance_requests mr LEFT JOIN property_units u ON u.id=mr."unitId" WHERE ${conditions.join(" AND ")} ORDER BY mr.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Property maintenance error:"); }
});

router.post("/maintenance", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.unitId) {
      throw new ValidationError("الوحدة مطلوبة", { field: "unitId", fix: "اختر الوحدة المطلوب صيانتها" });
    }
    if (!b.description || typeof b.description !== "string" || !b.description.trim()) {
      throw new ValidationError("وصف الصيانة مطلوب", { field: "description", fix: "اكتب وصفاً للمشكلة" });
    }
    const [unit] = await rawQuery<any>(
      `SELECT id FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.unitId, scope.companyId]
    );
    if (!unit) {
      throw new ValidationError("الوحدة غير موجودة", { field: "unitId", fix: "اختر وحدة مسجلة" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO maintenance_requests ("companyId","unitId","tenantName",category,description,priority,status) VALUES ($1,$2,$3,$4,$5,$6,'open')`,
      [scope.companyId, b.unitId, b.tenantName, b.category || 'general', b.description, b.priority || 'medium']
    );
    const [row] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [insertId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.maintenance.created",
      entity: "property_maintenance",
      entityId: insertId,
      details: JSON.stringify({ unitId: b.unitId, category: b.category || 'general', priority: b.priority || 'medium' }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create property maintenance error:"); }
});

router.get("/stats", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [units] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available, COUNT(*) FILTER (WHERE status='rented') as rented, COUNT(*) FILTER (WHERE status='under_maintenance') as "underMaintenance" FROM property_units WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [contracts] = await rawQuery<any>(`
      SELECT
        COUNT(*) as active,
        COUNT(*) FILTER (WHERE status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as "expiring30",
        COUNT(*) FILTER (WHERE status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days') as "expiring60",
        COUNT(*) FILTER (WHERE status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days') as "expiring90"
      FROM rental_contracts WHERE "companyId"=$1`, [cid]);
    const [revenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as "totalCollected", COALESCE(SUM(amount),0) as "totalExpected" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1`, [cid]);
    const [monthlyRevenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as "monthlyCollected", COALESCE(SUM(amount),0) as "monthlyExpected" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1 AND DATE_TRUNC('month',rp."dueDate")=DATE_TRUNC('month',CURRENT_DATE)`, [cid]);
    const [annualRevenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as "annualCollected", COALESCE(SUM(amount),0) as "annualExpected" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1 AND DATE_TRUNC('year',rp."dueDate")=DATE_TRUNC('year',CURRENT_DATE)`, [cid]);
    const [overdue] = await rawQuery<any>(`SELECT COUNT(*) as count, COALESCE(SUM(amount - "paidAmount"),0) as "overdueAmount" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE`, [cid]);
    const [maintenance] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status NOT IN ('completed','closed')) as "openTickets", COUNT(*) FILTER (WHERE priority='critical') as "criticalTickets" FROM maintenance_requests WHERE "companyId"=$1`, [cid]);
    const buildingPerf = await rawQuery<any>(`
      SELECT b.id, b.name,
        COUNT(u.id) AS "totalUnits",
        COUNT(u.id) FILTER (WHERE u.status='rented') AS "rentedUnits",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalRevenue",
        COALESCE(SUM(rp.amount),0) AS "totalExpected"
      FROM property_buildings b
      LEFT JOIN property_units u ON u."buildingId"=b.id AND u."companyId"=$1
      LEFT JOIN rental_contracts rc ON rc."unitId"=u.id AND rc."companyId"=$1
      LEFT JOIN rent_payments rp ON rp."contractId"=rc.id
      WHERE b."companyId"=$1
      GROUP BY b.id, b.name
      ORDER BY "totalRevenue" DESC
    `, [cid]);
    const occupancyRate = Number(units.total) > 0 ? Math.round((Number(units.rented) / Number(units.total)) * 100) : 0;
    const collectionRate = Number(revenue.totalExpected) > 0 ? Math.round((Number(revenue.totalCollected) / Number(revenue.totalExpected)) * 100) : 0;
    res.json({
      totalUnits: Number(units.total),
      available: Number(units.available),
      rented: Number(units.rented),
      underMaintenance: Number(units.underMaintenance || 0),
      activeContracts: Number(contracts.active),
      expiringContracts: Number(contracts.expiring30 || 0),
      expiring30: Number(contracts.expiring30 || 0),
      expiring60: Number(contracts.expiring60 || 0),
      expiring90: Number(contracts.expiring90 || 0),
      totalCollected: Number(revenue.totalCollected),
      totalExpected: Number(revenue.totalExpected),
      monthlyCollected: Number(monthlyRevenue.monthlyCollected || 0),
      monthlyExpected: Number(monthlyRevenue.monthlyExpected || 0),
      annualCollected: Number(annualRevenue.annualCollected || 0),
      annualExpected: Number(annualRevenue.annualExpected || 0),
      overduePayments: Number(overdue.count),
      overdueAmount: Number(overdue.overdueAmount),
      openMaintenanceTickets: Number(maintenance.openTickets || 0),
      criticalMaintenanceTickets: Number(maintenance.criticalTickets || 0),
      occupancyRate,
      collectionRate,
      buildingPerformance: buildingPerf.map((b: any) => ({
        ...b,
        totalUnits: Number(b.totalUnits),
        rentedUnits: Number(b.rentedUnits),
        totalRevenue: Number(b.totalRevenue),
        totalExpected: Number(b.totalExpected),
        occupancyRate: Number(b.totalUnits) > 0 ? Math.round((Number(b.rentedUnits) / Number(b.totalUnits)) * 100) : 0,
      })),
    });
  } catch (err) { handleRouteError(err, res, "Properties stats error:"); }
});

router.patch("/maintenance-requests/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الطلب غير موجود");
    const b = req.body;

    // State machine — PATCH allowed to move through the allowlist only
    if (b.status !== undefined && b.status !== existing.status) {
      if (!MAINT_REQUEST_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${MAINT_REQUEST_STATUSES.join(", ")}` }
        );
      }
      const allowed = MAINT_REQUEST_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل الطلب من "${existing.status}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const params: any[] = [];
    const sets: string[] = [];
    if (b.status === "completed" && existing.status !== "completed") {
      const validationErrors: string[] = [];
      const closureReport = b.closureReport || existing.closureReport;
      if (!closureReport) validationErrors.push("تقرير الإغلاق مطلوب");
      const afterPhotos = b.afterPhotos || (existing.afterPhotos ? (typeof existing.afterPhotos === "string" ? JSON.parse(existing.afterPhotos) : existing.afterPhotos) : []);
      if (!afterPhotos || afterPhotos.length === 0) validationErrors.push("صور ما بعد الصيانة مطلوبة (صورة واحدة على الأقل)");
      const actualCost = b.actualCost !== undefined ? Number(b.actualCost) : Number(existing.actualCost || 0);
      if (actualCost <= 0 && !b.zeroCostConfirmed) validationErrors.push("التكلفة الفعلية مطلوبة (أو تأكيد أن التكلفة صفر)");
      const materialsUsed = b.materialsUsed || (existing.materialsUsed ? (typeof existing.materialsUsed === "string" ? JSON.parse(existing.materialsUsed) : existing.materialsUsed) : []);
      if (!materialsUsed || !Array.isArray(materialsUsed) || materialsUsed.length === 0) validationErrors.push("قائمة المواد المستخدمة مطلوبة (مادة واحدة على الأقل)");
      if (validationErrors.length > 0) {
        throw new ValidationError(
          "بيانات الإغلاق غير مكتملة",
          { field: "closureReport", fix: validationErrors.join(" | "), meta: { validationErrors } }
        );
      }
    }
    for (const key of ["status","category","description","priority","assignedTo","technicianId","costResponsibility","estimatedCost","actualCost","closureReport","clientRating","clientComment"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (b.beforePhotos !== undefined) { params.push(JSON.stringify(b.beforePhotos)); sets.push(`"beforePhotos"=$${params.length}`); }
    if (b.afterPhotos !== undefined) { params.push(JSON.stringify(b.afterPhotos)); sets.push(`"afterPhotos"=$${params.length}`); }
    if (b.materialsUsed !== undefined) { params.push(JSON.stringify(b.materialsUsed)); sets.push(`"materialsUsed"=$${params.length}`); }
    // The closure preconditions are already enforced above via the first
    // validationErrors block. A second near-identical block used to exist
    // here and was dead code — we now rely solely on the earlier check.
    sets.push(`"updatedAt"=NOW()`);
    if (b.status === "completed" && existing.status !== "completed") {
      sets.push(`"completedAt"=NOW()`);
      if (existing.createdAt) {
        const created = new Date(existing.createdAt).getTime();
        const now = Date.now();
        const hours = Math.round((now - created) / 3600000);
        params.push(hours); sets.push(`"resolutionTime"=$${params.length}`);
      }
    }
    params.push(id);
    await rawExecute(`UPDATE maintenance_requests SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    if (b.status && b.status !== existing.status) {
      await createAuditLog({
        userId: scope.userId, entity: "maintenance_requests", entityId: id,
        action: "status_change", companyId: scope.companyId,
        before: { status: existing.status }, after: { status: b.status },
      });
    }
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.maintenance.updated",
      entity: "property_maintenance_requests",
      entityId: id,
      details: JSON.stringify({ status: b.status, category: b.category, priority: b.priority }),
    }).catch(console.error);
    if (b.status === "completed" && existing.status !== "completed") {
      const updatedCost = Number(b.actualCost ?? existing.actualCost ?? 0);
      if (updatedCost > 0) {
        try {
          const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
          const yearShort = String(new Date().getFullYear()).slice(2);
          const ref = `INV-MAINT-${yearShort}${monthNum}-${id}`;
          const vatAmount = updatedCost * 0.15;
          const { insertId: iId } = await rawExecute(
            `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,NULL,$2,$3,$4,$5,$6,15,0,'draft',$7,$8)`,
            [scope.companyId, ref, `صيانة - ${existing.category} - ${existing.tenantName}`, updatedCost, updatedCost + vatAmount, vatAmount, new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], scope.userId]
          );
          await createAuditLog({
            userId: scope.userId, entity: "maintenance_requests", entityId: id,
            action: "auto_invoice", companyId: scope.companyId,
            before: null, after: { invoiceId: iId, ref, amount: updatedCost + vatAmount },
          });
        } catch (invErr) { console.error("PATCH completion invoice error:", invErr); }

        const maintExpCode = await getAccountCodeFromMapping(scope.companyId, "property_maintenance_expense", "debit", "5400");
        const cashCode = await getAccountCodeFromMapping(scope.companyId, "property_cash_source", "credit", "1100");
        await createGuardedJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.activeAssignmentId ?? scope.userId,
          ref: `PROP-MAINT-${id}`,
          description: `مصروف صيانة عقار — ${existing.category || ""} / ${existing.tenantName || ""}`,
          type: "property",
          sourceType: "maintenance_request",
          sourceId: id,
          lines: [
            { accountCode: maintExpCode, debit: updatedCost, credit: 0, propertyId: existing.unitId ? Number(existing.unitId) : undefined },
            { accountCode: cashCode, debit: 0, credit: updatedCost },
          ],
        }, { table: "property_maintenance", id: Number(id) }).catch(() => {});
      }
      try {
        await rawQuery<any>(
          `INSERT INTO tasks ("companyId","branchId","assignmentId","assignedTo",title,description,type,priority,status,"linkedEntityType","linkedEntityId","autoGenerated","createdAt")
           VALUES ($1,$2,$3,$3,$4,$5,'task','medium','pending','maintenance_request',$6,true,NOW()) RETURNING id`,
          [scope.companyId, scope.branchId, existing.assignedTo || scope.activeAssignmentId, `متابعة رضا المستأجر — صيانة #${id}`, `متابعة رضا ${existing.tenantName || "المستأجر"} بعد إتمام صيانة (${existing.category || ""})`, id]
        );
        await createAuditLog({
          userId: scope.userId, entity: "maintenance_requests", entityId: id,
          action: "auto_task", companyId: scope.companyId,
          before: null, after: { taskType: "tenant_satisfaction_followup", reason: "maintenance_completed" },
        });
      } catch (taskErr) { console.error("PATCH completion follow-up task error:", taskErr); }
    }
    const [row] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update maintenance request error:"); }
});

router.get("/operations-dashboard", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [unitStats] = await rawQuery<any>(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available,
        COUNT(*) FILTER (WHERE status='rented') as rented,
        COUNT(*) FILTER (WHERE status='under_maintenance') as maintenance
       FROM property_units WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]
    );
    const expiringContracts = await rawQuery<any>(
      `SELECT c.id, c."tenantName", c."endDate", u."unitNumber", u."buildingName"
       FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId"
       WHERE c."companyId"=$1 AND c.status='active' AND c."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY c."endDate"`, [cid]
    );
    const overduePayments = await rawQuery<any>(
      `SELECT rp.id, rp.amount, rp."paidAmount", rp."dueDate", c."tenantName", u."unitNumber"
       FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId"
       LEFT JOIN property_units u ON u.id=c."unitId"
       WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE
       ORDER BY rp."dueDate" LIMIT 20`, [cid]
    );
    const openMaintenance = await rawQuery<any>(
      `SELECT mr.id, mr.category, mr.description, mr.priority, mr.status, mr."createdAt", mr."slaDeadline",
        u."unitNumber", u."buildingName", mr."tenantName"
       FROM maintenance_requests mr LEFT JOIN property_units u ON u.id=mr."unitId"
       WHERE mr."companyId"=$1 AND mr.status NOT IN ('completed','closed','rejected')
       ORDER BY mr.priority DESC, mr."createdAt" LIMIT 20`, [cid]
    );
    const [collectionSummary] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) as expected, COALESCE(SUM("paidAmount"),0) as collected
       FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId"
       WHERE c."companyId"=$1 AND rp."dueDate" >= date_trunc('month', CURRENT_DATE)
         AND rp."dueDate" < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`, [cid]
    );
    res.json({
      units: unitStats,
      expiringContracts,
      overduePayments,
      openMaintenance,
      monthlyCollection: {
        expected: Number(collectionSummary?.expected || 0),
        collected: Number(collectionSummary?.collected || 0),
      },
    });
  } catch (err) { handleRouteError(err, res, "Operations dashboard error:"); }
});

router.get("/owners", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR "nationalId" ILIKE $${params.length} OR "crNumber" ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    const rows = await rawQuery<any>(
      `SELECT o.*,
        (SELECT COUNT(*) FROM property_buildings WHERE "ownerId"=o.id) AS "buildingCount",
        (SELECT COUNT(*) FROM property_units WHERE "ownerId"=o.id AND "deletedAt" IS NULL) AS "unitCount",
        (SELECT COUNT(*) FROM rental_contracts WHERE "ownerId"=o.id AND status='active') AS "activeContracts"
       FROM property_owners o WHERE ${conditions.join(" AND ")} AND o."deletedAt" IS NULL ORDER BY o.name`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Property owners error:"); }
});

router.get("/owners/:id", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [owner] = await rawQuery<any>(`SELECT * FROM property_owners WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!owner) throw new NotFoundError("المالك غير موجود");
    const buildings = await rawQuery<any>(`SELECT * FROM property_buildings WHERE "ownerId"=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const units = await rawQuery<any>(`SELECT * FROM property_units WHERE "ownerId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const contracts = await rawQuery<any>(`SELECT c.*, u."unitNumber", u."buildingName" FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId" WHERE c."ownerId"=$1 AND c."companyId"=$2 ORDER BY c.id DESC`, [id, scope.companyId]);
    res.json({ ...owner, buildings, units, contracts });
  } catch (err) { handleRouteError(err, res, "Owner detail error:"); }
});

router.post("/owners", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      throw new ValidationError("اسم المالك مطلوب", { field: "name", fix: "أدخل اسم المالك الكامل" });
    }
    if (b.ownerType === "company" && !b.crNumber) {
      throw new ValidationError(
        "رقم السجل التجاري مطلوب للمالك الشركة",
        { field: "crNumber", fix: "أدخل رقم السجل التجاري أو غيّر نوع المالك إلى فرد" }
      );
    }
    if (b.nationalId) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM property_owners WHERE "nationalId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.nationalId, scope.companyId]
      );
      if (dup) {
        throw new ConflictError(
          "رقم الهوية مسجل مسبقاً لمالك آخر",
          { field: "nationalId", fix: "تحقق من صحة الرقم" }
        );
      }
    }
    if (b.crNumber) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM property_owners WHERE "crNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.crNumber, scope.companyId]
      );
      if (dup) {
        throw new ConflictError(
          "السجل التجاري مسجل مسبقاً لمالك آخر",
          { field: "crNumber", fix: "تحقق من صحة الرقم" }
        );
      }
    }
    const { insertId } = await rawExecute(
      `INSERT INTO property_owners ("companyId","ownerType",name,"nationalId","crNumber",phone,email,iban,"bankName",address,city,"authorizationNumber","authorizationDate","authorizationExpiry",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [scope.companyId, b.ownerType || 'individual', b.name, b.nationalId || null, b.crNumber || null, b.phone || null, b.email || null, b.iban || null, b.bankName || null, b.address || null, b.city || null, b.authorizationNumber || null, b.authorizationDate || null, b.authorizationExpiry || null, b.notes || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_owners WHERE id=$1`, [insertId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "property_owners", entityId: insertId,
      after: { name: b.name, ownerType: b.ownerType ?? 'individual', phone: b.phone ?? null },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "property.owner.created", entity: "property_owners", entityId: insertId,
      details: `مالك جديد: ${b.name}`,
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create owner error:"); }
});

router.patch("/owners/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المالك غير موجود");
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("ownerType", b.ownerType);
    addField("name", b.name);
    addField("nationalId", b.nationalId);
    addField("crNumber", b.crNumber);
    addField("phone", b.phone);
    addField("email", b.email);
    addField("iban", b.iban);
    addField("bankName", b.bankName);
    addField("address", b.address);
    addField("city", b.city);
    addField("authorizationNumber", b.authorizationNumber);
    addField("authorizationDate", b.authorizationDate);
    addField("authorizationExpiry", b.authorizationExpiry);
    addField("notes", b.notes);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE property_owners SET ${fields.join(", ")}, "updatedAt"=NOW() WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "property_owners",
      entityId: id,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.owner.updated",
      entity: "property_owners",
      entityId: id,
    }).catch(console.error);

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update owner error:"); }
});

router.delete("/owners/:id", requirePermission("property:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT id, name FROM property_owners WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المالك غير موجود");

    const [bldg] = await rawQuery<any>(
      `SELECT id FROM property_buildings WHERE "ownerId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (bldg) {
      throw new ConflictError(
        "لا يمكن حذف المالك — يوجد مبانٍ مسجلة باسمه",
        { field: "status", fix: "انقل المباني لمالك آخر قبل الحذف" }
      );
    }
    const [unit] = await rawQuery<any>(
      `SELECT id FROM property_units WHERE "ownerId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (unit) {
      throw new ConflictError(
        "لا يمكن حذف المالك — يوجد وحدات مسجلة باسمه",
        { field: "status", fix: "انقل الوحدات لمالك آخر قبل الحذف" }
      );
    }

    await rawExecute(`UPDATE property_owners SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.owner.deleted",
      entity: "property_owners",
      entityId: id,
      before: { name: existing.name },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ message: "تم حذف المالك" });
  } catch (err) { handleRouteError(err, res, "Delete owner error:"); }
});

router.get("/contracts/:id/schedule", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const contractId = Number(req.params.id);
    const [contract] = await rawQuery<any>(`SELECT id FROM rental_contracts WHERE id=$1 AND "companyId"=$2`, [contractId, scope.companyId]);
    if (!contract) throw new NotFoundError("العقد غير موجود");
    const schedule = await rawQuery<any>(
      `SELECT * FROM contract_payment_schedule WHERE "contractId"=$1 ORDER BY "installmentNumber"`,
      [contractId]
    );
    res.json({ data: schedule, total: schedule.length });
  } catch (err) { handleRouteError(err, res, "Payment schedule error:"); }
});

router.post("/contracts/:id/schedule/:installmentId/pay", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const contractId = Number(req.params.id);
    const installmentId = Number(req.params.installmentId);
    const b = req.body;
    const paidAmount = Number(b.paidAmount ?? b.amount);
    const [existing] = await rawQuery<any>(
      `SELECT cps.*, rc."tenantName", u."unitNumber", u."buildingName" FROM contract_payment_schedule cps JOIN rental_contracts rc ON rc.id=cps."contractId" LEFT JOIN property_units u ON u.id=rc."unitId" WHERE cps.id=$1 AND cps."contractId"=$2 AND cps."companyId"=$3`,
      [installmentId, contractId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القسط غير موجود");
    const newPaid = Number(existing.paidAmount || 0) + paidAmount;
    const newStatus = newPaid >= Number(existing.amount) ? 'paid' : 'partial';
    const receiptNumber = b.receiptNumber || `RCP-${Date.now().toString(36).toUpperCase()}`;
    await rawExecute(
      `UPDATE contract_payment_schedule SET "paidAmount"=$1, "paidDate"=$2, method=$3, status=$4, "receiptNumber"=$5, "updatedAt"=NOW() WHERE id=$6`,
      [newPaid, b.paidDate || new Date().toISOString().split('T')[0], b.method || 'bank_transfer', newStatus, receiptNumber, installmentId]
    );
    if (paidAmount > 0) {
      const schCashCode = await getAccountCodeFromMapping(scope.companyId, "rental_cash_receipt", "debit", b.method === 'cash' ? '1100' : '1110');
      const schRevenueCode = await getAccountCodeFromMapping(scope.companyId, "rental_revenue", "credit", "4100");
      await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `RENT-SCH-${installmentId}`,
        description: `تحصيل قسط إيجار #${existing.installmentNumber} / ${existing.tenantName || ''} / ${existing.unitNumber || ''}`,
        sourceType: "rent_payment", sourceId: installmentId,
        lines: [
          { accountCode: schCashCode, debit: paidAmount, credit: 0, propertyId: existing.unitId, contractId: existing.contractId },
          { accountCode: schRevenueCode, debit: 0, credit: paidAmount, propertyId: existing.unitId, contractId: existing.contractId },
        ],
      }, { table: "property_contracts", id: contractId }).catch(() => {});
    }
    const [row] = await rawQuery<any>(`SELECT * FROM contract_payment_schedule WHERE id=$1`, [installmentId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.installment.paid",
      entity: "property_contracts",
      entityId: contractId,
      details: JSON.stringify({ installmentId, paidAmount, newStatus, receiptNumber, tenantName: existing.tenantName }),
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Pay installment error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY INSPECTIONS — جدول فحص دوري للوحدات
// ─────────────────────────────────────────────────────────────────────────────

router.get("/inspections", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { unitId, status } = req.query as any;
    const conditions = [`i."companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (unitId) { params.push(Number(unitId)); conditions.push(`i."unitId"=$${params.length}`); }
    if (status) { params.push(status); conditions.push(`i.status=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT i.*, u."unitNumber", u."buildingName"
       FROM property_inspections i
       JOIN property_units u ON u.id=i."unitId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY i."scheduledDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Inspections error:"); }
});

router.post("/inspections", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.unitId) {
      throw new ValidationError("الوحدة مطلوبة", { field: "unitId", fix: "اختر الوحدة المراد فحصها" });
    }
    if (!b.type || typeof b.type !== "string" || !b.type.trim()) {
      throw new ValidationError("نوع الفحص مطلوب", { field: "type", fix: "اختر نوع الفحص (دوري، تسليم، استلام، ...)" });
    }
    const [unit] = await rawQuery<any>(
      `SELECT id FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.unitId, scope.companyId]
    );
    if (!unit) {
      throw new ValidationError("الوحدة غير موجودة", { field: "unitId", fix: "اختر وحدة مسجلة" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO property_inspections
       ("companyId","unitId",type,"scheduledDate","inspectorName",status,notes,findings,"conditionRating")
       VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8)`,
      [scope.companyId, b.unitId, b.type,
       b.scheduledDate || new Date().toISOString().split('T')[0],
       b.inspectorName || null, b.notes || null,
       b.findings ? JSON.stringify(b.findings) : null,
       b.conditionRating || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_inspections WHERE id=$1`, [insertId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "property.inspection.created",
      entity: "property_inspections",
      entityId: insertId,
      details: JSON.stringify({ unitId: b.unitId, type: b.type, scheduledDate: b.scheduledDate }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create inspection error:"); }
});

router.patch("/inspections/:id", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM property_inspections WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الفحص غير موجود");

    const b = req.body;

    // State machine
    if (b.status !== undefined && b.status !== existing.status) {
      if (!INSPECTION_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة فحص غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${INSPECTION_STATUSES.join(", ")}` }
        );
      }
      const allowed = INSPECTION_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل الفحص من "${existing.status}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
        );
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (b.status !== undefined && b.status !== existing.status) { params.push(b.status); sets.push(`status=$${params.length}`); before.status = existing.status; after.status = b.status; }
    if (b.inspectionDate !== undefined) { params.push(b.inspectionDate); sets.push(`"inspectionDate"=$${params.length}`); before.inspectionDate = existing.inspectionDate; after.inspectionDate = b.inspectionDate; }
    if (b.notes !== undefined && b.notes !== existing.notes) { params.push(b.notes); sets.push(`notes=$${params.length}`); before.notes = existing.notes; after.notes = b.notes; }
    if (b.findings !== undefined) { params.push(JSON.stringify(b.findings)); sets.push(`findings=$${params.length}`); before.findings = existing.findings; after.findings = b.findings; }
    if (b.conditionRating !== undefined && b.conditionRating !== existing.conditionRating) { params.push(b.conditionRating); sets.push(`"conditionRating"=$${params.length}`); before.conditionRating = existing.conditionRating; after.conditionRating = b.conditionRating; }
    if (b.inspectorName !== undefined && b.inspectorName !== existing.inspectorName) { params.push(b.inspectorName); sets.push(`"inspectorName"=$${params.length}`); before.inspectorName = existing.inspectorName; after.inspectorName = b.inspectorName; }
    if (sets.length === 1) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(
      `UPDATE property_inspections SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "property_inspections",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "property.inspection.status_changed" : "property.inspection.updated",
      entity: "property_inspections",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update inspection error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY DEPOSITS — ودائع ضمان
// ─────────────────────────────────────────────────────────────────────────────

router.get("/deposits", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, contractId } = req.query as any;
    const conditions = [`sd."companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`sd.status=$${params.length}`); }
    if (contractId) { params.push(Number(contractId)); conditions.push(`sd."contractId"=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT sd.*, rc."tenantName", u."unitNumber", u."buildingName"
       FROM property_security_deposits sd
       JOIN rental_contracts rc ON rc.id=sd."contractId"
       LEFT JOIN property_units u ON u.id=rc."unitId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY sd."receivedDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Security deposits error:"); }
});

router.post("/deposits", requirePermission("property:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.contractId) {
      throw new ValidationError("العقد مطلوب", { field: "contractId", fix: "اختر العقد المرتبط بالوديعة" });
    }
    if (!b.amount) {
      throw new ValidationError("المبلغ مطلوب", { field: "amount", fix: "أدخل قيمة الوديعة" });
    }
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError(
        "قيمة الوديعة يجب أن تكون أكبر من صفر",
        { field: "amount", fix: "أدخل قيمة موجبة" }
      );
    }
    const [contract] = await rawQuery<any>(
      `SELECT id, status FROM rental_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.contractId, scope.companyId]
    );
    if (!contract) {
      throw new ValidationError("العقد غير موجود", { field: "contractId", fix: "اختر عقداً مسجلاً" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO property_security_deposits
       ("companyId","contractId",amount,"receivedDate",status,notes,"refundAmount","refundDate","refundReason")
       VALUES ($1,$2,$3,$4,'held',$5,$6,$7,$8)`,
      [scope.companyId, b.contractId, b.amount,
       b.receivedDate || new Date().toISOString().split('T')[0],
       b.notes || null, b.refundAmount || null, b.refundDate || null, b.refundReason || null]
    );

    // Post the GL entry. If it fails, undo the deposit row — we must never
    // have a 'held' deposit without a corresponding cash/liability posting,
    // otherwise trial balance is permanently wrong.
    try {
      const depCashCode = await getAccountCodeFromMapping(scope.companyId, "deposit_cash", "debit", "1100");
      const depLiabilityCode = await getAccountCodeFromMapping(scope.companyId, "deposit_liability", "credit", "2300");
      await createGuardedJournalEntry({
        companyId: scope.companyId, branchId: scope.branchId ?? 0,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `DEP-${insertId}`,
        description: `استلام وديعة ضمان — عقد #${b.contractId}`,
        type: "property",
        sourceType: "security_deposit",
        sourceId: insertId,
        lines: [
          { accountCode: depCashCode, debit: Number(b.amount), credit: 0, contractId: Number(b.contractId) },
          { accountCode: depLiabilityCode, debit: 0, credit: Number(b.amount) },
        ],
      }, { table: "property_security_deposits", id: insertId });
    } catch (jErr) {
      console.error("Deposit journal entry failed:", jErr);
      await rawExecute(`DELETE FROM property_security_deposits WHERE id=$1`, [insertId]).catch(() => {});
      throw new IntegrationError(
        "تعذّر إنشاء القيد المحاسبي للوديعة — لم يتم تسجيل الوديعة",
        { field: "journalEntry", fix: "راجع إعدادات شجرة الحسابات (1100/2300) ثم أعد المحاولة" }
      );
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "property_security_deposits", entityId: insertId,
      after: { contractId: b.contractId, amount: b.amount, status: "held" },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "deposit.received", entity: "property_security_deposits", entityId: insertId,
      details: `وديعة عقد #${b.contractId} بقيمة ${b.amount}`,
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM property_security_deposits WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create deposit error:"); }
});

router.patch("/deposits/:id/refund", requirePermission("property:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const [deposit] = await rawQuery<any>(
      `SELECT * FROM property_security_deposits WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!deposit) throw new NotFoundError("الوديعة غير موجودة");

    // State machine — must be held or partial_refund
    const allowed = DEPOSIT_TRANSITIONS[deposit.status] ?? [];
    if (!allowed.includes("refunded")) {
      throw new ConflictError(
        `لا يمكن إرجاع وديعة حالتها "${deposit.status}"`,
        { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
      );
    }

    const refundAmount = Number(b.refundAmount || deposit.amount);
    if (!Number.isFinite(refundAmount) || refundAmount < 0 || refundAmount > Number(deposit.amount)) {
      throw new ValidationError(
        "قيمة الإرجاع غير صحيحة — يجب أن تكون بين صفر وقيمة الوديعة",
        { field: "refundAmount", fix: `أدخل قيمة بين 0 و ${deposit.amount}` }
      );
    }

    // Post the GL entry FIRST so that if it fails, the deposit row stays in
    // 'held' state. The previous implementation swallowed journal errors and
    // still flipped the status to 'refunded', leaving cash + deposit liability
    // permanently out of sync.
    try {
      const refLiabilityCode = await getAccountCodeFromMapping(scope.companyId, "deposit_liability", "credit", "2300");
      const refCashCode = await getAccountCodeFromMapping(scope.companyId, "deposit_cash", "debit", "1100");
      await createGuardedJournalEntry({
        companyId: scope.companyId, branchId: scope.branchId ?? 0,
        createdBy: scope.activeAssignmentId ?? scope.userId,
        ref: `DEP-REF-${id}`,
        description: `إرجاع وديعة ضمان — عقد #${deposit.contractId} / السبب: ${b.refundReason || 'إنهاء العقد'}`,
        type: "property",
        sourceType: "security_deposit_refund",
        sourceId: id,
        lines: [
          { accountCode: refLiabilityCode, debit: refundAmount, credit: 0, contractId: deposit.contractId ? Number(deposit.contractId) : undefined },
          { accountCode: refCashCode, debit: 0, credit: refundAmount },
        ],
      }, { table: "property_security_deposits", id: Number(id) });
    } catch (jErr) {
      console.error("Deposit refund journal entry failed:", jErr);
      throw new IntegrationError(
        "تعذّر إنشاء القيد المحاسبي لإرجاع الوديعة — لم يتم تنفيذ الإرجاع",
        { field: "journalEntry", fix: "راجع إعدادات شجرة الحسابات (2300/1100) ثم أعد المحاولة" }
      );
    }

    await rawExecute(
      `UPDATE property_security_deposits SET status='refunded', "refundAmount"=$1, "refundDate"=$2, "refundReason"=$3 WHERE id=$4`,
      [refundAmount, b.refundDate || new Date().toISOString().split('T')[0], b.refundReason || null, id]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "refund", entity: "property_security_deposits", entityId: id,
      before: { status: "held", amount: deposit.amount },
      after: { status: "refunded", refundAmount, reason: b.refundReason ?? null },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "deposit.refunded", entity: "property_security_deposits", entityId: id,
      details: `إرجاع وديعة عقد #${deposit.contractId} بقيمة ${refundAmount}`,
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM property_security_deposits WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Refund deposit error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// OCCUPANCY REPORT — تقرير الإشغال التفاعلي
// ─────────────────────────────────────────────────────────────────────────────

router.get("/occupancy-report", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { buildingId } = req.query as any;

    const conditions = [`u."companyId"=$1`, `u."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (buildingId) { params.push(Number(buildingId)); conditions.push(`u."buildingId"=$${params.length}`); }

    const units = await rawQuery<any>(
      `SELECT u.id, u."unitNumber", u."buildingName", u."buildingId", u.status,
              u."monthlyRent", u.type, u.area,
              rc.id AS "activeContractId", rc."tenantName", rc."endDate" AS "contractEnd"
       FROM property_units u
       LEFT JOIN rental_contracts rc ON rc."unitId"=u.id AND rc.status='active' AND rc."deletedAt" IS NULL
       WHERE ${conditions.join(" AND ")}
       ORDER BY u."buildingName", u."unitNumber"`,
      params
    );

    const total = units.length;
    const occupied = units.filter((u: any) => u.status === 'rented').length;
    const available = units.filter((u: any) => u.status === 'available').length;
    const maintenance = units.filter((u: any) => u.status === 'maintenance').length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const totalMonthlyRent = units
      .filter((u: any) => u.status === 'rented')
      .reduce((s: number, u: any) => s + Number(u.monthlyRent || 0), 0);

    // By building
    const byBuilding: Record<string, any> = {};
    units.forEach((u: any) => {
      const b = u.buildingName || 'غير محدد';
      if (!byBuilding[b]) byBuilding[b] = { name: b, total: 0, occupied: 0, available: 0 };
      byBuilding[b].total++;
      if (u.status === 'rented') byBuilding[b].occupied++;
      if (u.status === 'available') byBuilding[b].available++;
    });

    res.json({
      total, occupied, available, maintenance,
      occupancyRate,
      totalMonthlyRent: Math.round(totalMonthlyRent),
      byBuilding: Object.values(byBuilding),
      units,
    });
  } catch (err) { handleRouteError(err, res, "Occupancy report error:"); }
});

router.get("/tenants/:id/letters", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const tenantId = Number(req.params.id);
    const rows = await rawQuery<any>(
      `SELECT l.id, l.subject, l.type, l.direction, l.status, l."letterDate",
              l."fromEntity", l."toEntity", l."createdAt"
       FROM letters l
       WHERE l."companyId" = $1
         AND l."relatedType" = 'tenant'
         AND l."relatedId" = $2
         AND l."deletedAt" IS NULL
       ORDER BY l."letterDate" DESC NULLS LAST, l."createdAt" DESC
       LIMIT 50`,
      [scope.companyId, tenantId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Tenant letters error:"); }
});

export default router;
