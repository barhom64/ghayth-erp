import { useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, Calendar, DollarSign, GraduationCap, Target,
  Briefcase, Scale, CalendarClock, Network, UserPlus, ChevronLeft,
  TrendingUp, AlertCircle, CheckCircle2, ClipboardCheck,
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
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow hover:border-blue-200" : ""}
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
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-right w-full"
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

  const { data: employeesResp } = useApiQuery<any>(["employees-summary", scopeQueryString], `/employees?page=1&limit=1${scopeSuffix}`);
  const { data: pendingLeavesResp } = useApiQuery<any>(["leaves-pending", scopeQueryString], `/hr/leave-requests?status=pending&page=1&limit=1${scopeSuffix}`);
  const { data: payrollResp } = useApiQuery<any>(["payroll-latest", scopeQueryString], `/hr/payroll?page=1&limit=1${scopeSuffix}`);
  const { data: attendanceResp } = useApiQuery<any>(["attendance-today", scopeQueryString], `/hr/attendance?page=1&limit=1${scopeSuffix}`);

  const totalEmployees = employeesResp?.total ?? "—";
  const pendingLeaves = pendingLeavesResp?.total ?? "—";
  const latestPayroll = asList(payrollResp)[0];
  const totalAttendanceToday = attendanceResp?.total ?? "—";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الموارد البشرية</h1>
          <p className="text-muted-foreground mt-1 text-sm">نظرة شاملة على أداء وإدارة الموارد البشرية</p>
        </div>
        <Button onClick={() => navigate("/employees/create")} className="gap-2">
          <UserPlus className="h-4 w-4" />
          إضافة موظف
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="إجمالي الموظفين"
          value={totalEmployees}
          icon={Users}
          iconColor="text-blue-600 bg-blue-50"
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
          iconColor="text-amber-600 bg-amber-50"
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
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            إدارة الموظفين
          </h2>
          <div className="space-y-2">
            <QuickLink label="الموظفين" icon={Users} iconColor="text-blue-600 bg-blue-50" path="/employees" description="قائمة جميع الموظفين وبياناتهم" />
            <QuickLink label="تفعيل الموظفين" icon={UserPlus} iconColor="text-indigo-600 bg-indigo-50" path="/hr/employee-activation" description="تفعيل حسابات الموظفين الجدد" />
            <QuickLink label="مراجعة التعيين" icon={ClipboardCheck} iconColor="text-violet-600 bg-violet-50" path="/hr/onboarding-review" description="متابعة إجراءات التعيين" />
            <QuickLink label="الهيكل التنظيمي" icon={Network} iconColor="text-sky-600 bg-sky-50" path="/hr/organization" description="عرض وإدارة الهيكل التنظيمي" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            الحضور والإجازات
          </h2>
          <div className="space-y-2">
            <QuickLink label="الحضور والانصراف" icon={Clock} iconColor="text-purple-600 bg-purple-50" path="/hr/attendance" description="سجل الحضور اليومي" />
            <QuickLink label="تقارير الحضور" icon={CheckCircle2} iconColor="text-purple-500 bg-purple-50" path="/hr/attendance/reports" description="تقارير وإحصاءات الحضور" />
            <QuickLink label="الإجازات وإدارتها" icon={Calendar} iconColor="text-emerald-600 bg-emerald-50" path="/hr/leaves" description="طلبات الإجازة وإدارتها" />
            <QuickLink label="الورديات" icon={CalendarClock} iconColor="text-teal-600 bg-teal-50" path="/hr/shifts" description="جداول وإدارة الورديات" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            الرواتب والأداء
          </h2>
          <div className="space-y-2">
            <QuickLink label="الرواتب" icon={DollarSign} iconColor="text-emerald-600 bg-emerald-50" path="/hr/payroll" description="مسيرات الرواتب والمكافآت" />
            <QuickLink label="تقييم الأداء" icon={Target} iconColor="text-orange-600 bg-orange-50" path="/hr/performance" description="تقييمات الأداء الدورية" />
            <QuickLink label="التدريب" icon={GraduationCap} iconColor="text-cyan-600 bg-cyan-50" path="/hr/training" description="البرامج التدريبية للموظفين" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-rose-500" />
            التوظيف والمخالفات
          </h2>
          <div className="space-y-2">
            <QuickLink label="التوظيف" icon={Briefcase} iconColor="text-rose-600 bg-rose-50" path="/hr/recruitment" description="الوظائف الشاغرة والمتقدمين" />
            <QuickLink label="المتقدمين" icon={Users} iconColor="text-pink-600 bg-pink-50" path="/hr/recruitment/applications" description="طلبات التقديم المستلمة" />
            <QuickLink label="المخالفات والجزاءات" icon={Scale} iconColor="text-red-600 bg-red-50" path="/hr/violations" description="سجل المخالفات والجزاءات" />
          </div>
        </div>

        <div className="md:col-span-2 lg:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            إجراءات سريعة
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate("/hr/leaves/create")}
              className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-emerald-600 bg-emerald-50">
                <Calendar className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-800">طلب إجازة</span>
            </button>
            <button
              onClick={() => navigate("/hr/leaves?tab=pending")}
              className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-blue-600 bg-blue-50">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-800">اعتماد الإجازات</span>
            </button>
            <button
              onClick={() => navigate("/hr/attendance/qr-scanner")}
              className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-purple-600 bg-purple-50">
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-800">تسجيل الحضور</span>
            </button>
            <button
              onClick={() => navigate("/employees/create")}
              className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-right"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-indigo-600 bg-indigo-50">
                <UserPlus className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-800">إضافة موظف</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
