import { useState } from "react";
import { useApiQuery, useApiMutation, asList, apiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Video, Square, ShieldCheck, ScrollText } from "lucide-react";
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

interface AccessLogRow {
  id: number;
  status: string;
  accessedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  errorReason: string | null;
}

export default function FleetTelematicsVideoEvidence() {
  const [logsForSessionId, setLogsForSessionId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: VideoSessionRow[] }>(
    ["fleet-telematics-video"],
    "/fleet/telematics/video/sessions",
  );
  const rows = asList(data) as VideoSessionRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const { data: accessLogs } = useApiQuery<{ data: AccessLogRow[] }>(
    ["fleet-telematics-video-access-logs", String(logsForSessionId ?? 0)],
    `/fleet/telematics/video/sessions/${logsForSessionId}/access-logs`,
    logsForSessionId !== null,
  );
  const logRows = asList(accessLogs) as AccessLogRow[];

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLogsForSessionId(s.id)}
            title="سجل الوصول"
          >
            <ScrollText className="h-4 w-4" />
          </Button>
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
      actions={
        <PrintButton
          entityType="report_fleet_video_sessions"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "أدلة الفيديو والبث المباشر", total: printRows.length },
            items: printRows.map((s: any) => ({
              "الحالة": (STATUS_LABEL[s.status] ?? { label: s.status }).label,
              "المركبة": s.vehiclePlate || s.deviceLabel || "—",
              "القناة": `CH ${s.channelNo}`,
              "النوع": String(s.streamType).toUpperCase(),
              "بدأ في": new Date(s.startedAt).toLocaleString("ar-SA"),
              "السبب": s.reason || "—",
            })),
          })}
        />
      }
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
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            searchPlaceholder="ابحث في جلسات البث…"
            emptyMessage="لم تُفتح أي جلسة بث بعد"
          />
        </CardContent>
      </Card>

      <Dialog open={logsForSessionId !== null} onOpenChange={(o) => !o && setLogsForSessionId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              سجل وصول الجلسة #{logsForSessionId}
            </DialogTitle>
          </DialogHeader>
          {logRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد سجلات وصول</p>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-1 text-sm">
              {logRows.map((l) => (
                <div key={l.id} className="border rounded-md p-2 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={l.status === "allowed" ? "bg-status-success-surface text-status-success-foreground" : "bg-rose-100 text-rose-700"}>
                        {l.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(l.accessedAt).toLocaleString("ar-SA")}</span>
                    </div>
                    {l.errorReason && <p className="text-xs text-rose-700 mt-1">{l.errorReason}</p>}
                    {l.userAgent && <p className="text-xs text-muted-foreground truncate mt-1">{l.userAgent}</p>}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{l.ipAddress || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsForSessionId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
