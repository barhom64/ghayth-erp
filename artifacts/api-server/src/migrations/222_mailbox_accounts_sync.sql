-- ===========================================================================
-- 222_mailbox_accounts_sync.sql
-- ---------------------------------------------------------------------------
-- WHAT:    Phase 2.x of communications unification — IMAP / Microsoft
--          Graph mailbox sync foundation. Adds the persistence layer for
--          per-user mailbox connections + an inbound sync cursor so the
--          cron worker knows where to resume.
--
--          1. mailbox_accounts — one row per connected mailbox. Holds
--             provider (microsoft365 / imap / hostinger), display address,
--             OAuth tokens (encrypted at rest via secrets.ts) for Graph
--             accounts, or IMAP host+port+password (encrypted) for IMAP
--             accounts. Linked to user via userId so each employee
--             connects their own inbox.
--
--          2. mailbox_sync_cursors — last-synced state per account. For
--             Microsoft Graph this is the delta token (skipToken). For
--             IMAP it's the last fetched UID. Separated from the main
--             account row so a re-sync doesn't bump updatedAt on the
--             account itself.
--
-- WHY:     /inbox today only shows what was sent through the system or
--          inbound webhooks. Operators want to see their actual mailbox
--          (Microsoft 365 corporate accounts via Graph, or Hostinger
--          SMTP/IMAP for smaller deployments). This migration is the
--          STORAGE half; the cron worker + Graph/IMAP clients are the
--          follow-up slice.
--
-- SAFETY:  Additive only — no existing table touched. Token columns are
--          plaintext-typed (text) but messageSender.ts pattern dictates
--          callers encrypt with encryptSecret() before insert and
--          decrypt with decryptSecret() on read. There's no DB-level
--          encryption; secrets.ts handles it.
--
-- @rollback:
--   DROP TABLE IF EXISTS public.mailbox_sync_cursors;
--   DROP TABLE IF EXISTS public.mailbox_accounts;
-- ===========================================================================

-- 1. mailbox_accounts -------------------------------------------------------
-- One row per (companyId, userId, emailAddress). Composite unique so a
-- user can connect multiple mailboxes if they wear multiple hats. The
-- provider determines which token columns are populated:
--   microsoft365 → accessToken + refreshToken + tokenExpiresAt
--   imap         → imapHost + imapPort + imapUsername + imapPassword
--   hostinger    → same as imap with provider hint for the worker
-- A NULL field is OK for a column the provider doesn't use; the worker
-- inspects `provider` to decide which columns to read.
CREATE TABLE IF NOT EXISTS public.mailbox_accounts (
  id                   SERIAL PRIMARY KEY,
  "companyId"          integer NOT NULL,
  "userId"             integer NOT NULL,
  provider             varchar(30) NOT NULL,                    -- 'microsoft365' | 'imap' | 'hostinger'
  "displayName"        varchar(200),                            -- "البريد الرسمي" / "Sales mailbox"
  "emailAddress"       varchar(300) NOT NULL,
  -- OAuth (microsoft365)
  "accessToken"        text,                                    -- encrypted, ~30k chars after wrap
  "refreshToken"       text,                                    -- encrypted
  "tokenExpiresAt"     timestamp with time zone,
  "tenantId"           varchar(120),                            -- Azure AD tenant id
  -- IMAP/SMTP
  "imapHost"           varchar(200),
  "imapPort"           integer,
  "imapUsername"       varchar(200),
  "imapPassword"       text,                                    -- encrypted
  "smtpHost"           varchar(200),
  "smtpPort"           integer,
  "smtpUsername"       varchar(200),
  "smtpPassword"       text,                                    -- encrypted
  -- Sync controls
  "syncEnabled"        boolean NOT NULL DEFAULT true,
  "syncFolders"        text[],                                  -- ['INBOX','Sent'] — NULL = all
  "lastSyncedAt"       timestamp with time zone,
  "lastSyncStatus"     varchar(30),                             -- 'ok' | 'error' | 'auth_expired'
  "lastSyncError"      text,
  "createdAt"          timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"          timestamp with time zone NOT NULL DEFAULT now(),
  "deletedAt"          timestamp with time zone,
  CONSTRAINT mailbox_accounts_provider_check
    CHECK (provider IN ('microsoft365','imap','hostinger'))
);

-- Composite unique so a duplicate connect attempt fails fast instead of
-- creating ghost rows. Predicate excludes soft-deleted rows so a user
-- can reconnect after deleting.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mailbox_accounts_per_user
  ON public.mailbox_accounts("companyId", "userId", "emailAddress")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_mailbox_accounts_company_user
  ON public.mailbox_accounts("companyId", "userId")
  WHERE "deletedAt" IS NULL;

-- Worker poll: rows where syncEnabled=true ordered by lastSyncedAt
-- ascending so a never-synced account jumps to the head of the queue.
CREATE INDEX IF NOT EXISTS idx_mailbox_accounts_sync_due
  ON public.mailbox_accounts("lastSyncedAt" ASC NULLS FIRST)
  WHERE "syncEnabled" = true AND "deletedAt" IS NULL;

-- 2. mailbox_sync_cursors ---------------------------------------------------
-- Cursor per (accountId, folder). For Graph the cursor is a deltaLink
-- url; for IMAP it's the last fetched UID. Stored separately so a sync
-- run can update the cursor without touching mailbox_accounts.updatedAt.
CREATE TABLE IF NOT EXISTS public.mailbox_sync_cursors (
  id                   SERIAL PRIMARY KEY,
  "accountId"          integer NOT NULL REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  folder               varchar(200) NOT NULL,                   -- 'INBOX', 'Sent', or Graph folderId
  "deltaToken"         text,                                    -- microsoft graph delta link
  "lastUid"            bigint,                                  -- imap last UID
  "lastFetchedAt"      timestamp with time zone,
  "messagesFetched"    integer NOT NULL DEFAULT 0,
  "createdAt"          timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_mailbox_sync_cursors_per_folder
  ON public.mailbox_sync_cursors("accountId", folder);

CREATE INDEX IF NOT EXISTS idx_mailbox_sync_cursors_account
  ON public.mailbox_sync_cursors("accountId");
