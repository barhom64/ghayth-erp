-- ===========================================================================
-- 440_geofence_exit_alerts_table.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `fleet_geofence_exit_alerts` — جدول idempotency يضمن
--          إرسال تنبيه «خروج السياج» مرّة واحدة لكل مركبة لكل يوم تقويمي.
--
-- WHY:     cron شريحة ٨ (dailyGeofenceExitCheck) يفحص يوميًا قراءات اليوم
--          السابق ويُرسل ملخّصًا. بدون جدول حارس، إعادة تشغيل cron نفس
--          اليوم ستُكرّر التنبيه.
--
--          نمط idempotency نفسه القائم:
--             late_rent_actions                (paymentId, phase)
--             fleet_replacement_alerts         (vehicleId, alertMonth)  — شريحة ٥
--             fleet_driver_evaluation_alerts   (driverId,  alertMonth)  — شريحة ٦
--             fleet_speed_violation_alerts     (vehicleId, violationDate) — شريحة ٧
--             fleet_geofence_exit_alerts       (vehicleId, exitDate)    — شريحة ٨ (هذا)
--
-- DESIGN:
--   - PRIMARY KEY على (vehicleId, exitDate).
--   - exitDate = تاريخ التجاوز (يوم CURRENT_DATE - 1 وقت تشغيل cron،
--     محسوب في getSystemTimezone).
--   - companyId + branchId للعزل الإيجاري وتقارير الفروع.
--   - exitCount: عدد المواضع التي وقعت خارج جميع سياجات المركبة (سياق
--     سريع للمدير حين يفتح التنبيه).
--   - maxDistanceKm: أقصى مسافة عن أقرب سياج (للتدقيق + سياق الخطورة).
--   - alertedAssignmentId: من تم إشعاره (للتدقيق + إعادة الإرسال يدويًا
--     إن لزم).
--
-- SAFETY:  جدول جديد مع companyId FK، tenant-isolated. لا أسرار.
--          الإذن: مفوّض ضمن خيار «أ» لشرائح 5-9.
--
-- @rollback:
--   DROP TABLE IF EXISTS fleet_geofence_exit_alerts;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_geofence_exit_alerts (
  "vehicleId"           INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  "exitDate"            DATE NOT NULL,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"            INTEGER,
  "exitCount"           INTEGER NOT NULL,
  "maxDistanceKm"       NUMERIC(7,3) NOT NULL,
  "alertedAssignmentId" INTEGER,
  "sentAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("vehicleId", "exitDate"),
  CONSTRAINT fleet_geofence_alerts_count_min
    CHECK ("exitCount" >= 1),
  CONSTRAINT fleet_geofence_alerts_distance_min
    CHECK ("maxDistanceKm" >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fleet_geofence_alerts_company_date
  ON fleet_geofence_exit_alerts ("companyId", "exitDate" DESC);

COMMIT;
