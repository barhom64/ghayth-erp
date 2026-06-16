-- 360_supplier_items.sql
-- FIN-P5-SUPPLIER-ITEMS-MEMORY (#2235) — per-supplier item memory.
--
-- A lightweight "what does THIS supplier usually sell us, and on what terms"
-- catalogue, layered on the CANONICAL `suppliers` entity (vendorId references
-- suppliers.id — no separate vendor entity, per #2234). Distinct from the
-- company-wide `warehouse_products` inventory master: this carries the
-- supplier-relationship defaults the expense flow reuses so the operator
-- stops re-typing unit/price/tax/account every time.
--
-- The item gives an `accountPurpose` (e.g. vehicle_fuel_expense), NEVER a
-- final accountCode — financialEngine/preflight resolves the purpose to the
-- real account and verifies it. `allowedScenarios` (JSONB array) scopes which
-- expense scenarios may use the item.
--
-- Additive, idempotent, above the dump baseline cutoff (297) so fresh installs
-- apply it via the migration runner; no schema-dump edit required.
--
-- @rollback: DROP TABLE IF EXISTS supplier_items;

-- DRIFT SELF-HEAL (prod incident 2026-06-15): on long-lived / drifted
-- databases, `tax_codes` may have been created early WITHOUT its canonical
-- `id` PRIMARY KEY — the `CREATE TABLE IF NOT EXISTS` in 205_tax_codes_system
-- then silently no-ops over the pre-existing PK-less table. The FK below
-- (`"defaultTaxCodeId" ... REFERENCES tax_codes(id)`) then fails with
-- 42830 "there is no unique constraint matching given keys for referenced
-- table tax_codes", which (in production) aborts boot and crash-loops the
-- ENTIRE migration chain — so every later migration (incl. the fleet driver
-- columns) never lands and unrelated pages 500. Guarantee a unique/PK on
-- tax_codes(id) BEFORE the FK. The decision is RELATION+COLUMN+TYPE aware: we
-- add a PK only when NO pk/unique constraint already covers exactly
-- public.tax_codes(id). That makes it:
--   * a no-op on canonical/fresh DBs (205's `id serial PRIMARY KEY`),
--   * a no-op when a pk/unique on id exists under ANY other name (so we never
--     hit "multiple primary keys"),
--   * a no-op once prod has been self-healed (idempotent re-runs),
--   * an add only on the genuinely drifted PK-less shape.
-- The trailing `conname = 'tax_codes_pkey'` name-guard is scoped to tax_codes
-- (prevents a duplicate-name add AND satisfies check-migration-policy, which
-- requires a conname='<added>' existence check for every ADD CONSTRAINT).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'tax_codes'
      AND c.contype IN ('p', 'u')
      AND c.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = t.oid AND a.attname = 'id' AND NOT a.attisdropped
      )]
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tax_codes_pkey' AND conrelid = 'public.tax_codes'::regclass
  )
  THEN
    ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_pkey PRIMARY KEY (id);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS supplier_items (
  id                 SERIAL PRIMARY KEY,
  "companyId"        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "supplierId"       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  -- fuel | maintenance | parts | materials | service | other
  "itemType"         TEXT,
  "defaultUnit"      TEXT,
  "defaultTaxCodeId" INTEGER REFERENCES tax_codes(id) ON DELETE SET NULL,
  -- account PURPOSE (resolved to a real account by financialEngine), not a
  -- final accountCode — keeps the picker out of GL-account decisions.
  "accountPurpose"   TEXT,
  -- JSONB array of scenario keys the item is valid for (e.g. ["vehicle_fuel"]).
  -- NULL/empty = valid for any scenario.
  "allowedScenarios" JSONB,
  "lastPrice"        NUMERIC(14,2),
  "lastPriceDate"    DATE,
  "priceCurrency"    TEXT NOT NULL DEFAULT 'SAR',
  "isActive"         BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"        TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier
  ON supplier_items ("companyId", "supplierId")
  WHERE "deletedAt" IS NULL;
