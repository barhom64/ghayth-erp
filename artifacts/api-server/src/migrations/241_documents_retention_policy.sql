-- 241_documents_retention_policy.sql
--
-- WHAT:    add `retentionUntil` + `retentionPolicy` columns to documents
--          so PDPL/ZATCA compliance scheduled cleanup can hard-delete
--          (or anonymise) old files after their legal hold expires.
--          Closes the M5 gap from
--          docs/testing/CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     pre-fix there was no `retentionUntil` column. Object-storage
--          grew forever; PDPL Article 18 (delete personal data once
--          purpose ends) was uneneforceable; ZATCA's 6-year invoice
--          archive could not be distinguished from HR-confidential files
--          that should be purged after 2 years.
--
--          This migration only adds the policy fields. The actual delete
--          pass lives outside the migration — a cron job reads
--          retention_due_for_cleanup and processes batches. Until the
--          cron is wired, the columns just store intent; nothing is
--          deleted.
--
-- SAFETY:  pure additive migration. Defaults are NULL so existing rows
--          remain "no policy yet" — they will be backfilled by the
--          policy router (a separate one-time admin action) per
--          category, NOT by this DDL. That means rollout doesn't
--          surprise anyone.
--
-- @rollback: ALTER TABLE documents DROP COLUMN IF EXISTS "retentionUntil",
--                                   DROP COLUMN IF EXISTS "retentionPolicy";

BEGIN;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS "retentionUntil" date,
  ADD COLUMN IF NOT EXISTS "retentionPolicy" varchar(40);

CREATE INDEX IF NOT EXISTS idx_documents_retention_due
  ON public.documents ("companyId", "retentionUntil")
  WHERE "retentionUntil" IS NOT NULL AND "deletedAt" IS NULL;

COMMIT;
