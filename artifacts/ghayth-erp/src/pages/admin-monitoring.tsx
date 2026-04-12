import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const { data: health, isLoading, refetch } = useApiQuery<any>(["system-health"], "/admin/system-health");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const services = health?.services || {};
  const memUsage = health?.memoryUsage || {};
  const counts = health?.counts || {};
  const security = health?.security || {};
  const cronJobs = health?.cronJobs || [];
  const recentCronLogs = health?.recentCronLogs || [];
  const recentErrors = health?.recentErrors || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Activity className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">مركز المراقبة</h1>
            <p className="text-sm text-gray-500">مراقبة صحة النظام والخدمات</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      </div>

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
            <div className="flex justify-between text-sm"><span>RSS</span><span>{formatBytes(memUsage.rss)}</span></div>
            <div className="flex justify-between text-sm"><span>الذاكرة المستخدمة</span><span>{formatBytes(memUsage.heapUsed)}</span></div>
            <div className="flex justify-between text-sm"><span>إجمالي الذاكرة</span><span>{formatBytes(memUsage.heapTotal)}</span></div>
            <div className="flex justify-between text-sm"><span>الذاكرة الخارجية</span><span>{formatBytes(memUsage.external)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardDrive className="w-4 h-4" />إحصائيات التخزين</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>حجم قاعدة البيانات</span><span className="font-semibold">{services.database?.size || "N/A"}</span></div>
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
                  {cronJobs.map((job: any, i: number) => (
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
                          {job.lastStatus && <StatusBadge status={job.lastStatus} />}
                        </div>
                        {job.lastError && <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[150px]">{job.lastError}</p>}
                      </td>
                    </tr>
                  ))}
                  {cronJobs.length === 0 && (
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
                      <td className="p-2"><StatusBadge status={log.status} /></td>
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
  );
}
