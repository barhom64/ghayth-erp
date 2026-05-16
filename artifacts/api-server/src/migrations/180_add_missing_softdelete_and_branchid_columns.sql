-- Migration 180: add missing soft-delete + branch-scoping columns surfaced by
-- the 2026-05-15 HTTP smoke audit (companion to migration 179).
--
-- Symptoms before the migration:
--   * GET  /api/projects/:id          → 500 "column pt.deletedAt does not exist"
--     (projects.ts L534 filters project_tasks by "deletedAt", but the column
--      was never added when project_tasks was created.)
--   * POST /api/support/tickets       → 500 "خطأ في هيكل قاعدة البيانات"
--     (support.ts L290 INSERTs into "branchId", and the comment above it
--      claims migration 171 added the column — but the actual mig 171 file
--      is `171_documents_ocr.sql`, not a support_tickets DDL. The column
--      never landed.  bi.ts L906/912 also GROUP BY support_tickets."branchId"
--      which used to silently return one giant bucket since the column was
--      effectively absent.)
--
-- project_phases.deletedAt and project_task_dependencies.deletedAt are added
-- in the same migration because the same /api/projects/:id handler reads
-- those tables (L533, L539) and the next obvious refactor will start
-- filtering them too — adding them now keeps the schema consistent and
-- avoids a follow-up migration the next time someone adds a soft-delete
-- predicate to those queries.

ALTER TABLE project_tasks            ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE project_phases           ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE project_task_dependencies ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
