-- db/grant-admin-aldiyaa-access.sql
--
-- Adds an `owner` employee_assignment for the test admin user
-- (owner@local.test) on every Al-Diyaa wal-Bayan branch, so an
-- already-logged-in System Owner can see and operate on Al-Diyaa's
-- branches via the multi-branch picker without re-logging-in as
-- door@door.sa.
--
-- Idempotent: every INSERT is gated by NOT EXISTS, so re-running is
-- a no-op.
--
-- Apply via:
--   psql "$DATABASE_URL" -f db/grant-admin-aldiyaa-access.sql

BEGIN;

DO $$
DECLARE
  v_admin_emp_id integer;
  v_aldiyaa_id   integer;
  rec record;
BEGIN
  ------------------------------------------------------------------
  -- 1. Resolve the admin's employee row (created by seed-admin-user.sql)
  ------------------------------------------------------------------
  SELECT e.id
    INTO v_admin_emp_id
    FROM users u
    JOIN employees e ON e.id = u."employeeId"
   WHERE u.email = 'owner@local.test'
   LIMIT 1;

  IF v_admin_emp_id IS NULL THEN
    RAISE EXCEPTION 'admin user owner@local.test not found — run seed-admin-user.sql first';
  END IF;

  ------------------------------------------------------------------
  -- 2. Resolve Al-Diyaa wal-Bayan companyId
  ------------------------------------------------------------------
  SELECT id
    INTO v_aldiyaa_id
    FROM companies
   WHERE name = 'مؤسسة الضياء والبيان للمقاولات'
   LIMIT 1;

  IF v_aldiyaa_id IS NULL THEN
    RAISE EXCEPTION 'Al-Diyaa company missing — run seed-aldiyaa-albayan.sql first';
  END IF;

  ------------------------------------------------------------------
  -- 3. For every Al-Diyaa branch, create an `owner` assignment for
  --    the admin if one doesn't already exist.
  ------------------------------------------------------------------
  FOR rec IN
    SELECT id, name FROM branches WHERE "companyId" = v_aldiyaa_id ORDER BY id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM employee_assignments
       WHERE "employeeId" = v_admin_emp_id
         AND "companyId"  = v_aldiyaa_id
         AND "branchId"   = rec.id
         AND status = 'active'
    ) THEN
      INSERT INTO employee_assignments (
        "employeeId", "companyId", "branchId",
        "jobTitle", role, "isPrimary", status
      ) VALUES (
        v_admin_emp_id, v_aldiyaa_id, rec.id,
        'مدير النظام', 'owner', false, 'active'
      );
      RAISE NOTICE 'granted admin owner on branch: %', rec.name;
    END IF;
  END LOOP;

  RAISE NOTICE 'admin owner@local.test now has owner access to Al-Diyaa (companyId=%)', v_aldiyaa_id;
END $$;

COMMIT;

-- Sanity check
SELECT
  u.email,
  e.name AS employee,
  ea."companyId",
  c.name AS company,
  ea."branchId",
  b.name AS branch,
  ea.role,
  ea.status
FROM users u
JOIN employees e ON e.id = u."employeeId"
JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
JOIN companies c ON c.id = ea."companyId"
LEFT JOIN branches b ON b.id = ea."branchId"
WHERE u.email = 'owner@local.test'
ORDER BY ea."companyId", ea."branchId";
