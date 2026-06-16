import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P3 — Nusk invoice (purchase-side document) preset.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.3):
 *   - `loadUmrahNuskInvoice` reads the Nusk invoice + agent /
 *     sub-agent / group / season joins.
 *   - dataLoader switch dispatches the `umrah_nusk_invoice` case to
 *     the new loader.
 *   - templateResolver carries `buildUmrahNuskInvoicePreset` with
 *     a per-line service breakdown table (ground / electronic /
 *     visa / insurance / enrichment / additional / transport / hotel
 *     / refund) plus net + total summary.
 *   - BESPOKE_PRESETS aliases `umrah_nusk_invoice` to the new builder.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch beyond the print path.
 *   - No migration / no FE / no API contract change.
 *   - No data write — the loader and preset are pure read.
 *
 * Failure modes pinned:
 *   - dataLoader stops dispatching the case → §A fails.
 *   - Loader join drops a tenant-scope clause → §B fails.
 *   - BESPOKE_PRESETS alias is removed → §C fails.
 *   - Preset body forgets a service-line column → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const RESOLVER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);
const DATA_LOADER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/print/dataLoader.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — dataLoader dispatches the new case
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §A — dataLoader dispatches umrah_nusk_invoice", () => {
  it("switch case routes to loadUmrahNuskInvoice", () => {
    expect(DATA_LOADER).toMatch(
      /case\s+["']umrah_nusk_invoice["']\s*:[\s\S]{0,200}?return\s+await\s+loadUmrahNuskInvoice\(/,
    );
  });

  it("loader function is declared and async", () => {
    expect(DATA_LOADER).toMatch(
      /async\s+function\s+loadUmrahNuskInvoice\(\s*companyId:\s*number,\s*id:\s*string\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Loader joins are tenant + soft-delete scoped
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §B — every join in loadUmrahNuskInvoice filters companyId + deletedAt", () => {
  const LOADER =
    DATA_LOADER.match(/async function loadUmrahNuskInvoice[\s\S]+?\n\}/)?.[0] ?? "";

  it("loader block is located", () => {
    expect(LOADER.length).toBeGreaterThan(0);
  });

  it("primary WHERE filters companyId on the nusk row", () => {
    expect(LOADER).toMatch(
      /ni\."companyId"\s*=\s*\$2/,
    );
  });

  it("agent join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN umrah_agents a[\s\S]{0,200}?a\."companyId"\s*=\s*\$2[\s\S]{0,80}?a\."deletedAt"\s+IS NULL/,
    );
  });

  it("sub-agent join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN umrah_sub_agents sa[\s\S]{0,200}?sa\."companyId"\s*=\s*\$2[\s\S]{0,80}?sa\."deletedAt"\s+IS NULL/,
    );
  });

  it("group join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN umrah_groups g[\s\S]{0,200}?g\."companyId"\s*=\s*\$2[\s\S]{0,80}?g\."deletedAt"\s+IS NULL/,
    );
  });

  it("season join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN umrah_seasons s[\s\S]{0,200}?s\."companyId"\s*=\s*\$2[\s\S]{0,80}?s\."deletedAt"\s+IS NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — BESPOKE_PRESETS alias + builder identity
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §C — BESPOKE_PRESETS aliases umrah_nusk_invoice + builder identity is distinct", () => {
  it("alias routes umrah_nusk_invoice to the new builder", () => {
    expect(RESOLVER).toMatch(
      /umrah_nusk_invoice\s*:\s*\(\s*\)\s*=>\s*buildUmrahNuskInvoicePreset/,
    );
  });

  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahNuskInvoicePreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("function is defined + returns PrintTemplate", () => {
    expect(BUILDER.length).toBeGreaterThan(0);
  });

  it("presetKey is umrah_nusk_invoice_classic", () => {
    expect(BUILDER).toMatch(/presetKey:\s*["']umrah_nusk_invoice_classic["']/);
  });

  it("entityType is umrah_nusk_invoice", () => {
    expect(BUILDER).toMatch(/entityType:\s*["']umrah_nusk_invoice["']/);
  });

  it("seed id distinct from -58 (sales) / -106 (agent) / -107 (group)", () => {
    expect(BUILDER).toMatch(/id:\s*-?\d+/);
    expect(BUILDER).not.toMatch(/id:\s*-58\b/);
    expect(BUILDER).not.toMatch(/id:\s*-106\b/);
    expect(BUILDER).not.toMatch(/id:\s*-107\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Body renders the meta block + every service-line column
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 §D — body renders Nusk service-line columns + meta", () => {
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahNuskInvoicePreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  for (const placeholder of [
    "{{entity.nuskInvoiceNumber}}",
    "{{entity.groupName}}",
    "{{entity.seasonName}}",
    "{{entity.agentName}}",
    "{{entity.subAgentName}}",
    "{{entity.issueDate}}",
    "{{entity.expiryDate}}",
    "{{entity.mutamerCount}}",
    "{{entity.nuskStatus}}",
  ]) {
    it(`meta placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }

  for (const placeholder of [
    "{{entity.groundServices}}",
    "{{entity.electronicFees}}",
    "{{entity.visaFees}}",
    "{{entity.insuranceFees}}",
    "{{entity.enrichmentServices}}",
    "{{entity.additionalServices}}",
    "{{entity.transportTotal}}",
    "{{entity.hotelTotal}}",
    "{{entity.refundAmount}}",
    "{{entity.netCost}}",
    "{{entity.totalAmount}}",
  ]) {
    it(`service-line placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }
});
