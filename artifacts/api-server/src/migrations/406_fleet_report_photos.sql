-- 406_fleet_report_photos.sql
-- صور بلاغات السائق الميدانية: حادث + عطل. يسدّ فجوة المراجعة (الفحوص لها صور
-- في fleet_inspection_photos، أما الحادث/العطل فبلا دليل مصوّر — ناقص للتأمين).
--
-- WHAT:
--   1. fleet_accident_photos  — صور الحادث (مشهد/ضرر/مركبة/مستند/لوحة) مربوطة
--      بالحادث، بمسار GCS (storageKey) — نفس بنية fleet_inspection_photos.
--   2. fleet_breakdown_photos — صور العطل (عطل/لوحة عدّادات/مركبة/أخرى).
--
-- DESIGN: additive + idempotent. FK للأب ON DELETE CASCADE (الصور تتبع البلاغ).
--   CHECK تحرس أنواع الصور. لا مساس بالدفتر، لا FK مالي، لا تعديل جداول قائمة.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS fleet_accident_photos;
--     DROP TABLE IF EXISTS fleet_breakdown_photos;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_accident_photos (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "accidentId"  BIGINT  NOT NULL REFERENCES fleet_accidents(id) ON DELETE CASCADE,
  "photoType"   VARCHAR(30) NOT NULL,
  "storageKey"  TEXT NOT NULL,
  "fileName"    TEXT,
  "mimeType"    VARCHAR(60),
  "fileSize"    INTEGER,
  "capturedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ,
  CONSTRAINT fleet_accident_photo_type_chk
    CHECK ("photoType" IN ('scene','damage','vehicle','plate','document','other'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_accident_photos_accident
  ON fleet_accident_photos ("companyId", "accidentId")
  WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS fleet_breakdown_photos (
  id             BIGSERIAL PRIMARY KEY,
  "companyId"    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "breakdownId"  BIGINT  NOT NULL REFERENCES fleet_breakdowns(id) ON DELETE CASCADE,
  "photoType"    VARCHAR(30) NOT NULL,
  "storageKey"   TEXT NOT NULL,
  "fileName"     TEXT,
  "mimeType"     VARCHAR(60),
  "fileSize"     INTEGER,
  "capturedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"    TIMESTAMPTZ,
  CONSTRAINT fleet_breakdown_photo_type_chk
    CHECK ("photoType" IN ('fault','dashboard','vehicle','other'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_breakdown_photos_breakdown
  ON fleet_breakdown_photos ("companyId", "breakdownId")
  WHERE "deletedAt" IS NULL;

COMMIT;
