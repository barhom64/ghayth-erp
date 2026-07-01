-- Grant company 4 (وفد) owner access to every active owner of company 1 (مجموعة الدور).
-- The company switcher only lists companies where the user has an active owner/GM
-- assignment (req.scope.allowedCompanies), so newly-created company 4 was invisible
-- to the system owners even though it exists and is active.
-- Rows are stamped isAccessGrant=true: this is a cross-company access grant, not real
-- employment at وفد, so cron/HR/payroll (which filter isAccessGrant=FALSE) correctly
-- ignore it, while the owner/GM company-expansion in authMiddleware (which does NOT
-- filter isAccessGrant) still surfaces company 4 in the switcher.
-- Data-only, idempotent, guarded on company 4 + an active branch existing. Branch is
-- resolved dynamically (branchId is NOT NULL) so it works on both dev and prod.
-- @rollback: DELETE FROM employee_assignments WHERE "companyId" = 4 AND role = 'owner' AND "isAccessGrant" = true;

INSERT INTO employee_assignments
  ("employeeId", "companyId", "branchId", "jobTitle", role, status, "isPrimary", "isAccessGrant", "createdAt", "updatedAt")
SELECT DISTINCT
  src."employeeId",
  4,
  (SELECT id FROM branches WHERE "companyId" = 4 AND COALESCE(status, 'active') = 'active' ORDER BY id LIMIT 1),
  'مالك',
  'owner',
  'active',
  false,
  true,
  now(),
  now()
FROM employee_assignments src
WHERE src."companyId" = 1
  AND src.role = 'owner'
  AND src.status = 'active'
  AND EXISTS (SELECT 1 FROM companies WHERE id = 4)
  AND EXISTS (SELECT 1 FROM branches WHERE "companyId" = 4 AND COALESCE(status, 'active') = 'active')
  AND NOT EXISTS (
    SELECT 1 FROM employee_assignments ea2
    WHERE ea2."employeeId" = src."employeeId"
      AND ea2."companyId" = 4
      AND ea2.status = 'active'
  );
