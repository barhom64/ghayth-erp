import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-02b M3 — Legacy umrah_transport WRITE gate wired into umrah.ts.
 *
 * The flag added in M2 (legacyTransportWritesDisabled, defaulting to
 * false) is now consulted at the start of POST /transport and
 * PATCH /transport/:id. When a company explicitly sets the value to
 * true, both endpoints return 410 with a hint pointing operators at
 * the unified contract endpoint:
 *
 *   POST /umrah/groups/:id/transport-requests
 *
 * GET, DELETE, manifest, and check-in handlers are intentionally NOT
 * gated — historic rows must remain inspectable and closable while the
 * legacy write surface freezes. M4 will introduce the FE consumer of
 * the contract; only after that lands does the owner enable the flag
 * for any company.
 *
 * What this smoke pins:
 *
 *   §A The helper `isLegacyTransportWritesDisabled` is defined exactly
 *      once in routes/umrah.ts and reads the catalog key
 *      `umrah.financial.legacyTransportWritesDisabled`.
 *
 *   §B The gate fires at the very top of POST /transport and
 *      PATCH /transport/:id (anchor on each handler), returns 410, and
 *      hints at the contract endpoint.
 *
 *   §C GET, DELETE, manifest, and the two check-in handlers do NOT
 *      gate on the flag — they keep working regardless of the setting.
 *
 *   §D Catalog still ships the flag as type=boolean, defaultValue=false
 *      (so production behaviour stays unchanged for everyone today;
 *      enabling the gate is an opt-in DB action per company).
 *
 *   §E Boundary sentinels from earlier stages (U-02 transport writes,
 *      U-02b M1 GL hook + legacy event counts) still hold their
 *      M3-merge values. M3 must not piggyback any other write/emit
 *      change.
 *
 * Failure mode by design:
 *   - Removing the gate, or moving it past a side-effecting line
 *     (INSERT/UPDATE/emitEvent), fails §B.
 *   - Adding the gate to a read handler (GET/manifest) fails §C —
 *     the contract path doesn't replace reads.
 *   - Flipping `defaultValue` to true in the catalog fails §D and
 *     would silently break every legacy /transport caller.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE_UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
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

// Helper: extract a single handler body by anchoring on its
// `router.METHOD("/path"` opening and stopping at the next handler or
// the file end. Returns the matched substring (handler header included).
function extractHandlerBody(src: string, methodPathRegex: RegExp): string {
  const startMatch = src.match(methodPathRegex);
  if (!startMatch || startMatch.index === undefined) return "";
  const rest = src.slice(startMatch.index);
  const stopMatch = rest.match(
    /\nrouter\.(?:get|post|patch|put|delete)\(/,
  );
  return stopMatch && stopMatch.index !== undefined
    ? rest.slice(0, stopMatch.index)
    : rest;
}

// ─────────────────────────────────────────────────────────────────────────────
// §A — Helper is defined once, reads the M2 catalog key
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M3 §A — gate helper exists and reads the catalog key", () => {
  it("declares `async function isLegacyTransportWritesDisabled(companyId: number)` exactly once", () => {
    const decls = ROUTE_UMRAH.match(
      /async\s+function\s+isLegacyTransportWritesDisabled\s*\(\s*companyId:\s*number\s*\)/g,
    ) ?? [];
    expect(decls.length).toBe(1);
  });

  it("reads the catalog key `umrah.financial.legacyTransportWritesDisabled` via resolveSettings", () => {
    // Anchoring on the literal key + the resolveSettings call name
    // catches a refactor that quietly switches to a different settings
    // helper or renames the key without updating the catalog.
    expect(ROUTE_UMRAH).toMatch(
      /resolveSettings\(\s*"umrah\.financial\.legacyTransportWritesDisabled"\s*,\s*companyId\s*\)/,
    );
  });

  it("imports resolveSettings from the canonical settings module", () => {
    expect(ROUTE_UMRAH).toMatch(
      /import\s*\{\s*resolveSettings\s*\}\s*from\s*"\.\.\/lib\/settings\.js"/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Gate fires at the top of POST /transport and PATCH /transport/:id
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M3 §B — gate is wired on POST /transport and PATCH /transport/:id", () => {
  const postHandler = extractHandlerBody(
    ROUTE_UMRAH,
    /router\.post\("\/transport"/,
  );
  const patchHandler = extractHandlerBody(
    ROUTE_UMRAH,
    /router\.patch\("\/transport\/:id"/,
  );

  it("POST /transport handler exists (defensive)", () => {
    expect(postHandler.length).toBeGreaterThan(0);
  });

  it("POST /transport calls the gate BEFORE the INSERT", () => {
    // The gate must be evaluated before the body validation + INSERT.
    // If the order flips, a disabled company would still create a row
    // and only later get a 410 — the worst of both worlds.
    expect(postHandler).toMatch(
      /isLegacyTransportWritesDisabled\(scope\.companyId\)/,
    );
    const gateIdx = postHandler.search(/isLegacyTransportWritesDisabled/);
    const insertIdx = postHandler.search(/INSERT\s+INTO\s+umrah_transport\b/);
    expect(gateIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(0);
    expect(gateIdx).toBeLessThan(insertIdx);
  });

  it("POST /transport returns HTTP 410 when the gate fires", () => {
    expect(postHandler).toMatch(/res\.status\(410\)\.json\(/);
  });

  it("POST /transport gate hints at the unified contract endpoint", () => {
    expect(postHandler).toMatch(
      /POST\s+\/umrah\/groups\/:id\/transport-requests/,
    );
  });

  it("PATCH /transport/:id handler exists (defensive)", () => {
    expect(patchHandler.length).toBeGreaterThan(0);
  });

  it("PATCH /transport/:id calls the gate BEFORE the UPDATE / lifecycle transition", () => {
    expect(patchHandler).toMatch(
      /isLegacyTransportWritesDisabled\(scope\.companyId\)/,
    );
    const gateIdx = patchHandler.search(/isLegacyTransportWritesDisabled/);
    const updateIdx = patchHandler.search(/UPDATE\s+umrah_transport\b/);
    const applyIdx = patchHandler.search(/applyTransition\(/);
    expect(gateIdx).toBeGreaterThan(0);
    // At least one of the write paths must exist after the gate.
    expect(Math.max(updateIdx, applyIdx)).toBeGreaterThan(gateIdx);
  });

  it("PATCH /transport/:id returns HTTP 410 when the gate fires", () => {
    expect(patchHandler).toMatch(/res\.status\(410\)\.json\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Read + DELETE + manifest + check-in handlers are NOT gated
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M3 §C — read-side and check-in handlers stay open", () => {
  function expectNoGate(handlerHeader: RegExp, label: string) {
    const body = extractHandlerBody(ROUTE_UMRAH, handlerHeader);
    expect(body.length, `${label} handler not found`).toBeGreaterThan(0);
    expect(
      body.match(/isLegacyTransportWritesDisabled\b/),
      `${label} must NOT call the legacy-writes gate`,
    ).toBeNull();
  }

  it("GET /transport stays open", () => {
    expectNoGate(/router\.get\("\/transport"/, "GET /transport");
  });

  it("GET /transport/:id stays open", () => {
    expectNoGate(/router\.get\("\/transport\/:id"/, "GET /transport/:id");
  });

  it("DELETE /transport/:id stays open (historic rows must stay closable)", () => {
    expectNoGate(/router\.delete\("\/transport\/:id"/, "DELETE /transport/:id");
  });

  it("POST /transport/:id/assign-pilgrims stays open", () => {
    expectNoGate(
      /router\.post\("\/transport\/:id\/assign-pilgrims"/,
      "POST /transport/:id/assign-pilgrims",
    );
  });

  it("GET /transport/:id/manifest stays open", () => {
    expectNoGate(
      /router\.get\("\/transport\/:id\/manifest"/,
      "GET /transport/:id/manifest",
    );
  });

  it("POST /transport/:id/check-in stays open", () => {
    expectNoGate(
      /router\.post\("\/transport\/:id\/check-in"/,
      "POST /transport/:id/check-in",
    );
  });

  it("POST /transport/:id/check-in-bulk stays open", () => {
    expectNoGate(
      /router\.post\("\/transport\/:id\/check-in-bulk"/,
      "POST /transport/:id/check-in-bulk",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Catalog still ships defaultValue: false (gate is dormant by default)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M3 §D — gate ships dormant by default", () => {
  const financial = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "financial");
  const field = financial?.fields.find(
    (f) => f.key === "legacyTransportWritesDisabled",
  );

  it("catalog field still exists under financial", () => {
    expect(field).toBeDefined();
  });

  it("catalog field type is boolean", () => {
    expect(field?.type).toBe("boolean");
  });

  it("catalog field defaultValue is false (no behaviour change on rollout)", () => {
    expect(field?.defaultValue).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Earlier-stage sentinels still hold their M3-merge values
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M3 §E — earlier boundary sentinels unchanged", () => {
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
});
