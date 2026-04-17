// ============================================================================
// hr-exit.ts
// سير عمل نهاية الخدمة — إخلاء طرف، تصفية مستحقات، قائمة تسليم
// Base path: /hr/exit
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
  initiateApprovalChain,
  processApprovalStep,
  getManagerAssignmentId,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { generateSequentialNumber } from "../lib/hrHelpers.js";
import { HR_TABLES, NUMBER_PREFIXES } from "../lib/hrEnums.js";

const router = Router();
router.use(authMiddleware);

// ─── إنشاء الجداول ─────────────────────────────────────────────────────────
async function ensureExitTables(): Promise<void> {
  await rawExecute(`
    CREATE TABLE IF NOT EXISTS hr_exit_requests (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "branchId" INTEGER,
      "assignmentId" INTEGER NOT NULL,
      "employeeId" INTEGER NOT NULL,
      "exitNumber" VARCHAR(30) NOT NULL,
      "exitType" VARCHAR(30) NOT NULL DEFAULT 'resignation',
      "requestDate" DATE DEFAULT CURRENT_DATE,
      "lastWorkingDay" DATE,
      "exitReason" TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      "approvedBy" INTEGER,
      "approvedAt" TIMESTAMPTZ,
      "rejectionReason" TEXT,
      "clearanceCompleted" BOOLEAN DEFAULT FALSE,
      "settlementAmount" NUMERIC(12,2),
      "settlementPaid" BOOLEAN DEFAULT FALSE,
      "gratuityAmount" NUMERIC(12,2),
      "leaveBalance" NUMERIC(8,2),
      "leaveCompensation" NUMERIC(12,2),
      "loanDeductions" NUMERIC(12,2) DEFAULT 0,
      "otherDeductions" NUMERIC(12,2) DEFAULT 0,
      "netSettlement" NUMERIC(12,2),
      notes TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      "deletedAt" TIMESTAMPTZ
    )
  `).catch(() => {});

  await rawExecute(`
    CREATE TABLE IF NOT EXISTS hr_exit_clearance (
      id SERIAL PRIMARY KEY,
      "exitRequestId" INTEGER NOT NULL,
      "companyId" INTEGER NOT NULL,
      department VARCHAR(50) NOT NULL,
      "departmentLabel" VARCHAR(100) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      "clearedBy" INTEGER,
      "clearedAt" TIMESTAMPTZ,
      notes TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
}

// ─── رقم متسلسل (يستخدم الأداة الموحّدة من hrHelpers) ───────────────────
async function generateExitNumber(companyId: number): Promise<string> {
  return generateSequentialNumber(HR_TABLES.EXIT, companyId, NUMBER_PREFIXES.EXIT);
}

// ─── أقسام إخلاء الطرف الافتراضية ──────────────────────────────────────────
const DEFAULT_CLEARANCE_DEPARTMENTS = [
  { department: "it",        departmentLabel: "تقنية المعلومات — تسليم الأجهزة والصلاحيات" },
  { department: "hr",        departmentLabel: "الموارد البشرية — المستندات والإجازات"       },
  { department: "finance",   departmentLabel: "المالية — السلف والعهد والمستحقات"           },
  { department: "admin",     departmentLabel: "الإدارة — المفاتيح والبطاقات والممتلكات"     },
  { department: "manager",   departmentLabel: "المدير المباشر — تسليم المهام والملفات"      },
  { department: "security",  departmentLabel: "الأمن — بطاقة الدخول والتصاريح"             },
];

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/exit — قائمة طلبات نهاية الخدمة
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/exit", requirePermission("hr:read"), async (req, res) => {
  try {
    await ensureExitTables();
    const scope = req.scope!;
    const { status } = req.query as any;

    let where = `x."companyId" = $1 AND x."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    let idx = 2;

    if (status) { where += ` AND x.status = $${idx}`; params.push(status); idx++; }

    const data = await rawQuery<any>(
      `SELECT x.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, ea."hireDate", b.name AS "branchName"
       FROM hr_exit_requests x
       JOIN employee_assignments ea ON ea.id = x."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ${where}
       ORDER BY x."createdAt" DESC`,
      params
    );

    const [stats] = await rawQuery<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COALESCE(SUM("netSettlement") FILTER (WHERE status IN ('approved','completed')), 0) AS "totalSettlement"
       FROM hr_exit_requests
       WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );

    res.json({ data, stats: stats ?? {}, total: data.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة طلبات نهاية الخدمة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/exit/:id — تفاصيل الطلب مع قائمة إخلاء الطرف
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/exit/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    await ensureExitTables();
    const scope = req.scope!;
    const [item] = await rawQuery<any>(
      `SELECT x.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, ea."hireDate", b.name AS "branchName"
       FROM hr_exit_requests x
       JOIN employee_assignments ea ON ea.id = x."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE x.id = $1 AND x."companyId" = $2 AND x."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!item) throw new NotFoundError("طلب نهاية الخدمة غير موجود");

    const clearance = await rawQuery<any>(
      `SELECT * FROM hr_exit_clearance
       WHERE "exitRequestId" = $1 AND "companyId" = $2
       ORDER BY id ASC`,
      [item.id, scope.companyId]
    );

    res.json({ ...item, clearance });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة تفاصيل الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/exit — إنشاء طلب نهاية خدمة
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/exit", requirePermission("hr:create"), async (req, res) => {
  try {
    await ensureExitTables();
    const scope = req.scope!;
    const b = req.body as any;

    if (!b.assignmentId && !b.employeeId) throw new ValidationError("يرجى اختيار الموظف", { field: "assignmentId" });
    if (!b.exitType) throw new ValidationError("نوع نهاية الخدمة مطلوب", { field: "exitType" });

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

    // التحقق من عدم وجود طلب سابق
    const [existing] = await rawQuery<any>(
      `SELECT id FROM hr_exit_requests
       WHERE "assignmentId" = $1 AND "companyId" = $2
         AND status NOT IN ('rejected','cancelled') AND "deletedAt" IS NULL`,
      [assignmentId, scope.companyId]
    );
    if (existing) {
      throw new ConflictError("يوجد طلب نهاية خدمة سابق لهذا الموظف");
    }

    const [emp] = await rawQuery<any>(
      `SELECT ea.salary, ea."employeeId", ea."branchId", ea."hireDate"
       FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2`,
      [assignmentId, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");

    // حساب مكافأة نهاية الخدمة (نظام العمل السعودي المادة 84)
    const hireDate = emp.hireDate ? new Date(emp.hireDate) : new Date();
    const now = new Date();
    const yearsOfService = (now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const salary = Number(emp.salary || 0);
    let gratuity = 0;
    if (yearsOfService <= 5) {
      gratuity = (salary / 2) * yearsOfService;
    } else {
      gratuity = (salary / 2) * 5 + salary * (yearsOfService - 5);
    }
    // الاستقالة: يخسم ثلث المكافأة (2-5 سنوات) أو لا يستحق (<2 سنة)
    if (b.exitType === "resignation") {
      if (yearsOfService < 2) gratuity = 0;
      else if (yearsOfService < 5) gratuity = gratuity / 3;
      else if (yearsOfService < 10) gratuity = (gratuity * 2) / 3;
      // 10+ سنوات: كامل المكافأة
    }
    gratuity = Math.round(gratuity * 100) / 100;

    // رصيد الإجازات
    const [lb] = await rawQuery<any>(
      `SELECT COALESCE(SUM(balance), 0) AS balance FROM leave_balances
       WHERE "assignmentId" = $1 AND "companyId" = $2`,
      [assignmentId, scope.companyId]
    ).catch(() => [{ balance: 0 }]);
    const leaveBalance = Number(lb?.balance ?? 0);
    const dailyRate = salary / 30;
    const leaveCompensation = Math.round(leaveBalance * dailyRate * 100) / 100;

    // خصم السلف المتبقية
    const [loans] = await rawQuery<any>(
      `SELECT COALESCE(SUM("remainingAmount"), 0) AS remaining
       FROM hr_employee_loans
       WHERE "assignmentId" = $1 AND "companyId" = $2 AND status IN ('active','approved') AND "deletedAt" IS NULL`,
      [assignmentId, scope.companyId]
    ).catch(() => [{ remaining: 0 }]);
    const loanDeductions = Number(loans?.remaining ?? 0);
    const otherDeductions = Number(b.otherDeductions || 0);

    const netSettlement = Math.round(
      (gratuity + leaveCompensation - loanDeductions - otherDeductions) * 100
    ) / 100;

    const exitNumber = await generateExitNumber(scope.companyId);

    const { insertId } = await rawExecute(
      `INSERT INTO hr_exit_requests
         ("companyId","branchId","assignmentId","employeeId","exitNumber","exitType",
          "lastWorkingDay","exitReason",status,"gratuityAmount","leaveBalance",
          "leaveCompensation","loanDeductions","otherDeductions","netSettlement",
          "settlementAmount","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12,$13,$14,$15,NOW())
       RETURNING id`,
      [
        scope.companyId, emp.branchId, assignmentId, emp.employeeId,
        exitNumber, b.exitType, b.lastWorkingDay || null,
        b.exitReason || null, gratuity, leaveBalance,
        leaveCompensation, loanDeductions, otherDeductions, netSettlement,
        netSettlement,
      ]
    );

    // إنشاء قائمة إخلاء الطرف
    for (const dept of DEFAULT_CLEARANCE_DEPARTMENTS) {
      await rawExecute(
        `INSERT INTO hr_exit_clearance
           ("exitRequestId","companyId",department,"departmentLabel",status)
         VALUES ($1,$2,$3,$4,'pending')`,
        [insertId, scope.companyId, dept.department, dept.departmentLabel]
      );
    }

    // ── سلسلة الموافقات — نهاية الخدمة تحتاج موافقة HR + المدير العام ──
    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      chainType: "exit",
      refType: "hr_exit_request",
      refId: insertId,
      amount: netSettlement,
    }).catch(() => null);

    // ── محرك سير العمل ──
    submitWorkflow({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      requestType: "exit",
      refTable: "hr_exit_requests",
      refId: insertId,
      title: `طلب نهاية خدمة ${exitNumber} — ${b.exitType === "resignation" ? "استقالة" : b.exitType === "termination" ? "فصل" : b.exitType}`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { exitNumber, exitType: b.exitType, netSettlement, gratuity },
    }).catch(console.error);

    // ── إشعار المدير (fallback) ──
    if (!approvalResult?.requiresApproval) {
      const managerId = await getManagerAssignmentId(scope.companyId, emp.branchId ?? scope.branchId).catch(() => null);
      if (managerId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerId,
          type: "exit_request", title: "طلب نهاية خدمة جديد",
          body: `طلب ${b.exitType === "resignation" ? "استقالة" : "نهاية خدمة"} — ${exitNumber}`,
          priority: "high", refType: "hr_exit_request", refId: insertId,
        }).catch(console.error);
      }
    }

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "exit.created", entity: "hr_exit_requests", entityId: insertId,
      reason: `طلب نهاية خدمة: ${exitNumber} — ${b.exitType}`,
    });

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.exit.created", entity: "hr_exit_requests", entityId: insertId,
    });

    res.status(201).json({
      id: insertId, exitNumber, netSettlement, gratuityAmount: gratuity,
      approval: approvalResult ?? { requiresApproval: false },
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء طلب نهاية الخدمة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/exit/:id/approve — اعتماد الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/exit/:id/approve", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    // نهاية الخدمة تتطلب مستوى أعلى: HR أو المدير العام أو المالك
    if (!["owner", "hr_manager", "general_manager"].includes(scope.role)) {
      throw new ForbiddenError(
        "صلاحية اعتماد نهاية الخدمة محصورة بمدير HR أو المدير العام أو المالك",
        {
          fix: "هذا الإجراء يتطلب صلاحية إدارية عليا.",
          meta: { yourRole: scope.role, requiredRoles: ["hr_manager", "general_manager", "owner"] },
        }
      );
    }

    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "pending") throw new ConflictError("لا يمكن اعتماد طلب بحالة: " + item.status);

    const [loanBalance] = await rawQuery<any>(
      `SELECT COALESCE(SUM(l.amount - COALESCE(
         (SELECT SUM(i.amount) FROM hr_loan_installments i WHERE i."loanId" = l.id AND i.status = 'paid'), 0
       )), 0) AS outstanding
       FROM hr_employee_loans l
       WHERE l."assignmentId" = $1 AND l.status = 'active'`,
      [item.assignmentId]
    );
    const outstandingLoans = Number(loanBalance?.outstanding ?? 0);
    if (outstandingLoans > 0) {
      await rawExecute(
        `UPDATE hr_exit_requests SET "outstandingLoans" = $1 WHERE id = $2`,
        [outstandingLoans, item.id]
      );
    }

    // ── معالجة خطوة الموافقة في السلسلة ──
    const chainResult = await processApprovalStep({
      companyId: scope.companyId,
      branchId: scope.branchId,
      refType: "hr_exit_request",
      refId: item.id,
      approved: true,
      decidedBy: scope.activeAssignmentId,
    }).catch(() => ({ status: "approved" as const, message: "" }));

    if (chainResult.status === "pending_next_step") {
      res.json({
        success: true, status: "pending_next_step",
        message: `تمت موافقتك — بانتظار موافقة ${chainResult.nextRole ?? "المرحلة التالية"}`,
      });
      return;
    }

    await rawExecute(
      `UPDATE hr_exit_requests
       SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $2`,
      [scope.userId, item.id]
    );

    createNotification({
      companyId: scope.companyId, assignmentId: item.assignmentId,
      type: "exit_approved", title: "تمت الموافقة على طلب نهاية الخدمة",
      body: `تمت الموافقة على طلب نهاية الخدمة ${item.exitNumber} — يرجى إكمال إخلاء الطرف`,
      priority: "high", refType: "hr_exit_request", refId: item.id,
    }).catch(console.error);

    res.json({ success: true, message: "تم اعتماد طلب نهاية الخدمة" });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/exit/clearance/:id — تحديث إخلاء الطرف (إتمام / رفض)
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/exit/clearance/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body as any;

    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_exit_clearance WHERE id = $1 AND "companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    if (!item) throw new NotFoundError("عنصر إخلاء الطرف غير موجود");

    const newStatus = b.status === "cleared" ? "cleared" : "issue";
    await rawExecute(
      `UPDATE hr_exit_clearance
       SET status = $1, "clearedBy" = $2, "clearedAt" = NOW(), notes = $3
       WHERE id = $4`,
      [newStatus, scope.userId, b.notes || null, item.id]
    );

    // التحقق: هل اكتمل إخلاء الطرف بالكامل؟
    const remaining = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM hr_exit_clearance
       WHERE "exitRequestId" = $1 AND "companyId" = $2 AND status = 'pending'`,
      [item.exitRequestId, scope.companyId]
    );
    if (Number(remaining[0]?.cnt) === 0) {
      await rawExecute(
        `UPDATE hr_exit_requests SET "clearanceCompleted" = TRUE, "updatedAt" = NOW() WHERE id = $1`,
        [item.exitRequestId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ في تحديث إخلاء الطرف");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/exit/:id/complete — إتمام نهاية الخدمة نهائياً
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/exit/:id/complete", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [item] = await rawQuery<any>(
      `SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "approved") throw new ConflictError("يجب اعتماد الطلب أولاً");
    if (!item.clearanceCompleted) throw new ConflictError("يجب إكمال إخلاء الطرف أولاً");

    await rawExecute(
      `UPDATE hr_exit_requests SET status = 'completed', "settlementPaid" = TRUE, "updatedAt" = NOW() WHERE id = $1`,
      [item.id]
    );

    // تعطيل التعيين
    await rawExecute(
      `UPDATE employee_assignments SET status = 'terminated', "endDate" = CURRENT_DATE, "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2`,
      [item.assignmentId, scope.companyId]
    ).catch(() => {});

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "exit.completed", entity: "hr_exit_requests", entityId: item.id,
      reason: `إتمام نهاية خدمة: ${item.exitNumber}`,
    });

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "hr.exit.completed", entity: "hr_exit_requests", entityId: item.id,
    });

    res.json({ success: true, message: "تم إتمام نهاية الخدمة وتعطيل التعيين" });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إتمام نهاية الخدمة");
  }
});

export default router;
