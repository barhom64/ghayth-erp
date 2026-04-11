-- Migration 025: Fix invoice status CHECK constraint to include all valid statuses
-- Also apply purchase_orders and hr_leave_requests CHECK constraints safely

-- invoices.status — comprehensive list including approval workflow statuses
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','pending_approval','sent','partial','paid','overdue','cancelled','returned','approved','rejected','delivered','ordered'));

-- purchase_orders.status — must include all statuses used in production data
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft','pending','pending_approval','approved','rejected','received','cancelled','completed','paid','confirmed','ordered','delivered'));

-- hr_leave_requests.status
ALTER TABLE hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_status_check;
ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_requests_status_check
  CHECK (status IN ('pending','approved','rejected','cancelled','returned'));
