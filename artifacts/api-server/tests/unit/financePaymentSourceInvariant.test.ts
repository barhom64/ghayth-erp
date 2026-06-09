import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAYMENT_METHOD_ALLOWED_USAGES,
  allowedUsagesForPaymentMethod,
  filterAccountsForPaymentMethod,
} from "../../../ghayth-erp/src/lib/finance-account-usage.ts";

// #1945 (owner review, point #4) — «تغيير طريقة الدفع يغيّر مصدر المال فقط،
// ولا يغيّر حساب التحميل». This locks that invariant: the payment method can
// only ever narrow the MONEY-SOURCE picker, never the expense/charge account.

// The only usages a money source may carry. An expense (5xxx) / revenue (4xxx)
// charge account is never one of these.
const MONEY_SOURCE_USAGES = new Set(["cash_box", "bank", "custody", "card", "cheque"]);

describe("payment method affects the money SOURCE only", () => {
  it("every payment method maps exclusively to money-source usages", () => {
    for (const [method, usages] of Object.entries(PAYMENT_METHOD_ALLOWED_USAGES)) {
      expect(usages.length).toBeGreaterThan(0);
      for (const u of usages) {
        expect(MONEY_SOURCE_USAGES.has(u)).toBe(true); // never an expense/revenue usage
      }
    }
  });

  it("an unknown / empty method imposes no filter (returns the input untouched)", () => {
    const accts = [{ code: "1110", accountUsage: "cash_box" }, { code: "1120", accountUsage: "bank" }];
    expect(filterAccountsForPaymentMethod(accts, "")).toEqual(accts);
    expect(filterAccountsForPaymentMethod(accts, null)).toEqual(accts);
    expect(allowedUsagesForPaymentMethod("")).toBeNull();
  });

  it("filtering by a method yields a SUBSET of the money accounts — never an added charge account", () => {
    const money = [
      { code: "1110", accountUsage: "cash_box" },
      { code: "1120", accountUsage: "bank" },
      { code: "1130", accountUsage: "custody" },
    ];
    for (const method of Object.keys(PAYMENT_METHOD_ALLOWED_USAGES)) {
      const out = filterAccountsForPaymentMethod(money, method);
      // result is always a subset of what we passed in (no derivation of new accounts)
      for (const a of out) expect(money).toContainEqual(a);
      // and it can never surface an expense account, even if one is (wrongly) in the pool
      const polluted = [...money, { code: "5100", accountUsage: "expense" } as any];
      const out2 = filterAccountsForPaymentMethod(polluted, method);
      expect(out2.some((a: any) => a.code === "5100")).toBe(false);
    }
  });

  it("cash → cash boxes only; bank_transfer → banks only (source narrowing, not charge)", () => {
    const pool = [
      { code: "1110", accountUsage: "cash_box" },
      { code: "1120", accountUsage: "bank" },
    ];
    expect(filterAccountsForPaymentMethod(pool, "cash").map((a) => a.code)).toEqual(["1110"]);
    expect(filterAccountsForPaymentMethod(pool, "bank_transfer").map((a) => a.code)).toEqual(["1120"]);
  });
});

// Structural guard on the expense form: the payment method feeds ONLY the
// source picker; the charge-account options come from the expense accounts and
// are not a function of paymentMethod.
describe("expense form keeps charge account independent of payment method", () => {
  const FORM = readFileSync(
    join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
    "utf8",
  );

  it("payment method drives the money-source picker via filterAccountsForPaymentMethod", () => {
    expect(FORM).toMatch(/filterAccountsForPaymentMethod\(\s*moneyAccounts\s*,\s*form\.paymentMethod\s*\)/);
  });

  it("the charge-account picker is sourced from expense accounts, not the payment method", () => {
    // بند المصروفات options come from expenseOptions (expense-typed accounts)…
    expect(FORM).toMatch(/options=\{expenseOptions\}/);
    // …and no expression derives accountCode from paymentMethod.
    expect(FORM).not.toMatch(/accountCode[^\n]*form\.paymentMethod/);
    expect(FORM).not.toMatch(/paymentMethod[^\n]*accountCode\s*:/);
  });
});
