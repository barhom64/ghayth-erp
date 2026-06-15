-- 361_transport_maps_provider_adapter.sql
--
-- @policy:breaking
--   This migration DROPs the two CHECK constraints
--   `transport_planning_map_provider_check` and
--   `transport_route_estimates_provider_check` and re-ADDs them with
--   `'auto'` appended to the allowed-values list. The new list is a
--   strict SUPERSET of the old one — no existing row can violate it
--   — but the policy linter flags every DROP CONSTRAINT as breaking.
--   Safe under rolling deploy: the old app version emits only the
--   pre-existing literals, which the new constraint still accepts.
-- @rollback: ALTER TABLE public.transport_planning_settings DROP COLUMN IF EXISTS "enableExternalNavigationUrls", DROP COLUMN IF EXISTS "routingPrecision"; ALTER TABLE public.transport_planning_settings DROP CONSTRAINT IF EXISTS transport_planning_routing_precision_check; ALTER TABLE public.transport_planning_settings DROP CONSTRAINT IF EXISTS transport_planning_map_provider_check; ALTER TABLE public.transport_planning_settings ADD CONSTRAINT transport_planning_map_provider_check CHECK ("mapProvider" = ANY (ARRAY['manual_only', 'google_maps', 'mapbox', 'here_maps']::text[])); ALTER TABLE public.transport_route_estimates DROP CONSTRAINT IF EXISTS transport_route_estimates_provider_check; ALTER TABLE public.transport_route_estimates ADD CONSTRAINT transport_route_estimates_provider_check CHECK (provider = ANY (ARRAY['manual_only', 'google_maps', 'mapbox', 'here_maps']::text[]));
--
-- Maps Provider Adapter (#1812 follow-up) — make the transport layer
-- survive when Google Maps is unavailable, and stop bouncing the
-- driver out of the app for navigation.
--
-- Owner brief (2026-06-15): «لا يوجد توقف كامل للنقل بسبب الخرائط.»
-- The booking + planning + dispatch chain must work whether or not a
-- Google API key is configured. When the key is missing or Google
-- returns an error, the system silently downgrades to internal
-- estimates (haversine + average kmh) and shows an Arabic notice
-- instead of an empty/error state.
--
-- What this migration adds to `transport_planning_settings`:
--
--   1. `enableExternalNavigationUrls` — operator toggle for the
--      "ابدأ الملاحة" deep-link on the driver screen. Defaults to
--      TRUE so out-of-box installs work without a Google key (the
--      link itself is keyless — `google.com/maps/dir/?api=1&...`).
--      Operators with a private fleet on a private property who want
--      to forbid the driver from leaving the app set this to FALSE.
--
--   2. `routingPrecision` — read-only-from-UI signal of WHICH precision
--      the cache + estimate-route endpoint will return. Two values:
--        - `google`    → live Google Distance Matrix
--        - `estimated` → internal haversine × detour factor + kmh
--      The runtime resolver in mapsService.ts derives this from
--      `mapProvider` + presence of an API key; the column is stored so
--      reports / audit logs have a stable historical answer for "what
--      precision was this booking estimated with?"
--
-- It also extends the `mapProvider` CHECK constraint to allow `auto` —
-- the new operator-friendly value that means "use Google if a key is
-- configured, fall back to internal estimate otherwise". Existing
-- `manual_only`, `google_maps`, `mapbox`, `here_maps` rows are
-- preserved verbatim.
--
-- Hard boundary (owner brief): «لا تغيير في محرك الإسناد إلا عبر
-- adapter واضح» — no engine logic moves, no finance/GL touch.

ALTER TABLE public.transport_planning_settings
  ADD COLUMN IF NOT EXISTS "enableExternalNavigationUrls" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "routingPrecision"             TEXT    NOT NULL DEFAULT 'estimated';

-- Constrain routingPrecision to the two valid signals. Idempotent
-- guard so re-running this migration on a partially-applied DB doesn't
-- fail with 42710.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'transport_planning_routing_precision_check'
  ) THEN
    ALTER TABLE public.transport_planning_settings
      ADD CONSTRAINT transport_planning_routing_precision_check CHECK (
        "routingPrecision" = ANY (ARRAY['google', 'estimated']::text[])
      );
  END IF;
END$$;

-- Extend the existing mapProvider CHECK to allow `auto`. Postgres
-- requires drop-then-add because CHECK constraints can't be ALTERed
-- in place. Wrap in a DO so it stays idempotent under re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'transport_planning_map_provider_check'
  ) THEN
    ALTER TABLE public.transport_planning_settings
      DROP CONSTRAINT transport_planning_map_provider_check;
  END IF;
  ALTER TABLE public.transport_planning_settings
    ADD CONSTRAINT transport_planning_map_provider_check CHECK (
      "mapProvider" = ANY (
        ARRAY['manual_only', 'google_maps', 'mapbox', 'here_maps', 'auto']::text[]
      )
    );
END$$;

-- Same allowed-values list on the cache table — `auto` itself is a
-- resolver value (the cache key stores the EFFECTIVE provider used,
-- never the literal `auto`), but allow it in the constraint so a
-- mis-cached row never bricks the table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'transport_route_estimates_provider_check'
  ) THEN
    ALTER TABLE public.transport_route_estimates
      DROP CONSTRAINT transport_route_estimates_provider_check;
  END IF;
  ALTER TABLE public.transport_route_estimates
    ADD CONSTRAINT transport_route_estimates_provider_check CHECK (
      provider = ANY (
        ARRAY['manual_only', 'google_maps', 'mapbox', 'here_maps', 'auto']::text[]
      )
    );
END$$;
