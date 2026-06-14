import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P1 — short-name + group alias fixes for the umrah print
 * preset map.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.1):
 *   - `agent` short-name alias → buildUmrahAgentCardPreset
 *     (was: buildUmrahPilgrimPreset, semantic mismatch)
 *   - `sub_agent` short-name alias → buildUmrahSubAgentCardPreset
 *     (was: buildUmrahPilgrimPreset, semantic mismatch)
 *   - `umrah_group` → universalFallback("umrah_group") to render the
 *     group's actual columns instead of pilgrim fields. The bespoke
 *     buildUmrahGroupPreset is U-14-P3.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch on the print pipeline.
 *   - No new bespoke preset code (P3).
 *   - No seed migration (P4).
 *   - No FE change.
 *   - No removal of the long-name keys `umrah_agent` /
 *     `umrah_sub_agent` (they already point at the right builders).
 *
 * Failure modes pinned:
 *   - `agent` alias regressed back to pilgrim → §A fails.
 *   - `sub_agent` alias regressed → §B fails.
 *   - `umrah_group` regressed → §C fails.
 *   - Long-name keys `umrah_agent` / `umrah_sub_agent` got accidentally
 *     re-pointed → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const RESOLVER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — `agent` short alias points at the agent-card preset
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P1 §A — `agent` short-name alias resolves to buildUmrahAgentCardPreset", () => {
  it("agent alias is mapped to buildUmrahAgentCardPreset (not buildUmrahPilgrimPreset)", () => {
    expect(RESOLVER).toMatch(/agent:\s*\(\)\s*=>\s*buildUmrahAgentCardPreset\(\)/);
    // Negative — pin the regression direction.
    expect(RESOLVER).not.toMatch(/^\s+agent:\s*\(\)\s*=>\s*buildUmrahPilgrimPreset\(\)/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — `sub_agent` short alias points at the sub-agent-card preset
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P1 §B — `sub_agent` short-name alias resolves to buildUmrahSubAgentCardPreset", () => {
  it("sub_agent alias is mapped to buildUmrahSubAgentCardPreset", () => {
    expect(RESOLVER).toMatch(/sub_agent:\s*\(\)\s*=>\s*buildUmrahSubAgentCardPreset\(\)/);
    expect(RESOLVER).not.toMatch(/^\s+sub_agent:\s*\(\)\s*=>\s*buildUmrahPilgrimPreset\(\)/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — `umrah_group` no longer aliased to the pilgrim preset
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P1 §C — `umrah_group` is no longer aliased to the pilgrim preset", () => {
  it("umrah_group calls universalFallback (or a future bespoke group preset), NOT buildUmrahPilgrimPreset", () => {
    expect(RESOLVER).not.toMatch(
      /umrah_group:\s*\(\)\s*=>\s*buildUmrahPilgrimPreset\(\)/,
    );
  });

  it("umrah_group resolution is in the BESPOKE_PRESETS map (key still present)", () => {
    expect(RESOLVER).toMatch(/umrah_group:\s*\(\)\s*=>/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Long-name keys still resolve correctly (no regression)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P1 §D — long-name keys umrah_agent / umrah_sub_agent stay on bespoke builders", () => {
  it("umrah_agent → buildUmrahAgentCardPreset (unchanged)", () => {
    expect(RESOLVER).toMatch(/umrah_agent:\s*\(\)\s*=>\s*buildUmrahAgentCardPreset\(\)/);
  });

  it("umrah_sub_agent → buildUmrahSubAgentCardPreset (unchanged)", () => {
    expect(RESOLVER).toMatch(/umrah_sub_agent:\s*\(\)\s*=>\s*buildUmrahSubAgentCardPreset\(\)/);
  });
});
