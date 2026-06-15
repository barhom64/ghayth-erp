import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P2 — dedicated `umrah_agent_invoice` print preset.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.2):
 *   - Adds `buildUmrahAgentInvoicePreset()` to templateResolver.ts
 *     with agent + sub-agent + contract attribution.
 *   - Re-points the BESPOKE_PRESETS alias so `umrah_agent_invoice`
 *     resolves to the new builder instead of the buyer-side
 *     `buildUmrahInvoicePreset()` (the U-14 audit gap that lost
 *     agent attribution on the printed doc).
 *   - presetKey is `umrah_agent_invoice_classic` (distinct from the
 *     sales-side `umrah_invoice_classic`) so the dashboard editor can
 *     clone and tweak independently.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch outside the preset map.
 *   - No data-loader change (loadUmrahAgentInvoice already returns
 *     agentName / subAgentName / contractRef / seasonName).
 *   - No migration / no FE / no API contract change.
 *
 * Failure modes pinned:
 *   - Alias regresses back to buildUmrahInvoicePreset → §A fails.
 *   - presetKey or entityType drifts → §B fails (would collide with
 *     the sales invoice preset id range).
 *   - Builder loses one of the agent-attribution placeholders → §C
 *     fails (printed doc would silently miss the dim).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const RESOLVER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Alias points at the new builder, not buildUmrahInvoicePreset
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P2 §A — alias points at buildUmrahAgentInvoicePreset", () => {
  it("BESPOKE_PRESETS key umrah_agent_invoice routes to the new builder", () => {
    expect(RESOLVER).toMatch(
      /umrah_agent_invoice\s*:\s*\(\s*\)\s*=>\s*buildUmrahAgentInvoicePreset/,
    );
  });

  it("alias does NOT regress to buildUmrahInvoicePreset (the U-14-P2 fix)", () => {
    expect(RESOLVER).not.toMatch(
      /umrah_agent_invoice\s*:\s*\(\s*\)\s*=>\s*buildUmrahInvoicePreset/,
    );
  });

  it("the sales-side `umrah_invoice` alias is unchanged (no spillover)", () => {
    expect(RESOLVER).toMatch(
      /umrah_invoice\s*:\s*\(\s*\)\s*=>\s*buildUmrahInvoicePreset/,
    );
    expect(RESOLVER).toMatch(
      /umrah_sales_invoice\s*:\s*\(\s*\)\s*=>\s*buildUmrahInvoicePreset/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Builder identity (presetKey + entityType + id) is distinct from sales
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P2 §B — builder identity is distinct from buildUmrahInvoicePreset", () => {
  // Slice the new builder body once.
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahAgentInvoicePreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("function is defined + returns PrintTemplate", () => {
    expect(BUILDER.length).toBeGreaterThan(0);
  });

  it("presetKey is umrah_agent_invoice_classic (distinct from umrah_invoice_classic)", () => {
    expect(BUILDER).toMatch(/presetKey:\s*["']umrah_agent_invoice_classic["']/);
  });

  it("entityType is umrah_agent_invoice", () => {
    expect(BUILDER).toMatch(/entityType:\s*["']umrah_agent_invoice["']/);
  });

  it("seed id is distinct from the umrah_invoice seed -58", () => {
    expect(BUILDER).toMatch(/id:\s*-?\d+/);
    expect(BUILDER).not.toMatch(/id:\s*-58/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Body carries agent + sub-agent + contract attribution
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P2 §C — body renders agent-side attribution (not pilgrim/group)", () => {
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahAgentInvoicePreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  for (const placeholder of [
    "{{entity.agentName}}",
    "{{entity.subAgentName}}",
    "{{entity.contractRef}}",
    "{{entity.seasonName}}",
    "{{entity.ref}}",
  ]) {
    it(`placeholder ${placeholder} is rendered`, () => {
      // Some placeholders are templated inside the literal — match
      // the exact substring so a rename / typo flags here.
      expect(BUILDER).toContain(placeholder);
    });
  }

  it("body does NOT render pilgrim-side `pilgrimName` (would leak the wrong dim)", () => {
    expect(BUILDER).not.toContain("{{entity.pilgrimName}}");
  });

  it("body does NOT render `groupName` (sales-invoice block)", () => {
    expect(BUILDER).not.toContain("{{entity.groupName}}");
  });
});
