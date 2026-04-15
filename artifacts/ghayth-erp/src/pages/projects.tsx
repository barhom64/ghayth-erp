import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
// P4.6 — Projects sweep: shared header + status chips.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { useApiQuery, asList } from "@/lib/api";
import { FolderKanban, Plus, Activity, CheckCircle, DollarSign, Eye } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";

const PROJECT_STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "completed", label: "مكتمل" },
  { value: "on_hold", label: "متوقف" },
  { value: "planning", label: "تخطيط" },
  { value: "cancelled", label: "ملغي" },
];

export default function Projects() {
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery(["projects-stats", scopeQueryString], `/projects/stats/summary${scopeQueryString ? `?${scopeQueryString}` : ""}`);
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const canManage = roleLevel >= 50;
  const { data: projectsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["projects", String(page), scopeQueryString],
    `/projects?page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const projects = asList(projectsResp);
  const total = projectsResp?.total || projects.length;

  const filtered = applyFilters(projects, filters, {
    searchFields: ["name", "clientName"],
    statusField: "status",
    dateField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/projects",
    queryKeys: [["projects", String(page)], ["projects-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "المشروع" },
    { key: "budget", label: "الميزانية", type: "number" as const },
    { key: "progress", label: "التقدم %", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "completed", label: "مكتمل" }, { value: "on_hold", label: "متوقف" }, { value: "cancelled", label: "ملغي" }] },
  ];

  const previewFields: PreviewField[] = [
    { label: "المشروع", key: "name" },
    { label: "المدير", key: "managerName" },
    { label: "الميزانية", key: "budget", type: "currency" },
    { label: "تاريخ البدء", key: "startDate", type: "date" },
    { label: "تاريخ الانتهاء", key: "endDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المشروع", sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "clientName", header: "العميل", sortable: true, render: (p) => p.clientName || "-" },
    { key: "startDate", header: "البدء", sortable: true, render: (p) => formatDateAr(p.startDate) },
    { key: "endDate", header: "الانتهاء", sortable: true, render: (p) => formatDateAr(p.endDate) },
    { key: "budget", header: "الميزانية", sortable: true, render: (p) => formatCurrency(p.budget || 0) },
    {
      key: "progress",
      header: "التقدم",
      sortable: true,
      className: "w-[120px]",
      render: (p) => (
        <div className="flex items-center gap-2">
          <Progress value={p.progress || 0} className="h-2" />
          <span className="text-xs text-muted-foreground">{p.progress || 0}%</span>
        </div>
      ),
    },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} domain="project" /> },
    {
      key: "actions",
      header: "الإجراءات",
      render: (p) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(p)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(p.id, { name: p.name, budget: p.budget || 0, progress: p.progress || 0, status: p.status || "active" })}
            onDelete={() => startDelete(p.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="إدارة المشاريع"
      subtitle="متابعة المشاريع والمراحل والتكاليف"
      breadcrumbs={[{ label: "العمليات" }]}
      actions={
        canManage ? (
          <Link href="/projects/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              مشروع جديد
            </Button>
          </Link>
        ) : null
      }
    >
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50"><FolderKanban className="w-6 h-6 text-blue-600" /></div>
          <div><p className="text-2xl font-bold">{stats?.totalProjects || 0}</p><p className="text-xs text-gray-500">إجمالي المشاريع</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50"><Activity className="w-6 h-6 text-green-600" /></div>
          <div><p className="text-2xl font-bold">{stats?.activeProjects || 0}</p><p className="text-xs text-gray-500">مشاريع نشطة</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50"><CheckCircle className="w-6 h-6 text-emerald-600" /></div>
          <div><p className="text-2xl font-bold">{stats?.completedProjects || 0}</p><p className="text-xs text-gray-500">مكتملة</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-50"><DollarSign className="w-6 h-6 text-purple-600" /></div>
          <div><p className="text-2xl font-bold">{formatCurrency(stats?.totalBudget || 0)}</p><p className="text-xs text-gray-500">الميزانية الإجمالية</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col gap-4">
        <AdvancedFilters
          config={{
            searchPlaceholder: "بحث في المشاريع...",
            statuses: [
              { value: "active", label: "نشط" },
              { value: "in_progress", label: "قيد التنفيذ" },
              { value: "completed", label: "مكتمل" },
              { value: "on_hold", label: "متوقف" },
              { value: "planning", label: "تخطيط" },
            ],
            showDateRange: true,
          }}
          values={filters}
          onChange={setFilters}
          onExportCSV={() => exportToCSV(filtered || [], [
            { key: "name", label: "المشروع" },
            { key: "clientName", label: "العميل" },
            { key: "startDate", label: "تاريخ البدء" },
            { key: "endDate", label: "تاريخ الانتهاء" },
            { key: "budget", label: "الميزانية" },
            { key: "status", label: "الحالة" },
          ], "المشاريع")}
          resultCount={filtered?.length}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="gap-2 flex items-center"><FolderKanban className="h-5 w-5" /> المشاريع</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مشاريع"
            emptyIcon={<FolderKanban className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            page={page}
            total={total}
            onPageChange={setPage}
            renderRowExtras={(p) => {
              if (editingId === p.id) {
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === p.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="project" entityId={p.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة المشروع" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}
