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
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FolderKanban, Plus, Activity, CheckCircle, DollarSign, Eye } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

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
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const canManage = roleLevel >= 50;
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
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

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "name", header: "المشروع", sortable: true, render: (p) => <Link href={`/projects/${p.id}`}><span className="font-medium text-primary hover:underline cursor-pointer">{p.name}</span></Link> },
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
          <Link href={`/projects/${p.id}`}>
            <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
          </Link>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(p.id, { name: p.name, budget: p.budget || 0, progress: p.progress || 0, status: p.status || "active" })}
            onDelete={() => startDelete(p.id)}
          />
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

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
      <KpiGrid items={[
        { label: "إجمالي المشاريع", value: stats?.totalProjects || 0, icon: FolderKanban, color: "text-blue-600 bg-blue-50" },
        { label: "نشط", value: stats?.activeProjects || 0, icon: Activity, color: "text-green-600 bg-green-50" },
        { label: "مكتمل", value: stats?.completedProjects || 0, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
        { label: "إجمالي الميزانية", value: formatCurrency(stats?.totalBudget || 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

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

      <BulkActionsBar
        entityType="project"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["projects"]]}
        actions={["export"]}
        csvColumns={[
          { key: "name", label: "المشروع" },
          { key: "clientName", label: "العميل" },
          { key: "budget", label: "الميزانية" },
          { key: "progress", label: "التقدم" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="المشاريع"
      />

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
    </PageShell>
  );
}
