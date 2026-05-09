import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Link } from "wouter";

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    green: "bg-green-50 border-green-100 text-green-700",
    red: "bg-red-50 border-red-100 text-red-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    purple: "bg-purple-50 border-purple-100 text-purple-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <p className="text-xs font-medium opacity-75 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "مدفوعة", cls: "bg-green-100 text-green-700" },
    partial: { label: "مدفوعة جزئياً", cls: "bg-blue-100 text-blue-700" },
    partially_paid: { label: "مدفوعة جزئياً", cls: "bg-blue-100 text-blue-700" },
    pending_approval: { label: "بانتظار الموافقة", cls: "bg-yellow-100 text-yellow-700" },
    approved: { label: "معتمدة", cls: "bg-teal-100 text-teal-700" },
    sent: { label: "مُرسلة", cls: "bg-indigo-100 text-indigo-700" },
    overdue: { label: "متأخرة", cls: "bg-red-100 text-red-700" },
    cancelled: { label: "ملغية", cls: "bg-gray-100 text-gray-600" },
    draft: { label: "مسودة", cls: "bg-gray-100 text-gray-600" },
    rejected: { label: "مرفوضة", cls: "bg-red-100 text-red-700" },
    open: { label: "مفتوح", cls: "bg-blue-100 text-blue-700" },
    in_progress: { label: "قيد التنفيذ", cls: "bg-indigo-100 text-indigo-700" },
    closed: { label: "مغلق", cls: "bg-gray-100 text-gray-600" },
    resolved: { label: "محلول", cls: "bg-green-100 text-green-700" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

export default function Dashboard() {
  const { client } = useAuth();
  const { data, isLoading } = useApiQuery<any>(["portal-dashboard"], "/dashboard");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const financials = data?.financials || {};
  const recentInvoices: any[] = data?.recentInvoices || [];
  const recentTickets: any[] = data?.recentTickets || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">مرحباً، {client?.name}</h1>
        <p className="text-gray-500 text-sm mt-0.5">هذه نظرة عامة على حسابك</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="إجمالي الفواتير"
          value={formatCurrency(Number(financials.totalInvoiced) || 0)}
          sub={`${Number(financials.invoiceCount) || 0} فاتورة`}
          color="blue"
        />
        <StatCard
          label="المدفوع"
          value={formatCurrency(Number(financials.totalPaid) || 0)}
          sub={`${Number(financials.paidCount) || 0} مدفوعة`}
          color="green"
        />
        <StatCard
          label="المستحق"
          value={formatCurrency(Number(financials.totalOutstanding) || 0)}
          sub={`${Number(financials.overdueCount) || 0} متأخرة`}
          color={Number(financials.totalOutstanding) > 0 ? "red" : "green"}
        />
        <StatCard
          label="طلبات مفتوحة"
          value={String(Number(data?.ticketStats?.openCount) || 0)}
          sub="طلب دعم"
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm">آخر الفواتير</h2>
            <Link href="/invoices" className="text-xs text-blue-600 hover:underline">عرض الكل</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">لا توجد فواتير</p>
          ) : (
            <div className="space-y-2">
              {recentInvoices.map((inv: any) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors block">
                    <div>
                      <p className="text-sm font-mono font-medium text-gray-900">{inv.ref}</p>
                      <p className="text-xs text-gray-500">{formatDateShort(inv.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={inv.status} />
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(Number(inv.total || 0))}</span>
                    </div>
                  </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm">آخر الطلبات</h2>
            <Link href="/tickets" className="text-xs text-blue-600 hover:underline">عرض الكل</Link>
          </div>
          {recentTickets.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-3">لا توجد طلبات</p>
              <Link href="/tickets/new" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                  إنشاء طلب جديد
                </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTickets.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.title}</p>
                    <p className="text-xs text-gray-500">{formatDateShort(t.createdAt)}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
