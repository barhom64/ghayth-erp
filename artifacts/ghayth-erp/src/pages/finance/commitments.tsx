import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileSignature, DollarSign, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";

export default function CommitmentsPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["commitments"], "/finance/commitments");
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "vendorName"],
    statusField: "",
    dateField: "",
  });

  const upcomingCount = items.filter((c: any) => {
    if (!c.dueDate) return false;
    const diff = (new Date(c.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (c) => <span className="font-mono text-blue-600 text-sm">{c.ref || `#${c.id}`}</span>,
    },
    {
      key: "vendorName",
      header: "المورد",
      sortable: true,
      render: (c) => <span className="font-medium">{c.vendorName || "-"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (c) => <span className="font-semibold">{formatCurrency(Number(c.amount))}</span>,
    },
    {
      key: "dueDate",
      header: "تاريخ الاستحقاق",
      sortable: true,
      render: (c) => <span className="text-gray-500">{c.dueDate ? formatDateAr(c.dueDate) : "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (c) => <StatusBadge status={c.status} />,
    },
  ];

  return (
    <PageShell
      title="الالتزامات المالية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الالتزامات المالية" }]}
      loading={isLoading}
    >
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
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "vendorName", label: "المورد" },
          { key: "amount", label: "المبلغ" },
          { key: "dueDate", label: "تاريخ الاستحقاق" },
          { key: "status", label: "الحالة" },
        ], "الالتزامات")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد التزامات"
        emptyIcon={<FileSignature className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </PageShell>
  );
}
