import { useState } from "react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useApiMutation } from "@/lib/api";
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
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UpcomingEventsWidget } from "@/components/shared/upcoming-events-widget";
import { PromptDialog } from "@/components/shared/prompt-dialog";

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
  const [pendingPrompt, setPendingPrompt] = useState<
    | { kind: "workflow"; id: number; decision: "reject" | "return" }
    | { kind: "approval"; tab: TabKey; id: number }
    | null
  >(null);
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

  const runWorkflow = (id: number, decision: WorkflowDecision, notes?: string) => {
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

  const handleWorkflowDecision = (id: number, decision: WorkflowDecision) => {
    if (decision === "approve") {
      runWorkflow(id, "approve");
      return;
    }
    setPendingPrompt({ kind: "workflow", id, decision });
  };

  const handleApproval = (tab: TabKey, id: number, approved: boolean) => {
    const endpoint = approvalEndpoints[tab];
    if (!endpoint) return;

    if (!approved) {
      setPendingPrompt({ kind: "approval", tab, id });
      return;
    }
    runApproval(tab, id, true);
  };

  const runApproval = (tab: TabKey, id: number, approved: boolean, notes?: string) => {
    const endpoint = approvalEndpoints[tab];
    if (!endpoint) return;

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

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

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
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">
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
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{item.leaveType} — {item.days} يوم ({formatDateAr(item.startDate)} → {formatDateAr(item.endDate)})</p>
            </div>
          </div>
        );
      case "advances":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-status-success-surface flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-status-success-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(Number(item.amount))} — {item.reason || "سلفة راتب"}</p>
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
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{item.description} — {formatCurrency(Number(item.amount))}</p>
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
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{item.letterType}</p>
            </div>
          </div>
        );
      case "purchases":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-status-info-surface flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4 text-status-info-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.title || `طلب شراء #${item.id}`}</p>
              <p className="text-xs text-muted-foreground">{item.createdAt ? formatTimeAgo(item.createdAt) : ""}</p>
            </div>
          </div>
        );
      case "expenses":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-status-warning-surface flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 text-status-warning-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.description || item.ref || `مصروف #${item.id}`}</p>
              <p className="text-xs text-muted-foreground">{item.createdAt ? formatTimeAgo(item.createdAt) : ""}</p>
            </div>
          </div>
        );
      case "loans": {
        const loanTypeLabels: Record<string, string> = { salary_advance: "سلفة راتب", personal: "سلفة شخصية", emergency: "سلفة طارئة" };
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <Banknote className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{loanTypeLabels[item.loanType] || item.loanType} — {formatCurrency(Number(item.amount))}</p>
            </div>
          </div>
        );
      }
      case "overtime":
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
              <Timer className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{Number(item.hours).toFixed(1)} ساعة — {formatCurrency(Number(item.totalAmount))}</p>
            </div>
          </div>
        );
      case "exit": {
        const exitTypeLabels: Record<string, string> = { resignation: "استقالة", termination: "فصل", retirement: "تقاعد", contract_end: "انتهاء عقد", mutual: "اتفاق متبادل" };
        return (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-status-error-surface flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4 text-status-error-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName}</p>
              <p className="text-xs text-muted-foreground">{exitTypeLabels[item.exitType] || item.exitType}</p>
            </div>
          </div>
        );
      }
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
          summary.totalPending > 0 ? "border-orange-200 bg-orange-50" : "border-border bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.totalPending || 0}</p>
          <p className="text-sm text-muted-foreground mt-1">معاملة معلقة</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.slaBreachedCount > 0 ? "border-status-error-surface bg-status-error-surface" : "border-border bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.slaBreachedCount || 0}</p>
          <p className="text-sm text-muted-foreground mt-1">تجاوز مستوى الخدمة</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.escalationsCount > 0 ? "border-status-warning-surface bg-status-warning-surface" : "border-border bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.escalationsCount || 0}</p>
          <p className="text-sm text-muted-foreground mt-1">تصعيدات</p>
        </div>
        <div className={cn(
          "rounded-xl p-4 border-2 text-center",
          summary.criticalAlertsCount > 0 ? "border-purple-200 bg-purple-50" : "border-border bg-white"
        )}>
          <p className="text-3xl font-black text-gray-900">{summary.criticalAlertsCount || 0}</p>
          <p className="text-sm text-muted-foreground mt-1">تنبيهات حرجة</p>
        </div>
      </div>

      <UpcomingEventsWidget days={14} limit={6} title="أحداث قادمة خلال 14 يوم" />

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
              <p className="text-sm text-status-success-foreground font-medium">لا توجد معاملات معلقة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentData.map((item: any) => {
                const itemKey = `${activeTab}-${item.id}`;
                const isProcessing = processingIds.has(itemKey);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-surface-subtle/50 transition-colors">
                    {renderItem(item)}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.createdAt ? formatTimeAgo(item.createdAt) : ""}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : activeTab === "workflows" ? (
                        <>
                          <GuardedButton
                            perm="workflow:approve"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-status-success-foreground hover:bg-status-success-surface hover:text-status-success-foreground"
                            title="اعتماد"
                            onClick={(e) => { e.preventDefault(); handleWorkflowDecision(item.id, "approve"); }}
                          >
                            <Check className="w-4 h-4" />
                          </GuardedButton>
                          <GuardedButton
                            perm="workflow:approve"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-status-warning-foreground hover:bg-status-warning-surface hover:text-status-warning-foreground"
                            title="إرجاع للتعديل"
                            onClick={(e) => { e.preventDefault(); handleWorkflowDecision(item.id, "return"); }}
                          >
                            <CornerUpLeft className="w-4 h-4" />
                          </GuardedButton>
                          <GuardedButton
                            perm="workflow:reject"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-status-error-foreground hover:bg-status-error-surface hover:text-status-error-foreground"
                            title="رفض"
                            onClick={(e) => { e.preventDefault(); handleWorkflowDecision(item.id, "reject"); }}
                          >
                            <XIcon className="w-4 h-4" />
                          </GuardedButton>
                        </>
                      ) : (
                        <>
                          <GuardedButton
                            perm="approval:approve"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-status-success-foreground hover:bg-status-success-surface hover:text-status-success-foreground"
                            title="اعتماد"
                            onClick={(e) => { e.preventDefault(); handleApproval(activeTab, item.id, true); }}
                          >
                            <Check className="w-4 h-4" />
                          </GuardedButton>
                          <GuardedButton
                            perm="approval:reject"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-status-error-foreground hover:bg-status-error-surface hover:text-status-error-foreground"
                            title="رفض"
                            onClick={(e) => { e.preventDefault(); handleApproval(activeTab, item.id, false); }}
                          >
                            <XIcon className="w-4 h-4" />
                          </GuardedButton>
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
                <Timer className="w-5 h-5 text-status-error" />
                معاملات متأخرة عن مستوى الخدمة
                <Badge variant="destructive" className="text-xs">{slaBreached.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {slaBreached.map((s: any) => (
                  <Link key={s.id} href={`/support/${s.id}`}>
                    <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-status-error-surface transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-status-neutral-foreground truncate">{s.title || `تذكرة #${s.id}`}</p>
                        <p className="text-xs text-status-error">
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
                <AlertTriangle className="w-5 h-5 text-status-warning" />
                تصعيدات
                <Badge className="text-xs bg-status-warning-surface text-status-warning-foreground">{escalations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {escalations.map((e: any) => (
                  <div key={e.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-status-warning-surface/50">
                    <Bell className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{e.body}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{e.createdAt ? formatTimeAgo(e.createdAt) : ""}</p>
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
              <ListTodo className="w-5 h-5 text-status-info" />
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
                <p className="text-sm text-status-success-foreground">لا توجد مهام مجدولة لليوم</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((t: any) => (
                  <Link key={t.id} href={`/tasks/${t.id}`}>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        t.status === "completed" ? "bg-green-500" : t.status === "in_progress" ? "bg-blue-500" : "bg-yellow-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-status-neutral-foreground truncate">{t.title}</p>
                        {t.assigneeName && <p className="text-xs text-muted-foreground">{t.assigneeName}</p>}
                      </div>
                      {t.priority && (
                        <Badge variant="outline" className={cn("text-[10px] shrink-0",
                          t.priority === "high" ? "bg-status-error-surface text-status-error-foreground" : t.priority === "medium" ? "bg-status-warning-surface text-status-warning-foreground" : ""
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
                    <div className="w-8 h-8 rounded-full bg-status-error-surface flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="w-4 h-4 text-status-error" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.body}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.createdAt ? formatTimeAgo(a.createdAt) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <PromptDialog
        open={pendingPrompt !== null}
        title={
          pendingPrompt?.kind === "workflow" && pendingPrompt.decision === "return"
            ? "إرجاع المعاملة للتعديل"
            : "رفض المعاملة"
        }
        description={
          pendingPrompt?.kind === "workflow" && pendingPrompt.decision === "return"
            ? "يرجى إدخال سبب الإرجاع للتعديل."
            : "يرجى إدخال سبب الرفض."
        }
        confirmLabel={
          pendingPrompt?.kind === "workflow" && pendingPrompt.decision === "return"
            ? "تأكيد الإرجاع"
            : "تأكيد الرفض"
        }
        onSubmit={(reason) => {
          if (!pendingPrompt) return;
          const current = pendingPrompt;
          setPendingPrompt(null);
          if (current.kind === "workflow") {
            runWorkflow(current.id, current.decision, reason);
          } else {
            runApproval(current.tab, current.id, false, reason);
          }
        }}
        onClose={() => setPendingPrompt(null)}
      />
    </PageShell>
  );
}
