import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Activity, Database, Clock, AlertTriangle, Shield,
  Server, CheckCircle, XCircle, Users, Building2,
  HardDrive, Cpu, MemoryStick, RefreshCw, Plug,
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
  const cronJobs = health?.cronJobs || [];
  const recentCronLogs = health?.recentCronLogs || [];
  const recentErrors = health?.recentErrors || [];

  // Split cron jobs into failed vs healthy so the failed ones surface at
  // the top of the page with full error detail instead of being hidden in
  // a 150px-wide truncated cell. When the user sees "أخطاء Cron: 13" on
  // the dashboard this is the page that must tell them WHICH 13.
  const failedCronJobs = cronJobs.filter((j: any) => j.lastStatus === "failed" && j.isActive);
  const healthyCronJobs = cronJobs.filter((j: any) => j.lastStatus !== "failed" || !j.isActive);

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
      {/* Failed cron jobs banner — full error text, sorted to the top */}
      {failedCronJobs.length > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" />
              مهام مجدولة فاشلة ({failedCronJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {failedCronJobs.map((job: any, i: number) => (
              <div key={i} className="bg-white border border-red-100 rounded p-3 text-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-red-800">{job.name}</p>
                    {job.description && <p className="text-xs text-gray-600 mt-0.5">{job.description}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      الجدولة: <span className="font-mono">{job.schedule}</span>
                      {job.lastRunAt && <span className="ms-2">— آخر تشغيل: {formatDateAr(job.lastRunAt)}</span>}
                    </p>
                  </div>
                </div>
                {job.lastError && (
                  <div className="mt-2 bg-red-50 border border-red-100 rounded p-2">
                    <p className="text-[10px] font-medium text-red-700 mb-0.5">تفاصيل الخطأ:</p>
                    <pre className="text-xs text-red-800 whitespace-pre-wrap break-words font-mono leading-relaxed">
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
        <Card className={cn("border-0 shadow-sm", services.api?.status === "healthy" ? "bg-green-50/50" : "bg-red-50/50")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Server className={cn("w-8 h-8", services.api?.status === "healthy" ? "text-green-600" : "text-red-600")} />
            <div>
              <p className="text-sm font-semibold">خادم الربط البرمجي</p>
              <p className="text-xs text-gray-500">{services.api?.status === "healthy" ? "يعمل" : "متوقف"}</p>
              <p className="text-xs text-gray-400">{formatUptime(services.api?.uptime || 0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-0 shadow-sm", services.database?.status === "healthy" ? "bg-green-50/50" : "bg-red-50/50")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Database className={cn("w-8 h-8", services.database?.status === "healthy" ? "text-green-600" : "text-red-600")} />
            <div>
              <p className="text-sm font-semibold">قاعدة البيانات</p>
              <p className="text-xs text-gray-500">{services.database?.status === "healthy" ? "متصل" : "خطأ"}</p>
              <p className="text-xs text-gray-400">{services.database?.latency}ms | {services.database?.size}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-blue-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm font-semibold">مهام مجدولة</p>
              <p className="text-xs text-gray-500">{services.crons?.active || 0} نشطة من {services.crons?.total || 0}</p>
              {(services.crons?.failed || 0) > 0 && <p className="text-xs text-red-500">{services.crons?.failed} فاشلة</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-indigo-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Plug className="w-8 h-8 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold">التكاملات</p>
              <p className="text-xs text-gray-500">{services.integrations?.active || 0} نشطة من {services.integrations?.total || 0}</p>
              {(services.integrations?.pendingMessages || 0) > 0 && <p className="text-xs text-amber-500">{services.integrations?.pendingMessages} رسالة معلقة</p>}
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
              <span className={cn("font-semibold", security.failedLogins24h > 10 ? "text-red-600" : "text-green-600")}>
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
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50 sticky top-0">
                  <th className="p-2 text-start">المهمة</th>
                  <th className="p-2 text-start">الجدول</th>
                  <th className="p-2 text-start">آخر تشغيل</th>
                  <th className="p-2 text-start">الحالة</th>
                </tr></thead>
                <tbody>
                  {healthyCronJobs.map((job: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium text-xs">{job.name}</td>
                      <td className="p-2 font-mono text-xs text-gray-500">{job.schedule}</td>
                      <td className="p-2 text-xs">{job.lastRunAt ? formatDateAr(job.lastRunAt) : "-"}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          {job.isActive ? (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-gray-400" />
                          )}
                          {job.lastStatus && <PageStatusBadge status={job.lastStatus} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {healthyCronJobs.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">لا توجد مهام مجدولة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />آخر تنفيذات المهام</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50 sticky top-0">
                  <th className="p-2 text-start">المهمة</th>
                  <th className="p-2 text-start">الحالة</th>
                  <th className="p-2 text-start">المدة</th>
                  <th className="p-2 text-start">التاريخ</th>
                </tr></thead>
                <tbody>
                  {recentCronLogs.map((log: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium text-xs">{log.jobName}</td>
                      <td className="p-2"><PageStatusBadge status={log.status} /></td>
                      <td className="p-2 text-xs">{log.duration ? `${log.duration}ms` : "-"}</td>
                      <td className="p-2 text-xs">{formatDateAr(log.createdAt)}</td>
                    </tr>
                  ))}
                  {recentCronLogs.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">لا توجد سجلات</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {recentErrors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />أحدث الأخطاء</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-2 text-start">الإجراء</th>
                <th className="p-2 text-start">الوحدة</th>
                <th className="p-2 text-start">التفاصيل</th>
                <th className="p-2 text-start">التاريخ</th>
              </tr></thead>
              <tbody>
                {recentErrors.map((err: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-medium text-xs text-red-600">{err.action}</td>
                    <td className="p-2 text-xs">{err.entity || "-"}</td>
                    <td className="p-2 text-xs max-w-[300px] truncate">{typeof err.details === "object" ? JSON.stringify(err.details) : err.details || "-"}</td>
                    <td className="p-2 text-xs">{formatDateAr(err.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      </div>
      </PageStateWrapper>
    </PageShell>
  );
}
