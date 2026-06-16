-- Migration 289 — Separate access-grants from real employment (#2077 PR-8a).
--
-- @rollback: Fully additive.
--   ALTER TABLE employee_assignments DROP COLUMN IF EXISTS "isAccessGrant";
--
-- The operational incident: the test admin (owner@local.test) appears
-- SEVEN times in the employee list — once per Al-Diyaa branch — because
-- db/grant-admin-aldiyaa-access.sql created one owner employee_assignment
-- per branch so the branch picker would work. Those rows are ACCESS
-- grants masquerading as EMPLOYMENT records, and every operational
-- engine that iterates «active assignments» multiplies the person:
--
--   • GET /employees           → admin listed 7×.
--   • Payroll run generation   → 7 salary lines for one person.
--   • Daily absent-marking cron→ 7 absence rows/day.
--   • Scoring cron             → 8 composite scores for one person.
--
-- The conceptual fix the product owner mandated: separate
--   الانتساب الوظيفي  (real employment — ONE row)
--   نطاق الصلاحية      (access scope — rbac + authMiddleware expansion)
--   السياق النشط       (selected company/branch/role)
--
-- authMiddleware ALREADY expands allowedBranches to every active branch
-- of every company where the user holds an owner/GM assignment (see
-- authMiddleware.ts lines ~187-193) — so the per-branch rows were never
-- needed for access. This migration marks them as access grants and the
-- operational engines exclude them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_assignments' AND column_name = 'isAccessGrant'
  ) THEN
    ALTER TABLE employee_assignments ADD COLUMN "isAccessGrant" BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Backfill: for every (employeeId, companyId) pair holding MORE THAN ONE
-- active owner/general_manager assignment, keep the LOWEST id as the real
-- employment anchor and mark the rest as access grants. This exactly
-- reverses the grant-script pattern without touching genuinely
-- multi-assigned staff (non-owner roles are never marked).
UPDATE employee_assignments ea
   SET "isAccessGrant" = TRUE
 WHERE ea.role IN ('owner', 'general_manager')
   AND ea.status = 'active'
   AND ea.id <> (
     SELECT MIN(ea2.id) FROM employee_assignments ea2
      WHERE ea2."employeeId" = ea."employeeId"
        AND ea2."companyId" = ea."companyId"
        AND ea2.role IN ('owner', 'general_manager')
        AND ea2.status = 'active'
   )
   AND EXISTS (
     SELECT 1 FROM employee_assignments ea3
      WHERE ea3."employeeId" = ea."employeeId"
        AND ea3."companyId" = ea."companyId"
        AND ea3.role IN ('owner', 'general_manager')
        AND ea3.status = 'active'
        AND ea3.id <> ea.id
   );

CREATE INDEX IF NOT EXISTS idx_employee_assignments_access_grant
  ON employee_assignments ("isAccessGrant") WHERE "isAccessGrant" = TRUE;

-- Clean up operational residue the duplicates already produced:
-- absent-attendance rows landed on access-grant assignments (the daily
-- cron marked the admin absent on every branch). Remove ONLY the
-- auto-generated absent rows (no check-in/out — purely synthetic).
DELETE FROM attendance a
 USING employee_assignments ea
 WHERE a."assignmentId" = ea.id
   AND ea."isAccessGrant" = TRUE
   AND a.status = 'absent'
   AND a."checkIn" IS NULL
   AND a."checkOut" IS NULL;

-- Same for composite scores computed on access-grant assignments.
DELETE FROM employee_scores s
 USING employee_assignments ea
 WHERE s."assignmentId" = ea.id
   AND ea."isAccessGrant" = TRUE;
