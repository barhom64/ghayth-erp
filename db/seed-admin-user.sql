-- db/seed-admin-user.sql
--
-- Creates a deterministic test admin so verification packs can log in
-- against a fresh local DB without touching the production seed script.
--
-- Credentials:
--   email:    owner@local.test
--   password: Test1234!
--
-- The bcrypt hash below is for "Test1234!" with cost factor 10. Generated
-- with bcryptjs v3.0.3. Regenerate via:
--   node -e "console.log(require('bcryptjs').hashSync('Test1234!', 10))"
--
-- This file is idempotent: re-running it on a populated DB updates the
-- existing admin user instead of creating a duplicate. It depends on the
-- reference rows in db/seed.sql being loaded first (companies + branches).
--
-- Apply via:
--   psql "$DATABASE_URL" -f db/seed-admin-user.sql
-- Or via:
--   bash db/bootstrap.sh

BEGIN;

-- 1. Pick the first company + branch from the reference seed. If the seed
--    didn't include any, create a minimal one.
DO $$
DECLARE
  v_company_id integer;
  v_branch_id integer;
  v_employee_id integer;
  v_user_id integer;
BEGIN
  SELECT id INTO v_company_id FROM companies ORDER BY id LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO companies (name, "nameEn", currency, timezone, status)
    VALUES ('شركة الاختبار', 'Test Company', 'SAR', 'Asia/Riyadh', 'active')
    RETURNING id INTO v_company_id;
  END IF;

  SELECT id INTO v_branch_id FROM branches WHERE "companyId" = v_company_id ORDER BY id LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO branches ("companyId", name, "nameEn", "isActive")
    VALUES (v_company_id, 'الفرع الرئيسي', 'Head Office', true)
    RETURNING id INTO v_branch_id;
  END IF;

  -- 2. Create or update the employee row.
  SELECT id INTO v_employee_id
    FROM employees
   WHERE email = 'owner@local.test'
   LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO employees (name, email, status)
    VALUES ('Local Test Owner', 'owner@local.test', 'active')
    RETURNING id INTO v_employee_id;
  END IF;

  -- 3. Create or update the user row with the deterministic bcrypt hash.
  SELECT id INTO v_user_id
    FROM users
   WHERE email = 'owner@local.test'
   LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO users (email, "passwordHash", "isActive", "employeeId")
    VALUES (
      'owner@local.test',
      '$2b$10$v6KtegUqgRLrlsDRWu2l4uUAnOeNREpHB1LQ/ZgvBxiwnMQtMVTVu',
      true,
      v_employee_id
    )
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE users
       SET "passwordHash" = '$2b$10$v6KtegUqgRLrlsDRWu2l4uUAnOeNREpHB1LQ/ZgvBxiwnMQtMVTVu',
           "isActive" = true,
           "employeeId" = v_employee_id,
           "failedLoginAttempts" = 0,
           "lockedUntil" = NULL
     WHERE id = v_user_id;
  END IF;

  -- 4. Create or update the active employee_assignment with role=owner so
  --    the user has full access to every module.
  IF NOT EXISTS (
    SELECT 1 FROM employee_assignments
     WHERE "employeeId" = v_employee_id AND status = 'active'
  ) THEN
    INSERT INTO employee_assignments (
      "employeeId", "companyId", "branchId", role, status, "jobTitle"
    )
    VALUES (v_employee_id, v_company_id, v_branch_id, 'owner', 'active', 'Local Test Owner');
  ELSE
    UPDATE employee_assignments
       SET role = 'owner', status = 'active'
     WHERE "employeeId" = v_employee_id AND status = 'active';
  END IF;

  RAISE NOTICE 'Test admin ready: companyId=%, branchId=%, employeeId=%, userId=%',
               v_company_id, v_branch_id, v_employee_id, v_user_id;
END $$;

COMMIT;

-- Sanity check
SELECT u.id, u.email, u."isActive", e.name, ea.role, ea."companyId", ea."branchId"
  FROM users u
  LEFT JOIN employees e ON e.id = u."employeeId"
  LEFT JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" AND ea.status = 'active'
 WHERE u.email = 'owner@local.test';
