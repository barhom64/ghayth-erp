import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UserCheck, Clock, AlertTriangle, ListChecks, CheckCircle } from "lucide-react";

/**
 * /hr/activation-board — لوحة «قيد التفعيل» (HR-REV-3 §5).
 *
 * عرض تشغيلي واحد لكل موظف أُنشئ بالتفعيل السريع (status=inactive) وما زال
 * يكمل خطته الموزّعة: ما الناقص، أي جهة مالكة، منذ متى، وهل تجاوز SLA. تُبنى
 * بالكامل من البيانات الموجودة (الموظفون + onboarding_tasks بحقول الملكية من
 * الشريحتين ١/٢) — لا endpoint جديد ولا migration.
 */

const TASK_OWNER_LABELS: Record<string, { label: string; color: string }> = {
  it:         { label: "تقنية المعلومات", color: "bg-status-info-surface text-status-info-foreground" },
  documents:  { label: "الوثائق",          color: "bg-purple-100 text-purple-700" },
  department: { label: "مدير القسم",        color: "bg-status-warning-surface text-status-warning-foreground" },
  payroll:    { label: "الرواتب",           color: "bg-emerald-100 text-emerald-700" },
  hr:         { label: "الموارد البشرية",   color: "bg-status-neutral-surface text-status-neutral-foreground" },
  fleet:      { label: "الأسطول",           color: "bg-orange-100 text-orange-700" },
  warehouse:  { label: "المستودع",          color: "bg-amber-100 text-amber-700" },
  access:     { label: "الصلاحيات",         color: "bg-rose-100 text-rose-700" },
};

function ownerLabel(role?: string | null) {
  return (role && TASK_OWNER_LABELS[role]) || null;
}

function ageInDays(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function ActivationBoardPage() {
  const { data: empData, isLoading: empLoading, isError: empError } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const { data: tasksData, isLoading: tasksLoading, isError: tasksError } = useApiQuery<any>(["employees-onboarding-tasks"], "/employees/onboarding-tasks");

  // PATCH /employees/:id { status: "active" } — flip a quick-activated employee
  // to active once their plan is done. The server enforces the same ready-gate
  // (every mandatory onboarding task complete) so this is safe to expose here.
  const activateMut = useApiMutation<unknown, { id: number; status: "active" }>(
    (b) => `/employees/${b.id}`,
    "PATCH",
    [["employees"], ["employees-onboarding-tasks"]],
    { successMessage: "تم تفعيل الموظف" },
  );

  if (empLoading || tasksLoading) return <LoadingSpinner />;
  if (empError || tasksError) return <ErrorState />;

  const employees: any[] = empData?.data ?? [];
  const allTasks: any[] = tasksData?.data ?? tasksData?.tasks ?? [];

  // Pending-activation = the quick-activate "inactive" gate (and the legacy
  // "onboarding"/"pending" markers), i.e. employees not yet flipped to active.
  const pending = employees.filter((e: any) => ["inactive", "pending", "onboarding"].includes(e.status));

  const tasksByEmp = new Map<number, any[]>();
  for (const t of allTasks) {
    const arr = tasksByEmp.get(t.employeeId) ?? [];
    arr.push(t);
    tasksByEmp.set(t.employeeId, arr);
  }

  const rows = pending
    .map((e: any) => {
      const tasks = tasksByEmp.get(e.id) ?? [];
      const isOpen = (t: any) => t.status !== "completed" && t.status !== "skipped";
      const open = tasks.filter(isOpen);
      const done = tasks.filter((t: any) => t.status === "completed");
      const mandatoryRemaining = open.filter((t: any) => t.mandatory !== false).length;
      const overdue = open.filter((t: any) => t.dueDate && new Date(t.dueDate).getTime() < Date.now()).length;
      const owners = Array.from(new Set(open.map((t: any) => t.ownerRole).filter(Boolean)));
      const oldestOpen = open
        .map((t: any) => t.createdAt)
        .filter(Boolean)
        .sort()[0];
      return { e, tasks, open, done, total: tasks.length, mandatoryRemaining, overdue, owners, age: ageInDays(oldestOpen) };
    })
    .sort((a, b) => b.overdue - a.overdue || b.mandatoryRemaining - a.mandatoryRemaining);

  const kpis = [
    { label: "قيد التفعيل", value: pending.length, icon: UserCheck, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "بنود إلزامية ناقصة", value: rows.reduce((s, r) => s + r.mandatoryRemaining, 0), icon: ListChecks, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "بنود متأخّرة (SLA)", value: rows.reduce((s, r) => s + r.overdue, 0), icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "جاهزون للمراجعة", value: rows.filter((r) => r.total > 0 && r.mandatoryRemaining === 0).length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
  ];

  return (
    <PageShell
      title="لوحة قيد التفعيل"
      subtitle="متابعة خطة تفعيل كل موظف جديد: الناقص، الجهة المالكة، والعمر مقابل SLA"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "لوحة قيد التفعيل" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <div className="space-y-3 mt-4">
        {rows.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">لا يوجد موظفون قيد التفعيل حاليًّا</CardContent></Card>
        )}
        {rows.map(({ e, open, done, total, mandatoryRemaining, overdue, owners, age }) => {
          // Authoritative: the server advances activationStatus to
          // ready_for_hr_review once all mandatory tasks are done (HR-REV-3 §1);
          // fall back to the client computation for legacy rows without it.
          const ready = e.activationStatus === "ready_for_hr_review" || (total > 0 && mandatoryRemaining === 0);
          const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;
          return (
            <Card key={e.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <AvatarInitial name={e.name} color={ready ? "green" : "orange"} />
                    <div className="min-w-0">
                      <Link href={`/employees/${e.id}`} className="font-semibold hover:text-status-info-foreground">{e.name}</Link>
                      <div className="text-xs text-muted-foreground">
                        {e.jobTitle || "—"}{e.hireDate ? ` · مباشرة ${formatDateAr(e.hireDate)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ready ? (
                      <>
                        <Badge className="bg-status-success-surface text-status-success-foreground">جاهز للمراجعة</Badge>
                        <GuardedButton
                          perm="hr:update"
                          size="sm"
                          className="h-7 gap-1"
                          disabled={activateMut.isPending}
                          onClick={() => activateMut.mutate({ id: e.id, status: "active" })}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          تفعيل الموظف
                        </GuardedButton>
                      </>
                    ) : (
                      <Badge className="bg-status-warning-surface text-status-warning-foreground">{mandatoryRemaining} بند إلزامي ناقص</Badge>
                    )}
                    {overdue > 0 && (
                      <Badge className="bg-status-error-surface text-status-error-foreground">{overdue} متأخّر</Badge>
                    )}
                    {age !== null && (
                      <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{age} يوم</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>التقدّم: {done.length}/{total}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${ready ? "bg-status-success" : "bg-status-info"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {owners.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">بانتظار:</span>
                    {owners.map((role: string) => {
                      const o = ownerLabel(role);
                      return <Badge key={role} className={`text-[10px] ${o?.color ?? ""}`}>{o?.label ?? role}</Badge>;
                    })}
                  </div>
                )}

                {open.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {open.slice(0, 8).map((t: any) => {
                      const o = ownerLabel(t.ownerRole);
                      const isOverdue = t.dueDate && new Date(t.dueDate).getTime() < Date.now();
                      return (
                        <div key={t.id} className="flex items-center gap-2 text-xs border rounded px-2 py-1.5" title={t.reason || undefined}>
                          <span className="truncate flex-1">{t.title}</span>
                          {o && <Badge className={`text-[10px] ${o.color}`}>{o.label}</Badge>}
                          {t.mandatory === false && <Badge variant="outline" className="text-[10px] text-muted-foreground">اختياري</Badge>}
                          {isOverdue && <Badge variant="outline" className="text-[10px] border-status-error-surface text-status-error-foreground">متأخّر</Badge>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
