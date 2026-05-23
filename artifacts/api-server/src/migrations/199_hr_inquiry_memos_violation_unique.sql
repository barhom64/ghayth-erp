-- 199_hr_inquiry_memos_violation_unique.sql
--
-- `disciplineEngine.ensureInquiryMemoForViolation` runs:
--
--   SELECT id FROM hr_inquiry_memos
--    WHERE "companyId" = $1 AND "violationId" = $2 AND "deletedAt" IS NULL
--    LIMIT 1
--   if (existing) return
--   INSERT INTO hr_inquiry_memos (...)
--
-- as its idempotency guard. The pattern is racy: two concurrent
-- callers — typically `dailyDeductionCheck` running back-to-back, or
-- a manual disciplinary action firing while the cron is mid-pass —
-- both see no existing memo and both INSERT. The result is two
-- "pending_employee" inquiry memos for the same violation, both
-- numbered (memoNumber is the only existing unique key), both
-- routed to the employee, both eligible for penalty escalation.
-- One violation -> one memo is the invariant; we just never encoded
-- it at the schema level.
--
-- Step 1: de-duplicate existing rows — keep the most recent per
-- (companyId, violationId). The "most recent" is the one with the
-- largest id (id is sequence-driven, so larger = newer).
--
-- Step 2: add a PARTIAL unique index that matches the engine's
-- WHERE clause exactly (`"deletedAt" IS NULL AND "violationId" IS NOT
-- NULL`). The engine's INSERT switches to ON-CONFLICT / catch-23505
-- → re-query path in the same commit, so the race collapses into a
-- single atomic outcome.
--
-- @rollback:
--   DROP INDEX IF EXISTS uq_hr_inquiry_memos_violation;

DELETE FROM hr_inquiry_memos
 WHERE id NOT IN (
   SELECT MAX(id) FROM hr_inquiry_memos
    WHERE "violationId" IS NOT NULL AND "deletedAt" IS NULL
    GROUP BY "companyId", "violationId"
 )
 AND "violationId" IS NOT NULL
 AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_inquiry_memos_violation
  ON hr_inquiry_memos ("companyId", "violationId")
  WHERE "deletedAt" IS NULL AND "violationId" IS NOT NULL;
