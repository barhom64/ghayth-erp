import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowDownCircle, AlertTriangle, Clock, DollarSign, Eye } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";

export default function ReceivablesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["receivables", scopeQueryString], `/finance/receivables${scopeSuffix}`);
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "clientName"],
    statusField: "",
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "رقم الفاتورة",
      sortable: true,
      render: (r) => <span className="font-mono text-blue-600">{r.ref}</span>,
    },
    {
      key: "clientName",
      header: "العميل",
      sortable: true,
      render: (r) => <span className="font-medium">{r.clientName || "-"}</span>,
    },
    {
      key: "total",
      header: "الإجمالي",
      sortable: true,
      render: (r) => formatCurrency(Number(r.total)),
    },
    {
      key: "paidAmount",
      header: "المدفوع",
      sortable: true,
      render: (r) => <span className="text-green-600">{formatCurrency(Number(r.paidAmount || 0))}</span>,
    },
    {
      key: "remainingAmount",
      header: "المتبقي",
      sortable: true,
      render: (r) => <span className="font-bold text-red-600">{formatCurrency(Number(r.remainingAmount || 0))}</span>,
    },
    {
      key: "dueDate",
      header: "الاستحقاق",
      sortable: true,
      render: (r) => <span className="text-gray-500">{r.dueDate ? formatDateAr(r.dueDate) : "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (r) => (
        <Link href={`/finance/invoices/${r.id}`}>
          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
        </Link>
      ),
    },
  ];

  return (
    <PageShell
      title="المقبوضات (الذمم المدينة)"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "المقبوضات (الذمم المدينة)" }]}
      loading={isLoading}
    >
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
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "رقم الفاتورة" },
          { key: "clientName", label: "العميل" },
          { key: "total", label: "الإجمالي" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "remainingAmount", label: "المتبقي" },
          { key: "dueDate", label: "الاستحقاق" },
          { key: "status", label: "الحالة" },
        ], "المقبوضات")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مستحقات"
        emptyIcon={<ArrowDownCircle className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </PageShell>
  );
}
