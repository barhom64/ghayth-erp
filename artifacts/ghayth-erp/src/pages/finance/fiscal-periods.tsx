import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, CheckCircle, Clock, Lock, Search } from "lucide-react";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function FiscalPeriodsPage() {
  const { data, isLoading } = useApiQuery<any>(["fiscal-periods"], "/finance/fiscal-periods");
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = applyFilters(items, filters, { searchFields: ["name", "period"], statusField: "status" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const activeCount = items.filter((p: any) => p.status === "active").length;
  const closedCount = items.filter((p: any) => p.status === "closed").length;

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
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="period" label="الفترة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="entries" label="عدد القيود" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="totalAmount" label="إجمالي الحركات" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(6)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={5} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-12 text-center text-gray-400">
                <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد فترات</p>
              </td></tr>
            ) : (paginatedData || []).map((p: any) => {
              const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
                active: { icon: CheckCircle, color: "bg-green-100 text-green-700", label: "نشطة" },
                closed: { icon: Lock, color: "bg-gray-100 text-gray-700", label: "مغلقة" },
                future: { icon: Clock, color: "bg-blue-100 text-blue-700", label: "مستقبلية" },
              };
              const s = statusConfig[p.status] || statusConfig.future;

              return (
                <tr key={p.period} className={`border-b hover:bg-gray-50 ${p.status === "active" ? "bg-green-50/50" : ""}`}>
                  <td className="p-3 font-mono text-blue-600">{p.period}</td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.entries}</td>
                  <td className="p-3 font-semibold">{formatCurrency(Number(p.totalAmount || 0))}</td>
                  <td className="p-3"><Badge className={s.color}>{s.label}</Badge></td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div></div>
    </div>
  );
}
