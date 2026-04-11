import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClipboardCheck, Clock, CheckCircle, DollarSign } from "lucide-react";
import { formatCurrency , formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";

export default function FinancialRequestsPage() {
  const { data, isLoading } = useApiQuery<any>(["financial-requests"], "/finance/financial-requests");
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "supplierName", "requestedByName"],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const totalAmount = items.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">الطلبات المالية</h1>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><ClipboardCheck className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي الطلبات</p><p className="text-xl font-bold">{summary.total || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg"><Clock className="h-5 w-5 text-yellow-600" /></div>
          <div><p className="text-xs text-gray-500">قيد الانتظار</p><p className="text-xl font-bold text-yellow-600">{summary.pending || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">موافق عليها</p><p className="text-xl font-bold text-green-600">{summary.approved || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><DollarSign className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(totalAmount)}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمرجع أو مقدم الطلب...",
          statuses: [
            { value: "pending", label: "قيد الانتظار" },
            { value: "approved", label: "موافق عليه" },
            { value: "rejected", label: "مرفوض" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "requestedByName", label: "مقدم الطلب" },
          { key: "supplierName", label: "المورد" },
          { key: "amount", label: "المبلغ" },
          { key: "createdAt", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ], "الطلبات_المالية")}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="ref" label="المرجع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="requestedByName" label="مقدم الطلب" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="supplierName" label="المورد" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="amount" label="المبلغ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={6} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-12 text-center text-gray-400">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد طلبات مالية</p>
              </td></tr>
            ) : (sortedData || []).map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-blue-600 text-sm">{r.ref || `#${r.id}`}</td>
                <td className="p-3 font-medium">{r.requestedByName || "-"}</td>
                <td className="p-3 text-gray-500">{r.supplierName || "-"}</td>
                <td className="p-3 font-semibold">{formatCurrency(Number(r.amount || 0))}</td>
                <td className="p-3 text-gray-500 text-sm">{r.createdAt ? formatDateAr(r.createdAt) : "-"}</td>
                <td className="p-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div></div>
    </div>
  );
}
