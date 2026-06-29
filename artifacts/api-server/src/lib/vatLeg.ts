// ─────────────────────────────────────────────────────────────────────────────
// vatLeg.ts
//
// البند ٤ (توجيه إبراهيم «ج») — كل نوع ضريبة يذهب إلى حسابه الخاص في القيد.
//
// نفس مبدأ «حساب خاص لكل كيان» المعتمد سابقًا (businessHelpers §Step 3): سطر
// ضريبة المخرجات يُرحَّل إلى حساب رمز الضريبة (`tax_codes.accountId → COA.code`)
// متى ما هُيِّئ، وإلا يرتدّ إلى تعيين الشركة العام (`invoice_vat_payable`). يبقى
// سلوك المستأجرين الذين لم يضبطوا حسابًا للرمز مطابقًا تمامًا للسابق.
//
// وحدة نقية — لا Express ولا قاعدة بيانات. القرار قابل لاختبار assertion على
// سطر القيد دون أي DB (الدستور قاعدة ٣).
// ─────────────────────────────────────────────────────────────────────────────

/** سطر قيد ضريبة المخرجات كما يُمرَّر إلى financialEngine.postJournalEntry. */
export interface VatJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  clientId?: number;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * يختار حساب سطر الضريبة: حساب رمز الضريبة إن كان مُهيّأً (نصًّا غير فارغ)، وإلا
 * الحساب الاحتياطي (تعيين الشركة العام). فارغٌ أو null أو فراغات فقط ⇒ احتياطي.
 *
 *   resolveVatLegAccount("2310", "2131")  → "2310"   // حساب الرمز
 *   resolveVatLegAccount(null,   "2131")  → "2131"   // غير مُهيّأ → عام
 *   resolveVatLegAccount("",     "2131")  → "2131"
 */
export function resolveVatLegAccount(
  taxCodeAccount: string | null | undefined,
  fallbackAccount: string,
): string {
  const specific = typeof taxCodeAccount === "string" ? taxCodeAccount.trim() : "";
  return specific !== "" ? specific : fallbackAccount;
}

/**
 * يبني سطر ضريبة المخرجات (صفر أو سطر واحد) بالاتجاه المطلوب.
 *
 * - `side="credit"` للإصدار/الإشعار المدين (ضريبة مستحقة جديدة).
 * - `side="debit"` لعكس الإشعار الدائن/التعديل (إلغاء ضريبة سابقة).
 * - المبلغ ≤ 0 وبدون `keepZero` ⇒ لا سطر (يطابق حارس `vat > 0 ?` في الإشعارات).
 * - `keepZero=true` ⇒ يُبقي سطرًا صفريًّا (يطابق سطر الاعتماد غير المشروط الحالي).
 *
 * `accountCode` يُحسم مسبقًا عبر resolveVatLegAccount حتى يبقى هذا البناء نقيًّا.
 */
export function buildVatLeg(input: {
  amount: number;
  side: "debit" | "credit";
  accountCode: string;
  clientId?: number;
  keepZero?: boolean;
}): VatJournalLine[] {
  const amount = round2(input.amount);
  if (amount <= 0 && !input.keepZero) return [];
  return [
    {
      accountCode: input.accountCode,
      debit: input.side === "debit" ? amount : 0,
      credit: input.side === "credit" ? amount : 0,
      clientId: input.clientId,
    },
  ];
}
