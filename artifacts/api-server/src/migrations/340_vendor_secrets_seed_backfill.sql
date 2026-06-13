-- ===========================================================================
-- 340_vendor_secrets_seed_backfill.sql
-- ---------------------------------------------------------------------------
-- WHAT:    re-seed the six canonical vendor_secrets rows (pbx-webhook,
--          whatsapp, smtp, vapid, siem, zatca) with EMPTY / disabled
--          config so /admin/vendor-settings renders the provider cards.
--          NO secrets — every credential field is "" exactly as the
--          original seed in 219_vendor_settings_hub.sql.
--
-- WHY:     production (and every fresh install) shows an empty Vendor
--          Settings page — «لا توجد سجلات إعداد. طبّق migration 219
--          أولاً» — because migration 219's SEED is orphaned:
--
--            • db/schema_pre.sql is SCHEMA-ONLY: it carries the
--              vendor_secrets TABLE (CREATE TABLE) but not its DATA rows.
--            • db/.baseline-cutoff = 297, and 219 <= 297, so the
--              bootstrap marks 219 as "applied" WITHOUT running it —
--              its INSERT … VALUES (the six rows) never executes.
--            • net result: the table exists but is EMPTY on every fresh
--              install, so the SMTP card the operator needs (#2137)
--              never appears.
--
--          This is the same orphaned-seed class as #2153. A baselined
--          migration cannot be re-run (schema_migrations already lists
--          it), so the canonical fix is a NEW migration numbered ABOVE
--          the cutoff (340 > 297) that replays the seed idempotently —
--          on production's next boot AND on every fresh install.
--
-- SAFETY:  purely additive + idempotent. ON CONFLICT (slug) DO NOTHING
--          means a row the operator has ALREADY created/configured
--          (e.g. an active smtp with real Hostinger credentials) is
--          left completely untouched — this only fills in slugs that
--          are MISSING. Re-running the migration is a no-op. Contains
--          zero secrets.
--
-- @rollback:
--   -- Only removes rows that are still in the pristine seeded state
--   -- (disabled + empty/default config); never touches a row the
--   -- operator has configured.
--   DELETE FROM public.vendor_secrets
--    WHERE slug IN ('pbx-webhook','whatsapp','smtp','vapid','siem','zatca')
--      AND status = 'disabled';
-- ===========================================================================

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
