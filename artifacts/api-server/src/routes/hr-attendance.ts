import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  haversineDistance,
  createNotification,
  emitEvent,
  getManagerAssignmentId,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { pushToDLQ } from "../lib/eventBus.js";

export const attendanceRouter = Router();
attendanceRouter.use(authMiddleware);

attendanceRouter.post("/check-in", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const period = today.slice(0, 7);
    const { lat, lon, notes } = req.body as any;

    const [existing] = await rawQuery<any>(
      `SELECT id, "checkOut" FROM attendance WHERE "assignmentId" = $1 AND date = $2`,
      [scope.activeAssignmentId, today]
    );
    if (existing) {
      res.status(400).json({ error: "لقد سجلت الحضور اليوم. استخدم نقطة الانصراف لتسجيل المغادرة" });
      return;
    }

    const [assignment] = await rawQuery<any>(
      `SELECT ea."branchId", ea.salary, ea."employeeId", ea."departmentId",
              b.lat AS "branchLat", b.lon AS "branchLon"
       FROM employee_assignments ea
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ea.id = $1`,
      [scope.activeAssignmentId]
    );

    const [shiftAssignment] = await rawQuery<any>(
      `SELECT s.id, s."startTime", s."endTime", s.days
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
        `SELECT id, "startTime", "endTime", days FROM shifts
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

    const [activeLeave] = await rawQuery<any>(
      `SELECT id FROM hr_leave_requests
       WHERE "employeeId" = $1 AND status = 'approved'
         AND "startDate" <= $2 AND "endDate" >= $2`,
      [scope.employeeId, today]
    );
    if (activeLeave) {
      res.status(400).json({ error: "أنت في إجازة مُعتمدة اليوم. لا يمكن تسجيل الحضور.", leaveRequestId: activeLeave.id });
      return;
    }

    const [policy] = await rawQuery<any>(
      `SELECT "gpsRadiusMeters","lateThresholdMinutes",
              "penaltyLevel1","penaltyLevel2","penaltyLevel3","penaltyLevel4","penaltyLevel5",
              "penaltyLevel1Label","penaltyLevel2Label","penaltyLevel3Label","penaltyLevel4Label","penaltyLevel5Label"
       FROM attendance_policies WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const gpsRadius = policy?.gpsRadiusMeters ?? 500;
    const lateThreshold = policy?.lateThresholdMinutes ?? 15;

    let distanceMeters: number | null = null;
    let isOutOfRange = false;
    if (lat !== undefined && lat !== null && lon !== undefined && lon !== null && assignment?.branchLat && assignment?.branchLon) {
      distanceMeters = Math.round(haversineDistance(Number(lat), Number(lon), Number(assignment.branchLat), Number(assignment.branchLon)));
      isOutOfRange = distanceMeters > gpsRadius;
    }

    if (isOutOfRange) {
      await rawExecute(
        `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
         VALUES ($1,$2,'gps_out_of_range',$3,'low',0,$4)`,
        [scope.companyId, scope.activeAssignmentId, `تسجيل حضور خارج نطاق الفرع بمسافة ${distanceMeters}م`, period]
      );
    }

    let lateMinutes = 0;
    let isLate = false;
    if (shift?.startTime) {
      const parts = String(shift.startTime).split(":");
      const expected = new Date(today + "T00:00:00");
      expected.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      const diff = now.getTime() - expected.getTime();
      if (diff > 0) { lateMinutes = Math.floor(diff / 60000); isLate = lateMinutes > 0; }
    }

    const exceedsThreshold = isLate && lateMinutes > lateThreshold;

    let deductionAmount = 0;
    if (isLate && assignment?.salary) {
      const dailySalary = Number(assignment.salary) / 30;
      const minuteRate = dailySalary / 480;
      deductionAmount = Math.round(minuteRate * lateMinutes * 100) / 100;
    }

    let checkInStatus: string;
    if (!isWorkDay) {
      checkInStatus = "present_off_day";
    } else if (isOutOfRange) {
      checkInStatus = "present_out_of_range";
    } else {
      checkInStatus = "present";
    }

    const { insertId: attendanceId } = await rawExecute(
      `INSERT INTO attendance ("assignmentId","companyId","branchId",date,"checkIn","lateMinutes",status,notes,"checkInLat","checkInLon")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.activeAssignmentId, scope.companyId, assignment?.branchId ?? scope.branchId,
        today, now.toISOString(), lateMinutes, checkInStatus, notes ?? null,
        lat !== undefined && lat !== null ? Number(lat) : null,
        lon !== undefined && lon !== null ? Number(lon) : null]
    );

    if (exceedsThreshold) {
      const { insertId: vId } = await rawExecute(
        `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
         VALUES ($1,$2,'late_arrival',$3,'medium',$4,$5)`,
        [scope.companyId, scope.activeAssignmentId,
          `تأخر ${lateMinutes} دقيقة عن وقت البداية (تجاوز الحد ${lateThreshold} دقيقة)`,
          deductionAmount, period]
      );

      await rawExecute(
        `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
         VALUES ($1,$2,$3,'late',$4,$5,$6,'pending_payroll')`,
        [scope.companyId, scope.activeAssignmentId, attendanceId, lateMinutes, deductionAmount, period]
      );
    }

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

      if (count >= 10) { penaltyLevel = 5; penaltyDeduction = Number(policy?.penaltyLevel5 ?? 500); penaltyLabel = policy?.penaltyLevel5Label ?? "خصم ثلاثة أيام + إنذار نهائي"; }
      else if (count >= 7) { penaltyLevel = 4; penaltyDeduction = Number(policy?.penaltyLevel4 ?? 200); penaltyLabel = policy?.penaltyLevel4Label ?? "خصم يومين"; }
      else if (count >= 5) { penaltyLevel = 3; penaltyDeduction = Number(policy?.penaltyLevel3 ?? 100); penaltyLabel = policy?.penaltyLevel3Label ?? "خصم يوم"; }
      else if (count >= 3) { penaltyLevel = 2; penaltyDeduction = Number(policy?.penaltyLevel2 ?? 50); penaltyLabel = policy?.penaltyLevel2Label ?? "إنذار كتابي"; }
      else { penaltyLevel = 1; penaltyDeduction = Number(policy?.penaltyLevel1 ?? 0); penaltyLabel = policy?.penaltyLevel1Label ?? "إنذار شفهي"; }

      if (penaltyDeduction > 0) {
        await rawExecute(
          `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
           VALUES ($1,$2,$3,'penalty',0,$4,$5,'pending_payroll')`,
          [scope.companyId, scope.activeAssignmentId, attendanceId, penaltyDeduction, period]
        );
      }
    }

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

    if (exceedsThreshold) {
      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "late_warning", title: "تنبيه تأخر",
        body: `تم تسجيل تأخرك ${lateMinutes} دقيقة اليوم. ${penaltyLabel ? `العقوبة: ${penaltyLabel}` : ""}`,
        priority: "high", refType: "attendance", refId: attendanceId,
      }).catch((err) => pushToDLQ("notification", { type: "late_warning", assignmentId: scope.activeAssignmentId }, err, scope.companyId));

      getManagerAssignmentId(scope.companyId, scope.branchId).then((managerAssignmentId) => {
        if (managerAssignmentId) {
          createNotification({
            companyId: scope.companyId, assignmentId: managerAssignmentId,
            type: "late_arrival", title: "تأخر موظف",
            body: `تأخر الموظف ${lateMinutes} دقيقة اليوم ${today}${penaltyLevel > 0 ? ` (مستوى العقوبة: ${penaltyLevel})` : ""}`,
            priority: "high", refType: "attendance", refId: attendanceId,
          }).catch((err) => pushToDLQ("notification", { type: "late_arrival" }, err, scope.companyId));
        }
      }).catch((err) => pushToDLQ("notification", { type: "late_arrival" }, err, scope.companyId));
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "attendance.checkin", entity: "attendance", entityId: attendanceId,
      details: JSON.stringify({ lateMinutes, isLate, distanceMeters, isOutOfRange, penaltyLevel, penaltyLabel, isWorkDay }),
    }).catch((err) => pushToDLQ("event", { action: "attendance.checkin", entityId: attendanceId }, err, scope.companyId));

    res.json({
      message: "تم تسجيل الحضور", lateMinutes, isLate,
      deductionAmount, distanceMeters, isOutOfRange, type: "checkin",
      penaltyLevel, penaltyLabel, penaltyDeduction, isWorkDay,
    });
  } catch (err) {
    handleRouteError(err, res, "Check-in error:");
  }
});

attendanceRouter.post("/check-out", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const period = today.slice(0, 7);
    const { notes, lat, lon } = req.body as any;

    const [existing] = await rawQuery<any>(
      `SELECT id, "checkIn", "checkOut" FROM attendance WHERE "assignmentId" = $1 AND date = $2`,
      [scope.activeAssignmentId, today]
    );
    if (!existing) { res.status(400).json({ error: "لم تسجل حضوراً اليوم" }); return; }
    if (existing.checkOut) { res.status(400).json({ error: "لقد سجلت الانصراف مسبقاً اليوم" }); return; }

    const [assignment] = await rawQuery<any>(
      `SELECT ea.salary, ea."branchId", b.lat AS "branchLat", b.lon AS "branchLon"
       FROM employee_assignments ea
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ea.id = $1`,
      [scope.activeAssignmentId]
    );

    let shift: any = null;
    const [shiftAssignment] = await rawQuery<any>(
      `SELECT s."endTime", s."startTime"
       FROM employee_shift_assignments esa
       JOIN shifts s ON s.id = esa."shiftId"
       WHERE esa."assignmentId" = $1 AND (esa."endDate" IS NULL OR esa."endDate" >= $2)
       ORDER BY esa.id DESC LIMIT 1`,
      [scope.activeAssignmentId, today]
    );
    if (shiftAssignment) {
      shift = shiftAssignment;
    } else {
      const [defaultShift] = await rawQuery<any>(
        `SELECT "endTime", "startTime" FROM shifts WHERE "companyId" = $1 AND status = 'active' ORDER BY "isDefault" DESC LIMIT 1`,
        [scope.companyId]
      );
      shift = defaultShift ?? { endTime: "17:00", startTime: "08:00" };
    }

    const [policy] = await rawQuery<any>(
      `SELECT "gpsRadiusMeters" FROM attendance_policies WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const gpsRadius = policy?.gpsRadiusMeters ?? 500;
    let checkOutDistanceMeters: number | null = null;
    let isCheckOutOutOfRange = false;
    if (lat !== undefined && lat !== null && lon !== undefined && lon !== null && assignment?.branchLat && assignment?.branchLon) {
      checkOutDistanceMeters = Math.round(haversineDistance(Number(lat), Number(lon), Number(assignment.branchLat), Number(assignment.branchLon)));
      isCheckOutOutOfRange = checkOutDistanceMeters > gpsRadius;
      if (isCheckOutOutOfRange) {
        await rawExecute(
          `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
           VALUES ($1,$2,'gps_out_of_range',$3,'low',0,$4)`,
          [scope.companyId, scope.activeAssignmentId, `تسجيل انصراف خارج نطاق الفرع بمسافة ${checkOutDistanceMeters}م`, period]
        );
      }
    }

    const checkInTime = new Date(existing.checkIn);
    const workedMs = now.getTime() - checkInTime.getTime();
    const workedHours = Math.round((workedMs / 3600000) * 100) / 100;

    let overtimeMinutes = 0;
    let earlyDepartureMinutes = 0;
    if (shift?.endTime) {
      const parts = String(shift.endTime).split(":");
      const shiftEnd = new Date(today + "T00:00:00");
      shiftEnd.setHours(Number(parts[0]), Number(parts[1] ?? 0), 0, 0);
      const diffMs = now.getTime() - shiftEnd.getTime();
      if (diffMs > 0) {
        overtimeMinutes = Math.floor(diffMs / 60000);
      } else if (diffMs < 0) {
        earlyDepartureMinutes = Math.abs(Math.floor(diffMs / 60000));
      }
    }

    await rawExecute(
      `UPDATE attendance SET "checkOut" = $1, notes = COALESCE($2, notes), "checkOutLat" = $4, "checkOutLon" = $5, "overtimeMinutes" = $6 WHERE id = $3`,
      [now.toISOString(), notes ?? null, existing.id,
        lat !== undefined && lat !== null ? Number(lat) : null,
        lon !== undefined && lon !== null ? Number(lon) : null,
        overtimeMinutes]
    );

    await rawExecute(
      `INSERT INTO employee_monthly_attendance ("companyId","assignmentId",period,"overtimeMinutes")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("assignmentId",period) DO UPDATE
       SET "overtimeMinutes" = COALESCE(employee_monthly_attendance."overtimeMinutes", 0) + $4`,
      [scope.companyId, scope.activeAssignmentId, period, overtimeMinutes]
    );

    if (earlyDepartureMinutes > 0) {
      const dailySalary = Number(assignment?.salary ?? 0) / 30;
      const minuteRate = dailySalary / 480;
      const earlyDeductionAmount = Math.round(minuteRate * earlyDepartureMinutes * 100) / 100;

      await rawExecute(
        `INSERT INTO employee_violations ("companyId","assignmentId",type,description,severity,deduction,period)
         VALUES ($1,$2,'early_departure',$3,'medium',$4,$5)`,
        [scope.companyId, scope.activeAssignmentId, `خروج مبكر بمقدار ${earlyDepartureMinutes} دقيقة عن وقت نهاية الوردية`, earlyDeductionAmount, period]
      );

      if (earlyDeductionAmount > 0) {
        await rawExecute(
          `INSERT INTO attendance_deductions ("companyId","assignmentId","attendanceId",type,minutes,amount,period,status)
           VALUES ($1,$2,$3,'early_departure',$4,$5,$6,'pending_payroll')`,
          [scope.companyId, scope.activeAssignmentId, existing.id, earlyDepartureMinutes, earlyDeductionAmount, period]
        );
      }

      createNotification({
        companyId: scope.companyId, assignmentId: scope.activeAssignmentId,
        type: "early_departure_warning", title: "تنبيه خروج مبكر",
        body: `تم تسجيل خروجك المبكر بمقدار ${earlyDepartureMinutes} دقيقة اليوم.`,
        priority: "high", refType: "attendance", refId: existing.id,
      }).catch((err) => pushToDLQ("notification", { type: "early_departure_warning" }, err, scope.companyId));

      getManagerAssignmentId(scope.companyId, scope.branchId).then((managerAssignmentId) => {
        if (managerAssignmentId) {
          createNotification({
            companyId: scope.companyId, assignmentId: managerAssignmentId,
            type: "early_departure", title: "خروج مبكر لموظف",
            body: `غادر الموظف مبكراً بمقدار ${earlyDepartureMinutes} دقيقة اليوم ${today}`,
            priority: "high", refType: "attendance", refId: existing.id,
          }).catch((err) => pushToDLQ("notification", { type: "early_departure" }, err, scope.companyId));
        }
      }).catch((err) => pushToDLQ("notification", { type: "early_departure" }, err, scope.companyId));
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "attendance.checkout", entity: "attendance", entityId: existing.id,
      details: JSON.stringify({ workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, checkOutDistanceMeters }),
    }).catch((err) => pushToDLQ("event", { action: "attendance.checkout", entityId: existing.id }, err, scope.companyId));

    res.json({ message: "تم تسجيل الانصراف", workedHours, overtimeMinutes, earlyDepartureMinutes, isCheckOutOutOfRange, type: "checkout" });
  } catch (err) {
    handleRouteError(err, res, "Check-out error:");
  }
});

attendanceRouter.get("/attendance", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { month } = req.query as { month?: string };
    const monthStr = month ?? new Date().toISOString().slice(0, 7);

    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'a."companyId"', branchColumn: 'a."branchId"' });
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
