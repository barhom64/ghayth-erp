-- Migration 290 — Field tracking context columns (#2077 PR-9).
--
-- @rollback: Fully additive.
--   ALTER TABLE field_tracking_points DROP COLUMN IF EXISTS "activeRoleKey";
--   ALTER TABLE field_tracking_points DROP COLUMN IF EXISTS "categoryKey";
--   ALTER TABLE field_tracking_points DROP COLUMN IF EXISTS "userId";
--
-- The product owner's item 6: every ping must carry its full context —
-- employeeId, userId, companyId, branchId, activeRoleKey, categoryKey,
-- assignment/task/trip refs, timestamp, accuracy, source. The table
-- (migration 271) already had everything EXCEPT userId, activeRoleKey
-- and categoryKey. All three are resolved server-side from scope +
-- the category policy — the client cannot spoof them.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='field_tracking_points' AND column_name='userId') THEN
    ALTER TABLE field_tracking_points ADD COLUMN "userId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='field_tracking_points' AND column_name='activeRoleKey') THEN
    ALTER TABLE field_tracking_points ADD COLUMN "activeRoleKey" VARCHAR(60);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='field_tracking_points' AND column_name='categoryKey') THEN
    ALTER TABLE field_tracking_points ADD COLUMN "categoryKey" VARCHAR(40);
  END IF;
END $$;

-- Dedupe safety for the offline queue: a client replaying its queue
-- after reconnect must not double-insert the same captured point.
-- (assignmentId, capturedAt) is the natural identity of a ping.
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_tracking_assignment_captured
  ON field_tracking_points ("assignmentId", "capturedAt");
