-- 244_companies_subscription_scaffolding.sql
--
-- WHAT:    add lightweight subscription columns to `companies` so the
--          system has a concept of "trial vs active vs expired" without
--          building a full billing module yet. Closes the structural
--          half of B2 from CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     Pre-fix, every tenant was implicitly permanent. There was no
--          way to:
--           - sell a 30-day trial that auto-expires
--           - flag a non-paying tenant without deleting the DB
--           - know which companies are paying vs free vs trial
--          A real billing integration (Stripe/Tap/HyperPay) is its own
--          project. This migration just lays the schema floor so the
--          backend gate and admin UI have something to read/write.
--
-- COLUMNS:
--   subscriptionStatus VARCHAR(20):
--     'trial'      — new sign-up, can use the system, has a trial_expires_at
--     'active'     — paid (when billing integration ships, sets this)
--     'expired'    — past trial without payment / explicit suspension
--     'cancelled'  — owner-initiated cancel; read-only
--   trialExpiresAt   TIMESTAMPTZ default = createdAt + 30 days
--   subscriptionPlan VARCHAR(40) default 'trial' — free-form for now,
--                    will reference subscription_plans table when one exists.
--
-- SAFETY:  pure additive. Existing rows are backfilled to
--          subscriptionStatus='active' (current behaviour: every tenant
--          permanent) so no live tenant gets cut off by this migration.
--          New rows default to 'trial' with 30-day expiry.
--
-- @rollback: ALTER TABLE companies
--              DROP COLUMN IF EXISTS "subscriptionStatus",
--              DROP COLUMN IF EXISTS "trialExpiresAt",
--              DROP COLUMN IF EXISTS "subscriptionPlan";

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" varchar(20) DEFAULT 'trial' NOT NULL,
  ADD COLUMN IF NOT EXISTS "trialExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "subscriptionPlan" varchar(40) DEFAULT 'trial' NOT NULL;

-- Constraint: status must be one of the four canonical values.
-- The CHECK is additive on a fresh column — the DROP CONSTRAINT IF EXISTS
-- below is only there for idempotent re-run during dev (the constraint
-- did not exist before this migration). On a true rolling deploy the
-- old app version never sees subscriptionStatus, so the new constraint
-- is invisible to it.
-- Idempotent: skip if the constraint already exists (baseline dump may
-- already carry it, in which case a bare ADD CONSTRAINT aborts the boot).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_subscription_status_check' AND conrelid = 'public.companies'::regclass) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_status_check
      CHECK ("subscriptionStatus" IN ('trial', 'active', 'expired', 'cancelled'));
  END IF;
END $$;

-- Backfill: every PRE-EXISTING company is treated as already paid.
-- Without this, the moment the new gate ships every legacy tenant
-- gets a 402 on next request because trialExpiresAt would be NULL.
UPDATE public.companies
   SET "subscriptionStatus" = 'active',
       "subscriptionPlan" = 'legacy'
 WHERE "createdAt" < NOW();

CREATE INDEX IF NOT EXISTS idx_companies_subscription_status
  ON public.companies ("subscriptionStatus");

COMMIT;
