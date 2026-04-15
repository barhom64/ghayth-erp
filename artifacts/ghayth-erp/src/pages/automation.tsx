import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Switch } from "@/components/ui/switch";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Cog, Play, Clock, Search, Zap, Activity, Bot, TrendingUp } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const MODULE_LABELS: Record<string, string> = {
  hr: "الموارد البشرية",
  finance: "المالية",
  fleet: "الأسطول",
  property: "العقارات",
};

const AUTOMATION_TYPE_LABELS: Record<string, string> = {
  employee_contract_expiry: "تجديد عقد موظف",
  invoice_overdue_collection: "مطالبة تحصيل فاتورة",
  unauthorized_absence_inquiry: "استفسار غياب بدون إذن",
  vehicle_breakdown_maintenance: "طلب صيانة مركبة",
  vehicle_insurance_expiry: "تجديد تأمين مركبة",
  rental_contract_expiry: "متابعة عقد إيجار",
  annual_performance_review: "تقييم أداء سنوي",
  probation_completion_review: "مراجعة تثبيت موظف",
};

export default function Automation() {
  const [page, setPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [autoLogPage, setAutoLogPage] = useState(1);
  const [jobSearch, setJobSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [autoLogSearch, setAutoLogSearch] = useState("");
  const pageSize = 20;
  const { data: cronJobsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["cron-jobs", String(page)], `/automation/cron-jobs?page=${page}&limit=${pageSize}`);
  const cronJobs = asList(cronJobsResp);
  const cronTotal = cronJobsResp?.total || cronJobs.length;
  const { data: cronLogsResp, isLoading: loadingLogs, isError: isLogsError, error: logsError, refetch: refetchLogs } = useApiQuery<any>(["cron-logs", String(logPage)], `/automation/cron-logs?page=${logPage}&limit=${pageSize}`);
  const cronLogs = asList(cronLogsResp);
  const logsTotal = cronLogsResp?.total || cronLogs.length;
  const { data: notifStats } = useApiQuery(["notif-stats"], "/automation/notification-stats");
  const { data: proactiveRulesResp } = useApiQuery<any>(["proactive-rules"], "/automation/proactive-rules");
  const proactiveRules = asList(proactiveRulesResp);
  const { data: autoLogsResp, isLoading: loadingAutoLogs, isError: isAutoLogsError, error: autoLogsError, refetch: refetchAutoLogs } = useApiQuery<any>(
    ["automation-logs", String(autoLogPage)], `/automation/automation-logs?page=${autoLogPage}&limit=${pageSize}`
  );
  const autoLogs = asList(autoLogsResp);
  const autoLogsTotal = autoLogsResp?.total || autoLogs.length;
  const { data: autoStats } = useApiQuery<any>(["automation-stats"], "/automation/automation-stats");

  const filteredJobs = cronJobs.filter((j: any) => !jobSearch || j.name?.includes(jobSearch) || j.description?.includes(jobSearch));
  const filteredLogs = cronLogs.filter((l: any) => !logSearch || l.jobName?.includes(logSearch) || l.result?.includes(logSearch));
  const filteredAutoLogs = autoLogs.filter((l: any) =>
    !autoLogSearch ||
    l.automationType?.includes(autoLogSearch) ||
    l.triggerReason?.includes(autoLogSearch) ||
    l.actionTaken?.includes(autoLogSearch)
  );

  const toggleJobMut = useApiMutation<any, { id: number }>(
    (body) => `/automation/cron-jobs/${body.id}/toggle`,
    "POST",
    [["cron-jobs"]]
  );
  const triggerJobMut = useApiMutation<any, { id: number }>(
    (body) => `/automation/cron-jobs/${body.id}/trigger`,
    "POST",
    [["cron-jobs"], ["cron-logs"]],
    { successMessage: "تم تشغيل المهمة يدوياً" }
  );
  const toggleProactiveMut = useApiMutation<any, { id: number }>(
    (body) => `/automation/proactive-rules/${body.id}/toggle`,
    "POST",
    [["proactive-rules"]]
  );

  const handleToggle = (id: number) => toggleJobMut.mutate({ id });
  const handleTrigger = (id: number) => triggerJobMut.mutate({ id });
  const handleToggleProactive = (id: number) => toggleProactiveMut.mutate({ id });

  const activeProactiveCount = proactiveRules.filter((r: any) => r.isActive).length;

  const autoLogColumns: DataTableColumn<any>[] = [
    {
      key: "automationType", header: "نوع الأتمتة", sortable: true,
      render: (l) => (
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">{AUTOMATION_TYPE_LABELS[l.automationType] || l.automationType}</span>
        </div>
      ),
    },
    { key: "triggerReason", header: "سبب التفعيل", sortable: true, render: (l) => <span className="max-w-[250px] truncate inline-block text-sm">{l.triggerReason}</span> },
    { key: "actionTaken", header: "الإجراء", sortable: true, render: (l) => <span className="max-w-[200px] truncate inline-block text-sm">{l.actionTaken}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <PageStatusBadge status={l.status || "success"} /> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (l) => <span className="text-sm">{formatDateAr(l.createdAt)}</span> },
  ];

  const jobColumns: DataTableColumn<any>[] = [
    { key: "name", header: "المهمة", sortable: true, render: (j) => <span className="font-medium">{j.name}</span> },
    { key: "description", header: "الوصف", sortable: true, render: (j) => <span className="max-w-[200px] truncate inline-block text-muted-foreground">{j.description || "-"}</span> },
    { key: "schedule", header: "الجدول", sortable: true, render: (j) => <span className="font-mono text-xs">{j.schedule || "-"}</span> },
    { key: "lastRunAt", header: "آخر تشغيل", sortable: true, render: (j) => formatDateAr(j.lastRunAt) },
    { key: "lastStatus", header: "الحالة", sortable: true, render: (j) => <PageStatusBadge status={j.lastStatus || "idle"} /> },
    { key: "isActive", header: "نشط", render: (j) => <Switch checked={j.isActive} onCheckedChange={() => handleToggle(j.id)} /> },
    {
      key: "actions", header: "الإجراءات",
      render: (j) => <Button variant="outline" size="sm" className="gap-1" onClick={() => handleTrigger(j.id)}><Play className="h-3 w-3" /> تشغيل</Button>,
    },
  ];

  const logColumns: DataTableColumn<any>[] = [
    { key: "jobName", header: "المهمة", sortable: true, render: (l) => <span className="font-medium">{l.jobName}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <PageStatusBadge status={l.status} /> },
    { key: "duration", header: "المدة", sortable: true, render: (l) => l.duration ? `${l.duration} مللي ثانية` : "-" },
    { key: "result", header: "النتيجة", sortable: true, render: (l) => <span className="max-w-[200px] truncate inline-block">{l.result || l.error || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (l) => formatDateAr(l.createdAt) },
  ];

  return (
    <PageShell title="الأتمتة والجدولة" loading={isLoading}>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cog className="h-4 w-4" /> المهام المجدولة</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{cronJobs?.length || 0}</div><p className="text-xs text-muted-foreground">نشطة: {cronJobs?.filter((j: any) => j.isActive).length || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4" /> الأتمتة الاستباقية</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{activeProactiveCount}</div><p className="text-xs text-muted-foreground">من {proactiveRules.length} قاعدة</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> إجراءات تلقائية اليوم</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{autoStats?.today || 0}</div><p className="text-xs text-muted-foreground">هذا الأسبوع: {autoStats?.thisWeek || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> إجمالي الأتمتة</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{autoStats?.total || 0}</div><p className="text-xs text-muted-foreground">إشعارات: {(notifStats as any)?.total || 0}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="proactive" className="space-y-4">
        <TabsList>
          <TabsTrigger value="proactive" className="gap-2"><Bot className="h-4 w-4" /> الأتمتة الاستباقية</TabsTrigger>
          <TabsTrigger value="automation-log" className="gap-2"><Activity className="h-4 w-4" /> سجل الأتمتة</TabsTrigger>
          <TabsTrigger value="cron" className="gap-2"><Cog className="h-4 w-4" /> المهام المجدولة</TabsTrigger>
          <TabsTrigger value="cron-log" className="gap-2"><Clock className="h-4 w-4" /> سجل التشغيل</TabsTrigger>
        </TabsList>

        <TabsContent value="proactive">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> قواعد الأتمتة الاستباقية</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">النظام يراقب هذه الأحداث ويُنشئ المهام تلقائياً بدون تدخل المستخدم</p>
              <div className="grid gap-4 md:grid-cols-2">
                {proactiveRules.map((rule: any) => (
                  <Card key={rule.id} className={`border ${rule.isActive ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-gray-200 opacity-60'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-sm">{rule.nameAr || rule.name}</h3>
                            <Badge variant="outline" className="text-xs">{MODULE_LABELS[rule.module] || rule.module}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{rule.descriptionAr || rule.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {rule.triggerType === "event" ? "حدث فوري" : "فحص يومي"}
                            </span>
                            {rule.totalExecutions > 0 && (
                              <span>تنفيذ: {rule.totalExecutions} مرة</span>
                            )}
                            {rule.lastRunAt && (
                              <span>آخر تشغيل: {formatDateAr(rule.lastRunAt)}</span>
                            )}
                          </div>
                        </div>
                        <Switch checked={rule.isActive} onCheckedChange={() => handleToggleProactive(rule.id)} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {proactiveRules.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>لا توجد قواعد أتمتة استباقية</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation-log">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> سجل الأتمتة الاستباقية</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="ps-9" placeholder="بحث في سجل الأتمتة..." value={autoLogSearch} onChange={(e) => setAutoLogSearch(e.target.value)} />
              </div>

              {autoStats?.byType && autoStats.byType.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2">
                  {autoStats.byType.map((t: any) => (
                    <Badge key={t.automationType} variant="secondary" className="text-xs">
                      {AUTOMATION_TYPE_LABELS[t.automationType] || t.automationType}: {t.count}
                    </Badge>
                  ))}
                </div>
              )}

              <DataTable
                columns={autoLogColumns}
                data={filteredAutoLogs}
                isLoading={loadingAutoLogs}
                isError={isAutoLogsError}
                error={autoLogsError as Error | null}
                onRetry={() => refetchAutoLogs()}
                emptyMessage="لا توجد سجلات أتمتة بعد"
                emptyIcon={<Activity className="h-6 w-6 text-slate-400" />}
                noToolbar
                total={autoLogsTotal}
                page={autoLogPage}
                pageSize={pageSize}
                onPageChange={setAutoLogPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cron">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Cog className="h-5 w-5" /> المهام المجدولة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="ps-9" placeholder="بحث بالاسم أو الوصف..." value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} />
              </div>
              <DataTable
                columns={jobColumns}
                data={filteredJobs}
                isLoading={isLoading}
                isError={isError}
                error={error as Error | null}
                onRetry={() => refetch()}
                emptyMessage="لا توجد مهام مجدولة"
                emptyIcon={<Cog className="h-6 w-6 text-slate-400" />}
                noToolbar
                total={cronTotal}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cron-log">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> سجل التشغيل</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="ps-9" placeholder="بحث في سجل التشغيل..." value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
              </div>
              <DataTable
                columns={logColumns}
                data={filteredLogs}
                isLoading={loadingLogs}
                isError={isLogsError}
                error={logsError as Error | null}
                onRetry={() => refetchLogs()}
                emptyMessage="لا توجد سجلات تشغيل"
                emptyIcon={<Clock className="h-6 w-6 text-slate-400" />}
                noToolbar
                total={logsTotal}
                page={logPage}
                pageSize={pageSize}
                onPageChange={setLogPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
