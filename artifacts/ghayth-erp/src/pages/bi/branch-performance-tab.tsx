import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function BranchPerformanceTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-branch-perf"], "/bi/reports/branch-performance");
  const rows = (data?.data || []) as any[];

  const columns: DataTableColumn<any>[] = [
    { key: "rank", header: "الترتيب", sortable: true, render: (r) => <Badge variant={r.rank === 1 ? "default" : "outline"}>{r.rank}</Badge> },
    { key: "branchName", header: "الفرع", sortable: true, searchable: true, className: "font-medium", render: (r) => r.branchName },
    { key: "revenue", header: "الإيرادات", sortable: true, className: "text-emerald-600 font-medium", render: (r) => formatNumber(r.revenue) },
    { key: "expenses", header: "المصروفات", sortable: true, className: "text-red-600", render: (r) => formatNumber(r.expenses) },
    { key: "netProfit", header: "صافي الربح", sortable: true, render: (r) => <span className={cn("font-bold", r.netProfit >= 0 ? "text-emerald-700" : "text-red-700")}>{formatNumber(r.netProfit)}</span> },
    { key: "employees", header: "الموظفون", sortable: true, render: (r) => r.employees },
    {
      key: "attendanceRate", header: "نسبة الحضور", sortable: true,
      render: (r) => (
        <div className="flex items-center gap-1">
          <div className="w-16 bg-gray-200 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${r.attendanceRate}%` }} />
          </div>
          <span className="text-xs">{r.attendanceRate}%</span>
        </div>
      ),
    },
    { key: "openTickets", header: "تذاكر مفتوحة", sortable: true, render: (r) => <Badge variant={r.openTickets > 10 ? "destructive" : "outline"}>{r.openTickets}</Badge> },
    { key: "clientSatisfaction", header: "رضا العملاء", sortable: true, render: (r) => r.clientSatisfaction > 0 ? `${r.clientSatisfaction}/5` : "-" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">مقارنة أداء الفروع</h2>
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        rowKey={(r) => r.branchId}
        searchPlaceholder="بحث باسم الفرع..."
        emptyMessage="لا توجد فروع"
        emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
      />

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>مقارنة الإيرادات بالفروع</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rows} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="branchName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => [formatNumber(Number(v)), ""]} />
                <Bar dataKey="revenue" name="الإيرادات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
