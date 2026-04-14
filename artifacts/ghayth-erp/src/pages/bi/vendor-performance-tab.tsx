import { useApiQuery } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";

export function VendorPerformanceTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-vendor-perf"], "/bi/reports/vendor-performance");
  const rows = (data?.data || []) as any[];

  const columns: DataTableColumn<any>[] = [
    { key: "vendorName", header: "المورد", sortable: true, searchable: true, className: "font-medium", render: (r) => r.vendorName },
    { key: "totalOrders", header: "عدد الطلبات", sortable: true, render: (r) => r.totalOrders },
    { key: "totalSpend", header: "إجمالي المشتريات", sortable: true, className: "text-blue-600", render: (r) => formatNumber(r.totalSpend) },
    { key: "avgOrderValue", header: "متوسط الطلب", sortable: true, render: (r) => formatNumber(r.avgOrderValue) },
    {
      key: "onTimeDeliveryRate", header: "معدل الالتزام بالمواعيد", sortable: true,
      render: (r) => (
        <div className="flex items-center gap-1">
          <div className="w-16 bg-gray-200 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${r.onTimeDeliveryRate}%` }} />
          </div>
          <span className="text-xs">{r.onTimeDeliveryRate}%</span>
        </div>
      ),
    },
    { key: "returnRate", header: "معدل الإرجاع", sortable: true, render: (r) => <Badge variant={r.returnRate > 10 ? "destructive" : "outline"}>{r.returnRate}%</Badge> },
    {
      key: "qualityScore", header: "نقاط الجودة", sortable: true,
      render: (r) => (
        <Badge className={cn(
          r.qualityScore >= 90 ? "bg-emerald-100 text-emerald-700" :
          r.qualityScore >= 70 ? "bg-amber-100 text-amber-700" :
          "bg-red-100 text-red-700"
        )}>{r.qualityScore}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">أداء الموردين</h2>
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        rowKey={(r) => r.vendorId}
        searchPlaceholder="بحث باسم المورد..."
        emptyMessage="لا توجد بيانات موردين"
        emptyIcon={<BarChart3 className="h-6 w-6 text-slate-400" />}
      />
    </div>
  );
}
