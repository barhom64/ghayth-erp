-- 412_users_table_prefs.sql
--
-- Adds one user-level preference column:
--   - tablePrefs: per-user table UI preferences as JSONB (default '{}')
--
-- Today this carries the table page-size the user last chose (e.g.
-- {"pageSize": 50}); the JSONB shape leaves room for future table prefs
-- (column order, hidden columns, sort) without another migration. Before
-- this column the page-size lived only in browser localStorage on a single
-- device, so the user's choice didn't follow them between machines. This
-- column is the server-side source of truth. `GET /auth/me` now exposes the
-- field; the existing `PATCH /auth/me/preferences` lets the front-end persist
-- changes (server merges into the existing object rather than overwriting).
--
-- Default is an empty object so existing users behave exactly as before
-- (consumers fall back to their own default page-size when the key is absent).
--
-- @rollback:
--   ALTER TABLE users
--     DROP COLUMN IF EXISTS "tablePrefs";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "tablePrefs" JSONB NOT NULL DEFAULT '{}'::jsonb;
