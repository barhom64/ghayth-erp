// ============================================================================
// hr-overtime.ts
// مسارات الوقت الإضافي — طلب، موافقة، ربط بالرواتب
// Base path: /hr/overtime
// ============================================================================

import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
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
  initiateApprovalChain,
  processApprovalStep,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { generateSequentialNumber, calcHourlyRate as calcHourlyRateHelper } from "../lib/hrHelpers.js";
import { HR_TABLES, NUMBER_PREFIXES } from "../lib/hrEnums.js";

const router = Router();
router.use(authMiddleware);

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
  `).catch(() => {});
}

// ─── رقم متسلسل (يستخدم الأداة الموحّدة من hrHelpers) ───────────────────
async function generateOvertimeNumber(companyId: number): Promise<string> {
  return generateSequentialNumber(HR_TABLES.OVERTIME, companyId, NUMBER_PREFIXES.OVERTIME);
}

// ─── حساب المعدل بالساعة (يستخدم hrHelpers — المادة 98 السعودية) ────────
const calcHourlyRate = calcHourlyRateHelper;

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/overtime — قائمة الطلبات
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime", requirePermission("hr:read"), async (req, res) => {
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
       ORDER BY o."overtimeDate" DESC, o."createdAt" DESC`,
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
// GET /hr/overtime/:id — تفاصيل الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const [item] = await rawQuery<any>(
      `SELECT o.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, b.name AS "branchName"
       FROM hr_overtime_requests o
       JOIN employee_assignments ea ON ea.id = o."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE o.id = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
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
router.post("/overtime", requirePermission("hr:create"), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const b = req.body as any;

    if (!b.assignmentId && !b.employeeId) throw new ValidationError("يرجى اختيار الموظف", { field: "assignmentId" });
    if (!b.overtimeDate) throw new ValidationError("تاريخ الوقت الإضافي مطلوب", { field: "overtimeDate" });
    if (!b.startTime || !b.endTime) throw new ValidationError("وقت البداية والنهاية مطلوبان");
    if (!b.hours || Number(b.hours) <= 0) throw new ValidationError("عدد الساعات مطلوب", { field: "hours" });

    const hours = Number(b.hours);
    if (hours > 12) throw new ValidationError("لا يمكن تسجيل أكثر من 12 ساعة إضافية في اليوم");

    // resolve assignmentId from employeeId if needed
    let assignmentId = b.assignmentId ? Number(b.assignmentId) : null;
    if (!assignmentId && b.employeeId) {
      const [resolved] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' ORDER BY id DESC LIMIT 1`,
        [Number(b.employeeId), scope.companyId]
      );
      if (resolved) assignmentId = resolved.id;
    }
    if (!assignmentId) throw new ValidationError("لم يتم العثور على تعيين نشط للموظف", { field: "assignmentId" });

    // جلب بيانات الموظف
    const [emp] = await rawQuery<any>(
      `SELECT ea.salary, ea."employeeId", ea."branchId"
       FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2`,
      [assignmentId, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");

    const hourlyRate = calcHourlyRate(Number(emp.salary || 0));
    const multiplier = Number(b.multiplier || 1.5);
    const totalAmount = Math.round(hourlyRate * multiplier * hours * 100) / 100;

    // التحقق من عدم التكرار
    const [existing] = await rawQuery<any>(
      `SELECT id FROM hr_overtime_requests
       WHERE "assignmentId" = $1 AND "overtimeDate" = $2
         AND "companyId" = $3 AND "deletedAt" IS NULL AND status != 'rejected'`,
      [assignmentId, b.overtimeDate, scope.companyId]
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
        scope.companyId, emp.branchId, assignmentId, emp.employeeId,
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
    }).catch(() => null);

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
    }).catch(console.error);

    // ── إشعار المدير (fallback) ──
    if (!approvalResult?.requiresApproval) {
      const managerId = await getManagerAssignmentId(scope.companyId, emp.branchId ?? scope.branchId).catch(() => null);
      if (managerId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerId,
          type: "overtime_request", title: "طلب وقت إضافي",
          body: `طلب ${hours} ساعات إضافية بتاريخ ${b.overtimeDate} — ${requestNumber}`,
          priority: "normal", refType: "hr_overtime_request", refId: insertId,
        }).catch(console.error);
      }
    }

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "overtime.created", entity: "hr_overtime_requests", entityId: insertId,
      reason: `طلب وقت إضافي: ${requestNumber} — ${hours} ساعات`,
    });

    res.status(201).json({
      id: insertId, requestNumber, totalAmount,
      approval: approvalResult ?? { requiresApproval: false },
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء طلب الوقت الإضافي");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/overtime/:id/approve — اعتماد الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/overtime/:id/approve", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager", "branch_manager"].includes(scope.role)) {
      throw new ForbiddenError(
        "صلاحية اعتماد الوقت الإضافي محصورة بالمدير أو HR أو المالك",
        { fix: "اطلب من مديرك المباشر تنفيذ الموافقة.", meta: { yourRole: scope.role } }
      );
    }

    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "pending") throw new ConflictError("لا يمكن اعتماد طلب بحالة: " + item.status);

    if (item.assignmentId === scope.activeAssignmentId) {
      throw new ForbiddenError("لا يمكنك اعتماد طلبك الخاص");
    }

    const [contract] = await rawQuery<any>(
      `SELECT "overtimeEligible" FROM employee_contracts
       WHERE "assignmentId" = $1 AND status = 'active' ORDER BY "startDate" DESC LIMIT 1`,
      [item.assignmentId]
    );
    if (contract?.overtimeEligible === false) {
      throw new ConflictError("عقد الموظف لا يسمح بالعمل الإضافي");
    }

    // ── معالجة خطوة الموافقة في السلسلة ──
    const chainResult = await processApprovalStep({
      companyId: scope.companyId,
      branchId: scope.branchId,
      refType: "hr_overtime_request",
      refId: item.id,
      approved: true,
      decidedBy: scope.activeAssignmentId,
      requesterId: item.assignmentId,
    }).catch(() => ({ status: "approved" as const, message: "" }));

    if (chainResult.status === "pending_next_step") {
      res.json({
        success: true, status: "pending_next_step",
        message: `تمت موافقتك — بانتظار موافقة ${chainResult.nextRole ?? "المرحلة التالية"}`,
      });
      return;
    }

    await rawExecute(
      `UPDATE hr_overtime_requests
       SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $2`,
      [scope.userId, item.id]
    );

    createNotification({
      companyId: scope.companyId, assignmentId: item.assignmentId,
      type: "overtime_approved", title: "تمت الموافقة على الوقت الإضافي",
      body: `تمت الموافقة على ${item.hours} ساعات إضافية — ${item.requestNumber}`,
      priority: "normal", refType: "hr_overtime_request", refId: item.id,
    }).catch(console.error);

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "overtime.approved", entity: "hr_overtime_requests", entityId: item.id,
      reason: `اعتماد الوقت الإضافي: ${item.requestNumber}`,
    });

    res.json({ success: true, message: "تم اعتماد طلب الوقت الإضافي" });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/overtime/:id/reject — رفض الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/overtime/:id/reject", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager", "branch_manager"].includes(scope.role)) {
      throw new ForbiddenError("صلاحية رفض طلبات الوقت الإضافي محصورة بالمدير أو HR أو المالك");
    }

    const b = req.body as any;
    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_overtime_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "pending") throw new ConflictError("لا يمكن رفض طلب بحالة: " + item.status);

    processApprovalStep({
      companyId: scope.companyId, branchId: scope.branchId,
      refType: "hr_overtime_request", refId: item.id,
      approved: false, decidedBy: scope.activeAssignmentId, reason: b.reason,
    }).catch(console.error);

    await rawExecute(
      `UPDATE hr_overtime_requests SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [b.reason || null, item.id]
    );

    createNotification({
      companyId: scope.companyId, assignmentId: item.assignmentId,
      type: "overtime_rejected", title: "تم رفض طلب الوقت الإضافي",
      body: `تم رفض الطلب ${item.requestNumber}${b.reason ? " — السبب: " + b.reason : ""}`,
      priority: "normal", refType: "hr_overtime_request", refId: item.id,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ في رفض الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/overtime/my — طلباتي (Self-Service)
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/overtime/my", async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const data = await rawQuery<any>(
      `SELECT o.*, e.name AS "employeeName"
       FROM hr_overtime_requests o
       JOIN employees e ON e.id = o."employeeId"
       WHERE o."assignmentId" = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL
       ORDER BY o."overtimeDate" DESC`,
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
router.get("/overtime/summary", requirePermission("hr:read"), async (req, res) => {
  try {
    await ensureOvertimeTable();
    const scope = req.scope!;
    const { period } = req.query as any;
    if (!period) throw new ValidationError("الفترة مطلوبة (YYYY-MM)");

    const data = await rawQuery<any>(
      `SELECT o."assignmentId", e.name AS "employeeName", e."empNumber",
              SUM(o.hours) AS "totalHours",
              SUM(o."totalAmount") AS "totalAmount",
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

export default router;
