import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { useSettings } from "@/contexts/settings-context";
import type { ModuleType } from "@/contexts/app-context";
import {
  Users, FileText, Car, Shield, AlertTriangle, CheckCircle2, TrendingUp,
  DollarSign, Scale, FolderKanban, ChevronLeft, Calendar, BarChart3,
  Building2, Target, Package, Headphones, Megaphone, ShoppingCart,
  TrendingDown, CreditCard, Activity, Building, Briefcase, Clock,
  ClipboardList, ArrowDownLeft, ArrowUpRight, Plus, MessageCircle,
  ListTodo, AlertCircle, CheckCircle, Timer, Zap, Bell, Lightbulb,
  User,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

type ColorKey = "blue" | "green" | "red" | "yellow" | "purple" | "indigo" | "teal" | "orange" | "pink" | "gray";
const COLOR_MAP: Record<ColorKey, { bg: string; icon: string; border: string; ring: string; text: string; gradient: string }> = {
  blue:   { bg: "bg-blue-50",   icon: "text-blue-600",   border: "border-blue-100", ring: "ring-blue-500/20",   text: "text-blue-700",   gradient: "from-blue-500 to-blue-600" },
  green:  { bg: "bg-emerald-50",  icon: "text-emerald-600",  border: "border-emerald-100", ring: "ring-green-500/20",  text: "text-emerald-700",  gradient: "from-emerald-500 to-emerald-600" },
  red:    { bg: "bg-red-50",    icon: "text-red-600",    border: "border-red-100", ring: "ring-red-500/20",    text: "text-red-700",    gradient: "from-red-500 to-red-600" },
  yellow: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-amber-100", ring: "ring-yellow-500/20", text: "text-amber-700", gradient: "from-amber-500 to-amber-600" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-purple-100", ring: "ring-purple-500/20", text: "text-purple-700", gradient: "from-purple-500 to-purple-600" },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", border: "border-indigo-100", ring: "ring-indigo-500/20", text: "text-indigo-700", gradient: "from-indigo-500 to-indigo-600" },
  teal:   { bg: "bg-teal-50",   icon: "text-teal-600",   border: "border-teal-100", ring: "ring-teal-500/20",   text: "text-teal-700",   gradient: "from-teal-500 to-teal-600" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-orange-100", ring: "ring-orange-500/20", text: "text-orange-700", gradient: "from-orange-500 to-orange-600" },
  pink:   { bg: "bg-pink-50",   icon: "text-pink-600",   border: "border-pink-100", ring: "ring-pink-500/20",   text: "text-pink-700",   gradient: "from-pink-500 to-pink-600" },
  gray:   { bg: "bg-gray-50",   icon: "text-gray-600",   border: "border-gray-100", ring: "ring-gray-500/20",   text: "text-gray-700",   gradient: "from-gray-500 to-gray-600" },
};

const SOURCE_STYLES: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  audit: { icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  journal: { icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  request: { icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-50" },
  communication: { icon: MessageCircle, color: "text-purple-600", bg: "bg-purple-50" },
  hr: { icon: Calendar, color: "text-teal-600", bg: "bg-teal-50" },
  finance: { icon: CreditCard, color: "text-indigo-600", bg: "bg-indigo-50" },
};

const EVENT_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  invoice: { icon: CreditCard, color: "text-blue-500" },
  leave: { icon: Calendar, color: "text-yellow-500" },
  ticket: { icon: Headphones, color: "text-red-500" },
  task: { icon: CheckCircle2, color: "text-green-500" },
  attendance: { icon: Clock, color: "text-purple-500" },
};

function AnimatedNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const end = value;
    if (start === end) return;
    let startTime: number | null = null;
    const animate = (t: number) => {
      if (!startTime) startTime = t;
      const p = Math.min((t - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    prev.current = end;
  }, [value, duration]);
  return <span>{display.toLocaleString("ar-SA")}</span>;
}

function StatCard({ title, value, sub, icon: Icon, color = "blue", link, trend }: {
  title: string; value: number | string; sub?: string; icon: LucideIcon; color?: ColorKey; link?: string; trend?: number;
}) {
  const c = COLOR_MAP[color];
  const content = (
    <div className="bg-white rounded-xl p-4 hover:shadow-md transition-all duration-300 group cursor-pointer relative overflow-hidden border border-gray-100/80">
      <div className={cn("absolute top-0 start-0 w-1 h-full rounded-s-xl bg-gradient-to-b opacity-80", c.gradient)} />
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", c.bg)}>
          <Icon className={cn("w-5 h-5", c.icon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 mb-0.5">{title}</p>
          <p className="text-xl font-bold text-gray-900 tracking-tight">
            {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </p>
        </div>
        {link && <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-1.5 me-[52px]">{sub}</p>}
      {trend !== undefined && trend !== 0 && (
        <div className={cn("flex items-center gap-1 mt-1 me-[52px] text-xs font-medium", trend > 0 ? "text-emerald-600" : "text-red-500")}>
          {trend > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {Math.abs(trend)}% هذا الشهر
        </div>
      )}
    </div>
  );
  return link ? <Link href={link}>{content}</Link> : content;
}

interface TooltipPayloadEntry { color: string; name: string; value: number | string }
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-100 text-xs" dir="rtl">
      <p className="font-semibold mb-1.5 text-gray-700">{label}</p>
      {payload.map((p: TooltipPayloadEntry, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5 py-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          {p.name}: {Number(p.value).toLocaleString("ar-SA")}
        </p>
      ))}
    </div>
  );
}

function CommandCard({ title, value, sub, icon: Icon, color, link, pulse }: {
  title: string; value: number; sub?: string; icon: LucideIcon; color: ColorKey; link?: string; pulse?: boolean;
}) {
  const c = COLOR_MAP[color];
  const content = (
    <div className={cn(
      "bg-white rounded-2xl border-2 p-6 hover:shadow-xl transition-all duration-300 group cursor-pointer relative overflow-hidden",
      c.border,
      pulse && value > 0 ? "animate-pulse-subtle" : ""
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center ring-4", c.bg, c.ring)}>
          <Icon className={cn("w-7 h-7", c.icon)} />
        </div>
        {link && <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-all group-hover:-translate-x-1" />}
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className="text-4xl font-black text-gray-900 tracking-tight">
        <AnimatedNumber value={value} />
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
  return link ? <Link href={link}>{content}</Link> : content;
}

function ProgressRing({ percent, size = 64, stroke = 6 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? "#10b981" : percent >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>{percent}%</span>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
  urgent: "bg-red-200 text-red-800",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function Dashboard() {
  const { user } = useAuth();
  const { canAccessModule, selectedRole, roleLevel, selectedRoleLabel, scopeQueryString, isMultiCompany, isMultiBranch } = useAppContext();
  const { currencyLabel } = useSettings();
  const [, setLocation] = useLocation();

  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data: cmdCenter } = useApiQuery<any>(["dashboard-cmd", scopeQueryString], `/dashboard${scopeSuffix}`);
  const { data: summary } = useApiQuery<any>(["dashboard-summary", scopeQueryString], `/dashboard/summary${scopeSuffix}`);
  const { data: revenueChart } = useApiQuery<any>(["dashboard-revenue", scopeQueryString], `/dashboard/charts/revenue${scopeSuffix}`);
  const { data: attendanceChart } = useApiQuery<any>(["dashboard-attendance", scopeQueryString], `/dashboard/charts/attendance${scopeSuffix}`);
  const { data: departmentChart } = useApiQuery<any>(["dashboard-departments", scopeQueryString], `/dashboard/charts/departments${scopeSuffix}`);
  const { data: recentEventsData } = useApiQuery<any>(["dashboard-events", scopeQueryString], `/dashboard/charts/recent-events${scopeSuffix}`);
  const { data: roleData } = useApiQuery<any>(["dashboard-role", scopeQueryString], `/dashboard/role-data${scopeSuffix}`);
  const { data: suggestionsResp } = useApiQuery<any>(["intelligence-suggestions"], "/intelligence/suggestions", roleLevel >= 40);

  const cards = cmdCenter?.cards || {};
  const todayTasks = cmdCenter?.todayTasks || [];
  const pendingApprovals = cmdCenter?.pendingApprovals || [];
  const pendingFinanceApprovals = cmdCenter?.pendingFinanceApprovals || [];
  const pendingPurchaseRequests = cmdCenter?.pendingPurchaseRequests || [];
  const notifications = cmdCenter?.notifications || [];

  const revenueData = revenueChart?.data || [];
  const attendanceData = attendanceChart?.data || [];
  const departmentData = departmentChart?.data || [];
  const recentEvents: { type: string; text: string; time: string }[] = recentEventsData?.data || [];

  const stats = summary || {};

  const getRoleGreeting = () => {
    if (roleLevel >= 100) return "مركز القيادة";
    if (roleLevel >= 90) return "مركز الإدارة العامة";
    if (roleLevel >= 40) return `لوحة ${selectedRoleLabel}`;
    return "مهامي وأعمالي";
  };

  const getSubGreeting = () => {
    if (roleLevel >= 70) return "إليك نظرة شاملة على أداء المنشأة اليوم";
    if (roleLevel >= 40) return "إليك ملخص فريقك ومهامك اليوم";
    return "إليك ملخص مهامك وطلباتك اليوم";
  };

  const quickCreateActions: { icon: LucideIcon; label: string; link: string; color: ColorKey; module?: ModuleType }[] = [
    { icon: Plus, label: "إضافة موظف", link: "/employees/create", color: "blue", module: "hr" },
    { icon: CreditCard, label: "فاتورة جديدة", link: "/finance/invoices/create", color: "green", module: "finance" },
    { icon: ClipboardList, label: "طلب جديد", link: "/requests", color: "orange", module: "requests" },
    { icon: Headphones, label: "تذكرة دعم", link: "/support/create", color: "red" },
    { icon: Building2, label: "عميل جديد", link: "/clients/create", color: "indigo" },
    { icon: FolderKanban, label: "مشروع جديد", link: "/projects/create", color: "purple" },
  ];

  const visibleCreateActions = quickCreateActions.filter(a => !a.module || canAccessModule(a.module));

  const allApprovals = [
    ...pendingApprovals.map((a: any) => ({
      id: a.id,
      type: "leave" as const,
      title: `طلب إجازة - ${a.employeeName}`,
      subtitle: `${a.leaveType} (${a.days} يوم)`,
      date: a.createdAt,
      link: "/hr/leaves",
    })),
    ...pendingFinanceApprovals.map((a: any) => ({
      id: a.id,
      type: "finance" as const,
      title: `مطالبة مصروفات`,
      subtitle: a.description || a.ref,
      date: a.createdAt,
      link: "/finance/expenses",
    })),
    ...pendingPurchaseRequests.map((a: any) => ({
      id: a.id,
      type: "purchase" as const,
      title: `طلب شراء`,
      subtitle: a.title,
      date: a.createdAt,
      link: "/finance/purchase-orders",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getRoleGreeting()}
          </h1>
          <p className="text-gray-500 mt-1">
            مرحبا، {user?.name || "مستخدم"} - {getSubGreeting()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CommandCard
          title="مهامي اليوم"
          value={cards.todayTasks || 0}
          sub="المهام المجدولة لليوم"
          icon={ListTodo}
          color="blue"
          link="/tasks"
        />
        <CommandCard
          title="ينتظر ردي"
          value={cards.awaitingMe || 0}
          sub="مهام مسندة إلي"
          icon={Timer}
          color="orange"
          link="/tasks"
          pulse
        />
        <CommandCard
          title="متأخر عليّ"
          value={cards.overdue || 0}
          sub="مهام تجاوزت موعدها"
          icon={AlertCircle}
          color="red"
          link="/tasks"
          pulse
        />
        <div className="bg-white rounded-2xl border-2 border-green-100 p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">إنجاز اليوم</p>
              <p className="text-2xl font-black text-gray-900">
                <AnimatedNumber value={cards.completedToday || 0} />
                <span className="text-sm font-normal text-gray-400 me-1">مهمة</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">نسبة الإنجاز</p>
            </div>
            <ProgressRing percent={cards.completedPct || 0} size={72} stroke={7} />
          </div>
        </div>
      </div>

      {roleLevel < 40 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/my-space">
            <div className="bg-white rounded-xl border border-blue-100 p-4 hover:shadow-md transition-all cursor-pointer text-center">
              <User className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-800">مساحتي</p>
            </div>
          </Link>
          <Link href="/hr/leaves/create">
            <div className="bg-white rounded-xl border border-teal-100 p-4 hover:shadow-md transition-all cursor-pointer text-center">
              <Calendar className="w-6 h-6 text-teal-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-800">طلب إجازة</p>
            </div>
          </Link>
          <Link href="/requests">
            <div className="bg-white rounded-xl border border-orange-100 p-4 hover:shadow-md transition-all cursor-pointer text-center">
              <ClipboardList className="w-6 h-6 text-orange-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-800">تقديم طلب</p>
            </div>
          </Link>
          <Link href="/hr/attendance">
            <div className="bg-white rounded-xl border border-purple-100 p-4 hover:shadow-md transition-all cursor-pointer text-center">
              <Clock className="w-6 h-6 text-purple-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-800">تسجيل حضور</p>
            </div>
          </Link>
        </div>
      )}

      {allApprovals.length > 0 && (roleLevel >= 40) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-orange-500" />
              طلبات تنتظر الموافقة
              <Badge variant="destructive" className="text-xs">{allApprovals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allApprovals.slice(0, 8).map((approval) => {
                const typeIcons: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
                  leave: { icon: Calendar, color: "text-teal-600", bg: "bg-teal-50" },
                  finance: { icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
                  purchase: { icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50" },
                };
                const style = typeIcons[approval.type] || typeIcons.leave;
                const ApprovalIcon = style.icon;
                return (
                  <Link key={`${approval.type}-${approval.id}`} href={approval.link}>
                    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", style.bg)}>
                        <ApprovalIcon className={cn("w-4 h-4", style.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{approval.title}</p>
                        <p className="text-xs text-gray-500 truncate">{approval.subtitle}</p>
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {approval.date ? formatTimeAgo(approval.date) : ""}
                      </div>
                      <ChevronLeft className="w-4 h-4 text-gray-300 shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              مهام اليوم
              {todayTasks.length > 0 && <Badge className="text-xs">{todayTasks.length}</Badge>}
            </CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="font-medium text-green-600">لا توجد مهام مجدولة لليوم</p>
                <p className="text-xs mt-1">يمكنك إنشاء مهمة جديدة</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/tasks")}>
                  <Plus className="w-4 h-4 me-1" /> إنشاء مهمة
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.slice(0, 8).map((task: any) => (
                  <Link key={task.id} href={`/tasks/${task.id}`}>
                    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        task.status === "completed" ? "bg-green-500" :
                        task.status === "in_progress" ? "bg-blue-500" : "bg-yellow-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          task.status === "completed" ? "text-gray-400 line-through" : "text-gray-800"
                        )}>
                          {task.title}
                        </p>
                        {task.assigneeName && (
                          <p className="text-xs text-gray-400">{task.assigneeName}</p>
                        )}
                      </div>
                      {task.priority && (
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", priorityColors[task.priority] || "")}>
                          {task.priority === "high" ? "عاجل" : task.priority === "medium" ? "متوسط" : "عادي"}
                        </Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-purple-500" />
              الإشعارات
              {notifications.length > 0 && <Badge variant="destructive" className="text-xs">{notifications.length}</Badge>}
            </CardTitle>
            <Link href="/notifications">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>لا توجد إشعارات جديدة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 6).map((n: any) => (
                  <div key={n.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      n.priority === "high" ? "bg-red-50" : "bg-blue-50"
                    )}>
                      <Bell className={cn("w-4 h-4", n.priority === "high" ? "text-red-500" : "text-blue-500")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTimeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {roleData?.hr && roleLevel >= 40 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-500" />
              لوحة الموارد البشرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/tasks">
                <div className="p-3 rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer">
                  <p className="text-2xl font-bold text-teal-700">{roleData.hr.pendingOnboarding}</p>
                  <p className="text-xs text-teal-600">تأهيل معلق</p>
                </div>
              </Link>
              <div className="p-3 rounded-lg bg-orange-50">
                <p className="text-2xl font-bold text-orange-700">{roleData.hr.expiringDocuments}</p>
                <p className="text-xs text-orange-600">مستندات تنتهي خلال 30 يوم</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50">
                <p className="text-2xl font-bold text-purple-700">{roleData.hr.probationEnding?.length || 0}</p>
                <p className="text-xs text-purple-600">فترة تجربة تنتهي قريباً</p>
                {roleData.hr.probationEnding?.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {roleData.hr.probationEnding.slice(0, 3).map((p: any, i: number) => (
                      <p key={i} className="text-[10px] text-purple-500">{p.name} — {p.probationEndDate}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {roleData?.finance && roleLevel >= 40 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              لوحة المالية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/finance/invoices">
                <div className="p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
                  <p className="text-2xl font-bold text-red-700">{roleData.finance.overdueCount}</p>
                  <p className="text-xs text-red-600">فواتير متأخرة</p>
                  {roleData.finance.overdueAmount > 0 && (
                    <p className="text-[10px] text-red-500 mt-0.5">{Number(roleData.finance.overdueAmount).toLocaleString("ar-SA")} {currencyLabel}</p>
                  )}
                </div>
              </Link>
              <div className="p-3 rounded-lg bg-yellow-50">
                <p className="text-2xl font-bold text-yellow-700">{roleData.finance.advancedCollectionCount}</p>
                <p className="text-xs text-yellow-600">تحصيل متقدم (مرحلة 4+)</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50">
                <p className="text-2xl font-bold text-blue-700">{roleData.finance.avgBudgetUsage}%</p>
                <p className="text-xs text-blue-600">متوسط استخدام الميزانية</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {roleData?.manager && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-500" />
              لوحة الفريق
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/tasks">
                <div className="p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer">
                  <p className="text-2xl font-bold text-blue-700">{roleData.manager.teamTasksTotal}</p>
                  <p className="text-xs text-blue-600">إجمالي المهام</p>
                </div>
              </Link>
              <div className="p-3 rounded-lg bg-green-50">
                <p className="text-2xl font-bold text-green-700">{roleData.manager.teamTasksCompleted}</p>
                <p className="text-xs text-green-600">مهام مكتملة</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50">
                <p className="text-2xl font-bold text-red-700">{roleData.manager.teamTasksOverdue}</p>
                <p className="text-xs text-red-600">مهام متأخرة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {suggestionsResp?.data?.length > 0 && roleLevel >= 40 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              اقتراحات ذكية
              <Badge variant="secondary" className="text-xs">{suggestionsResp.data.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suggestionsResp.data.slice(0, 6).map((s: any) => {
                const severityStyles: Record<string, { bg: string; border: string; icon: string }> = {
                  critical: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-600" },
                  warning: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600" },
                  info: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600" },
                };
                const style = severityStyles[s.severity] || severityStyles.info;
                return (
                  <div key={s.id} className={cn("p-3 rounded-xl border flex items-start gap-3", style.bg, style.border)}>
                    <Lightbulb className={cn("w-5 h-5 shrink-0 mt-0.5", style.icon)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{s.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                    </div>
                    {s.actionLink && (
                      <Link href={s.actionLink}>
                        <Button variant="outline" size="sm" className="text-xs shrink-0">
                          {s.action} <ChevronLeft className="w-3 h-3 ms-1" />
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {roleLevel >= 70 && (
        <Card className="border-0 shadow-sm bg-gradient-to-l from-indigo-50/50 to-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              مؤشرات الأداء التنفيذية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                title="الموظفين النشطين"
                value={stats.totalEmployees || 0}
                icon={Users}
                color="blue"
                link="/employees"
              />
              <StatCard
                title="الإيرادات"
                value={stats.totalRevenue ? `${((stats.totalRevenue || 0) / 1000).toFixed(0)}K` : "0"}
                sub={currencyLabel}
                icon={DollarSign}
                color="green"
                link="/finance"
              />
              <StatCard
                title="تذاكر مفتوحة"
                value={stats.tickets?.open || 0}
                icon={Headphones}
                color="red"
                link="/support"
              />
              <StatCard
                title="إجازات معلقة"
                value={stats.pendingLeaveRequests || 0}
                icon={Calendar}
                color="yellow"
                link="/hr/leaves"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {(roleLevel >= 40) && (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              إنشاء سريع
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {visibleCreateActions.map((a) => (
                <Link key={a.label} href={a.link}>
                  <div className={cn("group flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md bg-white", COLOR_MAP[a.color].border)}>
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", COLOR_MAP[a.color].bg)}>
                      <a.icon className={cn("w-4 h-4", COLOR_MAP[a.color].icon)} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 text-center leading-tight">{a.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {roleLevel < 70 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {canAccessModule("hr") && (
                <StatCard title="الموظفين النشطين" value={stats.totalEmployees || 0} icon={Users} color="blue" link="/employees" />
              )}
              {canAccessModule("finance") && (
                <StatCard title="الإيرادات" value={stats.totalRevenue ? `${((stats.totalRevenue || 0) / 1000).toFixed(0)}K` : "0"} sub={currencyLabel} icon={DollarSign} color="green" link="/finance" />
              )}
              <StatCard title="تذاكر مفتوحة" value={stats.tickets?.open || 0} icon={Headphones} color="red" link="/support" />
              <StatCard title="إجازات معلقة" value={stats.pendingLeaveRequests || 0} icon={Calendar} color="yellow" link="/hr/leaves" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  الإيرادات والمصروفات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {revenueData.length === 0 ? (
                  <div className="h-[260px] flex flex-col items-center justify-center text-gray-400 text-sm gap-3">
                    <DollarSign className="w-10 h-10 text-gray-300" />
                    <p>لا توجد بيانات مالية بعد</p>
                    <Button variant="outline" size="sm" onClick={() => setLocation("/finance/invoices/create")}>
                      <Plus className="w-4 h-4 me-1" /> إنشاء أول فاتورة
                    </Button>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="revenue" name="الإيرادات" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  الحضور الأسبوعي
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceData.length === 0 ? (
                  <div className="h-[260px] flex flex-col items-center justify-center text-gray-400 text-sm gap-3">
                    <Clock className="w-10 h-10 text-gray-300" />
                    <p>لا توجد بيانات حضور بعد</p>
                    <Button variant="outline" size="sm" onClick={() => setLocation("/hr/attendance")}>
                      تسجيل الحضور
                    </Button>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={attendanceData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="present" name="حاضر" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="absent" name="غائب" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="late" name="متأخر" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-500" />
                  توزيع الموظفين
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                {departmentData.length === 0 ? (
                  <div className="h-[220px] flex flex-col items-center justify-center text-gray-400 text-sm gap-3">
                    <Users className="w-10 h-10 text-gray-300" />
                    <p>لا توجد بيانات أقسام بعد</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={departmentData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {departmentData.map((entry: { color: string }, i: number) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
              {departmentData.length > 0 && (
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-3 justify-center">
                    {departmentData.map((d: { name: string; value: number; color: string }) => (
                      <div key={d.name} className="flex items-center gap-1 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name} ({d.value})
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            <Card className="border-0 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-500" />
                  آخر الأحداث
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentEvents.length === 0 ? (
                  <div className="text-center text-gray-400 py-6 text-sm">
                    <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p>لا توجد أحداث حديثة</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentEvents.slice(0, 8).map((event, i) => {
                      const style = EVENT_ICONS[event.type] || EVENT_ICONS.task;
                      const EventIcon = style.icon;
                      return (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                            <EventIcon className={cn("w-4 h-4", style.color)} />
                          </div>
                          <p className="text-sm text-gray-700 flex-1 truncate">{event.text}</p>
                          <span className="text-xs text-gray-400 shrink-0">{event.time}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
