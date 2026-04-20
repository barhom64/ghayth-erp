import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AlertTriangle, DollarSign, Clock } from "lucide-react";
import { AdvancedFilters, useFilters } from "@/components/shared/advanced-filters";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";

export default function UmrahPenalties() {
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(["umrah-penalties"], "/umrah/penalties");
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const items = resp?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filteredItems = items.filter((p: any) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return p.pilgrimName?.toLowerCase().includes(q) || p.passportNumber?.toLowerCase().includes(q) || p.agentName?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = items.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const pendingCount = items.filter((p: any) => p.status === "pending").length;

  const kpiCards = [
    { label: "إجمالي الغرامات", value: items.length, icon: AlertTriangle, color: "text-blue-600 bg-blue-50" },
    { label: "معلقة", value: pendingCount, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي المبالغ", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-red-600 bg-red-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "pilgrimName", header: "المعتمر", render: (p) => <span className="font-medium">{p.pilgrimName}</span> },
    { key: "passportNumber", header: "الجواز" },
    { key: "agentName", header: "الوكيل" },
    { key: "type", header: "النوع", render: (p) => p.type === "overstay" ? "تجاوز مدة" : p.type },
    { key: "daysOverstayed", header: "أيام التأخر" },
    { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold text-red-600">{formatCurrency(Number(p.amount))}</span> },
    { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
  ];

  return (
    <PageShell title="غرامات العمرة" breadcrumbs={[{ label: "العمرة" }, { label: "الغرامات" }]}>
      <UmrahTabsNav />

      <div className="grid gap-4 grid-cols-3">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الجواز أو الوكيل...",
          statuses: [
            { value: "pending", label: "معلقة" },
            { value: "invoiced", label: "مفوترة" },
            { value: "paid", label: "مدفوعة" },
            { value: "cancelled", label: "ملغية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredItems.length}
      />

      <DataTable
        columns={columns}
        data={filteredItems}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد غرامات"
        emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={pageSize}
      />
    </PageShell>
  );
}
