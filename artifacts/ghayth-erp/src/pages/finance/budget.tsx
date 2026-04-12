import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileBarChart, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function BudgetPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["budget", scopeQueryString], `/finance/budget${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["accountName", "accountCode", "period"],
  });

  const totalAllocated = items.reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
  const totalUsed = items.reduce((s: number, b: any) => s + Number(b.used || 0), 0);
  const overBudget = items.filter((b: any) => Number(b.used || 0) > Number(b.amount || 0)).length;

  const columns: DataTableColumn<any>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      sortable: true,
      render: (b) => (
        <>
          <span className="font-mono text-blue-600 text-sm">{b.accountCode}</span>
          <span className="text-gray-500 ms-2 text-sm">{b.accountName || ""}</span>
        </>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      render: (b) => <span className="text-sm">{b.period || "-"}</span>,
    },
    {
      key: "amount",
      header: "المخصص",
      sortable: true,
      render: (b) => <span className="font-medium">{formatCurrency(Number(b.amount || 0))}</span>,
    },
    {
      key: "used",
      header: "المنفق",
      sortable: true,
      render: (b) => <span className="text-red-600">{formatCurrency(Number(b.used || 0))}</span>,
    },
    {
      key: "remaining",
      header: "المتبقي",
      render: (b) => {
        const alloc = Number(b.amount || 0);
        const used = Number(b.used || 0);
        const remaining = alloc - used;
        return (
          <span className="font-semibold" style={{ color: remaining >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(remaining)}
          </span>
        );
      },
    },
    {
      key: "usage",
      header: "الاستخدام",
      width: "160px",
      render: (b) => {
        const alloc = Number(b.amount || 0);
        const used = Number(b.used || 0);
        const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
        const barColor = pct > 100 ? "bg-red-500" : pct > 80 ? "bg-orange-500" : "bg-green-500";
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-xs text-gray-500 w-10 text-start">{formatNumber(pct)}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الميزانية</h1>
        <Link href="/finance/budget/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة بند</Button>
        </Link>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><FileBarChart className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">المخصص</p><p className="text-xl font-bold">{formatCurrency(totalAllocated)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><TrendingUp className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-xs text-gray-500">المنفق</p><p className="text-xl font-bold text-red-600">{formatCurrency(totalUsed)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">المتبقي</p><p className="text-xl font-bold text-green-600">{formatCurrency(totalAllocated - totalUsed)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-xs text-gray-500">تجاوز</p><p className="text-xl font-bold text-orange-600">{formatNumber(overBudget)}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالحساب أو الفترة...",
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "accountCode", label: "رمز الحساب" },
          { key: "accountName", label: "اسم الحساب" },
          { key: "period", label: "الفترة" },
          { key: "amount", label: "المخصص" },
          { key: "used", label: "المنفق" },
        ], "الميزانية")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد بنود ميزانية"
        emptyIcon={<FileBarChart className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </div>
  );
}
