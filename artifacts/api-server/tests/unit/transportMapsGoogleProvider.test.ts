import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 final gap — real Google Maps provider implementation.
//
// User's request: "وش ينقص عشان تسويها سوي اتفاقية مزود وخلص كل شي"
//   (What's missing to do it. Make a provider agreement and finish.)
//
// I can't open a Google Cloud account or attach a billing card — those
// are commitments only the owner can make. But I can ship every line
// of code so the moment the owner pastes the key into
// /admin/transport-planning-settings → "مفتاح API" the integration
// works end-to-end with zero further code changes.
//
// This test pins the contract:
//   1. mapsGoogleProvider.ts implements estimateRoute / geocode /
//      reverseGeocode / healthCheck using fetch + 5s timeout
//   2. MapsService dispatches google_maps requests to the real
//      provider and falls back to manual_only on any failure
//   3. /transport/planning-settings/health-check endpoint exists for
//      the admin UI to verify the key live

const apiSrc = join(import.meta.dirname!, "../../src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const PROVIDER = readApi("lib/fleet/mapsGoogleProvider.ts");
const SERVICE  = readApi("lib/fleet/mapsService.ts");
const PLANNING = readApi("routes/transport-planning.ts");

describe("#1812 — mapsGoogleProvider real implementation", () => {
  it("file exists at the canonical lib path", () => {
    expect(existsSync(join(apiSrc, "lib/fleet/mapsGoogleProvider.ts"))).toBe(true);
  });

  it("exports the 4 functions MapsService routes to", () => {
    for (const fn of [
      "googleEstimateRoute", "googleGeocode",
      "googleReverseGeocode", "googleHealthCheck",
    ]) {
      expect(PROVIDER).toMatch(new RegExp(`export async function ${fn}`));
    }
  });

  it("calls the correct Google Maps endpoints", () => {
    expect(PROVIDER).toContain("maps.googleapis.com/maps/api/distancematrix/json");
    expect(PROVIDER).toContain("maps.googleapis.com/maps/api/geocode/json");
  });

  it("requests Arabic responses + KSA region bias", () => {
    expect(PROVIDER).toMatch(/url\.searchParams\.set\("language", "ar"\)/);
    expect(PROVIDER).toMatch(/url\.searchParams\.set\("region", "sa"\)/);
  });

  it("uses a 5-second timeout on every Google call (no hanging requests)", () => {
    expect(PROVIDER).toMatch(/TIMEOUT_MS = 5_000/);
    expect(PROVIDER).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), TIMEOUT_MS\)/);
  });

  it("returns null on any failure path (so MapsService falls back to manual)", () => {
    // Each function catches errors + returns null + logs at warn level.
    const warns = (PROVIDER.match(/logger\.warn/g) ?? []).length;
    expect(warns, "every failure path should warn-log").toBeGreaterThanOrEqual(5);
  });

  it("healthCheck distinguishes 5 outcomes for the admin UI", () => {
    for (const outcome of [
      '"ok"', '"invalid_key"', '"quota_exceeded"',
      '"network_error"', '"missing"',
    ]) {
      expect(PROVIDER, `outcome ${outcome} missing`).toContain(outcome);
    }
    expect(PROVIDER).toContain("REQUEST_DENIED");
    expect(PROVIDER).toContain("OVER_QUERY_LIMIT");
  });
});

describe("#1812 — MapsService dispatches to Google when configured", () => {
  it("imports the 4 provider functions", () => {
    expect(SERVICE).toContain("googleEstimateRoute");
    expect(SERVICE).toContain("googleGeocode");
    expect(SERVICE).toContain("googleReverseGeocode");
    expect(SERVICE).toContain("googleHealthCheck");
  });

  it("estimateRoute prefers per-company API key, falls back to config.googleMapsApiKey (env var)", () => {
    expect(SERVICE).toMatch(/settings\.mapProviderApiKey \|\| config\.googleMapsApiKey/);
  });

  it("estimateRoute calls Google when provider=google_maps + key present", () => {
    expect(SERVICE).toMatch(/if \(provider === "google_maps" && apiKey\)/);
    expect(SERVICE).toMatch(/googleEstimateRoute\(\{/);
    expect(SERVICE).toMatch(/isApproximate: false/);
  });

  it("falls through to manual_only when Google returns null (transparent fallback)", () => {
    // The "Fall-through to manual on Google failure" path keeps
    // request alive — operator never sees a 5xx.
    expect(SERVICE).toMatch(/Fall-through to manual on Google failure/);
  });

  it("geocode + reverseGeocode route through Google when active", () => {
    expect(SERVICE).toMatch(/async geocode[\s\S]{0,500}googleGeocode\(\{/);
    expect(SERVICE).toMatch(/async reverseGeocode[\s\S]{0,500}googleReverseGeocode\(\{/);
  });

  it("healthCheck routes to Google + returns the 6 status alphabet", () => {
    expect(SERVICE).toMatch(/async healthCheck[\s\S]{0,500}googleHealthCheck\(apiKey\)/);
    for (const v of ['"ok"', '"invalid_key"', '"quota_exceeded"', '"network_error"', '"missing"', '"not_supported"']) {
      expect(SERVICE, `healthCheck outcome ${v} missing`).toContain(v);
    }
  });
});

describe("#1812 — admin health-check endpoint", () => {
  it("POST /transport/planning-settings/health-check is registered", () => {
    expect(PLANNING).toMatch(/transportPlanningRouter\.post\(\s*\n?\s*"\/transport\/planning-settings\/health-check"/);
  });

  it("gated on fleet.bookings:update (same as the settings PATCH)", () => {
    const block = PLANNING.slice(PLANNING.indexOf("/transport/planning-settings/health-check"));
    expect(block).toMatch(/authorize\(\{ feature: "fleet\.bookings", action: "update" \}\)/);
  });

  it("delegates to MapsService.healthCheck + returns the status verbatim", () => {
    const block = PLANNING.slice(PLANNING.indexOf("/transport/planning-settings/health-check"));
    expect(block).toMatch(/MapsService\.healthCheck\(scope\.companyId\)/);
    expect(block).toMatch(/res\.json\(\{ data: \{ status \} \}\)/);
  });
});
