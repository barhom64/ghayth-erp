-- Migration 250: Multi-assignee tasks + first-class creator tracking.
--
-- WHAT: introduce task_assignees (junction) so a task can be assigned to
--       MORE THAN ONE employee (a team), and add tasks.createdBy
--       (assignmentId of the creator) so the "who opened this?" question
--       has a column instead of relying on audit_log parsing.
--
-- WHY:  the existing model has a single tasks.assignedTo INT column. The
--       user requested explicit team-assignment support: "هناك مكلف أو
--       فريق مكلف يعني أكثر من شخص". Audit logs already record the
--       creator, but the row itself doesn't surface them — every list/
--       detail view has to join audit_logs to know who created the task.
--
-- SAFETY: additive only.
--   - tasks.assignedTo stays the "primary assignee" (so existing list/
--     detail joins keep working with zero change). It mirrors the first
--     row of task_assignees with role='primary'.
--   - task_assignees rows are written in addition to assignedTo. A task
--     with N team members ends up with N rows here + assignedTo pointing
--     at the chosen primary.
--   - tasks.createdBy is NULL-allowed; existing rows stay NULL. New rows
--     populate it from scope.activeAssignmentId.
--
-- @rollback:
--   DROP TABLE IF EXISTS task_assignees;
--   ALTER TABLE tasks DROP COLUMN IF EXISTS createdBy;

BEGIN;

-- ── 1. tasks.createdBy ─────────────────────────────────────────────────
-- The creator's employee_assignments.id. Already tracked indirectly via
-- tasks.assignmentId (which holds the creator's assignment), but that
-- column was overloaded — `assignmentId` is a generic "scope" field used
-- by other tables to mean "the row belongs to assignment X" (e.g. the
-- assignee for some entities). Making `createdBy` explicit removes the
-- ambiguity and lets us index it.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  -- updatedAt is needed so PATCH can confirm row scope via a no-op
  -- column touch even when no business fields changed (e.g. only the
  -- assignee team was modified). Existing rows backfill to createdAt
  -- via the DEFAULT clause.
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tasks_createdBy
  ON tasks ("companyId", "createdBy")
  WHERE "deletedAt" IS NULL;

-- ── 2. task_assignees junction ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_assignees (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "taskId"        INTEGER NOT NULL,
  "assignmentId"  INTEGER NOT NULL,  -- employee_assignments.id
  -- role inside the team: 'primary' = the single accountable owner
  -- (mirrors tasks.assignedTo); 'member' = additional team participants.
  -- A task always has exactly one 'primary' if any assignees exist; the
  -- API enforces that invariant. 'member' rows are zero-or-more.
  role            VARCHAR(20) NOT NULL DEFAULT 'member',
  "assignedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "assignedBy"    INTEGER,            -- employee_assignments.id that added them
  "removedAt"     TIMESTAMPTZ,        -- soft-remove when team membership changes
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_assignees_role_check
    CHECK (role IN ('primary', 'member')),
  CONSTRAINT task_assignees_task_fk
    FOREIGN KEY ("taskId") REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_assignees_assignment_fk
    FOREIGN KEY ("assignmentId") REFERENCES employee_assignments(id) ON DELETE RESTRICT
);

-- One row per (task, assignment, lifetime). Re-adding a removed assignee
-- creates a fresh row rather than reviving the old one — keeps the audit
-- trail honest. The partial unique index enforces "no duplicate ACTIVE
-- assignment for the same task".
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignees_active
  ON task_assignees ("taskId", "assignmentId")
  WHERE "removedAt" IS NULL;

-- Hot path: "tasks assigned to me" — list & detail views filter by
-- assignmentId for the current user. This index makes that O(log n).
CREATE INDEX IF NOT EXISTS idx_task_assignees_assignment
  ON task_assignees ("companyId", "assignmentId")
  WHERE "removedAt" IS NULL;

-- Each task gets its own index for the team-roster fetch.
CREATE INDEX IF NOT EXISTS idx_task_assignees_task
  ON task_assignees ("taskId")
  WHERE "removedAt" IS NULL;

-- ── 3. Backfill: existing tasks.assignedTo → task_assignees ────────────
-- Every existing task with a non-NULL assignedTo gets a single 'primary'
-- row so the legacy single-assignee data becomes queryable through the
-- new junction. Idempotent via the WHERE NOT EXISTS guard.
INSERT INTO task_assignees ("companyId", "taskId", "assignmentId", role, "assignedAt", "assignedBy")
SELECT t."companyId", t.id, t."assignedTo", 'primary', COALESCE(t."createdAt", NOW()), t."assignmentId"
FROM tasks t
WHERE t."assignedTo" IS NOT NULL
  AND t."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_assignees ta
    WHERE ta."taskId" = t.id AND ta."assignmentId" = t."assignedTo" AND ta."removedAt" IS NULL
  );

-- ── 4. Backfill: existing tasks.assignmentId → tasks.createdBy ─────────
-- The old column was overloaded to mean "creator's assignment". Copy it
-- into the explicit createdBy column. Old rows where assignmentId was
-- null stay null in createdBy.
UPDATE tasks
SET "createdBy" = "assignmentId"
WHERE "createdBy" IS NULL AND "assignmentId" IS NOT NULL;

COMMIT;
