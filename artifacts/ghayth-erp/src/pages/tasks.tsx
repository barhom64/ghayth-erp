import { useState } from "react";
import { Link, useLocation } from "wouter";
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
import { EntityComments } from "@workspace/entity-kit";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Plus, Pencil, Trash2, Check, X, PlayCircle, CheckCircle2, Loader2, Copy, Eye, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { priorityLabel } from "@/lib/priority-labels";
import { useAppContext } from "@/contexts/app-context";
import { DeleteConfirmImpact } from "@/components/delete-confirm-impact";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, useBulkSelection } from "@/components/shared/bulk-actions";
import { ProjectsTabsNav } from "@/components/shared/projects-tabs-nav";
import { GuardedButton } from "@/components/shared/permission-gate";
import { withListFilters } from "@/lib/list-query";

// PRJ-005 — these must match the task statuses the backend recognises
// (VALID_TASK_TRANSITIONS in tasks.ts). "overdue" is a derived view, not a
// stored status — filtering or setting it never matched a row; "blocked"
// and "cancelled" are real statuses the user could not previously pick.
const statusOptions = [
  { value: "pending", label: "معلق", color: "bg-status-warning-surface text-status-warning-foreground" },
  { value: "in_progress", label: "جاري", color: "bg-status-info-surface text-status-info-foreground" },
  { value: "blocked", label: "محجوب", color: "bg-rose-100 text-rose-700" },
  { value: "completed", label: "مكتمل", color: "bg-status-success-surface text-status-success-foreground" },
  { value: "cancelled", label: "ملغاة", color: "bg-slate-100 text-slate-600" },
];

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
  const { selectedRole } = useAppContext();
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

  // Scope (companyIds/branchIds) + scope-aware queryKey are injected
  // automatically by useApiQuery → injectScope.
  const { data: tasksResp, isLoading, isError } = useApiQuery<any>(
    ["tasks", filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/tasks`, filters),
  );

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
  if (isError) return <ErrorState />;

  const tasks = asList(tasksResp);
  // Client-side filter mirrors backend so the count chip ("X نتيجة") in
  // AdvancedFilters reflects what's visible; backend already narrowed
  // the result set, so this is defence-in-depth + display consistency.
  const preFiltered = applyFilters(tasks, filters, {
    searchFields: ["title", "assigneeName", "description"],
    statusField: "status",
    dateField: "scheduledDate",
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

  const taskColumns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.title}</span> },
    { key: "tags", header: "الوسوم", render: (r: any) => <EntityTags entityType="task" entityId={r.id} inline /> },
    { key: "linkedEntity", header: "الكيان المرتبط", render: (r: any) => (
      r.linkedEntityType ? (
        <Link href={getEntityLink(r.linkedEntityType, r.linkedEntityId)}>
          <span className="inline-flex items-center gap-1 text-xs text-status-info-foreground hover:underline cursor-pointer">
            <Link2 className="h-3 w-3" />
            {ENTITY_TYPE_LABELS[r.linkedEntityType] || r.linkedEntityType}
            {r.linkedEntityName ? (
              <span className="font-medium"> {r.linkedEntityName}</span>
            ) : r.linkedEntityId ? (
              <span className="font-mono"> #{r.linkedEntityId}</span>
            ) : null}
          </span>
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">{"—"}</span>
      )
    ) },
    { key: "type", header: "النوع", sortable: true, render: (r: any) => <span className="text-muted-foreground">{typeLabels[r.type] || "مهمة عامة"}</span> },
    { key: "priority", header: "الأولوية", sortable: true, render: (r: any) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        r.priority === "high" ? "bg-rose-100 text-rose-700" :
        r.priority === "medium" ? "bg-status-warning-surface text-status-warning-foreground" :
        "bg-emerald-100 text-emerald-700"
      }`}>
        {priorityLabel(r.priority)}
      </span>
    ) },
    { key: "status", header: "الحالة", sortable: true, render: (r: any) => <PageStatusBadge status={r.status} /> },
    { key: "scheduledDate", header: "الموعد", sortable: true, render: (r: any) => (
      <span className="text-muted-foreground">
        {r.scheduledStart
          ? formatDateAr(r.scheduledStart)
          : r.scheduledDate
          ? formatDateAr(r.scheduledDate)
          : "-"
        }
      </span>
    ) },
    { key: "assigneeName", header: "المكلّف", sortable: true, searchable: true, render: (r: any) => <span className="text-muted-foreground">{r.assigneeName || "-"}</span> },
    { key: "actions", header: "الإجراءات", width: "200px", render: (r: any) => (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => setPreviewItem(r)}
          title="معاينة سريعة"
        >
          <Eye className="h-4 w-4" />
        </Button>
        {r.status !== "completed" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-status-success-foreground hover:text-status-success-foreground hover:bg-status-success-surface"
            onClick={() => quickStatusChange(r.id, "completed")}
            title="إكمال المهمة"
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {r.status === "pending" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-status-info-foreground hover:text-status-info-foreground hover:bg-status-info-surface"
            onClick={() => quickStatusChange(r.id, "in_progress")}
            title="بدء العمل"
          >
            <PlayCircle className="h-4 w-4" />
          </Button>
        )}
        <Link href={`/tasks/create?copyFrom=${r.id}&title=${encodeURIComponent(r.title)}&type=${r.type}&priority=${r.priority}`}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" title="نسخ">
            <Copy className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/tasks/create?copy=${encodeURIComponent(JSON.stringify({ title: r.title + " (نسخة)", description: r.description, type: r.type, priority: r.priority }))}`)}
          title="نسخ المهمة"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => startEdit(r)}
          title="تعديل"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
            onClick={() => { setDeletingId(r.id); setEditingId(null); }}
            title="حذف"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="text-muted-foreground hover:text-muted-foreground p-1">
          {expandedId === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
    ) },
  ];

  return (
    <PageShell
      title="إدارة المهام"
      actions={
        <Link href="/tasks/create">
          <GuardedButton perm="tasks:create" className="gap-2"><Plus className="h-4 w-4" /> مهمة جديدة</GuardedButton>
        </Link>
      }
    >
      <ProjectsTabsNav />
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "إجمالي المهام", value: tasks?.length || 0, color: "text-status-info-foreground" },
          { label: "معلقة", value: tasks?.filter((t: any) => t.status === "pending").length || 0, color: "text-status-warning-foreground" },
          { label: "جارية", value: tasks?.filter((t: any) => t.status === "in_progress").length || 0, color: "text-status-info-foreground" },
          { label: "مكتملة", value: tasks?.filter((t: any) => t.status === "completed").length || 0, color: "text-status-success-foreground" },
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

      <DataTable
        columns={taskColumns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        noToolbar
        emptyMessage="لا توجد مهام تطابق معايير البحث"
        emptyIcon={<CheckSquare className="h-6 w-6 text-slate-400" />}
        onRowClick={(row) => navigate(`/tasks/${row.id}`)}
        selectable
        onSelectionChange={(ids) => {
          // Sync DataTable selection with BulkActionsBar
          const currentIds = new Set(ids);
          (filtered || []).forEach((t: any) => {
            if (currentIds.has(t.id) && !selectedIds.has(t.id)) toggleSelect(t.id);
            if (!currentIds.has(t.id) && selectedIds.has(t.id)) toggleSelect(t.id);
          });
        }}
        rowClassName={(task: any) =>
          editingId === task.id ? "bg-status-info-surface" : selectedIds.has(task.id) ? "bg-status-info-surface" : undefined
        }
        renderRowExtras={(task: any) => {
          const parts: React.ReactNode[] = [];
          if (expandedId === task.id) {
            parts.push(
              <div key="expanded" className="bg-surface-subtle/50 p-4">
                <div className="space-y-3">
                  <EntityTags entityType="task" entityId={task.id} />
                  <EntityComments entityType="task" entityId={task.id} />
                </div>
              </div>
            );
          }
          if (editingId === task.id) {
            parts.push(
              <div key="edit" className="bg-status-info-surface p-4">
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
              </div>
            );
          }
          if (deletingId === task.id) {
            parts.push(
              <div key="delete" className="bg-rose-50/50 p-4">
                <DeleteConfirmImpact
                  entityType="task"
                  entityId={task.id}
                  entityName={task.title}
                  onConfirm={() => handleDelete(task.id)}
                  onCancel={() => setDeletingId(null)}
                  isPending={saving}
                />
              </div>
            );
          }
          return parts.length > 0 ? <>{parts}</> : null;
        }}
      />
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة المهمة" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}
