import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-14-P3 — umrah commission-plan preset.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-14 audit §3.3):
 *   - `loadUmrahCommissionPlan` reads the plan + tiers list +
 *     joined employee + season.
 *   - dataLoader dispatches `umrah_commission_plan` to the new
 *     loader.
 *   - templateResolver carries `buildUmrahCommissionPlanPreset`
 *     rendering plan meta + computation rules + tiers ladder.
 *   - BESPOKE_PRESETS aliases the new entity to the builder.
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
 *   - Preset body forgets a tier-row placeholder or the iteration → §D fails.
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
// §A — dataLoader dispatches umrah_commission_plan
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission plan) §A — dataLoader dispatches the new case", () => {
  it("switch case routes to loadUmrahCommissionPlan", () => {
    expect(DATA_LOADER).toMatch(
      /case\s+["']umrah_commission_plan["']\s*:[\s\S]{0,200}?return\s+await\s+loadUmrahCommissionPlan\(/,
    );
  });

  it("loader function is declared async", () => {
    expect(DATA_LOADER).toMatch(
      /async\s+function\s+loadUmrahCommissionPlan\(\s*companyId:\s*number,\s*id:\s*string\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Loader joins are tenant + soft-delete scoped
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission plan) §B — joins are tenant + soft-delete scoped", () => {
  const LOADER =
    DATA_LOADER.match(/async function loadUmrahCommissionPlan[\s\S]+?\n\}/)?.[0] ?? "";

  it("loader block is located", () => {
    expect(LOADER.length).toBeGreaterThan(0);
  });

  it("primary SELECT filters cp.companyId + cp.deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /cp\."companyId"\s*=\s*\$2[\s\S]{0,80}?cp\."deletedAt"\s+IS NULL/,
    );
  });

  it("employees join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN employees e[\s\S]{0,200}?e\."companyId"\s*=\s*\$2[\s\S]{0,80}?e\."deletedAt"\s+IS NULL/,
    );
  });

  it("season join filters companyId + deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /LEFT JOIN umrah_seasons s[\s\S]{0,200}?s\."companyId"\s*=\s*\$2[\s\S]{0,80}?s\."deletedAt"\s+IS NULL/,
    );
  });

  it("tiers SELECT filters deletedAt IS NULL", () => {
    expect(LOADER).toMatch(
      /FROM\s+employee_commission_tiers[\s\S]{0,200}?"deletedAt"\s+IS NULL/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — BESPOKE_PRESETS alias + builder identity
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission plan) §C — alias + identity is distinct", () => {
  it("alias routes umrah_commission_plan to the new builder", () => {
    expect(RESOLVER).toMatch(
      /umrah_commission_plan\s*:\s*\(\s*\)\s*=>\s*buildUmrahCommissionPlanPreset/,
    );
  });

  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahCommissionPlanPreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("function is defined", () => {
    expect(BUILDER.length).toBeGreaterThan(0);
  });

  it("presetKey is umrah_commission_plan_classic", () => {
    expect(BUILDER).toMatch(/presetKey:\s*["']umrah_commission_plan_classic["']/);
  });

  it("entityType is umrah_commission_plan", () => {
    expect(BUILDER).toMatch(/entityType:\s*["']umrah_commission_plan["']/);
  });

  it("seed id distinct from -58 / -106 / -107 / -108", () => {
    expect(BUILDER).toMatch(/id:\s*-?\d+/);
    expect(BUILDER).not.toMatch(/id:\s*-58\b/);
    expect(BUILDER).not.toMatch(/id:\s*-106\b/);
    expect(BUILDER).not.toMatch(/id:\s*-107\b/);
    expect(BUILDER).not.toMatch(/id:\s*-108\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Body renders meta + rules + the tiers ladder iteration
// ─────────────────────────────────────────────────────────────────────────────
describe("U-14-P3 (commission plan) §D — body renders meta + rules + tiers ladder", () => {
  const BUILDER =
    RESOLVER.match(/function\s+buildUmrahCommissionPlanPreset\([^)]*\)\s*:\s*PrintTemplate\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  for (const placeholder of [
    "{{entity.planName}}",
    "{{entity.employeeName}}",
    "{{entity.seasonName}}",
    "{{entity.baseSalary}}",
    "{{entity.commissionType}}",
    "{{entity.percentageRate}}",
    "{{entity.fixedAmount}}",
    "{{entity.conditionType}}",
    "{{entity.status}}",
  ]) {
    it(`meta placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }

  it("iterates tiers via {{#each tiers}}", () => {
    expect(BUILDER).toMatch(/\{\{#each tiers\}\}/);
    expect(BUILDER).toMatch(/\{\{\/each\}\}/);
  });

  for (const placeholder of [
    "{{this.tierOrder}}",
    "{{this.fromCount}}",
    "{{this.toCount}}",
    "{{this.bonusPerUnit}}",
    "{{this.isCumulative}}",
  ]) {
    it(`tier-row placeholder ${placeholder} is rendered`, () => {
      expect(BUILDER).toContain(placeholder);
    });
  }
});
