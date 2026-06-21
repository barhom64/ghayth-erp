-- 397_fleet_breakdowns.sql
-- نقاط السائق الميدانية، الدفعة B: بلاغ عطل مركبة من السائق ميدانيًا.
--
-- WHAT:
--   fleet_breakdowns — السائق يبلّغ عن عطل مركبته (فئة العطل + خطورته + وصف +
--   موقع GPS اختياري + قراءة العداد)، فيُفتح بلاغ بحالة 'reported' يتابعه مشرف
--   الأسطول (acknowledged → in_repair → resolved/cancelled). ربط اختياري بالرحلة
--   وبطلب صيانة لاحق إن صُعّد.
--
-- DESIGN: additive + idempotent. FK للمركبة (NOT NULL، soft-delete فتبقى)،
--   وللسائق/الرحلة ON DELETE SET NULL/بلا FK. قيود CHECK تحرس الخطورة والحالة.
-- SAFETY: لا مساس بالدفتر — البلاغ واقعة تشغيلية بلا تكلفة؛ كلفة الإصلاح (إن
--   وُجدت) تُعالَج لاحقًا عبر مسار الصيانة القائم بمنطق costBearer هناك، لا هنا.
--   لا FK مالي، لا حذف، لا تعديل جداول قائمة.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS fleet_breakdowns;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_breakdowns (
  id                     BIGSERIAL PRIMARY KEY,
  "companyId"            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"             INTEGER,
  "vehicleId"            INTEGER NOT NULL REFERENCES fleet_vehicles(id),
  "driverId"             INTEGER REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  "tripId"               INTEGER,
  "reportedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "category"             VARCHAR(20),
  "severity"             VARCHAR(20) NOT NULL DEFAULT 'medium',
  "status"               VARCHAR(20) NOT NULL DEFAULT 'reported',
  "description"          TEXT NOT NULL,
  "odometer"             INTEGER,
  "locationLat"          NUMERIC(9,6),
  "locationLng"          NUMERIC(9,6),
  "reportedByUserId"     INTEGER,
  "reportedByRole"       VARCHAR(20),
  "acknowledgedByUserId" INTEGER,
  "acknowledgedAt"       TIMESTAMPTZ,
  "maintenanceRequestId" INTEGER,
  "resolvedAt"           TIMESTAMPTZ,
  "resolutionNotes"      TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ,
  "deletedAt"            TIMESTAMPTZ,
  CONSTRAINT fleet_breakdown_severity_chk
    CHECK ("severity" IN ('low','medium','high','critical')),
  CONSTRAINT fleet_breakdown_status_chk
    CHECK ("status" IN ('reported','acknowledged','in_repair','resolved','cancelled')),
  CONSTRAINT fleet_breakdown_category_chk
    CHECK ("category" IS NULL OR "category" IN ('engine','tire','electrical','brakes','transmission','cooling','bodywork','other'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_breakdowns_vehicle
  ON fleet_breakdowns ("companyId", "vehicleId", "reportedAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_breakdowns_driver
  ON fleet_breakdowns ("companyId", "driverId", "reportedAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_breakdowns_open
  ON fleet_breakdowns ("companyId", "status", "reportedAt" DESC)
  WHERE "deletedAt" IS NULL AND "status" IN ('reported','acknowledged','in_repair');

COMMIT;
