-- 363_expense_category_memory.sql
-- FIN-FINANCIAL-MEMORY-FOUNDATION — expense memory per category / cost-center.
--
-- "What account purpose / tax / cost-center does THIS expense category usually
-- post to" — a per-company default keyed by an expense category key so the
-- operator stops re-picking purpose+tax+cost-center every time. Stores an
-- `accountPurpose` (text) ONLY — NEVER a final accountCode; financialEngine
-- resolves it and preflight verifies it.
--
-- Additive, idempotent, above the dump baseline cutoff (297).
--
-- @rollback: DROP TABLE IF EXISTS expense_category_memory;

CREATE TABLE IF NOT EXISTS expense_category_memory (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- the expense category / operationType key this default applies to.
  "categoryKey"         TEXT NOT NULL,
  -- account PURPOSE (resolved to a real account by financialEngine), text only.
  "accountPurpose"      TEXT,
  "defaultTaxCodeId"    INTEGER REFERENCES tax_codes(id) ON DELETE SET NULL,
  "defaultCostCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"           TIMESTAMP
);

-- one live memory per category per company (upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_category_memory_unique
  ON expense_category_memory ("companyId", "categoryKey")
  WHERE "deletedAt" IS NULL;
