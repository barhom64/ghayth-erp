import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * U-02b M1 — Legacy umrah_transport containment smoke.
 *
 * This is the ONE small, safe step authorised under U-02b's planning
 * phase. It does NOT touch production code, does NOT touch UI, does
 * NOT touch migrations, does NOT touch GL, does NOT delete the legacy
 * path. It only adds three structural invariants that FREEZE the
 * legacy path's current containment:
 *
 *   §A The legacy GL hook `postTransportExpenseGL` (defined in
 *      lib/engines/umrahEngine.ts) is FROZEN at its known call count:
 *      ONE definition + TWO known call sites (routes/umrah.ts inside
 *      POST /transport, and lib/postingFailureRetry.ts for the retry
 *      worker). A third call site means the legacy path's GL footprint
 *      is GROWING — exactly what U-02b is meant to prevent.
 *
 *      Note: U-01's finance boundary smoke targets the
 *      createGuardedJournalEntry / createJournalEntry helpers in
 *      businessHelpers.ts. The legacy path uses a DIFFERENT pattern —
 *      umrahEngine.postTransportExpenseGL → financialEngine.postJournalEntry
 *      — which U-01 did not catch. M1 plugs that gap by sentinelling
 *      this specific path.
 *
 *   §B The seven legacy events emitted from routes/umrah.ts
 *      (umrah.transport.created/updated/deleted/requested/
 *       status_changed/pilgrims_assigned/bulk_check_in) are FROZEN at
 *      their current count of 7 emit points. Any net-new emission
 *      point on the legacy table is a regression — the plan's
 *      containment promise is that the legacy path SHRINKS, never
 *      grows.
 *
 *      Note: umrah.transport.requested is also emitted from
 *      lib/umrahTransportContract.ts (the contract path). That's
 *      checked separately to ensure NO OTHER file emits it — the
 *      catalog event must have at most two known producers.
 *
 *   §C The umrah-transport report endpoint reads `transport_bookings`
 *      (the contract surface), not `umrah_transport`. This is the
 *      already-shipped read-side switch the plan relies on, and a
 *      silent flip back to the legacy table would break the
 *      catalogued "umrah_transport" report contract.
 *
 * Failure mode by design: any future PR that
 *   (a) adds a third call to postTransportExpenseGL anywhere,
 *   (b) adds a new emitEvent point for the seven legacy actions in
 *       routes/umrah.ts (or emits umrah.transport.requested from a
 *       third file),
 *   (c) changes the report endpoint to query umrah_transport instead
 *       of transport_bookings,
 * fails one of these assertions BEFORE the change can land. The plan
 * documents how to fix the failure — by extending the plan, not by
 * relaxing the assertion.
 *
 * Plan: docs/governance/umrah-inventory-organization-repair/findings/
 *       U-02b_transition_plan.md
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const ROUTE_UMRAH = readFileSync(
  join(SRC_DIR, "routes/umrah.ts"),
  "utf8",
);
const ROUTE_UMRAH_ENT = readFileSync(
  join(SRC_DIR, "routes/umrah-reports.ts"),
  "utf8",
);

// Walk all .ts files under src/ to scan for postTransportGL callers.
function collectAllServerTsSources(): Array<{ path: string; src: string }> {
  const out: Array<{ path: string; src: string }> = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        // Skip migrations + node_modules + tests scaffolding.
        if (name === "migrations" || name === "node_modules") continue;
        walk(full);
      } else if (name.endsWith(".ts")) {
        out.push({ path: full, src: readFileSync(full, "utf8") });
      }
    }
  }
  walk(SRC_DIR);
  return out;
}

const ALL_SERVER_SOURCES = collectAllServerTsSources();

// ─────────────────────────────────────────────────────────────────────────────
// §A — postTransportExpenseGL is frozen at its known call count
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b §A — legacy GL hook `postTransportExpenseGL` call sites are frozen", () => {
  it("scanned a non-trivial number of server .ts files (defence against an empty walk)", () => {
    // If the walk returns nothing the next assertions pass vacuously.
    // The api-server src tree has 500+ .ts files; 200 is a safe floor
    // that catches a broken scan without churning on growth.
    expect(ALL_SERVER_SOURCES.length).toBeGreaterThanOrEqual(200);
  });

  it("the symbol appears in exactly the three known places (1 definition + 2 call sites)", () => {
    // Three references total on main:
    //   - lib/engines/umrahEngine.ts        (definition, line 75)
    //   - routes/umrah.ts                   (call inside POST /transport, line 2493)
    //   - lib/postingFailureRetry.ts        (call inside the JE retry worker, line 137)
    //
    // A fourth occurrence ANYWHERE = a new caller (or a moved definition
    // that landed without removing the old one). Both are regressions
    // from U-02b's containment promise: the legacy GL coupling SHRINKS,
    // never grows.
    let total = 0;
    const sites: string[] = [];
    for (const { path, src } of ALL_SERVER_SOURCES) {
      const matches = src.match(/\bpostTransportExpenseGL\b/g) ?? [];
      if (matches.length > 0) {
        total += matches.length;
        sites.push(`${path}: ${matches.length}`);
      }
    }
    expect(total, `postTransportExpenseGL occurrences across src/:\n${sites.join("\n")}`).toBe(3);
  });

  it("the three references are exactly in the known files", () => {
    // Beyond the total count, anchor that the THREE occurrences live
    // where U-02b §2 says they live. Moving the definition or a call
    // to a new file fails this assertion even if the total stays at 3.
    const expectedFiles = new Set([
      "lib/engines/umrahEngine.ts",
      "routes/umrah.ts",
      "lib/postingFailureRetry.ts",
    ]);
    const actualFiles = new Set<string>();
    for (const { path, src } of ALL_SERVER_SOURCES) {
      if (/\bpostTransportExpenseGL\b/.test(src)) {
        // Strip the absolute prefix so the assertion's diff is readable.
        const rel = path.split("/artifacts/api-server/src/")[1] ?? path;
        actualFiles.add(rel);
      }
    }
    expect(Array.from(actualFiles).sort()).toEqual(
      Array.from(expectedFiles).sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — legacy event emissions in routes/umrah.ts are frozen
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b §B — legacy umrah.transport.* event emissions are frozen", () => {
  it("emits exactly seven legacy event actions from routes/umrah.ts", () => {
    // The seven known emissions on main (counted at U-02b plan time):
    //   - umrah.transport.deleted          (line 2444)
    //   - umrah.transport.created          (line 2503)
    //   - umrah.transport.requested        (line 2507; the contract
    //                                       emits the same action name
    //                                       from lib/umrahTransportContract.ts,
    //                                       which is verified separately below)
    //   - umrah.transport.status_changed   (line 2572)
    //   - umrah.transport.updated          (line 2596)
    //   - umrah.transport.pilgrims_assigned (line 2654)
    //   - umrah.transport.bulk_check_in    (line 2829)
    // Pinning the total emit-count at 7 freezes the surface — adding
    // any new legacy event from this file means the legacy path is
    // growing, which the plan disallows.
    const emits = ROUTE_UMRAH.match(/action:\s*"umrah\.transport\.[a-z_]+"/g) ?? [];
    expect(emits.length).toBe(7);
  });

  it("the contract module is the only emitter of umrah.transport.requested outside umrah.ts", () => {
    // The contract file emits umrah.transport.requested exactly once.
    // No OTHER file (engines, listeners, etc.) should emit it — if
    // they do, the catalog event has multiple producers and the
    // consumer side can't tell which path created the booking.
    const contract = readFileSync(
      join(SRC_DIR, "lib/umrahTransportContract.ts"),
      "utf8",
    );
    const contractEmits =
      contract.match(/action:\s*"umrah\.transport\.requested"/g) ?? [];
    expect(contractEmits.length).toBe(1);

    let otherEmits = 0;
    for (const { path, src } of ALL_SERVER_SOURCES) {
      if (path.endsWith("/routes/umrah.ts")) continue; // legacy emitter, scanned in §B[0]
      if (path.endsWith("/lib/umrahTransportContract.ts")) continue;
      const m = src.match(/action:\s*"umrah\.transport\.requested"/g) ?? [];
      otherEmits += m.length;
    }
    expect(otherEmits).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — report endpoint reads the contract surface
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b §C — /reports/umrah-transport reads transport_bookings, not umrah_transport", () => {
  it("the umrah-transport report endpoint exists in routes/umrah-reports.ts", () => {
    expect(ROUTE_UMRAH_ENT).toMatch(
      /router\.get\("\/reports\/umrah-transport"/,
    );
  });

  it("the handler reads `transport_bookings`", () => {
    // Anchor on the handler block so a far-away SELECT can't pass
    // this assertion by accident.
    const handler = ROUTE_UMRAH_ENT.match(
      /router\.get\("\/reports\/umrah-transport"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/FROM\s+transport_bookings\b/i);
  });

  it("the handler does NOT read the legacy umrah_transport table", () => {
    // A silent revert that swaps `transport_bookings` back to
    // `umrah_transport` would break the catalog's read-side contract
    // without anybody noticing in the diff (the SELECT shape is similar).
    const handler = ROUTE_UMRAH_ENT.match(
      /router\.get\("\/reports\/umrah-transport"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).not.toMatch(/FROM\s+umrah_transport\b/i);
  });
});
