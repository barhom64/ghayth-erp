-- Migration 150: per-employee accountability on umrah_violations
--
-- Spec §9 ("العمولة تتبع التعيين assignmentId") + acceptance scenario #15:
-- > مخالفة تشغيلية على الموظف → عمولة = 0 رغم تحقق الشروط
--
-- Before this migration the commission engine's hasViolations check was
-- season-wide: ANY open umrah_violations row on ANY pilgrim in the season
-- would zero the bonus for every active plan. That's too aggressive — an
-- absconder under sub-agent A should not block a commission for the
-- ops-manager handling sub-agent B.
--
-- This migration adds a nullable `responsibleAssignmentId` FK that
-- attributes the violation to a specific employee_assignments row. The
-- commission engine reads it and only blocks the bonus on the assignment
-- that's actually responsible. Backward-compatible: rows without the
-- field still block (preserving today's behaviour) until the operations
-- team starts tagging.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE umrah_violations
  ADD COLUMN IF NOT EXISTS "responsibleAssignmentId" INTEGER REFERENCES employee_assignments(id);

CREATE INDEX IF NOT EXISTS idx_umrah_violations_responsible_assignment
  ON umrah_violations ("responsibleAssignmentId")
  WHERE "deletedAt" IS NULL AND "responsibleAssignmentId" IS NOT NULL;
