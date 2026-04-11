import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileSignature, DollarSign, AlertTriangle } from "lucide-react";
import { formatCurrency , formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";

export default function CommitmentsPage() {
  const { data, isLoading } = useApiQuery<any>(["commitments"], "/finance/commitments");
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "vendorName"],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const upcomingCount = items.filter((c: any) => {
    if (!c.dueDate) return false;
    const diff = (new Date(c.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">الالتزامات المالية</h1>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card className="bg-orange-600 text-white"><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-8 w-8 opacity-80" />
          <div><p className="text-xs opacity-80">إجمالي الالتزامات</p><p className="text-xl font-bold">{formatCurrency(Number(summary.totalCommitments || 0))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><FileSignature className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">عدد الالتزامات</p><p className="text-xl font-bold">{summary.count || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
          <div><p className="text-xs text-gray-500">خلال 30 يوم</p><p className="text-xl font-bold text-yellow-600">{upcomingCount}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمرجع أو المورد...",
          statuses: [
            { value: "active", label: "نشط" },
            { value: "paid", label: "مدفوع" },
            { value: "overdue", label: "متأخر" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "vendorName", label: "المورد" },
          { key: "amount", label: "المبلغ" },
          { key: "dueDate", label: "تاريخ الاستحقاق" },
          { key: "status", label: "الحالة" },
        ], "الالتزامات")}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="ref" label="المرجع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="vendorName" label="المورد" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="amount" label="المبلغ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="dueDate" label="تاريخ الاستحقاق" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={5} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-12 text-center text-gray-400">
                <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد التزامات</p>
              </td></tr>
            ) : (sortedData || []).map((c: any) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-blue-600 text-sm">{c.ref || `#${c.id}`}</td>
                <td className="p-3 font-medium">{c.vendorName || "-"}</td>
                <td className="p-3 font-semibold">{formatCurrency(Number(c.amount))}</td>
                <td className="p-3 text-gray-500">{c.dueDate ? formatDateAr(c.dueDate) : "-"}</td>
                <td className="p-3"><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div></div>
    </div>
  );
}
