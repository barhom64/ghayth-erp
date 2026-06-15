-- 376_onboarding_task_ownership.sql
-- HR-REV-3 (#2222) Slice 1 — distributed ownership on onboarding tasks.
--
-- WHAT:    add "ownerRole" / reason / mandatory / "serviceType" to
--          onboarding_tasks so every activation task carries WHO is
--          responsible, WHY it exists, whether it's required, and (for
--          service tasks) which service must fulfil it.
--
-- WHY:     today the quick-activation plan is 4 flat title strings with no
--          owner or SLA (HR-REV-3 §0 gap — «4 مهام hardcoded مسطّحة»). The
--          distributed activation model routes each task to its owning role
--          (documents / payroll / department / it / hr / fleet / warehouse /
--          access) so completion is spread across owners instead of dumped on
--          HR. This migration is the data foundation; task generation + the
--          owner/SLA display are wired in the same PR.
--
-- DESIGN:  purely additive + idempotent (ADD COLUMN IF NOT EXISTS). `mandatory`
--          defaults TRUE so existing rows stay required; "ownerRole" / reason /
--          "serviceType" are nullable so legacy rows are untouched. No status-
--          machine change here — the pending_activation states are a later
--          slice. The dump (db/schema_pre.sql) is updated in lockstep because
--          CI marks migrations as already-applied against the dump baseline.
--
-- SAFETY:  no FK, no data rewrite, no finance touch, no engine integration.
--
-- @rollback:
--   BEGIN;
--     ALTER TABLE onboarding_tasks DROP COLUMN IF EXISTS "serviceType";
--     ALTER TABLE onboarding_tasks DROP COLUMN IF EXISTS mandatory;
--     ALTER TABLE onboarding_tasks DROP COLUMN IF EXISTS reason;
--     ALTER TABLE onboarding_tasks DROP COLUMN IF EXISTS "ownerRole";
--   COMMIT;

BEGIN;

ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS "ownerRole" VARCHAR(40);
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS mandatory BOOLEAN DEFAULT true;
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS "serviceType" VARCHAR(40);

COMMIT;
