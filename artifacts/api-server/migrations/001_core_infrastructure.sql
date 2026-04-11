-- ============================================================
-- Migration 001: Core Infrastructure Tables
-- Settings, Permissions, Audit enhancement, and missing tables
-- Note: Many tables already exist in this DB with lowercase column names
-- This migration creates only what's missing and augments existing tables safely
-- ============================================================

-- ============================================================
-- 1. SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id           SERIAL PRIMARY KEY,
  scope        VARCHAR(20) NOT NULL CHECK (scope IN ('system', 'company', 'branch')),
  "scopeId"    INTEGER,
  key          VARCHAR(200) NOT NULL,
  value        JSONB NOT NULL DEFAULT 'null',
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS settings_system_key_uq
  ON settings (scope, key) WHERE "scopeId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS settings_scoped_key_uq
  ON settings (scope, "scopeId", key) WHERE "scopeId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS settings_scope_id_idx ON settings (scope, "scopeId");

-- ============================================================
-- 2. PERMISSIONS TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id           SERIAL PRIMARY KEY,
  "userId"     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission   VARCHAR(100) NOT NULL,
  type         VARCHAR(10) NOT NULL DEFAULT 'grant' CHECK (type IN ('grant', 'revoke')),
  "companyId"  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "grantedBy"  INTEGER REFERENCES users(id),
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS permissions_user_perm_company_uq
  ON permissions ("userId", permission, "companyId") WHERE "companyId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS permissions_user_perm_global_uq
  ON permissions ("userId", permission) WHERE "companyId" IS NULL;

CREATE INDEX IF NOT EXISTS permissions_user_company_idx ON permissions ("userId", "companyId");

CREATE TABLE IF NOT EXISTS role_permissions (
  id           SERIAL PRIMARY KEY,
  role         VARCHAR(50) NOT NULL,
  permission   VARCHAR(100) NOT NULL,
  "companyId"  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_perm_company_uq
  ON role_permissions (role, permission, "companyId") WHERE "companyId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_perm_global_uq
  ON role_permissions (role, permission) WHERE "companyId" IS NULL;

CREATE INDEX IF NOT EXISTS role_permissions_role_company_idx ON role_permissions (role, "companyId");

-- ============================================================
-- 3. AUDIT LOGS — augment existing table with missing columns
-- The existing table has: id, companyId, branchId, userId, action, entity, entityId, before, after, reason, scope, ipAddress, createdAt
-- We add a few missing columns for completeness
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE audit_logs ADD COLUMN "userAgent" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity, "entityId");
CREATE INDEX IF NOT EXISTS audit_logs_company_idx ON audit_logs ("companyId");
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs ("userId");
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs ("createdAt" DESC);

-- ============================================================
-- 4. CHART OF ACCOUNTS (needed for journal entries)
-- ============================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  "nameEn"        VARCHAR(200),
  type            VARCHAR(20) NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  "parentId"      INTEGER REFERENCES chart_of_accounts(id),
  level           INTEGER NOT NULL DEFAULT 1,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "allowPosting"  BOOLEAN NOT NULL DEFAULT TRUE,
  "openingBalance" NUMERIC(15,2) NOT NULL DEFAULT 0,
  "currentBalance" NUMERIC(15,2) NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId", code)
);

CREATE INDEX IF NOT EXISTS chart_of_accounts_company_idx ON chart_of_accounts ("companyId");

-- ============================================================
-- 5. JOURNAL ENTRIES — augment existing table
-- Existing: id, companyId, branchId, ref, description, createdBy, createdAt
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE journal_entries ADD COLUMN date DATE NOT NULL DEFAULT CURRENT_DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN type VARCHAR(30) NOT NULL DEFAULT 'manual'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "sourceType" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "sourceId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "postedBy" INTEGER REFERENCES users(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "postedAt" TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_entries ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS journal_entries_company_idx ON journal_entries ("companyId");
CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries (date);

-- ============================================================
-- 6. JOURNAL LINES — augment existing table
-- Existing: id, journalId, accountCode, debit, credit
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE journal_lines ADD COLUMN "accountId" INTEGER REFERENCES chart_of_accounts(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN description TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "costCenter" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS journal_lines_journal_idx ON journal_lines ("journalId");

-- ============================================================
-- 7. BUDGETS — augment existing table
-- Existing: id, companyId, branchId, accountCode, period, amount, used, createdAt
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE budgets ADD COLUMN name VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "fiscalYear" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "startDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "endDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "totalAmount" NUMERIC(15,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN notes TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "approvedBy" INTEGER REFERENCES users(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "createdBy" INTEGER REFERENCES users(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE budgets ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS budget_lines (
  id             SERIAL PRIMARY KEY,
  "budgetId"     INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  "accountId"    INTEGER REFERENCES chart_of_accounts(id),
  category       VARCHAR(200),
  amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  "spentAmount"  NUMERIC(15,2) NOT NULL DEFAULT 0,
  month          INTEGER CHECK (month BETWEEN 1 AND 12),
  notes          TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS budget_lines_budget_idx ON budget_lines ("budgetId");

-- ============================================================
-- 8. PURCHASE REQUESTS — augment existing table
-- Existing: id, companyId, ref, requestedBy, supplierId, status, totalAmount, notes, approvedBy, approvedAt, createdAt
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE purchase_requests ADD COLUMN "branchId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_requests ADD COLUMN title VARCHAR(300); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_requests ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'normal'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_requests ADD COLUMN "requiredDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_requests ADD COLUMN "rejectionReason" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_requests ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Purchase request items — augment existing table
-- Existing: id, requestId, productId, quantity, unitPrice, totalPrice
DO $$ BEGIN
  BEGIN ALTER TABLE purchase_request_items ADD COLUMN name VARCHAR(300); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_request_items ADD COLUMN unit VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_request_items ADD COLUMN "estimatedPrice" NUMERIC(15,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_request_items ADD COLUMN "actualPrice" NUMERIC(15,2); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_request_items ADD COLUMN notes TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE purchase_request_items ADD COLUMN "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- ============================================================
-- 9. CRM PIPELINE STAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  "nameEn"        VARCHAR(100),
  color           VARCHAR(20),
  "order"         INTEGER NOT NULL DEFAULT 0,
  probability     INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_pipeline_stages_company_idx ON crm_pipeline_stages ("companyId");

-- ============================================================
-- 10. CRM CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "clientId"      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  "opportunityId" INTEGER REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  name            VARCHAR(200) NOT NULL,
  title           VARCHAR(100),
  phone           VARCHAR(30),
  email           VARCHAR(200),
  "isPrimary"     BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contacts_company_idx ON crm_contacts ("companyId");
CREATE INDEX IF NOT EXISTS crm_contacts_client_idx ON crm_contacts ("clientId");

-- ============================================================
-- 11. EMAIL QUEUE — augment existing table
-- Existing: id, companyId, toEmail, recipientName, subject, body, clientId, priority, refType, refId, status, sentAt, scheduledAt, createdAt
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE email_queue ADD COLUMN cc VARCHAR(500); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN bcc VARCHAR(500); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN "isHtml" BOOLEAN NOT NULL DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN "lastAttemptAt" TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN "errorMessage" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE email_queue ADD COLUMN metadata JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- ============================================================
-- 12. FLEET INSURANCE — augment existing table
-- Existing: id, companyId, vehicleId, policyNumber, provider, type, startDate, endDate, premium, status, createdAt
-- ============================================================
DO $$ BEGIN
  BEGIN ALTER TABLE fleet_insurance ADD COLUMN "coverageAmount" NUMERIC(15,2); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_insurance ADD COLUMN notes TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_insurance ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS fleet_insurance_vehicle_idx ON fleet_insurance ("vehicleId");
CREATE INDEX IF NOT EXISTS fleet_insurance_expiry_idx ON fleet_insurance ("endDate");

-- ============================================================
-- 13. FLEET VIOLATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS fleet_violations (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "vehicleId"     INTEGER REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
  "driverId"      INTEGER REFERENCES fleet_drivers(id) ON DELETE SET NULL,
  "violationType" VARCHAR(100) NOT NULL,
  description     TEXT,
  "violationDate" DATE NOT NULL,
  location        VARCHAR(300),
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'disputed')),
  "paidAt"        TIMESTAMPTZ,
  "referenceNumber" VARCHAR(100),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fleet_violations_vehicle_idx ON fleet_violations ("vehicleId");
CREATE INDEX IF NOT EXISTS fleet_violations_company_idx ON fleet_violations ("companyId");

-- ============================================================
-- 14. PROPERTY BUILDINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS property_buildings (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  address         TEXT,
  city            VARCHAR(100),
  type            VARCHAR(50),
  "totalUnits"    INTEGER NOT NULL DEFAULT 0,
  "occupiedUnits" INTEGER NOT NULL DEFAULT 0,
  "totalArea"     NUMERIC(12,2),
  "yearBuilt"     INTEGER,
  "purchasePrice" NUMERIC(15,2),
  "currentValue"  NUMERIC(15,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  notes           TEXT,
  "managerId"     INTEGER REFERENCES employees(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS property_buildings_company_idx ON property_buildings ("companyId");

-- ============================================================
-- 15. LEAVE BALANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "leaveTypeId"   INTEGER NOT NULL REFERENCES hr_leave_types(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  entitled        NUMERIC(5,1) NOT NULL DEFAULT 0,
  used            NUMERIC(5,1) NOT NULL DEFAULT 0,
  pending         NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried         NUMERIC(5,1) NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("employeeId", "leaveTypeId", year)
);

CREATE INDEX IF NOT EXISTS leave_balances_employee_idx ON leave_balances ("employeeId");
CREATE INDEX IF NOT EXISTS leave_balances_company_idx ON leave_balances ("companyId");

-- ============================================================
-- 16. EMPLOYEE DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_documents (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  name            VARCHAR(300) NOT NULL,
  number          VARCHAR(100),
  "issueDate"     DATE,
  "expiryDate"    DATE,
  "fileUrl"       TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expired', 'expiring_soon')),
  notes           TEXT,
  "uploadedBy"    INTEGER REFERENCES users(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_documents_employee_idx ON employee_documents ("employeeId");
CREATE INDEX IF NOT EXISTS employee_documents_expiry_idx ON employee_documents ("expiryDate");
CREATE INDEX IF NOT EXISTS employee_documents_company_idx ON employee_documents ("companyId");

-- ============================================================
-- 17. STOCK TRANSFERS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_transfers (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ref             VARCHAR(50) NOT NULL,
  "fromBranchId"  INTEGER,
  "toBranchId"    INTEGER,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'received', 'cancelled')),
  "requestedBy"   INTEGER REFERENCES users(id),
  "approvedBy"    INTEGER REFERENCES users(id),
  "receivedBy"    INTEGER REFERENCES users(id),
  "approvedAt"    TIMESTAMPTZ,
  "receivedAt"    TIMESTAMPTZ,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_transfers_company_idx ON stock_transfers ("companyId");

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id              SERIAL PRIMARY KEY,
  "transferId"    INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  "productId"     INTEGER NOT NULL REFERENCES warehouse_products(id),
  "requestedQty"  NUMERIC(12,3) NOT NULL DEFAULT 0,
  "sentQty"       NUMERIC(12,3) NOT NULL DEFAULT 0,
  "receivedQty"   NUMERIC(12,3) NOT NULL DEFAULT 0,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON stock_transfer_items ("transferId");

-- ============================================================
-- 18. SALARY COMPONENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_components (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  "nameEn"        VARCHAR(200),
  type            VARCHAR(20) NOT NULL CHECK (type IN ('earning', 'deduction', 'benefit')),
  "calculationType" VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK ("calculationType" IN ('fixed', 'percentage', 'formula')),
  value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  formula         TEXT,
  "isTaxable"     BOOLEAN NOT NULL DEFAULT TRUE,
  "isGosi"        BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "order"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS salary_components_company_idx ON salary_components ("companyId");

-- ============================================================
-- 19. DEDUCTION RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS deduction_rules (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  type            VARCHAR(30) NOT NULL CHECK (type IN ('late', 'absence', 'early_leave', 'custom')),
  "calculationType" VARCHAR(20) NOT NULL DEFAULT 'per_hour' CHECK ("calculationType" IN ('per_hour', 'per_day', 'fixed', 'percentage')),
  value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  "graceMinutes"  INTEGER NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deduction_rules_company_idx ON deduction_rules ("companyId");

-- ============================================================
-- 20. EXPENSE CLAIMS
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_claims (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"      INTEGER,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id),
  ref             VARCHAR(50),
  title           VARCHAR(300) NOT NULL,
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  category        VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  "receiptUrl"    TEXT,
  "expenseDate"   DATE NOT NULL DEFAULT CURRENT_DATE,
  "approvedBy"    INTEGER REFERENCES users(id),
  "approvedAt"    TIMESTAMPTZ,
  "paidAt"        TIMESTAMPTZ,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expense_claims_company_idx ON expense_claims ("companyId");
CREATE INDEX IF NOT EXISTS expense_claims_employee_idx ON expense_claims ("employeeId");
CREATE INDEX IF NOT EXISTS expense_claims_status_idx ON expense_claims (status);

-- ============================================================
-- 21. FIXED ASSETS
-- ============================================================
CREATE TABLE IF NOT EXISTS fixed_assets (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"      INTEGER,
  name            VARCHAR(300) NOT NULL,
  code            VARCHAR(50),
  category        VARCHAR(100),
  "purchaseDate"  DATE,
  "purchasePrice" NUMERIC(15,2) NOT NULL DEFAULT 0,
  "currentValue"  NUMERIC(15,2) NOT NULL DEFAULT 0,
  "salvageValue"  NUMERIC(15,2) NOT NULL DEFAULT 0,
  "usefulLifeYears" INTEGER,
  "depreciationMethod" VARCHAR(30) DEFAULT 'straight_line',
  "accumulatedDepreciation" NUMERIC(15,2) NOT NULL DEFAULT 0,
  location        VARCHAR(200),
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'under_maintenance')),
  "assignedTo"    INTEGER REFERENCES employees(id),
  "serialNumber"  VARCHAR(100),
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fixed_assets_company_idx ON fixed_assets ("companyId");

-- ============================================================
-- 22. QUALITY CHECKS
-- ============================================================
CREATE TABLE IF NOT EXISTS quality_checks (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "productId"     INTEGER REFERENCES warehouse_products(id),
  "movementId"    INTEGER REFERENCES warehouse_movements(id),
  "checkType"     VARCHAR(50) NOT NULL DEFAULT 'incoming',
  result          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'passed', 'failed', 'partial')),
  "checkedBy"     INTEGER REFERENCES employees(id),
  "checkedAt"     TIMESTAMPTZ,
  notes           TEXT,
  "quantityChecked" NUMERIC(12,3),
  "quantityPassed"  NUMERIC(12,3),
  "quantityFailed"  NUMERIC(12,3),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quality_checks_company_idx ON quality_checks ("companyId");

-- ============================================================
-- 23. TRAINING PROGRAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS training_programs (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(300) NOT NULL,
  description     TEXT,
  type            VARCHAR(50),
  provider        VARCHAR(200),
  duration        INTEGER,
  "durationUnit"  VARCHAR(20) DEFAULT 'hours',
  cost            NUMERIC(12,2) NOT NULL DEFAULT 0,
  "startDate"     DATE,
  "endDate"       DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ongoing', 'completed', 'cancelled')),
  "maxParticipants" INTEGER,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_programs_company_idx ON training_programs ("companyId");

CREATE TABLE IF NOT EXISTS training_enrollments (
  id              SERIAL PRIMARY KEY,
  "programId"     INTEGER NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'completed', 'dropped', 'failed')),
  score           NUMERIC(5,2),
  "completedAt"   TIMESTAMPTZ,
  "certificateUrl" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("programId", "employeeId")
);

-- ============================================================
-- 24. PERFORMANCE REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_reviews (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId"    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  "reviewerId"    INTEGER REFERENCES employees(id),
  period          VARCHAR(50),
  "reviewDate"    DATE,
  "overallScore"  NUMERIC(3,1),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'acknowledged')),
  scores          JSONB,
  strengths       TEXT,
  improvements    TEXT,
  goals           TEXT,
  comments        TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS performance_reviews_employee_idx ON performance_reviews ("employeeId");
CREATE INDEX IF NOT EXISTS performance_reviews_company_idx ON performance_reviews ("companyId");

-- ============================================================
-- 25. TICKET ESCALATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_escalations (
  id              SERIAL PRIMARY KEY,
  "ticketId"      INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  "fromLevel"     INTEGER NOT NULL DEFAULT 1,
  "toLevel"       INTEGER NOT NULL DEFAULT 2,
  reason          TEXT,
  "escalatedBy"   INTEGER REFERENCES users(id),
  "escalatedTo"   INTEGER REFERENCES employees(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_escalations_ticket_idx ON ticket_escalations ("ticketId");

-- ============================================================
-- 26. AUGMENT EXISTING TABLES WITH MISSING COLUMNS
-- ============================================================

-- Attendance: some GPS fields already exist (checkInLat, checkInLon, etc.)
DO $$ BEGIN
  BEGIN ALTER TABLE attendance ADD COLUMN "deviceId" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Support tickets: check existing columns
DO $$ BEGIN
  BEGIN ALTER TABLE support_tickets ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE support_tickets ADD COLUMN rating INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE support_tickets ADD COLUMN "ratingComment" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE support_tickets ADD COLUMN "slaBreached" BOOLEAN NOT NULL DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Warehouse movements: FIFO fields
DO $$ BEGIN
  BEGIN ALTER TABLE warehouse_movements ADD COLUMN "batchNumber" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE warehouse_movements ADD COLUMN "expiryDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE warehouse_movements ADD COLUMN "fifoLayerId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE warehouse_movements ADD COLUMN "remainingQty" NUMERIC(12,3); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE warehouse_movements ADD COLUMN "branchId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Employees: extra compliance fields
DO $$ BEGIN
  BEGIN ALTER TABLE employees ADD COLUMN "iqamaNumber" VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "passportNumber" VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "iqamaExpiry" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "passportExpiry" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "gosiNumber" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "bankName" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "bankAccount" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "iban" VARCHAR(34); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "emergencyContact" VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE employees ADD COLUMN "emergencyPhone" VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- CRM opportunities: pipeline and extra fields
DO $$ BEGIN
  BEGIN ALTER TABLE crm_opportunities ADD COLUMN "pipelineStageId" INTEGER REFERENCES crm_pipeline_stages(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE crm_opportunities ADD COLUMN "nextFollowUp" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE crm_opportunities ADD COLUMN competitors TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE crm_opportunities ADD COLUMN tags TEXT[]; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Property units: link to building
DO $$ BEGIN
  BEGIN ALTER TABLE property_units ADD COLUMN "buildingId" INTEGER REFERENCES property_buildings(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE property_units ADD COLUMN features TEXT[]; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Invoices: extra fields (some already exist: branchId, subtotal)
DO $$ BEGIN
  BEGIN ALTER TABLE invoices ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'SAR'; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE invoices ADD COLUMN "paymentTerms" VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE invoices ADD COLUMN "poNumber" VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE invoices ADD COLUMN "discountAmount" NUMERIC(15,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE invoices ADD COLUMN "discountPercent" NUMERIC(5,2) NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE invoices ADD COLUMN "journalEntryId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Fleet vehicles: service tracking (many already exist)
DO $$ BEGIN
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "lastServiceDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "nextServiceDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE fleet_vehicles ADD COLUMN "fuelCapacity" NUMERIC(8,2); EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- ============================================================
-- 27. SEED DEFAULT ROLE PERMISSIONS
-- ============================================================
INSERT INTO role_permissions (role, permission, "companyId")
VALUES
  -- Owner: wildcard
  ('owner', '*', NULL),

  -- Admin: full access
  ('admin', 'employees:*', NULL),
  ('admin', 'hr:*', NULL),
  ('admin', 'finance:*', NULL),
  ('admin', 'invoices:*', NULL),
  ('admin', 'clients:*', NULL),
  ('admin', 'crm:*', NULL),
  ('admin', 'fleet:*', NULL),
  ('admin', 'warehouse:*', NULL),
  ('admin', 'properties:*', NULL),
  ('admin', 'legal:*', NULL),
  ('admin', 'projects:*', NULL),
  ('admin', 'support:*', NULL),
  ('admin', 'tasks:*', NULL),
  ('admin', 'reports:*', NULL),
  ('admin', 'settings:read', NULL),
  ('admin', 'settings:write', NULL),
  ('admin', 'permissions:read', NULL),
  ('admin', 'permissions:write', NULL),
  ('admin', 'audit:read', NULL),
  ('admin', 'automation:*', NULL),
  ('admin', 'communications:*', NULL),

  -- Manager: most access
  ('manager', 'employees:read', NULL),
  ('manager', 'employees:write', NULL),
  ('manager', 'hr:*', NULL),
  ('manager', 'finance:read', NULL),
  ('manager', 'invoices:*', NULL),
  ('manager', 'clients:*', NULL),
  ('manager', 'crm:*', NULL),
  ('manager', 'fleet:*', NULL),
  ('manager', 'warehouse:*', NULL),
  ('manager', 'properties:read', NULL),
  ('manager', 'projects:*', NULL),
  ('manager', 'support:*', NULL),
  ('manager', 'tasks:*', NULL),
  ('manager', 'reports:read', NULL),
  ('manager', 'settings:read', NULL),

  -- Employee: limited access
  ('employee', 'hr:attendance', NULL),
  ('employee', 'hr:leave_request', NULL),
  ('employee', 'tasks:read', NULL),
  ('employee', 'tasks:write', NULL),
  ('employee', 'support:read', NULL),
  ('employee', 'support:create', NULL),
  ('employee', 'clients:read', NULL)

ON CONFLICT DO NOTHING;

-- ============================================================
-- 28. DEFAULT SYSTEM SETTINGS
-- ============================================================
INSERT INTO settings (scope, "scopeId", key, value)
VALUES
  ('system', NULL, 'app.name', '"غيث ERP"'),
  ('system', NULL, 'app.locale', '"ar"'),
  ('system', NULL, 'app.currency', '"SAR"'),
  ('system', NULL, 'app.timezone', '"Asia/Riyadh"'),
  ('system', NULL, 'app.vat_rate', '15'),
  ('system', NULL, 'hr.working_hours_per_day', '8'),
  ('system', NULL, 'hr.working_days_per_week', '5'),
  ('system', NULL, 'hr.overtime_multiplier', '1.5'),
  ('system', NULL, 'hr.gosi_employee_rate', '10'),
  ('system', NULL, 'hr.gosi_employer_rate', '12'),
  ('system', NULL, 'attendance.grace_minutes', '15'),
  ('system', NULL, 'invoice.payment_terms_days', '30'),
  ('system', NULL, 'email.max_retry_attempts', '3')
ON CONFLICT DO NOTHING;
