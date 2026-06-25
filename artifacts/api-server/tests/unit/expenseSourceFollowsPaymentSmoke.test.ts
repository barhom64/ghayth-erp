import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — owner's first example: «اخترت نقدي تظهر/تُختار الحسابات النقدية».
 *
 * The money-source picker was already FILTERED by payment method, but the
 * operator still had to pick manually and a stale source (e.g. a bank account
 * left selected after switching to cash) was never cleared. expenses-create
 * now syncs the source to the method: clear a non-matching source, and
 * auto-select when exactly one account matches.
 */
const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8",
);

describe("expenses-create — money source follows the payment method", () => {
  it("recomputes the matching source accounts from the chosen method", () => {
    expect(FORM).toMatch(/filterAccountsForPaymentMethod\(moneyAccounts, form\.paymentMethod\)/);
  });
  it("clears a source that no longer matches the method (single-pass: validity check + clear path)", () => {
    // restructured to clear AND re-select in one pass (Codex P1 #2914): a stale
    // source fails `stillValid` and is cleared unless a lone match replaces it.
    expect(FORM).toMatch(/const stillValid = !!prev\.sourceAccountCode && codes\.includes\(prev\.sourceAccountCode\)/);
    expect(FORM).toMatch(/return prev\.sourceAccountCode \? \{ \.\.\.prev, sourceAccountCode: "" \} : prev/);
  });
  it("auto-selects when exactly one account matches", () => {
    expect(FORM).toMatch(/codes\.length === 1/);
  });
});
