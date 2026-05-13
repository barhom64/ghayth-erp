import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Activity, Database, Clock, AlertTriangle, Shield,
  Server, CheckCircle, XCircle, Users, Building2,
  HardDrive, Cpu, MemoryStick, RefreshCw, Plug, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function AdminMonitoring() {
  const { data: health, isLoading, error, refetch } = useApiQuery<any>(["system-health"], "/admin/system-health");

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
    { key: "details", header: "التفاصيل", render: (r: any) => <span className="text-xs max-w-[300px] truncate block">{typeof r.details === "object" ? JSON.stringify(r.details) : r.details || "-"}</span> },
    { key: "createdAt", header: "التاريخ", render: (r: any) => <span className="text-xs">{formatDateAr(r.createdAt)}</span> },
  ];

  return (
    <PageShell
      title="مركز المراقبة"
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
      </div>
      </PageStateWrapper>
    </PageShell>
  );
}
