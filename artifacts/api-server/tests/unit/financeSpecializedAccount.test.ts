import { describe, it, expect } from "vitest";
import { deriveSpecializedAccount } from "../../src/lib/financeSpecializedAccount.js";

// #1715 (comment 9) — built-in specialized-account derivation. Locks the
// mapping from allocation target + item kind to a { purpose, defaultCode }
// so finance posts to the right account by default, even without configured
// allocation rules.
describe("deriveSpecializedAccount", () => {
  it("maps a vehicle target to the vehicle expense account", () => {
    const r = deriveSpecializedAccount({ targetType: "vehicle" });
    expect(r.purpose).toBe("vehicle_expense");
    expect(r.defaultCode).toBe("6500");
    expect(r.capitalize).toBe(false);
  });

  it("maps property maintenance to the property maintenance account", () => {
    expect(deriveSpecializedAccount({ targetType: "property_maintenance" }).defaultCode).toBe("6600");
  });

  it("maps a project target to project cost", () => {
    expect(deriveSpecializedAccount({ targetType: "project" }).defaultCode).toBe("6800");
  });

  it("capitalises a fixed_asset target (balance-sheet, not expense)", () => {
    const r = deriveSpecializedAccount({ targetType: "fixed_asset" });
    // Repointed 1500 (phantom) → 1280 «أصول ثابتة أخرى» (postable leaf + backfill 414).
    expect(r.defaultCode).toBe("1280");
    expect(r.capitalize).toBe(true);
  });

  it("item kind overrides the target (fuel on any target → vehicle fuel)", () => {
    const r = deriveSpecializedAccount({ targetType: "project", itemType: "fuel" });
    expect(r.defaultCode).toBe("6500");
    expect(r.purpose).toBe("vehicle_fuel_expense");
  });

  it("inventory item kind capitalises to stock", () => {
    const r = deriveSpecializedAccount({ targetType: "supplier", itemType: "inventory" });
    expect(r.defaultCode).toBe("1250");
    expect(r.capitalize).toBe(true);
  });

  it("falls back to the general expense account for unknown / no target", () => {
    expect(deriveSpecializedAccount({}).defaultCode).toBe("6900");
    expect(deriveSpecializedAccount({ targetType: "none" }).defaultCode).toBe("6900");
    expect(deriveSpecializedAccount({ targetType: "something-weird" }).defaultCode).toBe("6900");
  });

  it("is case-insensitive on target and item type", () => {
    expect(deriveSpecializedAccount({ targetType: "VEHICLE" }).defaultCode).toBe("6500");
    expect(deriveSpecializedAccount({ itemType: "FUEL" }).defaultCode).toBe("6500");
  });
});
