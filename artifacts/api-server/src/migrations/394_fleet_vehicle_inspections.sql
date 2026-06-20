-- 394_fleet_vehicle_inspections.sql
-- متابعة النقل بالصور: فحص مركبة (استلام/تسليم/يومي/طارئ) مع قراءة عداد + صور
-- متعددة الاتجاهات (عداد/أمامية/خلفية/جانبية/داخلية/مؤشر الوقود/أضرار)، وسير
-- اعتماد (المشرف يعتمد أو يرفض). يبني على ما هو موجود: العداد يُلتقط أصلًا على
-- fleet_rental_contracts (handover/return)، والصور تُخزَّن في GCS عبر بنية
-- storage/documents الحالية — هنا نضيف فقط سجلّ الفحص العام وربط الصور به.
--
-- WHAT:
--   1. fleet_vehicle_inspections — حدث فحص عام مربوط بمركبة (+ سائق/عقد إيجار/
--      رحلة اختياريًا): النوع، قراءة العداد، مستوى الوقود، الملاحظات، الحالة
--      (pending للطلب اليومي → submitted → approved/rejected)، ومَن التقطه/راجعه.
--   2. fleet_inspection_photos — صور الفحص: نوع كل صورة + مسار GCS (storageKey).
--
-- DESIGN: additive + idempotent. لا تعديل على جداول قائمة. FK للمركبة (NOT NULL،
--   المركبة soft-delete فتبقى)، وللسائق/العقد ON DELETE SET NULL (اختياريان)،
--   وللصور ON DELETE CASCADE مع الفحص. قيود CHECK تحرس الأنواع والحالات.
-- SAFETY: لا مساس بالدفتر، لا FK مالي، لا حذف، لا تغيير سلوك قائم.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS fleet_inspection_photos;
--     DROP TABLE IF EXISTS fleet_vehicle_inspections;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_vehicle_inspections (
  id                  BIGSERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"          INTEGER,
  "vehicleId"         INTEGER NOT NULL REFERENCES fleet_vehicles(id),
  "driverId"          INTEGER REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  "rentalContractId"  INTEGER REFERENCES fleet_rental_contracts(id) ON DELETE SET NULL,
  "tripId"            INTEGER,
  "inspectionType"    VARCHAR(20) NOT NULL,
  "odometer"          INTEGER,
  "fuelLevel"         NUMERIC(4,2),
  "notes"             TEXT,
  "status"            VARCHAR(20) NOT NULL DEFAULT 'submitted',
  "dueDate"           DATE,
  "capturedByUserId"  INTEGER,
  "capturedByRole"    VARCHAR(20),
  "capturedAt"        TIMESTAMPTZ,
  "reviewedByUserId"  INTEGER,
  "reviewedAt"        TIMESTAMPTZ,
  "reviewNotes"       TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ,
  "deletedAt"         TIMESTAMPTZ,
  CONSTRAINT fleet_inspection_type_chk
    CHECK ("inspectionType" IN ('handover','return','daily','adhoc')),
  CONSTRAINT fleet_inspection_status_chk
    CHECK ("status" IN ('pending','submitted','approved','rejected')),
  CONSTRAINT fleet_inspection_fuel_chk
    CHECK ("fuelLevel" IS NULL OR ("fuelLevel" >= 0 AND "fuelLevel" <= 1))
);

CREATE INDEX IF NOT EXISTS idx_fleet_inspections_vehicle
  ON fleet_vehicle_inspections ("companyId", "vehicleId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_inspections_status
  ON fleet_vehicle_inspections ("companyId", "status", "inspectionType")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_inspections_driver_due
  ON fleet_vehicle_inspections ("companyId", "driverId", "dueDate")
  WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS fleet_inspection_photos (
  id              BIGSERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "inspectionId"  BIGINT NOT NULL REFERENCES fleet_vehicle_inspections(id) ON DELETE CASCADE,
  "photoType"     VARCHAR(30) NOT NULL,
  "storageKey"    TEXT NOT NULL,
  "fileName"      TEXT,
  "mimeType"      VARCHAR(60),
  "fileSize"      INTEGER,
  "capturedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ,
  CONSTRAINT fleet_inspection_photo_type_chk
    CHECK ("photoType" IN ('odometer','front','rear','left','right','interior','fuel_gauge','damage','other'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_inspection_photos_inspection
  ON fleet_inspection_photos ("companyId", "inspectionId")
  WHERE "deletedAt" IS NULL;

COMMIT;
