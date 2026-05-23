import { useState } from "react";
import { z } from "zod";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormGrid,
} from "@workspace/ui-core";

// Schemas for the three create sub-forms below. The edit-project
// form (name / status / budget) is intentionally left on useState
// for now — it has its own server-state hydration via startEdit()
// and is a separate migration concern.
const phaseSchema = z.object({
  name: z.string().trim().min(1, "اسم المرحلة مطلوب"),
  startDate: z.string(),
  endDate: z.string(),
});
type PhaseForm = z.infer<typeof phaseSchema>;

const taskSchema = z.object({
  title: z.string().trim().min(1, "عنوان المهمة مطلوب"),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string(),
});
type TaskForm = z.infer<typeof taskSchema>;

const costSchema = z.object({
  description: z.string().trim().min(1, "الوصف مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجبًا"),
  category: z.enum(["labor", "materials", "equipment", "subcontractor", "overhead", "other"]),
  costDate: z.string(),
});
type CostForm = z.infer<typeof costSchema>;

// Edit-project form. Mounts with defaults seeded from the loaded
// project row; the FormShell key={project.id} resets state if the
// operator navigates between projects without unmounting the page.
const editProjectSchema = z.object({
  name: z.string().trim().min(1, "اسم المشروع مطلوب"),
  status: z.string().min(1),
  budget: z.coerce.number().nonnegative(),
});
type EditProjectForm = z.infer<typeof editProjectSchema>;
import {
  ArrowRight, FolderKanban, Calendar, DollarSign, ListTodo,
  CheckCircle2, Pencil, Trash2, X, Check, AlertTriangle,
  BookOpen, FileText, Clock, Plus, Flag,
  BarChart2, ShieldAlert, Users2, Mail, Lock,
} from "lucide-react";
import { formatDateAr, getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { EntityComments } from "@workspace/entity-kit";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { cn } from "@/lib/utils";
import { DetailPageLayout } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { PageStatusBadge } from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { DatePicker } from "@/components/ui/date-picker";

const PROJECT_TABS = [
  { key: "overview", label: "نظرة عامة", icon: FolderKanban },
  { key: "tasks", label: "المهام", icon: ListTodo },
  { key: "team", label: "الفريق", icon: Users2 },
  { key: "costs", label: "التكاليف", icon: DollarSign },
  { key: "finance", label: "المالية", icon: BookOpen },
  { key: "letters", label: "المراسلات", icon: Mail },
  { key: "documents", label: "المستندات", icon: FileText },
  { key: "timeline", label: "السجل الزمني", icon: Clock },
] as const;

type ProjectTabKey = (typeof PROJECT_TABS)[number]["key"];

const statusLabels: Record<string, string> = { completed: "مكتمل", done: "مكتمل", active: "نشط", in_progress: "قيد التنفيذ", planning: "تخطيط", planned: "مخطط", draft: "مسودة", on_hold: "متوقف", cancelled: "ملغى", blocked: "محظور", pending: "معلق", todo: "للتنفيذ" };
const priorityColors: Record<string, string> = { high: "bg-status-error-surface text-status-error-foreground", critical: "bg-status-error-surface text-status-error-foreground", medium: "bg-status-warning-surface text-status-warning-foreground", low: "bg-status-success-surface text-status-success-foreground" };
const priorityLabels: Record<string, string> = { high: "عالية", critical: "حرجة", medium: "متوسطة", low: "منخفضة" };
const taskStatusColors: Record<string, string> = { completed: "bg-status-success-surface text-status-success-foreground", done: "bg-status-success-surface text-status-success-foreground", active: "bg-status-info-surface text-status-info-foreground", in_progress: "bg-status-info-surface text-status-info-foreground", planning: "bg-purple-100 text-purple-700", pending: "bg-surface-subtle text-status-neutral-foreground", todo: "bg-surface-subtle text-status-neutral-foreground", on_hold: "bg-status-warning-surface text-status-warning-foreground" };
const taskStatusLabels: Record<string, string> = { todo: "للتنفيذ", in_progress: "جاري", done: "مكتمل", ...statusLabels };

const BREADCRUMBS = [
  { href: "/projects", label: "المشاريع" },
];

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectTabKey>("overview");
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);
  const [closingProject, setClosingProject] = useState(false);
  const { hideTabs: registryHideTabs } = useRegistryTabs("project", id ?? 0);

  const { data: project, isLoading, isError, error } = useApiQuery<any>(["project-detail", id || ""], `/projects/${id}`, !!id);
  const { data: risksResp } = useApiQuery<any>(["project-risks", id || ""], `/projects/${id}/risks`, !!id);
  const { data: milestonesResp } = useApiQuery<any>(["project-milestones", id || ""], `/projects/${id}/milestones`, !!id);
  const { data: resourcesResp } = useApiQuery<any>(["project-resources", id || ""], `/projects/${id}/resources`, !!id);
  const { data: costsResp, refetch: refetchCosts } = useApiQuery<any>(["project-costs", id || ""], `/projects/${id}/costs`, !!id);
  const { data: lettersResp } = useApiQuery<any>(["project-letters", id || ""], `/projects/${id}/letters`, !!id);
  const risks: any[] = risksResp?.data || risksResp || [];
  const milestones: any[] = milestonesResp?.data || milestonesResp || [];
  const openRisks = risks.filter((r: any) => r.status === "open" || r.status === "realized");
  const criticalRisks = openRisks.filter((r: any) => r.riskLevel === "critical" || r.riskLevel === "high");
  const upcomingMilestones = milestones.filter((m: any) => m.status !== "completed" && m.status !== "cancelled");
  const is404 = isError && (error?.message?.includes("غير موجود") || error?.message?.includes("404"));

  const addPhaseMut = useApiMutation<any, { name: string; startDate?: string; endDate?: string }>(
    () => `/projects/${id}/phases`,
    "POST",
    [["project-detail", id || ""]],
    { successMessage: "تم إضافة المرحلة", onSuccess: () => setShowPhaseForm(false) }
  );

  const addTaskMut = useApiMutation<any, { title: string; priority: string; dueDate?: string }>(
    () => `/projects/${id}/tasks`,
    "POST",
    [["project-detail", id || ""]],
    { successMessage: "تم إضافة المهمة", onSuccess: () => setShowTaskForm(false) }
  );

  const statusTone = (s: string) =>
    s === "completed" || s === "done" ? "success" as const :
    s === "active" || s === "in_progress" ? "info" as const :
    s === "on_hold" ? "warning" as const :
    s === "planning" || s === "pending" ? "muted" as const : "default" as const;

  const phases = project.phases || [];
  const tasks = project.tasks || [];
  const budget = Number(project.budget) || 0;
  const spent = Number(project.spentAmount) || 0;
  const progress = project.progressPct ?? (project.progress || 0);
  const resources: any[] = resourcesResp?.data || resourcesResp || [];
  const costs: any[] = costsResp?.data || costsResp || [];
  const costsTotalActual = costsResp?.totalActual ?? 0;
  const costsVariance = costsResp?.variance ?? 0;
  const letters: any[] = lettersResp?.data || lettersResp || [];

  const startEdit = () => setEditing(true);

  const saveEdit = async (values: EditProjectForm) => {
    try {
      await apiFetch(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: values.name, status: values.status, budget: values.budget }),
      });
      toast({ title: "تم تحديث المشروع" });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/projects/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف المشروع" });
      navigate("/projects");
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const completePhase = async (phaseId: number) => {
    try {
      await apiFetch(`/projects/${id}/phases/${phaseId}/complete`, { method: "PATCH" });
      toast({ title: "تم إكمال المرحلة" });
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const updateTaskStatus = async (taskId: number, status: string) => {
    try {
      await apiFetch(`/projects/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast({ title: "تم تحديث المهمة" });
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const addCost = async (values: CostForm) => {
    try {
      await apiFetch(`/projects/${id}/costs`, {
        method: "POST",
        body: JSON.stringify({
          description: values.description,
          amount: values.amount,
          category: values.category,
          costDate: values.costDate || undefined,
        }),
      });
      toast({ title: "تم إضافة التكلفة" });
      setShowCostForm(false);
      refetchCosts();
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const closeProject = async () => {
    try {
      await apiFetch(`/projects/${id}/close`, { method: "POST", body: JSON.stringify({ reason: "إقفال المشروع" }) });
      toast({ title: "تم إقفال المشروع وتحويل التكاليف" });
      setClosingProject(false);
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const actions = project ? (
    <div className="flex items-center gap-2 flex-wrap">
      {project.isSlipping && (
        <Badge className="bg-status-error-surface text-status-error-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> متأخر
        </Badge>
      )}
      {criticalRisks.length > 0 && (
        <Badge className="bg-orange-100 text-orange-700 flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" /> {criticalRisks.length} مخاطر حرجة
        </Badge>
      )}
      <Link href={`/projects/gantt?projectId=${id}`}>
        <Button variant="outline" size="sm"><BarChart2 className="h-4 w-4 me-1" />غانت</Button>
      </Link>
      <Link href={`/projects/risks?projectId=${id}`}>
        <Button variant="outline" size="sm"><ShieldAlert className="h-4 w-4 me-1" />المخاطر</Button>
      </Link>
      <Link href="/calendar">
        <Button variant="outline" size="sm"><Calendar className="h-4 w-4 me-1" />التقويم</Button>
      </Link>
      {project.status !== "completed" && !closingProject && (
        <Button variant="outline" size="sm" className="text-emerald-600" onClick={() => setClosingProject(true)}>
          <Lock className="h-4 w-4 me-1" />إقفال المشروع
        </Button>
      )}
      {closingProject && (
        <div className="flex gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={closeProject}>تأكيد الإقفال</Button>
          <Button variant="outline" size="sm" onClick={() => setClosingProject(false)}>إلغاء</Button>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 me-1" />تعديل</Button>
      {deleting ? (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
          <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="text-status-error-foreground" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</Button>
      )}
    </div>
  ) : undefined;

  const overview = project ? (
    <div className="space-y-6">
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">تعديل المشروع</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              key={project.id}
              schema={editProjectSchema}
              defaultValues={{
                name: project.name || "",
                status: project.status || "planning",
                budget: budget,
              }}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4 me-1" />إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await saveEdit(values);
              }}
            >
              <FormGrid cols={3}>
                <FormTextField name="name" label="اسم المشروع" required />
                <FormSelectField
                  name="status"
                  label="الحالة"
                  options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
                />
                <FormNumberField name="budget" label={`الميزانية (${getCurrencySymbol()})`} />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <KpiGrid items={[
        { label: "نسبة الإنجاز", value: `${progress}%`, icon: FolderKanban, color: "text-status-info-foreground bg-status-info-surface" },
        { label: `الميزانية (${getCurrencySymbol()})`, value: budget > 0 ? formatCurrency(budget) : "0", icon: DollarSign, color: "text-status-success-foreground bg-status-success-surface" },
        { label: `المنصرف (${getCurrencySymbol()})`, value: spent > 0 ? formatCurrency(spent) : "0", icon: DollarSign, color: "text-orange-600 bg-orange-50" },
        { label: "المهام", value: tasks.length, icon: ListTodo, color: "text-purple-600 bg-purple-50" },
      ]} />

      <div className="flex gap-1 border-b overflow-x-auto">
        {PROJECT_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as ProjectTabKey)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-[1px] whitespace-nowrap transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-muted-foreground" /> المعلومات الأساسية</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {project.description && (
                  <div className="grid grid-cols-3 py-2 border-b"><span className="text-muted-foreground">الوصف</span><span className="col-span-2">{project.description}</span></div>
                )}
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-muted-foreground">مدير المشروع</span><span className="col-span-2 font-medium">{project.managerName || "-"}</span></div>
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-muted-foreground">تاريخ البدء</span><span className="col-span-2">{project.startDate ? formatDateAr(project.startDate) : "-"}</span></div>
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-muted-foreground">تاريخ الانتهاء</span><span className="col-span-2">{project.endDate ? formatDateAr(project.endDate) : "-"}</span></div>
                <div className="grid grid-cols-3 py-2 border-b"><span className="text-muted-foreground">العميل</span><span className="col-span-2">{project.clientName || "-"}</span></div>
                {project.criticalPathHours > 0 && (
                  <div className="grid grid-cols-3 py-2 border-b"><span className="text-muted-foreground">المسار الحرج</span><span className="col-span-2">{project.criticalPathHours} ساعة</span></div>
                )}
                {project.costVariance !== undefined && budget > 0 && (
                  <div className="grid grid-cols-3 py-2"><span className="text-muted-foreground">انحراف التكلفة</span><span className={`col-span-2 font-bold ${Number(project.costVariance) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(Number(project.costVariance))}</span></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-muted-foreground" /> المراحل ({phases.length})</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setShowPhaseForm(!showPhaseForm)}>
                    <Plus className="h-3 w-3 me-1" /> إضافة مرحلة
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showPhaseForm && (
                  <div className="p-3 rounded-lg border-2 border-primary/20">
                    <FormShell
                      schema={phaseSchema}
                      defaultValues={{ name: "", startDate: "", endDate: "" }}
                      submitLabel="حفظ"
                      secondaryActions={
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowPhaseForm(false)}>
                          إلغاء
                        </Button>
                      }
                      onSubmit={async (values) => {
                        await addPhaseMut.mutateAsync({
                          name: values.name,
                          startDate: values.startDate || undefined,
                          endDate: values.endDate || undefined,
                        });
                      }}
                    >
                      <FormTextField name="name" label="اسم المرحلة" required placeholder="اسم المرحلة" />
                      <FormGrid cols={2}>
                        <FormDateField name="startDate" label="تاريخ البداية" />
                        <FormDateField name="endDate" label="تاريخ النهاية" />
                      </FormGrid>
                    </FormShell>
                  </div>
                )}
                {phases.length === 0 && !showPhaseForm && <p className="text-center text-muted-foreground py-4">لا توجد مراحل</p>}
                {phases.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.startDate ? formatDateAr(p.startDate) : ""} {p.endDate ? `- ${formatDateAr(p.endDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <PageStatusBadge status={p.status || "pending"} domain="project" />
                      {p.status !== "completed" && (
                        <Button size="sm" variant="outline" onClick={() => completePhase(p.id)}>
                          <CheckCircle2 className="h-3 w-3 me-1" />إكمال
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><Flag className="w-4 h-4 text-orange-500" /> المعالم ({milestones.length})</CardTitle>
                  <Link href={`/projects/gantt?projectId=${id}`}><Button variant="ghost" size="sm" className="text-xs">غانت</Button></Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingMilestones.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">لا توجد معالم قادمة</p>}
                {upcomingMilestones.slice(0, 5).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Flag className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium">{m.title || m.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{m.targetDate ? formatDateAr(m.targetDate) : m.dueDate ? formatDateAr(m.dueDate) : ""}</span>
                      <PageStatusBadge status={m.status || "pending"} domain="project" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className={openRisks.length > 0 ? "border-orange-200" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-orange-500" /> المخاطر ({openRisks.length})
                    {criticalRisks.length > 0 && (
                      <Badge className="bg-status-error-surface text-status-error-foreground text-[10px]">{criticalRisks.length} حرج</Badge>
                    )}
                  </CardTitle>
                  <Link href={`/projects/risks?projectId=${id}`}><Button variant="ghost" size="sm" className="text-xs">إدارة</Button></Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {openRisks.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">لا توجد مخاطر مفتوحة</p>}
                {openRisks.slice(0, 5).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm font-medium truncate flex-1">{r.title}</span>
                    <Badge className={
                      r.riskLevel === "critical" ? "bg-status-error-surface text-status-error-foreground" :
                      r.riskLevel === "high" ? "bg-orange-100 text-orange-700" :
                      r.riskLevel === "medium" ? "bg-status-warning-surface text-status-warning-foreground" :
                      "bg-status-success-surface text-status-success-foreground"
                    }>{r.riskLevel === "critical" ? "حرج" : r.riskLevel === "high" ? "عالٍ" : r.riskLevel === "medium" ? "متوسط" : "منخفض"}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {id && <EntityComments entityType="project" entityId={id} />}
        </>
      )}

      {activeTab === "tasks" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><ListTodo className="w-5 h-5 text-muted-foreground" /> المهام ({tasks.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowTaskForm(!showTaskForm)}>
                <Plus className="h-3 w-3 me-1" /> إضافة مهمة
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {showTaskForm && (
              <div className="p-4 m-4 rounded-lg border-2 border-primary/20">
                <FormShell
                  schema={taskSchema}
                  defaultValues={{ title: "", priority: "medium" as const, dueDate: "" }}
                  submitLabel="حفظ"
                  secondaryActions={
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowTaskForm(false)}>
                      إلغاء
                    </Button>
                  }
                  onSubmit={async (values) => {
                    await addTaskMut.mutateAsync({
                      title: values.title,
                      priority: values.priority,
                      dueDate: values.dueDate || undefined,
                    });
                  }}
                >
                  <FormTextField name="title" label="عنوان المهمة" required placeholder="عنوان المهمة" />
                  <FormGrid cols={2}>
                    <FormSelectField
                      name="priority"
                      label="الأولوية"
                      options={[
                        { value: "low", label: "منخفضة" },
                        { value: "medium", label: "متوسطة" },
                        { value: "high", label: "عالية" },
                      ]}
                    />
                    <FormDateField name="dueDate" label="تاريخ الاستحقاق" />
                  </FormGrid>
                </FormShell>
              </div>
            )}
            {tasks.length === 0 && !showTaskForm ? (
              <p className="text-center text-muted-foreground py-8">لا توجد مهام</p>
            ) : tasks.length > 0 ? (
              <DataTable
                columns={[
                  { key: "title", header: "المهمة", render: (t: any) => <span className="font-medium">{t.title}</span> },
                  { key: "assigneeName", header: "المسؤول", render: (t: any) => <span className="text-muted-foreground">{t.assigneeName || "-"}</span> },
                  { key: "priority", header: "الأولوية", render: (t: any) => <Badge className={priorityColors[t.priority] || "bg-surface-subtle text-status-neutral-foreground"}>{priorityLabels[t.priority] || t.priority}</Badge> },
                  { key: "status", header: "الحالة", render: (t: any) => <PageStatusBadge status={t.status} domain="project" /> },
                  { key: "dueDate", header: "تاريخ الاستحقاق", render: (t: any) => <span className="text-muted-foreground">{t.dueDate ? formatDateAr(t.dueDate) : "-"}</span> },
                  { key: "action", header: "إجراء", render: (t: any) => t.status !== "done" ? (
                    <Select value={t.status} onValueChange={(v) => updateTaskStatus(t.id, v)}>
                      <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">للتنفيذ</SelectItem>
                        <SelectItem value="in_progress">جاري</SelectItem>
                        <SelectItem value="done">مكتمل</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null },
                ]}
                data={tasks}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            ) : null}
          </CardContent>
        </Card>
      )}

      {activeTab === "team" && id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Users2 className="w-5 h-5 text-muted-foreground" /> فريق المشروع ({resources.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {resources.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لم يتم تعيين أعضاء للفريق بعد</p>
            ) : (
              <DataTable
                columns={[
                  { key: "employeeName", header: "الموظف", render: (r) => <span className="font-medium">{r.employeeName || `#${r.employeeId}`}</span> },
                  { key: "employeeJobTitle", header: "المنصب", render: (r) => <span className="text-muted-foreground">{r.employeeJobTitle || "-"}</span> },
                  { key: "role", header: "الدور في المشروع", render: (r) => <Badge variant="outline">{r.role || "عضو"}</Badge> },
                  { key: "allocatedHours", header: "الساعات المخصصة", render: (r) => <span>{r.allocatedHours || 0} ساعة</span> },
                  { key: "budgetAllocated", header: "الميزانية المخصصة", render: (r) => <span>{r.budgetAllocated ? formatCurrency(Number(r.budgetAllocated)) : "-"}</span> },
                  { key: "period", header: "الفترة", render: (r) => <span className="text-xs text-muted-foreground">{r.startDate ? formatDateAr(r.startDate) : ""}{r.endDate ? ` – ${formatDateAr(r.endDate)}` : ""}</span> },
                ]}
                data={resources}
                noToolbar
                pageSize={0}
                emptyMessage="لا يوجد أعضاء"
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "costs" && id && (
        <div className="space-y-4">
          <KpiGrid items={[
            { label: "الميزانية", value: formatCurrency(budget), icon: DollarSign, color: "text-status-info-foreground bg-status-info-surface" },
            { label: "المنصرف الفعلي", value: formatCurrency(costsTotalActual), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
            { label: "المتبقي", value: formatCurrency(costsVariance), icon: DollarSign, color: costsVariance >= 0 ? "text-status-success-foreground bg-status-success-surface" : "text-status-error-foreground bg-status-error-surface" },
          ]} />
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">سجل التكاليف</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowCostForm(!showCostForm)}>
                  <Plus className="h-3 w-3 me-1" /> تكلفة جديدة
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showCostForm && (
                <div className="p-3 rounded-lg border-2 border-primary/20 mb-4">
                  <FormShell
                    schema={costSchema}
                    defaultValues={{ description: "", amount: 0, category: "labor" as const, costDate: "" }}
                    submitLabel="حفظ"
                    secondaryActions={
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowCostForm(false)}>
                        إلغاء
                      </Button>
                    }
                    onSubmit={async (values) => {
                      await addCost(values);
                    }}
                  >
                    <FormTextField name="description" label="وصف التكلفة" required placeholder="وصف التكلفة" />
                    <FormGrid cols={3}>
                      <FormNumberField name="amount" label="المبلغ" required />
                      <FormSelectField
                        name="category"
                        label="التصنيف"
                        options={[
                          { value: "labor", label: "عمالة" },
                          { value: "materials", label: "مواد" },
                          { value: "equipment", label: "معدات" },
                          { value: "subcontractor", label: "مقاولات" },
                          { value: "overhead", label: "نفقات عامة" },
                          { value: "other", label: "أخرى" },
                        ]}
                      />
                      <FormDateField name="costDate" label="تاريخ التكلفة" />
                    </FormGrid>
                  </FormShell>
                </div>
              )}
              {costs.length === 0 && !showCostForm ? (
                <p className="text-center text-muted-foreground py-8">لا توجد تكاليف مسجلة</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "description", header: "الوصف", render: (c) => <span className="font-medium">{c.description}</span> },
                    { key: "amount", header: "المبلغ", render: (c) => <span className="font-bold">{formatCurrency(Number(c.amount))}</span> },
                    { key: "category", header: "التصنيف", render: (c) => <Badge variant="outline">{c.category}</Badge> },
                    { key: "costDate", header: "التاريخ", render: (c) => <span className="text-muted-foreground">{c.costDate ? formatDateAr(c.costDate) : "-"}</span> },
                    { key: "enteredByName", header: "أدخلها", render: (c) => <span className="text-muted-foreground">{c.enteredByName || "-"}</span> },
                  ]}
                  data={costs}
                  noToolbar
                  emptyMessage="لا توجد تكاليف"
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "finance" && id && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BookOpen className="w-5 h-5 text-status-info-foreground" /> الملف المالي الشامل</CardTitle></CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="project" entityId={id!} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">دفتر الأستاذ المساعد</CardTitle></CardHeader>
            <CardContent>
              <FinancialTab entityType="project" entityId={id!} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "letters" && id && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><Mail className="w-5 h-5 text-muted-foreground" /> المراسلات المرتبطة ({letters.length})</CardTitle>
              <Link href={`/communications/letters/create?relatedType=project&relatedId=${id}`}>
                <Button size="sm" variant="outline"><Plus className="h-3 w-3 me-1" /> خطاب جديد</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {letters.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد مراسلات مرتبطة بهذا المشروع</p>
            ) : (
              <DataTable
                columns={[
                  { key: "subject", header: "الموضوع", render: (l) => <span className="font-medium">{l.subject}</span> },
                  { key: "direction", header: "الاتجاه", render: (l) => <Badge variant="outline">{l.direction === "outgoing" ? "صادر" : "وارد"}</Badge> },
                  { key: "type", header: "النوع", render: (l) => <span className="text-muted-foreground">{l.type || "-"}</span> },
                  { key: "letterDate", header: "التاريخ", render: (l) => <span className="text-muted-foreground">{l.letterDate ? formatDateAr(l.letterDate) : "-"}</span> },
                  { key: "status", header: "الحالة", render: (l) => <PageStatusBadge status={l.status || "draft"} /> },
                ]}
                data={letters}
                noToolbar
                emptyMessage="لا توجد مراسلات"
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "documents" && id && (
        <EntityObligations entityType="project" entityId={id!} hideWhenEmpty />
      )}
    </div>
  ) : null;

  return (
    <DetailPageLayout
      title={project?.name || "المشروع"}
      subtitle={project?.clientName || undefined}
      backPath="/projects"
      backLabel="المشاريع"
      status={project ? { label: statusLabels[project.status] || project.status, tone: statusTone(project.status) } : undefined}
      entityType="project"
      entityId={id || ""}
      isLoading={isLoading}
      error={isError ? error : undefined}
     
      createdAt={project?.createdAt}
      updatedAt={project?.updatedAt}
      hideTabs={registryHideTabs}
      overview={overview}
      actions={actions}
    />
  );
}
