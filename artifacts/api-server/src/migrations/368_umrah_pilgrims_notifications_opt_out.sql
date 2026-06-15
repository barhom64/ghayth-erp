-- U-17-P5 — pilgrim opt-out flag for internal notifications.
--
-- A pilgrim can be flagged "do-not-contact" — e.g. an alumnus on a
-- visa already cleared, or a privacy-sensitive guest. Until this
-- column existed, the in-app notification cron blasted every event
-- to the agency-internal recipients regardless. Now any pilgrim row
-- with `notifications_opt_out = true` is skipped at the dispatch
-- step.
--
-- Permanent hard rails:
--   - additive, idempotent, NULLABLE (treated as `false` at read).
--   - NO default — explicit opt-in semantics (null vs true).
--   - NO backfill — every existing pilgrim stays null/false.
--   - NO FK — boolean only.
--
-- @rollback:
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS notifications_opt_out;
--   DROP INDEX IF EXISTS idx_umrah_pilgrims_notifications_opt_out;

ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS notifications_opt_out boolean;

-- Partial index — only the opted-out rows. The vast majority will be
-- null/false so this index stays tiny even on a big tenant.
CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_notifications_opt_out
  ON umrah_pilgrims ("companyId", id)
  WHERE notifications_opt_out = true;
