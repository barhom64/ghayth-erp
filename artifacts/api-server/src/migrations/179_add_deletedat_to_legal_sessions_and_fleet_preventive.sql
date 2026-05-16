-- Task: HTTP smoke audit (2026-05-15) discovered 5 routes querying
-- legal_sessions and fleet_preventive_plans with `"deletedAt" IS NULL`
-- but the column was never created. Add the soft-delete column to
-- both tables (idempotent — safe to re-run).
--
-- Sites unblocked:
--   legal.ts L655   GET /legal/cases/:id (sessions sub-list)
--   legal.ts L817   GET /legal/cases/:caseId/sessions
--   legal.ts L990   POST /legal/cases/:caseId/sessions (post-insert select)
--   legal.ts L1003  GET /legal/stats (was 500)
--   fleet.ts L2554  GET /fleet/preventive-plans (was 500)
--   fleet.ts L2648  GET /fleet/preventive-plans/:id
--   fleet.ts L2682  PATCH /fleet/preventive-plans/:id

ALTER TABLE legal_sessions
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_legal_sessions_deletedat
  ON legal_sessions ("deletedAt");

ALTER TABLE fleet_preventive_plans
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_fleet_preventive_plans_deletedat
  ON fleet_preventive_plans ("deletedAt");
