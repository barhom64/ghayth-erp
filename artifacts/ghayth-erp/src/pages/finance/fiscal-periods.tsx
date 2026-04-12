import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle, Clock, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  active: { icon: CheckCircle, color: "bg-green-100 text-green-700", label: "نشطة" },
  closed: { icon: Lock, color: "bg-gray-100 text-gray-700", label: "مغلقة" },
  future: { icon: Clock, color: "bg-blue-100 text-blue-700", label: "مستقبلية" },
};

export default function FiscalPeriodsPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["fiscal-periods"], "/finance/fiscal-periods");
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, { searchFields: ["name", "period"], statusField: "status" });

  const activeCount = items.filter((p: any) => p.status === "active").length;
  const closedCount = items.filter((p: any) => p.status === "closed").length;

  const columns: DataTableColumn<any>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      className: "font-mono text-blue-600",
      render: (p) => p.period,
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      className: "font-medium",
      render: (p) => p.name,
    },
    {
      key: "entries",
      header: "عدد القيود",
      sortable: true,
      render: (p) => p.entries,
    },
    {
      key: "totalAmount",
      header: "إجمالي الحركات",
      sortable: true,
      className: "font-semibold",
      render: (p) => formatCurrency(Number(p.totalAmount || 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => {
        const s = STATUS_CONFIG[p.status] || STATUS_CONFIG.future;
        return <Badge className={s.color}>{s.label}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">الفترات المالية</h1>

      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Calendar className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي الفترات</p><p className="text-xl font-bold">{items.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">نشطة</p><p className="text-xl font-bold text-green-600">{activeCount}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg"><Lock className="h-5 w-5 text-gray-600" /></div>
          <div><p className="text-xs text-gray-500">مغلقة</p><p className="text-xl font-bold text-gray-600">{closedCount}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الفترة...",
          statuses: [
            { value: "active", label: "نشطة" },
            { value: "closed", label: "مغلقة" },
            { value: "future", label: "مستقبلية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={refetch}
        noToolbar
        rowKey={(p) => p.period}
        rowClassName={(p) => (p.status === "active" ? "bg-green-50/50" : undefined)}
        emptyMessage="لا توجد فترات"
        emptyIcon={<Calendar className="h-10 w-10 opacity-30" />}
        pageSize={20}
      />
    </div>
  );
}
