-- Ensure managerId FK on employee_assignments correctly points to employees(id).
-- Migration 027 may have created the column with wrong FK target.
-- This migration safely re-creates the FK without dropping column data.

DO $$
BEGIN
  -- Drop any existing FK constraint on managerId (whichever table it may point to)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'employee_assignments'
      AND constraint_name = 'employee_assignments_managerId_fkey'
  ) THEN
    ALTER TABLE employee_assignments DROP CONSTRAINT "employee_assignments_managerId_fkey";
  END IF;

  -- Add managerId column if it doesn't exist yet (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_assignments' AND column_name = 'managerId'
  ) THEN
    ALTER TABLE employee_assignments ADD COLUMN "managerId" INTEGER;
  END IF;

  -- Add FK pointing to employees(id)
  ALTER TABLE employee_assignments
    ADD CONSTRAINT "employee_assignments_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES employees(id) ON DELETE SET NULL;

  -- Ensure index exists
  CREATE INDEX IF NOT EXISTS idx_ea_manager_id ON employee_assignments("managerId");

EXCEPTION WHEN others THEN
  NULL;
END;
$$;
