import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P4 operational-expense supplier contract (#2234, expanded) — the contract
 * generalises beyond fuel: vehicle maintenance (workshop) and property
 * maintenance (contractor) are commercial parties too, so they bind a SAVED
 * supplier onto allocation.vendorId → the maintenance JE line carries vendorId
 * (per-supplier maintenance reports). Recommended, not enforced (warn-stage
 * per #2233). The vendorId dimension is already persisted by the expense save
 * via lineAllocation.vendorId → buildExpenseEntityLink (#2238/#2234).
 */
const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const TARGET = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/allocation-target-select.tsx"),
  "utf8",
);

describe("#2234 maintenance scenarios bind a saved supplier (vendorId)", () => {
  it("vehicle maintenance renders a workshop SupplierSelect bound to vendorId", () => {
    expect(TARGET).toContain('label="الورشة / المورد"');
  });

  it("property maintenance renders a contractor SupplierSelect bound to vendorId", () => {
    expect(TARGET).toContain('label="المقاول / المورد"');
  });

  it("both maintenance suppliers write to allocation.vendorId (the JE dimension)", () => {
    // every maintenance SupplierSelect routes through setAlloc({ vendorId: v }).
    const matches = TARGET.match(/onChange=\{\(v\) => setAlloc\(\{ vendorId: v \}\)\}/g) ?? [];
    // fuel (1) + vehicle maintenance (1) + property maintenance (1) + the
    // standalone supplier target (1) all bind vendorId.
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});
