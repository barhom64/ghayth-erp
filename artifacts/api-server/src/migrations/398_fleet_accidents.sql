-- 398_fleet_accidents.sql
-- نقاط السائق الميدانية، الدفعة C1: بلاغ حادث مركبة من السائق ميدانيًا.
--
-- WHAT:
--   fleet_accidents — السائق يبلّغ عن حادث مركبته (وقت/موقع GPS/وصف/إصابات/
--   طرف ثالث/عدّاد)، فيُفتح بلاغ بحالة 'reported' يقيّمه مشرف الأسطول لاحقًا.
--   حقول التقييم (costBearer + التكلفة المقدّرة) موجودة في المخطّط لكن لا تُرحَّل
--   للدفتر في هذه الدفعة — الترحيل المحاسبي (ذمة موظف/مطالبة HR/مخالفة حسب
--   costBearer) هو الدفعة C2 المستقلة، التي تأتي مع assertion tests على سطور
--   القيد (القاعدة 3 المطلقة).
--
-- DESIGN: additive + idempotent. FK للمركبة (NOT NULL)، وللسائق ON DELETE SET
--   NULL. CHECK تحرس الحالة، الخطورة، و costBearer (يبقى NULL حتى التقييم).
-- SAFETY: لا مساس بالدفتر في C1 — لا FK مالي، لا قيد، لا حذف، لا تعديل جداول
--   قائمة. costBearer/التكلفة مجرّد حقول تشغيلية تنتظر تقييم C2.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS fleet_accidents;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_accidents (
  id                   BIGSERIAL PRIMARY KEY,
  "companyId"          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"           INTEGER,
  "vehicleId"          INTEGER NOT NULL REFERENCES fleet_vehicles(id),
  "driverId"           INTEGER REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  "tripId"             INTEGER,
  "occurredAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "reportedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "severity"           VARCHAR(20) NOT NULL DEFAULT 'minor',
  "status"             VARCHAR(20) NOT NULL DEFAULT 'reported',
  "description"        TEXT NOT NULL,
  "locationText"       TEXT,
  "locationLat"        NUMERIC(9,6),
  "locationLng"        NUMERIC(9,6),
  "odometer"           INTEGER,
  "hasInjuries"        BOOLEAN NOT NULL DEFAULT FALSE,
  "thirdPartyInvolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "thirdPartyDetails"  TEXT,
  "policeReportNo"     VARCHAR(60),
  "reportedByUserId"   INTEGER,
  "reportedByRole"     VARCHAR(20),
  -- حقول تقييم C2 (تنتظر مشرفًا؛ لا ترحيل في C1) ----------------------------
  "costBearer"         VARCHAR(20),
  "estimatedCost"      NUMERIC(14,2),
  "assessedByUserId"   INTEGER,
  "assessedAt"         TIMESTAMPTZ,
  "assessmentNotes"    TEXT,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ,
  "deletedAt"          TIMESTAMPTZ,
  CONSTRAINT fleet_accident_severity_chk
    CHECK ("severity" IN ('minor','moderate','severe','total_loss')),
  CONSTRAINT fleet_accident_status_chk
    CHECK ("status" IN ('reported','under_review','assessed','closed','cancelled')),
  CONSTRAINT fleet_accident_cost_bearer_chk
    CHECK ("costBearer" IS NULL OR "costBearer" IN ('company','driver','insurance','customer','tenant','third_party'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_accidents_vehicle
  ON fleet_accidents ("companyId", "vehicleId", "occurredAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_accidents_driver
  ON fleet_accidents ("companyId", "driverId", "occurredAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_accidents_open
  ON fleet_accidents ("companyId", "status", "occurredAt" DESC)
  WHERE "deletedAt" IS NULL AND "status" IN ('reported','under_review','assessed');

COMMIT;
