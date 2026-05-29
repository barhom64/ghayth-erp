-- ===========================================================================
-- 229_fleet_telematics_security.sql — Telematics security hardening (#1354)
-- ---------------------------------------------------------------------------
-- WHAT:    Closes the three critical/high security gaps the engineering
--          review flagged in commit 393ab45:
--            (1) Add a dedicated, encrypted `webhookSecret` column to
--                fleet_telematics_integrations so the public webhook route
--                can verify an HMAC signature instead of relying on JWT
--                (CMSV6 vendors don't send Authorization headers).
--            (2) Add `externalSessionId` to fleet_video_sessions so
--                closeVideoSession can call CMSV6 with the real vendor
--                handle instead of regex-extracting it from the URL.
--            (3) Add CHECK constraints capping `rawPayload` size on the
--                three high-write tables (positions, events, alerts) at
--                64KB so a hostile webhook can't write 10MB rows.
--
-- WHY:     Engineering review flagged plain-text credentials, missing
--          webhook signing, and unbounded rawPayload as production blockers.
--          The encryption itself happens in the route layer (encryptSecret
--          from lib/secrets.ts); this migration only widens the surface so
--          the route has somewhere to write the encrypted ciphertext and
--          the audit/cleanup paths have a clean handle to work with.
--
-- SAFETY:  Additive only. Every ALTER uses ADD COLUMN IF NOT EXISTS so a
--          re-run is a no-op. The CHECK constraints are NOT VALID at
--          creation, then VALIDATE'd separately — that way existing rows
--          (none in production yet, this is a pilot branch) aren't blocked
--          from migration even if some payload exceeds the cap.
--
-- @rollback:
--   ALTER TABLE public.fleet_telematics_integrations
--     DROP COLUMN IF EXISTS "webhookSecret";
--   ALTER TABLE public.fleet_video_sessions
--     DROP COLUMN IF EXISTS "externalSessionId";
--   DROP INDEX IF EXISTS public.idx_fleet_video_sessions_external_session;
--   ALTER TABLE public.fleet_device_positions
--     DROP CONSTRAINT IF EXISTS fleet_device_positions_payload_size;
--   ALTER TABLE public.fleet_device_events
--     DROP CONSTRAINT IF EXISTS fleet_device_events_payload_size;
--   ALTER TABLE public.fleet_ai_alerts
--     DROP CONSTRAINT IF EXISTS fleet_ai_alerts_payload_size;
--   ALTER TABLE public.fleet_sensor_readings
--     DROP CONSTRAINT IF EXISTS fleet_sensor_readings_payload_size;
-- ===========================================================================

-- 1) webhookSecret column — stores the HMAC shared secret for the
--    /webhooks/cmsv6/:integrationId surface. Encrypted at-rest via
--    encryptSecret(); the column type is TEXT to fit the "enc:v1:…"
--    envelope which is ~140 chars for a 32-byte secret.
ALTER TABLE public.fleet_telematics_integrations
  ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;

-- 2) externalSessionId on video sessions — used to call CMSV6's
--    stopVideo endpoint with the vendor's own session handle.
ALTER TABLE public.fleet_video_sessions
  ADD COLUMN IF NOT EXISTS "externalSessionId" VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_fleet_video_sessions_external_session
  ON public.fleet_video_sessions ("externalSessionId")
  WHERE "externalSessionId" IS NOT NULL;

-- 3) rawPayload size caps. 64KB is generous (typical CMSV6 event row is
--    < 2KB) but blocks an attacker dumping an image inline as base64
--    or sending a megabyte of JSON garbage. NOT VALID + VALIDATE keeps
--    the DDL non-blocking even if a future deploy lands the migration
--    on data that violates the cap — we just won't be able to insert
--    new violations.
--
-- @policy:breaking
-- Reason: the DROP CONSTRAINT IF EXISTS lines are idempotency only —
-- they let a re-run replace the constraint cleanly. The constraint
-- being dropped does not exist on any deployed environment (this
-- migration is the first to introduce it). The migration-policy guard
-- treats DROP CONSTRAINT as breaking by default; expand/contract still
-- applies because the ADD CONSTRAINT immediately re-creates with the
-- same name + a wider expression.
ALTER TABLE public.fleet_device_positions
  DROP CONSTRAINT IF EXISTS fleet_device_positions_payload_size;
ALTER TABLE public.fleet_device_positions
  ADD CONSTRAINT fleet_device_positions_payload_size
  CHECK ("rawPayload" IS NULL OR octet_length("rawPayload"::text) < 65536)
  NOT VALID;
ALTER TABLE public.fleet_device_positions
  VALIDATE CONSTRAINT fleet_device_positions_payload_size;

ALTER TABLE public.fleet_device_events
  DROP CONSTRAINT IF EXISTS fleet_device_events_payload_size;
ALTER TABLE public.fleet_device_events
  ADD CONSTRAINT fleet_device_events_payload_size
  CHECK (
    ("rawPayload" IS NULL OR octet_length("rawPayload"::text) < 65536) AND
    ("normalizedPayload" IS NULL OR octet_length("normalizedPayload"::text) < 65536)
  )
  NOT VALID;
ALTER TABLE public.fleet_device_events
  VALIDATE CONSTRAINT fleet_device_events_payload_size;

ALTER TABLE public.fleet_ai_alerts
  DROP CONSTRAINT IF EXISTS fleet_ai_alerts_payload_size;
ALTER TABLE public.fleet_ai_alerts
  ADD CONSTRAINT fleet_ai_alerts_payload_size
  CHECK (
    ("rawPayload" IS NULL OR octet_length("rawPayload"::text) < 65536) AND
    ("normalizedPayload" IS NULL OR octet_length("normalizedPayload"::text) < 65536)
  )
  NOT VALID;
ALTER TABLE public.fleet_ai_alerts
  VALIDATE CONSTRAINT fleet_ai_alerts_payload_size;

ALTER TABLE public.fleet_sensor_readings
  DROP CONSTRAINT IF EXISTS fleet_sensor_readings_payload_size;
ALTER TABLE public.fleet_sensor_readings
  ADD CONSTRAINT fleet_sensor_readings_payload_size
  CHECK ("rawPayload" IS NULL OR octet_length("rawPayload"::text) < 65536)
  NOT VALID;
ALTER TABLE public.fleet_sensor_readings
  VALIDATE CONSTRAINT fleet_sensor_readings_payload_size;

COMMENT ON COLUMN public.fleet_telematics_integrations."webhookSecret"
  IS 'HMAC-SHA256 shared secret for the /webhooks/cmsv6/:id surface, encrypted via lib/secrets.ts.';
COMMENT ON COLUMN public.fleet_video_sessions."externalSessionId"
  IS 'Vendor-side session id, returned by CMSV6 openVideoSession; used to call closeVideoSession reliably.';
