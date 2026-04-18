import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageStatusBadge } from "@/components/page-status-badge";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { Banknote, CheckCircle, DollarSign, AlertTriangle, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

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
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const filtered = applyFilters(payments, filters, {
    searchFields: ["tenantName", "unitNumber"] as any,
    statusField: "status" as any,
    dateField: "dueDate" as any,
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "tenantName", header: "المستأجر", sortable: true, className: "font-medium" },
    { key: "unitNumber", header: "الوحدة", sortable: true, render: (p) => p.unitNumber || "—" },
    { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (p) => formatDateAr(p.dueDate) },
    { key: "amount", header: "المبلغ", sortable: true, render: (p) => formatCurrency(p.amount || 0) },
    { key: "paidAmount", header: "المدفوع", sortable: true, className: "text-emerald-600", render: (p) => formatCurrency(p.paidAmount || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "action",
      header: "إجراء",
      hidden: !canManage,
      render: (p) => (
        p.status !== "paid" ? (
          <Link href={`/properties/payments/${p.id}/pay`}>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs h-7 text-emerald-600"
            >
              <CheckCircle className="h-3 w-3" /> تسجيل
            </Button>
          </Link>
        ) : null
      ),
    },
  ];

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

      <KpiGrid items={[
        { label: "إجمالي المدفوعات", value: payments.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
        { label: "مدفوع", value: payments.filter((p: any) => p.status === "paid").length, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
        { label: "متأخر", value: payments.filter((p: any) => p.status === "overdue").length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
        { label: "إجمالي المبلغ", value: formatCurrency(payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0)), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

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
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "tenantName", label: "المستأجر" },
          { key: "unitNumber", label: "الوحدة" },
          { key: "dueDate", label: "تاريخ الاستحقاق" },
          { key: "amount", label: "المبلغ" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "status", label: "الحالة" },
        ], "المدفوعات")}
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="rent_payment"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["rent-payments"]]}
        actions={["export"]}
        csvColumns={[
          { key: "tenantName", label: "المستأجر" },
          { key: "unitNumber", label: "الوحدة" },
          { key: "dueDate", label: "تاريخ الاستحقاق" },
          { key: "amount", label: "المبلغ" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="المدفوعات"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-indigo-500" /> مدفوعات الإيجار</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مدفوعات"
            emptyIcon={<Banknote className="h-6 w-6 text-slate-400" />}
            noToolbar
            rowClassName={(p) => p.status === 'pending' && new Date(p.dueDate) < new Date() ? "bg-rose-50" : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
