import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpCircle, DollarSign, Calendar, Wallet } from "lucide-react";
import { formatCurrency , formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";

export default function PaymentsPage() {
  const { data, isLoading } = useApiQuery<any>(["payments"], "/finance/payments");
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref"],
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">المدفوعات</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          عرض تجميعي لجميع سندات الصرف — لإنشاء سند جديد استخدم صفحة <a href="/finance/vouchers" className="text-primary underline underline-offset-2">السندات</a>
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card className="bg-red-600 text-white"><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-8 w-8 opacity-80" />
          <div><p className="text-xs opacity-80">إجمالي المدفوعات</p><p className="text-xl font-bold">{formatCurrency(Number(summary.totalPayments || 0))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Wallet className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">عدد العمليات</p><p className="text-xl font-bold">{summary.count || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg"><Calendar className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-xs text-gray-500">المتوسط</p><p className="text-xl font-bold">{summary.count > 0 ? formatCurrency(Math.round(Number(summary.totalPayments) / summary.count)) : "0"}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالوصف أو المرجع...",
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "amount", label: "المبلغ" },
          { key: "date", label: "التاريخ" },
        ], "المدفوعات")}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="ref" label="المرجع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="amount" label="المبلغ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="date" label="التاريخ" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={4} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="p-12 text-center text-gray-400">
                <ArrowUpCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد مدفوعات</p>
              </td></tr>
            ) : (sortedData || []).map((p: any) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-blue-600 text-sm">{p.ref}</td>
                <td className="p-3 font-medium">{p.description || "-"}</td>
                <td className="p-3 font-semibold text-red-600">{formatCurrency(Number(p.amount))}</td>
                <td className="p-3 text-gray-500 text-sm">{p.date ? formatDateAr(p.date) : "-"}</td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div></div>
    </div>
  );
}
