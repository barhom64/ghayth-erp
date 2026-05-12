-- Migration 153: commission plan versioning + per-calculation snapshot
--
-- Today the commission engine reads tier rows live every time
-- calculateCommissionForPlan runs. If a manager edits a tier after
-- February has been calculated, re-running February gives a different
-- number with no audit trail of which tier ladder produced the prior
-- result. This migration plants:
--
--   1. `version` on employee_commission_plans (default 1).
--   2. `planVersion` + `planSnapshot` + `tiersSnapshot` on
--      employee_commission_calculations — the engine writes these on
--      every calc so the historical numbers are reproducible.
--   3. A trigger that auto-bumps version on:
--        * plan UPDATE of commission-shaping columns
--        * tier INSERT / UPDATE / DELETE
--      Routes don't need to remember to call it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE TRIGGER.

ALTER TABLE employee_commission_plans
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE employee_commission_calculations
  ADD COLUMN IF NOT EXISTS "planVersion"   INTEGER,
  ADD COLUMN IF NOT EXISTS "planSnapshot"  JSONB,
  ADD COLUMN IF NOT EXISTS "tiersSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS idx_commission_calc_plan_version
  ON employee_commission_calculations ("planId", "planVersion")
  WHERE "deletedAt" IS NULL;

-- Bump plan version when shaping columns change. Avoids bumping on
-- cosmetic edits (planName, notes, status, approvedBy, approvedAt).
CREATE OR REPLACE FUNCTION bump_commission_plan_version_on_plan_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."commissionType"           IS DISTINCT FROM OLD."commissionType"
  OR NEW."percentageRate"           IS DISTINCT FROM OLD."percentageRate"
  OR NEW."fixedAmount"              IS DISTINCT FROM OLD."fixedAmount"
  OR NEW."conditionType"            IS DISTINCT FROM OLD."conditionType"
  OR NEW."minProfitPerVisa"         IS DISTINCT FROM OLD."minProfitPerVisa"
  OR NEW."minSalesPercent"          IS DISTINCT FROM OLD."minSalesPercent"
  OR NEW."minAvgPrice"              IS DISTINCT FROM OLD."minAvgPrice"
  OR NEW."excludedMonths"           IS DISTINCT FROM OLD."excludedMonths"
  OR NEW."tierUnit"                 IS DISTINCT FROM OLD."tierUnit"
  OR NEW."partialTiersAllowed"      IS DISTINCT FROM OLD."partialTiersAllowed"
  OR NEW."violationBlocksCommission" IS DISTINCT FROM OLD."violationBlocksCommission"
  OR NEW."baseSalary"               IS DISTINCT FROM OLD."baseSalary"
  THEN
    NEW.version = COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_commission_plan_version_on_plan_update
  ON employee_commission_plans;
CREATE TRIGGER trg_bump_commission_plan_version_on_plan_update
  BEFORE UPDATE ON employee_commission_plans
  FOR EACH ROW
  EXECUTE FUNCTION bump_commission_plan_version_on_plan_update();

-- Tier changes bump the parent plan's version (any INSERT/UPDATE/DELETE).
CREATE OR REPLACE FUNCTION bump_commission_plan_version_on_tier_change()
RETURNS TRIGGER AS $$
DECLARE
  v_plan_id INTEGER;
BEGIN
  v_plan_id := COALESCE(NEW."planId", OLD."planId");
  IF v_plan_id IS NOT NULL THEN
    UPDATE employee_commission_plans
       SET version = version + 1,
           "updatedAt" = NOW()
     WHERE id = v_plan_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_commission_plan_version_on_tier_change
  ON employee_commission_tiers;
CREATE TRIGGER trg_bump_commission_plan_version_on_tier_change
  AFTER INSERT OR UPDATE OR DELETE ON employee_commission_tiers
  FOR EACH ROW
  EXECUTE FUNCTION bump_commission_plan_version_on_tier_change();
