import { useState } from "react";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Activity, Database, Clock, AlertTriangle, Shield,
  Server, CheckCircle, XCircle, Users, Building2,
  HardDrive, Cpu, MemoryStick, RefreshCw, Plug, Gauge,
  Power, PowerOff, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";

interface SystemStopRow {
  id: number;
  scope: string;
  reason: string;
  active: boolean;
  activatedBy: number | null;
  activatedByName: string | null;
  deactivatedBy: number | null;
  deactivatedAt: string | null;
  createdAt: string;
}

function SystemStopsCard() {
  const { data, refetch } = useApiQuery<{ data: SystemStopRow[] }>(
    ["admin-system-stops"],
    "/admin/system-stops",
  );
  const stops = data?.data ?? [];
  const active = stops.filter((s) => s.active);

  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newScope, setNewScope] = useState<string>("all");
  const [newReason, setNewReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  // Confirmation state replaces window.confirm for create + deactivate flows.
  // `confirmCreate` true ⇒ show the "activate system stop" confirm dialog;
  // `confirmDeactivateId` non-null ⇒ show the "deactivate" confirm dialog
  // for that specific stop row.
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["system-health"] });
  };

  // Validates the form fields and opens the confirm dialog. Actual POST
  // happens in confirmedCreateStop after the operator confirms.
  const requestCreateStop = () => {
    if (!newReason.trim()) {
      toast({ variant: "destructive", title: "سبب الإيقاف مطلوب" });
      return;
    }
    setConfirmCreate(true);
  };
  const confirmedCreateStop = async () => {
    setConfirmCreate(false);
    setBusy(true);
    try {
      await apiFetch("/admin/system-stops", {
        method: "POST",
        body: JSON.stringify({ scope: newScope, reason: newReason.trim() }),
      });
      toast({ title: "تم تفعيل الإيقاف" });
      setCreateOpen(false);
      setNewReason("");
      refreshAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التفعيل", description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const confirmedDeactivateStop = async () => {
    const id = confirmDeactivateId;
    if (!id) return;
    setConfirmDeactivateId(null);
    setDeactivatingId(id);
    try {
      await apiFetch(`/admin/system-stops/${id}/deactivate`, { method: "PATCH" });
      toast({ title: "تم إلغاء التفعيل" });
      refreshAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التنفيذ", description: err.message });
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <>
      <Card className={cn("border-2", active.length > 0 ? "border-status-error-surface bg-status-error-surface/30" : "")}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <PowerOff className={cn("w-4 h-4", active.length > 0 ? "text-status-error-foreground" : "text-muted-foreground")} />
              إيقافات النظام {active.length > 0 && <Badge variant="destructive">{active.length} نشطة</Badge>}
            </span>
            <GuardedButton
              perm="admin:update"
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-3 h-3 me-1" />تفعيل إيقاف
            </GuardedButton>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stops.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              لا توجد إيقافات مسجلة. النظام يعمل بشكل كامل.
            </p>
          ) : (
            <DataTable
              columns={[
                { key: "scope", header: "النطاق", render: (r) => (
                  <Badge variant="outline" className="font-mono text-xs">{r.scope}</Badge>
                )},
                { key: "reason", header: "السبب", render: (r) => (
                  <span className="text-xs max-w-[400px] truncate block" title={r.reason}>{r.reason}</span>
                )},
                { key: "active", header: "الحالة", render: (r) => r.active ? (
                  <Badge variant="destructive" className="text-xs">نشط</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">متوقف</Badge>
                )},
                { key: "activatedByName", header: "فعّل بواسطة", render: (r) => (
                  <span className="text-xs">{r.activatedByName || "—"}</span>
                )},
                { key: "createdAt", header: "تاريخ التفعيل", render: (r) => (
                  <span className="text-xs">{formatDateAr(r.createdAt)}</span>
                )},
                { key: "actions", header: "", render: (r) => r.active ? (
                  <GuardedButton
                    perm="admin:update"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmDeactivateId(r.id)}
                    disabled={deactivatingId === r.id}
                    title="إلغاء التفعيل"
                  >
                    <Power className="w-3 h-3" />
                  </GuardedButton>
                ) : null },
              ] as DataTableColumn<SystemStopRow>[]}
              data={stops}
              noToolbar
              pageSize={10}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setNewReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-status-error-foreground">
              <PowerOff className="h-4 w-4" />
              تفعيل إيقاف نظام
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">النطاق</Label>
              <Select value={newScope} onValueChange={setNewScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل النظام</SelectItem>
                  <SelectItem value="financial">المالية فقط</SelectItem>
                  <SelectItem value="hr">الموارد البشرية فقط</SelectItem>
                  <SelectItem value="operational">العمليات فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">سبب الإيقاف</Label>
              <Textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="مثال: صيانة قواعد البيانات — متوقع 30 دقيقة"
                rows={3}
              />
            </div>
            <div className="rounded-md bg-status-error-surface border border-status-error-surface p-3 text-xs text-status-error-foreground">
              ⚠️ سيؤدي تفعيل الإيقاف إلى منع المستخدمين من تنفيذ عمليات في النطاق المختار حتى يتم إلغاء التفعيل.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={busy || !newReason.trim()}
              onClick={requestCreateStop}
              rateLimitAware
            >
              تفعيل الإيقاف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={confirmCreate}
        onOpenChange={(o) => { if (!o) setConfirmCreate(false); }}
        variant="caution"
        title="تأكيد تفعيل الإيقاف"
        description={`سيتم تفعيل إيقاف النظام للنطاق "${newScope}". متابعة؟`}
        confirmLabel="تأكيد التفعيل"
        onConfirm={confirmedCreateStop}
      />

      <ConfirmActionDialog
        open={confirmDeactivateId !== null}
        onOpenChange={(o) => { if (!o) setConfirmDeactivateId(null); }}
        variant="caution"
        title="تأكيد إلغاء التفعيل"
        description="سيتم إلغاء تفعيل إيقاف النظام. متابعة؟"
        confirmLabel="تأكيد الإلغاء"
        onConfirm={confirmedDeactivateStop}
      />
    </>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} يوم ${h} ساعة`;
  if (h > 0) return `${h} ساعة ${m} دقيقة`;
  return `${m} دقيقة`;
}

interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error";
  detail?: string;
}

interface DependencyEdge {
  from: string;
  to: string;
  via: string;
}

interface DependencyNode {
  id: string;
  label: string;
  glIntegration: boolean;
}

export default function AdminMonitoring() {
  const { data: health, isLoading, error, refetch } = useApiQuery<any>(["system-health"], "/admin/system-health");
  // Lightweight rolled-up widget — GET /admin/api-health returns
  // uptime + per-service ok/degraded summary. Surfaced as a small badge
  // strip at the top of the page; fast to load and good as a "is the API
  // up at all?" quick check.
  const apiHealthQ = useApiQuery<any>(["admin-api-health"], "/admin/api-health");
  // Lower-level operational endpoints under /health/* — schema integrity,
  // raw Prometheus counters, environment-config dump, system tuning.
  // Rendered as a tabbed "snapshot" panel for SRE-level debugging.
  const healthSchemaQ = useApiQuery<any>(["health-schema"], "/health/schema");
  const healthMetricsQ = useApiQuery<any>(["health-metrics"], "/health/metrics");
  const healthConfigQ = useApiQuery<any>(["health-config"], "/health/config");
  const healthSystemQ = useApiQuery<any>(["health-system"], "/health/system");

  // Per-check health detail — granular alternative to the rolled-up
  // /system-health response. Surfaces individual checks (database,
  // domain_tables, etc.) as their own pass/warn/fail rows.
  const { data: healthChecksResp } = useApiQuery<{ checks?: HealthCheck[] } | HealthCheck[]>(
    ["system-health-checks"],
    "/admin/system-health-checks",
  );
  const healthChecks: HealthCheck[] = Array.isArray(healthChecksResp)
    ? healthChecksResp
    : healthChecksResp?.checks ?? [];

  // Cross-domain dependency graph derived from GL integration + event
  // catalog consumers. Same data the architecture docs reference but
  // computed live from the registry.
  const { data: depGraph } = useApiQuery<{
    nodes: DependencyNode[];
    edges: DependencyEdge[];
    totalDependencies: number;
  }>(["system-dependency-graph"], "/admin/system-health/dependency-graph");
  const depEdges = depGraph?.edges ?? [];

  const services = health?.services || {};
  const memUsage = health?.memoryUsage || {};
  const counts = health?.counts || {};
  const security = health?.security || {};
  const redisRateLimit: "connected" | "fallback-memory" | "disabled" | undefined =
    services.redisRateLimit;
  const cronJobs = health?.cronJobs || [];
  const recentCronLogs = health?.recentCronLogs || [];
  const recentErrors = health?.recentErrors || [];

  // Split cron jobs into failed vs healthy so the failed ones surface at
  // the top of the page with full error detail instead of being hidden in
  // a 150px-wide truncated cell. When the user sees "أخطاء Cron: 13" on
  // the dashboard this is the page that must tell them WHICH 13.
  const failedCronJobs = cronJobs.filter((j: any) => j.lastStatus === "failed" && j.isActive);
  const healthyCronJobs = cronJobs.filter((j: any) => j.lastStatus !== "failed" || !j.isActive);

  const cronJobColumns: DataTableColumn<any>[] = [
    { key: "name", header: "المهمة", searchable: true, render: (r: any) => <span className="font-medium text-xs">{r.name}</span> },
    { key: "schedule", header: "الجدول", render: (r: any) => <span className="font-mono text-xs text-muted-foreground">{r.schedule}</span> },
    { key: "lastRunAt", header: "آخر تشغيل", render: (r: any) => <span className="text-xs">{r.lastRunAt ? formatDateAr(r.lastRunAt) : "-"}</span> },
    { key: "lastStatus", header: "الحالة", render: (r: any) => (
      <div className="flex items-center gap-1">
        {r.isActive ? (
          <CheckCircle className="w-3 h-3 text-status-success" />
        ) : (
          <XCircle className="w-3 h-3 text-muted-foreground" />
        )}
        {r.lastStatus && <PageStatusBadge status={r.lastStatus} />}
      </div>
    )},
  ];

  const cronLogColumns: DataTableColumn<any>[] = [
    { key: "jobName", header: "المهمة", searchable: true, render: (r: any) => <span className="font-medium text-xs">{r.jobName}</span> },
    { key: "status", header: "الحالة", render: (r: any) => <PageStatusBadge status={r.status} /> },
    { key: "duration", header: "المدة", render: (r: any) => <span className="text-xs">{r.duration ? `${r.duration}ms` : "-"}</span> },
    { key: "createdAt", header: "التاريخ", render: (r: any) => <span className="text-xs">{formatDateAr(r.createdAt)}</span> },
  ];

  const errorColumns: DataTableColumn<any>[] = [
    { key: "action", header: "الإجراء", searchable: true, render: (r: any) => <span className="font-medium text-xs text-status-error-foreground">{r.action}</span> },
    { key: "entity", header: "الوحدة", render: (r: any) => <span className="text-xs">{r.entity || "-"}</span> },
    { key: "details", header: "التفاصيل", render: (r: any) => {
      // M3 fix: previously dumped JSON.stringify(r.details) unwrapped,
      // overflowing the cell with nested objects like {"stack":"...","cause":{...}}.
      // Now show a one-line summary (top-level error/message/code/fix)
      // with title-tooltip carrying the pretty-printed full payload.
      if (r.details == null) return <span className="text-xs text-muted-foreground">-</span>;
      if (typeof r.details !== "object") return <span className="text-xs max-w-[300px] truncate block">{String(r.details)}</span>;
      const d = r.details as Record<string, unknown>;
      const summary = String(d.error ?? d.message ?? d.code ?? d.fix ?? Object.keys(d)[0] ?? "(تفاصيل)");
      const full = JSON.stringify(d, null, 2);
      return <span className="text-xs max-w-[300px] truncate block" title={full}>{summary}</span>;
    } },
    { key: "createdAt", header: "التاريخ", render: (r: any) => <span className="text-xs">{formatDateAr(r.createdAt)}</span> },
  ];

  return (
    <PageShell
      title="مركز المراقبة"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مركز المراقبة" },
      ]}
      subtitle="مراقبة صحة النظام والخدمات"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !health} error={error} onRetry={refetch}>
      <div className="space-y-6">

      {/* الرولد-أب API health (نقطة بسيطة "هل الـ API يعمل؟") */}
      {apiHealthQ.data && (
        <div className="flex items-center gap-2 text-xs border rounded p-2 bg-muted/30">
          <Badge variant={apiHealthQ.data.status === "ok" ? "default" : "destructive"} className="text-[10px]">
            {apiHealthQ.data.status}
          </Badge>
          <span className="text-muted-foreground">
            uptime: <span className="font-mono">{Math.round(Number(apiHealthQ.data.uptime ?? 0))}s</span>
          </span>
          {apiHealthQ.data.services && Object.entries(apiHealthQ.data.services).map(([k, v]) => (
            <span key={k} className="text-muted-foreground">
              {k}: <span className={String(v) === "ok" ? "text-status-success-foreground font-medium" : "text-status-error-foreground"}>{String(v)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Low-level health probes — these are SRE-facing snapshots. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded border p-2 bg-muted/30">
          <p className="text-muted-foreground">حالة المخطط</p>
          <p className={`font-mono ${
            healthSchemaQ.isError || healthSchemaQ.data?.status === "critical"
              ? "text-status-error-foreground"
              : "text-status-success-foreground"
          }`}>
            {healthSchemaQ.isError ? "غير متاح" : (healthSchemaQ.data?.status ?? "—")}
          </p>
        </div>
        <div className="rounded border p-2 bg-muted/30">
          <p className="text-muted-foreground">عدد الـ counters</p>
          <p className="font-mono">
            {healthMetricsQ.data?.counters
              ? Object.keys(healthMetricsQ.data.counters).length
              : healthMetricsQ.isError ? "—" : healthMetricsQ.isLoading ? "…" : "0"}
          </p>
        </div>
        <div className="rounded border p-2 bg-muted/30">
          <p className="text-muted-foreground">إعدادات البيئة</p>
          <p className="font-mono">
            {healthConfigQ.data?.nodeEnv ?? (healthConfigQ.isError ? "—" : "?")}
          </p>
        </div>
        <div className="rounded border p-2 bg-muted/30">
          <p className="text-muted-foreground">معلومات الجهاز</p>
          <p className="font-mono">
            {healthSystemQ.data?.liveness?.uptimeSec != null
              ? `${Math.round(Number(healthSystemQ.data.liveness.uptimeSec) / 3600)} ساعة`
              : healthSystemQ.isError ? "—" : "…"}
          </p>
        </div>
      </div>

      {/* Rate-limit backend banner — surfaces the silent fallback to per-process
          MemoryStore so an operator can investigate before the cap actually
          gets bypassed across replicas. See artifacts/api-server/src/lib/rateLimitStore.ts. */}
      {redisRateLimit && redisRateLimit !== "connected" && (
        <Card className={cn(
          "border",
          redisRateLimit === "fallback-memory"
            ? "border-status-warning-surface bg-status-warning-surface/40"
            : "border-border bg-surface-subtle/60",
        )}>
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className={cn(
              "w-5 h-5 mt-0.5 shrink-0",
              redisRateLimit === "fallback-memory" ? "text-status-warning-foreground" : "text-muted-foreground",
            )} />
            <div className="text-sm">
              <p className="font-semibold mb-0.5">
                {redisRateLimit === "fallback-memory"
                  ? "تنبيه: تحديد المعدل يعمل بالذاكرة المحلية فقط"
                  : "تحديد المعدل غير مفعّل عبر Redis"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {redisRateLimit === "fallback-memory"
                  ? "تعذّر الاتصال بخادم Redis، لذا تُفرض حدود الطلبات داخل كل نسخة من الخادم على حدة وتُمسح عند إعادة التشغيل. الحدود لا تزال تعمل، لكنها أضعف من المعتاد. يُرجى مراجعة المتغيّر REDIS_URL وحالة Upstash."
                  : "متغيّر REDIS_URL غير مضبوط، لذا تُحفظ عدّادات تحديد المعدل في ذاكرة العملية فقط. هذا مقبول في بيئة التطوير، أمّا في الإنتاج فيُفضَّل إعداد Redis مشترك."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed cron jobs banner — full error text, sorted to the top */}
      {failedCronJobs.length > 0 && (
        <Card className="border-status-error-surface bg-status-error-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-status-error-foreground">
              <AlertTriangle className="w-4 h-4" />
              مهام مجدولة فاشلة ({failedCronJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {failedCronJobs.map((job: any, i: number) => (
              <div key={i} className="bg-white border border-status-error-surface rounded p-3 text-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-status-error-foreground">{job.name}</p>
                    {job.description && <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      الجدولة: <span className="font-mono">{job.schedule}</span>
                      {job.lastRunAt && <span className="ms-2">— آخر تشغيل: {formatDateAr(job.lastRunAt)}</span>}
                    </p>
                  </div>
                </div>
                {job.lastError && (
                  <div className="mt-2 bg-status-error-surface border border-status-error-surface rounded p-2">
                    <p className="text-[10px] font-medium text-status-error-foreground mb-0.5">تفاصيل الخطأ:</p>
                    <pre className="text-xs text-status-error-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {job.lastError}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={cn("border-0 shadow-sm", services.api?.status === "healthy" ? "bg-status-success-surface" : "bg-status-error-surface")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Server className={cn("w-8 h-8", services.api?.status === "healthy" ? "text-status-success-foreground" : "text-status-error-foreground")} />
            <div>
              <p className="text-sm font-semibold">خادم الربط البرمجي</p>
              <p className="text-xs text-muted-foreground">{services.api?.status === "healthy" ? "يعمل" : "متوقف"}</p>
              <p className="text-xs text-muted-foreground">{formatUptime(services.api?.uptime || 0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-0 shadow-sm", services.database?.status === "healthy" ? "bg-status-success-surface" : "bg-status-error-surface")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Database className={cn("w-8 h-8", services.database?.status === "healthy" ? "text-status-success-foreground" : "text-status-error-foreground")} />
            <div>
              <p className="text-sm font-semibold">قاعدة البيانات</p>
              <p className="text-xs text-muted-foreground">{services.database?.status === "healthy" ? "متصل" : "خطأ"}</p>
              <p className="text-xs text-muted-foreground">{services.database?.latency}ms | {services.database?.size}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-status-info-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-status-info-foreground" />
            <div>
              <p className="text-sm font-semibold">مهام مجدولة</p>
              <p className="text-xs text-muted-foreground">{services.crons?.active || 0} نشطة من {services.crons?.total || 0}</p>
              {(services.crons?.failed || 0) > 0 && <p className="text-xs text-status-error">{services.crons?.failed} فاشلة</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-indigo-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Plug className="w-8 h-8 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold">التكاملات</p>
              <p className="text-xs text-muted-foreground">{services.integrations?.active || 0} نشطة من {services.integrations?.total || 0}</p>
              {(services.integrations?.pendingMessages || 0) > 0 && <p className="text-xs text-status-warning">{services.integrations?.pendingMessages} رسالة معلقة</p>}
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "border-0 shadow-sm",
          redisRateLimit === "connected" ? "bg-status-success-surface"
            : redisRateLimit === "fallback-memory" ? "bg-status-warning-surface/50"
            : "bg-surface-subtle/60",
        )}>
          <CardContent className="p-4 flex items-center gap-3">
            <Gauge className={cn(
              "w-8 h-8",
              redisRateLimit === "connected" ? "text-status-success-foreground"
                : redisRateLimit === "fallback-memory" ? "text-status-warning-foreground"
                : "text-muted-foreground",
            )} />
            <div>
              <p className="text-sm font-semibold">تحديد المعدل (Redis)</p>
              <p className="text-xs text-muted-foreground">
                {redisRateLimit === "connected" ? "متصل ومشترك"
                  : redisRateLimit === "fallback-memory" ? "ذاكرة محلية (احتياطي)"
                  : redisRateLimit === "disabled" ? "غير مفعّل"
                  : "غير معروف"}
              </p>
              <p className="text-xs text-muted-foreground">
                {redisRateLimit === "connected" ? "حدود الطلبات تُحفظ في Redis"
                  : redisRateLimit === "fallback-memory" ? "حدود تُفرض داخل النسخة فقط"
                  : "REDIS_URL غير مضبوط"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="w-4 h-4" />استخدام الذاكرة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>الذاكرة المقيمة</span><span>{formatBytes(memUsage.rss)}</span></div>
            <div className="flex justify-between text-sm"><span>الذاكرة المستخدمة</span><span>{formatBytes(memUsage.heapUsed)}</span></div>
            <div className="flex justify-between text-sm"><span>إجمالي الذاكرة</span><span>{formatBytes(memUsage.heapTotal)}</span></div>
            <div className="flex justify-between text-sm"><span>الذاكرة الخارجية</span><span>{formatBytes(memUsage.external)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardDrive className="w-4 h-4" />إحصائيات التخزين</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>حجم قاعدة البيانات</span><span className="font-semibold">{services.database?.size || "غير متوفر"}</span></div>
            <div className="flex justify-between text-sm"><span>عدد الجداول</span><span className="font-semibold">{services.database?.tables || 0}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" />الأمان</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>محاولات دخول فاشلة (24 س)</span>
              <span className={cn("font-semibold", security.failedLogins24h > 10 ? "text-status-error-foreground" : "text-status-success-foreground")}>
                {security.failedLogins24h || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm"><span>المستخدمين</span><span className="font-semibold">{counts.users || 0}</span></div>
            <div className="flex justify-between text-sm"><span>الشركات</span><span className="font-semibold">{counts.companies || 0}</span></div>
            <div className="flex justify-between text-sm"><span>الموظفين</span><span className="font-semibold">{counts.employees || 0}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />المهام المجدولة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={cronJobColumns}
              data={healthyCronJobs}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد مهام مجدولة"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />آخر تنفيذات المهام</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={cronLogColumns}
              data={recentCronLogs}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد سجلات"
            />
          </CardContent>
        </Card>
      </div>

      {recentErrors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-status-error" />أحدث الأخطاء</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={errorColumns}
              data={recentErrors}
              noToolbar
              pageSize={0}
            />
          </CardContent>
        </Card>
      )}

      {healthChecks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              فحوصات الصحة التفصيلية ({healthChecks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-subtle">
                  <th className="text-start p-2">الفحص</th>
                  <th className="text-start p-2">الحالة</th>
                  <th className="text-start p-2">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {healthChecks.map((c) => (
                  <tr key={c.name} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-mono text-xs">{c.name}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        c.status === "ok" && "bg-status-success-surface text-status-success-foreground",
                        c.status === "warn" && "bg-status-warning-surface text-status-warning-foreground",
                        c.status === "error" && "bg-status-error-surface text-status-error-foreground",
                      )}>
                        {c.status === "ok" ? "OK" : c.status === "warn" ? "تحذير" : "خطأ"}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{c.detail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </CardContent>
        </Card>
      )}

      {depEdges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="w-4 h-4" />
              خريطة التبعيات بين الوحدات ({depEdges.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-subtle">
                  <th className="text-start p-2">من</th>
                  <th className="text-start p-2">إلى</th>
                  <th className="text-start p-2">عبر</th>
                </tr>
              </thead>
              <tbody>
                {depEdges.map((e, i) => (
                  <tr key={`${e.from}->${e.to}:${e.via}:${i}`} className="border-t hover:bg-muted/30">
                    <td className="p-2"><Badge variant="outline" className="text-xs">{e.from}</Badge></td>
                    <td className="p-2"><Badge variant="outline" className="text-xs">{e.to}</Badge></td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{e.via}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </CardContent>
        </Card>
      )}

      <SystemStopsCard />
      </div>
      </PageStateWrapper>
    </PageShell>
  );
}
