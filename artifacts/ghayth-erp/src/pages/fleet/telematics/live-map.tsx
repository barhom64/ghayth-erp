import { useEffect } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { MapPin, RefreshCw, Video, Wifi, WifiOff, Filter, X } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface LiveRow {
  deviceId: number;
  cmsv6DeviceNo: string;
  deviceLabel: string | null;
  status: string;
  vehicleId: number | null;
  vehiclePlate: string | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  direction: number | null;
  lastPositionAt: string | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  online: { label: "متصل", tone: "bg-status-success-surface text-status-success-foreground" },
  offline: { label: "غير متصل", tone: "bg-rose-100 text-rose-700" },
  linked: { label: "مربوط", tone: "bg-status-info-surface text-status-info-foreground" },
  unlinked: { label: "غير مربوط", tone: "bg-surface-subtle text-muted-foreground" },
  error: { label: "خطأ", tone: "bg-rose-100 text-rose-700" },
  decommissioned: { label: "موقوف", tone: "bg-surface-subtle text-muted-foreground" },
};

export default function FleetTelematicsLiveMap() {
  const search = useSearch();
  const vehicleIdFilter = new URLSearchParams(search).get("vehicleId");

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: LiveRow[] }>(
    ["fleet-telematics-live"],
    "/fleet/telematics/live",
  );
  // Live view: positions are updated by the CMSV6 poller every 30s
  // (configurable per integration). Match that cadence so the operator
  // sees fresh data without manually clicking refresh.
  useEffect(() => {
    const t = setInterval(() => refetch(), 30_000);
    return () => clearInterval(t);
  }, [refetch]);
  const allRows = asList(data) as LiveRow[];
  const rows = vehicleIdFilter
    ? allRows.filter((r) => String(r.vehicleId) === vehicleIdFilter)
    : allRows;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<LiveRow>(rows);

  const syncPositions = useApiMutation<unknown, Record<string, never>>(
    "/fleet/telematics/sync/positions",
    "POST",
    [["fleet-telematics-live"]],
    { successMessage: "بدأت مزامنة المواقع من CMSV6" },
  );

  const total = rows.length;
  const online = rows.filter((r) => r.status === "online").length;
  const offline = rows.filter((r) => r.status === "offline").length;
  const unlinked = rows.filter((r) => r.status === "unlinked").length;

  const columns: DataTableColumn<LiveRow>[] = [
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => {
        const info = STATUS_LABELS[r.status] ?? { label: r.status, tone: "bg-surface-subtle" };
        return (
          <Badge variant="outline" className={`${info.tone} inline-flex items-center gap-1`}>
            {r.status === "online" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {info.label}
          </Badge>
        );
      },
    },
    {
      key: "vehiclePlate",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (r) => r.vehiclePlate || "—",
    },
    {
      key: "deviceLabel",
      header: "الجهاز",
      sortable: true,
      searchable: true,
      render: (r) => (
        <div className="text-sm">
          <div className="font-medium">{r.deviceLabel || r.cmsv6DeviceNo}</div>
          <div className="text-muted-foreground">{r.cmsv6DeviceNo}</div>
        </div>
      ),
    },
    {
      key: "lat",
      header: "آخر إحداثيات",
      render: (r) =>
        r.lat !== null && r.lng !== null ? (
          <span className="inline-flex items-center gap-1 text-xs font-mono">
            <MapPin className="h-3 w-3 text-status-info-foreground" />
            {Number(r.lat).toFixed(5)}, {Number(r.lng).toFixed(5)}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "speed",
      header: "السرعة",
      sortable: true,
      render: (r) => (r.speed !== null ? `${Number(r.speed).toFixed(1)} km/h` : "—"),
    },
    {
      key: "lastPositionAt",
      header: "آخر تحديث",
      sortable: true,
      render: (r) =>
        r.lastPositionAt ? new Date(r.lastPositionAt).toLocaleString("ar-SA") : "—",
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الخريطة المباشرة للأسطول"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { label: "التتبع المباشر" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <GuardedButton
            perm="fleet.telematics.sync:create"
            size="sm"
            onClick={() => syncPositions.mutate({})}
            disabled={syncPositions.isPending}
          >
            <RefreshCw className="h-4 w-4 me-1" />
            مزامنة CMSV6
          </GuardedButton>
          <PrintButton
            entityType="report_fleet_telematics_live"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "الخريطة المباشرة للأسطول", total: printRows.length },
              items: printRows.map((r: LiveRow) => ({
                "الحالة": (STATUS_LABELS[r.status] ?? { label: r.status }).label,
                "المركبة": r.vehiclePlate || "—",
                "الجهاز": r.deviceLabel || r.cmsv6DeviceNo,
                "السرعة": r.speed !== null ? `${Number(r.speed).toFixed(1)} km/h` : "—",
                "آخر تحديث": r.lastPositionAt
                  ? new Date(r.lastPositionAt).toLocaleString("ar-SA")
                  : "—",
              })),
            })}
          />
        </div>
      }
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />
      {vehicleIdFilter && (
        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-status-info-surface text-status-info-foreground text-xs">
          <Filter className="h-3 w-3" />
          مفلتر على مركبة #{vehicleIdFilter}
          <a href="/fleet/telematics/live-map" className="hover:bg-white/30 rounded-full p-0.5">
            <X className="h-3 w-3" />
          </a>
        </div>
      )}
      <KpiGrid
        items={[
          { label: "إجمالي الأجهزة", value: total, icon: Video, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "متصل الآن", value: online, icon: Wifi, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "غير متصل", value: offline, icon: WifiOff, color: "text-rose-700 bg-rose-50" },
          { label: "بانتظار الربط", value: unlinked, icon: MapPin, color: "text-purple-600 bg-purple-50" },
        ]}
      />
      <Card className="mt-4">
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            onSortedDataChange={setPrintRows}
            searchPlaceholder="ابحث عن مركبة أو رقم جهاز…"
            emptyMessage="لا توجد أجهزة مرتبطة بعد — اربط أجهزة MDVR من شاشة الأجهزة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
