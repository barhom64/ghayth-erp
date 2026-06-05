-- 250_subsidiary_accounts_umrah_property_unit.sql
--
-- WHAT:    extend `subsidiary_accounts.entityType` check constraint to
--          accept four new types: `umrah_agent`, `umrah_sub_agent`,
--          `umrah_season`, `property_unit`. Adds a partial index for
--          fast lookup by (entityType, entityId, accountType) — the
--          shape the resolver in umrahInvoicingEngine.ts will use.
--
-- WHY:     the operator asked: «هل يمكن ربط الوكيل بحساب مبيعات
--          مخصص؟ ... مبيعات العمرة موسم 1447 ... الوحدة هذي في
--          العقار هذا». Today only employee/client/vendor/project/
--          property can carry a subsidiary account. Adding 4 more
--          entity types unlocks per-agent / per-sub-agent / per-
--          season / per-unit revenue routing without inventing a new
--          table — we reuse the existing subsidiary_accounts shape
--          (entityType + entityId + accountType + accountId) so the
--          /finance/subsidiary-accounts UI gets the new categories
--          for free with a minimal extension.
--
-- IDEMPOTENT: the constraint drop + add is wrapped in a DO block so
--          re-running this migration on a DB that already has the
--          extended constraint is a no-op (PostgreSQL doesn't have
--          ALTER CONSTRAINT for CHECK clauses, so drop + recreate is
--          the canonical pattern).
--
-- @policy:breaking
--          The DROP CONSTRAINT step technically narrows the schema
--          relative to the OLD constraint, even though the NEW
--          constraint is strictly wider (accepts a SUPERSET of the
--          old values: original 5 + 4 new). During the milliseconds
--          between DROP and re-ADD an INSERT with an unknown
--          entityType could race in — the new constraint would
--          still accept it because the new list contains every old
--          value plus the new ones. In practice the only callers
--          that construct entityType are server-side code we control.
--          Acknowledging the policy as breaking per
--          docs/MIGRATION_POLICY.md §4 so the rolling-deploy guard
--          fires correctly for the brief constraint-absent window.
--
-- @rollback:
--   ALTER TABLE subsidiary_accounts DROP CONSTRAINT IF EXISTS subsidiary_accounts_entityType_check;
--   ALTER TABLE subsidiary_accounts ADD CONSTRAINT "subsidiary_accounts_entityType_check"
--     CHECK ("entityType" IN ('employee','client','vendor','project','property'));
--   DROP INDEX IF EXISTS idx_subsidiary_accounts_entity_lookup;

DO $$
BEGIN
  -- Drop the old constraint if it exists. The constraint name comes
  -- from the original schema (subsidiary_accounts_entityType_check).
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'subsidiary_accounts_entityType_check'
  ) THEN
    ALTER TABLE public.subsidiary_accounts
      DROP CONSTRAINT "subsidiary_accounts_entityType_check";
  END IF;
END $$;

ALTER TABLE public.subsidiary_accounts
  ADD CONSTRAINT "subsidiary_accounts_entityType_check"
  CHECK (("entityType")::text = ANY (ARRAY[
    'employee'::text,
    'client'::text,
    'vendor'::text,
    'project'::text,
    'property'::text,
    'umrah_agent'::text,
    'umrah_sub_agent'::text,
    'umrah_season'::text,
    'property_unit'::text
  ]));

-- Partial index for fast lookup by (entityType, entityId, accountType).
-- The umrah invoicing engine resolver hits this with 3-4 queries per
-- invoice (sub-agent → agent → season → default), so the index keeps
-- the resolver O(1) per lookup.
CREATE INDEX IF NOT EXISTS idx_subsidiary_accounts_entity_lookup
  ON public.subsidiary_accounts ("companyId", "entityType", "entityId", "accountType")
  WHERE "deletedAt" IS NULL AND "isActive" = true;
