-- 268_quick_reply_templates.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.quick_reply_templates;
--
-- Operator-managed canned-response snippets.
--
-- notification_templates is for system-event-driven sends (the
-- ar/en × 4-channel bilingual library wired into notificationEngine).
-- It is NOT what an operator wants when they hit Reply and need to
-- paste "نشكر تواصلكم، سيتم الرد خلال 24 ساعة" — that's a personal /
-- team snippet, not an event template, and squeezing it into
-- notification_templates would pollute the event-key namespace and
-- bypass the template-engine's variable contract.
--
-- The new table is intentionally lean: it stores plain text body the
-- operator drops verbatim into a reply textarea. No DLP, no provider
-- routing, no fallback chains — those still apply at /inbox/send /
-- /threads/:id/reply when the operator actually clicks Send.

CREATE TABLE IF NOT EXISTS public.quick_reply_templates (
  id          BIGSERIAL    PRIMARY KEY,
  "companyId" INTEGER      NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = company-wide snippet visible to every operator with comms
  -- access. A non-null userId scopes the snippet to a single owner —
  -- the dropdown UNIONs both.
  "userId"    INTEGER      REFERENCES public.users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  body        TEXT         NOT NULL CHECK (length(trim(body)) > 0),
  -- NULL = available on any channel; non-null restricts the snippet
  -- to one channel so an SMS-tone snippet doesn't show up while
  -- composing an email.
  channel     VARCHAR(20)  CHECK (channel IS NULL OR channel IN ('email','sms','whatsapp')),
  "sortOrder" INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

-- Primary lookup: list snippets visible to (companyId, userId) ordered
-- by sortOrder then title. Covers the dropdown query directly.
CREATE INDEX IF NOT EXISTS idx_quick_reply_templates_visible
  ON public.quick_reply_templates ("companyId", "userId", "sortOrder", title)
  WHERE "deletedAt" IS NULL;
