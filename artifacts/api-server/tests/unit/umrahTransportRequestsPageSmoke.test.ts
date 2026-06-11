import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-02b M4 — new operational FE page consumes ONLY the unified
 * Service Contract path.
 *
 * What landed in M4:
 *   1. New file: src/pages/umrah/transport-requests.tsx — a small
 *      operator page that (a) picks an umrah group, (b) posts a
 *      transport request through
 *      `POST /umrah/groups/:id/transport-requests` and (c) lists
 *      existing requests via the matching GET endpoint.
 *   2. New lazy import + route entry in src/routes/umrahRoutes.tsx
 *      at `/umrah/transport-requests`.
 *
 * What M4 explicitly does NOT touch:
 *   • The legacy `src/pages/umrah/transport.tsx` (still writes to
 *     /umrah/transport / umrah_transport — frozen surface).
 *   • The sidebar / tabs / calendar entry points — M5 owns that
 *     switchover.
 *   • The feature flag `legacyTransportWritesDisabled` — still ships
 *     OFF by default per M2/M3.
 *   • Any backend route, engine, or GL hook.
 *
 * Failure modes the smoke pins:
 *   • If the new page accidentally calls the legacy `/umrah/transport`
 *     endpoint instead of the contract endpoint, §B fails.
 *   • If someone deletes or relocates the new page before M5, §A
 *     fails.
 *   • If the legacy page or boundary counts shift, §D / §E fail —
 *     M4 must NOT alter prior boundaries.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PAGE_PATH = join(
  REPO_ROOT,
  "artifacts/ghayth-erp/src/pages/umrah/transport-requests.tsx",
);
const ROUTES_PATH = join(
  REPO_ROOT,
  "artifacts/ghayth-erp/src/routes/umrahRoutes.tsx",
);
const LEGACY_PAGE_PATH = join(
  REPO_ROOT,
  "artifacts/ghayth-erp/src/pages/umrah/transport.tsx",
);

const PAGE_SRC = readFileSync(PAGE_PATH, "utf8");
const ROUTES_SRC = readFileSync(ROUTES_PATH, "utf8");
const LEGACY_PAGE_SRC = readFileSync(LEGACY_PAGE_PATH, "utf8");

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
const FLAG_WIRED_SMOKE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/tests/unit/umrahTransportFlagWiredSmoke.test.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Page file exists and exports a default React component
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M4 §A — new transport-requests page is in place", () => {
  it("page file exists with non-empty content", () => {
    expect(PAGE_SRC.length).toBeGreaterThan(200);
  });

  it("page exports a default React component", () => {
    expect(PAGE_SRC).toMatch(/export\s+default\s+function\s+\w+/);
  });

  it("page declares a PageShell with the contract-path subtitle", () => {
    // The subtitle hard-codes the contract endpoint string, so a
    // future refactor that silently moves the page off the contract
    // would have to also rewrite the subtitle — making the change
    // visible in code review.
    expect(PAGE_SRC).toMatch(/PageShell/);
    expect(PAGE_SRC).toMatch(
      /POST\s+\/umrah\/groups\/:id\/transport-requests/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Page calls the contract endpoints, not the legacy ones
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M4 §B — page consumes the unified contract surface only", () => {
  it("references the POST contract endpoint (templated with the picked group id)", () => {
    // Either the static literal or the `${groupId}`-interpolated form
    // must appear at least once. Both are accepted because the page
    // builds the path via template strings.
    expect(PAGE_SRC).toMatch(
      /\/umrah\/groups\/\$\{[^}]+\}\/transport-requests/,
    );
  });

  it("references the GET contract endpoint for the chosen group", () => {
    // Same path is used for both create (mutation) and list (query).
    // We assert the substring appears at least twice — one POST + one
    // GET — so removing either half fails the smoke.
    const matches = PAGE_SRC.match(
      /\/umrah\/groups\/\$\{[^}]+\}\/transport-requests/g,
    ) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT call the legacy /umrah/transport endpoint", () => {
    // The new page must be 100% on the contract. Anchoring on a quote
    // (string literal usage) avoids matching the word "transport" in
    // comments or identifiers like `transportRequestId`.
    expect(PAGE_SRC).not.toMatch(/["']\/umrah\/transport["']/);
    expect(PAGE_SRC).not.toMatch(/["']\/umrah\/transport\//);
  });

  it("does NOT reference the legacy umrah_transport table name", () => {
    expect(PAGE_SRC).not.toMatch(/\bumrah_transport\b/);
  });

  it("does NOT consult the legacy-writes flag (FE must never read settings)", () => {
    // M3 wired the gate server-side. The FE has no business reading
    // the flag directly; if it ever did, a per-company flip would
    // require a FE rebuild instead of a settings row update.
    expect(PAGE_SRC).not.toMatch(/\blegacyTransportWritesDisabled\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Route entry is registered in umrahRoutes.tsx
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M4 §C — /umrah/transport-requests route is wired", () => {
  it("lazy import for the new page is declared", () => {
    expect(ROUTES_SRC).toMatch(
      /lazy\(\(\)\s*=>\s*import\("@\/pages\/umrah\/transport-requests"\)\)/,
    );
  });

  it("route entry at /umrah/transport-requests is registered exactly once", () => {
    const entries = ROUTES_SRC.match(
      /path:\s*"\/umrah\/transport-requests"/g,
    ) ?? [];
    expect(entries.length).toBe(1);
  });

  it("legacy /umrah/transport route entry is still present (M4 must not unlink it)", () => {
    // M5 is where /umrah/transport gets unlinked; in M4 the legacy
    // entry stays so dispatchers keep their current workflow.
    expect(ROUTES_SRC).toMatch(/path:\s*"\/umrah\/transport"/);
    expect(ROUTES_SRC).toMatch(/path:\s*"\/umrah\/transport\/:id"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Legacy page is untouched by M4 (no contract-path bleed-through)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M4 §D — legacy transport.tsx still hits the legacy endpoint", () => {
  it("legacy page still references the legacy POST /umrah/transport endpoint", () => {
    // If M4 accidentally edited the legacy page (e.g., redirected it
    // to the contract), this catches it. The intent is for the legacy
    // page to remain a dormant working copy until M5/M6 close it out.
    expect(LEGACY_PAGE_SRC).toMatch(/["']\/umrah\/transport["']/);
  });

  it("legacy page does NOT yet call the contract endpoint (M5 owns that)", () => {
    expect(LEGACY_PAGE_SRC).not.toMatch(
      /\/umrah\/groups\/[^"'`\s]*\/transport-requests/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Prior boundary sentinels still hold their M4-merge values
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M4 §E — earlier boundary sentinels unchanged", () => {
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
    // M3 wired the helper (1 doc-comment + 1 settings-key literal).
    // M4 is an FE-only change — count must stay at 2.
    expect(FLAG_PRESENCE_SMOKE).toMatch(/refs\.length\)\.toBe\(2\)/);
  });

  it("Flag Wired smoke still pins helper presence + default-off catalog", () => {
    expect(FLAG_WIRED_SMOKE).toMatch(/decls\.length\)\.toBe\(1\)/);
    expect(FLAG_WIRED_SMOKE).toMatch(
      /defaultValue.*\)\.toBe\(false\)/,
    );
  });
});
