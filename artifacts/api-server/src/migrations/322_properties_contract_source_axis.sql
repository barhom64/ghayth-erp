-- ===========================================================================
-- 322_properties_contract_source_axis.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Adds rental_contracts."contractSource" (ejar | manual) so the
--        contract's *origin* is a first-class axis instead of being
--        decoded from `ejarNumber` / `ejarStatus` heuristics.
-- WHY:   The Properties path doctrine treats contract source as a
--        foundational axis orthogonal to the four activity branches
--        (residential_rent / commercial_rent / sale / management). A
--        contract registered on the Ejar platform is **read-only** on
--        every reference field (parties, unit, amounts) — the operator
--        must not edit them locally — while a manual contract is
--        fully editable. Hardcoding that distinction off `ejarNumber`
--        IS NOT NULL works for trivial cases but breaks the moment an
--        operator drafts an Ejar-bound contract before the number is
--        issued, or pastes an Ejar number into a manually-entered row
--        for reporting. Source is the wrong thing to infer.
-- SAFETY: Additive, NOT NULL with a DEFAULT — safe under the strict
--         policy guard (§4: NOT NULL with DEFAULT does not require
--         the @policy:breaking acknowledgement). Backfill key: any
--         row that already has a non-empty ejarNumber is recorded as
--         `ejar`; everything else is `manual`. The CHECK constraint
--         is added via a DO block so re-runs are idempotent.
-- @rollback:
--   ALTER TABLE rental_contracts DROP CONSTRAINT IF EXISTS rental_contracts_contract_source_check;
--   ALTER TABLE rental_contracts DROP COLUMN IF EXISTS "contractSource";
-- ===========================================================================

-- 1. Add the column with a safe default so existing inserts (and the
--    rolling-deploy window) don't break. NOT NULL is fine here because
--    the DEFAULT covers every existing row at ALTER time.
ALTER TABLE rental_contracts
  ADD COLUMN IF NOT EXISTS "contractSource" VARCHAR(20) NOT NULL DEFAULT 'manual';

-- 2. Backfill from existing Ejar markers. A non-empty ejarNumber is
--    the historical proxy for "this contract came from Ejar"; flip
--    the column to match so downstream readers see the right axis
--    on day one. Idempotent — rows already set to 'ejar' are skipped.
UPDATE rental_contracts
   SET "contractSource" = 'ejar'
 WHERE "contractSource" = 'manual'
   AND "ejarNumber" IS NOT NULL
   AND "ejarNumber" <> '';

-- 3. Anchor the two-value vocabulary in the schema. Wrapped in a DO
--    block so a re-run on a DB that already has the constraint is a
--    no-op rather than an error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.rental_contracts'::regclass
       AND conname  = 'rental_contracts_contract_source_check'
  ) THEN
    ALTER TABLE rental_contracts
      ADD CONSTRAINT rental_contracts_contract_source_check
      CHECK ("contractSource" IN ('ejar', 'manual'));
  END IF;
END$$;
