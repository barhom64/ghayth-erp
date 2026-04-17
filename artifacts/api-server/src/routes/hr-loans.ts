// ============================================================================
// hr-loans.ts
// مسارات سلف الموظفين — طلب، موافقة، جدولة أقساط، ربط بالرواتب
// Base path: /hr/loans
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
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { generateSequentialNumber, nextPeriod as nextPeriodHelper, currentPeriod, advancePeriod as advancePeriodHelper } from "../lib/hrHelpers.js";
import { HR_TABLES, NUMBER_PREFIXES, LOAN_STATUS } from "../lib/hrEnums.js";

const router = Router();
router.use(authMiddleware);

// ─── إنشاء جدول السلف (إذا لم يكن موجوداً) ─────────────────────────────────
async function ensureLoanTables(): Promise<void> {
  await rawExecute(`
    CREATE TABLE IF NOT EXISTS hr_employee_loans (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "branchId" INTEGER,
      "assignmentId" INTEGER NOT NULL,
      "employeeId" INTEGER NOT NULL,
      "loanNumber" VARCHAR(30) NOT NULL,
      "loanType" VARCHAR(30) DEFAULT 'salary_advance',
      amount NUMERIC(12,2) NOT NULL,
      "installmentCount" INTEGER NOT NULL DEFAULT 1,
      "installmentAmount" NUMERIC(12,2) NOT NULL,
      "paidAmount" NUMERIC(12,2) DEFAULT 0,
      "remainingAmount" NUMERIC(12,2) NOT NULL,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      "requestDate" DATE DEFAULT CURRENT_DATE,
      "approvedBy" INTEGER,
      "approvedAt" TIMESTAMPTZ,
      "startDeductionPeriod" VARCHAR(7),
      "rejectionReason" TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      "deletedAt" TIMESTAMPTZ
    )
  `).catch(() => {});

  await rawExecute(`
    CREATE TABLE IF NOT EXISTS hr_loan_installments (
      id SERIAL PRIMARY KEY,
      "loanId" INTEGER NOT NULL,
      "companyId" INTEGER NOT NULL,
      "assignmentId" INTEGER NOT NULL,
      "installmentNumber" INTEGER NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      period VARCHAR(7) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      "paidAt" TIMESTAMPTZ,
      "payrollLineId" INTEGER,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
}

// ─── رقم السلفة المتسلسل (يستخدم الأداة الموحّدة من hrHelpers) ──────────
async function generateLoanNumber(companyId: number): Promise<string> {
  return generateSequentialNumber(HR_TABLES.LOANS, companyId, NUMBER_PREFIXES.LOAN);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/loans — قائمة السلف
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/loans", requirePermission("hr:read"), async (req, res) => {
  try {
    await ensureLoanTables();
    const scope = req.scope!;
    const { status, assignmentId } = req.query as any;

    let where = `l."companyId" = $1 AND l."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    let idx = 2;

    if (status) {
      where += ` AND l.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (assignmentId) {
      where += ` AND l."assignmentId" = $${idx}`;
      params.push(Number(assignmentId));
      idx++;
    }

    const data = await rawQuery<any>(
      `SELECT l.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", b.name AS "branchName"
       FROM hr_employee_loans l
       JOIN employee_assignments ea ON ea.id = l."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ${where}
       ORDER BY l."createdAt" DESC`,
      params
    );

    // إحصائيات
    const [stats] = await rawQuery<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE status = 'active') AS active,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('approved','active')), 0) AS "totalAmount",
         COALESCE(SUM("paidAmount") FILTER (WHERE status IN ('approved','active','completed')), 0) AS "totalPaid",
         COALESCE(SUM("remainingAmount") FILTER (WHERE status IN ('approved','active')), 0) AS "totalRemaining"
       FROM hr_employee_loans
       WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );

    res.json({ data, stats: stats ?? {}, total: data.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة السلف");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/loans/:id — تفاصيل السلفة مع الأقساط
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/loans/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    await ensureLoanTables();
    const scope = req.scope!;
    const [loan] = await rawQuery<any>(
      `SELECT l.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, b.name AS "branchName"
       FROM hr_employee_loans l
       JOIN employee_assignments ea ON ea.id = l."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE l.id = $1 AND l."companyId" = $2 AND l."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!loan) throw new NotFoundError("السلفة غير موجودة");

    const installments = await rawQuery<any>(
      `SELECT * FROM hr_loan_installments
       WHERE "loanId" = $1 AND "companyId" = $2
       ORDER BY "installmentNumber" ASC`,
      [loan.id, scope.companyId]
    );

    res.json({ ...loan, installments });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة تفاصيل السلفة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/loans — طلب سلفة جديدة
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/loans", requirePermission("hr:create"), async (req, res) => {
  try {
    await ensureLoanTables();
    const scope = req.scope!;
    const b = req.body as any;

    if (!b.assignmentId && !b.employeeId) throw new ValidationError("يرجى اختيار الموظف", { field: "assignmentId" });
    if (!b.amount || Number(b.amount) <= 0) throw new ValidationError("المبلغ مطلوب", { field: "amount" });
    if (!b.installmentCount || Number(b.installmentCount) < 1) throw new ValidationError("عدد الأقساط مطلوب", { field: "installmentCount" });

    const amount = Number(b.amount);
    const installmentCount = Number(b.installmentCount);
    const installmentAmount = Math.round((amount / installmentCount) * 100) / 100;

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

    // التحقق من عدم وجود سلفة نشطة
    const [existing] = await rawQuery<any>(
      `SELECT id FROM hr_employee_loans
       WHERE "assignmentId" = $1 AND "companyId" = $2
         AND status IN ('pending','approved','active') AND "deletedAt" IS NULL`,
      [assignmentId, scope.companyId]
    );
    if (existing) {
      throw new ConflictError("يوجد سلفة نشطة بالفعل لهذا الموظف", {
        field: "assignmentId",
        fix: "يجب إتمام أو إلغاء السلفة الحالية أولاً",
      });
    }

    // التحقق من أن المبلغ لا يتجاوز 3 أضعاف الراتب
    const [emp] = await rawQuery<any>(
      `SELECT ea.salary, ea."employeeId", ea."branchId"
       FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2`,
      [assignmentId, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");
    const maxLoan = Number(emp.salary || 0) * 3;
    if (amount > maxLoan && maxLoan > 0) {
      throw new ValidationError(`الحد الأقصى للسلفة ${maxLoan.toLocaleString()} ريال (3 أضعاف الراتب)`, { field: "amount" });
    }

    const loanNumber = await generateLoanNumber(scope.companyId);
    const startPeriod = b.startDeductionPeriod || nextPeriod();

    const { insertId } = await rawExecute(
      `INSERT INTO hr_employee_loans
         ("companyId","branchId","assignmentId","employeeId","loanNumber","loanType",
          amount,"installmentCount","installmentAmount","remainingAmount",
          reason,status,"requestDate","startDeductionPeriod","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',CURRENT_DATE,$12,NOW())
       RETURNING id`,
      [
        scope.companyId, emp.branchId, assignmentId, emp.employeeId,
        loanNumber, b.loanType || "salary_advance",
        amount, installmentCount, installmentAmount, amount,
        b.reason || null, startPeriod,
      ]
    );

    // ── سلسلة الموافقات ──
    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      chainType: "loans",
      refType: "hr_employee_loan",
      refId: insertId,
      amount,
    }).catch(() => null);

    // ── محرك سير العمل ──
    submitWorkflow({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      requestType: "loan",
      refTable: "hr_employee_loans",
      refId: insertId,
      title: `طلب سلفة ${loanNumber} — ${amount.toLocaleString()} ريال`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { loanNumber, amount, installmentCount, loanType: b.loanType },
    }).catch(console.error);

    // ── إشعار المدير (fallback إذا لم توجد سلسلة) ──
    if (!approvalResult?.requiresApproval) {
      const managerId = await getManagerAssignmentId(scope.companyId, emp.branchId ?? scope.branchId).catch(() => null);
      if (managerId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerId,
          type: "loan_request", title: "طلب سلفة جديد",
          body: `طلب سلفة بمبلغ ${amount.toLocaleString()} ريال — ${loanNumber}`,
          priority: "high", refType: "hr_employee_loan", refId: insertId,
          actionUrl: `/hr/loans/${insertId}`,
        }).catch(console.error);
      }
    }

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "loan.created", entity: "hr_employee_loans", entityId: insertId,
      reason: `سلفة جديدة: ${loanNumber} بمبلغ ${amount}`,
    });

    res.status(201).json({
      id: insertId, loanNumber,
      approval: approvalResult ?? { requiresApproval: false },
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء السلفة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/loans/:id/approve — اعتماد السلفة + توليد جدول الأقساط
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/loans/:id/approve", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    // التحقق من الأدوار: المدير المباشر، مدير HR، المدير العام، المالك، المدير المالي
    if (!["owner", "hr_manager", "general_manager", "branch_manager", "finance_manager"].includes(scope.role)) {
      throw new ForbiddenError(
        "صلاحية اعتماد السلف محصورة بالمدير أو HR أو المدير المالي أو المالك",
        {
          fix: "اطلب من مديرك المباشر أو مدير الموارد البشرية تنفيذ الموافقة.",
          meta: { yourRole: scope.role },
        }
      );
    }

    const [loan] = await rawQuery<any>(
      `SELECT * FROM hr_employee_loans WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!loan) throw new NotFoundError("السلفة غير موجودة");
    if (loan.status !== "pending") throw new ConflictError("لا يمكن اعتماد سلفة بحالة: " + loan.status);

    // منع الموظف من اعتماد سلفته الخاصة
    if (loan.assignmentId === scope.activeAssignmentId) {
      throw new ForbiddenError("لا يمكنك اعتماد سلفتك الخاصة");
    }

    // ── معالجة خطوة الموافقة في سلسلة الموافقات ──
    const chainResult = await processApprovalStep({
      companyId: scope.companyId,
      branchId: scope.branchId,
      refType: "hr_employee_loan",
      refId: loan.id,
      approved: true,
      decidedBy: scope.activeAssignmentId,
      requesterId: loan.assignmentId,
    }).catch(() => ({ status: "approved" as const, message: "" }));

    // إذا بقيت خطوات موافقة إضافية
    if (chainResult.status === "pending_next_step") {
      res.json({
        success: true,
        status: "pending_next_step",
        message: `تمت موافقتك — بانتظار موافقة ${chainResult.nextRole ?? "المرحلة التالية"}`,
      });
      return;
    }

    // ── الموافقة النهائية: تفعيل السلفة ──
    await rawExecute(
      `UPDATE hr_employee_loans
       SET status = 'active', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $2`,
      [scope.userId, loan.id]
    );

    // توليد جدول الأقساط
    let period = loan.startDeductionPeriod || nextPeriod();
    for (let i = 1; i <= loan.installmentCount; i++) {
      const isLast = i === loan.installmentCount;
      const amt = isLast
        ? Math.round((Number(loan.amount) - Number(loan.installmentAmount) * (loan.installmentCount - 1)) * 100) / 100
        : Number(loan.installmentAmount);

      await rawExecute(
        `INSERT INTO hr_loan_installments
           ("loanId","companyId","assignmentId","installmentNumber",amount,period,status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
        [loan.id, scope.companyId, loan.assignmentId, i, amt, period]
      );
      period = advancePeriod(period);
    }

    // إشعار الموظف
    createNotification({
      companyId: scope.companyId, assignmentId: loan.assignmentId,
      type: "loan_approved", title: "تمت الموافقة على سلفتك",
      body: `تمت الموافقة على السلفة ${loan.loanNumber} بمبلغ ${Number(loan.amount).toLocaleString()} ريال — سيبدأ الخصم من فترة ${loan.startDeductionPeriod}`,
      priority: "high", refType: "hr_employee_loan", refId: loan.id,
      actionUrl: `/hr/loans/${loan.id}`,
    }).catch(console.error);

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "loan.approved", entity: "hr_employee_loans", entityId: loan.id,
      reason: `اعتماد السلفة: ${loan.loanNumber}`,
    });

    res.json({ success: true, message: "تم اعتماد السلفة وتوليد جدول الأقساط" });
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد السلفة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/loans/:id/reject — رفض السلفة
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/loans/:id/reject", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager", "branch_manager", "finance_manager"].includes(scope.role)) {
      throw new ForbiddenError("صلاحية رفض السلف محصورة بالمدير أو HR أو المدير المالي أو المالك");
    }

    const b = req.body as any;
    const [loan] = await rawQuery<any>(
      `SELECT * FROM hr_employee_loans WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!loan) throw new NotFoundError("السلفة غير موجودة");
    if (loan.status !== "pending") throw new ConflictError("لا يمكن رفض سلفة بحالة: " + loan.status);

    // ── تحديث سلسلة الموافقات ──
    processApprovalStep({
      companyId: scope.companyId,
      branchId: scope.branchId,
      refType: "hr_employee_loan",
      refId: loan.id,
      approved: false,
      decidedBy: scope.activeAssignmentId,
      reason: b.reason,
    }).catch(console.error);

    await rawExecute(
      `UPDATE hr_employee_loans SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [b.reason || null, loan.id]
    );

    createNotification({
      companyId: scope.companyId, assignmentId: loan.assignmentId,
      type: "loan_rejected", title: "تم رفض طلب السلفة",
      body: `تم رفض السلفة ${loan.loanNumber}${b.reason ? " — السبب: " + b.reason : ""}`,
      priority: "normal", refType: "hr_employee_loan", refId: loan.id,
      actionUrl: `/hr/loans/${loan.id}`,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ في رفض السلفة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/loans/my — سلف الموظف الحالي (Self-Service)
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/loans/my", async (req, res) => {
  try {
    await ensureLoanTables();
    const scope = req.scope!;
    const data = await rawQuery<any>(
      `SELECT l.*, e.name AS "employeeName"
       FROM hr_employee_loans l
       JOIN employees e ON e.id = l."employeeId"
       WHERE l."assignmentId" = $1 AND l."companyId" = $2 AND l."deletedAt" IS NULL
       ORDER BY l."createdAt" DESC`,
      [scope.activeAssignmentId, scope.companyId]
    );
    res.json({ data });
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة سلفك");
  }
});

// ─── أدوات الفترات (تستخدم hrHelpers الموحّد) ────────────────────────────

function nextPeriod(): string {
  return nextPeriodHelper(currentPeriod());
}

function advancePeriod(period: string): string {
  return advancePeriodHelper(period, 1);
}

export default router;
