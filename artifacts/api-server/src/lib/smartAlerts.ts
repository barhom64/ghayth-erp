import { rawQuery, rawExecute } from "./rawdb.js";
import { broadcastAlert } from "./notificationService.js";
import { createNotification } from "./businessHelpers.js";

export interface AlertResult {
  fired: number;
  details: string[];
}

async function checkEmployeeOverload(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT ea.id AS "assignmentId", ea."employeeId", e.name,
            (SELECT COUNT(*) FROM tasks t
             WHERE t."assignedTo" = ea.id AND t."companyId" = $1
             AND t.status NOT IN ('completed','cancelled'))::int AS "activeTasks"
     FROM employee_assignments ea
     JOIN employees e ON e.id = ea."employeeId"
     WHERE ea."companyId" = $1 AND ea.status = 'active'
       AND (SELECT COUNT(*) FROM tasks t
            WHERE t."assignedTo" = ea.id AND t."companyId" = $1
            AND t.status NOT IN ('completed','cancelled'))::int > 6`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId,
      "employee_overload",
      `تحميل زائد: ${row.name}`,
      `الموظف لديه ${row.activeTasks} مهمة نشطة (الحد 6) — يُنصح بإعادة التوزيع`,
      "warning",
      "employee",
      row.employeeId
    );

    try {
      const leastLoaded = await rawQuery<any>(
        `SELECT ea.id AS "assignmentId", ea."employeeId", e.name,
                (SELECT COUNT(*) FROM tasks t
                 WHERE t."assignedTo" = ea.id AND t."companyId" = $1
                 AND t.status NOT IN ('completed','cancelled'))::int AS workload
         FROM employee_assignments ea
         JOIN employees e ON e.id = ea."employeeId"
         WHERE ea."companyId" = $1 AND ea.status = 'active' AND ea."employeeId" != $2
         ORDER BY workload ASC LIMIT 1`,
        [companyId, row.employeeId]
      );

      if (leastLoaded.length > 0 && leastLoaded[0].workload < 4) {
        const target = leastLoaded[0];
        const [oldestTask] = await rawQuery<any>(
          `SELECT id, title FROM tasks
           WHERE "assignedTo" = $1 AND "companyId" = $2 AND status = 'pending'
           ORDER BY "scheduledDate" ASC LIMIT 1`,
          [row.assignmentId, companyId]
        );
        if (oldestTask) {
          await rawExecute(
            `UPDATE tasks SET "assignedTo" = $1 WHERE id = $2`,
            [target.assignmentId, oldestTask.id]
          );
          await createNotification({
            companyId, assignmentId: target.assignmentId,
            type: "task_reassigned",
            title: `مهمة محولة إليك: ${oldestTask.title}`,
            body: `تم تحويل المهمة من ${row.name} بسبب التحميل الزائد`,
            priority: "normal", refType: "task", refId: oldestTask.id,
          });
        }
      }
    } catch (e) { console.error("Overload redistribution error:", e); }
  }
  return rows.length;
}

async function checkTaskTakingTooLong(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT t.id, t.title, t."assignedTo", t."scheduledStart", t."estimatedDuration",
            e.name AS "assigneeName",
            EXTRACT(EPOCH FROM (NOW() - t."scheduledStart")) / 60 AS "elapsedMinutes"
     FROM tasks t
     LEFT JOIN employee_assignments ea_join ON ea_join.id = t."assignedTo"
     LEFT JOIN employees e ON e.id = ea_join."employeeId"
     WHERE t."companyId" = $1
       AND t.status = 'in_progress'
       AND t."scheduledStart" IS NOT NULL
       AND t."estimatedDuration" IS NOT NULL
       AND t."estimatedDuration" > 0
       AND EXTRACT(EPOCH FROM (NOW() - t."scheduledStart")) / 60 > t."estimatedDuration" * 1.5
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId" = $1 AND sa.type = 'task_taking_long' AND sa."relatedId" = t.id
         AND sa."createdAt" > NOW() - INTERVAL '4 hours'
       )`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "task_taking_long",
      `مهمة تتجاوز الوقت المتوقع: ${row.title}`,
      `الموظف ${row.assigneeName || 'غير محدد'} — الوقت المنقضي ${Math.round(row.elapsedMinutes)} دقيقة مقابل ${row.estimatedDuration} دقيقة متوقعة`,
      "warning", "task", row.id
    );

    if (row.assigneeId) {
      try {
        const [supervisorAsgn] = await rawQuery<any>(
          `SELECT ea.id FROM employee_assignments ea
           WHERE ea."companyId" = $1 AND ea.role IN ('branch_manager','hr_manager','general_manager','supervisor')
           AND ea.status = 'active' LIMIT 1`,
          [companyId]
        );
        if (supervisorAsgn) {
          await createNotification({
            companyId, assignmentId: supervisorAsgn.id,
            type: "task_delay_alert",
            title: `مهمة متأخرة تحتاج تدخل: ${row.title}`,
            body: `الموظف ${row.assigneeName || ''} تجاوز 150% من الوقت المتوقع`,
            priority: "high", refType: "task", refId: row.id,
          });
        }
      } catch (e) { console.error("Task delay supervisor notify error:", e); }
    }
  }
  return rows.length;
}

async function checkRepeatedMaintenanceAtProperty(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT mr."unitId", pu.name AS "unitName", COUNT(*)::int AS cnt
     FROM maintenance_requests mr
     LEFT JOIN property_units pu ON pu.id = mr."unitId"
     WHERE mr."companyId" = $1
       AND mr."createdAt" >= NOW() - INTERVAL '30 days'
       AND mr."unitId" IS NOT NULL
     GROUP BY mr."unitId", pu.name
     HAVING COUNT(*) >= 3`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "repeated_maintenance",
      `3+ بلاغات صيانة: ${row.unitName || `وحدة ${row.unitId}`}`,
      `${row.cnt} بلاغ صيانة خلال 30 يوم — يُنصح بفحص شامل`,
      "warning", "property_unit", row.unitId
    );

    try {
      await rawExecute(
        `INSERT INTO maintenance_requests ("companyId", "unitId", title, description, priority, status, "createdAt")
         SELECT $1, $2, 'فحص شامل تلقائي', $3, 'high', 'pending', NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM maintenance_requests
           WHERE "companyId" = $1 AND "unitId" = $2 AND title = 'فحص شامل تلقائي'
           AND "createdAt" > NOW() - INTERVAL '30 days'
         )`,
        [companyId, row.unitId, `فحص شامل مجدول تلقائياً بسبب ${row.cnt} بلاغ صيانة خلال شهر`]
      );
    } catch (e) { console.error("Auto inspection creation error:", e); }
  }
  return rows.length;
}

async function checkLowEmployeeRating(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT ea."employeeId", e.name, ea.id AS "assignmentId",
            AVG(st.rating)::float AS "avgRating"
     FROM support_tickets st
     JOIN employee_assignments ea ON ea."companyId" = $1 AND ea.status = 'active'
     JOIN employees e ON e.id = ea."employeeId"
     WHERE st."companyId" = $1
       AND st.rating IS NOT NULL
       AND st."resolvedAt" >= NOW() - INTERVAL '30 days'
       AND st."assignedTo" = ea.id
     GROUP BY ea."employeeId", e.name, ea.id
     HAVING AVG(st.rating) < 3`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "low_employee_rating",
      `تقييم منخفض: ${row.name}`,
      `متوسط التقييم ${row.avgRating.toFixed(1)}/5 — يُنصح بعقد اجتماع تطويري`,
      "warning", "employee", row.employeeId
    );

    try {
      const [hrAsgn] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','branch_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
        [companyId]
      );
      if (hrAsgn) {
        await createNotification({
          companyId, assignmentId: hrAsgn.id,
          type: "performance_meeting",
          title: `يُطلب اجتماع أداء: ${row.name}`,
          body: `تقييم العملاء أقل من 3/5 — يرجى جدولة اجتماع تطويري`,
          priority: "high", refType: "employee", refId: row.employeeId,
        });
      }
    } catch (e) { console.error("Low rating meeting notify error:", e); }
  }
  return rows.length;
}

async function checkBranchSlaBreachRate(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT b.id AS "branchId", b.name AS "branchName",
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE st."slaBreached" = true)::int AS breached,
            ROUND(COUNT(*) FILTER (WHERE st."slaBreached" = true)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS "breachPct"
     FROM branches b
     JOIN support_tickets st ON st."branchId" = b.id AND st."companyId" = $1
     WHERE b."companyId" = $1
       AND st."createdAt" >= NOW() - INTERVAL '30 days'
     GROUP BY b.id, b.name
     HAVING ROUND(COUNT(*) FILTER (WHERE st."slaBreached" = true)::numeric / NULLIF(COUNT(*),0) * 100, 1) > 20`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "branch_sla_breach_rate",
      `SLA ضعيف: فرع ${row.branchName || row.branchId}`,
      `نسبة خرق SLA: ${row.breachPct}% (الحد 20%) — ${row.breached} من ${row.total} تذكرة — يُنصح بتعزيز الكادر`,
      "critical", "branch", row.branchId
    );
  }
  return rows.length;
}

async function checkTechnicianNoUpdate(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT t.id, t.title, t."assignedTo", e.name AS "assigneeName",
            EXTRACT(EPOCH FROM (NOW() - COALESCE(
              (SELECT MAX(el."createdAt") FROM event_logs el
               WHERE el.entity = 'task' AND el."entityId" = t.id),
              t."scheduledStart"
            ))) / 3600 AS "hoursSinceUpdate"
     FROM tasks t
     LEFT JOIN employee_assignments ea_join ON ea_join.id = t."assignedTo"
     LEFT JOIN employees e ON e.id = ea_join."employeeId"
     WHERE t."companyId" = $1
       AND t.status = 'in_progress'
       AND t."scheduledStart" IS NOT NULL
       AND EXTRACT(EPOCH FROM (NOW() - COALESCE(
              (SELECT MAX(el."createdAt") FROM event_logs el
               WHERE el.entity = 'task' AND el."entityId" = t.id),
              t."scheduledStart"
            ))) / 3600 > 3
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId" = $1 AND sa.type = 'no_update_3h' AND sa."relatedId" = t.id
         AND sa."createdAt" > NOW() - INTERVAL '3 hours'
       )`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "no_update_3h",
      `3 ساعات بدون تحديث: ${row.title}`,
      `الفني ${row.assigneeName || 'غير محدد'} لم يحدّث المهمة منذ ${Math.round(row.hoursSinceUpdate)} ساعة`,
      "warning", "task", row.id
    );

    if (row.assigneeId) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
          [row.assigneeId, companyId]
        );
        if (asgn) {
          await createNotification({
            companyId, assignmentId: asgn.id,
            type: "update_reminder",
            title: `تذكير: حدّث المهمة "${row.title}"`,
            body: `مرّت 3 ساعات بدون تحديث — يرجى تحديث الحالة`,
            priority: "high", refType: "task", refId: row.id,
          });
        }
      } catch (e) { console.error("No-update reminder error:", e); }
    }
  }
  return rows.length;
}

async function checkGeofenceViolation(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT ft.id AS "tripId", ft."vehicleId", fv."plateNumber",
            fd.name AS "driverName", ft."currentLat", ft."currentLon"
     FROM fleet_trips ft
     JOIN fleet_vehicles fv ON fv.id = ft."vehicleId"
     LEFT JOIN fleet_drivers fd ON fd.id = ft."driverId"
     WHERE ft."companyId" = $1 AND ft.status = 'in_progress'
       AND ft."geofenceLat" IS NOT NULL AND ft."geofenceLon" IS NOT NULL
       AND ft."geofenceRadius" IS NOT NULL AND ft."geofenceRadius" > 0
       AND ft."currentLat" IS NOT NULL AND ft."currentLon" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId" = $1 AND sa.type = 'geofence_violation' AND sa."relatedId" = ft.id
         AND sa."createdAt" > NOW() - INTERVAL '1 hour'
       )`,
    [companyId]
  );

  let fired = 0;
  for (const row of rows) {
    try {
      const { haversineDistance } = await import("./algorithms.js");
      const dist = haversineDistance(
        Number(row.currentLat), Number(row.currentLon),
        Number(row.geofenceLat), Number(row.geofenceLon)
      );
      const radiusKm = Number(row.geofenceRadius) / 1000;
      if (dist > radiusKm) {
        await broadcastAlert(
          companyId, "geofence_violation",
          `خروج من السياج: ${row.plateNumber}`,
          `المركبة ${row.plateNumber} (${row.driverName || ''}) خارج النطاق بـ ${(dist - radiusKm).toFixed(1)} كم`,
          "critical", "fleet_trip", row.tripId
        );
        fired++;
      }
    } catch (e) { console.error("Geofence check error:", e); }
  }
  return fired;
}

async function checkSpeedViolation(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT ft.id AS "tripId", ft."vehicleId", fv."plateNumber",
            fd.name AS "driverName", ft."currentSpeed"
     FROM fleet_trips ft
     JOIN fleet_vehicles fv ON fv.id = ft."vehicleId"
     LEFT JOIN fleet_drivers fd ON fd.id = ft."driverId"
     WHERE ft."companyId" = $1 AND ft.status = 'in_progress'
       AND ft."currentSpeed" IS NOT NULL AND ft."currentSpeed" > 120
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId" = $1 AND sa.type = 'speed_violation' AND sa."relatedId" = ft.id
         AND sa."createdAt" > NOW() - INTERVAL '30 minutes'
       )`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "speed_violation",
      `تجاوز سرعة: ${row.plateNumber}`,
      `المركبة ${row.plateNumber} (${row.driverName || ''}) تسير بسرعة ${row.currentSpeed} كم/ساعة (الحد 120)`,
      "critical", "fleet_trip", row.tripId
    );

    try {
      await rawExecute(
        `INSERT INTO fleet_violations ("companyId", "vehicleId", "driverId", "tripId", type, description, "createdAt")
         VALUES ($1, $2, $3, $4, 'speed', $5, NOW())`,
        [companyId, row.vehicleId, row.driverId ?? null, row.tripId,
         `تجاوز سرعة: ${row.currentSpeed} كم/ساعة — الحد 120 كم/ساعة`]
      ).catch(() => {});
    } catch {}
  }
  return rows.length;
}

async function checkVehicleRepeatedBreakdowns(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT fv.id AS "vehicleId", fv."plateNumber", COUNT(*)::int AS breakdowns
     FROM fleet_maintenance fm
     JOIN fleet_vehicles fv ON fv.id = fm."vehicleId"
     WHERE fm."companyId" = $1
       AND fm."createdAt" >= NOW() - INTERVAL '90 days'
       AND fm.type = 'breakdown'
     GROUP BY fv.id, fv."plateNumber"
     HAVING COUNT(*) >= 3`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "vehicle_repeated_breakdowns",
      `أعطال متكررة: ${row.plateNumber}`,
      `${row.breakdowns} أعطال خلال 90 يوم — يُنصح باستبدال المركبة`,
      "critical", "fleet_vehicle", row.vehicleId
    );

    try {
      await rawExecute(
        `UPDATE fleet_vehicles SET status = 'under_review' WHERE id = $1 AND status = 'active'`,
        [row.vehicleId]
      ).catch(() => {});
    } catch {}
  }
  return rows.length;
}

async function checkInventoryBelowThreshold(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT wp.id AS "productId", wp.name,
            COALESCE(wp."currentStock", 0)::float AS current,
            COALESCE(wp."minStock", wp."safetyStock", 0)::float AS threshold
     FROM warehouse_products wp
     WHERE wp."companyId" = $1
       AND (wp."minStock" IS NOT NULL OR wp."safetyStock" IS NOT NULL)
       AND COALESCE(wp."currentStock", 0) < COALESCE(wp."minStock", wp."safetyStock", 0)
       AND COALESCE(wp."minStock", wp."safetyStock", 0) > 0`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "inventory_below_threshold",
      `مخزون منخفض: ${row.name}`,
      `الكمية الحالية ${row.current} أقل من الحد ${row.threshold} — تم إنشاء طلب شراء تلقائي`,
      "warning", "warehouse_product", row.productId
    );

    try {
      await rawExecute(
        `INSERT INTO purchase_orders ("companyId", title, status, "totalAmount", "createdAt")
         SELECT $1, $2, 'draft', 0, NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM purchase_orders
           WHERE "companyId" = $1 AND title LIKE $3
           AND "createdAt" > NOW() - INTERVAL '7 days' AND status NOT IN ('cancelled','rejected')
         )`,
        [companyId, `طلب شراء تلقائي: ${row.name}`, `%${row.name}%`]
      );
    } catch (e) { console.error("Auto PO creation error:", e); }
  }
  return rows.length;
}

async function checkProductivityDeviation(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `WITH recent AS (
       SELECT t."assignedTo",
              COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*),0) AS rate
       FROM tasks t
       WHERE t."companyId"=$1 AND t."scheduledDate"::date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY t."assignedTo"
     ),
     historical AS (
       SELECT t."assignedTo",
              COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*),0) AS rate
       FROM tasks t
       WHERE t."companyId"=$1
         AND t."scheduledDate"::date BETWEEN CURRENT_DATE - INTERVAL '37 days' AND CURRENT_DATE - INTERVAL '8 days'
       GROUP BY t."assignedTo"
     )
    SELECT ea."employeeId", ea.id AS "assignmentId", e.name,
           ROUND(r.rate * 100)::int AS "recentRate",
           ROUND(h.rate * 100)::int AS "historicalRate"
    FROM recent r
    JOIN historical h ON h."assignedTo" = r."assignedTo"
    JOIN employee_assignments ea ON ea.id = r."assignedTo" AND ea."companyId"=$1 AND ea.status='active'
    JOIN employees e ON e.id = ea."employeeId"
     WHERE h.rate > 0.3 AND r.rate < h.rate * 0.7
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId"=$1 AND sa.type='productivity_deviation' AND sa."relatedId"=r."assignedTo"
         AND sa."createdAt" > NOW() - INTERVAL '7 days'
       )`,
    [companyId]
  );

  for (const row of rows) {
    await broadcastAlert(
      companyId, "productivity_deviation",
      `انخفاض إنتاجية: ${row.name}`,
      `إنتاجية ${row.name} انخفضت من ${row.historicalRate}% إلى ${row.recentRate}% — انحراف كبير عن المعدل المعتاد`,
      "warning", "employee", row.employeeId
    );
    try {
      const [mgr] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "companyId"=$1 AND role IN ('branch_manager','hr_manager','general_manager','owner') AND status='active' LIMIT 1`,
        [companyId]
      );
      if (mgr) {
        await createNotification({
          companyId, assignmentId: mgr.id,
          type: "productivity_alert",
          title: `انخفاض إنتاجية: ${row.name}`,
          body: `انخفضت الإنتاجية من ${row.historicalRate}% إلى ${row.recentRate}% — يُنصح بالمتابعة`,
          priority: "high", refType: "employee", refId: row.employeeId,
        });
      }
    } catch (e) { console.error("Productivity alert notify error:", e); }
  }
  return rows.length;
}

async function checkAttendancePatternChange(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `WITH recent_late AS (
       SELECT a."assignmentId", COUNT(*) FILTER (WHERE a.status='late')::int AS late_count,
              COUNT(*)::int AS total
       FROM attendance a
       JOIN employee_assignments ea ON ea.id=a."assignmentId"
       WHERE ea."companyId"=$1 AND a.date >= CURRENT_DATE - INTERVAL '14 days'
       GROUP BY a."assignmentId"
     ),
     historical_late AS (
       SELECT a."assignmentId", COUNT(*) FILTER (WHERE a.status='late')::int AS late_count,
              COUNT(*)::int AS total
       FROM attendance a
       JOIN employee_assignments ea ON ea.id=a."assignmentId"
       WHERE ea."companyId"=$1
         AND a.date BETWEEN CURRENT_DATE - INTERVAL '44 days' AND CURRENT_DATE - INTERVAL '15 days'
       GROUP BY a."assignmentId"
     )
     SELECT r."assignmentId", ea."employeeId", e.name,
            r.late_count AS "recentLate", h.late_count AS "historicalLate"
     FROM recent_late r
     JOIN historical_late h ON h."assignmentId" = r."assignmentId"
     JOIN employee_assignments ea ON ea.id = r."assignmentId"
     JOIN employees e ON e.id = ea."employeeId"
     WHERE r.total >= 5 AND h.total >= 5
       AND r.late_count >= h.late_count * 2 AND r.late_count >= 3
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId"=$1 AND sa.type='attendance_pattern_change'
           AND sa."relatedId"=ea."employeeId"
           AND sa."createdAt" > NOW() - INTERVAL '14 days'
       )`,
    [companyId]
  );
  for (const row of rows) {
    await broadcastAlert(
      companyId, "attendance_pattern_change",
      `تغير نمط حضور: ${row.name}`,
      `تضاعف التأخر لـ ${row.name} خلال آخر 14 يوم (${row.recentLate} مرة مقابل ${row.historicalLate} مرة سابقاً)`,
      "warning", "employee", row.employeeId
    );
  }
  return rows.length;
}

async function checkBudgetOverrun(companyId: number): Promise<number> {
  const rows = await rawQuery<any>(
    `SELECT b."accountCode", b.amount, b.used,
            ROUND((b.used / NULLIF(b.amount,0)) * 100)::int AS pct
     FROM budgets b
     WHERE b."companyId"=$1 AND b.period = TO_CHAR(CURRENT_DATE,'YYYY-MM')
       AND b.amount > 0 AND (b.used / NULLIF(b.amount,0)) > 1.0
       AND NOT EXISTS (
         SELECT 1 FROM smart_alerts sa
         WHERE sa."companyId"=$1 AND sa.type='budget_overrun'
           AND sa.description LIKE '%' || b."accountCode" || '%'
           AND sa."createdAt" > NOW() - INTERVAL '7 days'
       )`,
    [companyId]
  );
  for (const row of rows) {
    await broadcastAlert(
      companyId, "budget_overrun",
      `تجاوز ميزانية: ${row.accountCode}`,
      `ميزانية ${row.accountCode} تجاوزت الحد ${row.pct}% — المبلغ المستخدم: ${Number(row.used).toLocaleString()} من ${Number(row.amount).toLocaleString()}`,
      "critical", "budget", 0
    );
  }
  return rows.length;
}

async function checkConsecutiveUnpaidInvoices(companyId: number): Promise<number> {
    let count = 0;
    try {
      const clients = await rawQuery<any>(
        `WITH all_invoices AS (
           SELECT i."clientId", c.name AS "clientName", i.status,
                  ROW_NUMBER() OVER (PARTITION BY i."clientId" ORDER BY i."dueDate" DESC) AS rn
           FROM invoices i
           JOIN clients c ON c.id = i."clientId"
           WHERE i."companyId" = $1 AND i.status NOT IN ('cancelled','draft')
         ),
         first_paid AS (
           SELECT "clientId", MIN(rn) AS first_paid_rn
           FROM all_invoices
           WHERE status = 'paid'
           GROUP BY "clientId"
         ),
         consecutive AS (
           SELECT ai."clientId", ai."clientName",
                  COUNT(*) AS streak
           FROM all_invoices ai
           LEFT JOIN first_paid fp ON fp."clientId" = ai."clientId"
           WHERE ai.status IN ('overdue','sent','unpaid')
             AND ai.rn < COALESCE(fp.first_paid_rn, 999999)
           GROUP BY ai."clientId", ai."clientName"
           HAVING COUNT(*) >= 3
         )
         SELECT "clientId", "clientName", streak FROM consecutive ORDER BY streak DESC LIMIT 10`,
        [companyId]
      );
      for (const cl of clients) {
        await broadcastAlert(
          companyId,
          "consecutive_unpaid",
          `${cl.clientName} لديه ${cl.streak} فواتير متتالية غير مسددة`,
          `العميل ${cl.clientName} لم يسدد آخر ${cl.streak} فواتير على التوالي — يُنصح بالتواصل الفوري`,
          cl.streak >= 5 ? "critical" : "warning",
          "client",
          cl.clientId
        );
        count++;
      }
    } catch { }
    return count;
  }

export async function runSmartAlerts(companyId: number): Promise<AlertResult> {
  const details: string[] = [];
  let fired = 0;

  const checks: Array<[string, () => Promise<number>]> = [
    ["employee_overload_>6", () => checkEmployeeOverload(companyId)],
    ["task_taking_long_50%", () => checkTaskTakingTooLong(companyId)],
    ["repeated_maintenance_3/month", () => checkRepeatedMaintenanceAtProperty(companyId)],
    ["low_rating_<3", () => checkLowEmployeeRating(companyId)],
    ["branch_sla_<80%", () => checkBranchSlaBreachRate(companyId)],
    ["technician_no_update_3h", () => checkTechnicianNoUpdate(companyId)],
    ["geofence_violation", () => checkGeofenceViolation(companyId)],
    ["speed_>120", () => checkSpeedViolation(companyId)],
    ["vehicle_3_breakdowns", () => checkVehicleRepeatedBreakdowns(companyId)],
    ["inventory_below_threshold", () => checkInventoryBelowThreshold(companyId)],
    ["productivity_deviation", () => checkProductivityDeviation(companyId)],
    ["attendance_pattern_change", () => checkAttendancePatternChange(companyId)],
    ["budget_overrun", () => checkBudgetOverrun(companyId)],
    ["consecutive_unpaid_invoices", () => checkConsecutiveUnpaidInvoices(companyId)],
  ];

  for (const [name, check] of checks) {
    try {
      const count = await check();
      if (count > 0) {
        fired += count;
        details.push(`${name}: ${count}`);
      }
    } catch (err) {
      console.error(`Smart alert check ${name} failed:`, err);
    }
  }

  return { fired, details };
}

export async function runSmartAlertsAllCompanies(): Promise<AlertResult> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  const total: AlertResult = { fired: 0, details: [] };
  for (const company of companies) {
    const result = await runSmartAlerts(company.id);
    total.fired += result.fired;
    total.details.push(...result.details.map((d) => `[company:${company.id}] ${d}`));
  }
  return total;
}
