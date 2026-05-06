-- Migration 118: Add indexes on frequently-joined FK columns that were missing indexes.
-- Idempotent — CREATE INDEX IF NOT EXISTS.

-- employee_assignments
CREATE INDEX IF NOT EXISTS idx_employee_assignments_branch ON employee_assignments ("branchId");
CREATE INDEX IF NOT EXISTS idx_employee_assignments_department ON employee_assignments ("departmentId");
CREATE INDEX IF NOT EXISTS idx_employee_assignments_jobtitle ON employee_assignments ("jobTitleId");

-- journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_approved_by ON journal_entries ("approvedBy");
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_by ON journal_entries ("postedBy");

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices ("branchId");

-- purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON purchase_orders ("branchId");
CREATE INDEX IF NOT EXISTS idx_purchase_orders_request ON purchase_orders ("requestId");
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders ("supplierId");

-- support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_invoice ON support_tickets ("invoiceId");

-- fleet_trips
CREATE INDEX IF NOT EXISTS idx_fleet_trips_client ON fleet_trips ("clientId");
