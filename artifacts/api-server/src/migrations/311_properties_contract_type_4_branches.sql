-- ===========================================================================
-- 311_properties_contract_type_4_branches.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Normalises rental_contracts."contractType" to the four real-world
--        Properties branches — residential_rent, commercial_rent, sale,
--        management — and constrains the column with a CHECK that allows
--        the legacy labels transitionally so the old form keeps writing.
-- WHY:   The Properties path has FOUR distinct activities (residential rent,
--        commercial rent with VAT, sales of property assets — currently
--        entirely missing in code, third-party management with commission)
--        and a separate axis for the contract source (Ejar platform vs
--        manual). The previous column conflated activity with source via the
--        catch-all `ejar_unified` and offered no `sale` value at all. This
--        migration is the foundation every later branch-specific PR builds
--        on; without it the form can't even pick the right activity.
-- SAFETY: Additive backfill plus an enum-style CHECK. Legacy labels
--         (`residential`, `commercial`, `ejar_unified`) are kept inside
--         the CHECK so any in-flight write from the un-migrated form
--         still succeeds — a follow-up cleanup PR drops them after every
--         emitter has been moved. No data loss.
-- @rollback:
--   ALTER TABLE rental_contracts DROP CONSTRAINT IF EXISTS rental_contracts_contract_type_check;
--   UPDATE rental_contracts SET "contractType" = 'residential' WHERE "contractType" = 'residential_rent';
--   UPDATE rental_contracts SET "contractType" = 'commercial'  WHERE "contractType" = 'commercial_rent';
--   ALTER TABLE rental_contracts ALTER COLUMN "contractType" SET DEFAULT 'residential';
-- ===========================================================================

-- 1. Backfill existing rows to the new canonical labels. Idempotent — rows
--    already on the new vocabulary are left untouched.
UPDATE rental_contracts
   SET "contractType" = 'residential_rent'
 WHERE "contractType" = 'residential';

UPDATE rental_contracts
   SET "contractType" = 'commercial_rent'
 WHERE "contractType" = 'commercial';

-- 2. New default for fresh inserts. Matches the form's new default.
ALTER TABLE rental_contracts
  ALTER COLUMN "contractType" SET DEFAULT 'residential_rent';

-- 3. Anchor the four-branch enum. Legacy labels stay accepted during the
--    rollout window so any writer that still emits `residential` /
--    `commercial` / `ejar_unified` doesn't 500 mid-deploy. A cleanup
--    migration drops them once every caller has moved.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.rental_contracts'::regclass
       AND conname  = 'rental_contracts_contract_type_check'
  ) THEN
    ALTER TABLE rental_contracts
      ADD CONSTRAINT rental_contracts_contract_type_check
      CHECK ("contractType" IN (
        -- New canonical four-branch vocabulary
        'residential_rent', 'commercial_rent', 'sale', 'management',
        -- Legacy labels (kept transitionally — see WHY above)
        'residential', 'commercial', 'ejar_unified'
      ));
  END IF;
END$$;
