-- 182_reconcile_workflow_requests_drift.sql
-- Reconcile the workflow_requests schema drift that 500s GET /api/finance/financial-requests.
--
-- ROOT CAUSE — `workflow_requests` is created twice, both `CREATE TABLE IF NOT EXISTS`:
--   * 076_missing_system_tables.sql:180  → id, companyId, requestType, title,
--                                          description, status, amount,
--                                          submittedBy, approvedBy, approvedAt,
--                                          createdAt, updatedAt
--   * 107_missing_tables_phase2.sql:161  → id, companyId, entityType, entityId,
--                                          workflowType, status, requestedBy,
--                                          approvedBy, approvedAt, notes,
--                                          deletedAt, createdAt
-- Migrations run in numeric order: 076 creates the table; 107's
-- `CREATE TABLE IF NOT EXISTS` is then a NO-OP, and there is no
-- `ALTER TABLE workflow_requests` anywhere. So the live table carries 076's
-- schema and is missing the columns 107 intended.
--
-- finance-vendors.ts `GET /financial-requests` selects `workflowType`,
-- `entityType`, `notes`, filters `WHERE "deletedAt" IS NULL` / `"entityType"
-- IN (...)`, and joins on `"requestedBy"` — none of which exist on the live
-- table → Postgres `column does not exist` → HTTP 500. The same five columns
-- also unblock the Wave-4 `/financial-requests/:id/approve` lifecycle
-- transition, which operates on `workflow_requests`.
--
-- FIX — add exactly the five columns the financial-requests endpoints
-- reference, as NULLABLE columns. (107 declared `entityType` NOT NULL, but a
-- NOT NULL add on a populated table is unsafe; added nullable — the workflow
-- engine sets these on new inserts.) Idempotent via ADD COLUMN IF NOT EXISTS.
-- No column drop, no table re-create, no ID change, no data-destructive step.
--
-- OUT OF SCOPE (documented residual) — 107 also declares `entityId integer
-- NOT NULL`, likewise absent from the live table. The financial-requests
-- endpoints do not reference `entityId` by name (the detail query uses
-- `wr.*`), so its absence does not cause the 500. It is left as a recorded
-- residual drift item, deliberately not added here to keep this migration
-- scoped to the financial-requests fix.
--
-- ROLLBACK — safe to revert by dropping the five added columns:
--   ALTER TABLE workflow_requests
--     DROP COLUMN IF EXISTS "entityType",
--     DROP COLUMN IF EXISTS "workflowType",
--     DROP COLUMN IF EXISTS "requestedBy",
--     DROP COLUMN IF EXISTS notes,
--     DROP COLUMN IF EXISTS "deletedAt";
-- Note: rolling back re-introduces the GET /financial-requests 500. Only roll
-- back if no rows have populated these columns.

ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS "entityType"   varchar(100);
ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS "workflowType" varchar(100);
ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS "requestedBy"  integer;
ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS notes          text;
ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS "deletedAt"    timestamptz;
