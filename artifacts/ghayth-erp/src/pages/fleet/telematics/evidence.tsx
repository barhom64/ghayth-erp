import { useState } from "react";
import { useApiQuery, asList, apiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Archive, Camera, Film, Image as ImageIcon, Music,
  Search, ShieldAlert, Sparkles, AlertOctagon, Bot, Info,
} from "lucide-react";
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

interface VehicleOption {
  id: number;
  plateNumber: string;
}

interface MediaEvidenceRow {
  id: number;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  occurredAt: string | null;
  uploadedAt: string;
  channelNo: number | null;
  alertId: number | null;
  vehicleId: number | null;
  deviceId: number;
  alertCategory: string | null;
  alertType: string | null;
  alertSeverity: string | null;
  vehiclePlate: string | null;
  deviceLabel: string | null;
}

const MEDIA_LABELS: Record<string, { label: string; icon: typeof Camera; tone: string }> = {
  image: { label: "صورة", icon: ImageIcon, tone: "bg-status-info-surface text-status-info-foreground" },
  video: { label: "فيديو", icon: Film, tone: "bg-purple-50 text-purple-700" },
  audio: { label: "صوت", icon: Music, tone: "bg-status-warning-surface text-status-warning-foreground" },
};

const CATEGORY_LABELS: Record<string, { label: string; tone: string; icon: typeof Bot }> = {
  adas: { label: "ADAS", tone: "bg-status-warning-surface text-status-warning-foreground", icon: ShieldAlert },
  dms: { label: "DMS", tone: "bg-purple-50 text-purple-700", icon: Sparkles },
  bsd: { label: "BSD", tone: "bg-status-info-surface text-status-info-foreground", icon: AlertOctagon },
  safety: { label: "سلامة", tone: "bg-surface-subtle text-muted-foreground", icon: Bot },
  other: { label: "أخرى", tone: "bg-surface-subtle text-muted-foreground", icon: Bot },
};

const SEVERITY_TONE: Record<string, string> = {
  info: "bg-status-info-surface text-status-info-foreground",
  low: "bg-status-info-surface text-status-info-foreground",
  medium: "bg-status-warning-surface text-status-warning-foreground",
  high: "bg-rose-100 text-rose-700",
  critical: "bg-rose-200 text-rose-900",
};

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function FleetTelematicsEvidence() {
  const [vehicleId, setVehicleId] = useState<string>("");
  const [mediaType, setMediaType] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: detailData } = useApiQuery<{ data: MediaEvidenceRow & { alertConfidence: number | null; alertOccurredAt: string | null } }>(
    ["fleet-telematics-media-evidence-detail", String(detailId ?? 0)],
    `/fleet/telematics/media-evidence/${detailId}`,
    detailId !== null,
  );
  const detail = detailData?.data;

  const { data: vehicles } = useApiQuery<{ data: VehicleOption[] }>(
    ["fleet-vehicles-options"],
    "/fleet/vehicles?limit=500",
  );
  const vehicleList = asList(vehicles) as VehicleOption[];

  const qs = new URLSearchParams();
  if (vehicleId) qs.set("vehicleId", vehicleId);
  if (mediaType !== "all") qs.set("mediaType", mediaType);
  if (category !== "all") qs.set("category", category);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: MediaEvidenceRow[] }>(
    ["fleet-telematics-media-evidence", vehicleId, mediaType, category, from, to],
    `/fleet/telematics/media-evidence?${qs.toString()}`,
  );
  const rows = asList(data) as MediaEvidenceRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const kpi = {
    total: rows.length,
    images: rows.filter((r) => r.mediaType === "image").length,
    videos: rows.filter((r) => r.mediaType === "video").length,
    fromAi: rows.filter((r) => r.alertId !== null).length,
  };

  const columns: DataTableColumn<MediaEvidenceRow>[] = [
    {
      key: "mediaType",
      header: "النوع",
      sortable: true,
      render: (r) => {
        const info = MEDIA_LABELS[r.mediaType] ?? MEDIA_LABELS.image;
        const Icon = info.icon;
        return (
          <Badge variant="outline" className={`${info.tone} inline-flex items-center gap-1`}>
            <Icon className="h-3 w-3" />
            {info.label}
          </Badge>
        );
      },
    },
    {
      key: "thumbnailUrl",
      header: "معاينة",
      render: (r) => {
        // Always route through the server-side proxy — the CMSV6 URL
        // never reaches the browser. Same security model as the video
        // proxy (cb870a1) extended to media evidence.
        const proxyHref = apiUrl(`/fleet/telematics/media-evidence/${r.id}/blob`);
        return r.mediaType === "image" ? (
          <a href={proxyHref} target="_blank" rel="noreferrer">
            <img
              src={proxyHref}
              alt="evidence"
              className="h-12 w-20 object-cover rounded border"
            />
          </a>
        ) : (
          <a href={proxyHref} target="_blank" rel="noreferrer">
            <Camera className="h-5 w-5 text-muted-foreground" />
          </a>
        );
      },
    },
    {
      key: "alertCategory",
      header: "التنبيه",
      sortable: true,
      render: (r) => {
        if (!r.alertCategory) {
          return <span className="text-muted-foreground text-xs">يدوي</span>;
        }
        const info = CATEGORY_LABELS[r.alertCategory] ?? CATEGORY_LABELS.other;
        const Icon = info.icon;
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className={`${info.tone} inline-flex items-center gap-1 w-fit`}>
              <Icon className="h-3 w-3" />
              {info.label}
            </Badge>
            {r.alertType && (
              <span className="text-xs text-muted-foreground">{r.alertType}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "alertSeverity",
      header: "الخطورة",
      sortable: true,
      render: (r) =>
        r.alertSeverity ? (
          <Badge variant="outline" className={SEVERITY_TONE[r.alertSeverity] ?? "bg-surface-subtle"}>
            {r.alertSeverity}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "vehiclePlate",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (r) => r.vehiclePlate || r.deviceLabel || "—",
    },
    {
      key: "channelNo",
      header: "كاميرا",
      render: (r) => (r.channelNo !== null ? `CH ${r.channelNo}` : "—"),
    },
    {
      key: "durationSec",
      header: "المدة",
      render: (r) => formatDuration(r.durationSec),
    },
    {
      key: "sizeBytes",
      header: "الحجم",
      render: (r) => formatBytes(r.sizeBytes),
    },
    {
      key: "occurredAt",
      header: "وقت الحدث",
      sortable: true,
      render: (r) =>
        r.occurredAt
          ? new Date(r.occurredAt).toLocaleString("ar-SA")
          : new Date(r.uploadedAt).toLocaleString("ar-SA"),
    },
    {
      key: "details",
      header: "تفاصيل",
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
          title="تفاصيل الدليل"
        >
          <Info className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="أرشيف الأدلة"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "أرشيف الأدلة" },
      ]}
      actions={
        <PrintButton
          entityType="report_fleet_media_evidence"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "أرشيف الأدلة", total: printRows.length },
            items: printRows.map((r: any) => ({
              "النوع": (MEDIA_LABELS[r.mediaType] ?? MEDIA_LABELS.image).label,
              "التنبيه": r.alertCategory ? (CATEGORY_LABELS[r.alertCategory] ?? CATEGORY_LABELS.other).label : "يدوي",
              "المركبة": r.vehiclePlate || r.deviceLabel || "—",
              "كاميرا": r.channelNo !== null ? `CH ${r.channelNo}` : "—",
              "المدة": formatDuration(r.durationSec),
              "وقت الحدث": r.occurredAt ? new Date(r.occurredAt).toLocaleString("ar-SA") : new Date(r.uploadedAt).toLocaleString("ar-SA"),
            })),
          })}
        />
      }
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />
      <KpiGrid
        items={[
          { label: "إجمالي الأدلة", value: kpi.total, icon: Archive, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "صور", value: kpi.images, icon: ImageIcon, color: "text-purple-600 bg-purple-50" },
          { label: "مقاطع فيديو", value: kpi.videos, icon: Film, color: "text-status-warning-foreground bg-status-warning-surface" },
          { label: "مرفقة بتنبيه AI", value: kpi.fromAi, icon: Bot, color: "text-status-success-foreground bg-status-success-surface" },
        ]}
      />
      <Card className="mt-4">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label>المركبة</Label>
              <Select value={vehicleId || "all"} onValueChange={(v) => setVehicleId(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="كل المركبات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المركبات</SelectItem>
                  {vehicleList.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.plateNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع الوسائط</Label>
              <Select value={mediaType} onValueChange={setMediaType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="image">صور</SelectItem>
                  <SelectItem value="video">فيديو</SelectItem>
                  <SelectItem value="audio">صوت</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>فئة التنبيه</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="adas">ADAS</SelectItem>
                  <SelectItem value="dms">DMS</SelectItem>
                  <SelectItem value="bsd">BSD</SelectItem>
                  <SelectItem value="safety">سلامة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من تاريخ</Label>
              <Input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label>إلى تاريخ</Label>
              <Input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Search className="h-3 w-3" />
            النتائج محدودة بآخر 200 سطر؛ ضيّق المرشحات للبحث في
            فترات أوسع. الأدلة تُحفظ ما لم يُحذفها cron الـ retention.
          </p>
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            searchPlaceholder="ابحث برقم المركبة أو نوع التنبيه…"
            emptyMessage="لا أدلة تطابق المرشحات"
          />
        </CardContent>
      </Card>

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              تفاصيل الدليل #{detailId}
            </DialogTitle>
          </DialogHeader>
          {!detail ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل…</p>
          ) : (
            <div className="space-y-3 text-sm">
              {detail.mediaType === "image" && (
                <img
                  src={`/api/fleet/telematics/media-evidence/${detail.id}/blob`}
                  alt="evidence"
                  className="w-full h-48 object-contain rounded border bg-surface-subtle"
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">نوع الوسائط</p><p>{detail.mediaType}</p></div>
                <div><p className="text-xs text-muted-foreground">المركبة</p><p>{detail.vehiclePlate || detail.deviceLabel || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">القناة</p><p>{detail.channelNo !== null ? `CH ${detail.channelNo}` : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">المدة</p><p>{detail.durationSec != null ? `${detail.durationSec}s` : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">الحجم</p><p>{detail.sizeBytes != null ? formatBytes(detail.sizeBytes) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">تاريخ الرفع</p><p className="text-xs">{new Date(detail.uploadedAt).toLocaleString("ar-SA")}</p></div>
              </div>
              {detail.alertCategory && (
                <div className="rounded border p-2 bg-surface-subtle/40">
                  <p className="text-xs text-muted-foreground mb-1">مرتبط بتنبيه</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{detail.alertCategory}</Badge>
                    {detail.alertType && <span>{detail.alertType}</span>}
                    {detail.alertSeverity && <Badge variant="outline">{detail.alertSeverity}</Badge>}
                  </div>
                  {detail.alertConfidence != null && (
                    <p className="text-xs text-muted-foreground mt-1">الثقة: {Number(detail.alertConfidence).toFixed(0)}%</p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
