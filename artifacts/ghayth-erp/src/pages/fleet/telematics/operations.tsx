import { useState, useEffect } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Database,
  Network, Pause, Shield, ShieldAlert, Wifi, WifiOff,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";

interface SyncLogRow {
  id: number;
  integrationId: number | null;
  deviceId: number | null;
  operation: string;
  status: string;
  durationMs: number | null;
  itemsProcessed: number;
  itemsCreated: number;
  itemsSkipped: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface BreakerRow {
  integrationId: number;
  failures: number;
  openedAt: number | null;
  status: string;
}

interface BreakerResponse {
  data: BreakerRow[];
  meta?: {
    coordination?: {
      enabled: boolean;
      mode: string;
    };
  };
}

const STATUS_TONE: Record<string, string> = {
  success: "bg-status-success-surface text-status-success-foreground",
  failure: "bg-rose-100 text-rose-700",
  partial: "bg-status-warning-surface text-status-warning-foreground",
  skipped: "bg-surface-subtle text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  success: "نجاح",
  failure: "فشل",
  partial: "جزئي",
  skipped: "متخطّى (breaker)",
};

export default function FleetTelematicsOperations() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: syncLogs, isLoading: syncLoading, isError: syncError, refetch: refetchSync } =
    useApiQuery<{ data: SyncLogRow[] }>(
      ["fleet-telematics-sync-logs", String(refreshKey)],
      "/fleet/telematics/sync-logs",
    );
  const syncRows = asList(syncLogs) as SyncLogRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<SyncLogRow>(syncRows);

  const { data: breaker, refetch: refetchBreaker } =
    useApiQuery<BreakerResponse>(
      ["fleet-telematics-breaker-state", String(refreshKey)],
      "/fleet/telematics/breaker-state",
    );
  const breakerRows = asList(breaker) as BreakerRow[];
  const coordination = breaker?.meta?.coordination;

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    refetchSync();
    refetchBreaker();
  };

  // Operations dashboard: poll for sync log + breaker churn every 30s
  // so the operator sees a freshly-opened breaker without F5.
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
    // refresh is a stable closure over refetch* refs from useApiQuery
    // (react-query memoises these), no dep listed intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncMut = useApiMutation<unknown, Record<string, never>>(
    "/fleet/telematics/sync/events",
    "POST",
    [["fleet-telematics-sync-logs"], ["fleet-telematics-breaker-state"]],
    { successMessage: "تم تشغيل المزامنة" },
  );

  const syncStats = {
    success: syncRows.filter((r) => r.status === "success").length,
    failure: syncRows.filter((r) => r.status === "failure").length,
    skipped: syncRows.filter((r) => r.status === "skipped").length,
    itemsCreated: syncRows.reduce((sum, r) => sum + (r.itemsCreated || 0), 0),
  };
  const breakerStats = {
    open: breakerRows.filter((r) => r.status === "open").length,
    accumulating: breakerRows.filter((r) => r.status === "closed" && r.failures > 0).length,
  };

  const syncColumns: DataTableColumn<SyncLogRow>[] = [
    {
      key: "status",
      header: "النتيجة",
      sortable: true,
      render: (r) => (
        <Badge variant="outline" className={STATUS_TONE[r.status] ?? "bg-surface-subtle"}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "operation",
      header: "العملية",
      sortable: true,
      searchable: true,
      render: (r) => <code className="text-xs">{r.operation}</code>,
    },
    {
      key: "integrationId",
      header: "تكامل",
      render: (r) => r.integrationId ?? "—",
    },
    {
      key: "itemsProcessed",
      header: "معالَج",
      render: (r) => r.itemsProcessed,
    },
    {
      key: "itemsCreated",
      header: "أُنشئ",
      render: (r) => r.itemsCreated,
    },
    {
      key: "durationMs",
      header: "المدة",
      render: (r) => (r.durationMs !== null ? `${r.durationMs} ms` : "—"),
    },
    {
      key: "startedAt",
      header: "بدأ في",
      sortable: true,
      render: (r) => new Date(r.startedAt).toLocaleString("ar-SA"),
    },
    {
      key: "message",
      header: "رسالة",
      render: (r) =>
        r.message ? (
          <span className="text-xs text-muted-foreground" title={r.message}>
            {r.message.length > 60 ? `${r.message.slice(0, 60)}…` : r.message}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  const breakerColumns: DataTableColumn<BreakerRow>[] = [
    {
      key: "integrationId",
      header: "تكامل #",
      sortable: true,
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) =>
        r.status === "open" ? (
          <Badge variant="outline" className="bg-rose-100 text-rose-700 inline-flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            مفتوح (قاطع)
          </Badge>
        ) : r.failures > 0 ? (
          <Badge variant="outline" className="bg-status-warning-surface text-status-warning-foreground inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            تراكم فشل
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-status-success-surface text-status-success-foreground inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            مغلق
          </Badge>
        ),
    },
    {
      key: "failures",
      header: "عدد الفشل",
      sortable: true,
    },
    {
      key: "openedAt",
      header: "فُتح في",
      render: (r) => (r.openedAt ? new Date(r.openedAt).toLocaleString("ar-SA") : "—"),
    },
  ];

  if (syncLoading) return <LoadingSpinner />;
  if (syncError) return <ErrorState />;

  return (
    <PageShell
      title="تشغيل التتبع"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "لوحة التشغيل" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_fleet_telematics_sync_logs"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تشغيل التتبع — سجل عمليات المزامنة (آخر 200)", total: printRows.length },
              items: printRows.map((r) => ({
                "النتيجة": STATUS_LABEL[r.status] ?? r.status,
                "العملية": r.operation,
                "تكامل": r.integrationId ?? "—",
                "معالَج": r.itemsProcessed,
                "أُنشئ": r.itemsCreated,
                "بدأ في": r.startedAt,
              })),
            })}
          />
          <button
            onClick={() => syncMut.mutate({})}
            disabled={syncMut.isPending}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-status-info-surface text-status-info-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Network className="h-4 w-4" />
            {syncMut.isPending ? "جاري المزامنة…" : "مزامنة الآن"}
          </button>
          <RefreshAction onRefresh={refresh} />
        </div>
      }
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />

      {/* KPIs */}
      <KpiGrid
        items={[
          { label: "مزامنة ناجحة", value: syncStats.success, icon: CheckCircle2, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "مزامنة فاشلة", value: syncStats.failure, icon: AlertTriangle, color: "text-rose-700 bg-rose-50" },
          { label: "أُنشئ خلال آخر 200 مزامنة", value: syncStats.itemsCreated, icon: Database, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "قواطع مفتوحة", value: breakerStats.open, icon: ShieldAlert, color: "text-rose-700 bg-rose-50" },
        ]}
      />

      {/* Coordination banner — surfaces whether multi-replica pub/sub is live */}
      <Card className="mt-4">
        <CardContent className="p-3 flex items-center gap-3">
          {coordination?.enabled ? (
            <>
              <Network className="h-5 w-5 text-status-success-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">تنسيق Multi-Replica نشط</div>
                <div className="text-xs text-muted-foreground">
                  Redis pub/sub يُذيع حالة القواطع بين الـ replicas — حالة
                  الـ breaker موحّدة عبر كل عمليات الـ API server.
                </div>
              </div>
              <Badge variant="outline" className="bg-status-success-surface text-status-success-foreground">
                {coordination.mode}
              </Badge>
            </>
          ) : (
            <>
              <Wifi className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">Per-Replica فقط</div>
                <div className="text-xs text-muted-foreground">
                  REDIS_URL غير معدّ — كل replica يحتفظ بحالة قاطع
                  مستقلة. مقبول في single-replica؛ اضبط REDIS_URL في
                  multi-replica deployments.
                </div>
              </div>
              <Badge variant="outline" className="bg-surface-subtle">
                {coordination?.mode ?? "per-replica"}
              </Badge>
            </>
          )}
        </CardContent>
      </Card>

      {/* Breaker table */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            حالة Circuit Breakers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {breakerRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center inline-flex items-center justify-center gap-2 w-full">
              <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />
              لا قواطع مفتوحة — كل التكاملات تعمل بشكل طبيعي.
            </div>
          ) : (
            <DataTable
              columns={breakerColumns}
              data={breakerRows}
              searchPlaceholder={null}
              emptyMessage="لا قواطع نشطة"
            />
          )}
        </CardContent>
      </Card>

      {/* Sync logs table */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            سجل عمليات المزامنة (آخر 200)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={syncColumns}
            data={syncRows}
            onSortedDataChange={setPrintRows}
            searchPlaceholder="ابحث في العمليات…"
            emptyMessage="لا سجلات مزامنة بعد"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
