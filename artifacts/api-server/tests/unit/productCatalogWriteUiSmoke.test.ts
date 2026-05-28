import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const DIALOG = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/finance/product-accounting-edit-dialog.tsx"),
  "utf8"
);
const CATALOG = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/product-catalog.tsx"),
  "utf8"
);
const WAREHOUSE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/warehouse.ts"),
  "utf8"
);

// ─── Audit item #4 — Product/Service catalog write UI ──────────────────────
// Locks the contract: the finance catalog page exposes an edit dialog
// that PATCHes /warehouse/products/:id with the accounting routing
// fields. Before this work the page was read-only and the accountant
// had to leave for /warehouse to tune routing.

describe("ProductAccountingEditDialog public surface", () => {
  it("exports the dialog component", () => {
    expect(DIALOG).toContain("export function ProductAccountingEditDialog");
  });

  it("uses PATCH /warehouse/products/:id", () => {
    expect(DIALOG).toMatch(/`\/warehouse\/products\/\$\{product\.id\}`/);
    expect(DIALOG).toContain('"PATCH"');
  });

  it("invalidates the product-catalog query on save", () => {
    expect(DIALOG).toContain('[["product-catalog"]]');
  });
});

describe("dialog fields cover the catalog accounting schema", () => {
  it("renders all four account-routing inputs", () => {
    for (const field of [
      "defaultRevenueAccountId",
      "defaultExpenseAccountId",
      "defaultInventoryAccountId",
      "defaultAssetAccountId",
    ]) {
      expect(DIALOG).toContain(field);
    }
  });

  it("renders activity-type + tax-code inputs", () => {
    expect(DIALOG).toContain("defaultTaxCode");
    expect(DIALOG).toContain("defaultActivityType");
  });

  it("renders every requires-* dimension checkbox", () => {
    for (const flag of [
      "requiresVehicle",
      "requiresProperty",
      "requiresProject",
      "requiresContract",
      "requiresUmrahAgent",
      "requiresUmrahSeason",
    ]) {
      expect(DIALOG).toContain(flag);
    }
  });

  it("renders the cost-center strategy select with all 10 options", () => {
    expect(DIALOG).toContain("defaultCostCenterStrategy");
    for (const opt of [
      "from_vehicle",
      "from_property",
      "from_unit",
      "from_project",
      "from_employee",
      "from_contract",
      "from_umrah_agent",
      "from_umrah_season",
      "explicit",
      "none",
    ]) {
      expect(DIALOG).toContain(`"${opt}"`);
    }
  });
});

describe("catalog page wires the dialog", () => {
  it("imports the dialog", () => {
    expect(CATALOG).toContain("ProductAccountingEditDialog");
  });

  it("has editTarget state + adds the edit column", () => {
    expect(CATALOG).toContain("editTarget");
    expect(CATALOG).toContain("setEditTarget");
    expect(CATALOG).toMatch(/key:\s*"actions"/);
  });

  it("refetches on save", () => {
    expect(CATALOG).toMatch(/onSaved=\{\(\)\s*=>\s*\{\s*setEditTarget\(null\);\s*refetch\(\);\s*\}\}/);
  });
});

describe("backend PATCH already accepts the fields", () => {
  it("warehouse PATCH route exists", () => {
    expect(WAREHOUSE).toMatch(/\.patch\("\/products\/:id"/);
  });

  it("patchProductSchema covers the accounting fields", () => {
    expect(WAREHOUSE).toContain("defaultRevenueAccountId");
    expect(WAREHOUSE).toContain("defaultActivityType");
    expect(WAREHOUSE).toContain("requiresVehicle");
    expect(WAREHOUSE).toContain("defaultCostCenterStrategy");
  });
});
