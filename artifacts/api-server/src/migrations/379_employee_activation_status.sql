-- 379_employee_activation_status.sql
-- HR-REV-3 (#2222) Slice 4a — the activation status field + ready-for-review gate.
--
-- WHAT:    add "activationStatus" to employees — the pre-active state of a
--          quick-activated hire (pending_activation → ready_for_hr_review →
--          active), kept SEPARATE from employees.status (inactive/active) so
--          the activation flow has its own ledger column without overloading
--          the lifecycle status.
--
-- WHY:     HR-REV-3 §1/§7 — quick-activate lands an employee at
--          'pending_activation'; once every MANDATORY onboarding task is done
--          the route auto-advances it to 'ready_for_hr_review' so HR knows the
--          distributed plan is complete and the hire can be flipped to active.
--          Without a persisted column this readiness could only be recomputed
--          client-side and never drives notifications/queries.
--
-- DESIGN:  additive + idempotent. Nullable — existing/active employees keep
--          NULL (they never went through the pre-active gate). No CHECK yet:
--          the full state machine (pending_department/payroll/… + returned/
--          rejected) is a later slice; this one only needs the two values the
--          auto-gate uses. db/schema_pre.sql is updated in lockstep (CI marks
--          migrations applied against the dump baseline).
--
-- SAFETY:  no FK, no data rewrite, no finance touch, no engine integration.
--
-- @rollback:
--   BEGIN;
--     ALTER TABLE employees DROP COLUMN IF EXISTS "activationStatus";
--   COMMIT;

BEGIN;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS "activationStatus" VARCHAR(40);

COMMIT;
