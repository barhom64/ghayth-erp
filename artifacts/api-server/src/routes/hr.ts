import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requireAnyPermission } from "../middlewares/permissionMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { requireOwnership } from "../middlewares/contextualRbac.js";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { haversineKm } from "../lib/algorithms.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  getManagerAssignmentId,
  initiateApprovalChain,
  processApprovalStep,
  checkFinancialPeriodOpen,
  todayISO,
  currentPeriod,
  currentYear,
  generateRef,
  toDateISO,
  roundTo2,
  softDeleteJournalEntry,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { registerObligation, cancelObligation } from "../lib/obligationsEngine.js";
import { applyTransition, LifecycleError } from "../lib/lifecycleEngine.js";
import {
  computeLeaveImpact,
  computeTerminationImpact,
  computeViolationImpact,
} from "../lib/impactPreview.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { ensureInquiryMemoForViolation } from "../lib/disciplineEngine.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { HR_ROLES, MGR_ROLES, HR_APPROVAL_ROLES , PR_APPROVAL_ROLES, PAYROLL_ROLES, OPS_CLOSE_ROLES, BRANCH_GM_ROLES} from "../lib/rbacCatalog.js";

// ── Zod request-body schemas ──

const checkInSchema = z.object({
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  notes: z.string().optional(),
  workType: z.string().optional(),
});

const leaveRequestSchema = z.object({
  leaveTypeId: z.coerce.number().optional(),
  leaveType: z.string().optional(),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  reason: z.string().optional(),
  documentUrl: z.string().optional(),
  reliefOfficer: z.string().optional(),
  contactDuringLeave: z.string().optional(),
});

const violationSchema = z.object({
  assignmentId: z.coerce.number({ required_error: "يرجى اختيار الموظف" }),
  type: z.string().min(1, "نوع المخالفة مطلوب"),
  description: z.string().min(1, "وصف المخالفة مطلوب"),
  severity: z.enum(["low", "medium", "high", "minor", "major", "critical"]).optional(),
  deduction: z.coerce.number().optional(),
  period: z.string().optional(),
  incidentDate: z.string().optional(),
  regulationId: z.coerce.number().optional(),
  witness: z.string().optional(),
  location: z.string().optional(),
  actionTaken: z.string().optional(),
});

const shiftSchema = z.object({
  name: z.string().min(1, "اسم الوردية مطلوب"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  days: z.any().optional(),
  isDefault: z.boolean().optional(),
  branchId: z.coerce.number().optional().nullable(),
  shiftType: z.enum(["fixed", "flexible", "remote", "split"]).optional(),
  remoteAllowed: z.boolean().optional(),
  splitBreakStart: z.string().optional(),
  splitBreakEnd: z.string().optional(),
  flexStartEarliest: z.string().optional(),
  flexStartLatest: z.string().optional(),
  breakMinutes: z.coerce.number().optional(),
  gracePeriod: z.coerce.number().optional(),
});

const performanceSchema = z.object({
  employeeId: z.coerce.number().optional(),
  assignmentId: z.coerce.number().optional(),
  period: z.string().optional(),
  overallScore: z.coerce.number().optional(),
  scores: z.any().optional(),
  categories: z.any().optional(),
  comments: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "acknowledged"]).optional(),
});

const salaryComponentSchema = z.object({
  name: z.string().min(1, "اسم مكوّن الراتب مطلوب"),
  type: z.enum(["earning", "deduction", "benefit"]).optional(),
  calculationType: z.enum(["fixed", "percentage", "formula"]).optional(),
  value: z.coerce.number().optional(),
  taxable: z.boolean().optional(),
});

const approvalChainSchema = z.object({
  name: z.string().min(1, "اسم السلسلة مطلوب"),
  chainType: z.enum(["leaves", "purchases", "expenses", "advances", "letters", "loans", "overtime", "exit"], { required_error: "نوع السلسلة مطلوب" }),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  steps: z.array(z.object({
    requiredRole: z.string().optional(),
    timeoutHours: z.coerce.number().optional(),
    autoApproveOnTimeout: z.boolean().optional(),
  })).optional(),
});

const shiftAssignmentSchema = z.object({
  assignmentId: z.coerce.number({ required_error: "يرجى اختيار الموظف" }),
  shiftId: z.coerce.number({ required_error: "يرجى اختيار الوردية" }),
  startDate: z.string().min(1, "تاريخ بداية الوردية مطلوب"),
  endDate: z.string().optional(),
});

const officialLetterSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  type: z.string().optional(),
  subject: z.string().min(1, "موضوع الخطاب مطلوب"),
  content: z.string().min(1, "محتوى الخطاب مطلوب"),
  status: z.string().optional(),
});

const publicHolidaySchema = z.object({
  name: z.string().min(1, "اسم العطلة مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().optional(),
  year: z.coerce.number().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  isRecurring: z.boolean().optional(),
});

const transferSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  toBranchId: z.coerce.number({ required_error: "الفرع المستقبل مطلوب" }),
  reason: z.string().optional(),
  effectiveDate: z.string().optional(),
  notes: z.string().optional(),
  toDeptId: z.coerce.number().optional().nullable(),
  toJobTitle: z.string().optional(),
  toSalary: z.coerce.number().optional().nullable(),
});

const idpSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  title: z.string().optional(),
  goals: z.any().optional(),
  skills: z.any().optional(),
  trainingIds: z.any().optional(),
  targetDate: z.string().optional(),
  notes: z.string().optional(),
  reviewDate: z.string().optional(),
});

const companyDocumentSchema = z.object({
  documentType: z.string().min(1, "نوع الوثيقة مطلوب"),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  issuingAuthority: z.string().optional(),
  reminderDays: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const employeeDocumentSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  documentType: z.string().min(1, "نوع الوثيقة مطلوب"),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  issuingAuthority: z.string().optional(),
  reminderDays: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const excuseRequestSchema = z.object({
  assignmentId: z.coerce.number().optional(),
  excuseDate: z.string().min(1, "تاريخ الاستئذان مطلوب"),
  excuseType: z.string().min(1, "نوع الاستئذان مطلوب"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  estimatedMinutes: z.coerce.number().optional(),
  reason: z.string().optional(),
});

const evaluationCycleSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  period: z.string().min(1, "الفترة مطلوبة"),
  notes: z.string().optional(),
  participants: z.array(z.object({
    evaluatorId: z.coerce.number(),
    evaluatorRole: z.enum(["manager", "peer"]),
  })).optional(),
});

const delegationSchema = z.object({
  delegateId: z.coerce.number({ required_error: "يرجى اختيار المفوَّض إليه" }),
  scope: z.string().optional(),
  reason: z.string().min(1, "سبب التفويض مطلوب"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const checkOutSchema = z.object({
  notes: z.string().optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
});

const approvalDecisionSchema = z.object({
  approved: z.union([z.boolean(), z.literal("returned")]),
  reason: z.string().optional(),
});

const payrollRunSchema = z.object({
  month: z.string().optional(),
});

const approvalRequestDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});

const attendancePolicySchema = z.object({
  lateThresholdMinutes: z.coerce.number().optional(),
  gpsRadiusMeters: z.coerce.number().optional(),
  penaltyLevel1: z.coerce.number().optional(),
  penaltyLevel2: z.coerce.number().optional(),
  penaltyLevel3: z.coerce.number().optional(),
  penaltyLevel4: z.coerce.number().optional(),
  penaltyLevel5: z.coerce.number().optional(),
  penaltyLevel1Label: z.string().optional(),
  penaltyLevel2Label: z.string().optional(),
  penaltyLevel3Label: z.string().optional(),
  penaltyLevel4Label: z.string().optional(),
  penaltyLevel5Label: z.string().optional(),
});

const violationPatchSchema = z.object({
  type: z.string().optional(),
  severity: z.string().optional(),
  deduction: z.coerce.number().optional(),
  period: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const violationApprovalSchema = z.object({
  notes: z.string().optional(),
});

const shiftPatchSchema = z.object({
  name: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  days: z.any().optional(),
  status: z.string().optional(),
  isDefault: z.boolean().optional(),
  branchId: z.coerce.number().optional().nullable(),
  shiftType: z.enum(["fixed", "flexible", "remote", "split"]).optional(),
  remoteAllowed: z.boolean().optional(),
  splitBreakStart: z.string().optional(),
  splitBreakEnd: z.string().optional(),
  flexStartEarliest: z.string().optional(),
  flexStartLatest: z.string().optional(),
});

const leaveRequestPatchSchema = z.object({
  status: z.string().optional(),
  reason: z.string().optional(),
});

const leaveCancelSchema = z.object({
  reason: z.string().optional(),
});

const payrollPatchSchema = z.object({
  status: z.string().optional(),
});

const performancePatchSchema = z.object({
  overallScore: z.coerce.number().optional(),
  score: z.coerce.number().optional(),
  comments: z.string().optional(),
  feedback: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "acknowledged"]).optional(),
  strengths: z.any().optional(),
  improvements: z.any().optional(),
  goals: z.any().optional(),
});

const officialLetterPatchSchema = z.object({
  subject: z.string().optional(),
  content: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

const letterApprovalSchema = z.object({
  approved: z.union([z.boolean(), z.literal("returned")]).optional(),
  notes: z.string().optional(),
});

const onboardingStepsSchema = z.object({
  steps: z.array(z.string()),
});

const impactPreviewLeaveSchema = z.object({
  employeeId: z.coerce.number({ required_error: "معرف الموظف مطلوب" }),
  leaveTypeId: z.coerce.number({ required_error: "نوع الإجازة مطلوب" }),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  days: z.coerce.number().optional(),
});

const impactPreviewTerminationSchema = z.object({
  employeeId: z.coerce.number({ required_error: "معرف الموظف مطلوب" }),
});

const impactPreviewViolationSchema = z.object({
  employeeId: z.coerce.number({ required_error: "معرف الموظف مطلوب" }),
  deduction: z.coerce.number().optional().default(0),
  severity: z.string().optional().default("medium"),
});

const peerEvaluationSchema = z.object({
  overallScore: z.coerce.number().optional(),
  scores: z.any().optional(),
  comments: z.string().optional(),
});

const upwardReviewSchema = z.object({
  managerId: z.coerce.number().optional(),
  overallScore: z.coerce.number().optional(),
  scores: z.any().optional(),
  comments: z.string().optional(),
});

const publicHolidayPatchSchema = z.object({
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  isRecurring: z.boolean().optional(),
});

const transferApprovalSchema = z.object({
  approved: z.boolean().optional(),
  notes: z.string().optional(),
});

const transferConfirmSchema = z.object({
  confirmed: z.boolean().optional(),
  notes: z.string().optional(),
});

const idpPatchSchema = z.object({
  title: z.string().optional(),
  goals: z.any().optional(),
  skills: z.any().optional(),
  status: z.string().optional(),
  targetDate: z.string().optional(),
  notes: z.string().optional(),
  progress: z.coerce.number().optional(),
});

const monthlyAccrualsSchema = z.object({
  period: z.string().optional(),
});

const excuseApprovalSchema = z.object({
  approved: z.boolean().optional(),
  rejectionReason: z.string().optional(),
});

const router = Router();

// Per-user check-in limiter. The /hr router runs after authMiddleware in
// routes/index.ts, so req.scope is set. We deliberately do NOT exempt
// owner/admin: the cap reflects "humans can't physically check in 5 times
// per minute," and the role of the actor doesn't change that physical fact.
const checkInLimiter = createPerUserLimiter({
  prefix: "hr:check-in",
  windowMs: 60 * 1000,
  max: 5,
  message: "تم تجاوز الحد الأقصى لمحاولات تسجيل الحضور. يرجى المحاولة بعد دقيقة",
  skip: () => false,
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE – check-in and dedicated check-out endpoints
// ─────────────────────────────────────────────────────────────────────────────

// RBAC v2: hr.attendance.checkin is self-service in featureCatalog, so the
// authorize() middleware auto-grants every employee unconditionally.
// Replaces the legacy hr:self/hr:create permission gate.
router.post("/check-in", checkInLimiter, authorize({ feature: "hr.attendance.checkin", action: "create" }), async (req, res) => {
  // Step 4 of the HR operational audit — attendance check-in.
  // Converts the two raw res.status(400) bailouts to ConflictError with
  // meta pointing at the blocking row, and guards against a missing
  // active assignment. The deep GPS + late + penalty logic is unchanged.
  try {
    const scope = req.scope!;
    const now = new Date();
    const today = toDateISO(now);
    const period = today.slice(0, 7);
    const { lat, lon, notes, workType } = zodParse(checkInSchema.safeParse(req.body));

    // Guard: the caller must have an active assignment. Without this, the
    // INSERT INTO attendance below would hit a 23502 NOT NULL on
    // "assignmentId" — opaque from the UI. Fail cleanly with a typed error
    // the frontend can show as a real message.
    if (!scope.activeAssignmentId) {
      throw new ConflictError("لا يوجد تعيين نشط لهذا الحساب", {
        field: "assignmentId",
        fix: "تواصل مع مدير الموارد البشرية لتفعيل تعيينك الوظيفي.",
      });
    }

    // ── Step 1b: Verify active contract exists ──
    const [activeContract] = await rawQuery<any>(
      `SELECT id, "endDate", status FROM employee_contracts
       WHERE "assignmentId" = $1 AND status = 'active'
         AND "deletedAt" IS NULL
         AND "startDate" <= $2 AND ("endDate" IS NULL OR "endDate" >= $2)
       LIMIT 1`,
      [scope.activeAssignmentId, today]
    );
    if (!activeContract) {
      throw new ConflictError("لا يوجد عقد نشط لتعيينك الحالي — لا يمكن تسجيل الحضور", {
        field: "contract",
        fix: "تواصل مع الموارد البشرية للتأكد من وجود عقد ساري المفعول.",
      });
    }

    // ── Step 1: GPS + timestamp received ──

    // ── Step 2: Prevent duplicate check-in (pre-check for user-friendly error) ──
    const [existing] = await rawQuery<any>(
      `SELECT id, "checkOut" FROM attendance
       WHERE "assignmentId" = $1 AND date = $2 AND "deletedAt" IS NULL`,
      [scope.activeAssignmentId, today]
    );
    if (existing) {
      throw new ConflictError(
        existing.checkOut
          ? "لقد سجلت الحضور والانصراف اليوم"
          : "لقد سجلت الحضور اليوم. استخدم نقطة الانصراف لتسجيل المغادرة",
        {
          field: "attendance",
          fix: existing.checkOut
            ? "لا يمكن إعادة تسجيل الحضور بعد الانصراف. الإجراء يتم مرة واحدة في اليوم."
            : "افتح صفحة الحضور واستخدم زر الانصراف لإكمال الدوام.",
          meta: {
            existingAttendanceId: existing.id,
            alreadyCheckedOut: !!existing.checkOut,
          },
        }
      );
    }

    // ── Step 3: Fetch assignment, shift, and branch ──
    const [assignment] = await rawQuery<any>(
      `SELECT ea."branchId", ea.salary, ea."employeeId", ea."departmentId",
              b.lat AS "branchLat", b.lon AS "branchLon"
       FROM employee_assignments ea
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ea.id = $1 AND ea."companyId" = $2`,
      [scope.activeAssignmentId, scope.companyId]
    );

    // ── Step 4: Check if today is a work day ──
    const [shiftAssignment] = await rawQuery<any>(
      `SELECT s.id, s."startTime", s."endTime", s.days, s."shiftType", s."remoteAllowed", s."flexStartEarliest", s."flexStartLatest"
       FROM employee_shift_assignments esa
       JOIN shifts s ON s.id = esa."shiftId"
       WHERE esa."assignmentId" = $1
         AND (esa."endDate" IS NULL OR esa."endDate" >= $2)
       ORDER BY esa.id DESC LIMIT 1`,
      [scope.activeAssignmentId, today]
    );
    let shift = shiftAssignment;
    if (!shift) {
      const [defaultShift] = await rawQuery<any>(
        `SELECT id, "startTime", "endTime", days, "shiftType", "remoteAllowed", "flexStartEarliest", "flexStartLatest" FROM shifts
         WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL
         ORDER BY "isDefault" DESC LIMIT 1`,
        [scope.companyId]
      );
      shift = defaultShift;
    }
    if (!shift) {
      const { insertId: newShiftId } = await rawExecute(
        `INSERT INTO shifts ("companyId","branchId",name,"startTime","endTime",days,"isDefault",status)
         VALUES ($1,$2,'وردية افتراضية','08:00','17:00','0,1,2,3,4',true,'active')`,
        [scope.companyId, scope.branchId]
      );
      shift = { id: newShiftId, startTime: "08:00", endTime: "17:00", days: "0,1,2,3,4" };
    }

    const dayOfWeek = now.getDay();
    const shiftDays = String(shift.days ?? "0,1,2,3,4").split(",").map(Number);
    const isWorkDay = shiftDays.includes(dayOfWeek);

    // ── Step 4b: Check if today is a public holiday (no late penalty on holidays) ──
    const [publicHoliday] = await rawQuery<any>(
      `SELECT id, name FROM public_holidays
       WHERE "companyId"=$1 AND $2::date BETWEEN "startDate"::date AND "endDate"::date`,
      [scope.companyId, today]
    );

    // ── Step 5: Check if employee is on approved leave ──
    const [activeLeave] = await rawQuery<any>(
      `SELECT id FROM hr_leave_requests
       WHERE "employeeId" = $1 AND status = 'approved'
         AND "startDate" <= $2 AND "endDate" >= $2 AND "deletedAt" IS NULL`,
      [scope.employeeId, today]
    );
    if (activeLeave) {
      throw new ConflictError("أنت في إجازة مُعتمدة اليوم. لا يمكن تسجيل الحضور", {
        field: "attendance",
        fix: "الإجازة المعتمدة تمنع تسجيل الحضور. راجع تفاصيل الإجازة.",
        meta: { leaveRequestId: activeLeave.id },
      });
    }

    // ── Step 6: GPS validation (Haversine) ──
    // Remote and flexible shifts skip GPS enforcement
    const isRemoteShift = shift?.remoteAllowed === true || shift?.shiftType === 'remote' || workType === 'remote';
    let distanceMeters: number | null = null;
    let isOutOfRange = false;
    const [policy] = await rawQuery<any>(
      `SELECT "gpsRadiusMeters","lateThresholdMinutes",
              "penaltyLevel1","penaltyLevel2","penaltyLevel3","penaltyLevel4","penaltyLevel5",
              "penaltyLevel1Label","penaltyLevel2Label","penaltyLevel3Label","penaltyLevel4Label","penaltyLevel5Label"
       FROM attendance_policies WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const gpsRadius = policy?.gpsRadiusMeters ?? 500;
    const lateThreshold = policy?.lateThresholdMinutes ?? 15;

    if (!isRemoteShift && lat !== undefined && lat !== null && lon !== undefined && lon !== null && assignment?.branchLat && assignment?.branchLon) {
      distanceMeters = Math.round(
        haversineKm(Number(lat), Number(lon), Number(assignment.branchLat), Number(assignment.branchLon)) * 1000
      );
      isOutOfRange = distanceMeters > gpsRadius;
    }

    if (isOutOfRange) {
      // GPS violation will be recorded inside the transaction below
    }

    // ── Step 7: Late detection ──
    // For flexible shifts, use flexStartLatest as the deadline instead of startTime
    let lateMinutes = 0;
    let isLate = false;
    const effectiveStartTime = shift?.shiftType === 'flexible' && shift?.flexStartLatest
      ? shift.flexStartLatest
      : shift?.startTime;
    if (effectiveStartTime) {
      const parts = String(effectiveStartTime).split(":");
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      const expected = new Date(today + "T00:00:00");
      expected.setHours(h, m, 0, 0);
      const diff = now.getTime() - expected.getTime();
      if (diff > 0) { lateMinutes = Math.floor(diff / 60000); isLate = lateMinutes > 0; }
    }

    // ── Step 8: Determine attendance status FIRST (must precede threshold/penalty computation) ──
    // Holiday, off-day, and remote shifts suppress all late penalties
    let checkInStatus: string;
    if (publicHoliday) {
      checkInStatus = "present_holiday";
      // Suppress lateness on public holidays
      lateMinutes = 0;
      isLate = false;
    } else if (!isWorkDay) {
      checkInStatus = "present_off_day";
      lateMinutes = 0;
      isLate = false;
    } else if (isRemoteShift) {
      checkInStatus = "remote";
      // Remote workers are not penalized for GPS or lateness (flexible-by-nature)
    } else if (isOutOfRange) {
      checkInStatus = "present_out_of_range";
    } else {
      checkInStatus = "present";
    }

    // ── Step 9: Check policy threshold — after holiday/status resolution ──
    const exceedsThreshold = isLate && lateMinutes > lateThreshold && !publicHoliday && isWorkDay;

    // ── Step 10: Calculate deduction ──
    let deductionAmount = 0;
    if (exceedsThreshold && assignment?.salary) {
      const dailySalary = Number(assignment.salary) / 30;
      const minuteRate = dailySalary / 480;
      deductionAmount = roundTo2(minuteRate * lateMinutes);
    }

    // ── Wrap all writes in a single atomic transaction ──
    const txResult = await withTransaction(async (client) => {
      // GPS violation
      if (isOutOfRange) {
        await client.query(
          `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
           VALUES ($1,$2,'gps_out_of_range',$3,'low',0,$4)`,
          [scope.companyId, scope.activeAssignmentId, `تسجيل حضور خارج نطاق الفرع بمسافة ${distanceMeters}م`, period]
        );
      }

      // Attendance INSERT with idempotency guard
      const insertRes = await client.query(
        `INSERT INTO attendance ("assignmentId","companyId","branchId",date,"checkIn","lateMinutes",status,notes,"checkInLat","checkInLon","workType","contractId")
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
         WHERE NOT EXISTS (SELECT 1 FROM attendance WHERE "assignmentId"=$1 AND date=$4 AND "deletedAt" IS NULL)
         RETURNING id`,
        [scope.activeAssignmentId, scope.companyId, assignment?.branchId ?? scope.branchId,
          today, now.toISOString(), lateMinutes, checkInStatus, notes ?? null,
          lat !== undefined && lat !== null ? Number(lat) : null, lon !== undefined && lon !== null ? Number(lon) : null,
          isRemoteShift ? 'remote' : (workType || 'office'), activeContract.id]
      );
      if (!insertRes.rows.length) {
        throw new ConflictError("لقد سجلت الحضور اليوم. استخدم نقطة الانصراف لتسجيل المغادرة", {
          field: "attendance",
          fix: "افتح صفحة الحضور واستخدم زر الانصراف لإكمال الدوام.",
        });
      }
      const attId = insertRes.rows[0].id;

      // Late violation + deduction + penalty
      let vId: number | null = null;
      let pLevel = 0, pLabel = "", pDeduction = 0;

      if (exceedsThreshold) {
        const violRes = await client.query(
          `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
           VALUES ($1,$2,'late_arrival',$3,'medium',$4,$5) RETURNING id`,
          [scope.companyId, scope.activeAssignmentId, `تأخر ${lateMinutes} دقيقة عن وقت البداية (تجاوز الحد ${lateThreshold} دقيقة)`, deductionAmount, period]
        );
        vId = violRes.rows[0]?.id ?? null;

        await client.query(
          `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
           VALUES ($1,$2,$3,'late',$4,$5,$6,'pending_payroll')`,
          [scope.companyId, scope.activeAssignmentId, attId, lateMinutes, deductionAmount, period]
        );

        // Monthly violation count for penalty escalation
        const monthCountRes = await client.query(
          `SELECT COUNT(*) AS cnt FROM employee_violations
           WHERE "assignmentId" = $1 AND period = $2 AND type = 'late_arrival' AND "deletedAt" IS NULL`,
          [scope.activeAssignmentId, period]
        );
        const count = Number(monthCountRes.rows[0]?.cnt ?? 1);

        if (count >= 10) {
          pLevel = 5; pDeduction = Number(policy?.penaltyLevel5 ?? 500);
          pLabel = policy?.penaltyLevel5Label ?? "خصم ثلاثة أيام + إنذار نهائي";
        } else if (count >= 7) {
          pLevel = 4; pDeduction = Number(policy?.penaltyLevel4 ?? 200);
          pLabel = policy?.penaltyLevel4Label ?? "خصم يومين";
        } else if (count >= 5) {
          pLevel = 3; pDeduction = Number(policy?.penaltyLevel3 ?? 100);
          pLabel = policy?.penaltyLevel3Label ?? "خصم يوم";
        } else if (count >= 3) {
          pLevel = 2; pDeduction = Number(policy?.penaltyLevel2 ?? 50);
          pLabel = policy?.penaltyLevel2Label ?? "إنذار كتابي";
        } else {
          pLevel = 1; pDeduction = Number(policy?.penaltyLevel1 ?? 0);
          pLabel = policy?.penaltyLevel1Label ?? "إنذار شفهي";
        }

        if (pDeduction > 0) {
          await client.query(
            `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
             VALUES ($1,$2,$3,'penalty',0,$4,$5,'pending_payroll')`,
            [scope.companyId, scope.activeAssignmentId, attId, pDeduction, period]
          );
        }
      }

      // Monthly stats UPSERT
      await client.query(
        `INSERT INTO employee_monthly_attendance ("companyId","assignmentId",period,"presentDays","lateDays","totalLateMinutes","totalDeduction")
         VALUES ($1,$2,$3,1,$4,$5,$6)
         ON CONFLICT ("assignmentId",period) DO UPDATE
         SET "presentDays" = employee_monthly_attendance."presentDays" + 1,
             "lateDays" = employee_monthly_attendance."lateDays" + $4,
             "totalLateMinutes" = employee_monthly_attendance."totalLateMinutes" + $5,
             "totalDeduction" = employee_monthly_attendance."totalDeduction" + $6`,
        [scope.companyId, scope.activeAssignmentId, period, isLate ? 1 : 0, lateMinutes, deductionAmount + pDeduction]
      );

      return { attendanceId: attId, violationId: vId, penaltyLevel: pLevel, penaltyLabel: pLabel, penaltyDeduction: pDeduction };
    });

    const { attendanceId, violationId, penaltyLevel, penaltyLabel, penaltyDeduction } = txResult;

    // Fire-and-forget: inquiry memo (outside transaction — idempotent)
    if (exceedsThreshold && violationId) {
      ensureInquiryMemoForViolation({
        companyId: scope.companyId,
        branchId: assignment?.branchId ?? scope.branchId,
        assignmentId: scope.activeAssignmentId,
        employeeId: scope.employeeId ?? assignment?.employeeId ?? 0,
        violationId,
        incidentType: "late",
        incidentDate: today,
        incidentDurationMinutes: lateMinutes,
        incidentDescription: `تأخر ${lateMinutes} دقيقة عن وقت البداية (تجاوز الحد ${lateThreshold} دقيقة)`,
        source: "auto",
        createdBy: scope.userId,
      }).catch((err) => logger.error(err, "ensureInquiryMemoForViolation (check-in) error:"));
    }

    // ── Step 16: Notify employee about late ──
    if (exceedsThreshold) {
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "late_warning", title: "تنبيه تأخر",
        body: `تم تسجيل تأخرك ${lateMinutes} دقيقة اليوم. ${penaltyLabel ? `العقوبة: ${penaltyLabel}` : ""}`,
        priority: "high", refType: "attendance", refId: attendanceId,
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    // ── Step 17: Notify manager ──
    if (exceedsThreshold) {
      getManagerAssignmentId(scope.companyId, scope.branchId).then((managerAssignmentId) => {
        if (managerAssignmentId) {
          createNotification({
            companyId: scope.companyId, assignmentId: managerAssignmentId,
            type: "late_arrival", title: "تأخر موظف",
            body: `تأخر الموظف ${lateMinutes} دقيقة اليوم ${today}${penaltyLevel > 0 ? ` (مستوى العقوبة: ${penaltyLevel})` : ""}`,
            priority: "high", refType: "attendance", refId: attendanceId,
          }).catch((e) => logger.error(e, "hr background task failed"));
        }
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "attendance.checkin", entity: "attendance", entityId: attendanceId,
      details: JSON.stringify({ lateMinutes, isLate, distanceMeters, isOutOfRange, penaltyLevel, penaltyLabel, isWorkDay }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "attendance", entityId: attendanceId,
      after: { lateMinutes, isLate, distanceMeters, isOutOfRange, penaltyLevel, penaltyLabel, isWorkDay },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json({
      message: "تم تسجيل الحضور", lateMinutes, isLate,
      deductionAmount, distanceMeters, isOutOfRange, type: "checkin",
      penaltyLevel, penaltyLabel, penaltyDeduction, isWorkDay,
    });
  } catch (err) {
    handleRouteError(err, res, "Check-in error:");
  }
});

// RBAC v2: same self-service guarantee as /check-in.
router.post("/check-out", authorize({ feature: "hr.attendance.checkin", action: "create" }), async (req, res) => {
  // Step 4 of the HR operational audit — attendance check-out.
  // Symmetric treatment to check-in: ConflictError when the caller is
  // trying to check out without having checked in, or when they've
  // already checked out. Assignment guard matches the check-in handler.
  try {
    const scope = req.scope!;
    const now = new Date();
    const today = toDateISO(now);
    const period = today.slice(0, 7);
    const { notes, lat, lon } = zodParse(checkOutSchema.safeParse(req.body ?? {}));

    if (!scope.activeAssignmentId) {
      throw new ConflictError("لا يوجد تعيين نشط لهذا الحساب", {
        field: "assignmentId",
        fix: "تواصل مع مدير الموارد البشرية لتفعيل تعيينك الوظيفي.",
      });
    }

    const [existing] = await rawQuery<any>(
      `SELECT id, "checkIn", "checkOut" FROM attendance
       WHERE "assignmentId" = $1 AND date = $2 AND "deletedAt" IS NULL`,
      [scope.activeAssignmentId, today]
    );
    if (!existing) {
      throw new ConflictError("لم تسجل حضوراً اليوم", {
        field: "attendance",
        fix: "يجب تسجيل الحضور أولاً قبل تسجيل الانصراف.",
      });
    }
    if (existing.checkOut) {
      throw new ConflictError("لقد سجلت الانصراف مسبقاً اليوم", {
        field: "attendance",
        fix: "تم تسجيل انصرافك بالفعل. لا يمكن إعادة الانصراف في نفس اليوم.",
        meta: {
          existingAttendanceId: existing.id,
          checkOutAt: existing.checkOut,
        },
      });
    }
    // NOTE: The actual UPDATE below uses an atomic "checkOut" IS NULL guard to prevent race conditions.

    // ── Fetch assignment for salary ──
    const [assignment] = await rawQuery<any>(
      `SELECT ea.salary, ea."branchId", ea."employeeId", b.lat AS "branchLat", b.lon AS "branchLon"
       FROM employee_assignments ea
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ea.id = $1 AND ea."companyId" = $2`,
      [scope.activeAssignmentId, scope.companyId]
    );

    // ── Fetch shift for end time ──
    let shift: any = null;
    const [shiftAssignment] = await rawQuery<any>(
      `SELECT s."endTime", s."startTime"
       FROM employee_shift_assignments esa
       JOIN shifts s ON s.id = esa."shiftId"
       WHERE esa."assignmentId" = $1
         AND (esa."endDate" IS NULL OR esa."endDate" >= $2)
       ORDER BY esa.id DESC LIMIT 1`,
      [scope.activeAssignmentId, today]
    );
    if (shiftAssignment) {
      shift = shiftAssignment;
    } else {
      const [defaultShift] = await rawQuery<any>(
        `SELECT "endTime", "startTime" FROM shifts
         WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL
         ORDER BY "isDefault" DESC LIMIT 1`,
        [scope.companyId]
      );
      shift = defaultShift ?? { endTime: "17:00", startTime: "08:00" };
    }

    // ── GPS validation on check-out ──
    const [policy] = await rawQuery<any>(
      `SELECT "gpsRadiusMeters" FROM attendance_policies WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const gpsRadius = policy?.gpsRadiusMeters ?? 500;
    let checkOutDistanceMeters: number | null = null;
    let isCheckOutOutOfRange = false;
    if (lat !== undefined && lat !== null && lon !== undefined && lon !== null && assignment?.branchLat && assignment?.branchLon) {
      checkOutDistanceMeters = Math.round(
        haversineKm(Number(lat), Number(lon), Number(assignment.branchLat), Number(assignment.branchLon)) * 1000
      );
      isCheckOutOutOfRange = checkOutDistanceMeters > gpsRadius;
    }

    // ── Calculate worked time ──
    const checkInTime = new Date(existing.checkIn);
    const workedMs = now.getTime() - checkInTime.getTime();
    const workedHours = roundTo2(workedMs / 3600000);

    // ── Calculate overtime: compare actual checkout vs shift end ──
    let overtimeMinutes = 0;
    let earlyDepartureMinutes = 0;
    if (shift?.endTime) {
      const parts = String(shift.endTime).split(":");
      const endH = Number(parts[0]);
      const endM = Number(parts[1] ?? 0);
      const shiftEnd = new Date(today + "T00:00:00");
      shiftEnd.setHours(endH, endM, 0, 0);
      const diffMs = now.getTime() - shiftEnd.getTime();
      if (diffMs > 0) {
        overtimeMinutes = Math.floor(diffMs / 60000);
      } else if (diffMs < 0) {
        earlyDepartureMinutes = Math.abs(Math.floor(diffMs / 60000));
      }
    }

    // ── Check for approved excuse before transaction (read-only) ──
    let excusedEarlyLeave = false;
    let approvedExcuseId: number | null = null;
    if (earlyDepartureMinutes > 0) {
      const [approvedExcuse] = await rawQuery<any>(
        `SELECT id, "estimatedMinutes" FROM hr_excuse_requests
         WHERE "assignmentId" = $1 AND "excuseDate" = $2 AND status = 'approved' AND "excuseType" IN ('early_leave', 'personal')
         LIMIT 1`,
        [scope.activeAssignmentId, today]
      ).catch((e) => { logger.error(e, "hr query failed"); return [null]; });
      if (approvedExcuse) {
        excusedEarlyLeave = true;
        approvedExcuseId = approvedExcuse.id;
      }
    }

    const dailySalary = Number(assignment?.salary ?? 0) / 30;
    const minuteRate = dailySalary / 480;
    const earlyDeductionAmount = (earlyDepartureMinutes > 0 && !excusedEarlyLeave) ? roundTo2(minuteRate * earlyDepartureMinutes) : 0;

    // ── Wrap all writes in a transaction ──
    const txResult = await withTransaction(async (client) => {
      // GPS violation
      if (isCheckOutOutOfRange && checkOutDistanceMeters !== null) {
        await client.query(
          `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
           VALUES ($1,$2,'gps_out_of_range',$3,'low',0,$4)`,
          [scope.companyId, scope.activeAssignmentId,
            `تسجيل انصراف خارج نطاق الفرع بمسافة ${checkOutDistanceMeters}م`, period]
        );
      }

      // Update attendance record (atomic: only if checkOut IS NULL)
      const checkOutRes = await client.query(
        `UPDATE attendance SET "checkOut" = $1, notes = COALESCE($2, notes), "checkOutLat" = $4, "checkOutLon" = $5, "overtimeMinutes" = $6 WHERE id = $3 AND "companyId" = $7 AND "checkOut" IS NULL AND "deletedAt" IS NULL RETURNING id`,
        [now.toISOString(), notes ?? null, existing.id,
          lat !== undefined && lat !== null ? Number(lat) : null,
          lon !== undefined && lon !== null ? Number(lon) : null,
          overtimeMinutes, scope.companyId]
      );
      if (!checkOutRes.rows.length) {
        throw new ConflictError("لقد سجلت الانصراف مسبقاً اليوم", {
          field: "attendance",
          fix: "تم تسجيل انصرافك بالفعل. لا يمكن إعادة الانصراف في نفس اليوم.",
        });
      }

      // Update monthly stats
      await client.query(
        `INSERT INTO employee_monthly_attendance ("companyId","assignmentId",period,"overtimeMinutes")
         VALUES ($1,$2,$3,$4)
         ON CONFLICT ("assignmentId",period) DO UPDATE
         SET "overtimeMinutes" = COALESCE(employee_monthly_attendance."overtimeMinutes", 0) + $4`,
        [scope.companyId, scope.activeAssignmentId, period, overtimeMinutes]
      );

      // Mark excuse as used
      if (excusedEarlyLeave && approvedExcuseId) {
        await client.query(
          `UPDATE hr_excuse_requests SET "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2`,
          [approvedExcuseId, scope.companyId]
        );
      }

      // Early departure violation + deduction
      let earlyViolationId: number | null = null;
      if (earlyDepartureMinutes > 0 && !excusedEarlyLeave) {
        const vRes = await client.query(
          `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
           VALUES ($1,$2,'early_departure',$3,'medium',$4,$5)
           RETURNING id`,
          [scope.companyId, scope.activeAssignmentId,
            `خروج مبكر بمقدار ${earlyDepartureMinutes} دقيقة عن وقت نهاية الوردية`,
            earlyDeductionAmount, period]
        );
        earlyViolationId = vRes.rows[0]?.id ?? null;

        if (earlyDeductionAmount > 0) {
          await client.query(
            `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
             VALUES ($1,$2,$3,'early_departure',$4,$5,$6,'pending_payroll')`,
            [scope.companyId, scope.activeAssignmentId, existing.id, earlyDepartureMinutes, earlyDeductionAmount, period]
          );
        }
      }

      return { earlyViolationId };
    });

    // ── Fire-and-forget side effects outside transaction ──
    if (earlyDepartureMinutes > 0 && !excusedEarlyLeave && txResult.earlyViolationId) {
      ensureInquiryMemoForViolation({
        companyId: scope.companyId,
        branchId: assignment?.branchId ?? scope.branchId,
        assignmentId: scope.activeAssignmentId,
        employeeId: scope.employeeId ?? assignment?.employeeId ?? 0,
        violationId: txResult.earlyViolationId,
        incidentType: "early_leave",
        incidentDate: today,
        incidentDurationMinutes: earlyDepartureMinutes,
        incidentDescription: `خروج مبكر بمقدار ${earlyDepartureMinutes} دقيقة عن وقت نهاية الوردية`,
        source: "auto",
        createdBy: scope.userId,
      }).catch((err) => logger.error(err, "ensureInquiryMemoForViolation (check-out) error:"));

      // ── Notify employee about early departure ──
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "early_departure_warning", title: "تنبيه خروج مبكر",
        body: `تم تسجيل خروجك المبكر بمقدار ${earlyDepartureMinutes} دقيقة اليوم.`,
        priority: "high", refType: "attendance", refId: existing.id,
      }).catch((e) => logger.error(e, "hr background task failed"));

      // ── Notify manager ──
      getManagerAssignmentId(scope.companyId, scope.branchId).then((managerAssignmentId) => {
        if (managerAssignmentId) {
          createNotification({
            companyId: scope.companyId, assignmentId: managerAssignmentId,
            type: "early_departure", title: "خروج مبكر لموظف",
            body: `غادر الموظف مبكراً بمقدار ${earlyDepartureMinutes} دقيقة اليوم ${today}`,
            priority: "high", refType: "attendance", refId: existing.id,
          }).catch((e) => logger.error(e, "hr background task failed"));
        }
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "attendance.checkout", entity: "attendance", entityId: existing.id,
      details: JSON.stringify({ workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, checkOutDistanceMeters }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "attendance", entityId: existing.id,
      after: { workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, checkOutDistanceMeters },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json({ message: "تم تسجيل الانصراف", workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, type: "checkout" });
  } catch (err) {
    handleRouteError(err, res, "Check-out error:");
  }
});

router.get("/attendance", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { month } = req.query as { month?: string };
    const monthStr = month ?? currentPeriod();

    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'a."companyId"', branchColumn: 'a."branchId"', enforceBranchScope: true });
    params.push(monthStr);

    const records = await rawQuery<any>(
      `SELECT a.id, a.date, a."checkIn", a."checkOut",
              a."lateMinutes", a.status, e.name AS "employeeName",
              a."checkInLat", a."checkInLon", a."checkOutLat", a."checkOutLon",
              CASE WHEN a."checkIn" IS NOT NULL AND a."checkOut" IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (a."checkOut" - a."checkIn")) / 3600.0, 2)
                ELSE NULL
              END AS "workHours",
              COALESCE(a."overtimeMinutes", 0) AS "overtimeMinutes",
              COALESCE(v.deduction, 0) AS "deductionAmount",
              COALESCE(v.severity, 'none') AS "violationSeverity"
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN LATERAL (
         SELECT ev.deduction, ev.severity
         FROM employee_violations ev
         WHERE ev."assignmentId" = ea.id AND ev."deletedAt" IS NULL AND ev.period = TO_CHAR(a.date, 'YYYY-MM')
         ORDER BY ev.id DESC LIMIT 1
       ) v ON TRUE
       WHERE ${where}
         AND TO_CHAR(a.date, 'YYYY-MM') = $${nextParamIndex}
       ORDER BY a.date DESC
       LIMIT 5000`,
      params
    );

    res.json({ data: records, total: records.length, page: 1, pageSize: records.length });
  } catch (err) {
    handleRouteError(err, res, "Get attendance error:");
  }
});

router.get("/attendance/today-summary", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const today = todayISO();
    const rows = await rawQuery<any>(
      `SELECT ea.id AS "assignmentId", e.id AS "employeeId", e.name,
              a.status, a."checkIn", a."checkOut", COALESCE(a."lateMinutes", 0) AS "lateMinutes"
       FROM employee_assignments ea
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN attendance a ON a."assignmentId" = ea.id AND a.date = $2
       WHERE ea."companyId" = $1 AND ea.status = 'active'
       ORDER BY e.name
       LIMIT 1000`,
      [scope.companyId, today]
    );
    const data = rows.map((r: any) => ({
      ...r,
      status: r.status || (r.checkIn ? "present" : "absent"),
    }));
    res.json({ data, total: data.length });
  } catch (err) { handleRouteError(err, res, "Today summary error:"); }
});

router.get("/attendance/:id", authorize({ feature: "hr.attendance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT a.*, e.name AS "employeeName", e."empNumber",
              CASE WHEN a."checkIn" IS NOT NULL AND a."checkOut" IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (a."checkOut" - a."checkIn")) / 3600.0, 2)
                ELSE NULL
              END AS "totalHours"
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE a.id = $1 AND a."companyId" = $2 AND a."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("سجل الحضور غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get attendance detail error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE TYPES & BALANCES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/leave-types", authorize({ feature: "hr.leaves", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const types = await rawQuery<any>(
      `SELECT id, name, "annualDays" AS "maxDays", true AS "requiresApproval", "isPaid"
       FROM hr_leave_types WHERE "companyId" = $1 ORDER BY name`,
      [scope.companyId]
    );
    res.json({ data: types, total: types.length, page: 1, pageSize: types.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.get("/leave-balance", authorize({ feature: "hr.leaves", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId: qEmployeeId } = req.query as { employeeId?: string };
    const targetEmployeeId = qEmployeeId ? Number(qEmployeeId) : scope.employeeId;
    const year = currentYear();
    const balancesFromTable = await rawQuery<any>(
      `SELECT lb.*, lt.name
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lt.id = lb."leaveTypeId"
       WHERE lb."companyId" = $1 AND lb."employeeId" = $2 AND lb.year = $3`,
      [scope.companyId, targetEmployeeId, year]
    );

    if (balancesFromTable.length > 0) {
      const data = balancesFromTable.map((b: any) => ({
        leaveTypeId: b.leaveTypeId, name: b.name, annualDays: b.entitled,
        maxDays: b.entitled, used: Number(b.used), reserved: Number(b.reserved),
        remaining: Number(b.remaining),
      }));
      res.json({ data, total: data.length, page: 1, pageSize: data.length });
      return;
    }

    const balances = await rawQuery<any>(
      `SELECT lt.id AS "leaveTypeId", lt.name, lt."annualDays",
              COALESCE(SUM(lr.days) FILTER (
                WHERE lr.status = 'approved' AND EXTRACT(YEAR FROM lr."startDate") = $3
              ), 0) AS used
       FROM hr_leave_types lt
       LEFT JOIN hr_leave_requests lr ON lr."leaveTypeId" = lt.id AND lr."employeeId" = $2 AND lr."deletedAt" IS NULL
       WHERE lt."companyId" = $1
       GROUP BY lt.id, lt.name, lt."annualDays"
       ORDER BY lt.name`,
      [scope.companyId, targetEmployeeId, year]
    );

    const data = balances.map((b: any) => ({
      ...b, maxDays: Number(b.annualDays ?? 21), used: Number(b.used),
      remaining: Number(b.annualDays ?? 21) - Number(b.used),
    }));
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE REQUESTS – staged approval pipeline (manager → HR → auto-escalation)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/leave-requests", authorize({ feature: "hr.leaves", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, page = "1", limit: lim = "20" } = req.query as { status?: string; page?: string; limit?: string };
    const filters = parseScopeFilters(req);

    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'lr."companyId"',
      disableBranchScope: true,
    });
    let finalWhere = where + ` AND lr."deletedAt" IS NULL`;
    let paramIdx = nextParamIndex;
    if (status) {
      finalWhere += ` AND lr.status = $${paramIdx++}`;
      params.push(status);
    }

    const pageNum = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(lim) || 20, 1), 100);
    const offset = (pageNum - 1) * pageSize;

    params.push(pageSize);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const requests = await rawQuery<any>(
      `SELECT lr.id, lr.status, lr."startDate", lr."endDate", lr.days,
              lr.reason, lr."createdAt", lr."rejectedReason", lr."approvedBy", lr."approvedAt",
              e.name AS "employeeName", lt.name AS "leaveTypeName"
       FROM hr_leave_requests lr
       JOIN employees e ON e.id = lr."employeeId"
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE ${finalWhere}
       ORDER BY lr."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM hr_leave_requests lr WHERE ${finalWhere}`,
      countParams
    );

    res.json({ data: requests, total: Number(countRow?.total ?? 0), page: pageNum, pageSize });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// RBAC v2: hr.leaves view with scope check on the record (company,
// optionally branch/department for managers). The legacy gate only
// checked permission existence; this also enforces the role's scope.
router.get("/leaves/:id", authorize({ feature: "hr.leaves", action: "view", resource: { table: "hr_leave_requests", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery<any>(
      `SELECT lr.id, lr.status, lr."startDate", lr."endDate", lr.days AS duration,
              lr.reason, lr."createdAt", lr."rejectedReason",
              lr."approvedBy", lr."approvedAt",
              lr."leaveTypeId", lr."employeeId", lr."companyId",
              e.name AS "employeeName", lt.name AS "leaveTypeName",
              lt.name AS "leaveType",
              CONCAT('LV-', lr.id) AS ref,
              approver.name AS "approvedByName"
       FROM hr_leave_requests lr
       JOIN employees e ON e.id = lr."employeeId"
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       LEFT JOIN employee_assignments aa ON aa.id = lr."approvedBy"
       LEFT JOIN employees approver ON approver.id = aa."employeeId"
       WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("طلب الإجازة غير موجود");
    res.json(maskFields(req, item));
  } catch (err) { handleRouteError(err, res, "Get leave detail error"); }
});

let leaveTablesEnsured = false;
async function ensureLeaveSchema(): Promise<void> {
  if (leaveTablesEnsured) return;
  await rawExecute(`
    CREATE TABLE IF NOT EXISTS leave_approval_stages (
      id SERIAL PRIMARY KEY,
      "leaveRequestId" INTEGER NOT NULL,
      stage INTEGER NOT NULL DEFAULT 1,
      "requiredRole" VARCHAR(50),
      "assignedTo" INTEGER,
      status VARCHAR(20) DEFAULT 'pending',
      decision TEXT,
      "decidedBy" INTEGER,
      "decidedAt" TIMESTAMPTZ,
      "expiresAt" TIMESTAMPTZ,
      "reminderSentAt" TIMESTAMPTZ,
      "warningSentAt" TIMESTAMPTZ,
      "escalatedAt" TIMESTAMPTZ,
      "autoApprovedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch((e) => logger.error(e, "hr background task failed"));
  await rawExecute(`DO $$ BEGIN
    ALTER TABLE hr_leave_types ADD COLUMN IF NOT EXISTS "genderRestriction" VARCHAR(10);
    ALTER TABLE hr_leave_types ADD COLUMN IF NOT EXISTS "minServiceMonths" INTEGER DEFAULT 0;
    ALTER TABLE hr_leave_types ADD COLUMN IF NOT EXISTS "oncePerCareer" BOOLEAN DEFAULT false;
    ALTER TABLE hr_leave_types ADD COLUMN IF NOT EXISTS "requiresDocument" BOOLEAN DEFAULT false;
    ALTER TABLE hr_leave_types ADD COLUMN IF NOT EXISTS "maxDeptAbsentPct" NUMERIC DEFAULT 25;
  EXCEPTION WHEN OTHERS THEN NULL;
  END $$`).catch((e) => logger.error(e, "hr background task failed"));
  await rawExecute(`DO $$ BEGIN
    ALTER TABLE hr_leave_balances ADD COLUMN IF NOT EXISTS reserved NUMERIC DEFAULT 0;
  EXCEPTION WHEN OTHERS THEN NULL;
  END $$`).catch((e) => logger.error(e, "hr background task failed"));
  leaveTablesEnsured = true;
}

// RBAC v2: hr.leaves.my is self-service so any employee can create a
// request for themselves. Managers / HR creating on behalf of others
// would need hr.leaves with action=create on a non-self scope; that
// path will be added in a later PR.
router.post("/leave-requests", authorize({ feature: "hr.leaves.my", action: "create" }), async (req, res) => {
  try {
    await ensureLeaveSchema();

    const scope = req.scope!;
    const parsed = zodParse(leaveRequestSchema.safeParse(req.body));
    let { leaveTypeId, leaveType: leaveTypeName, startDate, endDate, reason, documentUrl } = parsed as any;

    if (!leaveTypeId && leaveTypeName) {
      const [found] = await rawQuery<any>(
        `SELECT id FROM hr_leave_types WHERE LOWER(name)=LOWER($1) AND "companyId"=$2`,
        [leaveTypeName, scope.companyId]
      );
      if (found) leaveTypeId = found.id;
    }

    if (!leaveTypeId) {
      throw new ValidationError("نوع الإجازة مطلوب", {
        field: "leaveTypeId",
        fix: "اختر نوع الإجازة من القائمة.",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    let rawDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    const year = start.getFullYear();

    // Exclude public holidays that fall within the leave range from the day count
    const holidayOverlap = await rawQuery<any>(
      `SELECT SUM(LEAST("endDate"::date, $2::date) - GREATEST("startDate"::date, $1::date) + 1) AS "holidayDays"
       FROM public_holidays
       WHERE "companyId"=$3
         AND "startDate" <= $2::date AND "endDate" >= $1::date AND "deletedAt" IS NULL`,
      [startDate, endDate, scope.companyId]
    );
    const holidayDays = Math.max(0, Number(holidayOverlap[0]?.holidayDays ?? 0));
    const days = Math.max(1, rawDays - holidayDays);

    // ── Validation 1: Fetch leave type with extended rules ──
    const [leaveType] = await rawQuery<any>(
      `SELECT id, name, "annualDays", "isPaid", "genderRestriction", "minServiceMonths", "oncePerCareer", "requiresDocument", "maxDeptAbsentPct"
       FROM hr_leave_types WHERE id = $1 AND "companyId" = $2`,
      [leaveTypeId, scope.companyId]
    );
    if (!leaveType) {
      throw new NotFoundError("نوع الإجازة غير موجود", {
        field: "leaveTypeId",
        fix: "اختر نوع إجازة صحيحاً من القائمة.",
      });
    }

    // ── Validation 2: Check balance (accounting for reserved days) ──
    const [balance] = await rawQuery<any>(
      `SELECT entitled, used, reserved,
              GREATEST(0, entitled - used - reserved) AS remaining
       FROM hr_leave_balances
       WHERE "companyId" = $1 AND "employeeId" = $2 AND "leaveTypeId" = $3 AND year = $4`,
      [scope.companyId, scope.employeeId, leaveTypeId, year]
    );
    if (balance) {
      const effectiveRemaining = Math.max(0, Number(balance.entitled) - Number(balance.used) - Number(balance.reserved));
      if (effectiveRemaining < days) {
        throw new ConflictError(
          `رصيد الإجازة غير كافٍ. المتبقي الفعلي (بعد الحجوزات): ${effectiveRemaining} يوم، المطلوب: ${days} يوم`,
          {
            field: "days",
            fix: "قلّل عدد أيام الإجازة أو انتظر تجديد الرصيد.",
            meta: {
              requested: days,
              remaining: effectiveRemaining,
              entitled: Number(balance.entitled),
              used: Number(balance.used),
              reserved: Number(balance.reserved),
            },
          }
        );
      }
    } else {
      const [usedRow] = await rawQuery<any>(
        `SELECT COALESCE(SUM(days), 0) AS used FROM hr_leave_requests
         WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND status IN ('approved','pending')
           AND EXTRACT(YEAR FROM "startDate") = $3 AND "deletedAt" IS NULL`,
        [scope.employeeId, leaveTypeId, year]
      );
      const entitled = Number(leaveType.annualDays ?? 21);
      const alreadyUsed = Number(usedRow?.used ?? 0);
      const effectiveRemaining = entitled - alreadyUsed;
      if (effectiveRemaining < days) {
        throw new ConflictError(
          `رصيد الإجازة غير كافٍ. المتبقي: ${effectiveRemaining} يوم، المطلوب: ${days} يوم`,
          {
            field: "days",
            fix: "قلّل عدد أيام الإجازة أو انتظر تجديد الرصيد.",
            meta: {
              requested: days,
              remaining: effectiveRemaining,
              entitled,
              used: alreadyUsed,
            },
          }
        );
      }
    }

    // ── Validation 3: No overlapping requests ──
    const [overlap] = await rawQuery<any>(
      `SELECT id FROM hr_leave_requests
       WHERE "employeeId" = $1 AND status IN ('pending','approved')
         AND "startDate" <= $2 AND "endDate" >= $3 AND "deletedAt" IS NULL`,
      [scope.employeeId, endDate, startDate]
    );
    if (overlap) {
      throw new ConflictError("يوجد طلب إجازة متداخل في هذه الفترة", {
        field: "startDate",
        fix: "اختر فترة لا تتداخل مع إجازة معتمدة أو معلّقة.",
        meta: { overlappingLeaveId: overlap.id },
      });
    }

    // ── Validation 4: Document requirement ──
    if (leaveType.requiresDocument && !documentUrl && !reason) {
      throw new ValidationError(
        "هذا النوع من الإجازة يتطلب إرفاق مستند أو سبب مفصل",
        {
          field: "documentUrl",
          fix: "أرفق مستنداً داعماً أو اكتب سبباً مفصلاً للإجازة.",
          meta: { leaveTypeName: leaveType.name },
        }
      );
    }

    // ── Validation 5: Gender restriction ──
    if (leaveType.genderRestriction) {
      const [emp] = await rawQuery<any>(
        `SELECT gender FROM employees WHERE id = $1`, [scope.employeeId]
      );
      if (emp?.gender && emp.gender !== leaveType.genderRestriction) {
        throw new ForbiddenError(
          `هذا النوع من الإجازة مخصص للموظفين ${leaveType.genderRestriction === "female" ? "الإناث" : "الذكور"} فقط`,
          {
            field: "leaveTypeId",
            fix: "اختر نوع إجازة غير مقيّد بالجنس.",
            meta: {
              required: leaveType.genderRestriction,
              employeeGender: emp.gender,
            },
          }
        );
      }
    }

    // ── Validation 6: Minimum service months ──
    if (leaveType.minServiceMonths && leaveType.minServiceMonths > 0) {
      const [ass] = await rawQuery<any>(
        `SELECT "hireDate" FROM employee_assignments WHERE id = $1`, [scope.activeAssignmentId]
      );
      if (ass?.hireDate) {
        const hireDate = new Date(ass.hireDate);
        const monthsOfService = (currentYear() - hireDate.getFullYear()) * 12 + (new Date().getMonth() - hireDate.getMonth());
        if (monthsOfService < leaveType.minServiceMonths) {
          throw new ConflictError(
            `يشترط مدة خدمة لا تقل عن ${leaveType.minServiceMonths} شهر. مدة خدمتك: ${monthsOfService} شهر`,
            {
              field: "leaveTypeId",
              fix: "انتظر حتى تكتمل مدة الخدمة المطلوبة أو اختر نوع إجازة آخر.",
              meta: {
                requiredMonths: leaveType.minServiceMonths,
                actualMonths: monthsOfService,
              },
            }
          );
        }
      }
    }

    // ── Validation 7: Once-per-career check (e.g., Hajj) ──
    if (leaveType.oncePerCareer) {
      const [prevHajj] = await rawQuery<any>(
        `SELECT id FROM hr_leave_requests
         WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND status = 'approved' AND "deletedAt" IS NULL`,
        [scope.employeeId, leaveTypeId]
      );
      if (prevHajj) {
        throw new ConflictError(
          "لقد حصلت على هذا النوع من الإجازة مسبقاً (مرة واحدة فقط)",
          {
            field: "leaveTypeId",
            fix: "لا يمكن تقديم هذا الطلب أكثر من مرة في المسار المهني.",
            meta: { previousLeaveId: prevHajj.id },
          }
        );
      }
    }

    // ── Validation 8: Department absent percentage limit ──
    const maxDeptPct = Number(leaveType.maxDeptAbsentPct ?? 25);
    const [assignment] = await rawQuery<any>(
      `SELECT "departmentId" FROM employee_assignments WHERE id = $1`, [scope.activeAssignmentId]
    );
    if (assignment?.departmentId) {
      const [deptTotal] = await rawQuery<any>(
        `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "companyId" = $1 AND "departmentId" = $2 AND status = 'active'`,
        [scope.companyId, assignment.departmentId]
      );
      const [deptAbsent] = await rawQuery<any>(
        `SELECT COUNT(DISTINCT lr."employeeId") AS cnt FROM hr_leave_requests lr
         JOIN employee_assignments ea ON ea."employeeId" = lr."employeeId" AND ea."departmentId" = $1
         WHERE lr.status = 'approved' AND lr."startDate" <= $2 AND lr."endDate" >= $3
           AND lr."employeeId" != $4 AND lr."deletedAt" IS NULL`,
        [assignment.departmentId, endDate, startDate, scope.employeeId]
      );
      const totalDept = Number(deptTotal?.cnt ?? 1);
      const absentDept = Number(deptAbsent?.cnt ?? 0);
      if (totalDept > 0 && ((absentDept + 1) / totalDept) * 100 > maxDeptPct) {
        throw new ConflictError(
          `نسبة الغياب في القسم ستتجاوز الحد المسموح (${maxDeptPct}%). الزملاء الغائبون: ${absentDept}/${totalDept}`,
          {
            field: "startDate",
            fix: "اختر تاريخاً آخر أو نسّق مع زملائك الغائبين.",
            meta: {
              maxAbsentPct: maxDeptPct,
              currentlyAbsent: absentDept,
              totalInDept: totalDept,
            },
          }
        );
      }
    }

    // ── Create request with dynamic approval chain from approval_chains table ──
    const entitled = Number(leaveType.annualDays ?? 21);

    // Prefer direct manager (managerId on assignment = employees.id) over branch-level manager lookup
    let managerAssignmentId: number | null = null;
    try {
      const [directManagerRow] = await rawQuery<any>(
        `SELECT ea2.id AS "managerAssignmentId"
         FROM employee_assignments ea
         JOIN employee_assignments ea2 ON ea2."employeeId" = ea."managerId" AND ea2.status = 'active' AND ea2."companyId" = $2
         WHERE ea.id = $1 AND ea."managerId" IS NOT NULL
         LIMIT 1`,
        [scope.activeAssignmentId, scope.companyId]
      );
      managerAssignmentId = directManagerRow?.managerAssignmentId ?? null;
    } catch (_e) { logger.error(_e, "manager assignment lookup failed"); }
    if (!managerAssignmentId) {
      managerAssignmentId = await getManagerAssignmentId(scope.companyId, scope.branchId);
    }
    // Company-level fallback: if no branch-level approver, pick any HR/GM/owner
    // in the company so the leave request is never stranded with a NULL assignee.
    if (!managerAssignmentId) {
      const [companyFallback] = await rawQuery<any>(
        `SELECT id FROM employee_assignments
         WHERE "companyId" = $1 AND status = 'active'
           AND role IN ('hr_manager','general_manager','owner')
         ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 WHEN 'owner' THEN 3 ELSE 4 END
         LIMIT 1`,
        [scope.companyId]
      );
      managerAssignmentId = companyFallback?.id ?? null;
    }
    if (!managerAssignmentId) {
      throw new ConflictError(
        "لا يوجد مدير معتمد لاستلام طلبات الإجازة",
        {
          fix: "الرجاء التواصل مع الإدارة لتعيين مدير فرع أو مدير موارد بشرية قبل تقديم الطلبات.",
          meta: { missingRoles: HR_APPROVAL_ROLES },
        }
      );
    }

    // Read approval chain from DB (fall back to default manager→HR if none configured)
    let chainSteps: any[] = [];
    try {
      chainSteps = await rawQuery<any>(
        `SELECT acs."stepOrder", acs."requiredRole", acs."timeoutHours", acs."autoApproveOnTimeout"
         FROM approval_chains ac
         JOIN approval_chain_steps acs ON acs."chainId" = ac.id
         WHERE ac."companyId" = $1 AND ac."chainType" = 'leaves' AND ac."isActive" = true AND ac."deletedAt" IS NULL
         ORDER BY acs."stepOrder" ASC`,
        [scope.companyId]
      );
    } catch (_e) { logger.error(_e, "leave approval chain query failed"); }

    if (chainSteps.length === 0) {
      chainSteps = [
        { stepOrder: 1, requiredRole: "branch_manager", timeoutHours: 24, autoApproveOnTimeout: false },
        { stepOrder: 2, requiredRole: "hr_manager", timeoutHours: 48, autoApproveOnTimeout: false },
      ];
    }

    const firstStep = chainSteps[0];
    const stage1ExpiresAt = new Date();
    stage1ExpiresAt.setHours(stage1ExpiresAt.getHours() + (firstStep.timeoutHours ?? 24));

    let insertId!: number;
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO hr_leave_balances ("companyId","employeeId","assignmentId","leaveTypeId",year,entitled,used,reserved)
         SELECT $1,$2,$3,$4,$5,$6,0,0
         WHERE NOT EXISTS (
           SELECT 1 FROM hr_leave_balances
           WHERE "companyId"=$1 AND "employeeId"=$2 AND "leaveTypeId"=$4 AND year=$5
         )`,
        [scope.companyId, scope.employeeId, scope.activeAssignmentId, leaveTypeId, year, entitled]
      );
      const balLock = await client.query(
        `SELECT entitled, used, reserved FROM hr_leave_balances
         WHERE "companyId" = $1 AND "employeeId" = $2 AND "leaveTypeId" = $3 AND year = $4
         FOR UPDATE`,
        [scope.companyId, scope.employeeId, leaveTypeId, year]
      );
      if (balLock.rows[0]) {
        const r = balLock.rows[0];
        const rem = Math.max(0, Number(r.entitled) - Number(r.used) - Number(r.reserved));
        if (rem < days) {
          throw new ConflictError(`رصيد الإجازة غير كافٍ. المتبقي: ${rem} يوم، المطلوب: ${days} يوم`, { field: "days" });
        }
      }
      await client.query(
        `UPDATE hr_leave_balances
         SET reserved = reserved + $1
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [days, scope.companyId, scope.employeeId, leaveTypeId, year]
      );

      const result = await client.query(
        `INSERT INTO hr_leave_requests ("employeeId","companyId","leaveTypeId","startDate","endDate",days,reason,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
        [scope.employeeId, scope.companyId, leaveTypeId, startDate, endDate, days, reason ?? null]
      );
      insertId = result.rows[0].id;

      // Find the appropriate assignee for the first step — never store NULL.
      let firstAssignee: number = managerAssignmentId!;
      if (!BRANCH_GM_ROLES.includes(firstStep.requiredRole)) {
        const roleRes = await client.query(
          `SELECT id FROM employee_assignments
           WHERE "companyId" = $1 AND role = $2 AND status = 'active'
           LIMIT 1`,
          [scope.companyId, firstStep.requiredRole]
        );
        if (roleRes.rows[0]) firstAssignee = roleRes.rows[0].id;
      }

      await client.query(
        `INSERT INTO leave_approval_stages ("leaveRequestId",stage,"requiredRole","assignedTo","expiresAt")
         VALUES ($1,1,$2,$3,$4)`,
        [insertId, firstStep.requiredRole, firstAssignee, stage1ExpiresAt.toISOString()]
      );
    });

    if (managerAssignmentId) {
      createNotification({
        companyId: scope.companyId, assignmentId: managerAssignmentId,
        type: "leave_request", title: "طلب إجازة جديد يتطلب موافقتك",
        body: `طلب إجازة ${leaveType.name} لمدة ${days} أيام من ${startDate} إلى ${endDate}`,
        priority: "high", refType: "leave_request", refId: insertId,
        actionUrl: `/hr/leave-requests/${insertId}`,
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "leave.requested", entity: "hr_leave_requests", entityId: insertId,
      details: JSON.stringify({ leaveTypeId, days, startDate, endDate, leaveTypeName: leaveType.name }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    submitWorkflow({
      companyId: scope.companyId,
      branchId: scope.branchId,
      requestType: "leave",
      refTable: "hr_leave_requests",
      refId: insertId,
      title: `طلب إجازة ${leaveType.name} — ${days} ${days === 1 ? "يوم" : "أيام"}`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { leaveTypeId, days, startDate, endDate, reason },
    }).catch((e) => logger.error(e, "hr background task failed"));

    const [request] = await rawQuery<any>(
      `SELECT lr.*, lt.name AS "leaveTypeName"
       FROM hr_leave_requests lr JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE lr.id = $1`,
      [insertId]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "hr_leave_requests", entityId: insertId,
      after: { leaveTypeId, days, startDate, endDate, reason },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.status(201).json(request);
  } catch (err) {
    handleRouteError(err, res, "Request leave error:");
  }
});

// Staged leave approval: manager (stage 1) → HR (stage 2)
router.patch("/leave-requests/:id/approve", authorize({ feature: "hr.leaves", action: "update" }), requireOwnership({ table: "hr_leave_requests", checks: ["company", "branch"] }), async (req, res) => {
  // Step 6 of the HR operational audit — leave approval workflow.
  // 4 authorization / state branches rewritten to ForbiddenError +
  // ConflictError, each one carrying meta so the frontend can show
  // "this stage needs the branch manager, not you" instead of a
  // generic 403.
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, reason } = zodParse(approvalDecisionSchema.safeParse(req.body ?? {}));

    // Authorization: only branch_manager, hr_manager, or owner roles can approve leave
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError(
        "صلاحية الموافقة محصورة بالمدير أو HR أو المالك",
        {
          fix: "اطلب من مديرك المباشر أو مدير الموارد البشرية تنفيذ الموافقة.",
          meta: { yourRole: scope.role },
        }
      );
    }

    const [request] = await rawQuery<any>(
      `SELECT lr.*, lt.name AS "leaveTypeName"
       FROM hr_leave_requests lr
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!request) throw new NotFoundError("الطلب غير موجود");
    if (request.status !== "pending") {
      throw new ConflictError("تم البت في هذا الطلب مسبقاً", {
        field: "status",
        fix: "الطلب إما معتمد أو مرفوض أو ملغى — لا يمكن إعادة البت فيه.",
        meta: { currentStatus: request.status },
      });
    }

    // Find the current pending stage for this request
    const [currentStage] = await rawQuery<any>(
      `SELECT * FROM leave_approval_stages
       WHERE "leaveRequestId" = $1 AND status = 'pending'
       ORDER BY stage ASC LIMIT 1`,
      [id]
    );

    // Enforce stage-role: approver's role must match the required role for the current stage
    if (currentStage && scope.role !== "owner") {
      const stageRequiredRole = currentStage.requiredRole;
      const isAssignedApprover = currentStage.assignedTo === scope.activeAssignmentId;

      if (currentStage.assignedTo && !isAssignedApprover) {
        throw new ForbiddenError(
          "هذه المرحلة مخصصة لموافق آخر — لا يمكنك اتخاذ القرار",
          {
            fix: "اطلب من الموافق المخصص لهذه المرحلة تنفيذ القرار.",
            meta: {
              requiredRole: stageRequiredRole,
              currentStage: currentStage.stage,
              assignedTo: currentStage.assignedTo,
            },
          }
        );
      }

      if (!currentStage.assignedTo) {
        const roleMatchesStage =
          (stageRequiredRole === "manager" && BRANCH_GM_ROLES.includes(scope.role)) ||
          (stageRequiredRole === "hr" && scope.role === "hr_manager") ||
          (stageRequiredRole === "branch_manager" && BRANCH_GM_ROLES.includes(scope.role)) ||
          (stageRequiredRole === "hr_manager" && scope.role === "hr_manager") ||
          (stageRequiredRole === scope.role);
        if (!roleMatchesStage) {
          throw new ForbiddenError(
            `هذه المرحلة تتطلب موافقة ${stageRequiredRole}`,
            {
              fix: `دورك الحالي (${scope.role}) لا يطابق الدور المطلوب.`,
              meta: {
                requiredRole: stageRequiredRole,
                currentStage: currentStage.stage,
                yourRole: scope.role,
              },
            }
          );
        }
      }
    }

    const year = new Date(request.startDate).getFullYear();

    if (!approved) {
      const [reqAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [request.employeeId, scope.companyId]
      );

      await applyTransition({
        entity: "hr_leave_requests",
        id,
        scope,
        action: "leave.rejected",
        fromStates: ["pending"],
        toState: "rejected",
        reason: reason ?? undefined,
        setExtras: {
          approvedBy: scope.activeAssignmentId,
          approvedAt: { raw: "NOW()" },
          rejectedReason: reason ?? null,
        },
        after: { status: "rejected", reason },
        notifications: reqAssignment ? [{
          assignmentId: reqAssignment.id,
          type: "leave_rejected", title: "تم رفض طلب الإجازة",
          body: `تم رفض طلب الإجازة. السبب: ${reason ?? "لم يحدد"}`,
          priority: "high", refType: "leave_request", refId: id,
        }] : [],
        onApply: async (_row, client) => {
          if (currentStage) {
            await client.query(
              `UPDATE leave_approval_stages
               SET status = 'rejected', decision = $1, "decidedBy" = $2, "decidedAt" = NOW()
               WHERE id = $3`,
              [reason ?? "مرفوض", scope.activeAssignmentId, currentStage.id]
            );
          }
          await client.query(
            `UPDATE hr_leave_balances
             SET reserved = reserved - $1
             WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
            [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
          );
          await client.query(
            `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('leave',$1,'rejected',$2,$3,$4)`,
            [id, reason || null, scope.userId, scope.companyId]
          ).catch((e) => logger.error(e, "hr approval action insert failed"));
        },
      });

      res.json({ message: "تم الرفض", status: "rejected" });
      return;
    }

    if (approved === "returned") {
      if (!reason) {
        throw new ValidationError("يجب ذكر سبب الإرجاع", { field: "reason" });
      }

      const [reqAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [request.employeeId, scope.companyId]
      );

      await applyTransition({
        entity: "hr_leave_requests",
        id,
        scope,
        action: "leave.returned",
        fromStates: ["pending"],
        toState: "returned",
        reason,
        setExtras: { rejectedReason: reason },
        after: { status: "returned", reason },
        notifications: reqAssignment ? [{
          assignmentId: reqAssignment.id,
          type: "leave_returned", title: "تم إرجاع طلب الإجازة",
          body: `تم إرجاع طلب الإجازة للمراجعة. السبب: ${reason}`,
          priority: "medium", refType: "leave_request", refId: id,
        }] : [],
        onApply: async (_row, client) => {
          if (currentStage) {
            await client.query(
              `UPDATE leave_approval_stages SET status = 'returned', decision = $1, "decidedBy" = $2, "decidedAt" = NOW() WHERE id = $3 AND status = 'pending'`,
              [reason, scope.activeAssignmentId, currentStage.id]
            );
          }
          await client.query(
            `UPDATE hr_leave_balances
             SET reserved = GREATEST(reserved - $1, 0)
             WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
            [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
          );
          await client.query(
            `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('leave',$1,'returned',$2,$3,$4)`,
            [id, reason, scope.userId, scope.companyId]
          ).catch((e) => logger.error(e, "hr approval action insert failed"));
        },
      });

      res.json({ message: "تم الإرجاع", status: "returned" });
      return;
    }

    // Approval path – dynamic chain from approval_chains table
    const currentStageNum = currentStage?.stage ?? 1;

    // Read approval chain to determine next step (read-only, before transaction)
    let chainSteps: any[] = [];
    try {
      chainSteps = await rawQuery<any>(
        `SELECT acs."stepOrder", acs."requiredRole", acs."timeoutHours", acs."autoApproveOnTimeout"
         FROM approval_chains ac
         JOIN approval_chain_steps acs ON acs."chainId" = ac.id
         WHERE ac."companyId" = $1 AND ac."chainType" = 'leaves' AND ac."isActive" = true AND ac."deletedAt" IS NULL
         ORDER BY acs."stepOrder" ASC`,
        [scope.companyId]
      );
    } catch (_e) { logger.error(_e, "leave approval chain query failed"); }

    if (chainSteps.length === 0) {
      chainSteps = [
        { stepOrder: 1, requiredRole: "branch_manager", timeoutHours: 24, autoApproveOnTimeout: false },
        { stepOrder: 2, requiredRole: "hr_manager", timeoutHours: 48, autoApproveOnTimeout: false },
      ];
    }

    // Find the next step after the current one
    const nextStep = chainSteps.find((s: any) => s.stepOrder > currentStageNum);

    // Find the appropriate assignee for next step (read-only)
    let nextAssignee: any = null;
    if (nextStep) {
      [nextAssignee] = await rawQuery<any>(
        `SELECT id FROM employee_assignments
         WHERE "companyId" = $1 AND role IN ($2, 'owner') AND status = 'active'
         ORDER BY CASE role WHEN $2 THEN 1 ELSE 2 END LIMIT 1`,
        [scope.companyId, nextStep.requiredRole]
      );
    }

    // Mark current stage + create next stage atomically
    await withTransaction(async (client) => {
      if (currentStage) {
        await client.query(
          `UPDATE leave_approval_stages
           SET status = 'approved', decision = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
           WHERE id = $2`,
          [scope.activeAssignmentId, currentStage.id]
        );
      }

      if (nextStep && nextAssignee && nextAssignee.id !== scope.activeAssignmentId) {
        const nextExpiresAt = new Date();
        nextExpiresAt.setHours(nextExpiresAt.getHours() + (nextStep.timeoutHours ?? 48));
        await client.query(
          `INSERT INTO leave_approval_stages ("leaveRequestId",stage,"requiredRole","assignedTo","expiresAt")
           VALUES ($1,$2,$3,$4,$5)`,
          [id, nextStep.stepOrder, nextStep.requiredRole, nextAssignee.id, nextExpiresAt.toISOString()]
        );
      }
    });

    if (nextStep && nextAssignee && nextAssignee.id !== scope.activeAssignmentId) {

        createNotification({
          companyId: scope.companyId, assignmentId: nextAssignee.id,
          type: "leave_request", title: `طلب إجازة يتطلب مراجعة ${nextStep.requiredRole}`,
          body: `أقر المرحلة ${currentStageNum} على طلب إجازة لمدة ${request.days} أيام`,
          priority: "high", refType: "leave_request", refId: id,
        }).catch((e) => logger.error(e, "hr background task failed"));

        emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `leave.stage${currentStageNum}_approved`,
          entity: "hr_leave_requests", entityId: id }).catch((e) => logger.error(e, "hr background task failed"));

        createAuditLog({
          companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
          action: "update", entity: "hr_leave_requests", entityId: id,
          after: { status: "pending", stage: currentStageNum, nextStage: nextStep.stepOrder },
        }).catch((e) => logger.error(e, "hr background task failed"));

        res.json({ message: `تمت الموافقة من المرحلة ${currentStageNum}. الطلب الآن في مرحلة ${nextStep.requiredRole}`, status: "pending", nextStage: nextStep.stepOrder });
        return;
    }

    // Final approval (stage 2 HR or owner approving directly)
    // Pre-fetch assignments needed for balance + attendance + tasks + notifications
    const allAssignments = await rawQuery<any>(
      `SELECT ea.id, ea."companyId", ea."branchId"
       FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea.status = 'active'`,
      [request.employeeId]
    );

    const leaveStart = new Date(request.startDate);
    const leaveEnd = new Date(request.endDate);

    await applyTransition({
      entity: "hr_leave_requests",
      id,
      scope,
      action: "leave.approved",
      fromStates: ["pending"],
      toState: "approved",
      reason: reason ?? undefined,
      setExtras: {
        approvedBy: scope.activeAssignmentId,
        approvedAt: { raw: "NOW()" },
      },
      after: { status: "approved", affectedAssignments: allAssignments.length },
      onApply: async (_row, client) => {
        if (currentStage) {
          await client.query(
            `UPDATE leave_approval_stages
             SET status = 'approved', decision = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
             WHERE id = $2`,
            [scope.activeAssignmentId, currentStage.id]
          );
        }

        // Balance deduction across ALL companies
        const allCompanyIds = [...new Set(allAssignments.map((a: any) => a.companyId))];
        for (const cId of allCompanyIds) {
          await client.query(
            `UPDATE hr_leave_balances
             SET used = used + $1, reserved = GREATEST(reserved - $1, 0)
             WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
            [request.days, cId, request.employeeId, request.leaveTypeId, year]
          );
        }

        await client.query(
          `UPDATE approval_requests SET status = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
           WHERE "refType" = 'leave_request' AND "refId" = $2 AND status = 'pending'`,
          [scope.activeAssignmentId, id]
        );

        // Retroactive attendance: clear absences, insert on_leave records
        for (const asn of allAssignments) {
          await client.query(
            `DELETE FROM attendance
             WHERE "assignmentId" = $1 AND date BETWEEN $2 AND $3 AND status = 'absent' AND "companyId" = $4 AND "deletedAt" IS NULL`,
            [asn.id, request.startDate, request.endDate, asn.companyId]
          );
          await client.query(
            `DELETE FROM payroll_deductions
             WHERE "companyId" = $1 AND "employeeId" = $2 AND type = 'absence'
               AND "effectiveDate" BETWEEN $3 AND $4
               AND (status IS NULL OR status <> 'deducted_in_payroll')`,
            [asn.companyId, request.employeeId, request.startDate, request.endDate]
          );
          for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = toDateISO(d);
            await client.query(
              `INSERT INTO attendance ("assignmentId","companyId","branchId",date,status,notes)
               VALUES ($1,$2,$3,$4,'on_leave',$5)
               ON CONFLICT DO NOTHING`,
              [asn.id, asn.companyId, asn.branchId, dateStr, `إجازة معتمدة [leave_request:${id}]`]
            );
          }
        }

        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('leave',$1,'approved',$2,$3,$4)`,
          [id, reason || null, scope.userId, scope.companyId]
        ).catch((e) => logger.error(e, "hr approval action insert failed"));
      },
    });

    // Post-commit: notifications + task reassignment + obligation (non-transactional)
    for (const asn of allAssignments) {
      createNotification({
        companyId: asn.companyId, assignmentId: asn.id,
        type: "leave_approved", title: "تمت الموافقة على طلب الإجازة",
        body: `تمت الموافقة على إجازة ${request.leaveTypeName} من ${request.startDate} إلى ${request.endDate}`,
        priority: "high", refType: "leave_request", refId: id,
      }).catch((e) => logger.error(e, "hr background task failed"));
    }
    for (const asn of allAssignments) {
      const aId = asn.id;
      rawQuery<any>(
        `SELECT ea.id FROM employee_assignments ea
         WHERE ea."companyId" = $1 AND ea."branchId" = $2
           AND ea.role IN ('branch_manager','hr_manager','general_manager','owner') AND ea.status = 'active' AND ea.id != $3
         ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'hr_manager' THEN 2 WHEN 'general_manager' THEN 3 ELSE 4 END LIMIT 1`,
        [asn.companyId, asn.branchId, aId]
      ).then(async ([managerAId]) => {
        if (managerAId) {
          const { projectsEngine } = await import("../lib/engines/index.js");
          await projectsEngine.reassignTasks({
            fromEmployeeQuery: { table: "employee_assignments", idColumn: "id", id: aId },
            toEmployeeQuery: { table: "employee_assignments", idColumn: "id", id: managerAId.id },
            startDate: request.startDate,
            endDate: request.endDate,
          });
          createNotification({
            companyId: asn.companyId, assignmentId: managerAId.id,
            type: "leave_approved", title: "موظف في إجازة معتمدة",
            body: `تمت الموافقة على إجازة موظف من ${request.startDate} إلى ${request.endDate}. تم إعادة توزيع المهام.`,
            priority: "normal", refType: "leave_request", refId: id,
          }).catch((e) => logger.error(e, "hr background task failed"));
        }
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    try {
      const returnDate = new Date(leaveEnd);
      returnDate.setDate(returnDate.getDate() + 1);
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "hr_leave_request",
        entityId: id,
        obligationType: "follow_up",
        title: `عودة للعمل — ${request.employeeName || `موظف #${request.employeeId}`} (${request.leaveTypeName || ""})`,
        dueAt: returnDate.toISOString(),
        assignedTo: request.employeeAssignmentId ?? null,
        metadata: { employeeId: request.employeeId, leaveStart: request.startDate, leaveEnd: request.endDate, days: request.days },
        dedupeKey: `leave-${id}-return`,
        escalationSteps: [
          { hoursAfterDue: 8, notifyRole: "hr_manager" },
          { hoursAfterDue: 24, notifyRole: "general_manager" },
        ],
      });
    } catch (obErr) { logger.error(obErr, "Return-to-work obligation failed:"); }

    res.json({ message: "تمت الموافقة النهائية", status: "approved", affectedAssignments: allAssignments.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Get leave request approval stages with timeline
router.get("/leave-requests/:id/stages", authorize({ feature: "hr.leaves", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [leaveReq] = await rawQuery<any>(
      `SELECT id FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!leaveReq) throw new NotFoundError("الطلب غير موجود");

    const stages = await rawQuery<any>(
      `SELECT las.*, e.name AS "decidedByName"
       FROM leave_approval_stages las
       LEFT JOIN employee_assignments ea ON ea.id = las."decidedBy" AND ea."companyId" = $2
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE las."leaveRequestId" = $1
       ORDER BY las.stage ASC`,
      [id, scope.companyId]
    );

    // Also get the configured chain steps for context
    let chainSteps: any[] = [];
    try {
      chainSteps = await rawQuery<any>(
        `SELECT acs."stepOrder", acs."requiredRole", acs."timeoutHours", acs."autoApproveOnTimeout"
         FROM approval_chains ac
         JOIN approval_chain_steps acs ON acs."chainId" = ac.id
         WHERE ac."companyId" = $1 AND ac."chainType" = 'leaves' AND ac."isActive" = true AND ac."deletedAt" IS NULL
         ORDER BY acs."stepOrder" ASC`,
        [scope.companyId]
      );
    } catch (_e) { logger.error(_e, "leave approval chain query failed"); }

    if (chainSteps.length === 0) {
      chainSteps = [
        { stepOrder: 1, requiredRole: "branch_manager", timeoutHours: 24, autoApproveOnTimeout: false },
        { stepOrder: 2, requiredRole: "hr_manager", timeoutHours: 48, autoApproveOnTimeout: false },
      ];
    }

    res.json({ stages, chainSteps, totalSteps: chainSteps.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Escalate – auto-escalation after 48h (HR/owner only)
router.patch("/leave-requests/:id/escalate", authorize({ feature: "hr.leaves", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: التصعيد متاح فقط للمدير أو HR أو المالك");
    }

    const [request] = await rawQuery<any>(
      `SELECT * FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2 AND status = 'pending' AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!request) {
      throw new NotFoundError("الطلب غير موجود أو ليس معلقاً");
    }

    // Escalation is only valid when the current pending stage has exceeded its 48h window
    const [currentPendingStage] = await rawQuery<any>(
      `SELECT id, stage, "requiredRole", "expiresAt"
       FROM leave_approval_stages
       WHERE "leaveRequestId" = $1 AND status = 'pending'
       ORDER BY stage ASC LIMIT 1`,
      [id]
    );

    if (!currentPendingStage) {
      throw new ConflictError("لا توجد مراحل موافقة معلقة لهذا الطلب");
    }

    const expiresAt = new Date(currentPendingStage.expiresAt);
    if (expiresAt > new Date()) {
      const msRemaining = expiresAt.getTime() - Date.now();
      const hoursRemaining = Math.ceil(msRemaining / 3600000);
      throw new ConflictError(
        `لا يمكن التصعيد قبل انتهاء مهلة الموافقة (48 ساعة). الوقت المتبقي: ${hoursRemaining} ساعة`,
        {
          meta: {
            expiresAt: expiresAt.toISOString(),
            hoursRemaining,
          },
        },
      );
    }

    const [hrAssignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments
       WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active'
       ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
      [scope.companyId]
    );
    if (hrAssignment) {
      const escalateExpiresAt = new Date();
      escalateExpiresAt.setHours(escalateExpiresAt.getHours() + 24);
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE leave_approval_stages SET status = 'escalated'
           WHERE "leaveRequestId" = $1 AND status = 'pending' AND "expiresAt" < NOW()`,
          [id]
        );
        await client.query(
          `INSERT INTO leave_approval_stages ("leaveRequestId",stage,"requiredRole","assignedTo","expiresAt")
           VALUES ($1,99,'hr_manager',$2,$3)`,
          [id, hrAssignment.id, escalateExpiresAt.toISOString()]
        );
      });

      createNotification({
        companyId: scope.companyId, assignmentId: hrAssignment.id,
        type: "leave_escalated", title: "تصعيد طلب إجازة",
        body: `تم تصعيد طلب إجازة (${id}) لعدم البت فيه خلال المهلة المحددة`,
        priority: "urgent", refType: "leave_request", refId: id,
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "leave.escalated",
      entity: "hr_leave_requests", entityId: id }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "hr_leave_requests", entityId: id,
      after: { status: "escalated" },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json({ message: "تم تصعيد الطلب لـ HR" });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL – employee-level aggregation with multi-assignment, GOSI, absences, loans
// ─────────────────────────────────────────────────────────────────────────────

router.get("/payroll", authorize({ feature: "hr.payroll.runs", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const runs = await rawQuery<any>(
      `SELECT pr.id, pr.period, pr.status, pr."totalNet",
              pr."createdAt", e.name AS "runByName",
              COUNT(pl.id) AS "employeeCount"
       FROM payroll_runs pr
       LEFT JOIN employee_assignments ea ON ea.id = pr."runBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN payroll_lines pl ON pl."runId" = pr.id AND pl."deletedAt" IS NULL
       WHERE pr."companyId" = $1 AND pr."deletedAt" IS NULL
       GROUP BY pr.id, e.name ORDER BY pr."createdAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    const data = runs.map((r: any) => ({
      ...r, month: r.period, totalAmount: Number(r.totalNet),
      employeeCount: Number(r.employeeCount),
    }));
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

router.get("/payroll/:id", authorize({ feature: "hr.payroll.runs", action: "view" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (req.path.endsWith("/lines")) return; // let next handler handle it
    const [row] = await rawQuery<any>(
      `SELECT pr.*, e.name AS "runByName",
              (SELECT COUNT(*) FROM payroll_lines pl WHERE pl."runId" = pr.id AND pl."deletedAt" IS NULL)::int AS "employeeCount"
       FROM payroll_runs pr
       LEFT JOIN employee_assignments ea ON ea.id = pr."runBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE pr.id = $1 AND pr."companyId" = $2 AND pr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("مسير الرواتب غير موجود");
    const canSeeSalary = PAYROLL_ROLES.includes(scope.role);
    const lines = await rawQuery<any>(
      `SELECT pl.*, e.name AS "employeeName"
       FROM payroll_lines pl
       LEFT JOIN employee_assignments ea ON ea.id = pl."assignmentId" AND ea."companyId" = $2
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL ORDER BY pl.id LIMIT 1000`,
      [id, scope.companyId]
    );
    const totalBasic = lines.reduce((s: number, l: any) => s + Number(l.basic || 0), 0);
    const totalAllowances = lines.reduce((s: number, l: any) => s + Number(l.housingAllowance || 0) + Number(l.transportAllowance || 0), 0);
    const totalDeductions = lines.reduce((s: number, l: any) => s + Number(l.gosi || 0) + Number(l.lateDeduction || 0) + Number(l.absenceDeduction || 0) + Number(l.violationDeduction || 0) + Number(l.loanDeduction || 0), 0);
    const sanitizedLines = canSeeSalary ? lines : lines.map((l: any) => ({
      id: l.id, runId: l.runId, assignmentId: l.assignmentId, employeeName: l.employeeName,
    }));
    res.json(maskFields(req, {
      ...row, month: row.period, totalAmount: canSeeSalary ? Number(row.totalNet) : undefined,
      basicSalary: canSeeSalary ? totalBasic : undefined,
      allowances: canSeeSalary ? totalAllowances : undefined,
      deductions: canSeeSalary ? totalDeductions : undefined,
      netSalary: canSeeSalary ? Number(row.totalNet) : undefined,
      employeeCount: lines.length,
      lines: sanitizedLines,
    }));
  } catch (err) { handleRouteError(err, res, "Get payroll detail error:"); }
});

router.get("/payroll/:id/lines", authorize({ feature: "hr.payroll.runs", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    // Verify this payroll run belongs to the requesting company (prevent IDOR)
    const [run] = await rawQuery<any>(
      `SELECT id FROM payroll_runs WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!run) throw new NotFoundError("سجل الرواتب غير موجود");

    const lines = await rawQuery<any>(
      `SELECT pl.*, e.name AS "employeeName", e."empNumber"
       FROM payroll_lines pl
       JOIN employee_assignments ea ON ea.id = pl."assignmentId" AND ea."companyId" = $2
       JOIN employees e ON e.id = ea."employeeId"
       WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL ORDER BY e.name LIMIT 1000`,
      [Number(id), scope.companyId]
    );
    const data = lines.map((l: any) => ({
      ...l, basic: Number(l.basic), grossSalary: Number(l.grossSalary),
      gosi: Number(l.gosi), lateDeduction: Number(l.lateDeduction), netSalary: Number(l.netSalary),
    }));
    res.json({ data, total: data.length, page: 1, pageSize: data.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// RBAC v2: payroll runs are SoD-critical via the seeded
// hr_payroll_calculate_approve rule.
router.post("/payroll", authorize({ feature: "hr.payroll.runs", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Payroll execution requires HR, Finance, Director or Owner role
    if (!PAYROLL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("ليس لديك الصلاحية لتشغيل مسير الرواتب", {
        meta: {
          requiredRoles: PAYROLL_ROLES,
          yourRole: scope.role,
        },
      });
    }
    const { month } = zodParse(payrollRunSchema.safeParse(req.body ?? {}));
    const targetPeriod = month ?? currentPeriod();

    // P02-S5-CRIT — every other GL writer in this file (HR accruals at
    // hr.ts:5082, expense claims, etc.) and across the codebase
    // (finance-purchase.ts:456 / :777 / :1223) gates the accounting
    // date through `checkFinancialPeriodOpen` before posting to the
    // ledger. The payroll runner used to skip the check entirely, so
    // an HR or finance manager could run payroll for a closed month
    // and post `PAYROLL-YYYY-MM` to a sealed period — bypassing the
    // financial close that the controller relies on. Validate before
    // any DB writes to keep payroll consistent with the rest of the GL.
    const accrualDate = `${targetPeriod}-01`;
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, accrualDate);
    if (!periodCheck.open) {
      throw new ValidationError(
        `لا يمكن تشغيل الرواتب في فترة مُقفلة: ${periodCheck.periodName ?? targetPeriod}`,
      );
    }

    // Prevent duplicate runs
    const [existing] = await rawQuery<any>(
      `SELECT id FROM payroll_runs WHERE "companyId" = $1 AND period = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, targetPeriod]
    );
    if (existing) {
      throw new ConflictError(`الرواتب لشهر ${targetPeriod} تمت معالجتها مسبقاً`);
    }

    // ── Payroll pre-check: attendance completeness ──
    const [activeCount] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "companyId" = $1 AND status = 'active'`,
      [scope.companyId]
    );
    const [attendanceCount] = await rawQuery<any>(
      `SELECT COUNT(DISTINCT a."assignmentId") AS cnt FROM attendance a
       WHERE a."companyId" = $1 AND TO_CHAR(a.date, 'YYYY-MM') = $2`,
      [scope.companyId, targetPeriod]
    );
    const totalActive = Number(activeCount?.cnt ?? 0);
    const totalWithAttendance = Number(attendanceCount?.cnt ?? 0);
    if (totalActive > 0 && totalWithAttendance < totalActive) {
      throw new ValidationError(
        `لا يمكن تشغيل الرواتب: سجلات الحضور غير مكتملة (${totalWithAttendance} من ${totalActive} موظف لديهم حضور مسجّل)`,
        {
          field: "attendance",
          fix: `تأكد من اكتمال سجلات الحضور لجميع الموظفين في شهر ${targetPeriod} قبل تشغيل الرواتب`,
        },
      );
    }

    // ── Payroll pre-check: no unresolved violations ──
    const unresolvedViolations = await rawQuery<any>(
      `SELECT ev.id, e.name AS "employeeName", ev.type, ev.description
       FROM employee_violations ev
       JOIN employee_assignments ea ON ea.id = ev."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ev."companyId" = $1 AND ev."deletedAt" IS NULL AND ev.period = $2 AND ev.deduction IS NULL
       LIMIT 5`,
      [scope.companyId, targetPeriod]
    );
    if (unresolvedViolations.length > 0) {
      throw new ValidationError(
        `لا يمكن تشغيل الرواتب: يوجد ${unresolvedViolations.length} مخالفة لم يُحدد جزاؤها`,
        {
          field: "violations",
          fix: "راجع المخالفات وحدد الجزاء لكل مخالفة قبل تشغيل الرواتب",
        },
      );
    }

    const salaryComponents = await rawQuery<any>(
      `SELECT id, name, type, "calculationType", value, "isTaxable", "isGosi", "isActive"
       FROM salary_components WHERE "companyId" = $1 AND "isActive" = true ORDER BY "order"`,
      [scope.companyId]
    );

    if (salaryComponents.length === 0) {
      throw new ValidationError(
        "لا يمكن تشغيل الرواتب: لم يتم إعداد بنود الراتب (salary_components) لهذه الشركة",
        {
          field: "salary_components",
          fix: "يرجى الانتقال إلى إعدادات الرواتب وإضافة بنود الراتب (بدل سكن، بدل نقل، التأمينات الاجتماعية...) قبل تشغيل الرواتب",
        },
      );
    }

    const gosiSettings = await rawQuery<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE "companyId" = $1 AND key IN ('gosiEmployeeRate','gosiEmployerRate')`,
      [scope.companyId]
    );
    const gosiSettingsMap = new Map(gosiSettings.map((r) => [r.key, r.value]));
    const gosiComponent = salaryComponents.find((c: any) => c.isGosi && c.type === 'deduction');
    const GOSI_EMPLOYEE_RATE = gosiComponent && Number(gosiComponent.value) > 0
      ? Number(gosiComponent.value) / 100
      : Number(gosiSettingsMap.get("gosiEmployeeRate") ?? "9.75") / 100;
    const GOSI_EMPLOYER_RATE = Number(gosiSettingsMap.get("gosiEmployerRate") ?? "11.75") / 100;

    const earningComponents = salaryComponents.filter((c: any) => c.type === 'earning' && !c.isGosi);

    const assignments = await rawQuery<any>(
      `SELECT ea.id AS "assignmentId", ea."employeeId", ea.salary, ea."branchId"
       FROM employee_assignments ea
       WHERE ea."companyId" = $1 AND ea.status = 'active'`,
      [scope.companyId]
    );

    const [lateDeductionRows, penaltyDeductionRows, violationRows, absenceRows, loanRows, hrLoanRows, overtimeRows, hrOtRows] = await Promise.all([
      rawQuery<any>(
        `SELECT "assignmentId", COALESCE(SUM(amount), 0) AS total
         FROM attendance_deductions
         WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll' AND type IN ('late', 'early_departure')
         GROUP BY "assignmentId"`,
        [scope.companyId, targetPeriod]
      ),
      rawQuery<any>(
        `SELECT "assignmentId", COALESCE(SUM(amount), 0) AS total
         FROM attendance_deductions
         WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll' AND type = 'penalty'
         GROUP BY "assignmentId"`,
        [scope.companyId, targetPeriod]
      ),
      rawQuery<any>(
        `SELECT "assignmentId", COALESCE(SUM(amount), 0) AS total
         FROM attendance_deductions
         WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll' AND type = 'violation'
         GROUP BY "assignmentId"`,
        [scope.companyId, targetPeriod]
      ),
      rawQuery<any>(
        `SELECT a."assignmentId", COUNT(*) AS "absentDays"
         FROM attendance a
         WHERE a."companyId" = $1 AND TO_CHAR(a.date, 'YYYY-MM') = $2 AND a.status = 'absent' AND a."deletedAt" IS NULL
         GROUP BY a."assignmentId"`,
        [scope.companyId, targetPeriod]
      ),
      rawQuery<any>(
        `SELECT la."assignmentId", COALESCE(SUM(la."monthlyInstallment"), 0) AS "installment"
         FROM loan_accounts la
         WHERE la."companyId" = $1 AND la.status = 'active' AND la."remainingAmount" > 0
         GROUP BY la."assignmentId"`,
        [scope.companyId]
      ),
      rawQuery<any>(
        `SELECT li."assignmentId", COALESCE(SUM(li.amount), 0) AS "installment"
         FROM hr_loan_installments li
         WHERE li."companyId" = $1 AND li.period = $2 AND li.status = 'pending'
         GROUP BY li."assignmentId"`,
        [scope.companyId, targetPeriod]
      ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; }),
      rawQuery<any>(
        `SELECT a."assignmentId", COALESCE(SUM(a."overtimeMinutes"), 0) AS "totalOvertimeMinutes"
         FROM attendance a
         WHERE a."companyId" = $1 AND TO_CHAR(a.date, 'YYYY-MM') = $2 AND a."overtimeMinutes" > 0 AND a."deletedAt" IS NULL
         GROUP BY a."assignmentId"`,
        [scope.companyId, targetPeriod]
      ),
      rawQuery<any>(
        `SELECT "assignmentId", COALESCE(SUM("totalAmount"), 0) AS "otAmount"
         FROM hr_overtime_requests
         WHERE "companyId" = $1 AND TO_CHAR("overtimeDate", 'YYYY-MM') = $2 AND status = 'approved' AND "deletedAt" IS NULL
         GROUP BY "assignmentId"`,
        [scope.companyId, targetPeriod]
      ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; }),
    ]);
    const lateMap = new Map<number, number>();
    for (const d of lateDeductionRows) lateMap.set(Number(d.assignmentId), Number(d.total));
    const penaltyMap = new Map<number, number>();
    for (const d of penaltyDeductionRows) penaltyMap.set(Number(d.assignmentId), Number(d.total));
    const violationMap = new Map<number, number>();
    for (const d of violationRows) violationMap.set(Number(d.assignmentId), Number(d.total));
    const absenceMap = new Map<number, number>();
    for (const row of absenceRows) absenceMap.set(Number(row.assignmentId), Number(row.absentDays ?? 0));
    const loanMap = new Map<number, number>();
    for (const row of loanRows) loanMap.set(Number(row.assignmentId), Number(row.installment ?? 0));
    for (const row of hrLoanRows) {
      const aId = Number(row.assignmentId);
      loanMap.set(aId, (loanMap.get(aId) ?? 0) + Number(row.installment ?? 0));
    }
    const overtimeMap = new Map<number, number>();
    for (const row of overtimeRows) overtimeMap.set(Number(row.assignmentId), Number(row.totalOvertimeMinutes ?? 0));
    const hrOtMap = new Map<number, number>();
    for (const row of hrOtRows) hrOtMap.set(Number(row.assignmentId), Number(row.otAmount ?? 0));

    // ── Build per-assignment payroll lines (12 items each) ──
    let totalNet = 0;
    let totalGosiEmployer = 0;
    const lines: {
      employeeId: number; assignmentId: number;
      basic: number; housingAllowance: number; transportAllowance: number;
      gross: number; gosiEmployee: number; gosiEmployer: number;
      lateDeduction: number; absenceDeduction: number; violationDeduction: number;
      loanDeduction: number; overtime: number; overtimeHours: number; net: number;
    }[] = [];

    for (const asn of assignments) {
      const basic = Number(asn.salary ?? 0);
      const aId = Number(asn.assignmentId);

      let housingAllowance = 0;
      let transportAllowance = 0;
      let otherEarnings = 0;

      if (earningComponents.length > 0) {
        for (const comp of earningComponents) {
          const compName = (comp.name || "").trim();
          const calcType = comp.calculationType;
          const compValue = Number(comp.value);
          let amount = 0;
          if (calcType === "percentage") {
            amount = roundTo2(basic * (compValue / 100));
          } else {
            amount = roundTo2(compValue);
          }
          if (compName.includes("سكن") || compName.toLowerCase().includes("housing")) {
            housingAllowance = amount;
          } else if (compName.includes("نقل") || compName.toLowerCase().includes("transport")) {
            transportAllowance = amount;
          } else if (compName.includes("أساسي") || compName.toLowerCase().includes("basic")) {
            continue;
          } else {
            otherEarnings += amount;
          }
        }
      }
      const gross = basic + housingAllowance + transportAllowance + otherEarnings;

      const lateDeduction = lateMap.get(aId) ?? 0;
      const absentDays = absenceMap.get(aId) ?? 0;
      const absenceDeduction = roundTo2(absentDays * (basic / 30));
      const violationDeduction = (penaltyMap.get(aId) ?? 0) + (violationMap.get(aId) ?? 0);
      const loanDeduction = loanMap.get(aId) ?? 0;
      const gosiEmployee = roundTo2(basic * GOSI_EMPLOYEE_RATE);
      const gosiEmployer = roundTo2(basic * GOSI_EMPLOYER_RATE);
      totalGosiEmployer += gosiEmployer;
      const overtimeMinutes = overtimeMap.get(aId) ?? 0;
      const overtimeHours = roundTo2(overtimeMinutes / 60);
      const hourlyRate = basic / (30 * 8);
      const attendanceOt = roundTo2(overtimeHours * hourlyRate * 1.5);
      const hrOtAmount = hrOtMap.get(aId) ?? 0;
      // استخدام الأعلى بين وقت الحضور ومبلغ طلبات OT المعتمدة (لتجنب الاحتساب المزدوج)
      const overtime = Math.max(attendanceOt, hrOtAmount);

      const totalDeductions = lateDeduction + absenceDeduction + violationDeduction + loanDeduction + gosiEmployee;
      const net = Math.max(0, roundTo2(gross + overtime - totalDeductions));
      totalNet += net;

      lines.push({
        employeeId: asn.employeeId, assignmentId: aId,
        basic, housingAllowance, transportAllowance, gross,
        gosiEmployee, gosiEmployer, lateDeduction, absenceDeduction,
        violationDeduction, loanDeduction, overtime, overtimeHours, net,
      });
    }

    const totalGross = roundTo2(lines.reduce((s, l) => s + l.gross, 0));
    const totalGosiEmployee = roundTo2(lines.reduce((s, l) => s + l.gosiEmployee, 0));
    const totalOvertime = roundTo2(lines.reduce((s, l) => s + l.overtime, 0));
    const totalOtherDeductions = roundTo2(lines.reduce((s, l) => s + l.lateDeduction + l.absenceDeduction + l.violationDeduction + l.loanDeduction, 0));
    const totalBankPayout = roundTo2(totalNet);
    const totalGosiPayable = roundTo2(totalGosiEmployer + totalGosiEmployee);

    const runId = await withTransaction(async (client) => {
      const runResult = await client.query(
        `INSERT INTO payroll_runs ("companyId", period, status, "totalNet", "runBy")
         VALUES ($1,$2,'pending_approval',$3,$4) RETURNING id`,
        [scope.companyId, targetPeriod, roundTo2(totalNet), scope.activeAssignmentId]
      );
      const newRunId = runResult.rows[0].id;

      if (lines.length > 0) {
        // Single bulk INSERT instead of one round-trip per employee.
        const COLS_PER_ROW = 16;
        const valuesSql: string[] = [];
        const params: any[] = [];
        for (const l of lines) {
          const base = params.length;
          valuesSql.push(
            `(${Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`).join(",")})`
          );
          params.push(
            newRunId, l.assignmentId, l.employeeId, l.basic, l.housingAllowance, l.transportAllowance,
            l.gross, l.gosiEmployee, l.gosiEmployer, l.lateDeduction, l.absenceDeduction,
            l.violationDeduction, l.loanDeduction, l.overtime, l.overtimeHours, l.net
          );
        }
        await client.query(
          `INSERT INTO payroll_lines ("runId","assignmentId","employeeId",basic,"housingAllowance","transportAllowance","grossSalary",gosi,"gosiEmployer","lateDeduction","absenceDeduction","violationDeduction","loanDeduction","overtime","overtimeHours","netSalary")
           VALUES ${valuesSql.join(",")}`,
          params
        );
      }

      await client.query(
        `UPDATE attendance_deductions SET status = 'deducted_in_payroll'
         WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll'`,
        [scope.companyId, targetPeriod]
      );

      if (loanRows.length > 0) {
        const assignmentIdsWithLoans = loanRows.map((r: any) => Number(r.assignmentId));
        await client.query(
          `UPDATE loan_accounts
           SET "remainingAmount" = GREATEST(0, "remainingAmount" - "monthlyInstallment"),
               status = CASE WHEN "remainingAmount" - "monthlyInstallment" <= 0 THEN 'settled' ELSE status END
           WHERE "companyId" = $1 AND status = 'active' AND "assignmentId" = ANY($2::int[])`,
          [scope.companyId, assignmentIdsWithLoans]
        );
      }

      // تحديث أقساط سلف HR كـ "مدفوعة" وتحديث رصيد السلفة
      if (hrLoanRows.length > 0) {
        await client.query(
          `UPDATE hr_loan_installments SET status = 'paid', "paidAt" = NOW()
           WHERE "companyId" = $1 AND period = $2 AND status = 'pending'`,
          [scope.companyId, targetPeriod]
        );
        await client.query(
          `UPDATE hr_employee_loans l SET
             "paidAmount" = COALESCE((SELECT SUM(amount) FROM hr_loan_installments WHERE "loanId" = l.id AND status = 'paid'), 0),
             "remainingAmount" = l.amount - COALESCE((SELECT SUM(amount) FROM hr_loan_installments WHERE "loanId" = l.id AND status = 'paid'), 0),
             status = CASE
               WHEN l.amount - COALESCE((SELECT SUM(amount) FROM hr_loan_installments WHERE "loanId" = l.id AND status = 'paid'), 0) <= 0
               THEN 'completed' ELSE l.status END,
             "updatedAt" = NOW()
           WHERE l."companyId" = $1 AND l.status = 'active'`,
          [scope.companyId]
        );
      }

      // تحديث حالة طلبات الوقت الإضافي المعتمدة كـ "مدفوعة"
      if (hrOtRows.length > 0) {
        await client.query(
          `UPDATE hr_overtime_requests SET status = 'paid', "updatedAt" = NOW()
           WHERE "companyId" = $1 AND TO_CHAR("overtimeDate", 'YYYY-MM') = $2 AND status = 'approved'`,
          [scope.companyId, targetPeriod]
        );
      }

      return newRunId;
    });

    try {
      const { hrEngine } = await import("../lib/engines/index.js");
      await hrEngine.postPayrollRunGL(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId },
        {
          runId,
          period: targetPeriod,
          employeeCount: lines.length,
          totalGross,
          totalOvertime,
          totalGosiEmployer,
          totalBankPayout,
          totalGosiPayable,
          totalOtherDeductions,
        }
      );
    } catch (journalErr) {
      throw new IntegrationError(
        "تم صرف الرواتب لكن فشل القيد المحاسبي. راجع المدير المالي",
        {
          meta: { integration: "journal", period: targetPeriod },
          cause: journalErr,
        },
      );
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "payroll.completed", entity: "payroll_runs", entityId: runId,
      details: JSON.stringify({ period: targetPeriod, totalNet, totalGosiEmployer, assignmentCount: lines.length }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "payroll.run", entity: "payroll_runs", entityId: runId,
      after: { period: targetPeriod, totalNet, totalGosiEmployer, assignmentCount: lines.length },
    }).catch((e) => logger.error(e, "hr background task failed"));

    // Employee-level aggregate for response
    const empAgg = new Map<number, { total: number; count: number }>();
    for (const l of lines) {
      const cur = empAgg.get(l.employeeId) ?? { total: 0, count: 0 };
      cur.total += l.net;
      cur.count++;
      empAgg.set(l.employeeId, cur);
    }

    res.status(201).json({
      id: runId, month: targetPeriod,
      totalAmount: roundTo2(totalNet),
      totalGosiEmployer: roundTo2(totalGosiEmployer),
      assignmentCount: lines.length,
      employeeCount: empAgg.size,
      gosiEmployeeRate: GOSI_EMPLOYEE_RATE,
      gosiEmployerRate: GOSI_EMPLOYER_RATE,
      journalRef: `PAYROLL-${targetPeriod}`,
    });
  } catch (err) {
    handleRouteError(err, res, "Run payroll error:");
  }
});

router.patch("/payroll/:id/approve", authorize({ feature: "hr.payroll.runs", action: "approve", resource: { table: "payroll_runs", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!PAYROLL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("ليس لديك الصلاحية للموافقة على مسير الرواتب");
    }
    const id = parseId(req.params.id, "id");
    const [run] = await rawQuery<any>(
      `SELECT id, status, "runBy" FROM payroll_runs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!run) throw new NotFoundError("مسير الرواتب غير موجود");
    if (run.status !== "pending_approval") {
      throw new ConflictError(`لا يمكن الموافقة — الحالة الحالية: ${run.status}`);
    }
    if (run.runBy === scope.activeAssignmentId) {
      throw new ForbiddenError("لا يمكن للشخص الذي أنشأ المسير أن يوافق عليه (maker-checker)");
    }
    await rawExecute(
      `UPDATE payroll_runs SET status='completed', "approvedBy"=$1, "approvedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.activeAssignmentId, id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "payroll.approved", entity: "payroll_runs", entityId: id, details: JSON.stringify({ approvedBy: scope.activeAssignmentId }) }).catch((e) => logger.error(e, "hr background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "payroll.approve", entity: "payroll_runs", entityId: id, after: { approvedBy: scope.activeAssignmentId } }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ message: "تمت الموافقة على مسير الرواتب", status: "completed" });
  } catch (err) { handleRouteError(err, res, "Approve payroll error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// VIOLATIONS, SHIFTS, PERFORMANCE, LEGACY LEAVE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/violations", authorize({ feature: "hr.violations", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT ev.*, e.name AS "employeeName"
       FROM employee_violations ev
       JOIN employee_assignments ea ON ea.id = ev."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ev."companyId" = $1 AND ev."deletedAt" IS NULL ORDER BY ev."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { logger.error(err, "Get violations error:"); res.json({ data: [], total: 0, page: 1, pageSize: 0 }); }
});

router.get("/violations/:id", authorize({ feature: "hr.violations", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery<any>(
      `SELECT ev.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, b.name AS "branchName"
       FROM employee_violations ev
       JOIN employee_assignments ea ON ea.id = ev."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ev.id = $1 AND ev."companyId" = $2 AND ev."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("المخالفة غير موجودة");

    // جلب محضر التحقيق المرتبط إن وجد
    const memos = await rawQuery<any>(
      `SELECT m.id, m."memoNumber", m.status, m."appliedPenaltyLabel" AS "penaltyLabel",
              m."appliedDeductionAmount" AS "baseDeductionAmount", m."appliedExtraDeduction", m."createdAt"
       FROM hr_inquiry_memos m
       WHERE m."violationId" = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL
       ORDER BY m."createdAt" DESC`,
      [item.id, scope.companyId]
    ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; });

    res.json({ ...item, memos });
  } catch (err) { handleRouteError(err, res, "Get violation detail error"); }
});

router.post("/violations", authorize({ feature: "hr.violations", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(violationSchema.safeParse(req.body));
    const {
      assignmentId, type, description, severity, deduction,
      period: reqPeriod, incidentDate: reqIncidentDate, regulationId,
    } = parsed as any;

    // FK pre-check: assignment must exist inside the caller's company scope.
    // Without this, a bad assignmentId would fail as a deep 23503 whose
    // detail string doesn't always carry the field name.
    const [asn] = await rawQuery<any>(
      `SELECT ea.id, ea."employeeId", ea."branchId", e.name AS "employeeName"
         FROM employee_assignments ea
         JOIN employees e ON e.id = ea."employeeId"
        WHERE ea.id = $1 AND ea."companyId" = $2
        LIMIT 1`,
      [Number(assignmentId), scope.companyId]
    );
    if (!asn) {
      throw new ValidationError(`التعيين رقم ${assignmentId} غير موجود في هذه الشركة`, {
        field: "assignmentId",
        fix: "اختر تعيينًا من قائمة الموظفين الحاليين",
      });
    }

    const period = reqPeriod || currentPeriod();
    const incidentDate = reqIncidentDate || todayISO();
    const effectiveSeverity = severity ?? "medium";
    const effectiveDeduction = Number(deduction ?? 0);

    const { insertId } = await rawExecute(
      `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, Number(assignmentId), type, description, effectiveSeverity, effectiveDeduction, period]
    );

    // Discipline ladder — create the inquiry memo (idempotent). This wires
    // the violation to the 5-step penalty scale and the pending-employee
    // workflow. Known IncidentType strings map through; anything else
    // becomes "custom" which the regulation engine handles as a free-form
    // case.
    const knownIncidentTypes = new Set([
      "late", "early_leave", "absence", "behavior",
      "organization", "gps_out_of_range", "custom",
    ]);
    const incidentType = knownIncidentTypes.has(String(type)) ? (type as any) : "custom";
    ensureInquiryMemoForViolation({
      companyId: scope.companyId,
      branchId: asn.branchId ?? scope.branchId ?? null,
      assignmentId: Number(assignmentId),
      employeeId: asn.employeeId,
      violationId: insertId,
      incidentType,
      incidentDate,
      incidentDescription: String(description),
      regulationId: regulationId ? Number(regulationId) : undefined,
      source: "manual",
      createdBy: scope.userId,
    }).catch((err) => logger.error(err, "inquiry memo create failed:"));

    // Notify the offender and their manager.
    createNotification({
      companyId: scope.companyId,
      assignmentId: Number(assignmentId),
      type: "violation_created",
      title: "تم تسجيل مخالفة",
      body: `نوع: ${type} — بتاريخ ${incidentDate}${effectiveDeduction ? ` — الخصم المتوقع ${effectiveDeduction} ريال` : ""}`,
      priority: "high",
      refType: "employee_violations",
      refId: insertId,
    }).catch((e) => logger.error(e, "hr background task failed"));
    const managerAsn = await getManagerAssignmentId(scope.companyId, asn.branchId ?? scope.branchId ?? null).catch((e) => { logger.error(e, "hr manager lookup failed"); return null; });
    if (managerAsn && managerAsn !== Number(assignmentId)) {
      createNotification({
        companyId: scope.companyId,
        assignmentId: managerAsn,
        type: "violation_created",
        title: "مخالفة جديدة في فريقك",
        body: `الموظف ${asn.employeeName} — ${type}`,
        priority: "normal",
        refType: "employee_violations",
        refId: insertId,
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "violation.created",
      entity: "employee_violations",
      entityId: insertId,
      details: JSON.stringify({
        assignmentId: Number(assignmentId),
        employeeId: asn.employeeId,
        type,
        severity: effectiveSeverity,
        deduction: effectiveDeduction,
        period,
      }),
    });

    await createAuditLog({
      companyId: scope.companyId,
      branchId: asn.branchId ?? scope.branchId ?? null,
      userId: scope.userId,
      action: "create",
      entity: "employee_violations",
      entityId: insertId,
      after: {
        assignmentId: Number(assignmentId),
        employeeId: asn.employeeId,
        employeeName: asn.employeeName,
        type,
        description,
        severity: effectiveSeverity,
        deduction: effectiveDeduction,
        period,
        incidentDate,
      },
    });

    const [row] = await rawQuery<any>(`SELECT v.*, e.name AS "employeeName" FROM employee_violations v JOIN employee_assignments ea ON ea.id=v."assignmentId" JOIN employees e ON e.id=ea."employeeId" WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, assignmentId: Number(assignmentId), employeeId: asn.employeeId, type, severity: effectiveSeverity, deduction: effectiveDeduction, period });
  } catch (err) { handleRouteError(err, res, "Create violation error:"); }
});

router.get("/shifts", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM shifts WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { logger.error(err, "Get shifts error:"); res.json({ data: [], total: 0, page: 1, pageSize: 0 }); }
});

router.post("/shifts", authorize({ feature: "hr.attendance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(shiftSchema.safeParse(req.body));
    const {
      name, startTime, endTime, days, isDefault, branchId,
      shiftType, remoteAllowed,
      splitBreakStart, splitBreakEnd,
      flexStartEarliest, flexStartLatest,
    } = parsed;
    const effectiveBranchId = branchId ?? scope.branchId;
    // shiftType: 'fixed' (default) | 'flexible' | 'remote' | 'split'
    const effectiveShiftType = shiftType ?? 'fixed';
    const validShiftTypes = ["fixed", "flexible", "remote", "split"];
    if (!validShiftTypes.includes(effectiveShiftType)) {
      throw new ValidationError(`نوع وردية غير صالح: ${effectiveShiftType}`, {
        field: "shiftType",
        fix: `اختر من: ${validShiftTypes.join(", ")}`,
      });
    }
    // Fixed/split shifts must have startTime + endTime. Remote/flexible can
    // rely on flexStart bounds or have no hard clock-in window.
    if ((effectiveShiftType === "fixed" || effectiveShiftType === "split") && (!startTime || !endTime)) {
      throw new ValidationError("وقت البداية والنهاية مطلوبان للوردية الثابتة", {
        field: !startTime ? "startTime" : "endTime",
        fix: "حدّد وقت بداية ونهاية الوردية (HH:MM)",
      });
    }
    const effectiveRemote = remoteAllowed ?? (effectiveShiftType === 'remote');

    let insertId!: number;
    await withTransaction(async (client) => {
      if (isDefault) {
        await client.query(`UPDATE shifts SET "isDefault" = false WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [scope.companyId]);
      }
      const result = await client.query(
        `INSERT INTO shifts ("companyId","branchId",name,"startTime","endTime",days,"isDefault",status,"shiftType","remoteAllowed","splitBreakStart","splitBreakEnd","flexStartEarliest","flexStartLatest")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11,$12,$13) RETURNING id`,
        [scope.companyId, effectiveBranchId, String(name).trim(), startTime ?? null, endTime ?? null, days ?? "0,1,2,3,4", isDefault ?? false,
         effectiveShiftType, effectiveRemote,
         splitBreakStart || null, splitBreakEnd || null,
         flexStartEarliest || null, flexStartLatest || null]
      );
      insertId = result.rows[0].id;
    });
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "shifts", entityId: insertId,
      after: { name, startTime: startTime ?? null, endTime: endTime ?? null, days: days ?? "0,1,2,3,4", shiftType: effectiveShiftType, isDefault: !!isDefault },
    }).catch((e) => logger.error(e, "hr background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM shifts WHERE id = $1 AND "companyId" = $2`, [insertId, scope.companyId]);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "shift.created", entity: "hr_shifts", entityId: insertId, details: JSON.stringify({ name, shiftType: effectiveShiftType }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create shift error:"); }
});

router.get("/performance", authorize({ feature: "hr.performance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT pr.*, e.name AS "employeeName", e."empNumber"
       FROM performance_reviews pr
       JOIN employees e ON e.id = pr."employeeId"
       WHERE pr."companyId" = $1 AND pr."deletedAt" IS NULL ORDER BY pr."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { logger.error(err, "Get performance error:"); res.json({ data: [], total: 0, page: 1, pageSize: 0 }); }
});

router.get("/performance/:id", authorize({ feature: "hr.performance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT pr.*, pr."overallScore" AS "overallRating", pr.period AS "reviewPeriod",
              e.name AS "employeeName", e."empNumber",
              rv.name AS "reviewerName"
       FROM performance_reviews pr
       JOIN employees e ON e.id = pr."employeeId"
       LEFT JOIN employees rv ON rv.id = pr."reviewerId"
       WHERE pr.id = $1 AND pr."companyId" = $2 AND pr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("تقييم الأداء غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get performance detail error:"); }
});

router.post("/performance", authorize({ feature: "hr.performance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, assignmentId, period, overallScore, scores, categories, comments, notes, status } = zodParse(performanceSchema.safeParse(req.body)) as any;

    // Resolve the employee PK — performance_reviews."employeeId" is a FK
    // on employees.id, NOT employee_assignments.id. The old handler blindly
    // fell back to assignmentId, which corrupts data when the frontend
    // sends the assignmentId. Accept either shape, but always resolve to
    // the employee PK before inserting.
    let resolvedEmployeeId: number | null = null;
    if (employeeId) {
      const [emp] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id
         WHERE e.id = $1 AND ea."companyId" = $2 AND ea.status = 'active' LIMIT 1`,
        [Number(employeeId), scope.companyId]
      );
      if (!emp) {
        throw new ValidationError(`الموظف رقم ${employeeId} غير موجود`, {
          field: "employeeId",
          fix: "اختر موظفًا من القائمة",
        });
      }
      resolvedEmployeeId = emp.id;
    } else if (assignmentId) {
      const [asn] = await rawQuery<{ employeeId: number }>(
        `SELECT "employeeId" FROM employee_assignments
          WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
        [Number(assignmentId), scope.companyId]
      );
      if (!asn) {
        throw new ValidationError(`التعيين رقم ${assignmentId} غير موجود`, {
          field: "assignmentId",
          fix: "اختر تعيينًا نشطًا من قائمة الموظفين",
        });
      }
      resolvedEmployeeId = asn.employeeId;
    } else {
      throw new ValidationError("يرجى تحديد الموظف", {
        field: "employeeId",
        fix: "مرّر employeeId أو assignmentId",
      });
    }

    if (!period) {
      throw new ValidationError("فترة التقييم مطلوبة", {
        field: "period",
        fix: "مثال: 2026-Q1 أو 2026-04",
      });
    }

    const finalScores = (scores ?? categories) ? JSON.stringify(scores ?? categories) : null;
    const finalComments = comments ?? notes ?? null;
    const effectiveStatus = status ?? "pending";

    const { insertId } = await rawExecute(
      `INSERT INTO performance_reviews ("companyId","employeeId",period,"overallScore",scores,comments,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, resolvedEmployeeId, period, Number(overallScore ?? 0), finalScores, finalComments, effectiveStatus]
    );

    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "performance_reviews",
      entityId: insertId,
      after: { employeeId: resolvedEmployeeId, period, overallScore: Number(overallScore ?? 0), status: effectiveStatus },
    });
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "performance.created", entity: "hr_performance", entityId: insertId, details: JSON.stringify({ employeeId: resolvedEmployeeId, period }) }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM performance_reviews WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, employeeId: resolvedEmployeeId, period, overallScore: Number(overallScore ?? 0), status: effectiveStatus });
  } catch (err) { handleRouteError(err, res, "Create performance error:"); }
});

router.get("/attendance-stats", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const month = (req.query.month as string) ?? currentPeriod();
    const [[present], [absent], [late], [totalEmp]] = await Promise.all([
      rawQuery<any>(
        `SELECT COUNT(*) AS count FROM attendance WHERE "companyId"=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND status='present' AND "deletedAt" IS NULL`,
        [scope.companyId, month]
      ),
      rawQuery<any>(
        `SELECT COUNT(*) AS count FROM attendance WHERE "companyId"=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND status='absent' AND "deletedAt" IS NULL`,
        [scope.companyId, month]
      ),
      rawQuery<any>(
        `SELECT COUNT(*) AS count FROM attendance WHERE "companyId"=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND "lateMinutes">0 AND "deletedAt" IS NULL`,
        [scope.companyId, month]
      ),
      rawQuery<any>(
        `SELECT COUNT(*) AS count FROM employee_assignments WHERE "companyId"=$1 AND status='active'`,
        [scope.companyId]
      ),
    ]);
    res.json({
      present: Number(present?.count ?? 0),
      absent: Number(absent?.count ?? 0),
      late: Number(late?.count ?? 0),
      totalEmployees: Number(totalEmp?.count ?? 0),
      month,
    });
  } catch (_e) { logger.error(_e, "attendance-stats query failed"); res.json({ present: 0, absent: 0, late: 0, totalEmployees: 0 }); }
});

router.get("/leave-stats", authorize({ feature: "hr.leaves", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [[pending], [approved], [rejected], [total]] = await Promise.all([
      rawQuery<any>(`SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND status='pending' AND "deletedAt" IS NULL`, [scope.companyId]),
      rawQuery<any>(`SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND status='approved' AND "deletedAt" IS NULL`, [scope.companyId]),
      rawQuery<any>(`SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND status='rejected' AND "deletedAt" IS NULL`, [scope.companyId]),
      rawQuery<any>(`SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [scope.companyId]),
    ]);
    res.json({
      pending: Number(pending?.count ?? 0),
      approved: Number(approved?.count ?? 0),
      rejected: Number(rejected?.count ?? 0),
      total: Number(total?.count ?? 0),
    });
  } catch (_e) { logger.error(_e, "leave-stats query failed"); res.json({ pending: 0, approved: 0, rejected: 0, total: 0 }); }
});

router.get("/salary-components", authorize({ feature: "hr.payroll.runs", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM salary_components WHERE "companyId"=$1 ORDER BY name LIMIT 500`, [scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) { logger.error(_e, "salary-components query failed"); res.json({ data: [], total: 0 }); }
});

router.post("/salary-components", authorize({ feature: "hr.payroll.runs", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, type, calculationType, value, taxable } = zodParse(salaryComponentSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO salary_components ("companyId",name,type,"calculationType",value,"isTaxable","isActive")
       VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [scope.companyId, String(name).trim(), type ?? "earning", calculationType ?? "fixed", Number(value ?? 0), taxable ?? true]
    );
    await createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "salary_components",
      entityId: insertId,
      after: { name, type: type ?? "earning", calculationType: calculationType ?? "fixed", value: Number(value ?? 0), taxable: taxable ?? true },
    });
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "salary_component.created", entity: "hr_salary_components", entityId: insertId, details: JSON.stringify({ name, type: type ?? "earning", calculationType: calculationType ?? "fixed" }) }).catch((e) => logger.error(e, "hr background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM salary_components WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, name, type: type ?? "earning", calculationType: calculationType ?? "fixed", value: Number(value ?? 0), taxable: taxable ?? true, status: "active" });
  } catch (err) { handleRouteError(err, res, "Create salary component error:"); }
});

router.get("/approval-chains", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT las.*, lr.id AS "requestId", lr.status AS "requestStatus",
              lr."startDate", lr."endDate", lr.days,
              e.name AS "employeeName", lt.name AS "leaveTypeName"
       FROM leave_approval_stages las
       JOIN hr_leave_requests lr ON lr.id = las."leaveRequestId"
       JOIN employees e ON e.id = lr."employeeId"
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE lr."companyId" = $1
       ORDER BY las."createdAt" DESC LIMIT 50`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { logger.error(_e, "approval-chains query failed"); res.json({ data: [], total: 0 }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL CHAINS — Generic approval chain management (5 types)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/approval-chain-definitions", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const chains = await rawQuery<any>(
      `SELECT ac.*, 
              json_agg(json_build_object('id', acs.id, 'stepOrder', acs."stepOrder", 'requiredRole', acs."requiredRole", 'timeoutHours', acs."timeoutHours", 'autoApproveOnTimeout', acs."autoApproveOnTimeout") ORDER BY acs."stepOrder") AS steps
       FROM approval_chains ac
       LEFT JOIN approval_chain_steps acs ON acs."chainId" = ac.id
       WHERE ac."companyId" = $1 AND ac."deletedAt" IS NULL
       GROUP BY ac.id
       ORDER BY ac."chainType", ac."minAmount" LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: chains, total: chains.length });
  } catch (_e) { logger.error(_e, "approval-chain-definitions query failed"); res.json({ data: [], total: 0 }); }
});

router.post("/approval-chain-definitions", authorize({ feature: "hr.employees", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بإنشاء سلاسل موافقات");
    }
    const { name, chainType, minAmount, maxAmount, steps } = zodParse(approvalChainSchema.safeParse(req.body));

    let chainId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO approval_chains ("companyId",name,"chainType","minAmount","maxAmount")
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [scope.companyId, name, chainType, minAmount ?? 0, maxAmount ?? 999999999]
      );
      chainId = ins.rows[0].id;

      if (Array.isArray(steps) && steps.length > 0) {
        const values = steps.map((_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
        const params = steps.flatMap((step, i) => [chainId, i + 1, step.requiredRole ?? "branch_manager", step.timeoutHours ?? 48, step.autoApproveOnTimeout ?? false]);
        await client.query(
          `INSERT INTO approval_chain_steps ("chainId","stepOrder","requiredRole","timeoutHours","autoApproveOnTimeout")
           VALUES ${values}`,
          params
        );
      }
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "approval_chains", entityId: chainId,
      after: { name, chainType, minAmount, maxAmount, stepCount: steps?.length ?? 0 },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "approval_chain.created", entity: "hr_approval_chain_definitions", entityId: chainId, details: JSON.stringify({ name, chainType }) }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2`, [chainId, scope.companyId]);
    res.status(201).json({ ...row, stepsCreated: steps?.length ?? 0 });
  } catch (err) { handleRouteError(err, res, "Create approval chain error:"); }
});

router.delete("/approval-chain-definitions/:id", authorize({ feature: "hr.employees", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: يتطلب صلاحية مالك أو HR أو مدير عام");
    }
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT * FROM approval_chains WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    const { affectedRows } = await rawExecute(`UPDATE approval_chains SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("سلسلة الموافقة غير موجودة");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "approval_chains", entityId: id,
      before: existing ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "approval_chain.deleted", entity: "hr_approval_chain_definitions", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Generic approval request endpoints ──────────────────────

router.get("/approval-requests", authorize({ feature: "hr.organization", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const statusFilter = (req.query.status as string) ?? "pending";
    const rows = await rawQuery<any>(
      `SELECT ar.*, e.name AS "assignedToName"
       FROM approval_requests ar
       LEFT JOIN employee_assignments ea ON ea.id = ar."assignedTo"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE ar."companyId" = $1 AND ar.status = $2
       ORDER BY ar."createdAt" DESC LIMIT 500`,
      [scope.companyId, statusFilter]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { logger.error(_e, "approval-requests query failed"); res.json({ data: [], total: 0 }); }
});

router.patch("/approval-requests/:id/decide", authorize({ feature: "hr.organization", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, reason } = zodParse(approvalRequestDecisionSchema.safeParse(req.body ?? {}));

    if (!OPS_CLOSE_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بالموافقة أو الرفض");
    }

    const [request] = await rawQuery<any>(
      `SELECT * FROM approval_requests WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`,
      [id, scope.companyId]
    );
    if (!request) {
      throw new NotFoundError("طلب الموافقة غير موجود أو تمت معالجته");
    }

    const isOwnerOverride = scope.role === "owner";
    const isAssignedApprover = request.assignedTo === scope.activeAssignmentId;
    const roleMatches = !request.requiredRole || request.requiredRole === scope.role;

    if (!isOwnerOverride && !isAssignedApprover && !roleMatches) {
      throw new ForbiddenError(
        `هذا الطلب يتطلب موافقة ${request.requiredRole ?? "المعين"}. دورك الحالي: ${scope.role}`,
      );
    }
    if (!isOwnerOverride && request.assignedTo && !isAssignedApprover) {
      throw new ForbiddenError("هذا الطلب مخصص لموافق آخر. لا يمكنك اتخاذ القرار.");
    }

    const refCreatorMap: Record<string, { table: string; col: string }> = {
      leave_request: { table: "hr_leave_requests", col: '"assignmentId"' },
      purchase_order: { table: "purchase_orders", col: '"createdByAssignmentId"' },
      expense: { table: "expenses", col: '"createdByAssignmentId"' },
      salary_advance: { table: "salary_advances", col: '"createdByAssignmentId"' },
      custody: { table: "custodies", col: '"createdByAssignmentId"' },
      official_letter: { table: "official_letters", col: '"createdByAssignmentId"' },
    };
    const refMap = refCreatorMap[request.refType];
    let requesterId: number | undefined;
    if (refMap) {
      try {
        const [refRow] = await rawQuery<any>(
          `SELECT ${refMap.col} AS "requesterId" FROM ${refMap.table} WHERE id = $1 LIMIT 1`,
          [request.refId]
        );
        requesterId = refRow?.requesterId ?? undefined;
      } catch (e) {
        logger.warn(e, "hr approval requester lookup (column may not exist for entity type)");
      }
    }
    if (requesterId !== undefined && requesterId === scope.activeAssignmentId) {
      throw new ForbiddenError("لا يمكنك الموافقة على طلبك الخاص");
    }

    const result = await processApprovalStep({
      companyId: scope.companyId, branchId: scope.branchId,
      refType: request.refType, refId: request.refId,
      approved: !!approved, decidedBy: scope.activeAssignmentId,
      reason, requesterId,
    });

    if (result.status === "approved") {
      const entityUpdateMap: Record<string, { table: string; column: string }> = {
        purchase_order: { table: "purchase_orders", column: "status" },
        official_letter: { table: "official_letters", column: "status" },
      };
      const target = entityUpdateMap[request.refType];
      if (target) {
        await rawExecute(
          `UPDATE ${target.table} SET ${target.column} = 'approved' WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status IN ('pending','pending_approval','draft')`,
          [request.refId, scope.companyId]
        );
      }
      const journalRefTypes = ["expense", "salary_advance", "custody"];
      if (journalRefTypes.includes(request.refType)) {
        const { financialEngine } = await import("../lib/engines/index.js");
        await financialEngine.updateJournalStatus(request.refId, "posted");
      }
    } else if (result.status === "rejected") {
      const entityUpdateMap: Record<string, { table: string; column: string }> = {
        purchase_order: { table: "purchase_orders", column: "status" },
        official_letter: { table: "official_letters", column: "status" },
      };
      const target = entityUpdateMap[request.refType];
      if (target) {
        await rawExecute(
          `UPDATE ${target.table} SET ${target.column} = 'rejected' WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status IN ('pending','pending_approval','draft')`,
          [request.refId, scope.companyId]
        );
      }
      const journalRefTypes = ["expense", "salary_advance", "custody"];
      if (journalRefTypes.includes(request.refType)) {
        const { financialEngine } = await import("../lib/engines/index.js");
        await financialEngine.updateJournalStatus(request.refId, "rejected");
      }

      // Cancel any queued email/WhatsApp dispatches for a rejected official
      // letter — otherwise the queue workers will send it after it was denied.
      if (request.refType === "official_letter") {
        await rawExecute(
          `UPDATE email_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
            WHERE "refType"='official_letter' AND "refId"=$1 AND "companyId"=$2 AND status='pending'`,
          [request.refId, scope.companyId]
        ).catch((e) => logger.error(e, "cancel email_queue for rejected letter failed:"));
        await rawExecute(
          `UPDATE whatsapp_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
            WHERE "refType"='official_letter' AND "refId"=$1 AND "companyId"=$2 AND status='pending'`,
          [request.refId, scope.companyId]
        ).catch((e) => { logger.warn(e, "hr whatsapp_queue insert failed (table may not exist)"); });
      }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "approval_requests", entityId: id,
      before: { status: request.status, refType: request.refType, refId: request.refId },
      after: { status: result.status, approved: !!approved, reason: reason ?? null },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: `approval.${result.status}`, entity: "approval_requests",
      entityId: id,
      details: JSON.stringify({ refType: request.refType, refId: request.refId, result: result.status }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json(result);
  } catch (err) { handleRouteError(err, res, "Approval decision error:"); }
});

// ─── Attendance policy management ──────────────────────
router.get("/attendance-policy", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [policy] = await rawQuery<any>(
      `SELECT * FROM attendance_policies WHERE "companyId" = $1`,
      [scope.companyId]
    );
    res.json(policy ?? {
      lateThresholdMinutes: 15, gpsRadiusMeters: 500,
      penaltyLevel1: 0, penaltyLevel2: 50, penaltyLevel3: 100, penaltyLevel4: 200, penaltyLevel5: 500,
      penaltyLevel1Label: "إنذار شفهي", penaltyLevel2Label: "إنذار كتابي",
      penaltyLevel3Label: "خصم يوم", penaltyLevel4Label: "خصم يومين",
      penaltyLevel5Label: "خصم ثلاثة أيام + إنذار نهائي",
    });
  } catch (e) { logger.error(e, "attendance-policy GET error"); res.json({}); }
});

router.put("/attendance-policy", authorize({ feature: "hr.attendance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح");
    }
    const b = zodParse(attendancePolicySchema.safeParse(req.body ?? {}));
    await rawExecute(
      `INSERT INTO attendance_policies ("companyId","lateThresholdMinutes","gpsRadiusMeters",
        "penaltyLevel1","penaltyLevel2","penaltyLevel3","penaltyLevel4","penaltyLevel5",
        "penaltyLevel1Label","penaltyLevel2Label","penaltyLevel3Label","penaltyLevel4Label","penaltyLevel5Label")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT ("companyId") DO UPDATE SET
        "lateThresholdMinutes"=$2,"gpsRadiusMeters"=$3,
        "penaltyLevel1"=$4,"penaltyLevel2"=$5,"penaltyLevel3"=$6,"penaltyLevel4"=$7,"penaltyLevel5"=$8,
        "penaltyLevel1Label"=$9,"penaltyLevel2Label"=$10,"penaltyLevel3Label"=$11,"penaltyLevel4Label"=$12,"penaltyLevel5Label"=$13`,
      [scope.companyId,
        b.lateThresholdMinutes ?? 15, b.gpsRadiusMeters ?? 500,
        b.penaltyLevel1 ?? 0, b.penaltyLevel2 ?? 50, b.penaltyLevel3 ?? 100, b.penaltyLevel4 ?? 200, b.penaltyLevel5 ?? 500,
        b.penaltyLevel1Label ?? "إنذار شفهي", b.penaltyLevel2Label ?? "إنذار كتابي",
        b.penaltyLevel3Label ?? "خصم يوم", b.penaltyLevel4Label ?? "خصم يومين",
        b.penaltyLevel5Label ?? "خصم ثلاثة أيام + إنذار نهائي"]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "attendance_policies", entityId: scope.companyId,
      after: { lateThresholdMinutes: b.lateThresholdMinutes ?? 15, gpsRadiusMeters: b.gpsRadiusMeters ?? 500 },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "attendance_policy.updated", entity: "hr_attendance_policies", entityId: scope.companyId, details: JSON.stringify({ lateThresholdMinutes: b.lateThresholdMinutes ?? 15, gpsRadiusMeters: b.gpsRadiusMeters ?? 500 }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Employee payroll summary (aggregate all assignments) ──────────────────────
router.get("/payroll-summary", authorize({ feature: "hr.payroll.runs", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as { period?: string };
    const targetPeriod = period ?? currentPeriod();

    const lines = await rawQuery<any>(
      `SELECT pl.*, e.name AS "employeeName", e."empNumber", ea."jobTitle", ea."branchId", b.name AS "branchName"
       FROM payroll_lines pl
       JOIN employee_assignments ea ON ea.id = pl."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       JOIN payroll_runs pr ON pr.id = pl."runId"
       WHERE pr."companyId" = $1 AND pr.period = $2 AND pr."deletedAt" IS NULL AND pl."deletedAt" IS NULL
       ORDER BY e.name, ea.id LIMIT 1000`,
      [scope.companyId, targetPeriod]
    );

    const empMap = new Map<number, any>();
    for (const l of lines) {
      const empId = l.employeeId ?? 0;
      if (!empMap.has(empId)) {
        empMap.set(empId, {
          employeeId: empId, employeeName: l.employeeName, empNumber: l.empNumber,
          totalBasic: 0, totalGross: 0, totalGosi: 0, totalNet: 0,
          assignmentBreakdowns: [],
        });
      }
      const emp = empMap.get(empId)!;
      emp.totalBasic += Number(l.basic ?? 0);
      emp.totalGross += Number(l.grossSalary ?? 0);
      emp.totalGosi += Number(l.gosi ?? 0);
      emp.totalNet += Number(l.netSalary ?? 0);
      emp.assignmentBreakdowns.push({
        assignmentId: l.assignmentId, jobTitle: l.jobTitle, branchName: l.branchName,
        basic: Number(l.basic ?? 0),
        housingAllowance: Number(l.housingAllowance ?? 0),
        transportAllowance: Number(l.transportAllowance ?? 0),
        grossSalary: Number(l.grossSalary ?? 0),
        gosi: Number(l.gosi ?? 0),
        gosiEmployer: Number(l.gosiEmployer ?? 0),
        lateDeduction: Number(l.lateDeduction ?? 0),
        absenceDeduction: Number(l.absenceDeduction ?? 0),
        violationDeduction: Number(l.violationDeduction ?? 0),
        loanDeduction: Number(l.loanDeduction ?? 0),
        overtime: Number(l.overtime ?? 0),
        overtimeHours: Number(l.overtimeHours ?? 0),
        netSalary: Number(l.netSalary ?? 0),
      });
    }

    const data = Array.from(empMap.values());
    res.json({ data, total: data.length, period: targetPeriod });
  } catch (err) { logger.error(err, "payslip-preview query failed"); res.json({ data: [], total: 0 }); }
});

router.get("/violations-stats", authorize({ feature: "hr.violations", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const currentMonth = currentPeriod();
    const [[total], [thisMonthRow], [totalDeductions]] = await Promise.all([
      rawQuery<any>(`SELECT COUNT(*) AS count FROM employee_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [scope.companyId]),
      rawQuery<any>(`SELECT COUNT(*) AS count FROM employee_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL AND period = $2`, [scope.companyId, currentMonth]),
      rawQuery<any>(`SELECT COALESCE(SUM(deduction),0) AS total FROM employee_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [scope.companyId]),
    ]);
    res.json({
      total: Number(total?.count ?? 0),
      thisMonth: Number(thisMonthRow?.count ?? 0),
      totalDeductions: Number(totalDeductions?.total ?? 0),
    });
  } catch (_e) { logger.error(_e, "violations-stats query failed"); res.json({ total: 0, thisMonth: 0, totalDeductions: 0 }); }
});

router.patch("/violations/:id", authorize({ feature: "hr.violations", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل المخالفات مقصور على HR أو المدير أو المالك");
    }
    const id = parseId(req.params.id, "id");
    const b = zodParse(violationPatchSchema.safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: any[] = [];
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.severity !== undefined) { params.push(b.severity); sets.push(`severity=$${params.length}`); }
    if (b.deduction !== undefined) { params.push(Number(b.deduction)); sets.push(`deduction=$${params.length}`); }
    if (b.period !== undefined) { params.push(b.period); sets.push(`period=$${params.length}`); }
    if (b.description !== undefined) {
      params.push(b.description); sets.push(`description=$${params.length}`);
    } else if (b.notes) {
      params.push(b.notes); sets.push(`description=CONCAT(description, E'\\n', $${params.length})`);
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات");
    }
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM employee_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE employee_violations SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("المخالفة غير موجودة");
    const [updated] = await rawQuery<any>(`SELECT * FROM employee_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "employee_violations", entityId: id,
      before: beforeRow ?? {},
      after: updated ?? {},
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "violation.updated", entity: "hr_violations", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(updated || { message: "تم التحديث" });
  } catch (err) { handleRouteError(err, res, "Patch violation error:"); }
});

async function violationApprovalAction(req: any, res: any, newStatus: "approved" | "rejected" | "returned") {
  try {
    const scope = req.scope!;
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: اعتماد المخالفات مقصور على HR أو المدير أو المالك");
    }
    const id = parseId(req.params.id, "id");
    const { notes } = zodParse(violationApprovalSchema.safeParse(req.body ?? {}));
    const [violation] = await rawQuery<any>(
      `SELECT * FROM employee_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!violation) throw new NotFoundError("المخالفة غير موجودة");
    if ((newStatus === "rejected" || newStatus === "returned") && (!notes || !String(notes).trim())) {
      throw new ValidationError(newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع", { field: "notes" });
    }
    await applyTransition({
      entity: "employee_violations",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: `violation.${newStatus}`,
      toState: newStatus,
      reason: notes || undefined,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('violation',$1,$2,$3,$4,$5)`,
          [id, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
    });
    const labels: Record<string, string> = { approved: "تم اعتماد المخالفة", rejected: "تم رفض المخالفة", returned: "تم إرجاع المخالفة" };
    res.json({ message: labels[newStatus], status: newStatus });
  } catch (err) { handleRouteError(err, res, "Violation approval error:"); }
}
router.patch("/violations/:id/approve", authorize({ feature: "hr.violations", action: "update" }), (req, res) => violationApprovalAction(req, res, "approved"));
router.patch("/violations/:id/reject", authorize({ feature: "hr.violations", action: "update" }), (req, res) => violationApprovalAction(req, res, "rejected"));
router.patch("/violations/:id/return", authorize({ feature: "hr.violations", action: "update" }), (req, res) => violationApprovalAction(req, res, "returned"));

router.patch("/shifts/:id", authorize({ feature: "hr.attendance", action: "update", resource: { table: "shifts", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(shiftPatchSchema.safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.startTime !== undefined) { params.push(b.startTime); sets.push(`"startTime"=$${params.length}`); }
    if (b.endTime !== undefined) { params.push(b.endTime); sets.push(`"endTime"=$${params.length}`); }
    if (b.days !== undefined) { params.push(b.days); sets.push(`days=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.shiftType !== undefined) { params.push(b.shiftType); sets.push(`"shiftType"=$${params.length}`); }
    if (b.remoteAllowed !== undefined) { params.push(b.remoteAllowed); sets.push(`"remoteAllowed"=$${params.length}`); }
    if (b.splitBreakStart !== undefined) { params.push(b.splitBreakStart); sets.push(`"splitBreakStart"=$${params.length}`); }
    if (b.splitBreakEnd !== undefined) { params.push(b.splitBreakEnd); sets.push(`"splitBreakEnd"=$${params.length}`); }
    if (b.flexStartEarliest !== undefined) { params.push(b.flexStartEarliest); sets.push(`"flexStartEarliest"=$${params.length}`); }
    if (b.flexStartLatest !== undefined) { params.push(b.flexStartLatest); sets.push(`"flexStartLatest"=$${params.length}`); }
    if (b.isDefault !== undefined) {
      params.push(b.isDefault); sets.push(`"isDefault"=$${params.length}`);
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات");
    }
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM shifts WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    params.push(id); params.push(scope.companyId);
    await withTransaction(async (client) => {
      if (b.isDefault) await client.query(`UPDATE shifts SET "isDefault"=false WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [scope.companyId]);
      const result = await client.query(`UPDATE shifts SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
      if (!result.rowCount) throw new NotFoundError("السجل غير موجود");
    });
    const [row] = await rawQuery<any>(`SELECT * FROM shifts WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "shifts", entityId: id,
      before: beforeRow ?? {},
      after: row ?? {},
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "shift.updated", entity: "hr_shifts", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Patch shift error:"); }
});

router.delete("/shifts/:id", authorize({ feature: "hr.attendance", action: "delete", resource: { table: "shifts", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM shifts WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const { affectedRows } = await rawExecute(`UPDATE shifts SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "shifts", entityId: id,
      before: beforeRow ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "shift.deleted", entity: "hr_shifts", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ message: "تم حذف الوردية" });
  } catch (err) { handleRouteError(err, res, "Delete shift error:"); }
});

router.get("/shift-assignments", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT esa.*, s.name AS "shiftName", s."startTime", s."endTime",
              e.name AS "employeeName", e."empNumber"
       FROM employee_shift_assignments esa
       JOIN shifts s ON s.id = esa."shiftId"
       JOIN employee_assignments ea ON ea.id = esa."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE s."companyId" = $1
       ORDER BY esa."startDate" DESC LIMIT 200`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { logger.error(_e, "shift-assignments query failed"); res.json({ data: [], total: 0 }); }
});

router.post("/shift-assignments", authorize({ feature: "hr.attendance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { assignmentId, shiftId, startDate, endDate } = zodParse(shiftAssignmentSchema.safeParse(req.body));
    if (endDate && new Date(endDate) < new Date(startDate)) {
      throw new ValidationError("تاريخ النهاية قبل تاريخ البداية", {
        field: "endDate",
        fix: "اختر تاريخ نهاية بعد تاريخ البداية أو اتركه فارغاً",
      });
    }

    // FK pre-checks (both scoped by companyId). A wrong id used to return
    // ForbiddenError which is semantically wrong — it's a not-found/bad-
    // input case, not a permissions issue. Return ValidationError so the
    // frontend surfaces the exact bad field.
    const [validAssignment] = await rawQuery<{ id: number }>(
      `SELECT id FROM employee_assignments WHERE id=$1 AND "companyId"=$2`, [Number(assignmentId), scope.companyId]
    );
    if (!validAssignment) {
      throw new ValidationError(`التعيين رقم ${assignmentId} غير موجود في هذه الشركة`, {
        field: "assignmentId",
        fix: "اختر تعيينًا موجودًا",
      });
    }
    const [validShift] = await rawQuery<{ id: number }>(
      `SELECT id FROM shifts WHERE id=$1 AND "companyId"=$2`, [Number(shiftId), scope.companyId]
    );
    if (!validShift) {
      throw new ValidationError(`الوردية رقم ${shiftId} غير موجودة في هذه الشركة`, {
        field: "shiftId",
        fix: "اختر وردية موجودة",
      });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO employee_shift_assignments ("assignmentId","shiftId","startDate","endDate") VALUES ($1,$2,$3,$4)`,
      [Number(assignmentId), Number(shiftId), startDate, endDate ?? null]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employee_shift_assignments", entityId: insertId,
      after: { assignmentId: Number(assignmentId), shiftId: Number(shiftId), startDate, endDate: endDate ?? null },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "shift.assignment.created", entity: "hr_shift_assignments", entityId: insertId, details: JSON.stringify({ assignmentId: Number(assignmentId), shiftId: Number(shiftId) }) }).catch((e) => logger.error(e, "hr background task failed"));
    const [row] = await rawQuery<any>(
      `SELECT esa.*, s.name AS "shiftName"
         FROM employee_shift_assignments esa
         JOIN employee_assignments ea ON ea.id = esa."assignmentId" AND ea."companyId" = $2
         LEFT JOIN shifts s ON s.id = esa."shiftId"
        WHERE esa.id = $1`,
      [insertId, scope.companyId]
    );
    res.status(201).json(row || { id: insertId, assignmentId: Number(assignmentId), shiftId: Number(shiftId), startDate, endDate: endDate ?? null });
  } catch (err) { handleRouteError(err, res, "Create shift assignment error:"); }
});

router.get("/official-letters", authorize({ feature: "hr.organization", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT ol.*, e.name AS "employeeName",
              b.name AS "branchName"
       FROM official_letters ol
       LEFT JOIN employees e ON e.id = ol."employeeId"
       LEFT JOIN branches b ON b.id = ol."branchId"
       WHERE ol."companyId" = $1 AND ol."deletedAt" IS NULL
       ORDER BY ol."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { logger.error(_e, "official-letters query failed"); res.json({ data: [], total: 0 }); }
});

router.post("/official-letters", authorize({ feature: "hr.organization", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, type, subject, content, status } = zodParse(officialLetterSchema.safeParse(req.body));

    // FK pre-check: employee must belong to this company (via any assignment).
    const [emp] = await rawQuery<{ id: number }>(
      `SELECT e.id FROM employees e
        JOIN employee_assignments ea ON ea."employeeId" = e.id
        WHERE e.id = $1 AND ea."companyId" = $2 LIMIT 1`,
      [Number(employeeId), scope.companyId]
    );
    if (!emp) {
      throw new ValidationError(`الموظف رقم ${employeeId} غير موجود في هذه الشركة`, {
        field: "employeeId",
        fix: "اختر موظفاً مسجّلاً في الشركة",
      });
    }

    const [seqRow] = await rawQuery<any>(`SELECT nextval('letter_number_seq') AS seq`).catch((e) => { logger.error(e, "letter sequence query failed"); return [{ seq: Date.now() % 1000000 }]; });
    const letterRef = generateRef("LTR", seqRow.seq);

    let insertId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO official_letters ("companyId","employeeId",type,subject,content,status,"createdByAssignmentId",ref,"branchId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [scope.companyId, Number(employeeId), type ?? "general", String(subject).trim(), String(content).trim(), status ?? "draft", scope.activeAssignmentId, letterRef, scope.branchId || null]
      );
      insertId = ins.rows[0].id;
    });

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "letters", refType: "official_letter", refId: insertId,
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE official_letters SET status = 'pending_approval' WHERE id = $1 AND "companyId" = $2 AND status = 'draft' AND "deletedAt" IS NULL`,
        [insertId, scope.companyId]
      );
    }

    submitWorkflow({
      companyId: scope.companyId,
      branchId: scope.branchId,
      requestType: "official_letter",
      refTable: "official_letters",
      refId: insertId,
      title: `خطاب رسمي — ${subject ?? type ?? "طلب خطاب"}`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { type, subject, content },
    }).catch((e) => logger.error(e, "hr background task failed"));

    // Leave a creation trail: the approval chain writes its own rows but the
    // letter itself had no audit entry, so the employee timeline started at
    // "approved" with no visible "filed on X by Y" record.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "official_letter",
      entityId: insertId,
      action: "hr.letter.created",
      after: {
        employeeId,
        type: type ?? "general",
        subject,
        status: approvalResult.requiresApproval ? "pending_approval" : (status ?? "draft"),
      },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.letter.created",
      entity: "official_letter",
      entityId: insertId,
      after: { employeeId, type: type ?? "general", subject },
    }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM official_letters WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json({ ...row, approval: approvalResult });
  } catch (err) { handleRouteError(err, res, "Create official letter error:"); }
});

router.get("/monthly-attendance", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const month = (req.query.month as string) ?? currentPeriod();
    const rows = await rawQuery<any>(
      `SELECT ema.*, e.name AS "employeeName", e."empNumber"
       FROM employee_monthly_attendance ema
       JOIN employee_assignments ea ON ea.id = ema."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ema."companyId" = $1 AND ema.period = $2
       ORDER BY e.name LIMIT 500`,
      [scope.companyId, month]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { logger.error(_e, "monthly-attendance query failed"); res.json({ data: [], total: 0 }); }
});

// ─── Leave requests general PATCH/DELETE ──────────────────────
router.patch("/leave-requests/:id", authorize({ feature: "hr.leaves", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل طلبات الإجازة مقصور على HR أو المالك");
    }
    const { status, reason } = zodParse(leaveRequestPatchSchema.safeParse(req.body ?? {}));
    if (status && ["approved", "rejected"].includes(status)) {
      throw new ValidationError("استخدم نقطة نهاية الموافقة/الرفض المخصصة", { field: "status" });
    }
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (status) { sets.push(`status = $${idx++}`); params.push(status); }
    if (reason !== undefined) { sets.push(`reason = $${idx++}`); params.push(reason); }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث");
    }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE hr_leave_requests SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) {
      throw new NotFoundError("طلب الإجازة غير موجود");
    }
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "hr_leave_requests", entityId: id,
      after: { status: status ?? undefined, reason: reason ?? undefined },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "leave.updated", entity: "hr_leave_requests", entityId: id, details: JSON.stringify({ id: id, status, reason }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

/**
 * Cancel an approved leave request — restores balance, cancels obligations.
 * Use when leave is no longer needed (e.g. employee returned early, emergency).
 */
router.post("/leave-requests/:id/cancel", authorize({ feature: "hr.leaves", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(leaveCancelSchema.safeParse(req.body ?? {}));
    if (!b.reason) {
      throw new ValidationError("سبب الإلغاء مطلوب", {
        field: "reason",
        fix: "أدخل سبب إلغاء الإجازة",
      });
    }

    const [request] = await rawQuery<any>(
      `SELECT lr.*, lt.name AS "leaveTypeName"
       FROM hr_leave_requests lr
       LEFT JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!request) throw new NotFoundError("طلب الإجازة غير موجود");

    const isOwn = request.employeeId === scope.employeeId;
    if (!isOwn && !HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError(
        "إلغاء الإجازة مقصور على صاحب الطلب أو HR أو المالك",
        { fix: "اطلب من مدير الموارد البشرية تنفيذ الإلغاء." },
      );
    }
    if (!["approved", "pending"].includes(request.status)) {
      throw new ConflictError(
        `لا يمكن إلغاء إجازة بحالة ${request.status}`,
        {
          field: "status",
          fix: "الإجازة مُلغاة أو مرفوضة أو مكتملة مسبقاً.",
          meta: { currentStatus: request.status },
        },
      );
    }

    const prevStatus = request.status;
    await applyTransition({
      entity: "hr_leave_requests",
      id,
      scope,
      action: "leave.cancelled",
      fromStates: ["approved", "pending"],
      toState: "cancelled",
      reason: b.reason,
      setExtras: {
        rejectedReason: b.reason ? `${(request as any).rejectedReason || ""} | إلغاء: ${b.reason}`.trim() : null,
      },
      onApply: async (_row, client) => {
        const year = new Date(request.startDate).getFullYear();
        if (prevStatus === "approved") {
          await client.query(
            `UPDATE hr_leave_balances SET used = GREATEST(used - $1, 0)
             WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
            [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
          );
          await client.query(
            `DELETE FROM attendance
             WHERE "companyId" = $1 AND status = 'on_leave' AND notes LIKE $2
               AND date >= CURRENT_DATE AND date BETWEEN $3 AND $4 AND "deletedAt" IS NULL`,
            [scope.companyId, `%[leave_request:${id}]%`, request.startDate, request.endDate]
          );
        } else {
          await client.query(
            `UPDATE hr_leave_balances SET reserved = GREATEST(reserved - $1, 0)
             WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
            [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
          );
        }
      },
      after: { status: "cancelled", reason: b.reason, previousStatus: prevStatus },
    });

    await cancelObligation(scope.companyId, "hr_leave_request", id);

    res.json({ message: "تم إلغاء الإجازة", status: "cancelled", reason: b.reason });
  } catch (err) {
    if (err instanceof LifecycleError) {
      const typed = err.status === 404
        ? new NotFoundError(err.message)
        : new ConflictError(err.message, { field: err.field });
      return handleRouteError(typed, res, "Cancel leave error:");
    }
    handleRouteError(err, res, "Cancel leave error:");
  }
});

router.delete("/leave-requests/:id", authorize({ feature: "hr.leaves", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [leaveReq] = await rawQuery<any>(
      `SELECT lr.id, lr."employeeId", lr."leaveTypeId", lr.days, lr."startDate", lr.status
       FROM hr_leave_requests lr WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!leaveReq) throw new NotFoundError("طلب الإجازة غير موجود");
    const isOwnRequest = leaveReq.employeeId === scope.employeeId;
    if (!isOwnRequest && !HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError(
        "حذف طلبات الإجازة مقصور على صاحب الطلب أو HR أو المالك",
        { fix: "اطلب من مدير الموارد البشرية تنفيذ الحذف." }
      );
    }
    if (leaveReq.status !== 'pending') {
      throw new ConflictError(
        "لا يمكن حذف طلب تمت معالجته — استخدم الإلغاء بدلاً من الحذف",
        {
          field: "status",
          fix: "الطلبات المعتمدة أو المرفوضة تُلغى عبر زر 'إلغاء' لا 'حذف'.",
          meta: { currentStatus: leaveReq.status },
        }
      );
    }

    const year = new Date(leaveReq.startDate).getFullYear();
    let deleted = false;
    await withTransaction(async (client: any) => {
      const { rows } = await client.query(
        `UPDATE hr_leave_requests SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'pending' AND "deletedAt" IS NULL RETURNING id`,
        [id, scope.companyId]
      );
      if (!rows[0]) return;
      deleted = true;
      await client.query(
        `UPDATE hr_leave_balances
         SET reserved = GREATEST(reserved - $1, 0)
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [leaveReq.days, scope.companyId, leaveReq.employeeId, leaveReq.leaveTypeId, year]
      );
    });
    if (!deleted) {
      throw new NotFoundError("طلب الإجازة غير موجود أو لا يمكن حذفه (تمت معالجته)");
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "hr_leave_requests", entityId: id,
      before: { employeeId: leaveReq.employeeId, days: leaveReq.days, status: "pending" },
      after: { status: "deleted" },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "leave.deleted", entity: "hr_leave_requests", entityId: id,
      details: `حذف طلب إجازة — ${leaveReq.days} أيام — رصيد مُحرّر`,
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Payroll PATCH/DELETE ──────────────────────
router.patch("/payroll/:id", authorize({ feature: "hr.payroll.runs", action: "update", resource: { table: "payroll_runs", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!PAYROLL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل الرواتب مقصور على HR أو المالية أو المالك");
    }
    const { status } = zodParse(payrollPatchSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<any>(
      `SELECT id, status, period, "totalNet" FROM payroll_runs WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("دورة الرواتب غير موجودة");

    if (status === "posted" && existing.status !== "posted") {
      const period = existing.period;
      const totalNet = Number(existing.totalNet ?? 0);

      const lines = await rawQuery<any>(
        `SELECT pl."employeeId", pl.gosi AS "gosiEmployee", pl."gosiEmployer", pl.basic, pl."grossSalary", pl."netSalary"
         FROM payroll_lines pl WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL`,
        [id]
      );

      const totalGross = lines.reduce((s: number, l: any) => s + Number(l.grossSalary ?? l.basic ?? 0), 0);
      const totalGosiEmployee = lines.reduce((s: number, l: any) => s + Number(l.gosiEmployee ?? 0), 0);
      const totalGosiEmployer = lines.reduce((s: number, l: any) => s + Number(l.gosiEmployer ?? 0), 0);
      const totalGosiPayable = totalGosiEmployee + totalGosiEmployer;
      const totalBankPayout = Math.max(0, totalNet);

      const [updatedRun] = await rawQuery<any>(
        `UPDATE payroll_runs SET status = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL AND status = $4 RETURNING *`,
        [status, id, scope.companyId, existing.status]
      );
      if (!updatedRun) throw new NotFoundError("دورة الرواتب غير موجودة");

      const { hrEngine } = await import("../lib/engines/index.js");
      await hrEngine.postPayrollPostGL(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId },
        {
          runId: id,
          period,
          totalGross,
          totalGosiEmployer,
          totalBankPayout,
          totalGosiPayable,
        }
      );

      // Register monthly GOSI submission obligation (due 14th of NEXT month)
      try {
        const [pyYear, pyMonth] = String(period).split("-").map(Number);
        if (pyYear && pyMonth) {
          const gosiDue = new Date(pyYear, pyMonth, 14); // pyMonth is 1-12, Date month is 0-11, so pyMonth is next month
          if (totalGosiPayable > 0) {
            await registerObligation({
              companyId: scope.companyId,
              branchId: scope.branchId ?? null,
              entityType: "payroll_run",
              entityId: id,
              obligationType: "declaration",
              title: `تقديم اشتراكات التأمينات الاجتماعية — ${period} (${totalGosiPayable.toFixed(2)} ريال)`,
              dueAt: gosiDue.toISOString(),
              metadata: { period, gosiPayable: totalGosiPayable, employeeShare: totalGosiEmployee, employerShare: totalGosiEmployer },
              dedupeKey: `payroll-${req.params.id}-gosi-submission`,
              escalationSteps: [
                { hoursAfterDue: 0, notifyRole: "finance_manager" },
                { hoursAfterDue: 24, notifyRole: "general_manager" },
              ],
            });
          }
          // Salary disbursement obligation — due end of current period
          const disbursementDue = new Date(pyYear, pyMonth, 0); // last day of period
          await registerObligation({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            entityType: "payroll_run",
            entityId: id,
            obligationType: "payment",
            title: `صرف رواتب — ${period} (${totalBankPayout.toFixed(2)} ريال صافي)`,
            dueAt: disbursementDue.toISOString(),
            metadata: { period, totalNet: totalBankPayout, employeeCount: lines.length },
            dedupeKey: `payroll-${req.params.id}-disbursement`,
            escalationSteps: [
              { hoursAfterDue: 0, notifyRole: "finance_manager" },
              { hoursAfterDue: 24, notifyRole: "general_manager" },
            ],
          });
        }
      } catch (obErr) { logger.error(obErr, "Payroll obligation registration failed:"); }

      await emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "payroll.posted",
        entity: "payroll_runs",
        entityId: id,
        details: `ترحيل رواتب ${period}: صافي ${totalBankPayout.toFixed(2)} / GOSI ${totalGosiPayable.toFixed(2)}`,
      }).catch((e) => logger.error(e, "hr background task failed"));

      const [row] = await rawQuery<any>(
        `SELECT * FROM payroll_runs WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId]
      );
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "update", entity: "payroll_runs", entityId: id,
        before: { status: existing.status, period: existing.period },
        after: { status: "posted", period: existing.period },
      }).catch((e) => logger.error(e, "hr background task failed"));
      res.json(row);
      return;
    }

    const [row] = await rawQuery<any>(
      `UPDATE payroll_runs SET status = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL AND status = $4 RETURNING *`,
      [status, id, scope.companyId, existing.status]
    );
    if (!row) throw new NotFoundError("دورة الرواتب غير موجودة");

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "payroll_runs", entityId: id,
      before: { status: existing.status },
      after: { status },
    }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/payroll/:id", authorize({ feature: "hr.payroll.runs", action: "delete", resource: { table: "payroll_runs", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف الرواتب مقصور على HR أو المالك");
    }
    const id = parseId(req.params.id, "id");
    const [exists] = await rawQuery<any>(
      `SELECT id, status, period, "totalNet" FROM payroll_runs WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]
    );
    if (!exists) throw new NotFoundError("دورة الرواتب غير موجودة");
    if (exists.status === "posted") {
      throw new ConflictError("لا يمكن حذف دورة رواتب تم ترحيلها");
    }
    await withTransaction(async (client) => {
      // ── Reverse financial side effects ──

      // Revert attendance deductions (table has no payrollRunId — match by period)
      await client.query(
        `UPDATE attendance_deductions SET status = 'pending_payroll' WHERE period = $1 AND "companyId" = $2 AND status = 'deducted_in_payroll'`,
        [exists.period, scope.companyId]
      );

      // Revert loan installments and restore loan remaining amounts (payrollLineId → payroll_lines.runId)
      const { rows: paidInstallments } = await client.query(
        `SELECT hli.id, hli."loanId", hli.amount FROM hr_loan_installments hli JOIN payroll_lines pl ON pl.id = hli."payrollLineId" WHERE pl."runId" = $1 AND hli.status = 'paid'`,
        [id]
      );
      if (paidInstallments.length > 0) {
        await client.query(
          `UPDATE hr_loan_installments SET status = 'pending' WHERE "payrollLineId" IN (SELECT id FROM payroll_lines WHERE "runId" = $1) AND "companyId" = $2 AND status = 'paid'`,
          [id, scope.companyId]
        );
        for (const inst of paidInstallments) {
          await client.query(
            `UPDATE loan_accounts SET "remainingAmount" = "remainingAmount" + $1 WHERE id = $2 AND "companyId" = $3`,
            [inst.amount, inst.loanId, scope.companyId]
          );
        }
      }

      // Revert overtime requests (payrollLineId → payroll_lines.runId)
      await client.query(
        `UPDATE hr_overtime_requests SET status = 'approved' WHERE "payrollLineId" IN (SELECT id FROM payroll_lines WHERE "runId" = $1) AND "companyId" = $2 AND status = 'paid' AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );

      // Reverse GL journal entry if one exists (via finance helper to respect domain boundaries)
      const { rows: journalRows } = await client.query(
        `SELECT id FROM journal_entries WHERE "sourceType" = 'payroll_runs' AND "sourceId" = $1 AND "deletedAt" IS NULL`,
        [id]
      );
      for (const je of journalRows) {
        await softDeleteJournalEntry(scope.companyId, Number(je.id));
      }

      // Soft-delete payroll lines and the run itself
      await client.query(`UPDATE payroll_lines SET "deletedAt" = NOW() WHERE "runId" = $1 AND "deletedAt" IS NULL`, [id]);
      await client.query(`UPDATE payroll_runs SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "payroll_runs", entityId: id,
      before: { period: exists.period, status: exists.status, totalNet: exists.totalNet },
      after: { status: "deleted" },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "payroll.deleted", entity: "payroll_runs", entityId: id,
      details: `حذف دورة رواتب ${exists.period}`,
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Performance PATCH/DELETE ──────────────────────
router.patch("/performance/:id", authorize({ feature: "hr.performance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل التقييمات مقصور على HR أو المدير أو المالك");
    }
    const { overallScore, score, comments, feedback, status, strengths, improvements, goals } = zodParse(performancePatchSchema.safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const finalScore = overallScore ?? score;
    if (finalScore !== undefined) { sets.push(`"overallScore" = $${idx++}`); params.push(finalScore); }
    const finalComments = comments ?? feedback;
    if (finalComments !== undefined) { sets.push(`comments = $${idx++}`); params.push(finalComments); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (strengths !== undefined) { sets.push(`strengths = $${idx++}`); params.push(strengths); }
    if (improvements !== undefined) { sets.push(`improvements = $${idx++}`); params.push(improvements); }
    if (goals !== undefined) { sets.push(`goals = $${idx++}`); params.push(goals); }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات");
    }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM performance_reviews WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const [row] = await rawQuery<any>(
      `UPDATE performance_reviews SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx++} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("التقييم غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "performance_reviews", entityId: id,
      before: beforeRow ?? {},
      after: row,
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "performance.updated", entity: "hr_performance", entityId: id, details: JSON.stringify({ id: id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Patch performance error:"); }
});

router.delete("/performance/:id", authorize({ feature: "hr.performance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف التقييمات مقصور على HR أو المالك");
    }
    const id = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM performance_reviews WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    const [row] = await rawQuery<any>(
      `UPDATE performance_reviews SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("التقييم غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "performance_reviews", entityId: id,
      before: beforeRow ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "performance.deleted", entity: "hr_performance", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Violations DELETE ──────────────────────
router.delete("/violations/:id", authorize({ feature: "hr.violations", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف المخالفات مقصور على HR أو المالك");
    }
    const id = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM employee_violations WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const [row] = await rawQuery<any>(
      `UPDATE employee_violations SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "employee_violations", entityId: id,
      before: beforeRow ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "violation.deleted", entity: "hr_violations", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Single official letter with letterhead ──────────────
router.get("/official-letters/:id", authorize({ feature: "hr.organization", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [letter] = await rawQuery<any>(
      `SELECT ol.*, e.name AS "employeeName", e."empNumber",
              e."nationalId", e."passportNumber", e."iqamaNumber",
              ea."jobTitle", ea."hireDate",
              b.name AS "branchName", b."logoUrl" AS "branchLogo",
              b.address AS "branchAddress", b."taxNumber" AS "branchTaxNumber",
              b."crNumber" AS "branchCrNumber", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."footerText" AS "branchFooter",
              b."nameEn" AS "branchNameEn", b.city AS "branchCity",
              c.name AS "companyName"
       FROM official_letters ol
       LEFT JOIN employees e ON e.id = ol."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = ol."companyId" AND ea.status = 'active'
       LEFT JOIN branches b ON b.id = COALESCE(ol."branchId", ea."branchId")
       LEFT JOIN companies c ON c.id = ol."companyId"
       WHERE ol.id = $1 AND ol."companyId" = $2 AND ol."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!letter) throw new NotFoundError("الخطاب غير موجود");
    res.json(letter);
  } catch (err) { handleRouteError(err, res, "خطأ في جلب الخطاب"); }
});

// ─── Official letters PATCH/DELETE ──────────────────────
router.patch("/official-letters/:id", authorize({ feature: "hr.organization", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل الخطابات مقصور على HR أو المدير أو المالك");
    }
    const { subject, content, status, type } = zodParse(officialLetterPatchSchema.safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (subject !== undefined) { sets.push(`subject = $${idx++}`); params.push(subject); }
    if (content !== undefined) { sets.push(`content = $${idx++}`); params.push(content); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (type !== undefined) { sets.push(`type = $${idx++}`); params.push(type); }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات");
    }
    const letterId = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM official_letters WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [letterId, scope.companyId]);
    params.push(letterId, scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE official_letters SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("الخطاب غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "official_letters", entityId: letterId,
      before: beforeRow ?? {},
      after: row,
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "letter.updated", entity: "hr_official_letters", entityId: letterId, details: JSON.stringify({ id: letterId }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/official-letters/:id", authorize({ feature: "hr.organization", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف الخطابات مقصور على HR أو المالك");
    }
    const id = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM official_letters WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    const [row] = await rawQuery<any>(
      `UPDATE official_letters SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الخطاب غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "official_letters", entityId: id,
      before: beforeRow ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "letter.deleted", entity: "hr_official_letters", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.patch("/official-letters/:id/approve", authorize({ feature: "hr.organization", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: لا تملك صلاحية اعتماد الخطابات");
    }
    const { id } = req.params;
    const { approved, notes } = zodParse(letterApprovalSchema.safeParse(req.body ?? {}));

    const [letter] = await rawQuery<any>(
      `SELECT * FROM official_letters WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!letter) throw new NotFoundError("الخطاب غير موجود");

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) {
      throw new ValidationError("يجب ذكر سبب الرفض", { field: "notes" });
    }

    if (newStatus === "approved") {
      await rawExecute(
        `UPDATE official_letters
           SET status = $1, "approvedAt" = NOW(), "approvedBy" = $3
         WHERE id = $2 AND "companyId" = $4 AND status = 'pending_approval' AND "deletedAt" IS NULL`,
        [newStatus, Number(id), scope.userId, scope.companyId]
      );
    } else {
      await rawExecute(
        `UPDATE official_letters SET status = $1 WHERE id = $2 AND "companyId" = $3 AND status = 'pending_approval' AND "deletedAt" IS NULL`,
        [newStatus, Number(id), scope.companyId]
      );
    }

    // If the letter was rejected or returned, cancel any queued dispatches
    // so the queue worker doesn't send it after the fact.
    if (newStatus === "rejected" || newStatus === "returned") {
      await rawExecute(
        `UPDATE email_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
          WHERE "refType"='official_letter' AND "refId"=$1 AND "companyId"=$2 AND status='pending'`,
        [Number(id), scope.companyId]
      ).catch((e) => logger.error(e, "cancel email_queue for rejected letter failed:"));
      await rawExecute(
        `UPDATE whatsapp_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
          WHERE "refType"='official_letter' AND "refId"=$1 AND "companyId"=$2 AND status='pending'`,
        [Number(id), scope.companyId]
      ).catch((e) => { logger.warn(e, "hr whatsapp_queue insert failed (table may not exist)"); });

      // Notify whoever filed the letter about the rejection/return so they
      // can see the reason and take action. Prefer the creator assignment
      // (the HR officer who filed it), fall back to the employee's own
      // assignment when the letter was filed by the employee themselves.
      const [targetAssignment] = await rawQuery<any>(
        `SELECT COALESCE(
                  ol."createdByAssignmentId",
                  (SELECT ea.id FROM employee_assignments ea
                    WHERE ea."employeeId" = ol."employeeId"
                      AND ea."companyId" = ol."companyId"
                      AND ea.status = 'active'
                    LIMIT 1)
                ) AS "assignmentId"
           FROM official_letters ol
          WHERE ol.id = $1 AND ol."deletedAt" IS NULL`,
        [Number(id)]
      );
      if (targetAssignment?.assignmentId) {
        await createNotification({
          companyId: scope.companyId,
          assignmentId: Number(targetAssignment.assignmentId),
          type: newStatus === "rejected" ? "letter_rejected" : "letter_returned",
          title: newStatus === "rejected" ? "تم رفض طلب الخطاب" : "تم إرجاع طلب الخطاب",
          body: `طلب خطاب "${letter.subject ?? letter.type ?? ""}" — ${
            newStatus === "rejected" ? "مرفوض" : "مُرجع للتعديل"
          }${notes ? `. السبب: ${notes}` : ""}`,
          priority: "high",
          refType: "official_letter",
          refId: Number(id),
        }).catch((e) => logger.error(e, "notify letter creator failed:"));
      }
    }

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('official_letter',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { logger.error(e, "Failed to log approval action:"); }

    // Close the loop: emit a lifecycle event so the letter actually gets
    // dispatched (email_queue). Without this the route used to stop at
    // status='approved' and the letter never left the building.
    await emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: newStatus === "approved"
        ? "hr.letter.approved"
        : newStatus === "rejected"
          ? "hr.letter.rejected"
          : "hr.letter.returned",
      entity: "official_letter",
      entityId: Number(id),
      before: { status: letter.status },
      after: {
        status: newStatus,
        subject: letter.subject,
        type: letter.type,
        employeeId: letter.employeeId,
        notes: notes ?? null,
      },
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "official_letters", entityId: Number(id),
      after: { status: newStatus, subject: letter.subject, type: letter.type, notes: notes ?? null },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json({ id: Number(id), status: newStatus });
  } catch (err) { handleRouteError(err, res, "خطأ في اعتماد الخطاب"); }
});

// ─── HR Stats ──────────────────────
router.get("/stats", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [[empCount], [leaveCount], [violationCount], [payrollCount]] = await Promise.all([
      rawQuery<any>(
        `SELECT COUNT(DISTINCT ea."employeeId") AS count FROM employee_assignments ea WHERE ea."companyId" = $1`,
        [scope.companyId]
      ),
      rawQuery<any>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER(WHERE status='pending') AS pending,
                COUNT(*) FILTER(WHERE status='approved') AS approved
         FROM hr_leave_requests WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId]
      ),
      rawQuery<any>(
        `SELECT COUNT(*) AS total FROM employee_violations WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId]
      ),
      rawQuery<any>(
        `SELECT COUNT(*) AS total FROM payroll_runs WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId]
      ),
    ]);
    res.json({
      employees: Number(empCount?.count ?? 0),
      leaveRequests: Number(leaveCount?.total ?? 0),
      pendingLeaves: Number(leaveCount?.pending ?? 0),
      approvedLeaves: Number(leaveCount?.approved ?? 0),
      violations: Number(violationCount?.total ?? 0),
      payrollRuns: Number(payrollCount?.total ?? 0),
    });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/deductions", authorize({ feature: "hr.payroll.runs", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const month = (req.query.month as string) ?? currentPeriod();
    const rows = await rawQuery<any>(
      `SELECT ad.*, e.name AS "employeeName"
       FROM attendance_deductions ad
       JOIN employee_assignments ea ON ea.id = ad."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ad."companyId" = $1 AND ad.period = $2
       ORDER BY ad."createdAt" DESC LIMIT 500`,
      [scope.companyId, month]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { logger.error(_e, "deductions query failed"); res.json({ data: [], total: 0 }); }
});

router.get("/onboarding-steps", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT value FROM settings WHERE key = 'hr.onboarding_steps' AND scope = 'company' AND "scopeId" = $1 LIMIT 1`,
      [scope.companyId]
    );
    if (row) {
      const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      res.json({ data: val }); return;
    }
    res.json({ data: ["تسليم أجهزة IT", "توقيع عقد العمل", "تعريف المدير المباشر", "دورة التعريف بالشركة", "فتح حساب بنكي", "تسجيل التأمينات"] });
  } catch (e) { logger.error(e, "failed to load onboarding steps"); res.json({ data: [] }); }
});

router.put("/onboarding-steps", authorize({ feature: "hr.employees", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بتعديل إعدادات التهيئة");
    }
    const { steps } = zodParse(onboardingStepsSchema.safeParse(req.body ?? {}));
    if (!Array.isArray(steps)) {
      throw new ValidationError("الخطوات مطلوبة", { field: "steps" });
    }
    const val = JSON.stringify(steps);
    await rawExecute(
      `INSERT INTO settings (key, value, scope, "scopeId")
       VALUES ('hr.onboarding_steps', $1, 'company', $2)
       ON CONFLICT (key, scope, "scopeId") DO UPDATE SET value = $1`,
      [val, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "settings", entityId: scope.companyId,
      after: { key: "hr.onboarding_steps", steps },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "onboarding.steps_updated", entity: "hr_onboarding_steps", entityId: scope.companyId, details: JSON.stringify({ stepCount: steps.length }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ data: steps });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPACT PREVIEW — preview the effects of HR actions before approval
// ─────────────────────────────────────────────────────────────────────────────

router.post("/impact-preview/leave", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, leaveTypeId, startDate, endDate, days } = zodParse(impactPreviewLeaveSchema.safeParse(req.body ?? {}));
    const [assignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
      [employeeId, scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");
    const daysCount = days ?? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    const impact = await computeLeaveImpact(scope.companyId, employeeId, assignment.id, leaveTypeId, startDate, endDate, daysCount);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "hr.leave.impact_preview", entity: "hr_leave_requests", entityId: Number(employeeId) }).catch((e) => logger.error(e, "hr background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "preview", entity: "hr_leave_requests", entityId: Number(employeeId),
      after: { employeeId: Number(employeeId), leaveTypeId: Number(leaveTypeId), startDate, endDate },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json(impact);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب الأثر"); }
});

router.post("/impact-preview/termination", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId } = zodParse(impactPreviewTerminationSchema.safeParse(req.body ?? {}));
    const [assignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
      [employeeId, scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");
    const impact = await computeTerminationImpact(scope.companyId, employeeId, assignment.id);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "hr.termination.impact_preview", entity: "employees", entityId: Number(employeeId) }).catch((e) => logger.error(e, "hr background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "preview", entity: "employees", entityId: Number(employeeId),
      after: { employeeId: Number(employeeId) },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json(impact);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب الأثر"); }
});

router.post("/impact-preview/violation", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, deduction, severity } = zodParse(impactPreviewViolationSchema.safeParse(req.body ?? {}));
    const [assignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
      [employeeId, scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");
    const impact = await computeViolationImpact(scope.companyId, employeeId, assignment.id, deduction, severity);

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "hr.violation.impact_preview", entity: "employee_violations", entityId: Number(employeeId) }).catch((e) => logger.error(e, "hr background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "preview", entity: "employee_violations", entityId: Number(employeeId),
      after: { employeeId: Number(employeeId), deduction: Number(deduction), severity },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json(impact);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب الأثر"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE OPERATIONAL STATUS — live state calculation
// ─────────────────────────────────────────────────────────────────────────────

router.get("/employee-status/:employeeId", authorize({ feature: "hr.employees", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.params;
    const [assignment] = await rawQuery<any>(
      `SELECT ea.id FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active' LIMIT 1`,
      [Number(employeeId), scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");

    const { computeEmployeeOperationalStatus } = await import("../lib/impactPreview.js");
    const status = await computeEmployeeOperationalStatus(scope.companyId, Number(employeeId), assignment.id);
    res.json(status);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب حالة الموظف"); }
});

router.get("/employees-status", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employees = await rawQuery<any>(
      `SELECT e.id AS "employeeId", ea.id AS "assignmentId"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
       WHERE e.status = 'active' AND e."deletedAt" IS NULL
       LIMIT 500`,
      [scope.companyId]
    );

    const { computeEmployeeOperationalStatus } = await import("../lib/impactPreview.js");
    const statuses = await Promise.all(
      employees.map(async (emp: any) => {
        try {
          const s = await computeEmployeeOperationalStatus(scope.companyId, emp.employeeId, emp.assignmentId);
          return { employeeId: emp.employeeId, ...s };
        } catch (e) {
          logger.error(e, "failed to compute employee operational status");
          return { employeeId: emp.employeeId, status: "working", label: "على رأس العمل", color: "bg-green-100 text-green-700", reason: "" };
        }
      })
    );

    res.json({ data: statuses });
  } catch (err) { handleRouteError(err, res, "خطأ في حساب حالات الموظفين"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 360° SMART EVALUATION SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

function isHR(scope: { role: string }): boolean {
  return HR_ROLES.includes(scope.role);
}
function isMgr(scope: { role: string }): boolean {
  return MGR_ROLES.includes(scope.role);
}

// Helper: compute system evaluation scores for an employee
async function computeSystemEvaluation(companyId: number, employeeId: number): Promise<{
  attendanceScore: number;
  taskCompletionScore: number;
  onTimeScore: number;
  clientSatScore: number;
  docQualityScore: number;
  overallScore: number;
  metrics: Record<string, number>;
}> {
  const today = todayISO()!;
  const { calculateEmployeeKPIs } = await import("../lib/kpiEngine.js");
  const kpiMetrics = await calculateEmployeeKPIs(companyId, employeeId, today);

  // Attendance score: based on 30-day attendance records
  const [attRow] = await rawQuery<any>(
    `SELECT
       COUNT(*) FILTER (WHERE status='present') AS present,
       COUNT(*) FILTER (WHERE status='absent') AS absent,
       COUNT(*) FILTER (WHERE "lateMinutes" > 0) AS late,
       COUNT(*) AS total
     FROM attendance a
     JOIN employee_assignments ea ON ea.id = a."assignmentId"
     WHERE ea."companyId" = $1 AND ea."employeeId" = $2
       AND a.date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId, employeeId]
  );
  const totalDays = Number(attRow?.total ?? 0);
  const presentDays = Number(attRow?.present ?? 0);
  const lateDays = Number(attRow?.late ?? 0);
  const absencePenalty = totalDays > 0 ? (Number(attRow?.absent ?? 0) / totalDays) * 20 : 0;
  const latePenalty = totalDays > 0 ? (lateDays / totalDays) * 10 : 0;
  const attendanceScore = Math.max(0, Math.min(100, totalDays > 0 ? (presentDays / totalDays) * 100 - latePenalty : 50));

  // Task completion score
  const taskCompletionScore = kpiMetrics.task_completion_rate ?? 0;

  // On-time rate score
  const onTimeScore = kpiMetrics.on_time_rate ?? 0;

  // Client satisfaction score (0-5 scale → 0-100)
  const clientSat = kpiMetrics.client_satisfaction ?? 0;
  const clientSatScore = Math.round((clientSat / 5) * 100);

  // Document quality score: count of documents with description in last 90 days
  const [docRow] = await rawQuery<any>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE notes IS NOT NULL AND notes != '') AS documented
     FROM employee_documents
     WHERE "companyId" = $1 AND "employeeId" = $2
       AND "createdAt" >= CURRENT_DATE - INTERVAL '90 days'`,
    [companyId, employeeId]
  );
  const totalDocs = Number(docRow?.total ?? 0);
  const documentedDocs = Number(docRow?.documented ?? 0);
  const docQualityScore = totalDocs > 0 ? Math.round((documentedDocs / totalDocs) * 100) : 50;

  const metrics: Record<string, number> = {
    ...kpiMetrics,
    attendance_rate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
    late_days: lateDays,
    present_days: presentDays,
    total_working_days: totalDays,
    doc_quality_score: docQualityScore,
  };

  // Weighted overall score
  const overallScore = Math.round(
    attendanceScore * 0.25 +
    taskCompletionScore * 0.25 +
    onTimeScore * 0.20 +
    clientSatScore * 0.20 +
    docQualityScore * 0.10
  );

  return {
    attendanceScore: Math.round(attendanceScore),
    taskCompletionScore: Math.round(taskCompletionScore),
    onTimeScore: Math.round(onTimeScore),
    clientSatScore: Math.round(clientSatScore),
    docQualityScore: Math.round(docQualityScore),
    overallScore: Math.round(overallScore),
    metrics,
  };
}

// Helper: recompute and save evaluation summary
async function recomputeSummary(cycleId: number, companyId: number, employeeId: number): Promise<void> {
  const [sysEval] = await rawQuery<any>(
    `SELECT "overallScore" FROM system_evaluations WHERE "cycleId" = $1`, [cycleId]
  );
  const peerRows = await rawQuery<any>(
    `SELECT "overallScore", "evaluatorRole" FROM peer_evaluations WHERE "cycleId" = $1`, [cycleId]
  );
  const upwardRows = await rawQuery<any>(
    `SELECT "overallScore" FROM anonymous_upward_reviews WHERE "cycleId" = $1`, [cycleId]
  );

  const systemScore = sysEval ? Number(sysEval.overallScore) : null;
  const managerEvals = peerRows.filter((p: any) => p.evaluatorRole === 'manager');
  const peerEvals = peerRows.filter((p: any) => p.evaluatorRole === 'peer');
  const managerScore = managerEvals.length > 0
    ? Math.round(managerEvals.reduce((s: number, p: any) => s + Number(p.overallScore), 0) / managerEvals.length)
    : null;
  const peerScore = peerEvals.length > 0
    ? Math.round(peerEvals.reduce((s: number, p: any) => s + Number(p.overallScore), 0) / peerEvals.length)
    : null;
  const upwardCount = upwardRows.length;
  const upwardAvgScore = upwardCount >= 3
    ? Math.round(upwardRows.reduce((s: number, r: any) => s + Number(r.overallScore), 0) / upwardCount)
    : null;

  // Final weighted score
  const parts: number[] = [];
  if (systemScore !== null) parts.push(systemScore * 0.40);
  if (managerScore !== null) parts.push(managerScore * 0.35);
  if (peerScore !== null) parts.push(peerScore * 0.15);
  if (upwardAvgScore !== null) parts.push(upwardAvgScore * 0.10);
  const totalWeight = (systemScore !== null ? 0.40 : 0) + (managerScore !== null ? 0.35 : 0) +
    (peerScore !== null ? 0.15 : 0) + (upwardAvgScore !== null ? 0.10 : 0);
  const finalScore = totalWeight > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / totalWeight) : null;

  await rawExecute(
    `INSERT INTO evaluation_summaries ("cycleId","companyId","employeeId","systemScore","peerScore","managerScore","upwardAvgScore","upwardReviewCount","finalScore","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT ("cycleId") DO UPDATE SET
       "systemScore" = EXCLUDED."systemScore",
       "peerScore" = EXCLUDED."peerScore",
       "managerScore" = EXCLUDED."managerScore",
       "upwardAvgScore" = EXCLUDED."upwardAvgScore",
       "upwardReviewCount" = EXCLUDED."upwardReviewCount",
       "finalScore" = EXCLUDED."finalScore",
       "updatedAt" = NOW()`,
    [cycleId, companyId, employeeId, systemScore, peerScore, managerScore, upwardAvgScore, upwardCount, finalScore]
  );
}

// GET /hr/evaluation-cycles — list cycles (scoped by role)
router.get("/evaluation-cycles", authorize({ feature: "hr.performance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.query as any;
    let rows: any[];

    if (isHR(scope)) {
      // HR sees all cycles for the company (optionally filtered by employeeId)
      rows = await rawQuery<any>(
        `SELECT ec.*, e.name AS "employeeName", e."empNumber",
                es."finalScore", es."systemScore", es."peerScore", es."managerScore",
                CASE WHEN es."upwardReviewCount" >= 3 THEN es."upwardAvgScore" ELSE NULL END AS "upwardAvgScore"
         FROM evaluation_cycles ec
         JOIN employees e ON e.id = ec."employeeId"
         LEFT JOIN evaluation_summaries es ON es."cycleId" = ec.id
         WHERE ec."companyId" = $1 ${employeeId ? `AND ec."employeeId" = $2` : ''}
         ORDER BY ec."createdAt" DESC LIMIT 200`,
        employeeId ? [scope.companyId, employeeId] : [scope.companyId]
      );
    } else if (BRANCH_GM_ROLES.includes(scope.role)) {
      // Managers see cycles for employees they manage (same branch)
      rows = await rawQuery<any>(
        `SELECT ec.*, e.name AS "employeeName", e."empNumber",
                es."finalScore", es."systemScore", es."peerScore", es."managerScore",
                CASE WHEN es."upwardReviewCount" >= 3 THEN es."upwardAvgScore" ELSE NULL END AS "upwardAvgScore"
         FROM evaluation_cycles ec
         JOIN employees e ON e.id = ec."employeeId"
         LEFT JOIN evaluation_summaries es ON es."cycleId" = ec.id
         JOIN employee_assignments ea_sub ON ea_sub."employeeId" = ec."employeeId" AND ea_sub."branchId" = $2 AND ea_sub.status='active'
         WHERE ec."companyId" = $1
         ORDER BY ec."createdAt" DESC LIMIT 200`,
        [scope.companyId, scope.branchId]
      );
    } else {
      // Employees see their own cycles + cycles where they are participants
      rows = await rawQuery<any>(
        `SELECT ec.*, e.name AS "employeeName", e."empNumber",
                es."finalScore", es."systemScore", es."peerScore", es."managerScore",
                CASE WHEN es."upwardReviewCount" >= 3 THEN es."upwardAvgScore" ELSE NULL END AS "upwardAvgScore"
         FROM evaluation_cycles ec
         JOIN employees e ON e.id = ec."employeeId"
         LEFT JOIN evaluation_summaries es ON es."cycleId" = ec.id
         WHERE ec."companyId" = $1
           AND (ec."employeeId" = $2 OR EXISTS (
             SELECT 1 FROM evaluation_participants ep WHERE ep."cycleId" = ec.id AND ep."evaluatorId" = $2
           ))
         ORDER BY ec."createdAt" DESC LIMIT 200`,
        [scope.companyId, scope.employeeId]
      );
    }

    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "خطأ في جلب دورات التقييم"); }
});

// POST /hr/evaluation-cycles — start a new evaluation cycle (HR only)
router.post("/evaluation-cycles", authorize({ feature: "hr.performance", action: "create" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    if (!isHR(scope)) {
      throw new ForbiddenError("مسموح فقط لـ HR بإنشاء دورات التقييم");
    }

    const { employeeId, period, notes, participants = [] } = zodParse(evaluationCycleSchema.safeParse(req.body)) as any;

    // Validate subject employee belongs to this company (multi-tenant integrity)
    const [subjectAssign] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 LIMIT 1`,
      [employeeId, scope.companyId]
    );
    if (!subjectAssign) {
      throw new ValidationError("الموظف لا ينتمي إلى هذه الشركة", { field: "employeeId" });
    }

    // Compute system evaluation before transaction (read-only)
    const evalData = await computeSystemEvaluation(scope.companyId, employeeId);

    // Validate participants before transaction (read-only)
    const validRoles = new Set(["manager", "peer"]);
    const candidateParticipants = (participants as Array<{ evaluatorId: number; evaluatorRole: string }>)
      .filter(p => p.evaluatorId && validRoles.has(p.evaluatorRole));
    let validParticipants: Array<{ evaluatorId: number; evaluatorRole: string }> = [];
    if (candidateParticipants.length > 0) {
      const evalIds = candidateParticipants.map(p => p.evaluatorId);
      const idPlaceholders = evalIds.map((_, i) => `$${i + 2}`).join(",");
      const validAssignments = await rawQuery<any>(
        `SELECT DISTINCT "employeeId" FROM employee_assignments WHERE "companyId"=$1 AND "employeeId" IN (${idPlaceholders})`,
        [scope.companyId, ...evalIds]
      );
      const validIdSet = new Set(validAssignments.map((a: any) => a.employeeId));
      validParticipants = candidateParticipants.filter(p => validIdSet.has(p.evaluatorId));
    }

    // Wrap all inserts in a single atomic transaction
    const cycleId = await withTransaction(async (client) => {
      const cycleRes = await client.query(
        `INSERT INTO evaluation_cycles ("companyId","employeeId","initiatorId",period,status,notes,"startDate")
         VALUES ($1,$2,$3,$4,'open',$5,CURRENT_DATE) RETURNING id`,
        [scope.companyId, employeeId, scope.employeeId ?? null, period, notes ?? null]
      );
      const cId = cycleRes.rows[0].id;

      if (validParticipants.length > 0) {
        const values = validParticipants.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",");
        const params = validParticipants.flatMap(p => [cId, scope.companyId, p.evaluatorId, p.evaluatorRole]);
        await client.query(
          `INSERT INTO evaluation_participants ("cycleId","companyId","evaluatorId","evaluatorRole")
           VALUES ${values} ON CONFLICT DO NOTHING`,
          params
        );
      }

      await client.query(
        `INSERT INTO system_evaluations ("cycleId","companyId","employeeId","attendanceScore","taskCompletionScore","onTimeScore","clientSatScore","docQualityScore","overallScore",metrics)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [cId, scope.companyId, employeeId,
         evalData.attendanceScore, evalData.taskCompletionScore,
         evalData.onTimeScore, evalData.clientSatScore, evalData.docQualityScore,
         evalData.overallScore, JSON.stringify(evalData.metrics)]
      );

      return cId;
    });

    // Initialize summary
    await recomputeSummary(cycleId, scope.companyId, employeeId);

    await applyTransition({
      entity: "evaluation_cycles",
      id: cycleId,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "evaluation.created",
      toState: "in_progress",
      after: { employeeId, period, participantCount: participants.length },
    });
    res.status(201).json({ id: cycleId, period, employeeId, status: 'in_progress', systemEval: evalData });
  } catch (err) { handleRouteError(err, res, "خطأ في بدء دورة التقييم"); }
});

// GET /hr/evaluation-cycles/:id — get cycle details (access-controlled)
router.get("/evaluation-cycles/:id", authorize({ feature: "hr.performance", action: "view" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = parseId(req.params.id, "id");

    const [cycle] = await rawQuery<any>(
      `SELECT ec.*, e.name AS "employeeName", e."empNumber", ea."jobTitle"
       FROM evaluation_cycles ec
       JOIN employees e ON e.id = ec."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       WHERE ec.id = $1 AND ec."companyId" = $2`,
      [cycleId, scope.companyId]
    );
    if (!cycle) throw new NotFoundError("دورة التقييم غير موجودة");

    // Access check:
    // - HR: see all cycles in the company
    // - Manager: only cycles for employees in their branch (branch-scoped, not role-only)
    // - Employee: only their own cycle, or cycles where they are an assigned participant
    if (isHR(scope)) {
      // HR: unrestricted within company — already filtered by companyId above
    } else if (BRANCH_GM_ROLES.includes(scope.role)) {
      // Manager must share at least one branch with the employee being evaluated (any active assignment)
      const [sharedBranch] = await rawQuery<any>(
        `SELECT 1 FROM employee_assignments ea_mgr
         JOIN employee_assignments ea_sub ON ea_sub."branchId" = ea_mgr."branchId"
         WHERE ea_mgr."employeeId"=$1 AND ea_mgr."companyId"=$2 AND ea_mgr.status='active'
           AND ea_sub."employeeId"=$3 AND ea_sub."companyId"=$2 AND ea_sub.status='active'
         LIMIT 1`,
        [scope.employeeId, scope.companyId, cycle.employeeId]
      );
      const isOwnCycle = cycle.employeeId === scope.employeeId;
      const [isParticipant] = await rawQuery<any>(
        `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
        [cycleId, scope.employeeId]
      );
      if (!sharedBranch && !isOwnCycle && !isParticipant) {
        throw new ForbiddenError("لا تملك صلاحية لعرض دورات الموظفين خارج فرعك");
      }
    } else {
      // Regular employee: own cycle or assigned participant
      const isOwn = cycle.employeeId === scope.employeeId;
      const [isParticipant] = await rawQuery<any>(
        `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
        [cycleId, scope.employeeId]
      );
      if (!isOwn && !isParticipant) throw new ForbiddenError("لا تملك صلاحية لعرض هذه الدورة");
    }

    const [sysEval] = await rawQuery<any>(
      `SELECT * FROM system_evaluations WHERE "cycleId" = $1`, [cycleId]
    );

    const peerEvals = await rawQuery<any>(
      `SELECT pe.*, e.name AS "evaluatorName", ea."jobTitle" AS "evaluatorTitle"
       FROM peer_evaluations pe
       JOIN employees e ON e.id = pe."evaluatorId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active' AND ea."companyId" = $2
       WHERE pe."cycleId" = $1`,
      [cycleId, scope.companyId]
    );

    const participants = await rawQuery<any>(
      `SELECT ep.*, e.name AS "evaluatorName"
       FROM evaluation_participants ep
       JOIN employees e ON e.id = ep."evaluatorId"
       WHERE ep."cycleId" = $1`,
      [cycleId]
    );

    const [summary] = await rawQuery<any>(
      `SELECT * FROM evaluation_summaries WHERE "cycleId" = $1`, [cycleId]
    );

    // Upward reviews: only count, no names, no individual rows
    const [upwardCount] = await rawQuery<any>(
      `SELECT COUNT(*) AS count, AVG("overallScore") AS avg FROM anonymous_upward_reviews WHERE "cycleId" = $1`,
      [cycleId]
    );
    const upCount = Number(upwardCount?.count ?? 0);
    const upwardThresholdMet = upCount >= 3;

    res.json({
      cycle,
      systemEval: sysEval ?? null,
      peerEvals,
      participants,
      summary: summary ?? null,
      upwardSummary: {
        // Only reveal aggregate AND count when at least 3 reviews exist
        // Hiding count below threshold prevents inference in small teams
        ...(upwardThresholdMet
          ? { count: upCount, avgScore: Math.round(Number(upwardCount?.avg ?? 0)), locked: false }
          : { locked: true }),
      },
    });
  } catch (err) { handleRouteError(err, res, "خطأ في جلب تفاصيل دورة التقييم"); }
});

// GET /hr/evaluation-cycles/:id/system-report — get auto-generated report
router.get("/evaluation-cycles/:id/system-report", authorize({ feature: "hr.performance", action: "list" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = parseId(req.params.id, "id");

    const [cycle] = await rawQuery<any>(
      `SELECT ec."employeeId", ec."companyId"
       FROM evaluation_cycles ec
       WHERE ec.id = $1 AND ec."companyId" = $2`,
      [cycleId, scope.companyId]
    );
    if (!cycle) throw new NotFoundError("دورة التقييم غير موجودة");

    // Enforce the same cycle-level authorization as the detail endpoint
    if (isHR(scope)) {
      // unrestricted
    } else if (BRANCH_GM_ROLES.includes(scope.role)) {
      const [sharedBranch] = await rawQuery<any>(
        `SELECT 1 FROM employee_assignments ea_mgr
         JOIN employee_assignments ea_sub ON ea_sub."branchId" = ea_mgr."branchId"
         WHERE ea_mgr."employeeId"=$1 AND ea_mgr."companyId"=$2 AND ea_mgr.status='active'
           AND ea_sub."employeeId"=$3 AND ea_sub."companyId"=$2 AND ea_sub.status='active'
         LIMIT 1`,
        [scope.employeeId, scope.companyId, cycle.employeeId]
      );
      const [isParticipantRow] = await rawQuery<any>(
        `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
        [cycleId, scope.employeeId]
      );
      if (!sharedBranch && cycle.employeeId !== scope.employeeId && !isParticipantRow) {
        throw new ForbiddenError("لا تملك صلاحية لعرض التقرير الآلي لهذه الدورة");
      }
    } else {
      const isOwn = cycle.employeeId === scope.employeeId;
      const [isParticipantRow] = await rawQuery<any>(
        `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
        [cycleId, scope.employeeId]
      );
      if (!isOwn && !isParticipantRow) {
        throw new ForbiddenError("لا تملك صلاحية لعرض التقرير الآلي لهذه الدورة");
      }
    }

    let [sysEval] = await rawQuery<any>(
      `SELECT * FROM system_evaluations WHERE "cycleId" = $1`, [cycleId]
    );

    if (!sysEval) {
      // Recompute if not yet generated
      const evalData = await computeSystemEvaluation(cycle.companyId, cycle.employeeId);
      await rawExecute(
        `INSERT INTO system_evaluations ("cycleId","companyId","employeeId","attendanceScore","taskCompletionScore","onTimeScore","clientSatScore","docQualityScore","overallScore",metrics)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT ("cycleId") DO UPDATE SET
           "attendanceScore"=$4,"taskCompletionScore"=$5,"onTimeScore"=$6,"clientSatScore"=$7,"docQualityScore"=$8,"overallScore"=$9,metrics=$10`,
        [cycleId, cycle.companyId, cycle.employeeId,
         evalData.attendanceScore, evalData.taskCompletionScore,
         evalData.onTimeScore, evalData.clientSatScore, evalData.docQualityScore,
         evalData.overallScore, JSON.stringify(evalData.metrics)]
      );
      sysEval = { ...evalData, cycleId, companyId: cycle.companyId, employeeId: cycle.employeeId };
    }

    res.json(sysEval);
  } catch (err) { handleRouteError(err, res, "خطأ في جلب التقرير الآلي"); }
});

// POST /hr/evaluation-cycles/:id/peer-evaluation — submit manager/peer review
// Evaluator identity is derived from the authenticated session (scope.employeeId), NOT the request body
router.post("/evaluation-cycles/:id/peer-evaluation", authorize({ feature: "hr.performance", action: "create" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = parseId(req.params.id, "id");
    const { overallScore, scores, comments } = zodParse(peerEvaluationSchema.safeParse(req.body ?? {}));

    // Evaluator is always the authenticated user — prevents impersonation
    const evaluatorId = scope.employeeId;
    if (!evaluatorId) throw new ForbiddenError("لا يمكن تحديد هوية المقيِّم");
    if (!overallScore) throw new ValidationError("overallScore مطلوب", { field: "overallScore" });

    const [cycle] = await rawQuery<any>(
      `SELECT "employeeId","companyId" FROM evaluation_cycles WHERE id = $1 AND "companyId" = $2`,
      [cycleId, scope.companyId]
    );
    if (!cycle) throw new NotFoundError("دورة التقييم غير موجودة");

    // Authorization: determine if evaluator is allowed to submit for this cycle
    // Priority: (1) assigned participant (always allowed + uses their assigned role)
    //           (2) HR — allowed for any cycle in the company
    //           (3) manager — ONLY if same branch as the subject employee
    //           (4) all others — must be a participant
    let evaluatorRole = "peer";
    const [participant] = await rawQuery<any>(
      `SELECT "evaluatorRole" FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
      [cycleId, evaluatorId]
    );
    if (participant) {
      evaluatorRole = participant.evaluatorRole;
    } else if (isHR(scope)) {
      // HR can submit evaluations for any cycle without being a pre-assigned participant
      evaluatorRole = "peer";
    } else if (BRANCH_GM_ROLES.includes(scope.role)) {
      // Manager must share at least one branch with the subject employee (any active assignment, not just primary)
      const [sharedBranch] = await rawQuery<any>(
        `SELECT 1 FROM employee_assignments ea_mgr
         JOIN employee_assignments ea_sub ON ea_sub."branchId" = ea_mgr."branchId"
         WHERE ea_mgr."employeeId"=$1 AND ea_mgr."companyId"=$2 AND ea_mgr.status='active'
           AND ea_sub."employeeId"=$3 AND ea_sub."companyId"=$2 AND ea_sub.status='active'
         LIMIT 1`,
        [scope.employeeId, scope.companyId, cycle.employeeId]
      );
      if (!sharedBranch) {
        throw new ForbiddenError("لا تملك صلاحية تقييم موظفين خارج فرعك");
      }
      evaluatorRole = "manager";
    } else {
      throw new ForbiddenError("أنت لست ضمن المقيِّمين المعينين لهذه الدورة");
    }

    let insertId!: number;
    await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO peer_evaluations ("cycleId","companyId","evaluatorId","employeeId","evaluatorRole","overallScore",scores,comments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT ("cycleId","evaluatorId") DO UPDATE SET
           "evaluatorRole"=$5,"overallScore"=$6,scores=$7,comments=$8
         RETURNING id`,
        [cycleId, scope.companyId, evaluatorId, cycle.employeeId, evaluatorRole, overallScore,
         scores ? JSON.stringify(scores) : null, comments ?? null]
      );
      insertId = result.rows[0].id;
      await client.query(
        `UPDATE evaluation_participants SET "hasSubmitted"=true,"submittedAt"=NOW()
         WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
        [cycleId, evaluatorId]
      );
    });

    await recomputeSummary(cycleId, scope.companyId, cycle.employeeId);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "evaluation.peer_submitted", entity: "peer_evaluations", entityId: insertId,
    }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "peer_evaluations", entityId: insertId,
      after: { cycleId, evaluatorId, evaluatorRole, overallScore },
    }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM peer_evaluations WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, cycleId, evaluatorId, evaluatorRole, overallScore });
  } catch (err) { handleRouteError(err, res, "خطأ في إرسال التقييم"); }
});

// POST /hr/evaluation-cycles/:id/upward-review — anonymous upward review (employee rates manager)
router.post("/evaluation-cycles/:id/upward-review", authorize({ feature: "hr.performance", action: "create" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = parseId(req.params.id, "id");
    const { managerId, overallScore, scores, comments } = zodParse(upwardReviewSchema.safeParse(req.body ?? {}));

    if (!managerId || !overallScore) {
      throw new ValidationError("managerId و overallScore مطلوبان", {
        field: !managerId ? "managerId" : "overallScore",
      });
    }

    const [cycle] = await rawQuery<any>(
      `SELECT id,"companyId","employeeId" FROM evaluation_cycles WHERE id = $1 AND "companyId" = $2`,
      [cycleId, scope.companyId]
    );
    if (!cycle) throw new NotFoundError("دورة التقييم غير موجودة");

    // Validate that the managerId is a legitimate participant in this cycle with role=manager
    // This prevents rating arbitrary employees as "manager" within a cycle
    const [managerIsParticipant] = await rawQuery<any>(
      `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2 AND "evaluatorRole"='manager'`,
      [cycleId, managerId]
    );
    if (!managerIsParticipant) {
      throw new ValidationError("المدير المختار ليس مشاركاً معيَّناً بدور مدير في هذه الدورة", {
        field: "managerId",
      });
    }

    // Self-rating guard: reviewer cannot rate themselves as manager
    if (managerId === scope.employeeId) {
      throw new ForbiddenError("لا يمكنك تقييم نفسك في التقييم العكسي");
    }

    // Eligibility check — upward reviews must come from non-manager employees:
    // (a) the subject employee (who is being evaluated), OR
    // (b) a cycle participant with role='peer' (subordinates/peers, not managers)
    // Managers with evaluatorRole='manager' and HR users are explicitly excluded to
    // preserve objectivity of the "employee rates manager" model.
    const isSubject = cycle.employeeId === scope.employeeId;
    const [isEligibleParticipant] = await rawQuery<any>(
      `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2 AND "evaluatorRole"='peer'`,
      [cycleId, scope.employeeId]
    );

    if (!isSubject && !isEligibleParticipant) {
      throw new ForbiddenError("أنت غير مؤهل لتقديم تقييم عكسي في هذه الدورة");
    }

    // Prevent duplicate submissions from the same person per cycle per manager
    // We store a one-way hash (HMAC) that uniquely identifies this reviewer-cycle-manager
    // pair without revealing the reviewer's identity
    const crypto = await import("node:crypto");
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new IntegrationError("خطأ في إعداد النظام: JWT_SECRET غير مضبوط", {
        meta: { integration: "auth", secret: "JWT_SECRET" },
      });
    }
    const submissionToken = crypto
      .createHmac("sha256", secret)
      .update(`${scope.userId}:${cycleId}:${managerId}`)
      .digest("hex");

    // Store submission token in the DB to detect duplicates
    // First check if this token already exists
    const [existing] = await rawQuery<any>(
      `SELECT id FROM anonymous_upward_reviews WHERE "cycleId"=$1 AND "managerId"=$2 AND "submissionToken"=$3`,
      [cycleId, managerId, submissionToken]
    );
    if (existing) throw new ConflictError("لقد أرسلت تقييمك لهذا المدير مسبقاً في هذه الدورة");

    // Insert with hashed token only — reviewer identity NOT stored
    const { insertId } = await rawExecute(
      `INSERT INTO anonymous_upward_reviews ("cycleId","companyId","managerId","overallScore",scores,comments,"submissionToken")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [cycleId, scope.companyId, managerId, overallScore, scores ? JSON.stringify(scores) : null, comments ?? null, submissionToken]
    );

    // Recompute summary (upward score only shows when >=3 reviews)
    await recomputeSummary(cycleId, scope.companyId, cycle.employeeId);

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "evaluation.upward_submitted", entity: "anonymous_upward_reviews", entityId: insertId,
    }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "anonymous_upward_reviews", entityId: insertId,
      after: { cycleId, managerId, overallScore },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.status(201).json({ id: insertId, cycleId, anonymous: true, message: "تم إرسال التقييم بنجاح — هويتك محمية" });
  } catch (err) { handleRouteError(err, res, "خطأ في إرسال التقييم العكسي"); }
});

// GET /hr/evaluation-cycles/:id/summary — get 360 summary
router.get("/evaluation-cycles/:id/summary", authorize({ feature: "hr.performance", action: "list" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = parseId(req.params.id, "id");

    const [cycle] = await rawQuery<any>(
      `SELECT ec.*, e.name AS "employeeName", ea."jobTitle"
       FROM evaluation_cycles ec
       JOIN employees e ON e.id = ec."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       WHERE ec.id = $1 AND ec."companyId" = $2`,
      [cycleId, scope.companyId]
    );
    if (!cycle) throw new NotFoundError("دورة التقييم غير موجودة");

    // Access check (same branch-scoped rules as detail endpoint)
    if (isHR(scope)) {
      // unrestricted
    } else if (BRANCH_GM_ROLES.includes(scope.role)) {
      const [sharedBranch] = await rawQuery<any>(
        `SELECT 1 FROM employee_assignments ea_mgr
         JOIN employee_assignments ea_sub ON ea_sub."branchId" = ea_mgr."branchId"
         WHERE ea_mgr."employeeId"=$1 AND ea_mgr."companyId"=$2 AND ea_mgr.status='active'
           AND ea_sub."employeeId"=$3 AND ea_sub."companyId"=$2 AND ea_sub.status='active'
         LIMIT 1`,
        [scope.employeeId, scope.companyId, cycle.employeeId]
      );
      const [isParticipantRow] = await rawQuery<any>(
        `SELECT 1 FROM evaluation_participants WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
        [cycleId, scope.employeeId]
      );
      if (!sharedBranch && cycle.employeeId !== scope.employeeId && !isParticipantRow) {
        throw new ForbiddenError("لا تملك صلاحية لعرض هذا الملخص");
      }
    } else if (cycle.employeeId !== scope.employeeId) {
      throw new ForbiddenError("لا تملك صلاحية لعرض هذا الملخص");
    }

    const [sysEval] = await rawQuery<any>(
      `SELECT "attendanceScore","taskCompletionScore","onTimeScore","clientSatScore","docQualityScore","overallScore",metrics
       FROM system_evaluations WHERE "cycleId" = $1`, [cycleId]
    );

    const peerEvals = await rawQuery<any>(
      `SELECT "evaluatorRole","overallScore",scores,comments FROM peer_evaluations WHERE "cycleId" = $1`, [cycleId]
    );

    const [upwardRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS count, ROUND(AVG("overallScore")) AS avg
       FROM anonymous_upward_reviews WHERE "cycleId" = $1`, [cycleId]
    );

    let [summary] = await rawQuery<any>(
      `SELECT * FROM evaluation_summaries WHERE "cycleId" = $1 AND "companyId" = $2`,
      [cycleId, scope.companyId]
    );

    if (!summary) {
      await recomputeSummary(cycleId, scope.companyId, cycle.employeeId);
      [summary] = await rawQuery<any>(
        `SELECT * FROM evaluation_summaries WHERE "cycleId" = $1 AND "companyId" = $2`,
        [cycleId, scope.companyId]
      );
    }

    const upwardCount = Number(upwardRow?.count ?? 0);
    const upwardThresholdMet = upwardCount >= 3;

    res.json({
      cycle,
      systemEval: sysEval ?? null,
      peerEvals,
      upward: upwardThresholdMet
        ? { count: upwardCount, avgScore: Number(upwardRow?.avg ?? 0), locked: false }
        : { locked: true },
      summary: summary ?? null,
    });
  } catch (err) { handleRouteError(err, res, "خطأ في جلب ملخص التقييم 360°"); }
});

// GET /hr/employees/:id/evaluation-history — performance trend over time
router.get("/employees/:id/evaluation-history", authorize({ feature: "hr.employees", action: "list" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.id, "id");

    // Validate employee belongs to this company via assignment (prevents cross-tenant PII leakage)
    const [empAssign] = await rawQuery<any>(
      `SELECT ea."branchId", ea."jobTitle", e.name, e."empNumber"
       FROM employee_assignments ea
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."employeeId"=$1 AND ea."companyId"=$2 AND ea."isPrimary"=true`,
      [employeeId, scope.companyId]
    );
    if (!empAssign) throw new NotFoundError("الموظف غير موجود في هذه الشركة");

    // Access check:
    // - HR: unrestricted within company
    // - Manager: same branch as employee, or explicitly checking own data
    // - Employee: own history only
    if (isHR(scope)) {
      // unrestricted
    } else if (BRANCH_GM_ROLES.includes(scope.role)) {
      const [sharedBranch] = await rawQuery<any>(
        `SELECT 1 FROM employee_assignments ea_mgr
         JOIN employee_assignments ea_sub ON ea_sub."branchId" = ea_mgr."branchId"
         WHERE ea_mgr."employeeId"=$1 AND ea_mgr."companyId"=$2 AND ea_mgr.status='active'
           AND ea_sub."employeeId"=$3 AND ea_sub."companyId"=$2 AND ea_sub.status='active'
         LIMIT 1`,
        [scope.employeeId, scope.companyId, employeeId]
      );
      const isOwn = scope.employeeId === employeeId;
      if (!sharedBranch && !isOwn) {
        throw new ForbiddenError("لا تملك صلاحية لعرض تاريخ تقييمات موظفين خارج فرعك");
      }
    } else if (scope.employeeId !== employeeId) {
      throw new ForbiddenError("لا تملك صلاحية لعرض تاريخ تقييمات هذا الموظف");
    }

    const cycles = await rawQuery<any>(
      `SELECT ec.id, ec.period, ec."startDate", ec.status,
              es."finalScore", es."systemScore", es."managerScore", es."peerScore", es."upwardAvgScore"
       FROM evaluation_cycles ec
       LEFT JOIN evaluation_summaries es ON es."cycleId" = ec.id
       WHERE ec."companyId" = $1 AND ec."employeeId" = $2
       ORDER BY ec."startDate" ASC LIMIT 500`,
      [scope.companyId, employeeId]
    );

    res.json({
      employee: { name: empAssign.name, empNumber: empAssign.empNumber, jobTitle: empAssign.jobTitle },
      history: cycles,
    });
  } catch (err) { handleRouteError(err, res, "خطأ في جلب تاريخ التقييمات"); }
});

// GET /hr/upward-reviews/manager/:managerId — aggregated upward reviews for a manager (HR only)
router.get("/upward-reviews/manager/:managerId", authorize({ feature: "hr.performance", action: "view" }), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const managerId = parseId(req.params.managerId, "managerId");

    // Only HR or the manager themselves can view this — no cross-manager access
    if (!isHR(scope) && scope.employeeId !== managerId) {
      throw new ForbiddenError("لا تملك صلاحية لعرض التقييمات العكسية لمدير آخر");
    }

    const [row] = await rawQuery<any>(
      `SELECT COUNT(*) AS count,
              ROUND(AVG("overallScore")) AS "avgScore",
              ROUND(AVG((scores->>'leadership')::numeric)) AS "leadershipAvg",
              ROUND(AVG((scores->>'communication')::numeric)) AS "communicationAvg",
              ROUND(AVG((scores->>'fairness')::numeric)) AS "fairnessAvg",
              ROUND(AVG((scores->>'support')::numeric)) AS "supportAvg"
       FROM anonymous_upward_reviews
       WHERE "companyId" = $1 AND "managerId" = $2`,
      [scope.companyId, managerId]
    );

    const count = Number(row?.count ?? 0);

    if (count < 3) {
      // Do NOT expose count below threshold — prevents inference in small cohorts
      return res.json({
        managerId,
        locked: true,
        message: "يتطلب عدد كافٍ من التقييمات لعرض النتائج",
        avgScore: null,
      });
    }

    res.json({
      managerId,
      count,
      locked: false,
      avgScore: Number(row?.avgScore ?? 0),
      leadershipAvg: row?.leadershipAvg ? Number(row.leadershipAvg) : null,
      communicationAvg: row?.communicationAvg ? Number(row.communicationAvg) : null,
      fairnessAvg: row?.fairnessAvg ? Number(row.fairnessAvg) : null,
      supportAvg: row?.supportAvg ? Number(row.supportAvg) : null,
    });
  } catch (err) { handleRouteError(err, res, "خطأ في جلب التقييمات العكسية"); }
});

router.get("/delegations", authorize({ feature: "hr.organization", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT d.id, d."delegatorId", d."delegateId", d.scope, d.reason, d.status, d."startDate", d."endDate", d."createdAt",
              e1.name AS "delegatorName", e2.name AS "delegateName"
       FROM delegations d
       LEFT JOIN employees e1 ON e1.id = d."delegatorId"
       LEFT JOIN employees e2 ON e2.id = d."delegateId"
       WHERE d."companyId" = $1
       ORDER BY d."createdAt" DESC
       LIMIT 50`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; });
    res.json({ data: rows, total: rows.length });
  } catch (err) { logger.error(err, "delegations query failed"); res.json({ data: [], total: 0 }); }
});

router.post("/delegations", authorize({ feature: "hr.organization", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { delegateId, scope: delegationScope, reason, startDate, endDate } = zodParse(delegationSchema.safeParse(req.body));
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new ValidationError("تاريخ النهاية قبل تاريخ البداية", {
        field: "endDate",
        fix: "اختر تاريخ نهاية بعد تاريخ البداية",
      });
    }

    const [emp] = await rawQuery<{ id: number }>(
      `SELECT e.id FROM employees e JOIN users u ON u."employeeId" = e.id WHERE u.id = $1 LIMIT 1`,
      [scope.userId]
    );
    if (!emp) throw new ValidationError("لم يتم العثور على الموظف المرتبط بحسابك");

    // FK pre-check: delegateId must be a real employee scoped to this company.
    const [delegate] = await rawQuery<{ id: number }>(
      `SELECT e.id FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id
        WHERE e.id = $1 AND ea."companyId" = $2 LIMIT 1`,
      [Number(delegateId), scope.companyId]
    );
    if (!delegate) {
      throw new ValidationError(`الموظف رقم ${delegateId} غير موجود في هذه الشركة`, {
        field: "delegateId",
        fix: "اختر موظفاً مسجّلاً في الشركة",
      });
    }
    if (Number(delegateId) === emp.id) {
      throw new ValidationError("لا يمكن تفويض نفسك", {
        field: "delegateId",
        fix: "اختر موظفاً مختلفاً",
      });
    }

    // The old handler wrapped rawExecute in .catch(() => ({ insertId: null }))
    // which silently swallowed FK / constraint errors and still returned
    // { success: true, id: null } — a lie to the caller. Drop the catch so
    // real DB errors surface through handleRouteError (with requestId).
    const r = await rawExecute(
      `INSERT INTO delegations ("fromUserId","toUserId","companyId",scope,reason,status,"startDate","endDate") VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`,
      [emp.id, Number(delegateId), scope.companyId, delegationScope || "عام", String(reason).trim(), startDate || new Date(), endDate || null]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "delegations", entityId: r.insertId,
      after: { delegatorId: emp.id, delegateId: Number(delegateId), scope: delegationScope || "عام", reason, startDate: startDate || null, endDate: endDate || null },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "delegation.created", entity: "hr_delegations", entityId: r.insertId, details: JSON.stringify({ delegateId: Number(delegateId), scope: delegationScope || "عام" }) }).catch((e) => logger.error(e, "hr background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM delegations WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { success: true, id: r.insertId, delegateId: Number(delegateId), startDate: startDate || null, endDate: endDate || null });
  } catch (err) { handleRouteError(err, res, "خطأ في إنشاء التفويض"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC HOLIDAYS — تقويم الإجازات الرسمية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/public-holidays", authorize({ feature: "hr.organization", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { year } = req.query as any;
    const conditions = [`"companyId" = $1`, `"deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (year) { params.push(Number(year)); conditions.push(`year = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT * FROM public_holidays WHERE ${conditions.join(" AND ")} ORDER BY "startDate" LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Public holidays error:"); }
});

router.post("/public-holidays", authorize({ feature: "hr.organization", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: إدارة الإجازات الرسمية مقصورة على HR أو المالك");
    }
    const b = zodParse(publicHolidaySchema.safeParse(req.body));
    const startDate = new Date(b.startDate);
    const year = b.year || startDate.getFullYear();
    const { insertId } = await rawExecute(
      `INSERT INTO public_holidays ("companyId",name,"startDate","endDate",year,type,description,"isRecurring")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, b.name, b.startDate, b.endDate || b.startDate, year,
       b.type || 'national', b.description || null, b.isRecurring || false]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM public_holidays WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "public_holidays", entityId: insertId,
      after: { name: b.name, startDate: b.startDate, endDate: b.endDate || b.startDate, year, type: b.type || "national" },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "holiday.created", entity: "hr_public_holidays", entityId: insertId, details: JSON.stringify({ name: b.name, startDate: b.startDate }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create holiday error:"); }
});

router.patch("/public-holidays/:id", authorize({ feature: "hr.organization", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح");
    }
    const id = parseId(req.params.id, "id");
    const b = zodParse(publicHolidayPatchSchema.safeParse(req.body ?? {}));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.isRecurring !== undefined) { params.push(b.isRecurring); sets.push(`"isRecurring"=$${params.length}`); }
    if (sets.length === 1) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM public_holidays WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const rows = await rawQuery<any>(
      `UPDATE public_holidays SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("العطلة غير موجودة");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "public_holidays", entityId: id,
      before: beforeRow ?? {},
      after: rows[0],
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "holiday.updated", entity: "hr_public_holidays", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update holiday error:"); }
});

// Check if a date is a public holiday
router.get("/public-holidays/check", authorize({ feature: "hr.organization", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { date } = req.query as any;
    if (!date) throw new ValidationError("التاريخ مطلوب", { field: "date" });
    const [holiday] = await rawQuery<any>(
      `SELECT * FROM public_holidays WHERE "companyId"=$1 AND $2::date BETWEEN "startDate"::date AND "endDate"::date`,
      [scope.companyId, date]
    );
    res.json({ isHoliday: !!holiday, holiday: holiday || null });
  } catch (err) { handleRouteError(err, res, "Check holiday error:"); }
});

router.delete("/public-holidays/:id", authorize({ feature: "hr.organization", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح");
    }
    const id = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM public_holidays WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const { affectedRows } = await rawExecute(`UPDATE public_holidays SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "public_holidays", entityId: id,
      before: beforeRow ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "holiday.deleted", entity: "hr_public_holidays", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ message: "تم حذف العطلة" });
  } catch (err) { handleRouteError(err, res, "Delete holiday error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE TRANSFERS — نقل الموظف بين الفروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/transfers", authorize({ feature: "hr.exit", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`t."companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`t.status=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT t.*, e.name AS "employeeName", e."empNumber",
              b1.name AS "fromBranchName", b2.name AS "toBranchName",
              d1.name AS "fromDeptName", d2.name AS "toDeptName"
       FROM employee_transfers t
       JOIN employees e ON e.id=t."employeeId"
       LEFT JOIN branches b1 ON b1.id=t."fromBranchId"
       LEFT JOIN branches b2 ON b2.id=t."toBranchId"
       LEFT JOIN departments d1 ON d1.id=t."fromDeptId"
       LEFT JOIN departments d2 ON d2.id=t."toDeptId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY t."createdAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Transfers error:"); }
});

router.get("/transfers/:id", authorize({ feature: "hr.exit", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT t.*, t."effectiveDate" AS "transferDate",
              e.name AS "employeeName", e."empNumber",
              b1.name AS "fromBranchName", b1.name AS "fromBranch",
              b2.name AS "toBranchName", b2.name AS "toBranch",
              d1.name AS "fromDeptName", d1.name AS "fromDepartment",
              d2.name AS "toDeptName", d2.name AS "toDepartment"
       FROM employee_transfers t
       JOIN employees e ON e.id=t."employeeId"
       LEFT JOIN branches b1 ON b1.id=t."fromBranchId"
       LEFT JOIN branches b2 ON b2.id=t."toBranchId"
       LEFT JOIN departments d1 ON d1.id=t."fromDeptId"
       LEFT JOIN departments d2 ON d2.id=t."toDeptId"
       WHERE t.id = $1 AND t."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("طلب النقل غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Transfer detail error:"); }
});

router.post("/transfers", authorize({ feature: "hr.exit", action: "create" }), async (req, res) => {
  // Step 3 of the HR operational audit — transfer request creation.
  // Converts the 2 raw res.status(...) error sites to typed throws and
  // adds a pre-check that the destination branch actually exists in the
  // same company. Also emits `hr.transfer.requested` so the HR inbox
  // audit log sees new transfer requests (was relying only on the
  // side-effect notification).
  try {
    const scope = req.scope!;
    const b = zodParse(transferSchema.safeParse(req.body)) as any;
    const [assignment] = await rawQuery<any>(
      `SELECT ea.id, ea."branchId", ea."departmentId", ea.salary, ea."jobTitle"
       FROM employee_assignments ea
       WHERE ea."employeeId"=$1 AND ea."companyId"=$2 AND ea.status='active' LIMIT 1`,
      [b.employeeId, scope.companyId]
    );
    if (!assignment) {
      throw new NotFoundError("الموظف غير نشط أو غير موجود في هذه الشركة", {
        fix: "تحقّق من أن الموظف لديه تعيين نشط قبل طلب النقل.",
      });
    }

    // Pre-check: destination branch must exist in the same company and be
    // different from the current branch.
    const [destBranch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [Number(b.toBranchId), scope.companyId]
    );
    if (!destBranch) {
      throw new ValidationError("الفرع المستقبل غير موجود في هذه الشركة", {
        field: "toBranchId",
        fix: "اختر فرعاً من قائمة فروع الشركة.",
      });
    }
    if (Number(b.toBranchId) === assignment.branchId) {
      throw new ConflictError("لا يمكن نقل الموظف إلى نفس فرعه الحالي", {
        field: "toBranchId",
        fix: "اختر فرعاً مختلفاً عن الفرع الحالي للموظف.",
        meta: { currentBranchId: assignment.branchId },
      });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO employee_transfers
       ("companyId","employeeId","fromBranchId","toBranchId","fromDeptId","toDeptId","fromJobTitle","toJobTitle","fromSalary","toSalary","requestedBy","reason","effectiveDate",status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14)`,
      [scope.companyId, b.employeeId, assignment.branchId, b.toBranchId,
       assignment.departmentId, b.toDeptId || assignment.departmentId,
       assignment.jobTitle, b.toJobTitle || assignment.jobTitle,
       assignment.salary, b.toSalary || assignment.salary,
       scope.employeeId, b.reason || null, b.effectiveDate || null, b.notes || null]
    );

    const [row] = await rawQuery<any>(`SELECT * FROM employee_transfers WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

    // Notify HR
    const hrAssign = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId"=$1 AND role IN ('hr_manager','general_manager','owner') AND status='active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 ELSE 2 END LIMIT 1`,
      [scope.companyId]
    );
    if (hrAssign[0]) {
      createNotification({
        companyId: scope.companyId, assignmentId: hrAssign[0].id,
        type: "transfer_request", title: "طلب نقل موظف جديد",
        body: `طلب نقل موظف بين الفروع — يحتاج مراجعة HR`,
        priority: "normal", refType: "employee_transfer", refId: insertId,
      }).catch((e) => logger.error(e, "hr background task failed"));
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employee_transfers", entityId: insertId,
      after: { employeeId: b.employeeId, fromBranchId: assignment.branchId, toBranchId: b.toBranchId, status: "pending" },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.transfer.requested",
      entity: "employee_transfers",
      entityId: insertId,
      details: JSON.stringify({
        employeeId: b.employeeId,
        fromBranchId: assignment.branchId,
        toBranchId: b.toBranchId,
      }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create transfer error:"); }
});

// ── Step 1: HR Manager approves → notifies receiving branch manager ──
router.patch("/transfers/:id/approve", authorize({ feature: "hr.exit", action: "update" }), async (req, res) => {
  // Step 3 of the HR operational audit — HR approval step of a transfer.
  // Converts 2 raw res.status error sites to typed throws and emits a
  // canonical `hr.transfer.hr_approved` / `hr.transfer.rejected` event
  // so the audit trail sees every HR decision on a transfer.
  try {
    const scope = req.scope!;
    if (!HR_ROLES.includes(scope.role)) {
      throw new ForbiddenError("هذه الخطوة محصورة بمدير الموارد البشرية أو المدير العام", {
        fix: "اطلب من مدير الموارد البشرية اتخاذ القرار.",
      });
    }
    const id = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(transferApprovalSchema.safeParse(req.body ?? {}));
    const [transfer] = await rawQuery<any>(
      `SELECT * FROM employee_transfers WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!transfer) {
      throw new NotFoundError("طلب النقل غير موجود");
    }
    if (transfer.status !== "pending") {
      throw new ConflictError(
        `لا يمكن اعتماد طلب نقل في الحالة "${transfer.status}"`,
        {
          field: "status",
          fix: "الطلب تمت معالجته مسبقاً أو انتقل لمرحلة لاحقة.",
          meta: { currentStatus: transfer.status },
        }
      );
    }

    if (approved) {
      const [receivingMgr] = await rawQuery<any>(
        `SELECT ea.id FROM employee_assignments ea
         WHERE ea."companyId"=$1 AND ea."branchId"=$2
           AND ea.role IN ('branch_manager','general_manager','owner') AND ea.status='active'
         ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
        [scope.companyId, transfer.toBranchId]
      );
      await applyTransition({
        entity: "employee_transfers",
        id,
        scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
        action: "hr.transfer.hr_approved",
        fromStates: ["pending"],
        toState: "pending_receiving_manager",
        reason: notes || undefined,
        setExtras: { approvedBy: scope.employeeId, approvedAt: { raw: "NOW()" }, notes: notes || null },
        notifications: receivingMgr ? [{
          assignmentId: receivingMgr.id,
          type: "transfer_receiving_approval", title: "طلب استقبال موظف منقول",
          body: `يحتاج استلام موظف منقول إلى فرعك — يرجى المراجعة والتأكيد`,
          priority: "high", refType: "employee_transfer", refId: id,
        }] : [],
      });
    } else {
      const [empAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
        [transfer.employeeId, scope.companyId]
      );
      await applyTransition({
        entity: "employee_transfers",
        id,
        scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
        action: "hr.transfer.rejected",
        fromStates: ["pending"],
        toState: "rejected",
        reason: notes || undefined,
        setExtras: { approvedBy: scope.employeeId, approvedAt: { raw: "NOW()" }, notes: notes || null },
        notifications: empAssign ? [{
          assignmentId: empAssign.id,
          type: "transfer_decision", title: "تم رفض طلب النقل",
          body: notes || "تم رفض طلب النقل من قبل مدير الموارد البشرية",
          priority: "high", refType: "employee_transfer", refId: id,
        }] : [],
      });
    }

    const [row] = await rawQuery<any>(`SELECT * FROM employee_transfers WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "employee_transfers", entityId: id,
      after: { status: row?.status, approved, notes: notes ?? null },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Approve transfer error:"); }
});

// ── Step 2: Receiving branch manager confirms the transfer ──
router.patch("/transfers/:id/receive", authorize({ feature: "hr.exit", action: "update" }), async (req, res) => {
  // Step 3 of the HR operational audit — receiving branch manager confirms
  // (or rejects) a transfer the HR manager has already approved.
  // Converts 3 raw res.status error sites to typed throws and emits the
  // canonical `hr.transfer.completed` / `hr.transfer.rejected_by_receiver`
  // event so the audit trail sees the final disposition.
  try {
    const scope = req.scope!;
    if (!PR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError(
        "استقبال الموظف المنقول محصور بمدير الفرع أو المدير العام",
        { fix: "اطلب من مدير الفرع تنفيذ الاستقبال." }
      );
    }
    const id = parseId(req.params.id, "id");
    const { confirmed, notes } = zodParse(transferConfirmSchema.safeParse(req.body ?? {}));
    const [transfer] = await rawQuery<any>(
      `SELECT * FROM employee_transfers WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!transfer) {
      throw new NotFoundError("طلب النقل غير موجود");
    }
    if (transfer.status !== "pending_receiving_manager") {
      throw new ConflictError(
        `لا يمكن استقبال طلب نقل في الحالة "${transfer.status}"`,
        {
          field: "status",
          fix: "الطلب إما ألغي أو اعتُمد مسبقاً أو لم يعتمده HR بعد.",
          meta: { currentStatus: transfer.status },
        }
      );
    }

    // Authorization: general_manager/owner can confirm any transfer; branch_manager must be in the destination branch
    if (scope.role === "branch_manager") {
      const [myAssignment] = await rawQuery<any>(
        `SELECT "branchId" FROM employee_assignments WHERE id=$1 AND "companyId"=$2`,
        [scope.activeAssignmentId, scope.companyId]
      );
      if (!myAssignment || myAssignment.branchId !== transfer.toBranchId) {
        throw new ForbiddenError("يمكنك فقط تأكيد النقل إلى فرعك", {
          fix: "هذا النقل مخصص لفرع آخر — اطلب من مديره تأكيده.",
          meta: {
            yourBranchId: myAssignment?.branchId ?? null,
            targetBranchId: transfer.toBranchId,
          },
        });
      }
    }

    if (confirmed) {
      // Execute the actual transfer — update employee assignment
      // Parameter order deliberately matches the SET clause: branchId, departmentId, jobTitle, salary
      const newBranchId = transfer.toBranchId;
      const newDeptId = transfer.toDeptId;
      const newJobTitle = transfer.toJobTitle;
      const newSalary = transfer.toSalary;
      // Notify employee of final approval
      const [empAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
        [transfer.employeeId, scope.companyId]
      );
      await applyTransition({
        entity: "employee_transfers",
        id,
        scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
        action: "hr.transfer.completed",
        fromStates: ["pending_receiving_manager"],
        toState: "approved",
        reason: notes || undefined,
        setExtras: { receivedBy: scope.employeeId, receivedAt: { raw: "NOW()" } },
        onApply: async (_row, client) => {
          await client.query(
            `UPDATE employee_assignments SET "branchId"=$1,"departmentId"=$2,"jobTitle"=$3,salary=$4 WHERE "employeeId"=$5 AND "companyId"=$6 AND status='active'`,
            [newBranchId, newDeptId, newJobTitle, newSalary, transfer.employeeId, scope.companyId]
          );
        },
        after: { branchId: newBranchId, departmentId: newDeptId, jobTitle: newJobTitle, salary: newSalary },
        notifications: empAssign ? [{
          assignmentId: empAssign.id,
          type: "transfer_decision", title: "تم اعتماد نقلك وتفعيله",
          body: notes || "تمت الموافقة على نقلك وتم تحديث بياناتك",
          priority: "high", refType: "employee_transfer", refId: id,
        }] : [],
      });
    } else {
      // Notify employee — previously silent if receiver declined, which
      // left the employee without feedback. Also notify the original HR
      // manager so they know the receiving branch declined.
      const [empAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
        [transfer.employeeId, scope.companyId]
      );
      await applyTransition({
        entity: "employee_transfers",
        id,
        scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
        action: "hr.transfer.rejected_by_receiver",
        fromStates: ["pending_receiving_manager"],
        toState: "rejected_by_receiver",
        reason: notes || undefined,
        setExtras: { receivedBy: scope.employeeId, receivedAt: { raw: "NOW()" } },
        notifications: empAssign ? [{
          assignmentId: empAssign.id,
          type: "transfer_decision", title: "رفض الفرع المستقبل طلب نقلك",
          body: notes || "رفض مدير الفرع المستقبل استقبالك. راجع الموارد البشرية.",
          priority: "high", refType: "employee_transfer", refId: id,
        }] : [],
      });
    }

    const [row] = await rawQuery<any>(`SELECT * FROM employee_transfers WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "employee_transfers", entityId: id,
      after: { status: row?.status, confirmed, notes: notes ?? null },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Receive transfer error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL DEVELOPMENT PLANS (IDP) — خطة التطوير الفردي
// ─────────────────────────────────────────────────────────────────────────────

router.get("/idp", authorize({ feature: "hr.exit", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.query as any;
    const conditions = [`idp."companyId"=$1`, `idp."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (employeeId) { params.push(Number(employeeId)); conditions.push(`idp."employeeId"=$${params.length}`); }
    else if (scope.role === "employee" && scope.employeeId) {
      params.push(scope.employeeId); conditions.push(`idp."employeeId"=$${params.length}`);
    }
    const rows = await rawQuery<any>(
      `SELECT idp.*, e.name AS "employeeName", e."empNumber"
       FROM employee_development_plans idp
       JOIN employees e ON e.id=idp."employeeId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY idp."createdAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "IDP list error:"); }
});

router.post("/idp", authorize({ feature: "hr.exit", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(idpSchema.safeParse(req.body)) as any;
    const goals = Array.isArray(b.goals) ? JSON.stringify(b.goals) : (b.goals || '[]');
    const skills = Array.isArray(b.skills) ? JSON.stringify(b.skills) : (b.skills || '[]');
    const trainingIds = Array.isArray(b.trainingIds) ? JSON.stringify(b.trainingIds) : (b.trainingIds || '[]');
    const { insertId } = await rawExecute(
      `INSERT INTO employee_development_plans
       ("companyId","employeeId","createdBy",title,goals,skills,"trainingIds","targetDate",status,notes,"reviewDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'planned',$9,$10)`,
      [scope.companyId, b.employeeId, scope.employeeId, b.title || 'خطة التطوير الفردي',
       goals, skills, trainingIds, b.targetDate || null, b.notes || null, b.reviewDate || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM employee_development_plans WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employee_development_plans", entityId: insertId,
      after: { employeeId: b.employeeId, title: b.title || "خطة التطوير الفردي", status: "planned" },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "idp.created", entity: "hr_individual_development_plans", entityId: insertId, details: JSON.stringify({ employeeId: b.employeeId, title: b.title || "خطة التطوير الفردي" }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create IDP error:"); }
});

router.patch("/idp/:id", authorize({ feature: "hr.exit", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(idpPatchSchema.safeParse(req.body ?? {}));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.goals !== undefined) { params.push(Array.isArray(b.goals) ? JSON.stringify(b.goals) : b.goals); sets.push(`goals=$${params.length}`); }
    if (b.skills !== undefined) { params.push(Array.isArray(b.skills) ? JSON.stringify(b.skills) : b.skills); sets.push(`skills=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.targetDate !== undefined) { params.push(b.targetDate || null); sets.push(`"targetDate"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.progress !== undefined) { params.push(b.progress); sets.push(`progress=$${params.length}`); }
    if (sets.length === 1) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM employee_development_plans WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const rows = await rawQuery<any>(
      `UPDATE employee_development_plans SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("خطة التطوير غير موجودة");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "employee_development_plans", entityId: id,
      before: beforeRow ?? {},
      after: rows[0],
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "idp.updated", entity: "hr_individual_development_plans", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update IDP error:"); }
});

router.delete("/idp/:id", authorize({ feature: "hr.exit", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [beforeRow] = await rawQuery<any>(`SELECT * FROM employee_development_plans WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const { affectedRows } = await rawExecute(`UPDATE employee_development_plans SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "employee_development_plans", entityId: id,
      before: beforeRow ?? { id },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "idp.deleted", entity: "hr_individual_development_plans", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "hr background task failed"));
    res.json({ message: "تم حذف خطة التطوير" });
  } catch (err) { handleRouteError(err, res, "Delete IDP error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// END OF SERVICE GRATUITY — مكافأة نهاية الخدمة
// ─────────────────────────────────────────────────────────────────────────────

router.get("/gratuity/:employeeId", authorize({ feature: "hr.exit", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const { terminationType, terminationDate } = req.query as any;

    const [assignment] = await rawQuery<any>(
      `SELECT ea.salary, ea."hireDate" AS "startDate", ea."jobTitle",
              ec."startDate" AS "contractStart", ec."endDate" AS "contractEnd",
              e.name AS "employeeName"
       FROM employee_assignments ea
       JOIN employees e ON e.id=ea."employeeId"
       LEFT JOIN employee_contracts ec ON ec."employeeId"=ea."employeeId" AND ec."companyId"=$1 AND ec.status='active'
       WHERE ea."employeeId"=$2 AND ea."companyId"=$1 AND ea.status='active' LIMIT 1`,
      [scope.companyId, employeeId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");

    const startDate = new Date(assignment.contractStart || assignment.startDate);
    const endDate = terminationDate ? new Date(terminationDate) : new Date();
    const yearsOfService = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
    const monthlySalary = Number(assignment.salary) || 0;

    // Saudi Labor Law calculation
    // First 5 years: half month per year
    // Above 5 years: one month per year
    let gratuity = 0;
    if (yearsOfService < 1) {
      gratuity = 0; // Less than 1 year = no gratuity
    } else if (yearsOfService <= 5) {
      gratuity = (monthlySalary / 2) * Math.min(yearsOfService, 5);
    } else {
      gratuity = (monthlySalary / 2) * 5 + monthlySalary * (yearsOfService - 5);
    }

    // Resignation reduction factors
    let reductionFactor = 1;
    const type = terminationType || 'end_of_service';
    if (type === 'resignation') {
      if (yearsOfService >= 2 && yearsOfService < 5) reductionFactor = 1/3;
      else if (yearsOfService >= 5 && yearsOfService < 10) reductionFactor = 2/3;
      else if (yearsOfService >= 10) reductionFactor = 1;
      else reductionFactor = 0; // Less than 2 years = no gratuity for resignation
    }

    const finalGratuity = roundTo2(gratuity * reductionFactor);

    res.json({
      employeeName: assignment.employeeName,
      jobTitle: assignment.jobTitle,
      monthlySalary,
      startDate: toDateISO(startDate),
      endDate: toDateISO(endDate),
      yearsOfService: roundTo2(yearsOfService),
      terminationType: type,
      gratuityBeforeReduction: roundTo2(gratuity),
      reductionFactor,
      finalGratuity,
      breakdown: {
        first5Years: Math.min(yearsOfService, 5) > 0 ? roundTo2((monthlySalary / 2) * Math.min(yearsOfService, 5)) : 0,
        above5Years: yearsOfService > 5 ? roundTo2(monthlySalary * (yearsOfService - 5)) : 0,
      },
    });
  } catch (err) { handleRouteError(err, res, "Gratuity calculation error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY HR ACCRUALS — إقفالات شهرية: إجازات + مكافأة نهاية الخدمة
// Posts two liabilities to GL each month: accrued leave days (at current
// daily rate) and accrued EOS gratuity (1/24 of salary for first 5 years,
// then 1/12 afterwards). Idempotent per period via the JE ref check.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/accruals/monthly", authorize({ feature: "hr.payroll", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = zodParse(monthlyAccrualsSchema.safeParse(req.body ?? {}));
    const targetPeriod = period || currentPeriod();

    if (!/^\d{4}-\d{2}$/.test(targetPeriod)) {
      throw new ValidationError("صيغة الفترة غير صحيحة (YYYY-MM)", { field: "period" });
    }

    const accrualDate = `${targetPeriod}-01`;
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, accrualDate);
    if (!periodCheck.open) {
      throw new ValidationError(
        `لا يمكن تسجيل استحقاقات في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "period", meta: { periodName: periodCheck.periodName } },
      );
    }

    const ref = `HR-ACCRUAL-${targetPeriod}`;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );
    if (existing) {
      throw new ConflictError("تم تسجيل استحقاقات هذه الفترة مسبقاً", {
        meta: { journalId: existing.id, period: targetPeriod },
      });
    }

    const employees = await rawQuery<any>(
      `SELECT ea."employeeId", ea.salary, ea."hireDate",
              COALESCE(ec."startDate", ea."hireDate") AS "contractStart"
       FROM employee_assignments ea
       LEFT JOIN employee_contracts ec ON ec."employeeId"=ea."employeeId"
                                      AND ec."companyId"=$1 AND ec.status='active'
       WHERE ea."companyId"=$1 AND ea.status='active' AND ea.salary > 0`,
      [scope.companyId]
    );

    if (employees.length === 0) {
      throw new ValidationError("لا يوجد موظفون نشطون لاحتساب الاستحقاقات");
    }

    const periodEnd = new Date(`${targetPeriod}-28`);
    let totalLeaveAccrual = 0;
    let totalEosAccrual = 0;
    const breakdown: any[] = [];
    const DEFAULT_ANNUAL_LEAVE_DAYS = 21;

    for (const emp of employees) {
      const salary = Number(emp.salary) || 0;
      if (salary <= 0) continue;

      const dailyRate = salary / 30;
      const monthlyLeaveDays = DEFAULT_ANNUAL_LEAVE_DAYS / 12;
      const leaveAccrual = roundTo2(dailyRate * monthlyLeaveDays);

      const startDate = new Date(emp.contractStart || emp.startDate);
      const yearsOfService = (periodEnd.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
      let monthlyEosAccrual = 0;
      if (yearsOfService < 1) {
        monthlyEosAccrual = salary / 24;
      } else if (yearsOfService <= 5) {
        monthlyEosAccrual = salary / 24;
      } else {
        monthlyEosAccrual = salary / 12;
      }
      monthlyEosAccrual = roundTo2(monthlyEosAccrual);

      totalLeaveAccrual += leaveAccrual;
      totalEosAccrual += monthlyEosAccrual;
      breakdown.push({
        employeeId: emp.employeeId,
        salary,
        leaveAccrual,
        eosAccrual: monthlyEosAccrual,
      });
    }

    totalLeaveAccrual = roundTo2(totalLeaveAccrual);
    totalEosAccrual = roundTo2(totalEosAccrual);

    if (totalLeaveAccrual <= 0 && totalEosAccrual <= 0) {
      throw new ValidationError("لا توجد مبالغ استحقاق لاحتسابها");
    }

    let journalId: number | null = null;
    try {
      const { hrEngine } = await import("../lib/engines/index.js");
      const glResult = await hrEngine.postMonthlyAccrualsGL(
        { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId },
        { ref, period: targetPeriod, totalLeaveAccrual, totalEosAccrual, employeeCount: employees.length }
      );
      journalId = glResult.journalId;
    } catch (journalErr) {
      throw new IntegrationError("فشل تسجيل قيد الاستحقاقات", {
        meta: { integration: "journal", period: targetPeriod },
        cause: journalErr,
      });
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "hr.accruals.posted",
      entity: "journal_entries",
      entityId: journalId ?? 0,
      details: JSON.stringify({ period: targetPeriod, totalLeaveAccrual, totalEosAccrual, employeeCount: employees.length }),
    }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "journal_entries", entityId: journalId ?? 0,
      after: { period: targetPeriod, totalLeaveAccrual, totalEosAccrual, employeeCount: employees.length, ref },
    }).catch((e) => logger.error(e, "hr background task failed"));

    res.status(201).json({
      journalId,
      ref,
      period: targetPeriod,
      totalLeaveAccrual,
      totalEosAccrual,
      employeeCount: employees.length,
      breakdown,
    });
  } catch (err) {
    handleRouteError(err, res, "HR accruals error:");
  }
});

// Preview accruals without posting
router.get("/accruals/preview", authorize({ feature: "hr.payroll", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const period = (req.query.period as string) || currentPeriod();

    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("صيغة الفترة غير صحيحة (YYYY-MM)", { field: "period" });
    }

    const ref = `HR-ACCRUAL-${period}`;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );

    const employees = await rawQuery<any>(
      `SELECT ea."employeeId", e.name AS "employeeName", ea.salary, ea."hireDate" AS "startDate",
              COALESCE(ec."startDate", ea."hireDate") AS "contractStart"
       FROM employee_assignments ea
       JOIN employees e ON e.id=ea."employeeId"
       LEFT JOIN employee_contracts ec ON ec."employeeId"=ea."employeeId"
                                      AND ec."companyId"=$1 AND ec.status='active'
       WHERE ea."companyId"=$1 AND ea.status='active' AND ea.salary > 0
       ORDER BY e.name`,
      [scope.companyId]
    );

    const periodEnd = new Date(`${period}-28`);
    const DEFAULT_ANNUAL_LEAVE_DAYS = 21;
    let totalLeaveAccrual = 0;
    let totalEosAccrual = 0;
    const rows = employees.map((emp: any) => {
      const salary = Number(emp.salary) || 0;
      const dailyRate = salary / 30;
      const monthlyLeaveDays = DEFAULT_ANNUAL_LEAVE_DAYS / 12;
      const leaveAccrual = roundTo2(dailyRate * monthlyLeaveDays);
      const startDate = new Date(emp.contractStart || emp.startDate);
      const yearsOfService = (periodEnd.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
      const monthlyEosAccrual = roundTo2(
        (yearsOfService > 5 ? salary / 12 : salary / 24));
      totalLeaveAccrual += leaveAccrual;
      totalEosAccrual += monthlyEosAccrual;
      return {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        salary,
        yearsOfService: roundTo2(yearsOfService),
        leaveAccrual,
        eosAccrual: monthlyEosAccrual,
      };
    });

    res.json({
      period,
      alreadyPosted: !!existing,
      existingJournalId: existing?.id ?? null,
      employeeCount: employees.length,
      totalLeaveAccrual: roundTo2(totalLeaveAccrual),
      totalEosAccrual: roundTo2(totalEosAccrual),
      total: roundTo2(totalLeaveAccrual + totalEosAccrual),
      rows,
    });
  } catch (err) {
    handleRouteError(err, res, "HR accruals preview error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TURNOVER REPORT — تقرير دوران الموظفين
// ─────────────────────────────────────────────────────────────────────────────

router.get("/turnover-report", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { year } = req.query as any;
    const targetYear = year ? Number(year) : currentYear();

    const [[totalActive], terminated] = await Promise.all([
      rawQuery<any>(
        `SELECT COUNT(DISTINCT "employeeId") AS count FROM employee_assignments
         WHERE "companyId"=$1 AND status='active'`,
        [scope.companyId]
      ),
      rawQuery<any>(
        `SELECT ec."terminationReason" AS "terminationType", ec."terminatedAt" AS "terminationDate",
                e.name AS "employeeName", ea."departmentId", ea."branchId",
                d.name AS "deptName", b.name AS "branchName",
                EXTRACT(MONTH FROM ec."terminatedAt") AS month
         FROM employee_contracts ec
         JOIN employees e ON e.id=ec."employeeId"
         LEFT JOIN employee_assignments ea ON ea."employeeId"=ec."employeeId" AND ea."companyId"=$1
         LEFT JOIN departments d ON d.id=ea."departmentId"
         LEFT JOIN branches b ON b.id=ea."branchId"
         WHERE ec."companyId"=$1 AND ec."terminatedAt" IS NOT NULL
           AND ec."deletedAt" IS NULL
           AND EXTRACT(YEAR FROM ec."terminatedAt")=$2`,
        [scope.companyId, targetYear]
      ),
    ]);

    const totalTerminated = terminated.length;
    const totalActiveCount = Number(totalActive?.count || 0);
    const avgHeadcount = Math.max(1, totalActiveCount + totalTerminated);
    const turnoverRate = roundTo2((totalTerminated / avgHeadcount) * 100);

    // Breakdown by reason
    const byReason: Record<string, number> = {};
    terminated.forEach((t: any) => {
      const type = t.terminationType || 'unknown';
      byReason[type] = (byReason[type] || 0) + 1;
    });

    // Breakdown by department
    const byDept: Record<string, number> = {};
    terminated.forEach((t: any) => {
      const dept = t.deptName || 'غير محدد';
      byDept[dept] = (byDept[dept] || 0) + 1;
    });

    // Breakdown by branch
    const byBranch: Record<string, number> = {};
    terminated.forEach((t: any) => {
      const branch = t.branchName || 'غير محدد';
      byBranch[branch] = (byBranch[branch] || 0) + 1;
    });

    // Monthly breakdown
    const byMonth: Record<number, number> = {};
    for (let i = 1; i <= 12; i++) byMonth[i] = 0;
    terminated.forEach((t: any) => {
      const m = Number(t.month);
      if (m >= 1 && m <= 12) byMonth[m]++;
    });

    // Estimated cost per departure = 3 months average salary (recruitment + onboarding)
    const [avgSalary] = await rawQuery<any>(
      `SELECT COALESCE(AVG(salary), 0) AS avg FROM employee_assignments WHERE "companyId"=$1 AND status='active'`,
      [scope.companyId]
    );
    const estimatedCostPerDeparture = Number(avgSalary?.avg || 0) * 3;
    const totalEstimatedCost = estimatedCostPerDeparture * totalTerminated;

    res.json({
      year: targetYear,
      totalTerminated,
      totalActive: totalActiveCount,
      turnoverRate,
      byReason: Object.entries(byReason).map(([reason, count]) => ({ reason, count })),
      byDepartment: Object.entries(byDept).map(([dept, count]) => ({ dept, count })),
      byBranch: Object.entries(byBranch).map(([branch, count]) => ({ branch, count })),
      byMonth: Object.entries(byMonth).map(([month, count]) => ({ month: Number(month), count })),
      estimatedCostPerDeparture: Math.round(estimatedCostPerDeparture),
      totalEstimatedCost: Math.round(totalEstimatedCost),
      recentTerminations: terminated.slice(0, 20),
    });
  } catch (err) { handleRouteError(err, res, "Turnover report error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPIRING DOCUMENTS — وثائق على وشك الانتهاء
// ─────────────────────────────────────────────────────────────────────────────

router.get("/expiring-documents", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days) || 90;

    const workPermits = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName", e."workPermitExpiry" AS "expiryDate",
              'work_permit' AS "docType", 'تصريح العمل' AS "docLabel",
              (e."workPermitExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e."deletedAt" IS NULL
         AND e."workPermitExpiry" IS NOT NULL
         AND e."workPermitExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    const iqamas = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName", e."iqamaExpiry" AS "expiryDate",
              'iqama' AS "docType", 'الإقامة' AS "docLabel",
              (e."iqamaExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e."deletedAt" IS NULL
         AND e."iqamaExpiry" IS NOT NULL
         AND e."iqamaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    const passports = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName", e."passportExpiry" AS "expiryDate",
              'passport' AS "docType", 'جواز السفر' AS "docLabel",
              (e."passportExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e."deletedAt" IS NULL
         AND e."passportExpiry" IS NOT NULL
         AND e."passportExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    const contracts = await rawQuery<any>(
      `SELECT ec."employeeId", e.name AS "employeeName", ec."endDate" AS "expiryDate",
              'contract' AS "docType", 'العقد' AS "docLabel",
              (ec."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM employee_contracts ec
       JOIN employees e ON e.id=ec."employeeId"
       WHERE ec."companyId"=$1 AND ec.status='active'
         AND ec."deletedAt" IS NULL
         AND ec."endDate" IS NOT NULL
         AND ec."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    // Driver licenses
    const driverLicenses = await rawQuery<any>(
      `SELECT fd.id AS "entityId", fd.name AS "entityName", fd."licenseExpiry" AS "expiryDate",
              'driving_license' AS "docType", 'رخصة القيادة' AS "docLabel",
              (fd."licenseExpiry"::date - CURRENT_DATE) AS "daysLeft",
              'driver' AS "entityType"
       FROM fleet_drivers fd
       WHERE fd."companyId"=$1 AND fd.status='active'
         AND fd."deletedAt" IS NULL
         AND fd."licenseExpiry" IS NOT NULL
         AND fd."licenseExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    // Vehicle registration expiry
    const vehicleRegistrations = await rawQuery<any>(
      `SELECT fv.id AS "entityId", CONCAT(fv.make,' ',fv.model,' - ',fv."plateNumber") AS "entityName",
              fv."registrationExpiry" AS "expiryDate",
              'vehicle_registration' AS "docType", 'رخصة السير' AS "docLabel",
              (fv."registrationExpiry"::date - CURRENT_DATE) AS "daysLeft",
              'vehicle' AS "entityType"
       FROM fleet_vehicles fv
       WHERE fv."companyId"=$1 AND fv.status != 'scrapped' AND fv."deletedAt" IS NULL
         AND fv."registrationExpiry" IS NOT NULL
         AND fv."registrationExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    // Vehicle insurance expiry
    const vehicleInsurance = await rawQuery<any>(
      `SELECT fv.id AS "entityId", CONCAT(fv.make,' ',fv.model,' - ',fv."plateNumber") AS "entityName",
              fv."insuranceExpiry" AS "expiryDate",
              'vehicle_insurance' AS "docType", 'تأمين المركبة' AS "docLabel",
              (fv."insuranceExpiry"::date - CURRENT_DATE) AS "daysLeft",
              'vehicle' AS "entityType"
       FROM fleet_vehicles fv
       WHERE fv."companyId"=$1 AND fv.status != 'scrapped' AND fv."deletedAt" IS NULL
         AND fv."insuranceExpiry" IS NOT NULL
         AND fv."insuranceExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    // Vehicle inspection expiry
    const vehicleInspections = await rawQuery<any>(
      `SELECT fv.id AS "entityId", CONCAT(fv.make,' ',fv.model,' - ',fv."plateNumber") AS "entityName",
              fv."nextInspectionDate" AS "expiryDate",
              'vehicle_inspection' AS "docType", 'الفحص الدوري' AS "docLabel",
              (fv."nextInspectionDate"::date - CURRENT_DATE) AS "daysLeft",
              'vehicle' AS "entityType"
       FROM fleet_vehicles fv
       WHERE fv."companyId"=$1 AND fv.status != 'scrapped' AND fv."deletedAt" IS NULL
         AND fv."nextInspectionDate" IS NOT NULL
         AND fv."nextInspectionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    // Employee documents (iqama, work permit, driving license, etc.) from employee_documents table
    const employeeDocs = await rawQuery<any>(
      `SELECT ed."employeeId" AS "entityId", e.name AS "entityName", ed."expiryDate",
              ed.type AS "docType", ed.name AS "docLabel",
              (ed."expiryDate"::date - CURRENT_DATE) AS "daysLeft",
              'employee' AS "entityType"
       FROM employee_documents ed
       JOIN employees e ON e.id=ed."employeeId"
       WHERE ed."companyId"=$1 AND ed.status='valid'
         AND ed."expiryDate" IS NOT NULL
         AND ed."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; });

    // Company documents (commercial registration, chamber of commerce, etc.)
    const companyDocs = await rawQuery<any>(
      `SELECT cd.id AS "entityId", cd.title AS "entityName", cd."expiryDate",
              cd.type AS "docType", cd.title AS "docLabel",
              (cd."expiryDate"::date - CURRENT_DATE) AS "daysLeft",
              'company' AS "entityType"
       FROM company_documents cd
       WHERE cd."companyId"=$1 AND cd.status='active'
         AND cd."expiryDate" IS NOT NULL
         AND cd."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; });

    const all = [
      ...workPermits.map((d: any) => ({ ...d, entityType: 'employee' })),
      ...iqamas.map((d: any) => ({ ...d, entityType: 'employee' })),
      ...passports.map((d: any) => ({ ...d, entityType: 'employee' })),
      ...contracts.map((d: any) => ({ ...d, entityType: 'employee' })),
      ...driverLicenses,
      ...vehicleRegistrations,
      ...vehicleInsurance,
      ...vehicleInspections,
      ...employeeDocs,
      ...companyDocs,
    ].sort((a: any, b: any) => Number(a.daysLeft) - Number(b.daysLeft));

    res.json({ data: all, total: all.length, criticalCount: all.filter((d: any) => Number(d.daysLeft) <= 14).length });
  } catch (err) { handleRouteError(err, res, "Expiring documents error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY DOCUMENTS — وثائق المنشأة (سجل تجاري، رخصة بلدية، غرفة تجارية)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/company-documents", authorize({ feature: "hr.organization", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { page = "1", limit: lim = "50" } = req.query as any;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;

    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM company_documents WHERE "companyId"=$1 AND status != 'deleted'`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "hr query failed"); return [{ total: 0 }] as any[]; });
    const rows = await rawQuery<any>(
      `SELECT * FROM company_documents WHERE "companyId"=$1 AND status != 'deleted' ORDER BY "expiryDate" ASC NULLS LAST LIMIT $2 OFFSET $3`,
      [scope.companyId, perPage, offset]
    ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; });
    res.json({ data: rows, total: Number(countRow.total), page: pageNum, pageSize: perPage });
  } catch (err) { handleRouteError(err, res, "Company documents error:"); }
});

router.post("/company-documents", authorize({ feature: "hr.organization", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(companyDocumentSchema.safeParse(req.body)) as any;

    const { insertId } = await rawExecute(
      `INSERT INTO company_documents ("companyId",title,type,"expiryDate",notes)
       VALUES ($1,$2,$3,$4,$5)`,
      [scope.companyId, b.documentType || b.title, b.documentNumber || b.type || null,
       b.expiryDate || null, b.notes || null]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "company_document.created", entity: "hr_company_documents", entityId: insertId, details: JSON.stringify({ documentType: b.documentType }) }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "company_documents", entityId: insertId,
      after: { documentType: b.documentType, documentNumber: b.documentNumber, expiryDate: b.expiryDate },
    }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM company_documents WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, message: "تم إضافة وثيقة المنشأة" });
  } catch (err) { handleRouteError(err, res, "Company documents error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE DOCUMENTS — وثائق الموظف الإضافية (رخصة قيادة، شهادات، إلخ)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/employee-documents", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, page = "1", limit: lim = "50" } = req.query as any;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;

    let paramIdx = 1;
    const params: any[] = [scope.companyId];
    paramIdx++;
    const conditions: string[] = [`ed."companyId"=$1`, `ed.status != 'deleted'`];
    if (employeeId) {
      conditions.push(`ed."employeeId"=$${paramIdx}`);
      params.push(Number(employeeId) || 0);
      paramIdx++;
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const countParams = [...params];
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM employee_documents ed ${where}`,
      countParams
    ).catch((e) => { logger.error(e, "hr query failed"); return [{ total: 0 }] as any[]; });

    params.push(perPage);
    const limitParam = paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx++;

    const rows = await rawQuery<any>(
      `SELECT ed.*, e.name AS "employeeName"
       FROM employee_documents ed
       JOIN employees e ON e.id=ed."employeeId"
       ${where}
       ORDER BY ed."expiryDate" ASC NULLS LAST
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    ).catch((e) => { logger.error(e, "hr query failed"); return [] as any[]; });
    res.json({ data: rows, total: Number(countRow.total), page: pageNum, pageSize: perPage });
  } catch (err) { handleRouteError(err, res, "Employee documents error:"); }
});

router.post("/employee-documents", authorize({ feature: "hr.employees", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(employeeDocumentSchema.safeParse(req.body)) as any;

    const { insertId } = await rawExecute(
      `INSERT INTO employee_documents ("companyId","employeeId",type,name,number,"issueDate","expiryDate",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, Number(b.employeeId), b.documentType || b.type, b.documentType || b.name || '',
       b.documentNumber || b.number || null, b.issueDate || null,
       b.expiryDate || null, b.notes || null]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "employee_document.created", entity: "hr_employee_documents", entityId: insertId, details: JSON.stringify({ employeeId: Number(b.employeeId), documentType: b.documentType }) }).catch((e) => logger.error(e, "hr background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "employee_documents", entityId: insertId,
      after: { employeeId: Number(b.employeeId), documentType: b.documentType, documentNumber: b.documentNumber, expiryDate: b.expiryDate },
    }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM employee_documents WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, message: "تم إضافة وثيقة الموظف" });
  } catch (err) { handleRouteError(err, res, "Employee documents error:"); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Excuse Requests (استئذان خروج مبكر / تأخر)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/excuse-requests", authorize({ feature: "hr.attendance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, month } = req.query as any;
    const targetMonth = month || currentPeriod();
    let where = `e."companyId" = $1 AND TO_CHAR(e."excuseDate", 'YYYY-MM') = $2`;
    const params: any[] = [scope.companyId, targetMonth];
    if (status) {
      params.push(status);
      where += ` AND e.status = $${params.length}`;
    }
    const rows = await rawQuery<any>(
      `SELECT e.*, emp.name AS "employeeName", emp."empNumber"
       FROM hr_excuse_requests e
       JOIN employee_assignments ea ON ea.id = e."assignmentId"
       JOIN employees emp ON emp.id = ea."employeeId"
       WHERE ${where}
       ORDER BY e."excuseDate" DESC, e."createdAt" DESC LIMIT 500`,
      params
    );
    const pending = rows.filter((r: any) => r.status === "pending").length;
    res.json({ data: rows, total: rows.length, pending });
  } catch (err) { handleRouteError(err, res, "List excuse requests error:"); }
});

router.get("/excuse-requests/:id", authorize({ feature: "hr.attendance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT e.*, e."excuseDate" AS date, e."estimatedMinutes" AS duration,
              emp.name AS "employeeName", emp."empNumber"
       FROM hr_excuse_requests e
       JOIN employee_assignments ea ON ea.id = e."assignmentId"
       JOIN employees emp ON emp.id = ea."employeeId"
       WHERE e.id = $1 AND ea."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("طلب الاستئذان غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get excuse request detail error:"); }
});

router.post("/excuse-requests", authorize({ feature: "hr.attendance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { assignmentId, excuseDate, excuseType, startTime, endTime, estimatedMinutes, reason } = zodParse(excuseRequestSchema.safeParse(req.body));

    const effectiveAssignmentId = assignmentId || scope.activeAssignmentId;
    const [assignment] = await rawQuery<any>(
      `SELECT ea.id, ea."employeeId", ea."companyId", ea."branchId"
       FROM employee_assignments ea WHERE ea.id = $1 AND ea."companyId" = $2 AND ea.status = 'active'`,
      [effectiveAssignmentId, scope.companyId]
    );
    if (!assignment) throw new ValidationError("التعيين غير موجود أو غير نشط", { field: "assignmentId" });

    const [existing] = await rawQuery<any>(
      `SELECT id FROM hr_excuse_requests
       WHERE "assignmentId" = $1 AND "excuseDate" = $2 AND status != 'rejected'`,
      [effectiveAssignmentId, excuseDate]
    );
    if (existing) throw new ConflictError("يوجد طلب استئذان مسجل لنفس اليوم");

    const { insertId } = await rawExecute(
      `INSERT INTO hr_excuse_requests ("companyId","branchId","assignmentId","employeeId","excuseDate","excuseType","startTime","endTime","estimatedMinutes",reason,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING id`,
      [scope.companyId, assignment.branchId, effectiveAssignmentId, assignment.employeeId,
       excuseDate, excuseType || "early_leave", startTime || null, endTime || null,
       estimatedMinutes || 0, reason || null]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: assignment.branchId, userId: scope.userId,
      action: "create", entity: "hr_excuse_requests", entityId: insertId,
      after: { excuseDate, excuseType, estimatedMinutes },
    }).catch((e) => logger.error(e, "hr background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: assignment.branchId, userId: scope.userId, action: "excuse.created", entity: "hr_excuse_requests", entityId: insertId, details: JSON.stringify({ excuseDate, excuseType }) }).catch((e) => logger.error(e, "hr background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM hr_excuse_requests WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, message: "تم تقديم طلب الاستئذان بنجاح" });
  } catch (err) { handleRouteError(err, res, "Create excuse request error:"); }
});

router.patch("/excuse-requests/:id/approve", authorize({ feature: "hr.attendance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const excuseId = parseId(req.params.id, "id");
    const { approved, rejectionReason } = zodParse(excuseApprovalSchema.safeParse(req.body ?? {}));

    const newStatus = approved ? "approved" : "rejected";
    if (!approved && !rejectionReason) {
      throw new ValidationError("يجب ذكر سبب الرفض", { field: "rejectionReason" });
    }

    const [excuse] = await rawQuery<any>(
      `SELECT * FROM hr_excuse_requests WHERE id = $1 AND "companyId" = $2`,
      [excuseId, scope.companyId]
    );
    if (!excuse) throw new NotFoundError("طلب الاستئذان غير موجود");

    const row = await applyTransition({
      entity: "hr_excuse_requests",
      id: excuseId,
      scope,
      action: `excuse.${newStatus}`,
      fromStates: ["pending"],
      toState: newStatus,
      reason: rejectionReason || undefined,
      setExtras: {
        approvedBy: scope.activeAssignmentId ?? 0,
        approvedAt: { raw: "NOW()" },
        rejectionReason: rejectionReason || null,
      },
      after: { status: newStatus },
      notifications: [{
        assignmentId: excuse.assignmentId,
        type: `excuse_${newStatus}`,
        title: approved ? "تمت الموافقة على الاستئذان" : "تم رفض طلب الاستئذان",
        body: approved ? `تمت الموافقة على استئذانك بتاريخ ${excuse.excuseDate}` : `تم رفض استئذانك: ${rejectionReason}`,
        priority: "normal",
        refType: "hr_excuse_request",
        refId: excuseId,
      }],
    });

    res.json({ message: approved ? "تمت الموافقة على الاستئذان" : "تم رفض الاستئذان", status: newStatus });
  } catch (err) {
    if (err instanceof LifecycleError) {
      const typed = err.status === 404
        ? new NotFoundError(err.message)
        : new ConflictError(err.message, { field: err.field });
      return handleRouteError(typed, res, "Approve excuse request error:");
    }
    handleRouteError(err, res, "Approve excuse request error:");
  }
});

export default router;
