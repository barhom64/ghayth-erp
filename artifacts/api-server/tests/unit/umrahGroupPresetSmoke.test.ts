import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P3 — dedicated umrah_group print preset.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.3):
 *   - New `buildUmrahGroupPreset()` rendering group meta block
 *     (agentName / subAgentName / seasonName / arrival / departure /
 *     status) plus the pilgrim manifest table (fullName / passport /
 *     visa / nationality / status).
 *   - BESPOKE_PRESETS aliases `umrah_group` to the new builder so
 *     the resolver no longer falls through to universalFallback.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No data-loader change — loadUmrahGroup already returns
 *     entity + pilgrims.
 *   - No engine touch beyond the preset map.
 *   - No migration / no FE / no API contract change.
 *
 * Failure modes pinned:
 *   - Alias regresses to universalFallback (key removed again) → §A fails.
 *   - presetKey or entityType drifts → §B fails (seed collision risk).
 *   - Builder loses the pilgrims iteration → §C fails (manifest empty).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const RESOLVER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Alias points at the new builder
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §A — alias points at buildUmrahGroupPreset", () => {
  it("BESPOKE_PRESETS key umrah_group routes to the new builder", () => {
    expect(RESOLVER).toMatch(
      /umrah_group\s*:\s*\(\s*\)\s*=>\s*buildUmrahGroupPreset/,
    );
  });

  it("alias does NOT regress to buildUmrahPilgrimPreset (the original U-14-P1 bug)", () => {
    expect(RESOLVER).not.toMatch(
      /umrah_group\s*:\s*\(\s*\)\s*=>\s*buildUmrahPilgrimPreset/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Builder identity (presetKey + entityType + id) is distinct
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §B — builder identity is distinct from neighbouring presets", () => {
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahGroupPreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("function is defined + returns PrintTemplate", () => {
    expect(BUILDER.length).toBeGreaterThan(0);
  });

  it("presetKey is umrah_group_classic", () => {
    expect(BUILDER).toMatch(/presetKey:\s*["']umrah_group_classic["']/);
  });

  it("entityType is umrah_group", () => {
    expect(BUILDER).toMatch(/entityType:\s*["']umrah_group["']/);
  });

  it("seed id is distinct from -58 (umrah_invoice) and -106 (umrah_agent_invoice)", () => {
    expect(BUILDER).toMatch(/id:\s*-?\d+/);
    expect(BUILDER).not.toMatch(/id:\s*-58\b/);
    expect(BUILDER).not.toMatch(/id:\s*-106\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Body renders the group meta + the pilgrim manifest iteration
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §C — body renders meta block + pilgrim manifest", () => {
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahGroupPreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  for (const placeholder of [
    "{{entity.name}}",
    "{{entity.seasonName}}",
    "{{entity.agentName}}",
    "{{entity.subAgentName}}",
    "{{entity.arrivalDate}}",
    "{{entity.departureDate}}",
  ]) {
    it(`group meta placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }

  it("iterates the pilgrims array via {{#each pilgrims}}", () => {
    expect(BUILDER).toMatch(/\{\{#each pilgrims\}\}/);
    expect(BUILDER).toMatch(/\{\{\/each\}\}/);
  });

  for (const placeholder of [
    "{{this.fullName}}",
    "{{this.passportNumber}}",
    "{{this.visaNumber}}",
    "{{this.nationality}}",
    "{{this.status}}",
  ]) {
    it(`pilgrim-row placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }
});
