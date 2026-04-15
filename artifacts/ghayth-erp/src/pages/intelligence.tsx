import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useApiQuery, asList } from "@/lib/api";
import { Brain, Users, Car, Building, FolderKanban, Headphones, TrendingUp, AlertTriangle, Search } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function Intelligence() {
  const { data: overview, isLoading: loadingOverview } = useApiQuery(["intelligence-overview"], "/intelligence/overview");
  const { data: alertsResp, isLoading: loadingAlerts } = useApiQuery<any>(["intelligence-alerts"], "/intelligence/alerts");
  const alerts = asList(alertsResp);
  const { data: schedule } = useApiQuery<any>(["daily-schedule"], "/intelligence/daily-schedule");
  const [alertSearch, setAlertSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [attendSearch, setAttendSearch] = useState("");

  const filteredAlerts = alerts.filter((a: any) => {
    if (!alertSearch) return true;
    return a.title?.includes(alertSearch) || a.description?.includes(alertSearch);
  });

  const tasks = (schedule?.tasks || []).filter((t: any) => !taskSearch || t.title?.includes(taskSearch) || t.assigneeName?.includes(taskSearch));
  const attendance = (schedule?.attendance || []).filter((a: any) => !attendSearch || a.employeeName?.includes(attendSearch));

  const taskColumns: DataTableColumn<any>[] = [
    { key: "title", header: "المهمة", sortable: true, render: (t) => <span className="font-medium">{t.title}</span> },
    { key: "assigneeName", header: "المسؤول", sortable: true, render: (t) => t.assigneeName || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <StatusBadge status={t.status} /> },
  ];
  const attendColumns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (a) => <span className="font-medium">{a.employeeName}</span> },
    { key: "checkIn", header: "وقت الدخول", sortable: true, ltr: true, render: (a) => a.checkIn || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <PageShell title="لوحة الذكاء" loading={loadingOverview}>
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
        {loadingOverview ? [...Array(7)].map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>) : (
          <>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> الموظفون</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.totalEmployees || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Car className="h-3 w-3" /> المركبات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.totalVehicles || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Building className="h-3 w-3" /> العقارات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.totalProperties || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><FolderKanban className="h-3 w-3" /> مشاريع نشطة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview?.activeProjects || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Headphones className="h-3 w-3" /> تذاكر مفتوحة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{overview?.openTickets || 0}</div></CardContent></Card>
            <Card className="bg-primary text-primary-foreground"><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><TrendingUp className="h-3 w-3" /> إيراد الشهر</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(overview?.monthlyRevenue)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> تنبيهات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{overview?.unreadAlerts || 0}</div></CardContent></Card>
          </>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" /> التنبيهات الذكية</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="ps-9" placeholder="بحث في التنبيهات..." value={alertSearch} onChange={(e) => setAlertSearch(e.target.value)} />
            </div>
            {loadingAlerts ? <Skeleton className="h-20 w-full" /> :
            filteredAlerts?.length === 0 ? <p className="text-muted-foreground text-center py-8">لا توجد تنبيهات</p> :
            <div className="space-y-3">
              {filteredAlerts.slice(0, 10).map((a: any) => (
                <div key={a.id} className={`p-3 rounded-lg border ${a.severity === 'critical' ? 'bg-rose-50 border-rose-200' : a.severity === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{a.title}</span>
                    <StatusBadge status={a.severity} />
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                </div>
              ))}
            </div>}
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
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
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
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
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
