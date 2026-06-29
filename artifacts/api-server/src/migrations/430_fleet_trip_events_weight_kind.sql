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
--   - عمود TEXT اختياري (ADD COLUMN IF NOT EXISTS — توسّعي/آمن) + CHECK على
--     القيم الأربع.
--   - الصافي (net) يبقى **مشتقًّا عند القراءة** لا مُخزَّنًا (مبدأ المصدر
--     الواحد — لا تخزين قيمة قابلة للاشتقاق).
--   - القيد يُضاف داخل DO-block بحارس وجود pg_constraint (idempotent) بدل
--     DROP CONSTRAINT — تفاديًا لتصنيفه تغييرًا كاسرًا في سياسة الهجرات
--     (DROP CONSTRAINT يكسر النسخة القديمة أثناء النشر المتدرّج).
--
-- SAFETY:  عمود اختياري إضافي على جدول قائم، لا مساس بالدفتر، الجدول معزول
--          إيجاريًا، توسّعي بحت (لا narrowing لبيانات قائمة — كل الصفوف
--          الحالية weightKind = NULL يمرّ عليها CHECK). الإذن: المالك اعتمد
--          دفعة 2 (الوزن) كهجرة صغيرة (2026-06-29).
--
-- @rollback:
--   ALTER TABLE fleet_trip_events DROP CONSTRAINT IF EXISTS fleet_trip_events_weight_kind_check;
--   ALTER TABLE fleet_trip_events DROP COLUMN IF EXISTS "weightKind";
-- ===========================================================================

BEGIN;

ALTER TABLE fleet_trip_events
  ADD COLUMN IF NOT EXISTS "weightKind" TEXT;

-- حارس وجود pg_constraint: يضيف القيد مرّة واحدة بلا DROP CONSTRAINT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fleet_trip_events_weight_kind_check'
  ) THEN
    ALTER TABLE fleet_trip_events
      ADD CONSTRAINT fleet_trip_events_weight_kind_check
      CHECK ("weightKind" IS NULL OR "weightKind" = ANY (ARRAY[
        'tare'::text, 'gross'::text, 'axle'::text, 'other'::text
      ]));
  END IF;
END $$;

COMMIT;
