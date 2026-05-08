import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { formatCurrency, formatDateAr, formatDateShort } from "@/lib/formatters";
import { useRoute, Link } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "مدفوعة", cls: "bg-green-100 text-green-700 border-green-200" },
    partial: { label: "جزئية", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    pending: { label: "معلقة", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    overdue: { label: "متأخرة", cls: "bg-red-100 text-red-700 border-red-200" },
    cancelled: { label: "ملغية", cls: "bg-gray-100 text-gray-600 border-gray-200" },
    draft: { label: "مسودة", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`text-sm font-medium px-3 py-1 rounded-full border ${s.cls}`}>{s.label}</span>;
}

function PaymentModal({ invoice, onClose, onSuccess }: { invoice: any; onClose: () => void; onSuccess: () => void }) {
  const remaining = Math.max(0, Number(invoice.total || 0) - Number(invoice.paidAmount || 0));
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState("online");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePay = async () => {
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/invoices/${invoice.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), method }),
      });
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "حدث خطأ أثناء الدفع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-bold text-gray-900 mb-1">دفع الفاتورة</h2>
        <p className="text-sm text-gray-500 mb-5">الرقم: {invoice.ref}</p>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 flex justify-between text-sm">
            <span className="text-gray-500">المتبقي</span>
            <span className="font-bold text-red-700">{formatCurrency(remaining)}</span>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">المبلغ</label>
            <input
              type="number"
              min="0"
              max={remaining}
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">طريقة الدفع</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="online">دفع إلكتروني</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="cash">نقداً</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handlePay}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "جاري المعالجة..." : "تأكيد الدفع"}
          </button>
          <button onClick={onClose} className="px-4 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id || "";
  const { data: invoice, isLoading, refetch } = useApiQuery<any>(["portal-invoice", id], `/invoices/${id}`, !!id);
  const [showPayment, setShowPayment] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-32" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-4xl mb-2">😕</p>
        <p>الفاتورة غير موجودة</p>
        <Link href="/invoices" className="text-blue-600 text-sm hover:underline mt-2 block">العودة للفواتير</Link>
      </div>
    );
  }

  const items: any[] = (invoice.items || []).filter((i: any) => i && i.description);
  const remaining = Math.max(0, Number(invoice.total || 0) - Number(invoice.paidAmount || 0));
  const canPay = remaining > 0 && !['cancelled', 'draft'].includes(invoice.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/invoices" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            الفواتير
          </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 font-mono text-sm font-semibold">{invoice.ref}</span>
      </div>

      {paidSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          تم تسجيل الدفعة بنجاح
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono">{invoice.ref}</h1>
            <p className="text-sm text-gray-500 mt-1">تاريخ الإنشاء: {formatDateAr(invoice.createdAt)}</p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 rounded-lg p-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
            <p className="font-bold text-gray-900">{formatCurrency(Number(invoice.total || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">المدفوع</p>
            <p className="font-bold text-green-700">{formatCurrency(Number(invoice.paidAmount || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">المتبقي</p>
            <p className="font-bold text-red-700">{formatCurrency(remaining)}</p>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="text-xs text-gray-500 mb-1">تاريخ الاستحقاق</p>
              <p className="font-medium text-sm text-gray-900">{formatDateShort(invoice.dueDate)}</p>
            </div>
          )}
          {invoice.issueDate && (
            <div>
              <p className="text-xs text-gray-500 mb-1">تاريخ الإصدار</p>
              <p className="font-medium text-sm text-gray-900">{formatDateShort(invoice.issueDate)}</p>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">بنود الفاتورة</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="text-start px-3 py-2 rounded-tr-lg">البيان</th>
                    <th className="text-center px-3 py-2">الكمية</th>
                    <th className="text-center px-3 py-2">سعر الوحدة</th>
                    <th className="text-start px-3 py-2 rounded-tl-lg">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">{item.description}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.qty || 1}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{formatCurrency(Number(item.unitPrice || 0))}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{formatCurrency(Number(item.total || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-gray-700">الإجمالي</td>
                    <td className="px-3 py-2 font-bold text-gray-900">{formatCurrency(Number(invoice.total || 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {invoice.notes && (
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs font-medium text-blue-700 mb-1">ملاحظات</p>
            <p className="text-sm text-blue-900">{invoice.notes}</p>
          </div>
        )}

        <div className="flex items-center gap-3 justify-end flex-wrap">
          {canPay && (
            <button
              onClick={() => { setShowPayment(true); setPaidSuccess(false); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              دفع الآن
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            طباعة
          </button>
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          invoice={invoice}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            setPaidSuccess(true);
            refetch();
          }}
        />
      )}
    </div>
  );
}
