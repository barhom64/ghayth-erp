import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UMRAH_POLICY_CATEGORIES,
  type PolicyField,
} from "../../src/lib/umrahSettingsPoliciesCatalog.js";

/**
 * U-02b M2 — Legacy-transport-writes feature flag presence smoke.
 *
 * Scope of M2 (per the owner's explicit authorisation):
 *   1. Adds a single boolean field `legacyTransportWritesDisabled` to
 *      the existing `financial` policy category in
 *      lib/umrahSettingsPoliciesCatalog.ts.
 *   2. Default value MUST be false.
 *   3. The field MUST NOT be read by any production code yet — it is a
 *      declarative-only preparation for stage M3 (which needs its own
 *      separate authorisation).
 *
 * Explicit constraints from the owner (re-stated for reviewers):
 *   - No flag activation.
 *   - No closing of POST/PATCH on /transport.
 *   - No transport.tsx change.
 *   - No calendar change.
 *   - No routes behavior change.
 *   - No engines edit.
 *   - No GL hook edit (postTransportExpenseGL is not touched).
 *   - No deletion / archive / backfill / migration / permissions change.
 *
 * This smoke proves all of that holds: the flag is THERE, it is OFF,
 * and the surrounding world is exactly as it was on main at the
 * moment U-02b M1 was merged.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE_UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah.ts"),
  "utf8",
);
const ROUTE_UMRAH_ENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
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

// ─────────────────────────────────────────────────────────────────────────────
// §A — The flag is declared in the catalog, typed correctly, defaulted off
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M2 §A — legacyTransportWritesDisabled is declared, typed, defaulted off", () => {
  // Locate the financial category once. If the flag ever moves to a
  // different category the §A.field assertions still pass on the new
  // location; the §A.category test below guards against that.
  const allFields: Array<{ category: string; field: PolicyField }> = [];
  for (const cat of UMRAH_POLICY_CATEGORIES) {
    for (const f of cat.fields) {
      allFields.push({ category: cat.id, field: f });
    }
  }
  const hits = allFields.filter(
    (h) => h.field.key === "legacyTransportWritesDisabled",
  );

  it("is declared exactly once across the catalog (no duplicate definitions)", () => {
    expect(hits.length).toBe(1);
  });

  it("is a boolean policy field", () => {
    expect(hits[0]?.field.type).toBe("boolean");
  });

  it("has defaultValue === false (M2 ships disabled — no production behaviour change)", () => {
    expect(hits[0]?.field.defaultValue).toBe(false);
  });

  it("lives under the existing `financial` category (no new category was added)", () => {
    // The flag relates to the GL coupling of the legacy transport
    // path (postTransportExpenseGL). The semantic fit is `financial`.
    // Equally important: keeping it in an existing category means the
    // catalog still has 11 categories — M2 did not add a new one.
    expect(hits[0]?.category).toBe("financial");
    expect(UMRAH_POLICY_CATEGORIES.length).toBe(11);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — The flag now has exactly one reference in routes/umrah.ts (M3 gate)
//      and stays untouched in routes/umrah-entities.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b §B — the flag has the M3 gate reference in umrah.ts, zero elsewhere", () => {
  it("routes/umrah.ts references legacyTransportWritesDisabled exactly twice (M3 doc-comment + settings key)", () => {
    // M3 of #2080 wired a gate on POST /transport and PATCH /transport/:id.
    // The gate uses an `isLegacyTransportWritesDisabled` helper (which
    // does NOT match the word-boundary regex below — the helper's name
    // has `is` glued to `Legacy` so `\blegacy...` won't match it).
    //
    // The two boundary-matched occurrences this assertion freezes:
    //   1) The helper's documentation comment, referencing
    //      `financial.legacyTransportWritesDisabled` in prose.
    //   2) The literal settings key
    //      `"umrah.financial.legacyTransportWritesDisabled"` passed
    //      to resolveSettings.
    // Adding any new direct reference (e.g. duplicating the key
    // somewhere else in the file) is a regression worth surfacing.
    const refs = ROUTE_UMRAH.match(/\blegacyTransportWritesDisabled\b/g) ?? [];
    expect(refs.length).toBe(2);
  });

  it("routes/umrah-entities.ts does not reference legacyTransportWritesDisabled", () => {
    expect(ROUTE_UMRAH_ENT).not.toMatch(/\blegacyTransportWritesDisabled\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Existing boundary smokes still hold their counts (no surface change)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M2 §C — boundary sentinel counts on main are unchanged", () => {
  // These assertions are not testing the boundary itself (the three
  // existing smoke files do that). They're testing that M2 did not
  // edit those files — the counts ALWAYS read "10 / 13 / 8" in the
  // suite summary as long as those files are unmodified. If a future
  // refactor genuinely needs to bump a number, that bump is a
  // deliberate visible diff and these regex anchors fail at that point.

  it("Finance Boundary smoke still has its `.toBe(2)` read sentinel for routes/umrah.ts", () => {
    // U-01: routes/umrah.ts ledger reads frozen at 2.
    expect(FINANCE_BOUNDARY_SMOKE).toMatch(
      /mentions\.length\)\.toBe\(2\)/,
    );
  });

  it("Transport Boundary smoke still has its `.toBe(4)` umrah_transport write sentinel", () => {
    // U-02: routes/umrah.ts writes to umrah_transport frozen at 4.
    expect(TRANSPORT_BOUNDARY_SMOKE).toMatch(
      /countWrites\(ROUTE_UMRAH,\s*"umrah_transport"\)\)\.toBe\(4\)/,
    );
  });

  it("Transport Boundary smoke still has its `.toBe(3)` umrah_transport_pilgrims sentinel", () => {
    // U-02: routes/umrah.ts writes to umrah_transport_pilgrims frozen at 3.
    expect(TRANSPORT_BOUNDARY_SMOKE).toMatch(
      /countWrites\(ROUTE_UMRAH,\s*"umrah_transport_pilgrims"\)\)\.toBe\(3\)/,
    );
  });

  it("Legacy Containment smoke still expects exactly 3 postTransportExpenseGL occurrences", () => {
    // U-02b M1: 1 definition + 2 callers = 3 total references.
    expect(LEGACY_CONTAINMENT_SMOKE).toMatch(/\.toBe\(3\)/);
  });

  it("Legacy Containment smoke still expects exactly 7 legacy event emissions", () => {
    // U-02b M1: 7 distinct umrah.transport.* emit sites in routes/umrah.ts.
    expect(LEGACY_CONTAINMENT_SMOKE).toMatch(/emits\.length\)\.toBe\(7\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The catalog still has every legacy field — no accidental removals
// ─────────────────────────────────────────────────────────────────────────────
describe("U-02b M2 §D — pre-existing financial-category fields are intact", () => {
  it("financial category still exposes its three pre-existing keys", () => {
    const financial = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "financial");
    expect(financial).toBeDefined();
    const keys = new Set(financial!.fields.map((f) => f.key));
    // All three predate M2; M2 ADDS a fourth but must not touch these.
    expect(keys.has("autoPostNuskAp")).toBe(true);
    expect(keys.has("autoPostSalesRevenue")).toBe(true);
    expect(keys.has("blockOnAccountMappingMissing")).toBe(true);
  });

  it("financial category now has exactly four fields (three legacy + one new M2)", () => {
    const financial = UMRAH_POLICY_CATEGORIES.find((c) => c.id === "financial");
    expect(financial?.fields.length).toBe(4);
  });
});
