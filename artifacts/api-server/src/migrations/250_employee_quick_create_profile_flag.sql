-- 250_employee_quick_create_profile_flag.sql
--
-- WHAT:    add `profileCompleted` boolean to employees + `invitedAt`
--          timestamp + `profileCompletedAt` timestamp so HR can do
--          "quick add" — admin enters only the essentials (name,
--          internal email, job title, branch) and the employee
--          completes their personal data (national ID, phone, DOB,
--          address, bank, emergency contact, photo) from their portal.
--
-- WHY:     the current /employees POST has ~30 required + optional
--          fields. HR doesn't always have all of them at the moment
--          of hire — passport scan and IBAN often come days later.
--          A two-step flow (quick-add → employee self-completes)
--          matches how onboarding actually happens, and the new
--          column lets the UI surface a "complete your profile"
--          banner until the employee fills the rest.
--
-- SAFETY:  pure additive ADD COLUMN with safe defaults.
--          - profileCompleted defaults TRUE so every pre-existing
--            employee is grandfathered in (we don't want to nag
--            5 years of staff to re-complete profiles they already
--            filled).
--          - The two timestamps default NULL — quick-add will
--            populate invitedAt, the self-service completion endpoint
--            will populate profileCompletedAt.
--
-- @rollback: ALTER TABLE employees DROP COLUMN "profileCompleted",
--                                   DROP COLUMN "invitedAt",
--                                   DROP COLUMN "profileCompletedAt";

BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "profileCompleted" boolean NOT NULL DEFAULT true;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "invitedAt" timestamp with time zone;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "profileCompletedAt" timestamp with time zone;

-- Index supports the "show me employees who haven't completed their
-- profile" filter on the HR dashboard. Predicated index keeps it small
-- — once an employee completes their profile they fall out of the
-- index and the lookup stays fast even at 10k+ employees.
CREATE INDEX IF NOT EXISTS idx_employees_pending_profile
  ON public.employees ("companyId")
  WHERE "profileCompleted" = false AND "deletedAt" IS NULL;

COMMIT;
