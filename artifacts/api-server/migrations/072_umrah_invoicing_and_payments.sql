-- ============================================================================
-- 072_umrah_invoicing_and_payments.sql
--
-- Phase 3 of the Umrah module: sales invoicing + payment tracking.
--
-- 1. umrah_sales_invoices — Ghayth-issued sales invoices per sub-agent
-- 2. umrah_sales_invoice_items — line items (groups + penalties)
-- 3. umrah_payments — payment records against sub-agents
-- 4. umrah_payment_allocations — FIFO distribution of payments to invoices
-- 5. Sequence for invoice numbering
-- 6. Add approved status to umrah_agent_invoices CHECK
--
-- Idempotent via IF NOT EXISTS.
-- ============================================================================

-- 1. Sales invoices issued by Ghayth to sub-agents
CREATE TABLE IF NOT EXISTS umrah_sales_invoices (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "subAgentId" INTEGER NOT NULL REFERENCES umrah_sub_agents(id),
  "clientId" INTEGER REFERENCES clients(id),
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  ref VARCHAR(50),
  "invoiceDate" DATE DEFAULT CURRENT_DATE,
  subtotal NUMERIC(12,2) DEFAULT 0,
  "penaltiesTotal" NUMERIC(12,2) DEFAULT 0,
  "vatRate" NUMERIC(5,2) DEFAULT 15,
  "vatAmount" NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  "paidAmount" NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft','approved','sent','partially_paid','paid','overdue','cancelled')),
  "dueDate" DATE,
  "nuskInvoiceRefs" TEXT,
  "groupRefs" TEXT,
  "pilgrimCount" INTEGER DEFAULT 0,
  "journalEntryId" INTEGER,
  notes TEXT,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_sales_inv_sub_agent
  ON umrah_sales_invoices ("companyId", "subAgentId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_sales_inv_season
  ON umrah_sales_invoices ("companyId", "seasonId")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_sales_inv_ref
  ON umrah_sales_invoices ("companyId", ref)
  WHERE ref IS NOT NULL AND "deletedAt" IS NULL;

-- 2. Line items for sales invoices
CREATE TABLE IF NOT EXISTS umrah_sales_invoice_items (
  id SERIAL PRIMARY KEY,
  "invoiceId" INTEGER NOT NULL REFERENCES umrah_sales_invoices(id) ON DELETE CASCADE,
  "itemType" VARCHAR(20) NOT NULL
    CHECK ("itemType" IN ('group','penalty','adjustment')),
  "groupId" INTEGER REFERENCES umrah_groups(id),
  "violationId" INTEGER,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  "unitPrice" NUMERIC(12,2) DEFAULT 0,
  "lineTotal" NUMERIC(12,2) DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_umrah_sales_inv_items
  ON umrah_sales_invoice_items ("invoiceId");

-- 3. Payment records
CREATE TABLE IF NOT EXISTS umrah_payments (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "subAgentId" INTEGER NOT NULL REFERENCES umrah_sub_agents(id),
  ref VARCHAR(50),
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'SAR',
  "exchangeRate" NUMERIC(10,4),
  "sarAmount" NUMERIC(12,2) NOT NULL,
  method VARCHAR(30) DEFAULT 'bank_transfer'
    CHECK (method IN ('cash','bank_transfer','cheque','online','other')),
  "externalReference" VARCHAR(100),
  "paymentDate" DATE DEFAULT CURRENT_DATE,
  "journalEntryId" INTEGER,
  notes TEXT,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_payment_sub_agent
  ON umrah_payments ("companyId", "subAgentId")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_payment_ref
  ON umrah_payments ("companyId", ref)
  WHERE ref IS NOT NULL AND "deletedAt" IS NULL;

-- 4. Payment allocations (FIFO distribution to invoices)
CREATE TABLE IF NOT EXISTS umrah_payment_allocations (
  id SERIAL PRIMARY KEY,
  "paymentId" INTEGER NOT NULL REFERENCES umrah_payments(id) ON DELETE CASCADE,
  "invoiceId" INTEGER NOT NULL REFERENCES umrah_sales_invoices(id),
  amount NUMERIC(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_umrah_payment_alloc_invoice
  ON umrah_payment_allocations ("invoiceId");

-- 5. Sequence for umrah sales invoice numbering
CREATE SEQUENCE IF NOT EXISTS umrah_sales_invoice_seq
  START WITH 1 INCREMENT BY 1 NO MAXVALUE NO CYCLE;

-- 6. Sequence for umrah payment numbering
CREATE SEQUENCE IF NOT EXISTS umrah_payment_seq
  START WITH 1 INCREMENT BY 1 NO MAXVALUE NO CYCLE;

-- ============================================================================
-- End of 072_umrah_invoicing_and_payments.sql
-- ============================================================================
