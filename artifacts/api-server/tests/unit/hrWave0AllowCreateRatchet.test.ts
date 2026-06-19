/**
 * HR-Wave-0 / 0.4 — Reference-data allowCreate ratchet.
 *
 * The mandate's «نمط الإنشاء الداخلي الموحّد» rule says every
 * reference-data picker must let the inputter coin a missing entity
 * inline (department, job-title, cost-center, etc.) using the SAME
 * unified create form — not a fragmented "quick add". The contract
 * is implemented by `buildEntitySelect()` which renders both a
 * `<SearchableSelectField>` and a `<QuickCreateDialog>` so the
 * inline-create flow always runs the real backend route + invalidates
 * the same React Query cache key.
 *
 * This ratchet pins:
 *   1. `buildEntitySelect` keeps its `allowCreate = true` default.
 *      Flipping that default would silently turn 9 reference pickers
 *      into read-only dropdowns and break the «no half-created entity»
 *      doctrine.
 *   2. The `onCreateNew` plumb (passed to SearchableSelectField) is
 *      gated by `allowCreate` — if the gate vanishes, even pickers
 *      that opt out get the create button. If the gate fires when
 *      `allowCreate=false`, opt-outs become noisy.
 *   3. The `QuickCreateDialog` is mounted alongside the picker and
 *      hits the same `createApiPath` + invalidates the same
 *      `queryKey` — proves the inline create runs through the real
 *      backend route (no fake local-only entity).
 *   4. The 9 canonical reference selects exist and ride on
 *      `buildEntitySelect` (so they inherit the gates above
 *      automatically).
 *   5. The HR-required canonical pickers — `EmployeeSelect`,
 *      `DepartmentSelect`, `JobTitleSelect`, `CostCenterMasterSelect`
 *      — are present. Wave 1 forms will consume these.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENTITY_SELECTS_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/entity-selects.tsx"),
  "utf8",
);

describe("HR-Wave-0 / 0.4 — buildEntitySelect defaults + plumbing", () => {
  it("allowCreate defaults to true (inline-create is the standard, opt-out is the exception)", () => {
    expect(ENTITY_SELECTS_SRC).toMatch(/allowCreate = true,/);
  });

  it("onCreateNew is gated by allowCreate — opt-outs MUST hide the «+» button", () => {
    expect(ENTITY_SELECTS_SRC).toMatch(/onCreateNew=\{allowCreate \? \(\) => setShowCreate\(true\) : undefined\}/);
  });

  it("QuickCreateDialog rides on the same queryKey so the cache invalidates after inline create", () => {
    expect(ENTITY_SELECTS_SRC).toMatch(/<QuickCreateDialog/);
    expect(ENTITY_SELECTS_SRC).toMatch(/apiPath=\{config\.apiPath\}|apiPath=\{config\.createApiPath\}/);
    expect(ENTITY_SELECTS_SRC).toMatch(/invalidateKey=\{config\.queryKey\}/);
  });

  it("post-create handler selects the new entity by id and refetches the list", () => {
    // Proves the inline-create result actually FLOWS BACK into the parent
    // form (newId → onChange) and the picker refreshes (refetch). Without
    // this, the new entity exists in the DB but the form never sees it.
    // #2134 strengthened the handler: the created entity is ALSO injected
    // into the options locally (mergeEntityOptions) so it renders instantly,
    // before the refetch lands and regardless of the 500-row preload window.
    expect(ENTITY_SELECTS_SRC).toMatch(/const newId = String\(row\?\.\[config\.getValueField \|\| "id"\]/);
    expect(ENTITY_SELECTS_SRC).toMatch(/onChange\(newId\);/);
    expect(ENTITY_SELECTS_SRC).toMatch(/setCreatedOptions\(/);
    expect(ENTITY_SELECTS_SRC).toMatch(/refetch\(\);/);
  });
});

describe("HR-Wave-0 / 0.4 — canonical reference selects exist + ride buildEntitySelect", () => {
  // Every export listed below must:
  //   (a) be exported as `export const <Name> = buildEntitySelect({...})`
  //       — guarantees it inherits the allowCreate default
  //   (b) bind to a known backend endpoint
  //   (c) wire up createApiPath so the inline-create flow has somewhere
  //       to POST.
  const CANONICAL_SELECTS = [
    { name: "EmployeeSelect", endpoint: "/employees?limit=500", createApiPath: "/employees" },
    { name: "DepartmentSelect", endpoint: "/settings/departments", createApiPath: "/settings/departments" },
    { name: "JobTitleSelect", endpoint: "/employees/job-titles", createApiPath: "/employees/job-titles" },
    { name: "CostCenterMasterSelect", endpoint: "/finance/cost-centers?limit=500", createApiPath: "/finance/cost-centers" },
    { name: "ClientSelect", endpoint: "/clients?limit=500", createApiPath: "/clients" },
    { name: "VendorSelect", endpoint: "/finance/vendors?limit=500", createApiPath: "/finance/vendors" },
    { name: "BranchSelect", endpoint: "/settings/branches", createApiPath: "/settings/branches" },
    { name: "ProjectSelect", endpoint: "/projects?limit=500", createApiPath: "/projects" },
    { name: "VehicleSelect", endpoint: "/fleet/vehicles?limit=500", createApiPath: "/fleet/vehicles" },
  ];

  for (const sel of CANONICAL_SELECTS) {
    it(`${sel.name} is exported + binds to buildEntitySelect`, () => {
      const re = new RegExp(
        `export const ${sel.name} = buildEntitySelect\\(\\{[\\s\\S]*?endpoint: "${sel.endpoint.replace(/[/?.*+]/g, "\\$&")}"[\\s\\S]*?createApiPath: "${sel.createApiPath.replace(/[/?.*+]/g, "\\$&")}"`,
      );
      expect(ENTITY_SELECTS_SRC).toMatch(re);
    });
  }

  it("canonical reference selects count snapshot (catches accidental removal)", () => {
    let count = 0;
    for (const sel of CANONICAL_SELECTS) {
      const re = new RegExp(`export const ${sel.name} = buildEntitySelect\\(`);
      if (re.test(ENTITY_SELECTS_SRC)) count += 1;
    }
    expect(count).toBe(CANONICAL_SELECTS.length);
  });
});

describe("HR-Wave-0 / 0.4 — JobTitleSelect + CostCenterMasterSelect newly added (Wave 1 will consume)", () => {
  it("JobTitleSelect references the new + role-key sublabel doctrine", () => {
    // The select shows `defaultRoleKey` in the sublabel when present so
    // an HR user knows that picking a title auto-suggests a role. The
    // employees-create form (Wave 1) relies on this behavior — without
    // it, the user has to manually re-pick the role after picking a title.
    expect(ENTITY_SELECTS_SRC).toMatch(/JobTitleSelect[\s\S]*?getSublabel: \(r\) => r\?\.defaultRoleKey \|\| r\?\.category \|\| ""/);
  });

  it("CostCenterMasterSelect is distinct from the legacy CostCenterSelect (no name collision)", () => {
    // The legacy CostCenterSelect composes synthetic «فرع/قسم/مشروع»
    // labels — kept for older callers. The new MasterSelect binds to
    // the real cost_centers table. Both exist; neither shadows the other.
    expect(ENTITY_SELECTS_SRC).toMatch(/export function CostCenterSelect\(/);
    expect(ENTITY_SELECTS_SRC).toMatch(/export const CostCenterMasterSelect = buildEntitySelect\(/);
  });
});
