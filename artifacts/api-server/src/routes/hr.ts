import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission, requireAnyPermission } from "../middlewares/permissionMiddleware.js";
import rateLimit from "express-rate-limit";
import {
  haversineDistance,
  createNotification,
  emitEvent,
  createAuditLog,
  getManagerAssignmentId,
  initiateApprovalChain,
  processApprovalStep,
  createJournalEntry,
  getAccountCodeFromMapping,
  checkFinancialPeriodOpen,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { registerObligation, cancelObligation } from "../lib/obligationsEngine.js";
import {
  computeLeaveImpact,
  computeTerminationImpact,
  computeViolationImpact,
} from "../lib/impactPreview.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { ensureInquiryMemoForViolation } from "../lib/disciplineEngine.js";

const router = Router();
router.use(authMiddleware);

const checkInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لمحاولات تسجيل الحضور. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE – check-in and dedicated check-out endpoints
// ─────────────────────────────────────────────────────────────────────────────

router.post("/check-in", checkInLimiter, requireAnyPermission("hr:self", "hr:create"), async (req, res) => {
  // Step 4 of the HR operational audit — attendance check-in.
  // Converts the two raw res.status(400) bailouts to ConflictError with
  // meta pointing at the blocking row, and guards against a missing
  // active assignment. The deep GPS + late + penalty logic is unchanged.
  try {
    const scope = req.scope!;
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const period = today.slice(0, 7);
    const { lat, lon, notes } = req.body as any;

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

    // ── Step 1: GPS + timestamp received ──

    // ── Step 2: Prevent duplicate check-in ──
    const [existing] = await rawQuery<any>(
      `SELECT id, "checkOut" FROM attendance
       WHERE "assignmentId" = $1 AND date = $2`,
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
       WHERE ea.id = $1`,
      [scope.activeAssignmentId]
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
         WHERE "companyId" = $1 AND status = 'active'
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
         AND "startDate" <= $2 AND "endDate" >= $2`,
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
    const isRemoteShift = shift?.remoteAllowed === true || shift?.shiftType === 'remote';
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
        haversineDistance(Number(lat), Number(lon), Number(assignment.branchLat), Number(assignment.branchLon))
      );
      isOutOfRange = distanceMeters > gpsRadius;
    }

    if (isOutOfRange) {
      await rawExecute(
        `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
         VALUES ($1,$2,'gps_out_of_range',$3,'low',0,$4)`,
        [scope.companyId, scope.activeAssignmentId, `تسجيل حضور خارج نطاق الفرع بمسافة ${distanceMeters}م`, period]
      );
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
      deductionAmount = Math.round(minuteRate * lateMinutes * 100) / 100;
    }

    const { insertId: attendanceId } = await rawExecute(
      `INSERT INTO attendance ("assignmentId","companyId","branchId",date,"checkIn","lateMinutes",status,notes,"checkInLat","checkInLon")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.activeAssignmentId, scope.companyId, assignment?.branchId ?? scope.branchId,
        today, now.toISOString(), lateMinutes, checkInStatus, notes ?? null,
        lat !== undefined && lat !== null ? Number(lat) : null, lon !== undefined && lon !== null ? Number(lon) : null]
    );

    // ── Step 11: Auto violation if late > threshold ──
    let violationId: number | null = null;
    if (exceedsThreshold) {
      const { insertId: vId } = await rawExecute(
        `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
         VALUES ($1,$2,'late_arrival',$3,'medium',$4,$5)`,
        [scope.companyId, scope.activeAssignmentId, `تأخر ${lateMinutes} دقيقة عن وقت البداية (تجاوز الحد ${lateThreshold} دقيقة)`, deductionAmount, period]
      );
      violationId = vId;

      // ── Step 12: Record pending payroll deduction ──
      await rawExecute(
        `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
         VALUES ($1,$2,$3,'late',$4,$5,$6,'pending_payroll')`,
        [scope.companyId, scope.activeAssignmentId, attendanceId, lateMinutes, deductionAmount, period]
      );

      // ── Step 12b: Auto-create an inquiry memo (محضر استفسار) for the lateness ──
      // يخضع لسياسة اللائحة الحية — idempotent، لا يُنشئ محضراً جديداً إن كان موجوداً
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
      }).catch((err) => console.error("ensureInquiryMemoForViolation (check-in) error:", err));
    }

    // ── Step 13: Count monthly violations for penalty escalation ──
    let penaltyLevel = 0;
    let penaltyLabel = "";
    let penaltyDeduction = 0;
    if (exceedsThreshold) {
      const [monthCount] = await rawQuery<any>(
        `SELECT COUNT(*) AS cnt FROM employee_violations
         WHERE "assignmentId" = $1 AND period = $2 AND type = 'late_arrival' AND "deletedAt" IS NULL`,
        [scope.activeAssignmentId, period]
      );
      const count = Number(monthCount?.cnt ?? 1);

      // ── Step 14: 5-level penalty escalation ──
      if (count >= 10) {
        penaltyLevel = 5;
        penaltyDeduction = Number(policy?.penaltyLevel5 ?? 500);
        penaltyLabel = policy?.penaltyLevel5Label ?? "خصم ثلاثة أيام + إنذار نهائي";
      } else if (count >= 7) {
        penaltyLevel = 4;
        penaltyDeduction = Number(policy?.penaltyLevel4 ?? 200);
        penaltyLabel = policy?.penaltyLevel4Label ?? "خصم يومين";
      } else if (count >= 5) {
        penaltyLevel = 3;
        penaltyDeduction = Number(policy?.penaltyLevel3 ?? 100);
        penaltyLabel = policy?.penaltyLevel3Label ?? "خصم يوم";
      } else if (count >= 3) {
        penaltyLevel = 2;
        penaltyDeduction = Number(policy?.penaltyLevel2 ?? 50);
        penaltyLabel = policy?.penaltyLevel2Label ?? "إنذار كتابي";
      } else {
        penaltyLevel = 1;
        penaltyDeduction = Number(policy?.penaltyLevel1 ?? 0);
        penaltyLabel = policy?.penaltyLevel1Label ?? "إنذار شفهي";
      }

      if (penaltyDeduction > 0) {
        await rawExecute(
          `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
           VALUES ($1,$2,$3,'penalty',0,$4,$5,'pending_payroll')`,
          [scope.companyId, scope.activeAssignmentId, attendanceId, penaltyDeduction, period]
        );
      }
    }

    // ── Step 15: Update monthly stats ──
    await rawExecute(
      `INSERT INTO employee_monthly_attendance ("companyId","assignmentId",period,"presentDays","lateDays","totalLateMinutes","totalDeduction")
       VALUES ($1,$2,$3,1,$4,$5,$6)
       ON CONFLICT ("assignmentId",period) DO UPDATE
       SET "presentDays" = employee_monthly_attendance."presentDays" + 1,
           "lateDays" = employee_monthly_attendance."lateDays" + $4,
           "totalLateMinutes" = employee_monthly_attendance."totalLateMinutes" + $5,
           "totalDeduction" = employee_monthly_attendance."totalDeduction" + $6`,
      [scope.companyId, scope.activeAssignmentId, period, isLate ? 1 : 0, lateMinutes, deductionAmount + penaltyDeduction]
    );

    // ── Step 16: Notify employee about late ──
    if (exceedsThreshold) {
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "late_warning", title: "تنبيه تأخر",
        body: `تم تسجيل تأخرك ${lateMinutes} دقيقة اليوم. ${penaltyLabel ? `العقوبة: ${penaltyLabel}` : ""}`,
        priority: "high", refType: "attendance", refId: attendanceId,
      }).catch(console.error);
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
          }).catch(console.error);
        }
      }).catch(console.error);
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "attendance.checkin", entity: "attendance", entityId: attendanceId,
      details: JSON.stringify({ lateMinutes, isLate, distanceMeters, isOutOfRange, penaltyLevel, penaltyLabel, isWorkDay }),
    }).catch(console.error);

    res.json({
      message: "تم تسجيل الحضور", lateMinutes, isLate,
      deductionAmount, distanceMeters, isOutOfRange, type: "checkin",
      penaltyLevel, penaltyLabel, penaltyDeduction, isWorkDay,
    });
  } catch (err) {
    handleRouteError(err, res, "Check-in error:");
  }
});

router.post("/check-out", requireAnyPermission("hr:self", "hr:create"), async (req, res) => {
  // Step 4 of the HR operational audit — attendance check-out.
  // Symmetric treatment to check-in: ConflictError when the caller is
  // trying to check out without having checked in, or when they've
  // already checked out. Assignment guard matches the check-in handler.
  try {
    const scope = req.scope!;
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const period = today.slice(0, 7);
    const { notes, lat, lon } = req.body as any;

    if (!scope.activeAssignmentId) {
      throw new ConflictError("لا يوجد تعيين نشط لهذا الحساب", {
        field: "assignmentId",
        fix: "تواصل مع مدير الموارد البشرية لتفعيل تعيينك الوظيفي.",
      });
    }

    const [existing] = await rawQuery<any>(
      `SELECT id, "checkIn", "checkOut" FROM attendance
       WHERE "assignmentId" = $1 AND date = $2`,
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

    // ── Fetch assignment for salary ──
    const [assignment] = await rawQuery<any>(
      `SELECT ea.salary, ea."branchId", ea."employeeId", b.lat AS "branchLat", b.lon AS "branchLon"
       FROM employee_assignments ea
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ea.id = $1`,
      [scope.activeAssignmentId]
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
         WHERE "companyId" = $1 AND status = 'active'
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
        haversineDistance(Number(lat), Number(lon), Number(assignment.branchLat), Number(assignment.branchLon))
      );
      isCheckOutOutOfRange = checkOutDistanceMeters > gpsRadius;
      if (isCheckOutOutOfRange) {
        await rawExecute(
          `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
           VALUES ($1,$2,'gps_out_of_range',$3,'low',0,$4)`,
          [scope.companyId, scope.activeAssignmentId,
            `تسجيل انصراف خارج نطاق الفرع بمسافة ${checkOutDistanceMeters}م`, period]
        );
      }
    }

    // ── Calculate worked time ──
    const checkInTime = new Date(existing.checkIn);
    const workedMs = now.getTime() - checkInTime.getTime();
    const workedHours = Math.round((workedMs / 3600000) * 100) / 100;

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

    // ── Update attendance record ──
    await rawExecute(
      `UPDATE attendance SET "checkOut" = $1, notes = COALESCE($2, notes), "checkOutLat" = $4, "checkOutLon" = $5, "overtimeMinutes" = $6 WHERE id = $3`,
      [now.toISOString(), notes ?? null, existing.id,
        lat !== undefined && lat !== null ? Number(lat) : null,
        lon !== undefined && lon !== null ? Number(lon) : null,
        overtimeMinutes]
    );

    // ── Update monthly stats ──
    await rawExecute(
      `INSERT INTO employee_monthly_attendance ("companyId","assignmentId",period,"overtimeMinutes")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("assignmentId",period) DO UPDATE
       SET "overtimeMinutes" = COALESCE(employee_monthly_attendance."overtimeMinutes", 0) + $4`,
      [scope.companyId, scope.activeAssignmentId, period, overtimeMinutes]
    );

    // ── Early departure violation ──
    if (earlyDepartureMinutes > 0) {
      const dailySalary = Number(assignment?.salary ?? 0) / 30;
      const minuteRate = dailySalary / 480;
      const earlyDeductionAmount = Math.round(minuteRate * earlyDepartureMinutes * 100) / 100;

      const { insertId: earlyViolationId } = await rawExecute(
        `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
         VALUES ($1,$2,'early_departure',$3,'medium',$4,$5)
         RETURNING id`,
        [scope.companyId, scope.activeAssignmentId,
          `خروج مبكر بمقدار ${earlyDepartureMinutes} دقيقة عن وقت نهاية الوردية`,
          earlyDeductionAmount, period]
      );

      if (earlyDeductionAmount > 0) {
        await rawExecute(
          `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
           VALUES ($1,$2,$3,'early_departure',$4,$5,$6,'pending_payroll')`,
          [scope.companyId, scope.activeAssignmentId, existing.id, earlyDepartureMinutes, earlyDeductionAmount, period]
        );
      }

      // ── Auto-create inquiry memo for early departure ──
      ensureInquiryMemoForViolation({
        companyId: scope.companyId,
        branchId: assignment?.branchId ?? scope.branchId,
        assignmentId: scope.activeAssignmentId,
        employeeId: scope.employeeId ?? assignment?.employeeId ?? 0,
        violationId: earlyViolationId,
        incidentType: "early_leave",
        incidentDate: today,
        incidentDurationMinutes: earlyDepartureMinutes,
        incidentDescription: `خروج مبكر بمقدار ${earlyDepartureMinutes} دقيقة عن وقت نهاية الوردية`,
        source: "auto",
        createdBy: scope.userId,
      }).catch((err) => console.error("ensureInquiryMemoForViolation (check-out) error:", err));

      // ── Notify employee about early departure ──
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "early_departure_warning", title: "تنبيه خروج مبكر",
        body: `تم تسجيل خروجك المبكر بمقدار ${earlyDepartureMinutes} دقيقة اليوم.`,
        priority: "high", refType: "attendance", refId: existing.id,
      }).catch(console.error);

      // ── Notify manager ──
      getManagerAssignmentId(scope.companyId, scope.branchId).then((managerAssignmentId) => {
        if (managerAssignmentId) {
          createNotification({
            companyId: scope.companyId, assignmentId: managerAssignmentId,
            type: "early_departure", title: "خروج مبكر لموظف",
            body: `غادر الموظف مبكراً بمقدار ${earlyDepartureMinutes} دقيقة اليوم ${today}`,
            priority: "high", refType: "attendance", refId: existing.id,
          }).catch(console.error);
        }
      }).catch(console.error);
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "attendance.checkout", entity: "attendance", entityId: existing.id,
      details: JSON.stringify({ workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, checkOutDistanceMeters }),
    }).catch(console.error);

    res.json({ message: "تم تسجيل الانصراف", workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, type: "checkout" });
  } catch (err) {
    handleRouteError(err, res, "Check-out error:");
  }
});

router.get("/attendance", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { month } = req.query as { month?: string };
    const monthStr = month ?? new Date().toISOString().slice(0, 7);

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
       ORDER BY a.date DESC`,
      params
    );

    res.json({ data: records, total: records.length, page: 1, pageSize: records.length });
  } catch (err) {
    handleRouteError(err, res, "Get attendance error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE TYPES & BALANCES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/leave-types", requirePermission("hr:read"), async (req, res) => {
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

router.get("/leave-balance", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const year = new Date().getFullYear();
    const balancesFromTable = await rawQuery<any>(
      `SELECT lb.*, lt.name
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lt.id = lb."leaveTypeId"
       WHERE lb."companyId" = $1 AND lb."employeeId" = $2 AND lb.year = $3`,
      [scope.companyId, scope.employeeId, year]
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
       LEFT JOIN hr_leave_requests lr ON lr."leaveTypeId" = lt.id AND lr."employeeId" = $2
       WHERE lt."companyId" = $1
       GROUP BY lt.id, lt.name, lt."annualDays"
       ORDER BY lt.name`,
      [scope.companyId, scope.employeeId, year]
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

router.get("/leave-requests", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, page = "1", limit: lim = "20" } = req.query as { status?: string; page?: string; limit?: string };
    const filters = parseScopeFilters(req);

    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, {
      companyColumn: 'lr."companyId"',
      branchColumn: 'lr."branchId"',
      enforceBranchScope: true,
    });
    let finalWhere = where;
    let paramIdx = nextParamIndex;
    if (status) {
      finalWhere += ` AND lr.status = $${paramIdx++}`;
      params.push(status);
    }

    const pageNum = Math.max(Number(page), 1);
    const pageSize = Math.min(Math.max(Number(lim), 1), 100);
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

router.post("/leave-requests", requireAnyPermission("hr:self", "hr:create"), async (req, res) => {
  // Step 5 of the HR operational audit — leave request submission.
  // The handler has 12 different validation branches, every single one
  // of which used to be `res.status(400).json({ error: "..." })` — which
  // meant the leave-create form never got `code` or `field` and the user
  // saw the same generic toast for every kind of rejection (out of
  // balance, overlapping, gender-restricted, career-limited, minimum-
  // service, document-required, department-absent-percentage, no manager).
  // Each branch is now a TypedError with the most specific shape the
  // frontend can branch on, and carries `meta` fields the UI can use to
  // explain the rejection precisely.
  try {
    const scope = req.scope!;
    let { leaveTypeId, leaveType: leaveTypeName, startDate, endDate, reason, documentUrl } = req.body as any;

    if (!startDate || !endDate) {
      throw new ValidationError("تاريخا البداية والنهاية مطلوبان", {
        field: !startDate ? "startDate" : "endDate",
        fix: "حدّد تاريخ البداية وتاريخ النهاية للإجازة.",
      });
    }

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
         AND "startDate" <= $2::date AND "endDate" >= $1::date`,
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
           AND EXTRACT(YEAR FROM "startDate") = $3`,
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
         AND "startDate" <= $2 AND "endDate" >= $3`,
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
        const monthsOfService = (new Date().getFullYear() - hireDate.getFullYear()) * 12 + (new Date().getMonth() - hireDate.getMonth());
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
         WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND status = 'approved'`,
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
           AND lr."employeeId" != $4`,
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
    } catch (_e) { console.error("HR query fallback error:", _e); }
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
          meta: { missingRoles: ["branch_manager", "hr_manager", "general_manager", "owner"] },
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
         WHERE ac."companyId" = $1 AND ac."chainType" = 'leaves' AND ac."isActive" = true
         ORDER BY acs."stepOrder" ASC`,
        [scope.companyId]
      );
    } catch (_e) { console.error("HR query fallback error:", _e); }

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
      if (!["branch_manager", "general_manager"].includes(firstStep.requiredRole)) {
        const [roleMatch] = await rawQuery<any>(
          `SELECT id FROM employee_assignments
           WHERE "companyId" = $1 AND role = $2 AND status = 'active'
           LIMIT 1`,
          [scope.companyId, firstStep.requiredRole]
        );
        if (roleMatch) firstAssignee = roleMatch.id;
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
      }).catch(console.error);
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "leave.requested", entity: "hr_leave_requests", entityId: insertId,
      details: JSON.stringify({ leaveTypeId, days, startDate, endDate, leaveTypeName: leaveType.name }),
    }).catch(console.error);

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
    }).catch(console.error);

    const [request] = await rawQuery<any>(
      `SELECT lr.*, lt.name AS "leaveTypeName"
       FROM hr_leave_requests lr JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE lr.id = $1`,
      [insertId]
    );

    res.status(201).json(request);
  } catch (err) {
    handleRouteError(err, res, "Request leave error:");
  }
});

// Staged leave approval: manager (stage 1) → HR (stage 2)
router.patch("/leave-requests/:id/approve", requirePermission("hr:update"), async (req, res) => {
  // Step 6 of the HR operational audit — leave approval workflow.
  // 4 authorization / state branches rewritten to ForbiddenError +
  // ConflictError, each one carrying meta so the frontend can show
  // "this stage needs the branch manager, not you" instead of a
  // generic 403.
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const { approved, reason } = req.body as { approved: boolean | "returned"; reason?: string };

    // Authorization: only branch_manager, hr_manager, or owner roles can approve leave
    if (!["branch_manager", "hr_manager", "general_manager", "owner"].includes(scope.role)) {
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
       WHERE lr.id = $1 AND lr."companyId" = $2`,
      [Number(id), scope.companyId]
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
      [Number(id)]
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
          (stageRequiredRole === "manager" && ["branch_manager", "general_manager"].includes(scope.role)) ||
          (stageRequiredRole === "hr" && scope.role === "hr_manager") ||
          (stageRequiredRole === "branch_manager" && ["branch_manager", "general_manager"].includes(scope.role)) ||
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
      // Rejection: authorized role at current stage can reject
      await rawExecute(
        `UPDATE hr_leave_requests
         SET status = 'rejected', "approvedBy" = $1, "approvedAt" = NOW(), "rejectedReason" = $2
         WHERE id = $3 AND "companyId" = $4`,
        [scope.activeAssignmentId, reason ?? null, Number(id), scope.companyId]
      );
      if (currentStage) {
        await rawExecute(
          `UPDATE leave_approval_stages
           SET status = 'rejected', decision = $1, "decidedBy" = $2, "decidedAt" = NOW()
           WHERE id = $3`,
          [reason ?? "مرفوض", scope.activeAssignmentId, currentStage.id]
        );
      }

      // Restore reserved balance
      await rawExecute(
        `UPDATE hr_leave_balances
         SET reserved = reserved - $1
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
      );

      // Notify requester
      const [reqAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [request.employeeId, scope.companyId]
      );
      if (reqAssignment) {
        createNotification({
          companyId: scope.companyId, assignmentId: reqAssignment.id,
          type: "leave_rejected", title: "تم رفض طلب الإجازة",
          body: `تم رفض طلب الإجازة. السبب: ${reason ?? "لم يحدد"}`,
          priority: "high", refType: "leave_request", refId: Number(id),
        }).catch(console.error);
      }

      try {
        await rawExecute(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('leave',$1,'rejected',$2,$3,$4)`,
          [Number(id), reason || null, scope.userId, scope.companyId]
        );
      } catch (e) { console.error("Failed to log approval action:", e); }

      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "leave.rejected",
        entity: "hr_leave_requests", entityId: Number(id) }).catch(console.error);

      res.json({ message: "تم الرفض", status: "rejected" });
      return;
    }

    if (approved === "returned") {
      if (!reason) {
        throw new ValidationError("يجب ذكر سبب الإرجاع", { field: "reason" });
      }

      await rawExecute(
        `UPDATE hr_leave_requests SET status = 'returned', "rejectedReason" = $1 WHERE id = $2 AND "companyId" = $3`,
        [reason, Number(id), scope.companyId]
      );
      if (currentStage) {
        await rawExecute(
          `UPDATE leave_approval_stages SET status = 'returned', decision = $1, "decidedBy" = $2, "decidedAt" = NOW() WHERE id = $3`,
          [reason, scope.activeAssignmentId, currentStage.id]
        );
      }

      // Returning the request puts it back in the employee's hands for
      // amendments — release the reserved days so the balance correctly
      // reflects availability while the request is being reworked. Without
      // this, the employee can't re-submit because their reserved pool
      // still counts the previous attempt.
      await rawExecute(
        `UPDATE hr_leave_balances
         SET reserved = GREATEST(reserved - $1, 0)
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
      );

      const [reqAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [request.employeeId, scope.companyId]
      );
      if (reqAssignment) {
        createNotification({
          companyId: scope.companyId, assignmentId: reqAssignment.id,
          type: "leave_returned", title: "تم إرجاع طلب الإجازة",
          body: `تم إرجاع طلب الإجازة للمراجعة. السبب: ${reason}`,
          priority: "medium", refType: "leave_request", refId: Number(id),
        }).catch(console.error);
      }

      try {
        await rawExecute(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('leave',$1,'returned',$2,$3,$4)`,
          [Number(id), reason, scope.userId, scope.companyId]
        );
      } catch (e) { console.error("Failed to log approval action:", e); }

      emitEvent({
        companyId: scope.companyId, userId: scope.userId,
        action: "leave.returned", entity: "hr_leave_requests", entityId: Number(id),
        details: `طلب إجازة ${id} — إرجاع: ${reason}`,
      }).catch(console.error);

      res.json({ message: "تم الإرجاع", status: "returned" });
      return;
    }

    // Approval path – dynamic chain from approval_chains table
    const currentStageNum = currentStage?.stage ?? 1;

    // Mark current stage as approved
    if (currentStage) {
      await rawExecute(
        `UPDATE leave_approval_stages
         SET status = 'approved', decision = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
         WHERE id = $2`,
        [scope.activeAssignmentId, currentStage.id]
      );
    }

    // Read approval chain to determine next step
    let chainSteps: any[] = [];
    try {
      chainSteps = await rawQuery<any>(
        `SELECT acs."stepOrder", acs."requiredRole", acs."timeoutHours", acs."autoApproveOnTimeout"
         FROM approval_chains ac
         JOIN approval_chain_steps acs ON acs."chainId" = ac.id
         WHERE ac."companyId" = $1 AND ac."chainType" = 'leaves' AND ac."isActive" = true
         ORDER BY acs."stepOrder" ASC`,
        [scope.companyId]
      );
    } catch (_e) { console.error("HR query fallback error:", _e); }

    if (chainSteps.length === 0) {
      chainSteps = [
        { stepOrder: 1, requiredRole: "branch_manager", timeoutHours: 24, autoApproveOnTimeout: false },
        { stepOrder: 2, requiredRole: "hr_manager", timeoutHours: 48, autoApproveOnTimeout: false },
      ];
    }

    // Find the next step after the current one
    const nextStep = chainSteps.find((s: any) => s.stepOrder > currentStageNum);

    if (nextStep) {
      // Find the appropriate assignee for next step
      const [nextAssignee] = await rawQuery<any>(
        `SELECT id FROM employee_assignments
         WHERE "companyId" = $1 AND role IN ($2, 'owner') AND status = 'active'
         ORDER BY CASE role WHEN $2 THEN 1 ELSE 2 END LIMIT 1`,
        [scope.companyId, nextStep.requiredRole]
      );

      if (nextAssignee && nextAssignee.id !== scope.activeAssignmentId) {
        const nextExpiresAt = new Date();
        nextExpiresAt.setHours(nextExpiresAt.getHours() + (nextStep.timeoutHours ?? 48));
        await rawExecute(
          `INSERT INTO leave_approval_stages ("leaveRequestId",stage,"requiredRole","assignedTo","expiresAt")
           VALUES ($1,$2,$3,$4,$5)`,
          [Number(id), nextStep.stepOrder, nextStep.requiredRole, nextAssignee.id, nextExpiresAt.toISOString()]
        );

        createNotification({
          companyId: scope.companyId, assignmentId: nextAssignee.id,
          type: "leave_request", title: `طلب إجازة يتطلب مراجعة ${nextStep.requiredRole}`,
          body: `أقر المرحلة ${currentStageNum} على طلب إجازة لمدة ${request.days} أيام`,
          priority: "high", refType: "leave_request", refId: Number(id),
        }).catch(console.error);

        emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `leave.stage${currentStageNum}_approved`,
          entity: "hr_leave_requests", entityId: Number(id) }).catch(console.error);

        res.json({ message: `تمت الموافقة من المرحلة ${currentStageNum}. الطلب الآن في مرحلة ${nextStep.requiredRole}`, status: "pending", nextStage: nextStep.stepOrder });
        return;
      }
    }

    // Final approval (stage 2 HR or owner approving directly)
    await rawExecute(
      `UPDATE hr_leave_requests
       SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [scope.activeAssignmentId, Number(id), scope.companyId]
    );
    if (currentStage) {
      await rawExecute(
        `UPDATE leave_approval_stages
         SET status = 'approved', decision = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
         WHERE id = $2`,
        [scope.activeAssignmentId, currentStage.id]
      );
    }

    // ── Fetch ALL assignments first (needed for balance + attendance + tasks) ──
    const allAssignments = await rawQuery<any>(
      `SELECT ea.id, ea."companyId", ea."branchId"
       FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea.status = 'active'`,
      [request.employeeId]
    );

    // Confirm balance deduction: move from reserved to used across ALL companies
    // Leave follows the person (not the assignment), so deduct from all companies
    const allCompanyIds = [...new Set(allAssignments.map((a: any) => a.companyId))];
    for (const cId of allCompanyIds) {
      await rawExecute(
        `UPDATE hr_leave_balances
         SET used = used + $1, reserved = GREATEST(reserved - $1, 0)
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [request.days, cId, request.employeeId, request.leaveTypeId, year]
      );
    }

    // Update approval_requests table
    await rawExecute(
      `UPDATE approval_requests SET status = 'approved', "decidedBy" = $1, "decidedAt" = NOW()
       WHERE "refType" = 'leave_request' AND "refId" = $2`,
      [scope.activeAssignmentId, Number(id)]
    );
    const leaveStart = new Date(request.startDate);
    const leaveEnd = new Date(request.endDate);
    // Retroactive leave approval: if the employee was marked 'absent' on any
    // day covered by the leave, remove those absence rows FIRST so the
    // ON CONFLICT DO NOTHING insert can turn them into 'on_leave' and the
    // next payroll run won't double-deduct (absence deduction + leave-used).
    for (const asn of allAssignments) {
      await rawExecute(
        `DELETE FROM attendance
         WHERE "assignmentId" = $1 AND date BETWEEN $2 AND $3 AND status = 'absent'`,
        [asn.id, request.startDate, request.endDate]
      ).catch((e) => console.error("Failed to clear absent days for leave approval:", e));
      // Also drop any stale absence-based payroll_deductions queued for those
      // days so an already-generated deduction row doesn't still withhold pay.
      await rawExecute(
        `DELETE FROM payroll_deductions
         WHERE "companyId" = $1 AND "employeeId" = $2 AND type = 'absence'
           AND date BETWEEN $3 AND $4
           AND (status IS NULL OR status <> 'deducted_in_payroll')`,
        [asn.companyId, request.employeeId, request.startDate, request.endDate]
      ).catch((e) => console.error("Failed to clear pending absence deductions:", e));
      for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        await rawExecute(
          `INSERT INTO attendance ("assignmentId","companyId","branchId",date,status,notes)
           VALUES ($1,$2,$3,$4,'on_leave',$5)
           ON CONFLICT DO NOTHING`,
          [asn.id, asn.companyId, asn.branchId, dateStr, `إجازة معتمدة - طلب رقم ${id}`]
        ).catch(() => {});
      }
    }

    // ── Reassign tasks during leave period (per assignment's own company) ──
    if (allAssignments.length > 0) {
      const assignmentIds = allAssignments.map((a: any) => a.id);
      for (const asn of allAssignments) {
        const aId = asn.id;
        const [managerAId] = await rawQuery<any>(
          `SELECT ea.id FROM employee_assignments ea
           WHERE ea."companyId" = $1 AND ea."branchId" = $2
             AND ea.role IN ('branch_manager','hr_manager','general_manager','owner') AND ea.status = 'active' AND ea.id != $3
           ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'hr_manager' THEN 2 WHEN 'general_manager' THEN 3 ELSE 4 END LIMIT 1`,
          [asn.companyId, asn.branchId, aId]
        );
        if (managerAId) {
          await rawExecute(
            `UPDATE project_tasks SET "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $1)
             WHERE "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $2)
               AND status NOT IN ('completed','cancelled')
               AND ("dueDate" IS NULL OR "dueDate" BETWEEN $3 AND $4)`,
            [managerAId.id, aId, request.startDate, request.endDate]
          ).catch(() => {});
        }
      }
    }

    // ── Notify requester and all managers ──
    for (const asn of allAssignments) {
      createNotification({
        companyId: asn.companyId, assignmentId: asn.id,
        type: "leave_approved", title: "تمت الموافقة على طلب الإجازة",
        body: `تمت الموافقة على إجازة ${request.leaveTypeName} من ${request.startDate} إلى ${request.endDate}`,
        priority: "high", refType: "leave_request", refId: Number(id),
      }).catch(console.error);

      getManagerAssignmentId(asn.companyId, asn.branchId).then((mgr) => {
        if (mgr && mgr !== scope.activeAssignmentId) {
          createNotification({
            companyId: asn.companyId, assignmentId: mgr,
            type: "leave_approved", title: "موظف في إجازة معتمدة",
            body: `تمت الموافقة على إجازة موظف من ${request.startDate} إلى ${request.endDate}. تم إعادة توزيع المهام.`,
            priority: "normal", refType: "leave_request", refId: Number(id),
          }).catch(console.error);
        }
      }).catch(console.error);
    }

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('leave',$1,'approved',$2,$3,$4)`,
        [Number(id), reason || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "leave.approved",
      entity: "hr_leave_requests", entityId: Number(id),
      details: JSON.stringify({ affectedAssignments: allAssignments.length }) }).catch(console.error);

    // Register return-to-work obligation (fires the day after the leave ends)
    try {
      const returnDate = new Date(leaveEnd);
      returnDate.setDate(returnDate.getDate() + 1);
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "hr_leave_request",
        entityId: Number(id),
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
    } catch (obErr) { console.error("Return-to-work obligation failed:", obErr); }

    res.json({ message: "تمت الموافقة النهائية", status: "approved", affectedAssignments: allAssignments.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Get leave request approval stages with timeline
router.get("/leave-requests/:id/stages", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    const [leaveReq] = await rawQuery<any>(
      `SELECT id FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!leaveReq) throw new NotFoundError("الطلب غير موجود");

    const stages = await rawQuery<any>(
      `SELECT las.*, e.name AS "decidedByName"
       FROM leave_approval_stages las
       LEFT JOIN employee_assignments ea ON ea.id = las."decidedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE las."leaveRequestId" = $1
       ORDER BY las.stage ASC`,
      [Number(id)]
    );

    // Also get the configured chain steps for context
    let chainSteps: any[] = [];
    try {
      chainSteps = await rawQuery<any>(
        `SELECT acs."stepOrder", acs."requiredRole", acs."timeoutHours", acs."autoApproveOnTimeout"
         FROM approval_chains ac
         JOIN approval_chain_steps acs ON acs."chainId" = ac.id
         WHERE ac."companyId" = $1 AND ac."chainType" = 'leaves' AND ac."isActive" = true
         ORDER BY acs."stepOrder" ASC`,
        [scope.companyId]
      );
    } catch (_e) { console.error("HR query fallback error:", _e); }

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
router.patch("/leave-requests/:id/escalate", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    if (!["branch_manager", "hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: التصعيد متاح فقط للمدير أو HR أو المالك");
    }

    const [request] = await rawQuery<any>(
      `SELECT * FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`,
      [Number(id), scope.companyId]
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
      [Number(id)]
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

    // Stage has expired – mark it and escalate
    await rawExecute(
      `UPDATE leave_approval_stages
       SET status = 'escalated'
       WHERE "leaveRequestId" = $1 AND status = 'pending' AND "expiresAt" < NOW()`,
      [Number(id)]
    );

    const [hrAssignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments
       WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active'
       ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
      [scope.companyId]
    );
    if (hrAssignment) {
      const escalateExpiresAt = new Date();
      escalateExpiresAt.setHours(escalateExpiresAt.getHours() + 24);
      await rawExecute(
        `INSERT INTO leave_approval_stages ("leaveRequestId",stage,"requiredRole","assignedTo","expiresAt")
         VALUES ($1,99,'hr_manager',$2,$3)`,
        [Number(id), hrAssignment.id, escalateExpiresAt.toISOString()]
      );

      createNotification({
        companyId: scope.companyId, assignmentId: hrAssignment.id,
        type: "leave_escalated", title: "تصعيد طلب إجازة",
        body: `تم تصعيد طلب إجازة (${id}) لعدم البت فيه خلال المهلة المحددة`,
        priority: "urgent", refType: "leave_request", refId: Number(id),
      }).catch(console.error);
    }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "leave.escalated",
      entity: "hr_leave_requests", entityId: Number(id) }).catch(console.error);

    res.json({ message: "تم تصعيد الطلب لـ HR" });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL – employee-level aggregation with multi-assignment, GOSI, absences, loans
// ─────────────────────────────────────────────────────────────────────────────

router.get("/payroll", requirePermission("hr:read"), async (req, res) => {
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
       GROUP BY pr.id, e.name ORDER BY pr."createdAt" DESC`,
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

router.get("/payroll/:id/lines", requirePermission("hr:read"), async (req, res) => {
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
       JOIN employee_assignments ea ON ea.id = pl."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL ORDER BY e.name`,
      [Number(id)]
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

router.post("/payroll", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    // Payroll execution requires HR, Finance, Director or Owner role
    if (!["hr_manager", "finance_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("ليس لديك الصلاحية لتشغيل مسير الرواتب", {
        meta: {
          requiredRoles: ["hr_manager", "finance_manager", "general_manager", "owner"],
          yourRole: scope.role,
        },
      });
    }
    const { month } = req.body as { month?: string };
    const targetPeriod = month ?? new Date().toISOString().slice(0, 7);

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
    const GOSI_EMPLOYEE_RATE = gosiComponent
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

    // Late deductions per assignment (type = 'late')
    const lateDeductionRows = await rawQuery<any>(
      `SELECT "assignmentId", COALESCE(SUM(amount), 0) AS total
       FROM attendance_deductions
       WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll' AND type = 'late'
       GROUP BY "assignmentId"`,
      [scope.companyId, targetPeriod]
    );
    const lateMap = new Map<number, number>();
    for (const d of lateDeductionRows) lateMap.set(Number(d.assignmentId), Number(d.total));

    // Penalty deductions per assignment (type = 'penalty')
    const penaltyDeductionRows = await rawQuery<any>(
      `SELECT "assignmentId", COALESCE(SUM(amount), 0) AS total
       FROM attendance_deductions
       WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll' AND type = 'penalty'
       GROUP BY "assignmentId"`,
      [scope.companyId, targetPeriod]
    );
    const penaltyMap = new Map<number, number>();
    for (const d of penaltyDeductionRows) penaltyMap.set(Number(d.assignmentId), Number(d.total));

    // Violation deductions per assignment (from attendance_deductions type='violation' only, not employee_violations to avoid double-counting with late/penalty)
    const violationRows = await rawQuery<any>(
      `SELECT "assignmentId", COALESCE(SUM(amount), 0) AS total
       FROM attendance_deductions
       WHERE "companyId" = $1 AND period = $2 AND status = 'pending_payroll' AND type = 'violation'
       GROUP BY "assignmentId"`,
      [scope.companyId, targetPeriod]
    );
    const violationMap = new Map<number, number>();
    for (const d of violationRows) violationMap.set(Number(d.assignmentId), Number(d.total));

    // Absence days per assignment
    const absenceRows = await rawQuery<any>(
      `SELECT a."assignmentId", COUNT(*) AS "absentDays"
       FROM attendance a
       WHERE a."companyId" = $1 AND TO_CHAR(a.date, 'YYYY-MM') = $2 AND a.status = 'absent'
       GROUP BY a."assignmentId"`,
      [scope.companyId, targetPeriod]
    );
    const absenceMap = new Map<number, number>();
    for (const row of absenceRows) absenceMap.set(Number(row.assignmentId), Number(row.absentDays ?? 0));

    // Loan installments per assignment (legacy loan_accounts)
    const loanRows = await rawQuery<any>(
      `SELECT la."assignmentId", COALESCE(SUM(la."monthlyInstallment"), 0) AS "installment"
       FROM loan_accounts la
       WHERE la."companyId" = $1 AND la.status = 'active' AND la."remainingAmount" > 0
       GROUP BY la."assignmentId"`,
      [scope.companyId]
    );
    const loanMap = new Map<number, number>();
    for (const row of loanRows) loanMap.set(Number(row.assignmentId), Number(row.installment ?? 0));

    // HR loan installments per assignment (hr_employee_loans module)
    const hrLoanRows = await rawQuery<any>(
      `SELECT li."assignmentId", COALESCE(SUM(li.amount), 0) AS "installment"
       FROM hr_loan_installments li
       WHERE li."companyId" = $1 AND li.period = $2 AND li.status = 'pending'
       GROUP BY li."assignmentId"`,
      [scope.companyId, targetPeriod]
    ).catch(() => [] as any[]);
    for (const row of hrLoanRows) {
      const aId = Number(row.assignmentId);
      loanMap.set(aId, (loanMap.get(aId) ?? 0) + Number(row.installment ?? 0));
    }

    // Overtime per assignment (from attendance records)
    const overtimeRows = await rawQuery<any>(
      `SELECT a."assignmentId", COALESCE(SUM(a."overtimeMinutes"), 0) AS "totalOvertimeMinutes"
       FROM attendance a
       WHERE a."companyId" = $1 AND TO_CHAR(a.date, 'YYYY-MM') = $2 AND a."overtimeMinutes" > 0
       GROUP BY a."assignmentId"`,
      [scope.companyId, targetPeriod]
    );
    const overtimeMap = new Map<number, number>();
    for (const row of overtimeRows) overtimeMap.set(Number(row.assignmentId), Number(row.totalOvertimeMinutes ?? 0));

    // Approved overtime requests (HR module — with correct multipliers)
    const hrOtRows = await rawQuery<any>(
      `SELECT "assignmentId", COALESCE(SUM("totalAmount"), 0) AS "otAmount"
       FROM hr_overtime_requests
       WHERE "companyId" = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 AND status = 'approved'
       GROUP BY "assignmentId"`,
      [scope.companyId, targetPeriod]
    ).catch(() => [] as any[]);
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
            amount = Math.round(basic * (compValue / 100) * 100) / 100;
          } else {
            amount = Math.round(compValue * 100) / 100;
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
      const absenceDeduction = Math.round((absentDays * (basic / 30)) * 100) / 100;
      const violationDeduction = (penaltyMap.get(aId) ?? 0) + (violationMap.get(aId) ?? 0);
      const loanDeduction = loanMap.get(aId) ?? 0;
      const gosiEmployee = Math.round(basic * GOSI_EMPLOYEE_RATE * 100) / 100;
      const gosiEmployer = Math.round(basic * GOSI_EMPLOYER_RATE * 100) / 100;
      totalGosiEmployer += gosiEmployer;
      const overtimeMinutes = overtimeMap.get(aId) ?? 0;
      const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
      const hourlyRate = basic / (30 * 8);
      const attendanceOt = Math.round(overtimeHours * hourlyRate * 1.5 * 100) / 100;
      const hrOtAmount = hrOtMap.get(aId) ?? 0;
      // استخدام الأعلى بين وقت الحضور ومبلغ طلبات OT المعتمدة (لتجنب الاحتساب المزدوج)
      const overtime = Math.max(attendanceOt, hrOtAmount);

      const totalDeductions = lateDeduction + absenceDeduction + violationDeduction + loanDeduction + gosiEmployee;
      const net = Math.max(0, Math.round((gross + overtime - totalDeductions) * 100) / 100);
      totalNet += net;

      lines.push({
        employeeId: asn.employeeId, assignmentId: aId,
        basic, housingAllowance, transportAllowance, gross,
        gosiEmployee, gosiEmployer, lateDeduction, absenceDeduction,
        violationDeduction, loanDeduction, overtime, overtimeHours, net,
      });
    }

    const totalGross = Math.round(lines.reduce((s, l) => s + l.gross, 0) * 100) / 100;
    const totalGosiEmployee = Math.round(lines.reduce((s, l) => s + l.gosiEmployee, 0) * 100) / 100;
    const totalBankPayout = Math.round(totalNet * 100) / 100;
    const totalGosiPayable = Math.round((totalGosiEmployer + totalGosiEmployee) * 100) / 100;

    const runId = await withTransaction(async (client) => {
      const runResult = await client.query(
        `INSERT INTO payroll_runs ("companyId", period, status, "totalNet", "runBy")
         VALUES ($1,$2,'completed',$3,$4) RETURNING id`,
        [scope.companyId, targetPeriod, Math.round(totalNet * 100) / 100, scope.activeAssignmentId]
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
           WHERE "companyId" = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 AND status = 'approved'`,
          [scope.companyId, targetPeriod]
        );
      }

      return newRunId;
    });

    try {
      const [salaryExpenseCode, gosiExpenseCode, bankCode, gosiPayableCode] = await Promise.all([
        getAccountCodeFromMapping(scope.companyId, "payroll_salary_expense", "debit", "5100"),
        getAccountCodeFromMapping(scope.companyId, "payroll_gosi_expense", "debit", "5110"),
        getAccountCodeFromMapping(scope.companyId, "payroll_bank_payout", "credit", "1100"),
        getAccountCodeFromMapping(scope.companyId, "payroll_gosi_payable", "credit", "2200"),
      ]);

      await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `PAYROLL-${targetPeriod}`,
        description: `صرف رواتب ${targetPeriod} – ${lines.length} موظف`,
        lines: [
          { accountCode: salaryExpenseCode, debit: totalGross, credit: 0 },
          { accountCode: gosiExpenseCode, debit: Math.round(totalGosiEmployer * 100) / 100, credit: 0 },
          { accountCode: bankCode, debit: 0, credit: totalBankPayout },
          { accountCode: gosiPayableCode, debit: 0, credit: totalGosiPayable },
          { accountCode: "2210", debit: 0, credit: Math.round((totalGross - totalNet - totalGosiEmployee) * 100) / 100 || 0 },
        ].filter(l => l.debit > 0 || l.credit > 0),
      });
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
    }).catch(console.error);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "payroll.run", entity: "payroll_runs", entityId: runId,
      after: { period: targetPeriod, totalNet, totalGosiEmployer, assignmentCount: lines.length },
    }).catch(console.error);

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
      totalAmount: Math.round(totalNet * 100) / 100,
      totalGosiEmployer: Math.round(totalGosiEmployer * 100) / 100,
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

// ─────────────────────────────────────────────────────────────────────────────
// VIOLATIONS, SHIFTS, PERFORMANCE, LEGACY LEAVE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/violations", requirePermission("hr:read"), async (req, res) => {
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
  } catch (err) { console.error("Get violations error:", err); res.json({ data: [], total: 0, page: 1, pageSize: 0 }); }
});

router.get("/violations/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [item] = await rawQuery<any>(
      `SELECT ev.*, e.name AS "employeeName", e."empNumber",
              ea."jobTitle", ea.salary, b.name AS "branchName"
       FROM employee_violations ev
       JOIN employee_assignments ea ON ea.id = ev."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ev.id = $1 AND ev."companyId" = $2 AND ev."deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (!item) { res.status(404).json({ error: "المخالفة غير موجودة" }); return; }

    // جلب محضر التحقيق المرتبط إن وجد
    const memos = await rawQuery<any>(
      `SELECT dm.id, dm."memoNumber", dm.status, dm."penaltyLabel",
              dm."baseDeductionAmount", dm."totalDeductionAmount", dm."createdAt"
       FROM discipline_memos dm
       WHERE dm."violationId" = $1 AND dm."companyId" = $2
       ORDER BY dm."createdAt" DESC`,
      [item.id, scope.companyId]
    ).catch(() => [] as any[]);

    res.json({ ...item, memos });
  } catch (err) { handleRouteError(err, res, "Get violation detail error:"); }
});

router.post("/violations", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    let { assignmentId, employeeId, type, description, severity, deduction, period: reqPeriod } = req.body as any;
    const period = reqPeriod || new Date().toISOString().slice(0, 7);
    // resolve assignmentId from employeeId if needed
    if (!assignmentId && employeeId) {
      const [resolved] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' ORDER BY id DESC LIMIT 1`,
        [Number(employeeId), scope.companyId]
      );
      if (resolved) assignmentId = resolved.id;
    }
    const { insertId } = await rawExecute(
      `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, assignmentId, type, description, severity ?? "medium", deduction ?? 0, period]
    );
    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) { handleRouteError(err, res, "Create violation error:"); }
});

router.get("/shifts", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM shifts WHERE "companyId" = $1 ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { console.error("Get shifts error:", err); res.json({ data: [], total: 0, page: 1, pageSize: 0 }); }
});

router.post("/shifts", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const {
      name, startTime, endTime, days, isDefault,
      shiftType, remoteAllowed,
      splitBreakStart, splitBreakEnd,
      flexStartEarliest, flexStartLatest,
    } = req.body as any;
    // shiftType: 'fixed' (default) | 'flexible' | 'remote' | 'split'
    const effectiveShiftType = shiftType ?? 'fixed';
    const effectiveRemote = remoteAllowed ?? (effectiveShiftType === 'remote');
    if (isDefault) {
      await rawExecute(`UPDATE shifts SET "isDefault" = false WHERE "companyId" = $1`, [scope.companyId]);
    }
    const { insertId } = await rawExecute(
      `INSERT INTO shifts ("companyId","branchId",name,"startTime","endTime",days,"isDefault",status,"shiftType","remoteAllowed","splitBreakStart","splitBreakEnd","flexStartEarliest","flexStartLatest")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11,$12,$13)`,
      [scope.companyId, scope.branchId, name, startTime, endTime, days ?? "0,1,2,3,4", isDefault ?? false,
       effectiveShiftType, effectiveRemote,
       splitBreakStart || null, splitBreakEnd || null,
       flexStartEarliest || null, flexStartLatest || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM shifts WHERE id = $1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create shift error:"); }
});

router.get("/performance", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT pr.*, e.name AS "employeeName", e."empNumber"
       FROM performance_reviews pr
       JOIN employees e ON e.id = pr."employeeId"
       WHERE pr."companyId" = $1 ORDER BY pr."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { console.error("Get performance error:", err); res.json({ data: [], total: 0, page: 1, pageSize: 0 }); }
});

router.post("/performance", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, assignmentId, period, overallScore, scores, categories, comments, notes, status } = req.body as any;
    const finalEmployeeId = employeeId || assignmentId;
    const finalScores = scores || categories ? JSON.stringify(scores || categories) : null;
    const finalComments = comments || notes || null;

    const trainings = await rawQuery<any>(
      `SELECT te.id, tp.name, te.score
       FROM training_enrollments te
       JOIN training_programs tp ON tp.id = te."programId"
       WHERE te."employeeId" = $1 AND te.status = 'completed'
       ORDER BY te."completedAt" DESC LIMIT 20`,
      [finalEmployeeId]
    );
    const trainingIds = trainings.map((t: any) => t.id);
    const avgTrainingScore = trainings.length > 0
      ? trainings.reduce((s: number, t: any) => s + (Number(t.score) || 0), 0) / trainings.length
      : null;

    const { insertId } = await rawExecute(
      `INSERT INTO performance_reviews ("companyId","employeeId",period,"overallScore",scores,comments,status,"trainingIds","trainingScore")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, finalEmployeeId, period, overallScore ?? 0, finalScores, finalComments, status ?? "pending",
       JSON.stringify(trainingIds), avgTrainingScore]
    );
    res.status(201).json({ id: insertId, trainingIds, trainingScore: avgTrainingScore, ...req.body });
  } catch (err) { handleRouteError(err, res, "Create performance error:"); }
});

router.get("/attendance-stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    const [present] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM attendance WHERE "companyId"=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND status='present'`,
      [scope.companyId, month]
    );
    const [absent] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM attendance WHERE "companyId"=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND status='absent'`,
      [scope.companyId, month]
    );
    const [late] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM attendance WHERE "companyId"=$1 AND TO_CHAR(date,'YYYY-MM')=$2 AND "lateMinutes">0`,
      [scope.companyId, month]
    );
    const [totalEmp] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM employee_assignments WHERE "companyId"=$1 AND status='active'`,
      [scope.companyId]
    );
    res.json({
      present: Number(present?.count ?? 0),
      absent: Number(absent?.count ?? 0),
      late: Number(late?.count ?? 0),
      totalEmployees: Number(totalEmp?.count ?? 0),
      month,
    });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ present: 0, absent: 0, late: 0, totalEmployees: 0 }); }
});

router.get("/leave-stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [pending] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND status='pending'`, [scope.companyId]
    );
    const [approved] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND status='approved'`, [scope.companyId]
    );
    const [rejected] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1 AND status='rejected'`, [scope.companyId]
    );
    const [total] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM hr_leave_requests WHERE "companyId"=$1`, [scope.companyId]
    );
    res.json({
      pending: Number(pending?.count ?? 0),
      approved: Number(approved?.count ?? 0),
      rejected: Number(rejected?.count ?? 0),
      total: Number(total?.count ?? 0),
    });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ pending: 0, approved: 0, rejected: 0, total: 0 }); }
});

router.get("/salary-components", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM salary_components WHERE "companyId"=$1 ORDER BY name`, [scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

router.post("/salary-components", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, type, category, value, taxable } = req.body as any;
    const { insertId } = await rawExecute(
      `INSERT INTO salary_components ("companyId",name,type,category,value,taxable,status)
       VALUES ($1,$2,$3,$4,$5,$6,'active')`,
      [scope.companyId, name, type ?? "fixed", category ?? "allowance", value ?? 0, taxable ?? true]
    );
    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) { handleRouteError(err, res, "Create salary component error:"); }
});

router.get("/approval-chains", requirePermission("hr:read"), async (req, res) => {
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
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL CHAINS — Generic approval chain management (5 types)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/approval-chain-definitions", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const chains = await rawQuery<any>(
      `SELECT ac.*, 
              json_agg(json_build_object('id', acs.id, 'stepOrder', acs."stepOrder", 'requiredRole', acs."requiredRole", 'timeoutHours', acs."timeoutHours", 'autoApproveOnTimeout', acs."autoApproveOnTimeout") ORDER BY acs."stepOrder") AS steps
       FROM approval_chains ac
       LEFT JOIN approval_chain_steps acs ON acs."chainId" = ac.id
       WHERE ac."companyId" = $1
       GROUP BY ac.id
       ORDER BY ac."chainType", ac."minAmount"`,
      [scope.companyId]
    );
    res.json({ data: chains, total: chains.length });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

router.post("/approval-chain-definitions", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بإنشاء سلاسل موافقات");
    }
    const { name, chainType, minAmount, maxAmount, steps } = req.body as any;
    if (!name || !chainType) {
      throw new ValidationError("الاسم ونوع السلسلة مطلوبان", { field: name ? "chainType" : "name" });
    }
    const validTypes = ["leaves", "purchases", "expenses", "advances", "letters", "loans", "overtime", "exit"];
    if (!validTypes.includes(chainType)) {
      throw new ValidationError(
        `نوع السلسلة يجب أن يكون أحد: ${validTypes.join(", ")}`,
        { field: "chainType" },
      );
    }

    const { insertId: chainId } = await rawExecute(
      `INSERT INTO approval_chains ("companyId",name,"chainType","minAmount","maxAmount")
       VALUES ($1,$2,$3,$4,$5)`,
      [scope.companyId, name, chainType, minAmount ?? 0, maxAmount ?? 999999999]
    );

    if (Array.isArray(steps)) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await rawExecute(
          `INSERT INTO approval_chain_steps ("chainId","stepOrder","requiredRole","timeoutHours","autoApproveOnTimeout")
           VALUES ($1,$2,$3,$4,$5)`,
          [chainId, i + 1, step.requiredRole ?? "branch_manager", step.timeoutHours ?? 48, step.autoApproveOnTimeout ?? false]
        );
      }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "approval_chains", entityId: chainId,
      after: { name, chainType, minAmount, maxAmount, stepCount: steps?.length ?? 0 },
    }).catch(console.error);

    res.status(201).json({ id: chainId, name, chainType, stepsCreated: steps?.length ?? 0 });
  } catch (err) { handleRouteError(err, res, "Create approval chain error:"); }
});

router.delete("/approval-chain-definitions/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: يتطلب صلاحية مالك أو HR أو مدير عام");
    }
    const id = Number(req.params.id);
    await rawExecute(`DELETE FROM approval_chains WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Generic approval request endpoints ──────────────────────

router.get("/approval-requests", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const statusFilter = (req.query.status as string) ?? "pending";
    const rows = await rawQuery<any>(
      `SELECT ar.*, e.name AS "assignedToName"
       FROM approval_requests ar
       LEFT JOIN employee_assignments ea ON ea.id = ar."assignedTo"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE ar."companyId" = $1 AND ar.status = $2
       ORDER BY ar."createdAt" DESC`,
      [scope.companyId, statusFilter]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

router.patch("/approval-requests/:id/decide", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { approved, reason } = req.body as any;

    if (!["branch_manager", "hr_manager", "finance_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بالموافقة أو الرفض");
    }

    const [request] = await rawQuery<any>(
      `SELECT * FROM approval_requests WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`,
      [Number(req.params.id), scope.companyId]
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
      } catch {
        // column may not exist for all entity types; skip check
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
          `UPDATE ${target.table} SET ${target.column} = 'approved' WHERE id = $1`,
          [request.refId]
        );
      }
      const journalRefTypes = ["expense", "salary_advance", "custody"];
      if (journalRefTypes.includes(request.refType)) {
        await rawExecute(
          `UPDATE journal_entries SET status = 'posted' WHERE id = $1 AND status = 'pending_approval'`,
          [request.refId]
        );
      }
    } else if (result.status === "rejected") {
      const entityUpdateMap: Record<string, { table: string; column: string }> = {
        purchase_order: { table: "purchase_orders", column: "status" },
        official_letter: { table: "official_letters", column: "status" },
      };
      const target = entityUpdateMap[request.refType];
      if (target) {
        await rawExecute(
          `UPDATE ${target.table} SET ${target.column} = 'rejected' WHERE id = $1`,
          [request.refId]
        );
      }
      const journalRefTypes = ["expense", "salary_advance", "custody"];
      if (journalRefTypes.includes(request.refType)) {
        await rawExecute(
          `UPDATE journal_entries SET status = 'rejected' WHERE id = $1 AND status = 'pending_approval'`,
          [request.refId]
        );
      }

      // Cancel any queued email/WhatsApp dispatches for a rejected official
      // letter — otherwise the queue workers will send it after it was denied.
      if (request.refType === "official_letter") {
        await rawExecute(
          `UPDATE email_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
            WHERE "refType"='official_letter' AND "refId"=$1 AND status='pending'`,
          [request.refId]
        ).catch((e) => console.error("cancel email_queue for rejected letter failed:", e));
        await rawExecute(
          `UPDATE whatsapp_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
            WHERE "refType"='official_letter' AND "refId"=$1 AND status='pending'`,
          [request.refId]
        ).catch(() => { /* whatsapp_queue may not exist */ });
      }
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: `approval.${result.status}`, entity: "approval_requests",
      entityId: Number(req.params.id),
      details: JSON.stringify({ refType: request.refType, refId: request.refId, result: result.status }),
    }).catch(console.error);

    res.json(result);
  } catch (err) { handleRouteError(err, res, "Approval decision error:"); }
});

// ─── Attendance policy management ──────────────────────
router.get("/attendance-policy", requirePermission("hr:read"), async (req, res) => {
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
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: null, error: "خطأ في جلب البيانات" }); }
});

router.put("/attendance-policy", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["owner", "hr_manager", "general_manager"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح");
    }
    const b = req.body as any;
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
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Employee payroll summary (aggregate all assignments) ──────────────────────
router.get("/payroll-summary", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as { period?: string };
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

    const lines = await rawQuery<any>(
      `SELECT pl.*, e.name AS "employeeName", e."empNumber", ea."jobTitle", ea."branchId", b.name AS "branchName"
       FROM payroll_lines pl
       JOIN employee_assignments ea ON ea.id = pl."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN branches b ON b.id = ea."branchId"
       JOIN payroll_runs pr ON pr.id = pl."runId"
       WHERE pr."companyId" = $1 AND pr.period = $2 AND pr."deletedAt" IS NULL AND pl."deletedAt" IS NULL
       ORDER BY e.name, ea.id`,
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
  } catch (err) { res.json({ data: [], total: 0 }); }
});

router.get("/violations-stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const [total] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM employee_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [scope.companyId]
    );
    const [thisMonthRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM employee_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL AND period = $2`, [scope.companyId, currentMonth]
    );
    const [totalDeductions] = await rawQuery<any>(
      `SELECT COALESCE(SUM(deduction),0) AS total FROM employee_violations WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [scope.companyId]
    );
    res.json({
      total: Number(total?.count ?? 0),
      thisMonth: Number(thisMonthRow?.count ?? 0),
      totalDeductions: Number(totalDeductions?.total ?? 0),
    });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ total: 0, thisMonth: 0, totalDeductions: 0 }); }
});

router.patch("/violations/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "branch_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل المخالفات مقصور على HR أو المدير أو المالك");
    }
    const id = Number(req.params.id);
    const b = req.body as any;
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
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE employee_violations SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [updated] = await rawQuery<any>(`SELECT * FROM employee_violations WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(updated || { message: "تم التحديث" });
  } catch (err) { handleRouteError(err, res, "Patch violation error:"); }
});

router.patch("/shifts/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body as any;
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
      if (b.isDefault) await rawExecute(`UPDATE shifts SET "isDefault"=false WHERE "companyId"=$1`, [scope.companyId]);
      params.push(b.isDefault); sets.push(`"isDefault"=$${params.length}`);
    }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات");
    }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE shifts SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM shifts WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Patch shift error:"); }
});

router.delete("/shifts/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(`DELETE FROM shifts WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    res.json({ message: "تم حذف الوردية" });
  } catch (err) { handleRouteError(err, res, "Delete shift error:"); }
});

router.get("/shift-assignments", requirePermission("hr:read"), async (req, res) => {
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
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

router.post("/shift-assignments", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { assignmentId, shiftId, startDate, endDate } = req.body as any;
    const [validAssignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE id=$1 AND "companyId"=$2`, [assignmentId, scope.companyId]
    );
    const [validShift] = await rawQuery<any>(
      `SELECT id FROM shifts WHERE id=$1 AND "companyId"=$2`, [shiftId, scope.companyId]
    );
    if (!validAssignment || !validShift) {
      throw new ForbiddenError("غير مصرح");
    }
    const { insertId } = await rawExecute(
      `INSERT INTO employee_shift_assignments ("assignmentId","shiftId","startDate","endDate") VALUES ($1,$2,$3,$4)`,
      [assignmentId, shiftId, startDate, endDate ?? null]
    );
    res.status(201).json({ id: insertId });
  } catch (err) { handleRouteError(err, res, "Create shift assignment error:"); }
});

router.get("/official-letters", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT ol.*, e.name AS "employeeName"
       FROM official_letters ol
       LEFT JOIN employees e ON e.id = ol."employeeId"
       WHERE ol."companyId" = $1
       ORDER BY ol."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

router.post("/official-letters", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, type, subject, content, status } = req.body as any;
    const { insertId } = await rawExecute(
      `INSERT INTO official_letters ("companyId","employeeId",type,subject,content,status,"createdByAssignmentId")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, employeeId, type ?? "general", subject, content, status ?? "draft", scope.activeAssignmentId]
    );

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "letters", refType: "official_letter", refId: insertId,
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE official_letters SET status = 'pending_approval' WHERE id = $1`,
        [insertId]
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
    }).catch(console.error);

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
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "hr.letter.created",
      entity: "official_letter",
      entityId: insertId,
      after: { employeeId, type: type ?? "general", subject },
    }).catch(console.error);

    res.status(201).json({ id: insertId, ...req.body, approval: approvalResult });
  } catch (err) { handleRouteError(err, res, "Create official letter error:"); }
});

router.get("/monthly-attendance", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    const rows = await rawQuery<any>(
      `SELECT ema.*, e.name AS "employeeName", e."empNumber"
       FROM employee_monthly_attendance ema
       JOIN employee_assignments ea ON ea.id = ema."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ema."companyId" = $1 AND ema.period = $2
       ORDER BY e.name`,
      [scope.companyId, month]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

// ─── Leave requests general PATCH/DELETE ──────────────────────
router.patch("/leave-requests/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل طلبات الإجازة مقصور على HR أو المالك");
    }
    const { status, reason } = req.body as any;
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
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE hr_leave_requests SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) {
      throw new NotFoundError("طلب الإجازة غير موجود");
    }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

/**
 * Cancel an approved leave request — restores balance, cancels obligations.
 * Use when leave is no longer needed (e.g. employee returned early, emergency).
 */
router.post("/leave-requests/:id/cancel", requirePermission("hr:update"), async (req, res) => {
  // P3.2 pilot — this endpoint is the unification plan's reference
  // implementation for how a cancel handler should look after adoption:
  //   - structured errors via the P0.3 TypedError hierarchy
  //   - one thrown error per failure reason, no `res.status().json()` calls
  //   - handleRouteError translates the TypedError to the exact
  //     { error, code, field?, fix? } shape the frontend's
  //     PageErrorBoundary + useApiMutation(.onFieldError) expect
  // Leaves approve/reject untouched for now — they need a separate
  // multi-stage refactor that's tracked under P3.x follow-ups.
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body || {};
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
       WHERE lr.id = $1 AND lr."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!request) {
      throw new NotFoundError("طلب الإجازة غير موجود");
    }
    const isOwn = request.employeeId === scope.employeeId;
    if (!isOwn && !["hr_manager", "general_manager", "owner"].includes(scope.role)) {
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

    // Restore balance if was approved (used → 0, or reduce used by days)
    if (request.status === "approved") {
      const year = new Date(request.startDate).getFullYear();
      await rawExecute(
        `UPDATE hr_leave_balances
           SET used = GREATEST(used - $1, 0)
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
      );
      // Clear attendance 'on_leave' records for future dates
      await rawExecute(
        `DELETE FROM attendance
         WHERE "companyId" = $1 AND status = 'on_leave' AND notes LIKE $2
           AND date >= CURRENT_DATE AND date BETWEEN $3 AND $4`,
        [scope.companyId, `%طلب رقم ${id}%`, request.startDate, request.endDate]
      ).catch(() => {});
    } else if (request.status === "pending") {
      // Release reserved balance
      const year = new Date(request.startDate).getFullYear();
      await rawExecute(
        `UPDATE hr_leave_balances
           SET reserved = GREATEST(reserved - $1, 0)
         WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [request.days, scope.companyId, request.employeeId, request.leaveTypeId, year]
      );
    }

    await rawExecute(
      `UPDATE hr_leave_requests SET status = 'cancelled', notes = COALESCE(notes,'') || ' | إلغاء: ' || $1 WHERE id = $2`,
      [b.reason, id]
    );

    // Cancel return-to-work obligation
    await cancelObligation(scope.companyId, "hr_leave_request", id);

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "leave.cancelled",
      entity: "hr_leave_requests",
      entityId: id,
      details: `إلغاء إجازة #${id}: ${b.reason}`,
    }).catch(console.error);

    res.json({ message: "تم إلغاء الإجازة", status: "cancelled", reason: b.reason });
  } catch (err) { handleRouteError(err, res, "Cancel leave error:"); }
});

router.delete("/leave-requests/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [leaveReq] = await rawQuery<any>(
      `SELECT lr.id, lr."employeeId", lr."leaveTypeId", lr.days, lr."startDate", lr.status
       FROM hr_leave_requests lr WHERE lr.id = $1 AND lr."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!leaveReq) throw new NotFoundError("طلب الإجازة غير موجود");
    const isOwnRequest = leaveReq.employeeId === scope.employeeId;
    if (!isOwnRequest && !["hr_manager", "general_manager", "owner"].includes(scope.role)) {
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

    const [row] = await rawQuery<any>(
      `DELETE FROM hr_leave_requests WHERE id = $1 AND "companyId" = $2 AND status = 'pending' RETURNING id`,
      [id, scope.companyId]
    );
    if (!row) {
      // Race: the request was either decided or deleted between the SELECT
      // and the DELETE. Same NotFoundError shape as everywhere else.
      throw new NotFoundError("طلب الإجازة غير موجود أو لا يمكن حذفه (تمت معالجته)");
    }

    // Deleting a pending leave request must release the reserved balance so
    // the employee can use those days again. Previously deletion left orphan
    // reservations that silently capped leave availability.
    const year = new Date(leaveReq.startDate).getFullYear();
    await rawExecute(
      `UPDATE hr_leave_balances
       SET reserved = GREATEST(reserved - $1, 0)
       WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
      [leaveReq.days, scope.companyId, leaveReq.employeeId, leaveReq.leaveTypeId, year]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "hr_leave_requests", entityId: id,
      before: { employeeId: leaveReq.employeeId, days: leaveReq.days, status: "pending" },
      after: { status: "deleted" },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "leave.deleted", entity: "hr_leave_requests", entityId: id,
      details: `حذف طلب إجازة — ${leaveReq.days} أيام — رصيد مُحرّر`,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Payroll PATCH/DELETE ──────────────────────
router.patch("/payroll/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "finance_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل الرواتب مقصور على HR أو المالية أو المالك");
    }
    const { status } = req.body as any;

    const [existing] = await rawQuery<any>(
      `SELECT id, status, period, "totalNet" FROM payroll_runs WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(req.params.id), scope.companyId]
    );
    if (!existing) throw new NotFoundError("دورة الرواتب غير موجودة");

    if (status === "posted" && existing.status !== "posted") {
      const period = existing.period;
      const totalNet = Number(existing.totalNet ?? 0);

      const lines = await rawQuery<any>(
        `SELECT pl."employeeId", pl."gosiEmployee", pl."gosiEmployer", pl.basic, pl."grossSalary", pl."netSalary"
         FROM payroll_lines pl WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL`,
        [Number(req.params.id)]
      );

      const totalGross = lines.reduce((s: number, l: any) => s + Number(l.grossSalary ?? l.basic ?? 0), 0);
      const totalGosiEmployee = lines.reduce((s: number, l: any) => s + Number(l.gosiEmployee ?? 0), 0);
      const totalGosiEmployer = lines.reduce((s: number, l: any) => s + Number(l.gosiEmployer ?? 0), 0);
      const totalGosiPayable = totalGosiEmployee + totalGosiEmployer;
      const totalBankPayout = Math.max(0, totalNet);

      const [salaryExpenseCode, gosiExpenseCode, bankCode, gosiPayableCode] = await Promise.all([
        getAccountCodeFromMapping(scope.companyId, "payroll_salary_expense", "debit", "5100"),
        getAccountCodeFromMapping(scope.companyId, "payroll_gosi_expense", "debit", "5110"),
        getAccountCodeFromMapping(scope.companyId, "payroll_bank_payout", "credit", "1100"),
        getAccountCodeFromMapping(scope.companyId, "payroll_gosi_payable", "credit", "2200"),
      ]);

      const jlLines = [
        { code: salaryExpenseCode, debit: totalGross, credit: 0, desc: "مصاريف رواتب" },
        { code: gosiExpenseCode, debit: Math.round(totalGosiEmployer * 100) / 100, credit: 0, desc: "تأمينات اجتماعية صاحب عمل" },
        { code: bankCode, debit: 0, credit: totalBankPayout, desc: "صرف رواتب — بنك" },
        { code: gosiPayableCode, debit: 0, credit: Math.round(totalGosiPayable * 100) / 100, desc: "تأمينات اجتماعية مستحقة" },
      ].filter(l => l.debit > 0 || l.credit > 0);

      const totalJeDebit = jlLines.reduce((s, l) => s + l.debit, 0);
      const totalJeCredit = jlLines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalJeDebit - totalJeCredit) > 0.01) {
        throw new ValidationError(
          `لا يمكن ترحيل الرواتب: القيد المحاسبي غير متوازن (مدين=${totalJeDebit.toFixed(2)} ≠ دائن=${totalJeCredit.toFixed(2)})`,
          { meta: { totalJeDebit, totalJeCredit } },
        );
      }

      await withTransaction(async (client) => {
        const runRes = await client.query(
          `UPDATE payroll_runs SET status = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *`,
          [status, Number(req.params.id), scope.companyId]
        );
        if (!runRes.rows[0]) throw new Error("دورة الرواتب غير موجودة");

        const jeRef = `PAYROLL-POST-${period}`;
        const jeRes = await client.query(
          `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"sourceType","sourceId")
           VALUES ($1,$2,$3,$4,$5,'payroll','payroll_run',$6) RETURNING id`,
          [scope.companyId, scope.branchId, scope.activeAssignmentId, jeRef, `قيد إقفال رواتب ${period}`, Number(req.params.id)]
        );
        const journalId = jeRes.rows[0].id;

        for (const l of jlLines) {
          const accRes = await client.query(
            `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 LIMIT 1`,
            [scope.companyId, l.code]
          );
          await client.query(
            `INSERT INTO journal_lines ("journalId","accountCode","accountId",debit,credit,description) VALUES ($1,$2,$3,$4,$5,$6)`,
            [journalId, l.code, accRes.rows[0]?.id ?? null, l.debit, l.credit, l.desc]
          );
        }
      });

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
              entityId: Number(req.params.id),
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
            entityId: Number(req.params.id),
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
      } catch (obErr) { console.error("Payroll obligation registration failed:", obErr); }

      await emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "payroll.posted",
        entity: "payroll_runs",
        entityId: Number(req.params.id),
        details: `ترحيل رواتب ${period}: صافي ${totalBankPayout.toFixed(2)} / GOSI ${totalGosiPayable.toFixed(2)}`,
      }).catch(console.error);

      const [row] = await rawQuery<any>(
        `SELECT * FROM payroll_runs WHERE id = $1`,
        [Number(req.params.id)]
      );
      res.json(row);
      return;
    }

    const [row] = await rawQuery<any>(
      `UPDATE payroll_runs SET status = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL RETURNING *`,
      [status, Number(req.params.id), scope.companyId]
    );
    if (!row) throw new NotFoundError("دورة الرواتب غير موجودة");

    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/payroll/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف الرواتب مقصور على HR أو المالك");
    }
    const id = Number(req.params.id);
    const [exists] = await rawQuery<any>(
      `SELECT id, status, period, "totalNet" FROM payroll_runs WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]
    );
    if (!exists) throw new NotFoundError("دورة الرواتب غير موجودة");
    if (exists.status === "posted") {
      throw new ConflictError("لا يمكن حذف دورة رواتب تم ترحيلها");
    }
    await withTransaction(async (client) => {
      await client.query(`UPDATE payroll_lines SET "deletedAt" = NOW() WHERE "runId" = $1 AND "deletedAt" IS NULL`, [id]);
      await client.query(`UPDATE payroll_runs SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    });

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "payroll_runs", entityId: id,
      before: { period: exists.period, status: exists.status, totalNet: exists.totalNet },
      after: { status: "deleted" },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "payroll.deleted", entity: "payroll_runs", entityId: id,
      details: `حذف دورة رواتب ${exists.period}`,
    }).catch(console.error);

    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Performance PATCH/DELETE ──────────────────────
router.patch("/performance/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "branch_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل التقييمات مقصور على HR أو المدير أو المالك");
    }
    const { overallScore, score, comments, feedback, status, strengths, improvements, goals } = req.body as any;
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
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE performance_reviews SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("التقييم غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Patch performance error:"); }
});

router.delete("/performance/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف التقييمات مقصور على HR أو المالك");
    }
    const [row] = await rawQuery<any>(
      `DELETE FROM performance_reviews WHERE id = $1 AND "companyId" = $2 RETURNING id`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) throw new NotFoundError("التقييم غير موجود");
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Violations DELETE ──────────────────────
router.delete("/violations/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف المخالفات مقصور على HR أو المالك");
    }
    const [row] = await rawQuery<any>(
      `UPDATE employee_violations SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─── Official letters PATCH/DELETE ──────────────────────
router.patch("/official-letters/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "branch_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: تعديل الخطابات مقصور على HR أو المدير أو المالك");
    }
    const { subject, content, status, type } = req.body as any;
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
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE official_letters SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("الخطاب غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.delete("/official-letters/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: حذف الخطابات مقصور على HR أو المالك");
    }
    const [row] = await rawQuery<any>(
      `DELETE FROM official_letters WHERE id = $1 AND "companyId" = $2 RETURNING id`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) throw new NotFoundError("الخطاب غير موجود");
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.patch("/official-letters/:id/approve", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const HR_APPROVAL_ROLES = ["hr_manager", "branch_manager", "general_manager", "owner"];
    if (!HR_APPROVAL_ROLES.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: لا تملك صلاحية اعتماد الخطابات");
    }
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [letter] = await rawQuery<any>(
      `SELECT * FROM official_letters WHERE id = $1 AND "companyId" = $2`,
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
         WHERE id = $2`,
        [newStatus, Number(id), scope.userId]
      );
    } else {
      await rawExecute(
        `UPDATE official_letters SET status = $1 WHERE id = $2`,
        [newStatus, Number(id)]
      );
    }

    // If the letter was rejected or returned, cancel any queued dispatches
    // so the queue worker doesn't send it after the fact.
    if (newStatus === "rejected" || newStatus === "returned") {
      await rawExecute(
        `UPDATE email_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
          WHERE "refType"='official_letter' AND "refId"=$1 AND status='pending'`,
        [Number(id)]
      ).catch((e) => console.error("cancel email_queue for rejected letter failed:", e));
      await rawExecute(
        `UPDATE whatsapp_queue SET status='cancelled', "errorMessage"='تم رفض الخطاب الرسمي', "updatedAt"=NOW()
          WHERE "refType"='official_letter' AND "refId"=$1 AND status='pending'`,
        [Number(id)]
      ).catch(() => { /* whatsapp_queue may not exist */ });

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
          WHERE ol.id = $1`,
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
        }).catch((e) => console.error("notify letter creator failed:", e));
      }
    }

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('official_letter',$1,$2,$3,$4,$5)`,
        [Number(id), newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

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

    res.json({ id: Number(id), status: newStatus });
  } catch (err) { handleRouteError(err, res, "خطأ في اعتماد الخطاب"); }
});

// ─── HR Stats ──────────────────────
router.get("/stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [empCount] = await rawQuery<any>(
      `SELECT COUNT(DISTINCT ea."employeeId") AS count FROM employee_assignments ea WHERE ea."companyId" = $1`,
      [scope.companyId]
    );
    const [leaveCount] = await rawQuery<any>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER(WHERE status='pending') AS pending,
              COUNT(*) FILTER(WHERE status='approved') AS approved
       FROM hr_leave_requests WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const [violationCount] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM employee_violations WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [payrollCount] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM payroll_runs WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
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

router.get("/deductions", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    const rows = await rawQuery<any>(
      `SELECT ad.*, e.name AS "employeeName"
       FROM attendance_deductions ad
       JOIN employee_assignments ea ON ea.id = ad."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ad."companyId" = $1 AND ad.period = $2
       ORDER BY ad."createdAt" DESC`,
      [scope.companyId, month]
    );
    res.json({ data: rows, total: rows.length });
  } catch (_e) { console.error("HR endpoint error:", _e); res.json({ data: [], total: 0 }); }
});

router.get("/onboarding-steps", requirePermission("hr:read"), async (req, res) => {
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
  } catch (e) { console.error("HR endpoint error:", e); res.json({ data: [] }); }
});

router.put("/onboarding-steps", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!['owner', 'general_manager', 'hr_manager'].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح بتعديل إعدادات التهيئة");
    }
    const { steps } = req.body as { steps: string[] };
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
    res.json({ data: steps });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPACT PREVIEW — preview the effects of HR actions before approval
// ─────────────────────────────────────────────────────────────────────────────

router.post("/impact-preview/leave", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, leaveTypeId, startDate, endDate, days } = req.body as any;
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      throw new ValidationError("بيانات غير مكتملة");
    }
    const [assignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
      [Number(employeeId), scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");
    const daysCount = days ?? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    const impact = await computeLeaveImpact(scope.companyId, Number(employeeId), assignment.id, Number(leaveTypeId), startDate, endDate, daysCount);
    res.json(impact);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب الأثر"); }
});

router.post("/impact-preview/termination", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.body as any;
    if (!employeeId) {
      throw new ValidationError("معرف الموظف مطلوب", { field: "employeeId" });
    }
    const [assignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
      [Number(employeeId), scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");
    const impact = await computeTerminationImpact(scope.companyId, Number(employeeId), assignment.id);
    res.json(impact);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب الأثر"); }
});

router.post("/impact-preview/violation", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId, deduction = 0, severity = "medium" } = req.body as any;
    if (!employeeId) {
      throw new ValidationError("معرف الموظف مطلوب", { field: "employeeId" });
    }
    const [assignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
      [Number(employeeId), scope.companyId]
    );
    if (!assignment) throw new NotFoundError("الموظف غير موجود");
    const impact = await computeViolationImpact(scope.companyId, Number(employeeId), assignment.id, Number(deduction), severity);
    res.json(impact);
  } catch (err) { handleRouteError(err, res, "خطأ في حساب الأثر"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE OPERATIONAL STATUS — live state calculation
// ─────────────────────────────────────────────────────────────────────────────

router.get("/employee-status/:employeeId", requirePermission("hr:read"), async (req, res) => {
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

router.get("/employees-status", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const employees = await rawQuery<any>(
      `SELECT e.id AS "employeeId", ea.id AS "assignmentId"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
       WHERE e.status = 'active'`,
      [scope.companyId]
    );

    const { computeEmployeeOperationalStatus } = await import("../lib/impactPreview.js");
    const statuses = await Promise.all(
      employees.map(async (emp: any) => {
        try {
          const s = await computeEmployeeOperationalStatus(scope.companyId, emp.employeeId, emp.assignmentId);
          return { employeeId: emp.employeeId, ...s };
        } catch {
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

const HR_ROLES = ["hr_manager", "owner", "general_manager"] as const;
const MGR_ROLES = ["branch_manager", "hr_manager", "owner", "general_manager"] as const;

function isHR(scope: { role: string }): boolean {
  return (HR_ROLES as readonly string[]).includes(scope.role);
}
function isMgr(scope: { role: string }): boolean {
  return (MGR_ROLES as readonly string[]).includes(scope.role);
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
  const today = new Date().toISOString().split("T")[0]!;
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
            COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') AS documented
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
router.get("/evaluation-cycles", requirePermission("hr:read"), async (req, res) => {
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
    } else if (["branch_manager", "general_manager"].includes(scope.role)) {
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
router.post("/evaluation-cycles", requirePermission("hr:create"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    if (!isHR(scope)) {
      throw new ForbiddenError("مسموح فقط لـ HR بإنشاء دورات التقييم");
    }

    const { employeeId, period, notes, participants = [] } = req.body as any;
    if (!employeeId || !period) {
      throw new ValidationError("employeeId و period مطلوبان", {
        field: employeeId ? "period" : "employeeId",
      });
    }

    // Validate subject employee belongs to this company (multi-tenant integrity)
    const [subjectAssign] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 LIMIT 1`,
      [employeeId, scope.companyId]
    );
    if (!subjectAssign) {
      throw new ValidationError("الموظف لا ينتمي إلى هذه الشركة", { field: "employeeId" });
    }

    // Create the cycle
    const { insertId: cycleId } = await rawExecute(
      `INSERT INTO evaluation_cycles ("companyId","employeeId","initiatorId",period,status,notes,"startDate")
       VALUES ($1,$2,$3,$4,'open',$5,CURRENT_DATE)`,
      [scope.companyId, employeeId, scope.employeeId ?? null, period, notes ?? null]
    );

    // Register participants — validate each belongs to this company before inserting
    // validRoles must match the DB CHECK constraint: ('manager','peer')
    const validRoles = new Set(["manager", "peer"]);
    for (const p of participants as Array<{ evaluatorId: number; evaluatorRole: string }>) {
      if (!p.evaluatorId || !validRoles.has(p.evaluatorRole)) continue;
      const [participantAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 LIMIT 1`,
        [p.evaluatorId, scope.companyId]
      );
      if (!participantAssign) continue; // silently skip cross-company IDs
      await rawExecute(
        `INSERT INTO evaluation_participants ("cycleId","companyId","evaluatorId","evaluatorRole")
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [cycleId, scope.companyId, p.evaluatorId, p.evaluatorRole]
      );
    }

    // Auto-generate system evaluation
    const evalData = await computeSystemEvaluation(scope.companyId, employeeId);
    await rawExecute(
      `INSERT INTO system_evaluations ("cycleId","companyId","employeeId","attendanceScore","taskCompletionScore","onTimeScore","clientSatScore","docQualityScore","overallScore",metrics)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cycleId, scope.companyId, employeeId,
       evalData.attendanceScore, evalData.taskCompletionScore,
       evalData.onTimeScore, evalData.clientSatScore, evalData.docQualityScore,
       evalData.overallScore, JSON.stringify(evalData.metrics)]
    );

    // Initialize summary
    await recomputeSummary(cycleId, scope.companyId, employeeId);

    // Update cycle status
    await rawExecute(`UPDATE evaluation_cycles SET status='in_progress' WHERE id=$1`, [cycleId]);

    res.status(201).json({ id: cycleId, period, employeeId, status: 'in_progress', systemEval: evalData });
  } catch (err) { handleRouteError(err, res, "خطأ في بدء دورة التقييم"); }
});

// GET /hr/evaluation-cycles/:id — get cycle details (access-controlled)
router.get("/evaluation-cycles/:id", requirePermission("hr:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = Number(req.params.id);

    const [cycle] = await rawQuery<any>(
      `SELECT ec.*, e.name AS "employeeName", e."empNumber", e."jobTitle"
       FROM evaluation_cycles ec
       JOIN employees e ON e.id = ec."employeeId"
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
    } else if (["branch_manager", "general_manager"].includes(scope.role)) {
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
      `SELECT pe.*, e.name AS "evaluatorName", e."jobTitle" AS "evaluatorTitle"
       FROM peer_evaluations pe
       JOIN employees e ON e.id = pe."evaluatorId"
       WHERE pe."cycleId" = $1`,
      [cycleId]
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
router.get("/evaluation-cycles/:id/system-report", requirePermission("hr:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = Number(req.params.id);

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
    } else if (["branch_manager", "general_manager"].includes(scope.role)) {
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
router.post("/evaluation-cycles/:id/peer-evaluation", requirePermission("hr:create"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = Number(req.params.id);
    const { overallScore, scores, comments } = req.body as any;

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
    } else if (["branch_manager", "general_manager"].includes(scope.role)) {
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

    const { insertId } = await rawExecute(
      `INSERT INTO peer_evaluations ("cycleId","companyId","evaluatorId","employeeId","evaluatorRole","overallScore",scores,comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT ("cycleId","evaluatorId") DO UPDATE SET
         "evaluatorRole"=$5,"overallScore"=$6,scores=$7,comments=$8`,
      [cycleId, scope.companyId, evaluatorId, cycle.employeeId, evaluatorRole, overallScore,
       scores ? JSON.stringify(scores) : null, comments ?? null]
    );

    // Mark participant as submitted — no participant record is valid for HR/manager paths
    await rawExecute(
      `UPDATE evaluation_participants SET "hasSubmitted"=true,"submittedAt"=NOW()
       WHERE "cycleId"=$1 AND "evaluatorId"=$2`,
      [cycleId, evaluatorId]
    );

    await recomputeSummary(cycleId, scope.companyId, cycle.employeeId);

    res.status(201).json({ id: insertId, cycleId, evaluatorId, evaluatorRole, overallScore });
  } catch (err) { handleRouteError(err, res, "خطأ في إرسال التقييم"); }
});

// POST /hr/evaluation-cycles/:id/upward-review — anonymous upward review (employee rates manager)
router.post("/evaluation-cycles/:id/upward-review", requirePermission("hr:create"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = Number(req.params.id);
    const { managerId, overallScore, scores, comments } = req.body as any;

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
    const crypto = await import("crypto");
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

    res.status(201).json({ id: insertId, cycleId, anonymous: true, message: "تم إرسال التقييم بنجاح — هويتك محمية" });
  } catch (err) { handleRouteError(err, res, "خطأ في إرسال التقييم العكسي"); }
});

// GET /hr/evaluation-cycles/:id/summary — get 360 summary
router.get("/evaluation-cycles/:id/summary", requirePermission("hr:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const cycleId = Number(req.params.id);

    const [cycle] = await rawQuery<any>(
      `SELECT ec.*, e.name AS "employeeName", e."jobTitle"
       FROM evaluation_cycles ec
       JOIN employees e ON e.id = ec."employeeId"
       WHERE ec.id = $1 AND ec."companyId" = $2`,
      [cycleId, scope.companyId]
    );
    if (!cycle) throw new NotFoundError("دورة التقييم غير موجودة");

    // Access check (same branch-scoped rules as detail endpoint)
    if (isHR(scope)) {
      // unrestricted
    } else if (["branch_manager", "general_manager"].includes(scope.role)) {
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
      `SELECT * FROM evaluation_summaries WHERE "cycleId" = $1`, [cycleId]
    );

    if (!summary) {
      await recomputeSummary(cycleId, scope.companyId, cycle.employeeId);
      [summary] = await rawQuery<any>(`SELECT * FROM evaluation_summaries WHERE "cycleId" = $1`, [cycleId]);
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
router.get("/employees/:id/evaluation-history", requirePermission("hr:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const employeeId = Number(req.params.id);

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
    } else if (["branch_manager", "general_manager"].includes(scope.role)) {
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
       ORDER BY ec."startDate" ASC`,
      [scope.companyId, employeeId]
    );

    res.json({
      employee: { name: empAssign.name, empNumber: empAssign.empNumber, jobTitle: empAssign.jobTitle },
      history: cycles,
    });
  } catch (err) { handleRouteError(err, res, "خطأ في جلب تاريخ التقييمات"); }
});

// GET /hr/upward-reviews/manager/:managerId — aggregated upward reviews for a manager (HR only)
router.get("/upward-reviews/manager/:managerId", requirePermission("hr:read"), async (req, res): Promise<any> => {
  try {
    const scope = req.scope!;
    const managerId = Number(req.params.managerId);

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

router.get("/delegations", requirePermission("hr:read"), async (req, res) => {
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
    ).catch(() => [] as any[]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { res.json({ data: [], total: 0 }); }
});

router.post("/delegations", requirePermission("hr:approve"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { delegateId, scope: delegationScope, reason, startDate, endDate } = req.body;
    const [emp] = await rawQuery<any>(
      `SELECT id FROM employees WHERE "userId" = $1 LIMIT 1`,
      [scope.userId]
    );
    if (!emp) throw new ValidationError("لم يتم العثور على الموظف المرتبط بحسابك");
    const r = await rawExecute(
      `INSERT INTO delegations ("delegatorId","delegateId","companyId",scope,reason,status,"startDate","endDate") VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`,
      [emp.id, delegateId, scope.companyId, delegationScope || "عام", reason, startDate || new Date(), endDate || null]
    ).catch(() => ({ insertId: null }));
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) { handleRouteError(err, res, "خطأ في إنشاء التفويض"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC HOLIDAYS — تقويم الإجازات الرسمية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/public-holidays", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { year } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (year) { params.push(Number(year)); conditions.push(`year = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT * FROM public_holidays WHERE ${conditions.join(" AND ")} ORDER BY "startDate"`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Public holidays error:"); }
});

router.post("/public-holidays", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: إدارة الإجازات الرسمية مقصورة على HR أو المالك");
    }
    const b = req.body;
    if (!b.name || !b.startDate) {
      throw new ValidationError("اسم العطلة وتاريخ البداية مطلوبان", {
        field: !b.name ? "name" : "startDate",
      });
    }
    const startDate = new Date(b.startDate);
    const year = b.year || startDate.getFullYear();
    const { insertId } = await rawExecute(
      `INSERT INTO public_holidays ("companyId",name,"startDate","endDate",year,type,description,"isRecurring")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, b.name, b.startDate, b.endDate || b.startDate, year,
       b.type || 'national', b.description || null, b.isRecurring || false]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM public_holidays WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create holiday error:"); }
});

router.patch("/public-holidays/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح");
    }
    const id = Number(req.params.id);
    const b = req.body;
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
    const rows = await rawQuery<any>(
      `UPDATE public_holidays SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("العطلة غير موجودة");
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update holiday error:"); }
});

router.delete("/public-holidays/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("غير مصرح");
    }
    await rawExecute(`DELETE FROM public_holidays WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    res.json({ message: "تم حذف العطلة" });
  } catch (err) { handleRouteError(err, res, "Delete holiday error:"); }
});

// Check if a date is a public holiday
router.get("/public-holidays/check", requirePermission("hr:read"), async (req, res) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE TRANSFERS — نقل الموظف بين الفروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/transfers", requirePermission("hr:read"), async (req, res) => {
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
       ORDER BY t."createdAt" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Transfers error:"); }
});

router.post("/transfers", requirePermission("hr:create"), async (req, res) => {
  // Step 3 of the HR operational audit — transfer request creation.
  // Converts the 2 raw res.status(...) error sites to typed throws and
  // adds a pre-check that the destination branch actually exists in the
  // same company. Also emits `hr.transfer.requested` so the HR inbox
  // audit log sees new transfer requests (was relying only on the
  // side-effect notification).
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.employeeId) {
      throw new ValidationError("الموظف مطلوب", {
        field: "employeeId",
        fix: "اختر الموظف المراد نقله من قائمة الموظفين.",
      });
    }
    if (!b.toBranchId) {
      throw new ValidationError("الفرع المستقبل مطلوب", {
        field: "toBranchId",
        fix: "اختر الفرع المستقبل من قائمة فروع الشركة.",
      });
    }
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

    const [row] = await rawQuery<any>(`SELECT * FROM employee_transfers WHERE id=$1`, [insertId]);

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
      }).catch(console.error);
    }

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
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create transfer error:"); }
});

// ── Step 1: HR Manager approves → notifies receiving branch manager ──
router.patch("/transfers/:id/approve", requirePermission("hr:update"), async (req, res) => {
  // Step 3 of the HR operational audit — HR approval step of a transfer.
  // Converts 2 raw res.status error sites to typed throws and emits a
  // canonical `hr.transfer.hr_approved` / `hr.transfer.rejected` event
  // so the audit trail sees every HR decision on a transfer.
  try {
    const scope = req.scope!;
    if (!["hr_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError("هذه الخطوة محصورة بمدير الموارد البشرية أو المدير العام", {
        fix: "اطلب من مدير الموارد البشرية اتخاذ القرار.",
      });
    }
    const id = Number(req.params.id);
    const { approved, notes } = req.body as any;
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
      // HR approved — move to pending_receiving_manager for the destination branch manager to confirm
      await rawExecute(
        `UPDATE employee_transfers SET status='pending_receiving_manager',"approvedBy"=$1,"approvedAt"=NOW(),notes=COALESCE($2,notes) WHERE id=$3`,
        [scope.employeeId, notes || null, id]
      );

      // Notify the receiving branch manager
      const [receivingMgr] = await rawQuery<any>(
        `SELECT ea.id FROM employee_assignments ea
         WHERE ea."companyId"=$1 AND ea."branchId"=$2
           AND ea.role IN ('branch_manager','general_manager','owner') AND ea.status='active'
         ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
        [scope.companyId, transfer.toBranchId]
      );
      if (receivingMgr) {
        createNotification({
          companyId: scope.companyId, assignmentId: receivingMgr.id,
          type: "transfer_receiving_approval", title: "طلب استقبال موظف منقول",
          body: `يحتاج استلام موظف منقول إلى فرعك — يرجى المراجعة والتأكيد`,
          priority: "high", refType: "employee_transfer", refId: id,
        }).catch(console.error);
      }

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "hr.transfer.hr_approved",
        entity: "employee_transfers",
        entityId: id,
        before: { status: "pending" },
        after: { status: "pending_receiving_manager", approvedBy: scope.employeeId },
        reason: notes ?? undefined,
      }).catch(console.error);
    } else {
      await rawExecute(
        `UPDATE employee_transfers SET status='rejected',"approvedBy"=$1,"approvedAt"=NOW(),notes=COALESCE($2,notes) WHERE id=$3`,
        [scope.employeeId, notes || null, id]
      );
      // Notify employee of rejection
      const [empAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
        [transfer.employeeId, scope.companyId]
      );
      if (empAssign) {
        createNotification({
          companyId: scope.companyId, assignmentId: empAssign.id,
          type: "transfer_decision", title: "تم رفض طلب النقل",
          body: notes || "تم رفض طلب النقل من قبل مدير الموارد البشرية",
          priority: "high", refType: "employee_transfer", refId: id,
        }).catch(console.error);
      }

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "hr.transfer.rejected",
        entity: "employee_transfers",
        entityId: id,
        before: { status: "pending" },
        after: { status: "rejected", approvedBy: scope.employeeId },
        reason: notes ?? undefined,
      }).catch(console.error);
    }

    const [row] = await rawQuery<any>(`SELECT * FROM employee_transfers WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Approve transfer error:"); }
});

// ── Step 2: Receiving branch manager confirms the transfer ──
router.patch("/transfers/:id/receive", requirePermission("hr:update"), async (req, res) => {
  // Step 3 of the HR operational audit — receiving branch manager confirms
  // (or rejects) a transfer the HR manager has already approved.
  // Converts 3 raw res.status error sites to typed throws and emits the
  // canonical `hr.transfer.completed` / `hr.transfer.rejected_by_receiver`
  // event so the audit trail sees the final disposition.
  try {
    const scope = req.scope!;
    if (!["branch_manager", "general_manager", "owner"].includes(scope.role)) {
      throw new ForbiddenError(
        "استقبال الموظف المنقول محصور بمدير الفرع أو المدير العام",
        { fix: "اطلب من مدير الفرع تنفيذ الاستقبال." }
      );
    }
    const id = Number(req.params.id);
    const { confirmed, notes } = req.body as any;
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
      await rawExecute(
        `UPDATE employee_assignments SET "branchId"=$1,"departmentId"=$2,"jobTitle"=$3,salary=$4 WHERE "employeeId"=$5 AND "companyId"=$6 AND status='active'`,
        [newBranchId, newDeptId, newJobTitle, newSalary, transfer.employeeId, scope.companyId]
      );
      await rawExecute(
        `UPDATE employee_transfers SET status='approved',"receivedBy"=$1,"receivedAt"=NOW(),notes=COALESCE($2,notes) WHERE id=$3`,
        [scope.employeeId, notes || null, id]
      );

      // Notify employee of final approval
      const [empAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
        [transfer.employeeId, scope.companyId]
      );
      if (empAssign) {
        createNotification({
          companyId: scope.companyId, assignmentId: empAssign.id,
          type: "transfer_decision", title: "تم اعتماد نقلك وتفعيله",
          body: notes || "تمت الموافقة على نقلك وتم تحديث بياناتك",
          priority: "high", refType: "employee_transfer", refId: id,
        }).catch(console.error);
      }

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "hr.transfer.completed",
        entity: "employee_transfers",
        entityId: id,
        before: {
          status: "pending_receiving_manager",
          branchId: transfer.fromBranchId,
          departmentId: transfer.fromDeptId,
          jobTitle: transfer.fromJobTitle,
          salary: transfer.fromSalary,
        },
        after: {
          status: "approved",
          branchId: newBranchId,
          departmentId: newDeptId,
          jobTitle: newJobTitle,
          salary: newSalary,
        },
        reason: notes ?? undefined,
      }).catch(console.error);
    } else {
      await rawExecute(
        `UPDATE employee_transfers SET status='rejected_by_receiver',"receivedBy"=$1,"receivedAt"=NOW(),notes=COALESCE($2,notes) WHERE id=$3`,
        [scope.employeeId, notes || null, id]
      );

      // Notify employee — previously silent if receiver declined, which
      // left the employee without feedback. Also notify the original HR
      // manager so they know the receiving branch declined.
      const [empAssign] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
        [transfer.employeeId, scope.companyId]
      );
      if (empAssign) {
        createNotification({
          companyId: scope.companyId, assignmentId: empAssign.id,
          type: "transfer_decision", title: "رفض الفرع المستقبل طلب نقلك",
          body: notes || "رفض مدير الفرع المستقبل استقبالك. راجع الموارد البشرية.",
          priority: "high", refType: "employee_transfer", refId: id,
        }).catch(console.error);
      }

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "hr.transfer.rejected_by_receiver",
        entity: "employee_transfers",
        entityId: id,
        before: { status: "pending_receiving_manager" },
        after: { status: "rejected_by_receiver", receivedBy: scope.employeeId },
        reason: notes ?? undefined,
      }).catch(console.error);
    }

    const [row] = await rawQuery<any>(`SELECT * FROM employee_transfers WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Receive transfer error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL DEVELOPMENT PLANS (IDP) — خطة التطوير الفردي
// ─────────────────────────────────────────────────────────────────────────────

router.get("/idp", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.query as any;
    const conditions = [`idp."companyId"=$1`];
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
       ORDER BY idp."createdAt" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "IDP list error:"); }
});

router.post("/idp", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.employeeId) throw new ValidationError("الموظف مطلوب", { field: "employeeId" });
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
    const [row] = await rawQuery<any>(`SELECT * FROM employee_development_plans WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create IDP error:"); }
});

router.patch("/idp/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
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
    const rows = await rawQuery<any>(
      `UPDATE employee_development_plans SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("خطة التطوير غير موجودة");
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update IDP error:"); }
});

router.delete("/idp/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    await rawExecute(`DELETE FROM employee_development_plans WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    res.json({ message: "تم حذف خطة التطوير" });
  } catch (err) { handleRouteError(err, res, "Delete IDP error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// END OF SERVICE GRATUITY — مكافأة نهاية الخدمة
// ─────────────────────────────────────────────────────────────────────────────

router.get("/gratuity/:employeeId", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = Number(req.params.employeeId);
    const { terminationType, terminationDate } = req.query as any;

    const [assignment] = await rawQuery<any>(
      `SELECT ea.salary, ea."startDate", ea."jobTitle",
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

    const finalGratuity = Math.round(gratuity * reductionFactor * 100) / 100;

    res.json({
      employeeName: assignment.employeeName,
      jobTitle: assignment.jobTitle,
      monthlySalary,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      yearsOfService: Math.round(yearsOfService * 100) / 100,
      terminationType: type,
      gratuityBeforeReduction: Math.round(gratuity * 100) / 100,
      reductionFactor,
      finalGratuity,
      breakdown: {
        first5Years: Math.min(yearsOfService, 5) > 0 ? Math.round((monthlySalary / 2) * Math.min(yearsOfService, 5) * 100) / 100 : 0,
        above5Years: yearsOfService > 5 ? Math.round(monthlySalary * (yearsOfService - 5) * 100) / 100 : 0,
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

router.post("/accruals/monthly", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = (req.body || {}) as { period?: string };
    const targetPeriod = period || new Date().toISOString().slice(0, 7);

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
      `SELECT ea."employeeId", ea.salary, ea."startDate",
              COALESCE(ec."startDate", ea."startDate") AS "contractStart"
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
      const leaveAccrual = Math.round(dailyRate * monthlyLeaveDays * 100) / 100;

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
      monthlyEosAccrual = Math.round(monthlyEosAccrual * 100) / 100;

      totalLeaveAccrual += leaveAccrual;
      totalEosAccrual += monthlyEosAccrual;
      breakdown.push({
        employeeId: emp.employeeId,
        salary,
        leaveAccrual,
        eosAccrual: monthlyEosAccrual,
      });
    }

    totalLeaveAccrual = Math.round(totalLeaveAccrual * 100) / 100;
    totalEosAccrual = Math.round(totalEosAccrual * 100) / 100;

    if (totalLeaveAccrual <= 0 && totalEosAccrual <= 0) {
      throw new ValidationError("لا توجد مبالغ استحقاق لاحتسابها");
    }

    const [leaveExpenseCode, leaveLiabilityCode, eosExpenseCode, eosLiabilityCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "hr_leave_accrual_expense", "debit", "5120"),
      getAccountCodeFromMapping(scope.companyId, "hr_leave_accrual_liability", "credit", "2220"),
      getAccountCodeFromMapping(scope.companyId, "hr_eos_accrual_expense", "debit", "5130"),
      getAccountCodeFromMapping(scope.companyId, "hr_eos_accrual_liability", "credit", "2230"),
    ]);

    const lines = [
      { accountCode: leaveExpenseCode, debit: totalLeaveAccrual, credit: 0 },
      { accountCode: eosExpenseCode, debit: totalEosAccrual, credit: 0 },
      { accountCode: leaveLiabilityCode, debit: 0, credit: totalLeaveAccrual },
      { accountCode: eosLiabilityCode, debit: 0, credit: totalEosAccrual },
    ].filter((l) => l.debit > 0 || l.credit > 0);

    let journalId: number | null = null;
    try {
      journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref,
        description: `استحقاقات شهرية: إجازات ${totalLeaveAccrual} + نهاية خدمة ${totalEosAccrual} (${employees.length} موظف)`,
        lines,
      });
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
      entityId: journalId,
      details: JSON.stringify({ period: targetPeriod, totalLeaveAccrual, totalEosAccrual, employeeCount: employees.length }),
    }).catch(console.error);

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
router.get("/accruals/preview", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("صيغة الفترة غير صحيحة (YYYY-MM)", { field: "period" });
    }

    const ref = `HR-ACCRUAL-${period}`;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [scope.companyId, ref]
    );

    const employees = await rawQuery<any>(
      `SELECT ea."employeeId", e.name AS "employeeName", ea.salary, ea."startDate",
              COALESCE(ec."startDate", ea."startDate") AS "contractStart"
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
      const leaveAccrual = Math.round(dailyRate * monthlyLeaveDays * 100) / 100;
      const startDate = new Date(emp.contractStart || emp.startDate);
      const yearsOfService = (periodEnd.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
      const monthlyEosAccrual = Math.round(
        (yearsOfService > 5 ? salary / 12 : salary / 24) * 100
      ) / 100;
      totalLeaveAccrual += leaveAccrual;
      totalEosAccrual += monthlyEosAccrual;
      return {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        salary,
        yearsOfService: Math.round(yearsOfService * 100) / 100,
        leaveAccrual,
        eosAccrual: monthlyEosAccrual,
      };
    });

    res.json({
      period,
      alreadyPosted: !!existing,
      existingJournalId: existing?.id ?? null,
      employeeCount: employees.length,
      totalLeaveAccrual: Math.round(totalLeaveAccrual * 100) / 100,
      totalEosAccrual: Math.round(totalEosAccrual * 100) / 100,
      total: Math.round((totalLeaveAccrual + totalEosAccrual) * 100) / 100,
      rows,
    });
  } catch (err) {
    handleRouteError(err, res, "HR accruals preview error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TURNOVER REPORT — تقرير دوران الموظفين
// ─────────────────────────────────────────────────────────────────────────────

router.get("/turnover-report", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { year } = req.query as any;
    const targetYear = year ? Number(year) : new Date().getFullYear();

    const [totalActive] = await rawQuery<any>(
      `SELECT COUNT(DISTINCT "employeeId") AS count FROM employee_assignments
       WHERE "companyId"=$1 AND status='active'`,
      [scope.companyId]
    );

    const terminated = await rawQuery<any>(
      `SELECT ec."terminationType", ec."terminationDate",
              e.name AS "employeeName", ea."departmentId", ea."branchId",
              d.name AS "deptName", b.name AS "branchName",
              EXTRACT(MONTH FROM ec."terminationDate") AS month
       FROM employee_contracts ec
       JOIN employees e ON e.id=ec."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId"=ec."employeeId" AND ea."companyId"=$1
       LEFT JOIN departments d ON d.id=ea."departmentId"
       LEFT JOIN branches b ON b.id=ea."branchId"
       WHERE ec."companyId"=$1 AND ec."terminationDate" IS NOT NULL
         AND EXTRACT(YEAR FROM ec."terminationDate")=$2`,
      [scope.companyId, targetYear]
    );

    const totalTerminated = terminated.length;
    const totalActiveCount = Number(totalActive?.count || 0);
    const avgHeadcount = Math.max(1, totalActiveCount + totalTerminated);
    const turnoverRate = Math.round((totalTerminated / avgHeadcount) * 100 * 100) / 100;

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

router.get("/expiring-documents", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days || 90);

    const workPermits = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName", e."workPermitExpiry" AS "expiryDate",
              'work_permit' AS "docType", 'تصريح العمل' AS "docLabel",
              (e."workPermitExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e."workPermitExpiry" IS NOT NULL
         AND e."workPermitExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    const iqamas = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName", e."iqamaExpiry" AS "expiryDate",
              'iqama' AS "docType", 'الإقامة' AS "docLabel",
              (e."iqamaExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e."iqamaExpiry" IS NOT NULL
         AND e."iqamaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    const passports = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName", e."passportExpiry" AS "expiryDate",
              'passport' AS "docType", 'جواز السفر' AS "docLabel",
              (e."passportExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e."passportExpiry" IS NOT NULL
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
         AND ec."endDate" IS NOT NULL
         AND ec."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
      [scope.companyId, days]
    );

    const all = [...workPermits, ...iqamas, ...passports, ...contracts]
      .sort((a: any, b: any) => Number(a.daysLeft) - Number(b.daysLeft));

    res.json({ data: all, total: all.length, criticalCount: all.filter((d: any) => Number(d.daysLeft) <= 14).length });
  } catch (err) { handleRouteError(err, res, "Expiring documents error:"); }
});

export default router;
