import { useState, Fragment } from "react";
import { Link, useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Calendar, Building2, Phone, Plus, User, Pencil, Trash2, Check, X, PlayCircle, CheckCircle2, Loader2, Copy, Eye, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { DeleteConfirmImpact } from "@/components/delete-confirm-impact";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

const statusOptions = [
  { value: "pending", label: "معلق", color: "bg-amber-100 text-amber-700" },
  { value: "in_progress", label: "جاري", color: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "مكتمل", color: "bg-green-100 text-green-700" },
  { value: "overdue", label: "متأخر", color: "bg-rose-100 text-rose-700" },
];

const priorityLabels: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const typeLabels: Record<string, string> = { task: "مهمة عامة", meeting: "اجتماع", call: "مكالمة" };

const ENTITY_TYPE_LABELS: Record<string, string> = {
  maintenance_request: "طلب صيانة",
  property_unit: "وحدة عقارية",
  vehicle: "مركبة",
  client: "عميل",
  contract: "عقد",
  project: "مشروع",
  legal_case: "قضية قانونية",
};

function getEntityLink(type: string, id: number | string): string {
  const routes: Record<string, string> = {
    maintenance_request: `/support/${id}`,
    property_unit: `/properties/${id}`,
    vehicle: `/fleet/${id}`,
    client: `/clients/${id}`,
    project: `/projects/${id}`,
    contract: `/contracts/${id}`,
    legal_case: `/legal/${id}`,
  };
  return routes[type] || "#";
}

export default function Tasks() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { selectedRole, scopeQueryString } = useAppContext();
  const isOwner = selectedRole?.roleKey === "owner" || selectedRole?.roleKey === "general_manager";
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("task");

  const previewFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "النوع", key: "type" },
    { label: "الأولوية", key: "priority", type: "badge" },
    { label: "المكلّف", key: "assigneeName" },
    { label: "الموعد", key: "scheduledDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data: tasksResp, isLoading, isError } = useApiQuery<any>(["tasks", scopeQueryString], `/tasks${scopeSuffix}`);

  const updateMut = useApiMutation<any, { id: number } & Record<string, any>>(
    (body) => `/tasks/${body.id}`,
    "PATCH",
    [["tasks"]],
    {
      successMessage: "تم تحديث المهمة بنجاح",
      onSuccess: () => { setEditingId(null); setEditForm({}); },
    }
  );

  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/tasks/${body.id}`,
    "DELETE",
    [["tasks"]],
    {
      successMessage: "تم حذف المهمة",
      onSuccess: () => setDeletingId(null),
    }
  );

  const quickStatusMut = useApiMutation<any, { id: number; status: string }>(
    (body) => `/tasks/${body.id}`,
    "PATCH",
    [["tasks"]],
    { successMessage: "تم تحديث الحالة" }
  );

  const saving = updateMut.isPending || deleteMut.isPending;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const tasks = asList(tasksResp);
  const preFiltered = applyFilters(tasks, filters, {
    searchFields: ["title", "assigneeName", "description"],
    statusField: "status",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((t: any) => tagFilteredIds.has(t.id)) : preFiltered;

  const startEdit = (task: any) => {
    setEditingId(task.id);
    setDeletingId(null);
    setEditForm({ title: task.title, priority: task.priority, status: task.status, description: task.description || "" });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = () => {
    if (!editingId) return;
    updateMut.mutate({ id: editingId, ...editForm });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id });
  };

  const quickStatusChange = (id: number, newStatus: string) => {
    quickStatusMut.mutate({ id, status: newStatus });
  };

  return (
    <PageShell
      title="إدارة المهام"
      actions={
        <Link href="/tasks/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> مهمة جديدة</Button>
        </Link>
      }
    >
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "إجمالي المهام", value: tasks?.length || 0, color: "text-blue-600" },
          { label: "معلقة", value: tasks?.filter((t: any) => t.status === "pending").length || 0, color: "text-amber-600" },
          { label: "جارية", value: tasks?.filter((t: any) => t.status === "in_progress").length || 0, color: "text-blue-600" },
          { label: "مكتملة", value: tasks?.filter((t: any) => t.status === "completed").length || 0, color: "text-green-600" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالعنوان أو المكلف...",
          statuses: statusOptions.map(s => ({ value: s.value, label: s.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "title", label: "العنوان" },
          { key: "type", label: "النوع" },
          { key: "priority", label: "الأولوية" },
          { key: "status", label: "الحالة" },
          { key: "assigneeName", label: "المكلف" },
        ], "المهام")}
        resultCount={filtered?.length}
      />
      <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />

      <BulkActionsBar
        entityType="task"
        items={filtered || []}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll((filtered || []).map((t: any) => t.id))}
        onClear={clearSelection}
        invalidateKeys={[["tasks"]]}
        csvColumns={[
          { key: "title", label: "العنوان" },
          { key: "type", label: "النوع" },
          { key: "priority", label: "الأولوية" },
          { key: "status", label: "الحالة" },
          { key: "assigneeName", label: "المكلف" },
        ]}
        csvFileName="المهام"
        actions={["close", "export", "delete"]}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-3 w-8"><BulkCheckbox checked={selectedIds.size === (filtered || []).length && (filtered || []).length > 0} indeterminate={selectedIds.size > 0 && selectedIds.size < (filtered || []).length} onChange={() => toggleAll((filtered || []).map((t: any) => t.id))} /></th>
                  <th className="text-start p-3 font-medium">العنوان</th>
                  <th className="text-start p-3 font-medium">الوسوم</th>
                  <th className="text-start p-3 font-medium">الكيان المرتبط</th>
                  <th className="text-start p-3 font-medium">النوع</th>
                  <th className="text-start p-3 font-medium">الأولوية</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">الموعد</th>
                  <th className="text-start p-3 font-medium">المكلّف</th>
                  <th className="text-start p-3 font-medium w-[200px]">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-5 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered?.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-muted-foreground">
                      لا توجد مهام تطابق معايير البحث
                    </td>
                  </tr>
                ) : (
                  filtered?.map((task: any) => (
                    <Fragment key={task.id}>
                      <tr className={`border-b hover:bg-muted/20 transition-colors ${editingId === task.id ? "bg-blue-50" : ""} ${selectedIds.has(task.id) ? "bg-blue-50/50" : ""}`}>
                        <td className="p-3"><BulkCheckbox checked={selectedIds.has(task.id)} onChange={() => toggleSelect(task.id)} /></td>
                        <td className="p-3 font-medium">{task.title}</td>
                        <td className="p-3"><EntityTags entityType="task" entityId={task.id} inline /></td>
                        <td className="p-3">
                          {task.linkedEntityType ? (
                            <Link href={getEntityLink(task.linkedEntityType, task.linkedEntityId)}>
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer">
                                <Link2 className="h-3 w-3" />
                                {ENTITY_TYPE_LABELS[task.linkedEntityType] || task.linkedEntityType}
                                {task.linkedEntityName ? (
                                  <span className="font-medium"> {task.linkedEntityName}</span>
                                ) : task.linkedEntityId ? (
                                  <span className="font-mono"> #{task.linkedEntityId}</span>
                                ) : null}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{typeLabels[task.type] || "مهمة عامة"}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            task.priority === "high" ? "bg-rose-100 text-rose-700" :
                            task.priority === "medium" ? "bg-amber-100 text-amber-700" :
                            "bg-emerald-100 text-emerald-700"
                          }`}>
                            {priorityLabels[task.priority] || task.priority}
                          </span>
                        </td>
                        <td className="p-3"><PageStatusBadge status={task.status} /></td>
                        <td className="p-3 text-muted-foreground">
                          {task.scheduledStart
                            ? formatDateAr(task.scheduledStart)
                            : task.scheduledDate
                            ? formatDateAr(task.scheduledDate)
                            : "-"
                          }
                        </td>
                        <td className="p-3 text-muted-foreground">{task.assigneeName || "-"}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => setPreviewItem(task)}
                              title="معاينة سريعة"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {task.status !== "completed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => quickStatusChange(task.id, "completed")}
                                title="إكمال المهمة"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            {task.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => quickStatusChange(task.id, "in_progress")}
                                title="بدء العمل"
                              >
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Link href={`/tasks/create?copyFrom=${task.id}&title=${encodeURIComponent(task.title)}&type=${task.type}&priority=${task.priority}`}>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" title="نسخ">
                                <Copy className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => navigate(`/tasks/create?copy=${encodeURIComponent(JSON.stringify({ title: task.title + " (نسخة)", description: task.description, type: task.type, priority: task.priority }))}`)}
                              title="نسخ المهمة"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(task)}
                              title="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {isOwner && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => { setDeletingId(task.id); setEditingId(null); }}
                                title="حذف"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            <button onClick={() => setExpandedId(expandedId === task.id ? null : task.id)} className="text-gray-400 hover:text-gray-600 p-1">
                              {expandedId === task.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === task.id && (
                        <tr className="bg-gray-50/50 border-b">
                          <td colSpan={10} className="p-4">
                            <div className="space-y-3">
                              <EntityTags entityType="task" entityId={task.id} />
                              <EntityComments entityType="task" entityId={task.id} />
                            </div>
                          </td>
                        </tr>
                      )}
                      {editingId === task.id && (
                        <tr className="bg-blue-50/50 border-b">
                          <td colSpan={10} className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">العنوان</label>
                                <Input
                                  value={editForm.title || ""}
                                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">الأولوية</label>
                                <Select value={editForm.priority || "medium"} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">منخفضة</SelectItem>
                                    <SelectItem value="medium">متوسطة</SelectItem>
                                    <SelectItem value="high">عالية</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
                                <Select value={editForm.status || "pending"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {statusOptions.map((s) => (
                                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-end gap-2">
                                <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1">
                                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  حفظ
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
                                  <X className="h-3 w-3" /> إلغاء
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {deletingId === task.id && (
                        <tr className="bg-rose-50/50 border-b">
                          <td colSpan={10} className="p-4">
                            <DeleteConfirmImpact
                              entityType="task"
                              entityId={task.id}
                              entityName={task.title}
                              onConfirm={() => handleDelete(task.id)}
                              onCancel={() => setDeletingId(null)}
                              isPending={saving}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة المهمة" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}
