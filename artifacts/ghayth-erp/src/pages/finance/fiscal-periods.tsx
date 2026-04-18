import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * Fiscal periods list — migrated in R.2 iter 2 to the unified template
 * stack (PageShell + PageStatusBadge). The underlying data source is
 * unchanged (the v1 `/finance/fiscal-periods` endpoint that returns
 * stats per month), but the visual layer is now consistent with
 * `pages/finance/dashboard.tsx` and every other page that adopts the
 * templates in later iterations.
 *
 * Before: raw <h1>, local STATUS_CONFIG map with three statuses
 * (active/closed/future), inline Card tiles, no breadcrumbs.
 * After: PageShell shell, PageStatusBadge drives the status chip from
 * the canonical shared map (open/closed/future all added to STATUS_MAP
 * in the same R.2 commit as this file), and the KPI tiles use the
 * same Card pattern as the dashboard.
 */

interface FiscalPeriodV1Row {
  period: string;
  name: string;
  entries: number;
  totalAmount: number | string;
  status: "active" | "closed" | "future";
}

export default function FiscalPeriodsPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ data: FiscalPeriodV1Row[] }>(
    ["fiscal-periods"],
    "/finance/fiscal-periods",
  );
  const items: FiscalPeriodV1Row[] = data?.data || [];
  const [filters, setFilters] = useFilters();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filtered = applyFilters(items as unknown as Record<string, unknown>[], filters, {
    searchFields: ["name", "period"],
    statusField: "status",
  }) as unknown as FiscalPeriodV1Row[];

  const activeCount = items.filter((p) => p.status === "active").length;
  const closedCount = items.filter((p) => p.status === "closed").length;

  const columns: DataTableColumn<FiscalPeriodV1Row>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      className: "font-mono text-blue-600",
      render: (p) => p.period,
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      className: "font-medium",
      render: (p) => p.name,
    },
    {
      key: "entries",
      header: "عدد القيود",
      sortable: true,
      render: (p) => p.entries,
    },
    {
      key: "totalAmount",
      header: "إجمالي الحركات",
      sortable: true,
      className: "font-semibold",
      render: (p) => formatCurrency(Number(p.totalAmount || 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status} domain="shared" />,
    },
  ];

  return (
    <PageShell
      title="الفترات المالية"
      subtitle="الفترات الشهرية وعدد القيود وإجمالي الحركات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الفترات المالية" }]}
      loading={isLoading}
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الفترات</p>
              <p className="text-xl font-bold">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">نشطة</p>
              <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Lock className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مُغلقة</p>
              <p className="text-xl font-bold text-slate-600">{closedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الفترة...",
          statuses: [
            { value: "active", label: "نشطة" },
            { value: "closed", label: "مُغلقة" },
            { value: "future", label: "مستقبلية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={refetch}
        noToolbar
        rowKey={(p) => p.period}
        rowClassName={(p) => (p.status === "active" ? "bg-emerald-50/40" : undefined)}
        emptyMessage="لا توجد فترات"
        emptyIcon={<Calendar className="h-10 w-10 opacity-30" />}
        pageSize={20}
      />
    </PageShell>
  );
}
