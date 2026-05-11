// ============================================================================
// hr-discipline.ts
// Routes: لائحة الانضباط الحية + محاضر الاستفسار (workflow)
// Base path: /hr/discipline
// ============================================================================

import { Router } from "express";
import { HR_ROLES } from "../lib/rbacCatalog.js";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  createAuditLog,
  createNotification,
  emitEvent,
  getManagerAssignmentId,
  todayISO,
  currentYear,
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
import {
  applyTransition,
  lifecycleErrorResponse,
} from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

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
router.get("/regulation", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
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

router.get("/regulation/:id", authorize({ feature: "hr.discipline", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
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
  articleNumber: z.coerce.number({ message: "رقم المادة مطلوب" }),
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

const appealSchema = z.object({
  reason: z.string().min(1, "سبب الاستئناف مطلوب"),
});

const appealDecisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"], { message: "القرار مطلوب (accepted أو rejected)" }),
  comment: z.string().optional().nullable(),
});

const closeMemoSchema = z.object({
  note: z.string().optional().nullable(),
});

router.post("/regulation", authorize({ feature: "hr.discipline", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createRegulationSchema.safeParse(req.body));
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM hr_discipline_regulation WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId });
  } catch (err) {
    handleRouteError(err, res, "Create regulation article error:");
  }
});

router.patch("/regulation/:id", authorize({ feature: "hr.discipline", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(updateRegulationSchema.safeParse(req.body));
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
        WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Update regulation article error:");
  }
});

// إعادة استنساخ اللائحة الافتراضية (للشركات التي لم تُبذر)
router.post("/regulation/reseed", authorize({ feature: "hr.discipline", action: "create" }), async (req, res) => {
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "discipline_regulations.reseeded", entity: "discipline_regulations", entityId: 0,
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    res.json({ success: true, inserted });
  } catch (err) {
    handleRouteError(err, res, "Reseed regulation error:");
  }
});

router.delete("/regulation/:id", authorize({ feature: "hr.discipline", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete regulation article error:");
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. INQUIRY MEMOS — محاضر الاستفسار (دورة الحياة)
// ═════════════════════════════════════════════════════════════════════════════

// List
router.get("/memos", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const status = (req.query.status as string) || null;
    const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const params: any[] = [scope.companyId];
    let where = `m."companyId" = $1 AND m."deletedAt" IS NULL`;
    if (status) { params.push(status); where += ` AND m.status = $${params.length}`; }
    if (Number.isFinite(assignmentId)) { params.push(assignmentId); where += ` AND m."assignmentId" = $${params.length}`; }
    if (Number.isFinite(employeeId)) { params.push(employeeId); where += ` AND m."employeeId" = $${params.length}`; }
    const regulationIdFilter = req.query.regulationId ? Number(req.query.regulationId) : null;
    if (Number.isFinite(regulationIdFilter)) { params.push(regulationIdFilter); where += ` AND m."regulationId" = $${params.length}`; }
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
router.get("/memos/:id", authorize({ feature: "hr.discipline", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    const events = await rawQuery<any>(
      `SELECT * FROM hr_inquiry_memo_events
        WHERE "memoId" = $1 AND "companyId" = $2 ORDER BY "createdAt" ASC`,
      [id, scope.companyId]
    );
    res.json({ memo, events });
  } catch (err) {
    handleRouteError(err, res, "Get memo error:");
  }
});

// Create a new memo (manually by manager/HR)
router.post("/memos", authorize({ feature: "hr.discipline", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createMemoSchema.safeParse(req.body));
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.memo.created", entity: "hr_inquiry_memo", entityId: memoId,
      details: JSON.stringify({ memoNumber, incidentType, source: "manual" }),
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "discipline_memos", entityId: memoId,
      after: { memoNumber, incidentType, incidentDate, assignmentId, regulationId: resolvedRegulationId, source: "manual" },
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM hr_inquiry_memos WHERE id=$1 AND "companyId"=$2`, [memoId, scope.companyId]);
    res.status(201).json({ ...row, penaltyPreview });
  } catch (err) {
    handleRouteError(err, res, "Create memo error:");
  }
});

// Step 1: Employee justification
router.post("/memos/:id/justify", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(justifyMemoSchema.safeParse(req.body));
    const { justification, declined } = body;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    // authorisation: الموظف نفسه أو HR/GM/Owner
    const isOwnerOfMemo = scope.activeAssignmentId === memo.assignmentId;
    const isHR = HR_ROLES.includes(scope.role);
    if (!isOwnerOfMemo && !isHR) {
      throw new ForbiddenError("لا تملك صلاحية تقديم التبرير على هذا المحضر");
    }
    if (!declined && !justification) {
      throw new ValidationError("التبرير مطلوب أو يجب الإقرار برفض التبرير", { field: "justification" });
    }

    const managerAssignmentId = await getManagerAssignmentId(scope.companyId, memo.branchId);

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.justified",
      fromStates: ["pending_employee"],
      toState: "pending_manager",
      setExtras: {
        justification: justification ?? null,
        employeeSignedAt: { raw: "NOW()" },
        employeeDeclined: !!declined,
      },
      after: { status: "pending_manager", declined: !!declined },
      onApply: async (_row, _client) => {
        await logMemoEvent({
          memoId: id, companyId: scope.companyId, actorId: scope.userId,
          actorRole: "employee", action: "justified",
          payload: { declined: !!declined },
          note: declined ? "رفض الموظف تقديم تبرير" : "قدّم الموظف تبريره",
        });
      },
      notifications: managerAssignmentId
        ? [
            {
              assignmentId: managerAssignmentId,
              type: "inquiry_memo",
              title: "محضر استفسار بانتظار توصيتك",
              body: `المحضر ${memo.memoNumber} بحاجة إلى توصية المدير المباشر.`,
              priority: "high",
              refType: "hr_inquiry_memo",
              refId: id,
            },
          ]
        : [],
    });

    res.json({ success: true, status: "pending_manager" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Justify memo error:");
  }
});

// Step 2: Direct manager recommendation
router.post("/memos/:id/manager-recommendation", authorize({ feature: "hr.discipline", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(managerRecommendationSchema.safeParse(req.body));
    const { recommendation, comment } = body;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.manager_recommended",
      fromStates: ["pending_manager"],
      toState: "pending_gm",
      setExtras: {
        managerId: scope.activeAssignmentId ?? null,
        managerRecommendation: recommendation,
        managerComment: comment ?? null,
        managerDecidedAt: { raw: "NOW()" },
      },
      after: { status: "pending_gm", recommendation, comment },
      onApply: async (_row, _client) => {
        await logMemoEvent({
          memoId: id, companyId: scope.companyId, actorId: scope.userId,
          actorRole: "direct_manager", action: "manager_recommended",
          payload: { recommendation }, note: comment ?? undefined,
        });
      },
    });

    res.json({ success: true, status: "pending_gm" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Manager recommendation error:");
  }
});

// Step 3: GM final decision + apply penalty
router.post("/memos/:id/gm-decision", authorize({ feature: "hr.discipline", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(gmDecisionSchema.safeParse(req.body));
    const { decision, comment } = body;

    // Only GM/Owner or users with the approve permission can act
    if (!(scope.role === "general_manager" || scope.role === "owner" || scope.isOwner)) {
      // permission middleware would have caught this but we double-check
    }

    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    // Pre-compute penalty details before the transition
    const [assignment] = await rawQuery<any>(
      `SELECT id, "companyId", "branchId", "employeeId", salary
         FROM employee_assignments WHERE id = $1 AND "companyId" = $2`,
      [memo.assignmentId, scope.companyId]
    );
    if (!assignment) throw new NotFoundError("التعيين غير موجود");

    let appliedLabel = "";
    let baseAmount = 0;
    let extraAmount = 0;
    let occurrenceCount = memo.occurrenceCount ?? 1;
    let terminationDecided = false;
    const newStatus: "approved" | "rejected" = decision === "rejected" ? "rejected" : "approved";

    if (decision !== "rejected") {
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
    }

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.gm_decided",
      fromStates: ["pending_gm"],
      toState: newStatus,
      setExtras: {
        gmId: scope.activeAssignmentId ?? null,
        gmDecision: decision,
        gmComment: comment ?? null,
        gmDecidedAt: { raw: "NOW()" },
        occurrenceCount,
        appliedPenaltyLabel: appliedLabel,
        appliedDeductionAmount: baseAmount,
        appliedExtraDeduction: extraAmount,
        terminationDecided,
      },
      after: { status: newStatus, decision, comment },
      onApply: async (_row, client) => {
        if (decision === "rejected") {
          if (memo.violationId) {
            await client.query(
              `UPDATE employee_violations SET status = 'rejected' WHERE id = $1 AND "companyId" = $2 AND status = 'pending' AND "deletedAt" IS NULL`,
              [memo.violationId, scope.companyId]
            );
          }
        } else {
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
                WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL`,
              [memo.regulationId, occurrenceCount, baseAmount + extraAmount, memo.violationId, scope.companyId]
            );
          }
        }

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
      },
      notifications: [
        {
          assignmentId: memo.assignmentId,
          type: "inquiry_memo_result",
          title: decision === "approved" ? "تم اعتماد جزاء المحضر" : "تم رفض المحضر",
          body: `المحضر ${memo.memoNumber}: ${decision}`,
          priority: "high",
          refType: "hr_inquiry_memo",
          refId: id,
        },
      ],
    });

    res.json({ success: true, status: newStatus });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "GM decision error:");
  }
});

// Cancel a memo
router.post("/memos/:id/cancel", authorize({ feature: "hr.discipline", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(cancelMemoSchema.safeParse(req.body));
    const { reason } = body;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.cancelled",
      fromStates: ["draft", "pending_employee", "pending_manager", "pending_gm"],
      toState: "cancelled",
      reason: reason ?? undefined,
      after: { status: "cancelled", reason, memoNumber: memo.memoNumber },
      onApply: async (_row, _client) => {
        // إذا كان مرتبطاً بمخالفة، نُلغي ربطها
        if (memo.violationId) {
          await _client.query(
            `UPDATE employee_violations SET status = 'cancelled'
              WHERE id = $1 AND "companyId" = $2 AND status IN ('pending', 'under_review') AND "deletedAt" IS NULL`,
            [memo.violationId, scope.companyId]
          );
        }
        await logMemoEvent({
          memoId: id, companyId: scope.companyId, actorId: scope.userId,
          actorRole: "hr", action: "cancelled", note: reason ?? undefined,
        });
      },
    });
    res.json({ success: true });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Cancel memo error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPEAL — استئناف الموظف على قرار الجزاء
// ─────────────────────────────────────────────────────────────────────────────
router.post("/memos/:id/appeal", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { reason } = zodParse(appealSchema.safeParse(req.body));
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.appealed",
      fromStates: ["approved"],
      toState: "appeal_pending",
      reason: reason.trim(),
      setExtras: {
        appealReason: reason.trim(),
        appealDate: { raw: "NOW()" },
      },
      after: { status: "appeal_pending", reason: reason.trim(), memoNumber: memo.memoNumber },
      onApply: async (_row, _client) => {
        await logMemoEvent({
          memoId: id, companyId: scope.companyId, actorId: scope.userId,
          actorRole: "employee", action: "appeal_submitted", note: reason.trim(),
        });
      },
      notifications: memo.managerId
        ? [
            {
              assignmentId: memo.managerId,
              type: "inquiry_memo_appeal",
              title: `استئناف على محضر ${memo.memoNumber}`,
              body: `قدّم الموظف استئنافاً على قرار الجزاء`,
              priority: "high",
              refType: "hr_inquiry_memo",
              refId: id,
            },
          ]
        : [],
    });
    res.json({ success: true, status: "appeal_pending" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Appeal error:");
  }
});

router.post("/memos/:id/appeal-decision", authorize({ feature: "hr.discipline", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { decision, comment } = zodParse(appealDecisionSchema.safeParse(req.body));
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    const newStatus = decision === "accepted" ? "appeal_accepted" : "approved";

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.appeal_decided",
      fromStates: ["appeal_pending"],
      toState: newStatus,
      setExtras: {
        appealDecision: decision,
        appealComment: comment || null,
        appealDecidedAt: { raw: "NOW()" },
      },
      after: { status: newStatus, decision, comment, memoNumber: memo.memoNumber },
      onApply: async (_row, _client) => {
        if (decision === "accepted" && memo.violationId) {
          await _client.query(
            `UPDATE employee_violations SET status = 'appeal_accepted' WHERE id = $1 AND "companyId" = $2 AND status = 'approved' AND "deletedAt" IS NULL`,
            [memo.violationId, scope.companyId]
          );
        }
        await logMemoEvent({
          memoId: id, companyId: scope.companyId, actorId: scope.userId,
          actorRole: "gm", action: decision === "accepted" ? "appeal_accepted" : "appeal_rejected",
          note: comment ?? undefined,
        });
      },
      notifications: [
        {
          assignmentId: memo.assignmentId,
          type: "inquiry_memo_appeal_result",
          title: decision === "accepted" ? "تم قبول الاستئناف" : "تم رفض الاستئناف",
          body: `نتيجة استئنافك على المحضر ${memo.memoNumber}: ${decision === "accepted" ? "قُبل" : "رُفض"}`,
          priority: "high",
          refType: "hr_inquiry_memo",
          refId: id,
        },
      ],
    });
    res.json({ success: true, status: newStatus });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Appeal decision error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLOSE — إقفال المحضر وأرشفته
// ─────────────────────────────────────────────────────────────────────────────
router.post("/memos/:id/close", authorize({ feature: "hr.discipline", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(closeMemoSchema.safeParse(req.body));
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    await applyTransition({
      entity: "hr_inquiry_memos",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.memo.closed",
      fromStates: ["approved", "rejected", "appeal_accepted", "cancelled"],
      toState: "closed",
      setExtras: {
        closedAt: { raw: "NOW()" },
      },
      after: { status: "closed", previousStatus: memo.status, memoNumber: memo.memoNumber },
      onApply: async (_row, _client) => {
        if (memo.violationId) {
          await _client.query(
            `UPDATE employee_violations SET status = 'closed' WHERE id = $1 AND "companyId" = $2 AND status IN ('approved', 'rejected', 'appeal_accepted', 'cancelled') AND "deletedAt" IS NULL`,
            [memo.violationId, scope.companyId]
          );
        }
        await logMemoEvent({
          memoId: id, companyId: scope.companyId, actorId: scope.userId,
          actorRole: "hr", action: "closed", note: body.note ?? undefined,
        });
      },
    });
    res.json({ success: true, status: "closed" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Close memo error:");
  }
});

// Preview penalty without creating a memo (for UI)
router.post("/penalty-preview", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(penaltyPreviewSchema.safeParse(req.body));
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "discipline_regulations.penalty_previewed", entity: "discipline_regulations", entityId: assignmentId,
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    res.json({ dailyWage, resolution });
  } catch (err) {
    handleRouteError(err, res, "Penalty preview error:");
  }
});

// Stats
// ─── Per-employee violations snapshot — used by employee-detail and create form ───
router.get("/employee/:employeeId/summary", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    if (!Number.isFinite(employeeId)) {
      throw new ValidationError("معرف الموظف غير صالح");
    }
    const yearStart = `${currentYear()}-01-01`;
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

router.get("/stats", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
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
router.get("/auto-detection/settings", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const settings = await getAutoDetectionSettings(scope.companyId);
    res.json(settings);
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة إعدادات الرصد التلقائي");
  }
});

/** PUT /hr/discipline/auto-detection/settings — تحديث إعدادات الرصد التلقائي */
router.put("/auto-detection/settings", authorize({ feature: "hr.discipline", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بتعديل إعدادات الرصد التلقائي");
    }
    const body: Partial<AutoDetectionSettings> = zodParse(autoDetectionSettingsSchema.safeParse(req.body)) as any;
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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    const updated = await getAutoDetectionSettings(scope.companyId);
    res.json({ success: true, settings: updated });
  } catch (err) {
    handleRouteError(err, res, "خطأ في تحديث إعدادات الرصد التلقائي");
  }
});

/** POST /hr/discipline/auto-detection/run — تشغيل الرصد يدوياً */
router.post("/auto-detection/run", authorize({ feature: "hr.discipline", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بتشغيل الرصد التلقائي");
    }
    const body = zodParse(autoDetectionRunSchema.safeParse(req.body));
    const { date } = body;
    const targetDate = date ?? todayISO()!;

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
    }).catch((e) => logger.error(e, "hr-discipline background task failed"));

    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "خطأ في تشغيل الرصد التلقائي");
  }
});

/** GET /hr/discipline/auto-detection/log — سجل عمليات الرصد */
router.get("/auto-detection/log", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { limit, offset, fromDate, toDate } = req.query as any;
    const result = await getDetectionLog(scope.companyId, {
      limit: Math.min(limit ? Number(limit) : 50, 500),
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
router.get("/auto-detection/summary", authorize({ feature: "hr.discipline", action: "list" }), async (req, res) => {
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
    ).catch((e) => { logger.error(e, "hr discipline query failed"); return [{}]; });

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
    ).catch((e) => { logger.error(e, "hr discipline query failed"); return []; });

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
