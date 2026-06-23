import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * العقيدة «النظام مساعد لا عائق» (خادم): معالج POST /finance/expenses يجب ألا
 * يرفض المصروف بلا حساب — يوجّهه تلقائيًا إلى الورقة العامة القابلة للترحيل
 * 5399. كان حارسٌ متناقض يرمي «لا يمكن صرف بدون حساب محاسبي واضح» بينما المعالج
 * نفسه يحلّ الفارغ إلى 5399. الحارس الثابت يمنع إعادة إدخال الرفض، ويثبّت بقاء
 * السقوط الآمن 5399. (assertion ديناميكي على سطور القيد:
 * tests/integration/expenseEmptyAccountAutoRoutes.dynamic.test.ts)
 */
const SRC = join(import.meta.dirname!, "../../src/routes/finance-journal.ts");
const CODE = readFileSync(SRC, "utf8");

describe("expense create no longer hard-rejects a missing accountCode", () => {
  it("the contradictory «لا يمكن صرف بدون حساب محاسبي واضح» guard is removed", () => {
    expect(CODE).not.toMatch(/لا يمكن صرف بدون حساب محاسبي واضح/);
  });

  it("the handler keeps the postable 5399 auto-route for an empty account", () => {
    expect(CODE).toMatch(/\?\?\s*"5399"/);
  });

  it("the SEPARATE voucher handler keeps its own required-account guard (out of scope)", () => {
    // vouchers (سند) legitimately require a main account; this fix is expenses-only.
    expect(CODE).toMatch(/الحساب المحاسبي الرئيسي للسند|الحساب المحاسبي مطلوب/);
  });
});
