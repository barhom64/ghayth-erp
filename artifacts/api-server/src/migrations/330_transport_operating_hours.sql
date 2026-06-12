-- 330_transport_operating_hours.sql
--
-- WHAT: add a transport operating-window definition to
--       `transport_planning_settings`:
--         • operatingStartTime  TIME  — e.g. '06:00'
--         • operatingEndTime    TIME  — e.g. '22:00'
--         • operatingDaysMask   INT   — 7-bit, bit 0 = Sunday
--                                       (Asia/Riyadh wall-clock, same
--                                       convention as
--                                       transport_route_patterns.daysOfWeekMask)
--
--       All three are NULLABLE. NULL = «لا قيد» — the company runs
--       24/7 and the engine skips the operating-window guard
--       entirely. Enforcement is opt-in by configuration, never by
--       default.
--
-- WHY:  #2079 PE-04 (utilization + branch operating hours). Owner's
--       mandate 2026-06-11:
--         «ساعات تشغيل الفرع تكون حارسًا تشغيليًا واضحًا: إذا كانت
--          نافذة الرحلة خارج ساعات تشغيل الفرع، فلا تدخل في الترشيح
--          إلا إذا كان هناك استثناء موثق لاحقًا. يجب أن يظهر سبب رفض
--          عربي واضح.»
--
--       Also closes UTIL-02 from docs/transport-audit/20 §1: the
--       ops-weekly utilisation denominator assumed 24/7 operation
--       («مقام 7×24×3600 تجاري مُضلِّل»). With these columns the
--       engine can compute utilisation against the REAL operating
--       window.
--
--       Placement note: the columns live on transport_planning_settings
--       (one row per company — the transport department's operating
--       window) rather than on `branches`. Per-branch overrides are a
--       later refinement once multi-branch transport ops actually
--       diverge; the audit (file 20 §1 UTIL-02) records this scoping
--       decision.
--
-- SAFETY: pure additive, all columns nullable, default behaviour
--         (NULL) is identical to today — zero enforcement until the
--         company explicitly configures a window.
--
-- @rollback: BEGIN;
--              ALTER TABLE public.transport_planning_settings
--                DROP COLUMN IF EXISTS "operatingStartTime",
--                DROP COLUMN IF EXISTS "operatingEndTime",
--                DROP COLUMN IF EXISTS "operatingDaysMask";
--            COMMIT;

BEGIN;

ALTER TABLE public.transport_planning_settings
  ADD COLUMN IF NOT EXISTS "operatingStartTime" TIME,
  ADD COLUMN IF NOT EXISTS "operatingEndTime"   TIME,
  ADD COLUMN IF NOT EXISTS "operatingDaysMask"  INTEGER;

-- Sanity: a days mask outside the 7-bit range is data-entry nonsense,
-- and a window where start = end is ambiguous (zero-length or 24h?) —
-- refuse both loudly. start > end (overnight window, e.g. 20:00→04:00)
-- IS allowed: night-shift fleets exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'transport_operating_window_sane_check'
       AND conrelid = 'public.transport_planning_settings'::regclass
  ) THEN
    ALTER TABLE public.transport_planning_settings
      ADD CONSTRAINT transport_operating_window_sane_check CHECK (
        ("operatingDaysMask" IS NULL
          OR ("operatingDaysMask" >= 1 AND "operatingDaysMask" <= 127))
        AND ("operatingStartTime" IS NULL OR "operatingEndTime" IS NULL
          OR "operatingStartTime" <> "operatingEndTime")
      );
  END IF;
END$$;

COMMIT;
