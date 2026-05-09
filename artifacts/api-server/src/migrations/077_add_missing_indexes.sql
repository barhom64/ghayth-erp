-- Migration 077: Add missing indexes on frequently queried columns
-- Improves query performance for common filters: status, companyId, branchId

-- ── employees ─────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.employees') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employees_company ON public."employees" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employees') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employees_status ON public."employees" ("status")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employees') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='branchId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employees_branch ON public."employees" ("branchId")';
  END IF;
END $migr$;

-- ── employee_assignments ──────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.employee_assignments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_assignments' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_assignments_company ON public."employee_assignments" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_assignments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_assignments' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_assignments_status ON public."employee_assignments" ("status")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_assignments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_assignments' AND column_name='employeeId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_assignments_employee ON public."employee_assignments" ("employeeId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_assignments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_assignments' AND column_name='branchId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_assignments_branch ON public."employee_assignments" ("branchId")';
  END IF;
END $migr$;

-- ── hr_leave_requests ─────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.hr_leave_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_requests' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_company ON public."hr_leave_requests" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_leave_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_requests' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON public."hr_leave_requests" ("status")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_leave_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_requests' AND column_name='employeeId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_employee ON public."hr_leave_requests" ("employeeId")';
  END IF;
END $migr$;

-- ── approval_requests ─────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='approval_requests' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_approval_requests_company ON public."approval_requests" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='approval_requests' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public."approval_requests" ("status")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='approval_requests' AND column_name='companyId') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='approval_requests' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status ON public."approval_requests" ("companyId","status")';
  END IF;
END $migr$;

-- ── invoices ──────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_company ON public."invoices" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_status ON public."invoices" ("status")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='clientId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_client ON public."invoices" ("clientId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='dueDate') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public."invoices" ("dueDate")';
  END IF;
END $migr$;

-- ── clients ───────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.clients') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company ON public."clients" ("companyId")';
  END IF;
END $migr$;

-- ── tasks ─────────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.tasks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_company ON public."tasks" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.tasks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_status ON public."tasks" ("status")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.tasks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='assignedToId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public."tasks" ("assignedToId")';
  END IF;
END $migr$;

-- ── projects ──────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_company ON public."projects" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_status ON public."projects" ("status")';
  END IF;
END $migr$;

-- ── vehicles ──────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.vehicles') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vehicles_company ON public."vehicles" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.vehicles') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public."vehicles" ("status")';
  END IF;
END $migr$;

-- ── salary_advances ───────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.salary_advances') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salary_advances' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_salary_advances_company ON public."salary_advances" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.salary_advances') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='salary_advances' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON public."salary_advances" ("status")';
  END IF;
END $migr$;

-- ── custodies ─────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.custodies') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='custodies' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_custodies_company ON public."custodies" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.custodies') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='custodies' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_custodies_status ON public."custodies" ("status")';
  END IF;
END $migr$;

-- ── expenses ──────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.expenses') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='expenses' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expenses_company ON public."expenses" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.expenses') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='expenses' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expenses_status ON public."expenses" ("status")';
  END IF;
END $migr$;

-- ── purchase_orders ───────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.purchase_orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON public."purchase_orders" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.purchase_orders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public."purchase_orders" ("status")';
  END IF;
END $migr$;

-- ── audit_logs ────────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='entity') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='entityId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public."audit_logs" ("entity","entityId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public."audit_logs" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='createdAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public."audit_logs" ("createdAt")';
  END IF;
END $migr$;

-- ── notifications ─────────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.notifications') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='userId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_user ON public."notifications" ("userId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.notifications') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='userId') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='isRead') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_read ON public."notifications" ("userId","isRead")';
  END IF;
END $migr$;

-- ── support_tickets ───────────────────────────────────────────────
DO $migr$ BEGIN
  IF to_regclass('public.support_tickets') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_tickets' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON public."support_tickets" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.support_tickets') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_tickets' AND column_name='status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public."support_tickets" ("status")';
  END IF;
END $migr$;

-- ── soft-delete partial indexes for common queries ────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='deletedAt') THEN
DO $migr$ BEGIN
  IF to_regclass('public.employees') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employees_active ON public."employees" ("companyId")';
  END IF;
END $migr$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='deletedAt') THEN
DO $migr$ BEGIN
  IF to_regclass('public.invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_active ON public."invoices" ("companyId")';
  END IF;
END $migr$;
  END IF;
END $$;
