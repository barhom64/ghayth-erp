import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatCurrency , todayLocal } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts";
import {
  Calendar, TrendingUp, TrendingDown, Users, DollarSign, CheckCircle2,
  Clock, Headphones, FileText, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-100 text-xs" dir="rtl">
      <p className="font-semibold mb-1.5 text-gray-700">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5 py-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          {p.name}: {formatNumber(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

function ChangeIndicator({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-gray-400">بدون تغيير</span>;
  return (
    <span className={cn("text-xs font-medium flex items-center gap-0.5", value > 0 ? "text-emerald-600" : "text-red-500")}>
      {value > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {value > 0 ? "+" : ""}{value}{suffix}
    </span>
  );
}

function StatBox({ label, value, sub, icon: Icon, color = "blue", change }: {
  label: string; value: string | number; sub?: string; icon: any; color?: string; change?: number;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.split(" ")[0])}>
            <Icon className={cn("w-5 h-5", c.split(" ")[1])} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            {change !== undefined && <ChangeIndicator value={change} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyReportTab() {
  const [date, setDate] = useState(todayLocal());
  const { data, isLoading, isError } = useApiQuery<any>(["admin-report-daily", date], `/bi/admin-reports/daily?date=${date}`);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!data) return <div className="text-center py-12 text-muted-foreground">لا توجد بيانات</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 print:hidden">
        <div>
          <Label>التاريخ</Label>
          <DatePicker value={date} onChange={setDate} className="w-48" />
        </div>
      </div>

      <div className="text-center print:block hidden mb-4">
        <h2 className="text-xl font-bold">التقرير اليومي — {date}</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="الحضور" value={`${data.attendance.present}/${data.attendance.total}`} sub={`غياب: ${data.attendance.absent} | تأخير: ${data.attendance.late}`} icon={Users} color="blue" />
        <StatBox label="المهام المجدولة" value={data.tasks.scheduled} sub={`مكتملة: ${data.tasks.completed} | متأخرة: ${data.tasks.overdue}`} icon={CheckCircle2} color="green" />
        <StatBox label="الفواتير" value={`${data.financial.invoiceCount} فاتورة`} sub={`الإجمالي: ${formatCurrency(data.financial.invoicesTotal)}`} icon={DollarSign} color="purple" />
        <StatBox label="تذاكر الدعم" value={`${data.tickets.opened} جديدة`} sub={`تم حلها: ${data.tickets.resolved}`} icon={Headphones} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">الحضور</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "حاضر", value: data.attendance.present },
                  { name: "غائب", value: data.attendance.absent },
                  { name: "متأخر", value: data.attendance.late },
                ]}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="العدد" radius={[4, 4, 0, 0]}>
                    {["#10b981", "#ef4444", "#f59e0b"].map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">المهام</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "مجدولة", value: data.tasks.scheduled, fill: "#3b82f6" },
                  { name: "مكتملة", value: data.tasks.completed, fill: "#10b981" },
                  { name: "متأخرة", value: data.tasks.overdue, fill: "#ef4444" },
                ]}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="العدد" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص مالي</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">عدد الفواتير</span><span className="font-bold">{data.financial.invoiceCount}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">إجمالي الفواتير</span><span className="font-bold">{formatCurrency(data.financial.invoicesTotal)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">المحصّل</span><span className="font-bold text-green-600">{formatCurrency(data.financial.paidTotal)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">طلبات الإجازة</span><span className="font-bold">{data.leaveRequests}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WeeklyReportTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["admin-report-weekly"], "/bi/admin-reports/weekly");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!data) return <div className="text-center py-12 text-muted-foreground">لا توجد بيانات</div>;

  const { current, previous, changes, period } = data;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        الفترة: {period.from} إلى {period.to}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="نسبة إنجاز المهام" value={`${current.tasks.completionRate}%`} icon={CheckCircle2} color="green" change={changes.tasksCompletionRate} />
        <StatBox label="نسبة الحضور" value={`${current.attendance.presentRate}%`} icon={Users} color="blue" change={changes.attendancePresentRate} />
        <StatBox label="الإيرادات" value={formatCurrency(current.revenue)} icon={DollarSign} color="purple" change={changes.revenueChange} />
        <StatBox label="التذاكر المحلولة" value={current.tickets.resolved} icon={Headphones} color="amber" change={changes.ticketsResolved} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">مقارنة المهام (هذا الأسبوع vs السابق)</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "الإجمالي", current: current.tasks.total, previous: previous.tasks.total },
                  { name: "مكتمل", current: current.tasks.completed, previous: previous.tasks.completed },
                  { name: "متأخر", current: current.tasks.overdue, previous: previous.tasks.overdue },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="current" name="هذا الأسبوع" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" name="الأسبوع السابق" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">مقارنة الحضور</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "الإجمالي", current: current.attendance.total, previous: previous.attendance.total },
                  { name: "حاضر", current: current.attendance.present, previous: previous.attendance.present },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="current" name="هذا الأسبوع" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" name="الأسبوع السابق" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MonthlyReportTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["admin-report-monthly"], "/bi/admin-reports/monthly");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!data) return <div className="text-center py-12 text-muted-foreground">لا توجد بيانات</div>;

  const { current, previous, changes, weeklyTrend, period } = data;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        الفترة: {period.from} إلى {period.to}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="نسبة إنجاز المهام" value={`${current.tasks.completionRate}%`} icon={CheckCircle2} color="green" change={changes.tasksCompletionRate} />
        <StatBox label="نسبة الحضور" value={`${current.attendance.presentRate}%`} icon={Users} color="blue" change={changes.attendancePresentRate} />
        <StatBox label="الإيرادات" value={formatCurrency(current.financial.revenue)} icon={DollarSign} color="purple" change={changes.revenueChange} />
        <StatBox label="التذاكر المحلولة" value={current.tickets.resolved} icon={Headphones} color="amber" change={changes.ticketsResolved} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">ملخص المهام</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">إجمالي المهام</span><span className="font-bold">{current.tasks.total}</span></div>
            <div className="flex justify-between"><span className="text-sm">المكتملة</span><span className="font-bold text-green-600">{current.tasks.completed}</span></div>
            <div className="flex justify-between"><span className="text-sm">المتأخرة</span><span className="font-bold text-red-600">{current.tasks.overdue}</span></div>
            <div className="flex justify-between"><span className="text-sm">نسبة الإنجاز</span><Badge variant={current.tasks.completionRate >= 70 ? "default" : "destructive"}>{current.tasks.completionRate}%</Badge></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">ملخص مالي</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">الإيرادات</span><span className="font-bold">{formatCurrency(current.financial.revenue)}</span></div>
            <div className="flex justify-between"><span className="text-sm">المحصّل</span><span className="font-bold text-green-600">{formatCurrency(current.financial.collected)}</span></div>
            <div className="flex justify-between"><span className="text-sm">عدد الفواتير</span><span className="font-bold">{current.financial.invoiceCount}</span></div>
            <div className="flex justify-between"><span className="text-sm">فواتير متأخرة</span><span className="font-bold text-red-600">{current.financial.overdueInvoices}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">الحضور</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">إجمالي التسجيلات</span><span className="font-bold">{current.attendance.total}</span></div>
            <div className="flex justify-between"><span className="text-sm">حاضر</span><span className="font-bold text-green-600">{current.attendance.present}</span></div>
            <div className="flex justify-between"><span className="text-sm">غائب</span><span className="font-bold text-red-600">{current.attendance.absent}</span></div>
            <div className="flex justify-between"><span className="text-sm">متأخر</span><span className="font-bold text-amber-600">{current.attendance.late}</span></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">الموارد البشرية</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm">تعيينات جديدة</span><span className="font-bold">{current.hr.newEmployees}</span></div>
            <div className="flex justify-between"><span className="text-sm">طلبات الإجازة</span><span className="font-bold">{current.leaves.total}</span></div>
            <div className="flex justify-between"><span className="text-sm">إجازات مقبولة</span><span className="font-bold text-green-600">{current.leaves.approved}</span></div>
            <div className="flex justify-between"><span className="text-sm">إجازات مرفوضة</span><span className="font-bold text-red-600">{current.leaves.rejected}</span></div>
            <div className="flex justify-between"><span className="text-sm">أيام الإجازة</span><span className="font-bold">{current.leaves.totalDays} يوم</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-sm">الدعم الفني</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{current.tickets.opened}</div>
            <p className="text-xs text-muted-foreground">تذاكر مفتوحة</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{current.tickets.resolved}</div>
            <p className="text-xs text-muted-foreground">تم حلها</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{current.tickets.avgResolutionHours || 0} ساعة</div>
            <p className="text-xs text-muted-foreground">متوسط وقت الحل</p>
          </div>
        </CardContent>
      </Card>

      {weeklyTrend.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">اتجاه المهام خلال الشهر</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="الإجمالي" stroke="#94a3b8" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="completed" name="المكتمل" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BiAdminReportsPage() {
  return (
    <PageShell
      title="التقارير الإدارية"
      subtitle="تقارير يومية وأسبوعية وشهرية شاملة"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden gap-2">
          <Printer className="w-4 h-4" /> طباعة التقرير
        </Button>
      }
    >
      <Tabs defaultValue="daily" dir="rtl">
        <TabsList className="grid w-full grid-cols-3 print:hidden">
          <TabsTrigger value="daily" className="gap-1"><Calendar className="w-4 h-4" /> يومي</TabsTrigger>
          <TabsTrigger value="weekly" className="gap-1"><FileText className="w-4 h-4" /> أسبوعي</TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1"><TrendingUp className="w-4 h-4" /> شهري</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailyReportTab /></TabsContent>
        <TabsContent value="weekly"><WeeklyReportTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyReportTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
