-- 142_saudi_compliance_foundations.sql
-- Foundations for Saudi labour-ministry compliance: WPS (Wage
-- Protection System), Mudad settlements, and Saudization (Nitaqat)
-- snapshots. Week 1 of the plan in
-- docs/SAUDI_COMPLIANCE_DESIGN.md.
--
-- Existing employees.iqamaNumber / iqamaExpiry / gosiNumber and
-- payroll.gosi columns are left unchanged.

BEGIN;

-- 1. WPS run header. One row per (company, period, bank).
CREATE TABLE IF NOT EXISTS wps_runs (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id),
  period                CHAR(7) NOT NULL,           -- YYYY-MM
  "bankCode"            VARCHAR(20) NOT NULL,       -- NCB, ALRAJHI, RIYAD, ...
  "fileName"            VARCHAR(120),
  "fileBytes"           TEXT,                       -- the generated CSV/PIPE file
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  "totalAmount"         NUMERIC(18,2) NOT NULL DEFAULT 0,
  "recordCount"         INTEGER NOT NULL DEFAULT 0,
  "submittedAt"         TIMESTAMPTZ,
  "submittedBy"         INTEGER,
  "acknowledgedAt"      TIMESTAMPTZ,
  "ackFileBytes"        TEXT,
  notes                 TEXT,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wps_runs_status
    CHECK (status IN ('draft','submitted','acknowledged','rejected','partial'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wps_runs_company_period_bank
  ON wps_runs ("companyId", period, "bankCode");
CREATE INDEX IF NOT EXISTS idx_wps_runs_status_period
  ON wps_runs (status, period);

-- 2. WPS run detail. Per-employee line in the run.
CREATE TABLE IF NOT EXISTS wps_run_lines (
  id                    SERIAL PRIMARY KEY,
  "wpsRunId"            INTEGER NOT NULL REFERENCES wps_runs(id) ON DELETE CASCADE,
  "employeeId"          INTEGER NOT NULL,
  "iqamaOrId"           VARCHAR(40) NOT NULL,       -- iqama OR national-id, per spec
  iban                  VARCHAR(40) NOT NULL,
  amount                NUMERIC(14,2) NOT NULL,
  "basicSalary"         NUMERIC(14,2) NOT NULL DEFAULT 0,
  "housingAllowance"    NUMERIC(14,2) NOT NULL DEFAULT 0,
  "otherAllowances"     NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions            NUMERIC(14,2) NOT NULL DEFAULT 0,
  remark                VARCHAR(80),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  "bankRefNumber"       VARCHAR(80),
  "errorMessage"        TEXT,
  CONSTRAINT chk_wps_lines_status
    CHECK (status IN ('pending','paid','failed','held','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_wps_lines_run
  ON wps_run_lines ("wpsRunId");
CREATE INDEX IF NOT EXISTS idx_wps_lines_employee
  ON wps_run_lines ("employeeId");

-- 3. Mudad settlement audit. The Mudad REST client (week 3) will
--    write rows here as it submits + receives acks.
CREATE TABLE IF NOT EXISTS mudad_settlements (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id),
  period                CHAR(7),                    -- YYYY-MM, NULL for non-period entries
  type                  VARCHAR(30) NOT NULL,
  "employeeId"          INTEGER NOT NULL,
  "mudadRefId"          VARCHAR(80),
  status                VARCHAR(20) NOT NULL DEFAULT 'submitted',
  amount                NUMERIC(14,2),
  payload               JSONB NOT NULL,
  response              JSONB,
  "submittedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "acknowledgedAt"      TIMESTAMPTZ,
  CONSTRAINT chk_mudad_type
    CHECK (type IN ('salary','leave_unpaid','exit_reentry','termination','contract_renewal')),
  CONSTRAINT chk_mudad_status
    CHECK (status IN ('submitted','acknowledged','rejected','retry'))
);
CREATE INDEX IF NOT EXISTS idx_mudad_company_period
  ON mudad_settlements ("companyId", period);
CREATE INDEX IF NOT EXISTS idx_mudad_employee
  ON mudad_settlements ("employeeId");

-- 4. Saudization snapshot. Monthly cron writes one row per company.
CREATE TABLE IF NOT EXISTS saudization_snapshots (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id),
  period                CHAR(7) NOT NULL,
  "totalEmployees"      INTEGER NOT NULL,
  "saudiEmployees"      INTEGER NOT NULL,
  "nonSaudiEmployees"   INTEGER NOT NULL,
  "saudizationPercent"  NUMERIC(5,2) NOT NULL,
  category              VARCHAR(15) NOT NULL,
  sector                VARCHAR(60),                -- "construction", "retail", … (per Nitaqat threshold table)
  "computedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                 TEXT,
  CONSTRAINT chk_saudization_category
    CHECK (category IN ('platinum','green','yellow','red'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_saudization_company_period
  ON saudization_snapshots ("companyId", period);

-- 5. WPS settings per company — bank code + IBAN + format adapter
--    selection. Read once when building the file.
CREATE TABLE IF NOT EXISTS wps_settings (
  "companyId"           INTEGER PRIMARY KEY REFERENCES companies(id),
  "bankCode"            VARCHAR(20),
  "bankIban"            VARCHAR(40),
  "filenameTemplate"    VARCHAR(120) DEFAULT 'WPS_{companyId}_{period}.csv',
  "isActive"            BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
