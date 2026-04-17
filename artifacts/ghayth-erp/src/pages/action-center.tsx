import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useApiMutation } from "@/lib/api";
import { LOAN_TYPES, EXIT_TYPES } from "@/lib/hr-type-maps";
import { useAppContext } from "@/contexts/app-context";
import { useAuth } from "@/lib/auth";
import {
  Calendar, DollarSign, KeyRound, FileSignature, ShoppingCart, Wallet,
  AlertTriangle, Bell, ListTodo, ChevronLeft, Check, X as XIcon, CornerUpLeft,
  ArrowUpRight, Briefcase, CheckCircle2, Timer, LogOut, Banknote,
  User, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";

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

type TabKey = "workflows" | "leaves" | "advances" | "custodies" | "letters" | "purchases" | "expenses" | "loans" | "overtime" | "exit";

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: "workflows", label: "سير العمل", icon: Briefcase },
  { key: "leaves", label: "إجازات", icon: Calendar },
  { key: "advances", label: "سلف", icon: DollarSign },
  { key: "custodies", label: "عُهد", icon: KeyRound },
  { key: "letters", label: "خطابات", icon: FileSignature },
  { key: "purchases", label: "مشتريات", icon: ShoppingCart },
  { key: "expenses", label: "مصروفات", icon: Wallet },
  { key: "loans", label: "سلف موظفين", icon: Banknote },
  { key: "overtime", label: "وقت إضافي", icon: Timer },
  { key: "exit", label: "نهاية خدمة", icon: LogOut },
];

const approvalEndpoints: Record<TabKey, (id: number) => string> = {
  workflows: (id) => `/workflows/${id}/approve`,
  leaves: (id) => `/hr/leave-requests/${id}/approve`,
  advances: (id) => `/finance/salary-advances/${id}/approve`,
  custodies: (id) => `/finance/custodies/${id}/approve`,
  letters: (id) => `/hr/official-letters/${id}/approve`,
  purchases: (id) => `/finance/purchase-requests/${id}/approve`,
  expenses: (id) => `/finance/expenses/${id}/approve`,
  loans: (id) => `/hr/loans/${id}/approve`,
  overtime: (id) => `/hr/overtime/${id}/approve`,
  exit: (id) => `/hr/exit/${id}/approve`,
};

const priorityLabels: Record<string, string> = {
  high: "عاجل",
  medium: "متوسط",
  low: "عادي",
  urgent: "طارئ",
};

export default function ActionCenter() {
  const { user } = useAuth();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [activeTab, setActiveTab] = useState<TabKey>("leaves");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const workflowMut = useApiMutation<any, { url: string; notes?: string }>(
    (body) => body.url,
    "POST",
    [["action-center"]],
    { successMessage: false }
  );
  const approvalMut = useApiMutation<any, { url: string; approved: boolean; reason?: string; notes?: string }>(
    (body) => body.url,
    "PATCH",
    [["action-center"]],
    { successMessage: false }
  );

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["action-center", scopeQueryString],
    `/action-center${scopeSuffix}`
  );

  type WorkflowDecision = "approve" | "reject" | "return";

  const handleWorkflowDecision = async (id: number, decision: WorkflowDecision) => {
    let notes: string | undefined;
    if (decision !== "approve") {
      const prompt = decision === "reject" ? "سبب الرفض:" : "سبب الإرجاع للتعديل:";
      const reason = window.prompt(prompt);
      if (!reason || reason.trim() === "") {
        toast({ title: "تنبيه", description: decision === "reject" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع", variant: "destructive" });
        return;
      }
      notes = reason.trim();
    }

    const key = `workflows-${id}`;
    setProcessingIds((prev) => new Set(prev).add(key));

    const url = `/workflows/${id}/${decision}${scopeSuffix}`;
    workflowMut.mutate(
      { url, notes },
      {
        onSuccess: () => {
          const labels: Record<WorkflowDecision, string> = { approve: "تم الاعتماد", reject: "تم الرفض", return: "تم الإرجاع" };
          toast({ title: labels[decision], description: decision === "approve" ? "تم اعتماد المعاملة بنجاح" : decision === "reject" ? "تم رفض المعاملة" : "تم إرجاع المعاملة للتعديل" });
          setProcessingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
        },
        onError: () => {
          setProcessingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
        },
      }
    );
  };

  const handleApproval = (tab: TabKey, id: number, approved: boolean) => {
    const endpoint = approvalEndpoints[tab];
    if (!endpoint) return;

    let notes: string | undefined;
    if (!approved) {
      const reason = window.prompt("سبب الرفض:");
      if (!reason || reason.trim() === "") {
        toast({ title: "تنبيه", description: "يجب ذكر سبب الرفض", variant: "destructive" });
        return;
      }
      notes = reason.trim();
    }

    const key = `${tab}-${id}`;
    setProcessingIds((prev) => new Set(prev).add(key));

    const body: { url: string; approved: boolean; reason?: string; notes?: string } = {
      url: `${endpoint(id)}${scopeSuffix}`,
      approved,
    };
    if (notes) {
      if (tab === "leaves") body.reason = notes;
      else body.notes = notes;
    }
    approvalMut.mutate(body, {
      onSuccess: () => {
        toast({
          title: approved ? "تم الاعتماد" : "تم الرفض",
          description: approved ? "تم اعتماد المعاملة بنجاح" : "تم رفض المعاملة",
        });
        setProcessingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
      },
      onError: () => {
        setProcessingIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
      },
    });
  };

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
        <h2 className="text-lg font-bold text-gray-800 mb-1">
          {error?.message?.includes("403") ? "غير مصرح بالوصول" : "حدث خطأ في تحميل البيانات"}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {error?.message?.includes("403") ? "هذه الصفحة مخصصة للمدراء فقط" : error?.message || "خطأ غير متوقع"}
        </p>
        <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const pendingLeaves = data?.pendingLeaves || [];
  const pendingAdvances = data?.pendingAdvances || [];
  const pendingCustodies = data?.pendingCustodies || [];
  const pendingLetters = data?.pendingLetters || [];
  const pendingPurchases = data?.pendingPurchases || [];
  const pendingExpenses = data?.pendingExpenses || [];
  const pendingWorkflows = data?.pendingWorkflows || [];
  const pendingLoans = data?.pendingLoans || [];
  const pendingOvertime = data?.pendingOvertime || [];
  const pendingExitRequests = data?.pendingExitRequests || [];
  const slaBreached = data?.slaBreached || [];
  const escalations = data?.escalations || [];
  const todayTasks = data?.todayTasks || [];
  const criticalAlerts = data?.criticalAlerts || [];

  const tabData: Record<TabKey, any[]> = {
    workflows: pendingWorkflows,
    leaves: pendingLeaves,
    advances: pendingAdvances,
    custodies: pendingCustodies,
    letters: pendingLetters,
    purchases: pendingPurchases,
    expenses: pendingExpenses,
    loans: pendingLoans,
    overtime: pendingOvertime,
    exit: pendingExitRequests,
  };

  const tabLinks: Record<TabKey, string> = {
    workflows: "/workflows",
    leaves: "/hr/leaves",
    advances: "/finance/salary-advances",
    custodies: "/finance/custodies",
    letters: "/letters",
    purchases: "/finance/purchase-orders",
    expenses: "/finance/expenses",
    loans: "/hr/loans",
    overtime: "/hr/overtime",
    exit: "/hr/exit",
  };

  const currentData = tabData[activeTab];

  const renderItem = (item: any) => {
    switch (activeTab) {
      case "workflows":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
              <p className="text-xs text-gray-500">
                {item.submittedByName ?? "موظف"} — خطوة {item.currentStepOrder}
                {item.slaStatus && item.slaStatus !== "on_track" ? ` ⚠ ${item.slaStatus === "warning" ? "تحذير مستوى الخدمة" : "تجاوز مستوى الخدمة"}` : ""}
              </p>
            </div>
          </div>
        );
      case "leaves":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{item.leaveType} — {item.days} يوم ({item.startDate} → {item.endDate})</p>
            </div>
          </div>
        );
      case "advances":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{Number(item.amount).toLocaleString("ar-SA")} ر.س — {item.reason || "سلفة راتب"}</p>
            </div>
          </div>
        );
      case "custodies":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{item.description} — {Number(item.amount).toLocaleString("ar-SA")} ر.س</p>
            </div>
          </div>
        );
      case "letters":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
              <FileSignature className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{item.letterType}</p>
            </div>
          </div>
        );
      case "purchases":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.title || `طلب شراء #${item.id}`}</p>
              <p className="text-xs text-gray-400">{item.createdAt ? formatTimeAgo(item.createdAt) : ""}</p>
            </div>
          </div>
        );
      case "expenses":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.description || item.ref || `مصروف #${item.id}`}</p>
              <p className="text-xs text-gray-400">{item.createdAt ? formatTimeAgo(item.createdAt) : ""}</p>
            </div>
          </div>
        );
      case "loans":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <Banknote className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{LOAN_TYPES[item.loanType] || item.loanType} — {Number(item.amount).toLocaleString("ar-SA")} ر.س</p>
            </div>
          </div>
        );
      case "overtime":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
              <Timer className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{Number(item.hours).toFixed(1)} ساعة — {Number(item.totalAmount).toLocaleString("ar-SA")} ر.س</p>
            </div>
          </div>
        );
      case "exit":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.employeeName}</p>
              <p className="text-xs text-gray-500">{EXIT_TYPES[item.exitType] || item.exitType}</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <PageShell
      title="مركز القرارات"
      subtitle="المعاملات والقرارات التي تنتظر اعتمادك"
      actions={
        <Link href="/my-space">
          <Button variant="outline" className="gap-2">
            <User className="w-4 h-4" />
            مساحتي
            <ArrowUpRight className="w-3 h-3" />
          </Button>
        </Link>
      }
      contentClassName="space-y-6"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.totalPending > 0 ? "border-orange-200 bg-orange-50" : "border-gray-100 bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.totalPending || 0}</p>
          <p className="text-sm text-gray-500 mt-1">معاملة معلقة</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.slaBreachedCount > 0 ? "border-red-200 bg-red-50" : "border-gray-100 bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.slaBreachedCount || 0}</p>
          <p className="text-sm text-gray-500 mt-1">تجاوز مستوى الخدمة</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.escalationsCount > 0 ? "border-yellow-200 bg-yellow-50" : "border-gray-100 bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.escalationsCount || 0}</p>
          <p className="text-sm text-gray-500 mt-1">تصعيدات</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.criticalAlertsCount > 0 ? "border-purple-200 bg-purple-50" : "border-gray-100 bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.criticalAlertsCount || 0}</p>
          <p className="text-sm text-gray-500 mt-1">تنبيهات حرجة</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-orange-500" />
            معاملات بانتظار الاعتماد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const count = tabData[tab.key].length;
              return (
                <Button
                  key={tab.key}
                  variant={activeTab === tab.key ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setActiveTab(tab.key)}
                >
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                  {count > 0 && (
                    <Badge variant={activeTab === tab.key ? "secondary" : "destructive"} className="text-[10px] px-1.5">
                      {count}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>

          {currentData.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-sm text-green-600 font-medium">لا توجد معاملات معلقة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentData.map((item: any) => {
                const itemKey = `${activeTab}-${item.id}`;
                const isProcessing = processingIds.has(itemKey);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors">
                    {renderItem(item)}
                    <span className="text-xs text-gray-400 shrink-0">
                      {item.createdAt ? formatTimeAgo(item.createdAt) : ""}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : activeTab === "workflows" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                            title="اعتماد"
                            onClick={(e) => { e.preventDefault(); handleWorkflowDecision(item.id, "approve"); }}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                            title="إرجاع للتعديل"
                            onClick={(e) => { e.preventDefault(); handleWorkflowDecision(item.id, "return"); }}
                          >
                            <CornerUpLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                            title="رفض"
                            onClick={(e) => { e.preventDefault(); handleWorkflowDecision(item.id, "reject"); }}
                          >
                            <XIcon className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                            title="اعتماد"
                            onClick={(e) => { e.preventDefault(); handleApproval(activeTab, item.id, true); }}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                            title="رفض"
                            onClick={(e) => { e.preventDefault(); handleApproval(activeTab, item.id, false); }}
                          >
                            <XIcon className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentData.length > 0 && (
            <div className="mt-3 text-center">
              <Link href={tabLinks[activeTab]}>
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  عرض الكل في الصفحة المخصصة <ChevronLeft className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {slaBreached.length > 0 && (
          <Card className="border-0 shadow-sm border-s-4 border-s-red-400">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Timer className="w-5 h-5 text-red-500" />
                معاملات متأخرة عن مستوى الخدمة
                <Badge variant="destructive" className="text-xs">{slaBreached.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {slaBreached.map((s: any) => (
                  <Link key={s.id} href={`/support/${s.id}`}>
                    <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-red-50/50 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.title || `تذكرة #${s.id}`}</p>
                        <p className="text-xs text-red-500">
                          الموعد النهائي: {s.slaDeadline ? formatDateAr(s.slaDeadline) : "—"}
                        </p>
                      </div>
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {escalations.length > 0 && (
          <Card className="border-0 shadow-sm border-s-4 border-s-yellow-400">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                تصعيدات
                <Badge className="text-xs bg-yellow-100 text-yellow-700">{escalations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {escalations.map((e: any) => (
                  <div key={e.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-yellow-50/50">
                    <Bell className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{e.title}</p>
                      <p className="text-xs text-gray-500 truncate">{e.body}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{e.createdAt ? formatTimeAgo(e.createdAt) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-blue-500" />
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
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
                <p className="text-sm text-green-600">لا توجد مهام مجدولة لليوم</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((t: any) => (
                  <Link key={t.id} href={`/tasks/${t.id}`}>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        t.status === "completed" ? "bg-green-500" : t.status === "in_progress" ? "bg-blue-500" : "bg-yellow-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                        {t.assigneeName && <p className="text-xs text-gray-400">{t.assigneeName}</p>}
                      </div>
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

        {criticalAlerts.length > 0 && (
          <Card className="border-0 shadow-sm border-s-4 border-s-purple-400">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bell className="w-5 h-5 text-purple-500" />
                تنبيهات حرجة
                <Badge variant="destructive" className="text-xs">{criticalAlerts.length}</Badge>
              </CardTitle>
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  عرض الكل <ChevronLeft className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {criticalAlerts.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-purple-50/30">
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.title}</p>
                      <p className="text-xs text-gray-500 truncate">{a.body}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.createdAt ? formatTimeAgo(a.createdAt) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
