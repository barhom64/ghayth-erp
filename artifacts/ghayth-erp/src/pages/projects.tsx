import { useState, Fragment } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
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
    statusField: "",
    dateField: "",
  });

  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">إدارة المشاريع</h1>
        {canManage && (
          <Link href="/projects/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              مشروع جديد
            </Button>
          </Link>
        )}
      </div>

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
          onExportCSV={() => exportToCSV(sortedData || [], [
            { key: "name", label: "المشروع" },
            { key: "clientName", label: "العميل" },
            { key: "startDate", label: "تاريخ البدء" },
            { key: "endDate", label: "تاريخ الانتهاء" },
            { key: "budget", label: "الميزانية" },
            { key: "status", label: "الحالة" },
          ], "المشاريع")}
          resultCount={sortedData?.length}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="gap-2 flex items-center"><FolderKanban className="h-5 w-5" /> المشاريع</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="name" label="المشروع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="clientName" label="العميل" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="startDate" label="البدء" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="endDate" label="الانتهاء" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="budget" label="الميزانية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="progress" label="التقدم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={sortedData}
            colCount={8}
            emptyMessage="لا توجد مشاريع"
            emptyIcon={<FolderKanban className="h-6 w-6 text-slate-400" />}
          >
            {sortedData?.map(p => (
              <Fragment key={p.id}>
                <TableRow>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.clientName || "-"}</TableCell>
                  <TableCell>{formatDateAr(p.startDate)}</TableCell>
                  <TableCell>{formatDateAr(p.endDate)}</TableCell>
                  <TableCell>{formatCurrency(p.budget || 0)}</TableCell>
                  <TableCell className="w-[120px]"><div className="flex items-center gap-2"><Progress value={p.progress || 0} className="h-2" /><span className="text-xs text-muted-foreground">{p.progress || 0}%</span></div></TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-start">
                    <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(p)}><Eye className="h-4 w-4" /></Button>
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(p.id, { name: p.name, budget: p.budget || 0, progress: p.progress || 0, status: p.status || "active" })}
                      onDelete={() => startDelete(p.id)}
                    />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === p.id && (
                  <TableRow key={`edit-${p.id}`}><TableCell colSpan={8}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === p.id && (
                  <TableRow key={`del-${p.id}`}><TableCell colSpan={8}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="project" entityId={p.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة المشروع" data={previewItem} fields={previewFields} />
    </div>
  );
}
