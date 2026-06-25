import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * U-02 — Service Boundary smoke for umrah transport sources.
 *
 * Wave 1 of #2080 (UMRAH GOVERNANCE P0). Inspection-only PR: this test
 * FREEZES the current state of the two parallel transport paths inside
 * umrah. It does NOT extract, merge, or delete anything — fixing the
 * underlying duplication requires a separate authorisation (proposed as
 * U-02b). See:
 *
 *   docs/governance/umrah-inventory-organization-repair/findings/
 *     U-02_transport_boundary.md
 *
 * Two parallel paths today:
 *
 *   PATH A — the OLD `umrah_transport` table (still actively written from
 *   routes/umrah.ts via 9 /transport* endpoints + 7 write statements +
 *   GL-tag `sourceType: "umrah_transport"` via lib/engines/umrahEngine.ts).
 *   This is "a transport engine inside umrah" — the duplication the
 *   Charter forbids.
 *
 *   PATH B — the service contract at lib/umrahTransportContract.ts that
 *   writes the unified `transport_bookings` table with `bookingSource =
 *   'umrah_group'`. Consumed correctly via routes/umrah-entities.ts under
 *   /groups/:id/transport-requests. This is the only path umrah should
 *   write transport on.
 *
 * What this smoke pins:
 *
 *   §A The contract module exists, is imported by the right route file,
 *      and writes only `transport_bookings` (not `umrah_transport`).
 *
 *   §B PATH A is FROZEN at its current count of write sites in
 *      routes/umrah.ts (4 on umrah_transport, 3 on
 *      umrah_transport_pilgrims). Any new write site fails. Existing
 *      sites can still be edited line-by-line — the sentinel is on the
 *      *count of statements*, not their bodies, so a bug fix that
 *      doesn't ADD a new write passes.
 *
 *   §C ZERO direct writes to `transport_bookings` from umrah routes —
 *      all must go through the contract module. This is the real
 *      forward-looking lock: any new transport request from an umrah
 *      route must be a thin wrapper.
 *
 *   §D `routes/umrah-entities.ts` has ZERO writes on `umrah_transport*`
 *      tables — the clean file stays clean.
 *
 *   §E FE pages never write to transport_bookings directly and never
 *      import the contract module (the FE talks HTTP only).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const CONTRACT_PATH = join(
  REPO_ROOT,
  "artifacts/api-server/src/lib/umrahTransportContract.ts",
);
const ROUTE_UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);
// U-07 Phase 23 — the umrah→transport service-contract routes carved into
// umrah-group-transport.ts; the boundary assertions (delegation + zero direct
// transport-table writes) now read the file that actually owns those routes.
const ROUTE_UMRAH_ENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-group-transport.ts"),
  "utf8",
);

function countWrites(src: string, table: string): number {
  // Three write families, each anchored with \b to avoid `umrah_transport_pilgrims`
  // falsely matching `umrah_transport`.
  const patterns = [
    new RegExp(`INSERT\\s+INTO\\s+${table}\\b`, "gi"),
    new RegExp(`UPDATE\\s+${table}\\b`, "gi"),
    new RegExp(`DELETE\\s+FROM\\s+${table}\\b`, "gi"),
  ];
  let total = 0;
  for (const p of patterns) {
    const m = src.match(p);
    total += m?.length ?? 0;
  }
  return total;
}

// FE walker — reuses the umrah pages tree.
function collectUmrahFePageSources(): Array<{ path: string; src: string }> {
  const base = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/umrah");
  const out: Array<{ path: string; src: string }> = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
        out.push({ path: full, src: readFileSync(full, "utf8") });
      }
    }
  }
  walk(base);
  return out;
}

const FE_PAGES = collectUmrahFePageSources();

// ─────────────────────────────────────────────────────────────────────────────
// §A — The Service Contract is present and wired correctly
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02 §A — umrah transport service contract is present and wired", () => {
  it("lib/umrahTransportContract.ts exists", () => {
    // Without this file, the right path doesn't exist at all. The
    // existence check guards against a silent rename or move killing
    // the entire enforcement story.
    expect(existsSync(CONTRACT_PATH)).toBe(true);
  });

  it("contract exports the two required functions", () => {
    const src = readFileSync(CONTRACT_PATH, "utf8");
    expect(src).toMatch(/export\s+async\s+function\s+createTransportRequestFromUmrah\b/);
    expect(src).toMatch(/export\s+async\s+function\s+listTransportRequestsForGroup\b/);
  });

  it("contract writes ONLY `transport_bookings`, never `umrah_transport`", () => {
    const src = readFileSync(CONTRACT_PATH, "utf8");
    expect(countWrites(src, "transport_bookings")).toBeGreaterThan(0);
    expect(countWrites(src, "umrah_transport")).toBe(0);
    expect(countWrites(src, "umrah_transport_pilgrims")).toBe(0);
  });

  it("routes/umrah-entities.ts imports the contract and calls both functions", () => {
    expect(ROUTE_UMRAH_ENT).toMatch(
      /import\s+\{\s*createTransportRequestFromUmrah\s*,\s*listTransportRequestsForGroup\s*,?\s*\}\s+from\s+"\.\.\/lib\/umrahTransportContract\.js"/,
    );
    expect(ROUTE_UMRAH_ENT).toMatch(/\bcreateTransportRequestFromUmrah\s*\(/);
    expect(ROUTE_UMRAH_ENT).toMatch(/\blistTransportRequestsForGroup\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — PATH A (legacy `umrah_transport`) is FROZEN at current counts
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02 §B — legacy umrah_transport writes are frozen at the current count", () => {
  it("routes/umrah.ts writes umrah_transport exactly 4 times (the known statements)", () => {
    // 4 known write sites today, all inside the legacy /transport*
    // endpoints in umrah.ts:
    //   DELETE handler           — UPDATE umrah_transport SET deletedAt
    //   POST /transport          — INSERT INTO umrah_transport
    //   PATCH /transport/:id     — UPDATE umrah_transport SET <dynamic>
    //   POST /:id/assign-pilgrims— UPDATE umrah_transport SET pilgrimCount
    //
    // Any NEW write site (5 or more) means the legacy path is GROWING
    // — exactly what U-02 was authorised to prevent. Existing
    // statements can still be edited line-by-line (sentinel is on the
    // count of matching statements, not their bodies).
    expect(countWrites(ROUTE_UMRAH, "umrah_transport")).toBe(4);
  });

  it("routes/umrah.ts writes umrah_transport_pilgrims exactly 3 times", () => {
    // The pilgrims-link table:
    //   INSERT INTO umrah_transport_pilgrims         — assign-pilgrims
    //   UPDATE umrah_transport_pilgrims (check-in)   — check-in handler
    //   UPDATE umrah_transport_pilgrims (bulk)       — check-in-bulk handler
    expect(countWrites(ROUTE_UMRAH, "umrah_transport_pilgrims")).toBe(3);
  });

  it("routes/umrah-entities.ts has ZERO writes on umrah_transport / umrah_transport_pilgrims", () => {
    // The clean route file must stay clean — its only transport seam
    // is the contract import + the two /groups/:id/transport-requests
    // handlers.
    expect(countWrites(ROUTE_UMRAH_ENT, "umrah_transport")).toBe(0);
    expect(countWrites(ROUTE_UMRAH_ENT, "umrah_transport_pilgrims")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All `transport_bookings` writes from umrah routes must go through
//      the contract (never inline SQL).
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02 §C — umrah routes never write transport_bookings directly", () => {
  it("routes/umrah.ts has zero direct writes on transport_bookings", () => {
    expect(countWrites(ROUTE_UMRAH, "transport_bookings")).toBe(0);
  });

  it("routes/umrah-entities.ts has zero direct writes on transport_bookings", () => {
    // The right calls are via the contract import — countWrites only
    // matches raw SQL. A direct INSERT INTO transport_bookings from
    // this route file would be a regression (it duplicates the contract).
    expect(countWrites(ROUTE_UMRAH_ENT, "transport_bookings")).toBe(0);
  });

  it("routes/umrah.ts does NOT import the contract (legacy path stays legacy)", () => {
    // The legacy /transport* endpoints should not start mixing with
    // the contract without an authorised migration. Importing the
    // contract here would suggest a half-finished extraction; that
    // belongs in a single deliberate PR.
    expect(ROUTE_UMRAH).not.toMatch(/from\s+["']\.\.\/lib\/umrahTransportContract\.js["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — FE pages don't write transport_bookings or import the contract
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02 §D — FE umrah pages don't bypass the HTTP seam", () => {
  it("scanned at least the expected number of FE source files", () => {
    expect(FE_PAGES.length).toBeGreaterThanOrEqual(30);
  });

  it("no FE page writes transport_bookings inline (FE talks HTTP only)", () => {
    for (const { path, src } of FE_PAGES) {
      // Writes only — SELECT/FROM is allowed (reports/transport-requests
      // is intentionally a reader). The boundary is on writes.
      expect(
        src.match(/INSERT\s+INTO\s+transport_bookings/i),
        `unexpected inline INSERT in FE page: ${path}`,
      ).toBeNull();
      expect(
        src.match(/UPDATE\s+transport_bookings/i),
        `unexpected inline UPDATE in FE page: ${path}`,
      ).toBeNull();
      expect(
        src.match(/DELETE\s+FROM\s+transport_bookings/i),
        `unexpected inline DELETE in FE page: ${path}`,
      ).toBeNull();
    }
  });

  it("no FE page imports umrahTransportContract (engines never cross the HTTP seam)", () => {
    for (const { path, src } of FE_PAGES) {
      expect(
        src.match(/umrahTransportContract/),
        `unexpected engine import in FE page: ${path}`,
      ).toBeNull();
    }
  });
});
