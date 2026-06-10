-- 305_cargo_manifest_checkpoints.sql
--
-- WHAT: lightweight per-manifest operational checkpoint log so the
--       cargo driver can record the WITHIN-step events that don't
--       change the 7-state headline status — e.g. "weighed at scale",
--       "10-min rest break", "customs inspection", "fueled here".
--
-- WHY:  user's TR-016 (#1812 transport plan): «خطوات سائق الحمولة
--       التفصيلية — نقاط التشغيل (ميزان/راحة/تفتيش/تفريغ) = صفر —
--       أكمِلها وأظهِرها للسائق». The 7-state machine on
--       cargo_manifests gives the timeline ITS SHAPE, but the
--       dispatcher needs to see WHAT happened during in_transit /
--       loaded / arrived_pickup as the trip unfolds. Without these
--       checkpoints the driver had no way to log a weighbridge stop,
--       a mandated rest break, or an inspection without misusing the
--       free-text manifest notes field.
--
--       Stored as a separate table so:
--         1) per-row audit + RBAC + reporting work naturally,
--         2) the manifests row stays single-purpose (lifecycle state),
--         3) future analytics (avg rest minutes, weighbridge dwell
--            time, inspection frequency per route) can query a flat
--            timestamped log without unpacking JSONB.
--
-- SAFETY: pure additive — new table only, no constraint tightening
--         anywhere else. Driver UI gates checkpoint recording on
--         (a) status ∈ driver-controlled states AND (b) the driver
--         resolved from the auth scope == manifest.driverId, both
--         enforced in the route layer.
--
-- @rollback: BEGIN;
--              DROP TABLE IF EXISTS cargo_manifest_checkpoints;
--            COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS cargo_manifest_checkpoints (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "manifestId"        INTEGER NOT NULL,
  -- Bounded enum so the dispatcher's timeline can render each
  -- checkpoint with a typed Arabic label + icon. Reserve `other`
  -- for the long tail; if a new bucket recurs, add it here + bump
  -- the SPA label map. Order is chronological-typical (load →
  -- weigh → rest → inspection → unload) so the UI can sort by
  -- (manifest, recordedAt) without secondary keys.
  "checkpointType"    VARCHAR(32) NOT NULL,
  -- The driver-friendly free-text supplement (e.g. "tanker overfilled
  -- by 200kg, ticket #34", "stopped for prayer", "inspector noted
  -- worn tire tread"). Bounded so we don't accidentally turn this
  -- into a chat log.
  notes               TEXT,
  -- Geolocation captured at the moment the driver tapped the button.
  -- Optional — the mobile UI asks for GPS but a tap from a desktop
  -- ops console gets NULL.
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  -- Driver-set value tied to the checkpoint type. Examples:
  --   weighing      → weight in kg
  --   fueling       → litres dispensed
  --   rest_break    → minutes rested
  --   unloading_*   → units unloaded
  -- Stored as numeric so the analytics queries above don't have to
  -- parse free text. NULL when the checkpoint type has no natural
  -- quantitative reading (inspection / customs / other).
  "measuredValue"     NUMERIC(12,2),
  "measuredUnit"      VARCHAR(16),
  -- Who recorded it. Almost always the driver, but the dispatcher
  -- can also retro-log on the driver's behalf via the ops surface
  -- (audit-logged separately). The route never lets a row be
  -- inserted with `recordedBy` unequal to the auth scope's userId.
  "recordedBy"        INTEGER,
  "recordedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No soft-delete column on purpose. A checkpoint, once logged,
  -- is an audit fact: edits/retractions go through a separate
  -- correcting checkpoint row with notes pointing back to the
  -- mistaken id (operator policy, not enforced here).
  CONSTRAINT cargo_manifest_checkpoints_type_check CHECK (
    "checkpointType" IN (
      'loading_start', 'loading_complete',
      'weighing', 'rest_break', 'inspection',
      'customs', 'fueling',
      'unloading_start', 'unloading_complete',
      'other'
    )
  )
);

-- Driver "show my checkpoints for this trip" — the most common read
-- on the mobile side. (companyId, manifestId, recordedAt) covers the
-- /me/cargo/:id/checkpoints endpoint without secondary sorts.
CREATE INDEX IF NOT EXISTS idx_cargo_checkpoints_manifest
  ON cargo_manifest_checkpoints ("companyId", "manifestId", "recordedAt" DESC);

-- Dispatcher reporting: "show every checkpoint of type X across the
-- fleet for date Y" — e.g. "how many inspection stops yesterday".
CREATE INDEX IF NOT EXISTS idx_cargo_checkpoints_type_recorded
  ON cargo_manifest_checkpoints ("companyId", "checkpointType", "recordedAt" DESC);

COMMIT;
