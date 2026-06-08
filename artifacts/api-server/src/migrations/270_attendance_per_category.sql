-- Migration 270 — Per-category attendance policies (#1799 priority #6)
--
-- @rollback: This migration is additive — every CREATE TABLE uses
-- "IF NOT EXISTS", the ADD COLUMN on employee_assignments is wrapped
-- in a DO $$ ... IF NOT EXISTS guard, and the seed uses
-- ON CONFLICT DO NOTHING. To roll back, run in order:
--   ALTER TABLE employee_assignments DROP COLUMN IF EXISTS "categoryKey";
--   DROP INDEX IF EXISTS idx_attendance_policies_per_category_company;
--   DROP TABLE IF EXISTS attendance_policies_per_category;
--   DROP INDEX IF EXISTS idx_employee_categories_company;
--   DROP TABLE IF EXISTS employee_categories;
-- The legacy `attendance_policies` row remains untouched and continues
-- to be the system-of-record so the legacy check-in path still works
-- with no per-category resolution.
--
-- The existing `attendance_policies` table is UNIQUE per (companyId).
-- That means a single late-threshold + penalty matrix applies to every
-- employee — the warehouse worker, the field driver, the office clerk,
-- the department manager, AND the CEO. The HR Operating Foundation task
-- (#1799 §C, see docs/HR_OPERATING_FOUNDATION_TASK.md §A.3) requires
-- the policy to differ by employee category:
--
--   worker          → hard attendance + automatic deductions
--   driver          → hard attendance + GPS tracking 10-30s
--   field_employee  → location-aware attendance + GPS tracking 1-5min
--   office_employee → hard attendance with its own grace period
--   manager         → flexible attendance, NO auto-deductions
--   executive       → activity tracking only, NO auto-deductions
--
-- This migration adds the catalog table (`employee_categories`) and the
-- per-category override table (`attendance_policies_per_category`) so
-- the `attendancePolicyEngine` can resolve the correct policy per
-- (employee category × company) without changing the legacy
-- `attendance_policies` row (which keeps acting as the company default
-- and the fallback when no per-category override exists).

-- 1) Catalog of employee categories (system + per-company customs).
--
-- The 6 system categories are seeded below (companyId IS NULL marks
-- them as templates). Companies can add their own categories with a
-- companyId — `attendancePolicyEngine` will resolve from the most
-- specific match (company-specific row wins over system row).
CREATE TABLE IF NOT EXISTS employee_categories (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- NULL = system template
  "categoryKey" VARCHAR(40) NOT NULL,                              -- e.g. 'worker', 'driver', 'manager'
  "labelAr" VARCHAR(120) NOT NULL,
  "labelEn" VARCHAR(120),
  description TEXT,
  -- Visual + ordering for UI.
  color VARCHAR(20),
  "displayOrder" INTEGER DEFAULT 100,
  -- Categories that opt OUT of automatic late/absence deductions.
  -- The flag is denormalized here so the auto-violation cron can skip
  -- entire categories without joining attendance_policies_per_category.
  "exemptFromAutoDeduction" BOOLEAN NOT NULL DEFAULT FALSE,
  -- GPS tracking frequency in seconds. 0 = no live tracking.
  -- 30  → drivers (10-30s windowed, this is the floor)
  -- 300 → field employees (1-5min windowed)
  -- 0   → office employees, managers, executives
  "trackingFrequencySeconds" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP DEFAULT now(),
  UNIQUE ("companyId", "categoryKey")
);

CREATE INDEX IF NOT EXISTS idx_employee_categories_company
  ON employee_categories("companyId") WHERE "isActive" = TRUE;

-- Seed the 6 system categories. ON CONFLICT DO NOTHING makes this safe
-- to run on existing databases (idempotent — re-run won't dupe).
-- The system row (companyId IS NULL) is the fallback; companies can
-- INSERT their own row with the same categoryKey to override.
INSERT INTO employee_categories ("companyId", "categoryKey", "labelAr", "labelEn", description, color, "displayOrder", "exemptFromAutoDeduction", "trackingFrequencySeconds")
VALUES
  (NULL, 'worker',          'عامل',           'Worker',          'عامل ميداني/إنتاجي بسياسة حضور صارمة وخصومات تلقائية.', '#dc2626', 10, FALSE, 0),
  (NULL, 'driver',          'سائق',           'Driver',          'سائق مع تتبع GPS لحظي وربط بالرحلات والمهمات.',         '#f59e0b', 20, FALSE, 30),
  (NULL, 'field_employee',  'موظف ميداني',    'Field Employee',  'موظف ميداني (مندوب، فني، إلخ) مع تتبع موقع دوري.',     '#fb923c', 30, FALSE, 300),
  (NULL, 'office_employee', 'موظف إداري',     'Office Employee', 'موظف مكتبي بسياسة سماح مستقلة.',                       '#3b82f6', 40, FALSE, 0),
  (NULL, 'manager',         'مدير قسم/فرع',   'Manager',         'مدير بحضور مرن وبدون خصم تلقائي.',                     '#8b5cf6', 50, TRUE,  0),
  (NULL, 'executive',       'تنفيذي / GM',    'Executive',       'متابعة نشاط فقط — لا حضور إلزامي ولا خصم تلقائي.',     '#0ea5e9', 60, TRUE,  0)
ON CONFLICT ("companyId", "categoryKey") DO NOTHING;

-- 2) Per-category attendance policy overrides.
--
-- Stored at (company × category) granularity. When a row is absent,
-- the engine falls back to the company-wide `attendance_policies`
-- row (which keeps being the system-of-record for late thresholds,
-- GPS radius, and penalty matrix). When a row exists, its non-null
-- columns override the company default.
--
-- All numeric/duration columns are nullable on purpose: a row that
-- only sets `autoDeductionEnabled = FALSE` is a valid policy (e.g. the
-- manager category override that toggles off deductions without
-- redefining the late threshold).
CREATE TABLE IF NOT EXISTS attendance_policies_per_category (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "categoryKey" VARCHAR(40) NOT NULL,
  -- Overrides over the company-default attendance_policies row.
  -- NULL = inherit from company default.
  "lateThresholdMinutes" INTEGER,
  "gracePeriodMinutes" INTEGER,
  "gpsRadiusMeters" INTEGER,
  -- Per-category penalty override. Same shape as attendance_policies.
  "penaltyLevel1" NUMERIC,
  "penaltyLevel2" NUMERIC,
  "penaltyLevel3" NUMERIC,
  "penaltyLevel4" NUMERIC,
  "penaltyLevel5" NUMERIC,
  -- The two critical category-level switches:
  -- 1) Categories with `autoDeductionEnabled = FALSE` will NOT trigger
  --    `attendance_deductions` rows from check-in/check-out routes,
  --    and the daily `autoViolationEngine` skips them.
  -- 2) `requireGps` lets office staff check in without lat/lng while
  --    drivers/field employees stay forced. NULL = inherit.
  "autoDeductionEnabled" BOOLEAN,
  "requireGps" BOOLEAN,
  -- Allowed sources for check-in. NULL = inherit (any). Array values:
  -- 'qr', 'gps', 'manual', 'selfie', 'device'. Once #1799 priority #7
  -- (field tracking) lands, this will enforce mobile-only check-in
  -- for drivers/field employees.
  "allowedSources" TEXT[],
  -- Per-category tracking frequency override (in seconds). NULL means
  -- inherit from employee_categories.trackingFrequencySeconds.
  "trackingFrequencySeconds" INTEGER,
  -- Audit columns.
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  "createdBy" INTEGER,
  UNIQUE ("companyId", "categoryKey")
);

CREATE INDEX IF NOT EXISTS idx_attendance_policies_per_category_company
  ON attendance_policies_per_category("companyId");

-- 3) Add a foreign-key-friendly column on employee_assignments so the
-- engine can resolve category in one join. Nullable on purpose — the
-- backfill below sets a sensible default based on job_titles but the
-- column remains nullable so legacy rows that the migration can't
-- categorize don't block the migration.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_assignments' AND column_name = 'categoryKey'
  ) THEN
    ALTER TABLE employee_assignments
      ADD COLUMN "categoryKey" VARCHAR(40);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_assignments_categoryKey
  ON employee_assignments("categoryKey") WHERE "categoryKey" IS NOT NULL;

-- 4) Best-effort backfill of `categoryKey` for existing assignments.
-- Heuristic uses job_titles category + role string. This is not a
-- statement of policy; HR operators are expected to refine the mapping
-- post-migration. The conservative default for unmatched rows is NULL
-- so the engine falls back to the company-wide policy unchanged.
UPDATE employee_assignments ea
   SET "categoryKey" = CASE
     -- Drivers — identified by role string or job_title category.
     WHEN LOWER(COALESCE(ea.role, '')) LIKE '%driver%'
       OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%سائق%'
       OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%driver%' THEN 'driver'
     -- GM / executive roles.
     WHEN LOWER(COALESCE(ea.role, '')) IN ('general_manager', 'ceo', 'cfo', 'coo', 'cto', 'owner') THEN 'executive'
     -- Department / branch managers.
     WHEN LOWER(COALESCE(ea.role, '')) LIKE '%manager%'
       OR LOWER(COALESCE(ea.role, '')) LIKE '%director%'
       OR LOWER(COALESCE(ea."jobTitle", '')) LIKE '%مدير%' THEN 'manager'
     -- Default: office employee. Workers, field-employees, and
     -- specialists keep NULL until HR explicitly assigns a category.
     ELSE NULL
   END
 WHERE "categoryKey" IS NULL;
