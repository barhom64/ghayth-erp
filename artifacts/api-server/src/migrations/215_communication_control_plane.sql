-- ===========================================================================
-- 215_communication_control_plane.sql
-- ---------------------------------------------------------------------------
-- WHAT:    creates three tables that ground the Communication Control Plane
--          from #1139 §3: a registry of communication providers (mirrors the
--          AI provider registry from migration 214), a DLP rule table for
--          outbound-message scanning, and a PBX call transcript table so the
--          schema is ready for the speech-to-text rollout even before the
--          STT vendor is wired.
-- WHY:     §3 calls for a Unified Inbox + provider failover + DLP + STT
--          + AI summarisation of calls. The two registries make failover
--          + DLP operational today; the transcripts table is the seam
--          STT writes to when it lands. No telephony or audio code here.
-- SAFETY:  additive only — three new tables, FKs on transcript→pbx_calls
--          only, no backfill, no live-system impact. Default DLP rules
--          are seeded with redaction-only actions so the existing send
--          path remains unaffected until an operator opts a rule into
--          'block'.
-- @rollback:
--   DROP TABLE IF EXISTS public.pbx_call_transcripts;
--   DROP TABLE IF EXISTS public.communication_dlp_rules;
--   DROP TABLE IF EXISTS public.communication_providers;
-- ===========================================================================

-- 1. Provider registry -----------------------------------------------------
-- Mirrors ai_providers (migration 214). One row per (channel, provider)
-- combination — e.g. ('email','smtp-primary'), ('email','smtp-failover'),
-- ('whatsapp','meta-cloud-api'). Priority drives the failover order
-- inside a channel; status gates whether the runtime should even try.
CREATE TABLE IF NOT EXISTS public.communication_providers (
  id           SERIAL PRIMARY KEY,
  channel      varchar(20)  NOT NULL,                  -- 'email' | 'whatsapp' | 'sms' | 'pbx' | 'webhook'
  slug         varchar(80)  NOT NULL,                  -- 'smtp-primary' / 'meta-cloud-api' …
  name         varchar(200) NOT NULL,                  -- human-readable label (Arabic-OK)
  status       varchar(20)  NOT NULL DEFAULT 'active', -- 'active' | 'disabled' | 'failover-only'
  priority     integer      NOT NULL DEFAULT 100,      -- lower = tried first
  -- Mirror the AI registry's env-key convention: config holds env-var
  -- names, not the secrets themselves. The actual credentials still
  -- live in lib/config.ts.
  config       jsonb        NOT NULL DEFAULT '{}'::jsonb,
  notes        text,
  "createdAt"  timestamp with time zone DEFAULT now(),
  "updatedAt"  timestamp with time zone DEFAULT now(),
  CONSTRAINT communication_providers_status_check
    CHECK (status IN ('active','disabled','failover-only')),
  CONSTRAINT communication_providers_channel_slug_unique UNIQUE (channel, slug)
);

CREATE INDEX IF NOT EXISTS idx_communication_providers_channel_priority
  ON public.communication_providers(channel, priority)
  WHERE status <> 'disabled';

-- 2. DLP rules -------------------------------------------------------------
-- Outbound-message scan rules. A rule fires when its `pattern` (a
-- POSIX regex string) matches the message body or subject; the
-- `action` decides what happens — 'redact' replaces the match with
-- the configured replacement, 'block' refuses to send, 'flag'
-- records a warning but still sends. Channel filter is nullable so
-- a rule can apply to all outbound channels.
CREATE TABLE IF NOT EXISTS public.communication_dlp_rules (
  id           SERIAL PRIMARY KEY,
  "companyId"  integer,                                -- nullable = platform-wide rule
  name         varchar(200) NOT NULL,
  description  text,
  channel      varchar(20),                            -- nullable = applies to all channels
  pattern      text         NOT NULL,                  -- POSIX regex
  action       varchar(20)  NOT NULL DEFAULT 'flag',   -- 'flag' | 'redact' | 'block'
  replacement  varchar(60)  DEFAULT '[REDACTED]',
  severity     varchar(20)  NOT NULL DEFAULT 'warning',-- 'info' | 'warning' | 'critical'
  enabled      boolean      NOT NULL DEFAULT true,
  "createdAt"  timestamp with time zone DEFAULT now(),
  "updatedAt"  timestamp with time zone DEFAULT now(),
  CONSTRAINT communication_dlp_rules_action_check
    CHECK (action IN ('flag','redact','block')),
  CONSTRAINT communication_dlp_rules_severity_check
    CHECK (severity IN ('info','warning','critical'))
);

CREATE INDEX IF NOT EXISTS idx_communication_dlp_rules_company_enabled
  ON public.communication_dlp_rules("companyId", enabled)
  WHERE enabled = true;

-- 3. PBX call transcripts --------------------------------------------------
-- STT-ready table. Even before a speech-to-text vendor is integrated,
-- having this schema means the AI summarisation step from §3 has a
-- target to read from, and the operator UI can show "transcription
-- pending" instead of a missing column. Transcript rows are 1:1 with
-- a recording — re-transcribing a call replaces the existing row.
CREATE TABLE IF NOT EXISTS public.pbx_call_transcripts (
  id              SERIAL PRIMARY KEY,
  "callId"        integer NOT NULL REFERENCES public.pbx_calls(id) ON DELETE CASCADE,
  "companyId"     integer NOT NULL,
  provider        varchar(60),                         -- 'whisper' / 'azure-speech' / …
  language        varchar(10),                         -- ISO 639-1: 'ar' | 'en'
  transcript      text,                                -- full transcript, plain text
  summary         text,                                -- AI summary (cross-references ai_request_logs)
  status          varchar(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'transcribing' | 'completed' | 'failed'
  "errorMessage"  text,
  "transcribedAt" timestamp with time zone,
  "summarisedAt"  timestamp with time zone,
  "createdAt"     timestamp with time zone DEFAULT now(),
  CONSTRAINT pbx_call_transcripts_status_check
    CHECK (status IN ('pending','transcribing','completed','failed')),
  CONSTRAINT pbx_call_transcripts_call_unique UNIQUE ("callId")
);

CREATE INDEX IF NOT EXISTS idx_pbx_call_transcripts_company_status
  ON public.pbx_call_transcripts("companyId", status);

-- 4. Seed default DLP rules -----------------------------------------
-- The two universally-applicable rules: never leak a Saudi national
-- ID or an IBAN through an outbound message. Action is 'redact' so
-- existing send paths keep working; an operator can flip to 'block'
-- in the UI when they're ready to harden.
INSERT INTO public.communication_dlp_rules (name, description, pattern, action, replacement, severity, enabled)
VALUES
  ('Saudi National ID', 'يمنع تسرّب أرقام الهوية الوطنية السعودية في الرسائل الصادرة',
   '\m[12]\d{9}\M', 'redact', '[NID-REDACTED]', 'critical', true),
  ('IBAN', 'يمنع تسرّب أرقام الـ IBAN في الرسائل الصادرة',
   '\mSA\d{22}\M', 'redact', '[IBAN-REDACTED]', 'critical', true)
ON CONFLICT DO NOTHING;
