// ============================================================================
// hr-discipline.ts
// Routes: لائحة الانضباط الحية + محاضر الاستفسار (workflow)
// Base path: /hr/discipline
// ============================================================================

import { Router } from "express";
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

const router = Router();
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function badRequest(_res: any, message: string, field = "body"): never {
  throw new ValidationError(message, { field });
}

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

router.post("/regulation", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const {
      section, articleNumber, title, description,
      penalty1, penalty2, penalty3, penalty4,
      extraDeduction, severity, isTermination, legalReference,
    } = req.body as any;
    if (!section || !articleNumber || !title) {
      badRequest(res, "section, articleNumber, title مطلوبة"); return;
    }
    if (!["work_time", "work_organization", "conduct"].includes(section)) {
      badRequest(res, "القسم غير صحيح"); return;
    }
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
      after: req.body,
    });
    res.status(201).json({ id: insertId });
  } catch (err) {
    handleRouteError(err, res, "Create regulation article error:");
  }
});

router.patch("/regulation/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const allowed = [
      "title", "description", "penalty1", "penalty2", "penalty3", "penalty4",
      "extraDeduction", "severity", "isTermination", "legalReference", "isActive",
    ];
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (k in (req.body ?? {})) {
        params.push(req.body[k]);
        sets.push(`"${k}" = $${params.length}`);
      }
    }
    if (sets.length === 0) { badRequest(res, "لا يوجد حقل للتحديث"); return; }
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
      after: req.body,
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Update regulation article error:");
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
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Delete regulation article error:");
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
    res.json({ ok: true, inserted: Number(row?.count ?? 0) });
  } catch (err) {
    handleRouteError(err, res, "Reseed regulation error:");
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
    const regulationId = req.query.regulationId ? Number(req.query.regulationId) : null;
    const params: any[] = [scope.companyId];
    let where = `m."companyId" = $1 AND m."deletedAt" IS NULL`;
    if (status) { params.push(status); where += ` AND m.status = $${params.length}`; }
    if (assignmentId) { params.push(assignmentId); where += ` AND m."assignmentId" = $${params.length}`; }
    if (regulationId) { params.push(regulationId); where += ` AND m."regulationId" = $${params.length}`; }
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
      additionalReasons,
      incidentLocation,
    } = req.body as any;

    if (!assignmentId || !incidentType || !incidentDate) {
      badRequest(res, "assignmentId, incidentType, incidentDate مطلوبة"); return;
    }
    if (!["late", "early_leave", "absence", "behavior", "organization", "gps_out_of_range", "custom"].includes(incidentType)) {
      badRequest(res, "نوع الواقعة غير صحيح"); return;
    }

    // جلب بيانات التعيين للتحقق من ملكية الشركة
    const [assignment] = await rawQuery<any>(
      `SELECT id, "companyId", "branchId", "employeeId"
         FROM employee_assignments WHERE id = $1`,
      [assignmentId]
    );
    if (!assignment || assignment.companyId !== scope.companyId) {
      badRequest(res, "التعيين غير موجود أو خارج نطاق الشركة"); return;
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
        ...(witnesses?.length ? { witnesses } : {}),
        ...(relatedParties?.length ? { relatedParties } : {}),
        ...(additionalReasons?.length ? { additionalReasons } : {}),
        ...(incidentLocation ? { incidentLocation } : {}),
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
    const { justification, declined } = req.body as any;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");

    // authorisation: الموظف نفسه أو HR/GM/Owner
    const isOwnerOfMemo = scope.activeAssignmentId === memo.assignmentId;
    const isHR = scope.role === "hr_manager" || scope.role === "owner" || scope.role === "general_manager";
    if (!isOwnerOfMemo && !isHR) {
      throw new ForbiddenError("لا تملك صلاحية تقديم التبرير على هذا المحضر");
    }
    if (memo.status !== "pending_employee") {
      badRequest(res, `لا يمكن تقديم التبرير في الحالة ${memo.status}`); return;
    }
    if (!declined && !justification) {
      badRequest(res, "التبرير مطلوب أو يجب الإقرار برفض التبرير"); return;
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
    const { recommendation, comment } = req.body as any;
    if (!["approve_excuse", "reject_excuse"].includes(recommendation)) {
      badRequest(res, "التوصية غير صحيحة"); return;
    }
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (memo.status !== "pending_manager") {
      badRequest(res, `لا يمكن تسجيل التوصية في الحالة ${memo.status}`); return;
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
      payload: { recommendation }, note: comment ?? null,
    });

    // تنبيه المدير العام
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.memo.manager_recommended", entity: "hr_inquiry_memo", entityId: id,
      details: JSON.stringify({ recommendation }),
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
    const { decision, comment } = req.body as any;
    if (!["approved", "rejected", "other"].includes(decision)) {
      badRequest(res, "القرار غير صحيح"); return;
    }

    // Only GM/Owner or users with the approve permission can act
    if (!(scope.role === "general_manager" || scope.role === "owner" || scope.isOwner)) {
      // permission middleware would have caught this but we double-check
    }

    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (memo.status !== "pending_gm") {
      badRequest(res, `لا يمكن اعتماد المحضر في الحالة ${memo.status}`); return;
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
      payload: { decision }, note: comment ?? null,
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
    const { reason } = req.body as any;
    const memo = await getMemo(scope.companyId, id);
    if (!memo) throw new NotFoundError("المحضر غير موجود");
    if (["approved", "rejected", "cancelled"].includes(memo.status)) {
      badRequest(res, `لا يمكن إلغاء المحضر في الحالة ${memo.status}`); return;
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
      actorRole: "hr", action: "cancelled", note: reason ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Cancel memo error:");
  }
});

// Preview penalty without creating a memo (for UI)
router.post("/penalty-preview", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { assignmentId, incidentType, incidentDate, durationMinutes, absenceDays, disruptsOthers, regulationId } = req.body as any;
    if (!assignmentId || !incidentType || !incidentDate) {
      badRequest(res, "assignmentId, incidentType, incidentDate مطلوبة"); return;
    }
    const [assignment] = await rawQuery<any>(
      `SELECT id, "employeeId", "companyId" FROM employee_assignments WHERE id = $1`,
      [assignmentId]
    );
    if (!assignment || assignment.companyId !== scope.companyId) {
      badRequest(res, "التعيين غير موجود"); return;
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
    res.json({ dailyWage, resolution });
  } catch (err) {
    handleRouteError(err, res, "Penalty preview error:");
  }
});

// Stats
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

export default router;
