import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-02b M5a — link the new contract-path transport page from the
 * umrah tabs nav.
 *
 * Scope of M5a (per the owner's explicit authorisation):
 *
 *   1. Add a tab entry in `components/shared/umrah-tabs-nav.tsx`
 *      pointing at `/umrah/transport-requests` so the operator can
 *      reach the M4 page without typing the URL.
 *   2. Leave the existing legacy `/umrah/transport` tab in place,
 *      UNCHANGED, so dispatchers keep their current workflow.
 *
 * Explicitly OUT of scope in M5a (the owner enumerated these):
 *   • No calendar link rewiring — that's M5b and needs its own
 *     authorisation.
 *   • No closing of the legacy page; no read-only conversion.
 *   • No flag activation.
 *   • No backend / engine / GL / postTransportExpenseGL change.
 *   • No migration / permission / archive / deletion.
 *   • No production behaviour change beyond surfacing the new link.
 *
 * Failure modes pinned by this smoke:
 *   • Removing or renaming the legacy tab → §B fails.
 *   • Forgetting the new tab → §A fails.
 *   • Bleeding the new link into calendar pages or backend routes →
 *     §C / §D fail.
 *   • Flipping the catalog default or shifting any earlier boundary
 *     sentinel → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const TABS_NAV = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/umrah-tabs-nav.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const CALENDAR_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/calendar.tsx"),
  "utf8",
);
const LEGACY_TRANSPORT_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/transport.tsx"),
  "utf8",
);
const NEW_TRANSPORT_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah/transport-requests.tsx"),
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

// ─────────────────────────────────────────────────────────────────────────────
// §A — Tabs nav exposes the new contract-path entry
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5a §A — tabs nav links the new contract page", () => {
  it("declares a tab entry whose href is exactly `/umrah/transport-requests`", () => {
    // Anchoring on the literal href inside the PRIMARY_TABS array
    // entry shape catches a stray reference (e.g., a comment about
    // the path) — the match must include the surrounding `href:` key.
    expect(TABS_NAV).toMatch(/href:\s*"\/umrah\/transport-requests"/);
  });

  it("attaches the new entry to the existing `/umrah/transport-requests` route", () => {
    // The route table from M4 must still register the page; if the
    // tab links somewhere with no route, the user lands on 404.
    expect(ROUTES).toMatch(/path:\s*"\/umrah\/transport-requests"/);
  });

  it("new tab declares a `match` array that contains only its own path", () => {
    // Guard against an accidental overlap like `match: ["/umrah/transport"]`,
    // which would cause both tabs to highlight as active at the same
    // time on either route.
    const entryMatch = TABS_NAV.match(
      /href:\s*"\/umrah\/transport-requests"[^}]*match:\s*\[\s*"\/umrah\/transport-requests"\s*\]/,
    );
    expect(entryMatch).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Legacy `/umrah/transport` tab is preserved untouched
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5a §B — legacy tab + page remain untouched", () => {
  it("tabs nav still has the legacy `/umrah/transport` entry (label: النقل)", () => {
    // M5a authorisation: keep the old tab as-is. The legacy entry
    // shape is the original; we anchor on href + the Arabic label so
    // that quietly relabelling it (e.g. "النقل (قديم)") still fails
    // the smoke and surfaces the change for review.
    expect(TABS_NAV).toMatch(
      /href:\s*"\/umrah\/transport"[^}]*label:\s*"النقل"/,
    );
  });

  it("legacy transport.tsx still calls the legacy POST endpoint", () => {
    expect(LEGACY_TRANSPORT_PAGE).toMatch(/["']\/umrah\/transport["']/);
  });

  it("legacy transport.tsx still does NOT call the contract endpoint (M5a doesn't touch it)", () => {
    expect(LEGACY_TRANSPORT_PAGE).not.toMatch(
      /\/umrah\/groups\/[^"'`\s]*\/transport-requests/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Calendar is NOT rewired (that's M5b — separate authorisation)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5a §C — calendar links unchanged", () => {
  it("umrah calendar page does NOT reference the new contract-path route", () => {
    // The owner explicitly held calendar rewiring for M5b. If a
    // calendar link starts pointing at the new page, M5b would have
    // been silently merged into M5a — this smoke surfaces that.
    expect(CALENDAR_PAGE).not.toMatch(/\/umrah\/transport-requests/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — No backend / engine / GL / flag drift
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5a §D — backend and flag surfaces unchanged", () => {
  it("routes/umrah.ts still references legacyTransportWritesDisabled exactly twice (M3 wiring intact)", () => {
    const refs = ROUTE_UMRAH.match(/\blegacyTransportWritesDisabled\b/g) ?? [];
    expect(refs.length).toBe(2);
  });

  it("catalog defaultValue for legacyTransportWritesDisabled is still `false` (gate dormant)", () => {
    // M5a must not toggle the flag default. Anchoring on the literal
    // catalog entry shape catches a stealth flip.
    expect(CATALOG).toMatch(
      /key:\s*"legacyTransportWritesDisabled"[^}]*defaultValue:\s*false/,
    );
  });

  it("new transport-requests page is the only FE consumer of POST /umrah/groups/:id/transport-requests (still)", () => {
    // Defence in depth — if M5a accidentally pasted the contract
    // call into another file (e.g., legacy page), this would catch
    // it. The new page must contain at least one template-string
    // occurrence; nothing else under pages/umrah/ may.
    expect(NEW_TRANSPORT_PAGE).toMatch(
      /\/umrah\/groups\/\$\{[^}]+\}\/transport-requests/,
    );
    // Legacy page must remain free of the contract endpoint.
    expect(LEGACY_TRANSPORT_PAGE).not.toMatch(
      /\/umrah\/groups\/[^"'`\s]*\/transport-requests/,
    );
    // Calendar page also must remain free.
    expect(CALENDAR_PAGE).not.toMatch(
      /\/umrah\/groups\/[^"'`\s]*\/transport-requests/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Prior boundary sentinels still hold their M5a-merge values
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M5a §E — earlier boundary sentinels unchanged", () => {
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

  it("M4 Page smoke still expects the legacy route entries to remain", () => {
    // M5a doesn't delete the legacy route; M4 smoke pinned this and
    // we re-pin here so a future PR that quietly drops the legacy
    // route entry fails both M4 §C and M5a §E.
    expect(M4_PAGE_SMOKE).toMatch(
      /path:\\s\*"\\\/umrah\\\/transport"/,
    );
    expect(M4_PAGE_SMOKE).toMatch(
      /path:\\s\*"\\\/umrah\\\/transport\\\/:id"/,
    );
  });
});
