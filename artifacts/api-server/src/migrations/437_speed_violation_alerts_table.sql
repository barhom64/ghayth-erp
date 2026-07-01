-- ===========================================================================
-- 435_speed_violation_alerts_table.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `fleet_speed_violation_alerts` — جدول idempotency يضمن
--          إرسال تنبيه «تجاوز السرعة» مرّة واحدة لكل مركبة لكل يوم تقويمي
--          (لا فوريًا لكل تجاوز).
--
-- WHY:     cron شريحة ٧ (dailySpeedViolationCheck) يفحص يوميًا تجاوزات
--          اليوم السابق ويُرسل ملخّصًا. بدون جدول حارس، إعادة تشغيل cron
--          نفس اليوم ستُكرّر التنبيه. هذا الجدول يُسجّل (vehicleId,
--          violationDate) عند الإرسال.
--
--          نمط idempotency نفسه القائم:
--             late_rent_actions               (paymentId, phase)
--             fleet_replacement_alerts        (vehicleId, alertMonth)  — شريحة ٥
--             fleet_driver_evaluation_alerts  (driverId, alertMonth)   — شريحة ٦
--          هنا الحبيبة يوميّة (ليس شهرية) لأن سلوك القيادة فوري ويستحقّ
--          متابعة سريعة بدل تأجيلها لشهر.
--
-- DESIGN:
--   - PRIMARY KEY على (vehicleId, violationDate) — مرّة لكل مركبة لكل يوم.
--   - violationDate = تاريخ التجاوز (يوم الـCURRENT_DATE - 1 وقت تشغيل cron
--     الصباحي، نفحص اليوم السابق كاملاً).
--   - companyId + branchId للعزل الإيجاري وتقارير الفروع.
--   - maxSpeedAtAlert: أعلى سرعة رُصدت ذلك اليوم (للتدقيق + سياق سريع
--     للمدير حين يفتح ملف التنبيه).
--   - violationCount: عدد القراءات التي تجاوزت الحدّ + tolerance.
--   - alertedAssignmentId: من تم إشعاره.
--
-- SAFETY:  جدول جديد مع companyId FK، tenant-isolated. لا أسرار.
--          الإذن: مفوّض ضمن خيار «أ» لشرائح 5-9.
--
-- @rollback:
--   DROP TABLE IF EXISTS fleet_speed_violation_alerts;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_speed_violation_alerts (
  "vehicleId"            INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  "violationDate"        DATE NOT NULL,
  "companyId"            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"             INTEGER,
  "maxSpeedKphAtAlert"   NUMERIC(6,2) NOT NULL,
  "limitKphAtAlert"      INTEGER NOT NULL,
  "violationCount"       INTEGER NOT NULL,
  "alertedAssignmentId"  INTEGER,
  "sentAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("vehicleId", "violationDate"),
  CONSTRAINT fleet_speed_alerts_max_above_limit
    CHECK ("maxSpeedKphAtAlert" >= "limitKphAtAlert"),
  CONSTRAINT fleet_speed_alerts_count_min
    CHECK ("violationCount" >= 1)
);

CREATE INDEX IF NOT EXISTS idx_fleet_speed_alerts_company_date
  ON fleet_speed_violation_alerts ("companyId", "violationDate" DESC);

COMMIT;
