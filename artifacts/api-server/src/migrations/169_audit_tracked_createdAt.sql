-- Migration 169: add missing createdAt columns on 4 audit-tracked tables
-- Surfaced by audit/system-review (modeling-no-createdAt category).
-- Without createdAt these tables can't participate in time-windowed
-- reports, age computation, or audit timelines. All four are referenced
-- by finance/HR aggregations that already assume a creation timestamp
-- exists somewhere on the row.

ALTER TABLE hr_leave_balances
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT now();

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT now();

ALTER TABLE payroll_lines
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT now();

ALTER TABLE approval_chain_steps
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT now();
