-- ===========================================================================
-- 219_vendor_settings_hub.sql
-- Idempotent vendor settings foundation.
-- ===========================================================================

ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_type_check;

ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_type_check_v2;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_type_check_v2 CHECK (
    type IN (
      'email', 'sms', 'whatsapp', 'webhook',
      'pbx', 'push', 'sms_otp', 'siem', 'zatca',
      'stt', 'storage', 'object_storage'
    )
  );

CREATE TABLE IF NOT EXISTS public.vendor_secrets (
  id          SERIAL PRIMARY KEY,
  slug        varchar(80) NOT NULL UNIQUE,
  name        varchar(200) NOT NULL,
  description text,
  status      varchar(20) NOT NULL DEFAULT 'active',
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT vendor_secrets_status_check CHECK (status IN ('active','disabled'))
);

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
