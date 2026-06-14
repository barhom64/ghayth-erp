import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 FIX-11 (DEAD-02) — only the implemented map providers
 * (`manual_only`, `google_maps`) are accepted by the public PATCH
 * /transport/planning-settings endpoint.
 *
 * The audit (file 12 «الميّت والقديم» + file 14 FIX-11) called
 * out the stubbed `mapbox` and `here_maps` providers as misleading
 * UX: mapsService falls back to `manual_only` for both
 * (mapsService.ts:305-309), so an operator picking "mapbox" and
 * saving would see every distance estimate stay as a straight-line
 * Haversine — silent regression of an expected feature.
 *
 * This fix restricts the WRITABLE enum to the two providers that
 * actually work. The TS type union and DB CHECK constraint
 * (migration 271:130) still list all four — old rows keep loading
 * correctly — but no NEW write can set the stubbed values via the
 * public PATCH.
 *
 * Per the owner's package-locality rule: static, regex-only test,
 * no SPA runtime import.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-planning.ts"),
  "utf8",
);
const MAPS = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsService.ts"),
  "utf8",
);

describe("#2079 FIX-11 — only implemented map providers are settable", () => {
  it("the writable enum tuple lists EXACTLY manual_only + google_maps", () => {
    expect(ROUTE).toMatch(
      /const\s+MAP_PROVIDERS_WRITABLE\s*=\s*\[\s*"manual_only"\s*,\s*"google_maps"\s*\]\s*as const/,
    );
  });

  it("the writable enum does NOT include mapbox or here_maps", () => {
    const tuple = ROUTE.match(/const\s+MAP_PROVIDERS_WRITABLE\s*=\s*\[[^\]]+\]/);
    expect(tuple, "MAP_PROVIDERS_WRITABLE tuple not found").toBeTruthy();
    expect(tuple![0]).not.toMatch(/"mapbox"/);
    expect(tuple![0]).not.toMatch(/"here_maps"/);
  });

  it("the legacy 4-entry MAP_PROVIDERS constant is gone (no shadow path)", () => {
    // The old name was `MAP_PROVIDERS` with all four providers; if
    // it lingered alongside the new one, callers could accidentally
    // pick it up and re-open the gap.
    expect(ROUTE).not.toMatch(
      /const\s+MAP_PROVIDERS\s*=\s*\[\s*"manual_only"\s*,\s*"google_maps"\s*,\s*"mapbox"/,
    );
  });

  it("the updateSettingsSchema feeds the writable enum into z.enum", () => {
    expect(ROUTE).toMatch(
      /mapProvider:\s*z\.enum\(MAP_PROVIDERS_WRITABLE/,
    );
  });

  it("a clear Arabic errorMap surfaces when the operator picks a stubbed provider", () => {
    expect(ROUTE).toMatch(
      /مزوّد الخرائط المختار غير مفعَّل في النظام/,
    );
  });
});

describe("#2079 FIX-11 — DB / type union remain unchanged (read-side safety)", () => {
  it("the MapProvider type union still lists all four (DB rows may still carry mapbox/here_maps)", () => {
    // Don't break the READ path: any row already storing one of
    // the stubbed values must keep loading. The mapsService fallback
    // logic at lines 305-309 silently downgrades them to manual_only
    // at render time. That's the right place for the legacy fence.
    expect(MAPS).toMatch(
      /export type MapProvider\s*=\s*"manual_only"\s*\|\s*"google_maps"\s*\|\s*"mapbox"\s*\|\s*"here_maps"/,
    );
  });

  it("mapsService still falls back to manual_only when a stubbed provider is loaded", () => {
    // Regression pin on the existing fallback at line 305-309.
    expect(MAPS).toMatch(
      /provider === "mapbox" \|\| provider === "here_maps"/,
    );
  });
});
