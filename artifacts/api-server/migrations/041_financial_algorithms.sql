-- Fixed Assets table
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL,
  "branchId"        INTEGER,
  code              VARCHAR(50),
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  category          VARCHAR(100),
  "purchaseDate"    DATE NOT NULL,
  "purchaseCost"    NUMERIC(15,2) NOT NULL,
  "salvageValue"    NUMERIC(15,2) NOT NULL DEFAULT 0,
  "usefulLifeYears" INTEGER NOT NULL DEFAULT 5,
  "depreciationMethod" VARCHAR(30) NOT NULL DEFAULT 'straight_line',
  "currentBookValue" NUMERIC(15,2),
  "accumulatedDepreciation" NUMERIC(15,2) NOT NULL DEFAULT 0,
  "disposedAt"      DATE,
  "disposalValue"   NUMERIC(15,2),
  status            VARCHAR(30) NOT NULL DEFAULT 'active',
  "assetAccountCode" VARCHAR(20) DEFAULT '1500',
  "depreciationAccountCode" VARCHAR(20) DEFAULT '6100',
  "accDepreciationAccountCode" VARCHAR(20) DEFAULT '1590',
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Depreciation schedule entries
CREATE TABLE IF NOT EXISTS depreciation_entries (
  id              SERIAL PRIMARY KEY,
  "assetId"       INTEGER NOT NULL REFERENCES fixed_assets(id),
  "companyId"     INTEGER NOT NULL,
  period          VARCHAR(7) NOT NULL,
  "depreciationAmount" NUMERIC(15,2) NOT NULL,
  "bookValueAfter" NUMERIC(15,2) NOT NULL,
  "journalEntryId" INTEGER,
  "postedAt"      TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bank statement imports
CREATE TABLE IF NOT EXISTS bank_statements (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL,
  "branchId"    INTEGER,
  "accountCode" VARCHAR(20) NOT NULL DEFAULT '1110',
  "statementDate" DATE NOT NULL,
  reference     VARCHAR(100),
  description   TEXT,
  amount        NUMERIC(15,2) NOT NULL,
  type          VARCHAR(10) NOT NULL,
  "matchedJournalLineId" INTEGER,
  "matchStatus" VARCHAR(20) NOT NULL DEFAULT 'unmatched',
  "importBatchId" VARCHAR(50),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rounding account mapping (just a chart_of_accounts entry)
-- Ensure rounding_differences account code 9999 in COA seeded per company

-- Weighted average cost is stored on warehouse_products.costPrice already,
-- but we add a costing_method column for future-proofing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_products' AND column_name='costingMethod') THEN
    ALTER TABLE warehouse_products ADD COLUMN "costingMethod" VARCHAR(30) DEFAULT 'weighted_average';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_products' AND column_name='lastWaCost') THEN
    ALTER TABLE warehouse_products ADD COLUMN "lastWaCost" NUMERIC(15,4) DEFAULT 0;
  END IF;
END $$;

-- Seed rounding differences account 9999 for all existing companies
INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '9999', 'فروقات التقريب', 'Rounding Differences', 'expense', 2, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '9999'
)
ON CONFLICT DO NOTHING;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company ON fixed_assets("companyId");
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_asset ON depreciation_entries("assetId");
CREATE INDEX IF NOT EXISTS idx_bank_statements_company ON bank_statements("companyId");
CREATE INDEX IF NOT EXISTS idx_bank_statements_batch ON bank_statements("importBatchId");
