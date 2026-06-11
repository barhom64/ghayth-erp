import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8"
);

// ─── Phase 4.2 — GRN posting routes per lineTreatment ───────────────────────
// The legacy GRN posting collapsed every receipt onto a single
// DR inventory_receipt line. After Phase 4 carried `lineTreatment`
// onto goods_receipt_items, the posting now switches per-line so
// fuel goes to vehicle_expense, asset purchases go to fixed_asset, etc.

describe("TREATMENT_PURPOSE map", () => {
  const TREATMENTS = [
    "inventory", "expense", "fixed_asset", "project_cost", "vehicle_cost",
    "property_maintenance", "custody", "prepayment", "service",
  ];

  for (const t of TREATMENTS) {
    it(`maps treatment '${t}'`, () => {
      // Find the treatment key inside TREATMENT_PURPOSE
      const idx = ROUTE.indexOf("const GRN_TREATMENT_PURPOSE");
      const end = ROUTE.indexOf("};", idx);
      const block = ROUTE.slice(idx, end);
      expect(block).toContain(`${t}:`);
    });
  }

  it("each treatment has purpose + side + defaultCode", () => {
    const idx = ROUTE.indexOf("const GRN_TREATMENT_PURPOSE");
    const end = ROUTE.indexOf("};", idx);
    const block = ROUTE.slice(idx, end);
    for (const purpose of [
      "inventory_receipt", "general_expense", "fixed_asset_purchase",
      "project_cost", "vehicle_expense", "property_maintenance_expense",
      "employee_custody", "supplier_prepayment", "service_expense",
    ]) {
      expect(block).toContain(purpose);
    }
  });
});

describe("GRN posting reads dimensional payload from goods_receipt_items", () => {
  it("SELECT pulls lineTreatment + dimensional fields", () => {
    const idx = ROUTE.indexOf("FROM goods_receipt_items");
    const start = ROUTE.lastIndexOf("SELECT", idx);
    const section = ROUTE.slice(start, idx);
    for (const col of [
      "accountCode", "lineTreatment", "costCenterId", "activityType",
      "projectId", "vehicleId", "propertyId", "unitId", "assetId",
      "employeeId", "driverId", "contractId", "productId",
    ]) {
      expect(section).toContain(`"${col}"`);
    }
  });

  it("orders by id for deterministic per-line iteration", () => {
    const idx = ROUTE.indexOf("FROM goods_receipt_items");
    const after = ROUTE.slice(idx, idx + 200);
    expect(after).toContain("ORDER BY id");
  });
});

describe("per-treatment bucket grouping", () => {
  it("groups by (account + dimension signature)", () => {
    // The bucket key includes the dimension axes. After Phase 5.4
    // wired the resolver, dimensions come from `dims.*` (resolver
    // output) instead of `ln.*` (raw line). Either form proves the
    // bucketing is dimensional.
    const sectionIdx = ROUTE.indexOf("type DrBucket");
    expect(sectionIdx).toBeGreaterThan(-1);
    const sectionEnd = ROUTE.indexOf("const grnJournalResult", sectionIdx);
    const section = ROUTE.slice(sectionIdx, sectionEnd);
    expect(section).toMatch(/(ln|dims)\.vehicleId/);
    expect(section).toMatch(/(ln|dims)\.propertyId/);
    expect(section).toMatch(/(ln|dims)\.projectId/);
    expect(section).toMatch(/(ln|dims)\.employeeId/);
    expect(section).toMatch(/(ln|dims)\.assetId/);
  });

  it("operator-pinned accountCode overrides treatment lookup", () => {
    // After Phase 5.4 wiring, the resolver runs first; manual pins
    // come through as `res.resolvedAccountCode` with status=
    // 'manual_override'.
    expect(ROUTE).toMatch(/let acct = (ln\.accountCode|res\.resolvedAccountCode);/);
    expect(ROUTE).toContain("if (!acct)");
  });

  it("treatment with no mapping falls back to default inventory account", () => {
    expect(ROUTE).toContain("defaultInvAccount");
    expect(ROUTE).toContain('"inventory_receipt", "debit", "1150"');
  });
});

describe("balance + rounding correctness", () => {
  it("computes diff = subtotal - postedNet and lands remainder on default account", () => {
    expect(ROUTE).toContain("const diff = roundTo2(subtotal - postedNet)");
    expect(ROUTE).toContain("Math.abs(diff) >= 0.005");
  });

  it("filters zero-amount buckets before posting", () => {
    expect(ROUTE).toContain("Math.abs(b.amount) >= 0.005");
  });

  it("VAT debit stays header-level (not bucketed)", () => {
    expect(ROUTE).toContain("vatAmount > 0 ? [{ accountCode: vatAccount");
  });

  it("GRNI credit stays header-level (one line at grnTotal)", () => {
    expect(ROUTE).toContain("{ accountCode: grniAccount, debit: 0, credit: grnTotal");
  });
});

describe("backward compatibility", () => {
  it("budget consumption switches to defaultInvAccount (mixed-treatment-safe)", () => {
    expect(ROUTE).toContain("accountCode: defaultInvAccount,");
  });

  it("legacy lines without lineTreatment still post (to default inventory)", () => {
    // Lines whose lineTreatment is null AND accountCode is null go to
    // defaultInvAccount. Verify the fallback chain.
    expect(ROUTE).toContain("if (!acct) acct = defaultInvAccount;");
  });
});
