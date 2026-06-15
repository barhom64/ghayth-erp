import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P3 — umrah commission calculation (monthly slip) preset.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.3 — optional
 * follow-on after the plan preset):
 *   - `loadUmrahCommissionCalculation` reads the calculation row +
 *     joined plan + employee + season.
 *   - dataLoader dispatches `umrah_commission_calculation` to the
 *     new loader.
 *   - templateResolver carries `buildUmrahCommissionCalculationPreset`
 *     rendering employee + plan meta + the per-line calculation
 *     breakdown + final amount summary.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch beyond the print path.
 *   - No migration, no FE, no API contract change.
 *   - Pure SELECT loader.
 *
 * Failure modes pinned:
 *   - dataLoader stops dispatching the case → §A fails.
 *   - Loader joins drop tenant scope → §B fails.
 *   - Alias regresses → §C fails.
 *   - Preset body forgets one of the calculation columns → §D fails.
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
// §A — dataLoader dispatches umrah_commission_calculation
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission calc) §A — dataLoader dispatches the new case", () => {
  it("switch case routes to loadUmrahCommissionCalculation", () => {
    expect(DATA_LOADER).toMatch(
      /case\s+["']umrah_commission_calculation["']\s*:[\s\S]{0,200}?return\s+await\s+loadUmrahCommissionCalculation\(/,
    );
  });

  it("loader function is declared async", () => {
    expect(DATA_LOADER).toMatch(
      /async\s+function\s+loadUmrahCommissionCalculation\(\s*companyId:\s*number,\s*id:\s*string\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Loader joins are tenant + soft-delete scoped
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission calc) §B — joins are tenant + soft-delete scoped", () => {
  const LOADER =
    DATA_LOADER.match(/async function loadUmrahCommissionCalculation[\s\S]+?\n\}/)?.[0] ?? "";

  it("loader block is located", () => {
    expect(LOADER.length).toBeGreaterThan(0);
  });

  it("primary SELECT filters cc.companyId + cc.deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /cc\."companyId"\s*=\s*\$2[\s\S]{0,80}?cc\."deletedAt"\s+IS NULL/,
    );
  });

  it("plan join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN employee_commission_plans cp[\s\S]{0,200}?cp\."companyId"\s*=\s*\$2[\s\S]{0,80}?cp\."deletedAt"\s+IS NULL/,
    );
  });

  it("employee join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN employees e[\s\S]{0,200}?e\."companyId"\s*=\s*\$2[\s\S]{0,80}?e\."deletedAt"\s+IS NULL/,
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
describe("U-14-P3 (commission calc) §C — alias + identity is distinct", () => {
  it("alias routes umrah_commission_calculation to the new builder", () => {
    expect(RESOLVER).toMatch(
      /umrah_commission_calculation\s*:\s*\(\s*\)\s*=>\s*buildUmrahCommissionCalculationPreset/,
    );
  });

  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahCommissionCalculationPreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("function is defined", () => {
    expect(BUILDER.length).toBeGreaterThan(0);
  });

  it("presetKey is umrah_commission_calculation_classic", () => {
    expect(BUILDER).toMatch(/presetKey:\s*["']umrah_commission_calculation_classic["']/);
  });

  it("entityType is umrah_commission_calculation", () => {
    expect(BUILDER).toMatch(/entityType:\s*["']umrah_commission_calculation["']/);
  });

  it("seed id distinct from -58 / -106 / -107 / -108 / -109", () => {
    expect(BUILDER).toMatch(/id:\s*-?\d+/);
    expect(BUILDER).not.toMatch(/id:\s*-58\b/);
    expect(BUILDER).not.toMatch(/id:\s*-106\b/);
    expect(BUILDER).not.toMatch(/id:\s*-107\b/);
    expect(BUILDER).not.toMatch(/id:\s*-108\b/);
    expect(BUILDER).not.toMatch(/id:\s*-109\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Body renders employee + plan meta + every calc column + final amount
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission calc) §D — body renders meta + calc breakdown + final", () => {
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahCommissionCalculationPreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  for (const placeholder of [
    "{{entity.planName}}",
    "{{entity.employeeName}}",
    "{{entity.seasonName}}",
    "{{entity.baseSalary}}",
    "{{entity.commissionType}}",
    "{{entity.month}}",
    "{{entity.year}}",
    "{{entity.status}}",
  ]) {
    it(`meta placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }

  for (const placeholder of [
    "{{entity.totalMutamers}}",
    "{{entity.avgProfitPerVisa}}",
    "{{entity.salesPercent}}",
    "{{entity.avgSalePrice}}",
    "{{entity.conditionMet}}",
    "{{entity.completedTiers}}",
    "{{entity.hasViolations}}",
    "{{entity.isExcludedMonth}}",
    "{{entity.commissionAmount}}",
    "{{entity.finalAmount}}",
  ]) {
    it(`calculation placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }
});
