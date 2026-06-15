-- U-17-P3 — agent / sub-agent contact-employee attribution columns.
--
-- The U-17 internal-notifications module (umrahInternalNotifications.ts)
-- currently only reaches the branch manager + GM/owner pool. The audit
-- §3.3 calls for extending the recipient set to include the operator
-- specifically assigned to liaise with the agent (and sub-agent) that
-- owns the pilgrim event — so the right person sees the alert without
-- a manual hand-off.
--
-- This migration adds the columns. Engine consumption is in the same
-- PR; the FE picker on the agent/sub-agent edit form is U-17-P3 phase-2
-- (deferred — current edit screens already accept arbitrary employee
-- ids on similar fields and the operator can populate via API or the
-- existing form fields).
--
-- Permanent hard rails:
--   - additive, idempotent, NULLABLE.
--   - NO default. NO backfill. NO FK constraint (matches the
--     U-05-P1 / U-15-P1 column-add pattern).
--   - Two partial indexes support the future per-agent recipient
--     lookup. Each indexed only where the column is non-null so
--     we don't index the dominant null-row population.
--
-- @rollback:
--   ALTER TABLE umrah_agents DROP COLUMN IF EXISTS "contactEmployeeId";
--   ALTER TABLE umrah_sub_agents DROP COLUMN IF EXISTS "contactEmployeeId";
--   DROP INDEX IF EXISTS idx_umrah_agents_contact_employee;
--   DROP INDEX IF EXISTS idx_umrah_sub_agents_contact_employee;

ALTER TABLE umrah_agents
  ADD COLUMN IF NOT EXISTS "contactEmployeeId" integer;

ALTER TABLE umrah_sub_agents
  ADD COLUMN IF NOT EXISTS "contactEmployeeId" integer;

CREATE INDEX IF NOT EXISTS idx_umrah_agents_contact_employee
  ON umrah_agents ("companyId", "contactEmployeeId")
  WHERE "contactEmployeeId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_contact_employee
  ON umrah_sub_agents ("companyId", "contactEmployeeId")
  WHERE "contactEmployeeId" IS NOT NULL;
