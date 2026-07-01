import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { grantUserRole } from "../lib/rbacService.js";
import { issueNumber } from "../lib/numberingService.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  getManagerAssignmentId,
  todayISO,
  currentYear,
  toDateISO,
} from "../lib/businessHelpers.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { hashPassword } from "../lib/auth.js";
import { sendMessage } from "../lib/messageSender.js";
import { randomBytes } from "node:crypto";
import { issueAuthToken, PublicBaseUrlMissingError, TOKEN_TTL_MINUTES } from "../lib/authTokens.js";
import { issueOnboardingToken } from "../lib/employeeOnboarding.js";
import { sendAuthEmail } from "../lib/authNotifications.js";
import { registerObligation, cancelObligation } from "../lib/obligationsEngine.js";
// PR-4 (#2077) — on-demand recompute + history wraps the existing
// employeeScoringEngine library. The library + the weekly/monthly
// cron handlers already exist (see lib/employeeScoringEngine.ts +
// lib/cronScheduler.ts `weeklyEmployeeScoring` / `monthlyEmployeeScoring`).
// PR-4 just adds two HTTP entry points so HR Manager can:
//   - re-score one employee immediately after a policy/weight change
//     (instead of waiting until Monday 3am for the weekly cron), and
//   - read the full breakdown + history with rationale text.
import {
  scoreEmployee, currentPeriodKey, type ScoreScope,
} from "../lib/employeeScoringEngine.js";
// PR-8 (#2077) — lifecycle engine: state machine + guards.
import {
  ALLOWED_TRANSITIONS, EVENT_TO_STATE_AFTER, STATE_LABEL_AR, EVENT_LABEL_AR,
  resolveCurrentState, checkGuards, nextTransitions,
  type LifecycleState, type LifecycleEventType,
} from "../lib/employeeLifecycleEngine.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { registerEntityParty } from "../lib/partyService.js";
import type { EmployeeRow, EmployeeAssignmentRow } from "../lib/dbTypes.js";

// Extended employee row — schema has many more columns than the early
// Drizzle definition. The index signature catches any column we haven't
// listed explicitly so existing callers stay happy.
interface FullEmployeeRow extends EmployeeRow {
  iqamaNumber?: string | null;
  iqamaExpiry?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  gosiNumber?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  branchId?: number | null;
  departmentId?: number | null;
  managerId?: number | null;
  jobTitle?: string | null;
  hireDate?: string | null;
  salary?: number | string | null;
  housingAllowance?: number | string | null;
  transportAllowance?: number | string | null;
  contractType?: string | null;
  probationDays?: number | null;
  deletedAt?: string | null;
  [k: string]: unknown;
}

// Joined list-row used by GET /employees — adds assignment columns + computed
// metadata flags.
interface EmployeeListRow extends FullEmployeeRow {
  assignmentId?: number | null;
  companyId?: number | null;
  branchName?: string | null;
  departmentName?: string | null;
  managerName?: string | null;
}

interface CountRow { count: string | number; total?: string | number }
interface IdRow { id: number }

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
  salary: z.coerce.number().nonnegative().optional(),
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
  // HR-005: when set, this employee is created from a recruitment
  // application. Creation still runs through this single pipeline — the id
  // only adds the application↔employee link, conversion event and audit.
  sourceApplicationId: z.coerce.number().int().positive().optional().nullable(),
  // Integrated HR onboarding (migration 248). Split the previous single
  // `email` into the three things HR actually needs:
  //   - internalEmail → user-account login (e.g. ahmed@company.sa).
  //     When set, this is the email that ends up on users.email.
  //   - personalEmail → personal contact, stored separately on
  //     employees.personalEmail. Never used for auth.
  //   - email (legacy) → fallback. If only `email` is provided, it
  //     plays both roles for backward compatibility.
  internalEmail: z.string().email().optional().nullable(),
  personalEmail: z.string().email().optional().nullable(),
  // When true, the create transaction also opens a subsidiary custody
  // account for this employee under chart_of_accounts (cash-advance
  // sub-ledger). Drivers, sales reps, field engineers normally need
  // this on day one so the finance team doesn't get a 23503 the first
  // time it tries to post an advance.
  createCustodyAccount: z.boolean().optional(),
  // When the new employee is a driver, optionally bind a vehicle on
  // creation. The transaction validates the vehicle is in the same
  // company; the binding becomes a fleet_driver_vehicle row. Skipped
  // silently if the table doesn't exist or role!=driver.
  vehicleId: z.coerce.number().int().positive().optional().nullable(),
  // When a PBX is connected, the create form offers an extension picker.
  // `pbxExtensionId` binds an existing unassigned extension to this
  // employee; `pbxExtensionNew` mints a brand-new extension number.
  // Both are optional and silently skipped if no PBX / table is present.
  pbxExtensionId: z.coerce.number().int().positive().optional().nullable(),
  pbxExtensionNew: z.string().trim().max(20).optional().nullable(),
  // PR-1 (#2077) — institutional binding fields. The wizard makes the
  // first five mandatory in the UI; the schema accepts them as optional
  // so legacy importers + the first bootstrap employee still work, and
  // the route handler rejects when they're missing in a non-bootstrap
  // company so the API contract is the second line of defence.
  //
  //   MANDATORY (5):
  //   - positionId   → employee_assignments.positionId. The administrative
  //                    role (مدير قسم / نائب / مشرف). Distinct from
  //                    jobTitle (functional role). Required because the
  //                    org-chart, approval-chain, and supervision-line
  //                    derivations all key on position level.
  //   - categoryKey  → employee_assignments.categoryKey. Workforce type
  //                    (worker / driver / manager / …). Required because
  //                    attendance_policies_per_category (migration 270)
  //                    has no fallback row — without categoryKey the
  //                    daily check-in / late-deduction engine has no
  //                    policy to apply to this employee.
  //   - teamId       → employee_team_memberships bridge. Required because
  //                    workInbox + tasks routing + workload-balance all
  //                    fan-out by team — an employee with no team is
  //                    invisible to every fan-out endpoint.
  //   - projectId    → employee_project_assignments bridge. Required
  //                    because the cost-center anchor lives on this row;
  //                    payroll cost attribution needs the project link.
  //   - costCenterId → carried on the project_assignments bridge (NOT a
  //                    separate row). Required because every salary
  //                    journal line debits a cost-centered expense
  //                    account; without it payroll posts to the
  //                    "general" cost center, distorting P&L by branch.
  //
  //   OPTIONAL (1):
  //   - committeeId  → employee_committee_memberships bridge. Optional
  //                    by design: committees are CROSS-DEPARTMENT and
  //                    TIME-BOUNDED ad-hoc councils (audit committee,
  //                    safety committee, recruitment panel…). They are
  //                    NOT a baseline binding every employee needs at
  //                    hire time, and making them mandatory would force
  //                    HR to invent a "no committee" placeholder for
  //                    the 80%+ of employees who never sit on one.
  //                    Joining a committee is a later membership
  //                    transaction (PATCH /org/committee-memberships)
  //                    that the wizard correctly stays out of.
  positionId: z.coerce.number().int().positive().optional().nullable(),
  categoryKey: z.string().trim().min(1).max(40).optional().nullable(),
  // RBAC multi-role — the operator picks one OR MORE roles for the new
  // employee's login user (HR only SELECTS; the actual grant + SoD gate live
  // in the central rbacService, owned by the RBAC path). When present, each
  // key is resolved + bound via grantUserRole inside the create transaction;
  // the FIRST successfully granted role becomes is_primary. When absent, the
  // legacy single-role derivation (job-title defaultRoleKey / `role`) applies
  // unchanged — no regression for importers or the bootstrap employee.
  selectedRoleKeys: z.array(z.string().trim().min(1)).max(20, "عدد الأدوار المختارة يتجاوز الحدّ المسموح (20)").optional().nullable(),
  teamId: z.coerce.number().int().positive().optional().nullable(),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  costCenterId: z.coerce.number().int().positive().optional().nullable(),
  committeeId: z.coerce.number().int().positive().optional().nullable(),
  // الدفعة 3 — توزيع الموظف على عدة فروع (اختياري). حين يُرسَل بأكثر من فرع،
  // يُستبدل التخصيص الأساسي المفرد بهذه القائمة (مجموع النِسَب يجب = 100).
  // كل عنصر: الفرع + الصفة في الفرع + النسبة + مركز تكلفة اختياري (تجاوز).
  branchAllocations: z.array(z.object({
    branchId: z.coerce.number().int().positive(),
    capacity: z.string().trim().max(80).optional().nullable(),
    allocationPercent: z.coerce.number().positive().max(100),
    costCenterId: z.coerce.number().int().positive().optional().nullable(),
  })).max(50, "عدد تخصيصات الفروع يتجاوز الحدّ المسموح (50)").optional().nullable(),
});

const patchEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  jobTitleId: z.coerce.number().optional().nullable(),
  role: z.string().optional().nullable(),
  salary: z.coerce.number().nonnegative().optional().nullable(),
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

const deleteEmployeeSchema = z.object({
  reason: z.string().optional(),
});

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
    }).catch((e) => logger.error(e, `Failed to register ${code} obligation for emp ${empId}:`));
  }
}

// عقد قائد/خادم (#2839): تطبيق بيانات الاستكمال الذاتي على سجل الموظف. مسار
// البيانات العامة (publicData، خادم بواجهة عامة) يستقبل النموذج عبر رابط token
// مُتحقَّق، لكن **الكتابة** في جدول HR المملوك (employees) تبقى هنا في المسار
// القائد (HR): تُكتب حقول الـstaging فقط (selfSubmittedData/At + حالة
// 'self_submitted') بانتظار اعتماد HR — لا تغيير لأي حقل تشغيلي آخر.
export async function applySelfOnboardingSubmission(
  employeeId: number,
  companyId: number,
  data: unknown,
): Promise<{ name: string } | undefined> {
  const updated = await rawQuery<{ name: string }>(
    `UPDATE employees
        SET "selfSubmittedData" = $1::jsonb, "selfSubmittedAt" = NOW(), "activationStatus" = 'self_submitted'
      WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL
      RETURNING name`,
    [JSON.stringify(data), employeeId, companyId],
  );
  return updated[0];
}

const router = Router();

// RBAC v2: list with scope-aware response. maskFields applied so any
// role-level field policy mass-masks salary/IBAN/etc. across the list.
router.get("/", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search = "", status, page = "1", limit: lim = "20" } = req.query as Record<string, string | undefined>;
    const safeLim = Math.min(Math.max(Number(lim) || 20, 1), 500);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLim;

    const filters = parseScopeFilters(req);
    if (search) filters.search = String(search);
    filters.searchColumns = ['e.name', 'e.email', 'e."empNumber"'];

    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'ea."companyId"',
      branchColumn: 'ea."branchId"',
      extraConditions: [`ea.status = 'active'`],
      enforceBranchScope: true,
      // Org-as-security-boundary: a department-level manager sees only the
      // employees whose active assignment is in one of their departments
      // (company-level roles are exempt — see DEPT_SCOPE_EXEMPT_ROLES). The
      // department lives on the assignment, so we key off ea."departmentId".
      enforceDepartmentScope: true,
      departmentColumn: 'ea."departmentId"',
    });

    let paramIdx = nextParamIndex;
    let where = baseWhere;

    if (status) {
      where += ` AND e.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (!scope.isOwner && scope.role === "employee" && scope.employeeId) {
      where += ` AND e.id = $${paramIdx}`;
      params.push(scope.employeeId);
      paramIdx++;
    }

    params.push(safeLim);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;
    // Dedicated binding for the gov_counts CTE so we don't depend on
    // any specific position inside the scoped where clause (which may
    // pass `companyId` as an array via = ANY($1)). Single integer here.
    params.push(scope.companyId);
    const govCompanyIdx = paramIdx++;

    // Pre-aggregate gov_integration_links once instead of running the
    // scalar subquery per row. The original SELECT-list correlated
    // subquery was N+1: postgres planned one execution PER returned
    // row, so 500 employees == 501 index lookups. The CTE below scans
    // gov_integration_links once and joins the per-employee counts.
    const employees = await rawQuery<EmployeeListRow>(
      `WITH gov_counts AS (
         SELECT "entityId", COUNT(*) AS "govLinkCount"
         FROM gov_integration_links
         WHERE "entityType" = 'employee' AND "companyId" = $${govCompanyIdx}
         GROUP BY "entityId"
       )
       SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status, e."activationStatus",
              ea.id AS "activeAssignmentId",
              e."iqamaNumber", e."iqamaExpiry", e."iqamaStatus",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", ea."jobTitleId",
              ea.role, ea.salary, ea."branchId",
              b.name AS "branchName",
              COALESCE(gc."govLinkCount", 0)::int AS "govLinkCount"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
                                   AND ea."isAccessGrant" = FALSE
       LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       LEFT JOIN gov_counts gc ON gc."entityId" = e.id
       WHERE ${where} AND e."deletedAt" IS NULL
       ORDER BY e.name ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    // The list query appended 3 trailing params (limit, offset,
    // govCompanyId); the count query doesn't need any of them.
    const countParams = params.slice(0, params.length - 3);
    const [countRow] = await rawQuery<{ total: string | number }>(
      `SELECT COUNT(*) AS total
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
                                   AND ea."isAccessGrant" = FALSE
       WHERE ${where} AND e."deletedAt" IS NULL`,
      countParams
    );

    res.json(maskFields(req, { data: employees, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: safeLim }));
  } catch (err) {
    handleRouteError(err, res, "List employees error:");
  }
});

// ── HR-REV-3 (#2222) — fast minimal employee creation ──
// A lightweight alternative to the 46-field full-create above. It lands
// the employee in a PENDING (inactive) state with an active assignment +
// a distributed onboarding task plan, so HR can register a hire in
// seconds and complete the heavy profile later. The later PATCH /:id
// activation flow (whose before-query filters ea.status IN
// ('active','suspended','terminated')) finds the active assignment and
// flips the employee to active. This path deliberately does NOT create
// PBX/vehicle/custody/contract/leave-balance/salary-component rows — those
// belong to the heavy create.
const quickActivateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  departmentId: z.coerce.number().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
});

// HR-REV-4 (#2223) §2/§4 — the activation plan is generated from the job
// title's professional category, so a سائق, a محاسب and an إداري get materially
// different distributed task sets (each task routed to its owning role, with a
// serviceType for the ones that are a service request — vehicle/custody/access
// — never a manual HR checkbox). This is the in-code profile until the
// DB-driven job_activation_profiles tables land (HR-REV-4 full). Both the
// quick-activate and the full-create paths call this with the resolved
// job_titles.category (null → the general/admin default).
type ActivationTask = {
  title: string;
  ownerRole: string;
  reason: string;
  mandatory: boolean;
  serviceType?: string;
};

function buildActivationPlan(category: string | null): ReadonlyArray<ActivationTask> {
  const c = (category || "").toLowerCase();
  const contract: ActivationTask = { title: "توقيع عقد العمل والتأمينات", ownerRole: "documents", reason: "العقد والتأمينات والتحقق من الوثائق", mandatory: true };
  const manager: ActivationTask = { title: "تعريف المدير المباشر والفريق", ownerRole: "department", reason: "تأكيد المباشرة وتعريف الفريق وموقع العمل", mandatory: true };

  // Driver — field/GPS attendance + vehicle + device custody + cost center.
  if (c.includes("driver") || c.includes("سائق") || c.includes("field") || c.includes("ميدان")) {
    return [
      { title: "التحقق من رخصة القيادة", ownerRole: "documents", reason: "رخصة قيادة سارية شرط للقيادة", mandatory: true },
      contract,
      manager,
      { title: "تطبيق سياسة حضور ميدانية (GPS)", ownerRole: "hr", reason: "فئة السائق تتطلب تتبّع GPS", mandatory: true },
      { title: "طلب تخصيص مركبة", ownerRole: "fleet", reason: "تخصيص مركبة من الأسطول (طلب خدمة لا إنشاء)", mandatory: true, serviceType: "vehicle" },
      { title: "صرف عهدة جهاز/شريحة", ownerRole: "warehouse", reason: "عهدة تشغيلية بوثيقة استلام", mandatory: false, serviceType: "custody" },
      { title: "ربط مركز التكلفة/المشروع", ownerRole: "payroll", reason: "تحميل التكلفة على المركز الصحيح", mandatory: true },
    ];
  }

  // Accountant / finance — restricted financial access, no vehicle, no GPS.
  if (c.includes("account") || c.includes("finance") || c.includes("محاسب") || c.includes("مالي")) {
    return [
      contract,
      manager,
      { title: "منح صلاحية مالية مقيّدة", ownerRole: "access", reason: "وصول مالي محدود حسب الدور (لا رؤية تحقيقات إلا بمنح صريح)", mandatory: true, serviceType: "access" },
      { title: "ربط مركز التكلفة", ownerRole: "payroll", reason: "ربط محاسبي لمركز التكلفة", mandatory: false },
      { title: "اعتماد الراتب والبدلات والحساب البنكي", ownerRole: "payroll", reason: "تحديد الراتب والبدلات والحساب البنكي", mandatory: true },
    ];
  }

  // General / admin default.
  return [
    { title: "تسليم أجهزة IT وإعداد الحسابات", ownerRole: "it", reason: "تجهيز الحساب والبريد وصرف عهدة الأجهزة", mandatory: true, serviceType: "access" },
    contract,
    manager,
    { title: "اعتماد الراتب والبدلات والحساب البنكي", ownerRole: "payroll", reason: "تحديد الراتب والبدلات والحساب البنكي", mandatory: true },
    { title: "دورة التعريف بالشركة وسياساتها", ownerRole: "hr", reason: "التعريف بالسياسات واللوائح", mandatory: false },
  ];
}

router.post("/quick-activate", authorize({ feature: "hr.employees", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(quickActivateSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, phone, email, nationalId, nationality, departmentId, jobTitle } = body;

    if (!name) {
      throw new ValidationError("لا يمكن إنشاء موظف بدون اسم", {
        field: "name",
        fix: "أدخل الاسم الكامل للموظف",
      });
    }

    const effectiveCompanyId = scope.companyId;
    const targetBranchId = scope.branchId;
    const resolvedDepartmentId = departmentId ?? null;
    const effectiveHireDate = body.hireDate || todayISO();
    const effectiveJobTitle = jobTitle || "موظف";

    // Numbering center (Issue #1141) — employee code via central authority
    // (`hr.employee_code`). Issued OUTSIDE the transaction (exact same call
    // as POST /) so the audit:numbering-coverage check stays satisfied: the
    // INSERT into employees gets its number from the numbering service.
    const preIssued = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "hr",
      entityKey: "employee_code",
      entityTable: "employees",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const finalEmpNumber = preIssued.number;

    const result = await withTransaction(async (client) => {
      // ── Create the employee in PENDING (inactive) state ──
      // 'inactive' is the only CHECK-allowed pending-ish status (migration
      // 084); it gates the employee until the activation flow flips it.
      const empRes = await client.query(
        `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", nationality, status, "activationStatus")
         VALUES ($1, $2, $3, $4, $5, $6, 'inactive', $7)
         RETURNING id`,
        [name, phone || null, email || null, finalEmpNumber, nationalId || null, nationality || null, email ? 'self_invited' : 'pending_activation']
      );
      const empId = empRes.rows[0].id;

      // Link the numbering assignment to the employee row.
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [empId, preIssued.assignmentId]
      );

      // ── Resolve jobTitleId + category from the jobTitle text (company-scoped) ──
      // category drives the activation plan (HR-REV-4 §1): سائق ≠ محاسب ≠ إداري.
      let resolvedJobTitleId: number | null = null;
      let resolvedCategory: string | null = null;
      if (effectiveJobTitle && effectiveJobTitle !== "موظف") {
        const jtRes = await client.query(
          `SELECT id, category FROM job_titles WHERE name = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
          [effectiveJobTitle, effectiveCompanyId]
        );
        if (jtRes.rows.length > 0) {
          resolvedJobTitleId = jtRes.rows[0].id;
          resolvedCategory = jtRes.rows[0].category ?? null;
        }
      }

      // ── Create the first assignment in ACTIVE state ──
      // The assignment is 'active' so the PATCH /:id activation flow (which
      // filters ea.status IN ('active','suspended','terminated')) can later
      // find it and flip the employee to active.
      const assignRes = await client.query(
        `INSERT INTO employee_assignments ("employeeId","companyId","branchId","departmentId","jobTitle","jobTitleId",role,salary,"hireDate","isPrimary",status)
         VALUES ($1,$2,$3,$4,$5,$6,'employee',0,$7,true,'active')
         RETURNING id`,
        [empId, effectiveCompanyId, targetBranchId, resolvedDepartmentId, effectiveJobTitle, resolvedJobTitleId, effectiveHireDate]
      );
      const assignmentId = assignRes.rows[0].id;

      // ── Create the onboarding tasks from the job-category profile ──
      // Due date = 7 days from *Riyadh* today. Anchoring on the noon-UTC of
      // todayISO() (the tenant-local date) keeps the +7 a stable calendar
      // offset; a raw `new Date()` would be the UTC date and roll a day early
      // in the evening Riyadh hours (Task #400 class).
      const dueDateOnboarding = new Date(`${todayISO()}T12:00:00Z`);
      dueDateOnboarding.setUTCDate(dueDateOnboarding.getUTCDate() + 7);
      const activationPlan = buildActivationPlan(resolvedCategory);
      for (const task of activationPlan) {
        await client.query(
          `INSERT INTO onboarding_tasks ("companyId","employeeId","assignmentId",title,"dueDate",status,"ownerRole",reason,mandatory,"serviceType")
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9)`,
          [scope.companyId, empId, assignmentId, task.title, toDateISO(dueDateOnboarding), task.ownerRole, task.reason, task.mandatory, task.serviceType ?? null]
        );
      }
      const onboardingTaskCount = activationPlan.length;

      // ── Record the lifecycle event (state → onboarding) ──
      // offer_accepted is the event that maps to the onboarding state
      // (EVENT_TO_STATE_AFTER). The new hire has no prior state, so
      // stateBefore is null.
      await client.query(
        `INSERT INTO employee_lifecycle_events
          ("companyId", "branchId", "employeeId", "assignmentId",
           "eventType", "stateBefore", "stateAfter",
           reason, "effectiveDate",
           "actorUserId", "activeRoleKey", "activeDepartmentId", "resolvedScope", "impersonationSourceUser",
           metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          scope.companyId, targetBranchId ?? null, empId, assignmentId,
          "offer_accepted", null, "onboarding",
          "إنشاء سريع للموظف (تفعيل معلّق)", effectiveHireDate,
          scope.userId,
          scope.selectedRoleKey ?? null,
          scope.activeDepartmentId ?? null,
          scope.resolvedScope ?? null,
          scope.impersonationSourceUser ?? null,
          JSON.stringify({ quickActivate: true }),
        ]
      );

      return { empId, assignmentId, onboardingTaskCount };
    });

    const { empId, assignmentId, onboardingTaskCount } = result;

    // ── Event log ──
    await emitEvent({
      companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
      action: "employee.quick_activated", entity: "employees", entityId: empId,
      details: JSON.stringify({
        empNumber: finalEmpNumber, assignmentId, jobTitle: effectiveJobTitle,
        status: "inactive", onboardingTasks: onboardingTaskCount,
        context: {
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
          activeRoleKey: scope.selectedRoleKey ?? null,
          resolvedScope: scope.resolvedScope ?? null,
        },
      }),
    });

    // ── Audit log ──
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "employee.quick_activated", entity: "employees", entityId: empId,
      activeRoleKey: scope.selectedRoleKey ?? null,
      activeDepartmentId: scope.activeDepartmentId ?? null,
      resolvedScope: scope.resolvedScope ?? null,
      impersonationSourceUser: scope.impersonationSourceUser ?? null,
      after: {
        name, empNumber: finalEmpNumber, jobTitle: effectiveJobTitle,
        status: "inactive", assignmentId, onboardingTasksCreated: onboardingTaskCount,
      },
    });

    // ── Master-data identity (migration 249) ──
    // Link the person to ONE party so an employee who is also a driver/
    // supplier/client resolves to a single 360° record immediately. Non-fatal.
    registerEntityParty(scope.companyId, "employees", empId, "employee", {
      displayName: name, nationalId: nationalId || null,
      phone: phone || null, email: email || null, kind: "person",
    }).catch((e) => logger.error(e, "[partyService] employees registration failed"));

    // ── رابط الاستكمال الذاتي ──
    // حين يتوفّر بريد الموظف، نُصدِر رمزًا مؤقتًا ونرسل له رابطًا يفتح صفحة
    // عامة يملأ فيها بياناته الشخصية (بانتظار مراجعة HR). يُعاد الرابط للمُعيِّن
    // أيضًا لنسخه يدويًا. فشل الإرسال لا يُفشِل الإنشاء (المظف أُنشئ فعلًا).
    let onboardingLink: string | null = null;
    let onboardingWarning: string | null = null;
    if (email) {
      try {
        const issued = await issueOnboardingToken({ companyId: scope.companyId, employeeId: empId, createdBy: scope.userId });
        onboardingLink = issued.url;
        void sendMessage({
          channel: "email",
          recipient: email,
          recipientName: name,
          subject: "استكمال بيانات التوظيف",
          body: `أهلاً ${name},\n\nيرجى استكمال بياناتك الوظيفية عبر الرابط التالي خلال 7 أيام:\n${issued.url}\n\nبعد إرسالك للبيانات ستتم مراجعتها واعتمادها لتفعيل حسابك.`,
          companyId: scope.companyId,
          userId: scope.userId,
          relatedType: "employee",
          relatedId: empId,
          templateKey: "employee.self_onboarding",
        }).catch((e) => logger.error(e, "quick-activate onboarding email failed"));
      } catch (e) {
        if (e instanceof PublicBaseUrlMissingError) {
          onboardingWarning = "أُنشئ الموظف لكن تعذّر إرسال رابط الاستكمال: رابط النظام العام (PUBLIC_BASE_URL) غير مضبوط.";
          logger.error("[quick-activate] PUBLIC_BASE_URL empty — onboarding link not sent");
        } else {
          onboardingWarning = "أُنشئ الموظف لكن تعذّر إصدار رابط الاستكمال.";
          logger.error(e, "[quick-activate] failed to issue onboarding token");
        }
      }
    }

    res.status(201).json({
      id: empId,
      empNumber: finalEmpNumber,
      assignmentId,
      status: "inactive",
      onboardingTasksCreated: onboardingTaskCount,
      onboardingLink,
      ...(onboardingWarning ? { onboardingWarning } : {}),
    });
  } catch (err) {
    handleRouteError(err, res, "Quick-activate employee error:");
  }
});

// ─── مراجعة واعتماد بيانات الاستكمال الذاتي (الدفعة ب) ───────────────────────
// قائمة الموظفين الذين أرسلوا بياناتهم بانتظار المراجعة.
router.get("/self-submissions", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT e.id, e.name, e."empNumber", e."selfSubmittedAt", e."selfSubmittedData",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", b.name AS "branchName"
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."isPrimary" = TRUE AND ea."companyId" = $1
         LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
         LEFT JOIN branches b ON b.id = ea."branchId"
        WHERE e."companyId" = $1 AND e."deletedAt" IS NULL
          AND e."activationStatus" = 'self_submitted'
        ORDER BY e."selfSubmittedAt" ASC NULLS LAST`,
      [scope.companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "قائمة طلبات استكمال البيانات");
  }
});

// اعتماد البيانات المُرسَلة: تُطبَّق الحقول الشخصية على السجل، تُفرَّغ المرحلة
// المؤقتة، وتتقدّم الحالة إلى ready_for_hr_review (التفعيل الفعلي يبقى عبر
// المسار المراجَع الذي يطلق رسالة بداية العمل). لا تمسّ حقول صاحب الشركة.
router.post("/:id/approve-self-data", authorize({ feature: "hr.employees", action: "update", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [emp] = await rawQuery<{ id: number; selfSubmittedData: any; activationStatus: string | null }>(
      `SELECT id, "selfSubmittedData", "activationStatus" FROM employees WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");
    if (!emp.selfSubmittedData) {
      throw new ValidationError("لا توجد بيانات مُرسَلة للاعتماد", { field: "id", fix: "انتظر حتى يرسل الموظف بياناته عبر رابط الاستكمال." });
    }
    const d = emp.selfSubmittedData as Record<string, any>;
    await rawExecute(
      `UPDATE employees SET
         "nationalId" = COALESCE($1, "nationalId"),
         nationality = COALESCE($2, nationality),
         gender = COALESCE($3, gender),
         "dateOfBirth" = COALESCE($4, "dateOfBirth"),
         phone = COALESCE($5, phone),
         "personalEmail" = COALESCE($6, "personalEmail"),
         "iqamaNumber" = COALESCE($7, "iqamaNumber"),
         "iqamaExpiry" = COALESCE($8, "iqamaExpiry"),
         "passportNumber" = COALESCE($9, "passportNumber"),
         "passportExpiry" = COALESCE($10, "passportExpiry"),
         "borderNumber" = COALESCE($11, "borderNumber"),
         "visaNumber" = COALESCE($12, "visaNumber"),
         "visaType" = COALESCE($13, "visaType"),
         "visaExpiry" = COALESCE($14, "visaExpiry"),
         "bankName" = COALESCE($15, "bankName"),
         "bankAccount" = COALESCE($16, "bankAccount"),
         iban = COALESCE($17, iban),
         "emergencyContact" = COALESCE($18, "emergencyContact"),
         "emergencyPhone" = COALESCE($19, "emergencyPhone"),
         attachments = COALESCE($20::jsonb, attachments),
         "selfSubmittedData" = NULL,
         "activationStatus" = 'ready_for_hr_review'
       WHERE id = $21 AND "companyId" = $22 AND "deletedAt" IS NULL`,
      [
        d.nationalId ?? null, d.nationality ?? null, d.gender ?? null, d.dateOfBirth ?? null,
        d.phone ?? null, d.personalEmail ?? null, d.iqamaNumber ?? null, d.iqamaExpiry ?? null,
        d.passportNumber ?? null, d.passportExpiry ?? null, d.borderNumber ?? null,
        d.visaNumber ?? null, d.visaType ?? null, d.visaExpiry ?? null,
        d.bankName ?? null, d.bankAccount ?? null, d.iban ?? null,
        d.emergencyContact ?? null, d.emergencyPhone ?? null,
        d.attachments ? JSON.stringify(d.attachments) : null,
        id, scope.companyId,
      ],
    );
    void createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "employee.self_data_approved", entity: "employees", entityId: id,
      activeRoleKey: scope.selectedRoleKey ?? null,
      before: { activationStatus: emp.activationStatus }, after: { activationStatus: "ready_for_hr_review" },
    }).catch((e) => logger.error(e, "approve-self-data audit failed"));
    res.json({ ok: true, message: "اعتُمدت بيانات الموظف. يمكن الآن تفعيله بعد إكمال خطة التهيئة." });
  } catch (err) {
    handleRouteError(err, res, "اعتماد بيانات الاستكمال الذاتي");
  }
});

// رفض البيانات المُرسَلة: تُفرَّغ المرحلة المؤقتة ويُعاد الموظف لحالة الدعوة
// ليُرسِل من جديد (يُعاد إصدار الرابط من زر الدعوة).
router.post("/:id/reject-self-data", authorize({ feature: "hr.employees", action: "update", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : null;
    const result = await rawExecute(
      `UPDATE employees SET "selfSubmittedData" = NULL, "activationStatus" = 'self_invited'
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND "activationStatus" = 'self_submitted'`,
      [id, scope.companyId],
    );
    if (!result.affectedRows) throw new NotFoundError("لا توجد بيانات مُرسَلة لهذا الموظف");
    void createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "employee.self_data_rejected", entity: "employees", entityId: id,
      activeRoleKey: scope.selectedRoleKey ?? null,
      after: { rejected: true, reason },
    }).catch((e) => logger.error(e, "reject-self-data audit failed"));
    res.json({ ok: true, message: "أُعيدت البيانات للموظف لتصحيحها." });
  } catch (err) {
    handleRouteError(err, res, "رفض بيانات الاستكمال الذاتي");
  }
});

// إعادة إصدار رابط الاستكمال الذاتي (الدفعة هـ). الرابط يُصدَر أول مرة عند
// الإضافة السريعة وينتهي خلال ٧ أيام؛ لو انتهى أو لم يتصرّف الموظف، يعيد HR
// إصداره من هنا. يُبطِل الرمز السابق ويرسل رابطًا جديدًا. لا يُسمح للموظف
// المفعّل (status=active) لأن الاستكمال الذاتي مرحلة ما قبل التفعيل.
router.post("/:id/resend-onboarding-link", authorize({ feature: "hr.employees", action: "update", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [emp] = await rawQuery<{ id: number; name: string; email: string | null; status: string }>(
      `SELECT id, name, email, status FROM employees WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");
    if (emp.status === "active") {
      throw new ValidationError("الموظف مفعّل بالفعل — لا حاجة لرابط استكمال", { field: "id", fix: "رابط الاستكمال للموظفين قبل التفعيل فقط." });
    }
    if (!emp.email) {
      throw new ValidationError("لا يمكن إرسال الرابط: الموظف بلا بريد إلكتروني", { field: "email", fix: "أضف بريد الموظف أولًا من ملفه." });
    }
    const issued = await issueOnboardingToken({ companyId: scope.companyId, employeeId: id, createdBy: scope.userId });
    void sendMessage({
      channel: "email",
      recipient: emp.email,
      recipientName: emp.name,
      subject: "استكمال بيانات التوظيف",
      body: `أهلاً ${emp.name},\n\nيرجى استكمال بياناتك الوظيفية عبر الرابط التالي خلال 7 أيام:\n${issued.url}\n\nبعد إرسالك للبيانات ستتم مراجعتها واعتمادها لتفعيل حسابك.`,
      companyId: scope.companyId,
      userId: scope.userId,
      relatedType: "employee",
      relatedId: id,
      templateKey: "employee.self_onboarding",
    }).catch((e) => logger.error(e, "resend onboarding email failed"));
    void createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "employee.onboarding_link_resent", entity: "employees", entityId: id,
      activeRoleKey: scope.selectedRoleKey ?? null,
      after: { resent: true },
    }).catch((e) => logger.error(e, "resend-onboarding-link audit failed"));
    res.json({ ok: true, onboardingLink: issued.url, message: "أُعيد إرسال رابط الاستكمال للموظف بالبريد" });
  } catch (err) {
    handleRouteError(err, res, "إعادة إرسال رابط الاستكمال");
  }
});

router.post("/", authorize({ feature: "hr.employees", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(createEmployeeSchema.safeParse(req.body));
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
      sourceApplicationId,
      // PR-1 institutional binding (#2077).
      positionId, categoryKey, teamId, projectId, costCenterId, committeeId,
      // RBAC multi-role — operator-selected role keys (optional).
      selectedRoleKeys,
      // الدفعة 3 — توزيع الفروع الاختياري.
      branchAllocations,
      // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure does not require explicit per-field generics; behavior unchanged
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
    if (salary !== undefined && salary !== null) {
      const salaryNum = Number(salary);
      if (salaryNum <= 0) {
        throw new ValidationError("الراتب يجب أن يكون أكبر من صفر", {
          field: "salary",
          fix: "أدخل راتباً موجباً أكبر من صفر",
        });
      }
      if (salaryNum > 1_000_000) {
        throw new ValidationError("الراتب يتجاوز الحد الأقصى المسموح (1,000,000)", {
          field: "salary",
          fix: "تحقق من قيمة الراتب المدخلة",
        });
      }
    }

    if (branchId != null &&
        !scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) &&
        scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(Number(branchId))) {
      throw new ForbiddenError("لا تملك صلاحية إضافة موظفين في هذا الفرع", { field: "branchId" });
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
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [Number(managerId), scope.companyId]
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
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.email = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1`,
        [email, effectiveCompanyId]
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
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e."nationalId" = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1`,
        [nationalId, effectiveCompanyId]
      );
      if (nidRows.length > 0) {
        throw new ConflictError("الرقم مرتبط بموظف آخر", {
          field: "nationalId",
          fix: "تحقق من رقم الهوية أو أدخل رقماً مختلفاً.",
        });
      }
    }

    // HR-005 — recruitment→employee conversion guard. The application is the
    // hiring "draft"; we reject conversion before the transaction so a bad
    // application id never leaves a half-created employee behind. The
    // race-safe re-check inside the transaction is the real lock.
    if (sourceApplicationId) {
      const [application] = await rawQuery<{ id: number; status: string | null; createdEmployeeId: number | null }>(
        `SELECT a.id, a.status, a."createdEmployeeId"
           FROM job_applications a
           LEFT JOIN job_postings jp ON jp.id = a."postingId"
          WHERE a.id = $1 AND (jp."companyId" = $2 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`,
        [Number(sourceApplicationId), scope.companyId]
      );
      if (!application) {
        throw new ValidationError("طلب التوظيف غير موجود", {
          field: "sourceApplicationId",
          fix: "تحقق من طلب التوظيف المصدر.",
        });
      }
      if (application.createdEmployeeId) {
        throw new ConflictError("طلب التوظيف محوّل مسبقاً إلى موظف", {
          field: "sourceApplicationId",
          fix: "هذا الطلب مرتبط بموظف قائم — افتح ملف الموظف بدلاً من إنشاء سجل جديد.",
        });
      }
      if (!["offer", "hired"].includes(String(application.status))) {
        throw new ValidationError("لا يمكن تحويل طلب التوظيف إلى موظف في هذه المرحلة", {
          field: "sourceApplicationId",
          fix: "انقل طلب التوظيف إلى مرحلة العرض أو التوظيف قبل التحويل.",
        });
      }
    }

    // PR-1 (#2077) — institutional binding pre-checks. The wizard forces
    // these in the UI; the API rejects them when missing in a non-empty
    // company so a future caller (script, CSV import, integration) can't
    // skip the institutional anchor that downstream HR engines depend
    // on. Skipped for the very first employee in the company (bootstrap),
    // where the catalog is necessarily empty.
    //
    // Bootstrap discipline (concern #2 from review): the carve-out
    // applies ONLY when the company has zero active assignments. After
    // the first employee lands, activeEmpCount > 0 forever — the
    // carve-out closes, the route enforces all 5 mandatories on every
    // subsequent caller. To make the carve-out auditable (and detect
    // any attempt to abuse it by deleting all employees just to
    // re-open it), we log a structured WARN at info-impact priority
    // with the caller's userId/role when it fires.
    const [{ count: activeEmpCount }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM employee_assignments
        WHERE "companyId" = $1 AND status = 'active'`,
      [effectiveCompanyId]
    );
    const isBootstrapEmployee = Number(activeEmpCount ?? 0) === 0;
    if (isBootstrapEmployee) {
      logger.warn(
        {
          companyId: effectiveCompanyId,
          userId: scope.userId,
          activeRoleKey: scope.selectedRoleKey ?? null,
          name,
        },
        "[employees] bootstrap carve-out fired — first employee in company, institutional mandatoriness skipped. " +
          "This path can only run once per company; subsequent employees MUST supply position/category/team/project/costCenter/manager.",
      );
    }

    if (!isBootstrapEmployee) {
      if (!positionId) {
        throw new ValidationError("المنصب الإداري مطلوب", {
          field: "positionId",
          fix: "اختر منصب الموظف (مدير قسم/نائب/مشرف/…) من القائمة.",
        });
      }
      if (!categoryKey) {
        throw new ValidationError("فئة الموظف مطلوبة", {
          field: "categoryKey",
          fix: "اختر فئة القوى العاملة (موظف/سائق/مدير/…) لتطبيق سياسة الحضور المناسبة.",
        });
      }
      // PR (النظام يَحضُر لا يُحضَر له): الفريق والمشروع ومركز التكلفة
      // ليست حقائق تعيين جوهرية — الفريق والمشروع أمور عارضة تُسنَد لاحقًا
      // عبر عقود العضوية المستقلة (POST /team-memberships, /project-assignments)،
      // ومركز التكلفة يُشتق آليًا من فرع الموظف وصفته في كل فرع (محرّك
      // resolveCostCenter). لذا لا تُفرَض وقت التعيين. تبقى إلزامية: المنصب،
      // فئة الحضور، المدير المباشر — وهي الحقائق المؤسسية الجوهرية للموظف.
      if (!managerId) {
        throw new ValidationError("المدير المباشر مطلوب", {
          field: "managerId",
          fix: "اختر مديراً مباشراً من قائمة الموظفين.",
        });
      }
    }

    if (positionId) {
      const posRows = await rawQuery<{ id: number }>(
        `SELECT id FROM positions
          WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "isActive" = TRUE
          LIMIT 1`,
        [Number(positionId), effectiveCompanyId]
      );
      if (posRows.length === 0) {
        throw new ValidationError(`المنصب رقم ${positionId} غير موجود أو غير مفعّل`, {
          field: "positionId",
          fix: "اختر منصبًا من القائمة (المناصب المُعطَّلة لا تظهر).",
        });
      }
    }

    if (categoryKey) {
      const catRows = await rawQuery<{ categoryKey: string }>(
        `SELECT "categoryKey" FROM employee_categories
          WHERE "categoryKey" = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "isActive" = TRUE
          LIMIT 1`,
        [String(categoryKey), effectiveCompanyId]
      );
      if (catRows.length === 0) {
        throw new ValidationError(`فئة الموظف "${categoryKey}" غير موجودة`, {
          field: "categoryKey",
          fix: "اختر فئة من القائمة المعرَّفة (موظف، سائق، مدير، …).",
        });
      }
    }

    if (teamId) {
      const teamRows = await rawQuery<{ id: number }>(
        `SELECT id FROM teams WHERE id = $1 AND "companyId" = $2 AND "isActive" = TRUE LIMIT 1`,
        [Number(teamId), effectiveCompanyId]
      );
      if (teamRows.length === 0) {
        throw new ValidationError(`الفريق رقم ${teamId} غير موجود`, {
          field: "teamId",
          fix: "اختر فريقًا تابعًا لشركتك من الإعدادات → الفِرَق.",
        });
      }
    }

    if (projectId) {
      const projRows = await rawQuery<{ id: number }>(
        `SELECT id FROM projects WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(projectId), effectiveCompanyId]
      );
      if (projRows.length === 0) {
        throw new ValidationError(`المشروع رقم ${projectId} غير موجود`, {
          field: "projectId",
          fix: "اختر مشروعًا تابعًا لشركتك من قائمة المشاريع.",
        });
      }
    }

    if (costCenterId) {
      const ccRows = await rawQuery<{ id: number }>(
        `SELECT id FROM cost_centers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(costCenterId), effectiveCompanyId]
      );
      if (ccRows.length === 0) {
        throw new ValidationError(`مركز التكلفة رقم ${costCenterId} غير موجود`, {
          field: "costCenterId",
          fix: "اختر مركز تكلفة تابعًا لشركتك من المالية → مراكز التكلفة.",
        });
      }
    }

    if (committeeId) {
      const comRows = await rawQuery<{ id: number }>(
        `SELECT id FROM committees WHERE id = $1 AND "companyId" = $2 AND "isActive" = TRUE LIMIT 1`,
        [Number(committeeId), effectiveCompanyId]
      );
      if (comRows.length === 0) {
        throw new ValidationError(`اللجنة رقم ${committeeId} غير موجودة`, {
          field: "committeeId",
          fix: "اختر لجنة مفعّلة تابعة لشركتك أو اترك الحقل فارغًا.",
        });
      }
    }

    // Numbering center (Issue #1141) — employee code via central
    // authority (`hr.employee_code`). Issued OUTSIDE the transaction
    // so the numbering counter advances even if the employee insert
    // fails later; the assignment is left orphaned (entityId NULL)
    // and is detectable from the audit view if needed. The route
    // still accepts a user-provided `empNumber` for legacy imports.
    let preIssuedEmpNumber: string | null = empNumber ?? null;
    let preIssued: Awaited<ReturnType<typeof issueNumber>> | null = null;
    if (!preIssuedEmpNumber) {
      preIssued = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "hr",
        entityKey: "employee_code",
        entityTable: "employees",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      preIssuedEmpNumber = preIssued.number;
    }

    // Migration 248 — split the email field into 3 roles:
    //  - internalEmail: user-account login (employees.internalEmail)
    //  - personalEmail: contact (employees.personalEmail)
    //  - email: legacy fallback (employees.email) for back-compat.
    // The user account (Step 8) chooses internalEmail when present,
    // else falls back to email.
    const internalEmailIn = ((body as any).internalEmail as string | null | undefined) || null;
    const personalEmailIn = ((body as any).personalEmail as string | null | undefined) || null;

    // ── الدفعة 3 — التحقق من توزيع الفروع (قبل المعاملة لرسالة خطأ نظيفة) ──
    // حين يختار المُعيِّن «توزيع متعدد»، نتحقق: نِسَب مجموعها 100%، بلا فرع
    // مكرر، وكل فرع (ومركز التكلفة إن حُدّد) تابع للشركة. هذا يضمن أن محرّك
    // الرواتب (الدفعة 2ب) يجد تخصيصات سليمة قابلة للتوزيع.
    let normalizedAllocations:
      | Array<{ branchId: number; capacity: string | null; percent: number; costCenterId: number | null }>
      | null = null;
    if (Array.isArray(branchAllocations) && branchAllocations.length > 0) {
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const sumPct = round2(branchAllocations.reduce((s: number, a: any) => s + Number(a.allocationPercent || 0), 0));
      if (sumPct !== 100) {
        throw new ValidationError("مجموع نِسَب توزيع الفروع يجب أن يساوي 100%", {
          field: "branchAllocations",
          fix: `المجموع الحالي ${sumPct}%. عدّل النِسَب لتساوي 100%.`,
        });
      }
      const branchIds = branchAllocations.map((a: any) => Number(a.branchId));
      if (new Set(branchIds).size !== branchIds.length) {
        throw new ValidationError("لا يجوز تكرار الفرع في التوزيع", {
          field: "branchAllocations",
          fix: "اجعل لكل فرع صفًا واحدًا فقط في التوزيع.",
        });
      }
      const validBranches = await rawQuery<{ id: number }>(
        `SELECT id FROM branches WHERE id = ANY($1::int[]) AND "companyId" = $2`,
        [[...new Set(branchIds)], effectiveCompanyId]
      );
      const validBranchSet = new Set(validBranches.map((b) => b.id));
      const ccIds = branchAllocations.map((a: any) => (a.costCenterId ? Number(a.costCenterId) : null)).filter((x: number | null): x is number => x != null);
      const validCcSet = new Set<number>();
      if (ccIds.length > 0) {
        const validCcs = await rawQuery<{ id: number }>(
          `SELECT id FROM cost_centers WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [[...new Set(ccIds)], effectiveCompanyId]
        );
        for (const c of validCcs) validCcSet.add(c.id);
      }
      normalizedAllocations = branchAllocations.map((a: any) => {
        const bId = Number(a.branchId);
        if (!validBranchSet.has(bId)) {
          throw new ValidationError(`الفرع رقم ${bId} غير موجود`, { field: "branchAllocations", fix: "اختر فروعًا تابعة لشركتك." });
        }
        const ccId = a.costCenterId ? Number(a.costCenterId) : null;
        if (ccId != null && !validCcSet.has(ccId)) {
          throw new ValidationError(`مركز التكلفة رقم ${ccId} غير موجود`, { field: "branchAllocations", fix: "اختر مركز تكلفة تابعًا لشركتك أو اتركه فارغًا ليُشتق من الفرع." });
        }
        return { branchId: bId, capacity: a.capacity ? String(a.capacity) : null, percent: round2(Number(a.allocationPercent)), costCenterId: ccId };
      });
    }

    const result = await withTransaction(async (client) => {
      const finalEmpNumber = preIssuedEmpNumber!;

      // ── Step 2: Create the employee record ──
      const empRes = await client.query(
        `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", gender, nationality, "dateOfBirth", status,
         "iqamaNumber","iqamaExpiry","passportNumber","passportExpiry",
         "borderNumber","visaNumber","visaType","visaExpiry",
         "sponsorNumber","workPermitNumber","workPermitExpiry","iqamaStatus",
         "bankName","bankAccount",iban,"emergencyContact","emergencyPhone",attachments,
         "personalEmail","internalEmail")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active',
         $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26,$27,$28)
         RETURNING id`,
        [name, phone || null, email || null, finalEmpNumber, nationalId || null, gender || null, nationality || null, dateOfBirth || null,
         iqamaNumber || null, iqamaExpiry || null, passportNumber || null, passportExpiry || null,
         borderNumber || null, visaNumber || null, visaType || null, visaExpiry || null,
         sponsorNumber || null, workPermitNumber || null, workPermitExpiry || null, iqamaStatus || 'active',
         bankName || null, bankAccount || null, iban || null, emergencyContact || null, emergencyPhone || null,
         // as-any-reason: justified-pragmatic - defensive read of optional attachments field on parsed body; behavior unchanged
         (body as any).attachments ? JSON.stringify((body as any).attachments) : null,
         personalEmailIn, internalEmailIn]
      );
      const empId = empRes.rows[0].id;

      // Link the numbering assignment to the employee row (if one was
      // issued — `empNumber` may have been supplied for legacy imports).
      if (preIssued) {
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [empId, preIssued.assignmentId]
        );
      }

      // ── HR-005: link the source recruitment application ──
      // Race-safe: the `createdEmployeeId IS NULL` predicate makes a
      // concurrent second conversion of the same application affect 0 rows,
      // which throws here and rolls back the whole employee creation.
      if (sourceApplicationId) {
        const linkRes = await client.query(
          `UPDATE job_applications
              SET "createdEmployeeId" = $1, "onboardedAt" = NOW()
            WHERE id = $2 AND "createdEmployeeId" IS NULL AND "deletedAt" IS NULL`,
          [empId, Number(sourceApplicationId)]
        );
        if (linkRes.rowCount !== 1) {
          throw new ConflictError("طلب التوظيف محوّل مسبقاً إلى موظف", {
            field: "sourceApplicationId",
            fix: "هذا الطلب مرتبط بموظف قائم — افتح ملف الموظف بدلاً من إنشاء سجل جديد.",
          });
        }
      }

      // ── Step 3: Create first assignment ──
      // as-any-reason: justified-pragmatic - defensive read of optional jobTitleId field on parsed body; behavior unchanged
      let resolvedJobTitleId = (body as any).jobTitleId ?? null;
      if (!resolvedJobTitleId && jobTitle && jobTitle !== "موظف") {
        const jtRes = await client.query(
          `SELECT id FROM job_titles WHERE name = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
          [jobTitle, effectiveCompanyId]
        );
        if (jtRes.rows.length > 0) resolvedJobTitleId = jtRes.rows[0].id;
      }
      // Resolve the job category for the activation plan (HR-REV-4 §1). Falls
      // back to categoryKey (attendance category) when the title has none.
      let resolvedCategory: string | null = null;
      if (resolvedJobTitleId) {
        const catRes = await client.query(`SELECT category FROM job_titles WHERE id = $1 LIMIT 1`, [resolvedJobTitleId]);
        resolvedCategory = catRes.rows[0]?.category ?? null;
      }
      if (!resolvedCategory && categoryKey) resolvedCategory = String(categoryKey);

      const assignRes = await client.query(
        `INSERT INTO employee_assignments ("employeeId","companyId","branchId","departmentId","jobTitle","jobTitleId",role,salary,"hireDate","isPrimary",status,"managerId","positionId","categoryKey")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'active',$10,$11,$12)
         RETURNING id`,
        [empId, effectiveCompanyId, targetBranchId, resolvedDepartmentId, jobTitle, resolvedJobTitleId, role, Number(salary), effectiveHireDate, managerId ? Number(managerId) : null,
         positionId ? Number(positionId) : null, categoryKey || null]
      );
      const assignmentId = assignRes.rows[0].id;

      // ── تخصيص الفروع (الدفعة 1 + 3) ──
      // النموذج الموحّد لاشتقاق مركز التكلفة: علاقة الموظف↔الفرع كتخصيصات.
      //   • توزيع متعدد (الدفعة 3): المُعيِّن اختار عدة فروع بنِسَب مجموعها 100%
      //     — نُدرج صفًا لكل فرع، والأساسي هو فرع الموظف الرئيسي إن كان ضمنها
      //     وإلا أول صف. مركز التكلفة لكل صف: تجاوز صريح أو يُشتق وقت الترحيل.
      //   • الافتراضي (الدفعة 1): فرع رئيسي واحد (100%). مركز التكلفة NULL
      //     ليُشتق آليًا من الفرع وقت ترحيل الرواتب. لا يُنشأ إن غاب الفرع.
      if (normalizedAllocations && normalizedAllocations.length > 0) {
        const primaryBranchId = normalizedAllocations.some((a) => a.branchId === targetBranchId)
          ? targetBranchId
          : normalizedAllocations[0].branchId;
        for (const a of normalizedAllocations) {
          await client.query(
            `INSERT INTO employee_branch_allocations
               ("companyId","employeeId","assignmentId","branchId",capacity,"allocationPercent","costCenterId","isPrimary","startDate","createdBy")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT ("assignmentId","branchId","startDate") DO NOTHING`,
            [effectiveCompanyId, empId, assignmentId, a.branchId, a.capacity, a.percent, a.costCenterId, a.branchId === primaryBranchId, effectiveHireDate, scope.activeAssignmentId ?? null]
          );
        }
      } else if (targetBranchId) {
        await client.query(
          `INSERT INTO employee_branch_allocations
             ("companyId","employeeId","assignmentId","branchId",capacity,"allocationPercent","isPrimary","startDate","createdBy")
           VALUES ($1,$2,$3,$4,$5,100.00,TRUE,$6,$7)
           ON CONFLICT ("assignmentId","branchId","startDate") DO NOTHING`,
          [effectiveCompanyId, empId, assignmentId, targetBranchId, categoryKey || null, effectiveHireDate, scope.activeAssignmentId ?? null]
        );
      }

      // ── PR-1 (#2077) Step 3b — institutional bridges (team/project/committee) ──
      // These rows close the «الموظف ككيان تشغيلي مؤسسي» chain at create
      // time so the engineer never has to remember a follow-up step:
      //   - team_membership: which sub-unit inside the department.
      //   - project_assignment: which operational project + cost-center.
      //   - committee_membership: optional. Cross-department council.
      // All three carry endDate=NULL so they auto-end when an admin
      // closes them (the existing DELETE handlers set endDate=today).
      if (teamId) {
        await client.query(
          `INSERT INTO employee_team_memberships ("assignmentId","teamId",role,"startDate")
           VALUES ($1,$2,'member',$3)
           ON CONFLICT ("assignmentId","teamId") DO NOTHING`,
          [assignmentId, Number(teamId), effectiveHireDate]
        );
      }
      if (projectId) {
        await client.query(
          `INSERT INTO employee_project_assignments ("assignmentId","projectId",role,"allocationPercent","startDate","costCenterId")
           VALUES ($1,$2,'contributor',100,$3,$4)`,
          [assignmentId, Number(projectId), effectiveHireDate, costCenterId ? Number(costCenterId) : null]
        );
      }
      if (committeeId) {
        await client.query(
          `INSERT INTO employee_committee_memberships ("assignmentId","committeeId",role,"isVoting","startDate")
           VALUES ($1,$2,'member',TRUE,$3)
           ON CONFLICT ("assignmentId","committeeId") DO NOTHING`,
          [assignmentId, Number(committeeId), effectiveHireDate]
        );
      }

      // ── Step 4: Initialize leave balances (10 types) ──
      const leaveTypesRes = await client.query(
        `SELECT id, "annualDays" FROM hr_leave_types WHERE "companyId" = $1`,
        [effectiveCompanyId]
      );
      const year = currentYear();
      if (leaveTypesRes.rows.length > 0) {
        const valuesSql: string[] = [];
        const params: unknown[] = [];
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
        `SELECT id FROM shifts WHERE "companyId" = $1 AND "isDefault" = true AND status = 'active' AND "deletedAt" IS NULL LIMIT 1`,
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
      // G11 fix (Issue #1141 coverage report 2026-05-27 §3 G11) —
      // issue a real contract ref through the numbering center so the
      // onboarding-created contract has the same audit trail as the
      // manual creation path in hr-contracts.ts. Scheme:
      // `hr.employee_contract` (seeded by migration 213).
      const probEnd = new Date(effectiveHireDate);
      probEnd.setDate(probEnd.getDate() + Number(probationDays));
      const issuedContract = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "hr",
        entityKey: "employee_contract",
        entityTable: "employee_contracts",
        actorId: scope.userId,
        metadata: { onboardingEmployeeId: empId },
        expectedTiming: "on_draft",
      });
      const contractRes = await client.query(
        `INSERT INTO employee_contracts ("companyId","employeeId","assignmentId","contractType","startDate","probationEndDate","probationStatus",status,ref)
         VALUES ($1,$2,$3,$4,$5,$6,'active','active',$7) RETURNING id`,
        [scope.companyId, empId, assignmentId, contractType, effectiveHireDate, toDateISO(probEnd), issuedContract.number]
      );
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [contractRes.rows[0].id, issuedContract.assignmentId]
      );

      // ── Step 7: Create the onboarding tasks from the job-category profile ──
      // Due date = 7 days from Riyadh today (noon-UTC anchor keeps the offset
      // stable; a raw new Date() would be the UTC date — Task #400 class).
      const dueDateOnboarding = new Date(`${todayISO()}T12:00:00Z`);
      dueDateOnboarding.setUTCDate(dueDateOnboarding.getUTCDate() + 7);
      const activationPlan = buildActivationPlan(resolvedCategory);
      for (const task of activationPlan) {
        await client.query(
          `INSERT INTO onboarding_tasks ("companyId","employeeId","assignmentId",title,"dueDate",status,"ownerRole",reason,mandatory,"serviceType")
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9)`,
          [scope.companyId, empId, assignmentId, task.title, toDateISO(dueDateOnboarding), task.ownerRole, task.reason, task.mandatory, task.serviceType ?? null]
        );
      }
      const onboardingTaskCount = activationPlan.length;

      // ── Step 8: Auto-create user account ──
      // Login email priority: explicit internalEmail > legacy email.
      // Operators who set BOTH internalEmail + personalEmail want the
      // user to log in with the internal one and keep the personal as
      // a contact, not a credential.
      const loginEmail = internalEmailIn || email || null;
      let userId: number | null = null;
      let createdNewUser = false;
      if (loginEmail) {
        const existingUser = await client.query(`SELECT id FROM users WHERE email=$1`, [loginEmail]);
        if (existingUser.rows.length === 0) {
          // #2137 — NEVER store or email a known/guessable temporary
          // password. Create the account with an unguessable random
          // password the user never sees, then (post-commit) email a
          // single-use invitation link so they set their own. Mirrors the
          // admin user-create flow (admin.ts).
          const unknownPassword = randomBytes(16).toString("hex");
          const hashedPw = await hashPassword(unknownPassword);
          const userRes = await client.query(
            `INSERT INTO users (email, "passwordHash", role, "employeeId", "isActive") VALUES ($1,$2,$3,$4,true) RETURNING id`,
            [loginEmail, hashedPw, role || "employee", empId]
          );
          userId = userRes.rows[0].id;
          createdNewUser = true;
        } else {
          userId = existingUser.rows[0].id;
          await client.query(`UPDATE users SET "employeeId"=$1 WHERE id=$2`, [empId, userId]);
        }
      }

      // ── Step 8a: Job-title-driven defaults ──
      // When the picked job_title has defaultRoleKey set and the body
      // didn't override `role`, prefer the job-title default. Same for
      // opensCustody — flips on the auto-custody flag.
      let opensCustody = Boolean((body as any).createCustodyAccount);
      let defaultRoleKeyFromJob: string | null = null;
      if (resolvedJobTitleId) {
        const [jt] = await client.query<{ defaultRoleKey: string | null; opensCustody: boolean }>(
          `SELECT "defaultRoleKey", "opensCustody" FROM job_titles WHERE id = $1`,
          [resolvedJobTitleId]
        ).then(r => r.rows as Array<{ defaultRoleKey: string | null; opensCustody: boolean }>);
        defaultRoleKeyFromJob = jt?.defaultRoleKey ?? null;
        if (jt?.defaultRoleKey && (!role || role === "employee")) {
          // Re-apply the role only on the assignment we just inserted.
          await client.query(
            `UPDATE employee_assignments SET role = $1 WHERE id = $2`,
            [jt.defaultRoleKey, assignmentId]
          );
        }
        if (jt?.opensCustody) opensCustody = true;
      }

      // ── Step 8a-bis: Grant the RBAC v2 role (the real access) ──
      // Historically the normal "create employee" flow only ever set the
      // legacy `employee_assignments.role` / `users.role` strings and NEVER
      // inserted an rbac_user_roles row. Since RBAC v2 (checkAccess) is the
      // enforcement authority, that left freshly-created employees able to
      // log in and SEE the modules their role implies (via the predefined
      // fallback in /permissions/my) but blocked with 403 on every actual
      // action — "الخدمات تظهر لكن غير فعّالة". HR then had to go to the
      // separate /admin/user-onboarding screen to grant the role by hand.
      //
      // Now we close that gap atomically: resolve the effective role key
      // (job-title defaultRoleKey wins when the body didn't override) to an
      // rbac_roles row and bind it in rbac_user_roles — exactly what
      // /admin/onboard does. Soft-skip (warn) when the key has no rbac role
      // so employee creation never fails just because a role is unmapped.
      // Bind the RBAC role for EVERY employee that has a login user — not
      // only freshly-created ones. The old `createdNewUser && userId` gate
      // meant linking an employee to a pre-existing user account skipped
      // the role bind entirely, leaving that employee with zero grants
      // (only the self-service floor) — "موظف جديد بلا صلاحيات". RBAC is
      // user-scoped, so when there is no userId there is nothing to bind.
      if (userId) {
        // Two modes, one central authority (rbacService.grantUserRole, owned by
        // the RBAC path — HR only chooses which roles, never how they're bound
        // or how SoD is enforced). grantUserRole's rawQuery/rawExecute join THIS
        // transaction via rawdb's AsyncLocalStorage executor binding, so every
        // bind commits/rolls back with the rest of the employee creation.
        const pickedRoleKeys = Array.isArray(selectedRoleKeys)
          ? (selectedRoleKeys as string[]).map((k) => String(k).trim()).filter(Boolean)
          : [];

        if (pickedRoleKeys.length > 0) {
          // ── Multi-role mode ── grant EACH selected role; soft-fail per role.
          // A role rejected by SoD (or unmapped) is skipped with a warning and
          // left for the admin to assign — the employee is still created and the
          // other roles are still granted. De-dupe so the same key can't claim
          // primary twice. The first SUCCESSFULLY granted role is is_primary.
          const seen = new Set<string>();
          let primaryClaimed = false;
          for (const key of pickedRoleKeys) {
            if (seen.has(key)) continue;
            seen.add(key);
            const result = await grantUserRole({
              userId,
              roleKey: key,
              companyId: effectiveCompanyId,
              branchId: targetBranchId,
              departmentId: resolvedDepartmentId,
              assignedBy: scope.userId,
              isPrimary: !primaryClaimed,
            });
            if (result.ok) {
              primaryClaimed = true;
            } else {
              logger.warn(
                { roleKey: key, companyId: effectiveCompanyId, userId, reason: result.error, detail: result.reasonAr },
                "[employees] selected role not granted (soft-skip) — employee created, role left for admin"
              );
            }
          }
          if (!primaryClaimed) {
            logger.warn(
              { selectedRoleKeys: pickedRoleKeys, companyId: effectiveCompanyId, userId },
              "[employees] none of the selected roles could be granted — employee has only the self-service floor; assign manually via /admin/users"
            );
          }
        } else {
          // ── Legacy single-role mode (unchanged behaviour) ── derive one
          // effective role key (job-title defaultRoleKey wins when the body
          // didn't override) and bind it through the same central service.
          const effectiveRoleKey =
            (defaultRoleKeyFromJob && (!role || role === "employee"))
              ? defaultRoleKeyFromJob
              : (role || "employee");
          const result = await grantUserRole({
            userId,
            roleKey: effectiveRoleKey,
            companyId: effectiveCompanyId,
            branchId: targetBranchId,
            departmentId: resolvedDepartmentId,
            assignedBy: scope.userId,
            isPrimary: true,
          });
          if (!result.ok) {
            logger.warn(
              { roleKey: effectiveRoleKey, companyId: effectiveCompanyId, userId, reason: result.error, detail: result.reasonAr },
              "[employees] effective role not auto-granted (soft-skip); assign manually via /admin/users"
            );
          }
        }
      }

      // ── Step 8b: Open employee subsidiary custody account ──
      // When opensCustody is true (either passed in or job-title-driven),
      // INSERT a subsidiary_accounts row pointing the employee at the
      // canonical custody chart account (1400 or whatever the company's
      // accountingMappings resolves for "custody_account"). Finance then
      // posts every later advance through this sub-account so the
      // balance-sheet drill-down stays per-person, not pooled. Failure
      // here is a soft warning — the employee record still exists.
      if (opensCustody) {
        try {
          const [coaRow] = await client.query<{ id: number; code: string }>(
            `SELECT id, code FROM chart_of_accounts
              WHERE "companyId" = $1 AND code = '1400' AND "deletedAt" IS NULL
              LIMIT 1`,
            [effectiveCompanyId]
          ).then(r => r.rows as Array<{ id: number; code: string }>);
          if (coaRow) {
            await client.query(
              `INSERT INTO subsidiary_accounts
                 ("companyId", "entityType", "entityId", "accountType", "accountId", "isActive")
               VALUES ($1, 'employee', $2, 'custody', $3, true)
               ON CONFLICT DO NOTHING`,
              [effectiveCompanyId, empId, coaRow.id]
            );
          } else {
            logger.warn({ companyId: effectiveCompanyId }, "[employees] chart_of_accounts 1400 missing — custody sub-account skipped");
          }
        } catch (e) {
          logger.warn(e, "[employees] subsidiary custody account create failed");
        }
      }

      // ── Step 8c: Driver-vehicle binding ──
      // When the new employee is a driver and the operator chose a
      // vehicle in the form, validate the vehicle belongs to the same
      // company, then ensure a fleet_drivers row linked to this employee
      // (INSERT … ON CONFLICT DO NOTHING) so the existing driver-detail
      // and assignment screens pick the person up without a new entity.
      const wantsVehicle = ((body as any).vehicleId as number | null | undefined) ?? null;
      const effectiveRole = role || "employee";
      if (wantsVehicle && (effectiveRole === "driver" || effectiveRole === "fleet_driver")) {
        try {
          const [veh] = await client.query<{ id: number }>(
            `SELECT id FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
            [Number(wantsVehicle), effectiveCompanyId]
          ).then(r => r.rows as Array<{ id: number }>);
          if (veh) {
            // Match the existing fleet_drivers.linkedEmployeeId pattern
            // (fleet route uses it for the trip-complete + violation
            // flow) — INSERT or UPDATE the link via fleet_drivers.
            await client.query(
              `INSERT INTO fleet_drivers (name, phone, "companyId", "employeeId", status)
               VALUES ($1, $2, $3, $4, 'available')
               ON CONFLICT DO NOTHING`,
              [name, phone || null, effectiveCompanyId, empId]
            ).catch(() => undefined);
          } else {
            logger.warn({ vehicleId: wantsVehicle }, "[employees] vehicleId not in company — skipping driver binding");
          }
        } catch (e) {
          logger.warn(e, "[employees] driver-vehicle binding failed");
        }
      }

      // ── Step 8b: Bind PBX extension (real comms integration) ──
      // Either link a chosen unassigned extension or mint a new one, so
      // the employee is reachable on the connected PBX from day one.
      const wantsExtensionId = ((body as any).pbxExtensionId as number | null | undefined) ?? null;
      const wantsExtensionNew = ((body as any).pbxExtensionNew as string | null | undefined)?.trim() || null;
      if (wantsExtensionId) {
        await client.query(
          `UPDATE pbx_extensions
              SET "employeeId" = $1, "updatedAt" = NOW()
            WHERE id = $2 AND "companyId" = $3 AND "employeeId" IS NULL`,
          [empId, Number(wantsExtensionId), effectiveCompanyId]
        ).catch((e) => logger.warn(e, "[employees] pbx extension bind failed"));
      } else if (wantsExtensionNew) {
        await client.query(
          `INSERT INTO pbx_extensions ("companyId", extension, name, "employeeId", type, status)
           VALUES ($1, $2, $3, $4, 'employee', 'active')
           ON CONFLICT DO NOTHING`,
          [effectiveCompanyId, wantsExtensionNew, name, empId]
        ).catch((e) => logger.warn(e, "[employees] pbx extension create failed"));
      }

      // ── Step 9: Copy active company salary components to the new employee ──
      const compSalaryComponents = await client.query(
        `SELECT id FROM salary_components WHERE "companyId" = $1 AND "isActive" = true`,
        [effectiveCompanyId]
      );
      if (compSalaryComponents.rows.length > 0) {
        const valuesSql: string[] = [];
        const params: unknown[] = [];
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
        ).catch((e) => logger.error(e, "employees background task failed"));
      }

      return { empId, assignmentId, finalEmpNumber, userId, createdNewUser, loginEmail, onboardingTaskCount };
    });

    const { empId, assignmentId, finalEmpNumber, userId, createdNewUser, loginEmail, onboardingTaskCount } = result;
    let accountInviteWarning: string | null = null;

    // ── Master-data identity (migration 249) ──
    // Link the person to ONE party (dedupe across driver/supplier/client/…).
    // Non-fatal: a registry-link failure must not block onboarding.
    registerEntityParty(scope.companyId, "employees", empId, "employee", {
      displayName: name, nationalId: nationalId || null,
      phone: phone || null, email: email || null, kind: "person",
    }).catch((e) => logger.error(e, "[partyService] employees onboard registration failed"));

    // ── Step 8: Notify manager and HR ──
    const managerAssignmentId = await getManagerAssignmentId(scope.companyId, targetBranchId);
    if (managerAssignmentId) {
      createNotification({
        companyId: scope.companyId, assignmentId: managerAssignmentId,
        type: "employee_created", title: "موظف جديد في فريقك",
        body: `تم إضافة الموظف ${name} (${finalEmpNumber}) إلى فريقك. يرجى متابعة مهام التهيئة.`,
        priority: "high", refType: "employee", refId: empId,
      }).catch((e) => logger.error(e, "employees background task failed"));
    }
    const [hrAssignment] = await rawQuery<{ id: number }>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 ELSE 2 END LIMIT 1`,
      [scope.companyId]
    );
    const hrTargetId = hrAssignment?.id ?? scope.activeAssignmentId;
    createNotification({
      companyId: scope.companyId, assignmentId: hrTargetId,
      type: "employee_created", title: "تم إضافة موظف جديد — مطلوب متابعة HR",
      body: `تم إضافة الموظف ${name} برقم ${finalEmpNumber} بنجاح. تم إنشاء ${onboardingTaskCount} مهام تهيئة. يرجى مراجعة ملف الموظف.`,
      priority: "high", refType: "employee", refId: empId,
    }).catch((e) => logger.error(e, "employees background task failed"));
    if (hrTargetId !== scope.activeAssignmentId) {
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "employee_created", title: "تم إضافة موظف جديد",
        body: `تم إضافة الموظف ${name} برقم ${finalEmpNumber} بنجاح.`,
        priority: "low", refType: "employee", refId: empId,
      }).catch((e) => logger.error(e, "employees background task failed"));
    }

    // ── Step 9: Welcome notification/email ──
    createNotification({
      companyId: scope.companyId, assignmentId,
      type: "welcome", title: "مرحباً في فريق العمل",
      body: `أهلاً ${name}، رقمك الوظيفي ${finalEmpNumber}. يسعدنا انضمامك إلى الفريق. فترة التجربة: ${probationDays} يوم.`,
      priority: "normal", refType: "employee", refId: empId,
    }).catch((e) => logger.error(e, "employees background task failed"));
    if (email) {
      void sendMessage({
        channel: "email",
        recipient: email,
        recipientName: name,
        subject: `مرحباً في فريق العمل - ${finalEmpNumber}`,
        body: `أهلاً ${name}،\n\nرقمك الوظيفي: ${finalEmpNumber}\nالمسمى الوظيفي: ${jobTitle}\nتاريخ الالتحاق: ${effectiveHireDate}\nفترة التجربة: ${probationDays} يوم\n\nيسعدنا انضمامك إلى الفريق.`,
        companyId: scope.companyId,
        userId: scope.userId,
        relatedType: "employee",
        relatedId: empId,
        templateKey: "employee.welcome",
      }).catch((e) => logger.error(e, "employees background task failed"));
    }
    if (createdNewUser && loginEmail) {
      // #2137 — send a single-use invitation LINK (set-your-own-password)
      // instead of a raw temporary password. issueAuthToken builds the
      // link first, so an empty PUBLIC_BASE_URL fails BEFORE any token row
      // is written; we surface a warning rather than emailing a broken
      // link. Mirrors POST /admin/users.
      try {
        const issued = await issueAuthToken({ userId, email: loginEmail, purpose: "invitation" });
        await sendAuthEmail({
          companyId: scope.companyId,
          userId: scope.userId,
          recipientEmail: loginEmail,
          recipientName: name,
          templateKey: "auth.new_user_invitation.email",
          vars: {
            userName: name,
            activationUrl: issued.url,
            expiresHours: String(TOKEN_TTL_MINUTES.invitation / 60),
          },
        });
      } catch (e) {
        if (e instanceof PublicBaseUrlMissingError) {
          accountInviteWarning = "أُنشئ حساب الموظف لكن تعذّر إرسال رابط الدعوة: رابط النظام العام (PUBLIC_BASE_URL) غير مضبوط.";
          logger.error("[employees] PUBLIC_BASE_URL empty — invitation link not sent");
        } else {
          logger.error(e, "[employees] failed to send invitation email");
          accountInviteWarning = "أُنشئ حساب الموظف لكن تعذّر إرسال رابط الدعوة.";
        }
      }
    }

    // ── Step 10: Event log ──
    // PR-1 (#2077) — event_logs has no columns for branchId / activeRole,
    // so the IGOC context rides on `details.context` alongside the
    // institutional binding. Critical-event listeners + the inbox can
    // then key on either.
    await emitEvent({
      companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
      action: "employee.created", entity: "employees", entityId: empId,
      details: JSON.stringify({
        empNumber: finalEmpNumber, assignmentId, jobTitle, role, salary,
        onboardingTasks: onboardingTaskCount, probationDays: Number(probationDays),
        // PR-1 (#2077) — institutional binding in the event so audit
        // dashboards can answer «who got bound to project X this month?»
        positionId: positionId ? Number(positionId) : null,
        categoryKey: categoryKey || null,
        teamId: teamId ? Number(teamId) : null,
        projectId: projectId ? Number(projectId) : null,
        costCenterId: costCenterId ? Number(costCenterId) : null,
        committeeId: committeeId ? Number(committeeId) : null,
        // PR-1 (#2077) — actor context (الشركة/الفرع/الدور النشط/المستخدم).
        // event_logs.companyId+userId already carry two of them; we
        // bundle the remaining two (branch + active role) into details
        // so the row is self-describing.
        context: {
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
          activeRoleKey: scope.selectedRoleKey ?? null,
          activeDepartmentId: scope.activeDepartmentId ?? null,
          resolvedScope: scope.resolvedScope ?? null,
          impersonationSourceUser: scope.impersonationSourceUser ?? null,
        },
      }),
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
    // PR-1 (#2077) — IGOC quartet: persist the four context fields
    // (active role, active department, resolved scope, impersonation
    // source) alongside the institutional binding so a forensic
    // question («who, under which role, in which scope, on behalf of
    // whom, bound this employee to project X?») is answerable from
    // one row of audit_logs.
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employees", entityId: empId,
      activeRoleKey: scope.selectedRoleKey ?? null,
      activeDepartmentId: scope.activeDepartmentId ?? null,
      resolvedScope: scope.resolvedScope ?? null,
      impersonationSourceUser: scope.impersonationSourceUser ?? null,
      after: {
        name, empNumber: finalEmpNumber, jobTitle, role, salary,
        contractType, probationDays: Number(probationDays),
        positionId: positionId ? Number(positionId) : null,
        categoryKey: categoryKey || null,
        teamId: teamId ? Number(teamId) : null,
        projectId: projectId ? Number(projectId) : null,
        costCenterId: costCenterId ? Number(costCenterId) : null,
        committeeId: committeeId ? Number(committeeId) : null,
        managerId: managerId ? Number(managerId) : null,
      },
    });

    // ── Step 11b: HR-005 — recruitment conversion event + audit ──
    if (sourceApplicationId) {
      await emitEvent({
        companyId: scope.companyId, userId: scope.userId,
        action: "recruitment.application.converted_to_employee",
        entity: "job_applications", entityId: Number(sourceApplicationId),
        details: JSON.stringify({ sourceApplicationId: Number(sourceApplicationId), createdEmployeeId: empId, empNumber: finalEmpNumber }),
      });
      await createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "convert", entity: "job_applications", entityId: Number(sourceApplicationId),
        after: { createdEmployeeId: empId, empNumber: finalEmpNumber, sourceApplicationId: Number(sourceApplicationId) },
      });
    }

    // ── Step 12: Auto-create subsidiary accounting accounts ──
    createSubsidiaryAccountsForEntity(scope.companyId, "employee", empId, name, { branchId: scope.branchId, actorUserId: scope.userId }).catch((e) => logger.error(e, "employees background task failed"));

    const [employee] = await rawQuery<EmployeeListRow>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status,
              ea."jobTitle", ea.role, ea.salary, ea."branchId",
              b.name AS "branchName"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $2
       LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = $2
       WHERE e.id = $1 AND e."deletedAt" IS NULL`,
      [empId, scope.companyId]
    );

    res.status(201).json(maskFields(req, {
      ...employee,
      assignmentId,
      onboardingTasksCreated: onboardingTaskCount,
      // PR-1 (#2077) — surface the institutional binding so the
      // post-create success card can render «الموظف مرتبط بـ …».
      institutional: {
        positionId: positionId ? Number(positionId) : null,
        categoryKey: categoryKey || null,
        teamId: teamId ? Number(teamId) : null,
        projectId: projectId ? Number(projectId) : null,
        costCenterId: costCenterId ? Number(costCenterId) : null,
        committeeId: committeeId ? Number(committeeId) : null,
      },
      probationEndDate: (() => { const d = new Date(effectiveHireDate); d.setDate(d.getDate() + Number(probationDays)); return toDateISO(d); })(),
      userAccount: userId ? {
        userId,
        email: loginEmail || email || null,
        isNewAccount: createdNewUser,
        message: createdNewUser
          ? (accountInviteWarning ?? "تم إنشاء حساب مستخدم وأُرسل رابط الدعوة لتعيين كلمة المرور إلى الموظف.")
          : "تم ربط الحساب الموجود بالموظف.",
        inviteWarning: accountInviteWarning,
      } : null,
    }));
  } catch (err) {
    handleRouteError(err, res, "Create employee error:");
  }
});

router.get("/onboarding-tasks", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, status, ownerRole, mandatory } = req.query as Record<string, string | undefined>;
    const conditions = [`ot."companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    if (employeeId) { params.push(Number(employeeId)); conditions.push(`ot."employeeId" = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`ot.status = $${params.length}`); }
    // HR-REV-3 (#2222) — per-owner queue: each owning department (الأسطول/
    // الوثائق/الرواتب…) can pull just the activation tasks routed to it.
    if (ownerRole) { params.push(ownerRole); conditions.push(`ot."ownerRole" = $${params.length}`); }
    // mandatory=true|false narrows to the gating items (or the optional ones).
    if (mandatory === "true") { conditions.push(`ot.mandatory IS NOT FALSE`); }
    else if (mandatory === "false") { conditions.push(`ot.mandatory IS FALSE`); }
    interface OnboardingTaskRow extends Record<string, unknown> {
      id: number;
      companyId: number;
      employeeId: number;
      employeeName?: string | null;
      empNumber?: string | null;
      title: string;
      status: string;
      createdAt: string;
    }
    const rows = await rawQuery<OnboardingTaskRow>(
      `SELECT ot.*, e.name AS "employeeName", e."empNumber"
       FROM onboarding_tasks ot
       JOIN employees e ON e.id = ot."employeeId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY ot."createdAt" DESC LIMIT 200`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Onboarding tasks error:"); }
});

router.patch("/onboarding-tasks/:id", authorize({ feature: "hr.employees", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(patchOnboardingTaskSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { status } = body;
    interface OnboardingTaskRow extends Record<string, unknown> {
      id: number;
      employeeId: number;
      title: string;
      status: string;
      completedAt?: string | null;
      completedBy?: number | null;
    }
    // The task update + the activation auto-gate touch two tables, so they run
    // in one transaction (rawQuery auto-joins the ambient tx) — a failure on the
    // employees UPDATE must not leave the task flipped on its own.
    const row = await withTransaction(async () => {
      const [r] = await rawQuery<OnboardingTaskRow>(
        `UPDATE onboarding_tasks SET status = $1,
         "completedAt" = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
         "completedBy" = $2
         WHERE id = $3 AND "companyId" = $4 AND status != 'completed' RETURNING *`,
        [status, scope.activeAssignmentId, id, scope.companyId]
      );
      if (!r) throw new NotFoundError("المهمة غير موجودة");

      // HR-REV-3 §1 auto-gate — once every MANDATORY task for this hire is done,
      // advance a still-pending_activation employee to ready_for_hr_review so HR
      // knows the distributed plan is complete. Only flips from pending_activation
      // (never overrides a later state); reversible if a task is re-opened.
      if (status === "completed") {
        const [pending] = await rawQuery<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt FROM onboarding_tasks
            WHERE "employeeId" = $1 AND "companyId" = $2 AND mandatory IS NOT FALSE
              AND status NOT IN ('completed','skipped')`,
          [r.employeeId, scope.companyId]
        );
        if (pending && pending.cnt === 0) {
          // Tenant scope via the employee's assignment (employees.companyId is
          // not populated on quick-activate; the assignment carries the tenant).
          await rawQuery(
            `UPDATE employees SET "activationStatus" = 'ready_for_hr_review'
              WHERE id = $1 AND "activationStatus" = 'pending_activation'
                AND EXISTS (
                  SELECT 1 FROM employee_assignments ea
                  WHERE ea."employeeId" = employees.id AND ea."companyId" = $2
                )`,
            [r.employeeId, scope.companyId]
          );
        }
      }
      return r;
    });

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "onboarding_task.updated", entity: "onboarding_tasks", entityId: id,
      details: JSON.stringify({ status }),
    }).catch((e) => logger.error(e, "employees background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "onboarding_tasks", entityId: id,
      after: { status },
    }).catch((e) => logger.error(e, "employees background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// Integrated HR — finance + accounts + vehicle linkage roll-up for the
// employee detail page. Returns the subsidiary custody account (if
// any), the current open-custody balance, the linked vehicle (if any),
// the user-account email split, and the role / job_title policy.
// Single round-trip so the detail page renders the "Finance Linkage"
// card without 5 parallel queries.
router.get("/:id/finance-summary", authorize({ feature: "hr.employees", action: "view", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [emp] = await rawQuery<{
      id: number;
      personalEmail: string | null;
      internalEmail: string | null;
      email: string | null;
    }>(
      // Tenant scope via the assignment, NOT the `OR companyId IS NULL`
      // fallback: employees.companyId is intentionally left NULL (the tenant
      // lives on employee_assignments), so the old fallback matched an
      // employee row from ANY company. Require an assignment in the caller's
      // company instead — true tenant isolation, defense-in-depth behind the
      // authorize(resource) gate.
      `SELECT e.id, e."personalEmail", e."internalEmail", e.email
         FROM employees e
        WHERE e.id = $1 AND e."deletedAt" IS NULL
          AND EXISTS (
            SELECT 1 FROM employee_assignments ea
             WHERE ea."employeeId" = e.id AND ea."companyId" = $2
          )`,
      [id, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");

    const [subsidiaryAccount] = await rawQuery<{ accountCode: string; accountName: string }>(
      `SELECT coa.code AS "accountCode", coa.name AS "accountName"
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts coa ON coa.id = sa."accountId"
        WHERE sa."companyId" = $1
          AND sa."entityType" = 'employee'
          AND sa."entityId" = $2
          AND sa."accountType" = 'custody'
          AND sa."isActive" = true
          AND sa."deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, id]
    ).catch(() => []);

    // Outstanding custody = SUM(debit on CUSTODY-* JEs) - SUM(credit on
    // CUSTODY-SETTLE-* JEs) filtered by the employee dimension on the
    // journal_lines. Pattern mirrors finance-custodies.ts /summary.
    const [custodyBal] = await rawQuery<{ outstanding: string; openCount: string }>(
      `WITH advanced AS (
         SELECT je.id, je.ref, COALESCE(SUM(jl.debit), 0) AS amount
           FROM journal_entries je
           JOIN journal_lines jl ON jl."journalId" = je.id AND jl.debit > 0
          WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
            AND je."balancesApplied" = true
            AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
            AND jl."employeeId" = $2
          GROUP BY je.id, je.ref
       ),
       settled AS (
         SELECT je2.description AS "originalRef", COALESCE(SUM(jl2.credit), 0) AS settled_amount
           FROM journal_entries je2
           JOIN journal_lines jl2 ON jl2."journalId" = je2.id AND jl2.credit > 0
          WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL
            AND je2."balancesApplied" = true
            AND je2.ref LIKE 'CUSTODY-SETTLE%'
          GROUP BY je2.description
       )
       SELECT COALESCE(SUM(GREATEST(a.amount - COALESCE(s.settled_amount, 0), 0)), 0)::text AS outstanding,
              COUNT(*) FILTER (WHERE a.amount > COALESCE(s.settled_amount, 0))::text AS "openCount"
         FROM advanced a
         LEFT JOIN settled s ON s."originalRef" = a.ref`,
      [scope.companyId, id]
    ).catch(() => [{ outstanding: "0", openCount: "0" }]);

    // The vehicle ↔ driver link lives on fleet_vehicles.assignedDriverId
    // (NOT fleet_drivers.currentVehicleId). Join through fleet_drivers
    // whose employeeId == this employee.
    const [vehicle] = await rawQuery<{ id: number; plateNumber: string; brand: string | null }>(
      `SELECT v.id, v."plateNumber", v.brand
         FROM fleet_drivers d
         JOIN fleet_vehicles v
           ON v."assignedDriverId" = d.id AND v."companyId" = d."companyId" AND v."deletedAt" IS NULL
        WHERE d."companyId" = $1 AND d."employeeId" = $2 AND d."deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, id]
    ).catch(() => []);

    // User account state.
    const loginEmail = emp.internalEmail || emp.email;
    const [user] = loginEmail
      ? await rawQuery<{ id: number; isActive: boolean; lastLoginAt: string | null }>(
          `SELECT id, "isActive", "lastLoginAt" FROM users WHERE email = $1 LIMIT 1`,
          [loginEmail]
        ).catch(() => [])
      : [];

    // PBX extension bound to this employee (real comms integration —
    // surfaced so the detail page can show reachability + click-to-call).
    const [extension] = await rawQuery<{ id: number; extension: string; status: string }>(
      `SELECT id, extension, status FROM pbx_extensions
        WHERE "companyId" = $1 AND "employeeId" = $2 AND status = 'active'
        ORDER BY id ASC LIMIT 1`,
      [scope.companyId, id]
    ).catch(() => []);

    res.json({
      employeeId: id,
      emails: {
        internal: emp.internalEmail,
        personal: emp.personalEmail,
        legacy: emp.email,
        loginEmail,
      },
      userAccount: user ? { id: user.id, isActive: user.isActive, lastLoginAt: user.lastLoginAt } : null,
      custody: {
        subsidiaryAccountCode: subsidiaryAccount?.accountCode ?? null,
        subsidiaryAccountName: subsidiaryAccount?.accountName ?? null,
        outstandingAmount: Number(custodyBal?.outstanding ?? 0),
        openCount: Number(custodyBal?.openCount ?? 0),
      },
      vehicle: vehicle ? { id: vehicle.id, plateNumber: vehicle.plateNumber, brand: vehicle.brand } : null,
      pbxExtension: extension ? { id: extension.id, extension: extension.extension, status: extension.status } : null,
    });
  } catch (err) { handleRouteError(err, res, "employee finance summary"); }
});

router.get("/job-titles", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    interface JobTitleRow extends Record<string, unknown> {
      id: number;
      name: string;
      companyId?: number | null;
    }
    const rows = await rawQuery<JobTitleRow>(
      `SELECT * FROM job_titles WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY name LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "job-titles query failed"); }
});

// Migration 248 — create / update job_titles so admins can wire the
// defaultRoleKey + opensCustody policy through the UI. Gated by the
// admin-equivalent setting feature so HR alone can't grant roles.
const upsertJobTitleSchema = z.object({
  name: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  defaultRoleKey: z.string().max(60).optional().nullable(),
  opensCustody: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.post("/job-titles", authorize({ feature: "hr.employees", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(upsertJobTitleSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO job_titles (name, "nameEn", category, "companyId", "isActive", "defaultRoleKey", "opensCustody")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [b.name, b.nameEn ?? null, b.category ?? 'general', scope.companyId, b.isActive ?? true, b.defaultRoleKey ?? null, b.opensCustody ?? false]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "job_titles", entityId: insertId,
      after: b,
    }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "create job_title"); }
});

router.patch("/job-titles/:id", authorize({ feature: "hr.employees", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(upsertJobTitleSchema.partial().safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const k of ["name", "nameEn", "category", "defaultRoleKey", "opensCustody", "isActive"] as const) {
      if ((b as any)[k] !== undefined) set(k, (b as any)[k]);
    }
    if (!sets.length) { res.json({ ok: true, updated: 0 }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE job_titles SET ${sets.join(", ")}
        WHERE id = $${params.length - 1} AND ("companyId" = $${params.length} OR "companyId" IS NULL)`,
      params
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "job_titles", entityId: id, after: b,
    }).catch(() => undefined);
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "update job_title"); }
});

router.delete("/job-titles/:id", authorize({ feature: "hr.employees", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Soft delete — mirrors the org.ts catalog pattern (positions/teams/…):
    // job_titles has an isActive flag and no deletedAt column, and existing
    // assignments keep their jobTitleId FK, so we deactivate rather than drop.
    // System titles (companyId IS NULL) are shared and must not be touched.
    const result = await rawExecute(
      `UPDATE job_titles SET "isActive" = FALSE, "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (result.affectedRows === 0) throw new NotFoundError("المسمّى الوظيفي غير موجود أو غير قابل للحذف");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "job_titles", entityId: id,
    }).catch(() => undefined);
    res.json({ ok: true, isActive: false });
  } catch (err) { handleRouteError(err, res, "delete job_title"); }
});

router.get("/documents", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    interface EmployeeDocumentRow extends Record<string, unknown> {
      id: number;
      employeeId: number;
      employeeName?: string | null;
      type?: string | null;
      title?: string | null;
      createdAt: string;
    }
    const rows = await rawQuery<EmployeeDocumentRow>(
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

// RBAC v2: hr.employees view + automatic field masking via maskFields().
// Roles like "كاتب موارد بشرية (قالب)" hide salary/IBAN and mask
// nationalId/iqama/passport/phone — the engine applies these transparently.
router.get("/:id", authorize({ feature: "hr.employees", action: "view", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    let extraCondition = "";
    const queryParams: unknown[] = [id, scope.companyId];
    if (!scope.isOwner && scope.role === "employee" && scope.employeeId) {
      extraCondition = ` AND e.id = $3`;
      queryParams.push(scope.employeeId);
    }

    const [employee] = await rawQuery<EmployeeListRow>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber",
              e."photoUrl", e.status, e."createdAt",
              e."nationalId", e.nationality, e.gender, e."dateOfBirth",
              e."iqamaNumber", e."iqamaExpiry", e."passportNumber", e."passportExpiry",
              e."borderNumber", e."visaNumber", e."visaType", e."visaExpiry",
              e."sponsorNumber", e."workPermitNumber", e."workPermitExpiry", e."iqamaStatus",
              -- بيانات مالية + جهة طوارئ: تُحفظ عند الإنشاء/التعديل لكن لم تكن
              -- تُقرأ في GET التفاصيل (نقص بيانات) — الرواتب تحتاج الآيبان،
              -- والموارد البشرية تحتاج جهة الطوارئ عند الأزمة.
              e."bankName", e."bankAccount", e.iban,
              e."emergencyContact", e."emergencyPhone",
              ea.id AS "assignmentId",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", ea."jobTitleId",
              ea.role, ea.salary, ea."hireDate",
              ea."companyId", ea."branchId", ea."departmentId",
              ea."managerId",
              b.name AS "branchName", d.name AS "departmentName",
              -- PR-7 (#2077) — surface the full org chain on the
              -- employee detail (Administration row in 360 view).
              -- The LEFT JOIN keeps departments without an
              -- administrationId returning NULL, which the UI shows
              -- as «—» (no break).
              d."administrationId", adm.name AS "administrationName",
              mgr.name AS "managerName"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
       LEFT JOIN departments d ON d.id = ea."departmentId"
       LEFT JOIN administrations adm ON adm.id = d."administrationId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       LEFT JOIN employees mgr ON mgr.id = ea."managerId"
       WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL${extraCondition}`,
      queryParams
    );

    if (!employee) {
      throw new NotFoundError("الموظف غير موجود");
    }

    const [tasks, attendance, leaves, trainings, payroll, violations, loans, overtime, userAccount, roles, contract, custodies, position, latestScore, activeSignals] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT pt.id, pt.title, pt.status, pt.priority, pt."dueDate", p.name AS "projectName"
         FROM project_tasks pt
         LEFT JOIN projects p ON p.id = pt."projectId"
         WHERE pt."assigneeId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL
         ORDER BY pt."dueDate" DESC NULLS LAST LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT a.id, a.date, a."checkIn", a."checkOut", a."lateMinutes", a.status
         FROM attendance a
         WHERE a."assignmentId" = $1 AND a."companyId" = $2
         ORDER BY a.date DESC LIMIT 30`,
        [employee.assignmentId, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT lr.id, lr.status, lr."startDate", lr."endDate", lr.days, lr.reason,
                lt.name AS "leaveTypeName"
         FROM hr_leave_requests lr
         JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         WHERE lr."employeeId" = $1 AND lr."companyId" = $2
         ORDER BY lr."createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT te.id, te.status, te."completedAt",
                tp.title AS "courseTitle", tp.type AS "courseType"
         FROM training_enrollments te
         JOIN training_programs tp ON tp.id = te."programId"
         WHERE te."employeeId" = $1 AND tp."companyId" = $2
         ORDER BY tp."startDate" DESC LIMIT 20`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "employees query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT pl.id, pl.basic, pl."grossSalary", pl.gosi, pl."lateDeduction", pl."netSalary",
                pr.period, pr.status, pr."createdAt"
         FROM payroll_lines pl
         JOIN payroll_runs pr ON pr.id = pl."runId"
         WHERE pl."assignmentId" = $1 AND pr."companyId" = $2 AND pl."deletedAt" IS NULL AND pr."deletedAt" IS NULL
         ORDER BY pr.period DESC LIMIT 12`,
        [employee.assignmentId, scope.companyId]
      ).catch((e) => { logger.error(e, "employees query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT ev.id, ev.type, ev.description, ev.severity, ev.deduction, ev.period, ev."createdAt"
         FROM employee_violations ev
         WHERE ev."assignmentId" = $1 AND ev."companyId" = $2 AND ev."deletedAt" IS NULL
         ORDER BY ev."createdAt" DESC LIMIT 20`,
        [employee.assignmentId, scope.companyId]
      ).catch((e) => { logger.error(e, "employees query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT l.id, l."loanNumber", l."loanType", l.amount, l."paidAmount", l."remainingAmount",
                l."installmentCount", l."installmentAmount", l.status, l."createdAt"
         FROM hr_employee_loans l
         WHERE l."assignmentId" = $1 AND l."companyId" = $2 AND l."deletedAt" IS NULL
         ORDER BY l."createdAt" DESC LIMIT 20`,
        [employee.assignmentId, scope.companyId]
      ).catch((e) => { logger.error(e, "employees query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT o.id, o."requestNumber", o."overtimeDate", o.hours, o."totalAmount", o.status, o."createdAt"
         FROM hr_overtime_requests o
         WHERE o."assignmentId" = $1 AND o."companyId" = $2 AND o."deletedAt" IS NULL
         ORDER BY o."overtimeDate" DESC LIMIT 20`,
        [employee.assignmentId, scope.companyId]
      ).catch((e) => { logger.error(e, "employees query failed"); return []; }),
      // HR-001 / #1799 priority #1 — Employee 360 tab "الحساب والدخول".
      // We surface the linked user account row so the profile can render
      // "هل للموظف حساب دخول؟ آخر دخول؟ مقفول؟". Sensitive fields
      // (passwordHash, twoFactorSecret, resetToken) are NEVER selected.
      // Limit 1 because the dual model is one-user-per-employee (see
      // docs/rbac/UNIFIED_USER_ROLE_MODEL.md). NULL → no account yet.
      rawQuery<Record<string, unknown>>(
        `SELECT u.id, u.email, u.role, u."isActive", u."lastLoginAt",
                u."failedLoginAttempts", u."lockedUntil", u."createdAt"
           FROM users u
          WHERE u."employeeId" = $1
          LIMIT 1`,
        [id]
      ).catch((e) => { logger.error(e, "employees user-account query failed"); return []; }),
      // HR-001 / #1799 priority #2 — Employee 360 tab "الأدوار والصلاحيات".
      // Multi-role list from rbac_user_roles joined back to rbac_roles
      // so the profile can show every active role the employee holds,
      // ordered with primary first, then by level descending.
      // Scoped to the employee's company (assignment.companyId) so
      // cross-company role grants don't bleed into the current view.
      // Empty array when the employee has no user account or no rbac role.
      rawQuery<Record<string, unknown>>(
        `SELECT ur.id AS "userRoleId",
                r.id AS "roleId", r.role_key AS "roleKey",
                r.label_ar AS "labelAr", r.label_en AS "labelEn",
                r.color, r.level, r.is_template AS "isTemplate",
                ur.is_primary AS "isPrimary", ur.expires_at AS "expiresAt",
                ur."createdAt" AS "assignedAt",
                ur."branchId", ur."departmentId"
           FROM rbac_user_roles ur
           JOIN rbac_roles r ON r.id = ur.role_id
          WHERE ur."companyId" = $2
            AND ur."userId" = (SELECT id FROM users WHERE "employeeId" = $1 LIMIT 1)
          ORDER BY ur.is_primary DESC NULLS LAST, r.level DESC NULLS LAST, r.role_key`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "employees roles query failed"); return []; }),
      // HR-012 / #1799 priority #1 — Employee 360 tab «العقد».
      // Loads the active employment contract joined to the type label
      // + branch. Returns NULL when no contract row exists (rare, but
      // pre-onboarding employees may not have one yet). Sensitive
      // fields (salary breakdown) aren't returned here — they live on
      // the `payroll` tab which has separate RBAC.
      rawQuery<Record<string, unknown>>(
        `SELECT c.id, c.ref, c."contractType", c."startDate", c."endDate",
                c.status, c."approvalStatus", c."probationEndDate",
                c."probationStatus", c."signedByEmployee",
                c."employeeSignedAt", c."createdAt"
           FROM employee_contracts c
          WHERE c."employeeId" = $1 AND c."companyId" = $2
            AND (c.status = 'active' OR c.status IS NULL)
            AND c."deletedAt" IS NULL
          ORDER BY c."startDate" DESC NULLS LAST, c.id DESC LIMIT 1`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "employees contract query failed"); return []; }),
      // HR-012 / #1799 priority #1 — Employee 360 tab «العهد».
      // Pulls every asset (laptop, phone, SIM, …) from the
      // employee_assets bridge (#1799 #9, migration 276) — active
      // first, then returned history. Bounded LIMIT 50 so a long-tenure
      // employee's record doesn't blow the response.
      rawQuery<Record<string, unknown>>(
        `SELECT ea.id, ea."assetType", ea."assetKey", ea."assetLabel",
                ea."serialNumber", ea."assignedAt", ea."returnedAt",
                ea."conditionOnAssign", ea."conditionOnReturn", ea.notes
           FROM employee_assets ea
          WHERE ea."assignmentId" = $2 AND ea."companyId" = $1
          ORDER BY ea."returnedAt" NULLS FIRST, ea."assignedAt" DESC
          LIMIT 50`,
        // NOTE: the employee `id` is NOT referenced by this child query (it
        // filters by assignmentId + companyId), so it must NOT be bound — a
        // leftover $1=id made Postgres 42P18 "could not determine data type of
        // parameter $1", which the .catch swallowed → the «العهد» tab was
        // silently always empty.
        [scope.companyId, employee.assignmentId]
      ).catch((e) => { logger.error(e, "employees custodies query failed"); return []; }),
      // HR-012 / #1799 priority #1 — Employee 360 tab «المسميات».
      // Resolves the assignment's position (admin role) to its label
      // alongside the existing job_title (professional). Returns NULL
      // when the assignment hasn't been categorized yet (legacy
      // assignments pre §B migration 274). The position table is
      // company-scoped (companyId IS NULL = system template), so we
      // match by either.
      employee.assignmentId ? rawQuery<Record<string, unknown>>(
        `SELECT p.id, p."positionKey", p."labelAr", p."labelEn",
                p.level, p.description
           FROM employee_assignments ea
           JOIN positions p ON p.id = ea."positionId"
            AND (p."companyId" IS NULL OR p."companyId" = $1)
          WHERE ea.id = $2 LIMIT 1`,
        // employee `id` unreferenced here → not bound (was a $1 42P18 that the
        // .catch swallowed, leaving «المسميات» blank).
        [scope.companyId, employee.assignmentId]
      ).catch((e) => { logger.error(e, "employees position query failed"); return []; }) : Promise.resolve([]),
      // HR-014 — Employee 360 overview enrichment (#1799 priority #10):
      // surface the latest monthly score + active (unacknowledged) signals
      // inside the overview tab so HR doesn't need to jump to a separate
      // dashboard. Both queries are scoped on assignmentId — when the
      // employee has no active assignment they return [].
      employee.assignmentId ? rawQuery<Record<string, unknown>>(
        `SELECT scope, "periodKey", "compositeScore", trend,
                "disciplineScore", "activityScore", "productivityScore",
                "qualityScore", "managerScore", "developmentScore",
                rationale, "computedAt"
           FROM employee_scores
          WHERE "assignmentId" = $2 AND "companyId" = $1 AND scope = 'monthly'
          ORDER BY "periodKey" DESC LIMIT 1`,
        // employee `id` unreferenced here → not bound (42P18-then-swallowed).
        [scope.companyId, employee.assignmentId]
      ).catch((e) => { logger.error(e, "employees latestScore query failed"); return []; }) : Promise.resolve([]),
      employee.assignmentId ? rawQuery<Record<string, unknown>>(
        `SELECT id, "signalType", severity, scope, "periodKey", title,
                reasons, "compositeScore", "createdAt"
           FROM employee_signals
          WHERE "assignmentId" = $2 AND "companyId" = $1
            AND "acknowledgedAt" IS NULL
            AND "createdAt" >= CURRENT_DATE - INTERVAL '90 days'
          ORDER BY
            CASE severity
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1
              WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4
            END,
            "createdAt" DESC
          LIMIT 20`,
        // employee `id` unreferenced here → not bound (42P18-then-swallowed).
        [scope.companyId, employee.assignmentId]
      ).catch((e) => { logger.error(e, "employees activeSignals query failed"); return []; }) : Promise.resolve([]),
    ]);

    res.json(maskFields(req, {
      ...employee,
      tasks, attendance, leaves, trainings, payroll, violations, loans, overtime,
      // HR-001 — Employee 360 expansion (#1799 priority #1):
      // `userAccount` is a single object (or null when employee has no
      // login). `roles` is always an array (empty when no rbac grants).
      userAccount: Array.isArray(userAccount) && userAccount.length > 0 ? userAccount[0] : null,
      roles: roles ?? [],
      // HR-012 — second expansion. `contract` is single-row or null;
      // `position` is the resolved admin position (single object or
      // null); `custodies` is the asset list (active first, then
      // returned).
      contract: Array.isArray(contract) && contract.length > 0 ? contract[0] : null,
      position: Array.isArray(position) && position.length > 0 ? position[0] : null,
      custodies: custodies ?? [],
      // HR-014 — overview enrichment: single most-recent monthly score
      // (or null) + array of unacknowledged signals from the last 90 days.
      latestScore: Array.isArray(latestScore) && latestScore.length > 0 ? latestScore[0] : null,
      activeSignals: activeSignals ?? [],
    }));
  } catch (err) {
    handleRouteError(err, res, "Get employee error:");
  }
});

router.patch("/:id", authorize({ feature: "hr.employees", action: "update", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
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
    const validatedBody = zodParse(patchEmployeeSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const {
      name, phone, email, jobTitle, role, salary, branchId, departmentId, status,
      borderNumber, visaNumber, visaType, visaExpiry, sponsorNumber,
      workPermitNumber, workPermitExpiry, iqamaStatus,
      nationalId, iqamaNumber, iqamaExpiry, passportNumber, passportExpiry,
      // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure does not require explicit per-field generics; behavior unchanged
    } = validatedBody as any;
    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure does not require explicit per-field generics; behavior unchanged
    const { jobTitleId: bodyJobTitleId, managerId: bodyManagerId } = validatedBody as any;

    // Load the full employee + assignment row BEFORE we mutate anything. We
    // need:
    //   - assignmentId (for the assignment UPDATE below)
    //   - the "before" snapshot for audit diff
    //   - the current email / nationalId so pre-checks can skip no-op cases
    //     (user "changes" to the same value they already had)
    const [before] = await rawQuery<EmployeeListRow>(
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
      [id, scope.companyId]
    );

    if (!before) {
      throw new NotFoundError("الموظف غير موجود", {
        fix: "تحقّق من الرقم الوظيفي أو ارجع لقائمة الموظفين.",
      });
    }

    if (salary !== undefined && salary !== null) {
      const salaryNum = Number(salary);
      if (salaryNum <= 0) {
        throw new ValidationError("الراتب يجب أن يكون أكبر من صفر", {
          field: "salary",
          fix: "أدخل راتباً موجباً.",
        });
      }
      if (salaryNum > 1_000_000) {
        throw new ValidationError("الراتب يتجاوز الحد الأقصى المسموح (1,000,000)", {
          field: "salary",
          fix: "تحقق من قيمة الراتب المدخلة",
        });
      }
    }

    // Pre-check: changing email to one that belongs to a different employee.
    // We only fire the query when email is actually being changed to a
    // non-empty value different from the current one — avoids a wasted
    // round-trip on every PATCH that only touches unrelated fields.
    if (email !== undefined && email && email !== before.email) {
      const [clash] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.email = $1 AND e.id <> $2 AND ea."companyId" = $3 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [email, id, scope.companyId]
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
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e."nationalId" = $1 AND e.id <> $2 AND ea."companyId" = $3 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [nationalId, id, scope.companyId]
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
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [Number(bodyManagerId), scope.companyId]
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

    // HR-REV-3 (#2222) — activation ready-gate. Flipping a quick-activated
    // employee (inactive/pending/onboarding) to active is only allowed once
    // every MANDATORY onboarding task is completed or skipped — so activation
    // can't bypass the distributed plan's owning roles. Re-activating a
    // suspended/terminated employee is exempt (it carries no onboarding plan).
    const PENDING_ACTIVATION = ["inactive", "pending", "onboarding"];
    if (status === "active" && before.status != null && PENDING_ACTIVATION.includes(before.status)) {
      const [gate] = await rawQuery<{ remaining: number }>(
        `SELECT COUNT(*)::int AS remaining FROM onboarding_tasks
          WHERE "employeeId" = $1 AND "companyId" = $2
            AND mandatory IS NOT FALSE
            AND status NOT IN ('completed','skipped')`,
        [id, scope.companyId]
      );
      const remaining = Number(gate?.remaining ?? 0);
      if (remaining > 0) {
        throw new ValidationError(
          `لا يمكن التفعيل: ${remaining} بند إلزامي في خطة التهيئة لم يكتمل بعد`,
          {
            field: "status",
            fix: "أكمل البنود الإلزامية في «لوحة قيد التفعيل» قبل تفعيل الموظف.",
            meta: { remainingMandatory: remaining },
          }
        );
      }
    }

    const employee = { id: before.id, assignmentId: before.assignmentId };

    await withTransaction(async (client) => {
      const empFields: string[] = [];
      const empVals: unknown[] = [];
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
        empVals.push(id);
        await client.query(`UPDATE employees SET ${empFields.join(",")} WHERE id = $${empVals.length} AND "deletedAt" IS NULL`, empVals);
      }

      if (status === "active" && before.status !== "active") {
        await client.query(
          `UPDATE employee_assignments SET status = 'active' WHERE id = $1 AND "companyId" = $2 AND status = $3`,
          [employee.assignmentId, scope.companyId, before.status]
        );
        // HR-REV-1/8 (#2220 #2227) — إعادة تفعيل: استعادة تسجيل الدخول عند
        // إرجاع الموظف من الإيقاف (يقابل تعطيل الحساب في فرع suspended أدناه).
        await client.query(`UPDATE users SET "isActive" = true WHERE "employeeId" = $1`, [id]);
      } else if (status === "suspended" && before.status !== "suspended") {
        await client.query(
          `UPDATE employee_assignments SET status = 'suspended' WHERE id = $1 AND "companyId" = $2 AND status = $3`,
          [employee.assignmentId, scope.companyId, before.status]
        );
        // HR-REV-1/8 (#2220 #2227) — سدّ ثغرة: الإيقاف كان يضبط حالة التعيين
        // فقط ويُبقي حساب المستخدم حيًّا، فيستطيع الموقوف الدخول والتصرّف
        // بصلاحياته. نعطّل الحساب كما يفعل terminate؛ تُستعاد عند العودة active.
        await client.query(`UPDATE users SET "isActive" = false WHERE "employeeId" = $1`, [id]);
      }

      // If any expiry field was changed, refresh obligations. Old obligations with
      // different dedupeKey remain until scanner marks them met/breached; the new
      // dedupeKey (which includes the date) ensures no duplicates.
      if ([iqamaExpiry, passportExpiry, workPermitExpiry, visaExpiry].some((v) => v !== undefined)) {
        const { rows: [empRow] } = await client.query(
          `SELECT name, "iqamaExpiry", "passportExpiry", "workPermitExpiry", "visaExpiry" FROM employees WHERE id=$1 AND "deletedAt" IS NULL`,
          [id]
        );
        if (empRow) {
          await registerEmployeeExpiryObligations(
            scope.companyId, scope.branchId ?? null, id, empRow.name,
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
        const vals: unknown[] = [];
        if (jobTitle) { vals.push(jobTitle); fields.push(`"jobTitle" = $${vals.length}`); }
        if (bodyJobTitleId !== undefined) { vals.push(bodyJobTitleId || null); fields.push(`"jobTitleId" = $${vals.length}`); }
        else if (jobTitle) {
          const { rows: [jtRow] } = await client.query(`SELECT id FROM job_titles WHERE name = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`, [jobTitle, scope.companyId]);
          if (jtRow) { vals.push(jtRow.id); fields.push(`"jobTitleId" = $${vals.length}`); }
        }
        if (bodyManagerId !== undefined) { vals.push(bodyManagerId ? Number(bodyManagerId) : null); fields.push(`"managerId" = $${vals.length}`); }
        if (role) { vals.push(role); fields.push(`role = $${vals.length}`); }
        if (salary !== undefined) {
          const { rows: [currentAsgn] } = await client.query(
            `SELECT salary FROM employee_assignments WHERE id = $1 AND "companyId" = $2`,
            [employee.assignmentId, scope.companyId]
          );
          const oldSalary = Number(currentAsgn?.salary ?? 0);
          const newSalary = Number(salary);
          vals.push(newSalary); fields.push(`salary = $${vals.length}`);
          if (oldSalary !== newSalary) {
            await client.query(
              `INSERT INTO salary_history ("employeeId","assignmentId","companyId","oldSalary","newSalary","effectiveDate","changedBy","createdAt")
               VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,NOW())`,
              [id, employee.assignmentId, scope.companyId, oldSalary, newSalary, scope.activeAssignmentId]
            );
          }
        }
        if (branchId) { vals.push(branchId); fields.push(`"branchId" = $${vals.length}`); }
        if (departmentId) { vals.push(departmentId); fields.push(`"departmentId" = $${vals.length}`); }
        if (fields.length) {
          vals.push(employee.assignmentId);
          vals.push(scope.companyId);
          await client.query(`UPDATE employee_assignments SET ${fields.join(",")} WHERE id = $${vals.length - 1} AND "companyId" = $${vals.length}`, vals);
        }
      }
    });

    // Re-read the full row so the audit log + event get a reliable "after"
    // snapshot rather than the raw body (which may contain partial updates,
    // sensitive fields, or stale shape).
    const [after] = await rawQuery<EmployeeListRow>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber", e.status,
              e."nationalId", e."iqamaNumber", e."iqamaExpiry",
              e."passportNumber", e."passportExpiry",
              e."borderNumber", e."visaNumber", e."visaType", e."visaExpiry",
              e."sponsorNumber", e."workPermitNumber", e."workPermitExpiry", e."iqamaStatus",
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle", ea."jobTitleId",
              ea.role, ea.salary, ea."branchId", ea."departmentId", ea."managerId"
         FROM employees e
         JOIN employee_assignments ea ON ea.id = $2 AND ea."companyId" = $3
         LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
        WHERE e.id = $1 AND e."deletedAt" IS NULL`,
      [id, employee.assignmentId, scope.companyId]
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
      // as-any-reason: justified-pragmatic - dynamic key access is limited to an explicit field whitelist for audit diff generation; behavior unchanged
      const oldVal = (before as any)[key];
      // as-any-reason: justified-pragmatic - dynamic key access is limited to an explicit field whitelist for audit diff generation; behavior unchanged
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
      entityId: id,
      // Snapshot both sides — logAudit / computeDiff would otherwise have
      // nothing to compute. Sensitive fields (passwordHash, tempPassword)
      // are never on the employees table so the raw snapshot is safe.
      before,
      after,
      reason: `حقول معدّلة: ${Object.keys(changedFields).join(", ") || "بلا تغيير"}`,
    }).catch((e) => logger.error(e, "employees background task failed"));

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
      entityId: id,
      before,
      after,
      details: JSON.stringify({ changedFields }),
    }).catch((e) => logger.error(e, "employees background task failed"));

    // ── رسالة بداية العمل عند التفعيل ──
    // المُعيَّن عبر «التفعيل السريع» يُنشأ بحالة inactive بلا رسالة ترحيب
    // (لأنه لم يباشر بعد). رسالة الترحيب في الإنشاء الكامل (Step 9) لا تصله
    // لأنه لم يمر بذلك المسار. فعند لحظة التفعيل الفعلية (inactive/pending/
    // onboarding → active) — وهي لحظة مباشرة العمل — نرسل رسالة بداية العمل
    // مرة واحدة. الموظف المُنشأ كاملًا يُنشأ active مباشرة فلا يمر هنا، فلا
    // ازدواج في الإرسال.
    const wasActivated =
      status === "active" && before.status != null && PENDING_ACTIVATION.includes(before.status);
    if (wasActivated && after && employee.assignmentId != null) {
      createNotification({
        companyId: scope.companyId, assignmentId: Number(employee.assignmentId),
        type: "welcome", title: "مرحباً بك — مباشرة العمل",
        body: `أهلاً ${after.name}، تم تفعيل حسابك ومباشرتك العمل برقم وظيفي ${after.empNumber}. يسعدنا انضمامك إلى الفريق.`,
        priority: "normal", refType: "employee", refId: id,
      }).catch((e) => logger.error(e, "employees background task failed"));
      if (after.email) {
        void sendMessage({
          channel: "email",
          recipient: after.email,
          recipientName: after.name,
          subject: `مرحباً بك في فريق العمل - ${after.empNumber}`,
          body: `أهلاً ${after.name}،\n\nتم تفعيل حسابك ومباشرتك العمل.\nرقمك الوظيفي: ${after.empNumber}\nالمسمى الوظيفي: ${after.jobTitle ?? ""}\n\nيسعدنا انضمامك إلى الفريق.`,
          companyId: scope.companyId,
          userId: scope.userId,
          relatedType: "employee",
          relatedId: id,
          templateKey: "employee.welcome",
        }).catch((e) => logger.error(e, "employees background task failed"));
      }
    }

    res.json(after);
  } catch (err) {
    handleRouteError(err, res, "Update employee error:");
  }
});

router.delete("/:id", authorize({ feature: "hr.employees", action: "delete", resource: { table: "employees", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { reason } = zodParse(deleteEmployeeSchema.safeParse(req.body ?? {}));
    const [employee] = await rawQuery<EmployeeListRow>(
      `SELECT e.id, ea.id AS "assignmentId", u.id AS "userId" FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       LEFT JOIN users u ON u."employeeId" = e.id
       WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL`,
      [id, scope.companyId]
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
        `UPDATE employee_assignments SET status = 'terminated' WHERE id = $1 AND "companyId" = $2 AND status = 'active'`,
        [employee.assignmentId, scope.companyId]
      );
      await tx.query(
        `UPDATE employees SET status = 'terminated' WHERE id = $1 AND "companyId" = $2 AND status = 'active' AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );

      // 1. Deactivate contracts tied to this employee / assignment so
      //    probation cron stops alerting on ghosts.
      await tx.query(
        `UPDATE employee_contracts
           SET status = 'terminated', "probationStatus" = 'ended'
         WHERE "employeeId" = $1 AND "companyId" = $2 AND status <> 'terminated' AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );

      // 2. Cancel pending leave requests + their approval stages so
      //    the leave escalation cron stops firing reminders.
      await tx.query(
        `UPDATE hr_leave_requests
           SET status = 'cancelled'
         WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'pending' AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );
      await tx.query(
        `UPDATE leave_approval_stages
           SET status = 'cancelled'
         WHERE "leaveRequestId" IN (
           SELECT id FROM hr_leave_requests
           WHERE "employeeId" = $1 AND "companyId" = $2
         ) AND status = 'pending'`,
        [id, scope.companyId]
      );

      // 3. Cancel open tasks assigned to the terminated assignment so
      //    they don't rot in someone's calendar forever. Manager can
      //    re-open / reassign after the fact.
      await tx.query(
        `UPDATE tasks
           SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || 'ألغي تلقائياً: إنهاء خدمة الموظف'
         WHERE "assignedTo" = $1 AND status IN ('pending', 'in_progress') AND "deletedAt" IS NULL`,
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

      // 5. Cancel active/pending loans
      await tx.query(
        `UPDATE hr_employee_loans
           SET status = 'cancelled', "updatedAt" = NOW()
         WHERE "employeeId" = $1 AND "companyId" = $2 AND status IN ('active', 'pending') AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );

      // 6. Deactivate the associated user account so the terminated
      //    employee can no longer log in.
      if (employee.userId) {
        await tx.query(
          `UPDATE users SET "isActive" = false WHERE id = $1`,
          [employee.userId]
        );
      }
    });

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "employee.terminated",
      entity: "employees",
      entityId: id,
      before: { status: "active" },
      after: { status: "terminated", reason: reason || null, assignmentId: employee.assignmentId },
    }).catch((e) => logger.error(e, "employees background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "employees", entityId: id,
      after: { reason: reason || null },
    }).catch((e) => logger.error(e, "employees background task failed"));
    res.json({ message: "تم إنهاء خدمة الموظف بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Delete employee error:");
  }
});

/**
 * Seed obligations for all existing employees with future expiry dates.
 * Safe to re-run — dedupeKey prevents duplicates.
 */
router.post("/obligations/seed", authorize({ feature: "hr.employees", action: "update" }), async (req, res) => {
  try {
    zodParse(seedObligationsSchema.safeParse(req.body));
    const scope = req.scope!;
    interface ExpiryEmployeeRow {
      id: number;
      name: string;
      iqamaExpiry?: string | null;
      passportExpiry?: string | null;
      workPermitExpiry?: string | null;
      visaExpiry?: string | null;
    }
    const emps = await rawQuery<ExpiryEmployeeRow>(
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
    }).catch((e) => logger.error(e, "employees background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "obligations", entityId: 0,
      after: { scannedEmployees: emps.length, employeesProcessed: registered },
    }).catch((e) => logger.error(e, "employees background task failed"));
    res.json({ scannedEmployees: emps.length, employeesProcessed: registered });
  } catch (err) { handleRouteError(err, res, "Seed HR obligations error:"); }
});

// Quiet unused import warnings for helpers referenced conditionally
void cancelObligation;

// ════════════════════════════════════════════════════════════════════════════
// PR-4 (#2077) — Institutional scoring: on-demand recompute + history.
//
// The engine is already wired into the cron scheduler (weekly Monday 3am
// + monthly first-of-month 4am). These two routes give the HR Manager
// an interactive lane:
//   1. POST /employees/:id/scoring/recompute — re-score on demand for
//      every scope (weekly + monthly + quarterly), idempotent UPSERT.
//      Used by the score detail page's «إعادة الحساب» button + by the
//      «أوزان جديدة» flow on the scoring-weights page.
//   2. GET  /employees/:id/scoring/history — full history with the
//      stored rationale text + raw counters, so HR can answer
//      «لماذا 65 هذا الشهر؟» from a single page without joining
//      audit_logs by hand.
//
// Both routes are scoped on the employee's company via the same JOIN
// pattern used elsewhere; the recompute action is audit-logged with the
// IGOC quartet (same shape PR-1's wizard uses).
// ════════════════════════════════════════════════════════════════════════════

const scoringRecomputeSchema = z.object({
  // Optional: caller can target a specific scope/period. Default re-
  // scores the CURRENT weekly + monthly + quarterly windows so an HR
  // Manager who just changed weights sees the effect immediately.
  scopes: z.array(z.enum(["weekly", "monthly", "quarterly"])).optional(),
  periodKey: z.string().optional(),
});

router.post(
  "/:id/scoring/recompute",
  authorize({ feature: "hr.employees", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(scoringRecomputeSchema.safeParse(req.body ?? {}));

      const [emp] = await rawQuery<{
        id: number; assignmentId: number; companyId: number; branchId: number | null;
      }>(
        `SELECT e.id, ea.id AS "assignmentId", ea."companyId", ea."branchId"
           FROM employees e
           JOIN employee_assignments ea ON ea."employeeId" = e.id
                                       AND ea.status = 'active'
                                       AND ea."companyId" = $2
          WHERE e.id = $1 AND e."deletedAt" IS NULL
          LIMIT 1`,
        [id, scope.companyId]
      );
      if (!emp) throw new NotFoundError("الموظف غير موجود في هذه الشركة");

      const scopes: ScoreScope[] = body.scopes && body.scopes.length > 0
        ? body.scopes
        : ["weekly", "monthly", "quarterly"];

      const results: Array<{ scope: ScoreScope; periodKey: string; composite: number; breakdown: Record<string, number> }> = [];
      for (const s of scopes) {
        const periodKey = body.periodKey ?? currentPeriodKey(s);
        const result = await scoreEmployee({
          companyId: scope.companyId,
          assignmentId: emp.assignmentId,
          employeeId: emp.id,
          branchId: emp.branchId,
          scope: s,
          periodKey,
        });
        results.push({
          scope: s,
          periodKey,
          composite: result.composite,
          breakdown: {
            discipline: result.discipline,
            activity: result.activity,
            productivity: result.productivity,
            quality: result.quality,
            manager: result.manager,
            development: result.development,
          },
        });
      }

      await emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "employee.scored",
        entity: "employees",
        entityId: emp.id,
        details: JSON.stringify({
          assignmentId: emp.assignmentId,
          trigger: "manual_recompute",
          scopes: scopes,
          results: results.map((r) => ({ scope: r.scope, periodKey: r.periodKey, composite: r.composite })),
          context: {
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            userId: scope.userId,
            activeRoleKey: scope.selectedRoleKey ?? null,
          },
        }),
      }).catch((e) => logger.warn(e, "[scoring/recompute] event emit failed"));

      await createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "recompute",
        entity: "employee_scores",
        entityId: emp.id,
        activeRoleKey: scope.selectedRoleKey ?? null,
        activeDepartmentId: scope.activeDepartmentId ?? null,
        resolvedScope: scope.resolvedScope ?? null,
        impersonationSourceUser: scope.impersonationSourceUser ?? null,
        after: {
          assignmentId: emp.assignmentId,
          trigger: "manual_recompute",
          scopes,
          composites: Object.fromEntries(results.map((r) => [`${r.scope}:${r.periodKey}`, r.composite])),
        },
      });

      res.status(200).json({
        data: results,
        message: `تم إعادة حساب ${results.length} نطاقات (${scopes.join(", ")})`,
      });
    } catch (err) {
      handleRouteError(err, res, "Score recompute error:");
    }
  }
);

router.get(
  "/:id/scoring/history",
  authorize({ feature: "hr.employees", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const wantScope = String(req.query.scope || "monthly") as ScoreScope;
      if (!["weekly", "monthly", "quarterly"].includes(wantScope)) {
        throw new ValidationError("scope must be weekly | monthly | quarterly");
      }
      const limit = Math.min(Number(req.query.limit) || 24, 100);

      const [emp] = await rawQuery<{ id: number; assignmentId: number }>(
        `SELECT e.id, ea.id AS "assignmentId"
           FROM employees e
           JOIN employee_assignments ea ON ea."employeeId" = e.id
                                       AND ea.status = 'active'
                                       AND ea."companyId" = $2
          WHERE e.id = $1 AND e."deletedAt" IS NULL
          LIMIT 1`,
        [id, scope.companyId]
      );
      if (!emp) throw new NotFoundError("الموظف غير موجود في هذه الشركة");

      // Read scores ordered newest first. The rationale + rawCounters
      // columns are JSONB; pg returns them as parsed objects, so the
      // SPA can render «لماذا 65؟» directly from the row.
      const rows = await rawQuery<{
        scope: string; periodKey: string;
        compositeScore: string; trend: number;
        disciplineScore: string; activityScore: string;
        productivityScore: string; qualityScore: string;
        managerScore: string; developmentScore: string;
        rationale: Record<string, string>;
        weightsUsed: Record<string, number>;
        rawCounters: Record<string, number>;
        computedAt: string;
      }>(
        `SELECT scope, "periodKey",
                "compositeScore", trend,
                "disciplineScore", "activityScore", "productivityScore",
                "qualityScore", "managerScore", "developmentScore",
                rationale, "weightsUsed", "rawCounters", "computedAt"
           FROM employee_scores
          WHERE "assignmentId" = $1 AND scope = $2 AND "companyId" = $3
          ORDER BY "periodKey" DESC
          LIMIT $4`,
        [emp.assignmentId, wantScope, scope.companyId, limit]
      );

      res.json({ data: rows, total: rows.length, scope: wantScope, assignmentId: emp.assignmentId });
    } catch (err) {
      handleRouteError(err, res, "Score history error:");
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// PR-8 (#2077) — Employee lifecycle: status resolver + history + transitions.
//
// Three HR-side endpoints wrap the existing lifecycleEngine library:
//
//   GET  /employees/:id/lifecycle/status      — current state + next allowed
//                                              transitions + guard checks.
//                                              The UI uses this to render the
//                                              «الإجراءات المتاحة» buttons.
//   GET  /employees/:id/lifecycle/history     — ordered event list with the
//                                              4 dates + actor + reason +
//                                              overrideReason. Used by the
//                                              «دورة الحياة» tab on the 360.
//   POST /employees/:id/lifecycle/transitions — fire a transition. Validates
//                                              the state machine + guards
//                                              first; persists ONE row to
//                                              employee_lifecycle_events with
//                                              the IGOC quartet; emits the
//                                              employee.lifecycle.transitioned
//                                              event for downstream listeners.
//
// The doctrine: «HR يقرر الحالة والسبب، والمالية خادم». This module ONLY
// writes the event + emits the event. It does NOT update employees.status
// or employee_assignments.status — the canonical screens for those
// (hr-exit.ts, employees.ts PATCH, transfers) own that side-effect. The
// lifecycle ledger is the system of record for «من قرر، متى، ولماذا».
// ════════════════════════════════════════════════════════════════════════════

const lifecycleTransitionSchema = z.object({
  eventType: z.enum([
    "candidate_created", "offer_extended", "offer_accepted", "onboarded",
    "probation_started", "probation_passed", "suspended", "reinstated",
    "resigned", "terminated", "clearance_started", "clearance_completed",
    "transferred", "assigned", "reactivated",
  ]),
  reason: z.string().min(1, "السبب مطلوب"),
  decisionDate: z.string().optional().nullable(),
  effectiveDate: z.string().optional().nullable(),
  documentDate: z.string().optional().nullable(),
  documentRef: z.string().max(80).optional().nullable(),
  overrideReason: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

router.get(
  "/:id/lifecycle/status",
  authorize({ feature: "hr.employees", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [emp] = await rawQuery<{ id: number; assignmentId: number | null; branchId: number | null }>(
        `SELECT e.id, ea.id AS "assignmentId", ea."branchId"
           FROM employees e
           LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id
                                            AND ea."companyId" = $2
                                            AND (ea.status = 'active' OR ea.status = 'terminated')
          WHERE e.id = $1 AND e."deletedAt" IS NULL
          ORDER BY ea."isPrimary" DESC NULLS LAST, ea.id DESC LIMIT 1`,
        [id, scope.companyId]
      );
      if (!emp) throw new NotFoundError("الموظف غير موجود");

      const current = await resolveCurrentState(id, scope.companyId);
      const nexts = nextTransitions(current);
      res.json({
        currentState: current,
        currentStateLabel: current ? STATE_LABEL_AR[current] : null,
        nextTransitions: nexts.map((s) => ({ state: s, label: STATE_LABEL_AR[s] })),
      });
    } catch (err) {
      handleRouteError(err, res, "Lifecycle status error:");
    }
  }
);

router.get(
  "/:id/lifecycle/history",
  authorize({ feature: "hr.employees", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      const rows = await rawQuery<{
        id: number; eventType: string; stateBefore: string | null; stateAfter: string | null;
        reason: string | null; decisionDate: string | null; effectiveDate: string | null;
        documentDate: string | null; documentRef: string | null;
        actorUserId: number; actorName: string | null; activeRoleKey: string | null;
        overrideReason: string | null; metadata: Record<string, unknown>;
        createdAt: string;
      }>(
        `SELECT le.id, le."eventType", le."stateBefore", le."stateAfter",
                le.reason, le."decisionDate", le."effectiveDate",
                le."documentDate", le."documentRef",
                le."actorUserId", e.name AS "actorName", le."activeRoleKey",
                le."overrideReason", le.metadata, le."createdAt"
           FROM employee_lifecycle_events le
           LEFT JOIN users u ON u.id = le."actorUserId"
           LEFT JOIN employees e ON e.id = u."employeeId"
          WHERE le."employeeId" = $1 AND le."companyId" = $2
          ORDER BY le."createdAt" DESC, le.id DESC
          LIMIT $3`,
        [id, scope.companyId, limit]
      );

      // Decorate each row with the Arabic label for event + state, so
      // the UI doesn't re-implement the i18n map.
      const data = rows.map((r) => ({
        ...r,
        eventLabel: EVENT_LABEL_AR[r.eventType as LifecycleEventType] ?? r.eventType,
        stateBeforeLabel: r.stateBefore ? STATE_LABEL_AR[r.stateBefore as LifecycleState] : null,
        stateAfterLabel: r.stateAfter ? STATE_LABEL_AR[r.stateAfter as LifecycleState] : null,
      }));
      res.json({ data, total: data.length });
    } catch (err) {
      handleRouteError(err, res, "Lifecycle history error:");
    }
  }
);

router.post(
  "/:id/lifecycle/transitions",
  authorize({ feature: "hr.employees", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(lifecycleTransitionSchema.safeParse(req.body));

      const [emp] = await rawQuery<{ id: number; assignmentId: number | null; branchId: number | null }>(
        `SELECT e.id, ea.id AS "assignmentId", ea."branchId"
           FROM employees e
           LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id
                                            AND ea."companyId" = $2
                                            AND ea."isPrimary" = true
          WHERE e.id = $1 AND e."deletedAt" IS NULL
          LIMIT 1`,
        [id, scope.companyId]
      );
      if (!emp) throw new NotFoundError("الموظف غير موجود");

      const current = await resolveCurrentState(id, scope.companyId);
      const stateAfter = EVENT_TO_STATE_AFTER[body.eventType as LifecycleEventType] ?? null;

      // Validate the state machine — operational events (transferred,
      // assigned) skip the transitions check since they don't change
      // state.
      if (stateAfter && current) {
        const allowed = ALLOWED_TRANSITIONS[current] ?? [];
        if (!allowed.includes(stateAfter)) {
          throw new ValidationError(
            `الانتقال غير مسموح: من «${STATE_LABEL_AR[current]}» إلى «${STATE_LABEL_AR[stateAfter]}»`,
            { field: "eventType", fix: "اختر حدثًا متوافقًا مع الحالة الحالية" }
          );
        }
      }

      // Run guards. Failures BLOCK the transition unless the operator
      // supplies overrideReason — in which case the row records the
      // bypass for the audit trail.
      const guards = await checkGuards({
        employeeId: id, companyId: scope.companyId,
        from: current, to: stateAfter, eventType: body.eventType as LifecycleEventType,
      });
      if (guards.length > 0 && !body.overrideReason) {
        throw new ValidationError(
          `الانتقال محجوب: ${guards.map((g) => g.allowed === false ? g.reason : "").filter(Boolean).join(" · ")}`,
          { field: "overrideReason", fix: "وثّق سبب التجاوز إذا أردت المتابعة" }
        );
      }

      const [row] = await rawQuery<{ id: number }>(
        `INSERT INTO employee_lifecycle_events
          ("companyId", "branchId", "employeeId", "assignmentId",
           "eventType", "stateBefore", "stateAfter",
           reason, "decisionDate", "effectiveDate", "documentDate", "documentRef",
           "actorUserId", "activeRoleKey", "activeDepartmentId", "resolvedScope", "impersonationSourceUser",
           "overrideReason", metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [
          scope.companyId, emp.branchId, id, emp.assignmentId,
          body.eventType, current, stateAfter,
          body.reason,
          body.decisionDate || null,
          body.effectiveDate || null,
          body.documentDate || null,
          body.documentRef || null,
          scope.userId,
          scope.selectedRoleKey ?? null,
          scope.activeDepartmentId ?? null,
          scope.resolvedScope ?? null,
          scope.impersonationSourceUser ?? null,
          body.overrideReason || null,
          JSON.stringify(body.metadata ?? {}),
        ]
      );

      await createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "transition", entity: "employee_lifecycle", entityId: id,
        activeRoleKey: scope.selectedRoleKey ?? null,
        activeDepartmentId: scope.activeDepartmentId ?? null,
        resolvedScope: scope.resolvedScope ?? null,
        impersonationSourceUser: scope.impersonationSourceUser ?? null,
        after: {
          eventType: body.eventType, stateBefore: current, stateAfter,
          reason: body.reason, override: !!body.overrideReason,
        },
      });

      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "employee.lifecycle.transitioned",
        entity: "employees", entityId: id,
        details: JSON.stringify({
          eventId: row.id, eventType: body.eventType,
          stateBefore: current, stateAfter,
          assignmentId: emp.assignmentId,
          context: {
            companyId: scope.companyId, branchId: scope.branchId ?? null,
            userId: scope.userId,
            activeRoleKey: scope.selectedRoleKey ?? null,
            resolvedScope: scope.resolvedScope ?? null,
          },
        }),
      }).catch((e) => logger.warn(e, "[lifecycle] event emit failed"));

      res.status(201).json({
        data: {
          id: row.id,
          eventType: body.eventType,
          eventLabel: EVENT_LABEL_AR[body.eventType as LifecycleEventType],
          stateBefore: current,
          stateAfter,
          stateAfterLabel: stateAfter ? STATE_LABEL_AR[stateAfter] : null,
          guardsBypassed: guards.length,
        },
      });
    } catch (err) {
      handleRouteError(err, res, "Lifecycle transition error:");
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// البند ٣ — عقد HR: تطبيق مستخرَج OCR مؤكَّد (وثيقة هوية/إقامة) على الموظف.
//
// حدّ المسار: مسار الوثائق (خادم) لا يكتب في كيان الموظف؛ يمرّر الحقول المؤكَّدة،
// وهذا العقد المملوك لـHR يكتبها داخل نطاقه — بصلاحية HR (لا صلاحية الوثائق) + عزل
// companyId + تدقيق. السياسة: «املأ الفارغ فقط» — لا يطمس رقم/انتهاء إقامة قائمًا
// (حقل امتثال حسّاس)؛ القائم يبقى ويُبلَّغ في skipped. يدعم: الإقامة (أعمدة الموظف)
// ورخصة القيادة (صف employee_documents، إنشاء إن غاب بلا تكرار). (دفعتا ١ و٣ من البند ٣.)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:id/ocr-apply",
  authorize({ feature: "hr.employees", action: "update", resource: { table: "employees", idParam: "id" } }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const docType = String(req.body?.docType ?? "");
      const fields = req.body?.fields && typeof req.body.fields === "object" ? req.body.fields : {};
      const [emp] = await rawQuery<{ id: number; iqamaNumber: string | null; iqamaExpiry: string | null }>(
        `SELECT id, "iqamaNumber", "iqamaExpiry" FROM employees WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!emp) throw new NotFoundError("الموظف غير موجود");

      // إقامة/هوية → أعمدة الموظف (iqamaNumber/iqamaExpiry) بسياسة «املأ الفارغ فقط».
      if (/iqama|residence|الإقامة|الاقامة|هوية|national/i.test(docType)) {
        const idNumber = typeof fields.idNumber === "string" && /^[12]\d{9}$/.test(fields.idNumber) ? fields.idNumber : null;
        const expiry =
          typeof fields.expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fields.expiryDate) ? fields.expiryDate : null;
        const setIqamaNumber = !!idNumber && !emp.iqamaNumber;
        const setIqamaExpiry = !!expiry && !emp.iqamaExpiry;
        const applied: string[] = [];
        const skipped: string[] = [];
        if (idNumber) (setIqamaNumber ? applied : skipped).push("iqamaNumber");
        if (expiry) (setIqamaExpiry ? applied : skipped).push("iqamaExpiry");
        if (!applied.length) {
          res.json({ ok: true, applied, skipped, message: "لا حقول فارغة للتعبئة — القيم القائمة محفوظة." });
          return;
        }
        await rawExecute(
          `UPDATE employees SET
             "iqamaNumber" = COALESCE(NULLIF("iqamaNumber", ''), $1),
             "iqamaExpiry" = COALESCE("iqamaExpiry", $2),
             "updatedAt"   = NOW()
           WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
          [setIqamaNumber ? idNumber : null, setIqamaExpiry ? expiry : null, id, scope.companyId],
        );
        void createAuditLog({
          companyId: scope.companyId, userId: scope.userId,
          action: "employee.ocr.applied", entity: "employees", entityId: id,
          after: { docType, applied, skipped },
        }).catch((e) => logger.error(e, "employee ocr apply audit failed"));
        res.json({ ok: true, applied, skipped });
        return;
      }

      // رخصة قيادة → صف في employee_documents (لا أعمدة مباشرة على الموظف). سياسة
      // «لا تكرار/لا طمس»: نُنشئ صفًّا فقط إن لم تكن هناك رخصة قائمة؛ القائمة تبقى.
      if (/driving_license|driving|license|رخصة/i.test(docType)) {
        const num =
          typeof fields.licenseNumber === "string" && fields.licenseNumber.trim() ? fields.licenseNumber.trim().slice(0, 100) : null;
        const expiry =
          typeof fields.expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fields.expiryDate) ? fields.expiryDate : null;
        if (!num && !expiry) {
          res.json({ ok: true, applied: [], skipped: [], message: "لا حقول للتطبيق." });
          return;
        }
        const [existing] = await rawQuery<{ id: number }>(
          `SELECT id FROM employee_documents WHERE "companyId"=$1 AND "employeeId"=$2 AND type='driving_license' LIMIT 1`,
          [scope.companyId, id],
        );
        if (existing) {
          res.json({ ok: true, applied: [], skipped: ["driving_license"], message: "وثيقة رخصة قائمة — لم تُكرَّر." });
          return;
        }
        const { insertId } = await rawExecute(
          `INSERT INTO employee_documents ("companyId","employeeId",type,name,number,"expiryDate")
           VALUES ($1,$2,'driving_license','رخصة قيادة',$3,$4)`,
          [scope.companyId, id, num, expiry],
        );
        void createAuditLog({
          companyId: scope.companyId, userId: scope.userId,
          action: "employee.ocr.applied", entity: "employee_documents", entityId: insertId,
          after: { employeeId: id, docType: "driving_license", number: num, expiryDate: expiry },
        }).catch((e) => logger.error(e, "employee license ocr apply audit failed"));
        res.json({ ok: true, applied: ["driving_license"], skipped: [], id: insertId });
        return;
      }

      throw new ValidationError("نوع المستند غير مدعوم بعد للتطبيق الآلي على الموظف", {
        field: "docType",
        fix: "المدعوم: وثيقة الهوية/الإقامة، ورخصة القيادة.",
      });
    } catch (err) {
      handleRouteError(err, res, "employee OCR apply error:");
    }
  },
);

export default router;
