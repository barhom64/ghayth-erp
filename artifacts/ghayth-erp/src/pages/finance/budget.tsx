import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileBarChart, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function BudgetPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["budget", scopeQueryString], `/finance/budget${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["accountName", "accountCode", "period"],
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const totalAllocated = items.reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
  const totalUsed = items.reduce((s: number, b: any) => s + Number(b.used || 0), 0);
  const overBudget = items.filter((b: any) => Number(b.used || 0) > Number(b.amount || 0)).length;

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
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "accountCode", label: "رمز الحساب" },
          { key: "accountName", label: "اسم الحساب" },
          { key: "period", label: "الفترة" },
          { key: "amount", label: "المخصص" },
          { key: "used", label: "المنفق" },
        ], "الميزانية")}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="accountCode" label="الحساب" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="period" label="الفترة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="amount" label="المخصص" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="used" label="المنفق" sortState={sortState} onSort={handleSort} />
            <th className="p-3 text-start">المتبقي</th>
            <th className="p-3 text-start">الاستخدام</th>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={6} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-12 text-center text-gray-400">
                <FileBarChart className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد بنود ميزانية</p>
              </td></tr>
            ) : (sortedData || []).map((b: any) => {
              const alloc = Number(b.amount || 0);
              const used = Number(b.used || 0);
              const remaining = alloc - used;
              const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
              const barColor = pct > 100 ? "bg-red-500" : pct > 80 ? "bg-orange-500" : "bg-green-500";

              return (
                <tr key={b.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <span className="font-mono text-blue-600 text-sm">{b.accountCode}</span>
                    <span className="text-gray-500 ms-2 text-sm">{b.accountName || ""}</span>
                  </td>
                  <td className="p-3 text-sm">{b.period || "-"}</td>
                  <td className="p-3 font-medium">{formatCurrency(alloc)}</td>
                  <td className="p-3 text-red-600">{formatCurrency(used)}</td>
                  <td className="p-3 font-semibold" style={{ color: remaining >= 0 ? "#16a34a" : "#dc2626" }}>{formatCurrency(remaining)}</td>
                  <td className="p-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-start">{formatNumber(pct)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      </div></div>
    </div>
  );
}
