import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { z } from "zod";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormGrid,
  PageStatusBadge,
  DataTable,
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
  BarChart2, ShieldAlert, Users2, Mail, Lock, TrendingUp, ClipboardList,
} from "lucide-react";
import { formatDateAr, getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { EntityObligations } from "@/components/shared/entity-obligations";
import {
  EntityComments,
  DetailPageLayout,
} from "@workspace/entity-kit";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { cn } from "@/lib/utils";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DatePicker } from "@/components/ui/date-picker";
import { PrintButton } from "@/components/shared/print-button";
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";

const PROJECT_TABS = [
  { key: "overview", label: "نظرة عامة", icon: FolderKanban },
  { key: "units", label: "الوحدات", icon: BarChart2 },
  { key: "tasks", label: "المهام", icon: ListTodo },
  { key: "team", label: "الفريق", icon: Users2 },
  { key: "costs", label: "التكاليف", icon: DollarSign },
  { key: "finance", label: "المالية", icon: BookOpen },
  { key: "letters", label: "المراسلات", icon: Mail },
  { key: "boq", label: "جدول الكميات", icon: ClipboardList },
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
  const unitsEnabled = !!id && activeTab === "units";
  const { data: unitsResp, refetch: refetchUnits } = useApiQuery<any>(["project-units", id || ""], `/projects/${id}/units`, unitsEnabled);
  const projectUnits: any[] = unitsResp?.units || [];
  const boqEnabled = !!id && activeTab === "boq";
  const { data: boqResp, refetch: refetchBoq } = useApiQuery<any>(["project-boq", id || ""], `/projects/${id}/boq`, boqEnabled);
  const boqItems: any[] = boqResp?.data || boqResp || [];
  const [showBoqForm, setShowBoqForm] = useState(false);
  const [newBoq, setNewBoq] = useState<{ description?: string; unit?: string; quantity?: string; unitPrice?: string; notes?: string }>({});
  const [editBoqId, setEditBoqId] = useState<number | null>(null);
  const [editBoq, setEditBoq] = useState<{ description?: string; unit?: string; quantity?: string; unitPrice?: string; notes?: string }>({});
  const [boqBilling, setBoqBilling] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [newUnit, setNewUnit] = useState<{ name?: string; code?: string; area?: string; salePrice?: string; notes?: string }>({});
  const [sellUnitId, setSellUnitId] = useState<number | null>(null);
  const [sellBuyerId, setSellBuyerId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellLoading, setSellLoading] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editUnitDraft, setEditUnitDraft] = useState<{ name?: string; area?: string; salePrice?: string; notes?: string }>({});
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

  // POST /projects/:id/milestones — quick-add milestone with title +
  // due date. PATCH /projects/milestones/:milestoneId updates an
  // individual milestone (status / dates) without going through the
  // gantt editor.
  const addMilestoneMut = useApiMutation<any, { title: string; targetDate?: string }>(
    `/projects/${id}/milestones`,
    "POST",
    [["project-milestones", id || ""], ["project-detail", id || ""]],
    { successMessage: "تمت إضافة المعلم" },
  );
  const updateMilestoneMut = useApiMutation<any, { id: number; status?: string; targetDate?: string }>(
    (b) => `/projects/milestones/${b.id}`,
    "PATCH",
    [["project-milestones", id || ""]],
    { successMessage: "تم تحديث المعلم" },
  );

  // POST /projects/:id/resources — assign an employee / contractor
  // to the project with a role + allocation %.
  const addResourceMut = useApiMutation<any, { employeeId: number; role?: string; allocationPct?: number }>(
    `/projects/${id}/resources`,
    "POST",
    [["project-resources", id || ""]],
    { successMessage: "تمت إضافة المورد البشري" },
  );

  // Milestone + resource dialog state — replaces the 5 chained prompts.
  // A single styled Dialog per action gives the operator a labeled form
  // with date pickers and numeric inputs instead of plain text fields.
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const handleAddMilestone = () => {
    setMilestoneTitle("");
    setMilestoneDate("");
    setMilestoneOpen(true);
  };
  const confirmAddMilestone = () => {
    if (!milestoneTitle.trim()) return;
    setMilestoneOpen(false);
    addMilestoneMut.mutate({
      title: milestoneTitle.trim(),
      targetDate: milestoneDate.trim() || undefined,
    });
  };

  const handleMarkMilestoneComplete = (mid: number) => {
    updateMilestoneMut.mutate({ id: mid, status: "completed" });
  };

  const [resourceOpen, setResourceOpen] = useState(false);
  const [resourceEmpId, setResourceEmpId] = useState("");
  const [resourceRole, setResourceRole] = useState("");
  const [resourceAlloc, setResourceAlloc] = useState("");
  const handleAddResource = () => {
    setResourceEmpId("");
    setResourceRole("");
    setResourceAlloc("");
    setResourceOpen(true);
  };
  const confirmAddResource = () => {
    const empId = Number(resourceEmpId);
    if (!Number.isFinite(empId) || empId <= 0) return;
    setResourceOpen(false);
    addResourceMut.mutate({
      employeeId: empId,
      role: resourceRole.trim() || undefined,
      allocationPct: resourceAlloc ? Number(resourceAlloc) : undefined,
    });
  };

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

  const saveUnit = async () => {
    try {
      await apiFetch(`/projects/${id}/units`, {
        method: "POST",
        body: JSON.stringify({
          name: newUnit.name,
          code: newUnit.code || undefined,
          area: newUnit.area ? Number(newUnit.area) : 0,
          salePrice: newUnit.salePrice ? Number(newUnit.salePrice) : undefined,
          notes: newUnit.notes || undefined,
        }),
      });
      toast({ title: "تم إنشاء الوحدة" });
      setShowUnitForm(false);
      setNewUnit({});
      refetchUnits();
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const updateUnit = async () => {
    if (!editingUnitId) return;
    try {
      await apiFetch(`/projects/units/${editingUnitId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editUnitDraft.name || undefined,
          area: editUnitDraft.area ? Number(editUnitDraft.area) : undefined,
          salePrice: editUnitDraft.salePrice ? Number(editUnitDraft.salePrice) : undefined,
          notes: editUnitDraft.notes || undefined,
        }),
      });
      toast({ title: "تم تحديث الوحدة" });
      setEditingUnitId(null);
      setEditUnitDraft({});
      refetchUnits();
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const deleteUnit = async (uid: number) => {
    if (!confirm("حذف هذه الوحدة؟")) return;
    try {
      await apiFetch(`/projects/units/${uid}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetchUnits();
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const sellUnit = async () => {
    if (!sellUnitId) return;
    setSellLoading(true);
    try {
      await apiFetch(`/projects/units/${sellUnitId}/sell`, {
        method: "POST",
        body: JSON.stringify({
          buyerClientId: Number(sellBuyerId),
          salePrice: sellPrice ? Number(sellPrice) : undefined,
        }),
      });
      toast({ title: "تم تسجيل البيع", description: "تم ترحيل قيد التكلفة" });
      setSellUnitId(null);
      setSellBuyerId("");
      setSellPrice("");
      refetchUnits();
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ في البيع", description: getErrorMessage(err) });
    } finally {
      setSellLoading(false);
    }
  };

  const saveBoqItem = async () => {
    if (!newBoq.description) return;
    try {
      await apiFetch(`/projects/${id}/boq`, {
        method: "POST",
        body: JSON.stringify({
          description: newBoq.description,
          unit: newBoq.unit,
          quantity: newBoq.quantity ? Number(newBoq.quantity) : undefined,
          unitPrice: newBoq.unitPrice ? Number(newBoq.unitPrice) : undefined,
          notes: newBoq.notes,
        }),
      });
      toast({ title: "تمت الإضافة" });
      setShowBoqForm(false);
      setNewBoq({});
      refetchBoq();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الإضافة", description: getErrorMessage(err) });
    }
  };

  const updateBoqItem = async (boqId: number) => {
    try {
      await apiFetch(`/projects/boq/${boqId}`, {
        method: "PATCH",
        body: JSON.stringify({
          description: editBoq.description,
          unit: editBoq.unit,
          quantity: editBoq.quantity ? Number(editBoq.quantity) : undefined,
          unitPrice: editBoq.unitPrice ? Number(editBoq.unitPrice) : undefined,
          notes: editBoq.notes,
        }),
      });
      toast({ title: "تم التحديث" });
      setEditBoqId(null);
      refetchBoq();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التحديث", description: getErrorMessage(err) });
    }
  };

  const deleteBoqItem = async (boqId: number) => {
    if (!confirm("حذف هذا البند؟")) return;
    try {
      await apiFetch(`/projects/boq/${boqId}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetchBoq();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحذف", description: getErrorMessage(err) });
    }
  };

  const billBoqItems = async () => {
    if (!confirm("إرسال جدول الكميات للفوترة؟")) return;
    setBoqBilling(true);
    try {
      await apiFetch(`/projects/${id}/boq/bill`, { method: "POST" });
      toast({ title: "تم الإرسال للفوترة" });
      refetchBoq();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: getErrorMessage(err) });
    } finally {
      setBoqBilling(false);
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
        <GuardedButton perm="operations:update" variant="outline" size="sm" className="text-emerald-600" onClick={() => setClosingProject(true)}>
          <Lock className="h-4 w-4 me-1" />إقفال المشروع
        </GuardedButton>
      )}
      {closingProject && (
        <div className="flex gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={closeProject}>تأكيد الإقفال</Button>
          <Button variant="outline" size="sm" onClick={() => setClosingProject(false)}>إلغاء</Button>
        </div>
      )}
      <GuardedButton perm="operations:update" variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 me-1" />تعديل</GuardedButton>
      {deleting ? (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
          <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
        </div>
      ) : (
        <GuardedButton perm="operations:delete" variant="outline" size="sm" className="text-status-error-foreground" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</GuardedButton>
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
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={handleAddMilestone} disabled={addMilestoneMut.isPending} rateLimitAware>
                      + إضافة
                    </Button>
                    <Link href={`/projects/gantt?projectId=${id}`}><Button variant="ghost" size="sm" className="text-xs">غانت</Button></Link>
                  </div>
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
                      {m.status !== "completed" && m.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1 text-[10px]"
                          onClick={() => handleMarkMilestoneComplete(m.id)}
                          disabled={updateMilestoneMut.isPending}
                          title="تعليم كمكتمل"
                        >
                          ✓
                        </Button>
                      )}
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><Users2 className="w-5 h-5 text-muted-foreground" /> فريق المشروع ({resources.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAddResource} disabled={addResourceMut.isPending} rateLimitAware>
                + إضافة عضو
              </Button>
            </div>
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
              <Link href={`/correspondence/create?relatedType=project&relatedId=${id}`}>
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

      {activeTab === "units" && id && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><BarChart2 className="w-5 h-5" /> وحدات المشروع ({projectUnits.length})</CardTitle>
              <GuardedButton perm="projects.list:create" size="sm" className="gap-1" onClick={() => setShowUnitForm(v => !v)}>
                <Plus className="w-4 h-4" /> وحدة جديدة
              </GuardedButton>
            </CardHeader>
            <CardContent className="space-y-4">
              {showUnitForm && (
                <div className="border rounded-lg p-4 bg-surface-subtle space-y-3">
                  <p className="text-sm font-medium">إضافة وحدة جديدة</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-muted-foreground">اسم الوحدة</label>
                      <input className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={newUnit.name || ""} onChange={e => setNewUnit(p => ({ ...p, name: e.target.value }))} placeholder="مثال: شقة A-101" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">الرمز (اختياري)</label>
                      <input className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={newUnit.code || ""} onChange={e => setNewUnit(p => ({ ...p, code: e.target.value }))} placeholder="A-101" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">المساحة (م²)</label>
                      <input type="number" className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={newUnit.area || ""} onChange={e => setNewUnit(p => ({ ...p, area: e.target.value }))} placeholder="120" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">سعر البيع (اختياري)</label>
                      <input type="number" className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={newUnit.salePrice || ""} onChange={e => setNewUnit(p => ({ ...p, salePrice: e.target.value }))} placeholder="500000" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-muted-foreground">ملاحظات (اختياري)</label>
                      <input className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={newUnit.notes || ""} onChange={e => setNewUnit(p => ({ ...p, notes: e.target.value }))} placeholder="" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowUnitForm(false)}>إلغاء</Button>
                    <Button size="sm" onClick={saveUnit} disabled={!newUnit.name}>إضافة</Button>
                  </div>
                </div>
              )}
              {sellUnitId !== null && (
                <div className="border rounded-lg p-4 bg-status-warning-surface space-y-3">
                  <p className="text-sm font-medium">تسجيل بيع الوحدة</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">رقم العميل المشتري (ID)</label>
                      <input type="number" className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={sellBuyerId} onChange={e => setSellBuyerId(e.target.value)} placeholder="مثال: 5" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">سعر البيع (اتركه فارغاً لاستخدام السعر المسجل)</label>
                      <input type="number" className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="اختياري" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setSellUnitId(null)}>إلغاء</Button>
                    <Button size="sm" variant="destructive" onClick={sellUnit} disabled={!sellBuyerId || sellLoading}>
                      {sellLoading ? "جارٍ البيع..." : "تأكيد البيع"}
                    </Button>
                  </div>
                </div>
              )}
              {editingUnitId !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingUnitId(null)}>
                  <div className="bg-white rounded-lg shadow-xl p-5 w-96 space-y-3" onClick={(e) => e.stopPropagation()}>
                    <h3 className="font-semibold text-sm">تعديل الوحدة</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">الاسم</label>
                        <input className="w-full h-9 px-3 text-sm border rounded-md" value={editUnitDraft.name || ""} onChange={e => setEditUnitDraft(d => ({ ...d, name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">المساحة (م²)</label>
                        <input type="number" className="w-full h-9 px-3 text-sm border rounded-md" value={editUnitDraft.area || ""} onChange={e => setEditUnitDraft(d => ({ ...d, area: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">سعر البيع</label>
                        <input type="number" className="w-full h-9 px-3 text-sm border rounded-md" value={editUnitDraft.salePrice || ""} onChange={e => setEditUnitDraft(d => ({ ...d, salePrice: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">ملاحظات</label>
                        <input className="w-full h-9 px-3 text-sm border rounded-md" value={editUnitDraft.notes || ""} onChange={e => setEditUnitDraft(d => ({ ...d, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingUnitId(null)}>إلغاء</Button>
                      <Button size="sm" onClick={updateUnit}>حفظ</Button>
                    </div>
                  </div>
                </div>
              )}

              {projectUnits.length === 0 && !showUnitForm ? (
                <p className="text-muted-foreground text-center py-8">لا توجد وحدات مشروع</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "name", header: "الوحدة", render: (u: any) => <div><p className="font-medium">{u.name}</p>{u.code && <p className="text-xs text-muted-foreground font-mono">{u.code}</p>}</div> },
                    { key: "area", header: "المساحة", ltr: true, render: (u: any) => <span className="font-mono">{Number(u.area || 0).toFixed(1)} م²</span> },
                    { key: "salePrice", header: "سعر البيع", render: (u: any) => u.salePrice != null ? formatCurrency(Number(u.salePrice)) : <span className="text-muted-foreground">—</span> },
                    { key: "allocatedCost", header: "التكلفة المخصصة", render: (u: any) => u.allocatedCost > 0 ? formatCurrency(Number(u.allocatedCost)) : <span className="text-muted-foreground">—</span> },
                    { key: "projectedProfit", header: "الربح المتوقع", render: (u: any) => u.projectedProfit != null ? <span className={Number(u.projectedProfit) >= 0 ? "text-status-success-foreground font-medium" : "text-status-error-foreground font-medium"}>{formatCurrency(Number(u.projectedProfit))}</span> : <span className="text-muted-foreground">—</span> },
                    { key: "status", header: "الحالة", render: (u: any) => <PageStatusBadge status={u.status || "available"} /> },
                    { key: "actions", header: "", render: (u: any) => (
                      <div className="flex gap-1">
                        {u.status !== "sold" && u.status !== "cancelled" && (
                          <GuardedButton perm="projects.list:update" size="sm" variant="outline" onClick={() => { setSellUnitId(u.id); setSellPrice(u.salePrice ? String(u.salePrice) : ""); setSellBuyerId(""); }}>
                            بيع
                          </GuardedButton>
                        )}
                        <GuardedButton perm="projects.list:update" size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => { setEditingUnitId(u.id); setEditUnitDraft({ name: u.name, area: u.area ? String(u.area) : "", salePrice: u.salePrice ? String(u.salePrice) : "", notes: u.notes || "" }); }}>
                          <Pencil className="h-3 w-3" />
                        </GuardedButton>
                        <GuardedButton perm="projects.list:update" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => deleteUnit(u.id)}>
                          <Trash2 className="h-3 w-3" />
                        </GuardedButton>
                      </div>
                    ) },
                  ]}
                  data={projectUnits}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {activeTab === "boq" && id && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5" /> جدول الكميات ({boqItems.length})
              </CardTitle>
              <div className="flex gap-2">
                <GuardedButton perm="projects.list:create" size="sm" variant="outline" className="gap-1"
                  onClick={billBoqItems} disabled={boqBilling || boqItems.length === 0}>
                  {boqBilling ? "جارٍ الإرسال..." : "إرسال للفوترة"}
                </GuardedButton>
                <GuardedButton perm="projects.list:create" size="sm" className="gap-1" onClick={() => setShowBoqForm(v => !v)}>
                  <Plus className="w-4 h-4" /> بند جديد
                </GuardedButton>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showBoqForm && (
                <div className="border rounded-lg p-4 bg-surface-subtle space-y-3">
                  <p className="text-sm font-medium">إضافة بند BOQ</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-muted-foreground">الوصف *</label>
                      <input className="w-full h-9 px-3 text-sm border rounded-md bg-background" value={newBoq.description || ""} onChange={e => setNewBoq(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">الوحدة</label>
                      <input className="w-full h-9 px-3 text-sm border rounded-md bg-background" value={newBoq.unit || ""} onChange={e => setNewBoq(p => ({ ...p, unit: e.target.value }))} placeholder="م²، طن، م.ط..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">الكمية</label>
                      <input type="number" className="w-full h-9 px-3 text-sm border rounded-md bg-background" value={newBoq.quantity || ""} onChange={e => setNewBoq(p => ({ ...p, quantity: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">سعر الوحدة</label>
                      <input type="number" className="w-full h-9 px-3 text-sm border rounded-md bg-background" value={newBoq.unitPrice || ""} onChange={e => setNewBoq(p => ({ ...p, unitPrice: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">ملاحظات</label>
                      <input className="w-full h-9 px-3 text-sm border rounded-md bg-background" value={newBoq.notes || ""} onChange={e => setNewBoq(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowBoqForm(false)}>إلغاء</Button>
                    <Button size="sm" onClick={saveBoqItem} disabled={!newBoq.description}>إضافة</Button>
                  </div>
                </div>
              )}
              {boqItems.length === 0 && !showBoqForm ? (
                <p className="text-muted-foreground text-center py-8">لا توجد بنود في جدول الكميات</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "description", header: "الوصف", render: (b: any) => editBoqId === b.id ? (
                      <input className="w-full h-8 px-2 text-sm border rounded" value={editBoq.description || ""} onChange={e => setEditBoq(p => ({ ...p, description: e.target.value }))} />
                    ) : <span className="font-medium">{b.description}</span> },
                    { key: "unit", header: "الوحدة", render: (b: any) => editBoqId === b.id ? (
                      <input className="w-20 h-8 px-2 text-sm border rounded" value={editBoq.unit || ""} onChange={e => setEditBoq(p => ({ ...p, unit: e.target.value }))} />
                    ) : <span className="text-muted-foreground">{b.unit || "—"}</span> },
                    { key: "quantity", header: "الكمية", ltr: true, render: (b: any) => editBoqId === b.id ? (
                      <input type="number" className="w-20 h-8 px-2 text-sm border rounded" value={editBoq.quantity || ""} onChange={e => setEditBoq(p => ({ ...p, quantity: e.target.value }))} />
                    ) : <span className="font-mono">{b.quantity != null ? Number(b.quantity).toFixed(2) : "—"}</span> },
                    { key: "unitPrice", header: "سعر الوحدة", render: (b: any) => editBoqId === b.id ? (
                      <input type="number" className="w-24 h-8 px-2 text-sm border rounded" value={editBoq.unitPrice || ""} onChange={e => setEditBoq(p => ({ ...p, unitPrice: e.target.value }))} />
                    ) : b.unitPrice != null ? formatCurrency(Number(b.unitPrice)) : <span className="text-muted-foreground">—</span> },
                    { key: "totalPrice", header: "الإجمالي", render: (b: any) => b.totalPrice != null ? <span className="font-bold">{formatCurrency(Number(b.totalPrice))}</span> : <span className="text-muted-foreground">—</span> },
                    { key: "billingStatus", header: "الفوترة", render: (b: any) => b.billingStatus ? <Badge variant="outline">{b.billingStatus}</Badge> : <span className="text-muted-foreground">—</span> },
                    { key: "actions", header: "", render: (b: any) => editBoqId === b.id ? (
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => updateBoqItem(b.id)}>حفظ</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditBoqId(null)}><X className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <GuardedButton perm="projects.list:update" size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => { setEditBoqId(b.id); setEditBoq({ description: b.description, unit: b.unit || "", quantity: b.quantity != null ? String(b.quantity) : "", unitPrice: b.unitPrice != null ? String(b.unitPrice) : "", notes: b.notes || "" }); }}>
                          <Pencil className="w-3 h-3" />
                        </GuardedButton>
                        <GuardedButton perm="projects.list:update" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                          onClick={() => deleteBoqItem(b.id)}>
                          <Trash2 className="w-3 h-3" />
                        </GuardedButton>
                      </div>
                    ) },
                  ]}
                  data={boqItems}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "documents" && id && (
        <EntityObligations entityType="project" entityId={id!} hideWhenEmpty />
      )}
    </div>
  ) : null;

  return (
    <>
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
      actions={
        <div className="flex items-center gap-2">
          {actions}
          <Link href={`/finance/profitability/project/${id}`}>
            <Button variant="outline" size="sm" className="gap-1">
              <TrendingUp className="h-4 w-4" /> الربحية
            </Button>
          </Link>
          <PrintButton entityType="project" entityId={(id as any) ?? 0} label="طباعة" />
          {id != null && <EntityPnlButton entityType="project" entityId={Number(id)} />}
        </div>
      }
    />
    <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة معلم جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">عنوان المعلم</Label>
            <input
              className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background"
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">التاريخ المستهدف (اختياري)</Label>
            <input
              type="date"
              className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background"
              value={milestoneDate}
              onChange={(e) => setMilestoneDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setMilestoneOpen(false)}>إلغاء</Button>
          <Button onClick={confirmAddMilestone} disabled={!milestoneTitle.trim()} rateLimitAware>إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={resourceOpen} onOpenChange={setResourceOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة مورد بشري</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">معرّف الموظف</Label>
            <input
              type="number"
              inputMode="numeric"
              className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background"
              value={resourceEmpId}
              onChange={(e) => setResourceEmpId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الدور (مثال: مهندس / محاسب)</Label>
            <input
              className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background"
              value={resourceRole}
              onChange={(e) => setResourceRole(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">نسبة التخصيص (0-100)</Label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background"
              value={resourceAlloc}
              onChange={(e) => setResourceAlloc(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setResourceOpen(false)}>إلغاء</Button>
          <Button onClick={confirmAddResource} disabled={!resourceEmpId} rateLimitAware>إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
