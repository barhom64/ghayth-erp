import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, Route, Navigation, CheckCircle, MapPin } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PageShell } from "@/components/page-shell";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["trips"], "/fleet/trips");
  const items: any[] = data?.data || [];
  const [filters, setFilters] = useFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const filtered = applyFilters(items, filters, {
    searchFields: ["driverName", "vehiclePlate", "origin", "destination"],
    statusField: "status",
    dateField: "tripDate",
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
    { key: "driverName", header: "السائق", sortable: true, render: (t) => <span className="font-medium">{t.driverName}</span> },
    { key: "vehiclePlate", header: "المركبة", sortable: true, render: (t) => t.vehiclePlate || "-" },
    { key: "origin", header: "من / إلى", sortable: true, render: (t) => <span className="text-gray-500">{t.origin} → {t.destination}</span> },
    { key: "distance", header: "المسافة", sortable: true, render: (t) => `${t.distance} كم` },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <PageStatusBadge status={t.status} /> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الرحلات"
      subtitle="جدول رحلات الأسطول ومتابعتها"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "الرحلات" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/trips/create">
          <GuardedButton perm="fleet:create" size="sm"><Plus className="h-4 w-4 me-1" />رحلة جديدة</GuardedButton>
        </Link>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي الرحلات", value: items.length, icon: Route, color: "text-blue-600 bg-blue-50" },
        { label: "جارية", value: items.filter((t: any) => t.status === "in_progress").length, icon: Navigation, color: "text-amber-600 bg-amber-50" },
        { label: "مكتملة", value: items.filter((t: any) => t.status === "completed").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
        { label: "إجمالي المسافة", value: `${items.reduce((s: number, t: any) => s + (Number(t.distance) || 0), 0).toLocaleString()} كم`, icon: MapPin, color: "text-purple-600 bg-purple-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالسائق أو المركبة أو الوجهة...",
          statuses: [
            { value: "planned", label: "مخطط" },
            { value: "in_progress", label: "جاري" },
            { value: "completed", label: "مكتمل" },
            { value: "cancelled", label: "ملغي" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="trip"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["trips"]]}
        actions={["export"]}
        csvColumns={[
          { key: "driverName", label: "السائق" },
          { key: "vehiclePlate", label: "المركبة" },
          { key: "origin", label: "نقطة الانطلاق" },
          { key: "destination", label: "الوجهة" },
          { key: "distance", label: "المسافة" },
          { key: "tripDate", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="رحلات_الأسطول"
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد رحلات"
        noToolbar
        onRowClick={(t) => navigate(`/fleet/trips/${t.id}`)}
      />
    </PageShell>
  );
}
