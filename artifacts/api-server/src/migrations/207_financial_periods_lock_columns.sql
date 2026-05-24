-- 207_financial_periods_lock_columns.sql
--
-- PER-3 — surface the audit-lock lifecycle on financial_periods.
--
-- Background: `db/schema_pre.sql` (the bootstrap dump) already carries
-- `lockedAt`, `lockedBy` and a CHECK constraint that allows
-- `status='locked'`. The `lockReason` column was never tracked there
-- either, and none of the three are written by any migration file —
-- so a tenant DB bootstrapped from migrations alone (no
-- schema_pre.sql snapshot) lacks them entirely. This migration brings
-- the migration folder in line with the schema dump and adds the
-- final `lockReason` column needed by the new
-- POST /fiscal-periods-v2/:id/lock endpoint (financeHardeningRouter).
--
-- All ADDs use IF NOT EXISTS so the migration is a no-op on DBs that
-- already carry the columns via schema_pre.sql bootstrap.
--
-- @rollback:
--   ALTER TABLE financial_periods
--     DROP COLUMN IF EXISTS "lockReason",
--     DROP COLUMN IF EXISTS "lockedBy",
--     DROP COLUMN IF EXISTS "lockedAt";

ALTER TABLE financial_periods
  ADD COLUMN IF NOT EXISTS "lockedAt"   TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS "lockedBy"   INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "lockReason" TEXT NULL;
