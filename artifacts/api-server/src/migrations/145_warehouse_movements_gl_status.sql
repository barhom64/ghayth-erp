-- Task #190: warehouse-gl helper UPDATEs warehouse_movements."glStatus" when
-- a journal entry fails to post (see businessHelpers.ts:431). The column was
-- never added in any prior migration, so the UPDATE used to silently warn
-- ("glStatus column may not exist on source table") and the UI had no signal
-- that a movement needed re-posting. Add it as a nullable text marker with a
-- check on the small set of values the helper writes today.
ALTER TABLE warehouse_movements
  ADD COLUMN IF NOT EXISTS "glStatus" varchar(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_movements_gl_status_chk'
  ) THEN
    ALTER TABLE warehouse_movements
      ADD CONSTRAINT warehouse_movements_gl_status_chk
      CHECK ("glStatus" IS NULL OR "glStatus" IN ('pending','posted','failed','skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS warehouse_movements_gl_status_failed_idx
  ON warehouse_movements ("companyId", "glStatus")
  WHERE "glStatus" = 'failed';
