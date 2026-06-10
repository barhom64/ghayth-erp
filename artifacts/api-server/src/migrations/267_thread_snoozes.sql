-- 267_thread_snoozes.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.thread_snoozes;
--
-- Snooze / follow-up reminders for inbox threads.
--
-- Today an operator who reads a customer email and decides "I'll handle
-- this tomorrow" has two choices: archive it (and risk forgetting) or
-- leave it visible (and let it clutter the inbox forever). Snooze is
-- the standard inbox primitive that splits the difference: the thread
-- temporarily hides from the inbox view and a task auto-fires at wakeAt
-- so the operator is reminded without having to keep the conversation
-- mentally pinned.
--
-- Per-user state, just like message_read_state (migration 265): each
-- employee picks their own follow-up time, and one person's snooze
-- doesn't affect another's view.

CREATE TABLE IF NOT EXISTS public.thread_snoozes (
  id            BIGSERIAL    PRIMARY KEY,
  "companyId"   INTEGER      NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  "userId"      INTEGER      NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  channel       VARCHAR(20)  NOT NULL CHECK (channel IN ('email','sms','whatsapp','pbx')),
  "peerAddress" VARCHAR(300) NOT NULL,
  "wakeAt"      TIMESTAMPTZ  NOT NULL,
  reason        VARCHAR(300),
  "snoozedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "wokenAt"     TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  CHECK ("wokenAt" IS NULL OR "cancelledAt" IS NULL)
);

-- Cron worker scan: pick up due, active snoozes across all tenants.
-- Partial index keeps the table tiny in practice — woken/cancelled
-- rows are kept for audit but never re-scanned.
CREATE INDEX IF NOT EXISTS idx_thread_snoozes_wake
  ON public.thread_snoozes ("wakeAt")
  WHERE "wokenAt" IS NULL AND "cancelledAt" IS NULL;

-- One active snooze per (user, thread). A second POST replaces the
-- first via the route's UPDATE rather than stacking — matches gmail's
-- behaviour. Enforced by partial unique index so cancelled/woken rows
-- don't collide with a new snooze on the same thread.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_thread_snoozes_active
  ON public.thread_snoozes ("companyId", "userId", channel, "peerAddress")
  WHERE "wokenAt" IS NULL AND "cancelledAt" IS NULL;
