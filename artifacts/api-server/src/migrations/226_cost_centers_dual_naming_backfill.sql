-- 226_cost_centers_dual_naming_backfill.sql
--
-- @rollback:
--   -- This migration backfills data; rollback would require knowing
--   -- the original NULL state of each column, which isn't tracked.
--   -- The migration is idempotent and safe to re-run, so the practical
--   -- rollback is "do nothing".
--
-- Finance audit gap #F1 — cost_centers naming drift.
--
-- The cost_centers table carries BOTH naming pairs:
--   Migration 091: relatedEntityType / relatedEntityId
--   Migration 203: linkedEntityType / linkedEntityId
--
-- Different code paths read from different pairs:
--   • routes/finance-cost-centers.ts → relatedEntity* (UI master data)
--   • routes/finance-reports.ts      → relatedEntity*
--   • lib/accountingAllocation.ts    → linkedEntity*  (resolver from_* strategies)
--
-- Until the UI route was patched to dual-write (commit alongside this
-- migration), every row created via the UI carried only the old pair.
-- The resolver's from_vehicle / from_property / from_unit / from_project
-- / from_contract / from_umrah_agent / from_umrah_season strategies
-- silently returned costCenterId=null because they looked at the new
-- pair and found nothing.
--
-- This migration backfills the missing side wherever ONE pair is set
-- and the other is NULL. After this runs, every existing cost-centre
-- row is visible to both query paths.

-- ─── 1. Backfill linkedEntity* from relatedEntity* where missing ─────────
UPDATE public.cost_centers
   SET "linkedEntityType" = "relatedEntityType",
       "linkedEntityId"   = "relatedEntityId"
 WHERE "linkedEntityType" IS NULL
   AND "linkedEntityId"   IS NULL
   AND "relatedEntityType" IS NOT NULL
   AND "relatedEntityId"   IS NOT NULL;

-- ─── 2. Backfill relatedEntity* from linkedEntity* where missing ─────────
UPDATE public.cost_centers
   SET "relatedEntityType" = "linkedEntityType",
       "relatedEntityId"   = "linkedEntityId"
 WHERE "relatedEntityType" IS NULL
   AND "relatedEntityId"   IS NULL
   AND "linkedEntityType" IS NOT NULL
   AND "linkedEntityId"   IS NOT NULL;

-- ─── 3. Index to keep the resolver's from_* lookup fast ──────────────────
-- The allocation resolver joins cost_centers ON ("linkedEntityType",
-- "linkedEntityId") in resolveCostCenter(). A composite partial index
-- matching that exact access pattern keeps the lookup O(1).
CREATE INDEX IF NOT EXISTS idx_cost_centers_linked_entity
  ON public.cost_centers ("companyId", "linkedEntityType", "linkedEntityId")
  WHERE "linkedEntityType" IS NOT NULL AND "linkedEntityId" IS NOT NULL;

COMMENT ON COLUMN public.cost_centers."linkedEntityType" IS
  'Mirrors relatedEntityType (kept in sync by the UI route + this migration). The allocation resolver from_* strategies query THIS pair; the UI route queries the relatedEntity* pair. Both are written together on INSERT so a cost-centre created via the UI is visible to the resolver immediately.';
