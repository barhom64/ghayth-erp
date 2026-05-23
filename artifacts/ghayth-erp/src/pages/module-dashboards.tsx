import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveStatus } from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, DollarSign, Truck, Scale, Building2, FolderKanban,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock,
  Wrench, Shield, FileText, BarChart3, Activity,
  Target, ShoppingCart, Headphones, ListTodo, Package, Briefcase, MessageSquare, Layers,
} from "lucide-react";

function KpiCard({ title, value, subtitle, icon: Icon, trend, color = "blue" }: {
  title: string; value: string | number; subtitle?: string;
  icon: any; trend?: "up" | "down" | "neutral"; color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-status-info-surface text-status-info-foreground",
    green: "bg-status-success-surface text-status-success-foreground",
    red: "bg-status-error-surface text-status-error-foreground",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
    cyan: "bg-cyan-50 text-cyan-600",
    yellow: "bg-status-warning-surface text-status-warning-foreground",
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
          <div className={`flex items-center gap-1 text-xs mt-2 ${trend === "up" ? "text-status-success-foreground" : trend === "down" ? "text-status-error-foreground" : "text-muted-foreground"}`}>
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
    blue: "bg-status-info-surface0", green: "bg-status-success-surface0", red: "bg-status-error-surface0",
    orange: "bg-orange-500", purple: "bg-purple-500",
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-2 bg-surface-subtle rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color] || "bg-status-info-surface0"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-start font-medium">{value}</span>
    </div>
  );
}

function HrDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-hr"], "/module-dashboards/hr");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
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
            <MiniBar label="معلقة" value={data.leaves?.pending ?? 0} max={Math.max((data.leaves?.pending ?? 0) + (data.leaves?.approved ?? 0) + (data.leaves?.rejected ?? 0), 1)} color="orange" />
            <MiniBar label="معتمدة" value={data.leaves?.approved ?? 0} max={Math.max((data.leaves?.pending ?? 0) + (data.leaves?.approved ?? 0) + (data.leaves?.rejected ?? 0), 1)} color="green" />
            <MiniBar label="مرفوضة" value={data.leaves?.rejected ?? 0} max={Math.max((data.leaves?.pending ?? 0) + (data.leaves?.approved ?? 0) + (data.leaves?.rejected ?? 0), 1)} color="red" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المخالفات (الشهر الحالي)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.violations?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              إجمالي الخصومات: {formatCurrency(Number(data.violations?.totalDeductions ?? 0))}
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
                    <span className="text-[9px] text-muted-foreground">{d.date ? formatDateAr(d.date) : ""}</span>
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
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-finance"], "/module-dashboards/finance");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي الإيرادات" value={formatCurrency(data.revenue?.total ?? 0)} icon={DollarSign} color="green" />
        <KpiCard title="المحصّل" value={formatCurrency(data.revenue?.paid ?? 0)} icon={CheckCircle} color="blue" />
        <KpiCard title="مستحقات" value={formatCurrency(data.revenue?.outstanding ?? 0)} icon={Clock} color="orange" />
        <KpiCard title="فواتير متأخرة" value={data.invoices?.overdue ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="مصروفات الشهر" value={formatCurrency(data.expenses?.monthTotal ?? 0)} icon={TrendingDown} color="purple" />
        <KpiCard title="استخدام الميزانية" value={`${data.budgets?.avgUsage ?? 0}%`} icon={BarChart3} color="cyan" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ذمم مدينة متأخرة</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-error-foreground">{formatCurrency(data.receivables?.amount ?? 0)}</div>
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
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-fleet"], "/module-dashboards/fleet");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
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
              <div>المسافة الإجمالية: {formatNumber(Number(data.trips?.totalDistance ?? 0))} كم</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الصيانة</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.maintenance?.pending ?? 0}</div>
            <p className="text-xs text-muted-foreground">طلبات صيانة معلقة</p>
            <p className="text-xs mt-2">التكلفة الإجمالية: {formatCurrency(Number(data.maintenance?.totalCost ?? 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الوقود</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(Number(data.fuel?.totalCost ?? 0))}</div>
            <p className="text-xs text-muted-foreground">إجمالي تكلفة الوقود</p>
            <p className="text-xs mt-2">{formatNumber(Number(data.fuel?.totalLiters ?? 0))} لتر</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LegalDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-legal"], "/module-dashboards/legal");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
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
                label={resolveStatus(s.status, "legal_case")?.label ?? s.status}
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
            <div className="text-2xl font-bold">{formatCurrency(Number(data.contracts?.totalValue ?? 0))}</div>
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
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-properties"], "/module-dashboards/properties");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard title="إجمالي الوحدات" value={data.units?.total ?? 0} icon={Building2} color="blue" />
        <KpiCard title="مؤجرة" value={data.units?.rented ?? 0} icon={CheckCircle} color="green" subtitle={`نسبة الإشغال: ${data.occupancyRate ?? 0}%`} />
        <KpiCard title="شاغرة" value={data.units?.available ?? 0} icon={AlertTriangle} color="orange" />
        <KpiCard title="دخل شهري" value={formatCurrency(Number(data.contracts?.monthlyIncome ?? 0))} icon={DollarSign} color="green" />
        <KpiCard title="متأخرات تحصيل" value={data.payments?.overdue ?? 0} icon={Clock} color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">التحصيل</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-success-foreground">{data.payments?.collectionRate ?? 0}%</div>
            <p className="text-xs text-muted-foreground">نسبة التحصيل</p>
            <div className="mt-2 space-y-1 text-xs">
              <div>المستحق: {formatCurrency(Number(data.payments?.totalDue ?? 0))}</div>
              <div>المحصّل: {formatCurrency(Number(data.payments?.totalCollected ?? 0))}</div>
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
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-projects"], "/module-dashboards/projects");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
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
                <span className="font-medium">{formatCurrency(Number(data.budget?.totalBudget ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المنصرف</span>
                <span className="font-medium">{formatCurrency(Number(data.budget?.totalSpent ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الانحراف</span>
                <span className={`font-medium ${(data.budget?.variance ?? 0) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
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
                  <div className="flex-1 h-2 bg-surface-subtle rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${Number(p.progress) >= 80 ? "bg-status-success-surface0" : Number(p.progress) >= 50 ? "bg-status-info-surface0" : "bg-orange-500"}`}
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

function CrmDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-crm"], "/module-dashboards/crm");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي الفرص" value={data.opportunities?.total ?? 0} icon={Target} color="blue" />
        <KpiCard title="فرص مفتوحة" value={data.opportunities?.open ?? 0} icon={Briefcase} color="orange" />
        <KpiCard title="فرص مكسوبة" value={data.opportunities?.won ?? 0} icon={CheckCircle} color="green" />
        <KpiCard title="فرص خاسرة" value={data.opportunities?.lost ?? 0} icon={TrendingDown} color="red" />
        <KpiCard title="قيمة الفرص" value={formatCurrency(data.opportunities?.totalValue ?? 0)} icon={DollarSign} color="purple" />
        <KpiCard title="جهات الاتصال" value={data.contacts?.total ?? 0} icon={Users} color="cyan" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الأنشطة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <MiniBar label="مكتملة" value={data.activities?.completed ?? 0} max={data.activities?.total ?? 1} color="green" />
            <MiniBar label="معلقة" value={data.activities?.pending ?? 0} max={data.activities?.total ?? 1} color="orange" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">قمع المبيعات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data.pipeline || []).map((s: any) => (
                <MiniBar key={s.name} label={s.name} value={Number(s.count)} max={Math.max(data.opportunities?.total ?? 1, 1)} color="blue" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StoreDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-store"], "/module-dashboards/store");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard title="إجمالي الطلبات" value={data.orders?.total ?? 0} icon={ShoppingCart} color="blue" />
        <KpiCard title="طلبات معلقة" value={data.orders?.pending ?? 0} icon={Clock} color="orange" />
        <KpiCard title="طلبات مكتملة" value={data.orders?.completed ?? 0} icon={CheckCircle} color="green" />
        <KpiCard title="منتجات نشطة" value={data.products?.active ?? 0} icon={Package} color="purple" subtitle={`من ${data.products?.total ?? 0}`} />
        <KpiCard title="إجمالي الإيرادات" value={formatCurrency(data.revenue?.completed ?? 0)} icon={DollarSign} color="green" />
      </div>
      {data.monthlyOrders?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الطلبات الشهرية</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-1 items-end h-24">
              {data.monthlyOrders.map((m: any, i: number) => {
                const maxOrd = Math.max(...data.monthlyOrders.map((x: any) => Number(x.orders)), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-blue-400 rounded-t" style={{ height: `${(Number(m.orders) / maxOrd) * 80}px`, minHeight: "2px" }} />
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

function SupportDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-support"], "/module-dashboards/support");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي التذاكر" value={data.tickets?.total ?? 0} icon={Headphones} color="blue" />
        <KpiCard title="مفتوحة" value={data.tickets?.open ?? 0} icon={MessageSquare} color="orange" />
        <KpiCard title="قيد المعالجة" value={data.tickets?.inProgress ?? 0} icon={Activity} color="purple" />
        <KpiCard title="تم الحل" value={data.tickets?.resolved ?? 0} icon={CheckCircle} color="green" />
        <KpiCard title="عالية الأولوية" value={data.tickets?.highPriority ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="متوسط الحل (ساعة)" value={data.tickets?.avgResolutionHours ?? 0} icon={Clock} color="cyan" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">التزام SLA</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-status-success-foreground">{data.sla?.compliance ?? 100}%</div>
            <p className="text-xs text-muted-foreground mt-1">{data.sla?.breached ?? 0} تذكرة تجاوزت SLA من {data.sla?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">حسب التصنيف</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.byCategory || []).slice(0, 5).map((c: any) => (
              <MiniBar key={c.category} label={c.category} value={Number(c.count)} max={data.tickets?.total ?? 1} color="blue" />
            ))}
          </CardContent>
        </Card>
      </div>
      {data.weeklyTickets?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">التذاكر - آخر 7 أيام</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-1 items-end h-24">
              {data.weeklyTickets.map((d: any, i: number) => {
                const maxVal = Math.max(...data.weeklyTickets.map((x: any) => Math.max(Number(x.created), Number(x.resolved))), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col gap-0.5" style={{ height: "60px" }}>
                      <div className="bg-blue-400 rounded-t" style={{ height: `${(Number(d.created) / maxVal) * 60}px` }} />
                      <div className="bg-green-400 rounded-b" style={{ height: `${(Number(d.resolved) / maxVal) * 60}px` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{d.date ? formatDateAr(d.date) : ""}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full" />جديدة</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" />محلولة</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TasksDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-tasks"], "/module-dashboards/tasks");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard title="إجمالي المهام" value={data.tasks?.total ?? 0} icon={ListTodo} color="blue" />
        <KpiCard title="معلقة" value={data.tasks?.pending ?? 0} icon={Clock} color="orange" />
        <KpiCard title="قيد التنفيذ" value={data.tasks?.inProgress ?? 0} icon={Activity} color="purple" />
        <KpiCard title="مكتملة" value={data.tasks?.completed ?? 0} icon={CheckCircle} color="green" />
        <KpiCard title="متأخرة" value={data.tasks?.overdue ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="عالية الأولوية" value={data.tasks?.highPriority ?? 0} icon={TrendingUp} color="cyan" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">حسب الأولوية</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.byPriority || []).map((p: any) => (
              <MiniBar
                key={p.priority}
                label={p.priority === "critical" ? "حرجة" : p.priority === "high" ? "عالية" : p.priority === "normal" ? "عادية" : p.priority === "low" ? "منخفضة" : p.priority}
                value={Number(p.count)}
                max={data.tasks?.total ?? 1}
                color={p.priority === "critical" ? "red" : p.priority === "high" ? "orange" : p.priority === "low" ? "green" : "blue"}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الإنجاز</CardTitle></CardHeader>
          <CardContent>
            <MiniBar label="مكتملة" value={data.tasks?.completed ?? 0} max={data.tasks?.total ?? 1} color="green" />
            <div className="mt-2">
              <MiniBar label="قيد التنفيذ" value={data.tasks?.inProgress ?? 0} max={data.tasks?.total ?? 1} color="blue" />
            </div>
            <div className="mt-2">
              <MiniBar label="متأخرة" value={data.tasks?.overdue ?? 0} max={data.tasks?.total ?? 1} color="red" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WarehouseDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(["module-dash-warehouse"], "/module-dashboards/warehouse");
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiCard title="إجمالي المنتجات" value={data.products?.total ?? 0} icon={Package} color="blue" subtitle={`نشط: ${data.products?.active ?? 0}`} />
        <KpiCard title="إجمالي الكمية" value={formatNumber(data.products?.totalQty ?? 0)} icon={Layers} color="green" />
        <KpiCard title="قيمة المخزون" value={formatCurrency(data.products?.totalValue ?? 0)} icon={DollarSign} color="purple" />
        <KpiCard title="مخزون منخفض" value={data.lowStock ?? 0} icon={AlertTriangle} color="red" />
        <KpiCard title="حركات الشهر" value={data.movements?.total ?? 0} icon={Activity} color="orange" subtitle={`وارد: ${data.movements?.inCount ?? 0} | صادر: ${data.movements?.outCount ?? 0}`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">الفئات</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.categories || []).slice(0, 6).map((c: any) => (
              <MiniBar key={c.name} label={c.name} value={Number(c.productCount)} max={data.products?.total ?? 1} color="blue" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">حركات المخزون (الشهر)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">وارد</span>
                <span className="font-medium text-status-success-foreground">{formatNumber(data.movements?.inQty ?? 0)} وحدة</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">صادر</span>
                <span className="font-medium text-status-error-foreground">{formatNumber(data.movements?.outQty ?? 0)} وحدة</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="p-4"><div className="h-16 bg-surface-subtle rounded animate-pulse" /></CardContent></Card>
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
  { key: "crm", label: "إدارة العملاء", icon: Target, component: CrmDashboard },
  { key: "store", label: "المتجر", icon: ShoppingCart, component: StoreDashboard },
  { key: "support", label: "الدعم الفني", icon: Headphones, component: SupportDashboard },
  { key: "tasks", label: "المهام", icon: ListTodo, component: TasksDashboard },
  { key: "warehouse", label: "المستودعات", icon: Package, component: WarehouseDashboard },
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
