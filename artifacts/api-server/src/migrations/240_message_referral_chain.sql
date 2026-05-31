-- 240_message_referral_chain.sql
--
-- WHAT:    add `message_referrals` to record each forward/conversion hop
--          on a message_log entry. Closes the N11 gap from
--          docs/testing/CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     pre-fix, message_log carried a single `relatedType`/`relatedId`
--          pair recording only the LATEST hop. Multi-hop chains
--          (مكتب الاستقبال → مدير الإدارة → القسم القانوني → الأرشيف)
--          lost the intermediate steps — no audit, no chain of custody,
--          no answer to "who forwarded this to whom and when".
--          A separate chain table makes each hop a row.
--
-- SAFETY:  pure additive migration. No existing data touched. Indexed
--          on (companyId, sourceLogId, hopNumber) for the per-message
--          chain query and on (companyId, fromUserId, createdAt) for the
--          per-user activity report.
--
-- @rollback: DROP TABLE IF EXISTS message_referrals;
--           (drops both indexes. The /log/:id/convert handler keeps the
--            INSERT in a try{} block and degrades gracefully on missing
--            table — the conversion itself still runs.)

BEGIN;

CREATE TABLE IF NOT EXISTS message_referrals (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "sourceLogId"   INTEGER NOT NULL,
  "hopNumber"     INTEGER NOT NULL DEFAULT 1,
  "fromUserId"    INTEGER,
  "toUserId"      INTEGER,
  "toRoleHint"    TEXT,
  "targetType"    TEXT,
  "targetId"      INTEGER,
  reason          TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("targetType" IS NULL OR "targetType" IN ('task', 'ticket', 'request', 'assignment', 'archive'))
);

CREATE INDEX IF NOT EXISTS idx_message_referrals_chain
  ON message_referrals ("companyId", "sourceLogId", "hopNumber");

CREATE INDEX IF NOT EXISTS idx_message_referrals_user
  ON message_referrals ("companyId", "fromUserId", "createdAt" DESC);

COMMIT;
