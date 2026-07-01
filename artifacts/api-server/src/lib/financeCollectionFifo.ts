/**
 * financeCollectionFifo — م٣ النواة: تخصيص مبلغ القبض على فواتير العميل المفتوحة.
 *
 * المرجع: docs/finance-audit/25 §٧.٣ (م٣) + §٩.٣ — «تختار العميل + المبلغ، والنظام
 * تلقائيًا يجلب فواتيره المفتوحة + يطبّق FIFO (الأقدم أولًا) + الزائد → دفعة مقدمة».
 *
 * هذه الوحدة **نقية + حتمية** (لا قاعدة بيانات) → قابلة للاختبار بمعزل
 * (tests/unit/financeCollectionFifo.test.ts). الجلب من القاعدة + الترحيل +
 * إطفاء الفواتير + الدفعة المقدمة يبقى في الخدمة (financeCollectionService →
 * postCustomerReceipt المعتمد) — لا ازدواج منطق قيد.
 *
 * المنطق نفسه الذي تحسبه شاشة customer-receipt القديمة على العميل (runFifo)،
 * لكن **على الخادم** ليصبح مصدر الحقيقة قابلاً للاختبار والتحكيم (لا يعتمد على
 * حساب الواجهة وحده) — شرط دمج التحصيل في «قبض» وسحب الصفحة القديمة (م٨).
 */

export type OpenInvoice = {
  invoiceId: number;
  /** المتبقي على الفاتورة = total - paidAmount (موجب). */
  outstanding: number;
  /** تاريخ الفاتورة/الاستحقاق — للترتيب الدفاعي بالأقدم أولًا عند الحاجة. */
  date?: string | null;
};

export type ReceiptApplication = { invoiceId: number; amount: number };

export type FifoAllocation = {
  applications: ReceiptApplication[];
  /** الزائد بعد إطفاء كل الفواتير → يذهب دفعة مقدمة. */
  leftover: number;
  /** إجمالي ما خُصِّص على الفواتير (= amount - leftover). */
  appliedTotal: number;
};

export class CollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionError";
  }
}

const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** ترتيب الفواتير بالأقدم أولًا (دفاعيًا) إن توفّر التاريخ؛ وإلا يُحترم ترتيب المُدخل. */
function oldestFirst(invoices: OpenInvoice[]): OpenInvoice[] {
  const withIdx = invoices.map((inv, i) => ({ inv, i }));
  withIdx.sort((a, b) => {
    const da = a.inv.date ? Date.parse(a.inv.date) : NaN;
    const db = b.inv.date ? Date.parse(b.inv.date) : NaN;
    if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;
    return a.i - b.i; // ثبات: نفس ترتيب المُدخل عند تساوي/غياب التاريخ
  });
  return withIdx.map((x) => x.inv);
}

/**
 * FIFO: خصِّص `amount` على الفواتير المفتوحة بالأقدم أولًا (apply = min(المتبقي،
 * الباقي))، والزائد leftover. نقي + حتمي.
 */
export function allocateReceiptFifo(invoices: OpenInvoice[], amount: number): FifoAllocation {
  const amt = round2(amount);
  if (!(amt > 0)) throw new CollectionError("مبلغ القبض يجب أن يكون أكبر من صفر");

  let remaining = amt;
  const applications: ReceiptApplication[] = [];
  for (const inv of oldestFirst(invoices)) {
    if (remaining <= 0) break;
    const out = round2(inv.outstanding);
    if (!(out > 0)) continue;
    const apply = round2(Math.min(out, remaining));
    if (apply > 0) {
      applications.push({ invoiceId: inv.invoiceId, amount: apply });
      remaining = round2(remaining - apply);
    }
  }
  return { applications, leftover: round2(remaining), appliedTotal: round2(amt - remaining) };
}

/**
 * تخصيص يدوي: يتحقّق أن كل تطبيق ≤ المتبقي على فاتورته، وأن Σ التطبيقات ≤ المبلغ
 * المستلم، وأن لا فاتورة مكرّرة أو خارج القائمة المفتوحة. يُعيد الـapplications
 * المُنقّاة + leftover. (السداد الجزئي مسموح: apply < outstanding.)
 */
export function validateManualApplications(
  invoices: OpenInvoice[],
  applications: ReceiptApplication[],
  amount: number,
): FifoAllocation {
  const amt = round2(amount);
  if (!(amt > 0)) throw new CollectionError("مبلغ القبض يجب أن يكون أكبر من صفر");

  const outstandingById = new Map<number, number>();
  for (const inv of invoices) outstandingById.set(Number(inv.invoiceId), round2(inv.outstanding));

  const seen = new Set<number>();
  const cleaned: ReceiptApplication[] = [];
  let total = 0;
  for (const a of applications) {
    const invoiceId = Number(a.invoiceId);
    const apply = round2(a.amount);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new CollectionError("فاتورة غير صالحة في التخصيص");
    if (seen.has(invoiceId)) throw new CollectionError(`الفاتورة ${invoiceId} مكرّرة في التخصيص`);
    if (!(apply > 0)) continue; // تجاهل التطبيقات الصفرية بصمت
    const out = outstandingById.get(invoiceId);
    if (out == null) throw new CollectionError(`الفاتورة ${invoiceId} ليست ضمن الفواتير المفتوحة`);
    if (apply - out > 0.01) throw new CollectionError(`تخصيص الفاتورة ${invoiceId} (${apply}) يتجاوز المتبقي (${out})`);
    seen.add(invoiceId);
    cleaned.push({ invoiceId, amount: apply });
    total = round2(total + apply);
  }
  if (total - amt > 0.01) throw new CollectionError(`إجمالي التخصيص (${total}) يتجاوز المبلغ المستلم (${amt})`);
  return { applications: cleaned, leftover: round2(amt - total), appliedTotal: total };
}
