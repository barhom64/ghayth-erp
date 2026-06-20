/**
 * Admin → Observability operator pane (Issue #1139 §5).
 *
 * Single-pane view backed by GET /api/admin/observability/overview.
 * Six sections, in priority order so the operator sees the worst news
 * at the top:
 *   1. Active anomalies   — currently firing derived rules
 *   2. Queues             — eventBus throughput + DLQ depth
 *   3. Providers          — per-channel integration health
 *   4. Workers            — per-cron job health
 *   5. SLA breaches       — workflow.sla_warning / workflow.escalated
 *   6. AI cost tracking   — placeholder until the schema lands
 *
 * Backed entirely by existing tables; no UI state besides refetch.
 */
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useState } from "react";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { apiFetch, useApiQuery, API_BASE, nativeAuthHeaders } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  RefreshCw, AlertTriangle, AlertOctagon, Activity, Inbox,
  Plug, Cpu, Clock, Bot, Sparkles, CheckCircle2,
} from "lucide-react";

interface Anomaly {
  severity: "critical" | "warning" | "info";
  rule: string;
  message: string;
  metric: string | null;
  value: number | string;
  threshold: number | string;
}

interface DlqTop {
  type: string;
  eventName: string | null;
  count: number;
  latestError: string;
  latestAt: string;
}

interface ProviderRow {
  channel: string;
  totalLast24h: number;
  success: number;
  failed: number;
  retrying: number;
  successRate: number;
  lastFailureAt: string | null;
  lastFailureError: string | null;
}

interface WorkerRow {
  jobName: string;
  totalLast24h: number;
  failed: number;
  avgDurationMs: number;
  maxDurationMs: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface SlaByEntity {
  entity: string;
  count: number;
  latest: string;
}

interface AiCostByDim {
  key: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  errors: number;
}

interface AiCostSection {
  available: true;
  totals: {
    callsLast24h: number;
    callsLast7d: number;
    errorsLast24h: number;
    promptTokensLast24h: number;
    completionTokensLast24h: number;
    costUsdLast24h: number;
    costUsdLast7d: number;
  };
  byModel: AiCostByDim[];
  byFeature: AiCostByDim[];
}

interface Overview {
  collectedAt: string;
  windowHours: number;
  queues: {
    eventBus: {
      eventsLastHour: number;
      eventsLast24h: number;
      topByAction: Array<{ action: string; count: number }>;
      dlq: {
        unresolved: number;
        resolvedLast24h: number;
        topByType: DlqTop[];
      };
    };
  };
  providers: ProviderRow[];
  workers: WorkerRow[];
  slaBreaches: {
    last24h: number;
    last7d: number;
    byEntity: SlaByEntity[];
  };
  aiCosts: AiCostSection;
  anomalies: Anomaly[];
}

const SEVERITY_STYLE: Record<Anomaly["severity"], { bg: string; text: string; icon: typeof AlertTriangle }> = {
  critical: { bg: "bg-status-error-surface", text: "text-status-error-foreground", icon: AlertOctagon },
  warning: { bg: "bg-status-warning-surface/60", text: "text-status-warning-foreground", icon: AlertTriangle },
  info: { bg: "bg-status-info-surface", text: "text-status-info-foreground", icon: Activity },
};

function severityLabel(s: Anomaly["severity"]): string {
  return s === "critical" ? "حرج" : s === "warning" ? "تحذير" : "ملاحظة";
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface DlqEntry {
  id: number;
  type: string;
  eventName: string | null;
  companyId: number | null;
  error: string | null;
  retryCount: number;
  resolvedAt: string | null;
  createdAt: string;
}

export default function AdminObservability() {
  const { data, isLoading, error, refetch } = useApiQuery<Overview>(
    ["admin-observability-overview"],
    "/admin/observability/overview",
  );
  // Kubernetes-style liveness/readiness probes + Prometheus metrics
  // endpoint. Wired here as small status pills so operators can verify
  // the pod is responding without `kubectl exec`-ing in.
  const livezQ = useApiQuery<any>(["k8s-livez"], "/livez");
  const readyzQ = useApiQuery<any>(["k8s-readyz"], "/readyz");
  const healthzQ = useApiQuery<any>(["k8s-healthz"], "/healthz");
  // /metrics returns Prometheus text/plain — useApiQuery's JSON parser
  // would always reject it. Probe reachability via a raw fetch so the
  // pill reflects HTTP status rather than parser success.
  const metricsQ = useQuery({
    queryKey: ["k8s-metrics-probe"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/metrics`, { credentials: "include", headers: { ...nativeAuthHeaders() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true };
    },
    retry: false,
  });

  // Per-event DLQ list, separate from the topByType summary in `overview`
  // so the operator can replay or resolve a specific failed event row.
  const { data: dlqList, refetch: refetchDlq } = useApiQuery<{ entries: DlqEntry[]; total: number }>(
    ["admin-dlq-list"],
    "/admin/governance/event-dlq?unresolved=true",
  );

  const qc = useQueryClient();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  // Confirmation state for the DLQ "resolve" action — replaces window.confirm.
  const [confirmResolveId, setConfirmResolveId] = useState<number | null>(null);

  const refreshDlq = () => {
    refetchDlq();
    qc.invalidateQueries({ queryKey: ["admin-observability-overview"] });
    refetch();
  };

  const replayEntry = async (id: number) => {
    setBusyId(id);
    try {
      const res = await apiFetch<{ eventName?: string }>(`/admin/governance/event-dlq/${id}/replay`, { method: "POST" });
      toast({ title: "تم إعادة المحاولة", description: res.eventName ? `الحدث: ${res.eventName}` : undefined });
      refreshDlq();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر إعادة المحاولة", description: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const confirmedResolveEntry = async () => {
    const id = confirmResolveId;
    if (!id) return;
    setConfirmResolveId(null);
    setBusyId(id);
    try {
      await apiFetch(`/admin/governance/event-dlq/${id}`, { method: "DELETE" });
      toast({ title: "تم تعليم الحدث كمحلول" });
      refreshDlq();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التنفيذ", description: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const dlqEntries = dlqList?.entries ?? [];

  const anomalies = data?.anomalies ?? [];
  const queues = data?.queues?.eventBus;
  const dlq = queues?.dlq;
  const providers = data?.providers ?? [];
  const workers = data?.workers ?? [];
  const sla = data?.slaBreaches;
  const ai = data?.aiCosts;
  const aiErrorRate = ai && ai.totals.callsLast24h > 0
    ? Math.round((ai.totals.errorsLast24h / ai.totals.callsLast24h) * 1000) / 10
    : 0;

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const warningCount = anomalies.filter((a) => a.severity === "warning").length;

  const dlqColumns: DataTableColumn<DlqTop>[] = [
    { key: "type", header: "النوع", searchable: true, render: (r) => (
      <span className="font-medium text-xs">{r.type}</span>
    )},
    { key: "eventName", header: "اسم الحدث", render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.eventName ?? "—"}</span>
    )},
    { key: "count", header: "العدد", render: (r) => (
      <Badge variant="outline" className="font-mono">{r.count}</Badge>
    )},
    { key: "latestError", header: "آخر خطأ", render: (r) => (
      <span className="text-xs max-w-[400px] truncate block" title={r.latestError}>
        {r.latestError}
      </span>
    )},
    { key: "latestAt", header: "آخر ظهور", render: (r) => (
      <span className="text-xs">{formatDateAr(r.latestAt)}</span>
    )},
  ];

  const providerColumns: DataTableColumn<ProviderRow>[] = [
    { key: "channel", header: "القناة", searchable: true, render: (r) => (
      <span className="font-medium text-xs">{r.channel}</span>
    )},
    { key: "totalLast24h", header: "الإجمالي (24س)", render: (r) => (
      <span className="font-mono text-xs">{r.totalLast24h}</span>
    )},
    { key: "successRate", header: "نسبة النجاح", render: (r) => {
      const ok = r.successRate >= 95;
      const warn = r.successRate >= 80 && r.successRate < 95;
      return (
        <span className={cn(
          "font-mono text-xs font-semibold",
          ok && "text-status-success-foreground",
          warn && "text-status-warning-foreground",
          !ok && !warn && "text-status-error-foreground",
        )}>
          {r.successRate}%
        </span>
      );
    }},
    { key: "failed", header: "فاشلة", render: (r) => (
      <span className={cn("font-mono text-xs", r.failed > 0 && "text-status-error-foreground")}>
        {r.failed}
      </span>
    )},
    { key: "retrying", header: "إعادة محاولة", render: (r) => (
      <span className="font-mono text-xs">{r.retrying}</span>
    )},
    { key: "lastFailureAt", header: "آخر فشل", render: (r) => r.lastFailureAt ? (
      <span className="text-xs text-muted-foreground" title={r.lastFailureError ?? ""}>
        {formatDateAr(r.lastFailureAt)}
      </span>
    ) : (
      <span className="text-xs text-status-success-foreground">—</span>
    )},
  ];

  const workerColumns: DataTableColumn<WorkerRow>[] = [
    { key: "jobName", header: "المهمة", searchable: true, render: (r) => (
      <span className="font-medium text-xs">{r.jobName}</span>
    )},
    { key: "totalLast24h", header: "تشغيلات", render: (r) => (
      <span className="font-mono text-xs">{r.totalLast24h}</span>
    )},
    { key: "failed", header: "فاشلة", render: (r) => (
      <span className={cn("font-mono text-xs", r.failed > 0 && "text-status-error-foreground")}>
        {r.failed}
      </span>
    )},
    { key: "avgDurationMs", header: "متوسط المدة", render: (r) => (
      <span className="font-mono text-xs">{fmtMs(r.avgDurationMs)}</span>
    )},
    { key: "maxDurationMs", header: "أبطأ مدة", render: (r) => (
      <span className={cn(
        "font-mono text-xs",
        r.maxDurationMs > 60_000 && "text-status-warning-foreground font-semibold",
      )}>
        {fmtMs(r.maxDurationMs)}
      </span>
    )},
    { key: "lastStatus", header: "آخر حالة", render: (r) => (
      r.lastStatus ? <PageStatusBadge status={r.lastStatus} /> : <span className="text-xs">—</span>
    )},
    { key: "lastRunAt", header: "آخر تشغيل", render: (r) => (
      <span className="text-xs">{r.lastRunAt ? formatDateAr(r.lastRunAt) : "—"}</span>
    )},
  ];

  const aiDimColumns: DataTableColumn<AiCostByDim>[] = [
    { key: "key", header: "المفتاح", searchable: true, render: (r) => (
      <span className="font-mono text-xs font-medium">{r.key}</span>
    )},
    { key: "calls", header: "الطلبات", render: (r) => (
      <span className="font-mono text-xs">{r.calls}</span>
    )},
    { key: "totalTokens", header: "الرموز", render: (r) => (
      <span className="font-mono text-xs">{r.totalTokens.toLocaleString("ar-SA")}</span>
    )},
    { key: "costUsd", header: "التكلفة (USD)", render: (r) => (
      <span className="font-mono text-xs font-semibold">${r.costUsd.toFixed(4)}</span>
    )},
    { key: "errors", header: "أخطاء", render: (r) => (
      <span className={cn("font-mono text-xs", r.errors > 0 && "text-status-error-foreground font-semibold")}>
        {r.errors}
      </span>
    )},
  ];

  const slaColumns: DataTableColumn<SlaByEntity>[] = [
    { key: "entity", header: "الكيان", searchable: true, render: (r) => (
      <span className="font-medium text-xs">{r.entity}</span>
    )},
    { key: "count", header: "عدد الخروقات", render: (r) => (
      <Badge variant="outline" className="font-mono text-status-warning-foreground">{r.count}</Badge>
    )},
    { key: "latest", header: "أحدث خرق", render: (r) => (
      <span className="text-xs">{formatDateAr(r.latest)}</span>
    )},
  ];

  return (
    <PageShell
      title="مرصد المراقبة الموحّد"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مرصد المراقبة الموحّد" },
      ]}
      subtitle="رؤية موحّدة للطوابير، التكاملات، العمّال، خروقات الـ SLA، والشذوذات النشطة"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">

          {/* Infrastructure probes — Kubernetes liveness/readiness +
              Prometheus metrics. Failing probes show as red badges. */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={livezQ.isError ? "bg-status-error-surface text-status-error-foreground border-status-error-surface" : livezQ.data ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" : ""}>
              livez: {livezQ.isError ? "DOWN" : livezQ.isLoading ? "…" : "OK"}
            </Badge>
            <Badge variant="outline" className={readyzQ.isError ? "bg-status-error-surface text-status-error-foreground border-status-error-surface" : readyzQ.data ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" : ""}>
              readyz: {readyzQ.isError ? "NOT READY" : readyzQ.isLoading ? "…" : "OK"}
            </Badge>
            <Badge variant="outline" className={healthzQ.isError ? "bg-status-error-surface text-status-error-foreground border-status-error-surface" : healthzQ.data ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" : ""}>
              healthz: {healthzQ.isError ? "DOWN" : healthzQ.isLoading ? "…" : "OK"}
            </Badge>
            <Badge variant="outline" className={metricsQ.isError ? "bg-status-error-surface text-status-error-foreground border-status-error-surface" : "bg-status-success-surface text-status-success-foreground border-status-success-surface"}>
              /metrics: {metricsQ.isError ? "DOWN" : metricsQ.isLoading ? "…" : "exposed"}
            </Badge>
          </div>

          {/* ── 1. KPI strip ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className={cn(
              "border-0 shadow-sm",
              criticalCount > 0 ? "bg-status-error-surface" : warningCount > 0 ? "bg-status-warning-surface/50" : "bg-status-success-surface",
            )}>
              <CardContent className="p-4 flex items-center gap-3">
                {criticalCount > 0 ? <AlertOctagon className="w-8 h-8 text-status-error-foreground" /> :
                  warningCount > 0 ? <AlertTriangle className="w-8 h-8 text-status-warning-foreground" /> :
                  <CheckCircle2 className="w-8 h-8 text-status-success-foreground" />}
                <div>
                  <p className="text-sm font-semibold">شذوذات نشطة</p>
                  <p className="text-xs text-muted-foreground">
                    {criticalCount} حرجة، {warningCount} تحذير
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={cn(
              "border-0 shadow-sm",
              (dlq?.unresolved ?? 0) > 100 ? "bg-status-error-surface" :
              (dlq?.unresolved ?? 0) > 20 ? "bg-status-warning-surface/50" : "bg-status-info-surface",
            )}>
              <CardContent className="p-4 flex items-center gap-3">
                <Inbox className="w-8 h-8 text-status-info-foreground" />
                <div>
                  <p className="text-sm font-semibold">طابور الأحداث الفاشلة</p>
                  <p className="text-xs text-muted-foreground">
                    {dlq?.unresolved ?? 0} غير محلولة
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dlq?.resolvedLast24h ?? 0} حُلّت اليوم
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-status-info-surface">
              <CardContent className="p-4 flex items-center gap-3">
                <Activity className="w-8 h-8 text-status-info-foreground" />
                <div>
                  <p className="text-sm font-semibold">معدّل الأحداث</p>
                  <p className="text-xs text-muted-foreground">
                    {queues?.eventsLastHour ?? 0} / ساعة
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {queues?.eventsLast24h ?? 0} / 24 ساعة
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={cn(
              "border-0 shadow-sm",
              (sla?.last24h ?? 0) > 10 ? "bg-status-warning-surface/60" : "bg-status-success-surface",
            )}>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-8 h-8 text-status-warning-foreground" />
                <div>
                  <p className="text-sm font-semibold">خروقات SLA</p>
                  <p className="text-xs text-muted-foreground">
                    {sla?.last24h ?? 0} اليوم
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sla?.last7d ?? 0} خلال 7 أيام
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-status-info-surface">
              <CardContent className="p-4 flex items-center gap-3">
                <Bot className="w-8 h-8 text-status-info-foreground" />
                <div>
                  <p className="text-sm font-semibold">تكلفة الذكاء الاصطناعي</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    ${ai?.totals.costUsdLast24h.toFixed(4) ?? "0.0000"} / 24س
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ai?.totals.callsLast24h ?? 0} طلب
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── 2. Active anomalies ──────────────────────────────────── */}
          {anomalies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-status-error-foreground" />
                  الشذوذات النشطة ({anomalies.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {anomalies.map((a, i) => {
                  const style = SEVERITY_STYLE[a.severity];
                  const Icon = style.icon;
                  return (
                    <div key={i} className={cn("rounded p-3 border border-transparent flex items-start gap-3", style.bg)}>
                      <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", style.text)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn("text-xs font-semibold", style.text)}>
                            {severityLabel(a.severity)}
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">{a.rule}</span>
                        </div>
                        <p className="text-sm mt-1">{a.message}</p>
                        {a.metric && (
                          <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                            {a.metric}: <span className="font-semibold">{String(a.value)}</span> (حد: {String(a.threshold)})
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* ── 3. Queues (DLQ detail) ───────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Inbox className="w-4 h-4" />
                طابور الأحداث الفاشلة — تفصيل ({dlq?.topByType?.length ?? 0} نوع)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {dlq && dlq.topByType.length > 0 ? (
                <DataTable
                  columns={dlqColumns}
                  data={dlq.topByType}
                  noToolbar
                  pageSize={0}
                />
              ) : (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  لا توجد أحداث فاشلة غير محلولة. النظام نظيف.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 3.5 Individual DLQ entries — per-event replay/resolve ── */}
          {dlqEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Inbox className="w-4 h-4" />
                  الأحداث الفاشلة — قائمة كاملة ({dlqEntries.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    { key: "eventName", header: "الحدث", searchable: true, render: (r) => (
                      <span className="font-mono text-xs">{r.eventName ?? "—"}</span>
                    )},
                    { key: "type", header: "النوع", render: (r) => (
                      <span className="text-xs text-muted-foreground">{r.type}</span>
                    )},
                    { key: "error", header: "الخطأ", render: (r) => (
                      <span className="text-xs max-w-[400px] truncate block" title={r.error ?? ""}>{r.error ?? "—"}</span>
                    )},
                    { key: "retryCount", header: "محاولات", render: (r) => (
                      <span className="font-mono text-xs">{r.retryCount}</span>
                    )},
                    { key: "createdAt", header: "وقت الفشل", render: (r) => (
                      <span className="text-xs text-muted-foreground">{formatDateAr(r.createdAt)}</span>
                    )},
                    { key: "actions", header: "", render: (r) => (
                      <div className="flex items-center gap-1">
                        <GuardedButton
                          perm="admin:update"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => replayEntry(r.id)}
                          disabled={busyId === r.id || !r.eventName}
                          title={r.eventName ? "إعادة المحاولة" : "اسم الحدث مفقود"}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </GuardedButton>
                        <GuardedButton
                          perm="admin:update"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-status-error-foreground"
                          onClick={() => setConfirmResolveId(r.id)}
                          disabled={busyId === r.id}
                          title="إزالة من القائمة"
                        >
                          <Trash2 className="h-3 w-3" />
                        </GuardedButton>
                      </div>
                    )},
                  ] as DataTableColumn<DlqEntry>[]}
                  data={dlqEntries}
                  noToolbar
                  pageSize={20}
                />
              </CardContent>
            </Card>
          )}

          {/* ── 4. Providers ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Plug className="w-4 h-4" />
                صحة مزوّدي الخدمات ({providers.length} قناة)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {providers.length > 0 ? (
                <DataTable
                  columns={providerColumns}
                  data={providers}
                  noToolbar
                  pageSize={0}
                />
              ) : (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  لا توجد طلبات تكامل خلال آخر 24 ساعة.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 5. Workers ───────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                صحة المهام المجدولة ({workers.length} مهمة)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {workers.length > 0 ? (
                <DataTable
                  columns={workerColumns}
                  data={workers}
                  noToolbar
                  pageSize={0}
                />
              ) : (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  لا توجد تشغيلات مهام مجدولة خلال آخر 24 ساعة.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 6. SLA breaches by entity ────────────────────────────── */}
          {sla && sla.byEntity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  خروقات SLA حسب الكيان ({sla.byEntity.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={slaColumns}
                  data={sla.byEntity}
                  noToolbar
                  pageSize={0}
                />
              </CardContent>
            </Card>
          )}

          {/* ── 7. AI cost tracking ───────────────────────────────────── */}
          {ai && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  تكلفة الذكاء الاصطناعي
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* AI totals strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-status-info-surface rounded p-3">
                    <p className="text-xs text-muted-foreground">عدد الطلبات (24س)</p>
                    <p className="text-lg font-semibold font-mono">{ai.totals.callsLast24h.toLocaleString("ar-SA")}</p>
                    <p className="text-[11px] text-muted-foreground">{ai.totals.callsLast7d.toLocaleString("ar-SA")} خلال 7 أيام</p>
                  </div>
                  <div className={cn(
                    "rounded p-3",
                    aiErrorRate > 25 ? "bg-status-error-surface" : aiErrorRate > 10 ? "bg-status-warning-surface/60" : "bg-status-success-surface",
                  )}>
                    <p className="text-xs text-muted-foreground">نسبة الأخطاء</p>
                    <p className="text-lg font-semibold font-mono">{aiErrorRate}%</p>
                    <p className="text-[11px] text-muted-foreground">{ai.totals.errorsLast24h} فشل</p>
                  </div>
                  <div className="bg-status-info-surface rounded p-3">
                    <p className="text-xs text-muted-foreground">الرموز المستهلكة (24س)</p>
                    <p className="text-lg font-semibold font-mono">{(ai.totals.promptTokensLast24h + ai.totals.completionTokensLast24h).toLocaleString("ar-SA")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ai.totals.promptTokensLast24h.toLocaleString("ar-SA")} prompt / {ai.totals.completionTokensLast24h.toLocaleString("ar-SA")} completion
                    </p>
                  </div>
                  <div className="bg-status-info-surface rounded p-3">
                    <p className="text-xs text-muted-foreground">التكلفة (24س)</p>
                    <p className="text-lg font-semibold font-mono">${ai.totals.costUsdLast24h.toFixed(4)}</p>
                    <p className="text-[11px] text-muted-foreground">${ai.totals.costUsdLast7d.toFixed(4)} خلال 7 أيام</p>
                  </div>
                </div>

                {/* By model */}
                {ai.byModel.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Sparkles className="w-3 h-3" />
                      حسب النموذج (24س)
                    </h4>
                    <DataTable
                      columns={aiDimColumns}
                      data={ai.byModel}
                      noToolbar
                      pageSize={0}
                    />
                  </div>
                )}

                {/* By feature */}
                {ai.byFeature.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Sparkles className="w-3 h-3" />
                      حسب الميزة (24س)
                    </h4>
                    <DataTable
                      columns={aiDimColumns}
                      data={ai.byFeature}
                      noToolbar
                      pageSize={0}
                    />
                  </div>
                )}

                {ai.byModel.length === 0 && ai.byFeature.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    لا توجد طلبات ذكاء اصطناعي خلال آخر 24 ساعة.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {data?.collectedAt && (
            <p className="text-xs text-muted-foreground text-end">
              آخر تحديث: {formatDateAr(data.collectedAt)} — نافذة {data.windowHours} ساعة
            </p>
          )}
        </div>
      </PageStateWrapper>
      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={confirmResolveId !== null}
        onOpenChange={(o) => { if (!o) setConfirmResolveId(null); }}
        variant="caution"
        title="تأكيد إزالة الحدث"
        description="سيتم تعليم الحدث كمحلول وحذفه من قائمة الفشل بدون إعادة محاولة. متابعة؟"
        confirmLabel="تأكيد الإزالة"
        onConfirm={confirmedResolveEntry}
      />
    </PageShell>
  );
}
