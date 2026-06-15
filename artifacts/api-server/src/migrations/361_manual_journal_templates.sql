-- 361_manual_journal_templates.sql
-- FIN-FINANCIAL-MEMORY-FOUNDATION — recurring MANUAL journal templates.
--
-- Codifies a repeated manual journal as a recallable memory: a header plus
-- lines, where each line carries an `accountPurpose` (text) — NEVER a final
-- accountCode. When recalled, the central financial engine resolves each
-- purpose to a real account and preflight verifies it; the memory decides
-- nothing about GL accounts. This is DISTINCT from `recurring_journals`
-- (an automation/scheduling feature whose lines store raw accountCode):
-- this table is the purpose-based memory layer, surfaced at /finance/journal-templates.
--
-- Lines may be a fixed `amount` OR a `ratio` of a runtime base, and may name
-- `requiredDimensions` (e.g. ["vehicleId","costCenterId"]) the caller must fill
-- before posting. `defaultSupplierId` references the CANONICAL suppliers.id
-- (no parallel vendor entity, per #2234).
--
-- The line table carries its own `companyId` so every read/write stays
-- statically company-scoped (tenant-isolation guard). Additive, idempotent,
-- above the dump baseline cutoff (297).
--
-- @rollback: DROP TABLE IF EXISTS manual_journal_template_lines; DROP TABLE IF EXISTS manual_journal_templates;

CREATE TABLE IF NOT EXISTS manual_journal_templates (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  -- canonical supplier (suppliers.id) — counterparty default, nullable.
  "defaultSupplierId"   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  "defaultCostCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  currency              TEXT NOT NULL DEFAULT 'SAR',
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"           TIMESTAMP
);

CREATE TABLE IF NOT EXISTS manual_journal_template_lines (
  id                    SERIAL PRIMARY KEY,
  -- denormalized companyId so the line table is independently company-scoped.
  "companyId"           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "templateId"          INTEGER NOT NULL REFERENCES manual_journal_templates(id) ON DELETE CASCADE,
  "lineNo"              INTEGER NOT NULL,
  -- account PURPOSE (resolved to a real account by financialEngine), not a
  -- final accountCode — keeps the memory out of GL-account decisions.
  "accountPurpose"      TEXT NOT NULL,
  side                  TEXT NOT NULL CHECK (side IN ('debit','credit')),
  -- a fixed amount OR a ratio of a runtime base (exactly one is used).
  amount                NUMERIC(14,2),
  ratio                 NUMERIC(7,4),
  -- JSONB array of dimension keys the caller must fill before posting.
  "requiredDimensions"  JSONB,
  "defaultCostCenterId" INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  description           TEXT,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_journal_templates_company
  ON manual_journal_templates ("companyId", "isActive")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_manual_journal_template_lines_template
  ON manual_journal_template_lines ("companyId", "templateId");
