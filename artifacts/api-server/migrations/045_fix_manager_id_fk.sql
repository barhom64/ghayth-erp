-- Fix managerId FK on employee_assignments: remove old FK constraint (if exists) and add FK to employees(id)
-- We do NOT drop the column to preserve any existing data.

DO $$
BEGIN
  -- Drop the old FK constraint that may reference employee_assignments(id)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'employee_assignments'
      AND constraint_name = 'employee_assignments_managerId_fkey'
  ) THEN
    ALTER TABLE employee_assignments DROP CONSTRAINT "employee_assignments_managerId_fkey";
  END IF;

  -- Re-add FK pointing to employees(id)
  ALTER TABLE employee_assignments
    ADD CONSTRAINT "employee_assignments_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES employees(id) ON DELETE SET NULL;

EXCEPTION WHEN others THEN
  -- If already correct or column does not exist, skip silently
  NULL;
END;
$$;
