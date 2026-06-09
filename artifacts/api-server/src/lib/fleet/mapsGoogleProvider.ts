/**
 * Google Maps Platform provider — real implementation.
 *
 * Wires the three primary endpoints needed by MapsService:
 *
 *   1. estimateRoute  → Distance Matrix API (legacy, dual-purpose
 *                       distance + duration in a single request).
 *   2. geocode        → Geocoding API (forward).
 *   3. reverseGeocode → Geocoding API (reverse).
 *
 * Authentication
 * --------------
 * The API key is read from `transport_planning_settings.mapProviderApiKey`
 * (per-company, so different tenants can have different billing
 * accounts) with a fallback to the `GOOGLE_MAPS_API_KEY` environment
 * variable. The fallback is intended for development / single-tenant
 * deployments. Production should set the key per-company so usage is
 * billable to the right Google Cloud project.
 *
 * Failure handling
 * ----------------
 * Every Google API call is wrapped in try/catch + a 5-second timeout.
 * On any failure (network, quota, bad key, malformed response) the
 * function returns null so MapsService falls back to the manual_only
 * baseline. We never bubble a Google error to the operator — the SPA
 * always sees a successful response with `isApproximate: true` flag.
 *
 * Cost control
 * ------------
 * MapsService caches every successful response in
 * `transport_route_estimates` with a per-company TTL
 * (`estimateCacheTtlMinutes`, default 24h). A duplicate query inside
 * the TTL window does NOT re-hit Google → no double billing.
 *
 * Setup (admin operator):
 *   1. Create a Google Cloud project.
 *   2. Enable the Distance Matrix API + Geocoding API + (optional)
 *      Maps JavaScript API.
 *   3. Create an API key with HTTP-referrer restrictions.
 *   4. Set the key in /admin/transport-planning-settings → "مفتاح API".
 *   5. Switch the provider to "google_maps" in the same panel.
 *
 * Once the key is set, all future estimateRoute / geocode calls flow
 * through this provider transparently. No code changes needed.
 */

import { logger } from "../logger.js";

const TIMEOUT_MS = 5_000;

/** Shape returned to MapsService when the Google call succeeds. */
interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: null; // Distance Matrix doesn't return polylines
}

/** Shape returned to MapsService when geocode succeeds. */
interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
  placeId?: string;
}

/**
 * Distance Matrix API — route between two points.
 *
 * Docs: https://developers.google.com/maps/documentation/distance-matrix/overview
 * Returns null on any failure (timeout, bad key, malformed response, OVER_QUERY_LIMIT, etc.)
 * so the caller can fall back to the manual-haversine baseline.
 */
export async function googleEstimateRoute(args: {
  apiKey: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}): Promise<RouteEstimate | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${args.originLat},${args.originLng}`);
  url.searchParams.set("destinations", `${args.destinationLat},${args.destinationLng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "metric");
  url.searchParams.set("language", "ar"); // Arabic responses for the operator UI
  url.searchParams.set("region", "sa");   // Bias toward Saudi roads / formatting
  url.searchParams.set("key", args.apiKey);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url.toString(), { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      logger.warn({ status: res.status }, "[mapsGoogleProvider] DistanceMatrix HTTP non-200");
      return null;
    }
    const json = (await res.json()) as {
      status?: string;
      rows?: Array<{
        elements?: Array<{
          status?: string;
          distance?: { value?: number };
          duration?: { value?: number };
        }>;
      }>;
      error_message?: string;
    };
    if (json.status !== "OK") {
      logger.warn(
        { status: json.status, error: json.error_message },
        "[mapsGoogleProvider] DistanceMatrix non-OK status",
      );
      return null;
    }
    const el = json.rows?.[0]?.elements?.[0];
    if (!el || el.status !== "OK") {
      logger.warn({ elStatus: el?.status }, "[mapsGoogleProvider] DistanceMatrix element not OK");
      return null;
    }
    if (typeof el.distance?.value !== "number" || typeof el.duration?.value !== "number") {
      logger.warn("[mapsGoogleProvider] DistanceMatrix missing distance/duration");
      return null;
    }
    return {
      distanceMeters: el.distance.value,
      durationSeconds: el.duration.value,
      encodedPolyline: null,
    };
  } catch (err) {
    logger.warn({ err }, "[mapsGoogleProvider] DistanceMatrix fetch failed");
    return null;
  }
}

/**
 * Geocoding API — address → lat/lng + placeId.
 *
 * Docs: https://developers.google.com/maps/documentation/geocoding/overview
 */
export async function googleGeocode(args: {
  apiKey: string;
  address: string;
}): Promise<GeocodeResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", args.address);
  url.searchParams.set("language", "ar");
  url.searchParams.set("region", "sa");
  url.searchParams.set("key", args.apiKey);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url.toString(), { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
        formatted_address?: string;
        place_id?: string;
      }>;
    };
    if (json.status !== "OK" || !json.results?.[0]) return null;
    const first = json.results[0];
    const loc = first.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: first.formatted_address,
      placeId: first.place_id,
    };
  } catch (err) {
    logger.warn({ err }, "[mapsGoogleProvider] geocode failed");
    return null;
  }
}

/**
 * Reverse Geocoding — lat/lng → formatted address.
 */
export async function googleReverseGeocode(args: {
  apiKey: string;
  lat: number;
  lng: number;
}): Promise<string | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${args.lat},${args.lng}`);
  url.searchParams.set("language", "ar");
  url.searchParams.set("region", "sa");
  url.searchParams.set("key", args.apiKey);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url.toString(), { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      results?: Array<{ formatted_address?: string }>;
    };
    if (json.status !== "OK") return null;
    return json.results?.[0]?.formatted_address ?? null;
  } catch (err) {
    logger.warn({ err }, "[mapsGoogleProvider] reverseGeocode failed");
    return null;
  }
}

/**
 * Health check — verifies the API key is valid by making a minimal
 * geocode call against a known-good address. Returns:
 *   - "ok"             → key works, billing is set up
 *   - "invalid_key"    → key rejected by Google
 *   - "quota_exceeded" → billing not enabled OR daily quota hit
 *   - "network_error"  → couldn't reach Google
 *   - "missing"        → no key supplied (caller should use manual_only)
 */
export async function googleHealthCheck(apiKey: string | null): Promise<
  "ok" | "invalid_key" | "quota_exceeded" | "network_error" | "missing"
> {
  if (!apiKey) return "missing";
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", "Riyadh, Saudi Arabia");
  url.searchParams.set("key", apiKey);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url.toString(), { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return "network_error";
    const json = (await res.json()) as { status?: string; error_message?: string };
    if (json.status === "OK") return "ok";
    if (json.status === "REQUEST_DENIED") return "invalid_key";
    if (json.status === "OVER_QUERY_LIMIT" || json.status === "OVER_DAILY_LIMIT") return "quota_exceeded";
    return "network_error";
  } catch {
    return "network_error";
  }
}
