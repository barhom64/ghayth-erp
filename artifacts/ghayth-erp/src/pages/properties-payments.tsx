import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { Banknote, CheckCircle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";

export default function PropertiesPayments() {
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data: paymentsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["rent-payments", scopeQueryString],
    `/properties/payments${scopeSuffix}`
  );
  const payments = asList(paymentsResp);
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(payments, filters, {
    searchFields: ["tenantName", "unitNumber"] as any,
    statusField: "status" as any,
    dateField: "dueDate" as any,
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">مدفوعات الإيجار</h1>
          <p className="text-gray-500 text-sm mt-1">متابعة وتسجيل مدفوعات الإيجار</p>
        </div>
        {canManage && (
          <Link href="/properties/payments/new/pay">
            <Button className="gap-2">
              <Banknote className="h-4 w-4" /> تسجيل دفعة
            </Button>
          </Link>
        )}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمستأجر أو الوحدة...",
          statuses: [
            { value: "paid", label: "مدفوع" },
            { value: "pending", label: "معلق" },
            { value: "overdue", label: "متأخر" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "tenantName", label: "المستأجر" },
          { key: "unitNumber", label: "الوحدة" },
          { key: "dueDate", label: "تاريخ الاستحقاق" },
          { key: "amount", label: "المبلغ" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "status", label: "الحالة" },
        ], "المدفوعات")}
        resultCount={sortedData?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-indigo-500" /> مدفوعات الإيجار</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="tenantName" label="المستأجر" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="unitNumber" label="الوحدة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="dueDate" label="تاريخ الاستحقاق" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="amount" label="المبلغ" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="paidAmount" label="المدفوع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                {canManage && <th className="py-3 px-4 text-start text-xs text-gray-500 font-medium">إجراء</th>}
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={canManage ? 7 : 6} emptyMessage="لا توجد مدفوعات" emptyIcon={<Banknote className="h-6 w-6 text-slate-400" />}>
              {sortedData?.map((p: any) => (
                <TableRow key={p.id} className={p.status === 'pending' && new Date(p.dueDate) < new Date() ? "bg-rose-50" : ""}>
                  <TableCell className="font-medium">{p.tenantName}</TableCell>
                  <TableCell>{p.unitNumber || "—"}</TableCell>
                  <TableCell>{formatDateAr(p.dueDate)}</TableCell>
                  <TableCell>{formatCurrency(p.amount || 0)}</TableCell>
                  <TableCell className="text-emerald-600">{formatCurrency(p.paidAmount || 0)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  {canManage && (
                    <TableCell>
                      {p.status !== "paid" && (
                        <Link href={`/properties/payments/${p.id}/pay`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs h-7 text-emerald-600"
                          >
                            <CheckCircle className="h-3 w-3" /> تسجيل
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
