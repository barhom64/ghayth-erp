-- Migration 024: Add deletedAt to vouchers/expense_claims, progress tracking to umrah_import_logs

DO $$ BEGIN
  ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS vouchers_deleted_at_idx ON vouchers ("deletedAt") WHERE "deletedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS expense_claims_deleted_at_idx ON expense_claims ("deletedAt") WHERE "deletedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add progress tracking columns to umrah_import_logs
ALTER TABLE umrah_import_logs ADD COLUMN IF NOT EXISTS "processedRows" INTEGER DEFAULT 0;
ALTER TABLE umrah_import_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
