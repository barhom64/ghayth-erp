-- Phase 2 finance overhaul: opening balances, recurring journals,
-- journal reversal linkage, and year-end close tracking.

-- 1) Journal reversal linkage columns on journal_entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "reversalOfId" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "reversedById" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal_of
  ON journal_entries ("reversalOfId") WHERE "reversalOfId" IS NOT NULL;

-- 2) Year-end close flag on financial_periods
ALTER TABLE financial_periods
  ADD COLUMN IF NOT EXISTS "yearEndClosed" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "yearEndClosedAt" TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS "yearEndClosingJournalId" INTEGER NULL;

-- 3) Recurring journals table
CREATE TABLE IF NOT EXISTS recurring_journals (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  frequency       VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  "startDate"     DATE NOT NULL,
  "nextRunDate"   DATE NOT NULL,
  "lastRunDate"   DATE NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  "templateLines" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "templateRef"   VARCHAR(100) NULL,
  "templateDescription" TEXT NULL,
  "createdBy"     INTEGER NULL,
  "runsCount"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_journals_company
  ON recurring_journals ("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_journals_next_run
  ON recurring_journals ("nextRunDate") WHERE active = TRUE AND "deletedAt" IS NULL;

-- 4) History of recurring journal runs
CREATE TABLE IF NOT EXISTS recurring_journal_runs (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL,
  "recurringJournalId"  INTEGER NOT NULL REFERENCES recurring_journals(id) ON DELETE CASCADE,
  "journalEntryId"      INTEGER NULL,
  "runDate"             DATE NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'success',
  error                 TEXT NULL,
  "triggeredBy"         VARCHAR(20) NOT NULL DEFAULT 'scheduler',
  "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_journal_runs_parent
  ON recurring_journal_runs ("recurringJournalId");
