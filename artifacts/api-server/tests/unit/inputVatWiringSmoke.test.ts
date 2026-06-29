import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * البند ٤ (جانب المشتريات) — حارس نمط يثبّت أن مواضع ضريبة المدخلات الثلاثة في
 * finance-purchase.ts تشتقّ الحساب عبر resolveCompanyInputVatAccount (حساب الرمز
 * القياسي للشركة) مع الاحتياطي العام — فلا يرتدّ أحدٌ صامتًا إلى الحساب العام وحده.
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

describe("ضريبة المدخلات — توصيل المواضع الثلاثة بحساب رمز الوثيقة ثم القياسي", () => {
  it("المُساعد resolveCompanyInputVatAccount مُعرَّف (الرمز القياسي للشركة)", () => {
    expect(TAXCODES).toContain("export async function resolveCompanyInputVatAccount");
    expect(TAXCODES).toContain("getDefaultTaxCode(companyId)");
    expect(TAXCODES).toContain("getInputVatAccountCode(companyId, def.code)");
    expect(TAXCODES).toContain("resolveVatLegAccount(specific, fallbackAccount)");
  });

  it("المُساعد resolveInputVatAccount يُطبّق الترتُّب: رمز الوثيقة ← القياسي ← العام", () => {
    expect(TAXCODES).toContain("export async function resolveInputVatAccount");
    // رمز الوثيقة أولًا، ثم الارتداد للرمز القياسي للشركة.
    expect(TAXCODES).toContain("getInputVatAccountCode(companyId, code)");
    expect(TAXCODES).toContain("return resolveCompanyInputVatAccount(companyId, fallbackAccount)");
  });

  it("المواضع الثلاثة تستدعي resolveInputVatAccount برمز الوثيقة + الاحتياطي العام", () => {
    // ثلاث استدعاءات: GRN (po.taxCode) + فاتورة مورد (b.taxCode) + إشعار دائن (b.taxCode).
    const calls = PURCHASE.match(/resolveInputVatAccount\(scope\.companyId,/g) ?? [];
    expect(calls.length).toBe(3);
    expect(PURCHASE).toContain("resolveInputVatAccount(scope.companyId, po.taxCode as string | null, vatGeneral)");
    expect(PURCHASE).toContain("resolveInputVatAccount(scope.companyId, b.taxCode, vatInputGeneral)");
  });

  it("الاحتياطيات العامة الثلاثة لا تزال تُحلّ (ارتداد مطابق للسابق)", () => {
    expect(PURCHASE).toContain('"purchase_grn_vat", "debit", "1180"');
    expect(PURCHASE).toContain('"purchase_vat_input", "debit", "1180"');
    expect(PURCHASE).toContain('"vat_input_reversal", "credit", "1180"');
  });

  it("سطور القيد تحفظ شكلها: حارس vatAmount>0 والاتجاه (مدين تحميل/دائن عكس)", () => {
    // تحميل ضريبة المدخلات: مدين (GRN + فاتورة مورد).
    expect(PURCHASE).toContain("accountCode: vatAccount, debit: vatAmount, credit: 0");
    expect(PURCHASE).toContain("accountCode: vatInputCode, debit: vatAmount, credit: 0");
    // عكس على إشعار المورد الدائن: دائن.
    expect(PURCHASE).toContain("accountCode: vatInputCode, debit: 0, credit: vatAmount");
  });
});
