-- ===========================================================================
-- 430_fleet_trip_events_weight_kind.sql
-- ---------------------------------------------------------------------------
-- WHAT:    add `weightKind` discriminator to `fleet_trip_events` — يُصنّف
--          قراءة الوزن: فارغ (tare) / محمّل (gross) / محور (axle) / أخرى.
--
-- WHY:     شريحة 2 (الوزن). شريحة 1 أضافت `weightKg` (قراءة وزن مفردة عند
--          الواقعة)، لكن لحساب «صافي الحمولة» (net = محمّل − فارغ) يجب أن
--          يعرف النظام نوع كل قراءة. بلا مُميِّز، الصافي غامض. المُميِّز
--          يجعل الصافي قابلًا للاشتقاق بلا لبس.
--
-- DESIGN:
--   - عمود TEXT اختياري + CHECK على القيم الأربع.
--   - الصافي (net) يبقى **مشتقًّا عند القراءة** لا مُخزَّنًا (مبدأ المصدر
--     الواحد — لا تخزين قيمة قابلة للاشتقاق).
--   - DROP CONSTRAINT IF EXISTS قبل ADD لجعل الهجرة idempotent.
--
-- SAFETY:  عمود اختياري إضافي على جدول قائم، لا مساس بالدفتر، الجدول معزول
--          إيجاريًا. الإذن: المالك اعتمد دفعة 2 (الوزن) كهجرة صغيرة
--          (2026-06-29).
--
-- @rollback:
--   ALTER TABLE fleet_trip_events DROP CONSTRAINT IF EXISTS fleet_trip_events_weight_kind_check;
--   ALTER TABLE fleet_trip_events DROP COLUMN IF EXISTS "weightKind";
-- ===========================================================================

BEGIN;

ALTER TABLE fleet_trip_events
  ADD COLUMN IF NOT EXISTS "weightKind" TEXT;

ALTER TABLE fleet_trip_events
  DROP CONSTRAINT IF EXISTS fleet_trip_events_weight_kind_check;
ALTER TABLE fleet_trip_events
  ADD CONSTRAINT fleet_trip_events_weight_kind_check
  CHECK ("weightKind" IS NULL OR "weightKind" = ANY (ARRAY[
    'tare'::text, 'gross'::text, 'axle'::text, 'other'::text
  ]));

COMMIT;
