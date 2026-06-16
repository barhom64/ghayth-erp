import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  UserPlus, CheckCircle, Clock, ClipboardCheck, ListChecks, Pencil, Plus, Check,
} from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "in_review",  label: "قيد المراجعة" },
  { value: "probation",  label: "فترة التجربة" },
  { value: "completed",  label: "مكتمل"        },
];

// HR-REV-3 (#2222) — الجهة المالكة لكل مهمة تأهيل (من يُكملها). يُولّدها الخادم
// مع كل تفعيل سريع؛ تُعرض هنا ليرى HR توزيع المسؤولية بدل تكدّسها عليه.
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

export default function OnboardingReviewPage() {
  const [filters, setFilters] = useFilters();
  const { toast } = useToast();
  const { data, isLoading: empLoading, isError: empError } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const { data: stepsData, isLoading: stepsLoading, isError: stepsError, refetch: refetchSteps } = useApiQuery<any>(["onboarding-steps"], "/hr/onboarding-steps");
  // GET /employees/onboarding-tasks — list of task instances across all
  // employees (e.g. "تسليم بطاقة دخول" for Ali, status: pending). Used
  // by HR to monitor outstanding setup tasks for new hires.
  const tasksQ = useApiQuery<any>(["employees-onboarding-tasks"], "/employees/onboarding-tasks");
  const onboardingTasks: any[] = tasksQ.data?.data ?? tasksQ.data?.tasks ?? [];

  // PATCH /employees/onboarding-tasks/:id — mark a task complete (or
  // skipped) so the HR dashboard reflects real progress.
  const completeTaskMut = useApiMutation<unknown, { id: number; status: string; completedAt?: string }>(
    (b) => `/employees/onboarding-tasks/${b.id}`,
    "PATCH",
    [["employees-onboarding-tasks"]],
    { successMessage: "تم تحديث المهمة" },
  );

  // PUT /hr/onboarding-steps — replace the company-wide template of
  // checklist items presented to every new hire.
  const updateStepsMut = useApiMutation<unknown, { steps: string[] }>(
    "/hr/onboarding-steps",
    "PUT",
    [["onboarding-steps"]],
    { successMessage: "تم تحديث خطوات التأهيل" },
  );

  // Steps editor dialog
  const [stepsEditOpen, setStepsEditOpen] = useState(false);
  const [editingSteps, setEditingSteps] = useState<string[]>([]);
  const openStepsEditor = (current: string[]) => {
    setEditingSteps([...current]);
    setStepsEditOpen(true);
  };
  const submitSteps = () => {
    const cleaned = editingSteps.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast({ variant: "destructive", title: "أضِف خطوة واحدة على الأقل" });
      return;
    }
    updateStepsMut.mutate(
      { steps: cleaned },
      { onSuccess: () => { setStepsEditOpen(false); refetchSteps(); } },
    );
  };

  const employees = data?.data || [];
  const steps: string[] = stepsData?.data || ["تسليم أجهزة تقنية المعلومات", "توقيع عقد العمل", "تعريف المدير", "دورة التعريف"];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recentHires = employees.filter((e: any) => {
    const hireDate = e.hireDate ? new Date(e.hireDate) : null;
    return hireDate && hireDate >= thirtyDaysAgo;
  });

  const allActive = employees.filter((e: any) => e.status === "active");

  const inProbation = employees.filter((e: any) => {
    if (e.status !== "active") return false;
    const hireDate = e.hireDate ? new Date(e.hireDate) : null;
    return hireDate ? hireDate >= ninetyDaysAgo : false;
  });

  const pendingOnboarding = employees.filter((e: any) => e.status === "pending" || e.status === "onboarding");

  const getOnboardingStatus = (emp: any) => {
    if (emp.status === "pending" || emp.status === "onboarding") return "in_review";
    const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
    if (hireDate && hireDate >= ninetyDaysAgo) return "probation";
    return "completed";
  };

  const displayList = [...pendingOnboarding, ...recentHires, ...inProbation.filter((e: any) => !recentHires.some((r: any) => r.id === e.id))]
    .filter((e, i, arr) => arr.findIndex((x: any) => x.id === e.id) === i)
    .map((e: any) => ({ ...e, _onboardingStatus: getOnboardingStatus(e) }))
    .slice(0, 50);

  const filtered = applyFilters(displayList, filters, {
    searchFields: ["name", "empNumber", "jobTitle"],
    statusField: "_onboardingStatus",
    dateField: "hireDate",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (empLoading || stepsLoading) return <LoadingSpinner />;

  if (empError || stepsError) return <ErrorState />;


  const pendingTasks = onboardingTasks.filter((t: any) => t.status !== "completed" && t.status !== "skipped");

  const kpis = [
    { label: "موظفين جدد (آخر 30 يوم)", value: recentHires.length, icon: UserPlus, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "مكتمل التعيين", value: Math.max(0, allActive.length - inProbation.length - pendingOnboarding.length), icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "قيد المراجعة", value: pendingOnboarding.length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "مهام تأهيل معلّقة", value: pendingTasks.length, icon: ListChecks, color: "text-purple-600 bg-purple-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.name} color="blue" />
          <span className="font-medium text-sm">{v.name}</span>
        </div>
      ),
    },
    {
      key: "empNumber",
      header: "الرقم الوظيفي",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-mono text-muted-foreground">{v.empNumber || "-"}</span>
      ),
    },
    {
      key: "jobTitle",
      header: "المنصب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.jobTitle || "-"}</span>
      ),
    },
    {
      key: "hireDate",
      header: "تاريخ التعيين",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {v.hireDate ? formatDateAr(v.hireDate) : "-"}
        </span>
      ),
    },
    {
      key: "branchName",
      header: "الفرع",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.branchName || "-"}</span>
      ),
    },
    {
      key: "_onboardingStatus",
      header: "حالة التأهيل",
      sortable: true,
      render: (v) => <PageStatusBadge status={v._onboardingStatus} />,
    },
  ];

  return (
    <PageShell
      title="مراجعة التعيين والتأهيل"
      subtitle="متابعة إجراءات التعيين وتأهيل الموظفين الجدد"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <PrintButton
          entityType="report_hr_onboarding_review"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "مراجعة التعيين والتأهيل", total: printRows.length },
            items: printRows.map((e: any) => ({
              "الموظف": e.name || "—",
              "المنصب": e.jobTitle || "—",
              "تاريخ التعيين": e.startDate || "—",
              "نسبة الإنجاز %": e.onboardingProgress ?? "—",
              "الحالة": STATUS_OPTIONS.find((s) => s.value === e.onboardingStatus)?.label || e.onboardingStatus || "—",
            })),
          })}
        />
      }
    >
      <HrTabsNav />
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Onboarding steps */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">خطوات التأهيل</CardTitle>
          <GuardedButton perm="hr:update" variant="outline" size="sm" onClick={() => openStepsEditor(steps)}>
            <Pencil className="h-3 w-3 me-1" /> تعديل
          </GuardedButton>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {steps.map((step: string, i: number) => (
              <div key={i} className="p-3 bg-surface-subtle rounded-lg text-center">
                <div className="w-8 h-8 rounded-full bg-status-info-surface text-status-info-foreground flex items-center justify-center mx-auto mb-2 text-sm font-bold">{i + 1}</div>
                <p className="text-sm font-medium">{step}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Onboarding tasks across employees */}
      {onboardingTasks.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              مهام التأهيل ({pendingTasks.length} معلّقة من {onboardingTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingTasks.slice(0, 10).map((t: any) => {
                const owner = t.ownerRole ? TASK_OWNER_LABELS[t.ownerRole] : null;
                const overdue = t.dueDate && new Date(t.dueDate).getTime() < Date.now();
                return (
                <div key={t.id} className="flex items-center justify-between text-xs border rounded px-2 py-2" title={t.reason || undefined}>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">#{t.id}</Badge>
                    <span className="font-medium">{t.title ?? t.taskName ?? t.description ?? "—"}</span>
                    {owner && (
                      <Badge className={`text-[10px] ${owner.color}`}>{owner.label}</Badge>
                    )}
                    {t.mandatory === false && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">اختياري</Badge>
                    )}
                    {t.employeeName && (
                      <span className="text-muted-foreground">— {t.employeeName}</span>
                    )}
                    {t.dueDate && (
                      <Badge variant="outline" className={`text-[10px] ${overdue ? "border-status-error-surface text-status-error-foreground" : ""}`}>
                        {overdue ? "متأخّر · " : ""}{formatDateAr(t.dueDate)}
                      </Badge>
                    )}
                  </div>
                  <GuardedButton
                    perm="hr:update"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => completeTaskMut.mutate({ id: t.id, status: "completed", completedAt: new Date().toISOString() })}
                    disabled={completeTaskMut.isPending}
                  >
                    <Check className="h-3 w-3 me-1" /> إكمال
                  </GuardedButton>
                </div>
                );
              })}
              {pendingTasks.length > 10 && (
                <p className="text-[10px] text-muted-foreground text-center">+ {pendingTasks.length - 10} مهام إضافية</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الرقم الوظيفي...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "name", label: "الاسم" },
              { key: "empNumber", label: "الرقم الوظيفي" },
              { key: "jobTitle", label: "المسمى الوظيفي" },
              { key: "branchName", label: "الفرع" },
              { key: "hireDate", label: "تاريخ التعيين" },
              { key: "completedSteps", label: "خطوات مكتملة" },
              { key: "totalSteps", label: "إجمالي الخطوات" },
              { key: "status", label: "الحالة" },
            ],
            "مراجعة-الإعداد-الوظيفي",
          )
        }
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا يوجد موظفين في مرحلة التأهيل"
        pageSize={20}
      />

      <Dialog open={stepsEditOpen} onOpenChange={setStepsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل خطوات التأهيل</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {editingSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                <Input
                  value={s}
                  onChange={(e) => {
                    const next = [...editingSteps];
                    next[i] = e.target.value;
                    setEditingSteps(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingSteps(editingSteps.filter((_, j) => j !== i))}
                >
                  حذف
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingSteps([...editingSteps, ""])}
            >
              <Plus className="h-3 w-3 me-1" /> خطوة جديدة
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStepsEditOpen(false)}>إلغاء</Button>
            <GuardedButton perm="hr:update" onClick={submitSteps} disabled={updateStepsMut.isPending}>
              حفظ
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
