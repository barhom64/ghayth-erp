import { describe, it, expect } from "vitest";
import {
  resolveVatLegAccount,
  buildVatLeg,
} from "../../src/lib/vatLeg.js";

/**
 * البند ٤ (توجيه إبراهيم «ج») — assertion على سطر قيد ضريبة المخرجات (الدستور
 * قاعدة ٣: لا تغيير قيد بلا اختبار assertion على سطور القيد). بناء نقي → بلا DB.
 *
 * يثبّت أنّ: سطر الضريبة يحمل حساب رمز الضريبة عند تهيئته ويرتدّ إلى الحساب العام
 * عند غيابه؛ والاتجاه صحيح لكل موضع (إصدار/إشعار)؛ وأن الإصدار وعكسه على نفس
 * الحساب فتُغلق التسوية صفرًا.
 */
describe("resolveVatLegAccount — اختيار حساب رمز الضريبة أو الاحتياطي", () => {
  it("الرمز المُهيّأ يفوز على الحساب العام", () => {
    expect(resolveVatLegAccount("2310", "2131")).toBe("2310");
  });

  it("غير المُهيّأ (null/فارغ/فراغات) يرتدّ إلى الحساب العام", () => {
    expect(resolveVatLegAccount(null, "2131")).toBe("2131");
    expect(resolveVatLegAccount(undefined, "2131")).toBe("2131");
    expect(resolveVatLegAccount("", "2131")).toBe("2131");
    expect(resolveVatLegAccount("   ", "2131")).toBe("2131");
  });
});

describe("buildVatLeg — سطر ضريبة المخرجات بالاتجاه والحساب الصحيحين", () => {
  it("اعتماد الفاتورة: ائتمان حساب رمز الضريبة بمبلغ الضريبة", () => {
    const account = resolveVatLegAccount("2310", "2131");
    const legs = buildVatLeg({ amount: 15, side: "credit", accountCode: account, clientId: 7, keepZero: true });
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ accountCode: "2310", debit: 0, credit: 15, clientId: 7 });
  });

  it("اعتماد بضريبة صفر + keepZero: يُبقي سطرًا صفريًّا (يطابق السلوك الحالي)", () => {
    const legs = buildVatLeg({ amount: 0, side: "credit", accountCode: "2131", clientId: 7, keepZero: true });
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ accountCode: "2131", debit: 0, credit: 0 });
  });

  it("إشعار دائن (عكس): يُدين نفس حساب رمز الضريبة بمبلغ الضريبة", () => {
    const account = resolveVatLegAccount("2310", "2131");
    const legs = buildVatLeg({ amount: 15, side: "debit", accountCode: account, clientId: 7 });
    expect(legs[0]).toMatchObject({ accountCode: "2310", debit: 15, credit: 0 });
  });

  it("إشعار مدين: يُضيف ضريبة جديدة (ائتمان) على حساب رمز الضريبة", () => {
    const account = resolveVatLegAccount("2310", "2131");
    const legs = buildVatLeg({ amount: 7.5, side: "credit", accountCode: account });
    expect(legs[0]).toMatchObject({ accountCode: "2310", debit: 0, credit: 7.5 });
  });

  it("إشعار بضريبة صفر بدون keepZero: لا سطر (يطابق حارس vat > 0)", () => {
    expect(buildVatLeg({ amount: 0, side: "debit", accountCode: "2310" })).toHaveLength(0);
    expect(buildVatLeg({ amount: -3, side: "credit", accountCode: "2310" })).toHaveLength(0);
  });

  it("الرمز غير المُهيّأ يضع السطر على الحساب العام لا على رمز ميت", () => {
    const account = resolveVatLegAccount(null, "2131");
    const legs = buildVatLeg({ amount: 15, side: "credit", accountCode: account });
    expect(legs[0].accountCode).toBe("2131");
  });

  it("التسوية: الإصدار وعكسه على نفس الحساب ⇒ صافي الحساب صفر", () => {
    const account = resolveVatLegAccount("2310", "2131");
    const issue = buildVatLeg({ amount: 15, side: "credit", accountCode: account });
    const reverse = buildVatLeg({ amount: 15, side: "debit", accountCode: account });
    expect(issue[0].accountCode).toBe(reverse[0].accountCode);
    const net = issue[0].credit - issue[0].debit + (reverse[0].debit - reverse[0].credit) * -1;
    // ائتمان الإصدار 15 − مدين العكس 15 = 0 على الحساب نفسه
    expect(issue[0].credit - reverse[0].debit).toBeCloseTo(0, 2);
    expect(net).toBeCloseTo(0, 2);
  });

  it("يقرّب المبلغ إلى منزلتين", () => {
    const legs = buildVatLeg({ amount: 15.005, side: "credit", accountCode: "2310" });
    expect(legs[0].credit).toBe(15.01);
  });
});
