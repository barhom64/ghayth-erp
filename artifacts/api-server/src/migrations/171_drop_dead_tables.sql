-- 171_drop_dead_tables.sql
-- Drop four legacy tables that have zero code references on origin/main as
-- of 2026-05-13. Same pattern as 141_drop_unused_legacy_tables.sql.
--
-- Verified zero references via: grep -rE '\<TABLE\>' artifacts/api-server/src/
-- artifacts/ghayth-erp/src/ lib/db/src/ — only matches were in this
-- migration file itself and in the schema dump.
--
-- Notes per table:
--   fleet_violations            — superseded by traffic_violations, which is
--                                 the table fleet.ts:fleet/traffic-violations
--                                 actually reads and writes. fleet_violations
--                                 was never wired.
--   invoice_items               — Umrah sales lines live in
--                                 umrah_sales_invoice_items; finance invoice
--                                 lines live in invoices.lines (jsonb).
--                                 invoice_items was a planned generic table
--                                 that never got writers.
--   training_courses            — training_participants joins
--                                 training_programs via the trainingId column;
--                                 the parallel courseId FK to training_courses
--                                 was never populated. bi.ts confirms
--                                 (training_participants tp JOIN training_programs).
--   warehouse_stock_serials     — serial tracking is a planned ADVANCED
--                                 inventory feature (see
--                                 docs/INVENTORY_ADVANCED_DESIGN.md); current
--                                 stock uses warehouse_stock_lots + lot
--                                 numbers without per-serial granularity.
--
-- training_courses has an inbound FK from training_participants.courseId, so
-- we drop the FK constraint + column first before dropping the table itself.
-- CASCADE handles the rest.

ALTER TABLE IF EXISTS public.training_participants
  DROP CONSTRAINT IF EXISTS "training_participants_courseId_fkey";
ALTER TABLE IF EXISTS public.training_participants
  DROP COLUMN IF EXISTS "courseId";

DROP TABLE IF EXISTS public.fleet_violations         CASCADE;
DROP TABLE IF EXISTS public.invoice_items            CASCADE;
DROP TABLE IF EXISTS public.training_courses         CASCADE;
DROP TABLE IF EXISTS public.warehouse_stock_serials  CASCADE;
