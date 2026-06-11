-- ===========================================================================
-- 313_subsidiary_account_provisioning_failures.sql
-- ---------------------------------------------------------------------------
-- WHAT:    a tracking table for per-entity subsidiary-account auto-provisioning
--          failures (createSubsidiaryAccountsForEntity), so the step is never
--          a silent failure: an entity left without its GL subsidiary account
--          (a control parent that couldn't resolve, or a DB error) is recorded
--          for review + idempotent retry.
-- WHY:     #2091 — createSubsidiaryAccountsForEntity is fire-and-forget and its
--          only failure handling was `logger.error` (swallowed). Per the Ghayth
--          doctrine "every action has a traceable effect", a failed (or
--          incomplete) provisioning must leave a trackable, reviewable record
--          linked to the entity / accountType(s) / company / branch / actor /
--          reason — NOT just a log line. The unresolved rows ARE the finance
--          review queue; retry re-runs the (idempotent) provisioning and marks
--          the row resolved on success.
-- SAFETY:  additive, non-destructive. New table only — touches no existing
--          data, no balances, no journal entries. A partial UNIQUE index keeps
--          at most ONE OPEN row per (company, entity) so re-failures and
--          retries update that row instead of duplicating alerts.
-- @rollback:
--   DROP TABLE IF EXISTS public.subsidiary_account_provisioning_failures;
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.subsidiary_account_provisioning_failures (
  id                     serial PRIMARY KEY,
  "companyId"            integer NOT NULL,
  "branchId"             integer,
  "entityType"           varchar(50) NOT NULL,
  "entityId"             integer NOT NULL,
  "entityName"           text,
  "missingAccountTypes"  text[],
  reason                 text NOT NULL,
  "actorUserId"          integer,
  context                jsonb,
  "retryCount"           integer NOT NULL DEFAULT 0,
  resolved               boolean NOT NULL DEFAULT false,
  "resolvedAt"           timestamptz,
  "firstSeenAt"          timestamptz NOT NULL DEFAULT now(),
  "lastAttemptAt"        timestamptz NOT NULL DEFAULT now()
);

-- At most one OPEN failure per (company, entity): re-failures and retries
-- upsert this row (no duplicate alerts); a resolved row lets a future
-- failure open a fresh one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subsidiary_provisioning_failure_open
  ON public.subsidiary_account_provisioning_failures ("companyId", "entityType", "entityId")
  WHERE resolved = false;

-- Review-queue read path: list open failures per company.
CREATE INDEX IF NOT EXISTS idx_subsidiary_provisioning_failure_company_open
  ON public.subsidiary_account_provisioning_failures ("companyId", "lastAttemptAt" DESC)
  WHERE resolved = false;
