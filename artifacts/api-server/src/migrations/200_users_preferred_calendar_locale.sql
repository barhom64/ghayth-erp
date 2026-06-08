-- 200_users_preferred_calendar_locale.sql
--
-- Adds two user-level preference columns:
--   - preferredCalendar: 'hijri' | 'gregorian' (default 'hijri' for KSA market)
--   - preferredLocale  : 'ar' | 'en'          (default 'ar' — Arabic is the
--                                              first-class language)
--
-- Before this migration the only "calendar" pref lived in browser
-- localStorage on a single device, so the user's choice didn't follow
-- them between machines and the backend couldn't pre-format dates for
-- emails / PDFs / receipts. This column is the server-side source of
-- truth. `GET /auth/me` now exposes both fields; a new
-- `PATCH /auth/me/preferences` lets the front-end persist changes.
--
-- Defaults reflect the codebase's primary deployment context (Saudi
-- Arabia, Arabic-first UI). Existing users get the default; admins or
-- the user themselves can flip it from the settings page.
--
-- @rollback:
--   ALTER TABLE users
--     DROP CONSTRAINT IF EXISTS users_preferred_calendar_check,
--     DROP CONSTRAINT IF EXISTS users_preferred_locale_check,
--     DROP COLUMN IF EXISTS "preferredCalendar",
--     DROP COLUMN IF EXISTS "preferredLocale";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "preferredCalendar" TEXT NOT NULL DEFAULT 'hijri',
  ADD COLUMN IF NOT EXISTS "preferredLocale"   TEXT NOT NULL DEFAULT 'ar';

-- Idempotent: skip each CHECK if it already exists (the baseline dump may
-- already carry it, in which case a bare ADD CONSTRAINT aborts the boot).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_preferred_calendar_check' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_preferred_calendar_check CHECK ("preferredCalendar" IN ('hijri','gregorian'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_preferred_locale_check' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_preferred_locale_check CHECK ("preferredLocale" IN ('ar','en'));
  END IF;
END $$;
