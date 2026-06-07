import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

export function VendorPerformanceTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-vendor-perf"], "/bi/reports/vendor-performance");
  const rows = (data?.data || []) as any[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const columns: DataTableColumn<any>[] = [
    { key: "vendorName", header: "المورد", sortable: true, searchable: true, className: "font-medium", render: (r) => r.vendorName },
    { key: "totalOrders", header: "عدد الطلبات", sortable: true, render: (r) => r.totalOrders },
    { key: "totalSpend", header: "إجمالي المشتريات", sortable: true, className: "text-status-info-foreground", render: (r) => formatNumber(r.totalSpend) },
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
          r.qualityScore >= 70 ? "bg-status-warning-surface text-status-warning-foreground" :
          "bg-status-error-surface text-status-error-foreground"
        )}>{r.qualityScore}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">أداء الموردين</h2>
        <PrintButton
          entityType="report_bi_vendor_performance"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "تقرير أداء الموردين", total: printRows.length },
            items: printRows.map((r: any) => ({
              "المورد": r.vendorName || "—",
              "إجمالي الطلبيات": r.totalOrders ?? 0,
              "إجمالي القيمة": r.totalValue ?? 0,
              "نسبة التسليم في الوقت": r.onTimeDeliveryRate ?? "—",
              "نسبة الجودة": r.qualityScore ?? "—",
            })),
          })}
        />
      </div>
      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
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
