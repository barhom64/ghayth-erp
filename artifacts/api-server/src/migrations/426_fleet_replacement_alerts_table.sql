-- ===========================================================================
-- 426_fleet_replacement_alerts_table.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `fleet_replacement_alerts` — جدول idempotency يضمن إرسال
--          تنبيه «استبدال محتمل» مرّة واحدة لكل مركبة لكل شهر تقويمي.
--
-- WHY:     السلسلة الجديدة في cronScheduler (شريحة ٥) تُشغّل cron شهري
--          (`monthlyVehicleReplacementCheck`) يستعلم عن المركبات بـ ≥ 3
--          أعطال في الشهر الحالي. بدون جدول حارس، أي عطل جديد بعد إرسال
--          التنبيه الأول سيعيد إطلاقه. هذا الجدول يُسجّل (vehicleId, month)
--          عند الإرسال، والـ cron يتخطّى أي زوج موجود.
--
--          نمط idempotency نفسه القائم في `late_rent_actions`
--          (paymentId, phase) — مرّة لكل دفعة لكل مرحلة. هنا: مرّة لكل
--          مركبة لكل شهر تقويمي.
--
-- DESIGN:
--   - PRIMARY KEY على (vehicleId, alertMonth) → فحص idempotency في O(1).
--   - alertMonth = DATE من شكل `YYYY-MM-01` (أول الشهر) للحفاظ على نوع
--     DATE القياسي (مقارنات تاريخية أسرع من VARCHAR).
--   - companyId + branchId للعزل الإيجاري وتقارير الفروع.
--   - breakdownCount: عدد الأعطال وقت الإرسال (للتدقيق).
--   - alertedAssignmentId: من تم إشعاره (للتدقيق + لإعادة الإرسال
--     يدويًا لاحقًا إن لزم).
--
-- SAFETY:  جدول جديد + companyId FK، tenant-isolated. لا أسرار.
--          الإذن: المالك فوّض إنشاء جداول لشرائح 5-9 ضمن خيار «أ».
--
-- @rollback:
--   DROP TABLE IF EXISTS fleet_replacement_alerts;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_replacement_alerts (
  "vehicleId"             INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  "alertMonth"            DATE NOT NULL,
  "companyId"             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"              INTEGER,
  "breakdownCount"        INTEGER NOT NULL,
  "alertedAssignmentId"   INTEGER,
  "sentAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("vehicleId", "alertMonth"),
  CONSTRAINT fleet_replacement_alerts_month_first_day
    CHECK ("alertMonth" = date_trunc('month', "alertMonth")::date),
  CONSTRAINT fleet_replacement_alerts_count_min
    CHECK ("breakdownCount" >= 3)
);

CREATE INDEX IF NOT EXISTS idx_fleet_replacement_alerts_company_month
  ON fleet_replacement_alerts ("companyId", "alertMonth" DESC);

COMMIT;
