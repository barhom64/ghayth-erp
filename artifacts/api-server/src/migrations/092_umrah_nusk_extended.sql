-- ============================================================
-- Migration 067: Umrah NUSK-extended schema (Phase 1 — Database)
--
-- Adds 11 new tables required by the NUSK-based Umrah workflow,
-- extends existing umrah_seasons / umrah_agents with NUSK fields,
-- backfills compliance columns (branchId/createdBy/updatedBy/
-- deletedAt) on every legacy umrah_* table, and seeds the eight
-- umrah.* keys into system_settings + the current 1447 H season.
--
-- Conventions inherited from the existing codebase:
--   * snake_case table names, "camelCase" quoted columns
--   * SERIAL PRIMARY KEY + TIMESTAMPTZ + VARCHAR(N) CHECK (...)
--   * NUMERIC(N,2) for money (no native ENUM, no DECIMAL)
--   * IF NOT EXISTS / ON CONFLICT DO NOTHING — fully idempotent
--   * system_settings inheritance: companyId IS NULL = system,
--     companyId=X AND branchId IS NULL = company,
--     companyId=X AND branchId=Y = branch (closest wins)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend legacy tables: NUSK fields + compliance columns
-- ------------------------------------------------------------

-- 1.1 umrah_seasons: Hijri year + current-season flag + compliance
ALTER TABLE umrah_seasons ADD COLUMN IF NOT EXISTS "hijriYear"  INTEGER;
ALTER TABLE umrah_seasons ADD COLUMN IF NOT EXISTS "isCurrent"  BOOLEAN DEFAULT false;
ALTER TABLE umrah_seasons ADD COLUMN IF NOT EXISTS "branchId"   INTEGER REFERENCES branches(id);
ALTER TABLE umrah_seasons ADD COLUMN IF NOT EXISTS "createdBy"  INTEGER REFERENCES users(id);
ALTER TABLE umrah_seasons ADD COLUMN IF NOT EXISTS "updatedBy"  INTEGER REFERENCES users(id);
ALTER TABLE umrah_seasons ADD COLUMN IF NOT EXISTS "deletedAt"  TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS umrah_seasons_company_hijri_uq
  ON umrah_seasons ("companyId", "hijriYear")
  WHERE "deletedAt" IS NULL AND "hijriYear" IS NOT NULL;

-- 1.2 umrah_agents: NUSK agent number + season scoping + client linking + compliance
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "nuskAgentNumber" VARCHAR(20);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "seasonId"        INTEGER REFERENCES umrah_seasons(id);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "clientId"        INTEGER REFERENCES clients(id);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "isActive"        BOOLEAN DEFAULT true;
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "branchId"        INTEGER REFERENCES branches(id);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "createdBy"       INTEGER REFERENCES users(id);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "updatedBy"       INTEGER REFERENCES users(id);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "deletedAt"       TIMESTAMPTZ;

-- Same NUSK agent number can recur across seasons (different rows), so
-- uniqueness is per (company, season, nusk number).
CREATE UNIQUE INDEX IF NOT EXISTS umrah_agents_company_season_nusk_uq
  ON umrah_agents ("companyId", "seasonId", "nuskAgentNumber")
  WHERE "deletedAt" IS NULL AND "nuskAgentNumber" IS NOT NULL;

-- 1.3 Plain compliance backfill on remaining legacy umrah_* tables
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE umrah_packages       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_pilgrims       ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_pilgrims       ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_pilgrims       ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_pilgrims       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE umrah_penalties      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE umrah_transport      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "branchId"  INTEGER REFERENCES branches(id);
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "createdBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER REFERENCES users(id);
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE umrah_import_logs    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- Scope-friendly partial indexes (skip soft-deleted rows).
CREATE INDEX IF NOT EXISTS idx_umrah_seasons_scope        ON umrah_seasons        ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_agents_scope         ON umrah_agents         ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_packages_scope       ON umrah_packages       ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_scope       ON umrah_pilgrims       ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_penalties_scope      ON umrah_penalties      ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_agent_invoices_scope ON umrah_agent_invoices ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_transport_scope      ON umrah_transport      ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_import_logs_scope    ON umrah_import_logs    ("companyId", "branchId") WHERE "deletedAt" IS NULL;

-- ------------------------------------------------------------
-- 2. New tables — NUSK Umrah model (11 tables)
-- ------------------------------------------------------------

-- 2.1 Sub-agents: travel agencies in pilgrim country, billed as clients.
CREATE TABLE IF NOT EXISTS umrah_sub_agents (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL,
  "branchId"    INTEGER REFERENCES branches(id),
  "nuskCode"    VARCHAR(30),
  name          VARCHAR(255) NOT NULL,
  "agentId"     INTEGER REFERENCES umrah_agents(id),
  "clientId"    INTEGER REFERENCES clients(id),
  "paymentTerms" VARCHAR(20) DEFAULT 'postpaid'
    CHECK ("paymentTerms" IN ('prepaid','postpaid','partial')),
  "isActive"    BOOLEAN DEFAULT true,
  notes         TEXT,
  "createdBy"   INTEGER REFERENCES users(id),
  "updatedBy"   INTEGER REFERENCES users(id),
  "createdAt"   TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS umrah_sub_agents_company_nusk_uq
  ON umrah_sub_agents ("companyId", "nuskCode")
  WHERE "deletedAt" IS NULL AND "nuskCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_scope
  ON umrah_sub_agents ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_agent
  ON umrah_sub_agents ("agentId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_client
  ON umrah_sub_agents ("clientId") WHERE "deletedAt" IS NULL;

-- 2.2 Groups: NUSK pilgrim groups (auto-created from imports).
CREATE TABLE IF NOT EXISTS umrah_groups (
  id                 SERIAL PRIMARY KEY,
  "companyId"        INTEGER NOT NULL,
  "branchId"         INTEGER REFERENCES branches(id),
  "nuskGroupNumber"  VARCHAR(30) NOT NULL,
  name               VARCHAR(255),
  "agentId"          INTEGER REFERENCES umrah_agents(id),
  "subAgentId"       INTEGER REFERENCES umrah_sub_agents(id),
  "seasonId"         INTEGER REFERENCES umrah_seasons(id),
  "mutamerCount"     INTEGER DEFAULT 0,
  "programDuration"  INTEGER,
  status             VARCHAR(30) DEFAULT 'imported'
    CHECK (status IN ('imported','active','completed','has_violations','settled','closed')),
  "nuskInvoiceNumber" VARCHAR(30),
  "salesInvoiceId"   INTEGER REFERENCES umrah_agent_invoices(id),
  notes              TEXT,
  "createdBy"        INTEGER REFERENCES users(id),
  "updatedBy"        INTEGER REFERENCES users(id),
  "createdAt"        TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS umrah_groups_company_nusk_uq
  ON umrah_groups ("companyId", "nuskGroupNumber")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_groups_scope
  ON umrah_groups ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_groups_agent_subagent
  ON umrah_groups ("agentId", "subAgentId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_groups_season
  ON umrah_groups ("seasonId") WHERE "deletedAt" IS NULL;

-- 2.3 Mutamers: NUSK pilgrim records (separate from legacy umrah_pilgrims).
CREATE TABLE IF NOT EXISTS umrah_mutamers (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "branchId"          INTEGER REFERENCES branches(id),
  "nuskNumber"        VARCHAR(40) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  nationality         VARCHAR(100),
  gender              VARCHAR(10) CHECK (gender IN ('male','female')),
  "passportNumber"    VARCHAR(40),
  "passportExpiry"    DATE,
  "groupId"           INTEGER REFERENCES umrah_groups(id),
  "entryDate"         TIMESTAMPTZ,
  "entryPort"         VARCHAR(120),
  "entryFlight"       VARCHAR(30),
  "exitDate"          TIMESTAMPTZ,
  "exitPort"          VARCHAR(120),
  "exitFlight"        VARCHAR(30),
  "actualStayDays"    INTEGER,
  "programDuration"   INTEGER,
  "overstayDays"      INTEGER DEFAULT 0,
  "borderNumber"      VARCHAR(30),
  "visaNumber"        VARCHAR(30),
  "mofaNumber"        VARCHAR(30),
  status              VARCHAR(30) DEFAULT 'inside_kingdom'
    CHECK (status IN ('inside_kingdom','exited','overstay','absconded','deceased','visa_rejected','visa_printed')),
  "isInsideKingdom"   BOOLEAN DEFAULT true,
  "hasUmrahPermit"    BOOLEAN DEFAULT false,
  notes               TEXT,
  "createdBy"         INTEGER REFERENCES users(id),
  "updatedBy"         INTEGER REFERENCES users(id),
  "createdAt"         TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS umrah_mutamers_company_nusk_uq
  ON umrah_mutamers ("companyId", "nuskNumber")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_mutamers_scope
  ON umrah_mutamers ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_mutamers_group
  ON umrah_mutamers ("groupId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_mutamers_status
  ON umrah_mutamers ("companyId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_mutamers_passport
  ON umrah_mutamers ("companyId", "passportNumber") WHERE "deletedAt" IS NULL;

-- 2.4 Pricing: per-period prices, optional per-sub-agent override.
CREATE TABLE IF NOT EXISTS umrah_pricing (
  id                 SERIAL PRIMARY KEY,
  "companyId"        INTEGER NOT NULL,
  "branchId"         INTEGER REFERENCES branches(id),
  "agentId"          INTEGER REFERENCES umrah_agents(id),
  "subAgentId"       INTEGER REFERENCES umrah_sub_agents(id),
  "seasonId"         INTEGER REFERENCES umrah_seasons(id),
  "pricePerMutamer"  NUMERIC(12,2) NOT NULL DEFAULT 0,
  "includesHotel"    BOOLEAN DEFAULT false,
  "includesTransport" BOOLEAN DEFAULT false,
  "validFrom"        DATE NOT NULL,
  "validTo"          DATE,
  notes              TEXT,
  "createdBy"        INTEGER REFERENCES users(id),
  "updatedBy"        INTEGER REFERENCES users(id),
  "createdAt"        TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_pricing_lookup
  ON umrah_pricing ("companyId", "agentId", "subAgentId", "validFrom", "validTo")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_pricing_season
  ON umrah_pricing ("seasonId") WHERE "deletedAt" IS NULL;

-- 2.5 NUSK invoices (purchase side).
CREATE TABLE IF NOT EXISTS umrah_nusk_invoices (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL,
  "branchId"            INTEGER REFERENCES branches(id),
  "nuskInvoiceNumber"   VARCHAR(30) NOT NULL,
  "agentId"             INTEGER REFERENCES umrah_agents(id),
  "subAgentId"          INTEGER REFERENCES umrah_sub_agents(id),
  "groupId"             INTEGER REFERENCES umrah_groups(id),
  "mutamerCount"        INTEGER DEFAULT 0,
  "groundServices"      NUMERIC(12,2) DEFAULT 0,
  "electronicFees"      NUMERIC(12,2) DEFAULT 0,
  "visaFees"            NUMERIC(12,2) DEFAULT 0,
  "insuranceFees"       NUMERIC(12,2) DEFAULT 0,
  "enrichmentServices"  NUMERIC(12,2) DEFAULT 0,
  "additionalServices"  NUMERIC(12,2) DEFAULT 0,
  "transportTotal"      NUMERIC(12,2) DEFAULT 0,
  "hotelTotal"          NUMERIC(12,2) DEFAULT 0,
  "refundAmount"        NUMERIC(12,2) DEFAULT 0,
  "netCost"             NUMERIC(12,2) DEFAULT 0,
  "totalAmount"         NUMERIC(12,2) DEFAULT 0,
  "nuskStatus"          VARCHAR(20) DEFAULT 'pending'
    CHECK ("nuskStatus" IN ('paid','pending','expired','in_progress','refunded')),
  "issueDate"           TIMESTAMPTZ,
  "expiryDate"          TIMESTAMPTZ,
  "purchaseInvoiceId"   INTEGER,
  "programDuration"     INTEGER,
  notes                 TEXT,
  "createdBy"           INTEGER REFERENCES users(id),
  "updatedBy"           INTEGER REFERENCES users(id),
  "createdAt"           TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"           TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS umrah_nusk_invoices_company_no_uq
  ON umrah_nusk_invoices ("companyId", "nuskInvoiceNumber")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_scope
  ON umrah_nusk_invoices ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_group
  ON umrah_nusk_invoices ("groupId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_status
  ON umrah_nusk_invoices ("companyId", "nuskStatus") WHERE "deletedAt" IS NULL;

-- 2.6 Violations (separate from legacy umrah_penalties).
CREATE TABLE IF NOT EXISTS umrah_violations (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL,
  "branchId"        INTEGER REFERENCES branches(id),
  type              VARCHAR(20) NOT NULL
    CHECK (type IN ('overstay','absconded','other')),
  "referenceType"   VARCHAR(20) NOT NULL
    CHECK ("referenceType" IN ('group','passport','border')),
  "referenceNumber" VARCHAR(40) NOT NULL,
  "mutamerId"       INTEGER REFERENCES umrah_mutamers(id),
  "groupId"         INTEGER REFERENCES umrah_groups(id),
  "subAgentId"     INTEGER REFERENCES umrah_sub_agents(id),
  description       TEXT,
  "penaltyAmount"   NUMERIC(12,2) DEFAULT 0,
  status            VARCHAR(20) DEFAULT 'detected'
    CHECK (status IN ('detected','open','invoiced','paid','disputed','closed')),
  "linkedInvoiceId" INTEGER REFERENCES umrah_agent_invoices(id),
  notes             TEXT,
  "createdBy"       INTEGER REFERENCES users(id),
  "updatedBy"       INTEGER REFERENCES users(id),
  "createdAt"       TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_violations_scope
  ON umrah_violations ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_violations_status
  ON umrah_violations ("companyId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_violations_ref
  ON umrah_violations ("companyId", "referenceType", "referenceNumber") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_violations_mutamer
  ON umrah_violations ("mutamerId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_violations_subagent
  ON umrah_violations ("subAgentId") WHERE "deletedAt" IS NULL;

-- 2.7 Import batches: every uploaded NUSK file is one batch.
CREATE TABLE IF NOT EXISTS umrah_import_batches (
  id                      SERIAL PRIMARY KEY,
  "companyId"             INTEGER NOT NULL,
  "branchId"              INTEGER REFERENCES branches(id),
  "seasonId"              INTEGER REFERENCES umrah_seasons(id),
  "fileType"              VARCHAR(20) NOT NULL
    CHECK ("fileType" IN ('mutamers','vouchers')),
  "fileName"              VARCHAR(255),
  "fileSize"              INTEGER,
  "uploadedBy"            INTEGER REFERENCES users(id),
  "uploadedAt"            TIMESTAMPTZ DEFAULT NOW(),
  "totalRows"             INTEGER DEFAULT 0,
  "newCount"              INTEGER DEFAULT 0,
  "updatedCount"          INTEGER DEFAULT 0,
  "skippedCount"          INTEGER DEFAULT 0,
  "errorCount"            INTEGER DEFAULT 0,
  "financialImpactCount"  INTEGER DEFAULT 0,
  "manualReviewCount"     INTEGER DEFAULT 0,
  status                  VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','previewed','confirmed','rejected','failed')),
  "summaryJson"           JSONB DEFAULT '{}'::jsonb,
  "errorsJson"            JSONB DEFAULT '[]'::jsonb,
  notes                   TEXT,
  "createdBy"             INTEGER REFERENCES users(id),
  "updatedBy"             INTEGER REFERENCES users(id),
  "createdAt"             TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_scope
  ON umrah_import_batches ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_status
  ON umrah_import_batches ("companyId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_season
  ON umrah_import_batches ("seasonId") WHERE "deletedAt" IS NULL;

-- 2.8 Import changes: per-row diff log linked to a batch.
CREATE TABLE IF NOT EXISTS umrah_import_changes (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL,
  "branchId"            INTEGER REFERENCES branches(id),
  "batchId"             INTEGER NOT NULL REFERENCES umrah_import_batches(id) ON DELETE CASCADE,
  "entityType"          VARCHAR(20) NOT NULL
    CHECK ("entityType" IN ('mutamer','group','nusk_invoice','agent','sub_agent')),
  "entityId"            INTEGER,
  "changeType"          VARCHAR(10) NOT NULL
    CHECK ("changeType" IN ('created','updated','skipped','error')),
  "fieldName"           VARCHAR(100),
  "oldValue"            TEXT,
  "newValue"            TEXT,
  "hasFinancialImpact"  BOOLEAN DEFAULT false,
  notes                 TEXT,
  "createdBy"           INTEGER REFERENCES users(id),
  "updatedBy"           INTEGER REFERENCES users(id),
  "createdAt"           TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_import_changes_batch
  ON umrah_import_changes ("batchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_import_changes_entity
  ON umrah_import_changes ("entityType", "entityId") WHERE "deletedAt" IS NULL;

-- 2.9 Commission plans: per-employee Umrah commission rules.
CREATE TABLE IF NOT EXISTS employee_commission_plans (
  id                          SERIAL PRIMARY KEY,
  "companyId"                 INTEGER NOT NULL,
  "branchId"                  INTEGER REFERENCES branches(id),
  "employeeId"                INTEGER NOT NULL REFERENCES employees(id),
  "assignmentId"              INTEGER REFERENCES employee_assignments(id),
  "seasonId"                  INTEGER REFERENCES umrah_seasons(id),
  "planName"                  VARCHAR(255) NOT NULL,
  "baseSalary"                NUMERIC(12,2) DEFAULT 0,
  "commissionType"            VARCHAR(20) DEFAULT 'tiered'
    CHECK ("commissionType" IN ('percentage','fixed','tiered','mixed')),
  "conditionType"             VARCHAR(20) DEFAULT 'none'
    CHECK ("conditionType" IN ('profit_avg','sales_percent','both_or','none')),
  "minProfitPerVisa"          NUMERIC(12,2),
  "minSalesPercent"           NUMERIC(5,2),
  "minAvgPrice"               NUMERIC(12,2),
  "excludedMonths"            JSONB DEFAULT '[]'::jsonb,
  "tierUnit"                  INTEGER DEFAULT 10000,
  "partialTiersAllowed"       BOOLEAN DEFAULT false,
  "violationBlocksCommission" BOOLEAN DEFAULT true,
  status                      VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active','suspended','expired')),
  "approvedBy"                INTEGER REFERENCES users(id),
  "approvedAt"                TIMESTAMPTZ,
  notes                       TEXT,
  "createdBy"                 INTEGER REFERENCES users(id),
  "updatedBy"                 INTEGER REFERENCES users(id),
  "createdAt"                 TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_scope
  ON employee_commission_plans ("companyId", "branchId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_employee
  ON employee_commission_plans ("employeeId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_assignment
  ON employee_commission_plans ("assignmentId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_season
  ON employee_commission_plans ("seasonId") WHERE "deletedAt" IS NULL;

-- 2.10 Commission tiers (per plan, ascending count brackets).
CREATE TABLE IF NOT EXISTS employee_commission_tiers (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER REFERENCES branches(id),
  "planId"        INTEGER NOT NULL REFERENCES employee_commission_plans(id) ON DELETE CASCADE,
  "fromCount"     INTEGER NOT NULL DEFAULT 0,
  "toCount"       INTEGER,
  "bonusPerUnit"  NUMERIC(12,2) NOT NULL DEFAULT 0,
  "isCumulative"  BOOLEAN DEFAULT true,
  "createdBy"     INTEGER REFERENCES users(id),
  "updatedBy"     INTEGER REFERENCES users(id),
  "createdAt"     TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_commission_tiers_plan
  ON employee_commission_tiers ("planId", "fromCount") WHERE "deletedAt" IS NULL;

-- 2.11 Commission calculations (one row per plan-month-year).
CREATE TABLE IF NOT EXISTS employee_commission_calculations (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL,
  "branchId"            INTEGER REFERENCES branches(id),
  "planId"              INTEGER NOT NULL REFERENCES employee_commission_plans(id) ON DELETE CASCADE,
  "employeeId"          INTEGER NOT NULL REFERENCES employees(id),
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                  INTEGER NOT NULL,
  "totalMutamers"       INTEGER DEFAULT 0,
  "avgProfitPerVisa"    NUMERIC(12,2) DEFAULT 0,
  "salesPercent"        NUMERIC(5,2) DEFAULT 0,
  "avgSalePrice"        NUMERIC(12,2) DEFAULT 0,
  "conditionMet"        BOOLEAN DEFAULT false,
  "conditionDetails"    TEXT,
  "completedTiers"      INTEGER DEFAULT 0,
  "commissionAmount"    NUMERIC(12,2) DEFAULT 0,
  "hasViolations"       BOOLEAN DEFAULT false,
  "isExcludedMonth"     BOOLEAN DEFAULT false,
  "finalAmount"         NUMERIC(12,2) DEFAULT 0,
  status                VARCHAR(20) DEFAULT 'calculated'
    CHECK (status IN ('calculated','reviewed','approved','paid','rejected')),
  "payrollLineId"       INTEGER REFERENCES payroll_lines(id),
  notes                 TEXT,
  "createdBy"           INTEGER REFERENCES users(id),
  "updatedBy"           INTEGER REFERENCES users(id),
  "createdAt"           TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"           TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_calc_plan_period_uq
  ON employee_commission_calculations ("planId", year, month)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_commission_calc_employee
  ON employee_commission_calculations ("employeeId", year, month) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_commission_calc_status
  ON employee_commission_calculations ("companyId", status) WHERE "deletedAt" IS NULL;

-- ------------------------------------------------------------
-- 3. Seed: 8 system-scope umrah.* settings (companyId IS NULL = defaults)
-- ------------------------------------------------------------
INSERT INTO system_settings (key, value, "dataType")
SELECT k, v, dt
FROM (VALUES
  ('umrah.overstay_daily_penalty',    '0',     'number'),
  ('umrah.absconder_penalty',         '2000',  'number'),
  ('umrah.default_program_duration',  '14',    'number'),
  ('umrah.import_auto_create_groups', 'true',  'boolean'),
  ('umrah.import_auto_create_purchase','true', 'boolean'),
  ('umrah.commission_auto_calculate', 'false', 'boolean'),
  ('umrah.tier_unit',                 '10000', 'number'),
  ('umrah.require_agent_linking',     'true',  'boolean')
) AS defaults(k, v, dt)
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings
  WHERE key = k AND "companyId" IS NULL AND "branchId" IS NULL
);

-- ------------------------------------------------------------
-- 4. Seed: current Hijri season 1447 H per active company
-- ------------------------------------------------------------
INSERT INTO umrah_seasons (
  "companyId", title, "hijriYear", "startDate", "endDate", "isCurrent", status, notes
)
SELECT
  c.id,
  'موسم 1447 هـ',
  1447,
  '2025-07-27'::date,
  '2026-07-16'::date,
  true,
  'open',
  'موسم نسك 1446-1447 هـ — مُنشأ تلقائيًا عبر migration 067'
FROM companies c
WHERE c.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM umrah_seasons s
    WHERE s."companyId" = c.id AND s."hijriYear" = 1447 AND s."deletedAt" IS NULL
  );
