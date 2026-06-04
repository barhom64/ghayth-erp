-- 248_integrated_hr_employee_flow.sql
--
-- WHAT:    extend job_titles + employees with the fields the integrated
--          HR onboarding flow needs:
--            - job_titles.defaultRoleKey  → when an HR user picks a job
--              title in the employee-create form, the RBAC role is
--              auto-suggested (driver → "driver", accountant →
--              "accountant"). One source of truth for the
--              jobTitle↔role link.
--            - job_titles.opensCustody    → flag that says "when an
--              employee is hired into this job, open a custody account
--              automatically". Operators set true for sales reps,
--              drivers, field engineers, etc.
--            - employees.personalEmail    → personal contact email,
--              kept separate from `email` (which doubles as the user-
--              account login). Lets HR record both without one
--              clobbering the other.
--            - employees.internalEmail    → optional internal-domain
--              email (e.g. ahmed@company.sa). When set, the system
--              uses it as the user-account login instead of the
--              personal email.
--
-- WHY:     the original employee-create form conflated three things:
--          (1) user-account login, (2) personal contact, (3) job role.
--          Operators were forced to pick one. The integrated flow needs
--          to capture all three independently and link them to the
--          right systems (auth, custody, RBAC).
--
-- SAFETY:  pure additive. Existing rows keep `email` as both login +
--          contact. Backfill not needed.
--
-- @rollback: ALTER TABLE job_titles
--              DROP COLUMN IF EXISTS "defaultRoleKey",
--              DROP COLUMN IF EXISTS "opensCustody";
--            ALTER TABLE employees
--              DROP COLUMN IF EXISTS "personalEmail",
--              DROP COLUMN IF EXISTS "internalEmail";

BEGIN;

ALTER TABLE public.job_titles
  ADD COLUMN IF NOT EXISTS "defaultRoleKey" varchar(60),
  ADD COLUMN IF NOT EXISTS "opensCustody" boolean DEFAULT false NOT NULL;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "personalEmail" varchar(200),
  ADD COLUMN IF NOT EXISTS "internalEmail" varchar(200);

COMMIT;
