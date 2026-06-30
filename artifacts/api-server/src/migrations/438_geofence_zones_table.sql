-- ===========================================================================
-- 438_geofence_zones_table.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `geofence_zones` — جدول السياجات الجغرافية المسموح بها
--          لكل مركبة. كل صف يمثّل دائرة (مركز + نصف قطر بالكيلومتر) داخلها
--          تشغيل المركبة طبيعي. خروج موضع GPS من جميع سياجات المركبة
--          خلال اليوم يطلق تنبيه «خروج السياج».
--
-- WHY:     Spec ملف 04 §تنبيهات الأسطول السبعة:
--          «خروج المركبة من السياج الجغرافي → تنبيه»
--
--          الموجود اليوم: smartAlerts.checkGeofenceViolation() معطّلة
--          (تعيد 0) لأنها كانت تبحث في أعمدة geofenceLat/Lon/Radius على
--          fleet_trips غير موجودة. لا جدول سياج ولا منطق فعّال.
--
-- DESIGN:
--   - دائرة (centerLat, centerLng, radiusKm) بدل بوليجون — أبسط، يسهل
--     اختباره، لا يحتاج PostGIS (غير منشورة في هذا النظام).
--   - مركبة واحدة قد تملك عدّة سياجات (الدوائر تتداخل = مساحة موحّدة).
--     مركبة بلا سياجات تُتجاهل تمامًا (الفحص اختياري وليس إجباريًا).
--   - حقول قياسية مع soft-delete للسماح بإلغاء سياج بأثر تاريخي
--     محفوظ.
--   - CHECK constraints على المدى المعقول لكل من lat/lng/radius لحماية
--     من إدخال مشوّه.
--
-- SAFETY:  جدول جديد + companyId FK، tenant-isolated. لا أسرار.
--          الإذن: مفوّض ضمن خيار «أ» لشرائح 5-9.
--
-- @rollback:
--   DROP TABLE IF EXISTS geofence_zones;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS geofence_zones (
  id              BIGSERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "vehicleId"     INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  "name"          VARCHAR(120) NOT NULL,
  "centerLat"     NUMERIC(10,6) NOT NULL,
  "centerLng"     NUMERIC(10,6) NOT NULL,
  "radiusKm"      NUMERIC(6,3)  NOT NULL,
  "notes"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ,
  "deletedAt"     TIMESTAMPTZ,
  CONSTRAINT geofence_zones_lat_range
    CHECK ("centerLat" BETWEEN -90 AND 90),
  CONSTRAINT geofence_zones_lng_range
    CHECK ("centerLng" BETWEEN -180 AND 180),
  CONSTRAINT geofence_zones_radius_range
    CHECK ("radiusKm" > 0 AND "radiusKm" <= 500)
);

-- فهرس الاستعلام الأساسي: «كل سياجات هذه المركبة الفعّالة».
CREATE INDEX IF NOT EXISTS idx_geofence_zones_vehicle
  ON geofence_zones ("companyId", "vehicleId")
  WHERE "deletedAt" IS NULL;

COMMIT;
