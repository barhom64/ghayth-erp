import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-02b M5b — additive calendar layer for the unified transport
 * contract.
 *
 * Scope of M5b (per the owner's explicit, narrow authorisation):
 *
 *   1. Add a NEW calendar layer `transport_request` that reads
 *      from `transport_bookings` (the unified contract path,
 *      PR #1902) and drills into `/umrah/transport-requests`
 *      (the M4 page, PR #2126).
 *   2. The legacy `transport_trip` layer (reads from
 *      `umrah_transport`, drills into `/umrah/transport/${id}`)
 *      stays untouched — same SQL, same drilldown, same defaults.
 *
 * Explicitly OUT of scope (the owner enumerated these):
 *   • No conversion of the legacy layer to the new one.
 *   • No deletion / disabling / read-only treatment of the legacy
 *     layer or its data.
 *   • No flag activation (`legacyTransportWritesDisabled` remains
 *     `defaultValue: false`).
 *   • No edit to `transport.tsx` legacy page.
 *   • No GL / engines / migrations / backfill / archive / permissions.
 *   • No change to the legacy /transport route's create/update path.
 *
 * Failure modes pinned:
 *   • Forgetting the new layer in either backend or FE → §A / §B fail.
 *   • Quietly rewiring `transport_trip` to read from
 *     `transport_bookings` or drill to `/umrah/transport-requests`
 *     → §C fails (old layer must remain intact).
 *   • Touching the flag default or the M3 wiring → §D fails.
 *   • Drifting any prior boundary sentinel → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ROUTE_UMRAH_ENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CALENDAR_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/calendar.tsx"),
  "utf8",
);
const ROUTE_UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);
const CATALOG = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahSettingsPoliciesCatalog.ts"),
  "utf8",
);
const LEGACY_TRANSPORT_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/transport.tsx"),
  "utf8",
);
const TABS_NAV = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

const FINANCE_BOUNDARY_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahFinanceBoundarySmoke.test.ts"),
  "utf8",
);
const TRANSPORT_BOUNDARY_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahTransportBoundarySmoke.test.ts"),
  "utf8",
);
const LEGACY_CONTAINMENT_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahTransportLegacyContainmentSmoke.test.ts"),
  "utf8",
);
const FLAG_PRESENCE_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahLegacyTransportFlagPresenceSmoke.test.ts"),
  "utf8",
);
const M4_PAGE_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahTransportRequestsPageSmoke.test.ts"),
  "utf8",
);
const M5A_NAV_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahTransportRequestsNavSmoke.test.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Backend exposes the new `transport_request` layer and queries
//      transport_bookings (NOT umrah_transport).
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5b §A — backend layer `transport_request` is declared and queries transport_bookings", () => {
  it("CalendarLayer union includes \"transport_request\"", () => {
    // The union string is split across multiple lines in the source.
    // Anchoring on the leading pipe + the string literal catches a
    // refactor that quietly drops the new layer.
    expect(ROUTE_UMRAH_ENT).toMatch(/\|\s*"transport_request"/);
  });

  it("CALENDAR_LAYER_META has the `transport_request` entry tied to entityType `transport_bookings`", () => {
    // Pin both the key and the entityType because future refactors
    // could leave the key but quietly retarget it at the legacy table.
    expect(ROUTE_UMRAH_ENT).toMatch(
      /transport_request:\s*\{[^}]*entityType:\s*"transport_bookings"[^}]*\}/,
    );
  });

  it("`runs` record initialiser includes the new layer key", () => {
    // If a refactor adds the layer to the union but forgets to seed
    // the runs map, TypeScript's exhaustiveness check would catch it
    // at compile time; this assertion is a belt-and-braces guard so
    // the failure also surfaces in tests. Matches the property
    // initialiser form `transport_request: null` inside the runs
    // object literal.
    expect(ROUTE_UMRAH_ENT).toMatch(/transport_request:\s*null/);
  });

  it("query block reads transport_bookings filtered by bookingSource = 'umrah_group'", () => {
    // Anchoring on the full filter chain (FROM + bookingSource +
    // requestedPickupDate) so a refactor that drops the source
    // filter (and thus leaks non-umrah bookings into the umrah
    // calendar) fails the smoke.
    const block = ROUTE_UMRAH_ENT.match(
      /requestedLayers\.includes\("transport_request"\)[\s\S]*?GROUP BY b\."requestedPickupDate"/,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/FROM\s+transport_bookings\s+b\b/);
    expect(block![0]).toMatch(
      /b\."bookingSource"\s*=\s*'umrah_group'/,
    );
    expect(block![0]).toMatch(
      /b\."requestedPickupDate"\s+BETWEEN\s+\$2::date\s+AND\s+\$3::date/,
    );
  });

  it("new layer's query does NOT touch umrah_transport (no cross-table leak)", () => {
    // The whole point of the additive design is that the two layers
    // live on independent tables. If the new block somehow joins or
    // selects from umrah_transport, the additive guarantee breaks.
    const block = ROUTE_UMRAH_ENT.match(
      /requestedLayers\.includes\("transport_request"\)[\s\S]*?GROUP BY b\."requestedPickupDate"/,
    );
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/\bumrah_transport\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — FE calendar exposes the new layer + LAYER_HREF entry +
//      includes it in the default-enabled set.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5b §B — FE calendar wires the new layer with the right drilldown", () => {
  it("FE CalendarLayer type union includes \"transport_request\"", () => {
    expect(CALENDAR_PAGE).toMatch(/\|\s*"transport_request"/);
  });

  it("LAYER_HREF.transport_request points at the M4 contract page", () => {
    // The drilldown URL must hit the contract path. If a refactor
    // accidentally points it at /umrah/transport/${ids[0]}, the page
    // would 404 (those IDs belong to umrah_transport, not the
    // contract page's data source).
    expect(CALENDAR_PAGE).toMatch(
      /transport_request:\s*\([^)]*\)\s*=>\s*[`"']\/umrah\/transport-requests[`"']/,
    );
  });

  it("LAYER_HREF.transport_request does NOT reference the legacy /umrah/transport/${id} pattern", () => {
    // Anchor on the layer key + the legacy URL shape immediately
    // after it. The intent: an arrow-function that yields
    // /umrah/transport/${...} for transport_request must never
    // appear (would mean someone quietly cross-wired tables).
    const transportRequestLine = CALENDAR_PAGE.match(
      /transport_request:\s*\([^)]*\)\s*=>[^,\n]*/,
    );
    expect(transportRequestLine).not.toBeNull();
    expect(transportRequestLine![0]).not.toMatch(/\/umrah\/transport\/\$\{/);
  });

  it("transport_request is included in the default-enabled layers Set", () => {
    // The Set spans multiple lines; anchor on the key literal
    // appearing inside the `new Set([...])` block.
    const setBlock = CALENDAR_PAGE.match(
      /enabledLayers[\s\S]*?new Set\(\[([\s\S]*?)\]\)/,
    );
    expect(setBlock).not.toBeNull();
    expect(setBlock![1]).toMatch(/"transport_request"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Legacy `transport_trip` layer is preserved untouched (additive,
//      not conversion).
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5b §C — legacy transport_trip layer is intact", () => {
  it("CalendarLayer union still includes \"transport_trip\"", () => {
    expect(ROUTE_UMRAH_ENT).toMatch(/\|\s*"transport_trip"/);
    expect(CALENDAR_PAGE).toMatch(/\|\s*"transport_trip"/);
  });

  it("CALENDAR_LAYER_META.transport_trip still ties to umrah_transport", () => {
    expect(ROUTE_UMRAH_ENT).toMatch(
      /transport_trip:\s*\{[^}]*entityType:\s*"umrah_transport"[^}]*\}/,
    );
  });

  it("legacy SQL block still reads from umrah_transport", () => {
    const block = ROUTE_UMRAH_ENT.match(
      /requestedLayers\.includes\("transport_trip"\)[\s\S]*?GROUP BY t\."tripDate"/,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/FROM\s+umrah_transport\s+t\b/);
    expect(block![0]).toMatch(
      /t\."tripDate"\s+BETWEEN\s+\$2::date\s+AND\s+\$3::date/,
    );
  });

  it("LAYER_HREF.transport_trip still drills to /umrah/transport/${ids[0]}", () => {
    expect(CALENDAR_PAGE).toMatch(
      /transport_trip:\s*\(ids\)\s*=>\s*ids\[0\]\s*\?\s*`\/umrah\/transport\/\$\{ids\[0\]\}`/,
    );
  });

  it("legacy `transport_trip` is still in the default-enabled layers Set", () => {
    const setBlock = CALENDAR_PAGE.match(
      /enabledLayers[\s\S]*?new Set\(\[([\s\S]*?)\]\)/,
    );
    expect(setBlock).not.toBeNull();
    expect(setBlock![1]).toMatch(/"transport_trip"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Backend / engine / flag surfaces unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5b §D — flag, M3 gate, and legacy FE consumer untouched", () => {
  it("routes/umrah.ts still references legacyTransportWritesDisabled exactly twice (M3 wiring intact)", () => {
    const refs = ROUTE_UMRAH.match(/\blegacyTransportWritesDisabled\b/g) ?? [];
    expect(refs.length).toBe(2);
  });

  it("catalog defaultValue for legacyTransportWritesDisabled is still `false`", () => {
    expect(CATALOG).toMatch(
      /key:\s*"legacyTransportWritesDisabled"[^}]*defaultValue:\s*false/,
    );
  });

  it("legacy transport.tsx still calls the legacy /umrah/transport endpoint", () => {
    expect(LEGACY_TRANSPORT_PAGE).toMatch(/["']\/umrah\/transport["']/);
  });

  it("legacy transport.tsx still does NOT call the contract endpoint", () => {
    expect(LEGACY_TRANSPORT_PAGE).not.toMatch(
      /\/umrah\/groups\/[^"'`\s]*\/transport-requests/,
    );
  });

  it("M5a-installed nav tab `/umrah/transport-requests` is still wired (no regression)", () => {
    expect(TABS_NAV).toMatch(/path:\s*"\/umrah\/transport-requests"/);
  });

  it("M5a-preserved legacy `/umrah/transport` nav tab is still wired", () => {
    expect(TABS_NAV).toMatch(
      /label:\s*"النقل والمواصلات",\s*path:\s*"\/umrah\/transport"/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Prior boundary sentinels still hold their M5b-merge values
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5b §E — earlier boundary sentinels unchanged", () => {
  it("Finance Boundary smoke still freezes routes/umrah.ts ledger reads at 2", () => {
    expect(FINANCE_BOUNDARY_SMOKE).toMatch(/mentions\.length\)\.toBe\(2\)/);
  });

  it("Transport Boundary smoke still expects 4 umrah_transport writes", () => {
    expect(TRANSPORT_BOUNDARY_SMOKE).toMatch(
      /countWrites\(ROUTE_UMRAH,\s*"umrah_transport"\)\)\.toBe\(4\)/,
    );
  });

  it("Transport Boundary smoke still expects 3 umrah_transport_pilgrims writes", () => {
    expect(TRANSPORT_BOUNDARY_SMOKE).toMatch(
      /countWrites\(ROUTE_UMRAH,\s*"umrah_transport_pilgrims"\)\)\.toBe\(3\)/,
    );
  });

  it("Legacy Containment smoke still expects 3 postTransportExpenseGL references", () => {
    expect(LEGACY_CONTAINMENT_SMOKE).toMatch(/\.toBe\(3\)/);
  });

  it("Legacy Containment smoke still expects 7 legacy event emissions", () => {
    expect(LEGACY_CONTAINMENT_SMOKE).toMatch(/emits\.length\)\.toBe\(7\)/);
  });

  it("Flag Presence smoke still expects exactly 2 references in routes/umrah.ts", () => {
    expect(FLAG_PRESENCE_SMOKE).toMatch(/refs\.length\)\.toBe\(2\)/);
  });

  it("M4 Page smoke + M5a Nav smoke files still exist with their key assertions", () => {
    // Anchor on a small, distinctive assertion from each upstream
    // smoke so accidentally deleting one of them surfaces here too.
    expect(M4_PAGE_SMOKE).toMatch(/transport-requests/);
    expect(M5A_NAV_SMOKE).toMatch(/path:\\s\*"\\\/umrah\\\/transport-requests"/);
  });
});
