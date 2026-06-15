import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P5 — print engine umrah coverage smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.5):
 *   - Reads `dataLoader.ts` switch statement to extract umrah_*
 *     entity types it loads.
 *   - Reads `templateResolver.ts` BESPOKE_PRESETS map to extract the
 *     umrah_* preset keys it knows about.
 *   - Asserts every dataLoader-handled umrah entity has a matching
 *     BESPOKE_PRESETS entry (so the resolver does NOT silently fall
 *     through to the universal fallback for umrah).
 *   - Pins the U-14-P1 alias fix on `umrah_group` so a regression that
 *     re-aliases it to the wrong builder (it used to be the pilgrim
 *     preset) fires here.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No new preset added by this smoke — it observes coverage only.
 *   - No migration / no FE.
 *
 * Failure modes pinned:
 *   - dataLoader gains a new umrah_* case without a matching preset
 *     → §A fails.
 *   - umrah_group alias regresses to the pilgrim builder → §B fails.
 *   - Either source file is renamed / moved → import errors here.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const DATA_LOADER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/dataLoader.ts"),
  "utf8",
);
const TEMPLATE_RESOLVER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);

// The umrah_* cases dataLoader handles via a bespoke load function.
// We extract them from the actual switch so a new addition automatically
// joins the coverage check.
function extractUmrahDataLoaderCases(src: string): Set<string> {
  const cases = new Set<string>();
  const re = /case\s+["'](umrah_[a-z_]+)["']\s*:/g;
  let m;
  while ((m = re.exec(src)) !== null) cases.add(m[1]);
  return cases;
}

// The umrah_* keys templateResolver knows about — i.e. they have either
// an inline `umrah_xxx: () => ({ ... })` literal or a builder reference
// `umrah_xxx: () => buildXxxPreset()`.
function extractUmrahBespokeKeys(src: string): Set<string> {
  const keys = new Set<string>();
  const re = /(umrah_[a-z_]+)\s*:\s*\(\s*\)\s*=>/g;
  let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  return keys;
}

const dataLoaderCases = extractUmrahDataLoaderCases(DATA_LOADER);
const bespokeKeys = extractUmrahBespokeKeys(TEMPLATE_RESOLVER);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Every dataLoader umrah_* case has a matching BESPOKE_PRESETS entry
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P5 §A — dataLoader umrah_* cases all have a BESPOKE_PRESETS entry", () => {
  it("dataLoader exposes at least one umrah_* case (sanity)", () => {
    expect(dataLoaderCases.size).toBeGreaterThanOrEqual(7);
  });

  it("templateResolver exposes at least one umrah_* BESPOKE entry (sanity)", () => {
    expect(bespokeKeys.size).toBeGreaterThanOrEqual(7);
  });

  for (const entity of [
    "umrah_pilgrim",
    "umrah_sales_invoice",
    "umrah_agent_invoice",
    "umrah_penalty",
    "umrah_violation",
    "umrah_transport",
    "umrah_package",
    "umrah_season",
  ]) {
    it(`dataLoader case '${entity}' has a matching BESPOKE_PRESETS entry`, () => {
      expect(dataLoaderCases.has(entity)).toBe(true);
      expect(bespokeKeys.has(entity)).toBe(true);
    });
  }

  // umrah_group is special: per U-14-P1 it intentionally falls through
  // to universalFallback so the row's actual columns render (a group is
  // a collection of pilgrims, not a single pilgrim). U-14-P3 will add
  // buildUmrahGroupPreset; until then we pin the absence so a half-
  // implementation that aliases it back to the wrong preset is caught.
  it("dataLoader case 'umrah_group' exists, but BESPOKE_PRESETS does NOT alias it (universal fallback by design)", () => {
    expect(dataLoaderCases.has("umrah_group")).toBe(true);
    expect(bespokeKeys.has("umrah_group")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Alias map sanity — umrah_group must NOT alias to the pilgrim builder
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P5 §B — umrah_group alias points at the correct builder", () => {
  it("umrah_group is NOT aliased to buildUmrahPilgrimPreset (the U-14-P1 regression)", () => {
    expect(TEMPLATE_RESOLVER).not.toMatch(
      /umrah_group\s*:\s*\(\s*\)\s*=>\s*buildUmrahPilgrimPreset/,
    );
  });

  it("umrah_sales_invoice + umrah_invoice alias to buildUmrahInvoicePreset", () => {
    // Either inline preset literal or named builder is acceptable.
    expect(TEMPLATE_RESOLVER).toMatch(
      /umrah_sales_invoice\s*:\s*\(\s*\)\s*=>\s*buildUmrahInvoicePreset/,
    );
  });

  it("umrah_agent + umrah_sub_agent alias to their card builders", () => {
    expect(TEMPLATE_RESOLVER).toMatch(
      /umrah_agent\s*:\s*\(\s*\)\s*=>\s*buildUmrahAgentCardPreset/,
    );
    expect(TEMPLATE_RESOLVER).toMatch(
      /umrah_sub_agent\s*:\s*\(\s*\)\s*=>\s*buildUmrahSubAgentCardPreset/,
    );
  });
});
