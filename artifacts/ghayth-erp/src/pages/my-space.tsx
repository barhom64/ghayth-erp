import { Link } from "wouter";
import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { useAuth } from "@/lib/auth";
import {
  Clock, Calendar, FileText, DollarSign, ListTodo, Bell,
  KeyRound, AlertTriangle, ChevronLeft, CheckCircle2, XCircle,
  ArrowUpRight, Timer, Shield, Briefcase, ClipboardList,
  LogIn, LogOut as LogOutIcon, Lightbulb, Activity, Target, Star,
  AlertCircle, Building, Car, Scale, Hourglass, Users, Receipt, RefreshCw,
  Eye, EyeOff, Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "معلّق", color: "bg-yellow-100 text-yellow-700" },
  under_review: { label: "قيد المراجعة", color: "bg-blue-100 text-blue-700" },
  approved: { label: "معتمد", color: "bg-green-100 text-green-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
  active: { label: "نشط", color: "bg-green-100 text-green-700" },
  in_progress: { label: "جاري", color: "bg-blue-100 text-blue-700" },
  completed: { label: "مكتمل", color: "bg-green-100 text-green-700" },
};

const requestTypeLabels: Record<string, string> = {
  leave: "إجازة",
  salary_advance: "سلفة راتب",
  letter: "خطاب رسمي",
  custody: "عُهدة",
};

const severityColors: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

const priorityLabels: Record<string, string> = {
  high: "عاجل",
  medium: "متوسط",
  low: "عادي",
  urgent: "طارئ",
};

function ChangePasswordSection() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!current || !newPw) { toast({ variant: "destructive", title: "يرجى ملء جميع الحقول" }); return; }
    if (newPw.length < 6) { toast({ variant: "destructive", title: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" }); return; }
    if (newPw !== confirmPw) { toast({ variant: "destructive", title: "كلمة المرور الجديدة وتأكيدها غير متطابقتين" }); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setCurrent(""); setNewPw(""); setConfirmPw("");
      setSuccess(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في تغيير كلمة المرور" });
    }
    setLoading(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-purple-500" />
          تغيير كلمة المرور
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {success ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 text-green-700">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">تم تغيير كلمة المرور بنجاح</p>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSuccess(false)}>تغيير مجدداً</Button>
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">كلمة المرور الحالية</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  dir="ltr"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
                <button className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => setShowCurrent(!showCurrent)}>
                  {showCurrent ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  dir="ltr"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <button className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => setShowNew(!showNew)}>
                  {showNew ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">تأكيد كلمة المرور الجديدة</Label>
              <Input
                type="password"
                dir="ltr"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={loading || !current || !newPw || !confirmPw}>
              {loading ? "جاري التغيير..." : "تغيير كلمة المرور"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function MySpace() {
  const { user } = useAuth();
  const { scopeQueryString, selectedRoleLabel, roleLevel } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["my-space", scopeQueryString],
    `/my-space${scopeSuffix}`
  );

  const { data: suggestionsResp } = useApiQuery<any>(
    ["intelligence-suggestions-myspace"],
    "/intelligence/suggestions",
    roleLevel >= 40
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">حدث خطأ في تحميل البيانات</h2>
        <p className="text-sm text-gray-500 mb-4">{error?.message || "خطأ غير متوقع"}</p>
        <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
      </div>
    );
  }

  const attendance = data?.attendance;
  const leaveBalances = data?.leaveBalances || [];
  const openRequests = data?.openRequests || [];
  const pendingApprovals = data?.pendingApprovals || [];
  const documents = data?.documents || [];
  const lastPayslip = data?.lastPayslip;
  const todayTasks = data?.todayTasks || [];
  const notifications = data?.notifications || [];
  const custodies = data?.custodies || [];
  const violations = data?.violations || [];
  const currentShift = data?.currentShift;
  const monthlyStats = data?.monthlyStats;
  const recentActions = data?.recentActions || [];
  const performanceReviews = data?.performanceReviews || [];
  const overdueItems = data?.overdueItems || [];
  const expiringSoon = data?.expiringSoon || [];
  const roleEntities = data?.roleEntities;
  const role = data?.role;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مساحتي</h1>
          <p className="text-gray-500 mt-1">
            مرحباً {user?.name || "موظف"} — {selectedRoleLabel}
          </p>
        </div>
        {role !== "employee" && (
          <Link href="/action-center">
            <Button variant="outline" className="gap-2">
              <Briefcase className="w-4 h-4" />
              مركز القرارات
              <ArrowUpRight className="w-3 h-3" />
            </Button>
          </Link>
        )}
      </div>

      {(overdueItems.length > 0 || expiringSoon.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {overdueItems.length > 0 && (
            <Card className="border-0 shadow-sm border-t-4 border-t-red-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  عناصر متأخرة
                  <Badge variant="destructive" className="text-xs">{overdueItems.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overdueItems.slice(0, 5).map((item: any, i: number) => (
                    <Link key={`overdue-${i}`} href={item.type === "task" ? `/tasks` : "/hr/leaves"}>
                      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50/50 hover:bg-red-50 transition-colors cursor-pointer">
                        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                          <p className="text-xs text-red-500">
                            {item.type === "task" ? "مهمة" : "طلب"} — مستحق: {item.deadline ? formatDateAr(item.deadline) : ""}
                          </p>
                        </div>
                        {item.priority && (
                          <Badge className={cn("text-[10px] shrink-0",
                            item.priority === "high" || item.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                          )}>
                            {item.priority === "high" ? "عاجل" : item.priority === "urgent" ? "طارئ" : "متوسط"}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {expiringSoon.length > 0 && (
            <Card className="border-0 shadow-sm border-t-4 border-t-amber-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Hourglass className="w-5 h-5 text-amber-500" />
                  قريب الانتهاء
                  <Badge className="text-xs bg-amber-100 text-amber-700">{expiringSoon.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {expiringSoon.slice(0, 5).map((item: any, i: number) => {
                    const daysLeft = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
                    const categoryLabels: Record<string, string> = { document: "مستند", contract: "عقد", insurance: "تأمين" };
                    return (
                      <div key={`expiring-${i}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50/50">
                        <div className={cn("w-2 h-2 rounded-full shrink-0", daysLeft <= 7 ? "bg-red-500" : "bg-amber-500")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.name || item.title}</p>
                          <p className="text-xs text-gray-500">{categoryLabels[item.category] || item.category}</p>
                        </div>
                        <Badge className={cn("text-[10px] shrink-0",
                          daysLeft <= 7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {daysLeft <= 0 ? "منتهي" : `${daysLeft} يوم`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {roleEntities && role !== "employee" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {roleEntities.units && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building className="w-4 h-4 text-emerald-500" />
                  وحداتي العقارية
                </CardTitle>
                <Link href="/properties">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-emerald-50">
                    <p className="text-lg font-bold text-emerald-700">{roleEntities.units.rented || 0}</p>
                    <p className="text-[10px] text-emerald-600">مؤجرة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50">
                    <p className="text-lg font-bold text-blue-700">{roleEntities.units.available || 0}</p>
                    <p className="text-[10px] text-blue-600">متاحة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {roleEntities.vehicles && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-500" />
                  أسطولي
                </CardTitle>
                <Link href="/fleet">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-green-50">
                    <p className="text-lg font-bold text-green-700">{roleEntities.vehicles.available || 0}</p>
                    <p className="text-[10px] text-green-600">متاحة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-50">
                    <p className="text-lg font-bold text-orange-700">{roleEntities.vehicles.maintenance || 0}</p>
                    <p className="text-[10px] text-orange-600">صيانة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {roleEntities.cases && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scale className="w-4 h-4 text-indigo-500" />
                  القضايا
                </CardTitle>
                <Link href="/legal/cases">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-red-50">
                    <p className="text-lg font-bold text-red-700">{roleEntities.cases.open || 0}</p>
                    <p className="text-[10px] text-red-600">مفتوحة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-50">
                    <p className="text-lg font-bold text-green-700">{roleEntities.cases.closed || 0}</p>
                    <p className="text-[10px] text-green-600">مغلقة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {roleEntities.hr && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-500" />
                  الموظفون
                </CardTitle>
                <Link href="/employees">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-teal-50">
                    <p className="text-lg font-bold text-teal-700">{roleEntities.hr.active || 0}</p>
                    <p className="text-[10px] text-teal-600">نشط</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50">
                    <p className="text-lg font-bold text-gray-700">{roleEntities.hr.inactive || 0}</p>
                    <p className="text-[10px] text-gray-600">غير نشط</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {roleEntities.finance && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-500" />
                  الفواتير
                </CardTitle>
                <Link href="/finance/invoices">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-green-50">
                    <p className="text-lg font-bold text-green-700">{roleEntities.finance.paid || 0}</p>
                    <p className="text-[10px] text-green-600">مدفوعة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-yellow-50">
                    <p className="text-lg font-bold text-yellow-700">{roleEntities.finance.pending || 0}</p>
                    <p className="text-[10px] text-yellow-600">معلقة</p>
                  </div>
                  <div className="p-2 rounded-lg bg-red-50">
                    <p className="text-lg font-bold text-red-700">{roleEntities.finance.overdue || 0}</p>
                    <p className="text-[10px] text-red-600">متأخرة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              حضوري اليوم
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendance ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LogIn className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-600">الحضور</span>
                  </div>
                  <span className="text-sm font-medium">{formatTime(attendance.checkIn)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LogOutIcon className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-600">الانصراف</span>
                  </div>
                  <span className="text-sm font-medium">{formatTime(attendance.checkOut)}</span>
                </div>
                {attendance.lateMinutes > 0 && (
                  <div className="flex items-center gap-2 text-orange-600 text-sm">
                    <Timer className="w-4 h-4" />
                    تأخر {attendance.lateMinutes} دقيقة
                  </div>
                )}
                <Badge className={cn("text-xs",
                  attendance.status === "present" ? "bg-green-100 text-green-700" :
                  attendance.status === "present_out_of_range" ? "bg-orange-100 text-orange-700" :
                  attendance.status === "present_off_day" ? "bg-purple-100 text-purple-700" :
                  "bg-yellow-100 text-yellow-700"
                )}>
                  {attendance.status === "present" ? "حاضر" :
                   attendance.status === "present_out_of_range" ? "خارج النطاق" :
                   attendance.status === "present_off_day" ? "حاضر (يوم عطلة)" :
                   attendance.status}
                </Badge>
              </div>
            ) : (
              <div className="text-center py-4">
                <XCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">لم يتم تسجيل الحضور بعد</p>
                <Link href="/hr/attendance">
                  <Button size="sm" variant="outline" className="mt-2 gap-1">
                    <LogIn className="w-3 h-3" />
                    تسجيل حضور
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-500" />
              جدول العمل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentShift ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800">{currentShift.name || "الوردية الحالية"}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>من {currentShift.startTime}</span>
                  <span>إلى {currentShift.endTime}</span>
                </div>
                {currentShift.days && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {String(currentShift.days).split(",").map((d: string) => {
                      const dayNames: Record<string, string> = { "0": "أحد", "1": "إثن", "2": "ثلا", "3": "أرب", "4": "خمي", "5": "جمع", "6": "سبت" };
                      return (
                        <Badge key={d} variant="outline" className="text-[10px]">
                          {dayNames[d.trim()] || d}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">لا توجد وردية مسندة</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              تعريف الراتب
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastPayslip ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">الفترة</span>
                  <span className="font-medium">{lastPayslip.period}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">الراتب الأساسي</span>
                  <span className="font-medium">{Number(lastPayslip.basicSalary).toLocaleString("ar-SA")} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">البدلات</span>
                  <span className="font-medium text-green-600">+{Number(lastPayslip.totalAllowances).toLocaleString("ar-SA")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">الخصومات</span>
                  <span className="font-medium text-red-600">-{Number(lastPayslip.totalDeductions).toLocaleString("ar-SA")}</span>
                </div>
                <div className="border-t pt-2 flex justify-between text-sm font-bold">
                  <span>صافي الراتب</span>
                  <span className="text-primary">{Number(lastPayslip.netSalary).toLocaleString("ar-SA")} ر.س</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">لا يوجد مسير رواتب سابق</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(overdueItems.length > 0 || expiringSoon.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {overdueItems.length > 0 && (
            <Card className="border-0 shadow-sm border-s-4 border-s-red-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  عناصر متأخرة
                  <Badge variant="destructive" className="text-xs">{overdueItems.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overdueItems.slice(0, 5).map((item: any, idx: number) => (
                    <Link key={`overdue-${idx}`} href={item.itemType === "task" ? `/tasks/${item.id}` : "/hr/leaves"}>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/50 hover:bg-red-50 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                          <p className="text-xs text-red-500">
                            {item.itemType === "task" ? "مهمة متأخرة" : "طلب معلق"}
                            {item.deadline && ` — ${formatDateAr(item.deadline)}`}
                          </p>
                        </div>
                        <Badge className="text-[10px] bg-red-100 text-red-700 shrink-0">{statusLabels[item.status]?.label || item.status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {expiringSoon.length > 0 && (
            <Card className="border-0 shadow-sm border-s-4 border-s-amber-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-amber-500" />
                  يحتاج تجديد قريبا
                  <Badge className="text-xs bg-amber-100 text-amber-700">{expiringSoon.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {expiringSoon.slice(0, 5).map((item: any, idx: number) => {
                    const daysLeft = item.expiryDate ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) : 0;
                    return (
                      <div key={`expiring-${idx}`} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                          <p className="text-xs text-gray-500">
                            {item.itemType === "document" ? "مستند" : "عقد"}
                          </p>
                        </div>
                        <Badge className={cn("text-[10px] shrink-0", daysLeft <= 7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                          {daysLeft <= 0 ? "منتهي" : `${daysLeft} يوم`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {role !== "employee" && (roleEntities.units?.total > 0 || roleEntities.vehicles?.total > 0 || roleEntities.cases?.total > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Number(roleEntities.units?.total) > 0 && (
            <Link href="/properties">
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50">
                      <Building className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">الوحدات العقارية</p>
                      <p className="text-xs text-gray-500">{roleEntities.units.total} وحدة</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600">{roleEntities.units.available || 0} متاحة</span>
                    <span className="text-blue-600">{roleEntities.units.rented || 0} مؤجرة</span>
                    <span className="text-amber-600">{roleEntities.units.inMaintenance || 0} صيانة</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {Number(roleEntities.vehicles?.total) > 0 && (
            <Link href="/fleet">
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50">
                      <Car className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">الأسطول</p>
                      <p className="text-xs text-gray-500">{roleEntities.vehicles.total} مركبة</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600">{roleEntities.vehicles.available || 0} متاحة</span>
                    <span className="text-blue-600">{roleEntities.vehicles.inUse || 0} قيد الاستخدام</span>
                    <span className="text-amber-600">{roleEntities.vehicles.inMaintenance || 0} صيانة</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {Number(roleEntities.cases?.total) > 0 && (
            <Link href="/legal/cases">
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50">
                      <Scale className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">القضايا القانونية</p>
                      <p className="text-xs text-gray-500">{roleEntities.cases.total} قضية</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-blue-600">{roleEntities.cases.active || 0} نشطة</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-500" />
              رصيد الإجازات
            </CardTitle>
            <Link href="/hr/leaves">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {leaveBalances.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">لا توجد أنواع إجازات</p>
            ) : (
              <div className="space-y-2">
                {leaveBalances.map((b: any) => (
                  <div key={b.leaveTypeId} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                    <span className="text-sm font-medium text-gray-700">{b.name}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-400">مستخدم: {b.used}</span>
                      <Badge className={cn("text-xs", b.remaining > 5 ? "bg-green-100 text-green-700" : b.remaining > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700")}>
                        متبقي: {b.remaining}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-orange-500" />
              طلباتي المفتوحة
              {openRequests.length > 0 && <Badge className="text-xs bg-orange-100 text-orange-700">{openRequests.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openRequests.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">لا توجد طلبات مفتوحة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {openRequests.slice(0, 6).map((r: any) => (
                  <div key={`${r.type}-${r.id}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {requestTypeLabels[r.type] || r.type}: {r.title}
                      </p>
                      <p className="text-xs text-gray-400">{r.createdAt ? formatTimeAgo(r.createdAt) : ""}</p>
                    </div>
                    <Badge className={cn("text-[10px] shrink-0", statusLabels[r.status]?.color || "bg-gray-100 text-gray-700")}>
                      {statusLabels[r.status]?.label || r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-blue-500" />
              مهامي اليوم
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
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
                <p className="text-sm text-green-600">لا توجد مهام مجدولة لليوم</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((t: any) => (
                  <Link key={t.id} href="/tasks">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        t.status === "completed" ? "bg-green-500" : t.status === "in_progress" ? "bg-blue-500" : "bg-yellow-500"
                      )} />
                      <p className="text-sm font-medium text-gray-800 truncate flex-1">{t.title}</p>
                      {t.priority && (
                        <Badge variant="outline" className={cn("text-[10px] shrink-0",
                          t.priority === "high" ? "bg-red-100 text-red-700" : t.priority === "medium" ? "bg-yellow-100 text-yellow-700" : ""
                        )}>
                          {priorityLabels[t.priority] || t.priority}
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
              تنبيهاتي
              {notifications.filter((n: any) => !n.isRead).length > 0 && (
                <Badge variant="destructive" className="text-xs">{notifications.filter((n: any) => !n.isRead).length}</Badge>
              )}
            </CardTitle>
            <Link href="/notifications">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="text-center py-4">
                <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">لا توجد تنبيهات</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 6).map((n: any) => (
                  <div key={n.id} className={cn(
                    "flex items-start gap-3 p-2.5 rounded-lg transition-colors",
                    !n.isRead ? "bg-blue-50/50" : "hover:bg-gray-50"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      n.priority === "high" || n.priority === "urgent" ? "bg-red-50" : "bg-blue-50"
                    )}>
                      <Bell className={cn("w-4 h-4", n.priority === "high" || n.priority === "urgent" ? "text-red-500" : "text-blue-500")} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-500" />
              العُهد المسلمة لي
              {custodies.length > 0 && <Badge className="text-xs bg-indigo-100 text-indigo-700">{custodies.length}</Badge>}
            </CardTitle>
            <Link href="/finance/custodies">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {custodies.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">لا توجد عُهد</p>
            ) : (
              <div className="space-y-2">
                {custodies.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.description || `عهدة #${c.id}`}</p>
                      <p className="text-xs text-gray-400">{Number(c.amount).toLocaleString("ar-SA")} ر.س</p>
                    </div>
                    <Badge className={cn("text-[10px] shrink-0", statusLabels[c.status]?.color || "bg-gray-100 text-gray-700")}>
                      {statusLabels[c.status]?.label || c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-500" />
              مستنداتي
              {documents.length > 0 && <Badge className="text-xs bg-cyan-100 text-cyan-700">{documents.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">لا توجد مستندات</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 5).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{d.name || d.type}</p>
                        <p className="text-xs text-gray-400">{d.type}</p>
                      </div>
                    </div>
                    {d.expiryDate && (
                      <span className={cn("text-xs shrink-0",
                        new Date(d.expiryDate) < new Date() ? "text-red-500" : "text-gray-400"
                      )}>
                        ينتهي: {formatDateAr(d.expiryDate)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-500" />
              آخر إجراءاتي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActions.length === 0 ? (
              <div className="text-center py-4">
                <Activity className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">لا توجد إجراءات حديثة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentActions.map((a: any) => {
                  const actionLabels: Record<string, string> = {
                    create: "إنشاء",
                    update: "تعديل",
                    delete: "حذف",
                    approve: "اعتماد",
                    reject: "رفض",
                  };
                  return (
                    <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                      <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                        <Activity className="w-4 h-4 text-violet-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {actionLabels[a.action] || a.action} — {a.entityType}
                        </p>
                        {a.description && (
                          <p className="text-xs text-gray-500 truncate">{a.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {a.createdAt ? formatTimeAgo(a.createdAt) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-500" />
              تقييمات الأداء
            </CardTitle>
            <Link href="/hr/performance">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {performanceReviews.length === 0 ? (
              <div className="text-center py-4">
                <Target className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">لا توجد تقييمات أداء</p>
              </div>
            ) : (
              <div className="space-y-2">
                {performanceReviews.map((r: any) => {
                  const score = Number(r.overallScore) || 0;
                  const scoreColor = score >= 4 ? "text-green-600" : score >= 3 ? "text-yellow-600" : "text-red-600";
                  const scoreBg = score >= 4 ? "bg-green-50" : score >= 3 ? "bg-yellow-50" : "bg-red-50";
                  return (
                    <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{r.period || "تقييم"}</p>
                        <p className="text-xs text-gray-500">
                          {r.reviewerName ? `بواسطة: ${r.reviewerName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", scoreBg, scoreColor)}>
                          <Star className="w-3 h-3" />
                          {score.toFixed(1)}/5
                        </div>
                        <Badge className={cn("text-[10px]", statusLabels[r.status]?.color || "bg-gray-100 text-gray-700")}>
                          {statusLabels[r.status]?.label || r.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {violations.length > 0 && (
        <Card className="border-0 shadow-sm border-s-4 border-s-red-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              الجزاءات والملاحظات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {violations.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{v.description}</p>
                    <p className="text-xs text-gray-400">{v.period} — {v.type}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {v.deduction > 0 && (
                      <span className="text-xs text-red-600 font-medium">-{Number(v.deduction).toLocaleString("ar-SA")} ر.س</span>
                    )}
                    <Badge className={cn("text-[10px]", severityColors[v.severity] || "bg-gray-100 text-gray-700")}>
                      {v.severity === "low" ? "منخفض" : v.severity === "medium" ? "متوسط" : "عالي"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {role !== "employee" && pendingApprovals.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-500" />
              موافقاتي المعلقة
              <Badge variant="destructive" className="text-xs">{pendingApprovals.length}</Badge>
            </CardTitle>
            <Link href="/action-center">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                مركز القرارات <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovals.slice(0, 5).map((a: any) => (
                <Link key={`${a.type}-${a.id}`} href="/hr/leaves">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">طلب إجازة - {a.employeeName}</p>
                      <p className="text-xs text-gray-500">{a.title}</p>
                    </div>
                    <span className="text-xs text-gray-400">{a.createdAt ? formatTimeAgo(a.createdAt) : ""}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {monthlyStats && (
        <Card className="border-0 shadow-sm bg-gradient-to-l from-blue-50/50 to-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              ملخص الأداء الشهري
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-xl border border-green-100">
                <p className="text-2xl font-bold text-green-700">{monthlyStats.presentDays || 0}</p>
                <p className="text-xs text-green-600 font-medium">أيام حضور</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-xl border border-red-100">
                <p className="text-2xl font-bold text-red-700">{monthlyStats.absentDays || 0}</p>
                <p className="text-xs text-red-600 font-medium">أيام غياب</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                <p className="text-2xl font-bold text-orange-700">{monthlyStats.lateDays || 0}</p>
                <p className="text-xs text-orange-600 font-medium">أيام تأخر</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-2xl font-bold text-blue-700">{monthlyStats.totalLateMinutes || 0}</p>
                <p className="text-xs text-blue-600 font-medium">دقائق تأخر</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-xl border border-purple-100">
                <p className="text-2xl font-bold text-purple-700">
                  {monthlyStats.presentDays
                    ? Math.round((monthlyStats.presentDays / (monthlyStats.presentDays + (monthlyStats.absentDays || 0))) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-purple-600 font-medium">نسبة الالتزام</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-500" />
              معلومات حسابي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-600">البريد الإلكتروني</span>
              <span className="text-sm font-mono font-medium text-gray-800">{user?.email || "—"}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-600">الدور الحالي</span>
              <span className="text-sm font-medium text-indigo-700">{selectedRoleLabel}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-600">اسم الموظف</span>
              <span className="text-sm font-medium">{user?.name || "—"}</span>
            </div>
          </CardContent>
        </Card>
        <ChangePasswordSection />
      </div>
    </div>
  );
}
