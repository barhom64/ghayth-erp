-- 074_soft_delete_finance_columns.sql
--
-- Phase 9 — Soft-delete schema migrations
--
-- Adds a `deletedAt` TIMESTAMP column to the four finance tables that
-- previously lacked one. The Phase 9 route cleanup (same commit) then
-- filters every SELECT/UPDATE on these tables with `WHERE "deletedAt"
-- IS NULL` so soft-deleted rows cannot be read, mutated, or transitioned
-- through the lifecycle engine.
--
-- Background:
--   • Phase C.7b hardened DELETE handlers with typed errors and guards
--     but the hand-rolled flows were still hard-deletes because the
--     tables had no soft-delete column to set.
--   • Phase 9 upgrades the affected tables so DELETE can become a
--     `SET "deletedAt" = NOW()` semantic flip — identical to how
--     `suppliers`, `invoices`, `journal_entries`, `recurring_journals`,
--     and `projects` are already handled.
--
-- Tables touched:
--   • financial_periods          — close/reopen rows stay addressable
--   • intercompany_transactions  — posted cross-company entries are
--                                  append-only from the outside world,
--                                  but operators can soft-delete
--                                  mistakes without losing the audit
--                                  trail on the paired journal entries.
--   • bank_guarantees            — cancel/release already flip the
--                                  status column; DELETE remains as a
--                                  physical-record remove for accidentally-
--                                  created rows, but it now soft-deletes
--                                  so the paired journal entries stay
--                                  traceable back to the original row.
--   • budget_approval_requests   — approval trail is rare and low-volume
--                                  but historically it had no audit
--                                  column at all, so we add deletedAt
--                                  alongside a plain updatedAt for
--                                  consistency with every other table
--                                  the Phase 8 lifecycle engine touches.
--
-- `projects` is deliberately NOT listed: it already carries a deletedAt
-- column (added in an earlier migration) and its canonical route file
-- (`routes/projects.ts`) already filters correctly. Phase 9 only
-- touches it via the helper routes living in finance-hardening.ts.
--
-- Idempotency: every column addition uses `ADD COLUMN IF NOT EXISTS` so
-- re-running the migration is a no-op. Indexes are wrapped the same way.

BEGIN;

-- financial_periods -----------------------------------------------------------
ALTER TABLE financial_periods
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_financial_periods_deleted_at
  ON financial_periods ("deletedAt")
  WHERE "deletedAt" IS NULL;

-- intercompany_transactions ---------------------------------------------------
ALTER TABLE intercompany_transactions
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_intercompany_transactions_deleted_at
  ON intercompany_transactions ("deletedAt")
  WHERE "deletedAt" IS NULL;

-- bank_guarantees -------------------------------------------------------------
ALTER TABLE bank_guarantees
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_bank_guarantees_deleted_at
  ON bank_guarantees ("deletedAt")
  WHERE "deletedAt" IS NULL;

-- budget_approval_requests ----------------------------------------------------
-- This table was created on-demand by ensureBudgetApprovalTable() at runtime
-- rather than via a migration, so it may or may not exist when this runs.
-- Gate the whole block behind a `to_regclass` check so the migration is a
-- no-op on databases where the table was never created.
DO $$
BEGIN
  IF to_regclass('public.budget_approval_requests') IS NOT NULL THEN
    -- Add the missing updatedAt column alongside deletedAt so the lifecycle
    -- engine can drop its `skipUpdatedAt: true` workaround in a future phase.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'budget_approval_requests' AND column_name = 'deletedAt'
    ) THEN
      ALTER TABLE budget_approval_requests ADD COLUMN "deletedAt" TIMESTAMP;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'budget_approval_requests' AND column_name = 'updatedAt'
    ) THEN
      ALTER TABLE budget_approval_requests ADD COLUMN "updatedAt" TIMESTAMP DEFAULT NOW();
    END IF;
    CREATE INDEX IF NOT EXISTS idx_budget_approval_requests_deleted_at
      ON budget_approval_requests ("deletedAt")
      WHERE "deletedAt" IS NULL;
  END IF;
END $$;

COMMIT;
