/**
 * MapsService — provider-agnostic abstraction for route estimation,
 * geocoding, and external navigation links. (#1812 Maps layer.)
 *
 * The architectural contract requested by #1812: transport NEVER ties
 * itself to one provider. Every call goes through this service which
 * loads the active provider from `transport_planning_settings.mapProvider`
 * (per company) and dispatches to the implementation.
 *
 * Providers:
 *
 *   • manual_only   — the baseline. Returns a haversine-distance
 *                     estimate + an "average kmh" duration derived from
 *                     transport_planning_settings.defaultDeadheadKmh.
 *                     No external HTTP. Used as the default everywhere
 *                     until a key is configured.
 *
 *   • google_maps   — stub. Returns the manual estimate with a flag in
 *                     the result so callers know this isn't an upgrade
 *                     until the key is wired. Switch is one PR away.
 *
 *   • mapbox        — same stub pattern as google_maps.
 *
 *   • here_maps     — same stub pattern.
 *
 * All providers share the same return shape, all results are written
 * to transport_route_estimates (cache table) so the next query in the
 * TTL window doesn't re-compute. Cache TTL is per company in
 * transport_planning_settings.estimateCacheTtlMinutes.
 *
 * Callers DO NOT instantiate providers — they call
 * `MapsService.estimateRoute()` and the service resolves the right
 * implementation.
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { haversineMeters } from "../algorithms.js";
import {
  googleEstimateRoute, googleGeocode, googleReverseGeocode, googleHealthCheck,
} from "./mapsGoogleProvider.js";
import { recordMapsCall } from "./mapsUsageCounter.js";

// #1812 Maps Provider Adapter (owner brief 2026-06-15) — `auto` is the
// operator-friendly setting: "use Google if a key is configured, fall
// back to internal estimate otherwise." `manual_only` and `google_maps`
// remain explicit pins for operators who want zero ambiguity. The
// `mapbox`/`here_maps` literals stay in the type so historical rows
// keep loading, but mapsService treats them as fallback today.
export type MapProvider = "manual_only" | "google_maps" | "mapbox" | "here_maps" | "auto";

export interface PlanningSettings {
  companyId: number;
  mapProvider: MapProvider;
  mapProviderApiKey: string | null;
  defaultRestHoursRequired: number;
  defaultLoadingMinutes: number;
  defaultUnloadingMinutes: number;
  defaultBufferMinutes: number;
  defaultDeadheadKmh: number;
  estimateCacheTtlMinutes: number;
  enableExternalNavigationUrls: boolean;
  routingPrecision: "google" | "estimated";
}

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
  provider: MapProvider;
  encodedPolyline: string | null;
  isCached: boolean;
  /** True when we fell back to manual_only because the provider
   *  isn't wired yet — UI should show "تقدير تقريبي". */
  isApproximate: boolean;
}

export interface RouteRequest {
  companyId: number;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

// ── Settings loader (lazy-create one row per company) ────────────────

const DEFAULT_SETTINGS: Omit<PlanningSettings, "companyId"> = {
  mapProvider: "manual_only",
  mapProviderApiKey: null,
  defaultRestHoursRequired: 8,
  defaultLoadingMinutes: 15,
  defaultUnloadingMinutes: 15,
  defaultBufferMinutes: 15,
  defaultDeadheadKmh: 60,
  estimateCacheTtlMinutes: 1440,
  enableExternalNavigationUrls: true,
  routingPrecision: "estimated",
};

export async function loadPlanningSettings(companyId: number): Promise<PlanningSettings> {
  const rows = await rawQuery<PlanningSettings>(
    `SELECT "companyId", "mapProvider", "mapProviderApiKey",
            "defaultRestHoursRequired"::float AS "defaultRestHoursRequired",
            "defaultLoadingMinutes", "defaultUnloadingMinutes",
            "defaultBufferMinutes", "defaultDeadheadKmh",
            "estimateCacheTtlMinutes",
            "enableExternalNavigationUrls", "routingPrecision"
       FROM transport_planning_settings
      WHERE "companyId" = $1`,
    [companyId],
  );
  if (rows[0]) return rows[0];

  // Lazy-create the defaults row.
  // #2079 follow-up — `transport_planning_settings` has NO `id` column
  // (PK is `companyId`). `rawExecute` auto-appends `RETURNING id` to
  // any non-RETURNING DML, so this used to crash with 42703
  // "column id does not exist" on the very first suggest-assignment
  // call against any freshly-bootstrapped company. Switch to
  // `rawQuery` (which doesn't auto-append) — the ON CONFLICT DO
  // NOTHING gives us the same fire-and-forget upsert without needing
  // an insertId.
  await rawQuery(
    `INSERT INTO transport_planning_settings ("companyId")
     VALUES ($1) ON CONFLICT ("companyId") DO NOTHING`,
    [companyId],
  );
  return { companyId, ...DEFAULT_SETTINGS };
}

export async function updatePlanningSettings(
  companyId: number,
  patch: Partial<Omit<PlanningSettings, "companyId">>,
): Promise<PlanningSettings> {
  await loadPlanningSettings(companyId); // ensure row exists
  const sets: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  const colMap: Record<string, string> = {
    mapProvider: '"mapProvider"',
    mapProviderApiKey: '"mapProviderApiKey"',
    defaultRestHoursRequired: '"defaultRestHoursRequired"',
    defaultLoadingMinutes: '"defaultLoadingMinutes"',
    defaultUnloadingMinutes: '"defaultUnloadingMinutes"',
    defaultBufferMinutes: '"defaultBufferMinutes"',
    defaultDeadheadKmh: '"defaultDeadheadKmh"',
    estimateCacheTtlMinutes: '"estimateCacheTtlMinutes"',
    enableExternalNavigationUrls: '"enableExternalNavigationUrls"',
    routingPrecision: '"routingPrecision"',
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && colMap[k]) {
      sets.push(`${colMap[k]} = $${p++}`);
      params.push(v);
    }
  }
  if (sets.length > 0) {
    sets.push(`"updatedAt" = NOW()`);
    params.push(companyId);
    await rawExecute(
      `UPDATE transport_planning_settings SET ${sets.join(", ")} WHERE "companyId" = $${p}`,
      params,
    );
  }
  return loadPlanningSettings(companyId);
}

// ── Haversine distance (manual_only baseline) ────────────────────────
// Single shared impl in ../algorithms (deduped — was a second copy here). Used
// by manualEstimate below; re-exported so callers/tests keep importing it here.
export { haversineMeters };

// ── Cache layer ──────────────────────────────────────────────────────

async function readCache(
  req: RouteRequest, provider: MapProvider,
): Promise<RouteEstimate | null> {
  const rows = await rawQuery<{
    distanceMeters: number;
    durationSeconds: number;
    encodedPolyline: string | null;
  }>(
    `SELECT "distanceMeters", "durationSeconds", "encodedPolyline"
       FROM transport_route_estimates
      WHERE "companyId" = $1 AND provider = $2
        AND ABS("originLat"      - $3) < 0.0001
        AND ABS("originLng"      - $4) < 0.0001
        AND ABS("destinationLat" - $5) < 0.0001
        AND ABS("destinationLng" - $6) < 0.0001
        AND "expiresAt" > NOW()
      ORDER BY "createdAt" DESC LIMIT 1`,
    [
      req.companyId, provider,
      req.originLat, req.originLng,
      req.destinationLat, req.destinationLng,
    ],
  );
  if (!rows[0]) return null;
  return {
    distanceMeters: rows[0].distanceMeters,
    durationSeconds: rows[0].durationSeconds,
    provider,
    encodedPolyline: rows[0].encodedPolyline,
    isCached: true,
    isApproximate: provider === "manual_only",
  };
}

async function writeCache(
  req: RouteRequest,
  provider: MapProvider,
  estimate: { distanceMeters: number; durationSeconds: number; encodedPolyline: string | null },
  ttlMinutes: number,
): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO transport_route_estimates
         ("companyId", provider, "originLat", "originLng",
          "destinationLat", "destinationLng",
          "distanceMeters", "durationSeconds", "encodedPolyline",
          "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               NOW() + ($10 || ' minutes')::interval)`,
      [
        req.companyId, provider,
        req.originLat, req.originLng,
        req.destinationLat, req.destinationLng,
        estimate.distanceMeters, estimate.durationSeconds, estimate.encodedPolyline,
        String(ttlMinutes),
      ],
    );
  } catch (err) {
    // Cache writes are best-effort — never fail the request on a cache miss.
    logger.warn({ err }, "[MapsService] cache write failed");
  }
}

// ── Provider implementations ─────────────────────────────────────────

function manualEstimate(
  req: RouteRequest, settings: PlanningSettings,
): { distanceMeters: number; durationSeconds: number; encodedPolyline: null } {
  const distance = haversineMeters(
    req.originLat, req.originLng, req.destinationLat, req.destinationLng,
  );
  // Apply a 1.3x detour factor — straight-line distance underestimates
  // road distance significantly in dense urban routing.
  const roadDistance = Math.round(distance * 1.3);
  const kmh = Math.max(10, settings.defaultDeadheadKmh);
  const durationSeconds = Math.round((roadDistance / 1000) * 3600 / kmh);
  return { distanceMeters: roadDistance, durationSeconds, encodedPolyline: null };
}

// ── Provider resolution + key masking (Maps Provider Adapter) ────────

/**
 * Resolves which provider actually runs the request.
 *
 *   • `auto`        → google_maps when a key is configured, else
 *                     manual_only. This is the operator-friendly
 *                     default — they don't have to know whether the
 *                     key was pasted yet.
 *   • `google_maps` → google_maps when a key is configured, else
 *                     manual_only (the existing fall-through path).
 *   • everything else → manual_only.
 *
 * Returns BOTH the effective provider AND whether the call is going
 * to be approximate, so the caller doesn't have to re-derive that.
 */
export function resolveEffectiveProvider(
  configured: MapProvider, apiKey: string | null,
): { provider: MapProvider; isApproximate: boolean } {
  if ((configured === "google_maps" || configured === "auto") && apiKey) {
    return { provider: "google_maps", isApproximate: false };
  }
  return { provider: "manual_only", isApproximate: true };
}

/**
 * Mask the API key for client-side display. NEVER returns the raw key.
 * Pattern is `XXXX…YYYY` for keys ≥ 8 chars, `****` for shorter keys,
 * and `null` when no key is set.
 *
 * Owner brief: «لا تعرضه في الواجهة». This is the single chokepoint
 * — every route that returns a PlanningSettings to the client routes
 * through `MapsService.toClientSettings()` and gets the masked form.
 */
export function maskApiKey(key: string | null | undefined): string | null {
  if (key == null || key === "") return null;
  const s = String(key);
  if (s.length < 8) return "****";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * The Arabic notice shown on the SPA whenever the system is running
 * in approximate (haversine) mode. Centralised here so the static
 * test can pin the exact wording the owner approved.
 */
export const FALLBACK_NOTICE_AR =
  "الخرائط تعمل بوضع تقديري حتى ربط مفتاح Google Maps التجاري";

// ── Public API ───────────────────────────────────────────────────────

export const MapsService = {
  /**
   * Resolve the route between two GPS points. Routes through the
   * provider configured for the company and caches the result.
   *
   * If a non-manual provider is selected but the API key isn't
   * configured, the service transparently falls back to manual_only
   * and sets `isApproximate: true` on the result so the UI can show
   * the user "تقدير تقريبي".
   */
  async estimateRoute(req: RouteRequest): Promise<RouteEstimate> {
    const settings = await loadPlanningSettings(req.companyId);

    // Resolve the effective API key — prefer per-company setting,
    // fall back to env var for single-tenant deployments.
    const apiKey = settings.mapProviderApiKey || config.googleMapsApiKey;

    // Adapter resolver — handles `auto` + missing-key fall-through in
    // one place, so the cache key + the dispatch decision stay aligned.
    const { provider: targetProvider } = resolveEffectiveProvider(
      settings.mapProvider, apiKey,
    );

    // Cache hit?
    const cached = await readCache(req, targetProvider);
    if (cached) return cached;

    // #1812 — try Google when both the resolver picked it AND we have
    // a key. If Google returns null (timeout, bad key, quota) fall
    // back to manual_only and flag the result `isApproximate: true`
    // so the SPA can show "تقدير تقريبي" instead of misleading exact
    // numbers. The booking flow MUST NOT break on a Google outage.
    if (targetProvider === "google_maps" && apiKey) {
      const real = await googleEstimateRoute({
        apiKey,
        originLat: req.originLat,
        originLng: req.originLng,
        destinationLat: req.destinationLat,
        destinationLng: req.destinationLng,
      });
      // TA-GAP-09 Phase 1 — count every Google call (success + failure
      // is `errored: true`). Best-effort: the counter never throws.
      await recordMapsCall({
        companyId: req.companyId,
        provider: "google_maps",
        apiSurface: "estimateRoute",
        errored: real === null,
      });
      if (real) {
        await writeCache(req, "google_maps", real, settings.estimateCacheTtlMinutes);
        return {
          ...real,
          provider: "google_maps",
          isCached: false,
          isApproximate: false,
        };
      }
      // Fall-through to manual on Google failure (already logged in provider).
    }

    const calc = manualEstimate(req, settings);
    await writeCache(req, "manual_only", calc, settings.estimateCacheTtlMinutes);
    return {
      ...calc,
      provider: "manual_only",
      isCached: false,
      isApproximate: true,
    };
  },

  /**
   * Build an external-navigation deep link for the given provider.
   * Used as the "fallback" path on the driver navigation screen —
   * the primary path is the in-app map (Phase 2/3 of the navigation
   * stack); this is the escape hatch when the device or provider
   * configuration doesn't support in-app navigation.
   */
  openExternalNavigationLink(
    provider: MapProvider | "auto",
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): string {
    if (provider === "auto" || provider === "google_maps" || provider === "manual_only") {
      // Google Maps universal link — works on Android, iOS, and web.
      return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    }
    if (provider === "mapbox") {
      return `https://www.mapbox.com/directions/?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
    }
    if (provider === "here_maps") {
      return `https://wego.here.com/directions/drive/${origin.lat},${origin.lng}/${destination.lat},${destination.lng}`;
    }
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
  },

  /**
   * Geocoding — address → lat/lng + placeId. Routes through the
   * configured provider, returns null on any failure so callers
   * fall back to the user-typed address text.
   */
  async geocode(
    companyId: number, address: string,
  ): Promise<{ lat: number; lng: number; formattedAddress?: string; placeId?: string } | null> {
    const settings = await loadPlanningSettings(companyId);
    const apiKey = settings.mapProviderApiKey || config.googleMapsApiKey;
    const { provider } = resolveEffectiveProvider(settings.mapProvider, apiKey);
    if (provider === "google_maps" && apiKey) {
      return googleGeocode({ apiKey, address });
    }
    return null;
  },

  async reverseGeocode(companyId: number, lat: number, lng: number): Promise<string | null> {
    const settings = await loadPlanningSettings(companyId);
    const apiKey = settings.mapProviderApiKey || config.googleMapsApiKey;
    const { provider } = resolveEffectiveProvider(settings.mapProvider, apiKey);
    if (provider === "google_maps" && apiKey) {
      return googleReverseGeocode({ apiKey, lat, lng });
    }
    return null;
  },

  /**
   * Health check for the active provider — verifies the API key
   * actually works against the provider's API. Used by the admin
   * planning-settings UI to give immediate feedback when the operator
   * pastes a new key. Returns:
   *   - "ok"             — key works, billing enabled
   *   - "invalid_key"    — key rejected
   *   - "quota_exceeded" — billing not enabled OR daily quota hit
   *   - "network_error"  — couldn't reach provider
   *   - "missing"        — no key supplied
   *   - "not_supported"  — provider doesn't have a health check yet
   */
  async healthCheck(companyId: number): Promise<
    "ok" | "invalid_key" | "quota_exceeded" | "network_error" | "missing" | "not_supported"
  > {
    const settings = await loadPlanningSettings(companyId);
    const apiKey = settings.mapProviderApiKey || config.googleMapsApiKey;
    if (settings.mapProvider === "manual_only") return "not_supported";
    if (settings.mapProvider === "google_maps" || settings.mapProvider === "auto") {
      return googleHealthCheck(apiKey);
    }
    return "not_supported";
  },

  /**
   * Build the client-safe shape of PlanningSettings.
   *
   *   • `mapProviderApiKey` → masked (XXXX…YYYY) or null
   *   • `mapProviderApiKeyConfigured` → boolean, so the SPA can show
   *     "مفتاح محفوظ ✓" without ever needing the raw value
   *   • `routingPrecision` → recomputed against the LIVE key + provider
   *     so a saved-but-stale value can't deceive the operator
   *   • `usingFallback` + `fallbackNoticeAr` → ready-to-render UX
   *     payload for the alert the owner asked for
   *
   * Owner brief: «لا تطبعه في logs. لا تعرضه في الواجهة.» Every route
   * that returns settings to the client routes through here.
   */
  toClientSettings(settings: PlanningSettings): PlanningSettings & {
    mapProviderApiKey: string | null;
    mapProviderApiKeyConfigured: boolean;
    effectiveProvider: MapProvider;
    usingFallback: boolean;
    fallbackNoticeAr: string | null;
  } {
    const liveKey = settings.mapProviderApiKey || config.googleMapsApiKey;
    const { provider: effectiveProvider, isApproximate } =
      resolveEffectiveProvider(settings.mapProvider, liveKey);
    return {
      ...settings,
      mapProviderApiKey: maskApiKey(settings.mapProviderApiKey),
      mapProviderApiKeyConfigured: Boolean(settings.mapProviderApiKey),
      effectiveProvider,
      routingPrecision: isApproximate ? "estimated" : "google",
      usingFallback: isApproximate,
      fallbackNoticeAr: isApproximate ? FALLBACK_NOTICE_AR : null,
    };
  },
};
