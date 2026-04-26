import { handleRouteError, ValidationError, NotFoundError, ForbiddenError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { z } from "zod";

const dataRequestSchema = z.object({
  requestType: z.enum(["access", "rectification", "erasure", "portability", "objection"]),
  notes: z.string().optional().nullable(),
  requesterName: z.string().optional().nullable(),
  requesterEmail: z.string().email().optional().nullable(),
});

const router = Router();

router.get("/privacy-notice", async (req, res) => {
  try {
    res.json({
      version: "1.0",
      lastUpdated: "2025-01-01",
      title: "إشعار الخصوصية — Privacy Notice",
      summary: "نلتزم بحماية بياناتك الشخصية وفق نظام حماية البيانات الشخصية (PDPL) الصادر بالمرسوم الملكي م/19",
      sections: [
        {
          title: "ما البيانات التي نجمعها",
          content: "نجمع البيانات اللازمة لتشغيل الخدمة: الاسم، البريد الإلكتروني، بيانات التوظيف، سجلات الحضور، والبيانات المالية المرتبطة بعملك."
        },
        {
          title: "الغرض من معالجة البيانات",
          content: "تُستخدم بياناتك لأغراض تشغيلية بحتة: إدارة الرواتب، تتبع الحضور، إصدار الفواتير، وإعداد التقارير المالية."
        },
        {
          title: "حقوقك",
          content: "يحق لك: الاطلاع على بياناتك، تصحيحها، طلب حذفها (ضمن القيود القانونية)، ونقلها. تواصل مع مسؤول حماية البيانات عبر /api/pdpl/data-request."
        },
        {
          title: "الاحتفاظ بالبيانات",
          content: "نحتفظ بالبيانات المالية 10 سنوات وفق متطلبات ZATCA، وسجلات الموظفين 10 سنوات وفق نظام العمل، وسجلات الحضور 5 سنوات."
        },
        {
          title: "الأمان",
          content: "نستخدم تشفير TLS، وتحديد الصلاحيات، وتسجيل العمليات، وإخفاء الهوية حيثما أمكن."
        }
      ]
    });
  } catch (err) {
    handleRouteError(err, res, "Privacy notice error:");
  }
});

router.get("/retention-policies", authMiddleware, async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM data_retention_policies
       WHERE ("companyId" IS NULL OR "companyId" = $1)
       ORDER BY "isDefault" DESC, "dataType" ASC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Retention policies error:");
  }
});

router.get("/employee-data-export/:employeeId", authMiddleware, async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = Number(req.params.employeeId);

    const isOwnData = scope.employeeId === employeeId;
    const isHROrAbove = ["hr_manager", "general_manager", "owner"].includes(scope.role);

    if (!isOwnData && !isHROrAbove) {
      throw new ForbiddenError("يمكنك فقط تصدير بياناتك الشخصية أو يجب أن تكون مسؤول موارد بشرية");
    }

    const [employee] = await rawQuery<any>(
      `SELECT e.id, e.name, e."nameEn", e."nationalId", e.phone, e.email, e."dateOfBirth",
              e.nationality, e.gender, e."photoUrl" AS "profileImageUrl"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
       WHERE e.id = $1 AND e."deletedAt" IS NULL`,
      [employeeId, scope.companyId]
    );

    if (!employee) {
      throw new NotFoundError("الموظف غير موجود");
    }

    const [assignments, attendanceSummary, leaveRequests] = await Promise.all([
      rawQuery<any>(
        `SELECT ea.id, ea.role, ea."jobTitle", ea.salary, ea.status, ea."startDate", ea."endDate",
                c.name AS "companyName", b.name AS "branchName"
         FROM employee_assignments ea
         JOIN companies c ON c.id = ea."companyId"
         JOIN branches b ON b.id = ea."branchId"
         WHERE ea."employeeId" = $1 AND ea."companyId" = $2`,
        [employeeId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT period, "presentDays", "lateDays", "totalLateMinutes", "totalDeduction", "overtimeMinutes"
         FROM employee_monthly_attendance
         WHERE "assignmentId" IN (
           SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2
         )
         ORDER BY period DESC LIMIT 12`,
        [employeeId, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT lr.id, lt.name AS "leaveType", lr."startDate", lr."endDate", lr.days, lr.status, lr."createdAt"
         FROM hr_leave_requests lr
         JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         WHERE lr."employeeId" = $1 AND lr."companyId" = $2
         ORDER BY lr."createdAt" DESC LIMIT 50`,
        [employeeId, scope.companyId]
      ),
    ]);

    await rawExecute(
      `INSERT INTO processing_activities_log ("companyId", "activityType", "dataCategories", "dataSubjects", purpose, "legalBasis", "performedBy")
       VALUES ($1, 'data_export_request', $2, $3, $4, $5, $6)`,
      [
        scope.companyId,
        JSON.stringify(["personal_data", "employment_data", "attendance_data", "leave_data"]),
        `Employee ID: ${employeeId}`,
        "Data subject access request under PDPL Article 4",
        "Subject Rights Request",
        scope.activeAssignmentId
      ]
    ).catch(console.error);

    res.json({
      exportedAt: new Date().toISOString(),
      requestedBy: scope.userId,
      dataSubject: { employeeId },
      personalData: employee,
      employmentData: assignments,
      attendanceSummary,
      leaveRequests,
      notice: "هذه البيانات صادرة استجابةً لطلب حق الاطلاع وفق نظام حماية البيانات الشخصية (PDPL)"
    });
  } catch (err) {
    handleRouteError(err, res, "Employee data export error:");
  }
});

router.post("/data-request", authMiddleware, requirePermission("admin:write"), async (req, res) => {
  try {
    const parsed_dataRequestSchema = dataRequestSchema.safeParse(req.body);
    if (!parsed_dataRequestSchema.success) throw new ValidationError(parsed_dataRequestSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_dataRequestSchema.data;
    const scope = req.scope!;
    const { requestType, notes, requesterName, requesterEmail } = body;

    const validTypes = ["access", "rectification", "erasure", "portability", "objection"];
    if (!requestType || !validTypes.includes(requestType)) {
      throw new ValidationError("نوع الطلب غير صحيح");
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const { insertId } = await rawExecute(
      `INSERT INTO data_access_requests ("companyId", "requestType", "requesterId", "requesterName", "requesterEmail", status, notes, "dueDate")
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
      [
        scope.companyId,
        requestType,
        scope.employeeId ?? null,
        requesterName ?? scope.userName,
        requesterEmail ?? null,
        notes ?? null,
        dueDate.toISOString().split("T")[0]
      ]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_data_request",
      entity: "data_access_requests", entityId: insertId,
      after: { requestType, requesterName: requesterName ?? scope.userName, dueDate: dueDate.toISOString().split("T")[0] },
    }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "pdpl.data_request.created", entity: "data_access_requests", entityId: insertId, details: JSON.stringify({ requestType, requesterName: requesterName ?? scope.userName }) }).catch(console.error);

    res.status(201).json({
      id: insertId,
      message: "تم استلام طلبك وسيتم الرد خلال 30 يوماً وفق متطلبات PDPL",
      requestType,
      dueDate: dueDate.toISOString().split("T")[0]
    });
  } catch (err) {
    handleRouteError(err, res, "Data request error:");
  }
});

router.get("/processing-log", authMiddleware, requireMinLevel(90), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT pal.*, ea.role AS "performedByRole", e.name AS "performedByName"
       FROM processing_activities_log pal
       LEFT JOIN employee_assignments ea ON ea.id = pal."performedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE pal."companyId" = $1
       ORDER BY pal."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Processing log error:");
  }
});

export default router;
