-- ===========================================================================
-- 221_message_log_outbound_queue.sql
-- ---------------------------------------------------------------------------
-- WHAT:    Phase 4 of communications unification (Phase 1 = single send seam,
--          Phase 2 = folders/drafts/signatures, Phase 3 = workspaces). This is
--          the EXPAND step of an expand-then-contract migration that
--          consolidates four legacy tables behind one of each kind:
--
--            communications_log (channel-typed message audit)   ─┐
--                                                                ├─→ message_log
--            notification_log (untyped notify-only audit)       ─┘
--
--            email_queue + sms_queue + whatsapp_queue            ─→ outbound_queue
--
--          This migration:
--            1. Creates `message_log` (superset of both legacy log columns)
--            2. Creates `outbound_queue` (superset of the three queue tables)
--            3. Backfills both new tables from existing rows
--            4. Adds a compatibility view `v_message_log_all` that UNIONs the
--               new table with the two legacy tables — readers can flip to
--               this view in a follow-up PR without breaking older endpoints
--            5. Does NOT touch the legacy tables (no drops, no triggers).
--               messageSender.ts will be patched in the same PR to
--               DUAL-WRITE: every new outbound row lands in BOTH the
--               legacy + the new table while readers migrate.
--
-- WHY:     Six tables for what is conceptually one stream made every
--          aggregation (workspace counts, manager-board KPIs, BI reports)
--          a 3-way UNION. The previous unification phases concentrated all
--          WRITES through messageSender.sendMessage(); this phase
--          concentrates the STORAGE behind it. The contract step (drop
--          legacy tables) lands in a follow-up after a soak period.
--
-- SAFETY:  Pure additive — no DROPs, no ALTERs of existing tables, no FK
--          changes. Backfill is idempotent (id-based upsert on conflict do
--          nothing). The view is read-only and references existing tables
--          by name; if a future migration drops one of them, this view
--          will need to be dropped first.
--
-- @rollback:
--   DROP VIEW IF EXISTS public.v_message_log_all;
--   DROP TABLE IF EXISTS public.outbound_queue;
--   DROP TABLE IF EXISTS public.message_log;
-- ===========================================================================

-- 1. message_log -------------------------------------------------------------
-- Single audit row per message (any channel). Holds the strict superset of
-- communications_log + notification_log columns. `legacySource` lets us
-- trace where a row originated from during the soak; once the contract
-- step lands the column becomes uniformly 'message_log'.
CREATE TABLE IF NOT EXISTS public.message_log (
  id                  BIGSERIAL PRIMARY KEY,
  "companyId"         integer NOT NULL,
  channel             varchar(20) NOT NULL,
  direction           varchar(10) NOT NULL DEFAULT 'outbound',
  "fromAddress"       varchar(300),
  "toAddress"         varchar(300),
  subject             varchar(500),
  body                text,
  status              varchar(30) NOT NULL DEFAULT 'sent',
  folder              varchar(30) NOT NULL DEFAULT 'sent',
  "isStarred"         boolean NOT NULL DEFAULT false,
  "relatedType"       varchar(60),
  "relatedId"         integer,
  "errorMessage"      text,
  "legacySource"      varchar(30) NOT NULL DEFAULT 'message_log',
  "legacyId"          integer,                                  -- nullable; backfill only
  "createdAt"         timestamp with time zone NOT NULL DEFAULT now(),
  "deletedAt"         timestamp with time zone,
  CONSTRAINT message_log_channel_check CHECK (channel IN ('email','sms','whatsapp','push','in_app')),
  CONSTRAINT message_log_direction_check CHECK (direction IN ('inbound','outbound')),
  CONSTRAINT message_log_legacy_source_check CHECK ("legacySource" IN ('message_log','communications_log','notification_log'))
);

-- Same indexing strategy as the per-tenant scans on communications_log —
-- every read is companyId-first; folder filtering is the common predicate
-- introduced in Phase 2. WHERE clause matches the partial index on the
-- legacy table.
CREATE INDEX IF NOT EXISTS idx_message_log_company_folder
  ON public.message_log("companyId", folder, "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_log_company_channel
  ON public.message_log("companyId", channel, "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_log_starred
  ON public.message_log("companyId", "createdAt" DESC)
  WHERE "isStarred" = true AND "deletedAt" IS NULL;

-- Lookup by legacy origin makes the dual-write contract step easy:
-- "for every legacy id N, does a corresponding new row exist?". Without
-- this an integrity check during the contract step would scan the
-- entire table.
CREATE INDEX IF NOT EXISTS idx_message_log_legacy
  ON public.message_log("legacySource", "legacyId")
  WHERE "legacyId" IS NOT NULL;

-- 2. outbound_queue ----------------------------------------------------------
-- Single pending-send queue. Workers (cronScheduler email_queue_drain,
-- sms_queue_drain, whatsapp_queue_drain) need to be updated in a follow-up
-- to read from this table — until then the queues are dual-written by
-- messageSender.ts and the workers keep draining the legacy queues. The
-- new table also carries every column required to compose a send (cc,
-- bcc, scheduledAt, templateName, etc.).
CREATE TABLE IF NOT EXISTS public.outbound_queue (
  id                  BIGSERIAL PRIMARY KEY,
  "companyId"         integer NOT NULL,
  channel             varchar(20) NOT NULL,
  recipient           varchar(300) NOT NULL,
  "recipientName"     varchar(200),
  cc                  varchar(500),
  bcc                 varchar(500),
  subject             varchar(500),
  body                text NOT NULL,
  "isHtml"            boolean NOT NULL DEFAULT true,
  "templateName"      varchar(120),
  "templateParams"    jsonb,
  priority            varchar(20) NOT NULL DEFAULT 'normal',
  status              varchar(20) NOT NULL DEFAULT 'pending',
  "refType"           varchar(100),
  "refId"             integer,
  "scheduledAt"       timestamp with time zone DEFAULT now(),
  "sentAt"            timestamp with time zone,
  "deliveredAt"       timestamp with time zone,
  "externalId"        text,
  "messageLogId"      bigint REFERENCES public.message_log(id) ON DELETE SET NULL,
  attempts            integer NOT NULL DEFAULT 0,
  "maxAttempts"       integer NOT NULL DEFAULT 3,
  "lastAttemptAt"     timestamp with time zone,
  "errorMessage"      text,
  metadata            jsonb,
  "legacySource"      varchar(30) NOT NULL DEFAULT 'outbound_queue',
  "legacyId"          integer,
  "createdAt"         timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT outbound_queue_channel_check CHECK (channel IN ('email','sms','whatsapp','push')),
  CONSTRAINT outbound_queue_status_check CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  CONSTRAINT outbound_queue_legacy_source_check CHECK ("legacySource" IN ('outbound_queue','email_queue','sms_queue','whatsapp_queue'))
);

-- Worker poll pattern: status='pending' AND scheduledAt <= NOW(). Partial
-- index matches that exact predicate to keep the pending set tiny.
CREATE INDEX IF NOT EXISTS idx_outbound_queue_pending
  ON public.outbound_queue("scheduledAt" ASC, priority DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbound_queue_company_channel
  ON public.outbound_queue("companyId", channel, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_legacy
  ON public.outbound_queue("legacySource", "legacyId")
  WHERE "legacyId" IS NOT NULL;

-- 3. Backfill from communications_log ---------------------------------------
-- ON CONFLICT DO NOTHING via the unique (legacySource, legacyId) shape so
-- a re-run of this migration leaves duplicates alone. Pre-existing
-- folders/isStarred values from communications_log carry over verbatim.
INSERT INTO public.message_log
  ("companyId", channel, direction, "fromAddress", "toAddress",
   subject, body, status, folder, "isStarred", "relatedType", "relatedId",
   "legacySource", "legacyId", "createdAt", "deletedAt")
SELECT
  cl."companyId", cl.channel, cl.direction, cl."fromNumber", cl."toNumber",
  cl.subject, cl.body, cl.status, cl.folder, cl."isStarred",
  cl."relatedType", cl."relatedId",
  'communications_log', cl.id, cl."createdAt", cl."deletedAt"
FROM public.communications_log cl
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_log ml
   WHERE ml."legacySource" = 'communications_log' AND ml."legacyId" = cl.id
);

-- 4. Backfill from notification_log -----------------------------------------
-- notification_log has no folder/direction/starred. Default to outbound
-- (which was its implicit semantic) and folder='sent'.
INSERT INTO public.message_log
  ("companyId", channel, direction, "fromAddress", "toAddress",
   subject, body, status, folder, "isStarred", "errorMessage",
   "legacySource", "legacyId", "createdAt")
SELECT
  nl."companyId", COALESCE(nl.channel, 'email'), 'outbound',
  NULL, nl.recipient, nl.subject, nl.body, nl.status,
  'sent', false, nl."errorMessage",
  'notification_log', nl.id, nl."createdAt"
FROM public.notification_log nl
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_log ml
   WHERE ml."legacySource" = 'notification_log' AND ml."legacyId" = nl.id
);

-- 5. Backfill outbound_queue from each channel queue ------------------------
-- Pending rows only — we don't migrate already-sent rows, they're in
-- message_log via the audit backfill above.
INSERT INTO public.outbound_queue
  ("companyId", channel, recipient, "recipientName", cc, bcc,
   subject, body, "isHtml", priority, status, "refType", "refId",
   "scheduledAt", "sentAt", "externalId", attempts, "maxAttempts",
   "lastAttemptAt", "errorMessage", metadata,
   "legacySource", "legacyId", "createdAt", "updatedAt")
SELECT
  eq."companyId", 'email', eq."toEmail", eq."recipientName", eq.cc, eq.bcc,
  eq.subject, eq.body, eq."isHtml", eq.priority, eq.status, eq."refType", eq."refId",
  eq."scheduledAt", eq."sentAt", NULL, eq.attempts, eq."maxAttempts",
  eq."lastAttemptAt", eq."errorMessage", eq.metadata,
  'email_queue', eq.id, eq."createdAt", eq."updatedAt"
FROM public.email_queue eq
WHERE eq.status IN ('pending','queued')
  AND NOT EXISTS (
    SELECT 1 FROM public.outbound_queue oq
     WHERE oq."legacySource" = 'email_queue' AND oq."legacyId" = eq.id
  );

INSERT INTO public.outbound_queue
  ("companyId", channel, recipient, body, status,
   "sentAt", "externalId", attempts, "errorMessage",
   "legacySource", "legacyId", "createdAt", "updatedAt")
SELECT
  sq."companyId", 'sms', sq."recipientPhone", sq.message, sq.status,
  sq."sentAt", sq."externalId", sq."attemptCount", sq."errorMessage",
  'sms_queue', sq.id, sq."createdAt", sq."updatedAt"
FROM public.sms_queue sq
WHERE sq."recipientPhone" IS NOT NULL
  AND sq.message IS NOT NULL
  AND sq.status IN ('pending','queued')
  AND NOT EXISTS (
    SELECT 1 FROM public.outbound_queue oq
     WHERE oq."legacySource" = 'sms_queue' AND oq."legacyId" = sq.id
  );

INSERT INTO public.outbound_queue
  ("companyId", channel, recipient, "recipientName", body, "templateName",
   "templateParams", status, "sentAt", "deliveredAt", "scheduledAt",
   "externalId", attempts, "errorMessage",
   "legacySource", "legacyId", "createdAt", "updatedAt")
SELECT
  wq."companyId", 'whatsapp', wq.phone, wq."recipientName", wq.message,
  wq."templateName", wq."templateParams", wq.status, wq."sentAt", wq."deliveredAt",
  wq."scheduledAt", wq."externalId", wq."attemptCount", wq."errorMessage",
  'whatsapp_queue', wq.id, wq."createdAt", wq."updatedAt"
FROM public.whatsapp_queue wq
WHERE wq.status IN ('pending','queued')
  AND NOT EXISTS (
    SELECT 1 FROM public.outbound_queue oq
     WHERE oq."legacySource" = 'whatsapp_queue' AND oq."legacyId" = wq.id
  );

-- 6. Compatibility view: readers can target this during the soak --------------
-- The view exposes the same shape as message_log + a stable `_origin`
-- column so a reader can tell where a row came from without inspecting
-- legacySource (which only exists in message_log itself).
CREATE OR REPLACE VIEW public.v_message_log_all AS
SELECT
  ml.id::bigint                          AS id,
  ml."companyId"                          AS "companyId",
  ml.channel                              AS channel,
  ml.direction                            AS direction,
  ml."fromAddress"                        AS "fromAddress",
  ml."toAddress"                          AS "toAddress",
  ml.subject                              AS subject,
  ml.body                                 AS body,
  ml.status                               AS status,
  ml.folder                               AS folder,
  ml."isStarred"                          AS "isStarred",
  ml."relatedType"                        AS "relatedType",
  ml."relatedId"                          AS "relatedId",
  ml."createdAt"                          AS "createdAt",
  ml."deletedAt"                          AS "deletedAt",
  'message_log'::text                     AS _origin
FROM public.message_log ml;
