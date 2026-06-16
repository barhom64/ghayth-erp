/**
 * FIN-P12-REGRESSION-TESTS (#2242) — frontend closure assertions for the
 * vehicle-fuel "clear scenario" acceptance criteria.
 *
 * Static source-reading smoke (mirrors the repo's existing finance UI smoke
 * tests). The closure mandate says the journal lines must be RIGHT; on the UI
 * side the load-bearing acceptance criteria for the clear fuel scenario are:
 *   • the charge account (accountCode) is NOT a normal user field in the fuel
 *     scenario — it is read-only / auto-routed by the financial engine, so fuel
 *     can never be posted to a hand-picked fallback account;
 *   • there is NO free-text "station name" main field — the SUPPLIER (gas
 *     station) drives it (a saved vendor), so the journal carries a real
 *     vendorId dimension, not a string.
 * We assert these against expenses-create.tsx behaviour/strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../../../..");
const FORM = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8",
);

describe("#2242 finance cycle closure — fuel clear-scenario UI invariants", () => {
  it("derives the fuel scenario (amount = liters × price), not a free-form expense", () => {
    expect(FORM).toContain("const isFuelScenario =");
    expect(FORM).toContain("fuelLiters * fuelPricePerLiter");
  });

  it("in the fuel scenario the charge account is AUTO-routed / read-only — NOT a normal pick", () => {
    // The fuel branch renders an auto-routed, locked charge-account summary …
    expect(FORM).toContain("بند المصروفات (توجيه تلقائي)");
    expect(FORM).toContain("غير قابل للتعديل اليدوي");
    // … gated behind isFuelScenario (the manual Autocomplete picker is the
    // NON-fuel branch only).
    expect(FORM).toMatch(/isFuelScenario \?[\s\S]*بند المصروفات \(توجيه تلقائي\)/);
    expect(FORM).toMatch(/\) : \([\s\S]*Autocomplete options=\{expenseOptions\}/);
  });

  it("the gas station is a SAVED SUPPLIER (vendorId), not a free-text station-name field", () => {
    // the hard-required field is the supplier/gas-station vendor …
    expect(FORM).toContain("المورد (محطة الوقود)");
    // … and there is NO free-text stationName main input.
    expect(FORM).not.toMatch(/stationName/);
  });

  it("save is hard-gated on the fuel dimensions (vehicle + supplier) before it can post", () => {
    expect(FORM).toContain("fuelHardMissing");
    expect(FORM).toContain("isFuelScenario && fuelHardMissing.length > 0");
  });
});
