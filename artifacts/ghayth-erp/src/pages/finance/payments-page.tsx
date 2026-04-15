import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpCircle, DollarSign, Calendar, Wallet } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";

export default function PaymentsPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["payments"], "/finance/payments");
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref"],
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (p) => <span className="font-mono text-blue-600 text-sm">{p.ref}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (p) => <span className="font-medium">{p.description || "-"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (p) => <span className="font-semibold text-red-600">{formatCurrency(Number(p.amount))}</span>,
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (p) => <span className="text-gray-500 text-sm">{p.date ? formatDateAr(p.date) : "-"}</span>,
    },
  ];

  return (
    <PageShell
      title="المدفوعات"
      subtitle="عرض تجميعي لجميع سندات الصرف — لإنشاء سند جديد استخدم صفحة السندات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "المدفوعات" }]}
      loading={isLoading}
    >
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
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "amount", label: "المبلغ" },
          { key: "date", label: "التاريخ" },
        ], "المدفوعات")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مدفوعات"
        emptyIcon={<ArrowUpCircle className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </PageShell>
  );
}
