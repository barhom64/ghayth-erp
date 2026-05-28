-- ===========================================================================
-- 228_fleet_telematics.sql — Fleet Telematics / CMSV6 / AI MDVR / Sensors
-- ---------------------------------------------------------------------------
-- WHAT:    Foundation schema for the AI MDVR / CMSV6 telematics integration
--          described in issue #1354. Adds ten domain tables for devices,
--          positions, events, sensors, video sessions, AI alerts, media
--          evidence and a sync-log for every CMSV6 round-trip.
--
-- WHY:     Ghayth needs to receive GPS, AI safety alarms (ADAS / DMS / BSD),
--          dump-truck sensor telemetry (fuel, weight, air, dump piston, PTO,
--          door) and on-demand RTSP/HLS video sessions from the Eastyle
--          ES-M518AW-AI 8CH 1080P MDVR kits. CMSV6 is the Service Provider;
--          Ghayth remains the Leader Path that owns the decision, analytics
--          and reporting surface. Persisting normalised telemetry in our own
--          schema means a CMSV6 outage does not blind the operator and we can
--          attach evidence to fleet incidents, payroll deductions, accidents
--          and obligations in the existing engines.
--
-- SAFETY:  zero-downtime, additive only. Every table uses CREATE TABLE IF NOT
--          EXISTS so re-applying the migration is a no-op. No existing column
--          is touched. Soft-delete (deletedAt) is supported everywhere a
--          configuration row can be retired without losing audit history.
--
-- @rollback:
--   -- Drop in FK-respecting order: children before parents. The previous
--   -- ordering dropped `fleet_telematics_integrations` before
--   -- `fleet_telematics_devices`, but devices.integrationId FK-references
--   -- integrations — Postgres would reject the parent DROP while the child
--   -- still existed. Caught by Ibrahim during final review.
--   DROP TABLE IF EXISTS public.fleet_device_sync_logs;
--   DROP TABLE IF EXISTS public.fleet_media_evidence;
--   DROP TABLE IF EXISTS public.fleet_ai_alerts;
--   DROP TABLE IF EXISTS public.fleet_video_sessions;
--   DROP TABLE IF EXISTS public.fleet_video_channels;
--   DROP TABLE IF EXISTS public.fleet_sensor_readings;
--   DROP TABLE IF EXISTS public.fleet_device_events;
--   DROP TABLE IF EXISTS public.fleet_device_positions;
--   DROP TABLE IF EXISTS public.fleet_telematics_devices;
--   DROP TABLE IF EXISTS public.fleet_telematics_integrations;
-- ===========================================================================

-- 1) Per-company CMSV6 (or other vendor) integration row. Stores the
--    base URL, credentials reference (slug in vendor_secrets), polling
--    cadence and last-sync watermark. Status lets the operator pause
--    sync without deleting the row.
CREATE TABLE IF NOT EXISTS public.fleet_telematics_integrations (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  provider          VARCHAR(40) NOT NULL DEFAULT 'cmsv6',
  "displayName"     VARCHAR(120) NOT NULL,
  "baseUrl"         TEXT NOT NULL,
  "vendorSecretSlug" VARCHAR(80),
  "pollIntervalSec" INTEGER NOT NULL DEFAULT 30,
  "videoOnDemandOnly" BOOLEAN NOT NULL DEFAULT TRUE,
  status            VARCHAR(20) NOT NULL DEFAULT 'inactive',
  "lastSyncAt"      TIMESTAMP WITH TIME ZONE,
  "lastSyncStatus"  VARCHAR(20),
  "lastSyncError"   TEXT,
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes             TEXT,
  "createdAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy"       INTEGER,
  "updatedAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "deletedAt"       TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fleet_telematics_integrations_provider_check
    CHECK (provider IN ('cmsv6', 'wialon', 'teltonika', 'manual')),
  CONSTRAINT fleet_telematics_integrations_status_check
    CHECK (status IN ('active', 'inactive', 'error', 'paused'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_telematics_integrations_company
  ON public.fleet_telematics_integrations ("companyId", status)
  WHERE "deletedAt" IS NULL;

-- 2) Device registry — one row per physical MDVR / GPS box, optionally
--    linked to a vehicle. CMSV6 identifies devices by deviceNo; we keep
--    that mapping plus an Sim/IMEI for off-platform diagnostics.
CREATE TABLE IF NOT EXISTS public.fleet_telematics_devices (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "integrationId"   INTEGER REFERENCES public.fleet_telematics_integrations(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "cmsv6DeviceNo"   VARCHAR(60) NOT NULL,
  "deviceLabel"     VARCHAR(120),
  "deviceModel"     VARCHAR(80),
  "firmwareVersion" VARCHAR(80),
  "channelCount"    SMALLINT NOT NULL DEFAULT 4,
  imei              VARCHAR(40),
  sim               VARCHAR(40),
  "plateNumber"     VARCHAR(40),
  status            VARCHAR(20) NOT NULL DEFAULT 'unlinked',
  "lastOnlineAt"    TIMESTAMP WITH TIME ZONE,
  "lastOfflineAt"   TIMESTAMP WITH TIME ZONE,
  "lastPositionAt"  TIMESTAMP WITH TIME ZONE,
  capabilities      JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes             TEXT,
  "createdAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy"       INTEGER,
  "updatedAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "deletedAt"       TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fleet_telematics_devices_status_check
    CHECK (status IN ('unlinked', 'linked', 'online', 'offline', 'error', 'decommissioned'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_telematics_devices_company_deviceno
  ON public.fleet_telematics_devices ("companyId", "cmsv6DeviceNo")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_telematics_devices_vehicle
  ON public.fleet_telematics_devices ("vehicleId")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_telematics_devices_company_status
  ON public.fleet_telematics_devices ("companyId", status)
  WHERE "deletedAt" IS NULL;

-- 3) Live + historical positions. Heavy write table — partitioning is a
--    future concern; tested up to 100 vehicles polling every 30s
--    (~288k rows/day) which Postgres handles fine on a single table
--    with the `(deviceId, occurredAt DESC)` index. The retention cron
--    (migration 230 + lib/fleet/telematicsCron.ts) caps row growth at
--    `positionRetentionDays` per integration (default 90 days).
CREATE TABLE IF NOT EXISTS public.fleet_device_positions (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "occurredAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
  "receivedAt"      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  lat               NUMERIC(10, 6) NOT NULL,
  lng               NUMERIC(10, 6) NOT NULL,
  speed             NUMERIC(6, 2),
  direction         NUMERIC(6, 2),
  altitude          NUMERIC(8, 2),
  accuracy          NUMERIC(6, 2),
  "ignitionOn"      BOOLEAN,
  "satelliteCount"  SMALLINT,
  "rawPayload"      JSONB,
  CONSTRAINT fleet_device_positions_lat_range CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT fleet_device_positions_lng_range CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_fleet_positions_device_time
  ON public.fleet_device_positions ("deviceId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_positions_company_time
  ON public.fleet_device_positions ("companyId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_positions_vehicle_time
  ON public.fleet_device_positions ("vehicleId", "occurredAt" DESC);

-- 4) Generic device events — online/offline, harsh braking, speeding,
--    SD card removed, etc. Distinct from AI alerts (which have a
--    confidence/severity surface).
CREATE TABLE IF NOT EXISTS public.fleet_device_events (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "eventType"       VARCHAR(60) NOT NULL,
  "eventCode"       VARCHAR(40),
  severity          VARCHAR(20) NOT NULL DEFAULT 'info',
  "occurredAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
  "receivedAt"      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  lat               NUMERIC(10, 6),
  lng               NUMERIC(10, 6),
  speed             NUMERIC(6, 2),
  message           TEXT,
  "externalEventId" VARCHAR(120),
  "rawPayload"      JSONB,
  "normalizedPayload" JSONB,
  CONSTRAINT fleet_device_events_severity_check
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical'))
);

-- Idempotency — a single (device, externalEventId) pair must never
-- insert twice even if CMSV6 replays the webhook or the sync poller
-- overlaps with its predecessor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_device_events_dedup
  ON public.fleet_device_events ("deviceId", "externalEventId")
  WHERE "externalEventId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_device_events_company_time
  ON public.fleet_device_events ("companyId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_device_events_vehicle_type
  ON public.fleet_device_events ("vehicleId", "eventType");

-- 5) Sensor readings — fuel / weight / air pressure / PTO / dump piston
--    / door. unit + value pair stays generic so adding a new sensor type
--    later is a configuration change, not a schema change.
CREATE TABLE IF NOT EXISTS public.fleet_sensor_readings (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "sensorType"      VARCHAR(40) NOT NULL,
  "sensorChannel"   VARCHAR(40),
  "readingValue"    NUMERIC(14, 4),
  "readingState"    VARCHAR(40),
  unit              VARCHAR(20),
  "occurredAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
  "receivedAt"      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "externalReadingId" VARCHAR(120),
  "rawPayload"      JSONB,
  CONSTRAINT fleet_sensor_readings_type_check CHECK (
    "sensorType" IN (
      'fuel_level', 'weight', 'air_pressure', 'pto', 'dump_piston',
      'door', 'temperature', 'engine_rpm', 'battery_voltage',
      'odometer', 'custom'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_sensor_readings_dedup
  ON public.fleet_sensor_readings ("deviceId", "externalReadingId")
  WHERE "externalReadingId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_sensor_readings_device_time
  ON public.fleet_sensor_readings ("deviceId", "sensorType", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_sensor_readings_vehicle_time
  ON public.fleet_sensor_readings ("vehicleId", "occurredAt" DESC);

-- 6) Video channel catalog — one row per camera (front, driver, side,
--    rear, in-cab). Lets the operator override labels and disable a
--    broken channel without losing the configuration.
CREATE TABLE IF NOT EXISTS public.fleet_video_channels (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "channelNo"       SMALLINT NOT NULL,
  "channelLabel"    VARCHAR(80),
  "channelType"     VARCHAR(40),
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  "rtspUrl"         TEXT,
  "hlsUrl"          TEXT,
  "createdAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT fleet_video_channels_type_check CHECK (
    "channelType" IS NULL OR "channelType" IN (
      'front', 'driver', 'side_left', 'side_right', 'rear', 'cabin', 'other'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_video_channels_device_channel
  ON public.fleet_video_channels ("deviceId", "channelNo");

-- 7) On-demand video session — recorded every time a user (or alert
--    automation) opens a live stream. The session row carries the
--    expiry, the channel(s) streamed, who requested it and the reason.
--    Required for the "video is on-demand only" policy + RBAC audit.
CREATE TABLE IF NOT EXISTS public.fleet_video_sessions (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "channelNo"       SMALLINT NOT NULL,
  "streamType"      VARCHAR(20) NOT NULL DEFAULT 'hls',
  "streamUrl"       TEXT,
  "startedAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "expiresAt"       TIMESTAMP WITH TIME ZONE,
  "endedAt"         TIMESTAMP WITH TIME ZONE,
  "requestedBy"     INTEGER NOT NULL,
  reason            TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  "linkedAlertId"   INTEGER,
  CONSTRAINT fleet_video_sessions_stream_check
    CHECK ("streamType" IN ('rtsp', 'hls', 'http_flv', 'webrtc')),
  CONSTRAINT fleet_video_sessions_status_check
    CHECK (status IN ('active', 'stopped', 'expired', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_video_sessions_company_started
  ON public.fleet_video_sessions ("companyId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_video_sessions_device_status
  ON public.fleet_video_sessions ("deviceId", status);

-- 8) AI safety alerts — ADAS (forward collision, lane departure, …),
--    DMS (distracted, drowsy, smoking, phone), BSD (blind spot).
--    These are richer than fleet_device_events because they carry an
--    image/video evidence pointer and a confidence score.
CREATE TABLE IF NOT EXISTS public.fleet_ai_alerts (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "driverId"        INTEGER REFERENCES public.drivers(id),
  category          VARCHAR(20) NOT NULL,
  "alertType"       VARCHAR(60) NOT NULL,
  "alertCode"       VARCHAR(40),
  severity          VARCHAR(20) NOT NULL DEFAULT 'medium',
  confidence        NUMERIC(5, 2),
  "occurredAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
  "receivedAt"      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  lat               NUMERIC(10, 6),
  lng               NUMERIC(10, 6),
  speed             NUMERIC(6, 2),
  "imageUrl"        TEXT,
  "videoUrl"        TEXT,
  "externalAlertId" VARCHAR(120),
  "rawPayload"      JSONB,
  "normalizedPayload" JSONB,
  status            VARCHAR(20) NOT NULL DEFAULT 'open',
  "acknowledgedBy"  INTEGER,
  "acknowledgedAt"  TIMESTAMP WITH TIME ZONE,
  "resolvedBy"      INTEGER,
  "resolvedAt"      TIMESTAMP WITH TIME ZONE,
  "resolutionNote"  TEXT,
  CONSTRAINT fleet_ai_alerts_category_check
    CHECK (category IN ('adas', 'dms', 'bsd', 'safety', 'other')),
  CONSTRAINT fleet_ai_alerts_severity_check
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  CONSTRAINT fleet_ai_alerts_status_check
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_ai_alerts_dedup
  ON public.fleet_ai_alerts ("deviceId", "externalAlertId")
  WHERE "externalAlertId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_ai_alerts_company_time
  ON public.fleet_ai_alerts ("companyId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_ai_alerts_vehicle_category
  ON public.fleet_ai_alerts ("vehicleId", category, "occurredAt" DESC);

-- 9) Media evidence — every screenshot/clip pulled from the MDVR (either
--    auto-attached to an AI alert or pulled by an operator). Stored as a
--    URL pointer; the bytes live in object storage / on the MDVR SSD.
CREATE TABLE IF NOT EXISTS public.fleet_media_evidence (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "branchId"        INTEGER,
  "deviceId"        INTEGER NOT NULL REFERENCES public.fleet_telematics_devices(id),
  "vehicleId"       INTEGER REFERENCES public.vehicles(id),
  "alertId"         INTEGER REFERENCES public.fleet_ai_alerts(id),
  "channelNo"       SMALLINT,
  "mediaType"       VARCHAR(20) NOT NULL,
  "mediaUrl"        TEXT NOT NULL,
  "thumbnailUrl"    TEXT,
  "durationSec"     INTEGER,
  "sizeBytes"       BIGINT,
  "occurredAt"      TIMESTAMP WITH TIME ZONE,
  "uploadedAt"      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "uploadedBy"      INTEGER,
  "externalMediaId" VARCHAR(120),
  "rawPayload"      JSONB,
  CONSTRAINT fleet_media_evidence_type_check
    CHECK ("mediaType" IN ('image', 'video', 'audio'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_media_evidence_company_time
  ON public.fleet_media_evidence ("companyId", "uploadedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_media_evidence_alert
  ON public.fleet_media_evidence ("alertId");

-- 10) Sync log — every CMSV6 round-trip (login, fetch-devices, poll-
--     positions, poll-alerts, video-open, video-stop). Auditable record
--     so we can answer "why did vehicle X drop off the map yesterday".
CREATE TABLE IF NOT EXISTS public.fleet_device_sync_logs (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES public.companies(id),
  "integrationId"   INTEGER REFERENCES public.fleet_telematics_integrations(id),
  "deviceId"        INTEGER REFERENCES public.fleet_telematics_devices(id),
  operation         VARCHAR(60) NOT NULL,
  status            VARCHAR(20) NOT NULL,
  "durationMs"      INTEGER,
  "itemsProcessed"  INTEGER NOT NULL DEFAULT 0,
  "itemsCreated"    INTEGER NOT NULL DEFAULT 0,
  "itemsSkipped"    INTEGER NOT NULL DEFAULT 0,
  message           TEXT,
  payload           JSONB,
  "startedAt"       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "finishedAt"      TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fleet_device_sync_logs_status_check
    CHECK (status IN ('success', 'partial', 'failure', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_device_sync_logs_company_started
  ON public.fleet_device_sync_logs ("companyId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_device_sync_logs_integration
  ON public.fleet_device_sync_logs ("integrationId", "startedAt" DESC);

COMMENT ON TABLE public.fleet_telematics_integrations IS 'CMSV6 / AI MDVR vendor integration rows — issue #1354';
COMMENT ON TABLE public.fleet_telematics_devices IS 'AI MDVR / GPS devices linked to fleet vehicles';
COMMENT ON TABLE public.fleet_device_positions IS 'Historical + live GPS positions emitted by telematics devices';
COMMENT ON TABLE public.fleet_device_events IS 'Generic device events (online/offline, harsh-braking, …)';
COMMENT ON TABLE public.fleet_sensor_readings IS 'Operational sensor readings: fuel, weight, air, dump piston, PTO, door';
COMMENT ON TABLE public.fleet_video_channels IS 'Camera channel registry per MDVR device';
COMMENT ON TABLE public.fleet_video_sessions IS 'On-demand live-stream sessions (RBAC + audit)';
COMMENT ON TABLE public.fleet_ai_alerts IS 'AI safety alerts (ADAS, DMS, BSD)';
COMMENT ON TABLE public.fleet_media_evidence IS 'Image/video evidence attached to alerts or pulled manually';
COMMENT ON TABLE public.fleet_device_sync_logs IS 'Every CMSV6 sync round-trip — observability + audit';
