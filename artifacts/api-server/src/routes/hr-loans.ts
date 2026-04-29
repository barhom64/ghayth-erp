// ============================================================================
// hr-loans.ts
// مسارات سلف الموظفين — طلب، موافقة، جدولة أقساط، ربط بالرواتب
// Base path: /hr/loans
// ============================================================================

import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
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
  currentPeriod,
  roundTo2,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { generateSequentialNumber, nextPeriod as nextPeriodHelper, advancePeriod as advancePeriodHelper } from "../lib/hrHelpers.js";
import { HR_TABLES, NUMBER_PREFIXES, LOAN_STATUS } from "../lib/hrEnums.js";
import { logger } from "../lib/logger.js";

const router = Router();

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
  `).catch((e) => logger.error(e, "hr-loans background task failed"));

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
  `).catch((e) => logger.error(e, "hr-loans background task failed"));
}

// ─── رقم السلفة المتسلسل (يستخدم الأداة الموحّدة من hrHelpers) ──────────
async function generateLoanNumber(companyId: number): Promise<string> {
  return generateSequentialNumber(HR_TABLES.LOANS, companyId, NUMBER_PREFIXES.LOAN);
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createLoanSchema = z.object({
  assignmentId: z.coerce.number({ message: "يرجى اختيار الموظف" }),
  amount: z.coerce.number({ message: "المبلغ مطلوب" }).positive("المبلغ يجب أن يكون أكبر من صفر"),
  installmentCount: z.coerce.number({ message: "عدد الأقساط مطلوب" }).int().min(1, "عدد الأقساط يجب أن يكون 1 على الأقل"),
  loanType: z.string().optional(),
  reason: z.string().optional(),
  startDeductionPeriod: z.string().optional(),
});

const rejectLoanSchema = z.object({
  reason: z.string().optional(),
});

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
       ORDER BY l."createdAt" DESC
       LIMIT 500`,
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
// GET /hr/loans/my — سلف الموظف الحالي (Self-Service)
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/loans/my", requirePermission("hr:read"), async (req, res) => {
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
      [Number(req.params.id), scope.companyId]
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
    const parsed_createLoanSchema = createLoanSchema.safeParse(req.body);
    if (!parsed_createLoanSchema.success) throw new ValidationError(parsed_createLoanSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed_createLoanSchema.data;

    const amount = b.amount;
    const installmentCount = b.installmentCount;
    const installmentAmount = roundTo2(amount / installmentCount);

    // التحقق من عدم وجود سلفة نشطة
    const [existing] = await rawQuery<any>(
      `SELECT id FROM hr_employee_loans
       WHERE "assignmentId" = $1 AND "companyId" = $2
         AND status IN ('pending','approved','active') AND "deletedAt" IS NULL`,
      [b.assignmentId, scope.companyId]
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
      [b.assignmentId, scope.companyId]
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
        scope.companyId, emp.branchId, b.assignmentId, emp.employeeId,
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
    }).catch((e) => logger.error(e, "hr-loans background task failed"));

    // ── إشعار المدير (fallback إذا لم توجد سلسلة) ──
    if (!approvalResult?.requiresApproval) {
      const managerId = await getManagerAssignmentId(scope.companyId, emp.branchId ?? scope.branchId).catch(() => null);
      if (managerId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerId,
          type: "loan_request", title: "طلب سلفة جديد",
          body: `طلب سلفة بمبلغ ${amount.toLocaleString()} ريال — ${loanNumber}`,
          priority: "high", refType: "hr_employee_loan", refId: insertId,
        }).catch((e) => logger.error(e, "hr-loans background task failed"));
      }
    }

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "loan.created", entity: "hr_employee_loans", entityId: insertId,
      reason: `سلفة جديدة: ${loanNumber} بمبلغ ${amount}`,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.loan.created",
      entity: "hr_employee_loans",
      entityId: insertId,
      details: JSON.stringify({ loanNumber, amount, installmentCount, assignmentId: b.assignmentId }),
    }).catch((e) => logger.error(e, "hr-loans background task failed"));

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
    const { approved = true, reason, notes } = (req.body ?? {}) as { approved?: boolean; reason?: string; notes?: string };
    const scope = req.scope!;
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
      [Number(req.params.id), scope.companyId]
    );
    if (!loan) throw new NotFoundError("السلفة غير موجودة");
    if (loan.status !== "pending") throw new ConflictError("لا يمكن اعتماد سلفة بحالة: " + loan.status);

    // منع الموظف من اعتماد سلفته الخاصة
    if (loan.assignmentId === scope.activeAssignmentId) {
      throw new ForbiddenError("لا يمكنك اعتماد سلفتك الخاصة");
    }

    const rejectionReason = reason || notes;
    if (!approved) {
      const { affectedRows } = await rawExecute(
        `UPDATE hr_employee_loans SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending'`,
        [rejectionReason || null, loan.id, scope.companyId]
      );
      if (!affectedRows) throw new ConflictError("تم تحديث السلفة مسبقاً — أعد التحميل");
      processApprovalStep({
        companyId: scope.companyId, branchId: scope.branchId,
        refType: "hr_employee_loan", refId: loan.id,
        approved: false, decidedBy: scope.activeAssignmentId, reason: rejectionReason,
      }).catch((e) => logger.error(e, "hr-loans background task failed"));
      createNotification({
        companyId: scope.companyId, assignmentId: loan.assignmentId,
        type: "loan_rejected", title: "تم رفض طلب السلفة",
        body: `تم رفض السلفة ${loan.loanNumber}${rejectionReason ? " — السبب: " + rejectionReason : ""}`,
        priority: "normal", refType: "hr_employee_loan", refId: loan.id,
      }).catch((e) => logger.error(e, "hr-loans background task failed"));
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "hr.loan.rejected",
        entity: "hr_employee_loans",
        entityId: loan.id,
        details: JSON.stringify({ loanNumber: loan.loanNumber, reason: rejectionReason }),
      }).catch((e) => logger.error(e, "hr-loans background task failed"));
      res.json({ success: true, message: "تم رفض السلفة" });
      return;
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
    const { affectedRows } = await rawExecute(
      `UPDATE hr_employee_loans
       SET status = 'active', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $2 AND status = 'pending'`,
      [scope.userId, loan.id]
    );
    if (!affectedRows) throw new ConflictError("تم تحديث السلفة مسبقاً — أعد التحميل");

    // توليد جدول الأقساط
    let period = loan.startDeductionPeriod || nextPeriod();
    for (let i = 1; i <= loan.installmentCount; i++) {
      const isLast = i === loan.installmentCount;
      const amt = isLast
        ? roundTo2(Number(loan.amount) - Number(loan.installmentAmount) * (loan.installmentCount - 1))
        : Number(loan.installmentAmount);

      await rawExecute(
        `INSERT INTO hr_loan_installments
           ("loanId","companyId","assignmentId","installmentNumber",amount,period,status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
        [loan.id, scope.companyId, loan.assignmentId, i, amt, period]
      );
      period = advancePeriod(period);
    }

    const { hrEngine } = await import("../lib/engines/index.js");
    hrEngine.postLoanDisbursementGL(
      { companyId: scope.companyId, branchId: scope.branchId ?? 0, createdBy: scope.userId },
      { id: loan.id, employeeId: loan.employeeId, amount: Number(loan.amount) },
    ).catch((e: unknown) => logger.error(e, "Loan disbursement GL error:"));

    createNotification({
      companyId: scope.companyId, assignmentId: loan.assignmentId,
      type: "loan_approved", title: "تمت الموافقة على سلفتك",
      body: `تمت الموافقة على السلفة ${loan.loanNumber} بمبلغ ${Number(loan.amount).toLocaleString()} ريال — سيبدأ الخصم من فترة ${loan.startDeductionPeriod}`,
      priority: "high", refType: "hr_employee_loan", refId: loan.id,
    }).catch((e) => logger.error(e, "hr-loans background task failed"));

    await createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "loan.approved", entity: "hr_employee_loans", entityId: loan.id,
      reason: `اعتماد السلفة: ${loan.loanNumber}`,
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.loan.approved",
      entity: "hr_employee_loans",
      entityId: loan.id,
      details: JSON.stringify({ loanNumber: loan.loanNumber, amount: loan.amount, installmentCount: loan.installmentCount }),
    }).catch((e) => logger.error(e, "hr-loans background task failed"));

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

    const parsed_rejectLoanSchema = rejectLoanSchema.safeParse(req.body);
    if (!parsed_rejectLoanSchema.success) throw new ValidationError(parsed_rejectLoanSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed_rejectLoanSchema.data;
    const [loan] = await rawQuery<any>(
      `SELECT * FROM hr_employee_loans WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(req.params.id), scope.companyId]
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
    }).catch((e) => logger.error(e, "hr-loans background task failed"));

    await rawExecute(
      `UPDATE hr_employee_loans SET status = 'rejected', "rejectionReason" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3`,
      [b.reason || null, loan.id, scope.companyId]
    );

    createNotification({
      companyId: scope.companyId, assignmentId: loan.assignmentId,
      type: "loan_rejected", title: "تم رفض طلب السلفة",
      body: `تم رفض السلفة ${loan.loanNumber}${b.reason ? " — السبب: " + b.reason : ""}`,
      priority: "normal", refType: "hr_employee_loan", refId: loan.id,
    }).catch((e) => logger.error(e, "hr-loans background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.loan.rejected",
      entity: "hr_employee_loans",
      entityId: loan.id,
      details: JSON.stringify({ loanNumber: loan.loanNumber, reason: b.reason }),
    }).catch((e) => logger.error(e, "hr-loans background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "hr_employee_loans", entityId: Number(req.params.id),
      after: { status: "rejected", rejectionReason: b.reason || null, loanNumber: loan.loanNumber },
    }).catch((e) => logger.error(e, "hr-loans background task failed"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ في رفض السلفة");
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
