-- Migration 188: constrain chart_of_accounts.type / .nature to their vocabularies.
--
-- RCA: Finance Deep Governance RCA (docs/audit/FINANCE_DEEP_GOVERNANCE_RCA.md)
--      finding COA-3 (P1).
--
-- WHAT: two CHECK constraints pinning chart_of_accounts.type and .nature to
--       the enums the API layer already validates with zod
--       (asset/liability/equity/revenue/expense ; debit/credit).
--
-- WHY:  type and nature are plain varchar with no database constraint. The
--       route layer validates them, but any other writer — a direct UPDATE,
--       a future code path, a manual data fix — can store an arbitrary
--       string. Finance reports classify accounts by type, so a bad value
--       silently mis-states the financial statements.
--
-- SAFETY: both constraints are added NOT VALID — they enforce every new and
--       updated row immediately but do NOT retroactively scan existing rows,
--       so the migration cannot fail on a pre-existing non-conforming value
--       (mirrors migration 184's NOT VALID CHECK pattern). The pg_constraint
--       existence guards make it idempotent.
--
-- @rollback:
--   ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_type_check;
--   ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_nature_check;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_type_check'
  ) THEN
    ALTER TABLE chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_type_check
      CHECK (type IN ('asset','liability','equity','revenue','expense')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_nature_check'
  ) THEN
    ALTER TABLE chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_nature_check
      CHECK (nature IN ('debit','credit')) NOT VALID;
  END IF;
END $$;
