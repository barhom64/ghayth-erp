import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 Wave 1 Step C — equipment rental (third transport leg).
//
// Pins the schema extension (migration 282) + route additions in
// fleet.ts that close the canonical R0→R10 rental flow:
//
//   draft → active (R8) → handover (R7) → return (R9) → completed (R10)
//
// The user's mandate: "تأجير المركبات موجود في الخادم بلا واجهة —
// فجوة P0". This test asserts the new pieces actually ship and that
// no JE is posted inside this flow (per the "Accounting Candidate
// after close" rule).

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const FLEET     = read("routes/fleet.ts");
const MIGRATION = read("migrations/293_fleet_rental_inspection_and_driver.sql");

describe("#1812 Step C — migration 282 schema additions", () => {
  it("migration file exists at the canonical path", () => {
    expect(existsSync(join(apiSrc, "migrations/293_fleet_rental_inspection_and_driver.sql"))).toBe(true);
  });
  it("adds withDriver + driverId columns to fleet_rental_contracts", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "withDriver"\s+BOOLEAN/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "driverId"\s+INTEGER/);
  });
  it("adds weeklyRate + monthlyRate alongside the existing dailyRate", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "weeklyRate"\s+NUMERIC\(12,2\)/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "monthlyRate"\s+NUMERIC\(12,2\)/);
  });
  it("adds the R7 handover inspection columns", () => {
    expect(MIGRATION).toMatch(/"handoverOdometer"\s+INTEGER/);
    expect(MIGRATION).toMatch(/"handoverFuelLevel"\s+NUMERIC\(4,2\)/);
    expect(MIGRATION).toMatch(/"handoverNotes"\s+TEXT/);
    expect(MIGRATION).toMatch(/"handoverAt"\s+TIMESTAMPTZ/);
  });
  it("adds the R9 return inspection columns + actualEndDate + overageAmount", () => {
    expect(MIGRATION).toMatch(/"returnOdometer"\s+INTEGER/);
    expect(MIGRATION).toMatch(/"returnFuelLevel"\s+NUMERIC\(4,2\)/);
    expect(MIGRATION).toMatch(/"returnNotes"\s+TEXT/);
    expect(MIGRATION).toMatch(/"returnedAt"\s+TIMESTAMPTZ/);
    expect(MIGRATION).toMatch(/"actualEndDate"\s+DATE/);
    expect(MIGRATION).toMatch(/"overageAmount"\s+NUMERIC\(12,2\)/);
  });
  it("constrains fuel level to 0..1 on both inspection columns", () => {
    expect(MIGRATION).toMatch(/fleet_rental_contracts_handover_fuel_range_check/);
    expect(MIGRATION).toMatch(/fleet_rental_contracts_return_fuel_range_check/);
    expect(MIGRATION).toMatch(/handoverFuelLevel" >= 0 AND "handoverFuelLevel" <= 1/);
    expect(MIGRATION).toMatch(/returnFuelLevel" >= 0 AND "returnFuelLevel" <= 1/);
  });
  it("indexes (companyId, driverId) for partial-active rentals", () => {
    expect(MIGRATION).toMatch(/idx_fleet_rental_contracts_driver/);
    expect(MIGRATION).toMatch(/"driverId" IS NOT NULL/);
  });
});

describe("#1812 Step C — fleet.ts rental routes", () => {
  it("createRentalContractSchema accepts withDriver + driverId + extra rate kinds", () => {
    expect(FLEET).toMatch(/withDriver: z\.boolean\(\)\.optional\(\)/);
    expect(FLEET).toMatch(/driverId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
    expect(FLEET).toMatch(/weeklyRate: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)/);
    expect(FLEET).toMatch(/monthlyRate: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)/);
  });
  it("createRentalContractSchema refines: withDriver=true implies driverId is present", () => {
    expect(FLEET).toMatch(/!b\.withDriver \|\| b\.driverId != null/);
    expect(FLEET).toMatch(/driverId مطلوب عند withDriver=true/);
  });
  it("rentalHandoverSchema captures odometer + fuelLevel + notes", () => {
    expect(FLEET).toMatch(/const rentalHandoverSchema = z\.object/);
    expect(FLEET).toMatch(/handoverOdometer: z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/);
    expect(FLEET).toMatch(/handoverFuelLevel: z\.coerce\.number\(\)\.min\(0\)\.max\(1\)/);
  });
  it("rentalReturnSchema captures return state + overageAmount", () => {
    expect(FLEET).toMatch(/const rentalReturnSchema = z\.object/);
    expect(FLEET).toMatch(/returnOdometer: z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/);
    expect(FLEET).toMatch(/returnFuelLevel: z\.coerce\.number\(\)\.min\(0\)\.max\(1\)/);
    expect(FLEET).toMatch(/overageAmount: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)/);
  });

  it("exposes GET /rental-contracts/:id for the SPA detail page", () => {
    expect(FLEET).toMatch(/router\.get\("\/rental-contracts\/:id"/);
    expect(FLEET).toMatch(/feature: "fleet\.vehicles", action: "view"/);
  });
  it("exposes POST /rental-contracts/:id/handover gated on update", () => {
    expect(FLEET).toMatch(/router\.post\("\/rental-contracts\/:id\/handover"/);
  });
  it("handover route refuses status != active", () => {
    expect(FLEET).toMatch(/التسليم لا يُسجَّل إلا بعد تفعيل العقد/);
  });
  it("exposes POST /rental-contracts/:id/return gated on update", () => {
    expect(FLEET).toMatch(/router\.post\("\/rental-contracts\/:id\/return"/);
  });
  it("return route refuses status != active AND refuses without prior handover", () => {
    expect(FLEET).toMatch(/الإرجاع لا يُسجَّل إلا على عقد فعّال/);
    expect(FLEET).toMatch(/لا يمكن تسجيل الإرجاع قبل التسليم/);
  });
  it("return route flips status → 'completed'", () => {
    expect(FLEET).toMatch(/status = 'completed'/);
  });
  it("return route emits fleet.rental_contract.completed event", () => {
    expect(FLEET).toMatch(/fleet\.rental_contract\.completed/);
  });
  it("list + detail return joined vehicle/client/driver labels", () => {
    expect(FLEET).toMatch(/LEFT JOIN fleet_drivers d ON d\.id = c\."driverId"/);
    expect(FLEET).toMatch(/d\.name AS "driverName"/);
  });
});

describe("#1812 Step C — accounting-candidate-only rule (no JE in rental UI)", () => {
  // The user's executive mandate is clear: لا يُسجَّل قيد مالي في
  // هذه الشاشة. The rental handover + return endpoints must NOT
  // call ledger / GL / journal helpers — Finance picks up overage
  // + revenue via the existing /rental-payments/:id/pay surface,
  // which is a separate financial-side action.
  const handoverBlock = FLEET.slice(
    FLEET.indexOf("/rental-contracts/:id/handover"),
    FLEET.indexOf("/rental-contracts/:id/return"),
  );
  const returnBlock = FLEET.slice(
    FLEET.indexOf("/rental-contracts/:id/return"),
    FLEET.indexOf("/rental-contracts/:id/payments"),
  );
  it("handover endpoint posts no journal entry", () => {
    expect(handoverBlock).not.toMatch(/postJournalEntry|journal_entries|writeJournal/);
  });
  it("return endpoint posts no journal entry", () => {
    expect(returnBlock).not.toMatch(/postJournalEntry|journal_entries|writeJournal/);
  });
});
