-- Migration 277 — link property maintenance requests to their finance expense
--
-- @rollback: Fully additive. To undo:
--   DROP INDEX IF EXISTS idx_maintenance_requests_linked_expense;
--   ALTER TABLE maintenance_requests DROP COLUMN IF EXISTS "linkedExpenseId";
--
-- #1715 §5 — "كل ربط له أثر". fleet_maintenance already carries
-- linkedExpenseId so a vehicle-maintenance expense can create + link a
-- ticket. maintenance_requests (property maintenance) had no equivalent,
-- so the property side could not be linked symmetrically. Add the column
-- (+ a partial index for reverse lookups). The predicate is IS NULL only —
-- IMMUTABLE-safe (cf. the migration 275 fix).

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS "linkedExpenseId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_linked_expense
  ON maintenance_requests("linkedExpenseId")
  WHERE "linkedExpenseId" IS NOT NULL;
