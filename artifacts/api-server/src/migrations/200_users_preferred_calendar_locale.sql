-- 200_users_preferred_calendar_locale.sql
-- Adds user-level calendar and locale preferences. Safe to re-run on dumps
-- where the columns/constraints already exist.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "preferredCalendar" TEXT NOT NULL DEFAULT 'hijri',
  ADD COLUMN IF NOT EXISTS "preferredLocale"   TEXT NOT NULL DEFAULT 'ar';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_preferred_calendar_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_preferred_calendar_check
      CHECK ("preferredCalendar" IN ('hijri','gregorian'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_preferred_locale_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_preferred_locale_check
      CHECK ("preferredLocale" IN ('ar','en'));
  END IF;
END $$;
