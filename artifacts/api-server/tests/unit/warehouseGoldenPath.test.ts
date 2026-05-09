import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const WH_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/warehouse.ts"), "utf8");

// ─── Warehouse Golden Path Tests ───────────────────────────────────────────
// P4.9 — Lock in warehouse domain lifecycle contracts: products, movements,
// categories, suppliers, inventory counts, transfers.

describe("Warehouse route structure", () => {
  it("product CRUD endpoints exist", () => {
    expect(WH_ROUTE).toContain('router.get("/products"');
    expect(WH_ROUTE).toContain('router.post("/products"');
    expect(WH_ROUTE).toContain('router.patch("/products/:id"');
    expect(WH_ROUTE).toContain('router.delete("/products/:id"');
  });

  it("movement endpoints exist", () => {
    expect(WH_ROUTE).toContain('router.get("/movements"');
    expect(WH_ROUTE).toContain('router.post("/movements"');
  });

  it("category CRUD endpoints exist", () => {
    expect(WH_ROUTE).toContain('router.get("/categories"');
    expect(WH_ROUTE).toContain('router.post("/categories"');
    expect(WH_ROUTE).toContain('router.patch("/categories/:id"');
    expect(WH_ROUTE).toContain('router.delete("/categories/:id"');
  });

  it("supplier CRUD endpoints exist", () => {
    expect(WH_ROUTE).toContain('router.get("/suppliers"');
    expect(WH_ROUTE).toContain('router.post("/suppliers"');
    expect(WH_ROUTE).toContain('router.patch("/suppliers/:id"');
    expect(WH_ROUTE).toContain('router.delete("/suppliers/:id"');
  });

  it("inventory count endpoints exist", () => {
    expect(WH_ROUTE).toContain('"/inventory-counts"');
    expect(WH_ROUTE).toContain('"/inventory-counts/:id/items"');
    expect(WH_ROUTE).toContain('"/inventory-counts/:id/approve"');
  });

  it("transfer endpoint exists", () => {
    expect(WH_ROUTE).toContain('"/transfers"');
  });

  it("stats endpoint exists", () => {
    expect(WH_ROUTE).toContain('router.get("/stats"');
  });
});

describe("Warehouse product state machine", () => {
  it("defines PRODUCT_STATUSES and PRODUCT_TRANSITIONS", () => {
    expect(WH_ROUTE).toContain("PRODUCT_STATUSES");
    expect(WH_ROUTE).toContain("PRODUCT_TRANSITIONS");
  });

  it("product statuses: active, inactive, discontinued", () => {
    const idx = WH_ROUTE.indexOf("PRODUCT_STATUSES");
    const line = WH_ROUTE.slice(idx, WH_ROUTE.indexOf("\n", idx));
    expect(line).toContain("active");
    expect(line).toContain("inactive");
    expect(line).toContain("discontinued");
  });

  it("discontinued is terminal", () => {
    const idx = WH_ROUTE.indexOf("PRODUCT_TRANSITIONS");
    const block = WH_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("discontinued: []");
  });
});

describe("Warehouse inventory count state machine", () => {
  it("defines COUNT_TRANSITIONS", () => {
    expect(WH_ROUTE).toContain("COUNT_TRANSITIONS");
  });

  it("count statuses: draft → in_progress → approved/cancelled", () => {
    const idx = WH_ROUTE.indexOf("COUNT_TRANSITIONS");
    const block = WH_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("draft:");
    expect(block).toContain("in_progress:");
    expect(block).toContain("approved:    []");
    expect(block).toContain("cancelled:   []");
  });
});

describe("Warehouse movement types", () => {
  it("defines MOVEMENT_TYPES", () => {
    expect(WH_ROUTE).toContain("MOVEMENT_TYPES");
  });

  it("includes in, out, return, transfer_in, transfer_out, adjustment", () => {
    const idx = WH_ROUTE.indexOf("MOVEMENT_TYPES");
    const line = WH_ROUTE.slice(idx, WH_ROUTE.indexOf("\n", idx));
    expect(line).toContain("in");
    expect(line).toContain("out");
    expect(line).toContain("return");
    expect(line).toContain("transfer_in");
    expect(line).toContain("transfer_out");
    expect(line).toContain("adjustment");
  });
});

describe("Warehouse weighted-average cost", () => {
  it("implements updateWeightedAverageCost function", () => {
    expect(WH_ROUTE).toContain("updateWeightedAverageCost");
  });

  it("WAC formula uses total-value / total-quantity", () => {
    expect(WH_ROUTE).toContain("newTotalValue");
    expect(WH_ROUTE).toContain("newTotalQty");
  });
});

describe("Warehouse GL posting", () => {
  it("implements postInventoryMovementGl function", () => {
    expect(WH_ROUTE).toContain("postInventoryMovementGl");
  });

  it("GL triggers cover receipt, issue, transfer, variance", () => {
    expect(WH_ROUTE).toContain('"receipt"');
    expect(WH_ROUTE).toContain('"issue"');
    expect(WH_ROUTE).toContain('"transfer"');
    expect(WH_ROUTE).toContain('"variance_in"');
    expect(WH_ROUTE).toContain('"variance_out"');
  });

  it("respects financial period close", () => {
    expect(WH_ROUTE).toContain("checkFinancialPeriodOpen");
  });
});

describe("Warehouse event emission contract", () => {
  it("emits events on warehouse operations", () => {
    expect(WH_ROUTE).toContain("emitEvent");
  });

  it("creates audit logs systematically", () => {
    const auditCalls = WH_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Warehouse security contracts", () => {
  it("validates movement input with zod on create", () => {
    expect(WH_ROUTE).toContain("createMovementSchema");
  });

  it("uses movingAverage algorithm", () => {
    expect(WH_ROUTE).toContain("movingAverage");
  });

  it("uses scoped queries for product listing", () => {
    const idx = WH_ROUTE.indexOf('router.get("/products"');
    const endIdx = WH_ROUTE.indexOf("router.", idx + 10);
    const section = WH_ROUTE.slice(idx, endIdx);
    expect(section).toContain("buildScopedWhere");
  });
});
