import { useState } from "react";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { resolveStatus } from "@/components/page-status-badge";
import { Brain, Users, Car, Building, FolderKanban, Headphones, TrendingUp, TrendingDown, AlertTriangle, Search, Radar, Check, Loader2, Target, Activity } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Badge } from "@/components/ui/badge";

interface KpiSnapshot {
  id: number;
  employeeId: number | null;
  snapshotDate: string;
  metricName: string;
  metricValue: string | number | null;
  metricTarget: string | number | null;
  createdAt: string;
}

export default function Intelligence() {
  const { data: overview, isLoading: loadingOverview, isError: overviewError } = useApiQuery(["intelligence-overview"], "/intelligence/overview");
  const { data: alertsResp, isLoading: loadingAlerts } = useApiQuery<any>(["intelligence-alerts"], "/intelligence/alerts");
  const alerts = asList(alertsResp);
  const { data: schedule } = useApiQuery<any>(["daily-schedule"], "/intelligence/daily-schedule");
  const { data: kpisResp, isLoading: loadingKpis } = useApiQuery<{ data: KpiSnapshot[] }>(
    ["intelligence-kpis"],
    "/intelligence/kpis",
  );
  const kpiSnapshots = asList<KpiSnapshot>(kpisResp?.data ?? kpisResp);
  const [alertSearch, setAlertSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [attendSearch, setAttendSearch] = useState("");
  const [kpiSearch, setKpiSearch] = useState("");

  const filteredAlerts = alerts.filter((a: any) => {
    if (!alertSearch) return true;
    return a.title?.includes(alertSearch) || a.description?.includes(alertSearch);
  });

  // Manual scan trigger — fires the same alert-generation pass the
  // scheduled cron runs, but on demand. Useful when ops have just
  // fixed an issue and want to confirm the alert clears.
  const scanMut = useApiMutation<unknown, Record<string, never>>(
    "/intelligence/alerts/scan",
    "POST",
    [["intelligence-alerts"], ["intelligence-overview"]],
    { successMessage: "تم تشغيل فحص التنبيهات" },
  );

  // Per-alert mark-as-read. Two separate useApiMutation hooks would be
  // cleaner per row but RHF prefers one mutation with a URL-factory.
  const markReadMut = useApiMutation<unknown, { id: number }>(
    (body) => `/intelligence/alerts/${body.id}/read`,
    "PATCH",
    [["intelligence-alerts"], ["intelligence-overview"]],
    { successMessage: "تم تعليم التنبيه كمقروء" },
  );

  const tasks = (schedule?.tasks || []).filter((t: any) => !taskSearch || t.title?.includes(taskSearch) || t.assigneeName?.includes(taskSearch));
  const attendance = (schedule?.attendance || []).filter((a: any) => !attendSearch || a.employeeName?.includes(attendSearch));
  const { sortedRows: printRows } = usePrintRows<any>(tasks);

  const taskColumns: DataTableColumn<any>[] = [
    { key: "title", header: "المهمة", sortable: true, render: (t) => <span className="font-medium">{t.title}</span> },
    { key: "assigneeName", header: "المسؤول", sortable: true, render: (t) => t.assigneeName || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <PageStatusBadge status={t.status} /> },
  ];
  const attendColumns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (a) => <span className="font-medium">{a.employeeName}</span> },
    { key: "checkIn", header: "وقت الدخول", sortable: true, ltr: true, render: (a) => a.checkIn || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (a) => <PageStatusBadge status={a.status} /> },
  ];

  if (loadingOverview) return <LoadingSpinner />;
  if (overviewError) return <ErrorState />;

  return (
    <PageShell title="لوحة الذكاء"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "لوحة الذكاء" },
      ]}
      actions={
        <PrintButton
          entityType="report_intelligence_daily_tasks"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "لوحة الذكاء — مهام اليوم", total: printRows.length },
            items: printRows.map((t: any) => ({
              "المهمة": t.title,
              "المسؤول": t.assigneeName || "—",
              "الحالة": resolveStatus(t.status, "project")?.label ?? t.status,
            })),
          })}
        />
      }>
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
        {loadingOverview ? [...Array(7)].map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>) : (
          <>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> الموظفون</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.totalEmployees || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Car className="h-3 w-3" /> المركبات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.totalVehicles || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Building className="h-3 w-3" /> العقارات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.totalProperties || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><FolderKanban className="h-3 w-3" /> مشاريع نشطة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.activeProjects || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Headphones className="h-3 w-3" /> تذاكر مفتوحة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-status-warning-foreground">{overview?.openTickets || 0}</div></CardContent></Card>
            <Card className="bg-primary text-primary-foreground"><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><TrendingUp className="h-3 w-3" /> إيراد الشهر</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(overview?.monthlyRevenue)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> تنبيهات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{overview?.unreadAlerts || 0}</div></CardContent></Card>
          </>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" /> التنبيهات الذكية</CardTitle>
            <GuardedButton
              perm="intelligence:create"
              size="sm"
              variant="outline"
              onClick={() => scanMut.mutate({})}
              disabled={scanMut.isPending}
              className="gap-1.5"
            >
              {scanMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
              فحص الآن
            </GuardedButton>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="ps-9" placeholder="بحث في التنبيهات..." value={alertSearch} onChange={(e) => setAlertSearch(e.target.value)} />
            </div>
            {loadingAlerts ? <Skeleton className="h-20 w-full" /> :
            filteredAlerts?.length === 0 ? <p className="text-muted-foreground text-center py-8">لا توجد تنبيهات</p> :
            <div className="space-y-3">
              {filteredAlerts.slice(0, 10).map((a: any) => (
                <div key={a.id} className={`p-3 rounded-lg border ${a.severity === 'critical' ? 'bg-rose-50 border-rose-200' : a.severity === 'warning' ? 'bg-status-warning-surface border-status-warning-surface' : 'bg-status-info-surface border-status-info-surface'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm flex-1">{a.title}</span>
                    <PageStatusBadge status={a.severity} />
                    {!a.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markReadMut.mutate({ id: a.id })}
                        disabled={markReadMut.isPending}
                        className="h-6 px-2 gap-1"
                        title="تعليم كمقروء"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                </div>
              ))}
            </div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />مؤشرات الأداء (KPIs)</CardTitle></CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                className="ps-8 h-8 text-xs"
                placeholder="بحث باسم المقياس..."
                value={kpiSearch}
                onChange={(e) => setKpiSearch(e.target.value)}
              />
            </div>
            {loadingKpis ? (
              <Skeleton className="h-32 w-full" />
            ) : kpiSnapshots.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">لا توجد لقطات KPI بعد — الـcron الشهري يكتبها أو يتم احتسابها يدوياً للموظفين</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {kpiSnapshots
                  .filter((k) => !kpiSearch || (k.metricName?.toLowerCase().includes(kpiSearch.toLowerCase())))
                  .slice(0, 30)
                  .map((k) => {
                    const value = Number(k.metricValue || 0);
                    const target = Number(k.metricTarget || 0);
                    const hasTarget = target > 0;
                    const pct = hasTarget ? (value / target) * 100 : 0;
                    const meetingTarget = hasTarget && value >= target;
                    return (
                      <div key={k.id} className="p-2 rounded-md border bg-card">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium flex items-center gap-1.5 truncate">
                            <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
                            {k.metricName}
                            {k.employeeId && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">موظف #{k.employeeId}</Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">{formatDateAr(k.snapshotDate)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-sm font-bold">
                            {value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                            {hasTarget && (
                              <span className="text-xs text-muted-foreground font-normal mx-1">
                                / {target.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </span>
                          {hasTarget && (
                            <Badge className={meetingTarget
                              ? "bg-status-success-surface text-status-success-foreground border-status-success-surface"
                              : "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface"
                            }>
                              {meetingTarget ? <TrendingUp className="h-3 w-3 ml-1" /> : <TrendingDown className="h-3 w-3 ml-1" />}
                              {pct.toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>جدول اليوم</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-medium">المهام ({tasks.length})</h4>
                  <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input className="ps-8 h-7 text-xs" placeholder="بحث..." value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} />
                  </div>
                </div>
                <DataTable
                  columns={taskColumns}
                  data={tasks.slice(0, 5)}
                  noToolbar
                  pageSize={0}
                  emptyMessage="لا توجد مهام اليوم"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-medium">الحضور اليوم ({attendance.length})</h4>
                  <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input className="ps-8 h-7 text-xs" placeholder="بحث..." value={attendSearch} onChange={(e) => setAttendSearch(e.target.value)} />
                  </div>
                </div>
                <DataTable
                  columns={attendColumns}
                  data={attendance.slice(0, 5)}
                  noToolbar
                  pageSize={0}
                  emptyMessage="لا يوجد حضور مسجل"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
