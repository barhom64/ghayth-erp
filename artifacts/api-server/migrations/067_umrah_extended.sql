-- ============================================================================
-- 067_umrah_extended.sql
-- Wave 1 of the Umrah spec (مسار العمرة التفصيلية) — foundational schema.
--
-- Adds sub-agents, groups, date-ranged pricing, NUSK purchase invoices,
-- violations, employee commission plans/tiers/calculations, and import
-- batch tracking. Extends existing pilgrim/agent/season tables with the
-- mandatory compliance fields (branchId, createdBy, updatedBy, deletedAt)
-- and the NUSK identifiers used by the import engine.
--
-- Idempotent: uses CREATE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS so
-- running the migration twice is safe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Compliance columns on existing tables
-- Every umrah table now carries branchId + audit trail + soft delete
-- per the "التوافق المعماري" section of the spec.
-- ----------------------------------------------------------------------------

ALTER TABLE umrah_seasons
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "hijriYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_agents
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "nuskAgentNumber" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "seasonId" INTEGER REFERENCES umrah_seasons(id),
  ADD COLUMN IF NOT EXISTS "clientId" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_packages
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "nuskNumber" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "groupId" INTEGER,
  ADD COLUMN IF NOT EXISTS "subAgentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "passportExpiry" DATE,
  ADD COLUMN IF NOT EXISTS "entryPort" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "entryFlight" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "exitPort" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "exitFlight" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "actualStayDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "programDuration" INTEGER,
  ADD COLUMN IF NOT EXISTS "overstayDays" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "borderNumber" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "mofaNumber" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "isInsideKingdom" BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "hasUmrahPermit" BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- Relax the existing pilgrim status check so the broader spec statuses work.
-- We drop the old CHECK constraint and recreate a wider one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'umrah_pilgrims_status_check'
  ) THEN
    ALTER TABLE umrah_pilgrims DROP CONSTRAINT umrah_pilgrims_status_check;
  END IF;
END$$;

ALTER TABLE umrah_pilgrims
  ADD CONSTRAINT umrah_pilgrims_status_check
  CHECK (status IN (
    'pending','arrived','active','inside_kingdom','overstayed','overstay',
    'departed','exited','violated','absconded','deceased','visa_rejected',
    'visa_printed','cancelled'
  ));

-- Unique NUSK number per company (when present).
CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_pilgrim_nusk
  ON umrah_pilgrims ("companyId", "nuskNumber")
  WHERE "nuskNumber" IS NOT NULL AND "deletedAt" IS NULL;

ALTER TABLE umrah_penalties
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "subAgentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "groupId" INTEGER,
  ADD COLUMN IF NOT EXISTS "referenceType" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "referenceNumber" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_agent_invoices
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "subAgentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "nuskInvoiceRefs" TEXT,
  ADD COLUMN IF NOT EXISTS "groupRefs" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_transport
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- B. Sub-agents — the actual customer that gets invoiced
-- Each foreign "راضي ترافل" sits under a country agent.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS umrah_sub_agents (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "nuskCode" VARCHAR(30),
  name VARCHAR(255) NOT NULL,
  "agentId" INTEGER REFERENCES umrah_agents(id),
  "clientId" INTEGER,
  "paymentTerms" VARCHAR(20) DEFAULT 'postpaid'
    CHECK ("paymentTerms" IN ('prepaid','postpaid','partial')),
  "defaultPricePerMutamer" NUMERIC(12,2),
  phone VARCHAR(50),
  email VARCHAR(200),
  country VARCHAR(100),
  "isActive" BOOLEAN DEFAULT TRUE,
  notes TEXT,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_sub_agent_nusk_code
  ON umrah_sub_agents ("companyId", "nuskCode")
  WHERE "nuskCode" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_sub_agent_client
  ON umrah_sub_agents ("companyId", "clientId")
  WHERE "clientId" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- C. Groups — the NUSK group_number is the anchor for everything
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS umrah_groups (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "nuskGroupNumber" VARCHAR(30) NOT NULL,
  name VARCHAR(255),
  "agentId" INTEGER REFERENCES umrah_agents(id),
  "subAgentId" INTEGER REFERENCES umrah_sub_agents(id),
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "mutamerCount" INTEGER DEFAULT 0,
  "programDuration" INTEGER,
  status VARCHAR(30) DEFAULT 'imported'
    CHECK (status IN ('imported','active','completed','has_violations','settled','closed')),
  "nuskInvoiceNumber" VARCHAR(30),
  "salesInvoiceId" INTEGER,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_group_number
  ON umrah_groups ("companyId", "nuskGroupNumber")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_group_season
  ON umrah_groups ("companyId", "seasonId");

-- ----------------------------------------------------------------------------
-- D. Date-ranged pricing per agent/sub-agent
-- Prices change roughly monthly — each row is the price for a given window.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS umrah_pricing (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "subAgentId" INTEGER REFERENCES umrah_sub_agents(id),
  "agentId" INTEGER REFERENCES umrah_agents(id),
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "pricePerMutamer" NUMERIC(10,2) NOT NULL,
  "includesHotel" BOOLEAN DEFAULT FALSE,
  "includesTransport" BOOLEAN DEFAULT FALSE,
  "validFrom" DATE NOT NULL,
  "validTo" DATE NOT NULL,
  notes TEXT,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ,
  CHECK ("validTo" >= "validFrom")
);

CREATE INDEX IF NOT EXISTS idx_umrah_pricing_lookup
  ON umrah_pricing ("companyId", "agentId", "subAgentId", "validFrom", "validTo")
  WHERE "deletedAt" IS NULL;

-- ----------------------------------------------------------------------------
-- E. NUSK purchase invoices — what the platform actually charged
-- Separate from the sales invoice that goes to the sub-agent.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS umrah_nusk_invoices (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "nuskInvoiceNumber" VARCHAR(30) NOT NULL,
  "agentId" INTEGER REFERENCES umrah_agents(id),
  "subAgentId" INTEGER REFERENCES umrah_sub_agents(id),
  "groupId" INTEGER REFERENCES umrah_groups(id),
  "mutamerCount" INTEGER DEFAULT 0,
  "groundServices" NUMERIC(12,2) DEFAULT 0,
  "electronicFees" NUMERIC(12,2) DEFAULT 0,
  "visaFees" NUMERIC(12,2) DEFAULT 0,
  "insuranceFees" NUMERIC(12,2) DEFAULT 0,
  "enrichmentServices" NUMERIC(12,2) DEFAULT 0,
  "additionalServices" NUMERIC(12,2) DEFAULT 0,
  "transportTotal" NUMERIC(12,2) DEFAULT 0,
  "hotelTotal" NUMERIC(12,2) DEFAULT 0,
  "refundAmount" NUMERIC(12,2) DEFAULT 0,
  "netCost" NUMERIC(12,2) DEFAULT 0,
  "totalAmount" NUMERIC(12,2) DEFAULT 0,
  "nuskStatus" VARCHAR(20) DEFAULT 'pending'
    CHECK ("nuskStatus" IN ('paid','pending','expired','in_progress','refunded','cancelled')),
  "issueDate" TIMESTAMPTZ,
  "expiryDate" TIMESTAMPTZ,
  "purchaseInvoiceId" INTEGER,
  "journalEntryId" INTEGER,
  "programDuration" INTEGER,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_umrah_nusk_invoice_number
  ON umrah_nusk_invoices ("companyId", "nuskInvoiceNumber")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_nusk_group
  ON umrah_nusk_invoices ("companyId", "groupId");

-- ----------------------------------------------------------------------------
-- F. Violations — overstay / absconder / other
-- Replaces the looser penalty table semantics. The existing umrah_penalties
-- stays for backward compatibility; new code writes to umrah_violations.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS umrah_violations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('overstay','absconded','other')),
  "referenceType" VARCHAR(20)
    CHECK ("referenceType" IN ('group','passport','border','mutamer')),
  "referenceNumber" VARCHAR(40),
  "mutamerId" INTEGER REFERENCES umrah_pilgrims(id),
  "groupId" INTEGER REFERENCES umrah_groups(id),
  "subAgentId" INTEGER REFERENCES umrah_sub_agents(id),
  "agentId" INTEGER REFERENCES umrah_agents(id),
  description TEXT,
  "penaltyAmount" NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open'
    CHECK (status IN ('detected','open','invoiced','paid','disputed','closed')),
  "linkedInvoiceId" INTEGER,
  "detectedAt" TIMESTAMPTZ DEFAULT NOW(),
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_violation_mutamer
  ON umrah_violations ("companyId", "mutamerId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_violation_status
  ON umrah_violations ("companyId", status)
  WHERE "deletedAt" IS NULL;

-- ----------------------------------------------------------------------------
-- G. Employee commission plans + tiers + monthly calculations
-- Umrah-specific employees get tiered bonuses tied to the assignment in
-- the umrah department — NOT the person. Moving the employee out of umrah
-- suspends the plan automatically.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_commission_plans (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "employeeId" INTEGER NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "planName" VARCHAR(255) NOT NULL,
  "baseSalary" NUMERIC(12,2),
  "commissionType" VARCHAR(20)
    CHECK ("commissionType" IN ('percentage','fixed','tiered','mixed')),
  "conditionType" VARCHAR(20)
    CHECK ("conditionType" IN ('profit_avg','sales_percent','both_or','none')),
  "minProfitPerVisa" NUMERIC(10,2),
  "minSalesPercent" NUMERIC(5,2),
  "minAvgPrice" NUMERIC(10,2),
  "excludedMonths" JSONB DEFAULT '[]'::jsonb,
  "tierUnit" INTEGER DEFAULT 10000,
  "partialTiersAllowed" BOOLEAN DEFAULT FALSE,
  "violationBlocksCommission" BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active','suspended','expired')),
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMPTZ,
  notes TEXT,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commission_plan_employee
  ON employee_commission_plans ("companyId", "employeeId", status)
  WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS employee_commission_tiers (
  id SERIAL PRIMARY KEY,
  "planId" INTEGER NOT NULL REFERENCES employee_commission_plans(id) ON DELETE CASCADE,
  "fromCount" INTEGER NOT NULL,
  "toCount" INTEGER,
  "bonusPerUnit" NUMERIC(12,2) NOT NULL,
  "isCumulative" BOOLEAN DEFAULT TRUE,
  "tierOrder" INTEGER DEFAULT 1,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_tier_plan
  ON employee_commission_tiers ("planId", "tierOrder");

CREATE TABLE IF NOT EXISTS employee_commission_calculations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "planId" INTEGER NOT NULL REFERENCES employee_commission_plans(id),
  "employeeId" INTEGER NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  "totalMutamers" INTEGER DEFAULT 0,
  "avgProfitPerVisa" NUMERIC(10,2),
  "salesPercent" NUMERIC(5,2),
  "avgSalePrice" NUMERIC(10,2),
  "conditionMet" BOOLEAN DEFAULT FALSE,
  "conditionDetails" TEXT,
  "completedTiers" INTEGER DEFAULT 0,
  "commissionAmount" NUMERIC(12,2) DEFAULT 0,
  "hasViolations" BOOLEAN DEFAULT FALSE,
  "finalAmount" NUMERIC(12,2) DEFAULT 0,
  "isExcludedMonth" BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'calculated'
    CHECK (status IN ('calculated','reviewed','approved','paid','rejected')),
  "payrollLineId" INTEGER,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_calc_period
  ON employee_commission_calculations ("companyId", "planId", year, month)
  WHERE "deletedAt" IS NULL;

-- ----------------------------------------------------------------------------
-- H. Import batches + per-row change log
-- Every upload lives in a batch; every created/updated/skipped row is
-- traceable back to the batch for rollback and audit.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS umrah_import_batches (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "seasonId" INTEGER REFERENCES umrah_seasons(id),
  "fileType" VARCHAR(20) NOT NULL
    CHECK ("fileType" IN ('mutamers','vouchers')),
  "fileName" VARCHAR(255),
  "fileSize" INTEGER,
  "uploadedBy" INTEGER,
  "uploadedAt" TIMESTAMPTZ DEFAULT NOW(),
  "totalRows" INTEGER DEFAULT 0,
  "newCount" INTEGER DEFAULT 0,
  "updatedCount" INTEGER DEFAULT 0,
  "skippedCount" INTEGER DEFAULT 0,
  "errorCount" INTEGER DEFAULT 0,
  "financialImpactCount" INTEGER DEFAULT 0,
  "manualReviewCount" INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','previewed','confirmed','rejected','failed')),
  "summaryJson" JSONB,
  "errorsJson" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_batch_season
  ON umrah_import_batches ("companyId", "seasonId", "uploadedAt" DESC);

CREATE TABLE IF NOT EXISTS umrah_import_changes (
  id SERIAL PRIMARY KEY,
  "batchId" INTEGER NOT NULL REFERENCES umrah_import_batches(id) ON DELETE CASCADE,
  "entityType" VARCHAR(30) NOT NULL
    CHECK ("entityType" IN ('mutamer','group','nusk_invoice','agent','sub_agent','violation')),
  "entityId" INTEGER,
  "changeType" VARCHAR(20) NOT NULL
    CHECK ("changeType" IN ('created','updated','skipped','error')),
  "fieldName" VARCHAR(100),
  "oldValue" TEXT,
  "newValue" TEXT,
  "hasFinancialImpact" BOOLEAN DEFAULT FALSE,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_umrah_import_changes_batch
  ON umrah_import_changes ("batchId", "entityType");

-- ----------------------------------------------------------------------------
-- I. System settings seed — defaults per the spec's "إعدادات العمرة" table
-- Inserted only if absent (no overwrite) so manual tuning sticks. Follows
-- the pattern used by 006_system_settings_table.sql — key/value only,
-- with a NOT EXISTS guard because the partial unique index excludes NULL
-- companyId/branchId rows from ON CONFLICT handling.
-- ----------------------------------------------------------------------------
INSERT INTO system_settings (key, value)
SELECT k, v
FROM (VALUES
  ('umrah.overstay_daily_penalty', '0'),
  ('umrah.absconder_penalty', '2000'),
  ('umrah.default_program_duration', '14'),
  ('umrah.import_auto_create_groups', 'true'),
  ('umrah.import_auto_create_purchase', 'true'),
  ('umrah.commission_auto_calculate', 'false'),
  ('umrah.tier_unit', '10000'),
  ('umrah.require_agent_linking', 'true')
) AS defaults(k, v)
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings
  WHERE key = k AND "companyId" IS NULL AND "branchId" IS NULL
);

-- ----------------------------------------------------------------------------
-- J. Umrah permission keys — seed new permission rows if the helper exists
-- Permissions follow the module:action pattern already used elsewhere.
-- ----------------------------------------------------------------------------
-- (Permission keys are typically code-seeded, not migration-seeded, so this
-- migration only declares the column-level schema. The umrah routes already
-- use requirePermission('umrah:read|create|update|delete') via the existing
-- permissionMiddleware.)

-- ============================================================================
-- End of 067_umrah_extended.sql
-- ============================================================================
