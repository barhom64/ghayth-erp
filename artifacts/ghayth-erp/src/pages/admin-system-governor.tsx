import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatDateAr } from "@/lib/formatters";
import {
  Shield, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, CheckCircle,
  Activity, Inbox, Pause, RotateCw, Trash2, Plus,
} from "lucide-react";

interface DlqEntry {
  id: number;
  type: string;
  eventName: string;
  error: string;
  retryCount: number;
  createdAt: string;
}

interface SystemHealthCheck {
  id: number;
  name: string;
  category: string;
  status: string;
  lastChecked: string | null;
  details: string | null;
}

interface SystemStop {
  id: number;
  scope: string;
  reason: string;
  active: boolean;
  createdAt: string;
}

export default function AdminSystemGovernor() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["system-guards"], "/admin/governance/system-guards"
  );

  // Event DLQ — events that failed to dispatch and parked for replay.
  const { data: dlqResp, refetch: refetchDlq } = useApiQuery<{ entries: DlqEntry[]; summary: any[] }>(
    ["admin-event-dlq"], "/admin/governance/event-dlq",
  );
  const dlqEntries: DlqEntry[] = dlqResp?.entries ?? [];

  const dlqReplayMut = useApiMutation<unknown, number>(
    (id) => `/admin/governance/event-dlq/${id}/replay`,
    "POST",
    [["admin-event-dlq"]],
    { successMessage: "أُعيد تشغيل الحدث" },
  );
  const dlqDeleteMut = useApiMutation<unknown, number>(
    (id) => `/admin/governance/event-dlq/${id}`,
    "DELETE",
    [["admin-event-dlq"]],
    { successMessage: "تم حذف السجل" },
  );

  // System health checks + dependency graph.
  const { data: healthResp } = useApiQuery<{ checks: SystemHealthCheck[] }>(
    ["admin-system-health-checks"], "/admin/system-health-checks",
  );
  const healthChecks: SystemHealthCheck[] = healthResp?.checks ?? [];
  const { data: depGraphResp } = useApiQuery<{ nodes: any[]; edges: any[] }>(
    ["admin-system-health-graph"], "/admin/system-health/dependency-graph",
  );

  // System stops — temporary "halt this scope" markers used in
  // governance scenarios (e.g. tax-cert expired → block invoice
  // posting until refresh).
  const { data: stopsResp, refetch: refetchStops } = useApiQuery<{ data: SystemStop[] }>(
    ["admin-system-stops"], "/admin/system-stops",
  );
  const stops: SystemStop[] = stopsResp?.data ?? [];

  const deactivateStopMut = useApiMutation<unknown, number>(
    (id) => `/admin/system-stops/${id}/deactivate`,
    "PATCH",
    [["admin-system-stops"]],
    { successMessage: "تم إيقاف الحظر" },
  );

  // POST /admin/system-stops — admin creates a manual halt for a
  // scope (financial / hr / operational / all). Used in incident
  // response, e.g. block all journal posting until a data issue is
  // resolved.
  const createStopMut = useApiMutation<unknown, { scope: string; reason: string }>(
    "/admin/system-stops",
    "POST",
    [["admin-system-stops"]],
    { successMessage: "تم تفعيل الإيقاف" },
  );
  const { toast: stopToast } = useToast();
  const [stopOpen, setStopOpen] = useState(false);
  const [stopScope, setStopScope] = useState<"financial" | "hr" | "operational" | "all">("all");
  const [stopReason, setStopReason] = useState("");
  const submitNewStop = () => {
    if (!stopReason.trim()) {
      stopToast({ variant: "destructive", title: "السبب مطلوب" });
      return;
    }
    createStopMut.mutate(
      { scope: stopScope, reason: stopReason.trim() },
      {
        onSuccess: () => {
          setStopOpen(false);
          setStopReason("");
          setStopScope("all");
        },
      },
    );
  };

  // Pages registry — what's mounted in the SystemRegistry vs what
  // the UI actually exposes. Useful for the audit team.
  const { data: pagesResp } = useApiQuery<{ pages: any[] }>(
    ["admin-system-registry-pages"], "/admin/system-registry/pages",
  );
  const registryPages: any[] = pagesResp?.pages ?? [];

  // Events catalogue + recent log + stats. The catalogue lists every
  // event the engine knows how to emit; the log is the actual feed.
  const { data: eventsCatalogResp } = useApiQuery<{ events?: any[]; data?: any[] }>(
    ["admin-events-catalog"], "/events/catalog",
  );
  const eventsCatalog: any[] = eventsCatalogResp?.events ?? eventsCatalogResp?.data ?? [];
  const { data: eventsLogResp } = useApiQuery<{ data?: any[]; rows?: any[] }>(
    ["admin-events-log"], "/events/log",
  );
  const eventsLog: any[] = eventsLogResp?.data ?? eventsLogResp?.rows ?? [];
  const { data: eventsStatsResp } = useApiQuery<any>(
    ["admin-events-log-stats"], "/events/log/stats",
  );
  const eventsStats = eventsStatsResp?.data ?? eventsStatsResp;

  const allowed = data?.allowed ?? true;
  const violations = data?.violations ?? [];

  return (
    <PageShell
      title="حاكم النظام"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "حاكم النظام" },
      ]}
      subtitle="الحراسات المركزية التي تتحكم في تشغيل العمليات"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />فحص
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <Tabs defaultValue="guards" className="space-y-4">
          <TabsList>
            <TabsTrigger value="guards"><Shield className="h-4 w-4 me-1" />الحراسات</TabsTrigger>
            <TabsTrigger value="dlq"><Inbox className="h-4 w-4 me-1" />أحداث فاشلة ({dlqEntries.length})</TabsTrigger>
            <TabsTrigger value="health"><Activity className="h-4 w-4 me-1" />صحة النظام ({healthChecks.length})</TabsTrigger>
            <TabsTrigger value="stops"><Pause className="h-4 w-4 me-1" />الإيقافات ({stops.filter((s) => s.active).length})</TabsTrigger>
            <TabsTrigger value="events">سجل الأحداث ({eventsLog.length})</TabsTrigger>
            <TabsTrigger value="pages">سجل الصفحات ({registryPages.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="guards" className="space-y-6">
          <Card className={allowed ? "border-status-success-surface bg-status-success-surface" : "border-status-error-surface bg-status-error-surface"}>
            <CardContent className="p-6 flex items-center gap-4">
              {allowed ? (
                <ShieldCheck className="w-12 h-12 text-status-success-foreground" />
              ) : (
                <ShieldAlert className="w-12 h-12 text-status-error-foreground" />
              )}
              <div>
                <p className="text-lg font-bold">
                  {allowed ? "جميع الحراسات ناجحة — النظام يعمل بشكل طبيعي" : `${violations.length} حراسة فاشلة — بعض العمليات محظورة`}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  حاكم النظام يفحص: حالة الشركة، الفترة المالية، حدود التجربة، فشل القيود، المخالفات المفتوحة
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: "company_active", label: "حالة الشركة", desc: "هل الشركة نشطة أم موقوفة" },
              { name: "financial_period", label: "الفترة المالية", desc: "هل الفترة المالية مفتوحة لتاريخ اليوم" },
              { name: "trial_limits", label: "حدود التجربة", desc: "هل تم تجاوز حدود الباقة التجريبية" },
              { name: "posting_failures_threshold", label: "عتبة فشل القيود", desc: "هل يوجد أكثر من 10 قيود فاشلة" },
              { name: "audit_violations", label: "المخالفات المفتوحة", desc: "هل يوجد مخالفات عاجلة غير محلولة" },
            ].map((guard) => {
              const violation = violations.find((v: any) => v.guardName === guard.name);
              const passed = !violation;
              return (
                <Card key={guard.name} className={passed ? "border-status-success-surface" : "border-status-error-surface bg-status-error-surface"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {passed ? (
                        <CheckCircle className="w-4 h-4 text-status-success" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-status-error" />
                      )}
                      {guard.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{guard.desc}</p>
                    {violation && (
                      <div className="mt-2 p-2 bg-status-error-surface border border-status-error-surface rounded text-xs text-status-error-foreground">
                        {violation.reason}
                      </div>
                    )}
                    {passed && (
                      <Badge variant="outline" className="mt-2 text-status-success-foreground border-status-success-surface">ناجح</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                آلية العمل
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>حاكم النظام هو طبقة حماية مركزية تمنع تنفيذ العمليات الحساسة عند وجود مشاكل هيكلية.</p>
              <p>كل حراسة (Guard) تُفحص تلقائياً قبل العمليات المالية والإدارية. إذا فشلت أي حراسة، يُمنع التنفيذ ويظهر سبب المنع للمستخدم.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dlq">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Inbox className="h-4 w-4" /> الأحداث الفاشلة ({dlqEntries.length})
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => refetchDlq()}>
                <RefreshCw className="h-3 w-3 me-1" /> تحديث
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {dlqEntries.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">لا توجد أحداث فاشلة</p>
              ) : (
                <div className="divide-y">
                  {dlqEntries.map((r) => (
                    <div key={r.id} className="p-3 grid grid-cols-12 gap-2 items-start text-xs">
                      <div className="col-span-3">
                        <p className="font-mono font-semibold">{r.eventName}</p>
                        <p className="text-[10px] text-muted-foreground">{r.type}</p>
                      </div>
                      <div className="col-span-5 text-muted-foreground line-clamp-2">{r.error}</div>
                      <div className="col-span-1">
                        <Badge variant="outline" className="text-[10px]">×{r.retryCount}</Badge>
                      </div>
                      <div className="col-span-2 text-[10px] text-muted-foreground">
                        {formatDateAr(r.createdAt)}
                      </div>
                      <div className="col-span-1 flex items-center gap-1">
                        <GuardedButton
                          perm="admin:update"
                          size="sm"
                          variant="ghost"
                          onClick={() => dlqReplayMut.mutate(r.id)}
                          disabled={dlqReplayMut.isPending}
                          title="إعادة تشغيل"
                        >
                          <RotateCw className="h-3 w-3" />
                        </GuardedButton>
                        <GuardedButton
                          perm="admin:delete"
                          size="sm"
                          variant="ghost"
                          className="text-status-error-foreground"
                          onClick={() => dlqDeleteMut.mutate(r.id)}
                          disabled={dlqDeleteMut.isPending}
                          title="حذف"
                        >
                          <Trash2 className="h-3 w-3" />
                        </GuardedButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> فحوصات صحة النظام
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {healthChecks.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">لم تُسجَّل فحوصات</p>
              ) : (
                <div className="divide-y">
                  {healthChecks.map((c) => (
                    <div key={c.id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.category}</p>
                        {c.details && <p className="text-xs text-muted-foreground mt-1">{c.details}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {c.lastChecked && (
                          <span className="text-[10px] text-muted-foreground">{formatDateAr(c.lastChecked)}</span>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            c.status === "healthy" || c.status === "ok"
                              ? "text-status-success-foreground border-status-success-surface"
                              : c.status === "degraded"
                              ? "text-status-warning-foreground border-status-warning-surface"
                              : "text-status-error-foreground border-status-error-surface"
                          }
                        >
                          {c.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {depGraphResp && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">مخطط التبعيات</CardTitle>
              </CardHeader>
              <CardContent className="text-xs">
                <p className="text-muted-foreground">
                  {(depGraphResp.nodes ?? []).length} عقدة · {(depGraphResp.edges ?? []).length} علاقة
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stops">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Pause className="h-4 w-4" /> إيقافات النظام
              </CardTitle>
              <div className="flex items-center gap-2">
                <GuardedButton perm="admin:update" size="sm" onClick={() => setStopOpen(true)}>
                  <Plus className="h-3 w-3 me-1" /> إيقاف جديد
                </GuardedButton>
                <Button variant="outline" size="sm" onClick={() => refetchStops()}>
                  <RefreshCw className="h-3 w-3 me-1" /> تحديث
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stops.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">لا توجد إيقافات</p>
              ) : (
                <div className="divide-y">
                  {stops.map((s) => (
                    <div key={s.id} className="p-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{s.scope}</p>
                        <p className="text-xs text-muted-foreground">{s.reason}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateAr(s.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            s.active
                              ? "text-status-error-foreground border-status-error-surface"
                              : "text-muted-foreground"
                          }
                        >
                          {s.active ? "نشط" : "موقوف"}
                        </Badge>
                        {s.active && (
                          <GuardedButton
                            perm="admin:update"
                            size="sm"
                            variant="ghost"
                            onClick={() => deactivateStopMut.mutate(s.id)}
                            disabled={deactivateStopMut.isPending}
                          >
                            إلغاء الإيقاف
                          </GuardedButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">سجل الأحداث (آخر {eventsLog.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {eventsLog.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">لا توجد أحداث مسجَّلة</p>
                ) : (
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {eventsLog.slice(0, 100).map((e: any, i: number) => (
                      <div key={e.id ?? i} className="p-2 grid grid-cols-12 gap-2 text-xs items-center">
                        <span className="col-span-4 font-mono font-semibold">{e.eventName ?? e.action ?? "—"}</span>
                        <span className="col-span-4 text-muted-foreground line-clamp-1">{e.details ?? e.entity ?? ""}</span>
                        <span className="col-span-3 text-[10px] text-muted-foreground">{e.createdAt ? formatDateAr(e.createdAt) : ""}</span>
                        <Badge variant="outline" className="col-span-1 text-[10px] justify-center">{e.entityId ?? "—"}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">كتالوج الأحداث + الإحصاءات</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div>
                  <p className="font-semibold mb-1">الكتالوج ({eventsCatalog.length}):</p>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {eventsCatalog.slice(0, 40).map((e: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 bg-surface-subtle rounded text-[10px] font-mono">
                        {typeof e === "string" ? e : e.name ?? "—"}
                      </span>
                    ))}
                  </div>
                </div>
                {eventsStats && (
                  <div className="border-t pt-2">
                    <p className="font-semibold mb-1">إحصاءات السجل:</p>
                    {Object.entries(eventsStats as Record<string, any>).slice(0, 6).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono">{typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pages">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">صفحات النظام المسجَّلة</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {registryPages.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">لا توجد صفحات مسجَّلة</p>
              ) : (
                <div className="divide-y">
                  {registryPages.slice(0, 100).map((p: any, i: number) => (
                    <div key={p.path ?? i} className="p-2 grid grid-cols-12 gap-2 text-xs items-center">
                      <span className="col-span-6 font-mono">{p.path ?? p.route ?? "—"}</span>
                      <span className="col-span-4 text-muted-foreground">{p.title ?? p.label ?? "—"}</span>
                      <span className="col-span-2 text-end">
                        <Badge variant="outline" className="text-[10px]">{p.module ?? p.domain ?? "—"}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      </PageStateWrapper>

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفعيل إيقاف نظام</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs">النطاق</Label>
              <Select value={stopScope} onValueChange={(v) => setStopScope(v as typeof stopScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل العمليات</SelectItem>
                  <SelectItem value="financial">المالية</SelectItem>
                  <SelectItem value="hr">الموارد البشرية</SelectItem>
                  <SelectItem value="operational">العمليات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">سبب الإيقاف *</Label>
              <Textarea
                value={stopReason}
                onChange={(e) => setStopReason(e.target.value)}
                rows={3}
                placeholder="اشرح سبب الإيقاف بوضوح حتى يفهم بقية الفريق..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopOpen(false)}>إلغاء</Button>
            <Button onClick={submitNewStop} disabled={createStopMut.isPending}>
              {createStopMut.isPending ? "جاري التفعيل..." : "تفعيل الإيقاف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
