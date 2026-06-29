-- ===========================================================================
-- 432_driver_evaluation_alerts_table.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `fleet_driver_evaluation_alerts` — جدول idempotency
--          يضمن إرسال تنبيه «اجتماع تقييم» مرّة واحدة لكل سائق لكل شهر
--          تقويمي حتى لا يُكرَّر يوميًا طالما الـreputationScore منخفض.
--
-- WHY:     شريحة ٦ تُشغّل cron يومي (dailyDriverEvaluationCheck) يفحص
--          fleet_drivers.reputationScore < 60. بدون جدول حارس، التنبيه
--          سيُرسل يوميًا طالما السمعة لم ترتفع. هذا الجدول يُسجّل
--          (driverId, alertMonth) عند الإرسال، والـcron يتخطّى أي زوج
--          موجود في الشهر الحالي.
--
--          نمط idempotency نفسه القائم في:
--             late_rent_actions          (paymentId, phase)
--             fleet_replacement_alerts   (vehicleId, alertMonth)  — شريحة ٥
--
-- DESIGN:
--   - PRIMARY KEY على (driverId, alertMonth) — مرّة لكل سائق لكل شهر.
--   - alertMonth = first-of-month (CHECK constraint).
--   - companyId + branchId للعزل الإيجاري وتقارير الفروع.
--   - reputationScoreAtAlert: قيمة السمعة وقت الإرسال (للتدقيق + تتبّع
--     التحسّن/التدهور).
--   - alertedAssignmentId: من تم إشعاره (للتدقيق + إعادة الإرسال يدويًا
--     إن لزم).
--
-- SAFETY:  جدول جديد مع companyId FK، tenant-isolated. لا أسرار.
--          الإذن: المالك فوّض إنشاء جداول لشرائح 5-9 ضمن خيار «أ».
--
-- @rollback:
--   DROP TABLE IF EXISTS fleet_driver_evaluation_alerts;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_driver_evaluation_alerts (
  "driverId"                INTEGER NOT NULL REFERENCES fleet_drivers(id) ON DELETE CASCADE,
  "alertMonth"              DATE NOT NULL,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER,
  "reputationScoreAtAlert"  NUMERIC(5,2) NOT NULL,
  "alertedAssignmentId"     INTEGER,
  "sentAt"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("driverId", "alertMonth"),
  CONSTRAINT fleet_driver_eval_alerts_month_first_day
    CHECK ("alertMonth" = date_trunc('month', "alertMonth")::date),
  CONSTRAINT fleet_driver_eval_alerts_score_threshold
    CHECK ("reputationScoreAtAlert" >= 0 AND "reputationScoreAtAlert" < 60)
);

CREATE INDEX IF NOT EXISTS idx_fleet_driver_eval_alerts_company_month
  ON fleet_driver_evaluation_alerts ("companyId", "alertMonth" DESC);

COMMIT;
