// Dummy env so importing financePostingPolicy → rawdb → config doesn't throw.
// No DB connection happens: the payment-source path is never triggered here
// (paymentMethod is left null), so getPool() is never called.
process.env.DATABASE_URL ||= "postgres://u:p@localhost:5432/none";
process.env.JWT_SECRET ||= "test-secret-with-at-least-thirty-two-characters-aaaa";

import { describe, it, expect } from "vitest";
import {
  assertOperationValid,
  type FinanceOperationContext,
} from "../../src/lib/financeOperationContext.js";

const base = (over: Partial<FinanceOperationContext>): FinanceOperationContext => ({
  operationType: "expense",
  companyId: 2,
  allocationTarget: "none",
  dimensions: {},
  operationalEffect: { kind: "none" },
  ...over,
});

describe("assertOperationValid — context consistency (#1715 §4/§6)", () => {
  it("passes when the allocation target carries its dimension", async () => {
    await expect(
      assertOperationValid(base({ allocationTarget: "vehicle", dimensions: { vehicleId: 5 } })),
    ).resolves.toBeUndefined();
  });

  it("rejects target=vehicle with no vehicleId", async () => {
    await expect(
      assertOperationValid(base({ allocationTarget: "vehicle", dimensions: {} })),
    ).rejects.toThrow(/مركبة/);
  });

  it("rejects target=property_maintenance with no propertyId", async () => {
    await expect(
      assertOperationValid(base({ allocationTarget: "property_maintenance", dimensions: {} })),
    ).rejects.toThrow(/عقار/);
  });

  it("rejects target=customer with no clientId", async () => {
    await expect(
      assertOperationValid(base({ allocationTarget: "customer", dimensions: {} })),
    ).rejects.toThrow(/عميل/);
  });

  it("allows target=none with empty dimensions", async () => {
    await expect(assertOperationValid(base({}))).resolves.toBeUndefined();
  });

  it("rejects a transfer sourced from an expense account", async () => {
    await expect(
      assertOperationValid(base({
        operationType: "transfer",
        moneySource: { usage: "operating_expense" },
      })),
    ).rejects.toThrow(/تحويل/);
  });

  it("rejects a transfer sourced from receivable (ذمم)", async () => {
    await expect(
      assertOperationValid(base({
        operationType: "transfer",
        moneySource: { usage: "receivable" },
      })),
    ).rejects.toThrow(/تحويل/);
  });

  it("allows a transfer sourced from a cash box", async () => {
    await expect(
      assertOperationValid(base({
        operationType: "transfer",
        moneySource: { usage: "cash_box" },
      })),
    ).resolves.toBeUndefined();
  });

  it("does not constrain a transfer whose source usage is unknown", async () => {
    await expect(
      assertOperationValid(base({ operationType: "transfer", moneySource: {} })),
    ).resolves.toBeUndefined();
  });
});
