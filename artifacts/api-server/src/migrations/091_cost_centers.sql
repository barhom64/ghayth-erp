-- Migration 091: Cost centers table + CRUD support
-- The cost_centers table is referenced in finance-journal.ts for budget
-- validation but was never created in any prior migration.

CREATE TABLE IF NOT EXISTS cost_centers (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  code VARCHAR(50),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(30) DEFAULT 'general',
  "parentId" INTEGER REFERENCES cost_centers(id),
  "relatedEntityType" VARCHAR(30),
  "relatedEntityId" INTEGER,
  "allocatedAmount" NUMERIC(15,2) DEFAULT 0,
  "usedAmount" NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("companyId", code)
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_company ON cost_centers("companyId");
CREATE INDEX IF NOT EXISTS idx_cost_centers_entity ON cost_centers("relatedEntityType", "relatedEntityId");
