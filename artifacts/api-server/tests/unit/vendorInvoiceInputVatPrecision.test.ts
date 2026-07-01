import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pickDocTaxCodeFromLines } from "../../src/lib/taxCodes.js";
import { resolveVatLegAccount, buildVatLeg } from "../../src/lib/vatLeg.js";

/**
 * البند ٤ (المعالج الحقيقي لفاتورة المورد) — assertion على اشتقاق رمز ضريبة
 * الوثيقة من بنودها وعلى سطر قيد ضريبة المدخلات (الدستور قاعدة ٣). يثبّت أن
 * المعالج الفعلي (finance-journal/resolveVendorInvoicePlan) يشتق الحساب من رمز
 * الوثيقة لا من تعيين الشركة العام فقط.
 */
describe("pickDocTaxCodeFromLines — رمز ضريبة الوثيقة من بنودها", () => {
  it("يأخذ رمز أوّل بند خاضع للضريبة (vatAmount > 0)", () => {
    expect(pickDocTaxCodeFromLines([
      { taxCode: "", vatAmount: 0 },
      { taxCode: "VAT5", vatAmount: 5 },
      { taxCode: "VAT15", vatAmount: 15 },
    ])).toBe("VAT5");
  });

  it("يتجاهل البنود بلا ضريبة ولو حملت رمزًا", () => {
    expect(pickDocTaxCodeFromLines([
      { taxCode: "VAT15", vatAmount: 0 },   // لا ضريبة → يُتجاهل
      { taxCode: "EXEMPT", vatAmount: 0 },
      { taxCode: "VAT15", vatAmount: 15 },  // هذا المعتمد
    ])).toBe("VAT15");
  });

  it("لا بند برمز خاضع للضريبة ⇒ null (يرتدّ للرمز القياسي للشركة)", () => {
    expect(pickDocTaxCodeFromLines([{ taxCode: "", vatAmount: 15 }, { taxCode: null, vatAmount: 0 }])).toBeNull();
    expect(pickDocTaxCodeFromLines([])).toBeNull();
  });

  it("يقصّ الفراغات", () => {
    expect(pickDocTaxCodeFromLines([{ taxCode: "  VAT15 ", vatAmount: 15 }])).toBe("VAT15");
  });
});

describe("سطر ضريبة المدخلات (المعالج الحقيقي) — الحساب والاتجاه", () => {
  it("رمز الوثيقة المُهيّأ يُدين حسابه؛ غيابه يرتدّ للعام", () => {
    expect(resolveVatLegAccount("1185", "1180")).toBe("1185"); // حساب رمز الوثيقة
    expect(resolveVatLegAccount(null, "1180")).toBe("1180");   // ارتداد
  });

  it("سطر ضريبة المدخلات مدين بحساب رمز الوثيقة", () => {
    const acc = resolveVatLegAccount("1185", "1180");
    const legs = buildVatLeg({ amount: 15, side: "debit", accountCode: acc });
    expect(legs[0]).toMatchObject({ accountCode: "1185", debit: 15, credit: 0 });
  });
});

describe("توصيل المعالج الحقيقي (finance-journal/resolveVendorInvoicePlan)", () => {
  const JOURNAL = readFileSync(
    join(import.meta.dirname!, "../../../..", "artifacts/api-server/src/routes/finance-journal.ts"),
    "utf8",
  );
  const TAXCODES = readFileSync(
    join(import.meta.dirname!, "../../../..", "artifacts/api-server/src/lib/taxCodes.ts"),
    "utf8",
  );

  it("resolveVendorInvoicePlan يشتق رمز الوثيقة ويستدعي resolveInputVatAccount", () => {
    expect(JOURNAL).toContain("const docTaxCode = pickDocTaxCodeFromLines(p.lines);");
    expect(JOURNAL).toContain("vatInputAccountCode = await resolveInputVatAccount(scope.companyId, docTaxCode, general);");
    // الاحتياطي العام لا يزال يُحلّ (ارتداد مطابق للسابق).
    expect(JOURNAL).toContain('"vat_input", "debit", "1180"');
  });

  it("resolveInputVatAccount مُعرَّف بالترتُّب: رمز الوثيقة ← القياسي ← العام", () => {
    expect(TAXCODES).toContain("export async function resolveInputVatAccount");
    expect(TAXCODES).toContain("getInputVatAccountCode(companyId, code)");
    expect(TAXCODES).toContain("return resolveCompanyInputVatAccount(companyId, fallbackAccount)");
  });
});
