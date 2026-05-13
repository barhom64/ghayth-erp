import { useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ClipboardCheck, Clock, CheckCircle, DollarSign } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";

export default function FinancialRequestsPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["financial-requests"], "/finance/financial-requests");
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "supplierName", "requestedByName"],
    statusField: "status",
    dateField: "",
  });

  const totalAmount = items.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (r) => <span className="font-mono text-status-info-foreground text-sm">{r.ref || `#${r.id}`}</span>,
    },
    {
      key: "requestedByName",
      header: "مقدم الطلب",
      sortable: true,
      render: (r) => <span className="font-medium">{r.requestedByName || "-"}</span>,
    },
    {
      key: "supplierName",
      header: "المورد",
      sortable: true,
      render: (r) => <span className="text-muted-foreground">{r.supplierName || "-"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount || 0))}</span>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (r) => <span className="text-muted-foreground text-sm">{r.createdAt ? formatDateAr(r.createdAt) : "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => <PageStatusBadge status={r.status} />,
    },
  ];

  return (
    <PageShell
      title="الطلبات المالية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الطلبات المالية" }]}
      loading={isLoading}
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-info-surface rounded-lg"><ClipboardCheck className="h-5 w-5 text-status-info-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">إجمالي الطلبات</p><p className="text-xl font-bold">{summary.total || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-warning-surface rounded-lg"><Clock className="h-5 w-5 text-status-warning-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">قيد الانتظار</p><p className="text-xl font-bold text-status-warning-foreground">{summary.pending || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-success-surface rounded-lg"><CheckCircle className="h-5 w-5 text-status-success-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">موافق عليها</p><p className="text-xl font-bold text-status-success-foreground">{summary.approved || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><DollarSign className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-xs text-muted-foreground">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(totalAmount)}</p></div>
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
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "requestedByName", label: "مقدم الطلب" },
          { key: "supplierName", label: "المورد" },
          { key: "amount", label: "المبلغ" },
          { key: "createdAt", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ], "الطلبات_المالية")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد طلبات مالية"
        emptyIcon={<ClipboardCheck className="h-6 w-6 text-slate-400" />}
        noToolbar
        onRowClick={(row) => navigate(`/finance/financial-requests/${row.id}`)}
      />
    </PageShell>
  );
}
