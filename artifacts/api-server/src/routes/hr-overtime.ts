// ============================================================================
// hr-overtime.ts
// مسارات الوقت الإضافي — طلب، موافقة، ربط بالرواتب
// Base path: /hr/overtime
// ============================================================================

import { Router } from "express";
import { HR_APPROVAL_ROLES } from "../lib/rbacCatalog.js";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  createAuditLog,
  createNotification,
  emitEvent,
  getManagerAssignmentId,
  initiateApprovalChain,
  processApprovalStep,
  roundTo2,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { generateSequentialNumber, calcHourlyRate as calcHourlyRateHelper } from "../lib/hrHelpers.js";
import { HR_TABLES, NUMBER_PREFIXES } from "../lib/hrEnums.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── إنشاء الجدول ──────────────────────────────────────────────────────────
async function ensureOvertimeTable(): Promise<void> {
  await rawExecute(`
    CREATE TABLE IF NOT EXISTS hr_overtime_requests (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "branchId" INTEGER,
      "assignmentId" INTEGER NOT NULL,
      "employeeId" INTEGER NOT NULL,
      "requestNumber" VARCHAR(30) NOT NULL,
      "overtimeDate" DATE NOT NULL,
      "startTime" TIME NOT NULL,
      "endTime" TIME NOT NULL,
      hours NUMERIC(5,2) NOT NULL,
      "hourlyRate" NUMERIC(10,2),
      "multiplier" NUMERIC(3,2) DEFAULT 1.50,
      "totalAmount" NUMERIC(12,2),
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      "approvedBy" INTEGER,
      "approvedAt" TIMESTAMPTZ,
      "rejectionReason" TEXT,
      "payrollPeriod" VARCHAR(7),
      "payrollLineId" INTEGER,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      "deletedAt" TIMESTAMPTZ
    )
  `).catch((e) => logger.error(e, "hr-overtime background task failed"));
}

// ─── رقم متسلسل (يستخدم الأداة الموحّدة من hrHelpers) ───────────────────
async function generateOvertimeNumber(companyId: number): Promise<string> {
  return generateSequentialNumber(HR_TABLES.OVERTIME, companyId, NUMBER_PREFIXES.OVERTIME);
}

// ─── حساب المعدل بالساعة (يستخدم hrHelpers — المادة 98 السعودية) ────────
const calcHourlyRate = calcHourlyRateHelper;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createOvertimeSchema = z.object({
  assignmentId: z.coerce.number({ message: "يرجى اختيار الموظف" }),
  overtimeDate: z.string().min(1, "تاريخ الوقت الإضافي مطلوب"),
  startTime: z.string().min(1, "وقت البداية مطلوب"),
  endTime: z.string().min(1, "وقت النهاية مطلوب"),
  hours: z.coerce.number({ message: "عدد الساعات مطلوب" }).positive("عدد الساعات يجب أن يكون أكبر من صفر").max(12, "لا يمكن تسجيل أكثر من 12 ساعة إضافية في اليوم"),
  multiplier: z.coerce.number().optional(),
  reason: z.string().optional(),
});

const rejectOvertimeSchema = z.object({
  reason: z.string().optional(),
});

const approvalDecisionSchema = z.object({
  approved: z.boolean().default(true),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/overtime — قائمة الطلبات
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime", authorize({ feature: "hr.overtime", action: "list" }), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const { status, assignmentId, month } = req.query as any;

    let where = `o."companyId" = $1 AND o."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    let idx = 2;

    if (status) { where += ` AND o.status = $${idx}`; params.push(status); idx++; }
    if (assignmentId) { where += ` AND o."assignmentId" = $${idx}`; params.push(Number(assignmentId)); idx++; }
    if (month) { where += ` AND o."payrollPeriod" = $${idx}`; params.push(month); idx++; }

    const data = await rawQuery<any>(
      `SELECT o.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", b.name AS "branchName"
       FROM hr_overtime_requests o
       JOIN employee_assignments ea ON ea.id = o."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ${where}
       ORDER BY o."overtimeDate" DESC, o."createdAt" DESC
       LIMIT 500`,
      params
    );

    const [stats] = await rawQuery<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved,
         COALESCE(SUM(hours) FILTER (WHERE status = 'approved'), 0) AS "totalHours",
         COALESCE(SUM("totalAmount") FILTER (WHERE status = 'approved'), 0) AS "totalAmount"
       FROM hr_overtime_requests
       WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );

    res.json({ data, stats: stats ?? {}, total: data.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة طلبات الوقت الإضافي");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/overtime/my — طلباتي (Self-Service)
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime/my", authorize({ feature: "hr.overtime.my", action: "list" }), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const data = await rawQuery<any>(
      `SELECT o.*, e.name AS "employeeName"
       FROM hr_overtime_requests o
       JOIN employees e ON e.id = o."employeeId"
       WHERE o."assignmentId" = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL
       ORDER BY o."overtimeDate" DESC LIMIT 500`,
      [scope.activeAssignmentId, scope.companyId]
    );
    res.json({ data });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة طلباتك");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/overtime/summary — ملخص شهري للربط بالرواتب
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime/summary", authorize({ feature: "hr.overtime", action: "list" }), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const period = String(req.query.period || req.query.month || "");
    const data = await rawQuery<any>(
      `SELECT o."assignmentId", e.name AS "employeeName", e."empNumber",
              SUM(o.hours) AS "totalHours", SUM(o."totalAmount") AS "totalAmount",
              COUNT(*) AS "requestCount"
       FROM hr_overtime_requests o
       JOIN employee_assignments ea ON ea.id = o."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE o."companyId" = $1 AND o."payrollPeriod" = $2
         AND o.status = 'approved' AND o."deletedAt" IS NULL
       GROUP BY o."assignmentId", e.name, e."empNumber"
       ORDER BY "totalAmount" DESC`,
      [scope.companyId, period]
    );

    const [totals] = await rawQuery<any>(
      `SELECT COALESCE(SUM(hours), 0) AS hours, COALESCE(SUM("totalAmount"), 0) AS amount
       FROM hr_overtime_requests
       WHERE "companyId" = $1 AND "payrollPeriod" = $2 AND status = 'approved' AND "deletedAt" IS NULL`,
      [scope.companyId, period]
    );

    res.json({ data, totals: totals ?? { hours: 0, amount: 0 }, period });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة ملخص الوقت الإضافي");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/overtime/:id — تفاصيل الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime/:id", authorize({ feature: "hr.overtime", action: "view" }), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery<any>(
      `SELECT o.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, b.name AS "branchName"
       FROM hr_overtime_requests o
       JOIN employee_assignments ea ON ea.id = o."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE o.id = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("طلب الوقت الإضافي غير موجود");
    res.json(item);
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة تفاصيل الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/overtime — طلب وقت إضافي
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/overtime", authorize({ feature: "hr.overtime", action: "create" }), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const b = zodParse(createOvertimeSchema.safeParse(req.body));

    const hours = b.hours;

    // جلب بيانات الموظف
    const [emp] = await rawQuery<any>(
      `SELECT ea.salary, ea."employeeId", ea."branchId"
       FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2`,
      [b.assignmentId, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");

    const hourlyRate = calcHourlyRate(Number(emp.salary || 0));
    const multiplier = Number(b.multiplier || 1.5);
    const totalAmount = roundTo2(hourlyRate * multiplier * hours);

    // التحقق من عدم التكرار
    const [existing] = await rawQuery<any>(
      `SELECT id FROM hr_overtime_requests
       WHERE "assignmentId" = $1 AND "overtimeDate" = $2
         AND "companyId" = $3 AND "deletedAt" IS NULL AND status != 'rejected'`,
      [b.assignmentId, b.overtimeDate, scope.companyId]
    );
    if (existing) {
      throw new ConflictError("يوجد طلب وقت إضافي لنفس الموظف في نفس التاريخ");
    }

    const requestNumber = await generateOvertimeNumber(scope.companyId);
    const period = b.overtimeDate.substring(0, 7); // YYYY-MM

    const { insertId } = await rawExecute(
      `INSERT INTO hr_overtime_requests
         ("companyId","branchId","assignmentId","employeeId","requestNumber",
          "overtimeDate","startTime","endTime",hours,"hourlyRate","multiplier",
          "totalAmount",reason,status,"payrollPeriod","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,NOW())
       RETURNING id`,
      [
        scope.companyId, emp.branchId, b.assignmentId, emp.employeeId,
        requestNumber, b.overtimeDate, b.startTime, b.endTime,
        hours, hourlyRate, multiplier, totalAmount,
        b.reason || null, period,
      ]
    );

    // ── سلسلة الموافقات ──
    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      chainType: "overtime",
      refType: "hr_overtime_request",
      refId: insertId,
      amount: totalAmount,
    }).catch((e) => { logger.error(e, "hr-overtime approval chain failed"); return null; });

    // ── محرك سير العمل ──
    submitWorkflow({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      requestType: "overtime",
      refTable: "hr_overtime_requests",
      refId: insertId,
      title: `طلب وقت إضافي ${requestNumber} — ${hours} ساعات`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { requestNumber, hours, totalAmount, overtimeDate: b.overtimeDate },
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));

    // ── إشعار المدير (fallback) ──
    if (!approvalResult?.requiresApproval) {
      const managerId = await getManagerAssignmentId(scope.companyId, emp.branchId ?? scope.branchId).catch((e) => { logger.error(e, "hr-overtime manager lookup failed"); return null; });
      if (managerId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerId,
          type: "overtime_request", title: "طلب وقت إضافي",
          body: `طلب ${hours} ساعات إضافية بتاريخ ${b.overtimeDate} — ${requestNumber}`,
          priority: "normal", refType: "hr_overtime_request", refId: insertId,
        }).catch((e) => logger.error(e, "hr-overtime background task failed"));
      }
    }

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "overtime.created", entity: "hr_overtime_requests", entityId: insertId,
      reason: `طلب وقت إضافي: ${requestNumber} — ${hours} ساعات`,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.overtime.created",
      entity: "hr_overtime_requests",
      entityId: insertId,
      details: JSON.stringify({ requestNumber, hours, totalAmount, overtimeDate: b.overtimeDate, assignmentId: b.assignmentId }),
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM hr_overtime_requests WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json({ ...row, approval: approvalResult ?? { requiresApproval: false } });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء طلب الوقت الإضافي");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/overtime/:id/approve — اعتماد الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/overtime/:id/approve", authorize({ feature: "hr.overtime", action: "update" }), async (req, res) => {
  try {
    const b = zodParse(approvalDecisionSchema.safeParse(req.body ?? {}));
    const { approved = true, reason, notes } = b;
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError(
        "صلاحية اعتماد الوقت الإضافي محصورة بالمدير أو HR أو المالك",
        { fix: "اطلب من مديرك المباشر تنفيذ الموافقة.", meta: { yourRole: scope.role } }
      );
    }

    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "pending") throw new ConflictError("لا يمكن اعتماد طلب بحالة: " + item.status);

    if (item.assignmentId === scope.activeAssignmentId) {
      throw new ForbiddenError("لا يمكنك اعتماد طلبك الخاص");
    }

    const rejectionReason = reason || notes;
    if (!approved) {
      const { affectedRows } = await rawExecute(
        `UPDATE hr_overtime_requests SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL`,
        [rejectionReason || null, item.id, scope.companyId]
      );
      if (!affectedRows) throw new ConflictError("تم تحديث الطلب مسبقاً — أعد التحميل");
      processApprovalStep({
        companyId: scope.companyId, branchId: scope.branchId,
        refType: "hr_overtime_request", refId: item.id,
        approved: false, decidedBy: scope.activeAssignmentId, reason: rejectionReason,
      }).catch((e) => logger.error(e, "hr-overtime background task failed"));
      createNotification({
        companyId: scope.companyId, assignmentId: item.assignmentId,
        type: "overtime_rejected", title: "تم رفض طلب الوقت الإضافي",
        body: `تم رفض الطلب ${item.requestNumber}${rejectionReason ? " — السبب: " + rejectionReason : ""}`,
        priority: "normal", refType: "hr_overtime_request", refId: item.id,
      }).catch(console.error);
      try {
        await rawExecute(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('hr_overtime_request',$1,'rejected',$2,$3,$4)`,
          [item.id, rejectionReason || null, scope.userId, scope.companyId]
        );
      } catch (e) { console.error("Failed to log approval action:", e); }
      emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "hr.overtime.rejected", entity: "hr_overtime_requests", entityId: item.id, details: JSON.stringify({ requestNumber: item.requestNumber, reason: rejectionReason }) }).catch((e) => logger.error(e, "hr-overtime background task failed"));
      res.json({ success: true, message: "تم رفض الطلب" });
      return;
    }

    // ── معالجة خطوة الموافقة ──
    const chainResult = await processApprovalStep({
      companyId: scope.companyId,
      branchId: scope.branchId,
      refType: "hr_overtime_request",
      refId: item.id,
      approved: true,
      decidedBy: scope.activeAssignmentId,
      requesterId: item.assignmentId,
    }).catch((e) => { logger.error(e, "hr overtime approval failed"); return { status: "approved" as const, message: "" }; });

    if (chainResult.status === "pending_next_step") {
      res.json({
        success: true, status: "pending_next_step",
        message: `تمت موافقتك — بانتظار موافقة ${chainResult.nextRole ?? "المرحلة التالية"}`,
      });
      return;
    }

    const { affectedRows } = await rawExecute(
      `UPDATE hr_overtime_requests
       SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL`,
      [scope.userId, item.id, scope.companyId]
    );
    if (!affectedRows) throw new ConflictError("تم تحديث الطلب مسبقاً — أعد التحميل");

    createNotification({
      companyId: scope.companyId, assignmentId: item.assignmentId,
      type: "overtime_approved", title: "تمت الموافقة على الوقت الإضافي",
      body: `تمت الموافقة على ${item.hours} ساعات إضافية — ${item.requestNumber}`,
      priority: "normal", refType: "hr_overtime_request", refId: item.id,
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('hr_overtime_request',$1,'approved',$2,$3,$4)`,
        [item.id, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "overtime.approved", entity: "hr_overtime_requests", entityId: item.id,
      reason: `اعتماد الوقت الإضافي: ${item.requestNumber}`,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.overtime.approved",
      entity: "hr_overtime_requests",
      entityId: item.id,
      details: JSON.stringify({ requestNumber: item.requestNumber, hours: item.hours, totalAmount: item.totalAmount }),
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));

    res.json({ success: true, message: "تم اعتماد طلب الوقت الإضافي" });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/overtime/:id/reject — رفض الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/overtime/:id/reject", authorize({ feature: "hr.overtime", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("صلاحية رفض طلبات الوقت الإضافي محصورة بالمدير أو HR أو المالك");
    }

    const b = zodParse(rejectOvertimeSchema.safeParse(req.body));
    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "pending") throw new ConflictError("لا يمكن رفض طلب بحالة: " + item.status);

    processApprovalStep({
      companyId: scope.companyId, branchId: scope.branchId,
      refType: "hr_overtime_request", refId: item.id,
      approved: false, decidedBy: scope.activeAssignmentId, reason: b.reason,
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));

    const { affectedRows } = await rawExecute(
      `UPDATE hr_overtime_requests SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' AND "deletedAt" IS NULL`,
      [b.reason || null, item.id, scope.companyId]
    );
    if (!affectedRows) throw new ConflictError("تم تحديث الطلب مسبقاً — أعد التحميل");

    createNotification({
      companyId: scope.companyId, assignmentId: item.assignmentId,
      type: "overtime_rejected", title: "تم رفض طلب الوقت الإضافي",
      body: `تم رفض الطلب ${item.requestNumber}${b.reason ? " — السبب: " + b.reason : ""}`,
      priority: "normal", refType: "hr_overtime_request", refId: item.id,
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.overtime.rejected",
      entity: "hr_overtime_requests",
      entityId: item.id,
      details: JSON.stringify({ requestNumber: item.requestNumber, reason: b.reason }),
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "hr_overtime_requests", entityId: id,
      after: { status: "rejected", rejectionReason: b.reason || null, requestNumber: item.requestNumber },
    }).catch((e) => logger.error(e, "hr-overtime background task failed"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ في رفض الطلب");
  }
});

export default router;
