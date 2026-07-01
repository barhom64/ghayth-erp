import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * البند ٤ (جانب المشتريات) — حارس نمط يثبّت أن **الموضعين الحيّين** لضريبة
 * المدخلات في finance-purchase.ts (استلام GRN + إشعار دائن مورد) يشتقّان الحساب
 * عبر resolveCompanyInputVatAccount مع الاحتياطي العام.
 *
 * ملاحظة: معالج فاتورة المورد (POST /vendor-invoices) في finance-purchase **مظلَّل**
 * (journalRouter يلتقطه قبله) — أُزيل توصيله الخامل (تنظيف)، والدقّة الحقيقية على
 * resolveVendorInvoicePlan (finance-journal، #3087). لذا العدّ هنا = ٢ لا ٣.
 */
const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PURCHASE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-purchase.ts"),
  "utf8",
);
const TAXCODES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/taxCodes.ts"),
  "utf8",
);

describe("ضريبة المدخلات — توصيل الموضعين الحيّين بحساب الرمز القياسي", () => {
  it("المُساعد resolveCompanyInputVatAccount مُعرَّف ويستعمل القرار المثبَّت", () => {
    expect(TAXCODES).toContain("export async function resolveCompanyInputVatAccount");
    expect(TAXCODES).toContain("getDefaultTaxCode(companyId)");
    expect(TAXCODES).toContain("getInputVatAccountCode(companyId, def.code)");
    expect(TAXCODES).toContain("resolveVatLegAccount(specific, fallbackAccount)");
  });

  it("الموضعان الحيّان (GRN + إشعار دائن مورد) يستدعيان resolveCompanyInputVatAccount", () => {
    // ٢ فقط: المعالج المظلَّل لفاتورة المورد أُزيل توصيله الخامل (تنظيف).
    const calls = PURCHASE.match(/resolveCompanyInputVatAccount\(scope\.companyId,/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it("معالج فاتورة المورد المظلَّل مُوثَّق ولا يربط حساب رمز الضريبة", () => {
    expect(PURCHASE).toContain("⚠️ مسار مظلَّل (shadowed)");
    // لا يستدعي resolveInputVatAccount/resolveCompanyInputVatAccount على هذا المسار.
    const block = PURCHASE.slice(
      PURCHASE.indexOf('purchaseRouter.post("/vendor-invoices"'),
      PURCHASE.indexOf('purchaseRouter.get("/vendor-invoices"'),
    );
    expect(block).not.toContain("resolveCompanyInputVatAccount");
    expect(block).not.toContain("resolveInputVatAccount");
  });

  it("الاحتياطيات العامة لا تزال تُحلّ (ارتداد مطابق للسابق)", () => {
    expect(PURCHASE).toContain('"purchase_grn_vat", "debit", "1180"');
    expect(PURCHASE).toContain('"purchase_vat_input", "debit", "1180"');
    expect(PURCHASE).toContain('"vat_input_reversal", "credit", "1180"');
  });

  it("سطور القيد تحفظ شكلها: حارس vatAmount>0 والاتجاه (مدين تحميل/دائن عكس)", () => {
    expect(PURCHASE).toContain("accountCode: vatAccount, debit: vatAmount, credit: 0");
    expect(PURCHASE).toContain("accountCode: vatInputCode, debit: vatAmount, credit: 0");
    // عكس على إشعار المورد الدائن: دائن.
    expect(PURCHASE).toContain("accountCode: vatInputCode, debit: 0, credit: vatAmount");
  });
});
