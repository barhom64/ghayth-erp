-- 165_drop_unused_legacy_tables.sql
-- Drop legacy tables that are not referenced by any code path on origin/main.
--
-- Verified 2026-05-09 via: grep across artifacts/api-server/src/,
--   artifacts/ghayth-erp/src/, lib/db/src/ — zero non-migration references
--   for every table dropped here.
--
-- Notes per table:
--   daily_closures           — superseded by financial_periods + period
--                              status guards in finance-hardening.ts.
--   deduction_rules          — payroll uses salary_components instead.
--   privacy_consent_records  — superseded by pdpl.ts which writes to
--                              data_request / processing_log tables.
--   quality_checks           — never wired up; warehouse uses
--                              inventory_counts for stock-level QA.
--   stock_transfers / _items — stock movement uses warehouse_movements
--                              with movement_type='transfer'.
--   ticket_escalations       — support escalation lives inside the
--                              workflowEngine / approval_chains.
--   user_shortcuts           — UI sidebar pins use system_settings keyed
--                              by userId.
--
-- Drop order respects FK: stock_transfer_items → stock_transfers.

DROP TABLE IF EXISTS public.stock_transfer_items CASCADE;
DROP TABLE IF EXISTS public.stock_transfers       CASCADE;
DROP TABLE IF EXISTS public.daily_closures        CASCADE;
DROP TABLE IF EXISTS public.deduction_rules       CASCADE;
DROP TABLE IF EXISTS public.privacy_consent_records CASCADE;
DROP TABLE IF EXISTS public.quality_checks        CASCADE;
DROP TABLE IF EXISTS public.ticket_escalations    CASCADE;
DROP TABLE IF EXISTS public.user_shortcuts        CASCADE;
