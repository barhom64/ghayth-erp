import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P5-SUPPLIER-ITEMS-MEMORY (#2235) — supplier item memory contract.
 *
 * Pins: the per-supplier item table (on canonical suppliers.id), the read
 * contract (GET /warehouse/suppliers/:id/items?scenario=) filtered by scenario
 * + company-scoped, and that the item carries an `accountPurpose` (resolved by
 * financialEngine) — NEVER a final accountCode. The picker feeds the fuel
 * scenario's suggested price. DB-integration of the table is exercised on real
 * boots (the table is above the dump baseline cutoff); guard runs these static
 * + pure assertions.
 */
const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/migrations/360_supplier_items.sql"), "utf8");
const WAREHOUSE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/warehouse.ts"), "utf8");
const PICKER = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/supplier-item-picker.tsx"), "utf8");
const TARGET = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/allocation-target-select.tsx"), "utf8");

describe("#2235 supplier_items migration", () => {
  it("creates supplier_items on the canonical suppliers.id with the memory fields", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS supplier_items");
    expect(MIGRATION).toContain('"supplierId"       INTEGER NOT NULL REFERENCES suppliers(id)');
    for (const f of ['"itemType"', '"defaultUnit"', '"defaultTaxCodeId"', '"accountPurpose"', '"allowedScenarios"', '"lastPrice"']) {
      expect(MIGRATION).toContain(f);
    }
  });
  it("is reversible (rollback annotation) and additive", () => {
    expect(MIGRATION).toContain("-- @rollback: DROP TABLE IF EXISTS supplier_items;");
  });
});

describe("#2235 backend read/write contract", () => {
  it("exposes GET + POST /suppliers/:id/items", () => {
    expect(WAREHOUSE).toContain('router.get("/suppliers/:id/items"');
    expect(WAREHOUSE).toContain('router.post("/suppliers/:id/items"');
  });
  it("scopes to the caller's company (cross-company supplier → not found)", () => {
    expect(WAREHOUSE).toContain('SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL');
    expect(WAREHOUSE).toContain('throw new NotFoundError("المورد غير موجود")');
  });
  it("filters by scenario and hides inactive items", () => {
    expect(WAREHOUSE).toContain('"isActive"=true AND "deletedAt" IS NULL');
    expect(WAREHOUSE).toContain('"allowedScenarios" @> to_jsonb($3::text)');
  });
  it("returns accountPurpose, never a final accountCode", () => {
    expect(WAREHOUSE).toContain('"accountPurpose"');
    // the select column list must not leak a resolved account code field.
    const getBlock = WAREHOUSE.slice(WAREHOUSE.indexOf('router.get("/suppliers/:id/items"'), WAREHOUSE.indexOf('router.post("/suppliers/:id/items"'));
    expect(getBlock).not.toContain("accountCode");
  });
});

describe("#2235 frontend picker contract", () => {
  it("SupplierItemPicker fetches the supplier's items by scenario and returns the item (with accountPurpose)", () => {
    expect(PICKER).toContain("/warehouse/suppliers/${supplierId}/items");
    expect(PICKER).toContain("accountPurpose: string | null;");
    // single responsibility — it must not carry a resolved accountCode field.
    expect(PICKER).not.toContain("accountCode:");
  });
  it("the fuel scenario uses the picker to fill the suggested price", () => {
    expect(TARGET).toContain("<SupplierItemPicker");
    expect(TARGET).toContain('scenario="vehicle_fuel"');
    expect(TARGET).toContain("item?.lastPrice != null ? String(item.lastPrice) : value.fuelCostPerLiter");
  });
});
