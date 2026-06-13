-- ===========================================================================
-- 337_umrah_agents_client_linkage.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Adds umrah_agents."clientId" (nullable integer) + a supporting
--        index on ("companyId", "clientId").
-- WHY:   U-13 P2 of #2080. The ratified billing direction makes the MAIN
--        agent the commercial/billing counterparty (the sub-agent stays
--        operational). Today only umrah_sub_agents carries a "clientId";
--        umrah_agents has none, which is the single structural blocker
--        documented in U-13_main_agent_billing_entity_audit.md §2/§3.
--        This migration adds the column ONLY. It does NOT wire the
--        invoicing engine, does NOT backfill, does NOT flip any policy,
--        and does NOT activate the `main_agent_client` mode. Those land
--        in later, separately-authorised phases (U-13 P3+).
-- SAFETY: Additive, nullable column with NO default and NO backfill — the
--         safest possible shape under the expand/contract policy (§7 of
--         docs/MIGRATION_POLICY.md). No NOT NULL, no CHECK, no FK
--         constraint (mirrors the existing umrah_sub_agents."clientId"
--         convention, which is also an unconstrained nullable integer).
--         The index is a plain CREATE INDEX IF NOT EXISTS; umrah_agents is
--         a small per-company directory table so the brief lock is
--         negligible. Existing rows stay valid (clientId = NULL) and
--         every existing code path is unaffected because nothing reads
--         the column yet.
-- @rollback:
--   BEGIN;
--   DROP INDEX IF EXISTS idx_umrah_agents_company_client;
--   ALTER TABLE umrah_agents DROP COLUMN IF EXISTS "clientId";
--   COMMIT;
-- ===========================================================================

BEGIN;

-- 1. The nullable linkage column. Mirrors umrah_sub_agents."clientId"
--    exactly: a bare nullable integer, no FK, no default. NULL means
--    "this main agent is not yet linked to a financial client" — which
--    is the correct state for every existing row at ALTER time.
ALTER TABLE umrah_agents
  ADD COLUMN IF NOT EXISTS "clientId" integer;

-- 2. Lookup index for the eventual main-agent → client resolution
--    (U-13 P4 engine fallback). Tenant-scoped composite so the future
--    "find the client linked to this agent in this company" probe hits
--    an index instead of a seq scan. Partial on NOT NULL keeps the
--    index small — unlinked agents (the majority at rollout) are
--    excluded.
CREATE INDEX IF NOT EXISTS idx_umrah_agents_company_client
  ON umrah_agents ("companyId", "clientId")
  WHERE "clientId" IS NOT NULL;

COMMIT;
