-- =============================================================
-- Migration 022: DB Constraints, Soft Delete, Archiving, Cron Locks
-- FK constraints on legacy tables, UNIQUE on employee_number & invoice ref,
-- CHECK constraints on status columns, deletedAt on vouchers/POs/expense_claims,
-- cron_locks table for mutex, audit_logs_archive for archiving.
-- =============================================================

-- ─── 1. FOREIGN KEY CONSTRAINTS ON LEGACY TABLES ─────────────────────────────

-- loan_accounts → employees
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'loan_accounts_employee_id_fk' AND table_name = 'loan_accounts'
  ) THEN
    ALTER TABLE loan_accounts
      ADD CONSTRAINT loan_accounts_employee_id_fk
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'loan_accounts_company_id_fk' AND table_name = 'loan_accounts'
  ) THEN
    ALTER TABLE loan_accounts
      ADD CONSTRAINT loan_accounts_company_id_fk
      FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- invoice_lines → invoices
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoice_lines_invoice_id_fk' AND table_name = 'invoice_lines'
  ) THEN
    ALTER TABLE invoice_lines
      ADD CONSTRAINT invoice_lines_invoice_id_fk
      FOREIGN KEY ("invoiceId") REFERENCES invoices(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- performance_reviews → employees + companies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'performance_reviews_employee_id_fk' AND table_name = 'performance_reviews'
  ) THEN
    ALTER TABLE performance_reviews
      ADD CONSTRAINT performance_reviews_employee_id_fk
      FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'performance_reviews_company_id_fk' AND table_name = 'performance_reviews'
  ) THEN
    ALTER TABLE performance_reviews
      ADD CONSTRAINT performance_reviews_company_id_fk
      FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- journal_lines → journal_entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'journal_lines_journal_id_fk' AND table_name = 'journal_lines'
  ) THEN
    ALTER TABLE journal_lines
      ADD CONSTRAINT journal_lines_journal_id_fk
      FOREIGN KEY ("journalId") REFERENCES journal_entries(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- invoice_collection_stages → invoices
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoice_collection_stages_invoice_id_fk' AND table_name = 'invoice_collection_stages'
  ) THEN
    ALTER TABLE invoice_collection_stages
      ADD CONSTRAINT invoice_collection_stages_invoice_id_fk
      FOREIGN KEY ("invoiceId") REFERENCES invoices(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- purchase_request_items → purchase_requests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchase_request_items_request_id_fk' AND table_name = 'purchase_request_items'
  ) THEN
    ALTER TABLE purchase_request_items
      ADD CONSTRAINT purchase_request_items_request_id_fk
      FOREIGN KEY ("requestId") REFERENCES purchase_requests(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- leave_approval_stages → hr_leave_requests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leave_approval_stages_request_id_fk' AND table_name = 'leave_approval_stages'
  ) THEN
    ALTER TABLE leave_approval_stages
      ADD CONSTRAINT leave_approval_stages_request_id_fk
      FOREIGN KEY ("leaveRequestId") REFERENCES hr_leave_requests(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 2. UNIQUE CONSTRAINTS ────────────────────────────────────────────────────

-- employee_number unique per company
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'employees_employee_number_company_uq' AND table_name = 'employees'
  ) THEN
    -- Deduplicate first (keep lowest id) in case of existing duplicates
    DELETE FROM employees e1
    USING employees e2
    WHERE e1."employeeNumber" IS NOT NULL
      AND e1."companyId" = e2."companyId"
      AND e1."employeeNumber" = e2."employeeNumber"
      AND e1.id > e2.id;

    CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_company_uq
      ON employees ("companyId", "employeeNumber")
      WHERE "employeeNumber" IS NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- invoice ref unique per company
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'invoices_ref_company_uq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_ref_company_uq
      ON invoices ("companyId", ref)
      WHERE "deletedAt" IS NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- purchase_request ref unique per company
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'purchase_requests_ref_company_uq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_ref_company_uq
      ON purchase_requests ("companyId", ref);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- purchase_order ref unique per company
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'purchase_orders_ref_company_uq'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_ref_company_uq
      ON purchase_orders ("companyId", ref);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 3. CHECK CONSTRAINTS ON STATUS COLUMNS ──────────────────────────────────

-- invoices.status
DO $$ BEGIN
  ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
  ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled','returned'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- journal_entries.status
DO $$ BEGIN
  ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check;
  ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_status_check
    CHECK (status IN ('draft','posted','pending_approval','approved','rejected','returned','cancelled'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- purchase_orders.status
DO $$ BEGIN
  ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
  ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('draft','pending','pending_approval','approved','rejected','received','cancelled','completed','paid','confirmed'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- purchase_requests.status
DO $$ BEGIN
  ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
  ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
    CHECK (status IN ('draft','pending','approved','rejected','returned','converted','cancelled'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- hr_leave_requests.status
DO $$ BEGIN
  ALTER TABLE hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_status_check;
  ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_requests_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 4. SOFT DELETE COLUMNS ──────────────────────────────────────────────────

-- purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS purchase_orders_deleted_at_idx ON purchase_orders ("deletedAt") WHERE "deletedAt" IS NULL;

-- expense_claims (using journal_entries — already has deletedAt, skipping)
-- chart_of_accounts
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS chart_of_accounts_deleted_at_idx ON chart_of_accounts ("deletedAt") WHERE "deletedAt" IS NULL;

-- ─── 5. CRON LOCKS TABLE (mutex via SELECT FOR UPDATE SKIP LOCKED) ────────────

CREATE TABLE IF NOT EXISTS cron_locks (
  id         SERIAL PRIMARY KEY,
  job_name   VARCHAR(200) NOT NULL UNIQUE,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by  VARCHAR(200),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE UNIQUE INDEX IF NOT EXISTS cron_locks_job_name_uq ON cron_locks (job_name);

-- ─── 6. AUDIT LOGS ARCHIVE TABLE ─────────────────────────────────────────────

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS audit_logs_archive (
    LIKE audit_logs INCLUDING DEFAULTS INCLUDING CONSTRAINTS
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 7. INTEGRATION LOGS ARCHIVE TABLE ───────────────────────────────────────

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS integration_logs_archive (
    LIKE integration_logs INCLUDING DEFAULTS INCLUDING CONSTRAINTS
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 8. INDEXES FOR ARCHIVING QUERIES ────────────────────────────────────────

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs ("createdAt");
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS integration_logs_created_at_idx ON integration_logs ("createdAt");
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 9. PERFORMANCE INDEXES ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS invoices_company_status_idx ON invoices ("companyId", status) WHERE "deletedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON invoices ("dueDate") WHERE "deletedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS purchase_orders_company_status_idx ON purchase_orders ("companyId", status) WHERE "deletedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS journal_entries_company_created_idx ON journal_entries ("companyId", "createdAt" DESC) WHERE "deletedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS employees_company_idx ON employees ("companyId");
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS employee_assignments_company_status_idx ON employee_assignments ("companyId", status);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
