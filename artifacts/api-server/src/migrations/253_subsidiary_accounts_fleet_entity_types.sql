-- 253_subsidiary_accounts_fleet_entity_types.sql
--
-- #1594 — "نظام قوي قابل للتحكم": per-entity subsidiary GL accounts for fleet.
--
-- PROBLEM
-- routes/accounting-engine.ts:createSubsidiaryAccountsForEntity already inserts
-- subsidiary_accounts rows with entityType 'vehicle' / 'driver' (on vehicle &
-- driver creation), but the entityType CHECK constraint only allowed
-- employee/client/vendor/project/property + the umrah/property_unit types added
-- in migration 250. So every vehicle/driver subsidiary INSERT silently violated
-- the constraint and the whole auto-create transaction was rolled back (caught &
-- logged) — no per-vehicle accounts were ever created.
--
-- FIX
-- Widen the constraint to also accept 'vehicle' and 'driver'. Strictly additive
-- (superset of the old list), same idempotent drop+recreate pattern as 250.
--
-- @policy:breaking
--   Drop+recreate of a CHECK; the new list is a strict SUPERSET of the old, so
--   no existing row can fail and an older app version is unaffected. Acknowledged
--   per docs/MIGRATION_POLICY.md §4 for the brief constraint-absent window.
--
-- @rollback:
--   ALTER TABLE subsidiary_accounts DROP CONSTRAINT IF EXISTS "subsidiary_accounts_entityType_check";
--   ALTER TABLE subsidiary_accounts ADD CONSTRAINT "subsidiary_accounts_entityType_check"
--     CHECK ("entityType" IN ('employee','client','vendor','project','property',
--       'umrah_agent','umrah_sub_agent','umrah_season','property_unit'));
--   (safe only once no row carries entityType 'vehicle' or 'driver').

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subsidiary_accounts_entityType_check'
      AND conrelid = 'public.subsidiary_accounts'::regclass
  ) THEN
    ALTER TABLE public.subsidiary_accounts
      DROP CONSTRAINT "subsidiary_accounts_entityType_check";
  END IF;

  ALTER TABLE public.subsidiary_accounts
    ADD CONSTRAINT "subsidiary_accounts_entityType_check"
    CHECK ("entityType" IN (
      'employee','client','vendor','project','property',
      'umrah_agent','umrah_sub_agent','umrah_season','property_unit',
      'vehicle','driver'
    ));
END $$;
