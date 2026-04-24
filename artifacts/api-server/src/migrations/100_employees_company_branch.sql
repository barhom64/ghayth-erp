-- Many routes assume employees.companyId / employees.branchId, but the live
-- schema put those on employee_assignments. Add the columns onto employees and
-- backfill from each employee's primary (or most recent) assignment so legacy
-- routes work without rewrites.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "branchId"  INTEGER;

UPDATE employees e
SET "companyId" = ea."companyId",
    "branchId"  = COALESCE(ea."branchId", e."branchId")
FROM (
  SELECT DISTINCT ON ("employeeId")
         "employeeId", "companyId", "branchId"
  FROM employee_assignments
  ORDER BY "employeeId", "isPrimary" DESC NULLS LAST, "hireDate" DESC NULLS LAST, id DESC
) ea
WHERE e.id = ea."employeeId" AND e."companyId" IS NULL;

-- Default any orphans to the first company so inserts don't trip a NOT NULL gap later
UPDATE employees SET "companyId" = (SELECT id FROM companies ORDER BY id LIMIT 1)
WHERE "companyId" IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company ON employees ("companyId") WHERE "deletedAt" IS NULL;
