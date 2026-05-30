import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatNumber, formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
} from "@workspace/ui-core";
import { Plus, Route, Navigation, CheckCircle, MapPin, List, CalendarDays } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "schedule";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["trips"], "/fleet/trips");
  const items: any[] = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  // Group trips by tripDate (or startTime fallback) for the schedule
  // view. ISO date as key keeps the sort stable; the bucket order is
  // chronologically descending (most-imminent first) which matches
  // how dispatchers scan a day-board.
  const groupedByDate = (() => {
    const buckets = new Map<string, any[]>();
    for (const t of (applyFilters(items, filters, {
      searchFields: ["driverName", "vehiclePlate", "origin", "destination"],
      statusField: "status",
      dateField: "tripDate",
    }) as any[])) {
      const raw = t.tripDate || t.startTime;
      const dayKey = raw ? new Date(raw).toISOString().slice(0, 10) : "غير محدد";
      if (!buckets.has(dayKey)) buckets.set(dayKey, []);
      buckets.get(dayKey)!.push(t);
    }
    return [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

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
    { key: "origin", header: "من / إلى", sortable: true, render: (t) => <span className="text-muted-foreground">{t.origin} → {t.destination}</span> },
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
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-surface-subtle p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7", viewMode === "list" && "bg-background shadow-sm")}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5 me-1" />قائمة
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7", viewMode === "schedule" && "bg-background shadow-sm")}
              onClick={() => setViewMode("schedule")}
            >
              <CalendarDays className="h-3.5 w-3.5 me-1" />جدول يومي
            </Button>
          </div>
          <Link href="/fleet/trips/create">
            <GuardedButton perm="fleet:create" size="sm"><Plus className="h-4 w-4 me-1" />رحلة جديدة</GuardedButton>
          </Link>
        </div>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي الرحلات", value: items.length, icon: Route, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "جارية", value: items.filter((t: any) => t.status === "in_progress").length, icon: Navigation, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "مكتملة", value: items.filter((t: any) => t.status === "completed").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "إجمالي المسافة", value: `${formatNumber(items.reduce((s: number, t: any) => s + (Number(t.distance) || 0), 0))} كم`, icon: MapPin, color: "text-purple-600 bg-purple-50" },
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

      {viewMode === "list" ? (
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
      ) : (
        <div className="space-y-3">
          {groupedByDate.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا رحلات تطابق المرشحات</CardContent></Card>
          ) : groupedByDate.map(([day, trips]) => (
            <Card key={day}>
              <CardContent className="p-0">
                <div className="border-b bg-surface-subtle/50 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-status-info-foreground" />
                    {day === "غير محدد" ? day : formatDateAr(day)}
                  </div>
                  <span className="text-xs text-muted-foreground">{trips.length} رحلة</span>
                </div>
                <div className="divide-y">
                  {trips.map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(`/fleet/trips/${t.id}`)}
                      className="w-full text-start px-4 py-3 hover:bg-surface-subtle/40 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {t.origin || t.fromLocation || "—"} → {t.destination || t.toLocation || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t.driverName || "بلا سائق"} · {t.vehiclePlate || "بلا مركبة"}
                          {t.distance ? ` · ${t.distance} كم` : ""}
                        </div>
                      </div>
                      <PageStatusBadge status={t.status} />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
