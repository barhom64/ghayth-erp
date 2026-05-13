import { Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Wrench, CheckCircle, Clock, DollarSign } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

export default function FleetMaintenancePage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["fleet-maintenance"], "/fleet/maintenance");
  const items: any[] = data?.data || [];
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

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
    { key: "vehiclePlate", header: "المركبة", sortable: true, searchable: true, render: (m) => <span className="font-medium">{m.vehiclePlate}</span> },
    { key: "type", header: "النوع", sortable: true, searchable: true, render: (m) => m.type || "-" },
    { key: "cost", header: "التكلفة", sortable: true, render: (m) => <span className="font-semibold">{formatCurrency(Number(m.cost))}</span> },
    { key: "workshop", header: "الورشة", sortable: true, searchable: true, render: (m) => <span className="text-muted-foreground">{m.workshop || "-"}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (m) => <span className="text-muted-foreground">{m.date || "-"}</span> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="صيانة المركبات"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "صيانة المركبات" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/maintenance/create">
          <GuardedButton perm="fleet:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة صيانة</GuardedButton>
        </Link>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي السجلات", value: items.length, icon: Wrench, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "مكتملة", value: items.filter((m: any) => m.status === "completed").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "قيد الانتظار", value: items.filter((m: any) => m.status !== "completed").length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "إجمالي التكلفة", value: formatCurrency(items.reduce((s: number, m: any) => s + (Number(m.cost) || 0), 0)), icon: DollarSign, color: "text-status-error-foreground bg-status-error-surface" },
      ]} />

      <BulkActionsBar
        entityType="maintenance"
        items={items}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(items.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["fleet-maintenance"]]}
        actions={["export"]}
        csvColumns={[
          { key: "vehiclePlate", label: "المركبة" },
          { key: "type", label: "نوع الصيانة" },
          { key: "cost", label: "التكلفة" },
          { key: "workshop", label: "الورشة" },
          { key: "date", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="صيانة_المركبات"
      />

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث بالمركبة أو النوع أو الورشة..."
        emptyMessage="لا توجد سجلات صيانة"
        onRowClick={(row) => navigate(`/fleet/maintenance/${row.id}`)}
      />
    </PageShell>
  );
}
