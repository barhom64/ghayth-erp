import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, DollarSign, Truck, Scale, Building2, FolderKanban,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock,
  Wrench, Shield, FileText, BarChart3, Activity,
} from "lucide-react";

function KpiCard({ title, value, subtitle, icon: Icon, trend, color = "blue" }: {
  title: string; value: string | number; subtitle?: string;
  icon: any; trend?: "up" | "down" | "neutral"; color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
    cyan: "bg-cyan-50 text-cyan-600",
    yellow: "bg-yellow-50 text-yellow-600",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs mt-2 ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-500"}`}>
            {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniBar({ label, value, max, color = "blue" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colors: Record<string, string> = {
    blue: "bg-blue-500", green: "bg-green-500", red: "bg-red-500",
    orange: "bg-orange-500", purple: "bg-purple-500",
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] || "bg-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-start font-medium">{value}</span>
    </div>
  );
}

function HrDashboard() {
  const { data, isLoading } = useApiQuery<any>(["module-dash-hr"], "/module-dashboards/hr");
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي الموظفين" value={data.employees?.active ?? 0} icon={Users} color="blue" subtitle={`من ${data.employees?.total ?? 0}`} />
        <KpiCard title="حاضر اليوم" value={data.attendance?.present ?? 0} icon={CheckCircle} color="green" />
        <KpiCard title="غائب اليوم" value={data.attendance?.absent ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="متأخر اليوم" value={data.attendance?.late ?? 0} icon={Clock} color="orange" subtitle={data.attendance?.avgLateMinutes ? `${data.attendance.avgLateMinutes} دقيقة متوسط` : ""} />
        <KpiCard title="طلبات إجازة معلقة" value={data.leaves?.pending ?? 0} icon={FileText} color="purple" />
        <KpiCard title="عقود تنتهي قريباً" value={data.expiringContracts ?? 0} icon={AlertTriangle} color="yellow" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الإجازات</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <MiniBar label="معلقة" value={data.leaves?.pending ?? 0} max={Math.max(data.leaves?.pending + data.leaves?.approved + data.leaves?.rejected, 1)} color="orange" />
            <MiniBar label="معتمدة" value={data.leaves?.approved ?? 0} max={Math.max(data.leaves?.pending + data.leaves?.approved + data.leaves?.rejected, 1)} color="green" />
            <MiniBar label="مرفوضة" value={data.leaves?.rejected ?? 0} max={Math.max(data.leaves?.pending + data.leaves?.approved + data.leaves?.rejected, 1)} color="red" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المخالفات (الشهر الحالي)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.violations?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              إجمالي الخصومات: {Number(data.violations?.totalDeductions ?? 0).toLocaleString()} ر.س
            </p>
          </CardContent>
        </Card>
      </div>

      {data.weeklyAttendance?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الحضور - آخر 7 أيام</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-1 items-end h-24">
              {data.weeklyAttendance.map((d: any, i: number) => {
                const total = Math.max(Number(d.present) + Number(d.absent) + Number(d.late), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col gap-0.5" style={{ height: "60px" }}>
                      <div className="bg-green-400 rounded-t" style={{ height: `${(Number(d.present) / total) * 60}px` }} />
                      <div className="bg-red-400" style={{ height: `${(Number(d.absent) / total) * 60}px` }} />
                      <div className="bg-orange-400 rounded-b" style={{ height: `${(Number(d.late) / total) * 60}px` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{d.date ? new Date(d.date).toLocaleDateString("ar-SA", { weekday: "short" }) : ""}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" />حاضر</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full" />غائب</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-400 rounded-full" />متأخر</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FinanceDashboard() {
  const { data, isLoading } = useApiQuery<any>(["module-dash-finance"], "/module-dashboards/finance");
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  const fmt = (v: number) => v.toLocaleString("ar-SA");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي الإيرادات" value={`${fmt(data.revenue?.total ?? 0)} ر.س`} icon={DollarSign} color="green" />
        <KpiCard title="المحصّل" value={`${fmt(data.revenue?.paid ?? 0)} ر.س`} icon={CheckCircle} color="blue" />
        <KpiCard title="مستحقات" value={`${fmt(data.revenue?.outstanding ?? 0)} ر.س`} icon={Clock} color="orange" />
        <KpiCard title="فواتير متأخرة" value={data.invoices?.overdue ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="مصروفات الشهر" value={`${fmt(data.expenses?.monthTotal ?? 0)} ر.س`} icon={TrendingDown} color="purple" />
        <KpiCard title="استخدام الميزانية" value={`${data.budgets?.avgUsage ?? 0}%`} icon={BarChart3} color="cyan" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ذمم مدينة متأخرة</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(data.receivables?.amount ?? 0)} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">{data.receivables?.count ?? 0} فاتورة متأخرة</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الفواتير</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <MiniBar label="إجمالي" value={data.invoices?.count ?? 0} max={data.invoices?.count ?? 1} color="blue" />
            <MiniBar label="مسددة" value={data.invoices?.paid ?? 0} max={data.invoices?.count ?? 1} color="green" />
            <MiniBar label="متأخرة" value={data.invoices?.overdue ?? 0} max={data.invoices?.count ?? 1} color="red" />
          </CardContent>
        </Card>
      </div>

      {data.monthlyRevenue?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الإيرادات الشهرية</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-1 items-end h-24">
              {data.monthlyRevenue.map((m: any, i: number) => {
                const maxRev = Math.max(...data.monthlyRevenue.map((x: any) => Number(x.revenue)), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-blue-400 rounded-t" style={{ height: `${(Number(m.revenue) / maxRev) * 80}px`, minHeight: "2px" }} />
                    <span className="text-[9px] text-muted-foreground">{m.month?.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FleetDashboard() {
  const { data, isLoading } = useApiQuery<any>(["module-dash-fleet"], "/module-dashboards/fleet");
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard title="إجمالي المركبات" value={data.vehicles?.total ?? 0} icon={Truck} color="blue" />
        <KpiCard title="متاحة" value={data.vehicles?.active ?? 0} icon={CheckCircle} color="green" />
        <KpiCard title="قيد الاستخدام" value={data.vehicles?.inUse ?? 0} icon={Activity} color="orange" />
        <KpiCard title="تحتاج صيانة" value={data.vehicles?.needsService ?? 0} icon={Wrench} color="red" />
        <KpiCard title="خارج الخدمة" value={data.vehicles?.outOfService ?? 0} icon={AlertTriangle} color="purple" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الرحلات</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.trips?.total ?? 0}</div>
            <div className="text-xs text-muted-foreground space-y-1 mt-2">
              <div>نشطة: {data.trips?.active ?? 0}</div>
              <div>مكتملة: {data.trips?.completed ?? 0}</div>
              <div>المسافة الإجمالية: {Number(data.trips?.totalDistance ?? 0).toLocaleString()} كم</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الصيانة</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.maintenance?.pending ?? 0}</div>
            <p className="text-xs text-muted-foreground">طلبات صيانة معلقة</p>
            <p className="text-xs mt-2">التكلفة الإجمالية: {Number(data.maintenance?.totalCost ?? 0).toLocaleString()} ر.س</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الوقود</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(data.fuel?.totalCost ?? 0).toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground">إجمالي تكلفة الوقود</p>
            <p className="text-xs mt-2">{Number(data.fuel?.totalLiters ?? 0).toLocaleString()} لتر</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LegalDashboard() {
  const { data, isLoading } = useApiQuery<any>(["module-dash-legal"], "/module-dashboards/legal");
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="العقود النشطة" value={data.contracts?.active ?? 0} icon={FileText} color="blue" subtitle={`من ${data.contracts?.total ?? 0}`} />
        <KpiCard title="عقود تنتهي قريباً" value={data.contracts?.expiringSoon ?? 0} icon={AlertTriangle} color="orange" />
        <KpiCard title="القضايا المفتوحة" value={data.cases?.open ?? 0} icon={Scale} color="red" subtitle={`عالية الأولوية: ${data.cases?.highPriority ?? 0}`} />
        <KpiCard title="جلسات قادمة" value={data.upcomingSessions ?? 0} icon={Clock} color="purple" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">حالة القضايا</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.casesByStatus || []).map((s: any) => (
              <MiniBar
                key={s.status}
                label={s.status === "open" ? "مفتوحة" : s.status === "in_progress" ? "قيد النظر" : s.status === "closed" ? "مغلقة" : s.status}
                value={Number(s.count)}
                max={data.cases?.total ?? 1}
                color={s.status === "open" ? "red" : s.status === "in_progress" ? "orange" : "green"}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص العقود</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(data.contracts?.totalValue ?? 0).toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground">إجمالي قيمة العقود</p>
            <div className="mt-3 space-y-2">
              <MiniBar label="نشطة" value={data.contracts?.active ?? 0} max={data.contracts?.total ?? 1} color="green" />
              <MiniBar label="تنتهي قريباً" value={data.contracts?.expiringSoon ?? 0} max={data.contracts?.total ?? 1} color="orange" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PropertiesDashboard() {
  const { data, isLoading } = useApiQuery<any>(["module-dash-properties"], "/module-dashboards/properties");
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard title="إجمالي الوحدات" value={data.units?.total ?? 0} icon={Building2} color="blue" />
        <KpiCard title="مؤجرة" value={data.units?.rented ?? 0} icon={CheckCircle} color="green" subtitle={`نسبة الإشغال: ${data.occupancyRate ?? 0}%`} />
        <KpiCard title="شاغرة" value={data.units?.available ?? 0} icon={AlertTriangle} color="orange" />
        <KpiCard title="دخل شهري" value={`${Number(data.contracts?.monthlyIncome ?? 0).toLocaleString()} ر.س`} icon={DollarSign} color="green" />
        <KpiCard title="متأخرات تحصيل" value={data.payments?.overdue ?? 0} icon={Clock} color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">التحصيل</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.payments?.collectionRate ?? 0}%</div>
            <p className="text-xs text-muted-foreground">نسبة التحصيل</p>
            <div className="mt-2 space-y-1 text-xs">
              <div>المستحق: {Number(data.payments?.totalDue ?? 0).toLocaleString()} ر.س</div>
              <div>المحصّل: {Number(data.payments?.totalCollected ?? 0).toLocaleString()} ر.س</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">عقود تنتهي قريباً</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{data.contracts?.expiringSoon ?? 0}</div>
            <p className="text-xs text-muted-foreground">خلال 30 يوم</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الصيانة</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.maintenance?.open ?? 0}</div>
            <p className="text-xs text-muted-foreground">طلبات مفتوحة</p>
            {(data.maintenance?.critical ?? 0) > 0 && (
              <Badge variant="destructive" className="mt-2 text-[10px]">
                {data.maintenance.critical} حرجة
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectsDashboard() {
  const { data, isLoading } = useApiQuery<any>(["module-dash-projects"], "/module-dashboards/projects");
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي المشاريع" value={data.projects?.total ?? 0} icon={FolderKanban} color="blue" />
        <KpiCard title="نشطة" value={data.projects?.active ?? 0} icon={Activity} color="green" />
        <KpiCard title="مكتملة" value={data.projects?.completed ?? 0} icon={CheckCircle} color="cyan" />
        <KpiCard title="متأخرة" value={data.projects?.delayed ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="متوسط التقدم" value={`${data.projects?.avgProgress ?? 0}%`} icon={BarChart3} color="purple" />
        <KpiCard title="تجاوز الميزانية" value={data.budget?.overBudget ?? 0} icon={TrendingDown} color="orange" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الميزانية</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الميزانية</span>
                <span className="font-medium">{Number(data.budget?.totalBudget ?? 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المنصرف</span>
                <span className="font-medium">{Number(data.budget?.totalSpent ?? 0).toLocaleString()} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الانحراف</span>
                <span className={`font-medium ${(data.budget?.variance ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {data.budget?.variance ?? 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المهام</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <MiniBar label="مكتملة" value={data.tasks?.done ?? 0} max={data.tasks?.total ?? 1} color="green" />
            <MiniBar label="معلقة" value={data.tasks?.blocked ?? 0} max={data.tasks?.total ?? 1} color="orange" />
            <MiniBar label="متأخرة" value={data.tasks?.overdue ?? 0} max={data.tasks?.total ?? 1} color="red" />
          </CardContent>
        </Card>
      </div>

      {data.projectProgress?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المشاريع النشطة</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.projectProgress.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 truncate font-medium">{p.name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${Number(p.progress) >= 80 ? "bg-green-500" : Number(p.progress) >= 50 ? "bg-blue-500" : "bg-orange-500"}`}
                      style={{ width: `${p.progress ?? 0}%` }}
                    />
                  </div>
                  <span className="w-10 text-xs text-start">{p.progress ?? 0}%</span>
                  {p.status === "active" && p.endDate && new Date(p.endDate) < new Date() && (
                    <Badge variant="destructive" className="text-[9px]">متأخر</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="p-4"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CardContent></Card>
        ))}
      </div>
    </div>
  );
}

const tabConfig = [
  { key: "hr", label: "الموارد البشرية", icon: Users, component: HrDashboard },
  { key: "finance", label: "المالية", icon: DollarSign, component: FinanceDashboard },
  { key: "fleet", label: "النقليات", icon: Truck, component: FleetDashboard },
  { key: "legal", label: "القانونية", icon: Scale, component: LegalDashboard },
  { key: "properties", label: "الأملاك", icon: Building2, component: PropertiesDashboard },
  { key: "projects", label: "المشاريع", icon: FolderKanban, component: ProjectsDashboard },
];

export default function ModuleDashboardsPage() {
  return (
    <PageShell
      title="لوحات مؤشرات المسارات"
      subtitle="مؤشرات أداء مخصصة لكل مسار تشغيلي"
    >
      <Tabs defaultValue="hr" dir="rtl">
        <TabsList className="flex-wrap h-auto gap-1">
          {tabConfig.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5 text-xs">
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map(t => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <t.component />
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}
