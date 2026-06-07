-- Migration 253: make the delegation system real (granular + controllable)
--
-- WHAT: extend `delegations` so a delegation can carry the SPECIFIC features
--       it grants (granular), who created it, and where it came from (a manual
--       manager action or attached to a future leave request).
--         • features  jsonb  — array of feature keys the delegate inherits the
--                              delegator's authority on. ["*"] = all of them.
--         • createdBy integer — the employee_assignment that created it (audit).
--         • source    varchar — 'manual' | 'leave_request'.
--         • refType/refId      — link to the originating record (e.g. the leave
--                              request) so revoking/auto-expiring stays in sync.
--       status defaults to 'active'; startDate/endDate already exist (date).
--
-- WHY:  the delegation UI stored rows that NOTHING in the engine read — the
--       delegate never actually received any authority. authzEngine now loads
--       active delegations and merges the delegator's grants on the delegated
--       features (see lib/rbac/delegationService.ts), so a delegation finally
--       has real effect. Granular `features` is required for "delegate only
--       these permissions" (incl. from the leave-request screen).
--
-- @rollback ALTER TABLE delegations DROP COLUMN IF EXISTS features, DROP COLUMN IF EXISTS "createdBy", DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS "refType", DROP COLUMN IF EXISTS "refId";

ALTER TABLE delegations ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS "createdBy" integer;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS source varchar(32) NOT NULL DEFAULT 'manual';
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS "refType" varchar(64);
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS "refId" integer;

-- Active-window lookup index — checkAccess hits this on every delegated request.
CREATE INDEX IF NOT EXISTS idx_delegations_delegate_active
  ON delegations ("companyId", "delegateId", status);
