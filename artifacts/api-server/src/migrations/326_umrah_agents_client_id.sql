-- 326_umrah_agents_client_id.sql
--
-- WHAT: add a single nullable column to `umrah_agents`:
--         • clientId  INTEGER NULL   — optional link from a main umrah
--                                      agent to its financial counterparty
--                                      in `clients`.
--       Plus a partial index on the non-null values for the agent→client
--       lookup. Nothing else.
--
-- WHY:  #2080 U-13 P2 (Main Agent as Billing Entity). The U-13 audit
--       (#2182, doc U-13_main_agent_billing_entity_audit.md, Option A)
--       proved that `umrah_agents` already has a REVENUE subsidiary
--       channel (parent 4130) but NO receivable (AR) channel — AR for any
--       billed party reaches the GL only through the `clients` subsidiary
--       chain (entityType='client', accountType='receivable'). To let the
--       main agent become the billing entity WITHOUT a new AR table, the
--       agent needs a bridge to a `clients` row. This migration lays only
--       the structural anchor (the nullable column) for that bridge.
--
--       Scope is deliberately P2 = migration-only: this row is the
--       schema anchor and NOTHING consumes it yet. No backfill, no engine
--       change, no invoicing-behaviour change — those are later phases
--       (P3+) each gated by an independent owner approval.
--
-- SAFETY: pure additive and non-destructive. The column is NULLABLE with
--         no default and no FK constraint, so:
--           • every existing row stays NULL — no UPDATE/backfill, no lock
--             beyond the catalog-only ADD COLUMN.
--           • no writer sets it yet, so no behaviour changes anywhere.
--           • no balances, journal entries, invoices, or receivables are
--             touched; main_agent_client billing mode stays inactive.
--         Idempotent DDL (ADD COLUMN IF NOT EXISTS / CREATE INDEX
--         IF NOT EXISTS) — safe to re-run.
--
-- @rollback: BEGIN;
--              DROP INDEX IF EXISTS public.idx_umrah_agents_client_id;
--              ALTER TABLE public.umrah_agents DROP COLUMN IF EXISTS "clientId";
--            COMMIT;

BEGIN;

ALTER TABLE public.umrah_agents
  ADD COLUMN IF NOT EXISTS "clientId" INTEGER;

-- Partial index: only the (eventually) linked agents carry a clientId, so
-- index the non-null values for the agent→client resolution path. Keeps the
-- index small while NULL is the norm in P2.
CREATE INDEX IF NOT EXISTS idx_umrah_agents_client_id
  ON public.umrah_agents ("clientId")
  WHERE "clientId" IS NOT NULL;

COMMIT;
