import { describe, it, expect } from "vitest";
import {
  classifyAccountUsage,
  allowedUsagesForPaymentMethod,
  PAYMENT_METHOD_ALLOWED_USAGES,
  ACCOUNT_USAGES,
  isValidUsage,
  isValidChildrenPolicy,
  DEFAULT_CHILDREN_USAGE_POLICY,
} from "../../src/lib/financeAccountClassifier.js";

describe("financeAccountClassifier — usage taxonomy", () => {
  it("includes the operational cash usages", () => {
    for (const u of ["cash_box", "bank", "custody", "card", "cheque"]) {
      expect(ACCOUNT_USAGES).toContain(u);
    }
  });

  it("validates usage + children policy", () => {
    expect(isValidUsage("bank")).toBe(true);
    expect(isValidUsage("nope")).toBe(false);
    expect(isValidChildrenPolicy("inherit_locked")).toBe(true);
    expect(isValidChildrenPolicy("nope")).toBe(false);
    expect(DEFAULT_CHILDREN_USAGE_POLICY).toBe("inherit_default");
  });
});

describe("financeAccountClassifier — payment-method allow-list", () => {
  it("maps each method to the right usages", () => {
    expect(allowedUsagesForPaymentMethod("cash")).toEqual(["cash_box"]);
    expect(allowedUsagesForPaymentMethod("bank_transfer")).toEqual(["bank"]);
    expect(allowedUsagesForPaymentMethod("custody")).toEqual(["custody"]);
    expect(allowedUsagesForPaymentMethod("credit_card")).toEqual(["card"]);
    expect(allowedUsagesForPaymentMethod("check")).toEqual(["bank", "cheque"]);
  });

  it("returns null for unknown/absent method (no constraint)", () => {
    expect(allowedUsagesForPaymentMethod(undefined)).toBeNull();
    expect(allowedUsagesForPaymentMethod("teleport")).toBeNull();
  });

  it("cash never allows a bank account", () => {
    expect(PAYMENT_METHOD_ALLOWED_USAGES.cash).not.toContain("bank");
  });
});

describe("financeAccountClassifier — auto-classify heuristic", () => {
  it("classifies by Arabic name signal", () => {
    expect(classifyAccountUsage({ name: "الصندوق الرئيسي" })).toBe("cash_box");
    expect(classifyAccountUsage({ name: "بنك الراجحي" })).toBe("bank");
    expect(classifyAccountUsage({ name: "عهدة الموظف" })).toBe("custody");
    expect(classifyAccountUsage({ name: "مخزون قطع الغيار" })).toBe("inventory");
  });

  it("falls back to Saudi code prefix", () => {
    expect(classifyAccountUsage({ code: "1110" })).toBe("cash_box");
    expect(classifyAccountUsage({ code: "1201" })).toBe("receivable");
    expect(classifyAccountUsage({ code: "2101" })).toBe("payable");
    expect(classifyAccountUsage({ code: "4100" })).toBe("revenue");
    expect(classifyAccountUsage({ code: "5300" })).toBe("payroll_expense");
    expect(classifyAccountUsage({ code: "5900" })).toBe("operating_expense");
  });

  it("returns null for an unclassifiable asset (→ gap report)", () => {
    expect(classifyAccountUsage({ type: "asset" })).toBeNull();
  });
});
