CREATE TABLE IF NOT EXISTS umrah_seasons (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','closed','archived')),
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS umrah_agents (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  "contactPerson" VARCHAR(200),
  phone VARCHAR(50),
  email VARCHAR(200),
  country VARCHAR(100),
  "profitMargin" NUMERIC(5,2) DEFAULT 0,
  "contractRef" VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'SAR',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','suspended','blocked')),
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS umrah_packages (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "costPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "sellPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "includesTransport" BOOLEAN DEFAULT false,
  "includesHotel" BOOLEAN DEFAULT false,
  "includesMeals" BOOLEAN DEFAULT false,
  "includesZiyarat" BOOLEAN DEFAULT false,
  duration INTEGER DEFAULT 7,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS umrah_pilgrims (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "agentId" INTEGER REFERENCES umrah_agents(id),
  "packageId" INTEGER REFERENCES umrah_packages(id),
  "fullName" VARCHAR(300) NOT NULL,
  "passportNumber" VARCHAR(50) NOT NULL,
  "visaNumber" VARCHAR(50),
  nationality VARCHAR(100),
  gender VARCHAR(10),
  "dateOfBirth" DATE,
  phone VARCHAR(50),
  "arrivalDate" DATE,
  "departureDate" DATE,
  "actualArrival" DATE,
  "actualDeparture" DATE,
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','arrived','active','overstayed','departed','violated','cancelled')),
  "hotelName" VARCHAR(200),
  "roomNumber" VARCHAR(50),
  "transportAssigned" BOOLEAN DEFAULT false,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_pilgrim_passport_season
  ON umrah_pilgrims ("companyId", "passportNumber", "seasonId");

CREATE TABLE IF NOT EXISTS umrah_penalties (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "pilgrimId" INTEGER REFERENCES umrah_pilgrims(id),
  "agentId" INTEGER REFERENCES umrah_agents(id),
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('overstay','violation','lost','regulatory')),
  "daysOverstayed" INTEGER DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'SAR',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid','waived')),
  "invoiceId" INTEGER,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS umrah_agent_invoices (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "agentId" INTEGER REFERENCES umrah_agents(id) NOT NULL,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  ref VARCHAR(50),
  type VARCHAR(20) DEFAULT 'sales' CHECK (type IN ('sales','purchase','credit_note')),
  "pilgrimCount" INTEGER DEFAULT 0,
  "visaCost" NUMERIC(12,2) DEFAULT 0,
  "transportCost" NUMERIC(12,2) DEFAULT 0,
  "hotelCost" NUMERIC(12,2) DEFAULT 0,
  "penaltiesTotal" NUMERIC(12,2) DEFAULT 0,
  "servicesTotal" NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  commission NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','partially_paid','paid','overdue','cancelled')),
  "dueDate" DATE,
  notes TEXT,
  "journalEntryId" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS umrah_transport (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "tripDate" DATE NOT NULL,
  "fromLocation" VARCHAR(200),
  "toLocation" VARCHAR(200),
  "vehicleId" INTEGER,
  "driverId" INTEGER,
  capacity INTEGER DEFAULT 45,
  "pilgrimCount" INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS umrah_import_logs (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "userId" INTEGER,
  "fileName" VARCHAR(300),
  "fileType" VARCHAR(50),
  "totalRows" INTEGER DEFAULT 0,
  "newRecords" INTEGER DEFAULT 0,
  "updatedRecords" INTEGER DEFAULT 0,
  "duplicateRecords" INTEGER DEFAULT 0,
  "errorRecords" INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "linkedEntityType" VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "linkedEntityId" INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "autoGenerated" BOOLEAN DEFAULT false;

ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "beforePhotos" JSONB DEFAULT '[]';
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "afterPhotos" JSONB DEFAULT '[]';
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "technicianId" INTEGER;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "responseTime" INTEGER;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "resolutionTime" INTEGER;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "clientRating" INTEGER;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "clientComment" TEXT;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "costResponsibility" VARCHAR(20) DEFAULT 'owner';
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "estimatedCost" NUMERIC(12,2);
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "actualCost" NUMERIC(12,2);
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "closureReport" TEXT;
