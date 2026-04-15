import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, buildErrorToast } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ArrowRight, FolderKanban, Calendar, DollarSign, ListTodo, CheckCircle2, Pencil, Trash2, X, Check, AlertTriangle, BookOpen, CheckSquare, FileText, Clock } from "lucide-react";
import { formatDateAr, getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { FinancialTab } from "@/components/shared/financial-tab";
import { LinkedTasks } from "@/components/shared/linked-tasks";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";

const PROJECT_TABS = [
  { key: "overview", label: "نظرة عامة", icon: FolderKanban },
  { key: "tasks", label: "المهام", icon: ListTodo },
  { key: "linked_tasks", label: "المهام المرتبطة", icon: CheckSquare },
  { key: "finance", label: "المالية", icon: BookOpen },
  { key: "documents", label: "المستندات", icon: FileText },
  { key: "timeline", label: "السجل الزمني", icon: Clock },
] as const;

type ProjectTabKey = (typeof PROJECT_TABS)[number]["key"];

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectTabKey>("overview");

  const { data: project, isLoading, isError, error } = useApiQuery<any>(["project-detail", id || ""], `/projects/${id}`, !!id);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const is404 = isError && (error?.message?.includes("غير موجود") || error?.message?.includes("404"));

  const statusColors: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    done: "bg-green-100 text-green-700",
    active: "bg-blue-100 text-blue-700",
    in_progress: "bg-blue-100 text-blue-700",
    planning: "bg-purple-100 text-purple-700",
    pending: "bg-gray-100 text-gray-700",
    todo: "bg-gray-100 text-gray-700",
    on_hold: "bg-yellow-100 text-yellow-700",
  };
  const statusLabels: Record<string, string> = { completed: "مكتمل", done: "مكتمل", active: "نشط", in_progress: "قيد التنفيذ", pending: "معلق", planning: "تخطيط", on_hold: "متوقف", todo: "للتنفيذ" };
  const priorityColors: Record<string, string> = { high: "bg-red-100 text-red-700", critical: "bg-red-100 text-red-700", medium: "bg-yellow-100 text-yellow-700", low: "bg-green-100 text-green-700" };
  const priorityLabels: Record<string, string> = { high: "عالية", critical: "حرجة", medium: "متوسطة", low: "منخفضة" };
  const taskStatusLabels: Record<string, string> = { todo: "للتنفيذ", in_progress: "جاري", done: "مكتمل", ...statusLabels };

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (is404 || (!isLoading && !project)) return (
    <div className="text-center py-12">
      <FolderKanban className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">المشروع غير موجود</p>
      <Link href="/projects"><Button variant="outline" className="mt-4">العودة للمشاريع</Button></Link>
    </div>
  );

  if (isError) return (
    <div className="text-center py-12">
      <FolderKanban className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">حدث خطأ في تحميل البيانات</p>
      <Link href="/projects"><Button variant="outline" className="mt-4">العودة للمشاريع</Button></Link>
    </div>
  );

  const phases = project.phases || [];
  const tasks = project.tasks || [];
  const budget = Number(project.budget) || 0;
  const spent = Number(project.spentAmount) || 0;
  const progress = project.progressPct ?? (project.progress || 0);

  const startEdit = () => {
    setEditForm({
      name: project.name || "",
      status: project.status || "planning",
      budget: String(budget),
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await apiFetch(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          status: editForm.status,
          budget: Number(editForm.budget),
        }),
      });
      toast({ title: "تم تحديث المشروع" });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      toast(buildErrorToast(err));
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/projects/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف المشروع" });
      navigate("/projects");
    } catch (err) {
      toast(buildErrorToast(err));
    }
  };

  const completePhase = async (phaseId: number) => {
    try {
      await apiFetch(`/projects/${id}/phases/${phaseId}/complete`, { method: "PATCH" });
      toast({ title: "تم إكمال المرحلة" });
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
    } catch (err) {
      toast(buildErrorToast(err));
    }
  };

  const updateTaskStatus = async (taskId: number, status: string) => {
    try {
      await apiFetch(`/projects/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast({ title: "تم تحديث المهمة" });
      qc.invalidateQueries({ queryKey: ["project-detail", id] });
    } catch (err) {
      toast(buildErrorToast(err));
    }
  };

  return (
    <PageShell
      title={project.name || "المشروع"}
      subtitle={project.clientName || undefined}
      loading={isLoading}
      breadcrumbs={[{ href: "/projects", label: "المشاريع" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={statusColors[project.status] || "bg-gray-100 text-gray-700"}>{statusLabels[project.status] || project.status}</Badge>
          {project.isSlipping && (
            <Badge className="bg-red-100 text-red-700 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> متأخر
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 me-1" />تعديل</Button>
          {deleting ? (
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</Button>
          )}
          <Link href="/projects">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">تعديل المشروع</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">اسم المشروع</label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">الحالة</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({...f, status: e.target.value}))} className="w-full border rounded-md p-2 mt-1">
                  {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{`الميزانية (${getCurrencySymbol()})`}</label>
                <Input type="number" value={editForm.budget} onChange={e => setEditForm(f => ({...f, budget: e.target.value}))} className="mt-1" dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button onClick={saveEdit}><Check className="h-4 w-4 me-1" />حفظ</Button>
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 me-1" />إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50"><FolderKanban className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-xl font-bold">{progress}%</p><p className="text-xs text-gray-500">نسبة الإنجاز</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-50"><DollarSign className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xl font-bold">{budget > 0 ? `${(budget / 1000).toFixed(0)}K` : "0"}</p><p className="text-xs text-gray-500">{`الميزانية (${getCurrencySymbol()})`}</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-50"><DollarSign className="w-5 h-5 text-orange-600" /></div>
          <div><p className="text-xl font-bold">{spent > 0 ? `${(spent / 1000).toFixed(0)}K` : "0"}</p><p className="text-xs text-gray-500">{`المنصرف (${getCurrencySymbol()})`}</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50"><ListTodo className="w-5 h-5 text-purple-600" /></div>
          <div><p className="text-xl font-bold">{tasks.length}</p><p className="text-xs text-gray-500">المهام</p></div>
        </CardContent></Card>
      </div>

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
                  <div className="grid grid-cols-3 py-2"><span className="text-muted-foreground">انحراف التكلفة</span><span className={`col-span-2 font-bold ${Number(project.costVariance) >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(Number(project.costVariance))}</span></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-muted-foreground" /> المراحل ({phases.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {phases.length === 0 && <p className="text-center text-gray-400 py-4">لا توجد مراحل</p>}
                {phases.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <p className="text-xs text-gray-500 mt-1">
                        {p.startDate ? formatDateAr(p.startDate) : ""} {p.endDate ? `- ${formatDateAr(p.endDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={statusColors[p.status] || "bg-gray-100 text-gray-700"}>{statusLabels[p.status] || p.status || "معلق"}</Badge>
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
        </>
      )}

      {activeTab === "tasks" && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ListTodo className="w-5 h-5 text-muted-foreground" /> المهام ({tasks.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <p className="text-center text-gray-400 py-8">لا توجد مهام</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50">
                  <th className="p-3 text-start">المهمة</th>
                  <th className="p-3 text-start">المسؤول</th>
                  <th className="p-3 text-start">الأولوية</th>
                  <th className="p-3 text-start">الحالة</th>
                  <th className="p-3 text-start">تاريخ الاستحقاق</th>
                  <th className="p-3 text-start">إجراء</th>
                </tr></thead>
                <tbody>
                  {tasks.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{t.title}</td>
                      <td className="p-3 text-gray-500">{t.assigneeName || "-"}</td>
                      <td className="p-3"><Badge className={priorityColors[t.priority] || "bg-gray-100 text-gray-700"}>{priorityLabels[t.priority] || t.priority}</Badge></td>
                      <td className="p-3"><Badge className={statusColors[t.status] || "bg-gray-100 text-gray-700"}>{taskStatusLabels[t.status] || t.status}</Badge></td>
                      <td className="p-3 text-gray-500">{t.dueDate ? formatDateAr(t.dueDate) : "-"}</td>
                      <td className="p-3">
                        {t.status !== "done" && (
                          <select
                            value={t.status}
                            onChange={e => updateTaskStatus(t.id, e.target.value)}
                            className="border rounded px-2 py-1 text-xs"
                          >
                            <option value="todo">للتنفيذ</option>
                            <option value="in_progress">جاري</option>
                            <option value="done">مكتمل</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "linked_tasks" && id && (
        <LinkedTasks entityType="project" entityId={id} />
      )}

      {activeTab === "finance" && id && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BookOpen className="w-5 h-5 text-blue-600" /> الملف المالي للمشروع</CardTitle></CardHeader>
          <CardContent>
            <FinancialTab entityType="project" entityId={id!} />
          </CardContent>
        </Card>
      )}

      {activeTab === "documents" && id && (
        <EntityDocuments entityType="project" entityId={id!} />
      )}

      {activeTab === "timeline" && id && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-muted-foreground" /> السجل الزمني</CardTitle></CardHeader>
          <CardContent>
            <EntityTimeline entityType="projects" entityId={id!} maxItems={20} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
