-- ===========================================================================
-- 217_pbx_ivr_recordings.sql
-- ---------------------------------------------------------------------------
-- WHAT:    creates the four tables that complete the PBX/IVR/Recording side
--          of #1139 §3: IVR menus + options, extension-to-employee mapping,
--          and recording metadata (retention, file size). The
--          pbx_call_transcripts table from migration 215 already covers STT.
-- WHY:     §3 lists PBX/Voice/IVR/Recording as a single concern. The
--          existing /pbx/incoming webhook only returns a generic
--          "route_to_agent" action because there's nothing in the schema
--          to route TO. This migration gives the routing brain a target —
--          an extension, a department, or a sub-menu — and adds the
--          retention metadata recordings need before any compliance
--          conversation.
-- SAFETY:  additive only — four new tables, FKs on options→menus and
--          recordings→pbx_calls. No backfill, no impact on the existing
--          PBX webhook path; that path now optionally consults
--          ivr_menus + pbx_extensions but falls back to the legacy
--          "route_to_agent" answer when no menu matches.
-- @rollback:
--   DROP TABLE IF EXISTS public.pbx_call_recordings;
--   DROP TABLE IF EXISTS public.pbx_extensions;
--   DROP TABLE IF EXISTS public.ivr_menu_options;
--   DROP TABLE IF EXISTS public.ivr_menus;
-- ===========================================================================

-- 1. IVR menus -------------------------------------------------------------
-- One row per top-level IVR menu. Greeting text is what the TTS engine
-- (or the PBX vendor's text-to-speech) reads when the menu starts.
-- Fallback action runs when no key is pressed within the timeout —
-- either route to a default extension or hang up.
CREATE TABLE IF NOT EXISTS public.ivr_menus (
  id              SERIAL PRIMARY KEY,
  "companyId"     integer NOT NULL,
  slug            varchar(80) NOT NULL,                -- 'main' / 'after-hours' / 'support' …
  name            varchar(200) NOT NULL,
  "greetingText"  text NOT NULL,
  "greetingAudioUrl" text,                              -- optional pre-recorded greeting
  language        varchar(10) NOT NULL DEFAULT 'ar',
  "timeoutSeconds" integer NOT NULL DEFAULT 10,
  "fallbackAction" varchar(20) NOT NULL DEFAULT 'hangup', -- 'hangup' | 'extension' | 'menu'
  "fallbackTargetExtension" varchar(20),
  "fallbackTargetMenuId" integer,
  status          varchar(20) NOT NULL DEFAULT 'active', -- 'active' | 'disabled'
  notes           text,
  "createdAt"     timestamp with time zone DEFAULT now(),
  "updatedAt"     timestamp with time zone DEFAULT now(),
  CONSTRAINT ivr_menus_status_check CHECK (status IN ('active','disabled')),
  CONSTRAINT ivr_menus_fallback_check CHECK ("fallbackAction" IN ('hangup','extension','menu')),
  CONSTRAINT ivr_menus_company_slug_unique UNIQUE ("companyId", slug)
);

CREATE INDEX IF NOT EXISTS idx_ivr_menus_company_status
  ON public.ivr_menus("companyId", status);

-- 2. IVR menu options ------------------------------------------------------
-- One row per DTMF key (0-9, *, #) in a menu. Action says what
-- happens when the caller presses that key — connect to an extension,
-- jump to a sub-menu, drop to voicemail, or hang up.
CREATE TABLE IF NOT EXISTS public.ivr_menu_options (
  id            SERIAL PRIMARY KEY,
  "menuId"      integer NOT NULL REFERENCES public.ivr_menus(id) ON DELETE CASCADE,
  "dtmfKey"     varchar(2) NOT NULL,                   -- '0'-'9' | '*' | '#'
  label         varchar(200) NOT NULL,                 -- "اضغط 1 للمبيعات"
  action        varchar(20) NOT NULL,                  -- 'extension' | 'menu' | 'voicemail' | 'hangup' | 'department'
  "targetExtension" varchar(20),
  "targetMenuId"    integer REFERENCES public.ivr_menus(id) ON DELETE SET NULL,
  "targetDepartmentId" integer,
  "sortOrder"   integer NOT NULL DEFAULT 0,
  CONSTRAINT ivr_menu_options_action_check
    CHECK (action IN ('extension','menu','voicemail','hangup','department')),
  CONSTRAINT ivr_menu_options_menu_key_unique UNIQUE ("menuId", "dtmfKey")
);

CREATE INDEX IF NOT EXISTS idx_ivr_menu_options_menu
  ON public.ivr_menu_options("menuId", "sortOrder");

-- 3. PBX extensions --------------------------------------------------------
-- The mapping from a dialable extension number to the employee or
-- department that owns it. The IVR resolver returns the extension
-- string; the PBX vendor handles the actual SIP routing.
CREATE TABLE IF NOT EXISTS public.pbx_extensions (
  id              SERIAL PRIMARY KEY,
  "companyId"     integer NOT NULL,
  extension       varchar(20) NOT NULL,                -- '1001' / '2050'
  name            varchar(200) NOT NULL,
  "employeeId"    integer,                              -- nullable: department-only ext
  "departmentId"  integer,                              -- nullable: employee-only ext
  type            varchar(20) NOT NULL DEFAULT 'employee', -- 'employee' | 'department' | 'queue' | 'voicemail'
  status          varchar(20) NOT NULL DEFAULT 'active', -- 'active' | 'disabled'
  "ringTimeoutSeconds" integer NOT NULL DEFAULT 30,
  "voicemailEnabled"   boolean NOT NULL DEFAULT true,
  notes           text,
  "createdAt"     timestamp with time zone DEFAULT now(),
  "updatedAt"     timestamp with time zone DEFAULT now(),
  CONSTRAINT pbx_extensions_status_check CHECK (status IN ('active','disabled')),
  CONSTRAINT pbx_extensions_type_check CHECK (type IN ('employee','department','queue','voicemail')),
  CONSTRAINT pbx_extensions_company_ext_unique UNIQUE ("companyId", extension)
);

CREATE INDEX IF NOT EXISTS idx_pbx_extensions_company_status
  ON public.pbx_extensions("companyId", status);
CREATE INDEX IF NOT EXISTS idx_pbx_extensions_employee
  ON public.pbx_extensions("employeeId")
  WHERE "employeeId" IS NOT NULL;

-- 4. Call recordings -------------------------------------------------------
-- pbx_calls already has a `recordingUrl` column, but no retention
-- metadata — meaning operators can't tell when a recording is past
-- its legal retention window. This table adds size, retention
-- expiry, and a soft-deleted status so the cleanup job has a target.
CREATE TABLE IF NOT EXISTS public.pbx_call_recordings (
  id                  SERIAL PRIMARY KEY,
  "callId"            integer NOT NULL REFERENCES public.pbx_calls(id) ON DELETE CASCADE,
  "companyId"         integer NOT NULL,
  "recordingUrl"      text NOT NULL,
  "durationMs"        integer DEFAULT 0,
  "fileSizeBytes"     bigint DEFAULT 0,
  "retentionExpiresAt" timestamp with time zone,
  status              varchar(20) NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'deleted'
  "deletedAt"         timestamp with time zone,
  "createdAt"         timestamp with time zone DEFAULT now(),
  CONSTRAINT pbx_call_recordings_status_check
    CHECK (status IN ('active','expired','deleted')),
  CONSTRAINT pbx_call_recordings_call_unique UNIQUE ("callId")
);

CREATE INDEX IF NOT EXISTS idx_pbx_call_recordings_company_status
  ON public.pbx_call_recordings("companyId", status);
CREATE INDEX IF NOT EXISTS idx_pbx_call_recordings_retention
  ON public.pbx_call_recordings("retentionExpiresAt")
  WHERE status = 'active';
