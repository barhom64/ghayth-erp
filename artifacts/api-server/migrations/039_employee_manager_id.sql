-- Add managerId to employee_assignments to track direct manager by employee ID
ALTER TABLE employee_assignments
  ADD COLUMN IF NOT EXISTS "managerId" INTEGER REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_assignments_manager_id ON employee_assignments("managerId");
