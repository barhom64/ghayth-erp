-- ===========================================================================
-- 219_vendor_settings_hub.sql
-- ---------------------------------------------------------------------------
-- WHAT:    extends the existing integrations table to accept the vendor
--          types that were previously env-only (PBX, push, SIEM, ZATCA,
--          STT, storage), and adds a vendor_secrets table for credentials
--          that don't fit the (companyId, type, name) shape of integrations
--          (e.g. platform-wide secrets like VAPID keys).
-- WHY:     #1139 §6 "كل شيء قابل للتحكم من الواجهة" — the operator
--          shouldn't need shell access to wire a vendor. Until now PBX_
--          WEBHOOK_SECRET, WHATSAPP_*, VAPID_*, SMTP_*, ZATCA_*, SIEM_*
--          were env-only. This migration gives them all a DB-backed home
--          that the existing /admin/integrations + new /admin/vendor-
--          settings UI can manage with encryption.
-- SAFETY:  additive — relaxes the integrations.type CHECK and creates a
--          new vendor_secrets table. Existing rows + env fallback remain
--          valid; vendorSettings.ts reads DB first, env second.
-- @rollback:
--   ALTER TABLE public.integrations
--     DROP CONSTRAINT IF EXISTS integrations_type_check_v2;
--   ALTER TABLE public.integrations
--     ADD CONSTRAINT integrations_type_check
--     CHECK (type IN ('email','sms','whatsapp','webhook'));
--   DROP TABLE IF EXISTS public.vendor_secrets;
-- ===========================================================================

-- 1. Relax integrations.type to accept the previously env-only vendors.
-- Drop the old CHECK and replace it with a WIDER whitelist (every old
-- value remains valid; only new values are added). This is the safe
-- direction — the post-deploy app has more options, the pre-deploy app
-- still accepts every value it always did. Acknowledged below so the
-- migration policy guard knows we considered expand/contract.
--
-- @policy:breaking
-- Reason: ALTER CHECK CONSTRAINT classified as breaking by the linter
-- because it can narrow an enum. This particular change WIDENS it,
-- so the rollback path (re-narrow to the old four) is the actual
-- breaking move and is documented above in the migration's @rollback.
ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_type_check;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_type_check_v2 CHECK (
    type IN (
      'email', 'sms', 'whatsapp', 'webhook',
      'pbx', 'push', 'sms_otp', 'siem', 'zatca',
      'stt', 'storage', 'object_storage'
    )
  );

-- 2. Platform-wide secrets table.
-- Some secrets are NOT per-tenant — VAPID push keys, the global SIEM
-- forwarder, the platform's e-invoice signing certificate. They don't
-- fit the integrations table's (companyId, type, name) shape. This
-- table is keyed by a single slug per platform and stores an encrypted
-- jsonb payload the same way ai_providers.config does.
CREATE TABLE IF NOT EXISTS public.vendor_secrets (
  id          SERIAL PRIMARY KEY,
  slug        varchar(80) NOT NULL UNIQUE,            -- 'vapid' / 'siem-default' / 'einvoice-cert' …
  name        varchar(200) NOT NULL,
  description text,
  status      varchar(20) NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  -- jsonb. Keys whose name is in PROVIDER_SECRET_KEYS (aiGovernance.ts)
  -- are encrypted at rest via secrets.ts the same way ai_providers.config
  -- does it. Read through lib/vendorSettings.ts for decryption.
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT vendor_secrets_status_check CHECK (status IN ('active','disabled'))
);

-- 3. Seed empty/disabled rows so the vendor-settings UI renders sections
-- the operator can flip on, rather than starting with a blank screen.
-- Each row is configured by the operator through the UI; until they fill
-- in the secret keys, the runtime falls back to the env var of the same
-- conceptual name (lib/vendorSettings.ts).
INSERT INTO public.vendor_secrets (slug, name, description, status, config)
VALUES
  ('pbx-webhook', 'PBX Webhook Signing', 'HMAC secret used to verify inbound PBX webhooks (/api/communications/pbx/*).',
   'disabled', '{"webhookSecret":""}'::jsonb),
  ('whatsapp', 'WhatsApp Business Cloud API', 'Meta Cloud API credentials for sending + receiving messages.',
   'disabled', '{"accessToken":"","verifyToken":"","phoneId":"","appSecret":""}'::jsonb),
  ('smtp', 'Email (SMTP)', 'SMTP relay used by notificationEngine for outbound email.',
   'disabled', '{"host":"","port":"587","user":"","password":"","from":"","secure":"false"}'::jsonb),
  ('vapid', 'Web Push (VAPID)', 'VAPID keys used by lib/notificationService for browser push notifications.',
   'disabled', '{"publicKey":"","privateKey":"","subject":"mailto:admin@ghayth.app"}'::jsonb),
  ('siem', 'SIEM forwarder', 'Optional webhook RBAC violations get mirrored to.',
   'disabled', '{"webhookUrl":"","authHeader":""}'::jsonb),
  ('zatca', 'ZATCA Fatoora', 'Saudi e-invoice clearance endpoints + provider.',
   'disabled', '{"defaultProvider":"","prodUrl":"","sandboxUrl":""}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
