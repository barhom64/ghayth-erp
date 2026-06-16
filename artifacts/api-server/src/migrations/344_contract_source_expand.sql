-- @rollback: -- no rollback needed; ALTER TYPE is additive
-- @policy:breaking DROP CONSTRAINT required to widen the CHECK set; old app version accepts all existing values so no rows will fail validation during rolling deploy.

-- Expand contractSource on rental_contracts to cover additional import origins.
-- Existing values 'ejar' and 'manual' are preserved; new values added:
--   file_import  — bulk imported from Excel/CSV
--   ejar_later   — contract exists locally, Ejar registration deferred
--   migrated     — imported from a prior system during onboarding

ALTER TABLE rental_contracts
  DROP CONSTRAINT IF EXISTS rental_contracts_contractsource_check;

ALTER TABLE rental_contracts
  ADD CONSTRAINT rental_contracts_contractsource_check
  CHECK ("contractSource" IN ('ejar', 'manual', 'file_import', 'ejar_later', 'migrated'));
