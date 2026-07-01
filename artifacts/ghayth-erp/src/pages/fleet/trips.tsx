import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
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
  exportToCSV,
  PageShell,
} from "@workspace/ui-core";
import { Plus, Route, Navigation, CheckCircle, MapPin, List, CalendarDays } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleSelect, DriverSelect } from "@/components/shared/entity-selects";
import { useToast } from "@/hooks/use-toast";
import { useVehicleDriverDefault } from "@/hooks/use-vehicle-driver-default";

type ViewMode = "list" | "schedule";

const EMPTY_TRIP = { vehicleId: "", driverId: "", origin: "", destination: "", distance: "", tripDate: "", notes: "" };

export default function TripsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["trips"], "/fleet/trips");
  const items: any[] = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showCreate, setShowCreate] = useState(false);
  const [tripForm, setTripForm] = useState(EMPTY_TRIP);
  // الكيان يقود التجربة: اختيار المركبة يُعبّئ سائقها الحالي تلقائيًا (قابل للتغيير).
  useVehicleDriverDefault(tripForm.vehicleId, tripForm.driverId, (v) => setTripForm((x) => ({ ...x, driverId: v })));
  const [saving, setSaving] = useState(false);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const createTrip = async () => {
    setSaving(true);
    try {
      await apiFetch("/fleet/trips", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: tripForm.vehicleId ? Number(tripForm.vehicleId) : undefined,
          driverId: tripForm.driverId ? Number(tripForm.driverId) : undefined,
          origin: tripForm.origin || undefined,
          destination: tripForm.destination || undefined,
          distance: tripForm.distance ? Number(tripForm.distance) : undefined,
          tripDate: tripForm.tripDate || undefined,
          notes: tripForm.notes || undefined,
        }),
      });
      toast({ title: "تم إنشاء الرحلة" });
      setShowCreate(false);
      setTripForm(EMPTY_TRIP);
      await refetch();
    } catch (err: any) {
      toast({ title: "فشل الإنشاء", description: err?.message ?? "خطأ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

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
          <GuardedButton perm="fleet:create" size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4 me-1" />{showCreate ? "إلغاء" : "رحلة جديدة"}
          </GuardedButton>
          <PrintButton
            entityType="report_fleet_trips"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: {
                title: "قائمة رحلات الأسطول",
                total: printRows.length,
              },
              items: printRows.map((t: any) => ({
                "رقم الرحلة": t.id,
                "المركبة": t.plateNumber || t.vehiclePlate || "—",
                "السائق": t.driverName || "—",
                "من": t.fromLocation || "—",
                "إلى": t.toLocation || "—",
                "التاريخ": t.startTime || t.date || "—",
                "المسافة (كم)": t.distance ?? 0,
                "الحالة": t.status || "—",
              })),
            })}
          />
        </div>
      }
    >
      <FleetTabsNav />

      {showCreate && (
        <div className="rounded-lg border bg-white p-4 mb-4 space-y-3" data-testid="form-create-trip">
          <h3 className="text-base font-semibold">إنشاء رحلة جديدة</h3>
          <div className="grid grid-cols-2 gap-3">
            <VehicleSelect
              label="المركبة"
              placeholder="— اختر مركبة —"
              value={tripForm.vehicleId}
              onChange={(v) => setTripForm((x) => ({ ...x, vehicleId: v }))}
            />
            <DriverSelect
              label="السائق"
              placeholder="— اختر سائق —"
              value={tripForm.driverId}
              onChange={(v) => setTripForm((x) => ({ ...x, driverId: v }))}
            />
            <div>
              <Label>من (الموقع)</Label>
              <Input value={tripForm.origin} onChange={(e) => setTripForm((v) => ({ ...v, origin: e.target.value }))} />
            </div>
            <div>
              <Label>إلى (الوجهة)</Label>
              <Input value={tripForm.destination} onChange={(e) => setTripForm((v) => ({ ...v, destination: e.target.value }))} />
            </div>
            <div>
              <Label>المسافة (كم)</Label>
              <Input type="number" value={tripForm.distance} onChange={(e) => setTripForm((v) => ({ ...v, distance: e.target.value }))} />
            </div>
            <div>
              <Label>تاريخ الرحلة</Label>
              <Input type="date" value={tripForm.tripDate} onChange={(e) => setTripForm((v) => ({ ...v, tripDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>ملاحظات</Label>
              <Input value={tripForm.notes} onChange={(e) => setTripForm((v) => ({ ...v, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled={saving} onClick={createTrip}>{saving ? "جاري الحفظ..." : "إنشاء الرحلة"}</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
          </div>
        </div>
      )}

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
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "driverName", label: "السائق" },
              { key: "vehiclePlate", label: "المركبة" },
              { key: "origin", label: "من" },
              { key: "destination", label: "إلى" },
              { key: "distance", label: "المسافة (كم)" },
              { key: "tripDate", label: "تاريخ الرحلة" },
              { key: "status", label: "الحالة" },
            ],
            "رحلات-الأسطول",
          )
        }
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
          onSortedDataChange={setPrintRows}
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
