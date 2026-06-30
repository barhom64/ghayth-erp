-- ===========================================================================
-- 429_fleet_trip_events.sql
-- ---------------------------------------------------------------------------
-- WHAT:    create `fleet_trip_events` — سجل وقائع الرحلة (append-only).
--          كل صف = واقعة تشغيلية واحدة سجّلها السائق/المنسّق أثناء تنفيذ
--          حجز نقل: تحميل / خروج / وصول / فحص / تفريغ / تسليم عهدة / تسليم.
--
-- WHY:     مبدأ «الكيان يقود التجربة / تسجيل واقعة» (مهارة ghayth-experience):
--          الواجهة تشغيلية بحتة — السائق يسجّل «ما حدث» ويرفق الإثبات، والنظام
--          يشتقّ خلفيًا انتقال حالة الحجز + مرشّح الفوترة + مؤشرات الأداء.
--          اليوم `fleet_trips` يحمل start/complete فقط بلا مراحل ولا إثبات؛
--          هذا الجدول يضيف الحبيبات (granularity) دون تضخيم حالات الحجز:
--          الحجز يبقى coarse (in_progress / completed) والوقائع تحمل التفصيل.
--
-- DESIGN:
--   - الكيان القائد = الحجز: `bookingId` (NOT NULL, FK → transport_bookings).
--   - وحدة التنفيذ = أمر التوزيع: `dispatchOrderId` (اختياري) — يحمل المركبة
--     والسائق والبند؛ يجعل السجل جاهزًا لتبديل السائق لاحقًا (عدة أرجل لحجز
--     واحد) بلا هجرة جديدة.
--   - append-only: لا UPDATE على الواقعة (الوقائع حقائق). التصحيح = إبطال ناعم
--     (`voidedAt`/`voidedReason`/`voidedBy`) + تسجيل واقعة جديدة. لا حذف صلب.
--   - الإثبات (POD): `proofObjectPaths TEXT[]` — مسارات GCS لصور الإثبات،
--     بنفس تدفّق الرفع القائم (`/storage/uploads/request-url`) المستخدم في
--     فحص المركبات؛ تُخدَم بروابط موقّعة مفلترة بـ companyId. (لا نكرّر
--     آلية تخزين جديدة — إعادة استخدام مسار التخزين الخادم.)
--   - `weightKg` (اختياري): قراءة وزن عند الواقعة — العمود يُهيّأ الآن
--     (مُعتمد ضمن قائمة الحقول)، ومنطق الوزن (فارغ/محمّل/صافي) شريحة لاحقة.
--   - `lat`/`lng`: موقع الواقعة (NUMERIC(10,7) بنفس نمط fleet_trips).
--   - `recordedByAssignmentId`: التعيين الذي سجّل (القاعدة الذهبية — كل جدول
--     عملياتي يحمل assignmentId)؛ `createdBy` = userId للتدقيق.
--   - companyId + branchId للعزل الإيجاري وتقارير الفروع.
--
-- SAFETY:  جدول جديد فقط + companyId FK، tenant-isolated، لا مساس بالدفتر،
--          لا أسرار. الإذن: المالك اعتمد إنشاء `fleet_trip_events` صراحةً
--          (شريحة 1 من تثبيت آلية النقل، 2026-06-29).
--
-- @rollback:
--   DROP TABLE IF EXISTS fleet_trip_events;
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_trip_events (
  id                        SERIAL PRIMARY KEY,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER,
  "bookingId"               INTEGER NOT NULL REFERENCES transport_bookings(id) ON DELETE CASCADE,
  "dispatchOrderId"         INTEGER REFERENCES transport_dispatch_orders(id) ON DELETE SET NULL,
  "eventType"               TEXT NOT NULL,
  "occurredAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lat"                     NUMERIC(10,7),
  "lng"                     NUMERIC(10,7),
  "weightKg"                NUMERIC(12,3),
  "proofObjectPaths"        TEXT[],
  "notes"                   TEXT,
  "recordedByAssignmentId"  INTEGER,
  "createdBy"               INTEGER,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "voidedAt"                TIMESTAMPTZ,
  "voidedReason"            TEXT,
  "voidedBy"                INTEGER,
  CONSTRAINT fleet_trip_events_type_check
    CHECK ("eventType" = ANY (ARRAY[
      'load'::text, 'depart'::text, 'arrive'::text, 'inspect'::text,
      'unload'::text, 'handover'::text, 'deliver'::text
    ])),
  CONSTRAINT fleet_trip_events_weight_nonneg
    CHECK ("weightKg" IS NULL OR "weightKg" >= 0),
  CONSTRAINT fleet_trip_events_proof_count
    CHECK ("proofObjectPaths" IS NULL OR array_length("proofObjectPaths", 1) <= 20)
);

-- قائمة وقائع الحجز زمنيًا (الاستعلام الأساسي في صفحة الحجز).
CREATE INDEX IF NOT EXISTS idx_fleet_trip_events_booking
  ON fleet_trip_events ("companyId", "bookingId", "occurredAt");

-- وقائع رِجل تنفيذ بعينها (لتبديل السائق لاحقًا).
CREATE INDEX IF NOT EXISTS idx_fleet_trip_events_dispatch
  ON fleet_trip_events ("dispatchOrderId")
  WHERE "dispatchOrderId" IS NOT NULL;

COMMIT;
