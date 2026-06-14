-- Migration 341: Dynamic Analytic Accounts
-- @rollback:
--   BEGIN;
--   ALTER TABLE journal_lines DROP COLUMN IF EXISTS "analyticAccountId";
--   ALTER TABLE financial_posting_failures
--     DROP COLUMN IF EXISTS "failureCategory",
--     DROP COLUMN IF EXISTS "failureReason",
--     DROP COLUMN IF EXISTS "suggestedFix",
--     DROP COLUMN IF EXISTS "classifiedAt",
--     DROP COLUMN IF EXISTS "classifiedBy";
--   DROP TABLE IF EXISTS analytic_seasons CASCADE;
--   DROP TABLE IF EXISTS posting_config_requirements CASCADE;
--   DROP TABLE IF EXISTS analytic_accounts CASCADE;
--   COMMIT;
-- Issue #2197 — build the analytic dimension layer that lets the GL engine
-- attach operational context to every journal line without multiplying the
-- chart of accounts for each branch / season / agent / custody.
--
-- CRITICAL DESIGN NOTE:
--   analytic_accounts is NOT a chart of accounts. NO journal entries are ever
--   posted TO an analytic_account. Posting always goes to a chart_of_accounts
--   row (GL control account) that has allowPosting=true.
--   analytic_accounts is a pure DIMENSION store — it carries operational
--   metadata (who/what/when/where) that the reporting layer uses for drill-down.
--   It is attached to journal_lines as a nullable FK for context, never as a debit/credit target.
--
-- Design:
--   analytic_accounts  — named dimension containers (auto-created per entity)
--   journal_lines gets an optional analyticAccountId FK (context-only, not debit/credit)
--   financial_posting_failures gets failureCategory + failureReason columns
--   posting_config_requirements — per-module required account mappings
--
-- GL chart stays flat and clean; all operational breakdown lives here.

-- ─── Analytic Accounts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytic_accounts (
  id               SERIAL PRIMARY KEY,
  "companyId"      INTEGER NOT NULL REFERENCES companies(id),
  "branchId"       INTEGER REFERENCES branches(id),

  -- Human-readable label, auto-generated if not provided
  name             TEXT NOT NULL,
  code             VARCHAR(60),

  -- Operational dimensions (all optional — fill what's known)
  "controlAccountId"  INTEGER REFERENCES chart_of_accounts(id),
  "partyId"           INTEGER,           -- vendor / customer / agent / employee
  "partyRole"         VARCHAR(40),       -- supplier|customer|agent|sub_agent|employee|gov_provider
  "parentPartyId"     INTEGER,           -- sub-agent → main agent
  "seasonId"          INTEGER,           -- e.g. umrah season 1447
  "serviceType"       VARCHAR(40),       -- visa|transport|hotel|penalty|…
  "projectId"         INTEGER,
  "contractId"        INTEGER,
  "employeeId"        INTEGER REFERENCES employees(id),
  "custodyId"         INTEGER,
  "cashboxId"         INTEGER,
  "bankAccountId"     INTEGER,
  "sourceModule"      VARCHAR(60),       -- umrah|custody|vendor|payroll|…
  "sourceDocumentId"  INTEGER,
  "importBatchId"     INTEGER,

  -- Lifecycle
  status           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','needs_linking','closed','archived')),
  "autoCreated"    BOOLEAN NOT NULL DEFAULT false,
  "needsLinking"   BOOLEAN NOT NULL DEFAULT false,
  "linkingNote"    TEXT,                 -- human hint for مركز التصنيف

  "createdBy"      INTEGER,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aa_company        ON analytic_accounts ("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_aa_party          ON analytic_accounts ("companyId", "partyId", "partyRole") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_aa_season         ON analytic_accounts ("companyId", "seasonId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_aa_needs_linking  ON analytic_accounts ("companyId", "needsLinking") WHERE "needsLinking" = true AND "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_aa_source_module  ON analytic_accounts ("companyId", "sourceModule") WHERE "deletedAt" IS NULL;

-- ─── Link journal_lines to analytic accounts ─────────────────────────────────

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS "analyticAccountId" INTEGER REFERENCES analytic_accounts(id);

CREATE INDEX IF NOT EXISTS idx_jl_analytic ON journal_lines ("analyticAccountId")
  WHERE "analyticAccountId" IS NOT NULL;

-- ─── Classify financial_posting_failures ─────────────────────────────────────

ALTER TABLE financial_posting_failures
  ADD COLUMN IF NOT EXISTS "failureCategory" VARCHAR(40)
    CHECK ("failureCategory" IN (
      'parent_account',      -- tried to post on allowPosting=false account
      'missing_mapping',     -- no accounting_mapping for the operationType
      'missing_party',       -- vendor/agent/employee not found or not linked
      'missing_config',      -- required module config missing
      'unlinked_analytic',   -- analytic account needs linking before posting
      'period_closed',       -- financial period was closed
      'unbalanced_entry',    -- journal entry doesn't balance
      'other'
    )),
  ADD COLUMN IF NOT EXISTS "failureReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "suggestedFix"    TEXT,
  ADD COLUMN IF NOT EXISTS "classifiedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "classifiedBy"    INTEGER;

-- Back-fill existing rows: classify by error text pattern
UPDATE financial_posting_failures
SET "failureCategory" = CASE
  WHEN error ILIKE '%allowPosting%' OR error ILIKE '%حساب تجميعي%' OR error ILIKE '%حساب رئيسي%'
    THEN 'parent_account'
  WHEN error ILIKE '%mapping%' OR error ILIKE '%ربط%' OR error ILIKE '%mapping_fallback%'
    THEN 'missing_mapping'
  WHEN error ILIKE '%party%' OR error ILIKE '%vendor%' OR error ILIKE '%agent%' OR error ILIKE '%وكيل%'
    THEN 'missing_party'
  WHEN error ILIKE '%period%' OR error ILIKE '%الفترة المالية%' OR error ILIKE '%مغلقة%'
    THEN 'period_closed'
  WHEN error ILIKE '%unbalanced%' OR error ILIKE '%غير متوازن%'
    THEN 'unbalanced_entry'
  ELSE 'other'
END
WHERE "failureCategory" IS NULL;

-- ─── Posting Config Requirements ─────────────────────────────────────────────
-- Documents which accounting_mappings keys each module REQUIRES before it can
-- post. The CI guard queries this table to detect missing seeds.

CREATE TABLE IF NOT EXISTS posting_config_requirements (
  id              SERIAL PRIMARY KEY,
  module          VARCHAR(60) NOT NULL,   -- umrah|custody|vendor|customer|payroll|fleet|…
  "operationType" VARCHAR(120) NOT NULL,
  side            VARCHAR(10) NOT NULL CHECK (side IN ('debit','credit','both')),
  required        BOOLEAN NOT NULL DEFAULT true,
  description     TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module, "operationType", side)
);

INSERT INTO posting_config_requirements (module, "operationType", side, description) VALUES
  -- Umrah visa purchase from Nusk/ministry/service-provider
  ('umrah', 'umrah_visa_cost',          'both', 'تكلفة تأشيرات العمرة من نسك/مزود الخدمة'),
  ('umrah', 'umrah_prepaid_balance',    'both', 'رصيد مسبق لدى نسك أو مزود خدمة'),
  ('umrah', 'umrah_accounts_payable',   'both', 'ذمم موردي العمرة'),
  ('umrah', 'umrah_revenue',            'both', 'إيرادات العمرة'),
  ('umrah', 'umrah_agent_receivable',   'both', 'ذمم الوكلاء'),
  ('umrah', 'umrah_penalty_expense',    'both', 'مصروف غرامات العمرة'),
  ('umrah', 'umrah_transport_expense',  'both', 'مصروف النقل / العمرة'),
  -- Custody
  ('custody', 'custody_control',        'both', 'حساب رقابة العهد'),
  ('custody', 'custody_cashbox',        'both', 'خزنة صرف العهد'),
  -- Vendor AP
  ('vendor',  'vendor_invoice_expense', 'both', 'مصروف الفاتورة / المشتريات'),
  ('vendor',  'vendor_ap_control',      'both', 'ذمم الموردين الرقابية'),
  -- Customer AR
  ('customer','invoice_revenue',        'both', 'إيرادات المبيعات'),
  ('customer','invoice_ar',             'both', 'ذمم العملاء'),
  -- Payroll
  ('payroll', 'salary_expense',         'both', 'مصروف الرواتب'),
  ('payroll', 'salary_payable',         'both', 'مستحقات الرواتب')
ON CONFLICT DO NOTHING;

-- ─── Analytic Seasons (Umrah seasons as first-class dimension) ───────────────

CREATE TABLE IF NOT EXISTS analytic_seasons (
  id           SERIAL PRIMARY KEY,
  "companyId"  INTEGER NOT NULL REFERENCES companies(id),
  code         VARCHAR(20) NOT NULL,   -- e.g. '1447'
  name         TEXT NOT NULL,
  "startDate"  DATE,
  "endDate"    DATE,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId", code)
);

-- Seed default Umrah seasons for existing companies
INSERT INTO analytic_seasons ("companyId", code, name, "startDate", "endDate", "isActive")
SELECT
  c.id,
  '1447',
  'موسم العمرة 1447',
  '2025-08-01',
  '2026-07-31',
  true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM analytic_seasons s WHERE s."companyId" = c.id AND s.code = '1447'
);
