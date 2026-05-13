-- Migration 170: create vendor_contracts table
--
-- The weekly cron `vendorContractExpiryAlerts` (cronScheduler.ts:2403)
-- has been querying vendor_contracts since launch, but the table was
-- never defined in any schema dump or earlier migration. The cron
-- handler swallows the resulting "relation does not exist" error in a
-- .catch() block and returns an empty array, so the failure is silent
-- — no alerts ever fire and the cron logs as successful.
--
-- Columns mirror exactly what the cron query reads:
--   vc."endDate"     — date the contract expires (alert threshold)
--   vc.status        — only 'active' contracts are alerted on
--   vc."vendorId"    — JOIN target onto suppliers.id
--   vc.title         — used in the notification title
--   vc."companyId"   — tenant scoping (every cron query filters by it)
--
-- Plus the standard audit columns (createdAt/updatedAt) and a soft-delete
-- column (deletedAt) for consistency with neighbouring tables.
--
-- Indexes:
--   1. (companyId, status, endDate) — exact shape of the cron WHERE clause
--   2. (vendorId) — JOIN performance from the suppliers side

CREATE TABLE IF NOT EXISTS vendor_contracts (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "vendorId" INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  "startDate" DATE,
  "endDate" DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'terminated', 'pending')),
  "contractValue" NUMERIC(15, 2),
  currency VARCHAR(3) DEFAULT 'SAR',
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_expiry
  ON vendor_contracts ("companyId", status, "endDate")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_vendor
  ON vendor_contracts ("vendorId")
  WHERE "deletedAt" IS NULL;
