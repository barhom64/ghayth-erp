import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Maps Provider Adapter — static wiring test (#1812 follow-up,
 * owner brief 2026-06-15).
 *
 * Owner contract: «لا يوجد توقف كامل للنقل بسبب الخرائط».
 * The transport flow (booking → planning → dispatch → driver
 * navigation) MUST survive a missing or failing Google Maps key. This
 * test pins the contract surfaces that prove the adapter is wired:
 *
 *   1. Migration adds the two new settings columns
 *      (`enableExternalNavigationUrls`, `routingPrecision`) and
 *      extends the `mapProvider` CHECK to include `auto`.
 *   2. MapsService exposes the resolver + the API-key mask helper +
 *      the Arabic fallback notice + a single `toClientSettings`
 *      chokepoint that strips the raw key.
 *   3. The PATCH /transport/planning-settings Zod schema accepts
 *      `auto` and the new toggle, and the route audits with the key
 *      redacted.
 *   4. The SPA planning panel renders the fallback notice + the
 *      masked-key field; the driver navigation page exposes a
 *      prominent "ابدأ الملاحة" button bound to a Google Maps URL
 *      (keyless deep link).
 *   5. Hard boundary: no engine/finance/GL/journal/reputation
 *      reference introduced by this work.
 *
 * Per owner's package-locality rule, this test is static (regex-only)
 * — api-server never imports SPA runtime.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");

const MAPS_SVC = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsService.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-planning.ts"),
  "utf8",
);
const SPA_SETTINGS = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-rules-admin.tsx"),
  "utf8",
);
const SPA_DRIVER_NAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/me-driver-navigation.tsx"),
  "utf8",
);

// Find the adapter migration by content match — we don't care about
// the literal number so this test still passes if it gets renumbered
// during a merge race.
const MIGRATIONS_DIR = join(repoRoot, "artifacts/api-server/src/migrations");
const ADAPTER_MIGRATION = (() => {
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (!name.endsWith(".sql")) continue;
    const body = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    if (/Maps Provider Adapter/.test(body)) return body;
  }
  return null;
})();

describe("Maps Provider Adapter — migration wiring", () => {
  it("a migration carrying the 'Maps Provider Adapter' header exists", () => {
    expect(ADAPTER_MIGRATION, "no migration with 'Maps Provider Adapter' header").toBeTruthy();
  });

  it("adds `enableExternalNavigationUrls BOOLEAN NOT NULL DEFAULT TRUE`", () => {
    expect(ADAPTER_MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS "enableExternalNavigationUrls"\s+BOOLEAN\s+NOT NULL\s+DEFAULT TRUE/,
    );
  });

  it("adds `routingPrecision TEXT NOT NULL DEFAULT 'estimated'` with CHECK ∈ {google, estimated}", () => {
    expect(ADAPTER_MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS "routingPrecision"\s+TEXT\s+NOT NULL\s+DEFAULT 'estimated'/,
    );
    expect(ADAPTER_MIGRATION).toMatch(
      /ADD CONSTRAINT transport_planning_routing_precision_check[\s\S]{0,200}?'google',\s*'estimated'/,
    );
  });

  it("extends the mapProvider CHECK constraint to allow `auto`", () => {
    expect(ADAPTER_MIGRATION).toMatch(
      /DROP CONSTRAINT transport_planning_map_provider_check/,
    );
    expect(ADAPTER_MIGRATION).toMatch(
      /ADD CONSTRAINT transport_planning_map_provider_check[\s\S]{0,300}?'manual_only',\s*'google_maps',\s*'mapbox',\s*'here_maps',\s*'auto'/,
    );
  });

  it("also extends the route-estimate cache CHECK so a fallback row never bricks the table", () => {
    expect(ADAPTER_MIGRATION).toMatch(
      /DROP CONSTRAINT transport_route_estimates_provider_check[\s\S]{0,400}?ADD CONSTRAINT transport_route_estimates_provider_check[\s\S]{0,300}?'auto'/,
    );
  });
});

describe("Maps Provider Adapter — mapsService surfaces", () => {
  it("`MapProvider` type union includes `auto`", () => {
    expect(MAPS_SVC).toMatch(
      /export type MapProvider\s*=\s*[^;]*\|\s*"auto"/,
    );
  });

  it("`PlanningSettings` interface declares the two new fields", () => {
    expect(MAPS_SVC).toMatch(/enableExternalNavigationUrls:\s*boolean/);
    expect(MAPS_SVC).toMatch(/routingPrecision:\s*"google"\s*\|\s*"estimated"/);
  });

  it("`DEFAULT_SETTINGS` defaults the new fields to safe values (enable=true, precision='estimated')", () => {
    const block = MAPS_SVC.match(/DEFAULT_SETTINGS[\s\S]+?^};/m);
    expect(block, "DEFAULT_SETTINGS block not found").toBeTruthy();
    expect(block![0]).toMatch(/enableExternalNavigationUrls:\s*true/);
    expect(block![0]).toMatch(/routingPrecision:\s*"estimated"/);
  });

  it("`loadPlanningSettings` SELECT projects the two new columns", () => {
    const fnBlock = MAPS_SVC.match(/export async function loadPlanningSettings[\s\S]+?^\}/m);
    expect(fnBlock).toBeTruthy();
    expect(fnBlock![0]).toMatch(/"enableExternalNavigationUrls"/);
    expect(fnBlock![0]).toMatch(/"routingPrecision"/);
  });

  it("`updatePlanningSettings.colMap` accepts writes to the new fields", () => {
    const fnBlock = MAPS_SVC.match(/export async function updatePlanningSettings[\s\S]+?^\}/m);
    expect(fnBlock).toBeTruthy();
    expect(fnBlock![0]).toMatch(/enableExternalNavigationUrls:\s*'"enableExternalNavigationUrls"'/);
    expect(fnBlock![0]).toMatch(/routingPrecision:\s*'"routingPrecision"'/);
  });

  it("exports `resolveEffectiveProvider` — the auto-fallback resolver", () => {
    expect(MAPS_SVC).toMatch(
      /export function resolveEffectiveProvider\(\s*configured:\s*MapProvider,\s*apiKey:\s*string\s*\|\s*null,?\s*\):/,
    );
    // The resolver: auto/google_maps + key → google; everything else → manual.
    expect(MAPS_SVC).toMatch(
      /\(configured\s*===\s*"google_maps"\s*\|\|\s*configured\s*===\s*"auto"\)\s*&&\s*apiKey/,
    );
  });

  it("exports `maskApiKey` returning `XXXX…YYYY` for long keys and `null` for missing keys", () => {
    expect(MAPS_SVC).toMatch(
      /export function maskApiKey\(\s*key:\s*string\s*\|\s*null\s*\|\s*undefined,?\s*\):\s*string\s*\|\s*null/,
    );
    const fn = MAPS_SVC.match(/export function maskApiKey[\s\S]+?^}/m);
    expect(fn).toBeTruthy();
    // Returns null for nullish/empty.
    expect(fn![0]).toMatch(/return null/);
    // Returns the masked shape for long keys.
    expect(fn![0]).toMatch(/s\.slice\(0,\s*4\)[\s\S]{0,40}?s\.slice\(-4\)/);
  });

  it("exports `FALLBACK_NOTICE_AR` with the exact Arabic copy the owner approved", () => {
    expect(MAPS_SVC).toMatch(
      /export const FALLBACK_NOTICE_AR\s*=\s*[\s\S]{0,40}?"الخرائط تعمل بوضع تقديري حتى ربط مفتاح Google Maps التجاري"/,
    );
  });

  it("`MapsService.toClientSettings` is the single chokepoint that masks the API key + adds the fallback payload", () => {
    expect(MAPS_SVC).toMatch(/toClientSettings\(settings:\s*PlanningSettings\)/);
    const fn = MAPS_SVC.match(/toClientSettings\(settings:\s*PlanningSettings\)[\s\S]+?^\s*},/m);
    expect(fn, "toClientSettings body not found").toBeTruthy();
    // Mask helper used.
    expect(fn![0]).toMatch(/maskApiKey\(settings\.mapProviderApiKey\)/);
    // Configured-flag exposed instead of the raw key.
    expect(fn![0]).toMatch(/mapProviderApiKeyConfigured:\s*Boolean\(settings\.mapProviderApiKey\)/);
    // Fallback notice payload included.
    expect(fn![0]).toMatch(/fallbackNoticeAr:\s*isApproximate\s*\?\s*FALLBACK_NOTICE_AR\s*:\s*null/);
  });

  it("`MapsService.estimateRoute` routes through the resolver (no duplicated provider-decision logic)", () => {
    const fn = MAPS_SVC.match(/async estimateRoute\(req:[\s\S]+?^\s*},/m);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/resolveEffectiveProvider\(\s*settings\.mapProvider,\s*apiKey/);
  });

  it("`MapsService.healthCheck` accepts `auto` (returns the google probe when configured)", () => {
    const fn = MAPS_SVC.match(/async healthCheck\(companyId:[\s\S]+?^\s*},/m);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/settings\.mapProvider\s*===\s*"google_maps"\s*\|\|\s*settings\.mapProvider\s*===\s*"auto"/);
  });
});

describe("Maps Provider Adapter — transport-planning route wiring", () => {
  it("`MAP_PROVIDERS_WRITABLE` whitelist contains exactly {manual_only, google_maps, auto}", () => {
    expect(ROUTES).toMatch(
      /MAP_PROVIDERS_WRITABLE\s*=\s*\[\s*"manual_only",\s*"google_maps",\s*"auto"\s*\]\s*as const/,
    );
  });

  it("the PATCH Zod schema accepts `enableExternalNavigationUrls` (boolean or `\"true\"`/`\"false\"`)", () => {
    const schema = ROUTES.match(/updateSettingsSchema\s*=\s*z\.object\({[\s\S]+?}\);/);
    expect(schema, "updateSettingsSchema not found").toBeTruthy();
    expect(schema![0]).toMatch(/enableExternalNavigationUrls:\s*z[\s\S]{0,200}?z\.boolean\(\)/);
    expect(schema![0]).toMatch(/enableExternalNavigationUrls:\s*z[\s\S]{0,300}?z\.enum\(\["true",\s*"false"\]\)/);
  });

  it("GET /transport/planning-settings returns `MapsService.toClientSettings(settings)` (never the raw row)", () => {
    expect(ROUTES).toMatch(
      /MapsService\.toClientSettings\(settings\)/,
    );
    // Defence-in-depth: no other route file path returns `loadPlanningSettings(...)` directly to the client.
    expect(ROUTES).not.toMatch(
      /res\.json\([\s\S]{0,80}?data:\s*await loadPlanningSettings/,
    );
  });

  it("PATCH /transport/planning-settings echoes the masked client view, not the raw updated settings", () => {
    // Find the PATCH handler body and pin the response shape.
    const handler = ROUTES.match(
      /transportPlanningRouter\.patch\(\s*"\/transport\/planning-settings"[\s\S]+?^\);/m,
    );
    expect(handler, "PATCH handler not found").toBeTruthy();
    expect(handler![0]).toMatch(/data:\s*MapsService\.toClientSettings\(updated\)/);
    // And the raw `updated` is NOT echoed.
    expect(handler![0]).not.toMatch(/res\.json\(\{\s*data:\s*updated\s*\}\)/);
  });

  it("PATCH /transport/planning-settings redacts the API key from the audit log payload", () => {
    const handler = ROUTES.match(
      /transportPlanningRouter\.patch\(\s*"\/transport\/planning-settings"[\s\S]+?^\);/m,
    );
    expect(handler).toBeTruthy();
    // Sentinel strings, not the raw value.
    expect(handler![0]).toMatch(/"\[set\]"/);
    expect(handler![0]).toMatch(/"\[cleared\]"/);
    // And the createAuditLog call uses `auditPayload`, not the raw `b`.
    expect(handler![0]).toMatch(/createAuditLog\([\s\S]{0,400}?after:\s*auditPayload/);
  });
});

describe("Maps Provider Adapter — SPA settings page", () => {
  it("the provider dropdown lists exactly {auto, google_maps, manual_only} (no mapbox/here_maps phantoms)", () => {
    const list = SPA_SETTINGS.match(/MAP_PROVIDERS_UI\s*=\s*\[[\s\S]+?\];/);
    expect(list, "MAP_PROVIDERS_UI not found").toBeTruthy();
    expect(list![0]).toMatch(/value:\s*"auto"/);
    expect(list![0]).toMatch(/value:\s*"google_maps"/);
    expect(list![0]).toMatch(/value:\s*"manual_only"/);
    expect(list![0]).not.toMatch(/value:\s*"mapbox"/);
    expect(list![0]).not.toMatch(/value:\s*"here_maps"/);
  });

  it("renders the fallback notice when `usingFallback` is true (testid='maps-fallback-notice')", () => {
    expect(SPA_SETTINGS).toMatch(/data-testid="maps-fallback-notice"/);
    expect(SPA_SETTINGS).toMatch(/usingFallback\s*&&\s*fallbackNotice/);
  });

  it("exposes a masked API-key input — type='password', autoComplete='off', no raw value rendered", () => {
    // Find the input that targets the API key.
    const inputBlock = SPA_SETTINGS.match(
      /Label[\s\S]{0,80}?مفتاح Google Maps API[\s\S]+?<\/div>\s*<\/div>/,
    );
    expect(inputBlock, "API key input block not found").toBeTruthy();
    expect(inputBlock![0]).toMatch(/type="password"/);
    expect(inputBlock![0]).toMatch(/autoComplete="off"/);
    // The placeholder uses the SERVER-PROVIDED masked value, never a fresh
    // string built from the raw key.
    expect(inputBlock![0]).toMatch(/maskedKey/);
  });

  it("offers an explicit 'delete saved key' control that posts mapProviderApiKey=null", () => {
    expect(SPA_SETTINGS).toMatch(/حذف المفتاح المحفوظ/);
    expect(SPA_SETTINGS).toMatch(/newApiKey\s*===\s*"__clear__"[\s\S]{0,80}?mapProviderApiKey\s*=\s*null/);
  });

  it("includes the operator toggle for `enableExternalNavigationUrls` bound to the saved value", () => {
    expect(SPA_SETTINGS).toMatch(/enableExternalNavigationUrls/);
    expect(SPA_SETTINGS).toMatch(/setEnableExternalNav/);
  });
});

describe("Maps Provider Adapter — driver navigation screen", () => {
  it("renders a prominent 'ابدأ الملاحة' Button bound to a Google Maps deep link", () => {
    expect(SPA_DRIVER_NAV).toMatch(/data-testid="start-navigation-button"/);
    expect(SPA_DRIVER_NAV).toMatch(/ابدأ الملاحة/);
    // The deep link is keyless — the api=1 form that Google Maps accepts
    // without any API key. Crucial: works offline of provider config.
    expect(SPA_DRIVER_NAV).toMatch(
      /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=\$\{navTarget\}&travelmode=driving/,
    );
  });
});

describe("Maps Provider Adapter — boundary intact", () => {
  it("no finance / GL / journal / reputation reference introduced in mapsService.ts", () => {
    expect(MAPS_SVC).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore/,
    );
  });

  it("no engine import bypass — assignmentSuggestionEngine NOT imported into mapsService.ts", () => {
    expect(MAPS_SVC).not.toMatch(/from\s+["']\.\/assignmentSuggestionEngine/);
  });

  it("the migration touches ONLY transport_planning_settings + transport_route_estimates", () => {
    expect(ADAPTER_MIGRATION).toBeTruthy();
    const tables =
      ADAPTER_MIGRATION!.match(/ALTER TABLE public\.(\w+)/g) ?? [];
    const distinct = new Set(tables.map((t) => t.replace("ALTER TABLE public.", "")));
    // Only the two tables the adapter owns.
    for (const t of distinct) {
      expect([
        "transport_planning_settings",
        "transport_route_estimates",
      ]).toContain(t);
    }
  });

  it("API key is NEVER logged — no logger.* call dumps `mapProviderApiKey` or `apiKey` as a value", () => {
    // Forbid patterns like logger.info({ apiKey }) or logger.warn(..., apiKey)
    // that would leak the secret to logs. Allow `apiKey: '[set]'` style.
    expect(MAPS_SVC).not.toMatch(/logger\.(info|warn|error|debug)\([\s\S]{0,200}?\bapiKey\b[\s\S]{0,40}?[,}]/);
    // The route file: no console.log of the body that might carry the key.
    expect(ROUTES).not.toMatch(/console\.log\([\s\S]{0,200}?mapProviderApiKey/);
  });
});
