-- 363_supplier_finance_defaults.sql
-- FIN-FINANCIAL-MEMORY-FOUNDATION — payee / counterparty finance memory.
--
-- Per-supplier finance defaults (payment method / currency / account PURPOSE /
-- cost-center) layered on the CANONICAL `suppliers.id` — no parallel vendor
-- entity (per #2234). Complements `supplier_items` (#2235): items remember the
-- WHAT, this remembers the HOW-WE-PAY. Stores an `accountPurpose` (text) ONLY —
-- NEVER a final accountCode; financialEngine resolves it and preflight verifies.
--
-- Additive, idempotent, above the dump baseline cutoff (297).
--
-- @rollback: DROP TABLE IF EXISTS supplier_finance_defaults;

CREATE TABLE IF NOT EXISTS supplier_finance_defaults (
  id                     SERIAL PRIMARY KEY,
  "companyId"            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "supplierId"           INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  "defaultPaymentMethod" TEXT,
  "defaultCurrency"      TEXT NOT NULL DEFAULT 'SAR',
  -- account PURPOSE (resolved to a real account by financialEngine), text only.
  "defaultAccountPurpose" TEXT,
  "defaultCostCenterId"  INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  "isActive"             BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"            TIMESTAMP
);

-- one live finance-defaults row per supplier per company (upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_finance_defaults_unique
  ON supplier_finance_defaults ("companyId", "supplierId")
  WHERE "deletedAt" IS NULL;
