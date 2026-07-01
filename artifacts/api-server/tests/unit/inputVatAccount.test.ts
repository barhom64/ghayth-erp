import { describe, it, expect } from "vitest";
import { resolveVatLegAccount, buildVatLeg } from "../../src/lib/vatLeg.js";

/**
 * البند ٤ (جانب المشتريات) — assertion على سطر قيد ضريبة المدخلات (الدستور قاعدة
 * ٣: لا تغيير قيد بلا اختبار assertion على سطور القيد). بناء نقي → بلا DB.
 *
 * جانب المشتريات لا يحمل رمز ضريبة لكل وثيقة، فالحساب يُشتقّ من الرمز القياسي
 * للشركة (resolveCompanyInputVatAccount = getDefaultTaxCode→inputAccountId، ثم
 * resolveVatLegAccount مع الاحتياطي). هنا نثبّت القرار وسطر القيد لكل موضع:
 *   • استلام بضاعة GRN + فاتورة مورد → مدين حساب المدخلات (تحميل ضريبة).
 *   • إشعار دائن مورد → دائن نفس الحساب (عكس) ⇒ التسوية صفر.
 */
describe("ضريبة المدخلات — اختيار حساب الرمز القياسي أو الاحتياطي", () => {
  it("حساب مدخلات الرمز القياسي يفوز على الحساب العام", () => {
    // المُدخل (specific) هو ناتج getInputVatAccountCode للرمز القياسي.
    expect(resolveVatLegAccount("1185", "1180")).toBe("1185");
  });

  it("غياب رمز قياسي أو حساب مدخلات ⇒ الحساب العام (سلوك مطابق للسابق)", () => {
    expect(resolveVatLegAccount(null, "1180")).toBe("1180");
    expect(resolveVatLegAccount("", "1180")).toBe("1180");
  });
});

describe("ضريبة المدخلات — سطر القيد بالاتجاه الصحيح لكل موضع", () => {
  it("استلام بضاعة GRN: يُدين حساب مدخلات الرمز القياسي", () => {
    const acc = resolveVatLegAccount("1185", "1180");
    const legs = buildVatLeg({ amount: 15, side: "debit", accountCode: acc });
    expect(legs[0]).toMatchObject({ accountCode: "1185", debit: 15, credit: 0 });
  });

  it("فاتورة مورد مباشرة: يُدين حساب مدخلات الرمز القياسي", () => {
    const acc = resolveVatLegAccount("1185", "1180");
    const legs = buildVatLeg({ amount: 7.5, side: "debit", accountCode: acc });
    expect(legs[0]).toMatchObject({ accountCode: "1185", debit: 7.5, credit: 0 });
  });

  it("إشعار دائن مورد: يُدائن (يعكس) نفس الحساب", () => {
    const acc = resolveVatLegAccount("1185", "1180");
    const legs = buildVatLeg({ amount: 7.5, side: "credit", accountCode: acc });
    expect(legs[0]).toMatchObject({ accountCode: "1185", debit: 0, credit: 7.5 });
  });

  it("ضريبة صفر ⇒ لا سطر (يطابق حارس vatAmount > 0 في كل المواضع)", () => {
    expect(buildVatLeg({ amount: 0, side: "debit", accountCode: "1185" })).toHaveLength(0);
  });

  it("الرمز غير المُهيّأ يضع السطر على الحساب العام لا حسابًا ميتًا", () => {
    const acc = resolveVatLegAccount(null, "1180");
    const legs = buildVatLeg({ amount: 15, side: "debit", accountCode: acc });
    expect(legs[0].accountCode).toBe("1180");
  });

  it("التسوية: فاتورة المورد (مدين) وإشعارها الدائن (دائن) على نفس الحساب ⇒ صافي صفر", () => {
    const acc = resolveVatLegAccount("1185", "1180");
    const bill = buildVatLeg({ amount: 15, side: "debit", accountCode: acc });
    const memo = buildVatLeg({ amount: 15, side: "credit", accountCode: acc });
    expect(bill[0].accountCode).toBe(memo[0].accountCode);
    // مدين 15 على الفاتورة − دائن 15 على الإشعار = 0 على نفس الحساب.
    expect(bill[0].debit - memo[0].credit).toBeCloseTo(0, 2);
  });
});
