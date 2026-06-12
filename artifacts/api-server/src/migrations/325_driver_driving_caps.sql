-- 325_driver_driving_caps.sql
--
-- WHAT: add two cap columns to `transport_planning_settings` so the
--       assignment engine can enforce a per-company daily / weekly
--       driving-time limit on every driver:
--         • defaultMaxDailyDrivingMinutes   — default 780  (13 hours)
--         • defaultMaxWeeklyDrivingMinutes  — default 3600 (60 hours)
--
-- WHY:  #2079 PE-03 (Driver readiness gate).  Owner's mandate
--       2026-06-11:
--         «أي سائق ... متجاوز سقف القيادة ... لا يدخل الترشيح إلا
--          وفق استثناء موثق إن كان النظام يسمح بذلك لاحقًا.»
--
--       Before this row, `transport_planning_settings` carried
--       `defaultRestHoursRequired` (point-to-point rest between
--       trips, since #1812 / migration 271) but no upper bound on
--       *aggregate* driving time. The audit (#2079 file 20 §5
--       REST-01) flagged that a driver could rack up 14 hours in
--       a day across multiple dispatches and the engine would not
--       notice.
--
--       The 780 / 3600 defaults match the industry baseline that
--       KSA's transport regulators publish (13h / day, 60h / week).
--       Companies can over-ride per-row.
--
-- SAFETY: pure additive. Both columns are NOT NULL with sane
--         defaults — every existing row inherits the standard caps
--         on first run, no UPDATE needed. The cap probe lives in
--         the engine and is hard-fail; tightening the cap below a
--         driver's accumulated minutes will block that driver until
--         the window rolls over.
--
-- @rollback: BEGIN;
--              ALTER TABLE public.transport_planning_settings
--                DROP COLUMN IF EXISTS "defaultMaxDailyDrivingMinutes",
--                DROP COLUMN IF EXISTS "defaultMaxWeeklyDrivingMinutes";
--            COMMIT;

BEGIN;

ALTER TABLE public.transport_planning_settings
  ADD COLUMN IF NOT EXISTS "defaultMaxDailyDrivingMinutes"
    INTEGER NOT NULL DEFAULT 780,
  ADD COLUMN IF NOT EXISTS "defaultMaxWeeklyDrivingMinutes"
    INTEGER NOT NULL DEFAULT 3600;

-- Sanity CHECKs: a daily cap above 24h or a weekly above 168h would
-- be data-entry nonsense — fail loudly at insert time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'transport_planning_caps_sane_check'
       AND conrelid = 'public.transport_planning_settings'::regclass
  ) THEN
    ALTER TABLE public.transport_planning_settings
      ADD CONSTRAINT transport_planning_caps_sane_check CHECK (
        "defaultMaxDailyDrivingMinutes"  > 0
        AND "defaultMaxDailyDrivingMinutes"  <= 24 * 60
        AND "defaultMaxWeeklyDrivingMinutes" > 0
        AND "defaultMaxWeeklyDrivingMinutes" <= 7 * 24 * 60
        AND "defaultMaxWeeklyDrivingMinutes" >= "defaultMaxDailyDrivingMinutes"
      );
  END IF;
END$$;

COMMIT;
