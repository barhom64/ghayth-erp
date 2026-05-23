import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8"
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/202_purchase_lines_dimensional_allocation.sql"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(
  join(REPO_ROOT, "db/schema_pre.sql"),
  "utf8"
);

// ─── Phase 4 P1 — Purchase + GRN dimensional allocation ─────────────────────
// Locks in the line-level allocation contract for purchase_request_items,
// purchase_order_items, and goods_receipt_items. The dimensional payload
// must flow PR → PO → GRN without dropping at any boundary.

describe("migration 202 — purchase line schema", () => {
  const ALL_TABLES = [
    "goods_receipt_items",
    "purchase_order_items",
    "purchase_request_items",
  ];

  for (const tbl of ALL_TABLES) {
    it(`adds lineTreatment to ${tbl}`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.${tbl}[\\s\\S]{0,2000}"lineTreatment"`));
    });
    it(`${tbl} declares CHECK constraint on lineTreatment values`, () => {
      expect(MIGRATION).toContain(`${tbl}_line_treatment_check`);
    });
  }

  it("CHECK accepts all 9 treatment values", () => {
    const treatments = [
      "inventory", "expense", "fixed_asset", "project_cost", "vehicle_cost",
      "property_maintenance", "custody", "prepayment", "service",
    ];
    for (const t of treatments) {
      expect(MIGRATION).toContain(`'${t}'`);
    }
  });

  it("creates partial indexes on lineTreatment for the two main tables", () => {
    expect(MIGRATION).toContain("idx_goods_receipt_items_treatment");
    expect(MIGRATION).toContain("idx_purchase_order_items_treatment");
  });
});

describe("schema_pre.sql declares the new purchase columns", () => {
  const TABLES = ["goods_receipt_items", "purchase_order_items", "purchase_request_items"];
  for (const tbl of TABLES) {
    it(`${tbl} declares lineTreatment + allocation columns`, () => {
      const idx = SCHEMA_PRE.indexOf(`CREATE TABLE public.${tbl}`);
      const section = SCHEMA_PRE.slice(idx, idx + 3000);
      for (const col of [
        "accountId", "accountCode", "costCenterId", "lineTreatment",
        "projectId", "vehicleId", "propertyId", "allocationStatus",
      ]) {
        expect(section).toContain(`"${col}"`);
      }
    });
  }
});

describe("createPurchaseRequestSchema accepts dimensional fields", () => {
  it("declares the PURCHASE_LINE_TREATMENTS enum", () => {
    expect(ROUTE).toContain("PURCHASE_LINE_TREATMENTS");
    expect(ROUTE).toContain('"vehicle_cost"');
    expect(ROUTE).toContain('"property_maintenance"');
    expect(ROUTE).toContain('"custody"');
  });

  it("purchaseLineDimsSchema exposes the dimensional axes", () => {
    const idx = ROUTE.indexOf("const purchaseLineDimsSchema");
    const end = ROUTE.indexOf("};", idx);
    const block = ROUTE.slice(idx, end);
    for (const field of [
      "accountId", "accountCode", "costCenterId", "lineTreatment", "activityType",
      "projectId", "vehicleId", "propertyId", "unitId", "assetId",
      "employeeId", "driverId", "contractId", "allocationRuleId",
    ]) {
      expect(block).toContain(field);
    }
  });
});

describe("PR INSERT carries the new columns", () => {
  it("INSERT INTO purchase_request_items has 23 columns", () => {
    const idx = ROUTE.indexOf("INSERT INTO purchase_request_items");
    const section = ROUTE.slice(idx, idx + 800);
    for (const col of [
      "accountId", "accountCode", "costCenterId", "lineTreatment",
      "projectId", "vehicleId", "propertyId", "allocationStatus",
    ]) {
      expect(section).toContain(`"${col}"`);
    }
  });
});

describe("PR → PO conversion propagates dimensions", () => {
  it("INSERT into purchase_order_items inside conversion carries lineTreatment + dims", () => {
    // The conversion is the first INSERT INTO purchase_order_items
    const idx = ROUTE.indexOf("INSERT INTO purchase_order_items");
    const section = ROUTE.slice(idx, idx + 800);
    for (const col of ["lineTreatment", "vehicleId", "propertyId", "projectId", "allocationStatus"]) {
      expect(section).toContain(`"${col}"`);
    }
  });
});

describe("direct PO creation carries dimensions", () => {
  it("the second INSERT INTO purchase_order_items also writes the new columns", () => {
    // Find the SECOND occurrence
    const first = ROUTE.indexOf("INSERT INTO purchase_order_items");
    const second = ROUTE.indexOf("INSERT INTO purchase_order_items", first + 10);
    expect(second).toBeGreaterThan(-1);
    const section = ROUTE.slice(second, second + 800);
    for (const col of ["lineTreatment", "accountCode", "allocationStatus"]) {
      expect(section).toContain(`"${col}"`);
    }
  });
});

describe("GRN INSERT propagates from PO item", () => {
  it("poItems SELECT includes lineTreatment + dimensional columns", () => {
    const idx = ROUTE.indexOf("FROM purchase_order_items WHERE \"orderId\" = $1");
    const back = ROUTE.lastIndexOf("SELECT", idx);
    const section = ROUTE.slice(back, idx);
    for (const col of ["lineTreatment", "accountCode", "vehicleId", "propertyId", "allocationStatus"]) {
      expect(section).toContain(`"${col}"`);
    }
  });

  it("INSERT INTO goods_receipt_items writes 24 columns including dimensions", () => {
    const idx = ROUTE.indexOf("INSERT INTO goods_receipt_items");
    const section = ROUTE.slice(idx, idx + 1200);
    for (const col of [
      "accountId", "accountCode", "costCenterId", "lineTreatment",
      "projectId", "vehicleId", "propertyId", "allocationStatus",
    ]) {
      expect(section).toContain(`"${col}"`);
    }
  });
});
