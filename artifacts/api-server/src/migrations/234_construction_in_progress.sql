-- 234_construction_in_progress.sql
--
-- @rollback: DROP TABLE IF EXISTS cip_costs;
--            DROP TABLE IF EXISTS construction_in_progress;
--
-- Construction-in-Progress (CIP) — IAS 16 staging account for assets
-- under construction. Costs from purchases, labour, contractor
-- payments accumulate in a CIP account until the project completes,
-- then transfer to a single Fixed Asset at the cumulative cost.
-- Without it, a 50-component building project posts 50 separate
-- finished assets (with separate depreciation schedules) on each
-- invoice — inflating the asset register and breaking project cost
-- rollups.

CREATE TABLE IF NOT EXISTS construction_in_progress (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL,
  "branchId"        INTEGER,
  code              VARCHAR(50),
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  category          VARCHAR(100),
  "startDate"       DATE NOT NULL,
  "expectedCompletionDate" DATE,
  "totalCost"       NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            VARCHAR(30) NOT NULL DEFAULT 'in_progress',
  "cipAccountCode"  VARCHAR(20) DEFAULT '1530',
  "targetAssetCategory" VARCHAR(100),
  "targetAssetAccountCode" VARCHAR(20) DEFAULT '1500',
  "targetDepreciationAccountCode" VARCHAR(20) DEFAULT '6100',
  "targetAccDepreciationAccountCode" VARCHAR(20) DEFAULT '1590',
  "targetUsefulLifeYears" INTEGER,
  "targetDepreciationMethod" VARCHAR(30) DEFAULT 'straight_line',
  "capitalizedAt"   DATE,
  "capitalizedAssetId" INTEGER,
  "capitalizationJournalId" INTEGER,
  "createdBy"       INTEGER,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cip_company_status
  ON construction_in_progress ("companyId", status)
  WHERE "deletedAt" IS NULL;

-- Per-cost record: each addition to CIP. Linked to the originating
-- document (invoice / expense / journal) for audit drilldown.
CREATE TABLE IF NOT EXISTS cip_costs (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "cipId"         INTEGER NOT NULL REFERENCES construction_in_progress(id) ON DELETE CASCADE,
  "costDate"      DATE NOT NULL,
  description     TEXT NOT NULL,
  amount          NUMERIC(18,2) NOT NULL,
  "sourceType"    VARCHAR(50),
  "sourceId"      INTEGER,
  "journalEntryId" INTEGER,
  "createdBy"     INTEGER,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cip_costs_cip
  ON cip_costs ("cipId")
  WHERE "deletedAt" IS NULL;
