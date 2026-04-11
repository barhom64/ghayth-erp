DO $$
BEGIN

  -- ── Employee extra fields for gov systems ──
  BEGIN ALTER TABLE employees ADD COLUMN "borderNumber" VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "visaNumber" VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "visaType" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "visaExpiry" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "sponsorNumber" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "workPermitNumber" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "workPermitExpiry" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "iqamaStatus" VARCHAR(30) DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END;

  -- ── Vehicle extra fields for gov systems ──
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "registrationNumber" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "registrationExpiry" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "inspectionDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "nextInspectionDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "plateType" VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "sequenceNumber" VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END;

  -- ── Journal entries gov integration fields ──
  BEGIN ALTER TABLE journal_entries ADD COLUMN "govIntegrationId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "govSyncEnabled" BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "govExternalRef" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "govEntityType" VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "govEntityId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;

END $$;

-- ── Gov integrations settings table ──
CREATE TABLE IF NOT EXISTS gov_integrations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('muqeem', 'tam', 'absher_business')),
  name VARCHAR(100) NOT NULL,
  config JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  enabled BOOLEAN DEFAULT false,
  "lastCheckedAt" TIMESTAMPTZ,
  "lastCheckStatus" VARCHAR(20),
  "lastCheckMessage" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId", type)
);

CREATE INDEX IF NOT EXISTS idx_gov_integrations_company ON gov_integrations("companyId");
CREATE INDEX IF NOT EXISTS idx_gov_integrations_type ON gov_integrations(type);

-- ── Gov integration links — link any entity/expense to a gov integration ──
CREATE TABLE IF NOT EXISTS gov_integration_links (
  id SERIAL PRIMARY KEY,
  "integrationId" INTEGER NOT NULL REFERENCES gov_integrations(id) ON DELETE CASCADE,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "entityType" VARCHAR(30) NOT NULL,
  "entityId" INTEGER NOT NULL,
  "externalRef" VARCHAR(200),
  "syncStatus" VARCHAR(20) DEFAULT 'pending' CHECK ("syncStatus" IN ('pending', 'synced', 'failed', 'skipped')),
  enabled BOOLEAN DEFAULT true,
  notes TEXT,
  "lastSyncAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_links_integration ON gov_integration_links("integrationId");
CREATE INDEX IF NOT EXISTS idx_gov_links_entity ON gov_integration_links("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_gov_links_company ON gov_integration_links("companyId");

-- ── Insert default gov integration rows for existing companies ──
INSERT INTO gov_integrations ("companyId", type, name, status, enabled)
SELECT id, 'muqeem', 'نظام مقيم — إدارة الإقامات', 'inactive', false FROM companies
ON CONFLICT ("companyId", type) DO NOTHING;

INSERT INTO gov_integrations ("companyId", type, name, status, enabled)
SELECT id, 'tam', 'نظام تم — المركبات والاستمارات', 'inactive', false FROM companies
ON CONFLICT ("companyId", type) DO NOTHING;

INSERT INTO gov_integrations ("companyId", type, name, status, enabled)
SELECT id, 'absher_business', 'أبشر أعمال', 'inactive', false FROM companies
ON CONFLICT ("companyId", type) DO NOTHING;
