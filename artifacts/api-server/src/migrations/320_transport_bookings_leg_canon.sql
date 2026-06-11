-- 320_transport_bookings_leg_canon.sql
--
-- WHAT: backfill `transport_booking_lines` for every active
--       `transport_bookings` row that does not already carry a
--       non-deleted line. Each such row gets a synthetic leg #1
--       derived from the booking header's from/to + scheduled
--       fields. After this migration, every transport_bookings
--       row has ≥1 non-deleted line — the canonical invariant
--       the dispatch / engine / itinerary flows expect.
--
-- WHY:  #2079 Gate-PE-2 (Route Leg as Canon). The owner's mandate
--       2026-06-11:
--          «لا تجعل multi-leg مجرد ميزة. مطار جدة → فندق مكة →
--           الحرم → مزار → فندق → مطار جدة هذا تشغيل يومي.»
--
--       The line-table primitive (`transport_booking_lines`, 266)
--       has been present since the booking surface was redesigned
--       — and the POST endpoint already accepts an optional
--       `lines: []` of up to 20 legs. But the schema also lets a
--       booking be created with NO lines, in which case the
--       header's own `fromLocation*/toLocationText`/window fields
--       are the de-facto "single implicit leg". That ambiguity is
--       the foundation crack we close here: the line MUST exist,
--       implicit-vs-explicit is no longer an option.
--
--       The companion route-side change (transport-bookings.ts
--       POST) auto-generates the synthetic line for every new
--       booking that posts an empty `lines: []` so the same
--       invariant holds for future inserts without breaking the
--       backward-compatible payload shape.
--
-- SAFETY: pure additive. Inserts only rows where none exist; no
--         existing line is touched. Idempotent — re-running the
--         migration finds zero candidate rows after the first run
--         (the `NOT EXISTS (… deletedAt IS NULL)` guard).
--
-- @rollback: BEGIN;
--              DELETE FROM public.transport_booking_lines
--               WHERE notes = '#2079 Gate-PE-2 — derived from booking header';
--            COMMIT;

BEGIN;

INSERT INTO public.transport_booking_lines (
  "companyId", "bookingId", "lineNumber",
  "fromLocationId", "toLocationId",
  "scheduledPickupAt", "scheduledDeliveryAt",
  "lineDescription", quantity, "unitOfMeasure", "passengerCount",
  status, notes,
  "createdAt", "updatedAt"
)
SELECT
  b."companyId",
  b.id,
  1                                                      AS "lineNumber",
  b."fromLocationId",
  b."toLocationId",
  COALESCE(b."pickupWindowStart", b."fixedAppointmentTime",
           CASE WHEN b."requestedPickupDate" IS NOT NULL
                THEN (b."requestedPickupDate"::timestamptz +
                      COALESCE(b."requestedPickupTime"::interval,
                               INTERVAL '0'))
                ELSE NULL
           END)                                          AS "scheduledPickupAt",
  COALESCE(b."dropoffWindowStart",
           CASE WHEN b."requestedDeliveryDate" IS NOT NULL
                THEN (b."requestedDeliveryDate"::timestamptz +
                      COALESCE(b."requestedDeliveryTime"::interval,
                               INTERVAL '0'))
                ELSE NULL
           END)                                          AS "scheduledDeliveryAt",
  COALESCE(b."cargoDescription",
           NULLIF(b."fromLocationText" || ' → ' || b."toLocationText", ' → '),
           'Single-leg derived line') AS "lineDescription",
  b."cargoQuantity"                                     AS quantity,
  COALESCE(b."cargoUnit", 'unit')                       AS "unitOfMeasure",
  b."passengerCount"                                    AS "passengerCount",
  -- Inherit the booking status' analogue. Lines start 'open' until
  -- a dispatch is created against them; if the booking has already
  -- moved past initial states, the derived line aligns to keep the
  -- aggregate invariant honest.
  CASE
    WHEN b.status IN ('cancelled')              THEN 'cancelled'
    WHEN b.status IN ('completed', 'closed')    THEN 'completed'
    WHEN b.status IN ('executing')              THEN 'in_progress'
    WHEN b.status IN ('scheduled')              THEN 'dispatched'
    ELSE 'open'
  END                                                    AS status,
  '#2079 Gate-PE-2 — derived from booking header'        AS notes,
  COALESCE(b."createdAt", NOW())                         AS "createdAt",
  NOW()                                                  AS "updatedAt"
FROM public.transport_bookings b
WHERE b."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.transport_booking_lines l
     WHERE l."bookingId" = b.id
       AND l."deletedAt" IS NULL
  );

COMMIT;
