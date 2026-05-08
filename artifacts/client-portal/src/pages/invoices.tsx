import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Link } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "مدفوعة", cls: "bg-green-100 text-green-700" },
    pending: { label: "معلقة", cls: "bg-yellow-100 text-yellow-700" },
    overdue: { label: "متأخرة", cls: "bg-red-100 text-red-700" },
    cancelled: { label: "ملغية", cls: "bg-gray-100 text-gray-600" },
    draft: { label: "مسودة", cls: "bg-gray-100 text-gray-600" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

const STATUS_OPTIONS = [
  { value: "", label: "جميع الحالات" },
  { value: "paid", label: "مدفوعة" },
  { value: "pending", label: "معلقة" },
  { value: "overdue", label: "متأخرة" },
  { value: "cancelled", label: "ملغية" },
];

export default function Invoices() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", "15");

  const { data: response, isLoading } = useApiQuery<any>(
    ["portal-invoices", status, String(page)],
    `/invoices?${params.toString()}`
  );

  const invoices: any[] = response?.data || [];
  const total = response?.total || 0;
  const pageSize = 15;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الفواتير</h1>
          <p className="text-gray-500 text-sm">إجمالي {total} فاتورة</p>
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">📄</p>
          <p className="text-gray-500 text-sm">لا توجد فواتير</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {invoices.map((inv: any) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors block">
                  <div>
                    <p className="font-mono font-semibold text-gray-900 text-sm">{inv.ref}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-gray-500">{formatDateShort(inv.createdAt)}</p>
                      {inv.dueDate && (
                        <p className="text-xs text-gray-400">تاريخ الاستحقاق: {formatDateShort(inv.dueDate)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={inv.status} />
                    <div className="text-left">
                      <p className="font-bold text-gray-900 text-sm">{formatCurrency(Number(inv.total || 0))}</p>
                      {Number(inv.paidAmount) > 0 && (
                        <p className="text-xs text-gray-500">مدفوع: {formatCurrency(Number(inv.paidAmount))}</p>
                      )}
                    </div>
                  </div>
                </Link>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            السابق
          </button>
          <span className="text-sm text-gray-600">صفحة {page} من {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
