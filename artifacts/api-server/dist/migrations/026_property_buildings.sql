-- Add buildings/complexes table for property management
CREATE TABLE IF NOT EXISTS property_buildings (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  type VARCHAR(50) DEFAULT 'residential',
  floors INTEGER,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_buildings_company ON property_buildings("companyId");

-- Add buildingId column to property_units (soft link)
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS "buildingId" INTEGER REFERENCES property_buildings(id) ON DELETE SET NULL;

-- Add direction/orientation field to property_units
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS direction VARCHAR(50);

-- Add finishing type to property_units
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS finishing VARCHAR(100);

-- Add amenities/features as JSONB
ALTER TABLE property_units ADD COLUMN IF NOT EXISTS amenities JSONB;

-- Add tenants table as standalone entity
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(200),
  "nationalId" VARCHAR(50),
  nationality VARCHAR(100),
  "idType" VARCHAR(50) DEFAULT 'national_id',
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_company ON tenants("companyId");
CREATE INDEX IF NOT EXISTS idx_tenants_national_id ON tenants("nationalId");

-- Add tenantId to rental_contracts for proper linkage
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES tenants(id) ON DELETE SET NULL;
