-- 373_prepaid_amortization_schedules.sql
-- FIN-TIME-SPREADING (#2247) — prepaid-amortization engine storage.
--
-- Turns a prepaid asset balance (insurance/rent/license/subscription paid up
-- front) into systematic monthly expense via balanced journals. Each schedule
-- stores its expense side as an `expenseAccountPurpose` (TEXT) — NEVER a final
-- GL code; financialEngine.resolveAccountCode resolves it at posting time. The
-- prepaid (asset) side IS a stored accountCode (the account being credited
-- down), mirroring how fixed_assets stores its depreciation account codes.
--
-- The child `prepaid_amortization_postings` table is the no-double-recognition
-- guard: UNIQUE(companyId,scheduleId,periodYm) means a month can post at most
-- once. Both tables carry their own companyId for tenant isolation.
--
-- Additive, idempotent, reversible, above the dump baseline cutoff (297),
-- sequential prefix (max on main is 370 → this is 371).
--
-- @rollback: DROP TABLE IF EXISTS prepaid_amortization_postings; DROP TABLE IF EXISTS prepaid_amortization_schedules;

CREATE TABLE IF NOT EXISTS prepaid_amortization_schedules (
  id                      SERIAL PRIMARY KEY,
  "companyId"             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"             INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  -- 'insurance' | 'rent' | 'license' | 'subscription' | 'manual'
  "sourceType"           TEXT,
  "sourceId"             INTEGER,
  -- the prepaid ASSET account credited down each month (stored GL code).
  "prepaidAccountCode"   TEXT NOT NULL,
  -- the expense side PURPOSE (resolved to a real account by the engine).
  -- TEXT purpose ONLY — never a final GL code stored as the decision.
  "expenseAccountPurpose" TEXT NOT NULL,
  "totalAmount"          NUMERIC(14,2) NOT NULL,
  "startDate"            DATE NOT NULL,
  "endDate"              DATE NOT NULL,
  "months"              INTEGER NOT NULL,
  "monthlyAmount"        NUMERIC(14,2) NOT NULL,
  "recognizedAmount"     NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- 'active' | 'completed' | 'cancelled'
  status                 TEXT NOT NULL DEFAULT 'active',
  -- dimension columns carried onto every amortization JE.
  "vehicleId"            INTEGER,
  "propertyId"           INTEGER,
  "employeeId"           INTEGER,
  "projectId"            INTEGER,
  "costCenterId"         INTEGER,
  "currency"             TEXT DEFAULT 'SAR',
  "createdAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"            TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prepaid_amort_sched_company_status
  ON prepaid_amortization_schedules ("companyId", status)
  WHERE "deletedAt" IS NULL;

-- child idempotency / posting-ledger table.
CREATE TABLE IF NOT EXISTS prepaid_amortization_postings (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "scheduleId"  INTEGER NOT NULL REFERENCES prepaid_amortization_schedules(id) ON DELETE CASCADE,
  "periodYm"    TEXT NOT NULL,            -- 'YYYY-MM'
  "journalId"   INTEGER,
  "amount"      NUMERIC(14,2),
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- no-double-recognition guard: one posting per (company, schedule, month).
CREATE UNIQUE INDEX IF NOT EXISTS idx_prepaid_amort_posting_unique
  ON prepaid_amortization_postings ("companyId", "scheduleId", "periodYm");
