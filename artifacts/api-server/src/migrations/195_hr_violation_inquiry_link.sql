-- HR-013: formalise the link between employee_violations and
-- hr_inquiry_memos. Migration 034 already added the `inquiryMemoId`
-- column (a "soft link"); this migration upgrades it to a real foreign
-- key with ON DELETE SET NULL so deleting an inquiry memo no longer
-- leaves an orphan reference on the violation row.
--
-- The two tables remain DISTINCT entities (not merged):
--   - hr_inquiry_memos    = manual inquiry / investigation phase
--   - employee_violations = recorded incident (also auto-detected)
-- The link captures the lifecycle: a detected violation may later be
-- promoted to an inquiry memo for review.
--
-- @rollback:
--   ALTER TABLE employee_violations
--     DROP CONSTRAINT IF EXISTS employee_violations_inquiryMemoId_fkey;

-- Defensive cleanup: NULL out any orphan inquiryMemoId values left over
-- from the soft-link era so adding the FK doesn't fail on existing rows.
UPDATE employee_violations
   SET "inquiryMemoId" = NULL
 WHERE "inquiryMemoId" IS NOT NULL
   AND "inquiryMemoId" NOT IN (SELECT id FROM hr_inquiry_memos);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_violations_inquiryMemoId_fkey'
  ) THEN
    ALTER TABLE employee_violations
      ADD CONSTRAINT "employee_violations_inquiryMemoId_fkey"
      FOREIGN KEY ("inquiryMemoId") REFERENCES hr_inquiry_memos(id) ON DELETE SET NULL;
  END IF;
END $$;
