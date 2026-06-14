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
