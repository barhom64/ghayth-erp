/**
 * financeCollectionService — م٣: تحصيل العميل داخل «قبض» (مطابقة آلية).
 *
 * المرجع: docs/25 §٧.٣ (م٣) + §٩.٣. يجلب فواتير العميل المفتوحة (الأقدم أولًا)،
 * يحسب التخصيص على الخادم (FIFO أو يدوي مُتحقَّق منه)، ثم يُرحّل عبر **محرّك
 * postCustomerReceipt المعتمد** (لا ازدواج قيد): مدين المال / دائن ذمم العميل لكل
 * فاتورة + دائن دفعات مقدمة للزائد، مع إطفاء الفواتير وتحديث أرصدتها.
 *
 * هذا يُعيد استخدام كل ما في customerReceiptService؛ الجديد فقط: **الجلب +
 * FIFO على الخادم** (كان يُحسب على الواجهة وحدها) ليصبح مصدر الحقيقة قابلاً
 * للاختبار والتحكيم — شرط دمج التحصيل في «قبض» وسحب الصفحة القديمة (م٨).
 */

import { rawQuery } from "./rawdb.js";
import { roundTo2 } from "./businessHelpers.js";
import {
  allocateReceiptFifo,
  validateManualApplications,
  type OpenInvoice,
  type ReceiptApplication,
  type FifoAllocation,
} from "./financeCollectionFifo.js";
import type { CustomerReceiptResult } from "./customerReceiptService.js";

/** حالات الفاتورة «المفتوحة» القابلة للتحصيل — تطابق ما تجلبه شاشة قبض القديمة. */
const OPEN_STATUSES = ["sent", "partial", "partially_paid", "overdue"];

export type OpenInvoiceRow = {
  invoiceId: number;
  ref: string | null;
  outstanding: number;
  total: number;
  paidAmount: number;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
};

/** جلب فواتير العميل المفتوحة (المتبقي > 0)، الأقدم أولًا، معزولة بالشركة. */
export async function fetchOpenInvoices(companyId: number, clientId: number): Promise<OpenInvoiceRow[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT i.id AS "invoiceId", i.ref,
            i.total, COALESCE(i."paidAmount", 0) AS "paidAmount",
            (i.total - COALESCE(i."paidAmount", 0)) AS outstanding,
            i.status, i."createdAt" AS "issueDate", i."dueDate"
       FROM invoices i
      WHERE i."companyId" = $1 AND i."clientId" = $2
        AND i."deletedAt" IS NULL
        AND i.status = ANY($3::text[])
        AND (i.total - COALESCE(i."paidAmount", 0)) > 0.005
      ORDER BY i."createdAt" ASC, i.id ASC`,
    [companyId, clientId, OPEN_STATUSES],
  );
  return rows.map((r) => ({
    invoiceId: Number(r.invoiceId),
    ref: (r.ref as string | null) ?? null,
    outstanding: roundTo2(Number(r.outstanding)),
    total: roundTo2(Number(r.total)),
    paidAmount: roundTo2(Number(r.paidAmount)),
    status: String(r.status),
    issueDate: (r.issueDate as string | null) ?? null,
    dueDate: (r.dueDate as string | null) ?? null,
  }));
}

const toOpenInvoice = (r: OpenInvoiceRow): OpenInvoice => ({ invoiceId: r.invoiceId, outstanding: r.outstanding, date: r.issueDate });

/** يحسب التخصيص: يدوي (إن مُرِّر) أو FIFO تلقائي. نقي فوق الصفوف المجلوبة. */
function computeAllocation(rows: OpenInvoiceRow[], amount: number, manual?: ReceiptApplication[]): FifoAllocation {
  const open = rows.map(toOpenInvoice);
  return manual && manual.length > 0
    ? validateManualApplications(open, manual, amount)
    : allocateReceiptFifo(open, amount);
}

export type CollectionPreview = {
  openInvoices: OpenInvoiceRow[];
  totalOutstanding: number;
  allocation: FifoAllocation;
};

/** معاينة (قراءة فقط): الفواتير المفتوحة + التخصيص المقترح + الزائد. لا ترحيل. */
export async function previewCollection(p: {
  companyId: number;
  clientId: number;
  amount: number;
  applications?: ReceiptApplication[];
}): Promise<CollectionPreview> {
  const openInvoices = await fetchOpenInvoices(p.companyId, p.clientId);
  const allocation = computeAllocation(openInvoices, p.amount, p.applications);
  const totalOutstanding = roundTo2(openInvoices.reduce((s, r) => s + r.outstanding, 0));
  return { openInvoices, totalOutstanding, allocation };
}

export type PostCollectionParams = {
  companyId: number;
  branchId: number;
  createdBy: number;
  clientId: number;
  amount: number;
  method: string;
  cashAccountCode?: string | null;
  receiptKey: string;
  receivedDate?: string;
  reference?: string | null;
  notes?: string | null;
  dims?: Record<string, number | string>;
  /** تخصيص يدوي يَجُبّ FIFO (السداد الجزئي/الانتقائي). غيابه = FIFO تلقائي. */
  applications?: ReceiptApplication[];
  assertBranchAccess?: (documentBranchId: number) => void;
};

export type PostCollectionResult = CustomerReceiptResult & { allocation: FifoAllocation };

/**
 * يجلب الفواتير المفتوحة + يحسب التخصيص (FIFO/يدوي) + يُرحّل عبر postCustomerReceipt
 * (إطفاء الفواتير + الدفعة المقدمة للزائد + القيد المتوازن، ذرّيًا وidempotent عبر
 * receiptKey). محرّك القبض يتحقّق ثانيةً من كل تطبيق ≤ المتبقي داخل معاملته.
 */
export async function postCollection(p: PostCollectionParams): Promise<PostCollectionResult> {
  const openInvoices = await fetchOpenInvoices(p.companyId, p.clientId);
  const allocation = computeAllocation(openInvoices, p.amount, p.applications);

  const { postCustomerReceipt } = await import("./customerReceiptService.js");
  const result = await postCustomerReceipt({
    companyId: p.companyId,
    branchId: p.branchId,
    createdBy: p.createdBy,
    clientId: p.clientId,
    amount: p.amount,
    method: p.method,
    cashAccountCode: p.cashAccountCode ?? null,
    receiptKey: p.receiptKey,
    receivedDate: p.receivedDate,
    reference: p.reference ?? null,
    notes: p.notes ?? null,
    applications: allocation.applications,
    dims: p.dims,
    assertBranchAccess: p.assertBranchAccess,
  });
  return { ...result, allocation };
}
