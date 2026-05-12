-- Add missing companyId indexes to high-traffic tenant-scoped tables.
-- Every query filters by companyId for tenant isolation; without an index
-- the DB falls back to sequential scans on large tables.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_companyid ON attendance ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budgets_companyid ON budgets ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_companyid ON clients ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_opportunities_companyid ON crm_opportunities ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fleet_vehicles_companyid ON fleet_vehicles ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_contracts_companyid ON legal_contracts ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rental_contracts_companyid ON rental_contracts ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shifts_companyid ON shifts ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suppliers_companyid ON suppliers ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_requests_companyid ON approval_requests ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_chains_companyid ON approval_chains ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chart_of_accounts_companyid ON chart_of_accounts ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_correspondence_companyid ON correspondence ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cost_centers_companyid ON cost_centers ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_companyid ON departments ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_branches_companyid ON branches ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budget_approval_requests_companyid ON budget_approval_requests ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_overtime_requests_companyid ON hr_overtime_requests ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_runs_companyid ON payroll_runs ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_companyid ON audit_logs ("companyId");
