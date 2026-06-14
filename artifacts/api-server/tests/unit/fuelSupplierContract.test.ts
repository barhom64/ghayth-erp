import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyFuelLogEffect } from "../../src/lib/financeOperationalEffect.js";

/**
 * FIN-P4-SUPPLIER-FUEL-CONTRACT (#2234) — vehicle fuel uses a SAVED supplier
 * (the gas station IS a supplier), not free text. The supplier rides as
 * vendorId on the JE line (canonical suppliers.id, no separate vendor entity);
 * `fleet_fuel_logs.stationName` degrades to a DERIVED display label.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");
const EFFECT = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/financeOperationalEffect.ts"), "utf8");
const TARGET = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/allocation-target-select.tsx"), "utf8");
const FORM = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx"), "utf8");

// Minimal txn-client stub that records the queries applyFuelLogEffect issues.
function makeClient(supplierName: string | null) {
  const calls: { sql: string; params: any[] }[] = [];
  const client = {
    query: async (sql: string, params: any[]) => {
      calls.push({ sql, params });
      if (/FROM suppliers/.test(sql)) return { rows: supplierName ? [{ name: supplierName }] : [] };
      if (/INSERT INTO fleet_fuel_logs/.test(sql)) return { rows: [{ id: 99 }] };
      return { rows: [] };
    },
  };
  return { client, calls };
}

describe("#2234 applyFuelLogEffect derives stationName from the saved supplier", () => {
  it("supplierId → stationName becomes the supplier's name (derived label)", async () => {
    const { client, calls } = makeClient("الدريس");
    const r = await applyFuelLogEffect(client as any, {
      companyId: 1, journalId: 5, vehicleId: 12, totalCost: 200, supplierId: 7, stationName: "نص قديم",
    });
    expect(r.fuelLogId).toBe(99);
    const insert = calls.find((c) => /INSERT INTO fleet_fuel_logs/.test(c.sql))!;
    // stationName is the 8th column param ($8) — index 7 in the params array.
    expect(insert.params[7]).toBe("الدريس");
  });

  it("unregisteredSupplierName is used when no supplierId is given", async () => {
    const { client, calls } = makeClient(null);
    await applyFuelLogEffect(client as any, {
      companyId: 1, journalId: 5, vehicleId: 12, totalCost: 100, unregisteredSupplierName: "محطة مؤقتة",
    });
    const insert = calls.find((c) => /INSERT INTO fleet_fuel_logs/.test(c.sql))!;
    expect(insert.params[7]).toBe("محطة مؤقتة");
  });
});

describe("#2234 backend contract (finance-journal + effect)", () => {
  it("fuelLog schema accepts supplierId + unregisteredSupplierName", () => {
    expect(ROUTE).toContain("supplierId: z.coerce.number().int().positive().optional()");
    expect(ROUTE).toContain("unregisteredSupplierName: z.string().optional()");
  });

  it("the expense route enforces a saved fuel supplier (policy-gated exception)", () => {
    expect(ROUTE).toContain("if (fuelLog?.create && entityLink.vehicleId != null) {");
    expect(ROUTE).toContain("FROM suppliers WHERE id = $1");
    expect(ROUTE).toContain("allowUnregisteredFuelSupplier");
    expect(ROUTE).toContain("المورد مطلوب لتسجيل تعبئة وقود المركبة");
  });

  it("the supplier rides onto the JE line as vendorId", () => {
    expect(ROUTE).toContain("if (entityLink.vendorId == null) entityLink.vendorId = Number(fuelSupplierId);");
    expect(ROUTE).toContain("supplierId: (entityLink.vendorId as number | undefined) ?? fuelLog.supplierId ?? null,");
  });

  it("applyFuelLogEffect resolves the supplier name as the station label", () => {
    expect(EFFECT).toContain("supplierId?: number | null;");
    expect(EFFECT).toContain("SELECT name FROM suppliers WHERE id = $1");
    expect(EFFECT).toContain("stationLabel");
  });
});

describe("#2234 frontend contract (fuel scenario uses SupplierSelect)", () => {
  it("the fuel scenario renders SupplierSelect bound to vendorId, not a primary station text", () => {
    expect(TARGET).toContain("label=\"المورد (محطة الوقود)\"");
    expect(TARGET).toMatch(/<SupplierSelect[\s\S]{0,200}value=\{value\.allocation\.vendorId/);
    expect(TARGET).toContain("fuelSupplierUnregistered");
  });

  it("buildOperationalEffectsPayload ships supplierId + unregisteredSupplierName", () => {
    expect(TARGET).toContain("supplierId: !t.fuelSupplierUnregistered && t.allocation.vendorId ? Number(t.allocation.vendorId) : undefined");
    expect(TARGET).toContain("unregisteredSupplierName: t.fuelSupplierUnregistered ? (t.fuelStation || undefined) : undefined");
  });

  it("the expense form blocks save when a fuel supplier is missing", () => {
    expect(FORM).toContain("allocTarget.createFuelLog");
    expect(FORM).toContain("!allocTarget.allocation.vendorId");
    expect(FORM).toContain("اختر مورد محطة الوقود");
  });
});
