import { describe, it, expect } from "vitest";
import {
  buildExpenseEntityLink,
  buildExpenseLines,
  evaluateExpensePlan,
} from "../../src/lib/expenseJournalPlan.js";

/**
 * FIN-P8-JOURNAL-PREVIEW (#2238) — المُجمِّع المشترك لقيد المصروف.
 *
 * يثبت أن المعاينة والحفظ يبنيان نفس شكل القيد، وأن التقييم يكشف:
 *  • قيد وقود مركبة صحيح متوازن (مع/بدون ضريبة).
 *  • blocker عند حساب غير موجود.
 *  • blocker عند غياب البُعد المُنفَّذ (وقود بلا مركبة — عبر عقد #2233).
 *  • لا كتابة DB (دوال نقية).
 */
describe("#2238 buildExpenseEntityLink", () => {
  it("vehicle expense → vehicleId on the link", () => {
    const { entityLink, accountCodeOverride } = buildExpenseEntityLink({
      accountCode: "5510",
      relatedEntityType: "vehicle",
      relatedEntityId: 12,
      costCenter: "فرع-الرياض",
    });
    expect(entityLink.vehicleId).toBe(12);
    expect(entityLink.costCenter).toBe("فرع-الرياض");
    expect(accountCodeOverride).toBe("5510");
  });

  it("supplier maps to vendorId; lineAllocation.accountCode overrides", () => {
    const { entityLink, accountCodeOverride } = buildExpenseEntityLink({
      accountCode: "5510",
      relatedEntityType: "supplier",
      relatedEntityId: 7,
      lineAllocation: { accountCode: "5520", vehicleId: 9 },
    });
    expect(entityLink.vendorId).toBe(7);
    expect(entityLink.vehicleId).toBe(9);
    expect(accountCodeOverride).toBe("5520");
  });
});

describe("#2238 buildExpenseLines", () => {
  it("fuel expense without VAT → 2 balanced lines, vehicleId on expense leg", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5510",
      baseAmount: 200,
      vatAmount: 0,
      sourceAccountCode: "1111",
      totalWithVat: 200,
      entityLink: { vehicleId: 12 },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: "5510", debit: 200, credit: 0, vehicleId: 12, role: "expense" });
    expect(lines[1]).toMatchObject({ accountCode: "1111", debit: 0, credit: 200, role: "source" });
  });

  it("fuel expense WITH VAT → 3 lines, balanced (debit total = credit total)", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5510",
      baseAmount: 200,
      vatAmount: 30,
      vatInputAccountCode: "1180",
      sourceAccountCode: "1111",
      totalWithVat: 230,
      entityLink: { vehicleId: 12 },
    });
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ accountCode: "1180", debit: 30, role: "vat_input" });
    const d = lines.reduce((s, l) => s + l.debit, 0);
    const c = lines.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(c);
  });

  it("cost-center distribution → one expense leg per center, still balanced", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5510",
      baseAmount: 100,
      vatAmount: 0,
      sourceAccountCode: "1111",
      totalWithVat: 100,
      entityLink: { vehicleId: 12 },
      costCenterSplits: [
        { costCenterId: 1, amount: 60 },
        { costCenterId: 2, amount: 40 },
      ],
    });
    expect(lines.filter((l) => l.role === "expense")).toHaveLength(2);
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
  });
});

describe("#2238 evaluateExpensePlan", () => {
  it("balanced fuel plan with vehicle → balanced, no blockers", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5510",
      baseAmount: 200,
      vatAmount: 0,
      sourceAccountCode: "1111",
      totalWithVat: 200,
      entityLink: { vehicleId: 12 },
    });
    const r = evaluateExpensePlan({ lines, knownAccountCodes: new Set(["5510", "1111"]) });
    expect(r.balanced).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it("account not in the known set → account_not_found blocker", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5510-0001",
      baseAmount: 200,
      vatAmount: 0,
      sourceAccountCode: "1111",
      totalWithVat: 200,
      entityLink: { vehicleId: 12 },
    });
    const r = evaluateExpensePlan({ lines, knownAccountCodes: new Set(["1111"]) });
    expect(r.blockers.some((b) => b.code === "account_not_found")).toBe(true);
  });

  it("fuel without vehicleId → dimension_contract blocker (enforced via #2233)", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5510",
      baseAmount: 200,
      vatAmount: 0,
      sourceAccountCode: "1111",
      totalWithVat: 200,
      entityLink: {},
    });
    const r = evaluateExpensePlan({ lines, knownAccountCodes: new Set(["5510", "1111"]) });
    expect(r.blockers.some((b) => b.code === "dimension_contract")).toBe(true);
  });

  it("unbalanced lines → unbalanced blocker", () => {
    const r = evaluateExpensePlan({
      lines: [
        { accountCode: "5510", debit: 200, credit: 0, vehicleId: 1 },
        { accountCode: "1111", debit: 0, credit: 150 },
      ],
    });
    expect(r.balanced).toBe(false);
    expect(r.blockers.some((b) => b.code === "unbalanced")).toBe(true);
  });

  it("property maintenance without dim → warning, not blocker (staged ratchet)", () => {
    const lines = buildExpenseLines({
      expenseAccountCode: "5610",
      baseAmount: 100,
      vatAmount: 0,
      sourceAccountCode: "1111",
      totalWithVat: 100,
      entityLink: {},
    });
    const r = evaluateExpensePlan({ lines, knownAccountCodes: new Set(["5610", "1111"]) });
    expect(r.blockers.some((b) => b.code === "dimension_contract")).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
