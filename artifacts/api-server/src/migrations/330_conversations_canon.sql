-- 330_conversations_canon.sql
--
-- WHAT: introduce the persisted Conversation canon (#2138):
--       1. `conversations` — one row per (companyId, channel, peer
--          address). Until now the inbox "thread" was COMPUTED on
--          every GET /inbox/threads by a window function over
--          message_log grouped by (channel, COALESCE(fromAddress,
--          toAddress)). That works for listing, but a computed
--          thread cannot carry state: no status (open / awaiting
--          reply / closed / escalated), no priority, no assignee,
--          no SLA flag, no risk level — all of which #2138 requires
--          for the conversation-first UX.
--       2. `conversation_links` — N:M linkage between a conversation
--          and business entities (client / employee / invoice /
--          legal case / vehicle / trip / ...). The message-level
--          relatedType/relatedId columns stay untouched; this table
--          is the conversation-level "الكيانات المرتبطة" the context
--          panel reads.
--       3. `message_log."conversationId"` + a BEFORE INSERT trigger
--          that upserts the conversation row for every new message.
--          The trigger keys the conversation by the exact same
--          expression GET /inbox/threads groups by today —
--          COALESCE(NULLIF("fromAddress",''), "toAddress") — so the
--          persisted conversations are 1:1 with the threads users
--          already see. Every insert path (messageSender, mailbox
--          sync, manual pbx mirror, notificationEngine) is covered
--          without touching each call site.
--       4. Backfill: one conversation per existing thread group +
--          stamp message_log."conversationId" on historical rows.
--
-- WHY:  #2138 CONVERSATION-FIRST COMMUNICATION UX. The mandate:
--          «كل شيء في نظام التواصل يجب أن يظهر للمستخدم كـ
--           Conversation … طرف + محادثة + إجراء + ربط + أثر + تدقيق»
--       and the Stop-Ship rule: no new table without a mapping to
--       the existing ones. The mapping here: conversations is a
--       MATERIALISATION of the existing message_log thread grouping
--       (same key, backfilled from it, kept in sync by trigger) —
--       message_log stays the single message store; no queue or
--       send-path change.
--
-- SAFETY: additive only. No existing column is altered or dropped;
--         message_log gains one nullable column. The trigger only
--         fires on INSERT (message_log rows are never UPDATEd by the
--         send path). Backfill is idempotent: conversations insert
--         is ON CONFLICT DO NOTHING and the conversationId stamp
--         only touches NULL rows.
--
-- @rollback: BEGIN;
--              DROP TRIGGER IF EXISTS trg_message_log_upsert_conversation ON public.message_log;
--              DROP FUNCTION IF EXISTS public.message_log_upsert_conversation();
--              ALTER TABLE public.message_log DROP COLUMN IF EXISTS "conversationId";
--              DROP TABLE IF EXISTS public.conversation_links;
--              DROP TABLE IF EXISTS public.conversations;
--            COMMIT;

BEGIN;

-- 1. Conversation canon ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
  id                   SERIAL PRIMARY KEY,
  "companyId"          integer NOT NULL,
  -- Channel the conversation lives on. One conversation per channel —
  -- matching the current thread grouping. Cross-channel merge (same
  -- party over email + whatsapp) is a later slice: it needs participant
  -- identity resolution, not a schema change (participantType/Id
  -- already let two conversations point at the same party).
  "channelPrimary"     varchar(20) NOT NULL
                         CHECK ("channelPrimary" IN ('email','whatsapp','sms','pbx','push','in_app','internal')),
  title                varchar(500),
  -- The counter-party. Address is the thread key (email address /
  -- phone number); type+id+name are filled when the party is matched
  -- to a business entity (clients / employees / suppliers / ...).
  "participantType"    varchar(60),
  "participantId"      integer,
  "participantName"    varchar(300),
  "participantAddress" varchar(300) NOT NULL,
  status               varchar(20) NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','awaiting_reply','closed','escalated')),
  priority             varchar(10) NOT NULL DEFAULT 'normal'
                         CHECK (priority IN ('low','normal','high','urgent')),
  "assignedTo"         integer,            -- users.id
  "ownerPath"          varchar(120),       -- owning path/module key, free-form for now
  "lastMessageAt"      timestamptz,
  "slaStatus"          varchar(20)
                         CHECK ("slaStatus" IS NULL OR "slaStatus" IN ('on_track','at_risk','breached')),
  "riskLevel"          varchar(10)
                         CHECK ("riskLevel" IS NULL OR "riskLevel" IN ('low','medium','high')),
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "deletedAt"          timestamptz
);

-- The thread identity. Partial so a soft-deleted conversation frees
-- the key (a new message to the same peer starts a fresh conversation).
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_company_channel_peer
  ON public.conversations ("companyId", "channelPrimary", "participantAddress")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_company_last
  ON public.conversations ("companyId", "lastMessageAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned
  ON public.conversations ("companyId", "assignedTo")
  WHERE "deletedAt" IS NULL AND "assignedTo" IS NOT NULL;

-- 2. Conversation ↔ entity links --------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_links (
  id               SERIAL PRIMARY KEY,
  "companyId"      integer NOT NULL,
  "conversationId" integer NOT NULL REFERENCES public.conversations(id),
  "relatedType"    varchar(60) NOT NULL,
  "relatedId"      integer NOT NULL,
  "linkedBy"       integer,              -- users.id
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "deletedAt"      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_links_target
  ON public.conversation_links ("conversationId", "relatedType", "relatedId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_links_entity
  ON public.conversation_links ("companyId", "relatedType", "relatedId")
  WHERE "deletedAt" IS NULL;

-- 3. message_log.conversationId + sync trigger -------------------------------

ALTER TABLE public.message_log
  ADD COLUMN IF NOT EXISTS "conversationId" integer;

CREATE INDEX IF NOT EXISTS idx_message_log_conversation
  ON public.message_log ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- BEFORE INSERT so the new message row itself carries the id. The
-- conversation key expression MUST stay identical to the GET
-- /inbox/threads grouping (COALESCE(NULLIF(fromAddress,''), toAddress))
-- or persisted conversations drift from the computed thread list.
CREATE OR REPLACE FUNCTION public.message_log_upsert_conversation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  peer text;
  conv_id integer;
BEGIN
  peer := COALESCE(NULLIF(NEW."fromAddress", ''), NULLIF(NEW."toAddress", ''));
  IF peer IS NULL OR NEW."companyId" IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversations
    ("companyId", "channelPrimary", "participantAddress", title,
     "lastMessageAt", "createdAt", "updatedAt")
  VALUES
    (NEW."companyId", NEW.channel, peer, NEW.subject,
     COALESCE(NEW."createdAt", now()), now(), now())
  ON CONFLICT ("companyId", "channelPrimary", "participantAddress")
    WHERE "deletedAt" IS NULL
  DO UPDATE SET
    "lastMessageAt" = GREATEST(
      COALESCE(public.conversations."lastMessageAt", '-infinity'::timestamptz),
      COALESCE(NEW."createdAt", now())
    ),
    title = COALESCE(public.conversations.title, EXCLUDED.title),
    -- An inbound message re-opens a closed conversation and clears
    -- the awaiting-reply state — the other side DID reply.
    status = CASE
      WHEN NEW.direction = 'inbound'
       AND public.conversations.status IN ('closed', 'awaiting_reply')
      THEN 'open'
      ELSE public.conversations.status
    END,
    "updatedAt" = now()
  RETURNING id INTO conv_id;

  NEW."conversationId" := conv_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_log_upsert_conversation ON public.message_log;
CREATE TRIGGER trg_message_log_upsert_conversation
  BEFORE INSERT ON public.message_log
  FOR EACH ROW
  EXECUTE FUNCTION public.message_log_upsert_conversation();

-- 4. Backfill ----------------------------------------------------------------

-- One conversation per existing (companyId, channel, peer) group. The
-- title / lastMessageAt come from the newest message in the group —
-- the same row the thread list shows as the preview today.
INSERT INTO public.conversations
  ("companyId", "channelPrimary", "participantAddress", title,
   "lastMessageAt", "createdAt", "updatedAt")
SELECT
  t."companyId",
  t.channel,
  t.peer,
  (array_agg(t.subject ORDER BY t."createdAt" DESC) FILTER (WHERE t.subject IS NOT NULL))[1],
  MAX(t."createdAt"),
  MIN(t."createdAt"),
  now()
FROM (
  SELECT ml."companyId", ml.channel, ml.subject, ml."createdAt",
         COALESCE(NULLIF(ml."fromAddress", ''), NULLIF(ml."toAddress", '')) AS peer
    FROM public.message_log ml
   WHERE ml."deletedAt" IS NULL
) t
WHERE t.peer IS NOT NULL
GROUP BY t."companyId", t.channel, t.peer
ON CONFLICT ("companyId", "channelPrimary", "participantAddress")
  WHERE "deletedAt" IS NULL
DO NOTHING;

-- Stamp historical messages. Only NULL rows are touched → idempotent.
UPDATE public.message_log ml
   SET "conversationId" = c.id
  FROM public.conversations c
 WHERE ml."conversationId" IS NULL
   AND ml."deletedAt" IS NULL
   AND c."deletedAt" IS NULL
   AND c."companyId" = ml."companyId"
   AND c."channelPrimary" = ml.channel
   AND c."participantAddress" = COALESCE(NULLIF(ml."fromAddress", ''), NULLIF(ml."toAddress", ''));

COMMIT;
