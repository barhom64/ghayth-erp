import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 23 — umrah-entities.ts split smoke (group service-contract).
 *
 * Scope:
 *   - Carves the umrah→transport service-contract routes (+ the co-located
 *     read-only cost-breakdown) into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-group-transport.ts
 *       POST /groups/:id/transport-requests   (createTransportRequestFromUmrah)
 *       GET  /groups/:id/cost-breakdown        (read-only nusk/sales aggregation)
 *       GET  /groups/:id/transport-requests    (listTransportRequestsForGroup)
 *   - Parent mounts the sub-router via `router.use(groupTransportRouter)` so the
 *     API surface stays identical.
 *
 * Non-goals (Permanent Hard Rails):
 *   - OPERATIONAL move — no ledger/GL writes; transport routes delegate to the
 *     engine, cost-breakdown is a read-only aggregation.
 *   - The route NEVER owns transport policy — the engine
 *     (lib/umrahTransportContract.ts) is the leader path; this is the server seam.
 *   - This empties umrah-entities.ts down to employee-assignments only.
 *
 * §F is the boundary guard: the carved file delegates transport writes to the
 * engine and never touches transport tables (or the GL) directly.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-group-transport.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahTransportContract.ts"),
  "utf8",
);

const ROUTES: [string, string][] = [
  ["post", "/groups/:id/transport-requests"],
  ["get", "/groups/:id/cost-breakdown"],
  ["get", "/groups/:id/transport-requests"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 23 §A — umrah-group-transport.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 23 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+groupTransportRouter\s+from\s+["']\.\/umrah-group-transport\.js["']/);
  });

  it("parent mounts the sub-router with router.use(groupTransportRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*groupTransportRouter\s*\)/);
  });

  it("parent no longer imports the transport-contract engine or the schema (moved)", () => {
    expect(PARENT).not.toMatch(/import\s*\{[^}]*createTransportRequestFromUmrah[^}]*\}\s*from/);
    expect(PARENT).not.toMatch(/await\s+createTransportRequestFromUmrah\s*\(/);
    expect(PARENT).not.toMatch(/await\s+listTransportRequestsForGroup\s*\(/);
    expect(PARENT).not.toMatch(/const transportRequestSchema\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 3 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 23 §C — all 3 moved routes are present in the child", () => {
  for (const [method, route] of ROUTES) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      expect(CHILD).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 23 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of ROUTES) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }

  it("parent no longer declares any /groups* route", () => {
    // (U-07 Phase 24 then moved the last route — employee-assignments — out too,
    // turning umrah-entities.ts into a pure aggregator; see
    // umrahEmployeeAssignmentsSplitSmoke.test.ts.)
    expect(PARENT).not.toMatch(/router\.(get|post|patch|delete)\("\/groups/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 23 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 200 lines (was ~346 before this carve, ~151 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — SERVICE-CONTRACT BOUNDARY: transport writes go through the engine; the
//      route never touches transport tables or the GL directly.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 23 §F — service-contract boundary preserved by the carve", () => {
  it("the engine still exports the contract functions (not modified by this carve)", () => {
    expect(ENGINE).toMatch(/export\s+(async\s+)?function\s+createTransportRequestFromUmrah\s*\(/);
    expect(ENGINE).toMatch(/export\s+(async\s+)?function\s+listTransportRequestsForGroup\s*\(/);
  });

  it("child imports both contract functions (not a re-implementation)", () => {
    expect(CHILD).toMatch(/import\s*\{[\s\S]*createTransportRequestFromUmrah[\s\S]*listTransportRequestsForGroup[\s\S]*\}\s*from\s+["']\.\.\/lib\/umrahTransportContract\.js["']/);
  });

  it("POST delegates to createTransportRequestFromUmrah with the tenant context", () => {
    const handler = CHILD.match(/router\.post\("\/groups\/:id\/transport-requests"[\s\S]*?\n\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await createTransportRequestFromUmrah\(/);
    expect(handler![0]).toMatch(/companyId:\s*scope\.companyId/);
  });

  it("child makes ZERO direct writes to transport tables — the engine owns them", () => {
    expect(CHILD).not.toMatch(/INSERT\s+INTO\s+(umrah_)?transport/i);
    expect(CHILD).not.toMatch(/UPDATE\s+(umrah_)?transport/i);
    expect(CHILD).not.toMatch(/INSERT\s+INTO\s+transport_bookings/i);
  });

  it("child contains NO GL / journal posting (cost-breakdown is read-only)", () => {
    expect(CHILD).not.toMatch(/createGuardedJournalEntry\s*\(|createJournalEntry\s*\(/);
    expect(CHILD).not.toMatch(/INSERT\s+INTO\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/UPDATE\s+journal_(entries|lines)/i);
    // cost-breakdown only ever SELECTs (no INSERT/UPDATE/DELETE anywhere).
    expect(CHILD).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\b/);
  });
});
