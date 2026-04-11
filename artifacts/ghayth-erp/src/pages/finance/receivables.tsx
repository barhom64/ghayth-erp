import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowDownCircle, AlertTriangle, Clock, DollarSign, Eye } from "lucide-react";
import { formatCurrency , formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function ReceivablesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["receivables", scopeQueryString], `/finance/receivables${scopeSuffix}`);
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "clientName"],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">المقبوضات (الذمم المدينة)</h1>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="bg-blue-600 text-white"><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-8 w-8 opacity-80" />
          <div><p className="text-xs opacity-80">إجمالي المستحقات</p><p className="text-xl font-bold">{formatCurrency(Number(summary.totalReceivable || 0))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-xs text-gray-500">المتأخرة</p><p className="text-xl font-bold text-red-600">{formatCurrency(Number(summary.overdueAmount || 0))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Clock className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">عدد الفواتير</p><p className="text-xl font-bold">{summary.count || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><ArrowDownCircle className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">متوسط المبلغ</p><p className="text-xl font-bold">{summary.count > 0 ? formatCurrency(Math.round(Number(summary.totalReceivable) / summary.count)) : "0"}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالرقم أو العميل...",
          statuses: [
            { value: "pending", label: "معلق" },
            { value: "partial", label: "جزئي" },
            { value: "paid", label: "مدفوع" },
            { value: "overdue", label: "متأخر" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "رقم الفاتورة" },
          { key: "clientName", label: "العميل" },
          { key: "total", label: "الإجمالي" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "remainingAmount", label: "المتبقي" },
          { key: "dueDate", label: "الاستحقاق" },
          { key: "status", label: "الحالة" },
        ], "المقبوضات")}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="ref" label="رقم الفاتورة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="clientName" label="العميل" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="total" label="الإجمالي" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="paidAmount" label="المدفوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="remainingAmount" label="المتبقي" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="dueDate" label="الاستحقاق" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <th className="p-3 text-start">إجراءات</th>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={8} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-12 text-center text-gray-400">
                <ArrowDownCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد مستحقات</p>
              </td></tr>
            ) : (sortedData || []).map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-blue-600">{r.ref}</td>
                <td className="p-3 font-medium">{r.clientName || "-"}</td>
                <td className="p-3">{formatCurrency(Number(r.total))}</td>
                <td className="p-3 text-green-600">{formatCurrency(Number(r.paidAmount || 0))}</td>
                <td className="p-3 font-bold text-red-600">{formatCurrency(Number(r.remainingAmount || 0))}</td>
                <td className="p-3 text-gray-500">{r.dueDate ? formatDateAr(r.dueDate) : "-"}</td>
                <td className="p-3"><StatusBadge status={r.status} /></td>
                <td className="p-3">
                  <Link href={`/finance/invoices/${r.id}`}>
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                  </Link>
                </td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div></div>
    </div>
  );
}
