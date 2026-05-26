-- Migration 218 — drop legacy ref-generation sequences now that every
-- executive route uses numberingService.issueNumber (#1141 closure).
--
-- @rollback:
--   -- The legacy sequences existed before #1141 to feed
--   -- generateRef("PFX", nextval('...')) inside route handlers.
--   -- All routes have been migrated to numberingService.issueNumber
--   -- (proven by audit-numbering-coverage + 4 hard lint rules).
--   -- Rolling back this migration re-creates the sequences as empty
--   -- objects; they will remain unreferenced unless a route is also
--   -- reverted to call nextval() directly (which the lint rules now
--   -- forbid).
--   CREATE SEQUENCE IF NOT EXISTS public.request_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.correspondence_outgoing_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.correspondence_incoming_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.letter_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.journal_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.pr_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.po_number_seq START WITH 1000;
--   CREATE SEQUENCE IF NOT EXISTS public.employee_number_seq START WITH 1000;
--
-- The original migration 213 commented that the legacy sequences were
-- preserved "until every route is moved off them"; the
-- audit-numbering-coverage Stop-Ship gate now confirms zero routes
-- use them. This migration removes the last traces.

-- DROP IF EXISTS keeps the migration idempotent across environments
-- where the sequences were never created (newer tenants seeded after
-- #1141 landed) or already dropped (replays).
DROP SEQUENCE IF EXISTS public.request_number_seq;
DROP SEQUENCE IF EXISTS public.contract_number_seq;
DROP SEQUENCE IF EXISTS public.correspondence_outgoing_seq;
DROP SEQUENCE IF EXISTS public.correspondence_incoming_seq;
DROP SEQUENCE IF EXISTS public.letter_number_seq;
DROP SEQUENCE IF EXISTS public.invoice_number_seq;
DROP SEQUENCE IF EXISTS public.journal_number_seq;
DROP SEQUENCE IF EXISTS public.pr_number_seq;
DROP SEQUENCE IF EXISTS public.po_number_seq;
DROP SEQUENCE IF EXISTS public.employee_number_seq;
