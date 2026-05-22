-- 187_event_outbox.sql
-- Runtime Foundation — Transactional Outbox, phase 1 (Decision Brief #2).
--
-- Creates event_outbox: a durable, append-only capture of every domain event
-- emitted through eventBus.emit. Phase 1 creates the table and starts
-- capturing into it; the in-process dispatch (super.emit) is unchanged and
-- stays the active dispatcher. The relay that drains the outbox and the
-- dispatch-source switch land in follow-up PRs (Brief #2 phases 2-3).
--
-- Idempotent (CREATE TABLE IF NOT EXISTS), additive — no existing table or
-- column is touched. The same definition is mirrored into db/schema_pre.sql
-- so fresh databases (which pre-mark migrations applied without running them)
-- also get the table.
--
-- ROLLBACK — while phase 1 is the only consumer, safe to revert by dropping
-- the table:
--   DROP TABLE IF EXISTS event_outbox;

CREATE TABLE IF NOT EXISTS public.event_outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventName" character varying(150) NOT NULL,
    payload jsonb,
    "companyId" integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "processedAt" timestamp with time zone,
    "lastError" text
);
