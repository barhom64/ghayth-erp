import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  getManagerAssignmentId,
  todayISO,
  currentYear,
} from "../lib/businessHelpers.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { hashPassword } from "../lib/auth.js";
import { registerObligation, cancelObligation } from "../lib/obligationsEngine.js";
import { z } from "zod";

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  empNumber: z.string().optional().nullable(),
  nationalId: z.string().min(1),
  gender: z.string().optional().nullable(),
  nationality: z.string().min(1),
  dateOfBirth: z.string().optional().nullable(),
  jobTitle: z.string().optional(),
  role: z.string().optional(),
  salary: z.coerce.number().optional(),
  branchId: z.coerce.number().optional().nullable(),
  companyId: z.coerce.number().optional().nullable(),
  departmentId: z.coerce.number().optional().nullable(),
  department: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  contractType: z.string().optional(),
  probationDays: z.coerce.number().optional(),
  managerId: z.coerce.number().optional().nullable(),
  iqamaNumber: z.string().optional().nullable(),
  iqamaExpiry: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  passportExpiry: z.string().optional().nullable(),
  borderNumber: z.string().optional().nullable(),
  visaNumber: z.string().optional().nullable(),
  visaType: z.string().optional().nullable(),
  visaExpiry: z.string().optional().nullable(),
  sponsorNumber: z.string().optional().nullable(),
  workPermitNumber: z.string().optional().nullable(),
  workPermitExpiry: z.string().optional().nullable(),
  iqamaStatus: z.string().optional().nullable(),
  jobTitleId: z.coerce.number().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  attachments: z.any().optional(),
});

const patchEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  jobTitleId: z.coerce.number().optional().nullable(),
  role: z.string().optional().nullable(),
  salary: z.coerce.number().optional().nullable(),
  branchId: z.coerce.number().optional().nullable(),
  departmentId: z.coerce.number().optional().nullable(),
  status: z.string().optional().nullable(),
  managerId: z.coerce.number().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  iqamaNumber: z.string().optional().nullable(),
  iqamaExpiry: z.string().optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  passportExpiry: z.string().optional().nullable(),
  borderNumber: z.string().optional().nullable(),
  visaNumber: z.string().optional().nullable(),
  visaType: z.string().optional().nullable(),
  visaExpiry: z.string().optional().nullable(),
  sponsorNumber: z.string().optional().nullable(),
  workPermitNumber: z.string().optional().nullable(),
  workPermitExpiry: z.string().optional().nullable(),
  iqamaStatus: z.string().optional().nullable(),
});

const patchOnboardingTaskSchema = z.object({
  status: z.string().min(1),
});

const seedObligationsSchema = z.object({}).optional();

// Register document expiry obligations for an employee.
// Called on create/update — idempotent via dedupeKey.
async function registerEmployeeExpiryObligations(
  companyId: number,
  branchId: number | null,
  empId: number,
  empName: string,
  docs: {
    iqamaExpiry?: string | null;
    passportExpiry?: string | null;
    workPermitExpiry?: string | null;
    visaExpiry?: string | null;
  }
): Promise<void> {
  const entries: Array<{ field: keyof typeof docs; label: string; code: string }> = [
    { field: "iqamaExpiry", label: "إقامة", code: "iqama" },
    { field: "passportExpiry", label: "جواز سفر", code: "passport" },
    { field: "workPermitExpiry", label: "رخصة عمل", code: "work_permit" },
    { field: "visaExpiry", label: "تأشيرة", code: "visa" },
  ];
  for (const { field, label, code } of entries) {
    const dueStr = docs[field];
    if (!dueStr) continue;
    const dueDate = new Date(dueStr);
    if (isNaN(dueDate.getTime())) continue;
    await registerObligation({
      companyId,
      branchId,
      entityType: "employee",
      entityId: empId,
      obligationType: "document_expiry",
      title: `انتهاء ${label} — ${empName}`,
      dueAt: dueDate.toISOString(),
      metadata: { docType: code, expiryDate: dueStr },
      dedupeKey: `employee-${empId}-${code}-${dueStr}`,
      escalationSteps: [
        { hoursAfterDue: 0, notifyRole: "hr_manager" },
        { hoursAfterDue: 72, notifyRole: "general_manager" },
      ],
    }).catch((e) => console.error(`Failed to register ${code} obligation for emp ${empId}:`, e));
  }
}

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search = "", page = "1", limit: lim = "20" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const filters = parseScopeFilters(req);
    if (search) filters.search = String(search);
    filters.searchColumns = ['e.name', 'e.email', 'e."empNumber"'];

    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'ea."companyId"',
      branchColumn: 'ea."branchId"',
      extraConditions: [`ea.status = 'active'`],
      enforceBranchScope: true,
    });

    let paramIdx = nextParamIndex;
    let where = baseWhere;

    if (!scope.isOwner && scope.role === "employee" && scope.employeeId) {
      where += ` AND e.id = $${paramIdx}`;
      params.push(scope.employeeId);
      paramIdx++;
    }

    params.push(Number(lim));
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const employees = await rawQuery<any>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status,
              ea.id AS "activeAssignmentId",
              e."iqamaNumber", e."iqamaExpiry", e."iqamaStatus",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", ea."jobTitleId",
              ea.role, ea.salary, ea."branchId",
              b.name AS "branchName",
              (SELECT COUNT(*) FROM gov_integration_links gl WHERE gl."entityType" = 'employee' AND gl."entityId" = e.id AND gl."companyId" = ea."companyId")::int AS "govLinkCount"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
       LEFT JOIN branches b ON b.id = ea."branchId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       WHERE ${where} AND e."deletedAt" IS NULL
       ORDER BY e.name ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
       WHERE ${where} AND e."deletedAt" IS NULL`,
      countParams
    );

    res.json({ data: employees, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "List employees error:");
  }
});

router.post("/", requirePermission("hr:create"), async (req, res) => {
  try {
    const parsed_createEmployeeSchema = createEmployeeSchema.safeParse(req.body);
    if (!parsed_createEmployeeSchema.success) throw new ValidationError(parsed_createEmployeeSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createEmployeeSchema.data;
    const scope = req.scope!;
    const {
      name,
      phone,
      email,
      empNumber,
      nationalId,
      gender,
      nationality,
      dateOfBirth,
      jobTitle = "موظف",
      role = "employee",
      salary = 0,
      branchId,
      companyId: bodyCompanyId,
      departmentId,
      department,
      hireDate,
      contractType = "full_time",
      probationDays = 90,
      managerId,
      iqamaNumber, iqamaExpiry, passportNumber, passportExpiry,
      borderNumber, visaNumber, visaType, visaExpiry,
      sponsorNumber, workPermitNumber, workPermitExpiry, iqamaStatus,
      bankName, bankAccount, iban, emergencyContact, emergencyPhone,
    } = body as any;
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;

    // Step 1 audit — typed ValidationError on every required field so the
    // frontend's useApiMutation.onFieldError highlights the exact input
    // that's missing instead of showing a generic toast.
    if (!name) {
      throw new ValidationError("لا يمكن إنشاء موظف بدون اسم", {
        field: "name",
        fix: "أدخل الاسم الكامل للموظف",
      });
    }
    if (!nationalId) {
      throw new ValidationError("لا يمكن إنشاء موظف بدون رقم هوية", {
        field: "nationalId",
        fix: "أدخل رقم الهوية الوطنية أو رقم الإقامة",
      });
    }
    if (!nationality) {
      throw new ValidationError("لا يمكن إنشاء موظف بدون جنسية", {
        field: "nationality",
        fix: "حدد جنسية الموظف",
      });
    }
    if (!phone) {
      throw new ValidationError("رقم الجوال مطلوب", {
        field: "phone",
        fix: "أدخل رقم جوال الموظف",
      });
    }
    // managerId is optional — the first employee (owner/CEO) has no manager,
    // and HR may onboard staff before the reporting line is finalized. When
    // provided, we still FK-check it below before the insert.
    if (!department && !departmentId) {
      throw new ValidationError("القسم مطلوب", {
        field: "department",
        fix: "حدد القسم الذي ينتمي إليه الموظف",
      });
    }
    if (!jobTitle || jobTitle === "موظف") {
      throw new ValidationError("المسمى الوظيفي مطلوب", {
        field: "jobTitle",
        fix: "حدد المسمى الوظيفي للموظف",
      });
    }
    if (!contractType) {
      throw new ValidationError("نوع العقد مطلوب", {
        field: "contractType",
        fix: "حدد نوع العقد للموظف",
      });
    }
    if (salary !== undefined && salary !== null && Number(salary) <= 0) {
      throw new ValidationError("الراتب يجب أن يكون أكبر من صفر", {
        field: "salary",
        fix: "أدخل راتباً موجباً أكبر من صفر",
      });
    }

    const targetBranchId = branchId ?? scope.branchId;
    const effectiveHireDate = hireDate || todayISO();

    // Step 1 audit — resolve department explicitly. If the caller passed a
    // `department` string that doesn't exist, we used to silently insert
    // departmentId=null; now we surface it as a validation error with
    // field="department" so the form can highlight the input.
    let resolvedDepartmentId = departmentId ?? null;
    if (!resolvedDepartmentId && department) {
      const deptRows = await rawQuery<{ id: number }>(
        `SELECT id FROM departments WHERE name = $1 AND "companyId" = $2 LIMIT 1`,
        [department, effectiveCompanyId]
      );
      if (deptRows.length > 0) {
        resolvedDepartmentId = deptRows[0]!.id;
      } else {
        throw new ValidationError(`القسم "${department}" غير موجود`, {
          field: "department",
          fix: "اختر قسماً من القائمة أو أنشئ القسم أولاً من الإعدادات.",
        });
      }
    }

    // Step 1 audit — pre-check the manager exists. Without this the insert
    // below would fail deep inside withTransaction with a 23503 FK error
    // whose detail string doesn't always carry "managerId". By rejecting
    // early we give the caller a clean field-tagged error.
    if (managerId) {
      const mgrRows = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(managerId)]
      );
      if (mgrRows.length === 0) {
        throw new ValidationError(`المدير رقم ${managerId} غير موجود`, {
          field: "managerId",
          fix: "اختر مديراً من قائمة الموظفين الحاليين.",
        });
      }
    }

    if (email) {
      const emailRows = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE email = $1 AND "deletedAt" IS NULL LIMIT 1`,
        [email]
      );
      if (emailRows.length > 0) {
        throw new ConflictError("البريد الإلكتروني مستخدم مسبقاً", {
          field: "email",
          fix: "استخدم بريداً إلكترونياً آخر أو راجع بيانات الموظف الحالي.",
        });
      }
    }

    if (nationalId) {
      const nidRows = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE "nationalId" = $1 AND "deletedAt" IS NULL LIMIT 1`,
        [nationalId]
      );
      if (nidRows.length > 0) {
        throw new ConflictError("الرقم مرتبط بموظف آخر", {
          field: "nationalId",
          fix: "تحقق من رقم الهوية أو أدخل رقماً مختلفاً.",
        });
      }
    }

    const result = await withTransaction(async (client) => {
      // ── Step 1: Auto-generate employee number (EMP-YYYY-NNN) ──
      let finalEmpNumber = empNumber;
      if (!finalEmpNumber) {
        const seqRes = await client.query(`SELECT nextval('employee_number_seq') AS seq`);
        const seq = Number(seqRes.rows[0].seq);
        const yearStr = currentYear().toString();
        finalEmpNumber = `EMP-${yearStr}-${String(seq).padStart(3, "0")}`;
      }

      // ── Step 2: Create the employee record ──
      const empRes = await client.query(
        `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", gender, nationality, "dateOfBirth", status,
         "iqamaNumber","iqamaExpiry","passportNumber","passportExpiry",
         "borderNumber","visaNumber","visaType","visaExpiry",
         "sponsorNumber","workPermitNumber","workPermitExpiry","iqamaStatus",
         "bankName","bankAccount",iban,"emergencyContact","emergencyPhone",attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active',
         $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26)
         RETURNING id`,
        [name, phone || null, email || null, finalEmpNumber, nationalId || null, gender || null, nationality || null, dateOfBirth || null,
         iqamaNumber || null, iqamaExpiry || null, passportNumber || null, passportExpiry || null,
         borderNumber || null, visaNumber || null, visaType || null, visaExpiry || null,
         sponsorNumber || null, workPermitNumber || null, workPermitExpiry || null, iqamaStatus || 'active',
         bankName || null, bankAccount || null, iban || null, emergencyContact || null, emergencyPhone || null,
         (req.body as any).attachments ? JSON.stringify((req.body as any).attachments) : null]
      );
      const empId = empRes.rows[0].id;

      // ── Step 3: Create first assignment ──
      let resolvedJobTitleId = req.body.jobTitleId ?? null;
      if (!resolvedJobTitleId && jobTitle && jobTitle !== "موظف") {
        const jtRes = await client.query(
          `SELECT id FROM job_titles WHERE name = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
          [jobTitle, effectiveCompanyId]
        );
        if (jtRes.rows.length > 0) resolvedJobTitleId = jtRes.rows[0].id;
      }

      const assignRes = await client.query(
        `INSERT INTO employee_assignments ("employeeId","companyId","branchId","departmentId","jobTitle","jobTitleId",role,salary,"hireDate","isPrimary",status,"managerId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'active',$10)
         RETURNING id`,
        [empId, effectiveCompanyId, targetBranchId, resolvedDepartmentId, jobTitle, resolvedJobTitleId, role, Number(salary), effectiveHireDate, managerId ? Number(managerId) : null]
      );
      const assignmentId = assignRes.rows[0].id;

      // ── Step 4: Initialize leave balances (10 types) ──
      const leaveTypesRes = await client.query(
        `SELECT id, "annualDays" FROM hr_leave_types WHERE "companyId" = $1`,
        [effectiveCompanyId]
      );
      const year = currentYear();
      if (leaveTypesRes.rows.length > 0) {
        const valuesSql: string[] = [];
        const params: any[] = [];
        for (const lt of leaveTypesRes.rows) {
          const base = params.length;
          valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},0,0)`);
          params.push(effectiveCompanyId, empId, assignmentId, lt.id, year, Number(lt.annualDays ?? 21));
        }
        await client.query(
          `INSERT INTO hr_leave_balances ("companyId","employeeId","assignmentId","leaveTypeId",year,entitled,used,reserved)
           VALUES ${valuesSql.join(",")}
           ON CONFLICT DO NOTHING`,
          params
        );
      }

      // ── Step 5: Assign default shift and attendance policy ──
      const defaultShiftRes = await client.query(
        `SELECT id FROM shifts WHERE "companyId" = $1 AND "isDefault" = true AND status = 'active' LIMIT 1`,
        [effectiveCompanyId]
      );
      if (defaultShiftRes.rows.length > 0) {
        const shiftId = defaultShiftRes.rows[0].id;
        await client.query(
          `INSERT INTO employee_shift_assignments ("assignmentId","shiftId","startDate")
           VALUES ($1,$2,$3)`,
          [assignmentId, shiftId, effectiveHireDate]
        );
      }
      const existingPolicy = await client.query(
        `SELECT id FROM attendance_policies WHERE "companyId" = $1 LIMIT 1`,
        [scope.companyId]
      );
      if (existingPolicy.rows.length === 0) {
        await client.query(
          `INSERT INTO attendance_policies ("companyId","lateThresholdMinutes","gpsRadiusMeters")
           VALUES ($1, 15, 200)`,
          [scope.companyId]
        );
      }

      // ── Step 6: Create employment contract + probation period ──
      const probEnd = new Date(effectiveHireDate);
      probEnd.setDate(probEnd.getDate() + Number(probationDays));
      await client.query(
        `INSERT INTO employee_contracts ("companyId","employeeId","assignmentId","contractType","startDate","probationEndDate","probationStatus",status)
         VALUES ($1,$2,$3,$4,$5,$6,'active','active')`,
        [scope.companyId, empId, assignmentId, contractType, effectiveHireDate, probEnd.toISOString().split("T")[0]]
      );

      // ── Step 7: Create 4 onboarding tasks ──
      const onboardingTasks = [
        "تسليم أجهزة IT وإعداد الحسابات",
        "توقيع عقد العمل والتأمينات",
        "تعريف المدير المباشر والفريق",
        "دورة التعريف بالشركة وسياساتها",
      ];
      const dueDateOnboarding = new Date();
      dueDateOnboarding.setDate(dueDateOnboarding.getDate() + 7);
      for (const taskTitle of onboardingTasks) {
        await client.query(
          `INSERT INTO onboarding_tasks ("companyId","employeeId","assignmentId",title,"dueDate",status)
           VALUES ($1,$2,$3,$4,$5,'pending')`,
          [scope.companyId, empId, assignmentId, taskTitle, dueDateOnboarding.toISOString().split("T")[0]]
        );
      }

      // ── Step 8: Auto-create user account ──
      let userId: number | null = null;
      let tempPassword: string | null = null;
      if (email) {
        const existingUser = await client.query(`SELECT id FROM users WHERE email=$1`, [email]);
        if (existingUser.rows.length === 0) {
          tempPassword = Math.random().toString(36).slice(-8) + "A1!";
          const hashedPw = await hashPassword(tempPassword);
          const userRes = await client.query(
            `INSERT INTO users (email, "passwordHash", role, "employeeId", "isActive") VALUES ($1,$2,$3,$4,true) RETURNING id`,
            [email, hashedPw, role || "employee", empId]
          );
          userId = userRes.rows[0].id;
        } else {
          userId = existingUser.rows[0].id;
          await client.query(`UPDATE users SET "employeeId"=$1 WHERE id=$2`, [empId, userId]);
        }
      }

      // ── Step 9: Copy active company salary components to the new employee ──
      const compSalaryComponents = await client.query(
        `SELECT id FROM salary_components WHERE "companyId" = $1 AND "isActive" = true`,
        [effectiveCompanyId]
      );
      if (compSalaryComponents.rows.length > 0) {
        const valuesSql: string[] = [];
        const params: any[] = [];
        for (const sc of compSalaryComponents.rows) {
          const base = params.length;
          valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},true,NOW())`);
          params.push(empId, assignmentId, effectiveCompanyId, sc.id);
        }
        await client.query(
          `INSERT INTO employee_salary_components ("employeeId","assignmentId","companyId","componentId","isActive","createdAt")
           VALUES ${valuesSql.join(",")}
           ON CONFLICT DO NOTHING`,
          params
        ).catch(console.error);
      }

      return { empId, assignmentId, finalEmpNumber, userId, tempPassword };
    });

    const { empId, assignmentId, finalEmpNumber, userId, tempPassword } = result;

    // ── Step 8: Notify manager and HR ──
    const managerAssignmentId = await getManagerAssignmentId(scope.companyId, targetBranchId);
    if (managerAssignmentId) {
      createNotification({
        companyId: scope.companyId, assignmentId: managerAssignmentId,
        type: "employee_created", title: "موظف جديد في فريقك",
        body: `تم إضافة الموظف ${name} (${finalEmpNumber}) إلى فريقك. يرجى متابعة مهام التهيئة.`,
        priority: "high", refType: "employee", refId: empId,
      }).catch(console.error);
    }
    const [hrAssignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 ELSE 2 END LIMIT 1`,
      [scope.companyId]
    );
    const hrTargetId = hrAssignment?.id ?? scope.activeAssignmentId;
    createNotification({
      companyId: scope.companyId, assignmentId: hrTargetId,
      type: "employee_created", title: "تم إضافة موظف جديد — مطلوب متابعة HR",
      body: `تم إضافة الموظف ${name} برقم ${finalEmpNumber} بنجاح. تم إنشاء ${4} مهام تهيئة. يرجى مراجعة ملف الموظف.`,
      priority: "high", refType: "employee", refId: empId,
    }).catch(console.error);
    if (hrTargetId !== scope.activeAssignmentId) {
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "employee_created", title: "تم إضافة موظف جديد",
        body: `تم إضافة الموظف ${name} برقم ${finalEmpNumber} بنجاح.`,
        priority: "low", refType: "employee", refId: empId,
      }).catch(console.error);
    }

    // ── Step 9: Welcome notification/email ──
    createNotification({
      companyId: scope.companyId, assignmentId,
      type: "welcome", title: "مرحباً في فريق العمل",
      body: `أهلاً ${name}، رقمك الوظيفي ${finalEmpNumber}. يسعدنا انضمامك إلى الفريق. فترة التجربة: ${probationDays} يوم.`,
      priority: "normal", refType: "employee", refId: empId,
    }).catch(console.error);
    if (email) {
      rawExecute(
        `INSERT INTO email_queue ("companyId","toEmail","recipientName",subject,body,status,"createdAt","refType","refId")
         VALUES ($1,$2,$3,$4,$5,'pending',NOW(),'employee',$6)`,
        [scope.companyId, email, name, `مرحباً في فريق العمل - ${finalEmpNumber}`,
          `أهلاً ${name}،\n\nرقمك الوظيفي: ${finalEmpNumber}\nالمسمى الوظيفي: ${jobTitle}\nتاريخ الالتحاق: ${effectiveHireDate}\nفترة التجربة: ${probationDays} يوم\n\nيسعدنا انضمامك إلى الفريق.`,
          empId]
      ).catch(console.error);
    }
    if (email && tempPassword) {
      rawExecute(
        `INSERT INTO email_queue ("companyId","toEmail","recipientName",subject,body,status,"createdAt","refType","refId")
         VALUES ($1,$2,$3,$4,$5,'pending',NOW(),'user',$6)`,
        [scope.companyId, email, name, `بيانات الدخول إلى النظام - ${finalEmpNumber}`,
          `أهلاً ${name}،\n\nتم إنشاء حساب لك في نظام غيث ERP.\n\nالبريد الإلكتروني: ${email}\nكلمة المرور المؤقتة: ${tempPassword}\n\nيرجى تغيير كلمة المرور فور تسجيل الدخول الأول.\n\nهذه الرسالة تلقائية، يرجى عدم الرد عليها.`,
          empId]
      ).catch(console.error);
    }

    // ── Step 10: Event log ──
    await emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "employee.created", entity: "employees", entityId: empId,
      details: JSON.stringify({ empNumber: finalEmpNumber, assignmentId, jobTitle, role, salary, onboardingTasks: 4, probationDays: Number(probationDays) }),
    });

    // ── Step 10b: Register expiry obligations (iqama/passport/work permit/visa) ──
    await registerEmployeeExpiryObligations(
      scope.companyId,
      targetBranchId ?? null,
      empId,
      name,
      { iqamaExpiry, passportExpiry, workPermitExpiry, visaExpiry }
    );

    // ── Step 11: Audit log ──
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employees", entityId: empId,
      after: { name, empNumber: finalEmpNumber, jobTitle, role, salary, contractType, probationDays: Number(probationDays) },
    });

    // ── Step 12: Auto-create subsidiary accounting accounts ──
    createSubsidiaryAccountsForEntity(scope.companyId, "employee", empId, name).catch(console.error);

    const [employee] = await rawQuery<any>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status,
              ea."jobTitle", ea.role, ea.salary, ea."branchId",
              b.name AS "branchName"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE e.id = $1 AND e."deletedAt" IS NULL`,
      [empId]
    );

    res.status(201).json({
      ...employee,
      assignmentId,
      onboardingTasksCreated: 4,
      probationEndDate: (() => { const d = new Date(effectiveHireDate); d.setDate(d.getDate() + Number(probationDays)); return d.toISOString().split("T")[0]; })(),
      userAccount: userId ? {
        userId,
        email: email || null,
        isNewAccount: !!tempPassword,
        message: tempPassword
          ? "تم إنشاء حساب مستخدم. كلمة المرور المؤقتة أُرسلت إلى الموظف عبر البريد الإلكتروني."
          : "تم ربط الحساب الموجود بالموظف.",
      } : null,
    });
  } catch (err) {
    handleRouteError(err, res, "Create employee error:");
  }
});

router.get("/onboarding-tasks", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, status } = req.query as any;
    const conditions = [`ot."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (employeeId) { params.push(Number(employeeId)); conditions.push(`ot."employeeId" = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`ot.status = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT ot.*, e.name AS "employeeName", e."empNumber"
       FROM onboarding_tasks ot
       JOIN employees e ON e.id = ot."employeeId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY ot."createdAt" DESC LIMIT 200`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { console.error("Onboarding tasks error:", err); res.json({ data: [], total: 0 }); }
});

router.patch("/onboarding-tasks/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const parsed_patchOnboardingTaskSchema = patchOnboardingTaskSchema.safeParse(req.body);
    if (!parsed_patchOnboardingTaskSchema.success) throw new ValidationError(parsed_patchOnboardingTaskSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_patchOnboardingTaskSchema.data;
    const scope = req.scope!;
    const { status } = body;
    const [row] = await rawQuery<any>(
      `UPDATE onboarding_tasks SET status = $1,
       "completedAt" = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
       "completedBy" = $2
       WHERE id = $3 AND "companyId" = $4 RETURNING *`,
      [status, scope.activeAssignmentId, Number(req.params.id), scope.companyId]
    );
    if (!row) throw new NotFoundError("المهمة غير موجودة");
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "onboarding_task.updated", entity: "onboarding_tasks", entityId: Number(req.params.id),
      details: JSON.stringify({ status }),
    }).catch(console.error);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "onboarding_tasks", entityId: Number(req.params.id),
      after: { status },
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/job-titles", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM job_titles WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY name`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { res.json({ data: [], total: 0 }); }
});

router.get("/documents", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT ed.*, e.name AS "employeeName"
       FROM employee_documents ed
       JOIN employees e ON e.id = ed."employeeId"
       WHERE ed."companyId" = $1
       ORDER BY ed."createdAt" DESC
       LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Get employee documents error:");
  }
});

router.get("/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    let extraCondition = "";
    const queryParams: any[] = [Number(id), scope.companyId];
    if (!scope.isOwner && scope.role === "employee" && scope.employeeId) {
      extraCondition = ` AND e.id = $3`;
      queryParams.push(scope.employeeId);
    }

    const [employee] = await rawQuery<any>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber",
              e."photoUrl", e.status, e."createdAt",
              e."nationalId", e.nationality, e.gender, e."dateOfBirth",
              e."iqamaNumber", e."iqamaExpiry", e."passportNumber", e."passportExpiry",
              e."borderNumber", e."visaNumber", e."visaType", e."visaExpiry",
              e."sponsorNumber", e."workPermitNumber", e."workPermitExpiry", e."iqamaStatus",
              ea.id AS "assignmentId",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", ea."jobTitleId",
              ea.role, ea.salary, ea."hireDate",
              ea."companyId", ea."branchId", ea."departmentId",
              ea."managerId",
              b.name AS "branchName", d.name AS "departmentName",
              mgr.name AS "managerName"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       LEFT JOIN branches b ON b.id = ea."branchId"
       LEFT JOIN departments d ON d.id = ea."departmentId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       LEFT JOIN employees mgr ON mgr.id = ea."managerId"
       WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL${extraCondition}`,
      queryParams
    );

    if (!employee) {
      throw new NotFoundError("الموظف غير موجود");
    }

    const [tasks, attendance, leaves, trainings, payroll, violations, loans, overtime] = await Promise.all([
      rawQuery<any>(
        `SELECT pt.id, pt.title, pt.status, pt.priority, pt."dueDate", p.name AS "projectName"
         FROM project_tasks pt
         LEFT JOIN projects p ON p.id = pt."projectId"
         WHERE pt."assigneeId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL
         ORDER BY pt."dueDate" DESC NULLS LAST LIMIT 20`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT a.id, a.date, a."checkIn", a."checkOut", a."lateMinutes", a.status
         FROM attendance a
         WHERE a."assignmentId" = $1
         ORDER BY a.date DESC LIMIT 30`,
        [employee.assignmentId]
      ),
      rawQuery<any>(
        `SELECT lr.id, lr.status, lr."startDate", lr."endDate", lr.days, lr.reason,
                lt.name AS "leaveTypeName"
         FROM hr_leave_requests lr
         JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         WHERE lr."employeeId" = $1
         ORDER BY lr."createdAt" DESC LIMIT 20`,
        [Number(id)]
      ),
      rawQuery<any>(
        `SELECT te.id, te.status, te."completedAt",
                tp.title AS "courseTitle", tp.type AS "courseType"
         FROM training_enrollments te
         JOIN training_programs tp ON tp.id = te."programId"
         WHERE te."employeeId" = $1
         ORDER BY tp."startDate" DESC LIMIT 20`,
        [Number(id)]
      ).catch(() => []),
      rawQuery<any>(
        `SELECT pl.id, pl.basic, pl."grossSalary", pl.gosi, pl."lateDeduction", pl."netSalary",
                pr.period, pr.status, pr."createdAt"
         FROM payroll_lines pl
         JOIN payroll_runs pr ON pr.id = pl."runId"
         WHERE pl."assignmentId" = $1 AND pr."companyId" = $2 AND pl."deletedAt" IS NULL AND pr."deletedAt" IS NULL
         ORDER BY pr.period DESC LIMIT 12`,
        [employee.assignmentId, scope.companyId]
      ).catch(() => []),
      rawQuery<any>(
        `SELECT ev.id, ev.type, ev.description, ev.severity, ev.deduction, ev.period, ev."createdAt"
         FROM employee_violations ev
         WHERE ev."assignmentId" = $1 AND ev."companyId" = $2 AND ev."deletedAt" IS NULL
         ORDER BY ev."createdAt" DESC LIMIT 20`,
        [employee.assignmentId, scope.companyId]
      ).catch(() => []),
      rawQuery<any>(
        `SELECT l.id, l."loanNumber", l."loanType", l.amount, l."paidAmount", l."remainingAmount",
                l."installmentCount", l."installmentAmount", l.status, l."createdAt"
         FROM hr_employee_loans l
         WHERE l."assignmentId" = $1 AND l."companyId" = $2 AND l."deletedAt" IS NULL
         ORDER BY l."createdAt" DESC LIMIT 20`,
        [employee.assignmentId, scope.companyId]
      ).catch(() => []),
      rawQuery<any>(
        `SELECT o.id, o."requestNumber", o."overtimeDate", o.hours, o."totalAmount", o.status, o."createdAt"
         FROM hr_overtime_requests o
         WHERE o."assignmentId" = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL
         ORDER BY o."overtimeDate" DESC LIMIT 20`,
        [employee.assignmentId, scope.companyId]
      ).catch(() => []),
    ]);

    res.json({ ...employee, tasks, attendance, leaves, trainings, payroll, violations, loans, overtime });
  } catch (err) {
    handleRouteError(err, res, "Get employee error:");
  }
});

router.patch("/:id", requirePermission("hr:update"), async (req, res) => {
  // Step 2 of the HR operational audit — PATCH /employees/:id.
  //
  // Fixes over the old handler:
  //   1. 404 is now NotFoundError (was res.status(404)) so the frontend's
  //      PageErrorBoundary gets { code: "NOT_FOUND" }.
  //   2. salary <= 0 is now ValidationError with field+fix so the
  //      useApiMutation.onFieldError helper highlights the input.
  //   3. Pre-checks on email / nationalId / managerId when they're being
  //      *changed* — same reasoning as Step 1 create: deep pg 23505/23503
  //      errors are opaque; early rejection is clean and field-tagged.
  //   4. Loads the `before` row BEFORE the updates so the audit log can
  //      carry a real diff (was: after=req.body with no before at all).
  //   5. Explicitly emits `employee.updated` — the listener already exists
  //      in eventListeners.ts but nobody was firing the event.
  try {
    const parsed_patchEmployee = patchEmployeeSchema.safeParse(req.body);
    if (!parsed_patchEmployee.success) throw new ValidationError(parsed_patchEmployee.error.errors[0]?.message ?? "بيانات غير صالحة");
    const validatedBody = parsed_patchEmployee.data;
    const scope = req.scope!;
    const { id } = req.params;
    const {
      name, phone, email, jobTitle, role, salary, branchId, departmentId, status,
      borderNumber, visaNumber, visaType, visaExpiry, sponsorNumber,
      workPermitNumber, workPermitExpiry, iqamaStatus,
      nationalId, iqamaNumber, iqamaExpiry, passportNumber, passportExpiry,
    } = validatedBody as any;
    const { jobTitleId: bodyJobTitleId, managerId: bodyManagerId } = validatedBody as any;

    // Load the full employee + assignment row BEFORE we mutate anything. We
    // need:
    //   - assignmentId (for the assignment UPDATE below)
    //   - the "before" snapshot for audit diff
    //   - the current email / nationalId so pre-checks can skip no-op cases
    //     (user "changes" to the same value they already had)
    const [before] = await rawQuery<any>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status,
              e."nationalId", e."iqamaNumber", e."iqamaExpiry",
              e."passportNumber", e."passportExpiry",
              e."borderNumber", e."visaNumber", e."visaType", e."visaExpiry",
              e."sponsorNumber", e."workPermitNumber", e."workPermitExpiry", e."iqamaStatus",
              ea.id AS "assignmentId",
              ea."jobTitle", ea."jobTitleId", ea.role, ea.salary,
              ea."branchId", ea."departmentId", ea."managerId"
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status IN ('active','suspended','terminated')
        WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL
        ORDER BY ea.status = 'active' DESC, ea.id DESC LIMIT 1`,
      [Number(id), scope.companyId]
    );

    if (!before) {
      throw new NotFoundError("الموظف غير موجود", {
        fix: "تحقّق من الرقم الوظيفي أو ارجع لقائمة الموظفين.",
      });
    }

    if (salary !== undefined && salary !== null && Number(salary) <= 0) {
      throw new ValidationError("الراتب يجب أن يكون أكبر من صفر", {
        field: "salary",
        fix: "أدخل راتباً موجباً.",
      });
    }

    // Pre-check: changing email to one that belongs to a different employee.
    // We only fire the query when email is actually being changed to a
    // non-empty value different from the current one — avoids a wasted
    // round-trip on every PATCH that only touches unrelated fields.
    if (email !== undefined && email && email !== before.email) {
      const [clash] = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE email = $1 AND id <> $2 AND "deletedAt" IS NULL LIMIT 1`,
        [email, Number(id)]
      );
      if (clash) {
        throw new ConflictError("البريد الإلكتروني مستخدم لموظف آخر", {
          field: "email",
          fix: "تحقّق من البريد أو استخدم بريداً آخر.",
          meta: { existingEmployeeId: clash.id },
        });
      }
    }

    // Pre-check: changing nationalId to one already registered.
    if (nationalId !== undefined && nationalId && nationalId !== before.nationalId) {
      const [clash] = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE "nationalId" = $1 AND id <> $2 AND "deletedAt" IS NULL LIMIT 1`,
        [nationalId, Number(id)]
      );
      if (clash) {
        throw new ConflictError("رقم الهوية مستخدم لموظف آخر", {
          field: "nationalId",
          fix: "الرقم مرتبط بموظف آخر — تحقّق من بياناته أولاً.",
          meta: { existingEmployeeId: clash.id },
        });
      }
    }

    // Pre-check: changing managerId to a non-existent employee id. We used
    // to let this fail as a deep 23503 FK error whose detail string didn't
    // always carry "managerId".
    if (bodyManagerId !== undefined && bodyManagerId) {
      const [mgr] = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(bodyManagerId)]
      );
      if (!mgr) {
        throw new ValidationError(`المدير رقم ${bodyManagerId} غير موجود`, {
          field: "managerId",
          fix: "اختر مديراً من قائمة الموظفين الحاليين.",
        });
      }
    }

    // Pre-check: changing departmentId to a non-existent one.
    if (departmentId !== undefined && departmentId) {
      const [dept] = await rawQuery<{ id: number }>(
        `SELECT id FROM departments WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
        [Number(departmentId), scope.companyId]
      );
      if (!dept) {
        throw new ValidationError("القسم المحدد غير موجود", {
          field: "departmentId",
          fix: "اختر قسماً موجوداً في الشركة.",
        });
      }
    }

    const employee = { id: before.id, assignmentId: before.assignmentId };

    const empFields: string[] = [];
    const empVals: any[] = [];
    if (name !== undefined) { empVals.push(name); empFields.push(`name = $${empVals.length}`); }
    if (phone !== undefined) { empVals.push(phone); empFields.push(`phone = $${empVals.length}`); }
    if (email !== undefined) { empVals.push(email); empFields.push(`email = $${empVals.length}`); }
    if (status !== undefined) { empVals.push(status); empFields.push(`status = $${empVals.length}`); }
    if (nationalId !== undefined) { empVals.push(nationalId); empFields.push(`"nationalId" = $${empVals.length}`); }
    if (iqamaNumber !== undefined) { empVals.push(iqamaNumber); empFields.push(`"iqamaNumber" = $${empVals.length}`); }
    if (iqamaExpiry !== undefined) { empVals.push(iqamaExpiry || null); empFields.push(`"iqamaExpiry" = $${empVals.length}`); }
    if (passportNumber !== undefined) { empVals.push(passportNumber); empFields.push(`"passportNumber" = $${empVals.length}`); }
    if (passportExpiry !== undefined) { empVals.push(passportExpiry || null); empFields.push(`"passportExpiry" = $${empVals.length}`); }
    if (borderNumber !== undefined) { empVals.push(borderNumber); empFields.push(`"borderNumber" = $${empVals.length}`); }
    if (visaNumber !== undefined) { empVals.push(visaNumber); empFields.push(`"visaNumber" = $${empVals.length}`); }
    if (visaType !== undefined) { empVals.push(visaType); empFields.push(`"visaType" = $${empVals.length}`); }
    if (visaExpiry !== undefined) { empVals.push(visaExpiry || null); empFields.push(`"visaExpiry" = $${empVals.length}`); }
    if (sponsorNumber !== undefined) { empVals.push(sponsorNumber); empFields.push(`"sponsorNumber" = $${empVals.length}`); }
    if (workPermitNumber !== undefined) { empVals.push(workPermitNumber); empFields.push(`"workPermitNumber" = $${empVals.length}`); }
    if (workPermitExpiry !== undefined) { empVals.push(workPermitExpiry || null); empFields.push(`"workPermitExpiry" = $${empVals.length}`); }
    if (iqamaStatus !== undefined) { empVals.push(iqamaStatus); empFields.push(`"iqamaStatus" = $${empVals.length}`); }
    if (empFields.length) {
      empVals.push(Number(id), scope.companyId);
      await rawExecute(`UPDATE employees SET ${empFields.join(",")} WHERE id = $${empVals.length - 1} AND "companyId" = $${empVals.length}`, empVals);
    }

    if (status === "active" && before.status !== "active") {
      await rawExecute(
        `UPDATE employee_assignments SET status = 'active' WHERE id = $1 AND "companyId" = $2`,
        [employee.assignmentId, scope.companyId]
      );
    } else if (status === "suspended" && before.status !== "suspended") {
      await rawExecute(
        `UPDATE employee_assignments SET status = 'suspended' WHERE id = $1 AND "companyId" = $2`,
        [employee.assignmentId, scope.companyId]
      );
    }

    // If any expiry field was changed, refresh obligations. Old obligations with
    // different dedupeKey remain until scanner marks them met/breached; the new
    // dedupeKey (which includes the date) ensures no duplicates.
    if ([iqamaExpiry, passportExpiry, workPermitExpiry, visaExpiry].some((v) => v !== undefined)) {
      const [empRow] = await rawQuery<any>(
        `SELECT name, "iqamaExpiry", "passportExpiry", "workPermitExpiry", "visaExpiry" FROM employees WHERE id=$1 AND "deletedAt" IS NULL`,
        [Number(id)]
      );
      if (empRow) {
        await registerEmployeeExpiryObligations(
          scope.companyId, scope.branchId ?? null, Number(id), empRow.name,
          {
            iqamaExpiry: empRow.iqamaExpiry,
            passportExpiry: empRow.passportExpiry,
            workPermitExpiry: empRow.workPermitExpiry,
            visaExpiry: empRow.visaExpiry,
          }
        );
      }
    }

    if (jobTitle || role || salary !== undefined || branchId || departmentId || bodyJobTitleId !== undefined || bodyManagerId !== undefined) {
      const fields: string[] = [];
      const vals: any[] = [];
      if (jobTitle) { vals.push(jobTitle); fields.push(`"jobTitle" = $${vals.length}`); }
      if (bodyJobTitleId !== undefined) { vals.push(bodyJobTitleId || null); fields.push(`"jobTitleId" = $${vals.length}`); }
      else if (jobTitle) {
        const [jtRow] = await rawQuery<any>(`SELECT id FROM job_titles WHERE name = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`, [jobTitle, scope.companyId]);
        if (jtRow) { vals.push(jtRow.id); fields.push(`"jobTitleId" = $${vals.length}`); }
      }
      if (bodyManagerId !== undefined) { vals.push(bodyManagerId ? Number(bodyManagerId) : null); fields.push(`"managerId" = $${vals.length}`); }
      if (role) { vals.push(role); fields.push(`role = $${vals.length}`); }
      if (salary !== undefined) {
        const [currentAsgn] = await rawQuery<{ salary: number }>(
          `SELECT salary FROM employee_assignments WHERE id = $1`,
          [employee.assignmentId]
        );
        const oldSalary = Number(currentAsgn?.salary ?? 0);
        const newSalary = Number(salary);
        vals.push(newSalary); fields.push(`salary = $${vals.length}`);
        if (oldSalary !== newSalary) {
          rawExecute(
            `INSERT INTO salary_history ("employeeId","assignmentId","companyId","oldSalary","newSalary","effectiveDate","changedBy","createdAt")
             VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,NOW())`,
            [Number(id), employee.assignmentId, scope.companyId, oldSalary, newSalary, scope.activeAssignmentId]
          ).catch(console.error);
        }
      }
      if (branchId) { vals.push(branchId); fields.push(`"branchId" = $${vals.length}`); }
      if (departmentId) { vals.push(departmentId); fields.push(`"departmentId" = $${vals.length}`); }
      if (fields.length) {
        vals.push(employee.assignmentId);
        vals.push(scope.companyId);
        await rawExecute(`UPDATE employee_assignments SET ${fields.join(",")} WHERE id = $${vals.length - 1} AND "companyId" = $${vals.length}`, vals);
      }
    }

    // Re-read the full row so the audit log + event get a reliable "after"
    // snapshot rather than the raw body (which may contain partial updates,
    // sensitive fields, or stale shape).
    const [after] = await rawQuery<any>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status,
              e."nationalId", e."iqamaNumber", e."iqamaExpiry",
              e."passportNumber", e."passportExpiry",
              e."borderNumber", e."visaNumber", e."visaType", e."visaExpiry",
              e."sponsorNumber", e."workPermitNumber", e."workPermitExpiry", e."iqamaStatus",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", ea."jobTitleId",
              ea.role, ea.salary, ea."branchId", ea."departmentId", ea."managerId"
         FROM employees e
         JOIN employee_assignments ea ON ea.id = $2
         LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
        WHERE e.id = $1 AND e."deletedAt" IS NULL`,
      [Number(id), employee.assignmentId]
    );

    // Build a field-level diff for the audit log so operators can see what
    // actually changed instead of the raw request body.
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    const trackedKeys = [
      "name", "phone", "email", "status", "nationalId", "iqamaNumber",
      "iqamaExpiry", "passportNumber", "passportExpiry", "borderNumber",
      "visaNumber", "visaType", "visaExpiry", "sponsorNumber",
      "workPermitNumber", "workPermitExpiry", "iqamaStatus",
      "jobTitle", "role", "salary", "branchId", "departmentId", "managerId",
    ] as const;
    for (const key of trackedKeys) {
      const oldVal = (before as any)[key];
      const newVal = (after as any)[key];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        changedFields[key] = { from: oldVal ?? null, to: newVal ?? null };
      }
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "employees",
      entityId: Number(id),
      // Snapshot both sides — logAudit / computeDiff would otherwise have
      // nothing to compute. Sensitive fields (passwordHash, tempPassword)
      // are never on the employees table so the raw snapshot is safe.
      before,
      after,
      reason: `حقول معدّلة: ${Object.keys(changedFields).join(", ") || "بلا تغيير"}`,
    }).catch(console.error);

    // Emit the canonical employee.updated event — the listener in
    // eventListeners.ts:82 already writes to event_logs + audit_logs but
    // was never being triggered because nobody emitted the event from the
    // PATCH handler. With this in place the audit trail finally sees
    // employee updates the same way it sees creates.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "employee.updated",
      entity: "employees",
      entityId: Number(id),
      before,
      after,
      details: JSON.stringify({ changedFields }),
    }).catch(console.error);

    res.json(after);
  } catch (err) {
    handleRouteError(err, res, "Update employee error:");
  }
});

router.delete("/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const { reason } = (req.body || {}) as { reason?: string };
    const [employee] = await rawQuery<any>(
      `SELECT e.id, ea.id AS "assignmentId" FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!employee) throw new NotFoundError("الموظف غير موجود");

    // Terminating a single employee used to only flip two status
    // columns — leaving a long tail of orphaned work behind: active
    // contracts still probated, pending leave requests still in the
    // manager's inbox, tasks still assigned to the ex-employee, and
    // pending approval_requests stuck forever. Close the loop across
    // every dependent row in a transaction so HR doesn't have to chase
    // them manually after the fact.
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE employee_assignments SET status = 'terminated' WHERE id = $1 AND "companyId" = $2`,
        [employee.assignmentId, scope.companyId]
      );
      await tx.query(
        `UPDATE employees SET status = 'terminated' WHERE id = $1 AND "companyId" = $2`,
        [Number(id), scope.companyId]
      );

      // 1. Deactivate contracts tied to this employee / assignment so
      //    probation cron stops alerting on ghosts.
      await tx.query(
        `UPDATE employee_contracts
           SET status = 'terminated', "probationStatus" = 'ended'
         WHERE "employeeId" = $1 AND "companyId" = $2 AND status <> 'terminated'`,
        [Number(id), scope.companyId]
      );

      // 2. Cancel pending leave requests + their approval stages so
      //    the leave escalation cron stops firing reminders.
      await tx.query(
        `UPDATE hr_leave_requests
           SET status = 'cancelled'
         WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'pending'`,
        [Number(id), scope.companyId]
      );
      await tx.query(
        `UPDATE leave_approval_stages
           SET status = 'cancelled'
         WHERE "leaveRequestId" IN (
           SELECT id FROM hr_leave_requests
           WHERE "employeeId" = $1 AND "companyId" = $2
         ) AND status = 'pending'`,
        [Number(id), scope.companyId]
      );

      // 3. Cancel open tasks assigned to the terminated assignment so
      //    they don't rot in someone's calendar forever. Manager can
      //    re-open / reassign after the fact.
      await tx.query(
        `UPDATE tasks
           SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || 'ألغي تلقائياً: إنهاء خدمة الموظف'
         WHERE "assignedTo" = $1 AND status IN ('pending', 'in_progress')`,
        [employee.assignmentId]
      );

      // 4. Cancel pending approval_requests routed to this user so
      //    the approval queue doesn't get stuck. The caller can re-
      //    route via the escalation chain on the next cron tick.
      await tx.query(
        `UPDATE approval_requests
           SET status = 'cancelled', "decidedAt" = NOW()
         WHERE "assignedTo" = $1 AND status = 'pending'`,
        [employee.assignmentId]
      );
    });

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "employee.terminated",
      entity: "employees",
      entityId: Number(id),
      before: { status: "active" },
      after: { status: "terminated", reason: reason || null, assignmentId: employee.assignmentId },
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "employees", entityId: Number(id),
      after: { reason: reason || null },
    }).catch(console.error);
    res.json({ message: "تم إنهاء خدمة الموظف بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Delete employee error:");
  }
});

/**
 * Seed obligations for all existing employees with future expiry dates.
 * Safe to re-run — dedupeKey prevents duplicates.
 */
router.post("/obligations/seed", requirePermission("hr:update"), async (req, res) => {
  try {
    { const _guard = seedObligationsSchema.safeParse(req.body); if (!_guard.success) throw new ValidationError(_guard.error.errors[0]?.message ?? "بيانات غير صالحة"); }
    const scope = req.scope!;
    const emps = await rawQuery<any>(
      `SELECT e.id, e.name, e."iqamaExpiry", e."passportExpiry", e."workPermitExpiry", e."visaExpiry"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea.status='active'
       WHERE ea."companyId"=$1 AND e.status='active' AND e."deletedAt" IS NULL
         AND (e."iqamaExpiry" IS NOT NULL OR e."passportExpiry" IS NOT NULL
              OR e."workPermitExpiry" IS NOT NULL OR e."visaExpiry" IS NOT NULL)`,
      [scope.companyId]
    );
    let registered = 0;
    for (const e of emps) {
      const before = registered;
      await registerEmployeeExpiryObligations(
        scope.companyId, scope.branchId ?? null, e.id, e.name,
        {
          iqamaExpiry: e.iqamaExpiry,
          passportExpiry: e.passportExpiry,
          workPermitExpiry: e.workPermitExpiry,
          visaExpiry: e.visaExpiry,
        }
      );
      registered = before + 1;
    }
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "obligations.seeded", entity: "employees", entityId: 0,
      details: JSON.stringify({ scannedEmployees: emps.length, employeesProcessed: registered }),
    }).catch(console.error);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "obligations", entityId: 0,
      after: { scannedEmployees: emps.length, employeesProcessed: registered },
    }).catch(console.error);
    res.json({ scannedEmployees: emps.length, employeesProcessed: registered });
  } catch (err) { handleRouteError(err, res, "Seed HR obligations error:"); }
});

// Quiet unused import warnings for helpers referenced conditionally
void cancelObligation;

export default router;
