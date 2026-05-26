-- ===========================================================================
-- 220_inbox_folders_drafts_signatures.sql
-- ---------------------------------------------------------------------------
-- WHAT:    Phase 2 of the communications unification (see
--          docs/architecture/communications-unification.md). Adds three
--          email-experience features the operator-facing inbox didn't
--          have yet:
--            1. Folder column on communications_log so messages can
--               live in inbox / sent / drafts / starred / archive /
--               trash without a separate table
--            2. email_drafts table — saved compose state (employee
--               clicks "Save as Draft" instead of "Send")
--            3. email_signatures table — per-user signatures, one
--               can be marked default and auto-appended
-- WHY:     Without folders + drafts, /inbox is just a flat list. Users
--          who started typing and got interrupted lost their work; a
--          finished message couldn't be filed or starred for later.
--          Operational UX gap explicitly flagged in the review feedback.
-- SAFETY:  Additive only — communications_log gains a column with a
--          'inbox' default so existing rows materialise into the
--          Inbox view. New tables have no FK constraints to existing
--          ones beyond companyId/userId. No backfill required.
-- @rollback:
--   ALTER TABLE public.communications_log
--     DROP COLUMN IF EXISTS folder,
--     DROP COLUMN IF EXISTS "isStarred";
--   DROP TABLE IF EXISTS public.email_signatures;
--   DROP TABLE IF EXISTS public.email_drafts;
-- ===========================================================================

-- 1. communications_log — folder + starred ------------------------------
-- Folder is a string so adding a new folder later is a deploy-only
-- change. The default ('inbox') is the natural home for inbound
-- messages; the messageSender writes 'sent' for outbound paths in a
-- follow-up commit.
ALTER TABLE public.communications_log
  ADD COLUMN IF NOT EXISTS folder varchar(30) NOT NULL DEFAULT 'inbox';

ALTER TABLE public.communications_log
  ADD COLUMN IF NOT EXISTS "isStarred" boolean NOT NULL DEFAULT false;

-- Partial index — the only queries that filter by folder are the
-- /inbox views, and they always filter by companyId first. Composite
-- index keeps the existing per-tenant scans fast.
CREATE INDEX IF NOT EXISTS idx_communications_log_company_folder
  ON public.communications_log("companyId", folder, "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_communications_log_starred
  ON public.communications_log("companyId", "createdAt" DESC)
  WHERE "isStarred" = true AND "deletedAt" IS NULL;

-- 2. email_drafts -------------------------------------------------------
-- A draft is a half-written message the employee saved instead of
-- sending. Owned by the user who created it (drafts are personal,
-- not company-wide). One draft per (user, optional thread) but the
-- table allows multiple — the operator can have many drafts open.
CREATE TABLE IF NOT EXISTS public.email_drafts (
  id              SERIAL PRIMARY KEY,
  "companyId"     integer NOT NULL,
  "userId"        integer NOT NULL,
  channel         varchar(20) NOT NULL,                   -- 'email' | 'sms' | 'whatsapp'
  recipient       varchar(300),
  "recipientName" varchar(200),
  subject         varchar(500),
  body            text NOT NULL DEFAULT '',
  "templateKey"   varchar(120),
  "relatedType"   varchar(60),
  "relatedId"     integer,
  "scheduledAt"   timestamp with time zone,
  "lastSavedAt"   timestamp with time zone DEFAULT now(),
  "createdAt"     timestamp with time zone DEFAULT now(),
  CONSTRAINT email_drafts_channel_check CHECK (channel IN ('email','sms','whatsapp'))
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_user
  ON public.email_drafts("companyId", "userId", "lastSavedAt" DESC);

-- 3. email_signatures ---------------------------------------------------
-- Per-user signature library. One row can be marked isDefault — the
-- compose dialog auto-appends it to the body. A user can keep many
-- signatures (formal/casual/legal) and pick from a dropdown.
CREATE TABLE IF NOT EXISTS public.email_signatures (
  id           SERIAL PRIMARY KEY,
  "companyId"  integer NOT NULL,
  "userId"     integer NOT NULL,
  name         varchar(120) NOT NULL,                     -- 'Formal' / 'Personal' / 'Legal'
  body         text NOT NULL,                             -- can be plain text or simple HTML
  "isDefault"  boolean NOT NULL DEFAULT false,
  "createdAt"  timestamp with time zone DEFAULT now(),
  "updatedAt"  timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_signatures_user
  ON public.email_signatures("companyId", "userId");

-- Only one default per user — partial unique index enforces it at DB
-- level so a race between two PATCH calls can't end up with two
-- defaults.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_signatures_default_per_user
  ON public.email_signatures("companyId", "userId")
  WHERE "isDefault" = true;
