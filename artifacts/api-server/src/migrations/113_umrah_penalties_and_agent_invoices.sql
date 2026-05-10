-- Create umrah_penalties table (used by penalty engine and agent invoicing)
CREATE TABLE IF NOT EXISTS umrah_penalties (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "pilgrimId" INTEGER,
  "agentId" INTEGER,
  "subAgentId" INTEGER,
  "seasonId" INTEGER,
  type VARCHAR(50) NOT NULL DEFAULT 'overstay',
  "daysOverstayed" INTEGER,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  notes TEXT,
  "invoiceId" INTEGER,
  "waivedBy" INTEGER,
  "waivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_penalties_company ON umrah_penalties("companyId");
CREATE INDEX IF NOT EXISTS idx_umrah_penalties_pilgrim ON umrah_penalties("pilgrimId");
CREATE INDEX IF NOT EXISTS idx_umrah_penalties_agent ON umrah_penalties("agentId");
CREATE INDEX IF NOT EXISTS idx_umrah_penalties_season ON umrah_penalties("seasonId");

-- Create umrah_agent_invoices table (used by invoicing and payment recording)
CREATE TABLE IF NOT EXISTS umrah_agent_invoices (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "agentId" INTEGER NOT NULL,
  "seasonId" INTEGER,
  ref VARCHAR(80),
  type VARCHAR(30) NOT NULL DEFAULT 'sales',
  "pilgrimCount" INTEGER DEFAULT 0,
  "penaltiesTotal" NUMERIC(14,2) DEFAULT 0,
  "servicesTotal" NUMERIC(14,2) DEFAULT 0,
  subtotal NUMERIC(14,2) DEFAULT 0,
  commission NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  "paidAmount" NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  "journalEntryId" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_agent_invoices_company ON umrah_agent_invoices("companyId");
CREATE INDEX IF NOT EXISTS idx_umrah_agent_invoices_agent ON umrah_agent_invoices("agentId");
CREATE INDEX IF NOT EXISTS idx_umrah_agent_invoices_season ON umrah_agent_invoices("seasonId");
