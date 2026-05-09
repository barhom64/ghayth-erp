-- Migration 084: Add missing updatedAt columns and CHECK constraints on status columns
-- Fully idempotent — safe to re-run.
-- IMPORTANT: DROP old constraints first to avoid dual-constraint conflicts.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add updatedAt TIMESTAMPTZ DEFAULT NOW() to tables that are missing it
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE departments ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE employee_shift_assignments ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hr_leave_types ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE salary_components ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHECK constraints on status columns
--    DROP old schema.sql constraints first, then add comprehensive ones.
-- ═══════════════════════════════════════════════════════════════════════════

-- employees.status
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_status_check;
DO $$ BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT chk_employees_status
    CHECK (status IN ('active','inactive','terminated','on_leave','suspended'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- invoices.status
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
DO $$ BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT chk_invoices_status
    CHECK (status IN ('draft','pending_approval','approved','sent','partial','partially_paid','paid','overdue','void','rejected','cancelled','returned','delivered','ordered','posted','closed','invoiced'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- purchase_orders.status
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS chk_purchase_orders_status;
DO $$ BEGIN
  ALTER TABLE purchase_orders
    ADD CONSTRAINT chk_purchase_orders_status
    CHECK (status IN ('draft','pending','pending_approval','approved','rejected','returned','received','partially_received','partial_received','cancelled','completed','paid','confirmed','ordered','delivered','sent','invoice_matched'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- hr_leave_requests.status
ALTER TABLE hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_status_check;
ALTER TABLE hr_leave_requests DROP CONSTRAINT IF EXISTS chk_hr_leave_requests_status;
DO $$ BEGIN
  ALTER TABLE hr_leave_requests
    ADD CONSTRAINT chk_hr_leave_requests_status
    CHECK (status IN ('pending','stage1_approved','approved','rejected','cancelled','returned','completed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- training_programs.status
ALTER TABLE training_programs DROP CONSTRAINT IF EXISTS training_programs_status_check;
DO $$ BEGIN
  ALTER TABLE training_programs
    ADD CONSTRAINT chk_training_programs_status
    CHECK (status IN ('planned','upcoming','active','completed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
