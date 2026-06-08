-- 262_fleet_vehicle_technical_profile.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.vehicle_capacity_overrides;
--   ALTER TABLE public.fleet_vehicles
--     DROP COLUMN IF EXISTS "vehicleType",
--     DROP COLUMN IF EXISTS "payloadKg",
--     DROP COLUMN IF EXISTS "boxLengthCm",
--     DROP COLUMN IF EXISTS "boxWidthCm",
--     DROP COLUMN IF EXISTS "boxHeightCm",
--     DROP COLUMN IF EXISTS "axleCount",
--     DROP COLUMN IF EXISTS "tireCount",
--     DROP COLUMN IF EXISTS "tireSize",
--     DROP COLUMN IF EXISTS "engineDisplacementCc",
--     DROP COLUMN IF EXISTS "transmissionType",
--     DROP COLUMN IF EXISTS "seatCount",
--     DROP COLUMN IF EXISTS "hasAc",
--     DROP COLUMN IF EXISTS "screenCount",
--     DROP COLUMN IF EXISTS "doorCount",
--     DROP COLUMN IF EXISTS "upholsteryType",
--     DROP COLUMN IF EXISTS "safetyFeatures",
--     DROP COLUMN IF EXISTS "operatingHours",
--     DROP COLUMN IF EXISTS "equipmentAttachments";
--
-- #1733 Blocker #2 — vehicle technical profile.
--
-- Before this migration the `fleet_vehicles` row carried only plate /
-- make / model / fuel — enough to identify a vehicle, nowhere near
-- enough to enforce the operational guardrails #1733 demands:
--
--   - "لا يمكن إسناد حمولة أكبر من سعة المركبة إلا باستثناء موثق"
--   - "لا يمكن إسناد باص غير كافٍ لعدد المعتمرين إلا باستثناء موثق"
--   - "هذه البيانات تؤثر على الإسناد، جاهزية المركبة، ملاءمة الحمولة
--      أو عدد المعتمرين، والصيانة"
--
-- We extend the row with the four technical surfaces #1733 names:
--   • cargo / haul (payload, box dimensions, axles, tires, drivetrain)
--   • passenger / bus (seats, AC, screens, doors, upholstery, safety)
--   • equipment (operating hours + attachments)
--   • powertrain (engine displacement, transmission)
--
-- All columns are nullable so existing rows are not disturbed. The
-- capacity validators (`lib/fleet/vehicleCapacity.ts`) treat NULL as
-- "unknown → skip the hard block but emit a soft warning event" so
-- legacy fleets keep working until they get profiled.
--
-- `vehicle_capacity_overrides` records every documented exception
-- (#1733 acceptance scenario): "إلا باستثناء موثق". Every override has
-- a reason, an actor, and a back-pointer to the source (cargo
-- manifest, umrah transport row) so an audit can ask "who let a
-- 5-ton load onto a 3-ton truck and why".

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS "vehicleType"          text,            -- truck | bus | van | pickup | sedan | trailer | equipment
  ADD COLUMN IF NOT EXISTS "payloadKg"            numeric(10,2),   -- max cargo load
  ADD COLUMN IF NOT EXISTS "boxLengthCm"          integer,
  ADD COLUMN IF NOT EXISTS "boxWidthCm"           integer,
  ADD COLUMN IF NOT EXISTS "boxHeightCm"          integer,
  ADD COLUMN IF NOT EXISTS "axleCount"            integer,
  ADD COLUMN IF NOT EXISTS "tireCount"            integer,
  ADD COLUMN IF NOT EXISTS "tireSize"             text,            -- e.g. "295/80R22.5"
  ADD COLUMN IF NOT EXISTS "engineDisplacementCc" integer,
  ADD COLUMN IF NOT EXISTS "transmissionType"     text,            -- manual | automatic | amt | cvt
  ADD COLUMN IF NOT EXISTS "seatCount"            integer,         -- bus / van / pickup
  ADD COLUMN IF NOT EXISTS "hasAc"                boolean,
  ADD COLUMN IF NOT EXISTS "screenCount"          integer,
  ADD COLUMN IF NOT EXISTS "doorCount"            integer,
  ADD COLUMN IF NOT EXISTS "upholsteryType"       text,            -- fabric | leather | premium
  ADD COLUMN IF NOT EXISTS "safetyFeatures"       jsonb,           -- ["abs","airbag","seatbelt","camera",...]
  ADD COLUMN IF NOT EXISTS "operatingHours"       numeric(10,1),   -- excavator / loader meter
  ADD COLUMN IF NOT EXISTS "equipmentAttachments" jsonb;           -- ["bucket","hammer","ripper",...]

-- "Show me every truck with payload ≥ X" / "every bus with ≥ Y seats"
-- — partial indexes keep the index small (NULLs excluded) and only the
-- vehicle types that actually carry the field are scanned.
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_payload
  ON public.fleet_vehicles ("companyId", "payloadKg")
  WHERE "payloadKg" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_seats
  ON public.fleet_vehicles ("companyId", "seatCount")
  WHERE "seatCount" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_type
  ON public.fleet_vehicles ("companyId", "vehicleType")
  WHERE "vehicleType" IS NOT NULL AND "deletedAt" IS NULL;

-- Documented-exception log. One row per accepted-against-capacity
-- assignment. The unique constraint on (sourceType, sourceId) means
-- "this manifest got an override" is a one-shot decision — not a
-- thing that quietly accumulates.
CREATE TABLE IF NOT EXISTS public.vehicle_capacity_overrides (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL,
  "branchId"            INTEGER,
  "vehicleId"           INTEGER NOT NULL,
  "sourceType"          TEXT NOT NULL,   -- 'cargo_manifest' | 'umrah_transport'
  "sourceId"            INTEGER NOT NULL,
  "capacityType"        TEXT NOT NULL,   -- 'payload_kg' | 'seat_count'
  "vehicleCapacity"     NUMERIC(12,2) NOT NULL,
  "requestedAmount"     NUMERIC(12,2) NOT NULL,
  "exceededBy"          NUMERIC(12,2) NOT NULL,
  reason                TEXT NOT NULL,
  "approvedBy"          INTEGER NOT NULL,
  "approvedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_capacity_override_source
    UNIQUE ("companyId", "sourceType", "sourceId")
);

CREATE INDEX IF NOT EXISTS idx_capacity_overrides_vehicle
  ON public.vehicle_capacity_overrides ("companyId", "vehicleId", "approvedAt" DESC);
