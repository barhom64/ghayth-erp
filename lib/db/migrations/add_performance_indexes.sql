-- Performance indexes migration
-- Generated as part of technical debt cleanup (Task #112)
-- These indexes target the most common query patterns across all modules

-- ─── employee_assignments ──────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ea_company_idx ON employee_assignments ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ea_branch_idx ON employee_assignments ("branchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ea_employee_idx ON employee_assignments ("employeeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ea_company_branch_idx ON employee_assignments ("companyId", "branchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ea_status_idx ON employee_assignments (status);

-- ─── attendance ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS att_assignment_idx ON attendance ("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS att_company_idx ON attendance ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS att_date_idx ON attendance (date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS att_company_date_idx ON attendance ("companyId", date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS att_status_idx ON attendance (status);

-- ─── journal_entries ───────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_company_idx ON journal_entries ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_branch_idx ON journal_entries ("branchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_status_idx ON journal_entries (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_created_at_idx ON journal_entries ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_company_branch_idx ON journal_entries ("companyId", "branchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_ref_idx ON journal_entries (ref);
CREATE INDEX CONCURRENTLY IF NOT EXISTS je_deleted_at_idx ON journal_entries ("deletedAt");

-- ─── journal_lines ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS jl_journal_idx ON journal_lines ("journalId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS jl_account_code_idx ON journal_lines ("accountCode");

-- ─── chart_of_accounts ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS coa_company_code_idx ON chart_of_accounts ("companyId", code);

-- ─── invoices ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_company_idx ON invoices ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_status_idx ON invoices (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_client_idx ON invoices ("clientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_company_branch_idx ON invoices ("companyId", "branchId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_due_date_idx ON invoices ("dueDate");
CREATE INDEX CONCURRENTLY IF NOT EXISTS inv_deleted_at_idx ON invoices ("deletedAt");

-- ─── purchase_requests ────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS pr_company_idx ON purchase_requests ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS pr_status_idx ON purchase_requests (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pr_company_branch_idx ON purchase_requests ("companyId", "branchId");

-- ─── purchase_orders ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS po_company_idx ON purchase_orders ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS po_status_idx ON purchase_orders (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS po_supplier_idx ON purchase_orders ("supplierId");

-- ─── suppliers ────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS suppliers_company_idx ON suppliers ("companyId");

-- ─── hr_leave_requests ────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS lr_company_idx ON hr_leave_requests ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS lr_status_idx ON hr_leave_requests (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS lr_employee_idx ON hr_leave_requests ("employeeId");

-- ─── payroll_runs ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS pr_run_company_idx ON payroll_runs ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS pr_run_period_idx ON payroll_runs (period);

-- ─── payroll_lines ────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS pl_run_idx ON payroll_lines ("runId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS pl_assignment_idx ON payroll_lines ("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS pl_employee_idx ON payroll_lines ("employeeId");

-- ─── employee_violations ──────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS viol_company_idx ON employee_violations ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS viol_assignment_idx ON employee_violations ("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS viol_period_idx ON employee_violations (period);

-- ─── approval_chains ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ac_company_idx ON approval_chains ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ac_type_idx ON approval_chains ("chainType");

-- ─── budgets ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS budgets_company_period_idx ON budgets ("companyId", period);

-- ─── clients ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS clients_company_idx ON clients ("companyId");

-- ─── branches ─────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS branches_company_idx ON branches ("companyId");

-- ─── invoice_collection_stages ────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ics_invoice_idx ON invoice_collection_stages ("invoiceId");

-- ─── attendance_deductions ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_company_idx ON attendance_deductions ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_assignment_idx ON attendance_deductions ("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_period_idx ON attendance_deductions (period);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ad_status_idx ON attendance_deductions (status);

-- ─── employee_monthly_attendance ──────────────────────────────────────────────
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ema_assignment_period_idx ON employee_monthly_attendance ("assignmentId", period);
