import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildExpenseEntityLink,
  buildExpenseLines,
  evaluateExpensePlan,
} from "../../src/lib/expenseJournalPlan.js";

/**
 * FIN-P6-FUEL-VEHICLE-WORKSPACE (#2236) — MANDATORY vehicle-fuel journal
 * contract. The condensed fuel workspace is the source of the journal line, so
 * a vehicle-fuel entry MUST NOT post without the hard dimensions. This pins the
 * produced journal_lines:
 *   • the expense line carries vehicleId,
 *   • the expense line carries vendorId (the gas station is a saved supplier),
 *   • the charge account is the configured vehicle_fuel_expense account (5510,
 *     dimension-enforced) — NOT a fallback account,
 *   • the entry is balanced,
 * and that vehicle fuel with NO vehicle is REFUSED (dimension contract, #2233).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FORM = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8",
);

// The configured vehicle_fuel_expense account (enforce-classified in ledgerTruth).
const FUEL_ACCOUNT = "5510";
// A generic fallback account that fuel must NEVER silently land on.
const FALLBACK_ACCOUNT = "2150";

// Build the journal_lines exactly as the save path does: entity link from the
// scenario (vehicle + supplier) → expense lines (expense DR + source CR).
function buildFuelJournal(opts: {
  vehicleId?: number | null;
  vendorId?: number | null;
  amount?: number;
}) {
  const { vehicleId = 12, vendorId = 7, amount = 150 } = opts;
  const { entityLink, accountCodeOverride } = buildExpenseEntityLink({
    relatedEntityType: "vehicle",
    relatedEntityId: vehicleId ?? undefined,
    lineAllocation: {
      vehicleId: vehicleId ?? undefined,
      vendorId: vendorId ?? undefined,
    },
  });
  const lines = buildExpenseLines({
    expenseAccountCode: accountCodeOverride ?? FUEL_ACCOUNT,
    baseAmount: amount,
    vatAmount: 0,
    sourceAccountCode: "1010", // cash treasury
    totalWithVat: amount,
    entityLink,
  });
  return lines;
}

describe("#2236 vehicle-fuel journal_lines contract (mandatory)", () => {
  it("the expense line carries vehicleId AND vendorId", () => {
    const lines = buildFuelJournal({});
    const expense = lines.find((l) => l.role === "expense")!;
    expect(expense).toBeTruthy();
    expect(expense.vehicleId).toBe(12);
    expect(expense.vendorId).toBe(7);
  });

  it("posts to the configured vehicle_fuel_expense account, NOT a fallback", () => {
    const lines = buildFuelJournal({});
    const expense = lines.find((l) => l.role === "expense")!;
    expect(expense.accountCode).toBe(FUEL_ACCOUNT);
    expect(expense.accountCode).not.toBe(FALLBACK_ACCOUNT);
  });

  it("the entry is balanced and clears the plan with no blockers (account known)", () => {
    const lines = buildFuelJournal({});
    const verdict = evaluateExpensePlan({
      lines,
      knownAccountCodes: new Set([FUEL_ACCOUNT, "1010"]),
    });
    expect(verdict.balanced).toBe(true);
    expect(verdict.totalDebit).toBe(verdict.totalCredit);
    expect(verdict.blockers).toEqual([]);
  });

  it("REFUSES vehicle fuel with no vehicle (dimension contract enforce, #2233)", () => {
    const lines = buildFuelJournal({ vehicleId: null });
    const verdict = evaluateExpensePlan({
      lines,
      knownAccountCodes: new Set([FUEL_ACCOUNT, "1010"]),
    });
    expect(verdict.blockers.some((b) => b.code === "dimension_contract")).toBe(true);
  });

  it("flags an unknown/fallback charge account as not postable", () => {
    const { entityLink } = buildExpenseEntityLink({
      relatedEntityType: "vehicle",
      relatedEntityId: 12,
      lineAllocation: { vehicleId: 12, vendorId: 7 },
    });
    const lines = buildExpenseLines({
      expenseAccountCode: FALLBACK_ACCOUNT,
      baseAmount: 150, vatAmount: 0, sourceAccountCode: "1010", totalWithVat: 150, entityLink,
    });
    const verdict = evaluateExpensePlan({ lines, knownAccountCodes: new Set([FUEL_ACCOUNT, "1010"]) });
    expect(verdict.blockers.some((b) => b.code === "account_not_found")).toBe(true);
  });
});

describe("#2236 condensed fuel workspace wiring (form)", () => {
  it("derives a fuel scenario and the amount from liters × price", () => {
    expect(FORM).toContain("const isFuelScenario =");
    expect(FORM).toContain("fuelLiters * fuelPricePerLiter");
  });
  it("routes the charge account automatically (no manual pick) and gates save on hard fields", () => {
    expect(FORM).toContain("بند المصروفات (توجيه تلقائي)");
    expect(FORM).toContain("fuelHardMissing");
    expect(FORM).toContain("isFuelScenario && fuelHardMissing.length > 0");
  });
});
