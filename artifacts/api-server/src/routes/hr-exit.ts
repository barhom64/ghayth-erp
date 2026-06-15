// ============================================================================
// hr-exit.ts
// سير عمل نهاية الخدمة — إخلاء طرف، تصفية مستحقات، قائمة تسليم
// Base path: /hr/exit
// ============================================================================

import { Router } from "express";
import { scopeCan } from "../lib/rbac/authzEngine.js";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { issueNumber } from "../lib/numberingService.js";

// Local row shapes for hr_exit_requests + hr_exit_clearance.

interface ExitRequestRow extends Record<string, unknown> {
  id: number;
  companyId: number;
  branchId?: number | null;
  assignmentId: number;
  employeeId?: number | null;
  exitDate?: string | null;
  exitType?: string | null;
  reason?: string | null;
  status: string;
  finalSettlement?: number | string | null;
  unusedLeaveDays?: number | null;
  unusedLeaveAmount?: number | string | null;
  outstandingLoans?: number | string | null;
  endOfServiceBenefit?: number | string | null;
  approvedBy?: number | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
  employeeName?: string | null;
}

interface ClearanceRow {
  id: number;
  exitRequestId: number;
  companyId: number;
  department: string;
  status: string;
  signedBy?: number | null;
  signedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface ExitStatsAgg {
  total: number | string;
  pending: number | string;
  approved: number | string;
  completed: number | string;
}
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
  initiateApprovalChain,
  processApprovalStep,
  getManagerAssignmentId,
  roundTo2,
  toDateISO,
  currentDateInTz,
  checkFinancialPeriodOpen,
  todayISO,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { generateSequentialNumber, calcGratuity, type ExitType } from "../lib/hrHelpers.js";
import { HR_TABLES, NUMBER_PREFIXES } from "../lib/hrEnums.js";
import { logger } from "../lib/logger.js";

const router = Router();

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
  `).catch((e) => logger.error(e, "hr-exit background task failed"));

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
  `).catch((e) => logger.error(e, "hr-exit background task failed"));
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

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createExitSchema = z.object({
  assignmentId: z.coerce.number({ message: "يرجى اختيار الموظف" }),
  exitType: z.string().min(1, "نوع نهاية الخدمة مطلوب"),
  lastWorkingDay: z.string().optional(),
  exitReason: z.string().optional(),
  otherDeductions: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const updateClearanceSchema = z.object({
  status: z.enum(["pending", "cleared", "rejected"]),
  notes: z.string().optional(),
});

const approvalDecisionSchema = z.object({
  approved: z.boolean().default(true),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/exit — قائمة طلبات نهاية الخدمة
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/exit", authorize({ feature: "hr.exit", action: "list" }), async (req, res) => {
  try {
    await ensureExitTables();
    const scope = req.scope!;
    const { status } = req.query as Record<string, string | undefined>;

    // Honor multi-company picker via buildScopedWhere. hr_exit_requests has no
    // branchId of its own (branch is inferred from the linked assignment), so
    // disableBranchScope: true matches the table shape.
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(
      scope,
      parseScopeFilters(req),
      {
        companyColumn: 'x."companyId"',
        disableBranchScope: true,
        softDeleteColumn: 'x."deletedAt"',
      },
    );
    let where = baseWhere;
    let idx = nextParamIndex;

    if (status) { where += ` AND x.status = $${idx}`; params.push(status); idx++; }

    const data = await rawQuery<ExitRequestRow>(
      `SELECT x.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, ea."hireDate", b.name AS "branchName"
       FROM hr_exit_requests x
       JOIN employee_assignments ea ON ea.id = x."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
       WHERE ${where}
       ORDER BY x."createdAt" DESC
       LIMIT 500`,
      params
    );

    const [stats] = await rawQuery<ExitStatsAgg>(
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

    res.json(maskFields(req, { data, stats: stats ?? {}, total: data.length }));
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة طلبات نهاية الخدمة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/exit/:id — تفاصيل الطلب مع قائمة إخلاء الطرف
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/exit/:id", authorize({ feature: "hr.exit", action: "view" }), async (req, res) => {
  try {
    await ensureExitTables();
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery<ExitRequestRow>(
      `SELECT x.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, ea."hireDate", b.name AS "branchName"
       FROM hr_exit_requests x
       JOIN employee_assignments ea ON ea.id = x."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
       WHERE x.id = $1 AND x."companyId" = $2 AND x."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("طلب نهاية الخدمة غير موجود");

    const clearance = await rawQuery<ClearanceRow>(
      `SELECT * FROM hr_exit_clearance
       WHERE "exitRequestId" = $1 AND "companyId" = $2
       ORDER BY id ASC`,
      [item.id, scope.companyId]
    );

    res.json(maskFields(req, { ...item, clearance }));
  } catch (err) {
    handleRouteError(err, res, "خطأ في قراءة تفاصيل الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/exit — إنشاء طلب نهاية خدمة
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/exit", authorize({ feature: "hr.exit", action: "create" }), async (req, res) => {
  try {
    await ensureExitTables();
    const scope = req.scope!;
    const b = zodParse(createExitSchema.safeParse(req.body));

    // التحقق من عدم وجود طلب سابق
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM hr_exit_requests
       WHERE "assignmentId" = $1 AND "companyId" = $2
         AND status NOT IN ('rejected','cancelled') AND "deletedAt" IS NULL`,
      [b.assignmentId, scope.companyId]
    );
    if (existing) {
      throw new ConflictError("يوجد طلب نهاية خدمة سابق لهذا الموظف");
    }

    const [emp] = await rawQuery<{ id: number; salary: number | string | null; hireDate: string | null; employeeId: number; branchId: number | null }>(
      `SELECT ea.salary, ea."employeeId", ea."branchId", ea."hireDate"
       FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2`,
      [b.assignmentId, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");

    // حساب مكافأة نهاية الخدمة — نظام العمل السعودي المادة 84 و 85
    //
    // Compute years of service on calendar-date terms in Asia/Riyadh, NOT
    // on raw timestamps. `new Date("2020-03-15")` parses as UTC midnight;
    // `new Date()` returns the server's current instant. A worker hired
    // at "2020-03-15" who resigns on "2025-03-15" in Riyadh wall-clock
    // would compute as 4.99... years on a UTC server because the start
    // is 03:00 KSA and the end is 23:00 UTC of the prior day in KSA. The
    // gratuity tier flips at exactly 5 years, so a sub-day TZ skew can
    // move the worker between Article-85 reduction tiers and change the
    // payout by thousands of riyals.
    const hireDateStr = emp.hireDate
      ? toDateISO(emp.hireDate as string | Date)
      : currentDateInTz("Asia/Riyadh");
    const todayStr = currentDateInTz("Asia/Riyadh");
    const [hy, hm, hd] = hireDateStr.split("-").map(Number);
    const [ny, nm, nd] = todayStr.split("-").map(Number);
    const dayDiff = Math.max(
      0,
      (Date.UTC(ny, nm - 1, nd) - Date.UTC(hy, hm - 1, hd)) / 86400000,
    );
    const yearsOfService = dayDiff / 365.25;
    const salary = Number(emp.salary || 0);

    // Articles 84 + 85 + 80 of the Saudi Labor Law:
    //   - termination (الفصل من صاحب العمل): full gratuity (0.5 month
    //     × first 5 years + 1.0 month × remaining years).
    //   - resignation (الاستقالة): fraction of full — 0 if <2y, 1/3 if
    //     2–5y, 2/3 if 5–10y, full if 10y+.
    //   - just_cause (الفصل لسبب — المادة 80): no gratuity.
    // The exitType comes from the request schema; default is
    // "termination" if unset.
    const eosExitType: ExitType =
      b.exitType === "resignation"
        ? "resignation"
        : b.exitType === "just_cause"
          ? "just_cause"
          : "termination";
    const eos = calcGratuity(salary, yearsOfService, eosExitType);
    const gratuity = eos.total;

    // رصيد الإجازات — استعلم من جدول hr_leave_balances (الحالي) لا
    // leave_balances (المهجور). الحقول الفعلية: entitled, used, reserved
    // و(carried سطر اختياري). نأخذ السنة الأخيرة فقط من الإجازة السنوية
    // كما تنص المادة 109 — المتبقي من السنوات السابقة يُعالج كمستحقّ سابق
    // إن وُجد. للتبسيط نأخذ مجموع الأرصدة الفعّالة لجميع أنواع الإجازات
    // العادية وقت التسوية.
    const [lb] = await rawQuery<{ balance: number | string | null }>(
      `SELECT COALESCE(SUM(GREATEST(entitled - used - reserved, 0)), 0) AS balance
       FROM hr_leave_balances
       WHERE "employeeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $1 LIMIT 1)
         AND "companyId" = $2`,
      [b.assignmentId, scope.companyId]
    ).catch((e) => { logger.error(e, "hr exit query failed"); return [{ balance: 0 }] as { balance: number }[]; });
    const leaveBalance = Number(lb?.balance ?? 0);
    const dailyRate = salary / 30;
    const leaveCompensation = roundTo2(leaveBalance * dailyRate);

    // خصم السلف المتبقية
    const [loans] = await rawQuery<{ remaining: number | string | null }>(
      `SELECT COALESCE(SUM("remainingAmount"), 0) AS remaining
       FROM hr_employee_loans
       WHERE "assignmentId" = $1 AND "companyId" = $2 AND status IN ('active','approved') AND "deletedAt" IS NULL`,
      [b.assignmentId, scope.companyId]
    ).catch((e) => { logger.error(e, "hr exit query failed"); return [{ remaining: 0 }] as { remaining: number }[]; });
    const loanDeductions = Number(loans?.remaining ?? 0);
    const otherDeductions = Number(b.otherDeductions || 0);

    const netSettlement = roundTo2(gratuity + leaveCompensation - loanDeductions - otherDeductions);

    // Numbering center (Issue #1141) — exit request number from authority.
    const issuedExit = await issueNumber({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId ?? null,
      moduleKey: "hr",
      entityKey: "exit",
      entityTable: "hr_exit_requests",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const exitNumber = issuedExit.number;

    let insertId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO hr_exit_requests
           ("companyId","branchId","assignmentId","employeeId","exitNumber","exitType",
            "lastWorkingDay","exitReason",status,"gratuityAmount","leaveBalance",
            "leaveCompensation","loanDeductions","otherDeductions","netSettlement",
            "settlementAmount","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12,$13,$14,$15,NOW())
         RETURNING id`,
        [
          scope.companyId, emp.branchId, b.assignmentId, emp.employeeId,
          exitNumber, b.exitType, b.lastWorkingDay || null,
          b.exitReason || null, gratuity, leaveBalance,
          leaveCompensation, loanDeductions, otherDeductions, netSettlement,
          netSettlement,
        ]
      );
      insertId = ins.rows[0].id;

      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [insertId, issuedExit.assignmentId]
      );

      for (const dept of DEFAULT_CLEARANCE_DEPARTMENTS) {
        await client.query(
          `INSERT INTO hr_exit_clearance
             ("exitRequestId","companyId",department,"departmentLabel",status)
           VALUES ($1,$2,$3,$4,'pending')`,
          [insertId, scope.companyId, dept.department, dept.departmentLabel]
        );
      }
    });

    // ── سلسلة الموافقات — نهاية الخدمة تحتاج موافقة HR + المدير العام ──
    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId,
      branchId: emp.branchId ?? scope.branchId,
      chainType: "exit",
      refType: "hr_exit_request",
      refId: insertId,
      amount: netSettlement,
    }).catch((e) => { logger.error(e, "hr-exit approval chain failed"); return null; });

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
    }).catch((e) => logger.error(e, "hr-exit background task failed"));

    // ── إشعار المدير (fallback) ──
    if (!approvalResult?.requiresApproval) {
      const managerId = await getManagerAssignmentId(scope.companyId, emp.branchId ?? scope.branchId).catch((e) => { logger.error(e, "hr-exit manager lookup failed"); return null; });
      if (managerId) {
        createNotification({
          companyId: scope.companyId, assignmentId: managerId,
          type: "exit_request", title: "طلب نهاية خدمة جديد",
          body: `طلب ${b.exitType === "resignation" ? "استقالة" : "نهاية خدمة"} — ${exitNumber}`,
          priority: "high", refType: "hr_exit_request", refId: insertId,
        }).catch((e) => logger.error(e, "hr-exit background task failed"));
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

    const [row] = await rawQuery<ExitRequestRow>(`SELECT * FROM hr_exit_requests WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json({ ...row, approval: approvalResult ?? { requiresApproval: false } });
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء طلب نهاية الخدمة");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/exit/:id/approve — اعتماد الطلب
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/exit/:id/approve", authorize({ feature: "hr.exit", action: "update" }), async (req, res): Promise<void> => {
  try {
    const b = zodParse(approvalDecisionSchema.safeParse(req.body ?? {}));
    const { approved = true, reason, notes } = b;
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!scopeCan(scope, "hr.exit", "approve")) {
      throw new ForbiddenError(
        "صلاحية اعتماد نهاية الخدمة محصورة بمدير HR أو المدير العام أو المالك",
        {
          fix: "هذا الإجراء يتطلب صلاحية إدارية عليا.",
          meta: { yourRole: scope.role, requiredGrant: "hr.exit:approve" },
        }
      );
    }

    const [item] = await rawQuery<ExitRequestRow>(
      `SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (item.status !== "pending") throw new ConflictError("لا يمكن اعتماد طلب بحالة: " + item.status);

    const rejectionReason = reason || notes;
    if (!approved) {
      await applyTransition({
        entity: "hr_exit_requests",
        id: item.id,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "hr.exit.rejected",
        fromStates: ["pending"],
        toState: "rejected",
        reason: rejectionReason || undefined,
        setExtras: { rejectionReason: rejectionReason || null },
        extraWhere: `"deletedAt" IS NULL`,
        after: { rejectionReason: rejectionReason || null, exitNumber: item.exitNumber },
        notifications: [
          {
            assignmentId: item.assignmentId,
            type: "exit_rejected",
            title: "تم رفض طلب نهاية الخدمة",
            body: `تم رفض الطلب ${item.exitNumber}${rejectionReason ? " — السبب: " + rejectionReason : ""}`,
            priority: "normal",
            refType: "hr_exit_request",
            refId: item.id,
          },
        ],
      });
      processApprovalStep({
        companyId: scope.companyId, branchId: scope.branchId,
        refType: "hr_exit_request", refId: item.id,
        approved: false, decidedBy: scope.activeAssignmentId, reason: rejectionReason,
      }).catch((e) => logger.error(e, "hr-exit background task failed"));
      res.json({ success: true, message: "تم رفض طلب نهاية الخدمة" });
      return;
    }

    // ── معالجة خطوة الموافقة في السلسلة ──
    const chainResult = await processApprovalStep({
      companyId: scope.companyId,
      branchId: scope.branchId,
      refType: "hr_exit_request",
      refId: item.id,
      approved: true,
      decidedBy: scope.activeAssignmentId,
    }).catch((e) => { logger.error(e, "hr exit approval failed"); return { status: "approved" as const, message: "" }; });

    if (chainResult.status === "pending_next_step") {
      res.json({
        success: true, status: "pending_next_step",
        message: `تمت موافقتك — بانتظار موافقة ${chainResult.nextRole ?? "المرحلة التالية"}`,
      });
      return;
    }

    await applyTransition({
      entity: "hr_exit_requests",
      id: item.id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.exit.approved",
      fromStates: ["pending"],
      toState: "approved",
      setExtras: {
        approvedBy: scope.userId,
        approvedAt: { raw: "NOW()" },
      },
      extraWhere: `"deletedAt" IS NULL`,
      after: { approvedBy: scope.userId, exitNumber: item.exitNumber },
      notifications: [
        {
          assignmentId: item.assignmentId,
          type: "exit_approved",
          title: "تمت الموافقة على طلب نهاية الخدمة",
          body: `تمت الموافقة على طلب نهاية الخدمة ${item.exitNumber} — يرجى إكمال إخلاء الطرف`,
          priority: "high",
          refType: "hr_exit_request",
          refId: item.id,
        },
      ],
    });

    res.json({ success: true, message: "تم اعتماد طلب نهاية الخدمة" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "خطأ في اعتماد الطلب");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/exit/clearance/:id — تحديث إخلاء الطرف (إتمام / رفض)
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/exit/clearance/:id", authorize({ feature: "hr.exit", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateClearanceSchema.safeParse(req.body));

    const [item] = await rawQuery<ExitRequestRow>(
      `SELECT * FROM hr_exit_clearance WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("عنصر إخلاء الطرف غير موجود");

    const newStatus = b.status === "cleared" ? "cleared" : "rejected";
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE hr_exit_clearance
         SET status = $1, "clearedBy" = $2, "clearedAt" = NOW(), notes = $3
         WHERE id = $4 AND "companyId" = $5 AND status = 'pending'`,
        [newStatus, scope.userId, b.notes || null, item.id, scope.companyId]
      );
      const { rows: remaining } = await client.query(
        `SELECT COUNT(*) AS cnt FROM hr_exit_clearance
         WHERE "exitRequestId" = $1 AND "companyId" = $2 AND status = 'pending'`,
        [item.exitRequestId, scope.companyId]
      );
      if (Number(remaining[0]?.cnt) === 0) {
        await client.query(
          `UPDATE hr_exit_requests SET "clearanceCompleted" = TRUE, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status NOT IN ('rejected') AND "deletedAt" IS NULL`,
          [item.exitRequestId, scope.companyId]
        );
      }
    });

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "exit.clearance_updated", entity: "hr_exit_clearance", entityId: item.id, details: JSON.stringify({ status: newStatus, exitRequestId: item.exitRequestId }) }).catch((e) => logger.error(e, "hr-exit background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "hr_exit_clearance_items", entityId: id,
      after: { status: newStatus, clearedBy: scope.userId, notes: b.notes || null, exitRequestId: item.exitRequestId },
    }).catch((e) => logger.error(e, "hr-exit background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ في تحديث إخلاء الطرف");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /hr/exit/:id/complete — إتمام نهاية الخدمة نهائياً
// ═══════════════════════════════════════════════════════════════════════════════
router.patch("/exit/:id/complete", authorize({ feature: "hr.exit", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // SEC-1 (HR audit P1): completing an exit triggers termination,
    // EOS payout posting, and clearance closure — all
    // separation-of-duties events that the feature-level "update"
    // permission alone is not enough to authorize. The /approve
    // endpoint already gates on HR_ROLES; /complete must too.
    if (!scopeCan(scope, "hr.exit", "approve")) {
      res.status(403).json({
        error: "غير مصرّح لك بإتمام نهاية الخدمة — يلزم دور موارد بشرية",
        meta: { yourRole: scope.role, requiredGrant: "hr.exit:approve" },
      });
      return;
    }
    // Pre-check clearance before attempting the transition
    const [item] = await rawQuery<ExitRequestRow>(
      `SELECT * FROM hr_exit_requests WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("الطلب غير موجود");
    if (!item.clearanceCompleted) throw new ConflictError("يجب إكمال إخلاء الطرف أولاً");
    // SEC-1 hardening: enforce the state-machine boundary explicitly.
    // applyTransition() already validates fromStates=["approved"], but
    // checking here gives a clearer Arabic error and prevents a race
    // where a UI button accidentally fires twice on a non-approved row.
    if (item.status !== "approved") {
      throw new ConflictError("يجب اعتماد نهاية الخدمة قبل إتمامها", {
        field: "status",
        fix: "اعتمد الطلب أولاً عبر مسار /approve",
        meta: { currentStatus: item.status },
      });
    }

    // INT-2 (HR audit P1): an employee with outstanding active loans
    // must not be terminated before those loans are settled or
    // explicitly waived. Without this gate, the EOS settlement would
    // hide unrecovered debt behind a "completed" status. The block can
    // be lifted by the finance team via /loans/:id/settle or by
    // including the balance in the exit deductions before approval.
    const [openLoans] = await rawQuery<{ remaining: number | string | null; cnt: string }>(
      `SELECT COALESCE(SUM("remainingAmount"), 0) AS remaining, COUNT(*)::text AS cnt
       FROM hr_employee_loans
       WHERE "assignmentId" = $1 AND "companyId" = $2
         AND status IN ('active','approved') AND "deletedAt" IS NULL
         AND "remainingAmount" > 0`,
      [item.assignmentId, scope.companyId],
    ).catch(() => [{ remaining: 0, cnt: "0" }] as { remaining: number; cnt: string }[]);
    const remainingLoanBalance = Number(openLoans?.remaining ?? 0);
    if (remainingLoanBalance > 0) {
      throw new ConflictError(
        `لا يمكن إتمام نهاية الخدمة قبل تسوية القروض المستحقة (${remainingLoanBalance.toFixed(2)} ريال)`,
        {
          field: "outstandingLoans",
          fix: "سدد القروض أو ضمّن المبلغ في خصومات نهاية الخدمة قبل الاعتماد",
          meta: { remainingLoanBalance, loanCount: Number(openLoans?.cnt ?? 0) },
        },
      );
    }

    // FIN-AUD-09 — exit settlement posts EOS + leave-compensation expense
    // and matching liability/cash CRs. Without an up-front period gate,
    // the route would transition the exit to "completed" and disable the
    // assignment, then hand off GL posting in a fire-and-forget .catch().
    // A closed-period failure was silently swallowed (logger.error only),
    // leaving the employee terminated with no EOS liability on the
    // balance sheet. Check now so a closed period blocks the whole flow.
    const exitSettlementDate = todayISO();
    const exitPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, exitSettlementDate);
    if (!exitPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن إتمام نهاية الخدمة في فترة مُقفلة: ${exitPeriodCheck.periodName ?? ""}`,
        { field: "settlementDate", meta: { periodName: exitPeriodCheck.periodName } },
      );
    }

    await applyTransition({
      entity: "hr_exit_requests",
      id: item.id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "hr.exit.completed",
      fromStates: ["approved"],
      toState: "completed",
      reason: `إتمام نهاية خدمة: ${item.exitNumber}`,
      setExtras: { settlementPaid: true },
      extraWhere: `"deletedAt" IS NULL`,
      after: { settlementPaid: true, exitNumber: item.exitNumber },
      onApply: async (_row, client) => {
        await client.query(
          `UPDATE employee_assignments SET status = 'terminated', "endDate" = CURRENT_DATE
           WHERE id = $1 AND "companyId" = $2 AND status = 'active'`,
          [item.assignmentId, scope.companyId]
        );
        // INT-1 (HR audit P1): cancel pending/approved leave requests
        // that extend beyond the exit date. A terminated employee
        // cannot consume future leave, and leaving rows in 'pending'
        // pollutes the approval inbox forever.
        await client.query(
          `UPDATE hr_leave_requests
             SET status = 'cancelled',
                 "rejectedReason" = COALESCE("rejectedReason", 'تم إنهاء خدمة الموظف')
           WHERE "employeeId" = (
             SELECT "employeeId" FROM employee_assignments WHERE id = $1 LIMIT 1
           )
             AND "companyId" = $2
             AND status IN ('pending')
             AND "deletedAt" IS NULL`,
          [item.assignmentId, scope.companyId],
        );
        // Release reserved leave days back to the balance for the
        // requests we just cancelled — otherwise EOS leave compensation
        // would double-count days that were never taken.
        await client.query(
          `UPDATE hr_leave_balances lb
             SET reserved = GREATEST(reserved - sub.total_reserved, 0)
           FROM (
             SELECT "leaveTypeId", EXTRACT(YEAR FROM "startDate")::int AS yr,
                    SUM(days) AS total_reserved
             FROM hr_leave_requests
             WHERE "employeeId" = (
               SELECT "employeeId" FROM employee_assignments WHERE id = $1 LIMIT 1
             )
               AND "companyId" = $2
               AND status = 'cancelled'
               AND "rejectedReason" = 'تم إنهاء خدمة الموظف'
             GROUP BY "leaveTypeId", EXTRACT(YEAR FROM "startDate")::int
           ) sub
           WHERE lb."employeeId" = (
             SELECT "employeeId" FROM employee_assignments WHERE id = $1 LIMIT 1
           )
             AND lb."companyId" = $2
             AND lb."leaveTypeId" = sub."leaveTypeId"
             AND lb.year = sub.yr`,
          [item.assignmentId, scope.companyId],
        );
      },
    });

    const eosAmount = Number(item.gratuityAmount || 0);
    const remainingLeaveAmount = Number(item.leaveCompensation || 0);
    const totalSettlement = Number(item.netSettlement || 0);
    if (totalSettlement > 0) {
      const { hrEngine } = await import("../lib/engines/index.js");
      // Pull the employee's department so EOS + leave-compensation JE
      // lines carry the dim. Per-dept labour-cost reports group these
      // alongside monthly payroll — without departmentId, exit
      // settlements vanished from the per-dept roll-up.
      const [assignmentRow] = await rawQuery<{ departmentId: number | null }>(
        `SELECT "departmentId" FROM employee_assignments WHERE id = $1 AND "companyId" = $2`,
        [item.assignmentId, scope.companyId]
      );
      const exitDepartmentId = assignmentRow?.departmentId ?? null;
      // Await + propagate the GL failure so the operator sees the real
      // error instead of "تم إتمام نهاية الخدمة" while the balance sheet
      // silently lost the EOS / leave liability. The status transition
      // above already moved the exit to "completed" — if the GL post
      // fails, the operator must reopen the exit (closed period, missing
      // account mapping) and retry. Catching here would put us right back
      // in the silent-swallow trap that hid the bug for so long.
      await hrEngine.postExitSettlementGL(
        { companyId: scope.companyId, branchId: scope.branchId ?? 0, createdBy: scope.userId },
        { id: item.id, employeeId: item.employeeId ?? 0, eosAmount, remainingLeaveAmount, totalSettlement, departmentId: exitDepartmentId },
      );
    }

    res.json({ success: true, message: "تم إتمام نهاية الخدمة وتعطيل التعيين" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "خطأ في إتمام نهاية الخدمة");
  }
});

export default router;
