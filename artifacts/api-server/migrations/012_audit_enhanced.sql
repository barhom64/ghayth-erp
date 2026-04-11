-- Enhanced audit: add changes (diff) column and ensure all required columns exist
DO $$ BEGIN
  BEGIN ALTER TABLE audit_logs ADD COLUMN "changes" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE audit_logs ADD COLUMN "before" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE audit_logs ADD COLUMN "after" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE audit_logs ADD COLUMN "reason" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE audit_logs ADD COLUMN "userAgent" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE audit_logs ADD COLUMN "scope" JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;
