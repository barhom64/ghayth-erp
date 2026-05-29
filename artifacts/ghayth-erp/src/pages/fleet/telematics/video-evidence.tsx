import { useApiQuery, useApiMutation, asList, apiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Video, Square, ShieldCheck } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";

interface VideoSessionRow {
  id: number;
  deviceId: number;
  vehicleId: number | null;
  vehiclePlate: string | null;
  deviceLabel: string | null;
  channelNo: number;
  streamType: string;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string | null;
  status: string;
  reason: string | null;
  requestedBy: number;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: "نشط", tone: "bg-status-success-surface text-status-success-foreground" },
  stopped: { label: "موقوف", tone: "bg-surface-subtle text-muted-foreground" },
  expired: { label: "منتهي", tone: "bg-status-warning-surface text-status-warning-foreground" },
  error: { label: "خطأ", tone: "bg-rose-100 text-rose-700" },
};

export default function FleetTelematicsVideoEvidence() {
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: VideoSessionRow[] }>(
    ["fleet-telematics-video"],
    "/fleet/telematics/video/sessions",
  );
  const rows = asList(data) as VideoSessionRow[];

  const stopMut = useApiMutation<unknown, { id: number }>(
    (body) => `/fleet/telematics/video/session/${body.id}/stop`,
    "POST",
    [["fleet-telematics-video"]],
    { successMessage: "تم إيقاف البث" },
  );

  const kpi = {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    stopped: rows.filter((r) => r.status === "stopped").length,
  };

  const columns: DataTableColumn<VideoSessionRow>[] = [
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (s) => {
        const info = STATUS_LABEL[s.status] ?? { label: s.status, tone: "bg-surface-subtle" };
        return <Badge variant="outline" className={info.tone}>{info.label}</Badge>;
      },
    },
    {
      key: "vehiclePlate",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (s) => s.vehiclePlate || s.deviceLabel || "—",
    },
    {
      key: "channelNo",
      header: "القناة",
      render: (s) => `CH ${s.channelNo}`,
    },
    {
      key: "streamType",
      header: "النوع",
      render: (s) => <code className="text-xs">{s.streamType.toUpperCase()}</code>,
    },
    {
      key: "startedAt",
      header: "بدأ في",
      sortable: true,
      render: (s) => new Date(s.startedAt).toLocaleString("ar-SA"),
    },
    {
      key: "endedAt",
      header: "أُغلق في",
      render: (s) => (s.endedAt ? new Date(s.endedAt).toLocaleString("ar-SA") : "—"),
    },
    {
      key: "reason",
      header: "السبب",
      render: (s) => s.reason || "—",
    },
    {
      key: "actions",
      header: "إجراء",
      render: (s) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* HLS playlist link — routes through the server-side proxy so
              the upstream CMSV6 URL never reaches the browser. */}
          {s.status === "active" && (
            <a
              href={apiUrl(`/fleet/telematics/video/proxy/${s.id}/playlist.m3u8`)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-status-info-foreground underline"
            >
              تشغيل
            </a>
          )}
          {s.status === "active" && (
            <GuardedButton
              perm="fleet.telematics.video:delete"
              variant="ghost"
              size="sm"
              onClick={() => stopMut.mutate({ id: s.id })}
              disabled={stopMut.isPending}
            >
              <Square className="h-4 w-4 text-rose-700" />
            </GuardedButton>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="أدلة الفيديو والبث المباشر"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "أدلة الفيديو" },
      ]}
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />
      <KpiGrid
        items={[
          { label: "جلسات بث", value: kpi.total, icon: Video, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "نشطة", value: kpi.active, icon: Video, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "موقوفة", value: kpi.stopped, icon: Square, color: "text-muted-foreground bg-surface-subtle" },
        ]}
      />
      <Card className="mt-4">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-3 inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-status-success-foreground" />
            البث المباشر يفتح فقط عند الطلب وعبر signed proxy URL برمز قصير
            المدى (≤ دقيقة). الـ URL الخام لا يصل للمتصفح، وكل محاولة وصول
            تُسجَّل في `fleet_video_access_logs` (مرور أو منع مع السبب).
          </p>
          <DataTable<VideoSessionRow>
            columns={columns}
            data={rows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            searchPlaceholder="ابحث في جلسات البث…"
            emptyMessage="لم تُفتح أي جلسة بث بعد"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
