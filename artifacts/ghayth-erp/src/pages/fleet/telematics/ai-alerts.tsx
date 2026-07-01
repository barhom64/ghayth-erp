import { useState, useEffect } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertOctagon,
  Bot,
  Camera,
  Eye,
  ShieldAlert,
  Sparkles,
  CheckCircle,
  XCircle,
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

interface AiAlertRow {
  id: number;
  category: string;
  alertType: string;
  alertCode: string | null;
  severity: string;
  confidence: number | null;
  occurredAt: string;
  vehicleId: number | null;
  vehiclePlate: string | null;
  deviceLabel: string | null;
  driverName: string | null;
  status: string;
  imageUrl: string | null;
  videoUrl: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; tone: string; icon: typeof Bot }> = {
  adas: { label: "ADAS — مساعدة القيادة", tone: "bg-status-warning-surface text-status-warning-foreground", icon: ShieldAlert },
  dms: { label: "DMS — مراقبة السائق", tone: "bg-purple-50 text-purple-700", icon: Sparkles },
  bsd: { label: "BSD — النقطة العمياء", tone: "bg-status-info-surface text-status-info-foreground", icon: AlertOctagon },
  safety: { label: "سلامة عامة", tone: "bg-surface-subtle text-muted-foreground", icon: Bot },
  other: { label: "أخرى", tone: "bg-surface-subtle text-muted-foreground", icon: Bot },
};

const SEVERITY_TONE: Record<string, string> = {
  info: "bg-status-info-surface text-status-info-foreground",
  low: "bg-status-info-surface text-status-info-foreground",
  medium: "bg-status-warning-surface text-status-warning-foreground",
  high: "bg-rose-100 text-rose-700",
  critical: "bg-rose-200 text-rose-900",
};

const SEVERITY_LABEL: Record<string, string> = {
  info: "معلومة",
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  critical: "حرج",
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open: { label: "مفتوح", tone: "bg-rose-100 text-rose-700" },
  acknowledged: { label: "تمت المعاينة", tone: "bg-status-info-surface text-status-info-foreground" },
  resolved: { label: "تم الحل", tone: "bg-status-success-surface text-status-success-foreground" },
  dismissed: { label: "مُتجاهَل", tone: "bg-surface-subtle text-muted-foreground" },
};

export default function FleetTelematicsAiAlerts() {
  const [status, setStatus] = useState<string>("open");
  const [category, setCategory] = useState<string>("all");

  const qs = new URLSearchParams();
  if (status !== "all") qs.set("status", status);
  if (category !== "all") qs.set("category", category);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: AiAlertRow[] }>(
    ["fleet-telematics-ai-alerts", status, category],
    `/fleet/telematics/ai-alerts?${qs.toString()}`,
  );
  // Alerts are pushed by the CMSV6 device in seconds, batched into the
  // DB by the webhook + poller. A one-minute auto-refresh strikes a
  // balance between freshness and SQL load (the list query touches the
  // hot fleet_ai_alerts table).
  useEffect(() => {
    const t = setInterval(() => refetch(), 60_000);
    return () => clearInterval(t);
  }, [refetch]);
  const rows = asList(data) as AiAlertRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const ackMut = useApiMutation<unknown, { id: number }>(
    (body) => `/fleet/telematics/ai-alerts/${body.id}/acknowledge`,
    "POST",
    [["fleet-telematics-ai-alerts"]],
    { successMessage: "تمت معاينة التنبيه" },
  );
  const resolveMut = useApiMutation<unknown, { id: number }>(
    (body) => `/fleet/telematics/ai-alerts/${body.id}/resolve`,
    "POST",
    [["fleet-telematics-ai-alerts"]],
    { successMessage: "تم تأكيد حل التنبيه" },
  );
  const dismissMut = useApiMutation<unknown, { id: number }>(
    (body) => `/fleet/telematics/ai-alerts/${body.id}/dismiss`,
    "POST",
    [["fleet-telematics-ai-alerts"]],
    { successMessage: "تم تجاهل التنبيه" },
  );

  const kpi = {
    open: rows.filter((r) => r.status === "open").length,
    adas: rows.filter((r) => r.category === "adas").length,
    dms: rows.filter((r) => r.category === "dms").length,
    bsd: rows.filter((r) => r.category === "bsd").length,
  };

  const columns: DataTableColumn<AiAlertRow>[] = [
    {
      key: "category",
      header: "النوع",
      sortable: true,
      render: (a) => {
        const info = CATEGORY_LABELS[a.category] ?? CATEGORY_LABELS.other;
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
      key: "alertType",
      header: "التنبيه",
      sortable: true,
      searchable: true,
      render: (a) => (
        <div className="text-sm">
          <div className="font-medium">{a.alertType}</div>
          {a.alertCode && <div className="text-xs text-muted-foreground">{a.alertCode}</div>}
        </div>
      ),
    },
    {
      key: "vehiclePlate",
      header: "المركبة / السائق",
      sortable: true,
      searchable: true,
      render: (a) => (
        <div className="flex flex-col">
          <span>{a.vehiclePlate || a.deviceLabel || "—"}</span>
          {a.driverName && (
            <span className="text-xs text-muted-foreground">{a.driverName}</span>
          )}
        </div>
      ),
    },
    {
      key: "severity",
      header: "الخطورة",
      sortable: true,
      render: (a) => (
        <Badge variant="outline" className={SEVERITY_TONE[a.severity] ?? "bg-surface-subtle"}>
          {SEVERITY_LABEL[a.severity] ?? a.severity}
        </Badge>
      ),
    },
    {
      key: "confidence",
      header: "الثقة",
      render: (a) => (a.confidence !== null ? `${Number(a.confidence).toFixed(0)}%` : "—"),
    },
    {
      key: "occurredAt",
      header: "الوقت",
      sortable: true,
      render: (a) => new Date(a.occurredAt).toLocaleString("ar-SA"),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (a) => {
        const s = STATUS_LABEL[a.status] ?? { label: a.status, tone: "bg-surface-subtle" };
        return <Badge variant="outline" className={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "إجراء",
      render: (a) => (
        <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {a.imageUrl && (
            <a href={a.imageUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" aria-label="عرض الصورة">
                <Camera className="h-4 w-4" />
              </Button>
            </a>
          )}
          {a.status === "open" && (
            <GuardedButton
              perm="fleet.telematics.ai_alerts:update"
              variant="ghost"
              size="sm"
              onClick={() => ackMut.mutate({ id: a.id })}
              disabled={ackMut.isPending}
            >
              <Eye className="h-4 w-4" />
            </GuardedButton>
          )}
          {(a.status === "open" || a.status === "acknowledged") && (
            <GuardedButton
              perm="fleet.telematics.ai_alerts:update"
              variant="ghost"
              size="sm"
              onClick={() => resolveMut.mutate({ id: a.id })}
              disabled={resolveMut.isPending}
              title="حل التنبيه"
            >
              <CheckCircle className="h-4 w-4 text-status-success-foreground" />
            </GuardedButton>
          )}
          {(a.status === "open" || a.status === "acknowledged") && (
            <GuardedButton
              perm="fleet.telematics.ai_alerts:update"
              variant="ghost"
              size="sm"
              onClick={() => dismissMut.mutate({ id: a.id })}
              disabled={dismissMut.isPending}
              title="تجاهل (إنذار كاذب)"
            >
              <XCircle className="h-4 w-4 text-muted-foreground" />
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
      title="تنبيهات السلامة الذكية"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "تنبيهات السلامة الذكية" },
      ]}
      actions={
        <PrintButton
          entityType="report_fleet_ai_alerts"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "تنبيهات السلامة الذكية", total: printRows.length },
            items: printRows.map((a: any) => ({
              "النوع": (CATEGORY_LABELS[a.category] ?? CATEGORY_LABELS.other).label,
              "التنبيه": a.alertType,
              "المركبة / السائق": a.vehiclePlate || a.deviceLabel || "—",
              "الخطورة": SEVERITY_LABEL[a.severity] ?? a.severity,
              "الوقت": new Date(a.occurredAt).toLocaleString("ar-SA"),
              "الحالة": (STATUS_LABEL[a.status] ?? { label: a.status }).label,
            })),
          })}
        />
      }
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />
      <KpiGrid
        items={[
          { label: "تنبيهات مفتوحة", value: kpi.open, icon: AlertOctagon, color: "text-rose-700 bg-rose-50" },
          { label: "ADAS", value: kpi.adas, icon: ShieldAlert, color: "text-status-warning-foreground bg-status-warning-surface" },
          { label: "DMS", value: kpi.dms, icon: Sparkles, color: "text-purple-600 bg-purple-50" },
          { label: "BSD", value: kpi.bsd, icon: Bot, color: "text-status-info-foreground bg-status-info-surface" },
        ]}
      />
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="open">مفتوح</SelectItem>
                <SelectItem value="acknowledged">تمت المعاينة</SelectItem>
                <SelectItem value="resolved">تم الحل</SelectItem>
                <SelectItem value="dismissed">مُتجاهَل</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="adas">ADAS</SelectItem>
                <SelectItem value="dms">DMS</SelectItem>
                <SelectItem value="bsd">BSD</SelectItem>
                <SelectItem value="safety">سلامة عامة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            searchPlaceholder="ابحث في التنبيهات…"
            emptyMessage="لا توجد تنبيهات تطابق التصفية"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
