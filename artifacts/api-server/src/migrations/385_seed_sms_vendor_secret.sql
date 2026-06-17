-- 385_seed_sms_vendor_secret.sql
-- Unify SMS (Twilio) provider config into the vendor_secrets hub so it is
-- configurable from /admin/vendor-settings exactly like Email + WhatsApp,
-- instead of living ONLY in the per-company system_settings key-value table
-- (which has no operator UI). This is the SMS half of the "توحيد المزوّدات"
-- cleanup — it removes the orphaned, UI-less SMS config path.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING — only inserts when the slug is
-- missing, never touches a row the operator already configured. Zero secrets
-- (every credential field is ""). authToken is encrypted at rest on save
-- (it is in vendorSettings SECRET_KEYS).
--
-- Precedence is UNCHANGED for existing installs: the cron SMS worker reads
-- per-company system_settings FIRST; this platform-wide row is only the
-- fallback for companies with no per-company SMS config.
--
-- @rollback: DELETE FROM public.vendor_secrets WHERE slug = 'sms' AND status = 'disabled' AND config = '{"accountSid":"","authToken":"","fromNumber":""}'::jsonb;
--            (removes only the untouched seed row; an operator-configured SMS row is left intact.)
INSERT INTO public.vendor_secrets (slug, name, description, status, config)
VALUES
  ('sms', 'SMS (Twilio)',
   'Twilio credentials for outbound SMS. Per-company system_settings (if set) override this platform-wide default.',
   'disabled', '{"accountSid":"","authToken":"","fromNumber":""}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
