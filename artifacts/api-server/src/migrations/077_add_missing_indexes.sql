-- Migration 077: Add missing indexes on frequently queried columns
-- Improves query performance for common filters: status, companyId, branchId

-- ── employees ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees("companyId");
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees("branchId");

-- ── employee_assignments ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employee_assignments_company ON employee_assignments("companyId");
CREATE INDEX IF NOT EXISTS idx_employee_assignments_status ON employee_assignments(status);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_employee ON employee_assignments("employeeId");
CREATE INDEX IF NOT EXISTS idx_employee_assignments_branch ON employee_assignments("branchId");

-- ── hr_leave_requests ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_company ON hr_leave_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON hr_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_assignment ON hr_leave_requests("assignmentId");

-- ── approval_requests ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_approval_requests_company ON approval_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status ON approval_requests("companyId", status);

-- ── invoices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices("companyId");
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices("clientId");
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices("dueDate");

-- ── clients ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients("companyId");

-- ── tasks ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks("companyId");
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks("assignedToId");

-- ── projects ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects("companyId");
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ── vehicles ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_company ON vehicles("companyId");
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

-- ── salary_advances ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_salary_advances_company ON salary_advances("companyId");
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON salary_advances(status);

-- ── custodies ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_custodies_company ON custodies("companyId");
CREATE INDEX IF NOT EXISTS idx_custodies_status ON custodies(status);

-- ── expenses ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses("companyId");
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);

-- ── purchase_orders ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders("companyId");
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

-- ── audit_logs ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs("companyId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs("createdAt");

-- ── notifications ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications("userId");
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications("userId", "isRead");

-- ── support_tickets ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets("companyId");
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- ── soft-delete partial indexes for common queries ────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='deletedAt') THEN
    CREATE INDEX IF NOT EXISTS idx_employees_active ON employees("companyId") WHERE "deletedAt" IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='deletedAt') THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_active ON invoices("companyId") WHERE "deletedAt" IS NULL;
  END IF;
END $$;
