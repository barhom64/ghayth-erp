-- Migration 190: add two columns the route code already writes/reads but
-- which no table or migration ever created — each behind a blocking
-- runtime SQL error (SQLSTATE 42703, "column does not exist").
--
-- RCA findings FLT-010 + PRJ-001 (docs/audit/SYSTEM_INVENTORY_MATRIX.md),
-- Wave-1 blocking defects.
--
--   FLT-010 — fleet_gps_tracking."companyId"
--     routes/fleet.ts:1307 INSERTs `"companyId"` into fleet_gps_tracking
--     (trip waypoint) and the /alerts query reads `g."companyId"`, but the
--     table has no such column — every waypoint write and the alerts query
--     abort at runtime. Added nullable: GPS rows that predate company
--     scoping carry NULL, which the company-filtered alerts query simply
--     excludes (acceptable for a historical tracking table).
--
--   PRJ-001 — project_tasks.progress
--     routes/projects.ts builds `UPDATE project_tasks SET progress=$N` from
--     the task-update schema, and gantt.tsx renders `row.progress`, but the
--     table has no `progress` column — every task update carrying progress
--     fails. Added as integer DEFAULT 0 (a task with no recorded progress
--     is 0%).
--
-- Both are additive: a nullable column, and a column with a DEFAULT — no
-- backfill, no existing row affected, no rolling-deploy hazard. Not a
-- policy-breaking change.
--
-- @rollback:
--   ALTER TABLE fleet_gps_tracking DROP COLUMN IF EXISTS "companyId";
--   ALTER TABLE project_tasks      DROP COLUMN IF EXISTS progress;

ALTER TABLE fleet_gps_tracking ADD COLUMN IF NOT EXISTS "companyId" integer;

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;
