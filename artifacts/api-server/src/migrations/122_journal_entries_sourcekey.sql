-- Add sourceKey idempotency column + deletedAt soft-delete column to journal_entries
-- Required by financialEngine.postJournalEntry (sourceKey query) and standard soft-delete pattern.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "sourceKey" VARCHAR(200);

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_companyid_sourcekey_uq
  ON journal_entries ("companyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS journal_entries_deletedat_idx
  ON journal_entries ("deletedAt") WHERE "deletedAt" IS NULL;
