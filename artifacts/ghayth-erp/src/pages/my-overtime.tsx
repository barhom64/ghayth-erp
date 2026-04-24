import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Timer, Clock, CheckCircle2,
  DollarSign,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "معلق", color: "text-yellow-600 bg-yellow-50" },
  approved: { label: "معتمد", color: "text-green-600 bg-green-50" },
  rejected: { label: "مرفوض", color: "text-red-600 bg-red-50" },
  paid: { label: "مدفوع", color: "text-blue-600 bg-blue-50" },
};

const multiplierLabels: Record<string, string> = {
  "1.25": "عادي ×1.25",
  "1.50": "ليلي ×1.50",
  "1.5": "ليلي ×1.50",
  "2.00": "عطلة ×2.00",
  "2": "عطلة ×2.00",
};


const overtimeColumns: DataTableColumn<any>[] = [
  { key: "overtimeNumber", header: "الرقم", render: (r) => `#${r.overtimeNumber || r.id}`, ltr: true },
  { key: "date", header: "التاريخ", sortable: true, searchable: true, render: (r) => formatDateAr(r.date) },
  { key: "startTime", header: "من", render: (r) => r.startTime || "—" },
  { key: "endTime", header: "إلى", render: (r) => r.endTime || "—" },
  { key: "hours", header: "الساعات", sortable: true, render: (r) => <span className="font-medium">{Number(r.hours || 0).toFixed(1)} س</span> },
  {
    key: "multiplier", header: "المضاعف",
    render: (r) => {
      const mult = String(r.multiplier ?? "1.25");
      return multiplierLabels[mult] || `×${mult}`;
    },
  },
  { key: "totalAmount", header: "المبلغ", sortable: true, render: (r) => <span className="font-medium text-emerald-600">{formatCurrency(r.totalAmount)}</span> },
  {
    key: "status", header: "الحالة", searchable: true,
    render: (r) => {
      const cfg = statusConfig[r.status] ?? { label: r.status, color: "text-gray-600 bg-gray-50" };
      return <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", cfg.color)}>{cfg.label}</span>;
    },
  },
];

export default function MyOvertime() {
  const today = new Date();
  const [month, setMonth] = useState(today.toISOString().slice(0, 7));

  const { data, isLoading, isError } = useApiQuery<any>(
    ["my-overtime", month],
    `/hr/overtime/my?month=${month}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const records: any[] = data?.data ?? [];

  const totalHours = records.reduce((s: number, r: any) => s + Number(r.hours || 0), 0);
  const totalAmount = records.reduce((s: number, r: any) => s + Number(r.totalAmount || 0), 0);
  const approvedCount = records.filter((r: any) => r.status === "approved" || r.status === "paid").length;
  const pendingCount = records.filter((r: any) => r.status === "pending").length;

  return (
    <PageShell title="ساعاتي الإضافية" subtitle="متابعة ساعات العمل الإضافية والتعويضات">
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-700">الشهر:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "إجمالي الساعات", value: totalHours.toFixed(1), icon: Clock, color: "text-blue-600 bg-blue-50" },
          { label: "معتمدة", value: approvedCount, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "معلقة", value: pendingCount, icon: Timer, color: "text-yellow-600 bg-yellow-50" },
          { label: "إجمالي التعويض", value: `${formatCurrency(totalAmount)}`, icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-2", stat.color)}>
                  <Icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTable
        columns={overtimeColumns}
        data={records}
        emptyMessage="لا توجد سجلات وقت إضافي لهذا الشهر"
        emptyIcon={<Timer size={36} className="opacity-40" />}
        searchPlaceholder="بحث..."
        statusOptions={Object.entries(statusConfig).map(([value, { label }]) => ({ value, label }))}
        pageSize={31}
        caption={records.length > 0 ? (
          <div className="flex justify-between items-center rounded-lg border p-3 bg-gray-50/50">
            <span className="text-sm font-medium text-gray-600">الإجمالي للشهر</span>
            <div className="flex gap-6">
              <span className="text-sm"><span className="font-bold">{totalHours.toFixed(1)}</span> ساعة</span>
              <span className="text-sm font-bold text-emerald-600">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        ) : undefined}
      />
    </PageShell>
  );
}
