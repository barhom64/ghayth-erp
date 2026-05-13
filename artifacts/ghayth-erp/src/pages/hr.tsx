import { useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// P4.2 — HR hub sweep: shared header from P1.
import { PageShell } from "@/components/page-shell";
import {
  Users, Clock, Calendar, DollarSign, GraduationCap, Target,
  Briefcase, Scale, CalendarClock, Network, UserPlus, ChevronLeft,
  TrendingUp, AlertCircle, CheckCircle2, ClipboardCheck,
  Wallet, Timer, LogOut, ArrowRightLeft, Star, Award,
  FileText, BookOpen, CalendarOff, BarChart3,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  iconColor: string;
  trend?: { value: number; label: string };
  onClick?: () => void;
}

function KPICard({ title, value, subtitle, icon: Icon, iconColor, trend, onClick }: KPICardProps) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow hover:border-status-info-surface" : ""}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 text-end">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold mt-0.5">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 justify-end mt-1 text-xs ${trend.value >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                <TrendingUp className="h-3 w-3" />
                <span>{trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QuickLinkProps {
  label: string;
  icon: any;
  iconColor: string;
  path: string;
  description?: string;
}

function QuickLink({ label, icon: Icon, iconColor, path, description }: QuickLinkProps) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(path)}
      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-status-info-surface hover:bg-status-info-surface transition-all text-right w-full"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
      </div>
      <ChevronLeft className="h-4 w-4 text-gray-300 shrink-0" />
    </button>
  );
}

export default function HR() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";

  const empQ = useApiQuery<any>(["employees-summary", scopeQueryString], `/employees?page=1&limit=1${scopeSuffix}`);
  const leavesQ = useApiQuery<any>(["leaves-pending", scopeQueryString], `/hr/leave-requests?status=pending&page=1&limit=1${scopeSuffix}`);
  const payrollQ = useApiQuery<any>(["payroll-latest", scopeQueryString], `/hr/payroll?page=1&limit=1${scopeSuffix}`);
  const attendanceQ = useApiQuery<any>(["attendance-today", scopeQueryString], `/hr/attendance?page=1&limit=1${scopeSuffix}`);
  const loansQ = useApiQuery<any>(["loans-active", scopeQueryString], `/hr/loans?status=active&page=1&limit=1${scopeSuffix}`);
  const overtimeQ = useApiQuery<any>(["overtime-pending", scopeQueryString], `/hr/overtime?status=pending&page=1&limit=1${scopeSuffix}`);
  const exitQ = useApiQuery<any>(["exit-pending", scopeQueryString], `/hr/exit?status=pending&page=1&limit=1${scopeSuffix}`);
  const violationsQ = useApiQuery<any>(["violations-stats", scopeQueryString], `/hr/violations-stats?${scopeQueryString || ""}`);

  const isLoading = empQ.isLoading || leavesQ.isLoading || payrollQ.isLoading || attendanceQ.isLoading;
  const isError = empQ.isError || leavesQ.isError || payrollQ.isError || attendanceQ.isError;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const totalEmployees = empQ.data?.total ?? "—";
  const pendingLeaves = leavesQ.data?.total ?? "—";
  const latestPayroll = asList(payrollQ.data)[0];
  const totalAttendanceToday = attendanceQ.data?.total ?? "—";
  const activeLoans = loansQ.data?.total ?? 0;
  const pendingOvertime = overtimeQ.data?.total ?? 0;
  const pendingExit = exitQ.data?.total ?? 0;
  const violationsThisMonth = violationsQ.data?.thisMonth ?? 0;

  return (
    <PageShell
      title="الموارد البشرية"
      subtitle="نظرة شاملة على أداء وإدارة الموارد البشرية"
      breadcrumbs={[{ label: "الموارد البشرية" }]}
      actions={
        <GuardedButton perm="hr:create" onClick={() => navigate("/employees/create")} className="gap-2">
          <UserPlus className="h-4 w-4" />
          إضافة موظف
        </GuardedButton>
      }
    >
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="إجمالي الموظفين"
          value={totalEmployees}
          icon={Users}
          iconColor="text-status-info-foreground bg-status-info-surface"
          onClick={() => navigate("/employees")}
        />
        <KPICard
          title="حضور اليوم"
          value={totalAttendanceToday}
          icon={Clock}
          iconColor="text-purple-600 bg-purple-50"
          onClick={() => navigate("/hr/attendance")}
        />
        <KPICard
          title="إجازات معلقة"
          value={pendingLeaves}
          subtitle="بانتظار الاعتماد"
          icon={Calendar}
          iconColor="text-status-warning-foreground bg-status-warning-surface"
          onClick={() => navigate("/hr/leaves?tab=pending")}
        />
        <KPICard
          title="آخر مسير رواتب"
          value={latestPayroll ? formatCurrency(latestPayroll.totalNet) : "—"}
          subtitle={latestPayroll?.period || "لا توجد بيانات"}
          icon={DollarSign}
          iconColor="text-emerald-600 bg-emerald-50"
          onClick={() => navigate("/hr/payroll")}
        />
        <KPICard
          title="سلف نشطة"
          value={activeLoans}
          subtitle="قروض جارية"
          icon={Wallet}
          iconColor="text-orange-600 bg-orange-50"
          onClick={() => navigate("/hr/loans")}
        />
        <KPICard
          title="وقت إضافي معلق"
          value={pendingOvertime}
          subtitle="بانتظار الاعتماد"
          icon={Timer}
          iconColor="text-cyan-600 bg-cyan-50"
          onClick={() => navigate("/hr/overtime")}
        />
        <KPICard
          title="طلبات نهاية خدمة"
          value={pendingExit}
          subtitle="قيد المعالجة"
          icon={LogOut}
          iconColor="text-rose-600 bg-rose-50"
          onClick={() => navigate("/hr/exit")}
        />
        <KPICard
          title="مخالفات الشهر"
          value={violationsThisMonth}
          subtitle="مخالفات مسجلة"
          icon={Scale}
          iconColor="text-status-error-foreground bg-status-error-surface"
          onClick={() => navigate("/hr/violations")}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-status-neutral-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-status-info" />
            إدارة الموظفين
          </h2>
          <div className="space-y-2">
            <QuickLink label="الموظفين" icon={Users} iconColor="text-status-info-foreground bg-status-info-surface" path="/employees" description="قائمة جميع الموظفين وبياناتهم" />
            <QuickLink label="تفعيل الموظفين" icon={UserPlus} iconColor="text-indigo-600 bg-indigo-50" path="/hr/employee-activation" description="تفعيل حسابات الموظفين الجدد" />
            <QuickLink label="مراجعة التعيين" icon={ClipboardCheck} iconColor="text-violet-600 bg-violet-50" path="/hr/onboarding-review" description="متابعة إجراءات التعيين" />
            <QuickLink label="الهيكل التنظيمي" icon={Network} iconColor="text-sky-600 bg-sky-50" path="/hr/organization" description="عرض وإدارة الهيكل التنظيمي" />
            <QuickLink label="الوثائق المنتهية" icon={FileText} iconColor="text-status-error-foreground bg-status-error-surface" path="/hr/expiring-documents" description="متابعة الإقامات والتصاريح" />
            <QuickLink label="الخطابات الرسمية" icon={FileText} iconColor="text-muted-foreground bg-surface-subtle" path="/hr/official-letters" description="خطابات التعريف والشهادات" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-status-neutral-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            الحضور والإجازات
          </h2>
          <div className="space-y-2">
            <QuickLink label="الحضور والانصراف" icon={Clock} iconColor="text-purple-600 bg-purple-50" path="/hr/attendance" description="سجل الحضور اليومي" />
            <QuickLink label="تقارير الحضور" icon={CheckCircle2} iconColor="text-purple-500 bg-purple-50" path="/hr/attendance/reports" description="تقارير وإحصاءات الحضور" />
            <QuickLink label="الإجازات وإدارتها" icon={Calendar} iconColor="text-emerald-600 bg-emerald-50" path="/hr/leaves" description="طلبات الإجازة وإدارتها" />
            <QuickLink label="الورديات" icon={CalendarClock} iconColor="text-teal-600 bg-teal-50" path="/hr/shifts" description="جداول وإدارة الورديات" />
            <QuickLink label="العطل الرسمية" icon={CalendarOff} iconColor="text-status-success-foreground bg-status-success-surface" path="/hr/public-holidays" description="إدارة العطل والمناسبات" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-status-neutral-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            الرواتب والأداء
          </h2>
          <div className="space-y-2">
            <QuickLink label="الرواتب" icon={DollarSign} iconColor="text-emerald-600 bg-emerald-50" path="/hr/payroll" description="مسيرات الرواتب والمكافآت" />
            <QuickLink label="سلف الموظفين" icon={Wallet} iconColor="text-orange-600 bg-orange-50" path="/hr/loans" description="إدارة سلف وقروض الموظفين" />
            <QuickLink label="الوقت الإضافي" icon={Timer} iconColor="text-cyan-600 bg-cyan-50" path="/hr/overtime" description="طلبات ساعات العمل الإضافية" />
            <QuickLink label="تقييم الأداء" icon={Target} iconColor="text-orange-600 bg-orange-50" path="/hr/performance" description="تقييمات الأداء الدورية" />
            <QuickLink label="تقييم 360°" icon={Star} iconColor="text-status-warning-foreground bg-status-warning-surface" path="/hr/evaluation-360" description="تقييم شامل متعدد الأطراف" />
            <QuickLink label="التدريب" icon={GraduationCap} iconColor="text-cyan-600 bg-cyan-50" path="/hr/training" description="البرامج التدريبية للموظفين" />
            <QuickLink label="مكافأة نهاية الخدمة" icon={Award} iconColor="text-status-success-foreground bg-status-success-surface" path="/hr/gratuity" description="حساب وتقدير المكافآت" />
            <QuickLink label="خطط التطوير" icon={BookOpen} iconColor="text-indigo-600 bg-indigo-50" path="/hr/idp" description="خطط التطوير الفردي للموظفين" />
            <QuickLink label="تقرير الدوران" icon={BarChart3} iconColor="text-rose-600 bg-rose-50" path="/hr/turnover-report" description="تحليل معدل الدوران والتكاليف" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-status-neutral-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-rose-500" />
            التوظيف والمخالفات
          </h2>
          <div className="space-y-2">
            <QuickLink label="التوظيف" icon={Briefcase} iconColor="text-rose-600 bg-rose-50" path="/hr/recruitment" description="الوظائف الشاغرة والمتقدمين" />
            <QuickLink label="المتقدمين" icon={Users} iconColor="text-pink-600 bg-pink-50" path="/hr/recruitment/applications" description="طلبات التقديم المستلمة" />
            <QuickLink label="المخالفات والجزاءات" icon={Scale} iconColor="text-status-error-foreground bg-status-error-surface" path="/hr/violations" description="سجل المخالفات والجزاءات" />
            <QuickLink label="نهاية الخدمة" icon={LogOut} iconColor="text-muted-foreground bg-surface-subtle" path="/hr/exit" description="طلبات إنهاء الخدمة والتسوية" />
            <QuickLink label="نقل الموظفين" icon={ArrowRightLeft} iconColor="text-status-info-foreground bg-status-info-surface" path="/hr/transfers" description="طلبات النقل بين الفروع" />
          </div>
        </div>

        <div className="md:col-span-2 lg:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-status-neutral-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-status-warning" />
            إجراءات سريعة
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate("/hr/leaves/create")}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-emerald-200 hover:bg-emerald-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-emerald-600 bg-emerald-50">
                <Calendar className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-status-neutral-foreground">طلب إجازة</span>
            </button>
            <button
              onClick={() => navigate("/hr/leaves?tab=pending")}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-status-info-surface hover:bg-status-info-surface transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-status-info-foreground bg-status-info-surface">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-status-neutral-foreground">اعتماد الإجازات</span>
            </button>
            <button
              onClick={() => navigate("/hr/attendance/qr-scanner")}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-purple-200 hover:bg-purple-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-purple-600 bg-purple-50">
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-status-neutral-foreground">تسجيل الحضور</span>
            </button>
            <button
              onClick={() => navigate("/employees/create")}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-indigo-600 bg-indigo-50">
                <UserPlus className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-status-neutral-foreground">إضافة موظف</span>
            </button>
            <button
              onClick={() => navigate("/hr/loans/create")}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-orange-200 hover:bg-orange-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-orange-600 bg-orange-50">
                <Wallet className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-status-neutral-foreground">طلب سلفة</span>
            </button>
            <button
              onClick={() => navigate("/hr/overtime/create")}
              className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-cyan-200 hover:bg-cyan-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-cyan-600 bg-cyan-50">
                <Timer className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-status-neutral-foreground">تسجيل وقت إضافي</span>
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
