// vendorInvoiceJournalPlan.ts
//
// FIN-P11-VENDOR-INVOICE-WORKSPACE (#2241) — **المُجمِّع المشترك لقيد فاتورة المورد.**
//
// مصدر واحد لشكل سطور قيد فاتورة المورد (فاتورة شراء متعددة البنود)، يستخدمه:
//   • مسار الحفظ      POST /finance/vendor-invoices                (يُجمِّع ثم يُرحِّل)
//   • مسار المعاينة   POST /finance/vendor-invoices/impact-preview (يُجمِّع ثم يُقيّم بلا كتابة DB)
//
// فاتورة المورد مختلفة عن قيد المصروف الواحد: لها **عدّة بنود مدينة** (سطر مصروف/أصل
// لكل بند) + ضريبة مدخلات (إن وُجدت) + **طرف دائن واحد** هو ذمة المورد (آجل) أو
// مصدر الصرف (مدفوع). كل سطر يحمل `vendorId` (المورد = suppliers.id المعتمد).
//
// القاعدة المعمارية (من #2238/#2241): **لا تكرار منطق القيد** — البابان يستدعيان
// `buildVendorInvoiceLines`، وكلاهما يُقيَّم عبر `evaluateVendorInvoicePlan` الذي
// يلفّ `evaluateExpensePlan` (توازن + وجود الحساب + عقد البُعد #2233). دوال نقية
// بلا I/O — قابلة للاختبار وحدةً دون قاعدة بيانات. الواجهة/الذاكرة لا تحمل كود GL
// أبدًا؛ المحرّك المالي يحلّ `accountPurpose` (نص) إلى الحساب الحقيقي.

import {
  buildExpenseEntityLink,
  evaluateExpensePlan,
  type ExpenseEntityLink,
  type ExpenseLinkInput,
  type ExpensePlanEvaluation,
} from "./expenseJournalPlan.js";

// أعِد تصدير بنّاء رابط الكيان حتى يستهلكه المُستدعي من المصدر نفسه (لا نسخ).
export { buildExpenseEntityLink };
export type { ExpenseEntityLink, ExpenseLinkInput, ExpensePlanEvaluation };

/** دور السطر في قيد فاتورة المورد — يستخدمه عرض المعاينة لاشتقاق التسمية والسبب. */
export type VendorInvoiceLineRole = "expense" | "vat_input" | "source";

export interface PlannedVendorInvoiceLine extends Record<string, unknown> {
  accountCode: string;
  debit: number;
  credit: number;
  role: VendorInvoiceLineRole;
}

/** بند واحد من بنود الفاتورة بعد حلّ حسابه (accountPurpose → كود GL) + أبعاده. */
export interface VendorInvoiceLineInput {
  /** كود حساب المصروف/الأصل بعد حلّ accountPurpose عبر المحرّك المالي. */
  expenseAccountCode: string;
  baseAmount: number;
  vatAmount?: number;
  /** أبعاد السطر المسطّحة (بما فيها vendorId) — مخرجات buildExpenseEntityLink. */
  entityLink: ExpenseEntityLink;
}

export interface BuildVendorInvoiceLinesInput {
  lines: VendorInvoiceLineInput[];
  /** مدفوعة؟ صحيح → الطرف الدائن هو مصدر الصرف؛ خطأ → ذمة المورد (آجل). */
  paid: boolean;
  /** مصدر الصرف (الخزنة/البنك) — مطلوب عند paid=true، ممنوع عند paid=false. */
  sourceAccountCode?: string | null;
  /** حساب ذمة المورد (purchase_vendor_ap → 2111) — الطرف الدائن عند الآجل. */
  apAccountCode: string;
  /** حساب ضريبة المدخلات (vat_input → 1180) — لسطر الضريبة المجمّع. */
  vatInputAccountCode?: string | null;
  /** إجمالي الفاتورة شامل الضريبة — قيمة الطرف الدائن الواحد. */
  totalWithVat: number;
  /** المورد المعتمد (suppliers.id) — يُختَم على كل سطر بلا استثناء. */
  vendorId: number;
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * يُجمِّع سطور قيد فاتورة المورد:
 *   1) سطر مدين لكل بند (دور "expense") بحساب البند المحلول + أبعاده.
 *   2) سطر مدين واحد لضريبة المدخلات المجمّعة (دور "vat_input") إن وُجدت ضريبة.
 *   3) **سطر دائن واحد** (دور "source"): ذمة المورد (paid=false) أو مصدر الصرف
 *      (paid=true)، بقيمة الإجمالي شامل الضريبة.
 * يُختَم vendorId على **كل** سطر (المصروف/الضريبة/الطرف الدائن) فيظلّ تقرير
 * المورد كاملًا. دالة نقية — تُنتج مصفوفة قابلة للترحيل أو للمعاينة.
 */
export function buildVendorInvoiceLines(
  input: BuildVendorInvoiceLinesInput,
): PlannedVendorInvoiceLine[] {
  const lines: PlannedVendorInvoiceLine[] = [];
  let totalVat = 0;

  // 1) سطر مدين لكل بند.
  for (const item of input.lines) {
    const vat = Number(item.vatAmount) || 0;
    totalVat = round2(totalVat + vat);
    lines.push({
      accountCode: item.expenseAccountCode,
      debit: round2(Number(item.baseAmount) || 0),
      credit: 0,
      ...item.entityLink,
      vendorId: input.vendorId,
      role: "expense",
    });
  }

  // 2) سطر ضريبة المدخلات المجمّع (إن وُجدت ضريبة + حساب ضريبة).
  if (totalVat > 0 && input.vatInputAccountCode) {
    lines.push({
      accountCode: input.vatInputAccountCode,
      debit: totalVat,
      credit: 0,
      vendorId: input.vendorId,
      role: "vat_input",
    });
  }

  // 3) الطرف الدائن الواحد: ذمة المورد (آجل) أو مصدر الصرف (مدفوع).
  const creditAccount = input.paid
    ? (input.sourceAccountCode ?? "")
    : input.apAccountCode;
  lines.push({
    accountCode: creditAccount,
    debit: 0,
    credit: round2(Number(input.totalWithVat) || 0),
    vendorId: input.vendorId,
    role: "source",
  });

  return lines;
}

/**
 * يُقيّم خطة قيد فاتورة المورد قبل الترحيل (بلا كتابة DB) — يلفّ
 * `evaluateExpensePlan` فيرث منه التوازن + وجود الحساب القابل للترحيل
 * (`knownAccountCodes` يُحقَن من المُستدعي) + عقد البُعد (#2233). دالة نقية.
 */
export function evaluateVendorInvoicePlan(args: {
  lines: Array<Record<string, any>>;
  knownAccountCodes?: Set<string> | null;
}): ExpensePlanEvaluation {
  return evaluateExpensePlan({ lines: args.lines, knownAccountCodes: args.knownAccountCodes });
}
