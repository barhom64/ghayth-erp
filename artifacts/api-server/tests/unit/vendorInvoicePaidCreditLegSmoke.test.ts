/**
 * اختبار assertion على سطور القيد — يربط إصلاح parsing لـ`paid` بالنتيجة المحاسبية.
 *
 * `paid` في فاتورة المورد يحدّد **الطرف الدائن** للقيد (vendorInvoiceJournalPlan.ts:112):
 *   paid=true  → الطرف الدائن = مصدر الصرف (الخزنة/البنك)
 *   paid=false → الطرف الدائن = ذمة المورد (آجل، 2111)
 *
 * فخّ z.coerce.boolean() كان يحوّل السلسلة "false" إلى true، فيرحّل فاتورةً آجلة
 * على أنها مدفوعة (دائن خاطئ = مصدر الصرف بدل ذمة المورد). هذا اختبار assertion
 * يثبت السلسلة كاملة بعد الإصلاح: "false" نصًّا → false → الطرف الدائن = ذمة المورد،
 * مع بقاء القيد متوازنًا (Σمدين = Σدائن) في الحالتين.
 */
import { describe, it, expect } from "vitest";
import { buildVendorInvoiceLines, type ExpenseEntityLink } from "../../src/lib/vendorInvoiceJournalPlan.js";
import { zCoerceBoolean } from "../../src/lib/zodCoerce.js";

const AP = "2111"; // ذمة المورد (purchase_vendor_ap)
const SOURCE = "1110"; // مصدر الصرف (خزنة)
const EXPENSE = "5101"; // حساب مصروف البند

const baseInput = (paid: boolean, sourceAccountCode: string | null) => ({
  lines: [{ expenseAccountCode: EXPENSE, baseAmount: 1000, vatAmount: 0, entityLink: {} as ExpenseEntityLink }],
  paid,
  sourceAccountCode,
  apAccountCode: AP,
  vatInputAccountCode: null,
  totalWithVat: 1000,
  vendorId: 7,
});

const creditLeg = (lines: ReturnType<typeof buildVendorInvoiceLines>) =>
  lines.find((l) => l.role === "source")!;

const sum = (lines: ReturnType<typeof buildVendorInvoiceLines>, k: "debit" | "credit") =>
  lines.reduce((s, l) => s + Number(l[k]), 0);

describe("vendor invoice — paid drives the credit leg (ledger assertion)", () => {
  it("paid=true → credit leg posts to the money SOURCE, not AP", () => {
    const lines = buildVendorInvoiceLines(baseInput(true, SOURCE));
    expect(creditLeg(lines).accountCode).toBe(SOURCE);
    expect(creditLeg(lines).credit).toBe(1000);
    // القيد متوازن
    expect(sum(lines, "debit")).toBe(sum(lines, "credit"));
  });

  it("paid=false (آجل) → credit leg posts to the supplier PAYABLE (AP), not the source", () => {
    const lines = buildVendorInvoiceLines(baseInput(false, null));
    expect(creditLeg(lines).accountCode).toBe(AP);
    expect(creditLeg(lines).credit).toBe(1000);
    expect(sum(lines, "debit")).toBe(sum(lines, "credit"));
  });

  it("END-TO-END footgun proof: string \"false\" → false → credit leg = AP (NOT the source)", () => {
    // قبل الإصلاح: zCoerceBoolean ما كان موجودًا و z.coerce.boolean("false")===true
    // فيُرحَّل القيد على مصدر الصرف خطأً. بعد الإصلاح: "false" → false → ذمة المورد.
    const paid = zCoerceBoolean().parse("false");
    expect(paid).toBe(false);
    const lines = buildVendorInvoiceLines(baseInput(paid, null));
    expect(creditLeg(lines).accountCode).toBe(AP); // الطرف الدائن الصحيح للآجل
    expect(creditLeg(lines).accountCode).not.toBe(SOURCE);
    expect(sum(lines, "debit")).toBe(sum(lines, "credit"));
  });
});
