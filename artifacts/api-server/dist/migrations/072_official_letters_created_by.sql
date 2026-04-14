-- 072_official_letters_created_by.sql
-- Track the assignment that actually filed the letter. Without this column,
-- rejection/return notifications had no reliable target when the letter was
-- filed on behalf of an employee by a different user (e.g. HR officer filing
-- for a driver), and the audit timeline could not attribute creation.

ALTER TABLE official_letters
  ADD COLUMN IF NOT EXISTS "createdByAssignmentId" INTEGER;

CREATE INDEX IF NOT EXISTS official_letters_created_by_idx
  ON official_letters ("createdByAssignmentId");
