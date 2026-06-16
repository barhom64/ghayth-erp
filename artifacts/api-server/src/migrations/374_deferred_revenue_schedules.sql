-- 374_deferred_revenue_schedules.sql
-- FIN-DEFERRED-REVENUE (#2248) — deferred-revenue recognition engine storage.
--
-- The SYMMETRIC counterpart of the prepaid-amortization engine (#2247). Where
-- prepaid amortization turns a prepaid ASSET into systematic EXPENSE, deferred
-- revenue turns a deferred-revenue LIABILITY (cash received up front for rent /
-- umrah / service not yet earned) into systematic REVENUE via balanced journals:
--
--     DR  <deferred-revenue liability>   monthlyAmount   (liability drawn down)
--     CR  <revenue account>              monthlyAmount   (P&L — revenue earned)
--
-- This is the OPPOSITE direction of amortization. Each schedule stores its
-- revenue side as a `revenueAccountPurpose` (TEXT) — NEVER a final GL code;
-- the engine resolves it at posting time. The deferred-revenue (liability)
-- side IS a stored accountCode (the account debited down), mirroring how the
-- prepaid engine stores its prepaid-asset account code.
--
-- The child `deferred_revenue_postings` table is the no-double-recognition
-- guard: UNIQUE(companyId,scheduleId,periodYm) means a month can post at most
-- once. Both tables carry their own companyId for tenant isolation.
--
-- Additive, idempotent, reversible, above the dump baseline cutoff (297),
-- sequential prefix (max on main is 373 → this is 374).
--
-- @rollback: DROP TABLE IF EXISTS deferred_revenue_postings; DROP TABLE IF EXISTS deferred_revenue_schedules;

CREATE TABLE IF NOT EXISTS deferred_revenue_schedules (
  id                          SERIAL PRIMARY KEY,
  "companyId"                 INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                  INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  -- 'rent' | 'umrah' | 'service' | 'manual'
  "sourceType"                TEXT,
  "sourceId"                  INTEGER,
  -- the deferred-revenue LIABILITY account debited down each month (stored GL code).
  "deferredRevenueAccountCode" TEXT NOT NULL,
  -- the revenue side PURPOSE (resolved to a real account by the engine).
  -- TEXT purpose ONLY — never a final GL code stored as the decision.
  "revenueAccountPurpose"     TEXT NOT NULL,
  "totalAmount"               NUMERIC(14,2) NOT NULL,
  "startDate"                 DATE NOT NULL,
  "endDate"                   DATE NOT NULL,
  "recognitionMethod"         TEXT NOT NULL DEFAULT 'straight_line',
  "months"                    INTEGER NOT NULL,
  "monthlyAmount"             NUMERIC(14,2) NOT NULL,
  "recognizedAmount"          NUMERIC(14,2) NOT NULL DEFAULT 0,
  "remainingAmount"           NUMERIC(14,2),
  -- 'active' | 'completed' | 'cancelled'
  status                      TEXT NOT NULL DEFAULT 'active',
  -- dimension columns carried onto every recognition JE.
  "propertyId"                INTEGER,
  "unitId"                    INTEGER,
  "contractId"                INTEGER,
  "umrahSeasonId"             INTEGER,
  "umrahAgentId"              INTEGER,
  "clientId"                  INTEGER,
  "costCenterId"              INTEGER,
  "currency"                  TEXT DEFAULT 'SAR',
  "createdAt"                 TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"                 TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deferred_rev_sched_company_status
  ON deferred_revenue_schedules ("companyId", status)
  WHERE "deletedAt" IS NULL;

-- child idempotency / posting-ledger table.
CREATE TABLE IF NOT EXISTS deferred_revenue_postings (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "scheduleId"  INTEGER NOT NULL REFERENCES deferred_revenue_schedules(id) ON DELETE CASCADE,
  "periodYm"    TEXT NOT NULL,            -- 'YYYY-MM'
  "journalId"   INTEGER,
  "amount"      NUMERIC(14,2),
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- no-double-recognition guard: one posting per (company, schedule, month).
CREATE UNIQUE INDEX IF NOT EXISTS idx_deferred_rev_posting_unique
  ON deferred_revenue_postings ("companyId", "scheduleId", "periodYm");
