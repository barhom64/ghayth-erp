-- ===========================================================================
-- 433_vehicle_speed_limits_table.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `vehicle_speed_limits` — جدول سياسة الحدّ الأقصى للسرعة
--          لكل شركة (افتراضي) ولكل مركبة (override اختياري). يستهلكه cron
--          شريحة ٧ في `dailySpeedViolationCheck` لكشف التجاوزات اليومية
--          عبر مقارنة `fleet_device_positions.speed` بالحدّ الفعّال.
--
-- WHY:     Spec ملف 04 §تنبيهات الأسطول السبعة:
--          «تجاوز السرعة → تنبيه»
--
--          الموجود اليوم: smartAlerts.checkSpeedViolation() معطّلة (تعيد 0)
--          لأن النظام كان يبحث عن currentSpeed على fleet_trips
--          (غير موجود). البيانات الحقيقية موجودة في
--          fleet_device_positions.speed (من شريحة الـtelematics 228).
--          الناقص هو سياسة قابلة للضبط بدل قيمة ثابتة.
--
-- DESIGN:
--   - PRIMARY KEY على (companyId, vehicleId) — لكن vehicleId يمكن أن
--     يكون NULL (= الافتراضي على مستوى الشركة).
--   - PostgreSQL يعامل NULL كقيم مختلفة في PRIMARY KEY قبل النسخة 15،
--     لذلك نضمن «صف افتراضي وحيد لكل شركة» عبر فهرس فريد جزئي بدل PK
--     المركّب (الـPK ها لا يضمن الفرادة عند vehicleId IS NULL).
--   - speedLimitKph: الحدّ بكيلومتر/ساعة (INTEGER، عملي وكافٍ).
--   - toleranceKph: هامش قبل اعتبار التجاوز خرقًا (DEFAULT 10 — يقلّل
--     ضوضاء أخطاء GPS البسيطة).
--   - حقول التدقيق (createdAt/updatedAt) قياسية.
--
-- LOOKUP RULE (في الكود): COALESCE(per-vehicle, per-company-default, 120)
--   - أوّل تطابق per-vehicle (vehicleId = vehicle.id).
--   - وإلا الافتراضي per-company (vehicleId IS NULL).
--   - وإلا 120 km/h كملاذ أخير ثابت (طريق سريع KSA).
--
-- SAFETY:  جدول جديد + tenant-isolated. لا أسرار.
--          الإذن: مفوّض ضمن خيار «أ» لشرائح 5-9.
--
-- @rollback:
--   DROP TABLE IF EXISTS vehicle_speed_limits;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS vehicle_speed_limits (
  id                 BIGSERIAL PRIMARY KEY,
  "companyId"        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "vehicleId"        INTEGER REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  "speedLimitKph"    INTEGER NOT NULL,
  "toleranceKph"     INTEGER NOT NULL DEFAULT 10,
  "notes"            TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ,
  CONSTRAINT vehicle_speed_limits_kph_range
    CHECK ("speedLimitKph" BETWEEN 30 AND 250),
  CONSTRAINT vehicle_speed_limits_tolerance_range
    CHECK ("toleranceKph" BETWEEN 0 AND 30)
);

-- صف افتراضي وحيد لكل شركة (vehicleId IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_speed_limits_company_default
  ON vehicle_speed_limits ("companyId")
  WHERE "vehicleId" IS NULL;

-- override واحد فقط لكل مركبة.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_speed_limits_vehicle
  ON vehicle_speed_limits ("companyId", "vehicleId")
  WHERE "vehicleId" IS NOT NULL;

COMMIT;
