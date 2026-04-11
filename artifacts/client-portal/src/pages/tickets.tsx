import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { formatDateShort } from "@/lib/formatters";
import { Link } from "wouter";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "مفتوح", cls: "bg-blue-100 text-blue-700" },
    in_progress: { label: "قيد التنفيذ", cls: "bg-indigo-100 text-indigo-700" },
    closed: { label: "مغلق", cls: "bg-gray-100 text-gray-600" },
    resolved: { label: "محلول", cls: "bg-green-100 text-green-700" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high: "text-red-600",
    medium: "text-amber-600",
    low: "text-green-600",
    urgent: "text-red-700 font-bold",
  };
  const labels: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة", urgent: "عاجل" };
  return <span className={`text-xs ${map[priority] || "text-gray-500"}`}>{labels[priority] || priority}</span>;
}

const STATUS_OPTIONS = [
  { value: "", label: "جميع الحالات" },
  { value: "open", label: "مفتوح" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "resolved", label: "محلول" },
  { value: "closed", label: "مغلق" },
];

export default function Tickets() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", "15");

  const { data: response, isLoading } = useApiQuery<any>(
    ["portal-tickets", status, String(page)],
    `/tickets?${params.toString()}`
  );

  const tickets: any[] = response?.data || [];
  const total = response?.total || 0;
  const pageSize = 15;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الطلبات</h1>
          <p className="text-gray-500 text-sm">إجمالي {total} طلب</p>
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Link href="/tickets/new">
            <a className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              طلب جديد
            </a>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-4xl mb-3">🎫</p>
          <p className="text-gray-500 text-sm mb-4">لا توجد طلبات</p>
          <Link href="/tickets/new">
            <a className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
              إنشاء طلب جديد
            </a>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {tickets.map((t: any) => (
              <Link key={t.id} href={`/tickets/${t.id}`}>
                <a className="block p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900 text-sm">{t.title}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-400">{t.ref}</span>
                        <span className="text-gray-300">•</span>
                        <PriorityBadge priority={t.priority} />
                        {t.category && <span className="text-xs text-gray-400">{t.category}</span>}
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-400">{formatDateShort(t.createdAt)}</span>
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                </a>
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
