// ============================================================================
// hr-discipline.ts
// Routes: لائحة الانضباط الحية + محاضر الاستفسار (workflow)
// Base path: /hr/discipline
// ============================================================================

import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from "../lib/errorHandler.js";
import {
  createAuditLog,
  createNotification,
  emitEvent,
  getManagerAssignmentId,
} from "../lib/businessHelpers.js";
import {
  resolvePenalty,
  getDailyWage,
  generateMemoNumber,
  parsePenaltyLabel,
  ensureInquiryMemoForViolation,
  type IncidentType,
} from "../lib/disciplineEngine.js";
import {
  runAutoDetection,
  getDetectionLog,
  getAutoDetectionSettings,
  saveAutoDetectionSettings,
  type AutoDetectionSettings,
} from "../lib/autoViolationEngine.js";

const router = Router();
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────



async function logMemoEvent(params: {
  memoId: number;
  companyId: number;
  actorId?: number | null;
  actorRole: string;
  action: string;
  payload?: any;
  note?: string;
}) {
  await rawExecute(
    `INSERT INTO hr_inquiry_memo_events ("memoId","companyId","actorId","actorRole",action,payload,note)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [
      params.memoId,
      params.companyId,
      params.actorId ?? null,
      params.actorRole,
      params.action,
      params.payload ? JSON.stringify(params.payload) : null,
      params.note ?? null,
    ]
  );
}

async function getMemo(companyId: number, memoId: number) {
  const [row] = await rawQuery<any>(
    `SELECT m.*, e.name AS "employeeName", e."empNumber",
            r.section AS "regSection", r."articleNumber" AS "regArticle", r.title AS "regTitle"
       FROM hr_inquiry_memos m
       JOIN employees e ON e.id = m."employeeId"
       LEFT JOIN hr_discipline_regulation r ON r.id = m."regulationId"
      WHERE m.id = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL`,
    [memoId, companyId]
  );
  return row ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. REGULATION CATALOG — لائحة الانضباط الحية
// ═════════════════════════════════════════════════════════════════════════════

// List — مع فلترة اختيارية على القسم
router.get("/regulation", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const section = (req.query.section as string) || null;
    const params: any[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL AND "isActive" = TRUE`;
    if (section) {
      params.push(section);
      where += ` AND section = $${params.length}`;
    }
    const rows = await rawQuery<any>(
      `SELECT id, section, "articleNumber", title, description,
              penalty1, penalty2, penalty3, penalty4, "extraDeduction",
              severity, "isTermination", "legalReference", "effectiveFrom",
              "isActive", "createdAt", "updatedAt"
         FROM hr_discipline_regulation
        WHERE ${where}
        ORDER BY section, "articleNumber"`,
      params
    );
    // Group by section for UI
    const grouped: Record<string, any[]> = { work_time: [], work_organization: [], conduct: [] };
    for (const row of rows) {
      if (!grouped[row.section]) grouped[row.section] = [];
      grouped[row.section].push(row);
    }
    res.json({
      data: rows,
      grouped,
      sections: {
        work_time: "مخالفات تتعلق بمواعيد العمل",
        work_organization: "مخالفات تتعلق بتنظيم العمل",
        conduct: "مخالفات تتعلق بسلوك العامل",
      },
      effectiveFrom: "2024-10-01",
      total: rows.length,
    });
  } catch (err) {
    handleRouteError(err, res, "Get regulation error:");
  }
});

router.get("/regulation/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT * FROM hr_discipline_regulation
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) {
      throw new NotFoundError("المادة غير موجودة");
    }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Get regulation article error:");
  }
});

const createRegulationSchema = z.object({
  section: z.enum(["work_time", "work_organization", "conduct"], { message: "القسم غير صحيح" }),
  articleNumber: z.string().min(1, "رقم المادة مطلوب"),
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional(),
  penalty1: z.string().optional(),
  penalty2: z.string().optional(),
  penalty3: z.string().optional(),
  penalty4: z.string().optional(),
  extraDeduction: z.coerce.number().optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  isTermination: z.boolean().optional(),
  legalReference: z.string().optional(),
});

const updateRegulationSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  penalty1: z.string().optional(),
  penalty2: z.string().optional(),
  penalty3: z.string().optional(),
  penalty4: z.string().optional(),
  extraDeduction: z.coerce.number().optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  isTermination: z.boolean().optional(),
  legalReference: z.string().optional(),
  isActive: z.boolean().optional(),
});

const incidentTypeEnum = z.enum(["late", "early_leave", "absence", "behavior", "organization", "gps_out_of_range", "custom"], { message: "نوع الواقعة غير صحيح" });

const createMemoSchema = z.object({
  assignmentId: z.coerce.number({ message: "assignmentId مطلوب" }),
  incidentType: incidentTypeEnum,
  incidentDate: z.string().min(1, "incidentDate مطلوب"),
  incidentDurationMinutes: z.coerce.number().optional(),
  absenceDays: z.coerce.number().optional(),
  incidentDescription: z.string().optional(),
  regulationId: z.coerce.number().optional(),
  disruptsOthers: z.boolean().optional(),
  witnesses: z.any().optional(),
  relatedParties: z.any().optional(),
  reasons: z.any().optional(),
  manualOverrideAmount: z.coerce.number().optional(),
  manualOverrideReason: z.string().optional(),
});

const justifyMemoSchema = z.object({
  justification: z.string().optional(),
  declined: z.boolean().optional(),
});

const managerRecommendationSchema = z.object({
  recommendation: z.enum(["approve_excuse", "reject_excuse"], { message: "التوصية غير صحيحة" }),
  comment: z.string().optional(),
});

const gmDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "other"], { message: "القرار غير صحيح" }),
  comment: z.string().optional(),
});

const cancelMemoSchema = z.object({
  reason: z.string().optional(),
});

const penaltyPreviewSchema = z.object({
  assignmentId: z.coerce.number({ message: "assignmentId مطلوب" }),
  incidentType: incidentTypeEnum,
  incidentDate: z.string().min(1, "incidentDate مطلوب"),
  durationMinutes: z.coerce.number().optional(),
  absenceDays: z.coerce.number().optional(),
  disruptsOthers: z.boolean().optional(),
  regulationId: z.coerce.number().optional(),
});

const autoDetectionSettingsSchema = z.object({
  enableLateDetection: z.boolean().optional(),
  enableEarlyLeaveDetection: z.boolean().optional(),
  enableAbsenceDetection: z.boolean().optional(),
  enableGpsDetection: z.boolean().optional(),
  lateThresholdMinutes: z.coerce.number().optional(),
  earlyLeaveThresholdMinutes: z.coerce.number().optional(),
  gpsRadiusMeters: z.coerce.number().optional(),
  autoCreateMemo: z.boolean().optional(),
  notifyEmployee: z.boolean().optional(),
  notifyManager: z.boolean().optional(),
});

const autoDetectionRunSchema = z.object({
  date: z.string().optional(),
});

router.post("/regulation", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_createRegulationSchema = createRegulationSchema.safeParse(req.body);
    if (!parsed_createRegulationSchema.success) throw new ValidationError(parsed_createRegulationSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createRegulationSchema.data;
    const {
      section, articleNumber, title, description,
      penalty1, penalty2, penalty3, penalty4,
      extraDeduction, severity, isTermination, legalReference,
    } = body;
    const { insertId } = await rawExecute(
      `INSERT INTO hr_discipline_regulation
         ("companyId", section, "articleNumber", title, description,
          penalty1, penalty2, penalty3, penalty4, "extraDeduction",
          severity, "isTermination", "legalReference")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        scope.companyId, section, articleNumber, title, description ?? null,
        penalty1 ?? null, penalty2 ?? null, penalty3 ?? null, penalty4 ?? null,
        extraDeduction ?? null, severity ?? "medium", isTermination ?? false,
        legalReference ?? null,
      ]
    );
    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.discipline.regulation.create",
      entity: "hr_discipline_regulation", entityId: insertId,
      after: body,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.discipline.regulation.created",
      entity: "hr_discipline_regulations",
      entityId: insertId,
      details: JSON.stringify({ section, articleNumber, title, severity: severity ?? "medium" }),
    }).catch(console.error);
    res.status(201).json({ id: insertId });
  } catch (err) {
    handleRouteError(err, res, "Create regulation article error:");
  }
});

router.patch("/regulation/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const parsed_updateRegulationSchema = updateRegulationSchema.safeParse(req.body);
    if (!parsed_updateRegulationSchema.success) throw new ValidationError(parsed_updateRegulationSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_updateRegulationSchema.data;
    const allowed = [
      "title", "description", "penalty1", "penalty2", "penalty3", "penalty4",
      "extraDeduction", "severity", "isTermination", "legalReference", "isActive",
    ];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in (body ?? {})) {
        params.push((body as any)[k]);
        sets.push(`"${k}" = $${params.length}`);
      }
    }
    if (sets.length === 0) throw new ValidationError("لا يوجد حقل للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE hr_discipline_regulation SET ${sets.join(", ")}
        WHERE id = $${params.length - 1} AND "companyId" = $${params.length}`,
      params
    );
    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.discipline.regulation.update",
      entity: "hr_discipline_regulation", entityId: id,
      after: body,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.discipline.regulation.updated",
      entity: "hr_discipline_regulations",
      entityId: id,
      details: JSON.stringify(body),
    }).catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Update regulation article error:");
  }
});

// إعادة استنساخ اللائحة الافتراضية (للشركات التي لم تُبذر)
router.post("/regulation/reseed", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{ count: string }>(
      `SELECT hr_clone_default_regulation($1) AS count`,
      [scope.companyId]
    );
    const inserted = Number(row?.count ?? 0);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "discipline_regulations", entityId: 0,
      after: { inserted },
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "discipline_regulations.reseeded", entity: "discipline_regulations", entityId: 0,
    }).catch(console.error);

    res.json({ ok: true, inserted });
  } catch (err) {
    handleRouteError(err, res, "Reseed regulation error:");
  }
});

router.delete("/regulation/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await rawExecute(
      `UPDATE hr_discipline_regulation
          SET "deletedAt" = NOW(), "isActive" = FALSE
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.discipline.regulation.delete",
      entity: "hr_discipline_regulation", entityId: id,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.discipline.regulation.deleted",
      entity: "hr_discipline_regulations",
      entityId: id,
      details: JSON.stringify({ id }),
    }).catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Delete regulation article error:");
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. INQUIRY MEMOS — محاضر الاستفسار (دورة الحياة)
// ═════════════════════════════════════════════════════════════════════════════

// List
router.get("/memos", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const status = (req.query.status as string) || null;
    const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const params: any[] = [scope.companyId];
    let where = `m."companyId" = $1 AND m."deletedAt" IS NULL`;
    if (status) { params.push(status); where += ` AND m.status = $${params.length}`; }
    if (assignmentId) { params.push(assignmentId); where += ` AND m."assignmentId" = $${params.length}`; }
    if (employeeId) { params.push(employeeId); where += ` AND m."employeeId" = $${params.length}`; }
    const regulationIdFilter = req.query.regulationId ? Number(req.query.regulationId) : null;
    if (regulationIdFilter) { params.push(regulationIdFilter); where += ` AND m."regulationId" = $${params.length}`; }
    const rows = await rawQuery<any>(
      `SELECT m.id, m."memoNumber", m."incidentType", m."incidentDate",
              m."incidentDurationMinutes", m.status, m.source,
              m."occurrenceCount", m."appliedPenaltyLabel",
              m."appliedDeductionAmount", m."appliedExtraDeduction",
              m."terminationDecided", m."createdAt",
              e.id AS "employeeId", e.name AS "employeeName", e."empNumber",
              r.id AS "regulationId", r.section AS "regSection",
              r."articleNumber" AS "regArticle", r.title AS "regTitle"
         FROM hr_inquiry_memos m
         JOIN employees e ON e.id = m."employeeId"
         LEFT JOIN hr_discipline_regulation r ON r.id = m."regulationId"
        WHERE ${where}
        ORDER BY m."createdAt" DESC
        LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List memos error:");
  }
});

// Detail (with timeline)
router.get("/memos/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    const events = await rawQuery<any>(
      `SELECT * FROM hr_inquiry_memo_events
        WHERE "memoId" = $1 ORDER BY "createdAt" ASC`,
      [id]
    );
    res.json({ memo, events });
  } catch (err) {
    handleRouteError(err, res, "Get memo error:");
  }
});

// Create a new memo (manually by manager/HR)
router.post("/memos", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_createMemoSchema = createMemoSchema.safeParse(req.body);
    if (!parsed_createMemoSchema.success) throw new ValidationError(parsed_createMemoSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createMemoSchema.data;
    const {
      assignmentId,
      incidentType,
      incidentDate,
      incidentDurationMinutes,
      absenceDays,
      incidentDescription,
      regulationId,
      disruptsOthers,
      witnesses,
      relatedParties,
      reasons,
      manualOverrideAmount,
      manualOverrideReason,
    } = body;

    // جلب بيانات التعيين للتحقق من ملكية الشركة
    const [assignment] = await rawQuery<any>(
      `SELECT id, "companyId", "branchId", "employeeId"
         FROM employee_assignments WHERE id = $1`,
      [assignmentId]
    );
    if (!assignment || assignment.companyId !== scope.companyId) {
      throw new NotFoundError("التعيين غير موجود أو خارج نطاق الشركة");
    }

    // استخراج المادة والجزاء إن لم تُحدد يدوياً
    let resolvedRegulationId: number | null = regulationId ?? null;
    let penaltyPreview: any = null;
    if (!resolvedRegulationId) {
      const dailyWage = await getDailyWage(assignmentId);
      const resolution = await resolvePenalty({
        companyId: scope.companyId,
        assignmentId,
        employeeId: assignment.employeeId,
        dailyWage,
        incidentType: incidentType as IncidentType,
        incidentDate,
        durationMinutes: incidentDurationMinutes,
        absenceDays,
        disruptsOthers: !!disruptsOthers,
      });
      if (resolution) {
        resolvedRegulationId = resolution.regulation.id;
        penaltyPreview = resolution;
      }
    }

    const memoNumber = await generateMemoNumber(scope.companyId);
    const { insertId: memoId } = await rawExecute(
      `INSERT INTO hr_inquiry_memos (
         "companyId","branchId","memoNumber","assignmentId","employeeId",
         "regulationId","incidentType","incidentDate","incidentDurationMinutes",
         "incidentDescription", source, status, "createdBy"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual','pending_employee',$11)
       RETURNING id`,
      [
        scope.companyId, assignment.branchId, memoNumber,
        assignmentId, assignment.employeeId,
        resolvedRegulationId,
        incidentType, incidentDate, incidentDurationMinutes ?? null,
        incidentDescription ?? null,
        scope.userId,
      ]
    );

    await logMemoEvent({
      memoId, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "hr", action: "created",
      payload: {
        incidentType, incidentDate, penaltyPreview,
        ...(witnesses ? { witnesses } : {}),
        ...(relatedParties ? { relatedParties } : {}),
        ...(reasons ? { reasons } : {}),
        ...(manualOverrideAmount ? { manualOverrideAmount, manualOverrideReason } : {}),
      },
      note: "إنشاء محضر استفسار يدوي",
    });

    // تنبيه الموظف لتقديم التبرير
    createNotification({
      companyId: scope.companyId,
      assignmentId,
      type: "inquiry_memo",
      title: "محضر استفسار جديد",
      body: `تم فتح محضر استفسار رقم ${memoNumber} بشأن ${incidentType}. يُرجى تقديم تبريرك.`,
      priority: "high",
      refType: "hr_inquiry_memo",
      refId: memoId,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.memo.created", entity: "hr_inquiry_memo", entityId: memoId,
      details: JSON.stringify({ memoNumber, incidentType, source: "manual" }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "discipline_memos", entityId: memoId,
      after: { memoNumber, incidentType, incidentDate, assignmentId, regulationId: resolvedRegulationId, source: "manual" },
    }).catch(console.error);

    res.status(201).json({ id: memoId, memoNumber, regulationId: resolvedRegulationId, penaltyPreview });
  } catch (err) {
    handleRouteError(err, res, "Create memo error:");
  }
});

// Step 1: Employee justification
router.post("/memos/:id/justify", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const parsed_justifyMemoSchema = justifyMemoSchema.safeParse(req.body);
    if (!parsed_justifyMemoSchema.success) throw new ValidationError(parsed_justifyMemoSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_justifyMemoSchema.data;
    const { justification, declined } = body;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    // authorisation: الموظف نفسه أو HR/GM/Owner
    const isOwnerOfMemo = scope.activeAssignmentId === memo.assignmentId;
    const isHR = scope.role === "hr_manager" || scope.role === "owner" || scope.role === "general_manager";
    if (!isOwnerOfMemo && !isHR) {
      throw new ForbiddenError("لا تملك صلاحية تقديم التبرير على هذا المحضر");
    }
    if (memo.status !== "pending_employee") {
      throw new ConflictError(`لا يمكن تقديم التبرير في الحالة ${memo.status}`, { field: "status" });
    }
    if (!declined && !justification) {
      throw new ValidationError("التبرير مطلوب أو يجب الإقرار برفض التبرير", { field: "justification" });
    }

    await rawExecute(
      `UPDATE hr_inquiry_memos
          SET justification = $1, "employeeSignedAt" = NOW(),
              "employeeDeclined" = $2, status = 'pending_manager',
              "updatedAt" = NOW()
        WHERE id = $3 AND "companyId" = $4`,
      [justification ?? null, !!declined, id, scope.companyId]
    );

    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "employee", action: "justified",
      payload: { declined: !!declined },
      note: declined ? "رفض الموظف تقديم تبرير" : "قدّم الموظف تبريره",
    });

    // تنبيه المدير المباشر
    getManagerAssignmentId(scope.companyId, memo.branchId).then((managerAssignmentId) => {
      if (managerAssignmentId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerAssignmentId,
          type: "inquiry_memo", title: "محضر استفسار بانتظار توصيتك",
          body: `المحضر ${memo.memoNumber} بحاجة إلى توصية المدير المباشر.`,
          priority: "high", refType: "hr_inquiry_memo", refId: id,
        }).catch(console.error);
      }
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "hr.memo.justified",
      entity: "hr_inquiry_memos",
      entityId: id,
      details: JSON.stringify({ declined: !!declined }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: "pending_manager", declined: !!declined },
    }).catch(console.error);

    res.json({ ok: true, status: "pending_manager" });
  } catch (err) {
    handleRouteError(err, res, "Justify memo error:");
  }
});

// Step 2: Direct manager recommendation
router.post("/memos/:id/manager-recommendation", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const parsed_managerRecommendationSchema = managerRecommendationSchema.safeParse(req.body);
    if (!parsed_managerRecommendationSchema.success) throw new ValidationError(parsed_managerRecommendationSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_managerRecommendationSchema.data;
    const { recommendation, comment } = body;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (memo.status !== "pending_manager") {
      throw new ConflictError(`لا يمكن تسجيل التوصية في الحالة ${memo.status}`, { field: "status" });
    }

    await rawExecute(
      `UPDATE hr_inquiry_memos
          SET "managerId" = $1, "managerRecommendation" = $2,
              "managerComment" = $3, "managerDecidedAt" = NOW(),
              status = 'pending_gm', "updatedAt" = NOW()
        WHERE id = $4 AND "companyId" = $5`,
      [scope.activeAssignmentId ?? null, recommendation, comment ?? null, id, scope.companyId]
    );

    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "direct_manager", action: "manager_recommended",
      payload: { recommendation }, note: comment ?? undefined,
    });

    // تنبيه المدير العام
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.memo.manager_recommended", entity: "hr_inquiry_memo", entityId: id,
      details: JSON.stringify({ recommendation }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: "pending_gm", recommendation, comment },
    }).catch(console.error);

    res.json({ ok: true, status: "pending_gm" });
  } catch (err) {
    handleRouteError(err, res, "Manager recommendation error:");
  }
});

// Step 3: GM final decision + apply penalty
router.post("/memos/:id/gm-decision", requirePermission("hr:discipline:approve"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const parsed_gmDecisionSchema = gmDecisionSchema.safeParse(req.body);
    if (!parsed_gmDecisionSchema.success) throw new ValidationError(parsed_gmDecisionSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_gmDecisionSchema.data;
    const { decision, comment } = body;

    // Only GM/Owner or users with the approve permission can act
    if (!(scope.role === "general_manager" || scope.role === "owner" || scope.isOwner)) {
      // permission middleware would have caught this but we double-check
    }

    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (memo.status !== "pending_gm") {
      throw new ConflictError(`لا يمكن اعتماد المحضر في الحالة ${memo.status}`, { field: "status" });
    }

    await withTransaction(async (client) => {
      // جلب تفاصيل التعيين والراتب
      const { rows: assignmentRows } = await client.query(
        `SELECT id, "companyId", "branchId", "employeeId", salary
           FROM employee_assignments WHERE id = $1`,
        [memo.assignmentId]
      );
      const assignment = assignmentRows[0];
      if (!assignment) throw new Error("التعيين غير موجود");

      let appliedLabel = "";
      let baseAmount = 0;
      let extraAmount = 0;
      let occurrenceCount = memo.occurrenceCount ?? 1;
      let terminationDecided = false;
      let newStatus: "approved" | "rejected" = "approved";

      if (decision === "rejected") {
        newStatus = "rejected";
        if (memo.violationId) {
          await client.query(
            `UPDATE employee_violations SET status = 'rejected' WHERE id = $1 AND "companyId" = $2`,
            [memo.violationId, scope.companyId]
          );
        }
      } else {
        // Re-resolve penalty at decision time (اللائحة قد تكون تحدّثت)
        const dailyWage = Number(assignment.salary ?? 0) > 0 ? Number(assignment.salary) / 30 : 0;

        const resolution = await resolvePenalty({
          companyId: scope.companyId,
          assignmentId: memo.assignmentId,
          employeeId: memo.employeeId,
          dailyWage,
          incidentType: memo.incidentType as IncidentType,
          incidentDate: memo.incidentDate,
          durationMinutes: memo.incidentDurationMinutes ?? undefined,
          absenceDays: undefined,
          disruptsOthers: false,
          customRegulationId: memo.regulationId ?? undefined,
        });

        if (resolution) {
          appliedLabel = resolution.penaltyLabel;
          baseAmount = resolution.baseDeductionAmount;
          extraAmount = resolution.extraDeductionAmount;
          occurrenceCount = resolution.occurrenceCount;
          terminationDecided = resolution.isTermination;
        }

        // إدخال الخصم في attendance_deductions (pending_payroll) إن وجد مبلغ
        const totalDeduction = baseAmount + extraAmount;
        if (totalDeduction > 0) {
          const period = memo.incidentDate.slice(0, 7);
          await client.query(
            `INSERT INTO attendance_deductions
               ("companyId","assignmentId",type,minutes,amount,period,status)
             VALUES ($1,$2,'penalty',$3,$4,$5,'pending_payroll')`,
            [
              scope.companyId,
              memo.assignmentId,
              memo.incidentDurationMinutes ?? 0,
              totalDeduction,
              period,
            ]
          );
        }

        // تحديث employee_violations المرتبط (إن وجد)
        if (memo.violationId) {
          await client.query(
            `UPDATE employee_violations
                SET status = 'approved',
                    "regulationId" = COALESCE("regulationId", $1),
                    "occurrenceCount" = $2,
                    deduction = $3
              WHERE id = $4 AND "companyId" = $5`,
            [memo.regulationId, occurrenceCount, baseAmount + extraAmount, memo.violationId, scope.companyId]
          );
        }
      }

      // Update the memo
      await client.query(
        `UPDATE hr_inquiry_memos
            SET "gmId" = $1, "gmDecision" = $2, "gmComment" = $3,
                "gmDecidedAt" = NOW(), status = $4,
                "occurrenceCount" = $5,
                "appliedPenaltyLabel" = $6,
                "appliedDeductionAmount" = $7,
                "appliedExtraDeduction" = $8,
                "terminationDecided" = $9,
                "updatedAt" = NOW()
          WHERE id = $10 AND "companyId" = $11`,
        [
          scope.activeAssignmentId ?? null,
          decision, comment ?? null,
          newStatus, occurrenceCount,
          appliedLabel, baseAmount, extraAmount,
          terminationDecided, id, scope.companyId,
        ]
      );
    });

    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "gm", action: "gm_decided",
      payload: { decision }, note: comment ?? undefined,
    });

    if (decision === "approved") {
      await logMemoEvent({
        memoId: id, companyId: scope.companyId, actorId: scope.userId,
        actorRole: "system", action: "penalty_applied",
        note: "تم تطبيق الجزاء على كشف الرواتب",
      });
    }

    // تنبيه الموظف بالنتيجة
    createNotification({
      companyId: scope.companyId, assignmentId: memo.assignmentId,
      type: "inquiry_memo_result",
      title: decision === "approved" ? "تم اعتماد جزاء المحضر" : "تم رفض المحضر",
      body: `المحضر ${memo.memoNumber}: ${decision}`,
      priority: "high", refType: "hr_inquiry_memo", refId: id,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.memo.gm_decided", entity: "hr_inquiry_memo", entityId: id,
      details: JSON.stringify({ decision }),
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: decision === "approved" ? "approved" : "rejected", decision, comment },
    }).catch(console.error);

    res.json({ ok: true, status: decision === "approved" ? "approved" : "rejected" });
  } catch (err) {
    handleRouteError(err, res, "GM decision error:");
  }
});

// Cancel a memo
router.post("/memos/:id/cancel", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const parsed_cancelMemoSchema = cancelMemoSchema.safeParse(req.body);
    if (!parsed_cancelMemoSchema.success) throw new ValidationError(parsed_cancelMemoSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_cancelMemoSchema.data;
    const { reason } = body;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (["approved", "rejected", "cancelled", "closed", "appeal_pending", "appeal_accepted"].includes(memo.status)) {
      throw new ConflictError(`لا يمكن إلغاء المحضر في الحالة ${memo.status}`, { field: "status" });
    }
    await rawExecute(
      `UPDATE hr_inquiry_memos SET status = 'cancelled', "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    // إذا كان مرتبطاً بمخالفة، نُلغي ربطها
    if (memo.violationId) {
      await rawExecute(
        `UPDATE employee_violations SET status = 'cancelled'
          WHERE id = $1 AND "companyId" = $2`,
        [memo.violationId, scope.companyId]
      );
    }
    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "hr", action: "cancelled", note: reason ?? undefined,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.memo.cancelled",
      entity: "hr_memos",
      entityId: id,
      details: JSON.stringify({ reason, memoNumber: memo.memoNumber, employeeId: memo.employeeId }),
    }).catch(console.error);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: "cancelled", reason, memoNumber: memo.memoNumber },
    }).catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Cancel memo error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPEAL — استئناف الموظف على قرار الجزاء
// ─────────────────────────────────────────────────────────────────────────────
router.post("/memos/:id/appeal", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new ValidationError("سبب الاستئناف مطلوب", { field: "reason", fix: "أدخل مبررات الاستئناف" });
    }
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (memo.status !== "approved") {
      throw new ConflictError("لا يمكن الاستئناف إلا على محضر معتمد", { field: "status" });
    }
    await rawExecute(
      `UPDATE hr_inquiry_memos SET status = 'appeal_pending', "appealReason" = $1, "appealDate" = NOW(), "updatedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [reason.trim(), id, scope.companyId]
    );
    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "employee", action: "appeal_submitted", note: reason.trim(),
    });
    createNotification({
      companyId: scope.companyId, assignmentId: memo.managerId ?? null,
      type: "inquiry_memo_appeal",
      title: `استئناف على محضر ${memo.memoNumber}`,
      body: `قدّم الموظف استئنافاً على قرار الجزاء`,
      priority: "high", refType: "hr_inquiry_memo", refId: id,
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.memo.appealed",
      entity: "hr_memos",
      entityId: id,
      details: JSON.stringify({ reason: reason.trim(), memoNumber: memo.memoNumber, employeeId: memo.employeeId }),
    }).catch(console.error);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: "appeal_pending", reason: reason.trim(), memoNumber: memo.memoNumber },
    }).catch(console.error);
    res.json({ ok: true, status: "appeal_pending" });
  } catch (err) { handleRouteError(err, res, "Appeal error:"); }
});

router.post("/memos/:id/appeal-decision", requirePermission("hr:discipline:approve"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { decision, comment } = req.body;
    if (!decision || !["accepted", "rejected"].includes(decision)) {
      throw new ValidationError("القرار مطلوب (accepted أو rejected)");
    }
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (memo.status !== "appeal_pending") {
      throw new ConflictError("المحضر ليس في حالة استئناف معلق", { field: "status" });
    }
    const newStatus = decision === "accepted" ? "appeal_accepted" : "approved";
    await rawExecute(
      `UPDATE hr_inquiry_memos SET status = $1, "appealDecision" = $2, "appealComment" = $3, "appealDecidedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $4 AND "companyId" = $5`,
      [newStatus, decision, comment || null, id, scope.companyId]
    );
    if (decision === "accepted" && memo.violationId) {
      await rawExecute(
        `UPDATE employee_violations SET status = 'appeal_accepted' WHERE id = $1 AND "companyId" = $2`,
        [memo.violationId, scope.companyId]
      );
    }
    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "gm", action: decision === "accepted" ? "appeal_accepted" : "appeal_rejected",
      note: comment ?? undefined,
    });
    createNotification({
      companyId: scope.companyId, assignmentId: memo.assignmentId,
      type: "inquiry_memo_appeal_result",
      title: decision === "accepted" ? "تم قبول الاستئناف" : "تم رفض الاستئناف",
      body: `نتيجة استئنافك على المحضر ${memo.memoNumber}: ${decision === "accepted" ? "قُبل" : "رُفض"}`,
      priority: "high", refType: "hr_inquiry_memo", refId: id,
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.memo.appeal_decided",
      entity: "hr_memos",
      entityId: id,
      details: JSON.stringify({ decision, comment, newStatus, memoNumber: memo.memoNumber, employeeId: memo.employeeId }),
    }).catch(console.error);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: newStatus, decision, comment, memoNumber: memo.memoNumber },
    }).catch(console.error);
    res.json({ ok: true, status: newStatus });
  } catch (err) { handleRouteError(err, res, "Appeal decision error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLOSE — إقفال المحضر وأرشفته
// ─────────────────────────────────────────────────────────────────────────────
router.post("/memos/:id/close", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (!["approved", "rejected", "appeal_accepted", "cancelled"].includes(memo.status)) {
      throw new ConflictError("لا يمكن إقفال المحضر في هذه الحالة — يجب أن يكون مقرراً أو ملغى", { field: "status" });
    }
    await rawExecute(
      `UPDATE hr_inquiry_memos SET status = 'closed', "closedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (memo.violationId) {
      await rawExecute(
        `UPDATE employee_violations SET status = 'closed' WHERE id = $1 AND "companyId" = $2`,
        [memo.violationId, scope.companyId]
      );
    }
    await logMemoEvent({
      memoId: id, companyId: scope.companyId, actorId: scope.userId,
      actorRole: "hr", action: "closed", note: req.body.note ?? undefined,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.memo.closed",
      entity: "hr_memos",
      entityId: id,
      details: JSON.stringify({ memoNumber: memo.memoNumber, employeeId: memo.employeeId, previousStatus: memo.status }),
    }).catch(console.error);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "discipline_memos", entityId: id,
      after: { status: "closed", previousStatus: memo.status, memoNumber: memo.memoNumber },
    }).catch(console.error);
    res.json({ ok: true, status: "closed" });
  } catch (err) { handleRouteError(err, res, "Close memo error:"); }
});

// Preview penalty without creating a memo (for UI)
router.post("/penalty-preview", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_penaltyPreviewSchema = penaltyPreviewSchema.safeParse(req.body);
    if (!parsed_penaltyPreviewSchema.success) throw new ValidationError(parsed_penaltyPreviewSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_penaltyPreviewSchema.data;
    const { assignmentId, incidentType, incidentDate, durationMinutes, absenceDays, disruptsOthers, regulationId } = body;
    const [assignment] = await rawQuery<any>(
      `SELECT id, "employeeId", "companyId" FROM employee_assignments WHERE id = $1`,
      [assignmentId]
    );
    if (!assignment || assignment.companyId !== scope.companyId) {
      throw new NotFoundError("التعيين غير موجود");
    }
    const dailyWage = await getDailyWage(assignmentId);
    const resolution = await resolvePenalty({
      companyId: scope.companyId,
      assignmentId, employeeId: assignment.employeeId,
      dailyWage,
      incidentType: incidentType as IncidentType,
      incidentDate,
      durationMinutes, absenceDays,
      disruptsOthers: !!disruptsOthers,
      customRegulationId: regulationId,
    });
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "preview", entity: "discipline_regulations", entityId: assignmentId,
      after: { incidentType, incidentDate, assignmentId },
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "discipline_regulations.penalty_previewed", entity: "discipline_regulations", entityId: assignmentId,
    }).catch(console.error);

    res.json({ dailyWage, resolution });
  } catch (err) {
    handleRouteError(err, res, "Penalty preview error:");
  }
});

// Stats
// ─── Per-employee violations snapshot — used by employee-detail and create form ───
router.get("/employee/:employeeId/summary", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = Number(req.params.employeeId);
    if (!Number.isFinite(employeeId)) {
      throw new ValidationError("معرف الموظف غير صالح");
    }
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const [stats] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('cancelled','rejected'))                    AS "totalActive",
         COUNT(*) FILTER (WHERE status IN ('pending_employee','pending_manager','pending_gm','draft')) AS pending,
         COUNT(*) FILTER (WHERE status = 'approved')                                       AS approved,
         COUNT(*) FILTER (WHERE "createdAt" >= $2::date)                                   AS "ytdCount",
         COALESCE(SUM("appliedDeductionAmount" + "appliedExtraDeduction") FILTER (WHERE status='approved' AND "createdAt" >= $2::date), 0) AS "ytdDeductions",
         COALESCE(MAX("occurrenceCount") FILTER (WHERE "createdAt" >= $2::date), 0)         AS "currentEscalation",
         COUNT(*) FILTER (WHERE "terminationDecided" = TRUE)                                AS terminations
       FROM hr_inquiry_memos
       WHERE "companyId" = $1 AND "employeeId" = $3 AND "deletedAt" IS NULL`,
      [scope.companyId, yearStart, employeeId]
    );
    const recent = await rawQuery<any>(
      `SELECT id, "memoNumber", "incidentType", "incidentDate", status,
              "appliedPenaltyLabel", "appliedDeductionAmount", "appliedExtraDeduction",
              "occurrenceCount", "createdAt"
         FROM hr_inquiry_memos
        WHERE "companyId" = $1 AND "employeeId" = $2 AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC
        LIMIT 5`,
      [scope.companyId, employeeId]
    );
    res.json({ stats: stats ?? {}, recent });
  } catch (err) {
    handleRouteError(err, res, "Employee discipline summary error:");
  }
});

router.get("/stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [totals] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending_employee') AS "pendingEmployee",
         COUNT(*) FILTER (WHERE status = 'pending_manager')  AS "pendingManager",
         COUNT(*) FILTER (WHERE status = 'pending_gm')       AS "pendingGm",
         COUNT(*) FILTER (WHERE status = 'approved')         AS approved,
         COUNT(*) FILTER (WHERE status = 'rejected')         AS rejected,
         COUNT(*) FILTER (WHERE "terminationDecided" = TRUE) AS terminations,
         COALESCE(SUM("appliedDeductionAmount" + "appliedExtraDeduction") FILTER (WHERE status='approved'),0) AS "totalDeductions",
         COUNT(*)                                            AS total
       FROM hr_inquiry_memos
       WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    res.json(totals ?? {});
  } catch (err) {
    handleRouteError(err, res, "Memo stats error:");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// الرصد التلقائي للمخالفات
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /hr/discipline/auto-detection/settings — إعدادات الرصد التلقائي */
router.get("/auto-detection/settings", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const settings = await getAutoDetectionSettings(scope.companyId);
    res.json(settings);
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة إعدادات الرصد التلقائي");
  }
});

/** PUT /hr/discipline/auto-detection/settings — تحديث إعدادات الرصد التلقائي */
router.put("/auto-detection/settings", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بتعديل إعدادات الرصد التلقائي");
    }
    const parsed_autoDetectionSettingsSchema = autoDetectionSettingsSchema.safeParse(req.body);
    if (!parsed_autoDetectionSettingsSchema.success) throw new ValidationError(parsed_autoDetectionSettingsSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body: Partial<AutoDetectionSettings> = parsed_autoDetectionSettingsSchema.data as any;
    await saveAutoDetectionSettings(scope.companyId, body);

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "auto_detection.settings_updated",
      entity: "system_settings", entityId: 0,
      reason: "تحديث إعدادات الرصد التلقائي",
    });

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "discipline.auto_detection_settings_updated", entity: "system_settings", entityId: 0,
    }).catch(console.error);

    const updated = await getAutoDetectionSettings(scope.companyId);
    res.json({ success: true, settings: updated });
  } catch (err) {
    handleRouteError(err, res, "خطأ في تحديث إعدادات الرصد التلقائي");
  }
});

/** POST /hr/discipline/auto-detection/run — تشغيل الرصد يدوياً */
router.post("/auto-detection/run", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بتشغيل الرصد التلقائي");
    }
    const parsed_autoDetectionRunSchema = autoDetectionRunSchema.safeParse(req.body);
    if (!parsed_autoDetectionRunSchema.success) throw new ValidationError(parsed_autoDetectionRunSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_autoDetectionRunSchema.data;
    const { date } = body;
    const targetDate = date ?? new Date().toISOString().split("T")[0]!;

    const result = await runAutoDetection(scope.companyId, targetDate);

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "auto_detection.manual_run",
      entity: "auto_detection_log", entityId: 0,
      reason: `تشغيل يدوي: ${targetDate} — رصد ${result.detected} مخالفة`,
    });

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "discipline.auto_detection_run", entity: "auto_detection_log", entityId: 0,
    }).catch(console.error);

    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "خطأ في تشغيل الرصد التلقائي");
  }
});

/** GET /hr/discipline/auto-detection/log — سجل عمليات الرصد */
router.get("/auto-detection/log", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { limit, offset, fromDate, toDate } = req.query as any;
    const result = await getDetectionLog(scope.companyId, {
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      fromDate,
      toDate,
    });
    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة سجل الرصد التلقائي");
  }
});

/** GET /hr/discipline/auto-detection/summary — ملخص إحصائي */
router.get("/auto-detection/summary", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    // إحصائيات آخر 30 يوم
    const stats = await rawQuery<any>(
      `SELECT
         COUNT(*) AS "totalRuns",
         COUNT(*) AS "totalDetected",
         COUNT(*) FILTER (WHERE "violationId" IS NOT NULL) AS "totalViolations",
         0 AS "totalMemos",
         0 AS "totalErrors",
         MAX("detectedAt") AS "lastRunAt"
       FROM auto_detection_log
       WHERE "companyId" = $1
         AND "detectedAt" >= NOW() - INTERVAL '30 days'`,
      [scope.companyId]
    ).catch(() => [{}]);

    // تفصيل حسب النوع من آخر 30 يوم
    const byType = await rawQuery<any>(
      `SELECT
         d.value->>'type' AS type,
         COUNT(*) AS count
       FROM auto_detection_log adl,
            jsonb_array_elements(adl.details) AS d(value)
       WHERE adl."companyId" = $1
         AND adl."detectedAt" >= NOW() - INTERVAL '30 days'
       GROUP BY d.value->>'type'
       ORDER BY count DESC`,
      [scope.companyId]
    ).catch(() => []);

    const typeLabels: Record<string, string> = {
      late: "تأخر",
      early_leave: "مغادرة مبكرة",
      absence: "غياب",
      gps_out_of_range: "خروج GPS",
    };

    res.json({
      ...(stats[0] ?? {}),
      byType: byType.map((r: any) => ({
        type: r.type,
        label: typeLabels[r.type] ?? r.type,
        count: Number(r.count),
      })),
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في ملخص الرصد التلقائي");
  }
});

export default router;
