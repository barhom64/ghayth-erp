-- 348_umrah_commission_plan_agent_columns.sql
--
-- WHAT:    add nullable `agentId` + `subAgentId` columns to
--          employee_commission_plans so a marketing plan can be
--          attributed to the umrah main agent + sub-agent it was
--          earned under.
--
-- WHY:     U-05 audit (PR #2286): the plan schema knows employeeId +
--          assignmentId + seasonId but NOT which agent the marketer
--          worked under. Today's commission-expense JE lines
--          (umrahCommissionEngine.ts:208-231) explicitly comment that
--          umrahAgentId would carry attribution "but
--          employee_commission_plans has no agentId column today —
--          the dimension is left undefined here and will be added
--          when the plan schema gains an agent FK in a follow-up."
--          This migration adds that column. The engine wiring (P2)
--          is owner-ratification gated and not in this migration.
--
-- SAFETY:  pure additive. Both columns nullable + no FK constraint
--          + no backfill. Legacy plan rows keep their existing
--          shape; agent attribution comes from operator-set values
--          on new/edited plans via the editor (P4, separate PR).
--
--          Matches the BILL-MAIN P2 expand/contract shape exactly:
--          add nullable column → no posting math change → the
--          engine reads NULL as "no attribution" and skips the
--          dim. Confirmed safe by the U-05 audit §3.1.
--
-- @rollback: BEGIN;
--   ALTER TABLE employee_commission_plans DROP COLUMN IF EXISTS "subAgentId";
--   ALTER TABLE employee_commission_plans DROP COLUMN IF EXISTS "agentId";
--   COMMIT;

BEGIN;

ALTER TABLE employee_commission_plans
  ADD COLUMN IF NOT EXISTS "agentId"    integer,
  ADD COLUMN IF NOT EXISTS "subAgentId" integer;

-- Index supports the future commission_report breakdown queries
-- (U-04-P1) which group by agentId. Partial index because most
-- legacy rows have agentId IS NULL and we don't want to bloat the
-- index with those.
CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_agent
  ON employee_commission_plans ("companyId", "agentId")
  WHERE "agentId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_sub_agent
  ON employee_commission_plans ("companyId", "subAgentId")
  WHERE "subAgentId" IS NOT NULL AND "deletedAt" IS NULL;

COMMIT;
