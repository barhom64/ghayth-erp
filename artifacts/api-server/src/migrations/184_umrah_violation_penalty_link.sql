-- Migration 184: link umrah_violations to its financial penalty + constrain status.
--
-- DT-2 (C3): the Umrah path ran two parallel, disjoint systems for the
-- same overstay event — umrah_violations (the operational event, written
-- by the daily detection cron) and umrah_penalties (the financial effect,
-- with its own lifecycle + GL posting). They carried no link.
--
-- Adopted model: violation = the operational event, penalty = the
-- financial effect. This migration adds umrah_violations."linkedPenaltyId"
-- so run-penalty-engine can attach the penalty it creates to the source
-- violation, and constrains the previously free-text status column to its
-- known vocabulary (detected/open/invoiced/paid/disputed/closed — the set
-- already used by the cron, the create route default, and the UI).
--
-- The CHECK is added NOT VALID: it enforces every new/updated row but does
-- not retroactively reject pre-existing free-text rows. No GL change, no
-- lifecycle/state-machine change.
--
-- @rollback:
--   ALTER TABLE umrah_violations DROP CONSTRAINT IF EXISTS umrah_violations_status_check;
--   ALTER TABLE umrah_violations DROP COLUMN IF EXISTS "linkedPenaltyId";

ALTER TABLE umrah_violations ADD COLUMN IF NOT EXISTS "linkedPenaltyId" integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'umrah_violations_status_check'
  ) THEN
    ALTER TABLE umrah_violations
      ADD CONSTRAINT umrah_violations_status_check
      CHECK (status IN ('detected','open','invoiced','paid','disputed','closed')) NOT VALID;
  END IF;
END $$;
