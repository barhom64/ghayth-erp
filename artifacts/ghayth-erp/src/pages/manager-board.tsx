import { useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { formatDateAr } from "@/lib/formatters";
import {
  CheckCircle, Clock, AlertTriangle, ChevronLeft,
  Briefcase, Calendar, Check, X as XIcon,
  ListChecks, UserCheck, Loader2, ArrowUpRight, Bell, UserCog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { getApprovalEndpoint, getApprovalMethod, getApprovalBadgeClass, buildAllPending } from "@/lib/approval-registry";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";

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

export default function ManagerBoard() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { toast } = useToast();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  // Tracks the row being rejected so PromptDialog can submit its
  // reason against the right item. Closing the dialog (esc / cancel)
  // resets to null without firing the mutation. Native window.prompt()
  // used to live here — it blocked the event loop, ignored RTL, and
  // didn't match the app's dark-mode skin.
  const [rejectTarget, setRejectTarget] = useState<{ _type: string; id: number } | null>(null);

  const { data: actionData, isLoading: actionLoading, isError: actionError, refetch: refetchAction } = useApiQuery<any>(
    ["action-center", scopeQueryString],
    `/action-center${scopeSuffix}`
  );

  const { data: teamData, isLoading: teamLoading } = useApiQuery<any>(
    ["manager-team", scopeQueryString],
    `/hr/attendance/today-summary${scopeSuffix}`
  );

  const { data: tasksData } = useApiQuery<any>(
    ["manager-tasks", scopeQueryString],
    `/tasks?limit=20&status=in_progress${scopeSuffix ? "&" + scopeQueryString : ""}`
  );

  const { data: delegationsData } = useApiQuery<any>(
    ["manager-delegations", scopeQueryString],
    `/hr/delegations${scopeSuffix}`
  );

  type ApprovalBody = { _type: string; _itemId: number; approved: boolean; reason?: string; notes?: string };
  const mutOpts = {
    successMessage: false as const,
    onSuccess: (_d: any, body: ApprovalBody) => {
      toast({ title: body.approved ? "تم الاعتماد بنجاح" : "تم الرفض" });
      refetchAction();
      const key = `${body._type}-${body._itemId}`;
      setProcessingIds(prev => { const s = new Set(prev); s.delete(key); return s; });
    },
    onError: (_e: any, body: ApprovalBody) => {
      const key = `${body._type}-${body._itemId}`;
      setProcessingIds(prev => { const s = new Set(prev); s.delete(key); return s; });
    },
  };
  const patchMut = useApiMutation<any, ApprovalBody>(
    (body) => getApprovalEndpoint(body._type, body._itemId), "PATCH", [["action-center"]], mutOpts,
  );
  const postMut = useApiMutation<any, ApprovalBody>(
    (body) => getApprovalEndpoint(body._type, body._itemId), "POST", [["action-center"]], mutOpts,
  );
  const approvalMut = { mutate: (body: ApprovalBody) => (getApprovalMethod(body._type) === "POST" ? postMut : patchMut).mutate(body) };

  if (actionLoading) return <LoadingSpinner />;
  if (actionError) return <ErrorState />;

  const pending = actionData || {};
  const workflows = pending.pendingWorkflows || [];
  const allPending = buildAllPending(pending);
  const urgentPending = allPending.filter((r: any) => r.priority === "high" || r.priority === "urgent");
  const todayPending = allPending.filter((r: any) => {
    const created = new Date(r.createdAt);
    const today = new Date();
    return created.toDateString() === today.toDateString();
  });

  const team: any[] = teamData?.data || [];
  const tasks: any[] = tasksData?.data || [];

  const presentCount = team.filter((m: any) => m.status === "present" || m.status === "present_off_day").length;
  const absentCount = team.filter((m: any) => m.status === "absent").length;
  const lateCount = team.filter((m: any) => m.lateMinutes > 0).length;
  const onLeaveCount = team.filter((m: any) => m.status === "on_leave").length;

  const doApprove = (item: any) => {
    const key = `${item._type}-${item.id}`;
    setProcessingIds(prev => new Set([...prev, key]));
    approvalMut.mutate({ _type: item._type, _itemId: item.id, approved: true });
  };

  const doReject = (item: any) => {
    setRejectTarget({ _type: item._type, id: item.id });
  };

  const handleRejectSubmit = (notes: string) => {
    if (!rejectTarget) return;
    const { _type, id } = rejectTarget;
    const key = `${_type}-${id}`;
    setProcessingIds(prev => new Set([...prev, key]));
    approvalMut.mutate({ _type, _itemId: id, approved: false, reason: notes, notes });
    setRejectTarget(null);
  };

  const tasksDone = tasks.filter((t: any) => t.status === "completed").length;
  const tasksInProg = tasks.filter((t: any) => t.status === "in_progress").length;
  const tasksPct = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;

  const pendingColumns: DataTableColumn<any>[] = [
    {
      key: "_type",
      header: "النوع",
      render: (item) => {
        const isUrgent = item.priority === "high" || item.priority === "urgent";
        return (
          <>
            <Badge className={cn("text-[10px]", getApprovalBadgeClass(item._type))}>
              {item._label}
            </Badge>
            {isUrgent && <Badge className="text-[10px] ms-1 bg-status-error-surface text-status-error-foreground">عاجل</Badge>}
          </>
        );
      },
    },
    {
      key: "employeeName",
      header: "الموظف",
      render: (item) => (
        <span className="font-medium text-sm">{item.employeeName || item.requestedBy || "—"}</span>
      ),
    },
    {
      key: "reason",
      header: "التفاصيل",
      render: (item) => (
        <span className="text-muted-foreground text-xs">{item.reason || item.leaveTypeName || item.description || "—"}</span>
      ),
    },
    {
      key: "createdAt",
      header: "وقت الطلب",
      render: (item) => (
        <span className="text-xs text-muted-foreground">{item.createdAt ? formatTimeAgo(item.createdAt) : "—"}</span>
      ),
    },
    {
      key: "action",
      header: "إجراء",
      render: (item) => {
        const key = `${item._type}-${item.id}`;
        const isProcessing = processingIds.has(key);
        return (
          <div className="flex gap-1">
            <GuardedButton perm="hr:approve" size="sm" disabled={isProcessing} className="h-7 bg-green-600 hover:bg-green-700 text-xs" onClick={() => doApprove(item)}>
              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </GuardedButton>
            <GuardedButton perm="hr:approve" size="sm" variant="outline" disabled={isProcessing} className="h-7 text-xs border-status-error-surface text-red-600 hover:bg-red-50" onClick={() => doReject(item)}>
              <XIcon className="h-3 w-3" />
            </GuardedButton>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell
      title="لوحة المدير"
      subtitle="إشراف على الفريق والطلبات المعلقة واتخاذ قرارات سريعة"
      actions={
        <Link href="/action-center">
          <Button variant="outline" size="sm" className="gap-1">
            مركز القرارات الكامل <ArrowUpRight className="w-3 h-3" />
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "طلبات معلقة", value: allPending.length, color: "bg-orange-50 text-orange-700", icon: Clock },
          { label: "عاجلة", value: urgentPending.length, color: "bg-status-error-surface text-status-error-foreground", icon: AlertTriangle },
          { label: "طلبات اليوم", value: todayPending.length, color: "bg-status-info-surface text-status-info-foreground", icon: Calendar },
          { label: "سير العمل", value: workflows.length, color: "bg-purple-50 text-purple-700", icon: Briefcase },
        ].map(c => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className={cn("p-4 flex items-center gap-3 rounded-lg", c.color)}>
              <c.icon className="w-5 h-5 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs mt-0.5">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {urgentPending.length > 0 && (
        <Card className="border-0 shadow-sm border-s-4 border-s-red-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-status-error-foreground">
              <Bell className="w-5 h-5" />
              طلبات عاجلة تحتاج موافقتك الآن
              <Badge variant="destructive">{urgentPending.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {urgentPending.slice(0, 5).map((item: any) => {
                const key = `${item._type}-${item.id}`;
                const isProcessing = processingIds.has(key);
                return (
                  <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-status-error-surface border border-status-error-surface">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className="text-[10px] bg-status-error-surface text-status-error-foreground">{item._label}</Badge>
                        <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.employeeName || item.requestedBy || "—"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.reason || item.description || item.leaveTypeName || "—"}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <GuardedButton perm="hr:approve" size="sm" disabled={isProcessing} className="h-7 bg-green-600 hover:bg-green-700 text-xs gap-1" onClick={() => doApprove(item)}>
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        موافقة
                      </GuardedButton>
                      <GuardedButton perm="hr:approve" size="sm" variant="outline" disabled={isProcessing} className="h-7 text-xs gap-1 border-status-error-surface text-status-error-foreground hover:bg-status-error-surface" onClick={() => doReject(item)}>
                        <XIcon className="h-3 w-3" />رفض
                      </GuardedButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-500" />
              حضور الفريق اليوم
            </CardTitle>
            <Link href="/hr/attendance">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                التفاصيل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {teamLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">جاري التحميل...</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { label: "حاضر", value: presentCount, color: "bg-status-success-surface text-status-success-foreground" },
                    { label: "غائب", value: absentCount, color: "bg-status-error-surface text-status-error-foreground" },
                    { label: "متأخر", value: lateCount, color: "bg-status-warning-surface text-status-warning-foreground" },
                    { label: "إجازة", value: onLeaveCount, color: "bg-status-info-surface text-status-info-foreground" },
                  ].map(c => (
                    <div key={c.label} className={cn("p-2 rounded-lg text-center", c.color)}>
                      <p className="text-lg font-bold">{c.value}</p>
                      <p className="text-[10px] mt-0.5">{c.label}</p>
                    </div>
                  ))}
                </div>
                {team.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {team.slice(0, 10).map((member: any) => (
                      <div key={member.employeeId || member.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-subtle">
                        <div className={cn("w-2 h-2 rounded-full shrink-0",
                          member.status === "present" ? "bg-green-500" :
                          member.status === "on_leave" ? "bg-blue-500" :
                          member.status === "absent" ? "bg-red-500" : "bg-gray-300"
                        )} />
                        <p className="text-sm flex-1 truncate">{member.employeeName || "—"}</p>
                        {member.lateMinutes > 0 && (
                          <Badge className="text-[10px] bg-status-warning-surface text-status-warning-foreground">{member.lateMinutes}د تأخر</Badge>
                        )}
                        {member.status === "on_leave" && (
                          <Badge className="text-[10px] bg-status-info-surface text-status-info-foreground">إجازة</Badge>
                        )}
                      </div>
                    ))}
                    {team.length > 10 && <p className="text-xs text-muted-foreground text-center pt-1">+{team.length - 10} آخرون</p>}
                  </div>
                )}
                {team.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-status-info" />
              مهام الفريق
            </CardTitle>
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "منجزة", value: tasksDone, color: "bg-status-success-surface text-status-success-foreground" },
                { label: "جارية", value: tasksInProg, color: "bg-status-info-surface text-status-info-foreground" },
                { label: "الكل", value: tasks.length, color: "bg-surface-subtle text-status-neutral-foreground" },
              ].map(c => (
                <div key={c.label} className={cn("p-2 rounded-lg text-center", c.color)}>
                  <p className="text-lg font-bold">{c.value}</p>
                  <p className="text-[10px] mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
            {tasks.length > 0 && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>نسبة الإنجاز</span>
                    <span className={cn("font-medium", tasksPct >= 80 ? "text-emerald-600" : tasksPct >= 50 ? "text-status-warning-foreground" : "text-status-error-foreground")}>{tasksPct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-subtle overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", tasksPct >= 80 ? "bg-emerald-500" : tasksPct >= 50 ? "bg-amber-400" : "bg-red-500")}
                      style={{ width: `${tasksPct}%` }} />
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                  {tasks.filter((t: any) => t.status !== "completed").slice(0, 6).map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-subtle">
                      <div className={cn("w-2 h-2 rounded-full shrink-0",
                        t.status === "in_progress" ? "bg-blue-500" : "bg-yellow-500"
                      )} />
                      <p className="text-xs flex-1 truncate">{t.title}</p>
                      {t.assignedTo && <span className="text-[10px] text-muted-foreground">{t.assignedToName || t.assignedTo}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد مهام</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            جميع الطلبات المعلقة
            <Badge className="text-xs bg-orange-100 text-orange-700">{allPending.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={pendingColumns}
            data={allPending}
            rowKey={(item) => `${item._type}-${item.id}`}
            isLoading={actionLoading}
            emptyMessage="لا توجد طلبات معلقة"
            emptyIcon={<CheckCircle className="w-10 h-10 text-green-300" />}
            searchPlaceholder={null}
            noToolbar
            pageSize={20}
            rowClassName={(item) => {
              const isUrgent = item.priority === "high" || item.priority === "urgent";
              return isUrgent ? "bg-status-error-surface" : undefined;
            }}
          />
        </CardContent>
      </Card>

      <DelegationBoard delegationsData={delegationsData} />

      <PromptDialog
        open={rejectTarget !== null}
        title="سبب الرفض"
        description="يرجى إدخال سبب رفض هذا الطلب — سيظهر للمتقدم في إشعار الرد."
        placeholder="اكتب سبب الرفض هنا..."
        confirmLabel="رفض"
        onSubmit={handleRejectSubmit}
        onClose={() => setRejectTarget(null)}
      />
    </PageShell>
  );
}

function DelegationBoard({ delegationsData }: { delegationsData: any }) {
  const delegations: any[] = delegationsData?.data || [];
  const activeDelegations = delegations.filter((d: any) => d.status === "active" || !d.endDate || new Date(d.endDate) >= new Date());
  const pastDelegations = delegations.filter((d: any) => d.status !== "active" && d.endDate && new Date(d.endDate) < new Date());

  if (!delegationsData && delegations.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UserCog className="w-5 h-5 text-indigo-500" />
          لوحة التفويض
          {activeDelegations.length > 0 && (
            <Badge className="text-xs bg-indigo-100 text-indigo-700">{activeDelegations.length} نشط</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {delegations.length === 0 ? (
          <div className="text-center py-6">
            <UserCog className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد تفويضات مسجلة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeDelegations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-indigo-600 mb-2">تفويضات نشطة</p>
                <div className="space-y-2">
                  {activeDelegations.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                        {(d.delegateName || d.delegateeName || "م").charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-status-neutral-foreground">
                          <span className="text-indigo-700">{d.delegatorName || d.fromName || "—"}</span>
                          {" → "}
                          <span className="text-status-neutral-foreground">{d.delegateName || d.delegateeName || d.toName || "—"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.scope || d.description || d.reason || "تفويض عام"}
                          {d.startDate && <> · من {formatDateAr(d.startDate)}</>}
                          {d.endDate && <> إلى {formatDateAr(d.endDate)}</>}
                        </p>
                      </div>
                      <Badge className="text-[10px] bg-indigo-100 text-indigo-700 shrink-0">نشط</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pastDelegations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">تفويضات منتهية</p>
                <div className="space-y-1.5">
                  {pastDelegations.slice(0, 3).map((d: any) => (
                    <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-subtle text-sm">
                      <span className="text-muted-foreground">{d.delegatorName || d.fromName || "—"}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground">{d.delegateName || d.delegateeName || d.toName || "—"}</span>
                      <Badge className="text-[10px] ms-auto bg-surface-subtle text-muted-foreground">منتهي</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
