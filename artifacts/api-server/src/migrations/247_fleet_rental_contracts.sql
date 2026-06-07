-- 247_fleet_rental_contracts.sql
--
-- WHAT:    add `fleet_rental_contracts` + `fleet_rental_payments` —
--          minimal model for "rent a vehicle to a customer" (the gap
--          N5 in CRITICAL_DEFECTS_REPORT.md). Mirrors the rental_
--          contracts shape on the properties side: contract row +
--          payment schedule + lifecycle status.
--
-- WHY:     pre-fix, fleet only modelled internal trips. No way to
--          rent a vehicle to an external customer (taxi co, daily
--          rental, leasing). A manager wanting to do that had no
--          entity, no GL revenue line, no expiry alert.
--
-- TABLES:
--   fleet_rental_contracts: vehicleId + clientId + start/end dates +
--     ref (numbering-issued) + dailyRate + totalAmount + securityDeposit
--     + paymentTerms + status (draft/active/completed/cancelled)
--   fleet_rental_payments: contractId + dueDate + amount + paidAmount
--     + paidDate + method + status (pending/paid/overdue)
--
-- SAFETY:  pure additive migration. No existing tables touched.
--
-- @rollback: BEGIN;
--              DROP TABLE IF EXISTS fleet_rental_payments;
--              DROP TABLE IF EXISTS fleet_rental_contracts;
--            COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_rental_contracts (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "branchId"          INTEGER,
  ref                 VARCHAR(80),
  "vehicleId"         INTEGER NOT NULL,
  "clientId"          INTEGER NOT NULL,
  "startDate"         DATE NOT NULL,
  "endDate"           DATE,
  "dailyRate"         NUMERIC(12,2),
  "totalAmount"       NUMERIC(15,2),
  "securityDeposit"   NUMERIC(12,2) DEFAULT 0,
  "paymentTerms"      VARCHAR(40) DEFAULT 'monthly',
  status              VARCHAR(20) DEFAULT 'draft' NOT NULL,
  notes               TEXT,
  "createdBy"         INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ,
  CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  CHECK ("paymentTerms" IN ('daily', 'weekly', 'monthly', 'quarterly', 'one_time'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_rental_contracts_vehicle
  ON fleet_rental_contracts ("companyId", "vehicleId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_rental_contracts_client
  ON fleet_rental_contracts ("companyId", "clientId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_rental_contracts_active
  ON fleet_rental_contracts ("companyId", "endDate")
  WHERE "deletedAt" IS NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS fleet_rental_payments (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "contractId"        INTEGER NOT NULL,
  "dueDate"           DATE NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  "paidAmount"        NUMERIC(12,2) DEFAULT 0,
  "paidDate"          DATE,
  method              VARCHAR(30),
  status              VARCHAR(20) DEFAULT 'pending' NOT NULL,
  "journalEntryId"    INTEGER,
  notes               TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'partial', 'paid', 'overdue'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_rental_payments_contract
  ON fleet_rental_payments ("companyId", "contractId", "dueDate");

CREATE INDEX IF NOT EXISTS idx_fleet_rental_payments_overdue
  ON fleet_rental_payments ("companyId", "dueDate")
  WHERE status IN ('pending', 'partial');

COMMIT;
