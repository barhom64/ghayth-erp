-- 378_thread_internal_notes.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.thread_internal_notes;
--
-- Internal-only notes attached to a (channel, peer-address) conversation.
--
-- Why we need this: today the inbox lets two employees see the same
-- thread but gives them no way to leave each other a heads-up that
-- isn't sent to the customer ("called back, escalated to manager",
-- "needs legal review before reply"). Without an internal-comment
-- surface, the team either invents conventions in the message body
-- (which then leaks to the customer the next time someone hits Send)
-- or loses the context entirely.
--
-- Keyed by (channel, peer-address) rather than messageLogId so notes
-- stay attached to the *conversation* — a thread that grows from 3 to
-- 30 messages still surfaces the original "this client is angry" note.

CREATE TABLE IF NOT EXISTS public.thread_internal_notes (
  id            BIGSERIAL   PRIMARY KEY,
  "companyId"   INTEGER     NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel       VARCHAR(20) NOT NULL CHECK (channel IN ('email','sms','whatsapp','pbx')),
  "peerAddress" VARCHAR(300) NOT NULL,
  body          TEXT        NOT NULL CHECK (length(trim(body)) > 0),
  "authorUserId" INTEGER    NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ
);

-- Primary lookup: pull every note attached to a single thread,
-- newest last so the frontend renders them chronologically.
CREATE INDEX IF NOT EXISTS idx_thread_internal_notes_thread
  ON public.thread_internal_notes ("companyId", channel, "peerAddress", "createdAt")
  WHERE "deletedAt" IS NULL;
